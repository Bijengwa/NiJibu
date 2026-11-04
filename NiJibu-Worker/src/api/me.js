import { request } from './client';

// Language / theme sync. Same server route as the customer app.
export const updateSettings = (token, settings) =>
  request('/api/me/settings', { method: 'PATCH', token, body: settings });

// Full name + email (same server route as the customer app)
export const updateProfile = (token, { name, email }) =>
  request('/api/me/profile', { method: 'PATCH', token, body: { name, email } });

// Change password: needs the current one. Other devices are logged out; the server returns a fresh token.
export const changePassword = (token, current_password, new_password) =>
  request('/api/me/password', { method: 'POST', token, body: { current_password, new_password } });
