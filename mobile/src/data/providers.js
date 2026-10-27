// ---------------------------------------------------------------------------
// MOCK provider search. Replace the body of searchProviders() with the real API call
// (e.g. GET /api/providers?service=bomba&lat=..&lng=..) when the backend is ready.
// The screens only depend on the shape returned here:
//   { id, name, service, lat, lng, rating, jobs, distanceKm, etaMin, mock }
// ---------------------------------------------------------------------------
const NAMES = [
  'Juma Mussa', 'Amina Hassan', 'Baraka Mushi', 'Neema Mrema', 'Hamisi Selemani',
  'Rehema Mwakyusa', 'Said Kassim', 'Zawadi Komba', 'Emmanuel Lyimo', 'Fatuma Ally',
];

// Small deterministic random generator: same place + service gives the same fundis
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function searchProviders({ service, lat, lng }) {
  await new Promise((r) => setTimeout(r, 500)); // pretend network

  const rand = seeded(hash(`${service}:${lat.toFixed(2)}:${lng.toFixed(2)}`));
  const count = 6 + Math.floor(rand() * 3);

  return Array.from({ length: count }, (_, i) => {
    const angle = rand() * Math.PI * 2;
    const km = 0.3 + rand() * 2.4;
    const pLat = lat + (km * Math.cos(angle)) / 111.32;
    const pLng = lng + (km * Math.sin(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));
    const d = distanceKm(lat, lng, pLat, pLng);
    return {
      id: `${service}-${i}`,
      name: NAMES[Math.floor(rand() * NAMES.length)],
      service,
      lat: pLat,
      lng: pLng,
      rating: Math.round((40 + rand() * 10)) / 10,
      jobs: 20 + Math.floor(rand() * 300),
      distanceKm: d,
      etaMin: Math.max(3, Math.round((d / 18) * 60) + 2), // ~18 km/h in town
      mock: true,
    };
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}
