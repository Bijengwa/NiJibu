const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireProvider } = require('../middleware/provider');
const rateLimit = require('../middleware/rateLimit');
const { validLat, validLng } = require('../lib/geo');
const svc = require('../services/requests');
const payments = require('../services/payments');
const { outcomeOf } = require('../lib/outcome');

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
      .select('r.id', 'r.code', 'r.status', 'r.cancelled_by', 'r.cancel_reason', 'r.address', 'r.created_at', 'r.agreed_price as price', 'r.customer_confirmed_at', 'pay.status as payment_status', 's.slug', 's.name_sw', 's.name_en',
        // can the customer still report a problem? (a worker was assigned, inside the 7 day window)
        db.raw("(r.provider_id is not null and coalesce(r.completed_at, r.cancelled_at, r.accepted_at, r.created_at) > now() - interval '7 days') as can_complain"),
        db.raw("(select c.status from complaints c where c.request_id = r.id and c.from_user_id = r.customer_id order by c.id desc limit 1) as complaint_status"),
        db.raw("(select c.reason from complaints c where c.request_id = r.id and c.from_user_id = r.customer_id order by c.id desc limit 1) as complaint_reason"),
        db.raw("(select c.message from complaints c where c.request_id = r.id and c.from_user_id = r.customer_id order by c.id desc limit 1) as complaint_message"),
        db.raw("(select c.admin_reply from complaints c where c.request_id = r.id and c.from_user_id = r.customer_id order by c.id desc limit 1) as complaint_reply"));
    res.json({ items: items.map((r) => ({ ...r, ...outcomeOf(r) })) });
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

// Complaints of this customer (before /:id so "complaints" is not read as an id)
router.get('/complaints/mine', async (req, res, next) => {
  try {
    const c = require('../services/complaints');
    res.json({ items: await c.listMine(req.user.id, 'customer'), reasons: c.REASONS.customer, window_days: c.WINDOW_DAYS });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/complaint', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return bad(res);
    const row = await require('../services/complaints').file(req.user, 'customer', id, req.body || {});
    res.status(201).json({ complaint: row });
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
