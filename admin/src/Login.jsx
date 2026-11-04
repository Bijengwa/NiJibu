import { useState } from 'react'
import { adminLogin } from './api'
import { Logo } from './icons'

export default function Login({ onLoggedIn }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const digits = phone.replace(/\D/g, '')
  const phoneOk = /^\d{9}$/.test(digits)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (!phoneOk) return setError('Phone must be 9 digits, for example 712345678.')
    if (!password) return setError('Enter your password.')
    setBusy(true)
    try {
      const { token, user } = await adminLogin(digits, password)
      onLoggedIn(token, user)
    } catch (err) {
      setError(err.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit} noValidate>
        <div className="brand"><Logo /> <span>NiJibu Admin</span></div>
        <h1>Sign in</h1>
        <p className="muted">Only NiJibu administrators can enter.</p>

        <label htmlFor="phone">Phone number</label>
        <div className="phone-row">
          <span className="prefix">+255</span>
          <input
            id="phone" inputMode="numeric" autoComplete="username" maxLength={9}
            value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="712345678" autoFocus
          />
        </div>

        <label htmlFor="password">Password</label>
        <div className="pw-row">
          <input
            id="password" type={show ? 'text' : 'password'} autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72}
          />
          <button type="button" className="link" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </main>
  )
}
