// ---------------------------------------------------------------------------
// REAL-TIME LAYER (Socket.IO)
// ---------------------------------------------------------------------------
// Three logical channels, all over one Socket.IO server:
//   - "admin" room       -> every open Odin Control Alpha admin panel joins this.
//                           Receives: rider:location, sos:new, sos:resolved,
//                           order:status-changed.
//   - "rider:<riderId>"  -> a specific rider's browser tab joins this on login.
//                           Receives: order:assigned, order:transferred, sos:ack.
//   - "customer:<orderNumber>" -> a customer tracking a specific order joins this.
//                           Receives: order:status-changed (for that order only).
//
// This file exports a single `initRealtime(httpServer)` called once from
// server.js, plus small helper emitters used by the controllers.
// ---------------------------------------------------------------------------

const { Server } = require('socket.io');

let io = null;

function initRealtime(httpServer) {
  const allowedOrigins = [process.env.CUSTOMER_URL, process.env.ADMIN_URL, process.env.RIDER_URL].filter(Boolean);
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('join:admin', () => socket.join('admin'));
    socket.on('join:rider', (riderId) => socket.join(`rider:${riderId}`));
    socket.on('join:order', (orderNumber) => socket.join(`customer:${orderNumber}`));

    // Rider's browser streams its own GPS position while an order is active.
    // Broadcast straight to the admin room — this is what powers the live map.
    socket.on('rider:location', ({ riderId, lat, lng }) => {
      io.to('admin').emit('rider:location', { riderId, lat, lng, at: Date.now() });
    });

    socket.on('disconnect', () => {
      // Optionally: mark rider offline after a grace period. Kept simple here —
      // the rider's own explicit "going offline" action (or next location ping
      // timeout) is what the admin dashboard should really key off of.
    });
  });

  return io;
}

function emitToAdmin(event, payload) {
  if (io) io.to('admin').emit(event, payload);
}

function emitToRider(riderId, event, payload) {
  if (io) io.to(`rider:${riderId}`).emit(event, payload);
}

function emitToOrderWatchers(orderNumber, event, payload) {
  if (io) io.to(`customer:${orderNumber}`).emit(event, payload);
}

module.exports = { initRealtime, emitToAdmin, emitToRider, emitToOrderWatchers };
