const { z } = require('zod');
const prisma = require('../utils/db');
const { computePrice } = require('../utils/pricing');
const { notifyVendorOfOrder } = require('../utils/vendorNotify');
const stripeConnect = require('../services/payments/stripeConnect');

// Called from order.controller.js right after an order is created. Groups
// the order's vendor-sourced items by vendor, computes each vendor's
// cost/margin split from Product.costPrice + Product.marginAmount, creates
// one ThirdPartyOrder row per vendor involved, and fires off the vendor
// fulfillment webhook. Runs after the order response is already sent to the
// customer, so a slow/failing vendor webhook never delays checkout.
async function createThirdPartyOrdersForOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) return;

  const vendorGroups = {};
  for (const item of order.items) {
    const vendorId = item.product?.vendorId;
    if (!vendorId) continue; // plain bakery item — no third party involved
    if (!vendorGroups[vendorId]) vendorGroups[vendorId] = [];
    vendorGroups[vendorId].push(item);
  }

  for (const [vendorId, items] of Object.entries(vendorGroups)) {
    let costTotal = 0;
    let marginTotal = 0;
    for (const item of items) {
      const cost = item.product?.costPrice || 0;
      const margin = item.product?.marginAmount || 0;
      costTotal += cost * item.quantity;
      marginTotal += margin * item.quantity;
    }

    const tpOrder = await prisma.thirdPartyOrder.create({
      data: { orderId: order.id, vendorId: Number(vendorId), costTotal, marginTotal },
    });

    notifyVendorOfOrder(tpOrder.id).catch(() => {});
  }
}

// Attempts the actual Stripe Connect split once payment succeeds (called
// from payment webhook handlers for orders that have vendor items). If
// Stripe/Connect isn't configured, leaves splitStatus as "pending" so the
// admin can settle it manually via the vendor's cash/khata tools instead.
// Local-wallet split (EasyPaisa-style — no Stripe needed): the instant an
// order is paid, khata-mode vendors get their cost auto-added to their
// ledger balance (money we owe them, settled later via bank transfer), and
// cash-mode vendors' float is left for the existing manual assign/collect
// flow. Platform's margin simply stays in the held balance (see
// payout.controller.js) — no extra step needed for that side.
async function trySplitPayment(orderId) {
  const tpOrders = await prisma.thirdPartyOrder.findMany({
    where: { orderId, splitStatus: 'pending' },
    include: { vendor: true, order: true },
  });

  for (const tp of tpOrders) {
    if (tp.vendor.stripeConnectedAccountId && stripeConnect.getStripeClient()) {
      await prisma.thirdPartyOrder.update({ where: { id: tp.id }, data: { splitStatus: 'manual' } });
      continue;
    }
    if (tp.vendor.settlementMode === 'khata') {
      await prisma.vendor.update({ where: { id: tp.vendorId }, data: { ledgerBalance: { increment: tp.costTotal } } });
      await prisma.thirdPartyOrder.update({ where: { id: tp.id }, data: { splitStatus: 'completed' } });
    } else {
      // Cash-on-pickup vendors are settled via the existing rider cash-float
      // flow in Admin → Vendors, not automatically here.
      await prisma.thirdPartyOrder.update({ where: { id: tp.id }, data: { splitStatus: 'manual' } });
    }
  }
}

// ---------- Admin ----------
async function listThirdPartyOrders(req, res, next) {
  try {
    const records = await prisma.thirdPartyOrder.findMany({
      include: { vendor: true, order: { select: { orderNumber: true, guestName: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ records });
  } catch (err) {
    next(err);
  }
}

const trackingSchema = z.object({
  trackingId: z.string().optional(),
  courierName: z.string().optional(),
  dispatchStatus: z.enum(['pending', 'dispatched', 'delivered']).optional(),
});

async function updateTracking(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = trackingSchema.parse(req.body);
    const record = await prisma.thirdPartyOrder.update({ where: { id }, data });
    res.json({ record });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

const disputeSchema = z.object({
  disputeStatus: z.enum(['none', 'open', 'resolved']).optional(),
  disputeNotes: z.string().optional(),
});

async function updateDispute(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = disputeSchema.parse(req.body);
    const record = await prisma.thirdPartyOrder.update({ where: { id }, data });
    res.json({ record });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Demo/manual trigger standing in for a real supplier calling our webhook —
// use this to see the "price changes propagate automatically" behavior
// without needing an actual third-party integration to test against.
const simulatePriceSchema = z.object({ newCostPrice: z.number().positive() });

async function simulatePriceUpdate(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const { newCostPrice } = simulatePriceSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const newPrice = computePrice(newCostPrice, product.marginAmount, product.price);
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { costPrice: newCostPrice, price: newPrice },
    });
    res.json({ product: updated });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Public webhook — a real third-party supplier calls this ----------
const webhookPriceSchema = z.object({ externalSku: z.string(), newCostPrice: z.number().positive() });

async function vendorPriceWebhook(req, res, next) {
  try {
    const apiKey = req.headers['x-vendor-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing X-Vendor-Api-Key header.' });

    const vendor = await prisma.vendor.findFirst({ where: { apiKey } });
    if (!vendor) return res.status(401).json({ error: 'Invalid vendor API key.' });

    const { externalSku, newCostPrice } = webhookPriceSchema.parse(req.body);
    const product = await prisma.product.findFirst({ where: { vendorId: vendor.id, externalSku } });
    if (!product) return res.status(404).json({ error: 'No product matches that SKU for this vendor.' });

    const newPrice = computePrice(newCostPrice, product.marginAmount, product.price);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: newCostPrice, price: newPrice } });

    res.json({ ok: true, newPrice });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

module.exports = {
  createThirdPartyOrdersForOrder,
  trySplitPayment,
  listThirdPartyOrders,
  updateTracking,
  updateDispute,
  simulatePriceUpdate,
  vendorPriceWebhook,
};
