import { request } from './client';
import { toFullPhone } from '../utils/validation';

// phone = the 9 digits typed by the user (without 255)
const body = (phone, extra) => ({ phone: toFullPhone(phone), ...extra });

export const login = (phone, password) =>
  request('/api/auth/login', { method: 'POST', body: body(phone, { password }) });

// role: this app registers fundis (the customer app registers customers)
// acceptTerms: the person ticked "I agree to the Terms and Conditions" (the server refuses without it)
export const register = (phone, password, acceptTerms) =>
  request('/api/auth/register', { method: 'POST', body: body(phone, { password, role: 'fundi', accept_terms: acceptTerms === true }) });

// Forgot password: 1) a code is sent by SMS  2) the code + a new password. Then the person logs in again.
export const forgot = (phone) => request('/api/auth/forgot', { method: 'POST', body: body(phone) });
export const reset = (phone, code, password) => request('/api/auth/reset', { method: 'POST', body: body(phone, { code, password }) });

// Terms and Conditions: { version, en: { title, sections: [{ h, p }] }, sw: {...} }
export const getTerms = () => request('/api/auth/terms');
export const acceptTerms = (token, version) => request('/api/me/terms', { method: 'POST', token, body: { version } });

export const verify = (phone, code) =>
  request('/api/auth/verify', { method: 'POST', body: body(phone, { code }) });

export const resend = (phone) =>
  request('/api/auth/resend', { method: 'POST', body: body(phone) });

export const me = (token) => request('/api/auth/me', { token });

export const logout = (token) => request('/api/auth/logout', { method: 'POST', token });
