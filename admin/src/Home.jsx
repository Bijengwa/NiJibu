import { Badge, Tile } from './ui'
import { ChartCard, Donut, RangeBar, RankBars, StepNote, TimeChart } from './timechart'
import { C, useRange, useSeries } from './chartkit'
import { isSuper, ROLE_LABEL } from './session'
import { fmt, tzs, useLoad } from './utils'

function Action({ label, value, href }) {
  return <Tile label={label} value={fmt(value)} href={href} tone={value > 0 ? 'hot' : undefined} />
}

function Block({ title, children, action }) {
  return (
    <section className="card">
      <div className="block-head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  )
}

const Row = ({ k, v }) => (<><dt>{k}</dt><dd>{v}</dd></>)
const pct = (v) => (v === null || v === undefined ? '-' : `${v}%`)
const secs = (s) => (s ? (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`) : '-')

export default function Home() {
  const { data: d, error, loading } = useLoad('/api/admin/summary')
  const [range, setRange] = useRange('home', '1w')
  const s = useSeries('/api/admin/series', range)
  const sup = isSuper()

  if (loading) return <p className="muted">Loading...</p>
  if (error) return <p className="error">{error}</p>
  const a = d.needs_action
  const t = d.totals
  const pts = s.data?.points || []
  const bucket = s.data?.bucket || 'day'
  const other = Math.max(0, t.requests.total - t.requests.completed - t.requests.cancelled - t.requests.active)

  return (
    <div className="stack wide">
      <div>
        <h2 className="section">Needs action</h2>
        <div className="grid">
          <Action label="Providers to verify" value={a.providers_pending} href="#/users?group=providers&status=pending" />
          <Action label="Missing jobs" value={a.missing_jobs} href="#/jobs" />
          <Action label="Worker job suggestions" value={a.suggestions} href="#/jobs?tab=suggestions" />
          <Action label="Open complaints" value={a.complaints_open} href="#/complaints" />
          {a.failed_payments !== null && <Action label="Failed payments" value={a.failed_payments} href="#/payments" />}
          <Action label="Requests stuck (5+ min)" value={a.stuck_requests} href="#/requests" />
        </div>
      </div>

      <div>
        <h2 className="section">Everything so far</h2>
        <div className="grid">
          <Tile label="Customers" value={fmt(t.users.customers)} sub={`${fmt(t.users.today)} new today, ${fmt(t.users.week)} this week`} href="#/users" />
          <Tile label="Service providers" value={fmt(t.providers.total)} sub={`${fmt(d.supply.verified)} verified, ${fmt(a.providers_pending)} waiting`} href="#/users?group=providers" />
          <Tile label="Requests" value={fmt(t.requests.total)} sub={`${fmt(t.requests.completed)} done, ${fmt(t.requests.cancelled)} cancelled, ${fmt(t.requests.active)} active`} href="#/requests" />
          <Tile label="Complaints" value={fmt(t.complaints.total)} sub={`${fmt(t.complaints.closed)} closed, ${fmt(a.complaints_open)} open`} href="#/complaints" />
          <Tile label="Registered jobs" value={fmt(t.jobs)} href="#/jobs" />
          {sup && <Tile label="NiJibu income" value={tzs(d.money.all.commission + d.registration.all)} sub={`Commission ${tzs(d.money.all.commission)} + registration ${tzs(d.registration.all)}`} href="#/payments" />}
          {sup && <Tile label="Paid by customers" value={tzs(d.money.all.gross)} sub={`${fmt(d.money.all.payments)} payments`} href="#/payments?tab=jobs" />}
          {sup && <Tile label="Staff" value={fmt(d.staff.superadmin + d.staff.support)} sub={`${fmt(d.staff.superadmin)} superadmin, ${fmt(d.staff.support)} customer care`} href="#/staff" />}
        </div>
      </div>

      <ChartCard title="Over time" caption="Pick any range and step. Every number comes from the database.">
        <RangeBar value={range} onChange={setRange} note={<StepNote data={s.data} />} />
        {s.error ? <p className="error">{s.error}</p> : !s.data ? <p className="muted">Loading...</p> : (
          <div className="chart-grid">
            <div>
              <h4 className="chart-sub">Requests</h4>
              <TimeChart points={pts} bucket={bucket} kind="bars" series={[
                { key: 'requests', name: 'Asked', color: C.brown },
                { key: 'completed', name: 'Done', color: C.green },
                { key: 'cancelled', name: 'Cancelled', color: C.red },
              ]} />
            </div>
            <div>
              <h4 className="chart-sub">New people</h4>
              <TimeChart points={pts} bucket={bucket} series={[
                { key: 'new_users', name: 'New users', color: C.brown },
                { key: 'new_workers', name: 'New workers', color: C.amber },
              ]} />
            </div>
            <div>
              <h4 className="chart-sub">Searches</h4>
              <TimeChart points={pts} bucket={bucket} kind="bars" series={[
                { key: 'searches', name: 'Searches', color: C.blue },
                { key: 'searches_empty', name: 'No provider found', color: C.amber },
                { key: 'misses', name: 'Not a job', color: C.red },
              ]} />
            </div>
            <div>
              <h4 className="chart-sub">Complaints</h4>
              <TimeChart points={pts} bucket={bucket} kind="bars" series={[{ key: 'complaints', name: 'New complaints', color: C.red }]} />
            </div>
            {s.data.money && (
              <div className="wide-chart">
                <h4 className="chart-sub">Money (TZS)</h4>
                <TimeChart points={pts} bucket={bucket} unit="TZS" series={[
                  { key: 'gross', name: 'Paid by customers', color: C.brown },
                  { key: 'commission', name: 'NiJibu commission', color: C.green },
                  { key: 'registration', name: 'Registration fees', color: C.amber },
                  { key: 'payouts_sent', name: 'Sent to workers', color: C.blue },
                ]} />
              </div>
            )}
          </div>
        )}
      </ChartCard>

      <div className="cols">
        <ChartCard title="Requests by result" caption="All requests since the start.">
          <Donut center="requests" slices={[
            { name: 'Done', value: t.requests.completed, color: C.green },
            { name: 'Cancelled', value: t.requests.cancelled, color: C.red },
            { name: 'Active', value: t.requests.active, color: C.amber },
            { name: 'No provider', value: other, color: C.grey },
          ]} />
        </ChartCard>
        <ChartCard title="Service providers" caption="By verification.">
          <Donut center="providers" slices={[
            { name: 'Verified', value: d.supply.verified, color: C.green },
            { name: 'Waiting', value: a.providers_pending, color: C.amber },
            { name: 'Rejected', value: t.providers.rejected, color: C.red },
          ]} />
        </ChartCard>
        {sup && (
          <ChartCard title="Staff" caption="Accounts that can use this portal.">
            <Donut center="staff" slices={[
              { name: 'Superadmin', value: d.staff.superadmin, color: C.brown },
              { name: 'Customer care', value: d.staff.support, color: C.amber },
              { name: 'Switched off', value: d.staff.disabled, color: C.grey },
            ]} />
          </ChartCard>
        )}
      </div>

      <div className="cols">
        {sup && (
          <Block title="Money">
            <dl className="kv wide-kv">
              <Row k="Paid today" v={tzs(d.money.today.gross)} />
              <Row k="NiJibu share today" v={tzs(d.money.today.commission)} />
              <Row k="Paid, 7 days" v={tzs(d.money.week.gross)} />
              <Row k="NiJibu share, 7 days" v={tzs(d.money.week.commission)} />
              <Row k="Paid, since the start" v={tzs(d.money.all.gross)} />
              <Row k="Payouts sent, 7 days" v={tzs(d.money.week.payouts_sent)} />
              <Row k="Payouts waiting" v={d.money.all.payouts_waiting ? <Badge tone="warn">{tzs(d.money.all.payouts_waiting)}</Badge> : tzs(0)} />
            </dl>
          </Block>
        )}
        {sup && (
          <Block title="Registration fees" action={<a className="more" href="#/payments?tab=registration">Open</a>}>
            <dl className="kv wide-kv">
              <Row k="Today" v={tzs(d.registration.today)} />
              <Row k="7 days" v={tzs(d.registration.week)} />
              <Row k="Since the start" v={tzs(d.registration.all)} />
              <Row k="Workers who paid" v={fmt(d.registration.paid)} />
              <Row k="Waiting for the phone" v={fmt(d.registration.pending)} />
            </dl>
          </Block>
        )}
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
            <Row k="Waiting for verification" v={fmt(a.providers_pending)} />
            <Row k="New workers, 7 days" v={fmt(t.providers.week)} />
          </dl>
        </Block>
        {sup && (
          <Block title="Prices people agreed" action={<a className="more" href="#/payments?tab=prices">Open</a>}>
            <p className="muted small-text">Workers and customers agree the price themselves. We keep the numbers, so NiJibu can set prices later.</p>
            {d.prices.priced_jobs ? (
              <dl className="kv wide-kv">
                <Row k="Jobs with a price" v={fmt(d.prices.priced_jobs)} />
                <Row k="Average" v={tzs(d.prices.avg)} />
                <Row k="Middle (median)" v={tzs(d.prices.median)} />
                <Row k="Lowest" v={tzs(d.prices.min)} />
                <Row k="Highest" v={tzs(d.prices.max)} />
              </dl>
            ) : <p className="muted">No agreed price yet.</p>}
          </Block>
        )}
        {sup && (
          <Block title="Staff team" action={<a className="more" href="#/staff">Manage</a>}>
            <ul className="rank">
              {d.staff.items.map((x) => (
                <li key={x.id}><span>{x.name || 'No name'}</span><span>{x.disabled ? <Badge tone="plain">off</Badge> : <Badge tone={x.role === 'superadmin' ? 'good' : 'warn'}>{ROLE_LABEL[x.role]}</Badge>}</span></li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      <div className="cols">
        <ChartCard title="Most searched jobs, 7 days">
          <RankBars items={d.top_jobs.map((j) => ({ name: j.name_en, value: j.searches }))} empty="No searches yet." />
        </ChartCard>
        <ChartCard title="Most asked, not registered" action={<a className="more" href="#/jobs">Open Jobs</a>}>
          <RankBars color={C.amber} items={d.top_missing.map((j) => ({ name: j.query, value: j.searches }))} empty="Nothing missing. Good." />
        </ChartCard>
      </div>
    </div>
  )
}
