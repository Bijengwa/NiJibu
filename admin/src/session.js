// Who is logged in. Set once by App; pages ask it what to show. (The server enforces the same rules.)
export const SUPER = 'superadmin'
export const SUPPORT = 'support'
export const STAFF = [SUPER, SUPPORT]
export const ROLE_LABEL = { superadmin: 'Superadmin', support: 'Customer care' }

// Pages each role can open
const PAGES = {
  [SUPER]: ['home', 'users', 'jobs', 'requests', 'payments', 'complaints', 'services', 'staff'],
  [SUPPORT]: ['home', 'users', 'jobs', 'requests', 'complaints'],
}

let role = null
export const setRole = (r) => { role = r }
export const getRole = () => role
export const isSuper = () => role === SUPER
export const canOpen = (page) => (PAGES[role] || []).includes(page)
