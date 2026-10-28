import { request } from './client';

export const createRequest = (token, body) => request('/api/requests', { method: 'POST', token, body });
export const getOpenRequest = (token) => request('/api/requests/open', { token });
export const getRequest = (token, id) => request(`/api/requests/${id}`, { token });
export const cancelRequest = (token, id, reason) =>
  request(`/api/requests/${id}/cancel`, { method: 'POST', token, body: reason ? { reason } : undefined });
// Pay a finished job. NiJibu keeps its commission and pays the fundi the rest.
export const payRequest = (token, id, { network, phone }) =>
  request(`/api/requests/${id}/pay`, { method: 'POST', token, body: { network, phone } });
// The customer says the work is done (then he can pay)
export const confirmRequest = (token, id) => request(`/api/requests/${id}/confirm`, { method: 'POST', token });
export const listRequests = (token) => request('/api/requests', { token });
