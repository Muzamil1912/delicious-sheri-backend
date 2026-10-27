const prisma = require('./db');
const logger = console;

// POSTs the customer's shipping details + SKU to a vendor's own webhook the
// moment an order containing their product is placed — this is the
// "automatically send shipping details to the third-party" requirement.
// Uses the vendor's own webhookUrl (configured in Admin → Vendors); if it's
// not set, this just logs and marks the notification as failed rather than
// throwing, since a missing webhook shouldn't block order creation.
async function notifyVendorOfOrder(thirdPartyOrderId) {
  const tpOrder = await prisma.thirdPartyOrder.findUnique({
    where: { id: thirdPartyOrderId },
    include: {
      vendor: true,
      order: { include: { items: { include: { product: true } } } },
    },
  });
  if (!tpOrder) return;

  if (!tpOrder.vendor.webhookUrl) {
    await prisma.thirdPartyOrder.update({ where: { id: thirdPartyOrderId }, data: { vendorNotifyStatus: 'failed' } });
    logger.warn(`Vendor ${tpOrder.vendor.name} has no webhookUrl configured — skipping fulfillment notification.`);
    return;
  }

  const order = tpOrder.order;
  const vendorItems = order.items.filter((i) => i.product?.vendorId === tpOrder.vendorId);

  const payload = {
    orderNumber: order.orderNumber,
    customerName: order.guestName,
    customerPhone: order.guestPhone,
    shippingAddress: order.shippingAddress,
    city: order.city,
    area: order.area,
    street: order.street,
    items: vendorItems.map((i) => ({ sku: i.product?.externalSku || String(i.productId), name: i.name, quantity: i.quantity })),
  };

  try {
    const res = await fetch(tpOrder.vendor.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await prisma.thirdPartyOrder.update({
      where: { id: thirdPartyOrderId },
      data: { vendorNotifiedAt: new Date(), vendorNotifyStatus: res.ok ? 'sent' : 'failed' },
    });
  } catch (err) {
    logger.error(`Failed to notify vendor ${tpOrder.vendor.name}:`, err.message);
    await prisma.thirdPartyOrder.update({ where: { id: thirdPartyOrderId }, data: { vendorNotifyStatus: 'failed' } });
  }
}

module.exports = { notifyVendorOfOrder };
