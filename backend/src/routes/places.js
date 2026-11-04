// Place search for the "Where are you?" box.
// PLACES_PROVIDER=osm (default): free OpenStreetMap search (Nominatim).
// PLACES_PROVIDER=google: Google Places (Text Search) and Google Geocoding. Needs GOOGLE_MAPS_SERVER_KEY (a server key,
//   limited to this server's IP address and to the Places API (New) + Geocoding API). If Google fails, OSM answers.
//   GOOGLE RULE: Google place and address results may only be shown on a GOOGLE map. Do not turn this on while the apps
//   still draw the OpenStreetMap (Leaflet) map; first move the app maps to Google Maps.
// OpenStreetMap search (Nominatim) details:
// The app talks to our server, not to OSM: we set the required User-Agent, limit the calls and keep a short cache.
// For heavy use, point PLACES_URL to your own geocoder (Photon / Nominatim) or a paid one with the same answer shape.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { validLat, validLng } = require('../lib/geo');
const usage = require('../lib/usage');

const googleKey = () => process.env.GOOGLE_MAPS_SERVER_KEY;
const useGoogle = () => process.env.PLACES_PROVIDER === 'google' && !!googleKey();

const BASE = process.env.PLACES_URL || 'https://nominatim.openstreetmap.org';
const UA = process.env.PLACES_USER_AGENT || 'NiJibu/1.0 (nijibu app)';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // url -> { at, data }

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 1000, max: 40, key: (req) => `places:${req.user.id}` }));

async function osm(path, params) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const op = path === '/reverse' ? 'places_reverse' : 'places_search';
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    usage.record({ service: 'osm', operation: op, cached: true });
    return hit.data;
  }
  const t0 = Date.now();
  const unavailable = () => Object.assign(new Error('Places unavailable'), { status: 503, code: 'PLACES_UNAVAILABLE', expose: true });
  let r;
  try {
    r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,sw' }, signal: AbortSignal.timeout(Number(process.env.PLACES_TIMEOUT_MS ?? 6000)) });
  } catch (e) {
    console.warn('[places] provider did not answer:', e.name); // one short line, not a stack dump
    usage.record({ service: 'osm', operation: op, ok: false, ms: Date.now() - t0 });
    if (hit) return hit.data; // an old answer is better than an error
    throw unavailable();
  }
  if (!r.ok) {
    usage.record({ service: 'osm', operation: op, ok: false, ms: Date.now() - t0 });
    if (hit) return hit.data;
    throw unavailable();
  }
  usage.record({ service: 'osm', operation: op, ms: Date.now() - t0 });
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

// ---- Google ----
// op = the name used on the admin Services page (so every Google call is counted and priced)
async function google(url, init, cacheKey, op) {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    usage.record({ service: 'google_maps', operation: op, cached: true });
    return hit.data;
  }
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    usage.record({ service: 'google_maps', operation: op, ok: false, ms: Date.now() - t0 });
    throw e;
  }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.error || (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status))) {
    usage.record({ service: 'google_maps', operation: op, ok: false, ms: Date.now() - t0 });
    throw new Error(data?.error?.message || data?.error_message || data?.status || `HTTP ${r.status}`);
  }
  usage.record({ service: 'google_maps', operation: op, ms: Date.now() - t0 });
  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

async function googleSearch(q, lat, lng) {
  const body = { textQuery: q, regionCode: 'TZ', languageCode: 'en', maxResultCount: 6 };
  if (validLat(lat) && validLng(lng)) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } };
  const data = await google(
    'https://places.googleapis.com/v1/places:searchText',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' }, body: JSON.stringify(body) },
    `g:search:${q}:${lat?.toFixed?.(2)}:${lng?.toFixed?.(2)}`,
    'places_text_search'
  );
  return (data.places || []).map((p) => {
    const name = p.displayName?.text || '';
    const addr = String(p.formattedAddress || '');
    const area = addr.split(',').slice(0, 2).join(',').trim();
    return { label: name && !addr.startsWith(name) ? `${name}, ${area.split(',')[0]}` : area || name, full: addr || name, lat: p.location?.latitude, lng: p.location?.longitude, place_id: p.id };
  });
}

async function googleReverse(lat, lng) {
  const params = new URLSearchParams({ latlng: `${lat.toFixed(5)},${lng.toFixed(5)}`, language: 'en', key: googleKey() });
  const data = await google(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {}, `g:rev:${lat.toFixed(4)}:${lng.toFixed(4)}`, 'geocode_reverse');
  const g = data.results?.[0];
  if (!g) return null;
  const part = (type) => g.address_components?.find((c) => c.types.includes(type))?.long_name;
  const first = part('route') || part('neighborhood') || part('sublocality') || part('locality');
  const area = part('sublocality') || part('neighborhood') || part('locality');
  return { label: [first, area && area !== first ? area : null].filter(Boolean).join(', ') || g.formatted_address, full: g.formatted_address, lat: g.geometry?.location?.lat ?? lat, lng: g.geometry?.location?.lng ?? lng };
}

// ?q=mbezi  (&lat=&lng= puts places near the user first)
router.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    if (q.length < 3) return res.json({ items: [] });
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (useGoogle()) {
      try {
        const items = await googleSearch(q, lat, lng);
        return res.json({ items: items.filter((p) => validLat(p.lat) && validLng(p.lng)) });
      } catch (e) {
        console.warn('[places] Google search failed, using OpenStreetMap:', e.message);
      }
    }
    const params = { format: 'jsonv2', q, countrycodes: 'tz', limit: '6', addressdetails: '1' };
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
    if (useGoogle()) {
      try {
        return res.json({ place: await googleReverse(lat, lng) });
      } catch (e) {
        console.warn('[places] Google reverse failed, using OpenStreetMap:', e.message);
      }
    }
    const p = await osm('/reverse', { format: 'jsonv2', lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: '17', addressdetails: '1' });
    res.json({ place: p && p.lat ? view(p) : null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
