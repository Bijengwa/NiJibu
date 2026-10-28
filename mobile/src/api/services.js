import { request } from './client';

export const listServices = (token) => request('/api/services', { token });

// How many fundis are near this place for a service (also saved for the admin "no provider" report)
// quiet = a live refresh: not written to the search log (the admin gap report counts real searches only)
export const availability = (token, serviceId, { lat, lng }, quiet = false) =>
  request(`/api/services/${serviceId}/availability?lat=${lat}&lng=${lng}${quiet ? '&quiet=1' : ''}`, { token });
