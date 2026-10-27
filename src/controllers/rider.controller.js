const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../utils/db');
const { signToken } = require('../utils/jwt');
const { emitToAdmin, emitToOrderWatchers } = require('../realtime');
const { generateOTP, generateDeliveryCode } = require('../utils/codes');
const { sendSMS } = require('../services/sms/smsService');
const { creditWallet, debitWallet } = require('../utils/wallet');

// ---------- Onboarding (via admin-generated invite link only) ----------
const registerSchema = z.object({
  token: z.string(),
  fullName: z.string().min(2),
  phone: z.string().min(6),
  address: z.string().min(5),
  cnicFrontUrl: z.string().min(10), // base64 data URL — see schema.prisma note re: swapping for real storage
  cnicBackUrl: z.string().min(10),
  selfieFrontUrl: z.string().min(10),
  selfieLeftUrl: z.string().min(10),
  selfieRightUrl: z.string().min(10),
});

async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);

    const invite = await prisma.riderInvite.findUnique({ where: { token: data.token } });
    if (!invite) return res.status(404).json({ error: 'Invalid registration link.' });
    if (invite.usedAt) return res.status(410).json({ error: 'This registration link has already been used.' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'This registration link has expired.' });

    const existingPhone = await prisma.rider.findUnique({ where: { phone: data.phone } });
    if (existingPhone) return res.status(409).json({ error: 'A rider with this phone number already exists.' });

    const { token, ...riderData } = data;
    const rider = await prisma.$transaction(async (tx) => {
      const created = await tx.rider.create({ data: { ...riderData, status: 'pending' } });
      await tx.riderInvite.update({ where: { token }, data: { usedAt: new Date() } });
      return created;
    });

    emitToAdmin('rider:new-application', { riderId: rider.id, fullName: rider.fullName });
    res.status(201).json({ rider: { id: rider.id, status: rider.status } });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Riders poll this (or check after clicking an emailed/SMS'd link) to see if they've been approved yet.
async function checkStatus(req, res, next) {
  try {
    const rider = await prisma.rider.findUnique({ where: { id: Number(req.params.id) } });
    if (!rider) return res.status(404).json({ error: 'Application not found.' });
    res.json({ status: rider.status });
  } catch (err) {
    next(err);
  }
}

// ---------- Login (only possible once approved + password issued) ----------
const loginSchema = z.object({ phone: z.string(), password: z.string() });

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const rider = await prisma.rider.findUnique({ where: { phone: data.phone } });
    if (!rider || !rider.password) return res.status(401).json({ error: 'Invalid credentials or account not yet approved.' });
    if (rider.status !== 'approved') return res.status(403).json({ error: `Your account is currently ${rider.status}.` });

    const match = await bcrypt.compare(data.password, rider.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = signToken({ id: rider.id, phone: rider.phone, role: 'rider' }, '24h');
    res.cookie('ds_rider_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ rider: { id: rider.id, fullName: rider.fullName }, token });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie('ds_rider_token');
  res.json({ ok: true });
}

// ---------- Forgot Password (OTP via SMS) ----------
const OTP_EXPIRY_MINUTES = 10;

const forgotPasswordSchema = z.object({ phone: z.string().min(6) });

async function forgotPassword(req, res, next) {
  try {
    const { phone } = forgotPasswordSchema.parse(req.body);
    const rider = await prisma.rider.findUnique({ where: { phone } });

    // Deliberately return the same success message whether or not the phone
    // exists — otherwise this endpoint becomes a way to check which phone
    // numbers are registered riders.
    if (!rider || rider.status !== 'approved') {
      return res.json({ ok: true, message: 'If that phone number is registered, an OTP has been sent.' });
    }

    const otp = generateOTP();
    const otpCodeHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.rider.update({ where: { id: rider.id }, data: { otpCodeHash, otpExpiresAt } });
    await sendSMS(phone, `Your Delicious Sheri rider verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`);

    res.json({ ok: true, message: 'If that phone number is registered, an OTP has been sent.' });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

const verifyOtpSchema = z.object({ phone: z.string(), code: z.string().length(6) });

async function verifyOtp(req, res, next) {
  try {
    const { phone, code } = verifyOtpSchema.parse(req.body);
    const rider = await prisma.rider.findUnique({ where: { phone } });

    if (!rider || !rider.otpCodeHash || !rider.otpExpiresAt) {
      return res.status(400).json({ error: 'No OTP request found for this phone number.' });
    }
    if (rider.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This OTP has expired — request a new one.' });
    }
    const match = await bcrypt.compare(code, rider.otpCodeHash);
    if (!match) return res.status(400).json({ error: 'Incorrect OTP.' });

    // Short-lived reset token — only valid for actually resetting the password,
    // not for logging in or anything else.
    const resetToken = signToken({ id: rider.id, purpose: 'rider-password-reset' }, '10m');
    res.json({ resetToken });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

const resetPasswordSchema = z.object({ resetToken: z.string(), newPassword: z.string().min(6) });

async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = resetPasswordSchema.parse(req.body);
    const { verifyToken } = require('../utils/jwt');

    let decoded;
    try {
      decoded = verifyToken(resetToken);
    } catch (e) {
      return res.status(401).json({ error: 'Reset link expired — please request a new OTP.' });
    }
    if (decoded.purpose !== 'rider-password-reset') {
      return res.status(401).json({ error: 'Invalid reset token.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.rider.update({
      where: { id: decoded.id },
      data: { password: hashed, otpCodeHash: null, otpExpiresAt: null }, // burn the OTP so it can't be reused
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Authenticated rider actions ----------
async function myActiveOrder(req, res, next) {
  try {
    const order = await prisma.order.findFirst({
      where: { riderId: req.rider.id, orderStatus: { in: ['preparing', 'out_for_delivery'] } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ order: order || null });
  } catch (err) {
    next(err);
  }
}

// Full past-order log for this rider's own "Order History" screen.
async function myHistory(req, res, next) {
  try {
    const orders = await prisma.order.findMany({
      where: { riderId: req.rider.id, orderStatus: { in: ['delivered', 'rejected', 'cancelled'] } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

// Earnings + bonus profile screen: wallet balance, completed order counts,
// and today/this-week totals — all computed from real data, not stored
// separately, so it can never drift out of sync.
async function myEarnings(req, res, next) {
  try {
    const { getOrCreateWallet } = require('../utils/wallet');
    const wallet = await getOrCreateWallet('rider', req.rider.id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const delivered = await prisma.order.findMany({
      where: { riderId: req.rider.id, orderStatus: 'delivered' },
      select: { deliveryFee: true, deliveryConfirmedAt: true, createdAt: true },
    });

    const todayCount = delivered.filter((o) => (o.deliveryConfirmedAt || o.createdAt) >= startOfDay).length;
    const weekCount = delivered.filter((o) => (o.deliveryConfirmedAt || o.createdAt) >= startOfWeek).length;

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const bonusTotal = transactions.filter((t) => t.reason.toLowerCase().includes('bonus')).reduce((s, t) => s + t.amount, 0);

    res.json({
      walletBalance: wallet.balance,
      completedOrders: delivered.length,
      completedToday: todayCount,
      completedThisWeek: weekCount,
      totalBonuses: bonusTotal,
      recentTransactions: transactions,
    });
  } catch (err) {
    next(err);
  }
}

async function updateLocation(req, res, next) {
  try {
    const { lat, lng } = req.body;
    await prisma.rider.update({ where: { id: req.rider.id }, data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date(), isOnline: true } });
    emitToAdmin('rider:location', { riderId: req.rider.id, lat, lng, at: Date.now() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Explicit online/offline toggle — going offline immediately excludes this
// rider from auto-assignment and from the admin's manual-assign picker
// (both already filter on isOnline), without needing to fully log out.
async function setOnlineStatus(req, res, next) {
  try {
    const { isOnline } = req.body;
    const rider = await prisma.rider.update({ where: { id: req.rider.id }, data: { isOnline: Boolean(isOnline) } });
    res.json({ isOnline: rider.isOnline });
  } catch (err) {
    next(err);
  }
}

// Rider explicitly accepts an incoming assignment — mostly a UX confirmation
// step (the order is already marked out_for_delivery once assigned), but
// gives the popup+sound alert flow something real to call.
async function acceptOrder(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.riderId !== req.rider.id) return res.status(404).json({ error: 'Order not found for this rider.' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// Rider declines the incoming assignment — unassigns them and puts the order
// back to "preparing" so the admin (or auto-assign, on the next trigger) can
// hand it to someone else.
async function rejectOrder(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.riderId !== req.rider.id) return res.status(404).json({ error: 'Order not found for this rider.' });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { riderId: null, orderStatus: 'preparing' },
    });
    emitToAdmin('order:status-changed', { orderId: updated.id, orderNumber: updated.orderNumber, event: 'rider-declined' });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

async function markArrived(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.update({ where: { id: orderId }, data: { riderArrivedAt: new Date() } });
    emitToAdmin('order:status-changed', { orderId: order.id, orderNumber: order.orderNumber, event: 'rider-arrived' });
    emitToOrderWatchers(order.orderNumber, 'order:status-changed', { orderStatus: order.orderStatus, riderArrived: true });
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

const proofSchema = z.object({ doorstepProofUrl: z.string().min(10) });

// "Live Doorstep Verification" — captures the unboxing photo/video as a base64 payload.
// Swap doorstepProofUrl for a real object-storage URL (S3/Cloud Storage) in production;
// base64-in-Postgres works for a demo/MVP but won't scale well for video files.
async function submitDoorstepProof(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const { doorstepProofUrl } = proofSchema.parse(req.body);
    const order = await prisma.order.update({ where: { id: orderId }, data: { doorstepProofUrl } });
    res.json({ order });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// "Confirm & Deliver" — the permanent return-lock moment. Once this fires, the
// storefront's return/refund option is gone for good on this order (see order
// tracking / return-eligibility check on the frontend, which reads returnLocked).
// Requires the 4-digit delivery security code to have been verified first —
// see verifyDeliveryCode() below.
async function confirmDelivered(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.doorstepProofUrl) {
      return res.status(400).json({ error: 'Doorstep verification proof is required before confirming delivery.' });
    }
    if (!order.deliveryCodeVerifiedAt) {
      return res.status(400).json({ error: 'Enter the customer\'s 4-digit delivery code before confirming delivery.' });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: 'delivered', deliveryConfirmedAt: new Date(), returnLocked: true },
    });

    emitToAdmin('order:status-changed', { orderId: updated.id, orderNumber: updated.orderNumber, event: 'delivered' });
    emitToOrderWatchers(updated.orderNumber, 'order:status-changed', { orderStatus: 'delivered', returnLocked: true });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

// ---------- 4-digit delivery security code ----------
const verifyCodeSchema = z.object({ code: z.string().length(4) });

async function verifyDeliveryCode(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const { code } = verifyCodeSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.deliveryCode !== code) {
      return res.status(400).json({ error: 'Incorrect code — ask the customer to double-check it.' });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { deliveryCodeVerifiedAt: new Date() },
    });
    res.json({ order: updated });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Enter all 4 digits.' });
    next(err);
  }
}

// Rider-side "Request New Code / Call Admin" button — for when the customer
// lost or never received their code. This does NOT reveal the code to the
// rider directly (that would defeat the point of a customer-held code); it
// notifies the admin in real time so they can either read it out over a call,
// or trigger resendDeliveryCode() (see adminRider.controller.js) to re-send
// it to the customer's phone.
async function requestDeliveryCodeHelp(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const rider = await prisma.rider.findUnique({ where: { id: req.rider.id } });

    emitToAdmin('delivery-code:help-requested', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      riderName: rider.fullName,
      riderPhone: rider.phone,
      customerPhone: order.guestPhone,
    });

    res.json({ ok: true, message: 'Admin has been notified.' });
  } catch (err) {
    next(err);
  }
}

// ---------- Profile update requests ----------
// Riders can't change fields like bikeNumber directly — they submit a request
// that the admin must approve, so there's always a review step on anything
// tied to their on-road identity/verification.
const updateRequestSchema = z.object({
  field: z.enum(['bikeNumber', 'address']),
  requestedValue: z.string().min(1),
});

async function requestProfileUpdate(req, res, next) {
  try {
    const { field, requestedValue } = updateRequestSchema.parse(req.body);
    const rider = await prisma.rider.findUnique({ where: { id: req.rider.id } });
    const currentValue = field === 'bikeNumber' ? rider.bikeNumber : rider.address;

    const request = await prisma.riderUpdateRequest.create({
      data: { riderId: rider.id, field, currentValue, requestedValue, status: 'pending' },
    });

    emitToAdmin('rider:update-request', { requestId: request.id, riderName: rider.fullName, field, requestedValue });
    res.status(201).json({ request });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function myUpdateRequests(req, res, next) {
  try {
    const requests = await prisma.riderUpdateRequest.findMany({
      where: { riderId: req.rider.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

// Customer refuses the delivery at the door. The rider still drove the whole
// route, so their delivery fee is protected: it's moved out of the
// customer's wallet (or simply not owed if they hadn't paid online — see the
// guard below) and into the rider's wallet, and the order is flagged for
// inventory return rather than left ambiguous.
async function rejectAtDoorstep(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: 'rejected', wasRejectedAtDoorstep: true },
    });

    // This protection only moves real wallet money for logged-in customers —
    // guest/COD orders have no wallet to charge, so only the rider-side
    // credit happens conceptually (kept simple here: skipped entirely for
    // guests, since debiting a non-existent wallet isn't meaningful).
    if (order.userId) {
      const fee = order.deliveryFee || 0;
      if (fee > 0) {
        await debitWallet('customer', order.userId, fee, `Rider delivery fee — order ${order.orderNumber} rejected at doorstep`, order.id);
        await creditWallet('rider', req.rider.id, fee, `Completed route on rejected order ${order.orderNumber}`, order.id);
      }
    }

    emitToAdmin('order:status-changed', { orderId: updated.id, orderNumber: updated.orderNumber, event: 'rejected-at-doorstep' });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

// ---------- SOS ----------
const sosSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  voiceNoteUrl: z.string().optional(), // base64 audio blob for demo — see storage note above
  orderId: z.number().int().optional(),
});

async function triggerSOS(req, res, next) {
  try {
    const data = sosSchema.parse(req.body);
    const alert = await prisma.sOSAlert.create({
      data: { riderId: req.rider.id, ...data, status: 'active' },
    });
    const rider = await prisma.rider.findUnique({ where: { id: req.rider.id } });

    // This is the event the Admin's SOS Room listens for to trigger the siren + popup.
    emitToAdmin('sos:new', {
      alertId: alert.id,
      riderId: rider.id,
      riderName: rider.fullName,
      riderPhone: rider.phone,
      lat: data.lat,
      lng: data.lng,
      voiceNoteUrl: data.voiceNoteUrl,
      orderId: data.orderId,
      createdAt: alert.createdAt,
    });

    res.status(201).json({ alert });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

module.exports = {
  register,
  checkStatus,
  login,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  myActiveOrder,
  myHistory,
  myEarnings,
  updateLocation,
  setOnlineStatus,
  acceptOrder,
  rejectOrder,
  markArrived,
  submitDoorstepProof,
  confirmDelivered,
  verifyDeliveryCode,
  requestDeliveryCodeHelp,
  requestProfileUpdate,
  myUpdateRequests,
  rejectAtDoorstep,
  triggerSOS,
};
