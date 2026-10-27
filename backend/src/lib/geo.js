// Distance in km between two points (haversine).
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// A square around a point, for a fast first filter in the database.
function boundingBox(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

const validLat = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
const validLng = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;

module.exports = { distanceKm, boundingBox, validLat, validLng };
