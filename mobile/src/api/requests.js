import { request } from './client';

export const createRequest = (token, body) => request('/api/requests', { method: 'POST', token, body });
export const getOpenRequest = (token) => request('/api/requests/open', { token });
export const getRequest = (token, id) => request(`/api/requests/${id}`, { token });
export const cancelRequest = (token, id, reason) =>
  request(`/api/requests/${id}/cancel`, { method: 'POST', token, body: reason ? { reason } : undefined });
export const listRequests = (token) => request('/api/requests', { token });
