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

// NIDA number: 20 digits, shown as 19900101-12345-12345-12 while typing
export const onlyNidaDigits = (text) => text.replace(/\D/g, '').slice(0, 20);

export function formatNida(digits) {
  const parts = [digits.slice(0, 8), digits.slice(8, 13), digits.slice(13, 18), digits.slice(18, 20)];
  return parts.filter(Boolean).join('-');
}

export const validateNida = (digits) => (/^\d{20}$/.test(digits) ? '' : 'nidaInvalid');

// Dropdowns: a choice is required
export const validateRequired = (value) => (value && value.length ? '' : 'required');

// Date of birth typed as DDMMYYYY, shown as DD/MM/YYYY
export const onlyDobDigits = (v) => String(v || '').replace(/\D/g, '').slice(0, 8);
export const formatDob = (d) => [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
export const validateDob = (d) => {
  if (!/^\d{8}$/.test(d)) return 'DOB_INVALID';
  const day = +d.slice(0, 2), month = +d.slice(2, 4), year = +d.slice(4, 8);
  const dt = new Date(year, month - 1, day);
  const ok = dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
  const age = new Date().getFullYear() - year;
  return ok && age >= 18 && age <= 90 ? '' : 'DOB_INVALID';
};
export const validateAnswer = (v) => (String(v || '').trim().length >= 2 ? '' : 'required');

// One part of a name (first / middle / last): letters only
export const validateNamePart = (v, optional = false) => {
  const n = String(v || '').trim();
  if (!n) return optional ? '' : 'namePartInvalid';
  return n.length >= 2 && n.length <= 30 && /^[\p{L}][\p{L} '’-]*$/u.test(n) ? '' : 'namePartInvalid';
};
