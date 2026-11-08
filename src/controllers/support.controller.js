const { z } = require('zod');
const prisma = require('../utils/db');
const { asId } = require('../utils/ids');

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  subject: z.string().min(3),
  message: z.string().min(5),
});

async function createTicket(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        ...data,
        userId: req.user?.id || null,
        status: 'open',
      },
    });
    res.status(201).json({ ticket });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function listMyTickets(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required.' });
    const tickets = await prisma.supportTicket.findMany({
      where: { OR: [{ userId: req.user.id }, { email: req.user.email }] },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
}

async function adminListTickets(req, res, next) {
  try {
    const { status } = req.query;
    const tickets = await prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
}

async function adminReplyTicket(req, res, next) {
  try {
    const id = asId(req.params.id);
    const { adminReply, status } = z
      .object({
        adminReply: z.string().min(1),
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      })
      .parse(req.body);
    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        adminReply,
        status: status || 'resolved',
        repliedAt: new Date(),
      },
    });
    res.json({ ticket });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function adminUpdateTicketStatus(req, res, next) {
  try {
    const id = asId(req.params.id);
    const { status } = z
      .object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']) })
      .parse(req.body);
    const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });
    res.json({ ticket });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function adminDeleteTicket(req, res, next) {
  try {
    const id = asId(req.params.id);
    await prisma.supportTicket.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTicket,
  listMyTickets,
  adminListTickets,
  adminReplyTicket,
  adminUpdateTicketStatus,
  adminDeleteTicket,
};
