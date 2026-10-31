const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../utils/db');
const { signToken } = require('../utils/jwt');

function checkGatePassphrase(req, res) {
  const { passphrase } = req.body;
  if (!passphrase || passphrase !== process.env.ADMIN_GATE_PASSPHRASE) {
    return res.status(401).json({ error: 'Incorrect access passphrase.' });
  }
  res.json({ ok: true });
}

const loginSchema = z.object({ username: z.string(), password: z.string() });

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { username: data.username } });
    if (!admin) return res.status(401).json({ error: 'Invalid admin credentials.' });

    const match = await bcrypt.compare(data.password, admin.password);
    if (!match) return res.status(401).json({ error: 'Invalid admin credentials.' });

    const token = signToken({ id: admin.id, username: admin.username, role: 'admin' }, '12h');
    res.cookie('ds_admin_token', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ admin: { id: admin.id, username: admin.username }, token });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie('ds_admin_token');
  res.json({ ok: true });
}

async function dashboard(req, res, next) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, allOrders, lowStock, products] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { items: true } }),
      prisma.product.findMany({ where: { stock: { lt: 10 }, isActive: true } }),
      prisma.product.count(),
    ]);

    const revenueToday = todayOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + o.total, 0);

    res.json({
      revenueToday,
      ordersToday: todayOrders.length,
      totalProducts: products,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock,
      recentOrders: allOrders,
    });
  } catch (err) {
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const vendorId = parseInt(req.params.id, 10);
    const { name, city, logoUrl, webhookUrl, stripeConnectedAccountId, payoutEmail } = req.body;

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(name && { name }),
        ...(city && { city }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(stripeConnectedAccountId !== undefined && { stripeConnectedAccountId }),
        ...(payoutEmail !== undefined && { payoutEmail }),
      },
    });

    res.json({ ok: true, vendor });
  } catch (err) {
    next(err);
  }
}

async function deleteVendor(req, res, next) {
  try {
    const vendorId = parseInt(req.params.id, 10);

    // Cascade delete handles products, imported items, and third party orders
    await prisma.vendor.delete({
      where: { id: vendorId },
    });

    res.json({ ok: true, message: 'Vendor deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  checkGatePassphrase, 
  login, 
  logout, 
  dashboard, 
  updateVendor, 
  deleteVendor 
};