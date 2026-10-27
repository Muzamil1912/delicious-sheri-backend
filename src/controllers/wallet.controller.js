const prisma = require('../utils/db');
const { getOrCreateWallet } = require('../utils/wallet');

// ---------- Customer-facing ----------
async function myWallet(req, res, next) {
  try {
    const wallet = await getOrCreateWallet('customer', req.user.id);
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ wallet, transactions });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------
async function listWallets(req, res, next) {
  try {
    const wallets = await prisma.wallet.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ wallets });
  } catch (err) {
    next(err);
  }
}

async function getWalletTransactions(req, res, next) {
  try {
    const walletId = Number(req.params.id);
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

module.exports = { myWallet, listWallets, getWalletTransactions };
