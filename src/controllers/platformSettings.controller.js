const { z } = require('zod');
const prisma = require('../utils/db');

async function getSettings(req, res, next) {
  try {
    const settings = await prisma.platformSetting.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

const updateSchema = z.object({ assignmentMode: z.enum(['auto', 'manual']) });

async function updateSettings(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    const settings = await prisma.platformSetting.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    res.json({ settings });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
