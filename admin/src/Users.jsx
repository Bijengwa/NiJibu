import { useEffect, useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { Badge, Modal, Notice, SubTabs, Tabs, Tile } from './ui'
import { isSuper } from './session'
import { ChartCard, RangeBar, StepNote, TimeChart } from './timechart'
import { C, useRange, useSeries } from './chartkit'
import { ago, fmt, tzs, useLoad } from './utils'

const tel = (p) => (p ? <a href={`tel:+${p}`}>+{p}</a> : <span className="muted">-</span>)
const when = (iso) => (iso ? ago(iso) : <span className="muted">never</span>)
const STATUS_TONE = { completed: 'good', cancelled: 'bad', verified: 'good', pending: 'warn', rejected: 'bad', paid: 'good', failed: 'bad' }
const StatusBadge = ({ s }) => <Badge tone={STATUS_TONE[s] || 'plain'}>{s}</Badge>
const go = (hash) => { window.location.hash = hash }
// The profile's back arrow returns to the list the admin came from (customers or service providers)
const GROUP_KEY = 'nijibu_users_group'
const lastGroup = () => { try { return sessionStorage.getItem(GROUP_KEY) === 'providers' ? 'providers' : 'customers' } catch { return 'customers' } }
const rememberGroup = (g) => { try { sessionStorage.setItem(GROUP_KEY, g) } catch { /* ignore */ } }

function Pager({ page, size, total, onPage }) {
  const last = Math.max(1, Math.ceil(total / size))
  if (last === 1) return null
  return (
    <div className="pager">
      <button className="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Back</button>
      <span className="muted">Page {page} of {last} ({fmt(total)} people)</span>
      <button className="small" disabled={page >= last} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  )
}

// ------------------------------------------------------------ Customers
function CustomerRows({ items }) {
  return (
    <div className="table-wrap"><table className="rt">
      <thead><tr><th>Person</th><th>Phone</th><th>Requests</th><th>Searches</th><th>Spent</th><th>Last activity</th><th>Joined</th></tr></thead>
      <tbody>
        {items.map((u) => (
          <tr key={u.id}>
            <td data-label="Person">
              <button className="linkish" onClick={() => go(`/users?id=${u.id}`)}><strong>{u.name || 'No name'}</strong></button>
              {u.also_provider && <> <Badge tone="plain">Also provider</Badge></>}
              {u.also_provider && <Jobs jobs={u.jobs} />}
              {u.email && <div className="muted small-text">{u.email}</div>}
            </td>
            <td data-label="Phone">{tel(u.phone)}</td>
            <td data-label="Requests">{fmt(u.requests)} <span className="muted">({fmt(u.completed)} done, {fmt(u.cancelled)} cancelled)</span></td>
            <td data-label="Searches">
              {fmt(u.searches)} {u.failed_searches > 0 && <Badge tone="warn">{fmt(u.failed_searches)} no provider</Badge>}
            </td>
            <td data-label="Spent">{u.spent ? tzs(u.spent) : <span className="muted">-</span>}</td>
            <td data-label="Last activity">{when(u.last_activity)}</td>
            <td data-label="Joined">{ago(u.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// ------------------------------------------------------------ Providers
function RejectModal({ person, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try { await api(`/api/admin/providers/${person.provider_id}/reject`, { method: 'POST', body: { reason } }); onDone(`${person.name || 'Worker'} was rejected.`) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Reject verification" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">The worker is told it was not accepted. Say why, so he can fix it.</p>
        <label htmlFor="why">Reason</label>
        <input id="why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Reject'}</button></div>
      </form>
    </Modal>
  )
}

function Jobs({ jobs }) {
  if (!jobs?.length) return <span className="muted">none</span>
  return <div className="chips">{jobs.map((j) => <span key={j.name} className="chip">{j.name}{j.experience ? ` (${j.experience})` : ''}</span>)}</div>
}

function ProviderRows({ items, onNotice, reload }) {
  const [rejecting, setRejecting] = useState(null)
  async function verify(u) {
    try { await api(`/api/admin/providers/${u.provider_id}/verify`, { method: 'POST' }); onNotice(`${u.name || 'Worker'} is verified.`); reload() }
    catch (e) { onNotice(e.message, true) }
  }
  return (
    <>
      <div className="table-wrap"><table className="rt">
        <thead><tr><th>Worker</th><th>Phone</th><th>Jobs offered</th><th>Verification</th><th>Done</th><th>Earned</th><th>Issues</th><th>Last seen</th><th>Action</th></tr></thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td data-label="Worker">
                <button className="linkish" onClick={() => go(`/users?id=${u.id}`)}><strong>{u.name || 'No name'}</strong></button>
                {u.also_customer && <> <Badge tone="plain">Also customer</Badge></>}
                <div className="muted small-text">{[u.ward, u.district, u.region].filter(Boolean).join(', ') || 'No place yet'}</div>
              </td>
              <td data-label="Phone">{tel(u.phone)}</td>
              <td data-label="Jobs offered"><Jobs jobs={u.jobs} />{u.pending_jobs > 0 && <div className="small-text"><Badge tone="warn">{u.pending_jobs} job not in list</Badge></div>}</td>
              <td data-label="Verification"><StatusBadge s={u.verification_status} /> {u.is_online ? <Badge tone="good">online</Badge> : <Badge tone="plain">off</Badge>}</td>
              <td data-label="Done">{fmt(u.completed)} {u.cancelled > 0 && <span className="muted">({fmt(u.cancelled)} cancelled by him)</span>}</td>
              <td data-label="Earned">{u.earned ? tzs(u.earned) : <span className="muted">-</span>}</td>
              <td data-label="Issues">{u.open_complaints > 0 ? <Badge tone="bad">{u.open_complaints} payout complaint</Badge> : <span className="muted">none</span>}</td>
              <td data-label="Last seen">{when(u.last_seen)}</td>
              <td data-label="Action">
                <div className="row-actions">
                  {isSuper() && u.verification_status !== 'verified' && <button className="small solid" onClick={() => verify(u)}>Verify</button>}
                  {isSuper() && u.verification_status === 'pending' && <button className="small" onClick={() => setRejecting(u)}>Reject</button>}
                  <button className="small" onClick={() => go(`/users?id=${u.id}`)}>Open</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rejecting && <RejectModal person={rejecting} onClose={() => setRejecting(null)} onDone={(t) => { setRejecting(null); onNotice(t); reload() }} />}
    </>
  )
}

// ------------------------------------------------------------ List page
const FILTERS = {
  customers: [['', 'All'], ['active', 'Job in progress'], ['completed', 'Has finished jobs'], ['cancelled', 'Has cancelled'], ['none', 'Never requested']],
  providers: [['', 'All'], ['pending', 'Waiting for verification'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['online', 'Online now']],
}

function List({ initialGroup, initialStatus }) {
  const [group, setGroup] = useState(initialGroup === 'providers' || initialGroup === 'customers' ? initialGroup : lastGroup())
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState(initialStatus || '')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ text: '', error: false })
  const note = (text, error = false) => setNotice({ text, error })

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { rememberGroup(group) }, [group])
  const params = new URLSearchParams({ group, page: String(page) })
  if (term) params.set('q', term)
  if (status) params.set('status', status)
  const { data, error, loading, reload } = useLoad(`/api/admin/people?${params}`)
  const counts = data?.counts

  return (
    <div className="stack wide">
      <p className="muted lead"><Icon name="providers" size={15} /> Everyone using NiJibu. A worker who also asks for services shows in both groups, so you can see how he uses the app.</p>
      <div className="bar sticky-bar">
        <Tabs
          value={group}
          onChange={(g) => { setGroup(g); rememberGroup(g); setStatus(''); setPage(1); note('') }}
          tabs={[
            { id: 'customers', label: 'Customers', count: counts?.customers },
            { id: 'providers', label: 'Service providers', count: counts?.providers },
          ]}
        />
        <div className="filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" aria-label="Search" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter">
            {FILTERS[group].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <Notice text={notice.text} error={notice.error} />
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : !data.items.length ? <p className="muted">No one found.</p> : (
          <>
            {group === 'customers' ? <CustomerRows items={data.items} /> : <ProviderRows items={data.items} onNotice={note} reload={reload} />}
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ One person
function Mini({ head, rows, empty }) {
  return (
    <div className="card flush">
      <h3 className="mini-title">{head}</h3>
      {Array.isArray(rows) && !rows.length ? <p className="muted">{empty}</p> : <div className="table-wrap"><table className="rt">{rows}</table></div>}
    </div>
  )
}

// The first category: who the person is, the main numbers, and activity over any time range
function Overview({ id, data }) {
  const { user, as_customer: c, as_provider: p } = data
  const canSeeMoney = data.money
  const [range, setRange] = useRange('profile', '1m')
  const s = useSeries(`/api/admin/people/${id}/series`, range)
  const pts = s.data?.points || []
  const bucket = s.data?.bucket || 'day'
  const asked = c.stats.requests > 0 || user.role === 'customer'

  return (
    <>
      <div className="card">
        <dl className="kv wide-kv left">
          <dt>Phone</dt><dd>{tel(user.phone)}</dd>
          <dt>Email</dt><dd>{user.email || <span className="muted">-</span>}</dd>
          <dt>Joined</dt><dd>{ago(user.created_at)}</dd>
          {p && <><dt>Works as</dt><dd><Jobs jobs={p.jobs.map((j) => ({ name: j.name_en, experience: j.experience }))} />{p.pending_jobs.length > 0 && <div className="chips">{p.pending_jobs.map((j) => <span key={j.name} className="chip">{j.name} (not in list)</span>)}</div>}</dd></>}
          {p && <><dt>Verification</dt><dd><StatusBadge s={p.profile.verification_status} /> {p.profile.is_online ? <Badge tone="good">online</Badge> : <Badge tone="plain">off</Badge>}{p.profile.rejection_reason && <span className="muted"> {p.profile.rejection_reason}</span>}</dd></>}
          {p && <><dt>Place</dt><dd>{[p.profile.ward, p.profile.district, p.profile.region].filter(Boolean).join(', ') || <span className="muted">-</span>}</dd></>}
          {p && <><dt>Last seen</dt><dd>{when(p.profile.last_seen)}</dd></>}
        </dl>
      </div>

      <div className="grid">
        {asked && <Tile label="Requests made" value={fmt(c.stats.requests)} sub={`${fmt(c.stats.completed)} done, ${fmt(c.stats.cancelled)} cancelled`} />}
        {asked && canSeeMoney && <Tile label="Spent as customer" value={tzs(c.stats.spent)} />}
        {p && <Tile label="Jobs done" value={fmt(p.stats.completed)} sub={`${fmt(p.stats.cancelled)} cancelled by him`} />}
        {p && canSeeMoney && <Tile label="Earned through NiJibu" value={tzs(p.stats.earned)} sub={`Customers paid ${tzs(p.stats.gross)}`} />}
      </div>

      <ChartCard
        title="Activity"
        caption="Choose any range and step. Numbers come straight from the database."
        action={null}
      >
        <RangeBar value={range} onChange={setRange} note={<StepNote data={s.data} />} />
        {s.error ? <Notice text={s.error} error /> : !s.data ? <p className="muted">Loading...</p> : (
          <div className="chart-stack">
            {asked && <TimeChart points={pts} bucket={bucket} kind="bars" series={[
              { key: 'requests', name: 'Requests', color: C.brown },
              { key: 'completed', name: 'Done', color: C.green },
              { key: 'cancelled', name: 'Cancelled', color: C.red },
            ]} />}
            {asked && <TimeChart points={pts} bucket={bucket} kind="bars" height={170} series={[
              { key: 'searches', name: 'Searches', color: C.blue },
              { key: 'misses', name: 'Searched, not a job', color: C.amber },
            ]} />}
            {p && <TimeChart points={pts} bucket={bucket} height={190} series={[
              { key: 'jobs_done', name: 'Jobs done', color: C.green },
              { key: 'jobs_cancelled', name: 'Cancelled by him', color: C.red },
            ]} />}
            {canSeeMoney && (c.stats.spent > 0 || p) && <TimeChart points={pts} bucket={bucket} height={190} unit="TZS" series={[
              ...(asked ? [{ key: 'spent', name: 'Spent', color: C.brown }] : []),
              ...(p ? [{ key: 'earned', name: 'Earned', color: C.amber }] : []),
            ]} />}
          </div>
        )}
      </ChartCard>
    </>
  )
}

function Requests({ c }) {
  return (
    <Mini head="Requests" empty="No requests yet." rows={c.requests.length ? (
      <>
        <thead><tr><th>Job</th><th>Status</th><th>Worker</th><th>Price</th><th>When</th></tr></thead>
        <tbody>{c.requests.map((r) => (
          <tr key={r.id}>
            <td data-label="Job"><button className="linkish" onClick={() => go(`/requests?id=${r.id}`)}>{r.service}</button>{r.address && <div className="muted small-text">{r.address}</div>}</td>
            <td data-label="Status"><StatusBadge s={r.status} />{r.cancel_reason && <div className="muted small-text">{r.cancelled_by}: {r.cancel_reason}</div>}</td>
            <td data-label="Worker">{r.provider ? <>{r.provider} {tel(r.provider_phone)}</> : <span className="muted">none</span>}</td>
            <td data-label="Price">{r.agreed_price ? tzs(r.agreed_price) : <span className="muted">-</span>}</td>
            <td data-label="When">{ago(r.created_at)}</td>
          </tr>
        ))}</tbody>
      </>
    ) : []} />
  )
}

function Searches({ c }) {
  return (
    <Mini head="Searches (found a provider or not)" empty="No searches yet." rows={c.searches.length || c.misses.length ? (
      <>
        <thead><tr><th>Searched</th><th>Result</th><th>When</th></tr></thead>
        <tbody>
          {c.searches.map((s) => (
            <tr key={`s${s.id}`}><td data-label="Searched">{s.service}</td><td data-label="Result">{s.providers_found > 0 ? <Badge tone="good">{s.providers_found} found</Badge> : <Badge tone="warn">no provider</Badge>}</td><td data-label="When">{ago(s.created_at)}</td></tr>
          ))}
          {c.misses.map((m) => (
            <tr key={`m${m.id}`}><td data-label="Searched">{m.query}</td><td data-label="Result"><Badge tone="warn">not a job ({m.status})</Badge></td><td data-label="When">{ago(m.created_at)}</td></tr>
          ))}
        </tbody>
      </>
    ) : []} />
  )
}

function CustomerPayments({ c }) {
  return (
    <>
      {c.spent_by_job.length > 0 && (
        <Mini head="Spent by job" empty="" rows={(
          <>
            <thead><tr><th>Job</th><th>Times</th><th>Spent</th></tr></thead>
            <tbody>{c.spent_by_job.map((j) => <tr key={j.name_en}><td data-label="Job">{j.name_en}</td><td data-label="Times">{fmt(j.jobs)}</td><td data-label="Spent">{tzs(j.spent)}</td></tr>)}</tbody>
          </>
        )} />
      )}
      <Mini head="Payments" empty="No payments yet." rows={c.payments.length ? (
        <>
          <thead><tr><th>Job</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>{c.payments.map((y) => (
            <tr key={y.id}><td data-label="Job">{y.service}</td><td data-label="Amount">{tzs(y.amount)}</td><td data-label="Status"><StatusBadge s={y.status} /></td><td data-label="When">{ago(y.paid_at || y.created_at)}</td></tr>
          ))}</tbody>
        </>
      ) : []} />
    </>
  )
}

function Earnings({ p }) {
  return (
    <>
      <div className="grid">
        <Tile label="Earned through NiJibu" value={tzs(p.stats.earned)} sub={`Customers paid ${tzs(p.stats.gross)}. NiJibu kept ${tzs(p.stats.commission)}`} />
        <Tile label="Average per job" value={tzs(p.stats.avg_per_job)} sub={`His share of ${fmt(p.stats.paid_jobs)} paid jobs`} />
        <Tile label="Still to be paid to him" value={tzs(p.stats.waiting_payout)} sub={p.stats.last_paid ? `Last paid job ${ago(p.stats.last_paid)}` : 'No paid job yet'} />
        <Tile label="Registration fee" value={p.registration_fees.tries ? tzs(p.registration_fees.paid) : 'Not paid'} />
      </div>
      <Mini head="Jobs he did, and what he earned from each" empty="No finished jobs yet." rows={p.by_job.length ? (
        <>
          <thead><tr><th>Job</th><th>Times done</th><th>Cancelled by him</th><th>Customers paid</th><th>NiJibu kept</th><th>He earned</th><th>Average price</th><th>Last done</th></tr></thead>
          <tbody>
            {p.by_job.map((j) => (
              <tr key={j.id}>
                <td data-label="Job"><strong>{j.name_en}</strong> <span className="muted">{j.name_sw}</span></td>
                <td data-label="Times done">{fmt(j.done)}</td>
                <td data-label="Cancelled by him">{j.cancelled ? fmt(j.cancelled) : <span className="muted">0</span>}</td>
                <td data-label="Customers paid">{tzs(j.gross)}</td>
                <td data-label="NiJibu kept">{tzs(j.commission)}</td>
                <td data-label="He earned"><strong>{tzs(j.earned)}</strong></td>
                <td data-label="Average price">{j.avg_price ? tzs(j.avg_price) : '-'}</td>
                <td data-label="Last done">{j.last_done ? ago(j.last_done) : <span className="muted">-</span>}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td><td>{fmt(p.by_job.reduce((n, j) => n + j.done, 0))}</td><td>{fmt(p.by_job.reduce((n, j) => n + j.cancelled, 0))}</td>
              <td>{tzs(p.stats.gross)}</td><td>{tzs(p.stats.commission)}</td><td><strong>{tzs(p.stats.earned)}</strong></td><td /><td />
            </tr>
          </tbody>
        </>
      ) : []} />
    </>
  )
}

function WorkerJobs({ p, showMoney }) {
  return (
    <Mini head="Jobs he was given" empty="No jobs yet." rows={p.recent_jobs.length ? (
      <>
        <thead><tr><th>Job</th><th>Status</th><th>Customer</th><th>Place</th><th>Price</th>{showMoney && <th>His share</th>}<th>When</th></tr></thead>
        <tbody>{p.recent_jobs.map((r) => (
          <tr key={r.id}>
            <td data-label="Job"><button className="linkish" onClick={() => go(`/requests?id=${r.id}`)}>{r.code || `#${r.id}`}</button> {r.service}</td>
            <td data-label="Status"><StatusBadge s={r.status} />{r.cancelled_by && <span className="muted small-text"> by {r.cancelled_by}</span>}</td>
            <td data-label="Customer">{r.customer} {tel(r.customer_phone)}</td>
            <td data-label="Place">{r.address || <span className="muted">-</span>}</td>
            <td data-label="Price">{r.agreed_price ? tzs(r.agreed_price) : '-'}</td>
            {showMoney && <td data-label="His share">{r.payout_due ? tzs(r.payout_due) : '-'}</td>}
            <td data-label="When">{ago(r.created_at)}</td>
          </tr>
        ))}</tbody>
      </>
    ) : []} />
  )
}

function Offered({ p }) {
  return (
    <Mini head="Jobs he offers" empty="No jobs chosen." rows={p.jobs.length || p.pending_jobs.length ? (
      <>
        <thead><tr><th>Job</th><th>Experience</th><th>Availability</th></tr></thead>
        <tbody>
          {p.jobs.map((j) => <tr key={j.name_en}><td data-label="Job">{j.name_en} <span className="muted">{j.name_sw}</span></td><td data-label="Experience">{j.experience || '-'}</td><td data-label="Availability">{j.availability || '-'}</td></tr>)}
          {p.pending_jobs.map((j) => <tr key={j.name}><td data-label="Job">{j.name} <Badge tone="warn">not in list</Badge></td><td data-label="Experience">{j.experience || '-'}</td><td data-label="Availability">{j.availability || '-'}</td></tr>)}
        </tbody>
      </>
    ) : []} />
  )
}

function Places({ p }) {
  return (
    <Mini head="Where he worked (places given by customers)" empty="No finished jobs yet." rows={p.places.length ? (
      <>
        <thead><tr><th>Place</th><th>Jobs</th><th>Last job</th></tr></thead>
        <tbody>{p.places.map((x) => <tr key={x.place}><td data-label="Place">{x.place}</td><td data-label="Jobs">{fmt(x.jobs)}</td><td data-label="Last job">{ago(x.last_done)}</td></tr>)}</tbody>
      </>
    ) : []} />
  )
}

function Payouts({ p }) {
  return (
    <Mini head="Payouts and complaints" empty="No payouts yet." rows={p.payouts.length ? (
      <>
        <thead><tr><th>Amount</th><th>Status</th><th>Worker said</th><th>When</th></tr></thead>
        <tbody>{p.payouts.map((o) => (
          <tr key={o.id}>
            <td data-label="Amount">{tzs(o.amount)}</td>
            <td data-label="Status"><StatusBadge s={o.status} /></td>
            <td data-label="Worker said">{o.complaint ? <><Badge tone={o.complaint_status === 'open' ? 'bad' : 'good'}>{o.complaint_status}</Badge> {o.complaint}{o.complaint_note && <div className="muted small-text">Admin: {o.complaint_note}</div>}</> : o.received_at ? <Badge tone="good">received</Badge> : <span className="muted">no reply yet</span>}</td>
            <td data-label="When">{ago(o.created_at)}</td>
          </tr>
        ))}</tbody>
      </>
    ) : []} />
  )
}

function Detail({ id }) {
  const { data, error, loading } = useLoad(`/api/admin/people/${id}`)
  const [tab, setTab] = useState('overview')
  if (loading) return <p className="muted">Loading...</p>
  if (error) return <div className="stack"><Notice text={error} error /></div>
  const { user, as_customer: c, as_provider: p } = data
  const asked = c.stats.requests > 0 || user.role === 'customer'

  // One category = one tab. They stay at the top while the page scrolls.
  const tabs = [{ id: 'overview', label: 'Overview' }]
  tabs.push({ id: 'requests', label: 'Requests', group: 'Customer' }, { id: 'searches', label: 'Searches', group: 'Customer' })
  if (data.money) tabs.push({ id: 'payments', label: 'Payments', group: 'Customer' })
  if (p) {
    if (data.money) tabs.push({ id: 'earnings', label: 'Earnings', group: 'Worker' })
    tabs.push({ id: 'jobs', label: 'Jobs', group: 'Worker' }, { id: 'offered', label: 'Offered jobs', group: 'Worker' }, { id: 'places', label: 'Places', group: 'Worker' })
    if (data.money) tabs.push({ id: 'payouts', label: 'Payouts', group: 'Worker', count: p.payouts.filter((o) => o.complaint_status === 'open').length })
  }
  const current = tabs.some((t) => t.id === tab) ? tab : 'overview'

  return (
    <div className="stack wide">
      <div className="who">
        <span className="who-mark" aria-hidden="true">{(user.name || '?').trim().charAt(0).toUpperCase()}</span>
        <h2>{user.name || 'No name'}</h2>
        {p && <Badge tone="plain">Service provider</Badge>}
        {asked && <Badge tone="plain">Customer</Badge>}
      </div>
      <SubTabs tabs={tabs} value={current} onChange={setTab} />
      {current === 'overview' && <Overview id={id} data={data} />}
      {current === 'requests' && <Requests c={c} />}
      {current === 'searches' && <Searches c={c} />}
      {current === 'payments' && <CustomerPayments c={c} />}
      {current === 'earnings' && p && <Earnings p={p} />}
      {current === 'jobs' && p && <WorkerJobs p={p} showMoney={data.money} />}
      {current === 'offered' && p && <Offered p={p} />}
      {current === 'places' && p && <Places p={p} />}
      {current === 'payouts' && p && <Payouts p={p} />}
    </div>
  )
}

export default function Users({ id, group, status }) {
  return id ? <Detail id={id} /> : <List initialGroup={group} initialStatus={status} />
}
