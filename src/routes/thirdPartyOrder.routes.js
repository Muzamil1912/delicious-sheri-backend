const router = require('express').Router();
const ctrl = require('../controllers/thirdPartyOrder.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Public — a real third-party supplier's system calls this to push a cost
// price update (authenticated via their own X-Vendor-Api-Key header, not admin auth).
router.post('/webhook/price-update', ctrl.vendorPriceWebhook);

// Admin — third-party order records, tracking, disputes
router.get('/admin/all', requireAdmin, ctrl.listThirdPartyOrders);
router.patch('/admin/:id/tracking', requireAdmin, ctrl.updateTracking);
router.patch('/admin/:id/dispute', requireAdmin, ctrl.updateDispute);
router.post('/admin/simulate-price-update/:productId', requireAdmin, ctrl.simulatePriceUpdate);

module.exports = router;
