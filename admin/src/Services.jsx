import { useEffect, useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { Badge, Modal, Notice } from './ui'
import { Meter, Sparkline, StackedColumns } from './charts'
import { seriesColor } from './chartColors'
import { fmt, tzs, useLoad } from './utils'
import { PayingOffBar, ProfitSection } from './Profit'

const LEVEL = { ok: ['good', 'Fine'], watch: ['warn', 'Watch'], over: ['bad', 'Over free tier'] }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (key) => { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }
const shift = (key, by) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const LevelBadge = ({ level }) => <Badge tone={LEVEL[level][0]}>{LEVEL[level][1]}</Badge>

// What to do, in one sentence per service
function decision(s, isCurrent) {
  const when = isCurrent ? 'this month' : 'in this month'
  if (s.level === 'over') return `Over the free allowance. Extra cost about ${fmt(s.projected_cost_tzs)} TZS ${when}. Reduce use first. Pay for a higher tier only if this repeats every month.`
  if (s.level === 'watch') return 'Close to the free limit. Do not upgrade yet. Reduce use or watch it every week.'
  if (s.cost_tzs > 0 || s.projected_cost_tzs > 0) return 'Paid by use. The cost is small and steady, so you are fine.'
  return s.calls ? 'You are fine. No payment needed.' : 'Not used yet.'
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`card stat tile${tone ? ` ${tone}` : ''}`}>
      <span className="muted">{label}</span>
      <span className="big">{value}</span>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  )
}

function NumberField({ id, label, value, onChange, hint, step = 'any' }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="muted small-text">{hint}</p>}
    </div>
  )
}

