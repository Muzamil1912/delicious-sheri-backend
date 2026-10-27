const { z } = require('zod');
const prisma = require('../utils/db');

// ---------- Public ----------
// Only active banners, in display order — storefront calls this
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

// ---------- Admin ----------
async function adminListBanners(req, res, next) {
  try {
    const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
}

// Flexible validation schema that allows optional titles and extra fields
const bannerSchema = z.object({
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
}).passthrough();

async function createBanner(req, res, next) {
  try {
    const parsedData = bannerSchema.parse(req.body);
    
    // Map data properly so adLink / script codes are saved in title or ctaLink for rendering
    const data = {
      title: parsedData.adLink || parsedData.title || parsedData.adSlotName || 'Ad Slot Banner',
      subtitle: parsedData.subtitle || parsedData.platform || parsedData.adNetwork || null,
      ctaLabel: parsedData.ctaLabel || parsedData.adNetwork || null,
      ctaLink: parsedData.ctaLink || parsedData.adLink || parsedData.destinationUrl || null,
      imageUrl: parsedData.imageUrl || null,
      isActive: parsedData.isActive ?? true,
      sortOrder: parsedData.sortOrder || 0,
    };

    const banner = await prisma.banner.create({ data });
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
    const id = Number(req.params.id);
    const parsedData = bannerSchema.partial().parse(req.body);
    
    const data = {};
    if (parsedData.title !== undefined) data.title = parsedData.title;
    if (parsedData.subtitle !== undefined) data.subtitle = parsedData.subtitle;
    if (parsedData.ctaLabel !== undefined) data.ctaLabel = parsedData.ctaLabel;
    if (parsedData.ctaLink !== undefined) data.ctaLink = parsedData.ctaLink;
    if (parsedData.emoji !== undefined) data.emoji = parsedData.emoji;
    if (parsedData.imageUrl !== undefined) data.imageUrl = parsedData.imageUrl;
    if (parsedData.isActive !== undefined) data.isActive = parsedData.isActive;
    if (parsedData.sortOrder !== undefined) data.sortOrder = parsedData.sortOrder;

    const banner = await prisma.banner.update({ where: { id }, data });
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
    const id = Number(req.params.id);
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
    const idParam = req.params.id;
    let deleted = null;
    
    try {
      deleted = await prisma.banner.delete({ where: { id: Number(idParam) } });
    } catch (e) {
      deleted = await prisma.banner.delete({ where: { id: idParam } });
    }

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