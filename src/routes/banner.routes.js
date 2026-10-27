const router = require('express').Router();
const ctrl = require('../controllers/banner.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Public — storefront hero rotator polls this
router.get('/', ctrl.listActiveBanners);

// Admin — Create new banner / ad slot
router.post('/', requireAdmin, ctrl.createBanner);

// Admin — Get all banners for management
router.get('/admin/all', requireAdmin, ctrl.adminListBanners);

// Admin — Update banner details
router.put('/:id', requireAdmin, ctrl.updateBanner);

// Admin — Toggle banner status (active/inactive)
router.patch('/:id/toggle', requireAdmin, ctrl.toggleBanner);

// Admin — Delete a banner
router.delete('/:id', requireAdmin, ctrl.deleteBanner);

module.exports = router;