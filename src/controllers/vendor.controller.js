const { z } = require('zod');
const crypto = require('crypto');
const prisma = require('../utils/db');

async function listVendors(req, res, next) {
  try {
    const vendors = await prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ vendors });
  } catch (err) {
    next(err);
  }
}

const vendorSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  settlementMode: z.enum(['cash', 'khata']).optional(),
  logoUrl: z.string().optional().nullable(),
  webhookUrl: z.string().optional().nullable(),
  stripeConnectedAccountId: z.string().optional().nullable(),
  payoutEmail: z.string().optional().nullable(),
});

async function createVendor(req, res, next) {
  try {
    const data = vendorSchema.parse(req.body);
    // We issue this vendor their own API key up front — they use it (as an
    // X-Vendor-Api-Key header) to call our price-update webhook whenever
    // their cost price changes. See thirdPartyOrder.controller.js's
    // vendorPriceWebhook for where this is checked.
    const apiKey = crypto.randomBytes(20).toString('hex');
    const vendor = await prisma.vendor.create({ data: { ...data, apiKey } });
    res.status(201).json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = vendorSchema.partial().parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id }, data });
    res.json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Issues a fresh API key for a vendor (e.g. if theirs leaked) — invalidates
// the old one immediately since it's a straight overwrite.
async function regenerateApiKey(req, res, next) {
  try {
    const id = Number(req.params.id);
    const apiKey = crypto.randomBytes(20).toString('hex');
    const vendor = await prisma.vendor.update({ where: { id }, data: { apiKey } });
    res.json({ vendor });
  } catch (err) {
    next(err);
  }
}

// Toggle between Cash-on-Pickup and Credit Khata Wallet — pure switch, doesn't
// touch existing balances (a vendor can carry both a leftover cash float and a
// ledger balance across a mode change; each mode's actions only affect its own field).
async function setSettlementMode(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { settlementMode } = z.object({ settlementMode: z.enum(['cash', 'khata']) }).parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id }, data: { settlementMode } });
    res.json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Cash-on-Pickup actions ----------
const amountSchema = z.object({ amount: z.number().positive() });

// Admin advances cash to the rider for this vendor's pickup (rider pays the
// vendor cash at the shop) — reduces the vendor's cash float balance since
// that's money now out with the rider, awaiting reconciliation.
async function assignCashPickup(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { amount } = amountSchema.parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id }, data: { cashFloatBalance: { decrement: amount } } });
    res.json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Rider collects COD balance from the customer on delivery — adds back to
// the cash float (this is base cash the rider is now holding for the business).
async function collectCOD(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { amount } = amountSchema.parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id }, data: { cashFloatBalance: { increment: amount } } });
    res.json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Khata (credit) actions ----------
// Rider picks up an item without paying cash — increments what we owe the vendor.
async function itemPickedKhata(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { amount } = amountSchema.parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id }, data: { ledgerBalance: { increment: amount } } });
    res.json({ vendor });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Admin settles the accumulated ledger balance via a real bank transfer
// (outside this system) — this just zeroes the ledger and records nothing
// further; the bank transfer itself is not something this app can perform.
async function settleVendor(req, res, next) {
  try {
    const id = Number(req.params.id);
    const vendor = await prisma.vendor.update({ where: { id }, data: { ledgerBalance: 0 } });
    res.json({ vendor });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVendors,
  createVendor,
  updateVendor,
  regenerateApiKey,
  setSettlementMode,
  assignCashPickup,
  collectCOD,
  itemPickedKhata,
  settleVendor,
};
