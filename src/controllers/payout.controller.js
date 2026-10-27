const { z } = require('zod');
const prisma = require('../utils/db');
const { creditWallet } = require('../utils/wallet');

// "Held Balance" is computed, not stored — it's every paid order's total,
// minus whatever's already been refunded, minus whatever's already been
// withdrawn. This keeps it always correct without a separate balance field
// that could drift out of sync.
async function getHeldBalance(req, res, next) {
  try {
    const paidOrders = await prisma.order.aggregate({
      where: { paymentStatus: 'paid' },
      _sum: { total: true },
    });
    const completedPayouts = await prisma.payout.aggregate({
      where: { status: 'completed' },
      _sum: { amount: true },
    });
    const grossHeld = paidOrders._sum.total || 0;
    const withdrawn = completedPayouts._sum.amount || 0;
    res.json({ heldBalance: grossHeld - withdrawn, grossPaid: grossHeld, totalWithdrawn: withdrawn });
  } catch (err) {
    next(err);
  }
}

// Refund a specific order — reverses its payment status and, for logged-in
// customers, credits the amount into their Delicious Sheri Wallet rather than
// attempting an external bank/card reversal (which needs the payment
// processor's own refund API and real credentials — see README's payment
// section for why that step can't be automated by this codebase alone).
async function refundOrder(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus !== 'paid') return res.status(400).json({ error: 'Only paid orders can be refunded.' });

    const updated = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'refunded', orderStatus: 'cancelled' } });

    if (order.userId) {
      await creditWallet('customer', order.userId, order.total, `Refund for order ${order.orderNumber}`, order.id);
    }

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

const withdrawSchema = z.object({
  amount: z.number().positive(),
  bankAccountTitle: z.string().min(2),
  bankAccountNumber: z.string().min(4),
});

// Records a withdrawal request against the held balance. IMPORTANT: this does
// not move any real money — actually transferring funds to a bank account
// requires a licensed disbursement processor (e.g. Stripe Connect Payouts, or
// your bank's own transfer API) with your real account credentials. This
// endpoint gives you the bookkeeping (so held balance goes down correctly)
// and a "pending" record to mark "completed" once you've done the transfer
// yourself through your bank/processor.
async function requestWithdrawal(req, res, next) {
  try {
    const data = withdrawSchema.parse(req.body);
    const payout = await prisma.payout.create({ data: { ...data, status: 'pending' } });
    res.status(201).json({ payout });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function listPayouts(req, res, next) {
  try {
    const payouts = await prisma.payout.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ payouts });
  } catch (err) {
    next(err);
  }
}

async function markPayoutCompleted(req, res, next) {
  try {
    const id = Number(req.params.id);
    const payout = await prisma.payout.update({ where: { id }, data: { status: 'completed' } });
    res.json({ payout });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHeldBalance, refundOrder, requestWithdrawal, listPayouts, markPayoutCompleted };
