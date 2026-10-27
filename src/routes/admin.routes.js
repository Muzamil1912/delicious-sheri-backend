const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

// Layer 1: passphrase gate (no auth required, just the shared passphrase)
router.post('/gate', ctrl.checkGatePassphrase);

// Layer 2: real username/password login -> issues JWT
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);

// Everything below requires a valid admin JWT
router.get('/dashboard', requireAdmin, ctrl.dashboard);

// Vendor Edit & Delete Routes
router.put('/vendors/:id', requireAdmin, ctrl.updateVendor);
router.delete('/vendors/:id', requireAdmin, ctrl.deleteVendor);

module.exports = router;