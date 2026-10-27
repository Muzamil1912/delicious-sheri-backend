const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');

router.post('/initiate', ctrl.initiatePayment);

// Gateway-specific webhook/callback endpoints (register these exact paths
// with each provider during merchant onboarding).
router.post('/webhooks/jazzcash', ctrl.jazzcashCallback);
router.post('/webhooks/easypaisa', ctrl.easypaisaCallback);
router.post('/webhooks/card', ctrl.cardWebhook);
router.post('/webhooks/sadapay', ctrl.sadapayWebhook);

module.exports = router;
