const router = require('express').Router();
const ctrl = require('../controllers/platformSettings.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.get('/', requireAdmin, ctrl.getSettings);
router.put('/', requireAdmin, ctrl.updateSettings);

module.exports = router;
