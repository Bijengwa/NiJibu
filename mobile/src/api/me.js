import { request } from './client';

export const updateProfile = (token, { name, email }) =>
  request('/api/me/profile', { method: 'PATCH', token, body: { name, email } });

export const updateSettings = (token, settings) =>
  request('/api/me/settings', { method: 'PATCH', token, body: settings });

// asset = result from the image picker ({ uri, mimeType })
export function uploadAvatar(token, asset) {
  const type = asset.mimeType || 'image/jpeg';
  const ext = type.split('/')[1] || 'jpg';
  const form = new FormData();
  form.append('avatar', { uri: asset.uri, name: `avatar.${ext}`, type });
  return request('/api/me/avatar', { method: 'PUT', token, body: form, timeout: 30000 });
}

export const removeAvatar = (token) => request('/api/me/avatar', { method: 'DELETE', token });

export const changePassword = (token, current_password, new_password) =>
  request('/api/me/password', { method: 'POST', token, body: { current_password, new_password } });

export const deleteAccount = (token, password) =>
  request('/api/me', { method: 'DELETE', token, body: { password } });

export const listNotifications = (token) => request('/api/notifications', { token });
export const markRead = (token, id) => request(`/api/notifications/${id}/read`, { method: 'POST', token });
export const markAllRead = (token) => request('/api/notifications/read-all', { method: 'POST', token });
