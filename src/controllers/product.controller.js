const { z } = require('zod');
const prisma = require('../utils/db');
const { computePrice } = require('../utils/pricing');

// ---------- Public ----------
function sanitizePublicProduct(product) {
  const { costPrice, marginAmount, vendor, ...rest } = product;
  return {
    ...rest,
    vendor: vendor ? { name: vendor.name, logoUrl: vendor.logoUrl } : null,
  };
}

async function listProducts(req, res, next) {
  try {
    const { category, search, featured, brand } = req.query;
    const where = { isActive: true };
    if (category) where.category = { slug: category };
    if (featured === 'true') where.isFeatured = true;
    if (search) where.name = { contains: search };
    if (brand) where.brandType = brand;

    const products = await prisma.product.findMany({
      where,
      include: { category: true, vendor: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products: products.map(sanitizePublicProduct) });
  } catch (err) {
    next(err);
  }
}

async function getProductBySlug(req, res, next) {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      include: { category: true, vendor: true },
    });
    if (!product || !product.isActive) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product: sanitizePublicProduct(product) });
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const categories = await prisma.category.findMany();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------
const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  price: z.number().positive(),
  costPrice: z.number().positive().optional().nullable(),
  compareAt: z.number().positive().optional().nullable(),
  imageUrl: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  brandType: z.enum(['bakery', 'general']).optional(),
  vendorId: z.string().optional().nullable(),
  stock: z.number().int().min(0),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isReturnable: z.boolean().optional(),
  weightGrams: z.number().int().optional().nullable(),
  marginAmount: z.number().optional().nullable(),
  externalSku: z.string().optional().nullable(),
});

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function createProduct(req, res, next) {
  try {
    const data = productSchema.parse(req.body);
    const slug = slugify(data.name);
    if (data.costPrice != null && data.marginAmount != null) {
      data.price = computePrice(data.costPrice, data.marginAmount, data.price);
    }
    const product = await prisma.product.create({ data: { ...data, slug } });
    res.status(201).json({ product });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const id = req.params.id;
    const data = productSchema.partial().parse(req.body);
    if (data.name) data.slug = slugify(data.name);

    if (data.costPrice !== undefined || data.marginAmount !== undefined) {
      const existing = await prisma.product.findUnique({ where: { id } });
      const costPrice = data.costPrice !== undefined ? data.costPrice : existing?.costPrice;
      const marginAmount = data.marginAmount !== undefined ? data.marginAmount : existing?.marginAmount;
      if (costPrice != null && marginAmount != null) {
        data.price = computePrice(costPrice, marginAmount, data.price ?? existing?.price);
      }
    }

    const product = await prisma.product.update({ where: { id }, data });
    res.json({ product });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const id = req.params.id;
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function hardDeleteProduct(req, res, next) {
  try {
    const id = req.params.id;
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function adminListProducts(req, res, next) {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts,
  getProductBySlug,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  adminListProducts,
};