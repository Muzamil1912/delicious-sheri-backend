const prisma = require('./db');

// Gets or creates a wallet for a given owner ("customer" + User.id, or
// "rider" + Rider.id). Guest checkouts (no User account) never get a wallet —
// wallet credit requires being a registered, logged-in customer.
async function getOrCreateWallet(ownerType, ownerId) {
  let wallet = await prisma.wallet.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { ownerType, ownerId, balance: 0 } });
  }
  return wallet;
}

// All wallet balance changes go through here so there's always a matching
// WalletTransaction row — the balance is never mutated without a paper trail.
async function creditWallet(ownerType, ownerId, amount, reason, orderId = null) {
  const wallet = await getOrCreateWallet(ownerType, ownerId);
  const [updated] = await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } }),
    prisma.walletTransaction.create({ data: { walletId: wallet.id, amount, reason, orderId } }),
  ]);
  return updated;
}

async function debitWallet(ownerType, ownerId, amount, reason, orderId = null) {
  return creditWallet(ownerType, ownerId, -Math.abs(amount), reason, orderId);
}

module.exports = { getOrCreateWallet, creditWallet, debitWallet };
