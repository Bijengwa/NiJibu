// Chart components for the admin. The look follows the TMDA Vigilance dashboards: soft area curves with a gradient,
// dashed light grid, no axis lines, round legend dots, a quiet tooltip, and donuts with the total in the middle.
// No chart package: plain SVG, colours from CSS variables (--ch-1 ...) so light and dark both work.
//
// The range is never fixed. RangeBar lets the admin pick 1 day / 1 week / 1 month / 6 months / 1 year,
// or "last N minutes, hours, days, weeks, months, years", or two dates, and the step (minute ... year).
import { useEffect, useId, useRef, useState } from 'react'
import { fmt } from './utils'
import { C, PRESETS, STEPS, UNITS, UNIT_NAME, curve, describe, longLabel, niceScale, shortLabel, short } from './chartkit'

export function RangeBar({ value, onChange, note }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ n: value.n || 3, unit: value.unit || 'day', from: value.from || '', to: value.to || '' })
  const custom = value.mode !== 'preset'
  const badLast = !(Number(draft.n) > 0)
  const badBetween = !draft.from || !draft.to || new Date(draft.from) >= new Date(draft.to)
  const pick = (id) => { setOpen(false); onChange({ ...value, mode: 'preset', preset: id }) }

  return (
    <div className="range">
      <div className="range-row">
        <div className="seg range-seg" role="group" aria-label="Time range">
          {PRESETS.map((p) => (
            <button key={p.id} className={value.mode === 'preset' && value.preset === p.id ? 'on' : ''} onClick={() => pick(p.id)}>{p.label}</button>
          ))}
          <button className={custom || open ? 'on' : ''} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{custom ? describe(value) : 'Custom'}</button>
        </div>
        <label className="range-step">
          <span className="muted">Step</span>
          <select value={value.bucket || 'auto'} onChange={(e) => onChange({ ...value, bucket: e.target.value })} aria-label="Step">
            {STEPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      {open && (
        <div className="range-panel card">
          <div className="range-line">
            <strong>Last</strong>
            <input type="number" min="1" step="1" value={draft.n} onChange={(e) => setDraft({ ...draft, n: e.target.value })} aria-label="How many" className="num" />
            <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} aria-label="Unit">
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_NAME[u]}</option>)}
            </select>
            <button className="small solid" disabled={badLast} onClick={() => { onChange({ ...value, mode: 'last', n: Number(draft.n), unit: draft.unit }); setOpen(false) }}>Show</button>
          </div>
          <div className="range-line">
            <strong>Between</strong>
            <input type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="From" />
            <span className="muted">and</span>
            <input type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="To" />
            <button className="small solid" disabled={badBetween} onClick={() => { onChange({ ...value, mode: 'between', from: draft.from, to: draft.to }); setOpen(false) }}>Show</button>
          </div>
        </div>
      )}
      {note}
    </div>
  )
}

// What to say when the server made the step bigger (for example minutes over one year)
export function StepNote({ data }) {
  return data && data.adjusted ? <p className="muted small-text">Too many points for that step, so the chart uses one {data.bucket} per point.</p> : null
}

export function ChartEmpty({ children = 'Nothing to show in this period.' }) {
  return <div className="chart-empty">{children}</div>
}

