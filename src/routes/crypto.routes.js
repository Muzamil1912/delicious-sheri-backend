const router = require('express').Router();
const ctrl = require('../controllers/crypto.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.post('/submit', ctrl.submitTxHash); // public — customer submits TxHash at checkout
router.get('/admin/all', requireAdmin, ctrl.listTransactions);
router.patch('/admin/:id/approve', requireAdmin, ctrl.approveTransaction);
router.patch('/admin/:id/reject', requireAdmin, ctrl.rejectTransaction);

module.exports = router;
