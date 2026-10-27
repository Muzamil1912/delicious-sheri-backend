const { z } = require('zod');
const prisma = require('../utils/db');
const { generateOrderNumber } = require('../utils/orderNumber');
const { generateDeliveryCode } = require('../utils/codes');
const { creditWallet } = require('../utils/wallet');
const { tryAutoAssign } = require('../utils/autoAssign');
const { createThirdPartyOrdersForOrder } = require('./thirdPartyOrder.controller');

const itemSchema = z.object({
  productId: z.number().int(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  items: z.array(itemSchema).min(1),
  shippingAddress: z.string().min(5),
  city: z.string().min(2),
  area: z.string().optional(),     // mohalla / neighborhood — optional, nationwide addresses vary
  street: z.string().optional(),   // gali / street — optional
  isRural: z.boolean().optional(), // customer flags a village/dehat address with no formal street grid
  paymentMethod: z.enum(['visa', 'mastercard', 'debit_card', 'easypaisa', 'jazzcash', 'sadapay', 'paypal', 'payoneer', 'bitcoin', 'cod']),
  guestName: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
});

const DELIVERY_FEE = 200; // flat local-rider fee; swap for a real distance-based calculation later

// Our own bakery's home city — used as the "vendor city" for any item that
// isn't tied to a third-party Vendor record. Anywhere nationwide that matches
// this gets a local rider; anywhere else automatically gets a courier.
const STORE_CITY = process.env.STORE_CITY || 'Karachi';
const COURIERS = ['TCS', 'Leopards Courier', 'Trax'];
const CARGO_BASE_FEE = 150;
const CARGO_RATE_PER_KG = 120;

// Creates an order in "pending" payment state. The actual payment is confirmed
// separately via /api/payments/initiate + the gateway's webhook (see payment.controller.js).
async function createOrder(req, res, next) {
  try {
    const data = createOrderSchema.parse(req.body);
    if (!req.user && !data.guestEmail) {
      return res.status(400).json({ error: 'Guest checkout requires at least an email.' });
    }

    const productIds = data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { vendor: true },
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({ error: 'One or more products no longer exist.' });
    }

    let subtotal = 0;
    let totalWeightGrams = 0;
    const orderItemsData = data.items.map((i) => {
      const product = products.find((p) => p.id === i.productId);
      if (product.stock < i.quantity) {
        throw Object.assign(new Error(`${product.name} is out of stock.`), { status: 409 });
      }
      subtotal += product.price * i.quantity;
      totalWeightGrams += (product.weightGrams || 500) * i.quantity;
      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: i.quantity,
        isReturnable: product.isReturnable,
        brandType: product.brandType,
      };
    });

    // Brand context for the whole order — themes the Rider Portal for whoever
    // delivers it. Simplification: an order carrying any "general" marketplace
    // item is treated as a "general" order overall; a bakery-only order stays
    // "bakery". (Genuinely mixed-brand baskets could instead be split into two
    // orders — worth revisiting if that becomes a real need.)
    const brandType = products.some((p) => p.brandType === 'general') ? 'general' : 'bakery';

    // Same-city vs cross-city: compare the customer's city against each
    // item's effective vendor city (the linked Vendor's city, or our own
    // STORE_CITY for bakery items with no vendor). Any mismatch routes the
    // whole order to courier shipping — a rider can't split one delivery run
    // across two cities.
    const isCrossCity = products.some((p) => (p.vendor?.city || STORE_CITY) !== data.city);

    let shippingMethod = 'local_rider';
    let deliveryFee = DELIVERY_FEE;
    let courierFields = {};

    if (isCrossCity) {
      shippingMethod = 'courier';
      deliveryFee = 0; // replaced by cargoFee below, not a local rider fee
      const weightKg = totalWeightGrams / 1000;
      const cargoFee = Math.round(CARGO_BASE_FEE + weightKg * CARGO_RATE_PER_KG);
      const courierName = COURIERS[Math.floor(Math.random() * COURIERS.length)];
      const courierTrackingId = 'TRK' + Math.floor(100000 + Math.random() * 900000);
      courierFields = {
        cargoFee,
        courierName,
        courierTrackingId,
        courierStatus: 'booked',
        courierTrackingUrl: `https://${courierName.toLowerCase().replace(/\s/g, '')}.com/track/${courierTrackingId}`,
      };
    }

    const total = subtotal + deliveryFee + (courierFields.cargoFee || 0);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: req.user?.id,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestPhone: data.guestPhone,
          shippingAddress: data.shippingAddress,
          city: data.city,
          area: data.area,
          street: data.street,
          isRural: data.isRural || false,
          subtotal,
          deliveryFee,
          total,
          paymentMethod: data.paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'received',
          brandType,
          shippingMethod,
          ...courierFields,
          deliveryCode: generateDeliveryCode(),
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      // Reserve stock immediately to avoid overselling while payment is pending.
      for (const item of orderItemsData) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json({ order });

    // Create per-vendor fulfillment records + notify vendors of any
    // dropshipped items in this order — runs for every order regardless of
    // payment method, since the vendor needs shipping details either way.
    createThirdPartyOrdersForOrder(order.id).catch(() => {});

    // COD orders don't wait on a payment webhook to be "confirmed" — try
    // auto-dispatch right away if that mode is on. Fired after the response
    // is sent so a slow rider lookup never delays the customer's checkout.
    if (order.paymentMethod === 'cod') {
      tryAutoAssign(order.id).catch(() => {});
    }
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function getOrderByNumber(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber: req.params.orderNumber },
      include: {
        items: true,
        thirdPartyOrders: { include: { vendor: { select: { name: true, logoUrl: true } } } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Customer only ever sees dispatch/tracking + the vendor's public name/logo —
    // never cost/margin breakdown or the vendor's integration secrets.
    const thirdPartyOrders = order.thirdPartyOrders.map((tp) => ({
      vendorName: tp.vendor.name,
      vendorLogoUrl: tp.vendor.logoUrl,
      trackingId: tp.trackingId,
      courierName: tp.courierName,
      dispatchStatus: tp.dispatchStatus,
    }));

    res.json({ order: { ...order, thirdPartyOrders } });
  } catch (err) {
    next(err);
  }
}

async function myOrders(req, res, next) {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

// Customer-initiated cancellation. Only allowed before a rider has picked the
// order up. Money is never sent back externally — it's converted to Customer
// App Wallet credit (per the wallet spec), and only for logged-in customers
// who actually paid online; guest/COD orders have nothing to refund.
async function cancelOrder(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (req.user && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'This is not your order.' });
    }
    if (!['received', 'preparing'].includes(order.orderStatus)) {
      return res.status(400).json({ error: 'This order can no longer be cancelled.' });
    }

    const updated = await prisma.order.update({ where: { id: orderId }, data: { orderStatus: 'cancelled' } });

    if (order.userId && order.paymentStatus === 'paid') {
      await creditWallet('customer', order.userId, order.total, `Cancelled order ${order.orderNumber} — advance payment converted to wallet credit`, order.id);
    }

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------
async function adminListOrders(req, res, next) {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

const statusSchema = z.object({
  orderStatus: z.enum(['received', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'rejected']).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  courierStatus: z.enum(['booked', 'in_transit', 'delivered']).optional(),
});

async function updateOrderStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = statusSchema.parse(req.body);
    const order = await prisma.order.update({ where: { id }, data });
    res.json({ order });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

// Admin function to delete an order
async function deleteOrder(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.order.delete({
      where: { id: Number(id) },
    });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrderByNumber, myOrders, cancelOrder, adminListOrders, updateOrderStatus, deleteOrder };