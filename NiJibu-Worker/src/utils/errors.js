import { API_URL } from '../config';

// Translated message for an API error code. In dev, network errors also show the URL tried.
export function errorMessage(t, code) {
  const msg = t(code);
  return code === 'NETWORK' && __DEV__ ? `${msg}\n${API_URL}` : msg;
}
