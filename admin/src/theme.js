const KEY = 'nijibu_admin_theme'
export const getTheme = () => {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}
export function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem(KEY, mode) } catch { /* ignore */ }
}
