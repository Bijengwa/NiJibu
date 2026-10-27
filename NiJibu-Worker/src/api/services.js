import { request } from './client';

// The fixed list of jobs: { items: [{ id, slug, name_sw, name_en }] }
export const fetchServices = (token) => request('/api/services', { token });
