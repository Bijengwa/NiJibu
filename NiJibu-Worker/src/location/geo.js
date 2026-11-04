import * as Location from 'expo-location';

// Location helpers. Errors carry a code that is also a translation key.
export class LocationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const toCoords = (p) => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) });

// Asks for permission (the first time) and returns the current position
export async function getCoords() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new LocationError('LOCATION_DENIED');
  try {
    // A position from the last 2 minutes is good enough and instant
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 300 }).catch(() => null);
    if (last) return toCoords(last);
    return toCoords(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  } catch {
    throw new LocationError('LOCATION_UNAVAILABLE');
  }
}

// Calls onChange when the fundi moves (default every 15 s or 50 m). Returns { remove() }.
export const watchCoords = (onChange, { timeInterval = 15000, distanceInterval = 50 } = {}) =>
  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval, distanceInterval },
    (p) => onChange(toCoords(p))
  );

// Google Maps links and the embedded map (no API key needed)
export const mapsUrl = (c) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
export const directionsUrl = (c) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
export const embedUrl = (c) => `https://maps.google.com/maps?q=${c.lat},${c.lng}&z=16&output=embed`;
