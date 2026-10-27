const { z } = require('zod');
const prisma = require('../utils/db');
const { computePrice } = require('../utils/pricing');

async function fetchCatalog(req, res, next) {
  try {
    const vendorId = Number(req.params.vendorId);
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    let items = [];
    if (vendor.apiKey && vendor.webhookUrl) {
      const resp = await fetch(`${vendor.webhookUrl}/catalog`, {
        headers: { 'X-Vendor-Api-Key': vendor.apiKey },
      });

      const contentType = resp.headers.get('content-type');

      if (!resp.ok) {
        return res.status(resp.status).json({ 
          error: `Vendor webhook returned HTTP status ${resp.status}.` 
        });
      }

      if (!contentType || !contentType.includes('application/json')) {
        return res.status(502).json({
          error: 'Vendor webhook did not return valid JSON.'
        });
      }

      items = await resp.json();
    } else {
      return res.status(400).json({ error: 'Vendor API key or Webhook URL is missing.' });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Expected an array of items from vendor catalog.' });
    }

    const created = await prisma.$transaction(
      items.map((it) =>
        prisma.vendorImportItem.create({
          data: { 
            vendorId, 
            externalSku: it.sku, 
            name: it.name, 
            imageUrl: it.imageUrl, 
            costPrice: it.costPrice, 
            status: 'fetched' 
          },
        })
      )
    );
    res.json({ items: created });
  } catch (err) {
    next(err);
  }
}

async function listPendingImports(req, res, next) {
  try {
    const vendorId = Number(req.params.vendorId);
    const items = await prisma.vendorImportItem.findMany({ 
      where: { vendorId, status: 'fetched' }, 
      orderBy: { createdAt: 'desc' } 
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

const importSchema = z.object({
  itemIds: z.array(z.number().int()).min(1),
  marginAmount: z.number().optional().default(0),
  customPriceOverride: z.number().positive().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  shippingCost: z.number().optional().default(0),
});

async function importSelected(req, res, next) {
  try {
    const { itemIds, marginAmount, customPriceOverride, categoryId } = importSchema.parse(req.body);
    const items = await prisma.vendorImportItem.findMany({ 
      where: { id: { in: itemIds }, status: 'fetched' } 
    });

    const created = [];
    for (const item of items) {
      const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + item.externalSku.toLowerCase() + '-' + uniqueSuffix;
      
      const finalPrice = customPriceOverride ? customPriceOverride : computePrice(item.costPrice, marginAmount, item.costPrice + marginAmount);

      const product = await prisma.product.create({
        data: {
          name: item.name,
          slug,
          description: `Imported from vendor catalog (SKU ${item.externalSku}).`,
          price: finalPrice,
          costPrice: item.costPrice,
          marginAmount,
          imageUrl: item.imageUrl || '📦',
          stock: 20,
          brandType: 'general',
          vendorId: Number(item.vendorId),
          externalSku: item.externalSku,
          categoryId: categoryId || null,
        },
      });
      await prisma.vendorImportItem.update({ where: { id: item.id }, data: { status: 'imported', productId: product.id } });
      created.push(product);
    }
    res.status(201).json({ imported: created.length, products: created });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function getVendorProducts(req, res, next) {
  try {
    const vendorId = Number(req.params.vendorId);
    const products = await prisma.product.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
}

module.exports = { fetchCatalog, listPendingImports, importSelected, getVendorProducts };