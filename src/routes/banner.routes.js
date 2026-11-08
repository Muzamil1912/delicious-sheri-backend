const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/banner.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Public — storefront hero rotator polls this (mounted at /api/banners)
// Admin list — when mounted at /api/admin/banners, GET / must return all banners
router.get('/', (req, res, next) => {
  if (req.baseUrl && req.baseUrl.includes('/admin/')) {
    return requireAdmin(req, res, () => ctrl.adminListBanners(req, res, next));
  }
  return ctrl.listActiveBanners(req, res, next);
});

// Admin — Create new banner / ad slot
router.post('/', requireAdmin, ctrl.createBanner);

// Admin — Get all banners for management (explicit path kept for compatibility)
router.get('/admin/all', requireAdmin, ctrl.adminListBanners);

// Admin — Update banner details
router.put('/:id', requireAdmin, ctrl.updateBanner);

// Admin — Toggle banner status (active/inactive)
router.patch('/:id/toggle', requireAdmin, ctrl.toggleBanner);

// Admin — Delete a banner
router.delete('/:id', requireAdmin, ctrl.deleteBanner);

module.exports = router;