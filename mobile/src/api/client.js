import { API_URL } from '../config';

export class ApiError extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.code = code; // INVALID_CREDENTIALS, PHONE_TAKEN, CODE_INVALID, NETWORK, TIMEOUT, ...
    this.status = status;
    this.retryAfter = retryAfter; // seconds (resend cooldown), when the server sends it
  }
}

// Called when the server rejects a token we sent (expired, revoked, account deleted)
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function request(path, { method = 'GET', body, token, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(data?.code || 'UNKNOWN', res.status, data?.retry_after);
  }
  return data;
}
