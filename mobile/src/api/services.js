import { request } from './client';

export const listServices = (token) => request('/api/services', { token });

// The customer typed a job and nothing matched: the admin sees it as demand for a job we do not have yet
export const reportMiss = (token, query, coords) =>
  request('/api/services/misses', { method: 'POST', token, body: { query, lat: coords?.lat, lng: coords?.lng } });

// How many fundis are near this place for a service (also saved for the admin "no provider" report)
// quiet = a live refresh: not written to the search log (the admin gap report counts real searches only)
export const availability = (token, serviceId, { lat, lng }, quiet = false) =>
  request(`/api/services/${serviceId}/availability?lat=${lat}&lng=${lng}${quiet ? '&quiet=1' : ''}`, { token });
