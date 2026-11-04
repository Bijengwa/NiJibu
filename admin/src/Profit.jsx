import { useState } from 'react'
import { api } from './api'
import { Badge, Modal, Notice } from './ui'
import { LineChart } from './charts'
import { fmt, tzs } from './utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SERVICES = [['google_maps', 'Google Maps'], ['africastalking', "Africa's Talking"], ['selcom', 'Selcom'], ['whatsapp', 'WhatsApp'], ['', 'Other cost (hosting, domain, ...)']]
const sign = (n) => (n < 0 ? `-${fmt(-n)}` : fmt(n))
// Money in = blue, money out = orange, what is left = green (fixed slots from index.css)
const C = { revenue: 'var(--series-1)', cost: 'var(--series-2)', net: 'var(--series-3)' }

// The always-visible strip at the top of the Services page: is the work paying off?
export function PayingOffBar({ p, children }) {
  const n = p.now
  const up = n.net >= 0
  return (
    <div className="svc-sticky" role="region" aria-label="Profit summary">
      <div className="svc-sticky-row">{children}</div>
      <div className="svc-sticky-stats">
        <div><span className="muted small-text">Money in</span><strong>{tzs(n.revenue)}</strong></div>
        <div><span className="muted small-text">Costs</span><strong>{tzs(n.cost)}</strong></div>
        <div className={up ? 'good' : 'bad'}><span className="muted small-text">Profit after tax</span><strong>{sign(n.net)} TZS</strong></div>
        <div><span className="muted small-text">Jobs paid</span><strong>{fmt(n.jobs)}</strong></div>
        <div><span className="muted small-text">Budget used</span><strong>{p.budget.used_pct === null ? '-' : `${p.budget.used_pct}%`}</strong></div>
        <Badge tone={up ? 'good' : n.revenue > 0 ? 'warn' : 'plain'}>{up ? 'Paying off' : n.revenue > 0 ? 'Not paying off yet' : 'No income yet'}</Badge>
      </div>
    </div>
  )
}

