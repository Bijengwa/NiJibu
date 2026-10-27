import { request } from './client';

// Language / theme sync. Same server route as the customer app.
export const updateSettings = (token, settings) =>
  request('/api/me/settings', { method: 'PATCH', token, body: settings });

// Full name + email (same server route as the customer app)
export const updateProfile = (token, { name, email }) =>
  request('/api/me/profile', { method: 'PATCH', token, body: { name, email } });
