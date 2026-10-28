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

// ---- Jobs typed by fundis that are not in the list yet (the admin puts them in, in one spelling) ----

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const cleanName = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= 80 ? v.trim().replace(/\s+/g, ' ') : null);

// Same job written by many fundis is grouped (case does not matter), most asked first
router.get('/suggestions', async (req, res, next) => {
  try {
    const status = ['pending', 'added', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = await db('service_suggestions as g')
      .join('provider_profiles as p', 'p.id', 'g.provider_id')
      .join('users as u', 'u.id', 'p.user_id')
      .where('g.status', status)
      .orderBy('g.created_at')
      .select('g.id', 'g.name', 'g.experience', 'g.availability', 'g.created_at', 'p.id as provider_id', 'u.name as provider_name', 'u.phone');
    const groups = new Map();
    for (const r of rows) {
      const k = r.name.toLowerCase();
      if (!groups.has(k)) groups.set(k, { name: r.name, count: 0, first_id: r.id, providers: [] });
      const g = groups.get(k);
      g.count += 1;
      g.providers.push({ suggestion_id: r.id, provider_id: r.provider_id, name: r.provider_name, phone: r.phone, experience: r.experience, availability: r.availability });
    }
    res.json({ items: [...groups.values()].sort((a, b) => b.count - a.count) });
  } catch (err) {
    next(err);
  }
});

// Put the job in the list. Every pending suggestion with the same name is linked to the new job,
// with the experience and availability the fundi gave.
router.post('/suggestions/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name_sw = cleanName(req.body?.name_sw);
    const name_en = cleanName(req.body?.name_en);
    if (!Number.isInteger(id) || !name_sw || !name_en) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const slug = slugify(req.body?.slug || name_en);
    if (!slug) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });

    const linked = [];
    await db.transaction(async (trx) => {
      const s = await trx('service_suggestions').where({ id, status: 'pending' }).first();
      if (!s) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      let service = await trx('services').where({ slug }).first();
      if (!service) [service] = await trx('services').insert({ slug, name_sw, name_en }).returning('*');
      const same = await trx('service_suggestions').where({ status: 'pending' }).whereRaw('lower(name) = ?', [s.name.toLowerCase()]);
      for (const g of same) {
        await trx('provider_services')
          .insert({ provider_id: g.provider_id, service_id: service.id, experience: g.experience, availability: g.availability })
          .onConflict(['provider_id', 'service_id'])
          .ignore();
        await trx('service_suggestions').where({ id: g.id }).update({ status: 'added', service_id: service.id, handled_at: db.fn.now() });
        linked.push(g.provider_id);
      }
    });
    const users = await db('provider_profiles').whereIn('id', linked).pluck('user_id');
    for (const uid of users) await notify(uid, 'job_added', 'Your job was added', 'The job you wrote is now in the list and linked to your profile.');
    res.json({ ok: true, providers_linked: linked.length });
  } catch (err) {
    next(err);
  }
});

router.post('/suggestions/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const s = await db('service_suggestions').where({ id, status: 'pending' }).first();
    if (!s) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const same = await db('service_suggestions').where({ status: 'pending' }).whereRaw('lower(name) = ?', [s.name.toLowerCase()]);
    await db('service_suggestions').whereIn('id', same.map((g) => g.id)).update({ status: 'rejected', handled_at: db.fn.now() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Add a job to the list directly (no suggestion needed)
router.post('/services', async (req, res, next) => {
  try {
    const name_sw = cleanName(req.body?.name_sw);
    const name_en = cleanName(req.body?.name_en);
    const slug = slugify(req.body?.slug || name_en || '');
    if (!name_sw || !name_en || !slug) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const [service] = await db('services').insert({ slug, name_sw, name_en }).returning('*'); // duplicate slug -> 409
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

// ---- Where the requests are: every request with who was offered it and who answered ----
router.get('/requests', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const q = db('requests as r')
      .join('users as c', 'c.id', 'r.customer_id')
      .join('services as s', 's.id', 'r.service_id')
      .leftJoin('provider_profiles as p', 'p.id', 'r.provider_id')
      .leftJoin('users as pu', 'pu.id', 'p.user_id')
      .orderBy('r.created_at', 'desc')
      .limit(limit)
      .select(
        'r.id', 'r.status', 'r.address', 'r.note', 'r.lat', 'r.lng', 'r.search_radius_km', 'r.created_at', 'r.accepted_at', 'r.completed_at',
        'r.cancelled_by', 'r.cancel_reason', 's.name_en as service', 'c.name as customer_name', 'c.phone as customer_phone',
        'pu.name as provider_name', 'pu.phone as provider_phone'
      );
    if (status) q.where('r.status', status);
    const items = await q;
    const offers = items.length
      ? await db('request_offers as o')
          .join('provider_profiles as p', 'p.id', 'o.provider_id')
          .join('users as u', 'u.id', 'p.user_id')
          .whereIn('o.request_id', items.map((r) => r.id))
          .orderBy('o.created_at')
          .select('o.request_id', 'o.status', 'o.distance_km', 'o.created_at', 'u.name', 'u.phone')
      : [];
    res.json({
      items: items.map((r) => ({
        ...r,
        offers: offers.filter((o) => o.request_id === r.id).map(({ request_id, distance_km, ...o }) => ({ ...o, distance_km: Math.round(distance_km * 10) / 10 })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
