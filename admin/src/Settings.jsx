import { Icon } from './icons'
import { ROLE_LABEL } from './session'

const MODES = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
]

export default function Settings({ user, theme, onTheme, onLogout }) {
  return (
    <div className="stack">
      <section className="card">
        <h2>Profile</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{user?.name || '-'}</dd>
          <dt>Phone</dt><dd>+{user?.phone}</dd>
          <dt>Role</dt><dd>{ROLE_LABEL[user?.role] || user?.role}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Appearance</h2>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={theme === m.id} className={theme === m.id ? 'on' : ''} onClick={() => onTheme(m.id)}>
              <Icon name={m.icon} size={16} /> {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Account</h2>
        <button className="danger" onClick={onLogout}><Icon name="logout" size={16} /> Log out</button>
      </section>
    </div>
  )
}
