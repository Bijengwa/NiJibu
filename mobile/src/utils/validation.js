// Phone is typed WITHOUT the +255 prefix: exactly 9 digits (e.g. 795259567)
export const PHONE_REGEX = /^\d{9}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

export const onlyDigits = (text) => text.replace(/\D/g, '').slice(0, 9);
export const toFullPhone = (phone) => `255${phone}`;

// Each validator returns a translation key, or '' when valid.
export function validatePhone(phone) {
  if (!phone) return 'phoneRequired';
  if (!PHONE_REGEX.test(phone)) return 'phoneDigits';
  return '';
}

export function validatePassword(password) {
  if (!password) return 'passwordRequired';
  if (password.length < MIN_PASSWORD) return 'passwordShort';
  if (password.length > MAX_PASSWORD) return 'passwordLong';
  return '';
}

export function validateConfirm(password, confirm) {
  if (!confirm) return 'confirmRequired';
  if (password !== confirm) return 'confirmMismatch';
  return '';
}

export const onlyCodeDigits = (text) => text.replace(/\D/g, '').slice(0, 6);

export function validateCode(code) {
  return /^\d{6}$/.test(code) ? '' : 'codeDigits';
}

// Full name: first + last name, no digits or symbols (the server checks again)
export function validateFullName(name) {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return 'nameInvalid';
  if (n.length < 3 || n.length > 60 || n.split(' ').length < 2) return 'nameInvalid';
  if (/[\d<>@#$%^&*()_+=[\]{}|\\/!?;:"`~]/.test(n)) return 'nameInvalid';
  return '';
}

export function validateEmail(email) {
  const e = email.trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? '' : 'emailInvalid';
}

export function timeAgo(t, iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('justNow');
  if (s < 3600) return `${Math.floor(s / 60)} ${t('minAgo')}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${t('hourAgo')}`;
  return `${Math.floor(s / 86400)} ${t('dayAgo')}`;
}
