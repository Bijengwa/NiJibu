const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireProvider } = require('../middleware/provider');
const rateLimit = require('../middleware/rateLimit');
const { validLat, validLng } = require('../lib/geo');
const { offerView, ACTIVE_JOB } = require('../services/dispatch');

const MAX_SERVICES = 5;

router.use(requireAuth);

const bad = (res, msg = 'Bad request') => res.status(400).json({ error: msg, code: 'VALIDATION' });

// Valid service ids from the body: 1 to MAX_SERVICES, all real and active. Returns array or null.
async function readServiceIds(body) {
  const ids = [...new Set((Array.isArray(body?.service_ids) ? body.service_ids : []).map(Number))];
  if (!ids.length || ids.length > MAX_SERVICES || !ids.every(Number.isInteger)) return null;
  const found = await db('services').whereIn('id', ids).where({ active: true }).pluck('id');
  return found.length === ids.length ? ids : null;
}

// A normal user becomes a provider: pick services from the list. Status stays "pending"
// until verification (NIDA) or an admin approves. The app can never set "verified" itself.
router.post('/apply', async (req, res, next) => {
  try {
    const me = await db('users').where({ id: req.user.id }).first('name');
    if (!me.name) return res.status(400).json({ error: 'Complete your profile first', code: 'PROFILE_INCOMPLETE' });

    const ids = await readServiceIds(req.body);
    if (!ids) return bad(res, `Choose 1 to ${MAX_SERVICES} services from the list`);

    await db.transaction(async (trx) => {
      let profile = await trx('provider_profiles').where({ user_id: req.user.id }).first();
      if (!profile) [profile] = await trx('provider_profiles').insert({ user_id: req.user.id }).returning('*');
      await trx('provider_services').where({ provider_id: profile.id }).del();
      await trx('provider_services').insert(ids.map((service_id) => ({ provider_id: profile.id, service_id })));
    });
    res.status(201).json({ ok: true, verification_status: (await db('provider_profiles').where({ user_id: req.user.id }).first()).verification_status });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const profile = await db('provider_profiles').where({ user_id: req.user.id }).first();
    if (!profile) return res.json({ provider: null });
    const services = await db('provider_services as ps')
      .join('services as s', 's.id', 'ps.service_id')
      .where('ps.provider_id', profile.id)
      .select('s.id', 's.name_sw', 's.name_en');
    const job = await db('requests').where({ provider_id: profile.id }).whereIn('status', ACTIVE_JOB).first('id');
    res.json({
      provider: {
        verification_status: profile.verification_status,
        is_online: profile.is_online,
        lat: profile.lat,
        lng: profile.lng,
        services,
        active_request_id: job ? job.id : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.use(requireProvider);

// Go live. A location is required: customers find you by where you are.
router.post('/online', async (req, res, next) => {
  try {
    const { lat, lng } = req.body || {};
    if (!validLat(lat) || !validLng(lng)) return bad(res, 'Location is required');
    await db('provider_profiles').where({ id: req.provider.id }).update({ is_online: true, lat, lng, last_seen: db.fn.now() });
    res.json({ ok: true, is_online: true });
  } catch (err) {
    next(err);
  }
});

router.post('/offline', async (req, res, next) => {
  try {
    await db('provider_profiles').where({ id: req.provider.id }).update({ is_online: false });
    res.json({ ok: true, is_online: false });
  } catch (err) {
    next(err);
  }
});

// Heartbeat + position (REST fallback; during a job the app uses the socket)
router.post(
  '/location',
  rateLimit({ windowMs: 60 * 1000, max: 60, key: (req) => `loc:${req.user.id}` }),
  async (req, res, next) => {
    try {
      const { lat, lng } = req.body || {};
      if (!validLat(lat) || !validLng(lng)) return bad(res, 'Location is required');
      await db('provider_profiles').where({ id: req.provider.id }).update({ lat, lng, last_seen: db.fn.now() });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Offers waiting for this provider (so the app can show them after opening or reconnecting)
router.get('/offers', async (req, res, next) => {
  try {
    const rows = await db('request_offers as o')
      .join('requests as r', 'r.id', 'o.request_id')
      .join('services as s', 's.id', 'r.service_id')
      .where({ 'o.provider_id': req.provider.id, 'o.status': 'sent', 'r.status': 'searching' })
      .where('o.expires_at', '>', new Date())
      .orderBy('o.created_at')
      .select('o.*', 'r.address', 's.id as s_id', 's.slug', 's.name_sw', 's.name_en');
    res.json({
      items: rows.map((o) => offerView(o, { id: o.s_id, slug: o.slug, name_sw: o.name_sw, name_en: o.name_en }, o)),
    });
  } catch (err) {
    next(err);
  }
});

// My current or last jobs
router.get('/jobs', async (req, res, next) => {
  try {
    const items = await db('requests as r')
      .join('services as s', 's.id', 'r.service_id')
      .join('users as cu', 'cu.id', 'r.customer_id')
      .where('r.provider_id', req.provider.id)
      .orderBy('r.created_at', 'desc')
      .limit(30)
      .select('r.id', 'r.status', 'r.address', 'r.created_at', 'r.completed_at', 'cu.name as customer_name', 's.slug', 's.name_sw', 's.name_en');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
