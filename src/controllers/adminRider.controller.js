const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../utils/db');
const { emitToRider } = require('../realtime');
const { generateDeliveryCode } = require('../utils/codes');
const { sendSMS } = require('../services/sms/smsService');

// ---------- Dynamic registration link generation ----------
async function generateInviteLink(req, res, next) {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await prisma.riderInvite.create({ data: { token, expiresAt, label: req.body.label || null } });
   const link = `http://localhost:5175/register/${token}`;
    res.status(201).json({ link, token, expiresAt });
  } catch (err) {
    next(err);
  }
}

// ---------- Verification dashboard ----------
async function listRiders(req, res, next) {
  try {
    const { status } = req.query;
    const riders = await prisma.rider.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ riders });
  } catch (err) {
    next(err);
  }
}

async function getRider(req, res, next) {
  try {
    const rider = await prisma.rider.findUnique({ where: { id: Number(req.params.id) } });
    if (!rider) return res.status(404).json({ error: 'Rider not found.' });
    res.json({ rider });
  } catch (err) {
    next(err);
  }
}

// Approving issues a temporary password (shown once to the admin to relay to the rider —
// e.g. via SMS/WhatsApp outside this system). The rider should change it on first login
// in a fuller build; kept simple here.
async function approveRider(req, res, next) {
  try {
    const id = Number(req.params.id);
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const rider = await prisma.rider.update({ where: { id }, data: { status: 'approved', password: hashed } });
    res.json({ rider: { id: rider.id, fullName: rider.fullName, phone: rider.phone, status: rider.status }, tempPassword });
  } catch (err) {
    next(err);
  }
}

async function rejectRider(req, res, next) {
  try {
    const id = Number(req.params.id);
    const rider = await prisma.rider.update({ where: { id }, data: { status: 'rejected' } });
    res.json({ rider });
  } catch (err) {
    next(err);
  }
}

// ---------- Order assignment / transfer ----------
const assignSchema = z.object({ riderId: z.number().int() });

async function assignRider(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const { riderId } = assignSchema.parse(req.body);
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { riderId, orderStatus: 'out_for_delivery' },
    });
    emitToRider(riderId, 'order:assigned', { orderId: order.id, orderNumber: order.orderNumber });
    res.json({ order });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// "Transfer Order" button in the SOS Room — one click reassigns to a different active rider.
async function transferOrder(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const { riderId: newRiderId } = assignSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const oldRiderId = order.riderId;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { riderId: newRiderId, riderArrivedAt: null },
    });

    if (oldRiderId) emitToRider(oldRiderId, 'order:transferred-away', { orderId, orderNumber: order.orderNumber });
    emitToRider(newRiderId, 'order:assigned', { orderId: updated.id, orderNumber: updated.orderNumber, transferred: true });

    res.json({ order: updated });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Riders currently online, for the assign/transfer picker. Includes a
// derived "busy" flag (has an active delivery right now) so the Admin can
// tell Free vs Busy at a glance for manual assignment.
async function listActiveRiders(req, res, next) {
  try {
    const riders = await prisma.rider.findMany({
      where: { status: 'approved', isOnline: true },
      select: { id: true, fullName: true, phone: true, lastLat: true, lastLng: true, lastLocationAt: true },
    });
    const busyOrders = await prisma.order.findMany({
      where: { orderStatus: { in: ['preparing', 'out_for_delivery'] }, riderId: { not: null } },
      select: { riderId: true },
    });
    const busyIds = new Set(busyOrders.map((o) => o.riderId));
    const withStatus = riders.map((r) => ({ ...r, isBusy: busyIds.has(r.id) }));
    res.json({ riders: withStatus });
  } catch (err) {
    next(err);
  }
}

