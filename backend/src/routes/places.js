// Place search for the "Where are you?" box. It uses the free OpenStreetMap search (Nominatim).
// The app talks to our server, not to OSM: we set the required User-Agent, limit the calls and keep a short cache.
// For heavy use, point PLACES_URL to your own geocoder (Photon / Nominatim) or a paid one with the same answer shape.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { validLat, validLng } = require('../lib/geo');

const BASE = process.env.PLACES_URL || 'https://nominatim.openstreetmap.org';
const UA = process.env.PLACES_USER_AGENT || 'NiJibu/1.0 (nijibu app)';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // url -> { at, data }

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 1000, max: 40, key: (req) => `places:${req.user.id}` }));

async function osm(path, params) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,sw' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Object.assign(new Error('Places unavailable'), { status: 502, code: 'PLACES_UNAVAILABLE', expose: true });
  const data = await r.json();
  if (cache.size > 500) cache.clear();
  cache.set(url, { at: Date.now(), data });
  return data;
}

// A short name for the box ("Mbezi Beach, Kinondoni") instead of the very long full address
const short = (p) => {
  const a = p.address || {};
  const first = p.name || a.road || a.neighbourhood || a.suburb || a.village || a.city_district;
  const area = a.suburb || a.neighbourhood || a.city_district || a.town || a.city || a.county;
  return [first, area && area !== first ? area : null].filter(Boolean).join(', ') || String(p.display_name || '').split(',').slice(0, 2).join(',').trim();
};
const view = (p) => ({ label: short(p), full: p.display_name, lat: Number(p.lat), lng: Number(p.lon) });

// ?q=mbezi  (&lat=&lng= puts places near the user first)
router.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    if (q.length < 3) return res.json({ items: [] });
    const params = { format: 'jsonv2', q, countrycodes: 'tz', limit: '6', addressdetails: '1' };
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (validLat(lat) && validLng(lng)) params.viewbox = [lng - 0.4, lat + 0.4, lng + 0.4, lat - 0.4].join(',');
    const rows = await osm('/search', params);
    res.json({ items: rows.map(view).filter((p) => validLat(p.lat) && validLng(p.lng)) });
  } catch (e) {
    next(e);
  }
});

// ?lat=&lng=  -> the name of the place (used after the user taps the map or uses the GPS)
router.get('/reverse', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!validLat(lat) || !validLng(lng)) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const p = await osm('/reverse', { format: 'jsonv2', lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: '17', addressdetails: '1' });
    res.json({ place: p && p.lat ? view(p) : null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
