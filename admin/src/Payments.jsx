import { useEffect, useState } from 'react'
import { api } from './api'
import { Badge, Modal, Notice, SubTabs, Tabs, Tile } from './ui'
import { ChartCard, Donut, RangeBar, RankBars, StepNote, TimeChart } from './timechart'
import { C, useRange, useSeries } from './chartkit'
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


// The admin sent the money by hand (until Selcom payouts are connected). The worker gets the SMS from Africa's Talking.
function MarkPaidModal({ pay, onClose, onDone }) {
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api(`/api/admin/payouts/${pay.payout_id}/mark-sent`, { method: 'POST', body: { reference: ref } })
      onDone(`${pay.provider_name || 'The worker'} was told by SMS that ${tzs(pay.payout)} was paid.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Mark as paid" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">You sent <strong>{tzs(pay.payout)}</strong> to {pay.provider_name || 'the worker'} by mobile money for {pay.request_code}. An SMS will tell the worker he was paid.</p>
        <label htmlFor="ref">Mobile money transaction ID</label>
        <input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} autoComplete="off" />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy || ref.trim().length < 3}>{busy ? 'Saving...' : 'Mark as paid and send SMS'}</button></div>
      </form>
    </Modal>
  )
}

const PAY_TABS = ['overview', 'jobs', 'registration', 'payouts', 'prices']

// ------------------------------------------------------------ Overview: money in separate parts
function Overview() {
  const { data: m, error, loading } = useLoad('/api/admin/payments/summary')
  const { data: list } = useLoad('/api/admin/payments?page=1')
  const [range, setRange] = useRange('payments', '1m')
  const s = useSeries('/api/admin/series', range)
  if (loading) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  const pts = s.data?.points || []
  return (
    <>
      <div className="grid">
        <Tile label="NiJibu income" value={tzs(m.income.total)} sub={`Commission ${tzs(m.income.commission)} + registration ${tzs(m.income.registration)}`} />
        <Tile label="Paid by customers" value={tzs(m.jobs.gross)} sub={`${fmt(m.jobs.paid)} job payments`} />
        <Tile label="Sent to workers" value={tzs(m.payouts.sent_amount)} sub={`${fmt(m.payouts.sent)} payouts`} />
        <Tile label="Owed to workers" value={tzs(m.payouts.owed_amount)} sub={`${fmt(m.payouts.waiting)} waiting, ${fmt(m.payouts.failed)} failed`} tone={m.payouts.owed_amount ? 'warn' : undefined} />
        <Tile label="Still to collect" value={tzs(m.to_collect.gross)} sub={`${fmt(m.to_collect.jobs)} finished jobs not paid yet`} />
      </div>

      <div className="cols">
        <section className="card">
          <h2>Job payments</h2>
          <dl className="kv wide-kv">
            <Row k="Paid" v={fmt(m.jobs.paid)} />
            <Row k="Waiting for the phone" v={fmt(m.jobs.pending)} />
            <Row k="Failed" v={m.jobs.failed ? <Badge tone="bad">{fmt(m.jobs.failed)}</Badge> : '0'} />
            <Row k="Total from customers" v={tzs(m.jobs.gross)} />
            <Row k="NiJibu commission" v={tzs(m.jobs.commission)} />
            <Row k="Workers' share" v={tzs(m.jobs.for_workers)} />
          </dl>
        </section>
        <section className="card">
          <h2>Registration fees</h2>
          <dl className="kv wide-kv">
            <Row k="Collected" v={tzs(m.registration.collected)} />
            <Row k="Workers who paid" v={fmt(m.registration.paid)} />
            <Row k="Waiting for the phone" v={fmt(m.registration.pending)} />
            <Row k="Declined" v={fmt(m.registration.failed)} />
          </dl>
        </section>
        <section className="card">
          <h2>Payouts to workers</h2>
          <dl className="kv wide-kv">
            <Row k="Sent" v={`${fmt(m.payouts.sent)} (${tzs(m.payouts.sent_amount)})`} />
            <Row k="Waiting" v={fmt(m.payouts.waiting)} />
            <Row k="Failed" v={m.payouts.failed ? <Badge tone="bad">{fmt(m.payouts.failed)}</Badge> : '0'} />
            <Row k="Open complaints" v={m.payouts.complaints ? <Badge tone="bad">{fmt(m.payouts.complaints)}</Badge> : '0'} />
          </dl>
        </section>
      </div>

      <ChartCard title="Money over time" caption="Pick any range and step.">
        <RangeBar value={range} onChange={setRange} note={<StepNote data={s.data} />} />
        {s.error ? <Notice text={s.error} error /> : !s.data ? <p className="muted">Loading...</p> : (
          <TimeChart points={pts} bucket={s.data.bucket} unit="TZS" height={250} series={[
            { key: 'gross', name: 'Paid by customers', color: C.brown },
            { key: 'commission', name: 'NiJibu commission', color: C.green },
            { key: 'registration', name: 'Registration fees', color: C.amber },
            { key: 'payouts_sent', name: 'Sent to workers', color: C.blue },
          ]} />
        )}
      </ChartCard>

      <div className="cols">
        <ChartCard title="Where customer money goes" caption="Paid job payments.">
          <Donut center="TZS" slices={[
            { name: "Workers' share", value: m.jobs.for_workers, color: C.amber },
            { name: 'NiJibu commission', value: m.jobs.commission, color: C.green },
          ]} />
        </ChartCard>
        <ChartCard title="Money by job" caption="Paid by customers, per job.">
          <RankBars format={tzs} items={(list?.by_service || []).slice(0, 8).map((x) => ({ name: x.service, value: x.gross }))} empty="No paid job yet." />
        </ChartCard>
      </div>
    </>
  )
}

// ------------------------------------------------------------ Job payments and payouts (same list, different filters)
function PaymentList({ mode }) {
  const payouts = mode === 'payouts'
  const [status, setStatus] = useState(payouts ? 'payout_open' : '')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [paying, setPaying] = useState(null)
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams({ page: String(page) })
  if (term) params.set('q', term)
  if (payouts) params.set('status', 'paid')
  else if (status === 'failed' || status === 'paid' || status === 'pending') params.set('status', status)
  if (status === 'payout_open') params.set('payout', 'pending')
  if (status === 'payout_failed') params.set('payout', 'failed')
  if (status === 'payout_sent') params.set('payout', 'sent')
  const { data, error, loading, reload } = useLoad(`/api/admin/payments?${params}`)

  async function retry(id) {
    try { await api(`/api/admin/payouts/${id}/retry`, { method: 'POST' }); setNotice({ text: 'Payout tried again.', error: false }); reload() }
    catch (e) { setNotice({ text: e.message, error: true }) }
  }

  const tabs = payouts
    ? [{ id: '', label: 'All' }, { id: 'payout_open', label: 'Waiting' }, { id: 'payout_failed', label: 'Failed' }, { id: 'payout_sent', label: 'Sent' }]
    : [{ id: '', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Waiting for phone' }, { id: 'failed', label: 'Failed' }]

  return (
    <>
      <div className="bar">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1) }} tabs={tabs} />
        <div className="filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, phone or reference" aria-label="Search" />
        </div>
      </div>
      <Notice text={notice.text} error={notice.error} />
      <div className="card flush">
        {loading && !data ? <p className="muted">Loading...</p> : error ? <Notice text={error} error /> : !data.items.length ? <p className="muted">{payouts ? 'No payouts found.' : 'No payments found.'}</p> : (
          <>
            <div className="table-wrap"><table className="rt">
              <thead><tr><th>{payouts ? 'Payout' : 'Payment'}</th><th>Request</th><th>Paid by</th><th>Paid to</th><th>Amount</th><th>NiJibu share</th><th>Worker share</th><th>{payouts ? 'Payout status' : 'Status'}</th>{!payouts && <th>Payout</th>}{payouts && <th>Action</th>}<th>When</th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-label={payouts ? 'Payout' : 'Payment'}><strong>{payouts ? (p.payout_code || p.code) : p.code}</strong><div className="muted small-text">{payouts ? p.code : ''} {p.network || ''} {p.reference || p.failure || ''}</div></td>
                    <td data-label="Request"><button className="linkish" onClick={() => go(`/requests?id=${p.request_id}`)}>{p.request_code}</button><div className="muted small-text">{p.service}</div></td>
                    <td data-label="Paid by"><button className="linkish" onClick={() => go(`/users?id=${p.customer_id}`)}>{p.customer_name || 'No name'}</button></td>
                    <td data-label="Paid to"><button className="linkish" onClick={() => go(`/users?id=${p.provider_user_id}`)}>{p.provider_name}</button></td>
                    <td data-label="Amount">{tzs(p.amount)}</td>
                    <td data-label="NiJibu share">{tzs(p.fee)} <span className="muted">({p.fee_percent}%)</span></td>
                    <td data-label="Worker share">{tzs(p.payout)}</td>
                    {!payouts && <td data-label="Status"><PayBadge s={p.status} />{p.attempts > 1 && <span className="muted small-text"> {p.attempts} tries</span>}</td>}
                    {payouts && <td data-label="Payout status"><PayBadge s={p.payout_status} none="waiting" />{p.complaint_status === 'open' && <> <Badge tone="bad">complaint</Badge></>}{p.payout_failure && <div className="muted small-text">{p.payout_failure}</div>}</td>}
                    {!payouts && (
                      <td data-label="Payout">
                        {p.status === 'paid' ? <PayBadge s={p.payout_status} none="waiting" /> : <span className="muted">-</span>}
                        {p.complaint_status === 'open' && <> <Badge tone="bad">complaint</Badge></>}
                        {p.payout_id && p.payout_status !== 'sent' && <> <button className="small" onClick={() => retry(p.payout_id)}>Try again</button> <button className="small solid" onClick={() => setPaying(p)}>Mark as paid</button></>}
                        {p.payout_failure && <div className="muted small-text">{p.payout_failure}</div>}
                      </td>
                    )}
                    {payouts && (
                      <td data-label="Action">
                        {p.payout_id && p.payout_status !== 'sent' ? <div className="row-actions"><button className="small" onClick={() => retry(p.payout_id)}>Try again</button><button className="small solid" onClick={() => setPaying(p)}>Mark as paid</button></div> : <span className="muted">-</span>}
                      </td>
                    )}
                    <td data-label="When">{ago(p.paid_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
      {paying && <MarkPaidModal pay={paying} onClose={() => setPaying(null)} onDone={(text) => { setPaying(null); setNotice({ text, error: false }); reload() }} />}
    </>
  )
}

// ------------------------------------------------------------ Registration fees: the one-time fee each worker pays after the phone code
function RegistrationFees() {
  const [status, setStatus] = useState('')
  const { data, error, loading } = useLoad(`/api/admin/registration-fees${status ? `?status=${status}` : ''}`)
  if (loading && !data) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  const t = data.totals
  return (
    <>
      <div className="grid">
        <Tile label="Collected" value={tzs(t.collected)} />
        <Tile label="Workers who paid" value={fmt(t.paid)} />
        <Tile label="Waiting for the phone" value={fmt(t.pending)} />
        <Tile label="Declined" value={fmt(t.failed)} />
      </div>
      <div className="bar">
        <Tabs value={status} onChange={setStatus} tabs={[{ id: '', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Waiting for phone' }, { id: 'failed', label: 'Declined' }]} />
      </div>
      <div className="card flush">
        {data.items.length === 0 ? <p className="muted pad">No registration fees found.</p> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Worker</th><th>Amount</th><th>Payment</th><th>When</th></tr></thead>
            <tbody>
              {data.items.map((f) => (
                <tr key={f.id}>
                  <td data-label="Worker">{f.name || <span className="muted">No name</span>}<div className="muted small-text">+{f.phone}</div></td>
                  <td data-label="Amount">{tzs(f.amount)}<div className="muted small-text">{f.pay_phone && f.pay_phone !== f.phone ? `paid from +${f.pay_phone} ` : ''}{f.network || ''} {f.reference || f.failure || ''}</div></td>
                  <td data-label="Payment"><PayBadge s={f.status} /></td>
                  <td data-label="When">{ago(f.paid_at || f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------ Price data
// NiJibu does not set prices yet: the customer and the worker agree. Every agreed price is kept here, so that later NiJibu can set prices.
const DAYS_OPTIONS = [[30, 'Last 30 days'], [90, 'Last 3 months'], [180, 'Last 6 months'], [365, 'Last year'], [3650, 'Since the start']]

function csv(rows) {
  const head = ['Job', 'Jobs with price', 'Done', 'Lowest', 'Median', 'Average', 'Highest', 'Average last 30 days', 'Jobs last 30 days']
  const lines = rows.map((r) => [r.name_en, r.jobs, r.done, r.min, r.median, r.avg, r.max, r.avg_30d, r.jobs_30d].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return [head.join(','), ...lines].join('\n')
}
function download(rows) {
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `nijibu-prices-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Prices() {
  const [days, setDays] = useState(365)
  const [service, setService] = useState('')
  const all = useLoad(`/api/admin/payments/prices?days=${days}`)
  const one = useLoad(`/api/admin/payments/prices?days=${days}${service ? `&service_id=${service}` : ''}`)
  const data = service ? one.data : all.data
  if ((all.loading && !all.data) || (one.loading && !one.data)) return <p className="muted">Loading...</p>
  if (all.error || one.error) return <Notice text={all.error || one.error} error />
  if (!all.data || !data) return null
  const a = data.all
  return (
    <>
      <div className="card note-card">
        <strong>Prices are agreed by the customer and the worker.</strong>
        <p className="muted">NiJibu does not set prices yet. Every agreed price is saved here, with the job, so that later NiJibu can set fair prices.</p>
      </div>
      <div className="bar">
        <div className="filters">
          <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Job">
            <option value="">All jobs</option>
            {all.data.by_service.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            {DAYS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="small" disabled={!all.data.by_service.length} onClick={() => download(all.data.by_service)}>Download CSV</button>
      </div>
      <div className="grid">
        <Tile label="Jobs with a price" value={fmt(a.jobs)} sub={data.without_price ? `${fmt(data.without_price)} had no price` : undefined} />
        <Tile label="Average price" value={a.jobs ? tzs(a.avg) : '-'} />
        <Tile label="Middle price (median)" value={a.jobs ? tzs(a.median) : '-'} />
        <Tile label="Lowest" value={a.jobs ? tzs(a.min) : '-'} />
        <Tile label="Highest" value={a.jobs ? tzs(a.max) : '-'} />
      </div>
      <div className="cols">
        <ChartCard title="Average price by month" caption={service ? 'For the job you chose.' : 'All jobs.'}>
          <TimeChart points={data.trend} bucket="month" kind="bars" unit="TZS" average series={[{ key: 'avg', name: 'Average price', color: C.brown }]} />
        </ChartCard>
        <ChartCard title="Priced jobs by month">
          <TimeChart points={data.trend} bucket="month" kind="bars" series={[{ key: 'jobs', name: 'Jobs with a price', color: C.amber }]} />
        </ChartCard>
      </div>
      <div className="card flush">
        <h3 className="mini-title">Prices by job</h3>
        {all.data.by_service.length === 0 ? <p className="muted">No agreed price in this period.</p> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Job</th><th>Jobs</th><th>Done</th><th>Lowest</th><th>Median</th><th>Average</th><th>Highest</th><th>Average, 30 days</th></tr></thead>
            <tbody>{all.data.by_service.map((r) => (
              <tr key={r.id}>
                <td data-label="Job"><strong>{r.name_en}</strong> <span className="muted">{r.name_sw}</span></td>
                <td data-label="Jobs">{fmt(r.jobs)}</td><td data-label="Done">{fmt(r.done)}</td>
                <td data-label="Lowest">{tzs(r.min)}</td><td data-label="Median">{tzs(r.median)}</td><td data-label="Average"><strong>{tzs(r.avg)}</strong></td><td data-label="Highest">{tzs(r.max)}</td>
                <td data-label="Average, 30 days">{r.jobs_30d ? <>{tzs(r.avg_30d)} <span className="muted small-text">({fmt(r.jobs_30d)} jobs)</span></> : <span className="muted">-</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------ Page: the categories stay at the top
export default function Payments({ initialTab }) {
  const [tab, setTab] = useState(PAY_TABS.includes(initialTab) ? initialTab : 'overview')
  const sum = useLoad('/api/admin/payments/summary')
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'jobs', label: 'Job payments' },
    { id: 'registration', label: 'Registration fees' },
    { id: 'payouts', label: 'Payouts to workers', count: (sum.data?.payouts.failed || 0) + (sum.data?.payouts.complaints || 0) },
    { id: 'prices', label: 'Price data' },
  ]
  return (
    <div className="stack wide">
      <SubTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'jobs' && <PaymentList mode="jobs" />}
      {tab === 'registration' && <RegistrationFees />}
      {tab === 'payouts' && <PaymentList mode="payouts" />}
      {tab === 'prices' && <Prices />}
    </div>
  )
}
