import { useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'
import { applyTheme, getTheme } from './theme'
import { NAV, SETTINGS } from './nav'
import Login from './Login'
import Layout from './Layout'
import Dashboard from './Dashboard'
import Settings from './Settings'
import Jobs from './Jobs'
import Users from './Users'
import Requests from './Requests'
import Payments from './Payments'
import Complaints from './Complaints'
import Stub from './Stub'
import { startLive } from './live'

const readHash = () => window.location.hash.replace(/^#/, '') || '/'

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(getToken()))
  const [hash, setHash] = useState(readHash)
  const [route, query = ''] = hash.split('?')
  const params = new URLSearchParams(query)
  const [theme, setThemeState] = useState(getTheme)

  const setTheme = useCallback((m) => { applyTheme(m); setThemeState(m) }, [])
  useEffect(() => { applyTheme(getTheme()) }, [])

  useEffect(() => {
    const on = () => { setHash(readHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const logout = useCallback(() => { setToken(null); setUser(null); window.location.hash = '' }, [])
  useEffect(() => { setUnauthorizedHandler(logout) }, [logout])

  // On page reload: check the saved token is still valid and belongs to an admin
  useEffect(() => {
    if (!getToken()) return
    api('/api/auth/me')
      .then(({ user }) => (user.role === 'admin' ? setUser(user) : logout()))
      .catch(() => logout())
      .finally(() => setChecking(false))
  }, [logout])

  // Live updates while an admin is logged in
  const loggedIn = Boolean(user)
  useEffect(() => (loggedIn ? startLive() : undefined), [loggedIn])

  if (checking) return <main className="login"><p className="muted">Loading...</p></main>
  if (!user) return <Login onLoggedIn={(token, u) => { setToken(token); setUser(u) }} />

  let page
  if (route === '/') page = <Dashboard />
  else if (route === '/jobs') page = <Jobs key={params.get('tab') || 'default'} initialTab={params.get('tab')} />
  else if (route === '/users') page = <Users key={`${params.get('id')}${params.get('group')}${params.get('status')}`} id={params.get('id')} group={params.get('group')} status={params.get('status')} />
  else if (route === '/requests') page = <Requests key={params.get('id') || 'list'} id={params.get('id')} />
  else if (route === '/payments') page = <Payments />
  else if (route === '/complaints') page = <Complaints />
  else if (route === SETTINGS.path) page = <Settings user={user} theme={theme} onTheme={setTheme} onLogout={logout} />
  else {
    const item = NAV.find((n) => n.path === route)
    page = <Stub title={item ? item.title : 'Not found'} />
  }

  return <Layout user={user} route={route} theme={theme} onTheme={setTheme}>{page}</Layout>
}
