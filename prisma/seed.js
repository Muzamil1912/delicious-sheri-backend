// Seeds the database with: one admin account (from .env) + starter categories + starter products.
// Run with: npm run seed  (after prisma migrate)

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // ---- Admin account ----
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'owner';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'muzamilosarm12345';
  const hashed = await bcrypt.hash(adminPassword, 12);

  await prisma.adminUser.upsert({
    where: { username: adminUsername },
    update: { password: hashed, role: 'superadmin' },
    create: { username: adminUsername, password: hashed, role: 'superadmin' },
  });
  console.log(`Admin user ready -> username: ${adminUsername} (password from .env, change after first login)`);

  // ---- Categories ----
  const categories = ['Mithai', 'Cakes', 'Cookies & Biscotti', 'Dry Fruit Sweets', 'Gift Boxes'];
  const catRecords = {};
  for (const name of categories) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    catRecords[name] = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
  }

  // ---- Products ----
  const products = [
    { name: 'Kesar Badam Barfi (500g)', category: 'Mithai', price: 1450, stock: 40, desc: 'Saffron and almond barfi, made fresh daily with pure khoya.', img: '🟨', returnable: false },
    { name: 'Gulab Jamun Box (12 pcs)', category: 'Mithai', price: 950, stock: 60, desc: 'Soft khoya jamuns soaked in rose-cardamom syrup.', img: '🟤', returnable: false },
    { name: 'Motichoor Laddu (500g)', category: 'Mithai', price: 1100, stock: 35, desc: 'Fine boondi laddus with a delicate melt-in-mouth texture.', img: '🟡', returnable: false },
    { name: 'Belgian Chocolate Fudge Cake', category: 'Cakes', price: 2200, stock: 15, desc: 'Rich Belgian dark chocolate layered cake, serves 8-10.', img: '🍫', returnable: false },
    { name: 'Red Velvet Cake (1kg)', category: 'Cakes', price: 2500, stock: 12, desc: 'Classic red velvet with cream-cheese frosting.', img: '🍰', returnable: false },
    { name: 'Pistachio Biscotti (250g)', category: 'Cookies & Biscotti', price: 780, stock: 50, desc: 'Twice-baked almond-pistachio biscotti, hand cut.', img: '🍪', returnable: true },
    { name: 'Ajwain Namak Para (400g)', category: 'Cookies & Biscotti', price: 550, stock: 45, desc: 'Crisp savoury snack, a tea-time favourite.', img: '🥠', returnable: true },
    { name: 'Premium Dry Fruit Chikki (500g)', category: 'Dry Fruit Sweets', price: 1650, stock: 30, desc: 'Cashew, almond and pistachio set in jaggery.', img: '🥜', returnable: true },
    { name: 'Anniversary Gift Hamper', category: 'Gift Boxes', price: 3900, stock: 20, desc: 'Curated box of mithai, cookies and dry fruit sweets.', img: '🎁', returnable: false },
    { name: 'Eid Special Assorted Box (1kg)', category: 'Gift Boxes', price: 3200, stock: 25, desc: 'A festive assortment of our best-selling mithai.', img: '🎉', returnable: false },
  ];

  for (const p of products) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        name: p.name,
        slug,
        description: p.desc,
        price: p.price,
        imageUrl: p.img, 
        stock: p.stock,
        isActive: true,
        isFeatured: p.price > 2000,
        isReturnable: p.returnable,
        categoryId: catRecords[p.category].id,
      },
    });
  }

  console.log(`Seeded ${products.length} products across ${categories.length} categories.`);

  // ---- Starter banners ----
  const banners = [
    { title: 'Eid Special — 15% Off Gift Boxes', subtitle: 'Use code EID15 at checkout', ctaLabel: 'Shop Gift Boxes', ctaLink: '/shop', emoji: '🎉', sortOrder: 1 },
    { title: 'Fresh Cakes, Baked Daily', subtitle: 'Order by 2pm for same-day delivery', ctaLabel: 'Order Now', ctaLink: '/shop', emoji: '🍰', sortOrder: 2 },
  ];
  for (const b of banners) {
    const exists = await prisma.banner.findFirst({ where: { title: b.title } });
    if (!exists) await prisma.banner.create({ data: b });
  }
  console.log(`Seeded ${banners.length} starter banners.`);

  // ---- Sample third-party vendor + general-brand marketplace products ----
  let vendor = await prisma.vendor.findFirst({ where: { name: 'Karachi Electronics Hub' } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: { name: 'Karachi Electronics Hub', city: 'Karachi', settlementMode: 'khata', ledgerBalance: 0, cashFloatBalance: 2000 }
    });
  }

  const generalProducts = [
    { name: 'Wireless Earbuds', desc: 'Bluetooth 5.0, 20hr battery.', price: 3500, costPrice: 2400, img: '🎧', weight: 150 },
    { name: 'Cotton Casual Shirt', desc: 'Breathable summer fit, size M-XL.', price: 1800, costPrice: 1100, img: '👕', weight: 300 },
  ];
  for (const p of generalProducts) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        name: p.name, slug, description: p.desc, price: p.price, costPrice: p.costPrice,
        imageUrl: p.img, stock: 40, isActive: true, isReturnable: true,
        brandType: 'general', vendorId: vendor.id, weightGrams: p.weight,
      },
    });
  }
  console.log(`Seeded 1 vendor + ${generalProducts.length} general-brand marketplace products.`);

  // ---- Platform settings (order assignment mode) ----
  const existingSetting = await prisma.platformSetting.findFirst();
  if (!existingSetting) {
    await prisma.platformSetting.create({
      data: { assignmentMode: 'manual' }
    });
  }

  // ---- Payment method rows ----
  const paymentMethods = ['visa', 'mastercard', 'easypaisa', 'jazzcash', 'sadapay', 'paypal', 'payoneer', 'bitcoin'];
  for (const method of paymentMethods) {
    await prisma.paymentMethodConfig.upsert({ where: { method }, update: {}, create: { method } });
  }
  console.log(`Seeded platform settings + ${paymentMethods.length} payment method placeholders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });