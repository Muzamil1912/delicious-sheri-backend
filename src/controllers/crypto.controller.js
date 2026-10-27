const { z } = require('zod');
const prisma = require('../utils/db');

// Customer submits their transaction hash after sending BTC to the admin's
// wallet address — this does NOT verify on-chain (no blockchain node/API
// wired up here); it just logs the claim for the admin to check manually
// against their own wallet and approve. That manual check is the actual
// verification step in this flow.
const submitSchema = z.object({
  orderNumber: z.string(),
  customerName: z.string().min(2),
  amount: z.number().positive(),
  txHash: z.string().min(6),
});

async function submitTxHash(req, res, next) {
  try {
    const data = submitSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { orderNumber: data.orderNumber } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const tx = await prisma.cryptoTransaction.create({
      data: {
        orderId: order.id,
        customerName: data.customerName,
        amount: data.amount,
        txHash: data.txHash,
        status: 'pending',
      },
    });
    res.status(201).json({ transaction: tx });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// ---------- Admin ----------
async function listTransactions(req, res, next) {
  try {
    const { status } = req.query;
    const transactions = await prisma.cryptoTransaction.findMany({
      where: status ? { status } : undefined,
      include: { order: { select: { orderNumber: true, total: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

async function approveTransaction(req, res, next) {
  try {
    const id = Number(req.params.id);
    const tx = await prisma.cryptoTransaction.findUnique({ where: { id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

    await prisma.$transaction([
      prisma.cryptoTransaction.update({ where: { id }, data: { status: 'verified' } }),
      prisma.order.update({ where: { id: tx.orderId }, data: { paymentStatus: 'paid' } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function rejectTransaction(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.cryptoTransaction.update({ where: { id }, data: { status: 'rejected' } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitTxHash, listTransactions, approveTransaction, rejectTransaction };
