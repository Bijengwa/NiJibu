import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon, Logo } from './icons'
import { NAV, SETTINGS } from './nav'
import { canOpen, ROLE_LABEL } from './session'

const COLLAPSE_KEY = 'nijibu_admin_collapsed'
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function useIsMobile(onChange) {
  const q = '(max-width: 900px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => { setM(mq.matches); onChange?.() }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [onChange])
  return m
}

function NavLink({ item, active, collapsed, onGo }) {
  return (
    <a
      href={`#${item.path}`}
      onClick={onGo}
      className={`nav${active ? ' active' : ''}`}
      title={collapsed ? item.title : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={item.icon} />
      {!collapsed && <span>{item.title}</span>}
    </a>
  )
}

// The NiJibu logo is always on screen. When the menu is closed, pointing at the logo turns it into the menu button.
export function LogoToggle({ onClick, label }) {
  return (
    <button className="logo-toggle" onClick={onClick} aria-label={label}>
      <span className="lt-logo"><Logo size={28} /></span>
      <span className="lt-menu"><Icon name="menu" size={20} /></span>
    </button>
  )
}

function Sidebar({ route, collapsed, onToggle, onGo }) {
  return (
    <div className="sidebar">
      <div className="side-head">
        {collapsed ? (
          <LogoToggle onClick={onToggle} label="Open menu" />
        ) : (
          <>
            <div className="brand"><Logo size={28} /><span>NiJibu Admin</span></div>
            <button className="icon-btn" onClick={onToggle} aria-label="Close menu" title="Close menu"><Icon name="panel" /></button>
          </>
        )}
      </div>
      <nav className="side-nav">
        {NAV.filter((n) => canOpen(n.page)).map((n) => <NavLink key={n.path} item={n} active={route === n.path} collapsed={collapsed} onGo={onGo} />)}
      </nav>
      <div className="side-foot">
        <NavLink item={SETTINGS} active={route === SETTINGS.path} collapsed={collapsed} onGo={onGo} />
      </div>
    </div>
  )
}

function ProfileMenu({ user }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="profile" ref={ref}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-label="Profile" aria-expanded={open}>
        <Icon name="user" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user?.name || 'Staff'}</strong>
            <span className="muted">+{user?.phone}</span>
            <span className="muted small-text">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
          <a href={`#${SETTINGS.path}`} className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="settings" /> Settings
          </a>
        </div>
      )}
    </div>
  )
}

// back: { to: '#/users', label: 'Back to users' } puts an arrow button left of the page title
export default function Layout({ user, route, theme, onTheme, back, children }) {
  const [drawer, setDrawer] = useState(false)
  const closeDrawer = useCallback(() => setDrawer(false), [])
  const isMobile = useIsMobile(closeDrawer)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  useEffect(() => {
    document.body.style.overflow = isMobile && drawer ? 'hidden' : ''
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey) }
  }, [isMobile, drawer])

  const all = [...NAV, SETTINGS]
  const title = all.find((n) => n.path === route)?.title || 'Home'
  const nextTheme = { light: 'dark', dark: 'system', system: 'light' }[theme]
  const themeIcon = { light: 'sun', dark: 'moon', system: 'monitor' }[theme]

  return (
    <div className={`shell${!isMobile && collapsed ? ' collapsed' : ''}`}>
      {!isMobile && <Sidebar route={route} collapsed={collapsed} onToggle={toggleCollapsed} onGo={() => {}} />}

      {isMobile && drawer && <div className="overlay" onClick={() => setDrawer(false)} />}
      {isMobile && (
        <div className={`drawer${drawer ? ' open' : ''}`} aria-hidden={!drawer}>
          <Sidebar route={route} collapsed={false} onToggle={() => setDrawer(false)} onGo={() => setDrawer(false)} />
        </div>
      )}

      <div className="col">
        <header className="topbar">
          {isMobile && <LogoToggle onClick={() => setDrawer(true)} label="Open menu" />}
          {back && (
            <a className="icon-btn back-btn" href={back.to} aria-label={back.label} title={back.label}>
              <Icon name="arrow" size={20} />
            </a>
          )}
          <h1 className="page-title">{title}</h1>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => onTheme(nextTheme)} title={`Theme: ${theme}. Click to change.`} aria-label="Change theme">
              <Icon name={themeIcon} />
            </button>
            <ProfileMenu user={user} />
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  )
}
