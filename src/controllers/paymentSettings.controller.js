const { z } = require('zod');
const prisma = require('../utils/db');

const DEFAULT_METHODS = ['visa', 'mastercard', 'easypaisa', 'jazzcash', 'sadapay', 'paypal', 'payoneer', 'bitcoin'];

// Public — checkout page gets full details to show to customer
async function listPublicMethods(req, res, next) {
  try {
    const configs = await prisma.paymentMethodConfig.findMany({ where: { isEnabled: true } });
    res.json({ methods: configs });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------
async function adminListMethods(req, res, next) {
  try {
    const configs = await prisma.paymentMethodConfig.findMany();
    const existing = new Set(configs.map((c) => c.method));
    const missing = DEFAULT_METHODS.filter((m) => !existing.has(m));
    for (const method of missing) {
      await prisma.paymentMethodConfig.create({ data: { method, isCustom: false } });
    }
    const all = missing.length ? await prisma.paymentMethodConfig.findMany() : configs;
    res.json({ methods: all });
  } catch (err) {
    next(err);
  }
}

const updateSchema = z.object({
  displayName: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
  accountTitle: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  walletAddress: z.string().optional().nullable(),
  qrImageUrl: z.string().optional().nullable(),
  // Merchant credential fields
  storeId: z.string().optional().nullable(),
  hashKey: z.string().optional().nullable(),
  merchantId: z.string().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  secretKey: z.string().optional().nullable(),
});

async function updateMethod(req, res, next) {
  try {
    const method = req.params.method.toLowerCase();
    const data = updateSchema.parse(req.body);
    const config = await prisma.paymentMethodConfig.upsert({
      where: { method },
      update: data,
      create: { method, ...data },
    });
    res.json({ config });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Add a new Custom Wallet dynamically from Admin Panel
async function createCustomWallet(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Wallet name is required.' });

    const method = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    
    const existing = await prisma.paymentMethodConfig.findUnique({ where: { method } });
    if (existing) return res.status(400).json({ error: 'Wallet with this name already exists.' });

    const newWallet = await prisma.paymentMethodConfig.create({
      data: {
        method,
        displayName: name.trim(),
        isCustom: true,
        isEnabled: false,
      },
    });

    res.json({ wallet: newWallet });
  } catch (err) {
    next(err);
  }
}

// Delete a Custom Wallet from Admin Panel
async function deleteCustomWallet(req, res, next) {
  try {
    const method = req.params.method.toLowerCase();
    const config = await prisma.paymentMethodConfig.findUnique({ where: { method } });
    
    if (!config) return res.status(404).json({ error: 'Wallet not found.' });
    if (!config.isCustom) return res.status(400).json({ error: 'Default system wallets cannot be deleted.' });

    await prisma.paymentMethodConfig.delete({ where: { method } });
    res.json({ success: true, message: 'Wallet deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  listPublicMethods, 
  adminListMethods, 
  updateMethod, 
  createCustomWallet, 
  deleteCustomWallet 
};