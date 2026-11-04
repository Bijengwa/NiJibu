import { useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'
import { applyTheme, getTheme } from './theme'
import { NAV, SETTINGS } from './nav'
import Login from './Login'
import Layout from './Layout'
import Home from './Home'
import Settings from './Settings'
import Jobs from './Jobs'
import Users from './Users'
import Requests from './Requests'
import Payments from './Payments'
import Complaints from './Complaints'
import Services from './Services'
import Staff from './Staff'
import Stub from './Stub'
import { canOpen, setRole, STAFF } from './session'
import { startLive } from './live'

function Forbidden() {
  return (
    <div className="card">
      <h2>Not allowed</h2>
      <p className="muted">Your role cannot open this page. Ask a superadmin if you need it.</p>
    </div>
  )
}

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
      .then(({ user }) => (STAFF.includes(user.role) ? (setRole(user.role), setUser(user)) : logout()))
      .catch(() => logout())
      .finally(() => setChecking(false))
  }, [logout])

  // Live updates while an admin is logged in
  const loggedIn = Boolean(user)
  useEffect(() => (loggedIn ? startLive() : undefined), [loggedIn])

  if (checking) return <main className="login"><p className="muted">Loading...</p></main>
  if (!user) return <Login onLoggedIn={(token, u) => { setToken(token); setRole(u.role); setUser(u) }} />

  const open = (pageName, el) => (canOpen(pageName) ? el : <Forbidden />)
  let page
  if (route === '/') page = <Home />
  else if (route === '/jobs') page = open('jobs', <Jobs key={params.get('tab') || 'default'} initialTab={params.get('tab')} />)
  else if (route === '/users') page = open('users', <Users key={`${params.get('id')}${params.get('group')}${params.get('status')}`} id={params.get('id')} group={params.get('group')} status={params.get('status')} />)
  else if (route === '/requests') page = open('requests', <Requests key={params.get('id') || 'list'} id={params.get('id')} />)
  else if (route === '/payments') page = open('payments', <Payments key={params.get('tab') || 'overview'} initialTab={params.get('tab')} />)
  else if (route === '/complaints') page = open('complaints', <Complaints />)
  else if (route === '/services') page = open('services', <Services />)
  else if (route === '/staff') page = open('staff', <Staff me={user} />)
  else if (route === SETTINGS.path) page = <Settings user={user} theme={theme} onTheme={setTheme} onLogout={logout} />
  else {
    const item = NAV.find((n) => n.path === route)
    page = <Stub title={item ? item.title : 'Not found'} />
  }

  // On a person's profile the page title gets an arrow button back to the users list
  const back = route === '/users' && params.get('id') ? { to: '#/users', label: 'Back to users' } : null

  return <Layout user={user} route={route} theme={theme} onTheme={setTheme} back={back}>{page}</Layout>
}
