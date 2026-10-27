import { request } from './client';

export const listServices = (token) => request('/api/services', { token });

// How many fundis are near this place for a service (also saved for the admin "no provider" report)
export const availability = (token, serviceId, { lat, lng }) =>
  request(`/api/services/${serviceId}/availability?lat=${lat}&lng=${lng}`, { token });
