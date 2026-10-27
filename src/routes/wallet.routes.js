const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');
const { attachUserIfPresent, requireCustomer } = require('../middleware/customerAuth.middleware');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.get('/mine', attachUserIfPresent, requireCustomer, ctrl.myWallet);

router.get('/admin/all', requireAdmin, ctrl.listWallets);
router.get('/admin/:id/transactions', requireAdmin, ctrl.getWalletTransactions);

module.exports = router;
