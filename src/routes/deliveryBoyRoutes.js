const router = require('express').Router();
const ctrl = require('../controllers/rider.controller');

router.post('/register', ctrl.register);
router.get('/status/:id', ctrl.checkStatus);

router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);

router.post('/forgot-password', ctrl.forgotPassword);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/reset-password', ctrl.resetPassword);

router.get('/active-order', ctrl.myActiveOrder);
router.get('/history', ctrl.myHistory);
router.get('/earnings', ctrl.myEarnings);

router.post('/location', ctrl.updateLocation);
router.post('/online-status', ctrl.setOnlineStatus);

router.post('/orders/:orderId/accept', ctrl.acceptOrder);
router.post('/orders/:orderId/reject', ctrl.rejectOrder);
router.post('/orders/:orderId/arrived', ctrl.markArrived);
router.post('/orders/:orderId/doorstep-proof', ctrl.submitDoorstepProof);
router.post('/orders/:orderId/confirm-delivered', ctrl.confirmDelivered);
router.post('/orders/:orderId/verify-code', ctrl.verifyDeliveryCode);
router.post('/orders/:orderId/code-help', ctrl.requestDeliveryCodeHelp);
router.post('/orders/:orderId/reject-doorstep', ctrl.rejectAtDoorstep);

router.post('/profile-update-request', ctrl.requestProfileUpdate);
router.get('/my-update-requests', ctrl.myUpdateRequests);

router.post('/sos', ctrl.triggerSOS);

module.exports = router;