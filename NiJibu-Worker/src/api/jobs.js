import { request } from './client';

// Online switch, offers from customers, the active job and finished jobs.
//   POST /api/provider/online   { lat, lng }     go live (needs the location)
//   POST /api/provider/offline
//   POST /api/provider/location { lat, lng }     heartbeat (every ~15 s; the server drops fundis not seen for 2 min)
//   GET  /api/provider/offers   -> { items: [Offer] }   offers waiting for me
//   GET  /api/provider/me       -> { provider: { is_online, active_request_id, ... } }
//   GET  /api/provider/jobs     -> { items: [Job] }     newest first
//   POST /api/offers/:id/accept | /decline
//   GET  /api/requests/:id      -> { request }
//   POST /api/requests/:id/on-the-way | arrived | start | complete | cancel   -> { request }
//
// Offer: { offer_id, request_id, service: {id,name_sw,name_en}, distance_km, address, expires_at }
//   (no name, phone or exact place until I accept)
// Request (my job): { id, status, service, lat, lng, address, note, customer: {name, phone, avatar_url} }
// Live push (Socket.IO): offer:new, offer:closed, request:status

export const setOnline = (token, coords) => request('/api/provider/online', { method: 'POST', token, body: { lat: coords.lat, lng: coords.lng } });
export const setOffline = (token) => request('/api/provider/offline', { method: 'POST', token });
export const sendLocation = (token, c) => request('/api/provider/location', { method: 'POST', token, body: { lat: c.lat, lng: c.lng } });

export const getMe = (token) => request('/api/provider/me', { token });
export const listOffers = (token) => request('/api/provider/offers', { token });
export const listJobs = (token) => request('/api/provider/jobs', { token });
export const confirmReceived = (token, requestId) => request(`/api/provider/payments/${requestId}/received`, { method: 'POST', token });
export const fileComplaint = (token, requestId, note) => request(`/api/provider/payments/${requestId}/complaint`, { method: 'POST', token, body: { note } });
export const getRequest = (token, id) => request(`/api/requests/${id}`, { token });

export const acceptOffer = (token, offerId) => request(`/api/offers/${offerId}/accept`, { method: 'POST', token });
export const declineOffer = (token, offerId) => request(`/api/offers/${offerId}/decline`, { method: 'POST', token });

// stage: 'on-the-way' | 'arrived' | 'start' | 'complete' | 'cancel'
// complete needs { price } (TZS): the final price of the job. The customer then pays it in the app.
export const moveStage = (token, id, stage, body = {}) => request(`/api/requests/${id}/${stage}`, { method: 'POST', token, body });
