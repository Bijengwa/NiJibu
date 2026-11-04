// Backend address. Default: the same computer address the admin was opened from, port 3000 (so it works on the network).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const KEY = 'nijibu_admin_token'

// sessionStorage: the login ends when the browser tab is closed
export const getToken = () => {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}
export const setToken = (t) => {
  try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Is the backend running?'), { code: 'NETWORK' })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized()
    throw Object.assign(new Error(data.error || 'Something went wrong'), { code: data.code, status: res.status })
  }
  return data
}

export const adminLogin = (phone, password) =>
  api('/api/auth/admin-login', { method: 'POST', body: { phone, password }, auth: false })