function ExpenseModal({ month, onClose, onSaved }) {
  const [f, setF] = useState({ label: '', service: 'google_maps', amount: '', currency: 'USD', from_month: month, ongoing: true, to_month: month, replaces_usage: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const preset = (label, amount) => setF((x) => ({ ...x, label, amount: String(amount), currency: 'USD', service: 'google_maps', replaces_usage: true }))
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/admin/services/expenses', { method: 'POST', body: { label: f.label, service: f.service, amount: Number(f.amount), currency: f.currency, from_month: f.from_month, to_month: f.ongoing ? null : f.to_month, replaces_usage: !!f.service && f.replaces_usage } })
      onSaved('Saved. The profit numbers are updated.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Add a plan or monthly cost" onClose={onClose}>
      <form onSubmit={save}>
        <p className="muted small-text">Quick fill for Google Maps:</p>
        <div className="actions left"><button type="button" className="small" onClick={() => preset('Google Maps plan (USD 100)', 100)}>USD 100 a month</button><button type="button" className="small" onClick={() => preset('Google Maps plan (USD 275)', 275)}>USD 275 a month</button></div>
        <label htmlFor="xl">Name</label>
        <input id="xl" value={f.label} onChange={(e) => set('label')(e.target.value)} placeholder="Example: Server hosting" required />
        <label htmlFor="xs">Which service is it for?</label>
        <select id="xs" value={f.service} onChange={(e) => set('service')(e.target.value)}>{SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {f.service && (
          <label className="check"><input type="checkbox" checked={f.replaces_usage} onChange={(e) => set('replaces_usage')(e.target.checked)} /> This plan covers the calls (do not add the pay-per-call cost on top)</label>
        )}
        <label htmlFor="xa">Amount every month</label>
        <div className="inline"><input id="xa" type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={(e) => set('amount')(e.target.value)} required />
          <select aria-label="Currency" value={f.currency} onChange={(e) => set('currency')(e.target.value)}><option value="USD">USD</option><option value="TZS">TZS</option></select></div>
        <label htmlFor="xf">First month</label>
        <input id="xf" type="month" value={f.from_month} onChange={(e) => set('from_month')(e.target.value)} required />
        <label className="check"><input type="checkbox" checked={f.ongoing} onChange={(e) => set('ongoing')(e.target.checked)} /> Still running (no end month)</label>
        {!f.ongoing && <><label htmlFor="xt">Last month</label><input id="xt" type="month" value={f.to_month} onChange={(e) => set('to_month')(e.target.value)} /></>}
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}

export function ProfitSection({ p, month, onChanged }) {
  const [adding, setAdding] = useState(false)
  const n = p.now
  const pj = p.per_job
  const labels = p.months.map((m) => MONTHS[Number(m.month.slice(5)) - 1])

  async function stop(plan) {
    const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1))
    const last = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
    if (last < plan.from_month) { await api(`/api/admin/services/expenses/${plan.id}`, { method: 'DELETE' }) } else { await api(`/api/admin/services/expenses/${plan.id}`, { method: 'PUT', body: { to_month: last } }) }
    onChanged('Stopped from this month.')
  }

  return (
    <>
      <h2 className="section">Profit</h2>
      <div className="grid">
        <div className="card stat tile"><span className="muted">Commission (13%)</span><span className="big">{tzs(n.commission)}</span><span className="muted small-text">{fmt(n.jobs)} paid jobs, {tzs(n.gross)} moved</span></div>
        <div className="card stat tile"><span className="muted">Registration fees</span><span className="big">{tzs(n.reg_fees)}</span><span className="muted small-text">{fmt(n.workers_paid)} new workers. All profit, no NIDA cost.</span></div>
        <div className="card stat tile"><span className="muted">Costs</span><span className="big">{tzs(n.cost)}</span><span className="muted small-text">Outside services {tzs(n.usage_cost)} + plans {tzs(n.fixed_cost)}</span></div>
        <div className={`card stat tile${n.net < 0 ? ' hot' : ''}`}><span className="muted">Profit after tax</span><span className="big">{sign(n.net)} TZS</span><span className="muted small-text">Before tax {sign(n.profit_before_tax)}. Tax {p.settings.tax_percent}% = {tzs(n.tax)}</span></div>
      </div>

      <div className="cols">
        <section className="card">
          <h2>Last 6 months (TZS)</h2>
          <LineChart markLabel="Month" labels={labels} series={[
            { key: 'revenue', name: 'Money in', color: C.revenue, values: p.months.map((m) => m.revenue) },
            { key: 'cost', name: 'Costs', color: C.cost, values: p.months.map((m) => m.cost) },
            { key: 'net', name: 'Profit after tax', color: C.net, values: p.months.map((m) => m.net) },
          ]} />
        </section>
        <section className="card">
          <h2>This month, day by day (TZS)</h2>
          <LineChart labels={p.daily.days.map(String)} until={p.daily.today} series={[
            { key: 'income', name: 'Money in', color: C.revenue, values: p.daily.income },
            { key: 'cost', name: 'Usage cost', color: C.cost, values: p.daily.usage_cost },
            { key: 'run', name: 'Running profit (before tax)', color: C.net, values: p.daily.running_profit },
          ]} />
        </section>
      </div>

        <section className="card flush">
          <h3 className="mini-title">One job, on average</h3>
          {pj.jobs === 0 ? <p className="muted pad">No paid jobs this month yet.</p> : (
            <dl className="kv wide-kv pad">
              <dt>Job price</dt><dd>{tzs(pj.avg_price)}</dd>
              <dt>NiJibu commission</dt><dd>{tzs(pj.commission)}</dd>
              <dt>Outside services (payments, SMS, maps)</dt><dd>- {tzs(pj.usage_cost)}</dd>
              <dt>Left from one job</dt><dd><strong>{tzs(pj.margin)}</strong></dd>
              <dt>Plans and monthly costs, shared per job</dt><dd>- {tzs(pj.fixed_cost)}</dd>
              <dt>Profit after tax, per job</dt><dd><strong>{sign(pj.net)} TZS</strong></dd>
            </dl>
          )}
          {p.break_even_jobs !== null && <p className="small-text pad">To pay the plans and monthly costs you need about <strong>{fmt(p.break_even_jobs)} paid jobs</strong> a month at this margin.</p>}
          {p.break_even_jobs === null && pj.jobs > 0 && <p className="small-text pad">Each job leaves nothing after outside costs. Check the commission and the service costs.</p>}
        </section>
        <section className="card flush">
          <h3 className="mini-title">Each job type this month</h3>
          {p.by_type.length === 0 ? <p className="muted pad">No paid jobs this month yet.</p> : (
            <div className="table-wrap"><table className="rt">
              <thead><tr><th>Job</th><th>Jobs</th><th>Commission</th><th>Costs</th><th>Left per job</th></tr></thead>
              <tbody>{p.by_type.map((t) => (
                <tr key={t.name}><td data-label="Job">{t.name}<div className="muted small-text">avg price {tzs(t.avg_price)}</div></td><td data-label="Jobs">{fmt(t.jobs)}</td><td data-label="Commission">{tzs(t.commission)}</td><td data-label="Costs">{tzs(t.gateway_cost + t.sms_cost)}</td><td data-label="Left per job"><strong>{tzs(t.profit_per_job)}</strong></td></tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="muted small-text pad">Costs here are the payment fees (Selcom) and the SMS for these jobs. Plans are not shared out by job type.</p>
        </section>

      <section className="card flush">
        <div className="svc-head"><h3>Plans and monthly costs</h3><button className="small solid" onClick={() => setAdding(true)}>Add</button></div>
        {p.plans.length === 0 ? <p className="muted pad">None yet. Add the Google Maps plan you pay for (USD 100 or 275 a month), hosting and other fixed costs, so the profit is true.</p> : (
          <div className="table-wrap"><table className="rt">
            <thead><tr><th>Name</th><th>Every month</th><th>Pay per call would be</th><th /></tr></thead>
            <tbody>{p.plans.map((pl) => {
              const better = pl.replaces_usage && pl.pay_per_use_tzs !== null
              return (
                <tr key={pl.id}>
                  <td data-label="Name">{pl.label}<div className="muted small-text">from {pl.from_month}{pl.to_month ? ` to ${pl.to_month}` : ', still running'}</div></td>
                  <td data-label="Every month">{tzs(pl.tzs)}{pl.currency === 'USD' && <div className="muted small-text">USD {fmt(pl.amount)}</div>}</td>
                  <td data-label="Pay per call would be">{better ? (<>{tzs(pl.pay_per_use_tzs)} {pl.pay_per_use_tzs < pl.tzs ? <Badge tone="warn">plan costs more</Badge> : <Badge tone="good">plan is cheaper</Badge>}</>) : <span className="muted">-</span>}</td>
                  <td><button className="small" onClick={() => stop(pl)}>Stop</button></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
        <p className="muted small-text pad">A plan only pays off when the pay-per-call cost of the same month is higher than the plan price. Tax is set in Settings.</p>
      </section>
      {adding && <ExpenseModal month={month} onClose={() => setAdding(false)} onSaved={(t) => { setAdding(false); onChanged(t) }} />}
    </>
  )
}
