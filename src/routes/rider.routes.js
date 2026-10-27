const router = require('express').Router();
const ctrl = require('../controllers/rider.controller');
const { requireRider } = require('../middleware/riderAuth.middleware');

// Public — onboarding + login (no auth required to reach these)
router.post('/register', ctrl.register);
router.get('/application/:id/status', ctrl.checkStatus);
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);

// Forgot password (OTP via SMS) — all public, since the rider isn't logged in yet
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/reset-password', ctrl.resetPassword);

// Authenticated rider actions
router.get('/me/active-order', requireRider, ctrl.myActiveOrder);
router.get('/me/history', requireRider, ctrl.myHistory);
router.get('/me/earnings', requireRider, ctrl.myEarnings);
router.post('/me/location', requireRider, ctrl.updateLocation);
router.patch('/me/online-status', requireRider, ctrl.setOnlineStatus);
router.patch('/me/orders/:orderId/accept', requireRider, ctrl.acceptOrder);
router.patch('/me/orders/:orderId/reject', requireRider, ctrl.rejectOrder);
router.patch('/me/orders/:orderId/arrived', requireRider, ctrl.markArrived);
router.post('/me/orders/:orderId/doorstep-proof', requireRider, ctrl.submitDoorstepProof);
router.post('/me/orders/:orderId/verify-delivery-code', requireRider, ctrl.verifyDeliveryCode);
router.post('/me/orders/:orderId/request-code-help', requireRider, ctrl.requestDeliveryCodeHelp);
router.patch('/me/orders/:orderId/confirm-delivered', requireRider, ctrl.confirmDelivered);
router.patch('/me/orders/:orderId/reject-at-doorstep', requireRider, ctrl.rejectAtDoorstep);
router.post('/me/profile-update-requests', requireRider, ctrl.requestProfileUpdate);
router.get('/me/profile-update-requests', requireRider, ctrl.myUpdateRequests);
router.post('/me/sos', requireRider, ctrl.triggerSOS);

module.exports = router;
