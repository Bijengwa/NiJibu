// Route, distance and arrival time between a worker and the customer.
//   - The road path comes from an OSRM server (OSRM_URL; the public demo server is used for development only).
//   - OSRM public servers know the car profile only, so a motorbike uses the same road with its own speed factor.
//   - If the server is slow or down we fall back to a straight-line estimate, so the app always has a time to show.
const { distanceKm } = require('./geo');

const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS ?? 3500);
const VEHICLES = ['motorbike', 'car'];

// Traffic in the city: the OSRM time is for free roads. A car loses time in traffic, a motorbike much less.
const TRAFFIC = { car: Number(process.env.CAR_TRAFFIC_FACTOR ?? 1.35), motorbike: Number(process.env.BIKE_TRAFFIC_FACTOR ?? 1.0) };
// Straight-line fallback: roads are longer than the straight line, and the city speed (km/h) depends on the vehicle
const DETOUR = 1.35;
const CITY_KMH = { car: 22, motorbike: 28 };

const CACHE_MS = 20 * 1000;
const cache = new Map(); // key -> { at, value }

const vehicleOf = (v) => (VEHICLES.includes(v) ? v : 'motorbike');
const r3 = (n) => Math.round(n * 1000) / 1000; // ~110 m: good enough as a cache key and for the map

// Quick estimate with no network (used for offers and the "nearest fundi" time)
function estimate(km, vehicle) {
  const v = vehicleOf(vehicle);
  const road = km * DETOUR;
  return { distance_km: Math.round(road * 10) / 10, eta_min: Math.max(1, Math.round((road / CITY_KMH[v]) * 60)) };
}

// Keep the line short for the phone: at most ~max points, always keep the first and last
function thin(points, max = 120) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

async function fromOsrm(from, to) {
  const url = `${OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'NiJibu/1.0' } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  const r = json?.routes?.[0];
  if (json?.code !== 'Ok' || !r?.geometry?.coordinates?.length) throw new Error('OSRM no route');
  return {
    seconds: r.duration,
    km: r.distance / 1000,
    // GeoJSON is [lng, lat]; the map wants [lat, lng]
    points: thin(r.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5])),
  };
}

// -> { vehicle, distance_km, eta_min, route: [[lat,lng],...], source: 'road' | 'estimate' }
async function trip(from, to, vehicle) {
  const v = vehicleOf(vehicle);
  const key = `${v}:${r3(from.lat)},${r3(from.lng)}:${r3(to.lat)},${r3(to.lng)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value;
  try {
    const r = await fromOsrm(from, to);
    value = {
      vehicle: v,
      distance_km: Math.round(r.km * 10) / 10,
      eta_min: Math.max(1, Math.round((r.seconds * TRAFFIC[v]) / 60)),
      route: r.points,
      source: 'road',
    };
  } catch {
    const km = distanceKm(from.lat, from.lng, to.lat, to.lng);
    value = { vehicle: v, ...estimate(km, v), route: [[from.lat, from.lng], [to.lat, to.lng]], source: 'estimate' };
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) for (const k of cache.keys()) { cache.delete(k); if (cache.size <= 400) break; }
  return value;
}

module.exports = { trip, estimate, vehicleOf, VEHICLES };
