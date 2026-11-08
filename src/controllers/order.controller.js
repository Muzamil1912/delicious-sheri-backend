const { z } = require('zod');
const prisma = require('../utils/db');
const { generateOrderNumber } = require('../utils/orderNumber');
const { generateDeliveryCode } = require('../utils/codes');
const { creditWallet } = require('../utils/wallet');
const { tryAutoAssign } = require('../utils/autoAssign');
const { createThirdPartyOrdersForOrder } = require('./thirdPartyOrder.controller');
const { asId } = require('../utils/ids');

const itemSchema = z.object({
  productId: z.union([z.string().min(1), z.number()]).transform((v) => String(v)),
  quantity: z.preprocess((val) => Number(val), z.number().int().positive()),
});

const createOrderSchema = z.object({
  items: z.array(itemSchema).min(1),
  shippingAddress: z.string().min(5),
  city: z.string().min(2),
  area: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  isRural: z.boolean().optional(),
  paymentMethod: z.enum(['visa', 'mastercard', 'debit_card', 'easypaisa', 'jazzcash', 'sadapay', 'paypal', 'payoneer', 'bitcoin', 'cod']),
  guestName: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  paymentDetails: z.any().optional(),
});

const DELIVERY_FEE = 200;
const STORE_CITY = process.env.STORE_CITY || 'Karachi';
const COURIERS = ['TCS', 'Leopards Courier', 'Trax'];
const CARGO_BASE_FEE = 150;
const CARGO_RATE_PER_KG = 120;

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

    const brandType = products.some((p) => p.brandType === 'general') ? 'general' : 'bakery';
    const isCrossCity = products.some((p) => (p.vendor?.city || STORE_CITY) !== data.city);

    let shippingMethod = 'local_rider';
    let deliveryFee = DELIVERY_FEE;
    let courierFields = {};

    if (isCrossCity) {
      shippingMethod = 'courier';
      deliveryFee = 0;
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

      for (const item of orderItemsData) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json({ order });

    createThirdPartyOrdersForOrder(order.id).catch(() => {});

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

async function cancelOrder(req, res, next) {
  try {
    const orderId = asId(req.params.id);
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
    const id = asId(req.params.id);
    const data = statusSchema.parse(req.body);
    const order = await prisma.order.update({ where: { id }, data });
    res.json({ order });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function deleteOrder(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.order.delete({
      where: { id: asId(id) },
    });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrderByNumber, myOrders, cancelOrder, adminListOrders, updateOrderStatus, deleteOrder };