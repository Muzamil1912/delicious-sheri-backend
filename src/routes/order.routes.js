const router = require('express').Router();
const ctrl = require('../controllers/order.controller');
const { attachUserIfPresent, requireCustomer } = require('../middleware/customerAuth.middleware');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.post('/', attachUserIfPresent, ctrl.createOrder);
router.get('/track/:orderNumber', ctrl.getOrderByNumber);
router.get('/mine', attachUserIfPresent, requireCustomer, ctrl.myOrders);
router.patch('/:id/cancel', attachUserIfPresent, ctrl.cancelOrder);

router.get('/admin/all', requireAdmin, ctrl.adminListOrders);
router.patch('/admin/:id/status', requireAdmin, ctrl.updateOrderStatus);

// Admin route to delete an order
router.delete('/admin/:id', requireAdmin, ctrl.deleteOrder);

module.exports = router;