// The frame of every chart: a title, one line under it, and the chart
export function ChartCard({ title, caption, action, className = '', children }) {
  return (
    <section className={`card chart-card ${className}`}>
      <div className="chart-card-head">
        <div>
          <h3>{title}</h3>
          {caption && <p className="muted small-text">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ------------------------------------------------------------------ the time chart
//   points: [{ t: '2026-11-04T13:00:00', requests: 3, ... }]   series: [{ key, name, color }]
//   kind: 'area' (trend) or 'bars' (counts per bucket). unit: text after a value in the tooltip. average: legend shows the mean, not the sum
export function TimeChart({ points = [], series, bucket = 'day', kind = 'area', unit = '', height = 230, format = fmt, average = false }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState(null)
  const box = useRef(null)
  const hasData = points.length > 0
  const [W, setW] = useState(640) // drawn at the real width, so text and lines keep their size in narrow and wide boxes
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasData])
  const n = points.length
  const values = points.flatMap((p) => series.map((s) => p[s.key] || 0))
  const { top, step } = niceScale(Math.max(...values, 0))

  const L = 46, R = 14, T = 12, B = 26
  const plotW = W - L - R, plotH = height - T - B
  const x = (i) => (kind === 'bars' ? L + (plotW / n) * (i + 0.5) : L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2))
  const y = (v) => T + plotH - (v / top) * plotH
  const multiDay = n > 0 && points[0].t.slice(0, 10) !== points[n - 1].t.slice(0, 10)
  const every = Math.max(1, Math.ceil(n / 7))
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)

  if (!n || !values.some((v) => v > 0)) return <ChartEmpty>No activity in this period.</ChartEmpty>

  const total = (s) => points.reduce((a, p) => a + (p[s.key] || 0), 0)
  const shown = (s) => (average ? Math.round(total(s) / n) : total(s))

  const onMove = (e) => {
    const r = box.current.getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * W
    const i = kind === 'bars' ? Math.floor(((vx - L) / plotW) * n) : Math.round(((vx - L) / plotW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const barW = Math.max(2, Math.min(34, (plotW / n) * 0.7 / Math.max(1, series.length)))

  return (
    <div className="tchart">
      <ul className="legend dots">
        {series.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.name} <strong>{format(shown(s))}{unit ? ` ${unit}` : ''}</strong></li>)}
      </ul>
      <div className="chart-box" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Chart of ${series.map((s) => s.name).join(', ')}`}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${id}g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={i === 0 ? 0.4 : 0.22} />
                <stop offset="95%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-dash" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis-text">{short(v)}</text>
            </g>
          ))}
          {points.map((p, i) => i % every === 0 && <text key={p.t} x={x(i)} y={height - 7} textAnchor="middle" className="axis-text">{shortLabel(p.t, bucket, multiDay)}</text>)}

          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + plotH} className="cross" />}

          {kind === 'area' && series.map((s, i) => {
            const pts = points.map((p, k) => [x(k), y(p[s.key] || 0)])
            if (n < 2) return null
            const line = curve(pts)
            return (
              <g key={s.key}>
                <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}g${i})`} />
                <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}
          {kind === 'area' && series.map((s) => points.map((p, k) => (
            (n === 1 || (n <= 31 && (p[s.key] > 0 || k === hover)) || k === hover) && <circle key={`${s.key}${k}`} cx={x(k)} cy={y(p[s.key] || 0)} r={k === hover ? 5 : 3} fill={s.color} stroke="var(--card)" strokeWidth="1.5" />
          )))}

          {kind === 'bars' && points.map((p, k) => series.map((s, j) => {
            const v = p[s.key] || 0
            if (!v) return null
            const h = Math.max(1, (v / top) * plotH)
            const bx = x(k) - (barW * series.length) / 2 + j * barW
            return <rect key={`${s.key}${k}`} x={bx} y={y(v)} width={Math.max(1, barW - 1)} height={h} rx="3" fill={s.color} opacity={hover === null || hover === k ? 1 : 0.5} />
          }))}
        </svg>
        {hover !== null && (
          <div className="tip" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / W) * 100))}%` }}>
            <strong>{longLabel(points[hover].t, bucket)}</strong>
            {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.name}: <b>{format(points[hover][s.key] || 0)}{unit ? ` ${unit}` : ''}</b></div>)}
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ donut: how a whole divides, the total in the middle
export function Donut({ slices, center = 'Total', size = 190 }) {
  const visible = slices.filter((s) => s.value > 0)
  const total = visible.reduce((a, s) => a + s.value, 0)
  if (!total) return <ChartEmpty>Nothing yet.</ChartEmpty>
  const R = 42, CIRC = 2 * Math.PI * R
  const starts = visible.map((_, i) => visible.slice(0, i).reduce((a, x) => a + (x.value / total) * CIRC, 0))
  return (
    <div className="donut">
      <div className="donut-ring" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" role="img" aria-label={visible.map((s) => `${s.name} ${s.value}`).join(', ')}>
          <g transform="rotate(-90 50 50)">
            {visible.map((s, i) => {
              const len = Math.max(0, (s.value / total) * CIRC - (visible.length > 1 ? 1.6 : 0))
              return <circle key={s.name} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="13" strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-starts[i]} />
            })}
          </g>
        </svg>
        <div className="donut-mid"><strong>{fmt(total)}</strong><span className="muted">{center}</span></div>
      </div>
      <ul className="legend dots center">
        {visible.map((s) => <li key={s.name}><i style={{ background: s.color }} />{s.name} <strong>{fmt(s.value)}</strong></li>)}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ ranked bars (top jobs, money by job)
export function RankBars({ items, format = fmt, color = C.brown, empty = 'Nothing yet.' }) {
  const max = Math.max(...items.map((i) => i.value), 0)
  if (!items.length || !max) return <ChartEmpty>{empty}</ChartEmpty>
  return (
    <ul className="rankbars">
      {items.map((i) => (
        <li key={i.name}>
          <div className="rb-top"><span>{i.name}</span><strong>{format(i.value)}</strong></div>
          <div className="rb-track"><i style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: i.color || color }} /></div>
        </li>
      ))}
    </ul>
  )
}
