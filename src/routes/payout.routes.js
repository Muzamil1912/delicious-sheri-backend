const router = require('express').Router();
const ctrl = require('../controllers/payout.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.get('/held-balance', requireAdmin, ctrl.getHeldBalance);
router.post('/orders/:orderId/refund', requireAdmin, ctrl.refundOrder);
router.post('/withdraw', requireAdmin, ctrl.requestWithdrawal);
router.get('/', requireAdmin, ctrl.listPayouts);
router.patch('/:id/complete', requireAdmin, ctrl.markPayoutCompleted);

module.exports = router;
