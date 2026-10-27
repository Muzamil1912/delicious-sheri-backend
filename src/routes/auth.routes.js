const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { attachUserIfPresent } = require('../middleware/customerAuth.middleware');

router.post('/signup', ctrl.signup);
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', attachUserIfPresent, ctrl.me);

// AliExpress Integration Routes
router.get('/aliexpress/auth', ctrl.aliexpressAuth);
router.get('/aliexpress/callback', ctrl.aliexpressCallback);

module.exports = router;