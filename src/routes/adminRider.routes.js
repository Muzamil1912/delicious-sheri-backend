const router = require('express').Router();
const ctrl = require('../controllers/adminRider.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Every route here is already mounted behind requireAdmin in server.js at the
// /api/admin/riders prefix — requireAdmin is still applied per-route here too,
// defense-in-depth in case the mount point ever changes.
router.post('/invite', requireAdmin, ctrl.generateInviteLink);
router.get('/', requireAdmin, ctrl.listRiders);
router.get('/active', requireAdmin, ctrl.listActiveRiders);
router.get('/:id', requireAdmin, ctrl.getRider);
router.patch('/:id/approve', requireAdmin, ctrl.approveRider);
router.patch('/:id/reject', requireAdmin, ctrl.rejectRider);
router.post('/create-direct', requireAdmin, ctrl.createRiderDirectly);
router.patch('/:id/set-password', requireAdmin, ctrl.setRiderPassword);
router.post('/:id/bonus', requireAdmin, ctrl.sendBonus);
router.get('/:id/history', requireAdmin, ctrl.riderHistory);

router.patch('/orders/:orderId/assign', requireAdmin, ctrl.assignRider);
router.patch('/orders/:orderId/transfer', requireAdmin, ctrl.transferOrder);

router.get('/sos/active', requireAdmin, ctrl.listSOSAlerts);
router.patch('/sos/:id/resolve', requireAdmin, ctrl.resolveSOS);

router.get('/orders/:orderId/delivery-code', requireAdmin, ctrl.viewDeliveryCode);
router.post('/orders/:orderId/resend-delivery-code', requireAdmin, ctrl.resendDeliveryCode);

router.get('/update-requests', requireAdmin, ctrl.listUpdateRequests);
router.patch('/update-requests/:id/approve', requireAdmin, ctrl.approveUpdateRequest);
router.patch('/update-requests/:id/reject', requireAdmin, ctrl.rejectUpdateRequest);

module.exports = router;
