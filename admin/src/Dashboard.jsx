import { Badge } from './ui'
import { fmt, tzs, useLoad } from './utils'

function Action({ label, value, href }) {
  const hot = value > 0
  return (
    <a href={href} className={`card stat link-card${hot ? ' hot' : ''}`}>
      <span className="muted">{label}</span>
      <span className="big">{fmt(value)}</span>
    </a>
  )
}

function Block({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

const Row = ({ k, v }) => (<><dt>{k}</dt><dd>{v}</dd></>)
const pct = (v) => (v === null || v === undefined ? '-' : `${v}%`)
const secs = (s) => (s ? (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`) : '-')

export default function Dashboard() {
  const { data: d, error, loading } = useLoad('/api/admin/summary')
  if (loading) return <p className="muted">Loading...</p>
  if (error) return <p className="error">{error}</p>
  const a = d.needs_action

  return (
    <div className="stack wide">
      <div>
        <h2 className="section">Needs action</h2>
        <div className="grid">
          <Action label="Providers to verify" value={a.providers_pending} href="#/users?group=providers&status=pending" />
          <Action label="Missing jobs" value={a.missing_jobs} href="#/jobs" />
          <Action label="Worker job suggestions" value={a.suggestions} href="#/jobs?tab=suggestions" />
          <Action label="Open complaints" value={a.complaints_open} href="#/complaints" />
          <Action label="Failed payments" value={a.failed_payments} href="#/payments" />
          <Action label="Requests stuck (5+ min)" value={a.stuck_requests} href="#/requests" />
        </div>
      </div>

      <div className="cols">
        <Block title="Money">
          <dl className="kv wide-kv">
            <Row k="Paid today" v={tzs(d.money.today.gross)} />
            <Row k="NiJibu share today" v={tzs(d.money.today.commission)} />
            <Row k="Paid, 7 days" v={tzs(d.money.week.gross)} />
            <Row k="NiJibu share, 7 days" v={tzs(d.money.week.commission)} />
            <Row k="Payouts sent, 7 days" v={tzs(d.money.week.payouts_sent)} />
            <Row k="Payouts waiting" v={d.money.week.payouts_pending ? <Badge tone="warn">{tzs(d.money.week.payouts_pending)}</Badge> : tzs(0)} />
          </dl>
        </Block>
        <Block title="Demand">
          <dl className="kv wide-kv">
            <Row k="Requests today" v={`${fmt(d.demand.today.requests)} (${fmt(d.demand.today.completed)} done)`} />
            <Row k="Requests, 7 days" v={`${fmt(d.demand.week.requests)} (${fmt(d.demand.week.completed)} done)`} />
            <Row k="Completion rate" v={pct(d.demand.week.completion_rate)} />
            <Row k="No provider found" v={pct(d.demand.week.no_provider_rate)} />
            <Row k="Cancelled, 7 days" v={fmt(d.demand.week.cancelled)} />
            <Row k="Time to accept" v={secs(d.demand.week.avg_accept_seconds)} />
          </dl>
        </Block>
        <Block title="Supply">
          <dl className="kv wide-kv">
            <Row k="Online now" v={fmt(d.supply.online)} />
            <Row k="Verified providers" v={fmt(d.supply.verified)} />
          </dl>
        </Block>
      </div>

      <div className="cols">
        <Block title="Most searched jobs, 7 days">
          {d.top_jobs.length === 0 ? <p className="muted">No searches yet.</p> : (
            <ol className="rank">{d.top_jobs.map((j) => <li key={j.id}><span>{j.name_en}</span><strong>{fmt(j.searches)}</strong></li>)}</ol>
          )}
        </Block>
        <Block title="Most asked, not registered">
          {d.top_missing.length === 0 ? <p className="muted">Nothing missing. Good.</p> : (
            <>
              <ol className="rank">{d.top_missing.map((j) => <li key={j.normalized}><span>{j.query}</span><strong>{fmt(j.searches)}</strong></li>)}</ol>
              <a className="more" href="#/jobs">Open Jobs</a>
            </>
          )}
        </Block>
      </div>
    </div>
  )
}
