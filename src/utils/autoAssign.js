const prisma = require('./db');
const { emitToRider } = require('../realtime');

// Simple auto-dispatch: picks any approved, online rider who doesn't already
// have an active delivery (preparing/out_for_delivery). This is a
// "nearest free rider" approximation without real distance calculation —
// doing actual proximity matching would need live geocoding of the order
// address, which isn't wired up here. Swap this for a real distance query
// (e.g. comparing rider.lastLat/lastLng to a geocoded order address) if you
// need genuine nearest-rider logic later.
async function tryAutoAssign(orderId) {
  const settings = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  if (!settings || settings.assignmentMode !== 'auto') return null;

  const onlineRiders = await prisma.rider.findMany({ where: { status: 'approved', isOnline: true } });
  const busyRiderIds = new Set(
    (await prisma.order.findMany({
      where: { orderStatus: { in: ['preparing', 'out_for_delivery'] }, riderId: { not: null } },
      select: { riderId: true },
    })).map((o) => o.riderId)
  );
  const freeRider = onlineRiders.find((r) => !busyRiderIds.has(r.id));
  if (!freeRider) return null;

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { riderId: freeRider.id, orderStatus: 'out_for_delivery' },
  });
  emitToRider(freeRider.id, 'order:assigned', { orderId: order.id, orderNumber: order.orderNumber, autoAssigned: true });
  return freeRider;
}

module.exports = { tryAutoAssign };
