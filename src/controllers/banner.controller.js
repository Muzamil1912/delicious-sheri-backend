const { z } = require('zod');
const prisma = require('../utils/db');
const { asId } = require('../utils/ids');

async function listActiveBanners(req, res, next) {
  try {
    const banners = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
}

async function adminListBanners(req, res, next) {
  try {
    const where = {};
    if (req.query.platform) where.platform = String(req.query.platform);
    if (req.query.page) where.page = String(req.query.page);
    const banners = await prisma.banner.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
}

const bannerSchema = z
  .object({
    title: z.string().optional().nullable(),
    subtitle: z.string().optional().nullable(),
    ctaLabel: z.string().optional().nullable(),
    ctaLink: z.string().optional().nullable(),
    emoji: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    platform: z.string().optional().nullable(),
    page: z.string().optional().nullable(),
    adSlotName: z.string().optional().nullable(),
    adNetwork: z.string().optional().nullable(),
    adLink: z.string().optional().nullable(),
    adSize: z.string().optional().nullable(),
    width: z.string().optional().nullable(),
    height: z.string().optional().nullable(),
    posX: z.string().optional().nullable(),
    posY: z.string().optional().nullable(),
    destinationUrl: z.string().optional().nullable(),
    adSenseClientId: z.string().optional().nullable(),
    adSenseSlotId: z.string().optional().nullable(),
  })
  .passthrough();

function mapBannerData(parsed) {
  const title =
    parsed.title ||
    parsed.adSlotName ||
    (parsed.adLink && String(parsed.adLink).slice(0, 80)) ||
    'Ad Slot';
  return {
    title,
    subtitle: parsed.subtitle ?? null,
    ctaLabel: parsed.ctaLabel || parsed.adNetwork || null,
    ctaLink: parsed.ctaLink || parsed.destinationUrl || parsed.adLink || null,
    emoji: parsed.emoji || '🎉',
    imageUrl: parsed.imageUrl || null,
    isActive: parsed.isActive ?? true,
    sortOrder: parsed.sortOrder || 0,
    platform: parsed.platform || null,
    page: parsed.page || null,
    adSlotName: parsed.adSlotName || null,
    adNetwork: parsed.adNetwork || null,
    adLink: parsed.adLink || null,
    adSize: parsed.adSize || null,
    width: parsed.width || null,
    height: parsed.height || null,
    posX: parsed.posX || null,
    posY: parsed.posY || null,
    destinationUrl: parsed.destinationUrl || null,
    adSenseClientId: parsed.adSenseClientId || null,
    adSenseSlotId: parsed.adSenseSlotId || null,
  };
}

async function createBanner(req, res, next) {
  try {
    const parsedData = bannerSchema.parse(req.body);
    const banner = await prisma.banner.create({ data: mapBannerData(parsedData) });
    res.status(201).json({ banner });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0]?.message || 'Validation error' });
    }
    next(err);
  }
}

async function updateBanner(req, res, next) {
  try {
    const id = asId(req.params.id);
    const parsedData = bannerSchema.partial().parse(req.body);
    const data = mapBannerData({ ...parsedData });
    // Only overwrite fields that were actually sent
    const patch = {};
    for (const key of Object.keys(parsedData)) {
      if (key in data) patch[key] = data[key];
    }
    if (parsedData.isActive !== undefined) patch.isActive = parsedData.isActive;
    if (parsedData.title !== undefined) patch.title = data.title;
    const banner = await prisma.banner.update({ where: { id }, data: patch });
    res.json({ banner });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0]?.message || 'Validation error' });
    }
    next(err);
  }
}

async function toggleBanner(req, res, next) {
  try {
    const id = asId(req.params.id);
    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Banner not found.' });
    const banner = await prisma.banner.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
    res.json({ banner });
  } catch (err) {
    next(err);
  }
}

async function deleteBanner(req, res, next) {
  try {
    const id = asId(req.params.id);
    const deleted = await prisma.banner.delete({ where: { id } });
    res.json({ ok: true, deleted });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listActiveBanners,
  adminListBanners,
  createBanner,
  updateBanner,
  toggleBanner,
  deleteBanner,
};