// Full delivery history for one rider — defensively handles a rider with zero
// past orders (returns an empty array rather than erroring) so this never
// blanks out the Admin panel on a rider who just joined.
async function riderHistory(req, res, next) {
  try {
    const riderId = Number(req.params.id);
    if (!riderId || Number.isNaN(riderId)) return res.status(400).json({ error: 'Invalid rider id.' });

    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) return res.status(404).json({ error: 'Rider not found.' });

    const orders = await prisma.order.findMany({
      where: { riderId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    const delivered = orders.filter((o) => o.orderStatus === 'delivered').length;
    const rejected = orders.filter((o) => o.orderStatus === 'rejected').length;

    res.json({ rider: { id: rider.id, fullName: rider.fullName, phone: rider.phone }, orders, stats: { total: orders.length, delivered, rejected } });
  } catch (err) {
    next(err);
  }
}

// ---------- Delivery security code ----------
// Triggered from the "Resend Code" button the admin sees after a rider hits
// "Request New Code / Call Admin" (see rider.controller.js requestDeliveryCodeHelp).
// Regenerates the 4-digit code and re-sends it to the customer's phone — the
// rider never sees the code through this path, only the customer does.
async function resendDeliveryCode(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const newCode = generateDeliveryCode();
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { deliveryCode: newCode, deliveryCodeVerifiedAt: null, deliveryCodeResendCount: { increment: 1 } },
    });

    if (order.guestPhone) {
      await sendSMS(order.guestPhone, `Your Delicious Sheri delivery code is ${newCode}. Give this to your rider to confirm delivery.`);
    }

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

// Lets the admin view the current code directly (e.g. to read it out over a
// phone call to the rider) without regenerating it.
async function viewDeliveryCode(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryCode: true, orderNumber: true } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// ---------- Rider profile update requests ----------
async function listUpdateRequests(req, res, next) {
  try {
    const requests = await prisma.riderUpdateRequest.findMany({
      where: { status: 'pending' },
      include: { rider: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

async function approveUpdateRequest(req, res, next) {
  try {
    const id = Number(req.params.id);
    const request = await prisma.riderUpdateRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    const fieldData = { [request.field]: request.requestedValue };
    await prisma.$transaction([
      prisma.rider.update({ where: { id: request.riderId }, data: fieldData }),
      prisma.riderUpdateRequest.update({ where: { id }, data: { status: 'approved' } }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function rejectUpdateRequest(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.riderUpdateRequest.update({ where: { id }, data: { status: 'rejected' } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------- SOS Room ----------
async function listSOSAlerts(req, res, next) {
  try {
    const alerts = await prisma.sOSAlert.findMany({
      where: { status: 'active' },
      include: { rider: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ alerts });
  } catch (err) {
    next(err);
  }
}

async function resolveSOS(req, res, next) {
  try {
    const id = Number(req.params.id);
    const alert = await prisma.sOSAlert.update({ where: { id }, data: { status: 'resolved', resolvedAt: new Date() } });
    res.json({ alert });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin creates a rider account directly (sets the password themselves) ----------
// Unlike the invite-link flow (self-registration -> admin approves -> temp
// password), this lets the admin skip straight to a working account when they
// already know the rider in person — e.g. onboarding someone at the counter.
const createRiderSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  address: z.string().min(3),
  bikeNumber: z.string().optional(),
  password: z.string().min(6),
});

async function createRiderDirectly(req, res, next) {
  try {
    const data = createRiderSchema.parse(req.body);
    const existing = await prisma.rider.findUnique({ where: { phone: data.phone } });
    if (existing) return res.status(409).json({ error: 'A rider with this phone number already exists.' });

    const hashed = await bcrypt.hash(data.password, 12);
    const rider = await prisma.rider.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        address: data.address,
        bikeNumber: data.bikeNumber,
        password: hashed,
        status: 'approved',
        // Placeholder values — this fast path skips CNIC/selfie verification;
        // use the invite-link flow instead if you want that check enforced.
        cnicFrontUrl: '', cnicBackUrl: '', selfieFrontUrl: '', selfieLeftUrl: '', selfieRightUrl: '',
      },
    });
    res.status(201).json({ rider: { id: rider.id, fullName: rider.fullName, phone: rider.phone } });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Admin can view/reset a rider's password directly from the panel (rather
// than only through the OTP self-service flow) — useful if a rider is locked
// out and can't complete OTP recovery themselves.
const setPasswordSchema = z.object({ newPassword: z.string().min(6) });

async function setRiderPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { newPassword } = setPasswordSchema.parse(req.body);
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.rider.update({ where: { id }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Rider bonus ----------
const bonusSchema = z.object({ amount: z.number().positive(), note: z.string().optional() });

async function sendBonus(req, res, next) {
  try {
    const riderId = Number(req.params.id);
    const { amount, note } = bonusSchema.parse(req.body);
    const { creditWallet } = require('../utils/wallet');
    await creditWallet('rider', riderId, amount, note || 'Admin bonus');
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

module.exports = {
  generateInviteLink,
  listRiders,
  getRider,
  approveRider,
  rejectRider,
  assignRider,
  transferOrder,
  listActiveRiders,
  listSOSAlerts,
  resolveSOS,
  resendDeliveryCode,
  viewDeliveryCode,
  listUpdateRequests,
  approveUpdateRequest,
  rejectUpdateRequest,
  createRiderDirectly,
  setRiderPassword,
  sendBonus,
  riderHistory,
};
