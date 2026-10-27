const router = require('express').Router();
const ctrl = require('../controllers/product.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Admin-only management routes (placed at the top to avoid conflict with slug routes)
router.get('/admin/all', requireAdmin, ctrl.adminListProducts);
router.post('/admin', requireAdmin, ctrl.createProduct);
router.put('/admin/:id', requireAdmin, ctrl.updateProduct);
router.delete('/admin/:id', requireAdmin, ctrl.deleteProduct);
router.delete('/admin/:id/permanent', requireAdmin, ctrl.hardDeleteProduct);

// Public storefront routes
router.get('/', ctrl.listProducts);
router.get('/categories', ctrl.listCategories);
router.get('/:slug', ctrl.getProductBySlug);

module.exports = router;