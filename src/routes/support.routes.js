const router = require('express').Router();
const ctrl = require('../controllers/support.controller');
const { attachUserIfPresent, requireCustomer } = require('../middleware/customerAuth.middleware');
const { requireAdmin } = require('../middleware/adminAuth.middleware');

router.post('/', attachUserIfPresent, ctrl.createTicket);
router.get('/mine', attachUserIfPresent, requireCustomer, ctrl.listMyTickets);

router.get('/admin/all', requireAdmin, ctrl.adminListTickets);
router.patch('/admin/:id/reply', requireAdmin, ctrl.adminReplyTicket);
router.patch('/admin/:id/status', requireAdmin, ctrl.adminUpdateTicketStatus);
router.delete('/admin/:id', requireAdmin, ctrl.adminDeleteTicket);

module.exports = router;
