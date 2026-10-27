// Live updates over Socket.IO. Rooms:
//   user:{id}      - private events for one person (new offer, request accepted...)
//   request:{id}   - everyone in one job (status changes, provider location)
// If sockets are not started (tests, scripts) the emit helpers do nothing.
const { Server } = require('socket.io');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { validLat, validLng } = require('./geo');

let io = null;

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function emitToRequest(requestId, event, payload) {
  if (io) io.to(`request:${requestId}`).emit(event, payload);
}

// Is this user the customer or the assigned provider of the request?
async function isParticipant(userId, requestId) {
  const r = await db('requests')
    .leftJoin('provider_profiles as p', 'p.id', 'requests.provider_id')
    .where('requests.id', requestId)
    .first('requests.customer_id', 'p.user_id as provider_user_id');
  return !!r && (r.customer_id === userId || r.provider_user_id === userId);
}

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: false } });

  // Same rules as the HTTP API: no valid token, no connection
  io.use(async (socket, next) => {
    const user = await authenticate(socket.handshake.auth?.token);
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { id: userId } = socket.data.user;
    socket.join(`user:${userId}`);

    // Join the room of a job you belong to
    socket.on('request:join', async (requestId, ack) => {
      try {
        const id = Number(requestId);
        const ok = Number.isInteger(id) && (await isParticipant(userId, id));
        if (ok) socket.join(`request:${id}`);
        if (typeof ack === 'function') ack({ ok });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('request:leave', (requestId) => socket.leave(`request:${Number(requestId)}`));

    // Provider sends location while on the way. Only the assigned provider, only in that state.
    socket.on('provider:location', async (msg) => {
      try {
        const id = Number(msg?.request_id);
        const { lat, lng } = msg || {};
        if (!Number.isInteger(id) || !validLat(lat) || !validLng(lng)) return;
        const req = await db('requests')
          .join('provider_profiles as p', 'p.id', 'requests.provider_id')
          .where({ 'requests.id': id, 'p.user_id': userId, 'requests.status': 'on_the_way' })
          .first('p.id as provider_id');
        if (!req) return;
        await db('provider_profiles').where({ id: req.provider_id }).update({ lat, lng, last_seen: db.fn.now() });
        emitToRequest(id, 'provider:location', { request_id: id, lat, lng, at: new Date().toISOString() });
      } catch (err) {
        // a bad location message must never crash the server
      }
    });
  });

  return io;
}

module.exports = { init, emitToUser, emitToRequest };
