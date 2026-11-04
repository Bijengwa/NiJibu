const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { findCandidates, RADII_KM } = require('../services/dispatch');
const { validLat, validLng } = require('../lib/geo');
const { normalizeQuery } = require('../lib/text');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    // status 'pending' = a job a worker wrote that the admin has not approved yet (apps do not list it, but a customer who types its name finds it)
    const items = await db('services').where({ active: true }).orderBy('name_en').select('id', 'slug', 'name_sw', 'name_en', 'aliases', 'status');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// The customer typed a job and nothing matched. Saved so the admin can add the job or link the word to a job.
router.post(
  '/misses',
  rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => `miss:${req.user.id}` }),
  async (req, res, next) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
      const normalized = normalizeQuery(query);
      if (normalized.length < 2) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      const hasLoc = validLat(lat) && validLng(lng);

      // Already a job or a known word: not a miss
      const services = await db('services').where({ active: true }).select('slug', 'name_sw', 'name_en', 'aliases');
      const known = services.some((s) => [s.slug, s.name_sw, s.name_en, ...(s.aliases || [])].some((w) => normalizeQuery(w) === normalized));
      if (known) return res.json({ ok: true, matched: true });

      // The same person sending the same word twice within a minute counts once (typing pauses). Later tries count:
      // a customer who searches again and again is a customer the first search failed.
      const dup = await db('search_misses')
        .where({ user_id: req.user.id, normalized })
        .where('created_at', '>=', new Date(Date.now() - 60 * 1000))
        .first('id');
      if (!dup) await db('search_misses').insert({ user_id: req.user.id, query, normalized, lat: hasLoc ? lat : null, lng: hasLoc ? lng : null });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// The customer picked a service on the map: how many providers are near?
// Every call is also saved in search_logs so admin can see where there is demand but no provider.
router.get(
  '/:id/availability',
  rateLimit({ windowMs: 60 * 1000, max: 30, key: (req) => `avail:${req.user.id}` }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isInteger(id) || !validLat(lat) || !validLng(lng)) {
        return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
      }
      const service = await db('services').where({ id, active: true }).first('id');
      if (!service) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

      const found = await findCandidates(db, {
        serviceId: id, lat, lng, radiusKm: RADII_KM[RADII_KM.length - 1], customerId: req.user.id,
      });
      if (req.query.quiet !== '1') await db('search_logs').insert({ user_id: req.user.id, service_id: id, lat, lng, providers_found: found.length });

      // Pins for the map: only blurred positions (about 100 m), no ids, no names
      const blur = (v) => Math.round(v * 1000) / 1000;
      res.json({
        providers_nearby: found.length,
        nearest_km: found.length ? Math.round(found[0].distance_km * 10) / 10 : null,
        nearest_eta_min: found.length ? Math.max(1, Math.round((found[0].distance_km / 20) * 60)) : null,
        pins: found.slice(0, 30).map((p, i) => ({ id: `p${i}`, lat: blur(p.lat), lng: blur(p.lng) })),
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
