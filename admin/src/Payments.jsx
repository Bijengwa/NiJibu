import { useEffect, useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { Badge, Notice, Tabs } from './ui'
import { PayBadge } from './Requests'
import { ago, fmt, tzs, useLoad } from './utils'

const go = (hash) => { window.location.hash = hash }
const Row = ({ k, v }) => (<><dt>{k}</dt><dd>{v}</dd></>)

function Pager({ page, size, total, onPage }) {
  const last = Math.max(1, Math.ceil(total / size))
  if (last === 1) return null
  return (
    <div className="pager">
      <button className="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Back</button>
      <span className="muted">Page {page} of {last} ({fmt(total)})</span>
      <button className="small" disabled={page >= last} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  )
}


// Registration fees: what workers paid before an identity check, how many tries, how each try ended
const OUTCOME = { open: ['plain', 'In progress'], passed: ['good', 'Passed'], failed: ['bad', 'Failed'], photos: ['warn', 'Sent photos'] }

function RegistrationFees() {
  const { data, error, loading } = useLoad('/api/admin/verification-fees')
  if (loading && !data) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  const t = data.totals
  return (
    <div className="card flush">
      <h3 className="mini-title">Registration fees (workers)</h3>
      <dl className="kv wide-kv pad">
        <Row k="Collected" v={tzs(t.collected)} />
        <Row k="Paid tries" v={`${fmt(t.paid)} (${fmt(t.passed)} passed, ${fmt(t.failed_checks)} failed)`} />
        <Row k="Waiting for the phone" v={fmt(t.pending)} />
        <Row k="Declined" v={fmt(t.failed)} />
      </dl>
      {data.items.length === 0 ? <p className="muted pad">No registration fees yet.</p> : (
        <div className="table-wrap"><table className="rt">
          <thead><tr><th>Worker</th><th>Amount</th><th>Payment</th><th>Check</th><th>NIDA hits</th><th>Paid tries</th><th>When</th></tr></thead>
          <tbody>
            {data.items.map((f) => (
              <tr key={f.id}>
                <td data-label="Worker">{f.name || <span className="muted">No account yet</span>}<div className="muted small-text">+{f.phone}</div></td>
                <td data-label="Amount">{tzs(f.amount)}<div className="muted small-text">{f.pay_phone && f.pay_phone !== f.phone ? `paid from +${f.pay_phone} ` : ''}{f.network || ''} {f.reference || f.failure || ''}</div></td>
                <td data-label="Payment"><PayBadge s={f.status} /></td>
                <td data-label="Check">{f.status === 'paid' ? <Badge tone={OUTCOME[f.outcome]?.[0] || 'plain'}>{OUTCOME[f.outcome]?.[1] || f.outcome}</Badge> : <span className="muted">-</span>}</td>
                <td data-label="NIDA hits">{f.status === 'paid' ? `${f.hits} of 2` : <span className="muted">-</span>}</td>
                <td data-label="Paid tries">{f.tries_by_phone > 1 ? <Badge tone="warn">{f.tries_by_phone}</Badge> : f.tries_by_phone || <span className="muted">-</span>}</td>
                <td data-label="When">{ago(f.paid_at || f.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}

export default function Payments() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ text: '', error: false })
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams({ page: String(page) })
  if (term) params.set('q', term)
  if (status === 'failed' || status === 'paid' || status === 'pending') params.set('status', status)
  if (status === 'payout_open') params.set('payout', 'pending')
  if (status === 'payout_failed') params.set('payout', 'failed')
  const { data, error, loading, reload } = useLoad(`/api/admin/payments?${params}`)

  async function retry(id) {
    try { await api(`/api/admin/payouts/${id}/retry`, { method: 'POST' }); setNotice({ text: 'Payout tried again.', error: false }); reload() }
    catch (e) { setNotice({ text: e.message, error: true }) }
  }

  const t = data?.totals
  const e = data?.expected
  return (
    <div className="stack wide">
      <p className="muted lead"><Icon name="payments" size={15} /> Each payment belongs to one request. Open the request to see the full story.</p>
      {data && (
        <div className="cols">
          <section className="card">
            <h2>Received</h2>
            <dl className="kv wide-kv">
              <Row k="Payments paid" v={fmt(t.count)} />
              <Row k="Total from customers" v={tzs(t.gross)} />
              <Row k="NiJibu share" v={tzs(t.commission)} />
              <Row k="Sent to workers" v={tzs(t.paid_out)} />
              <Row k="Still owed to workers" v={t.owed_to_fundis ? <Badge tone="warn">{tzs(t.owed_to_fundis)}</Badge> : tzs(0)} />
            </dl>
          </section>
          <section className="card">
            <h2>Still to collect</h2>
            <p className="muted small-text">Jobs finished but not paid by the customer yet.</p>
            <dl className="kv wide-kv">
              <Row k="Jobs" v={fmt(e.jobs)} />
              <Row k="Customers should pay" v={tzs(e.gross)} />
              <Row k="NiJibu will keep" v={tzs(e.commission)} />
              <Row k="Workers will get" v={tzs(e.for_fundis)} />
            </dl>
          </section>
        </div>
      )}

      {data?.by_service.length > 0 && (
        <div className="card flush">
          <h3 className="mini-title">Money by job</h3>
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Job</th><th>Payments</th><th>Paid by customers</th><th>NiJibu share</th><th>Workers' share</th></tr></thead>
            <tbody>{data.by_service.map((s) => (
              <tr key={s.id}><td data-label="Job"><strong>{s.service}</strong></td><td data-label="Payments">{fmt(s.payments)}</td><td data-label="Paid">{tzs(s.gross)}</td><td data-label="NiJibu">{tzs(s.commission)}</td><td data-label="Workers">{tzs(s.for_fundis)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <div className="bar">
        <Tabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1) }}
          tabs={[
            { id: '', label: 'All' },
            { id: 'paid', label: 'Paid' },
            { id: 'failed', label: 'Failed' },
            { id: 'payout_open', label: 'Payout waiting' },
            { id: 'payout_failed', label: 'Payout failed' },
          ]}
        />
        <div className="filters">
          <input type="search" value={q} onChange={(e2) => setQ(e2.target.value)} placeholder="Code, name, phone or reference" aria-label="Search" />
        </div>
      </div>
      <Notice text={notice.text} error={notice.error} />
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : !data.items.length ? <p className="muted">No payments found.</p> : (
          <>
            <div className="table-wrap"><table className="rt">
              <thead><tr><th>Payment</th><th>Request</th><th>Paid by</th><th>Paid to</th><th>Amount</th><th>NiJibu share</th><th>Worker share</th><th>Status</th><th>Payout</th><th>When</th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Payment"><strong>{p.code}</strong><div className="muted small-text">{p.network || ''} {p.reference || p.failure || ''}</div></td>
                    <td data-label="Request"><button className="linkish" onClick={() => go(`/requests?id=${p.request_id}`)}>{p.request_code}</button><div className="muted small-text">{p.service}</div></td>
                    <td data-label="Paid by"><button className="linkish" onClick={() => go(`/users?id=${p.customer_id}`)}>{p.customer_name || 'No name'}</button></td>
                    <td data-label="Paid to"><button className="linkish" onClick={() => go(`/users?id=${p.provider_user_id}`)}>{p.provider_name}</button></td>
                    <td data-label="Amount">{tzs(p.amount)}</td>
                    <td data-label="NiJibu share">{tzs(p.fee)} <span className="muted">({p.fee_percent}%)</span></td>
                    <td data-label="Worker share">{tzs(p.payout)}</td>
                    <td data-label="Status"><PayBadge s={p.status} />{p.attempts > 1 && <span className="muted small-text"> {p.attempts} tries</span>}</td>
                    <td data-label="Payout">
                      {p.status === 'paid' ? <PayBadge s={p.payout_status} none="waiting" /> : <span className="muted">-</span>}
                      {p.complaint_status === 'open' && <> <Badge tone="bad">complaint</Badge></>}
                      {p.payout_id && p.payout_status !== 'sent' && <> <button className="small" onClick={() => retry(p.payout_id)}>Try again</button></>}
                      {p.payout_failure && <div className="muted small-text">{p.payout_failure}</div>}
                    </td>
                    <td data-label="When">{ago(p.paid_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
      <RegistrationFees />
    </div>
  )
}
