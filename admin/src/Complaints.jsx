import { useEffect, useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { Badge, Modal, Notice, Tabs } from './ui'
import { ago, tzs, useLoad } from './utils'

const go = (hash) => { window.location.hash = hash }

export const REASONS = {
  worker_no_show: 'Worker did not come',
  bad_work: 'Bad work',
  price_changed: 'Price changed',
  rude: 'Rude behaviour',
  payment_problem: 'Payment problem',
  customer_no_show: 'Customer was not there',
  wrong_location: 'Wrong location',
  refused_to_pay: 'Customer refused to pay',
  payment_not_received: 'Money not received',
  other: 'Other',
}
const STATUS = {
  open: { label: 'Open', tone: 'bad' },
  in_review: { label: 'In review', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'plain' },
}
const StatusBadge = ({ s }) => <Badge tone={STATUS[s]?.tone || 'plain'}>{STATUS[s]?.label || s}</Badge>
const Row = ({ k, v }) => (<><dt>{k}</dt><dd>{v}</dd></>)

function Answer({ c, onClose, onDone }) {
  const [reply, setReply] = useState('')
  const [resend, setResend] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closed = c.status === 'resolved' || c.status === 'rejected'

  async function send(status) {
    setBusy(true); setError('')
    try {
      await api(`/api/admin/complaints/${c.id}`, { method: 'POST', body: { status, reply, resend: status === 'resolved' && resend } })
      onDone()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal title={`${c.code} - ${REASONS[c.reason] || c.reason}`} onClose={onClose}>
      <dl className="kv wide-kv">
        <Row k="Status" v={<StatusBadge s={c.status} />} />
        <Row k="Request" v={<button className="linkish" onClick={() => go(`/requests?id=${c.request_id}`)}>{c.request_code}</button>} />
        <Row k="Job" v={`${c.service} (${c.request_status})${c.price ? `, ${tzs(c.price)}` : ''}${c.payment_status ? `, payment ${c.payment_status}` : ''}`} />
        <Row k={`From (${c.from_role})`} v={<button className="linkish" onClick={() => go(`/users?id=${c.from_user_id}`)}>{c.from_name || 'No name'}</button>} />
        <Row k="Against" v={c.against_user_id ? <button className="linkish" onClick={() => go(`/users?id=${c.against_user_id}`)}>{c.against_name || 'No name'}</button> : '-'} />
        <Row k="Sent" v={ago(c.created_at)} />
      </dl>
      <p className="quote">{c.message}</p>
      {closed ? (
        <>
          <p><strong>Admin reply:</strong> {c.admin_reply}</p>
          <div className="actions"><button onClick={onClose}>Close</button></div>
        </>
      ) : (
        <>
          <label htmlFor="reply">Reply (the person will see it)</label>
          <textarea id="reply" rows={3} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} />
          {c.payout_id && (
            <label className="check"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} /> Send the worker's money again when resolved</label>
          )}
          <Notice text={error} error />
          <div className="actions">
            {c.status === 'open' && <button disabled={busy} onClick={() => send('in_review')}>Start review</button>}
            <button disabled={busy} onClick={() => send('rejected')}>Reject</button>
            <button className="primary" disabled={busy} onClick={() => send('resolved')}>Resolve</button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function Complaints() {
  const [status, setStatus] = useState('active')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(null)
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (role) params.set('from_role', role)
  if (term) params.set('search', term)
  const { data, error, loading, reload } = useLoad(`/api/admin/complaints?${params}`)
  const n = data?.counts || {}

  return (
    <div className="stack wide">
      <p className="muted lead"><Icon name="complaints" size={15} /> Problems reported by customers and workers. Each one belongs to a request.</p>
      <div className="bar sticky-bar">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { id: 'active', label: 'To do', count: (n.open || 0) + (n.in_review || 0) },
            { id: 'open', label: 'Open', count: n.open },
            { id: 'in_review', label: 'In review', count: n.in_review },
            { id: 'resolved', label: 'Resolved' },
            { id: 'rejected', label: 'Rejected' },
            { id: '', label: 'All' },
          ]}
        />
        <div className="filters">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="From">
            <option value="">Customers and workers</option>
            <option value="customer">Customers</option>
            <option value="worker">Workers</option>
          </select>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or phone" aria-label="Search" />
        </div>
      </div>
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : !data.items.length ? <p className="muted">No complaints here.</p> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Complaint</th><th>Request</th><th>From</th><th>Against</th><th>Reason</th><th>Message</th><th>Status</th><th>When</th><th></th></tr></thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Complaint"><strong>{c.code}</strong></td>
                  <td data-label="Request"><button className="linkish" onClick={() => go(`/requests?id=${c.request_id}`)}>{c.request_code}</button><div className="muted small-text">{c.service}</div></td>
                  <td data-label="From"><button className="linkish" onClick={() => go(`/users?id=${c.from_user_id}`)}>{c.from_name || 'No name'}</button><div className="muted small-text">{c.from_role}</div></td>
                  <td data-label="Against">{c.against_user_id ? <button className="linkish" onClick={() => go(`/users?id=${c.against_user_id}`)}>{c.against_name || 'No name'}</button> : '-'}</td>
                  <td data-label="Reason">{REASONS[c.reason] || c.reason}</td>
                  <td data-label="Message"><div className="clip">{c.message}</div></td>
                  <td data-label="Status"><StatusBadge s={c.status} /></td>
                  <td data-label="When">{ago(c.created_at)}</td>
                  <td><button className="small" onClick={() => setOpen(c)}>{c.status === 'open' || c.status === 'in_review' ? 'Answer' : 'View'}</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {open && <Answer c={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload() }} />}
    </div>
  )
}
