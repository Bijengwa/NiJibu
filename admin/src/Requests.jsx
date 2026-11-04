import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { Badge, Notice, Tabs } from './ui'
import { ago, fmt, tzs, useLoad } from './utils'

const go = (hash) => { window.location.hash = hash }
const tel = (p) => (p ? <a href={`tel:+${p}`}>+{p}</a> : <span className="muted">-</span>)
const dash = <span className="muted">-</span>
const money = (v) => (v || v === 0 ? tzs(v) : dash)
const date = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : dash)

const OUTCOME = {
  successful: ['good', 'Successful'],
  awaiting_payment: ['warn', 'Waiting for payment'],
  active: ['plain', 'In progress'],
  failed: ['bad', 'Failed'],
}
export const OutcomeBadge = ({ o }) => <Badge tone={OUTCOME[o][0]}>{OUTCOME[o][1]}</Badge>
const PAY_TONE = { paid: 'good', pending: 'warn', failed: 'bad', sent: 'good' }
export const PayBadge = ({ s, none = 'unpaid' }) => (s ? <Badge tone={PAY_TONE[s] || 'plain'}>{s}</Badge> : <span className="muted">{none}</span>)

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

function List() {
  const [outcome, setOutcome] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams({ page: String(page) })
  if (term) params.set('q', term)
  if (outcome) params.set('outcome', outcome)
  const { data, error, loading } = useLoad(`/api/admin/requests?${params}`)
  const c = data?.counts

  return (
    <div className="stack wide">
      <p className="muted lead"><Icon name="requests" size={15} /> Every request: who asked, who did the job, did it go through, and the money for it.</p>
      <div className="bar">
        <Tabs
          value={outcome}
          onChange={(v) => { setOutcome(v); setPage(1) }}
          tabs={[
            { id: '', label: 'All', count: c?.all },
            { id: 'successful', label: 'Successful', count: c?.successful },
            { id: 'awaiting_payment', label: 'Waiting for payment', count: c?.awaiting_payment },
            { id: 'active', label: 'In progress', count: c?.active },
            { id: 'failed', label: 'Failed', count: c?.failed },
          ]}
        />
        <div className="filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or phone" aria-label="Search" />
        </div>
      </div>
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : !data.items.length ? <p className="muted">No requests found.</p> : (
          <>
            <div className="table-wrap"><table className="rt">
              <thead><tr><th>Request</th><th>Job</th><th>Requested by</th><th>Done by</th><th>Result</th><th>Price</th><th>NiJibu share</th><th>Worker share</th><th>Payment</th><th>Payout</th><th>When</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Request">
                      <button className="linkish" onClick={() => go(`/requests?id=${r.id}`)}><strong>{r.code}</strong></button>
                      {r.address && <div className="muted small-text">{r.address}</div>}
                    </td>
                    <td data-label="Job">{r.service}</td>
                    <td data-label="Requested by">
                      <button className="linkish" onClick={() => go(`/users?id=${r.customer_id}`)}>{r.customer_name || 'No name'}</button>
                      <div className="small-text">{tel(r.customer_phone)}</div>
                    </td>
                    <td data-label="Done by">
                      {r.provider_name ? <><button className="linkish" onClick={() => go(`/users?id=${r.provider_user_id}`)}>{r.provider_name}</button><div className="small-text">{tel(r.provider_phone)}</div></> : <span className="muted">nobody</span>}
                    </td>
                    <td data-label="Result"><OutcomeBadge o={r.outcome} />{r.reason && <div className="muted small-text">{r.reason}</div>}</td>
                    <td data-label="Price">{money(r.agreed_price)}</td>
                    <td data-label="NiJibu share">{money(r.fee_due)}</td>
                    <td data-label="Worker share">{money(r.payout_due)}</td>
                    <td data-label="Payment">{r.agreed_price ? <><PayBadge s={r.payment_status} />{r.payment_attempts > 1 && <span className="muted small-text"> {r.payment_attempts} tries</span>}</> : dash}</td>
                    <td data-label="Payout">{r.payment_status === 'paid' ? <PayBadge s={r.payout_status} none="waiting" /> : dash}{r.complaint_status === 'open' && <> <Badge tone="bad">complaint</Badge></>}</td>
                    <td data-label="When">{ago(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  )
}

function Step({ label, at }) {
  return <><dt>{label}</dt><dd>{date(at)}</dd></>
}

function Detail({ id }) {
  const { data, error, loading } = useLoad(`/api/admin/requests/${id}`)
  if (loading) return <p className="muted">Loading...</p>
  if (error) return <div className="stack"><button className="small" onClick={() => go('/requests')}>Back</button><Notice text={error} error /></div>
  const { request: r, offers, payment, attempts, payout, check } = data
  const t = r.times
  return (
    <div className="stack wide">
      <div className="bar"><button className="small" onClick={() => go('/requests')}>Back to requests</button></div>

      <div className="card">
        <h2>{r.code} <OutcomeBadge o={r.outcome} /></h2>
        {r.reason && <p className="muted">{r.reason}</p>}
        <dl className="kv">
          <dt>Job</dt><dd>{r.service}</dd>
          <dt>Place</dt><dd>{r.address || dash}</dd>
          <dt>Note</dt><dd>{r.note || dash}</dd>
          <dt>Requested by</dt><dd><button className="linkish" onClick={() => go(`/users?id=${r.customer.id}`)}>{r.customer.name || 'No name'}</button> {tel(r.customer.phone)}</dd>
          <dt>Done by</dt><dd>{r.provider ? <><button className="linkish" onClick={() => go(`/users?id=${r.provider.user_id}`)}>{r.provider.name}</button> {tel(r.provider.phone)}</> : <span className="muted">nobody</span>}</dd>
        </dl>
      </div>

      <div className="cols">
        <section className="card">
          <h2>Money for this job</h2>
          <dl className="kv wide-kv">
            <dt>Price set by worker</dt><dd>{money(r.agreed_price)}</dd>
            <dt>NiJibu share{r.fee_percent ? ` (${r.fee_percent}%)` : ''}</dt><dd>{money(r.fee_due)}</dd>
            <dt>Worker should get</dt><dd>{money(r.payout_due)}</dd>
            <dt>Customer paid</dt><dd>{check ? money(check.paid) : dash}</dd>
            <dt>Worker paid out</dt><dd>{payout?.status === 'sent' ? money(payout.amount) : money(0)}</dd>
          </dl>
          {check && !check.matches && r.status === 'completed' && payment?.status !== 'paid' && <p><Badge tone="warn">Customer has not paid</Badge></p>}
          {check && !check.matches && payment?.status === 'paid' && <p><Badge tone="bad">Paid amounts do not match the price</Badge></p>}
        </section>
        <section className="card">
          <h2>Timeline</h2>
          <dl className="kv wide-kv">
            <Step label="Requested" at={t.created} />
            <Step label="Accepted" at={t.accepted} />
            <Step label="On the way" at={t.on_the_way} />
            <Step label="Arrived" at={t.arrived} />
            <Step label="Work started" at={t.started} />
            <Step label="Work finished" at={t.completed} />
            <Step label="Customer confirmed" at={t.customer_confirmed} />
            {t.cancelled && <Step label="Cancelled" at={t.cancelled} />}
          </dl>
        </section>
      </div>

      <div className="card flush">
        <h3 className="mini-title">Payment {payment && <>{payment.code} <PayBadge s={payment.status} /></>}</h3>
        {!payment ? <p className="muted">No payment yet.</p> : (
          <>
            <div className="table-wrap"><table className="rt">
              <thead><tr><th>Try</th><th>Result</th><th>Amount</th><th>Network</th><th>Phone</th><th>Reference / reason</th><th>When</th></tr></thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={a.id}>
                    <td data-label="Try">{i + 1}</td>
                    <td data-label="Result"><Badge tone={a.status === 'success' ? 'good' : 'bad'}>{a.status === 'success' ? 'paid' : 'failed'}</Badge></td>
                    <td data-label="Amount">{tzs(a.amount)}</td>
                    <td data-label="Network">{a.network || dash}</td>
                    <td data-label="Phone">{tel(a.phone)}</td>
                    <td data-label="Reference">{a.reference || a.failure || dash}</td>
                    <td data-label="When">{date(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </div>

      <div className="card flush">
        <h3 className="mini-title">Payout to worker {payout && <>{payout.code} <PayBadge s={payout.status} /></>}</h3>
        {!payout ? <p className="muted">Not sent yet.</p> : (
          <div style={{ padding: 14 }}>
            <dl className="kv wide-kv">
              <dt>Amount</dt><dd>{tzs(payout.amount)}</dd>
              <dt>Sent to</dt><dd>{payout.network ? `${payout.network} ${payout.number || ''}` : dash}</dd>
              <dt>Reference / reason</dt><dd>{payout.reference || payout.failure || dash}</dd>
              <dt>Sent</dt><dd>{date(payout.sent_at)}</dd>
              <dt>Worker confirmed received</dt><dd>{date(payout.received_at)}</dd>
            </dl>
            {payout.complaint && <p><Badge tone={payout.complaint_status === 'open' ? 'bad' : 'plain'}>Complaint {payout.complaint_status}</Badge> {payout.complaint}{payout.complaint_note && <span className="muted"> - Admin: {payout.complaint_note}</span>}</p>}
          </div>
        )}
      </div>

      <div className="card flush">
        <h3 className="mini-title">Workers asked</h3>
        {!offers.length ? <p className="muted">No worker was asked.</p> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Worker</th><th>Phone</th><th>Distance</th><th>Answer</th><th>Asked</th></tr></thead>
            <tbody>{offers.map((o, i) => (
              <tr key={i}>
                <td data-label="Worker"><button className="linkish" onClick={() => go(`/users?id=${o.user_id}`)}>{o.name}</button></td>
                <td data-label="Phone">{tel(o.phone)}</td>
                <td data-label="Distance">{o.distance_km} km</td>
                <td data-label="Answer"><Badge tone={o.status === 'accepted' ? 'good' : o.status === 'sent' ? 'warn' : 'plain'}>{o.status}</Badge></td>
                <td data-label="Asked">{date(o.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

export default function Requests({ id }) {
  return id ? <Detail id={id} /> : <List />
}
