const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { findCandidates, RADII_KM } = require('../services/dispatch');
const { validLat, validLng } = require('../lib/geo');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const items = await db('services').where({ active: true }).orderBy('name_en').select('id', 'slug', 'name_sw', 'name_en');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

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
