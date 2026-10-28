import { request } from './client';

// Place names for "Where are you?" (the server asks the free OpenStreetMap search; works only in Tanzania).
//   searchPlaces -> { items: [{ label, full, lat, lng }] }      reversePlace -> { place: {...} | null }
export const searchPlaces = (token, q, near) =>
  request(`/api/places/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ''}`, { token, timeout: 10000 });

export const reversePlace = (token, { lat, lng }) => request(`/api/places/reverse?lat=${lat}&lng=${lng}`, { token, timeout: 10000 });
