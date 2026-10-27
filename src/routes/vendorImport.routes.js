const router = require('express').Router();
const ctrl = require('../controllers/vendorImport.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.post('/vendor/fetch', requireAdmin, ctrl.fetchCatalog);
router.post('/vendor/fetch/pending', requireAdmin, ctrl.listPendingImports);
router.post('/import', requireAdmin, ctrl.importSelected);
router.get('/vendor/get/products', requireAdmin, ctrl.getVendorProducts);

module.exports = module.exports = router;