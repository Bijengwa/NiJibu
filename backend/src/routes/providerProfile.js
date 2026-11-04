// The fundi's own profile for the Worker app: details, payout.
const router = require('express').Router();
const path = require('path');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validLat, validLng } = require('../lib/geo');
const { providerView } = require('../lib/providerView');
const secret = require('../lib/secret');
const { normalizeQuery } = require('../lib/text');
const { findOrCreateJob } = require('../lib/jobs');

// Old NIDA photos (from before photos were removed) stay here; only the admin can open them
const NIDA_DIR = path.join(__dirname, '../../private/nida');
const MAX_SERVICES = 5;
const NETWORKS = ['mpesa', 'mixx', 'airtel', 'halopesa'];
const EXPERIENCE = ['lt1', '1-3', '3-5', '5-10', '10+'];
const AVAILABILITY = ['weekdays', 'weekends', 'always'];

const bad = (res, msg = 'Bad request') => res.status(400).json({ error: msg, code: 'VALIDATION' });
const str = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

// Save services, work place, experience, availability (creates the provider profile if needed)
router.put('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!validLat(b.lat) || !validLng(b.lng)) return bad(res, 'Work place is required');

    // Each job has its own experience and availability. Old shape (one value for all) still works.
    const withDefaults = (i) => ({ experience: i.experience ?? b.experience, availability: i.availability ?? b.availability });
    const listed = (Array.isArray(b.services) ? b.services : []).map((i) => (typeof i === 'string' ? { key: i } : i || {}));
    const typed = (Array.isArray(b.other_jobs) ? b.other_jobs : []).map((i) => (typeof i === 'string' ? { name: i } : i || {}));

    const jobs = [];
    const seen = new Set();
    for (const i of listed) {
      if (typeof i.key !== 'string' || seen.has(i.key)) continue;
      seen.add(i.key);
      jobs.push({ key: i.key, ...withDefaults(i) });
    }
    const others = [];
    const seenNames = new Set();
    for (const i of typed) {
      // The worker writes the job in Swahili and in English. If only one is given, it is used for both.
      const sw = str(i.name_sw ?? i.name, 80)?.replace(/\s+/g, ' ');
      const en = str(i.name_en ?? i.name, 80)?.replace(/\s+/g, ' ');
      if (!sw && !en) continue;
      const name_sw = sw || en;
      const name_en = en || sw;
      const key = normalizeQuery(name_en);
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      others.push({ name: name_en, name_sw, name_en, ...withDefaults(i) });
    }
    if (!jobs.length && !others.length) return bad(res, 'Choose your services');
    if (jobs.length + others.length > MAX_SERVICES) return bad(res, 'Too many services');
    if (![...jobs, ...others].every((j) => EXPERIENCE.includes(j.experience) && AVAILABILITY.includes(j.availability))) return bad(res);

    const rows = jobs.length ? await db('services').whereIn('slug', jobs.map((j) => j.key)).where({ active: true, status: 'approved' }).select('id', 'slug') : [];
    if (rows.length !== jobs.length) return bad(res, 'Unknown service');

    await db.transaction(async (trx) => {
      const first = jobs[0] || others[0];
      let p = await trx('provider_profiles').where({ user_id: req.user.id }).first();
      const fields = {
        work_lat: b.lat, work_lng: b.lng, experience: first.experience, availability: first.availability,
        region: str(b.region, 60), district: str(b.district, 60), ward: str(b.ward, 60),
      };
      if (p) await trx('provider_profiles').where({ id: p.id }).update(fields);
      else [p] = await trx('provider_profiles').insert({ user_id: req.user.id, ...fields }).returning('*');

      const idOf = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
      await trx('provider_services').where({ provider_id: p.id }).del();
      if (jobs.length) {
        await trx('provider_services').insert(
          jobs.map((j) => ({ provider_id: p.id, service_id: idOf[j.key], experience: j.experience, availability: j.availability }))
        );
      }

      // A job typed by hand exists at once as a pending job, so the worker can use it. The admin approves,
      // merges or rejects it later. A name already in the list is simply linked. A job the admin rejected is not sent again.
      const mine = await trx('service_suggestions').where({ provider_id: p.id });
      const rejected = new Set(mine.filter((r) => r.status === 'rejected').map((r) => normalizeQuery(r.name_en || r.name)));
      await trx('service_suggestions').where({ provider_id: p.id, status: 'pending' }).del();
      // A rejected job the worker removed from his list is forgotten (he sees it until he removes it)
      const kept = new Set(others.map((o) => normalizeQuery(o.name_en)));
      const dropped = mine.filter((r) => r.status === 'rejected' && !kept.has(normalizeQuery(r.name_en || r.name))).map((r) => r.id);
      if (dropped.length) await trx('service_suggestions').whereIn('id', dropped).del();
      for (const o of others) {
        if (rejected.has(normalizeQuery(o.name_en))) continue;
        const { service } = await findOrCreateJob(trx, o);
        await trx('provider_services')
          .insert({ provider_id: p.id, service_id: service.id, experience: o.experience, availability: o.availability })
          .onConflict(['provider_id', 'service_id'])
          .ignore();
        if (service.status === 'pending') {
          const note = { name: o.name_en, name_sw: o.name_sw, name_en: o.name_en, experience: o.experience, availability: o.availability, status: 'pending', service_id: service.id };
          const old = await trx('service_suggestions').where({ provider_id: p.id }).whereRaw('lower(name) = ?', [o.name_en.toLowerCase()]).first('id');
          if (old) await trx('service_suggestions').where({ id: old.id }).update(note);
          else await trx('service_suggestions').insert({ provider_id: p.id, ...note });
        }
      }
      // Pending jobs that no worker offers any more are switched off, so customers stop finding them
      await trx.raw("update services s set active = false where s.status = 'pending' and not exists (select 1 from provider_services ps where ps.service_id = s.id)");
    });
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.put('/payout', async (req, res, next) => {
  try {
    const { network, number } = req.body || {};
    if (!NETWORKS.includes(network) || !/^\d{9}$/.test(String(number || ''))) return bad(res);
    const n = await db('provider_profiles').where({ user_id: req.user.id }).update({ payout_network: network, payout_number: String(number) });
    if (!n) return bad(res, 'Save your details first');
    // Money that was waiting for these details goes out now
    const me = await db('provider_profiles').where({ user_id: req.user.id }).first('id');
    const waiting = await db('payouts').where({ provider_id: me.id }).whereIn('status', ['pending', 'failed']).pluck('payment_id');
    for (const pid of waiting) await require('../services/payments').sendPayout(pid);
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.NIDA_DIR = NIDA_DIR;
