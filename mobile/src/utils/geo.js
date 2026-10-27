// Distance in km between two points, and a rough drive time for the live "arrives in" text.
export function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const CITY_SPEED_KMH = 20;
export const etaMinutes = (km) => Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60));
