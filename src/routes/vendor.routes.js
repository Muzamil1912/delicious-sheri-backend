const router = require('express').Router();
const ctrl = require('../controllers/vendor.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.get('/', requireAdmin, ctrl.listVendors);
router.post('/', requireAdmin, ctrl.createVendor);
router.put('/:id', requireAdmin, ctrl.updateVendor);
router.post('/:id/regenerate-key', requireAdmin, ctrl.regenerateApiKey);
router.patch('/:id/settlement-mode', requireAdmin, ctrl.setSettlementMode);
router.post('/:id/cash/assign-pickup', requireAdmin, ctrl.assignCashPickup);
router.post('/:id/cash/collect-cod', requireAdmin, ctrl.collectCOD);
router.post('/:id/khata/item-picked', requireAdmin, ctrl.itemPickedKhata);
router.post('/:id/khata/settle', requireAdmin, ctrl.settleVendor);

module.exports = router;
