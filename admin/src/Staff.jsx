import { useState } from 'react'
import { api } from './api'
import { Badge, Modal, Notice } from './ui'
import { ROLE_LABEL, SUPER, SUPPORT } from './session'
import { ago, useLoad } from './utils'

const ROLES = [
  [SUPER, 'Superadmin', 'Sees and does everything: money, payments, services, jobs, users and staff.'],
  [SUPPORT, 'Customer care', 'Sees users, requests, jobs and complaints, and answers complaints. No money, no settings, no staff.'],
]

function AddStaff({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', phone: '', role: SUPPORT, password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const digits = form.phone.replace(/\D/g, '')
  const ok = form.name.trim().length >= 2 && /^\d{9}$/.test(digits.replace(/^255/, '')) && form.password.length >= 8

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/admin/staff', { method: 'POST', body: { ...form, phone: digits } })
      onDone(`${form.name.trim()} was added as ${ROLE_LABEL[form.role]}. Give them the phone number and password.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Add staff" onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="sn">Full name</label>
        <input id="sn" value={form.name} onChange={set('name')} maxLength={100} autoComplete="off" />
        <label htmlFor="sp">Phone</label>
        <div className="phone-row"><span className="prefix">+255</span><input id="sp" inputMode="numeric" placeholder="712345678" value={form.phone} onChange={set('phone')} autoComplete="off" /></div>
        <label htmlFor="sr">Role</label>
        <select id="sr" value={form.role} onChange={set('role')} className="full">
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="muted small-text">{ROLES.find((r) => r[0] === form.role)[2]}</p>
        <label htmlFor="spw">Password (8 or more characters)</label>
        <div className="pw-row">
          <input id="spw" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} maxLength={72} autoComplete="new-password" />
          <button type="button" className="small" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy || !ok}>{busy ? 'Saving...' : 'Add staff'}</button></div>
      </form>
    </Modal>
  )
}

function Password({ person, onClose, onDone }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api(`/api/admin/staff/${person.id}`, { method: 'PATCH', body: { password: pw } })
      onDone(`New password saved for ${person.name}. They are logged out everywhere.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={`New password for ${person.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="np">New password (8 or more characters)</label>
        <input id="np" type="text" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} autoComplete="off" />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy || pw.length < 8}>{busy ? 'Saving...' : 'Save password'}</button></div>
      </form>
    </Modal>
  )
}

export default function Staff({ me }) {
  const { data, error, loading, reload } = useLoad('/api/admin/staff')
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState({ text: '', error: false })
  const note = (text, bad = false) => setNotice({ text, error: bad })

  async function patch(p, body, ok) {
    try { await api(`/api/admin/staff/${p.id}`, { method: 'PATCH', body }); note(ok); reload() }
    catch (e) { note(e.message, true) }
  }

  return (
    <div className="stack wide">
      <div className="bar">
        <p className="muted lead">People who can log in to this portal. Customers and workers are not here.</p>
        <button className="small solid" onClick={() => setModal({ kind: 'add' })}>Add staff</button>
      </div>
      <div className="cols">
        {ROLES.map(([v, l, text]) => (
          <section key={v} className="card"><h2>{l}</h2><p className="muted">{text}</p></section>
        ))}
      </div>
      <Notice text={notice.text} error={notice.error} />
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Person</th><th>Phone</th><th>Role</th><th>Status</th><th>Added</th><th>Action</th></tr></thead>
            <tbody>
              {data.items.map((p) => {
                const mine = p.id === me.id
                return (
                  <tr key={p.id} className={p.disabled ? 'off' : ''}>
                    <td data-label="Person"><strong>{p.name || 'No name'}</strong>{mine && <> <Badge tone="plain">You</Badge></>}</td>
                    <td data-label="Phone"><a href={`tel:+${p.phone}`}>+{p.phone}</a></td>
                    <td data-label="Role">
                      {mine ? ROLE_LABEL[p.role] : (
                        <select value={p.role} aria-label={`Role of ${p.name}`} onChange={(e) => patch(p, { role: e.target.value }, `${p.name} is now ${ROLE_LABEL[e.target.value]}.`)}>
                          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-label="Status">{p.disabled ? <Badge tone="bad">switched off</Badge> : <Badge tone="good">working</Badge>}</td>
                    <td data-label="Added">{ago(p.created_at)}</td>
                    <td data-label="Action">
                      <div className="row-actions">
                        <button className="small" onClick={() => setModal({ kind: 'password', person: p })}>New password</button>
                        {!mine && <button className="small" onClick={() => patch(p, { disabled: !p.disabled }, p.disabled ? `${p.name} can log in again.` : `${p.name} was switched off and is logged out.`)}>{p.disabled ? 'Switch on' : 'Switch off'}</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>
      {modal?.kind === 'add' && <AddStaff onClose={() => setModal(null)} onDone={(t) => { setModal(null); note(t); reload() }} />}
      {modal?.kind === 'password' && <Password person={modal.person} onClose={() => setModal(null)} onDone={(t) => { setModal(null); note(t) }} />}
    </div>
  )
}
