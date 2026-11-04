const router = require('express').Router();
const path = require('path');
const db = require('../db');
const { notify } = require('../services/notify');

// Mounted behind requireAuth + requireRole('admin') in app.js

// Providers waiting for a decision (until NIDA verification is connected)
router.get('/providers', async (req, res, next) => {
  try {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const items = await db('provider_profiles as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.verification_status', status)
      .orderBy('p.created_at')
      .select('p.id', 'u.name', 'u.phone', 'p.verification_status', 'p.nida_submitted', 'p.nida_name', 'p.region', 'p.district', 'p.created_at');
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

// Private NIDA photos (admin only): kind = selfie | id
router.get('/providers/:id/nida/:kind', async (req, res, next) => {
  try {
    const p = await db('provider_profiles').where({ id: Number(req.params.id) || 0 }).first('nida_selfie_path', 'nida_id_path');
    const file = p && (req.params.kind === 'selfie' ? p.nida_selfie_path : req.params.kind === 'id' ? p.nida_id_path : null);
    if (!file) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(path.join(require('./providerProfile').NIDA_DIR, path.basename(file)));
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

// Registration fees workers paid before an identity check (what was paid, how many tries, how each try ended)
router.get('/verification-fees', async (req, res, next) => {
  try {
    const status = ['paid', 'pending', 'failed'].includes(req.query.status) ? req.query.status : null;
    const q = db('verification_fees as f').leftJoin('users as u', 'u.phone', 'f.phone')
      .orderBy('f.id', 'desc').limit(200)
      .select('f.id', 'f.phone', 'f.pay_phone', 'f.amount', 'f.status', 'f.network', 'f.reference', 'f.failure', 'f.outcome', 'f.hits', 'f.created_at', 'f.paid_at', 'u.name');
    if (status) q.where('f.status', status);
    const [items, totals, byPhone] = await Promise.all([
      q,
      db('verification_fees').select(
        db.raw("count(*) filter (where status = 'paid')::int as paid"),
        db.raw("coalesce(sum(amount) filter (where status = 'paid'), 0)::int as collected"),
        db.raw("count(*) filter (where status = 'pending')::int as pending"),
        db.raw("count(*) filter (where status = 'failed')::int as failed"),
        db.raw("count(*) filter (where status = 'paid' and outcome = 'passed')::int as passed"),
        db.raw("count(*) filter (where status = 'paid' and outcome = 'failed')::int as failed_checks")
      ).first(),
      db('verification_fees').where({ status: 'paid' }).groupBy('phone').select('phone', db.raw('count(*)::int as tries')),
    ]);
    const tries = new Map(byPhone.map((r) => [r.phone, r.tries]));
    res.json({ totals, items: items.map((i) => ({ ...i, tries_by_phone: tries.get(i.phone) || 0 })) });
  } catch (err) {
    next(err);
  }
});

router.use(require('./adminJobs')); // jobs registry + dashboard summary
router.use(require('./adminUsers')); // people: customers and service providers

module.exports = router;
