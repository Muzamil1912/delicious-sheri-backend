const router = require('express').Router();
const ctrl = require('../controllers/vendorImport.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.post('/:vendorId/fetch', requireAdmin, ctrl.fetchCatalog);
router.get('/:vendorId/pending', requireAdmin, ctrl.listPendingImports);
router.post('/import', requireAdmin, ctrl.importSelected);
router.get('/:vendorId/products', requireAdmin, ctrl.getVendorProducts);

module.exports = router;