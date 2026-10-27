const router = require('express').Router();
const ctrl = require('../controllers/paymentSettings.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.get('/', ctrl.listPublicMethods); // public — checkout page reads this
router.get('/admin/all', requireAdmin, ctrl.adminListMethods);
router.put('/admin/:method', requireAdmin, ctrl.updateMethod);

// Routes for creating and deleting dynamic custom wallets
router.post('/admin/custom', requireAdmin, ctrl.createCustomWallet);
router.delete('/admin/custom/:method', requireAdmin, ctrl.deleteCustomWallet);

module.exports = router;