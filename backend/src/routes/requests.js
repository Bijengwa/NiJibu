const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireProvider } = require('../middleware/provider');
const rateLimit = require('../middleware/rateLimit');
const { validLat, validLng } = require('../lib/geo');
const svc = require('../services/requests');
const payments = require('../services/payments');

router.use(requireAuth);

const bad = (res) => res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
const idOf = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Customer: ask for a service at a place
router.post(
  '/',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 8, key: (req) => `req:${req.user.id}` }),
  async (req, res, next) => {
    try {
      const { service_id, lat, lng } = req.body || {};
      if (!Number.isInteger(service_id) || !validLat(lat) || !validLng(lng)) return bad(res);
      const id = await svc.createRequest(req.user, {
        service_id, lat, lng, address: text(req.body.address, 200), note: text(req.body.note, 300),
      });
      res.status(201).json({ request: await svc.loadView(req.user, id) });
    } catch (err) {
      next(err);
    }
  }
);

// My requests as a customer (Activity tab)
router.get('/', async (req, res, next) => {
  try {
    const items = await db('requests as r')
      .join('services as s', 's.id', 'r.service_id')
      .leftJoin('payments as pay', 'pay.request_id', 'r.id')
      .where('r.customer_id', req.user.id)
      .orderBy('r.created_at', 'desc')
      .limit(30)
      .select('r.id', 'r.status', 'r.address', 'r.created_at', 'r.agreed_price as price', 'r.customer_confirmed_at', 'pay.status as payment_status', 's.slug', 's.name_sw', 's.name_en');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// The open request of this customer, if any (to restore the screen when the app reopens)
router.get('/open', async (req, res, next) => {
  try {
    const r =
      (await db('requests')
        .where({ customer_id: req.user.id })
        .whereIn('status', ['searching', 'accepted', 'on_the_way', 'arrived', 'in_progress'])
        .first('id')) || (await svc.unpaidJobOf(req.user.id)); // a finished job still waiting for payment stays open
    res.json({ request: r ? await svc.loadView(req.user, r.id) : null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return bad(res);
    const view = await svc.loadView(req.user, id);
    if (!view) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.json({ request: view });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return bad(res);
    await svc.cancelRequest(req.user, id, req.body?.reason);
    res.json({ request: await svc.loadView(req.user, id) });
  } catch (err) {
    next(err);
  }
});

// Customer: confirm that the work is done (then pay)
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return bad(res);
    await svc.confirmWork(req.user, id);
    res.json({ request: await svc.loadView(req.user, id) });
  } catch (err) {
    next(err);
  }
});

// Customer: pay the price of a finished job (NiJibu keeps the commission, the fundi gets the rest)
router.post(
  '/:id/pay',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => `pay:${req.user.id}` }),
  async (req, res, next) => {
    try {
      const id = idOf(req);
      if (!id) return bad(res);
      await payments.payRequest(req.user, id, { network: req.body?.network, phone: req.body?.phone });
      res.json({ request: await svc.loadView(req.user, id) });
    } catch (err) {
      next(err);
    }
  }
);

// Provider: move the job forward
router.post('/:id/:stage', requireProvider, async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return bad(res);
    await svc.moveStage(req.user, id, req.params.stage, req.body || {});
    res.json({ request: await svc.loadView(req.user, id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