function PriceModal({ service, line, onClose, onSaved }) {
  const [f, setF] = useState({ currency: line.currency, unit_price: String(line.unit_price), percent_fee: String(line.percent_fee), free_units: String(line.free_units) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api(`/api/admin/services/prices/${service.service}/${line.operation}`, { method: 'PUT', body: { currency: f.currency, unit_price: Number(f.unit_price), percent_fee: Number(f.percent_fee), free_units: Number(f.free_units) } })
      onSaved(`${service.label}: ${line.label} price saved.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={`${service.label}: ${line.label}`} onClose={onClose}>
      <form onSubmit={save}>
        {line.note && <p className="muted small-text">{line.note}</p>}
        <label htmlFor="cur">Money used by the provider</label>
        <select id="cur" value={f.currency} onChange={(e) => set('currency')(e.target.value)}><option value="USD">USD (dollars)</option><option value="TZS">TZS (shillings)</option></select>
        <NumberField id="up" label={`Price for one unit (${f.currency})`} value={f.unit_price} onChange={set('unit_price')} hint="One call, or one SMS part. Example: Google place search is 0.032 USD." />
        <NumberField id="pf" label="Percent of the money moved (%)" value={f.percent_fee} onChange={set('percent_fee')} hint="For payment gateways such as Selcom. Leave 0 for the others." />
        <NumberField id="fu" label="Free units every month" value={f.free_units} onChange={set('free_units')} step="1" hint="Calls the provider lets you use for free each month." />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Save price'}</button></div>
      </form>
    </Modal>
  )
}

function SettingsModal({ settings, onClose, onSaved }) {
  const [f, setF] = useState({ usd_to_tzs: String(settings.usd_to_tzs), monthly_budget_tzs: String(settings.monthly_budget_tzs), profit_target_per_job: String(settings.profit_target_per_job), tax_percent: String(settings.tax_percent ?? 0) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/admin/services/settings', { method: 'PUT', body: { usd_to_tzs: Number(f.usd_to_tzs), monthly_budget_tzs: Number(f.monthly_budget_tzs), profit_target_per_job: Number(f.profit_target_per_job), tax_percent: Number(f.tax_percent) } })
      onSaved('Settings saved.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Cost settings" onClose={onClose}>
      <form onSubmit={save}>
        <NumberField id="fx" label="1 US dollar is how many TZS?" value={f.usd_to_tzs} onChange={set('usd_to_tzs')} hint="Used to turn dollar prices (Google) into shillings. Update it when the rate moves." />
        <NumberField id="bud" label="Monthly budget for outside services (TZS)" value={f.monthly_budget_tzs} onChange={set('monthly_budget_tzs')} hint="0 means no budget. You will see a warning when the forecast passes it." />
        <NumberField id="tgt" label="Profit wanted from one job (TZS)" value={f.profit_target_per_job} onChange={set('profit_target_per_job')} hint="NiJibu commission minus outside costs, per finished job." />
        <NumberField id="tax" label="Tax on the profit (%)" value={f.tax_percent} onChange={set('tax_percent')} hint="Share of the profit paid as tax. Ask your accountant which rate applies. 0 means tax is not counted." />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}

function ServiceCard({ s, d, onEdit }) {
  const calls = d.daily.calls_by_service[s.service] || []
  return (
    <section className="card flush svc-card">
      <div className="svc-head">
        <span className="swatch" style={{ background: seriesColor(s.service) }} aria-hidden="true" />
        <h3>{s.label}</h3>
        <LevelBadge level={s.level} />
      </div>
      <p className="svc-decision">{decision(s, d.is_current)}</p>
      <div className="svc-stats">
        <div><span className="muted small-text">Calls</span><strong>{fmt(s.calls)}</strong></div>
        <div><span className="muted small-text">From cache</span><strong>{fmt(s.cached)}</strong></div>
        <div><span className="muted small-text">Failed</span><strong>{fmt(s.errors)}</strong></div>
        <div><span className="muted small-text">Cost so far</span><strong>{tzs(s.cost_tzs)}</strong></div>
        {d.is_current && <div><span className="muted small-text">Expected</span><strong>{tzs(s.projected_cost_tzs)}</strong></div>}
        <div className="svc-spark"><Sparkline values={calls} color={seriesColor(s.service)} today={d.daily.today} /></div>
      </div>
      {s.advice.length > 0 && <ul className="advice">{s.advice.map((a) => <li key={a}>{a}</li>)}</ul>}
      <div className="table-wrap"><table className="rt svc-table">
        <thead><tr><th>What we use</th><th>Calls</th><th>Free allowance</th><th>Cost</th><th>Speed</th><th /></tr></thead>
        <tbody>
          {s.lines.map((l) => (
            <tr key={l.operation}>
              <td data-label="What we use">
                {l.label}
                {!l.verified && (l.unit_price > 0 || l.percent_fee > 0) && <> <Badge tone="warn">assumed price</Badge></>}
                <div className="muted small-text">{l.unit_price > 0 ? `${l.unit_price} ${l.currency} each` : ''}{l.percent_fee > 0 ? `${l.unit_price > 0 ? ' + ' : ''}${l.percent_fee}% of money` : ''}{!l.unit_price && !l.percent_fee ? 'Free' : ''}</div>
              </td>
              <td data-label="Calls">{fmt(l.calls)}{l.errors > 0 && <span className="muted small-text"> ({fmt(l.errors)} failed)</span>}{l.cached > 0 && <div className="muted small-text">{fmt(l.cached)} saved by cache</div>}</td>
              <td data-label="Free allowance">
                {l.free_units > 0 ? (
                  <>
                    <Meter value={l.units} max={l.free_units} tone={l.verdict.level} label={`${l.label} free allowance used`} />
                    <div className="small-text">{fmt(l.units)} of {fmt(l.free_units)} ({l.free_used_pct}%)</div>
                    {d.is_current && l.runs_out_day && <div className="muted small-text">Runs out around day {l.runs_out_day}</div>}
                  </>
                ) : <span className="muted">none</span>}
              </td>
              <td data-label="Cost">{tzs(l.cost_tzs)}{d.is_current && l.projected_cost_tzs !== l.cost_tzs && <div className="muted small-text">expected {tzs(l.projected_cost_tzs)}</div>}</td>
              <td data-label="Speed">{l.avg_ms ? `${fmt(l.avg_ms)} ms` : <span className="muted">-</span>}</td>
              <td><button className="small" onClick={() => onEdit(s, l)}>Edit price</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  )
}

export default function Services() {
  const [month, setMonth] = useState('')
  const [edit, setEdit] = useState(null)
  const [settings, setSettings] = useState(false)
  const [notice, setNotice] = useState('')
  const q = month ? `?month=${month}` : ''
  const { data: d, error, loading, reload } = useLoad(`/api/admin/services/usage${q}`)
  const { data: p, error: pError, reload: reloadProfit } = useLoad(`/api/admin/services/profit${q}`)

  // Usage is written all the time but does not send a "changed" signal: look again every minute
  useEffect(() => { const t = setInterval(() => { reload(); reloadProfit() }, 60000); return () => clearInterval(t) }, [reload, reloadProfit])

  if (loading && !d) return <p className="muted">Loading...</p>
  if (error) return <p className="error">{error}</p>

  const done = (text) => { setEdit(null); setSettings(false); setNotice(text); reload(); reloadProfit() }
  const costSvcs = d.services.filter((s) => s.cost_tzs > 0 || s.projected_cost_tzs > 0)
  const worst = d.services.reduce((w, s) => (['ok', 'watch', 'over'].indexOf(s.level) > ['ok', 'watch', 'over'].indexOf(w) ? s.level : w), 'ok')
  const overList = d.services.filter((s) => s.level === 'over').map((s) => s.label)
  const watchList = d.services.filter((s) => s.level === 'watch').map((s) => s.label)
  const t = d.totals
  const pj = d.per_job
  const left = pj.profit_per_job_tzs
  const bud = p ? p.budget : t.budget
  const budgetTone = bud.level === 'ok' ? '' : bud.level === 'watch' ? 'warn' : 'hot'

  return (
    <div className="stack wide">
      {(() => {
        const nav = (
          <>
            <div className="month-nav">
              <button className="icon-btn" aria-label="Month before" onClick={() => setMonth(shift(d.month, -1))}><Icon name="back" /></button>
              <strong>{monthName(d.month)}</strong>
              <button className="icon-btn" aria-label="Next month" disabled={d.is_current} onClick={() => setMonth(shift(d.month, 1))}><Icon name="next" /></button>
              {d.is_current && <span className="muted small-text">Day {d.day_of_month} of {d.days_in_month}</span>}
            </div>
            <button className="small" onClick={() => setSettings(true)}><Icon name="settings" size={15} /> Settings</button>
          </>
        )
        return p ? <PayingOffBar p={p}>{nav}</PayingOffBar> : <div className="bar">{nav}</div>
      })()}
      <Notice text={notice} />

      {pError && <p className="error">{pError}</p>}
      {p && <ProfitSection p={p} month={d.month} onChanged={done} />}

      <h2 className="section">Outside services</h2>
      <div className={`card verdict ${worst}`} role="status">
        <LevelBadge level={worst} />
        <p>
          {worst === 'over' && <>Over the free allowance: <strong>{overList.join(', ')}</strong>. Reduce use first. Pay for a higher tier only if it stays like this every month.</>}
          {worst === 'watch' && <>Getting close to the free limit: <strong>{watchList.join(', ')}</strong>. No need to pay more now.</>}
          {worst === 'ok' && <>You are fine. Every service is inside its free allowance or costs very little. No higher tier needed.</>}
        </p>
      </div>

      <div className="grid">
        <Tile label="Spent so far (services + plans)" value={tzs(p ? p.now.cost : t.cost_tzs)} sub={d.is_current ? `Expected by month end: ${tzs(p ? p.projected_cost : t.projected_cost_tzs)}` : 'Full month'} />
        <Tile label="Monthly budget" value={t.budget_tzs > 0 ? tzs(t.budget_tzs) : 'Not set'} sub={(p ? p.budget : t.budget).text} tone={budgetTone} />
        <Tile label="Outside cost for one finished job" value={pj.cost_per_job_tzs === null ? '-' : tzs(pj.cost_per_job_tzs)} sub={`${fmt(pj.completed_jobs)} finished jobs`} />
        <Tile
          label="Left from commission, per job"
          value={left === null ? '-' : tzs(left)}
          sub={left === null ? 'No finished jobs yet' : `Commission ${tzs(pj.commission_per_job_tzs)} per job. Target ${tzs(pj.target_per_job_tzs)}`}
          tone={left !== null && left < pj.target_per_job_tzs ? 'warn' : ''}
        />
      </div>
      {t.budget_tzs > 0 && (
        <div className="card">
          <div className="small-text">Budget used: <strong>{bud.used_pct}%</strong> ({tzs(p ? p.now.cost : t.cost_tzs)} of {tzs(t.budget_tzs)})</div>
          <Meter value={p ? p.now.cost : t.cost_tzs} max={t.budget_tzs} tone={bud.level} label="Monthly budget used" />
        </div>
      )}

      <div className="cols">
        <section className="card">
          <h2>Cost every day (TZS)</h2>
          <StackedColumns
            labels={d.daily.days.map(String)}
            series={costSvcs.map((s) => ({ key: s.service, name: s.label, color: seriesColor(s.service), values: (d.daily.cost_by_service[s.service] || []).map((v) => Math.max(0, v)) }))}
            empty="No cost yet this month. The free allowances are covering everything."
          />
        </section>
        <section className="card">
          <h2>Cost in the last 6 months (TZS)</h2>
          <StackedColumns
            markLabel="Month"
            labels={d.months.map((m) => MONTHS[Number(m.month.slice(5)) - 1])}
            series={d.services.filter((s) => d.months.some((m) => m.by_service[s.service] > 0)).map((s) => ({ key: s.service, name: s.label, color: seriesColor(s.service), values: d.months.map((m) => m.by_service[s.service] || 0) }))}
            empty="No cost in the last 6 months."
          />
        </section>
      </div>

      <h2 className="section">Each service</h2>
      <div className="svc-grid">
        {[...d.services].sort((a, b) => Number(b.calls > 0) - Number(a.calls > 0)).map((s) => <ServiceCard key={s.service} s={s} d={d} onEdit={(svc, line) => setEdit({ svc, line })} />)}
      </div>
      <p className="muted small-text">
        Prices marked <em>assumed</em> are placeholders: copy the real price from your contract or invoice with Edit price.
        Google prices were read from Google's price page on 4 Nov 2026. Africa's Talking sends the real cost of every SMS, and that cost is used when it is there.
        Calls answered from our own cache and calls that failed are not charged.
      </p>

      {edit && <PriceModal service={edit.svc} line={edit.line} onClose={() => setEdit(null)} onSaved={done} />}
      {settings && <SettingsModal settings={d.settings} onClose={() => setSettings(false)} onSaved={done} />}
    </div>
  )
}
