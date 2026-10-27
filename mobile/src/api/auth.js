import { request } from './client';
import { toFullPhone } from '../utils/validation';

// phone = the 9 digits typed by the user (without 255)
const body = (phone, extra) => ({ phone: toFullPhone(phone), ...extra });

export const login = (phone, password) =>
  request('/api/auth/login', { method: 'POST', body: body(phone, { password }) });

export const register = (phone, password) =>
  request('/api/auth/register', { method: 'POST', body: body(phone, { password }) });

export const verify = (phone, code) =>
  request('/api/auth/verify', { method: 'POST', body: body(phone, { code }) });

export const resend = (phone) =>
  request('/api/auth/resend', { method: 'POST', body: body(phone) });

export const me = (token) => request('/api/auth/me', { token });

export const logout = (token) => request('/api/auth/logout', { method: 'POST', token });
