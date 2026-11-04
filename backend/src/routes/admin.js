const router = require('express').Router();
const db = require('../db');
const { notify } = require('../services/notify');
const { SUPER, supportMay } = require('../lib/roles');

// Mounted behind requireAuth + requireRole(...STAFF) in app.js.
// Superadmin may call everything. Customer care (support) may call only the list in lib/roles.js.
router.use((req, res, next) => {
  if (req.user.role === SUPER || supportMay(req.method, req.path)) return next();
  res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
});

// Providers by status
router.get('/providers', async (req, res, next) => {
  try {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const items = await db('provider_profiles as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.verification_status', status)
      .orderBy('p.created_at')
      .select('p.id', 'u.name', 'u.phone', 'p.verification_status', 'p.registered_at', 'p.region', 'p.district', 'p.created_at');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

const decide = (status) => async (req, res, next) => {
  try {
    const reason = status === 'rejected' && typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) || null : null;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const [p] = await db('provider_profiles')
      .where({ id })
      .update({ verification_status: status, verified_at: status === 'verified' ? db.fn.now() : null, rejection_reason: reason, ...(status === 'verified' ? {} : { is_online: false }) })
      .returning(['id', 'user_id']);
    if (!p) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    await notify(
      p.user_id,
      status === 'verified' ? 'provider_verified' : 'provider_rejected',
      status === 'verified' ? 'You are verified' : 'Verification not accepted',
      status === 'verified' ? 'You can now go online and receive requests.' : 'Your provider verification was not accepted.'
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
router.post('/providers/:id/verify', decide('verified'));
router.post('/providers/:id/reject', decide('rejected'));

// Demand without supply: services customers searched where no provider was near
router.get('/search-gaps', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const items = await db('search_logs as l')
      .join('services as s', 's.id', 'l.service_id')
      .where('l.created_at', '>=', since)
      .groupBy('s.id', 's.name_sw', 's.name_en')
      .select(
        's.id', 's.name_sw', 's.name_en',
        db.raw('count(*)::int as searches'),
        db.raw('count(*) filter (where l.providers_found = 0)::int as searches_without_provider')
      )
      .havingRaw('count(*) filter (where l.providers_found = 0) > 0')
      .orderBy('searches_without_provider', 'desc');
    res.json({ days, items });
  } catch (err) {
    next(err);
  }
});

// Jobs (register, edit, worker suggestions, missing searches): adminJobs.js

// Requests and payments (lists, one request in full, money totals): adminRequests.js
router.use(require('./adminRequests'));

// Try a payout again (failed, or waiting because the fundi had no payout number)
router.post('/payouts/:id/retry', async (req, res, next) => {
  try {
    const po = await db('payouts').where({ id: Number(req.params.id) }).first();
    if (!po) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const out = await require('../services/payments').sendPayout(po.payment_id);
    res.json({ payout: out });
  } catch (err) {
    next(err);
  }
});

// The admin paid the worker by hand (Selcom payouts are not connected yet): record it and send the "we paid you" SMS
router.post('/payouts/:id/mark-sent', async (req, res, next) => {
  try {
    const out = await require('../services/payments').markPayoutSent(Number(req.params.id), req.body?.reference);
    res.json({ payout: out });
  } catch (err) {
    next(err);
  }
});

// Live signal: the portal listens here and reloads when anything changes
router.get('/events', (req, res) => require('../lib/adminEvents').add(res));

// Complaints from customers and workers (one table). Answer with a status and a reply.
router.get('/complaints', async (req, res, next) => {
  try {
    const complaints = require('../services/complaints');
    const [items, counts] = await Promise.all([complaints.adminList(req.query), complaints.counts()]);
    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
});

router.post('/complaints/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    await require('../services/complaints').answer(req.user.id, id, { status: req.body?.status, reply: req.body?.reply, resend: req.body?.resend === true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Registration fees workers paid (what was paid and whether it went through)
router.get('/registration-fees', async (req, res, next) => {
  try {
    const status = ['paid', 'pending', 'failed'].includes(req.query.status) ? req.query.status : null;
    const q = db('registration_fees as f').leftJoin('users as u', 'u.phone', 'f.phone')
      .orderBy('f.id', 'desc').limit(200)
      .select('f.id', 'f.phone', 'f.pay_phone', 'f.amount', 'f.status', 'f.network', 'f.reference', 'f.failure', 'f.created_at', 'f.paid_at', 'u.name');
    if (status) q.where('f.status', status);
    const [items, totals] = await Promise.all([
      q,
      db('registration_fees').select(
        db.raw("count(*) filter (where status = 'paid')::int as paid"),
        db.raw("coalesce(sum(amount) filter (where status = 'paid'), 0)::int as collected"),
        db.raw("count(*) filter (where status = 'pending')::int as pending"),
        db.raw("count(*) filter (where status = 'failed')::int as failed")
      ).first(),
    ]);
    res.json({ totals, items });
  } catch (err) {
    next(err);
  }
});

// Outside services: what we use and what it costs (adminServices.js)
router.use('/services', require('./adminServices'));

router.use(require('./adminMoney')); // money in parts + price data
router.use(require('./adminStaff')); // staff accounts (superadmin only through the gate above)
router.use(require('./adminSeries')); // numbers over time for the charts
router.use(require('./adminJobs')); // jobs registry + home summary
router.use(require('./adminUsers')); // people: customers and service providers

module.exports = router;
