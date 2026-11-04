// Small SVG charts with no extra package: stacked columns, a meter and a sparkline.
// Colours come from CSS variables (--series-1 ... in index.css) and follow the service, not its rank.
import { useState } from 'react'
import { fmt } from './utils'


// Round the top of the axis up to 1, 2 or 5 x 10^n so the ticks are easy to read
function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { top: 1, step: 1 / ticks }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  return { top: step * ticks, step }
}

const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)))

// labels: x labels, series: [{ key, name, color, values: [] }]. A column is the sum of all series on that label.
export function StackedColumns({ labels, series, unit = 'TZS', height = 220, markLabel = null, empty = 'Nothing to show yet.' }) {
  const [hover, setHover] = useState(null)
  const [table, setTable] = useState(false)
  const live = series.filter((s) => s.values.some((v) => v > 0))
  const totals = labels.map((_, i) => live.reduce((n, s) => n + (s.values[i] || 0), 0))
  const { top, step } = niceScale(Math.max(...totals, 0))

  const W = 640
  const L = 44, R = 8, T = 10, B = 24
  const plotW = W - L - R, plotH = height - T - B
  const slot = plotW / Math.max(labels.length, 1)
  const barW = Math.max(3, Math.min(28, slot - 4))
  const y = (v) => T + plotH - (v / top) * plotH
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  const everyLabel = Math.ceil(labels.length / 12)

  if (!live.length) return <p className="muted">{empty}</p>

  return (
    <div className="chart">
      <div className="chart-head">
        <ul className="legend">
          {live.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.name}</li>)}
        </ul>
        <button className="small" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>

      {table ? (
        <div className="table-wrap"><table className="rt chart-table">
          <thead><tr><th>{markLabel || 'Day'}</th>{live.map((s) => <th key={s.key}>{s.name}</th>)}<th>Total</th></tr></thead>
          <tbody>{labels.map((l, i) => (
            <tr key={l}><td>{l}</td>{live.map((s) => <td key={s.key}>{fmt(s.values[i] || 0)}</td>)}<td><strong>{fmt(totals[i])}</strong></td></tr>
          ))}</tbody>
        </table></div>
      ) : (
        <div className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Stacked columns of ${unit} by ${live.map((s) => s.name).join(', ')}`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" />
                <text x={L - 6} y={y(v) + 4} textAnchor="end" className="axis-text">{short(v)}</text>
              </g>
            ))}
            {labels.map((l, i) => {
              const cx = L + slot * i + slot / 2
              let acc = 0
              return (
                <g key={l}>
                  {i % everyLabel === 0 && <text x={cx} y={height - 6} textAnchor="middle" className="axis-text">{l}</text>}
                  {live.map((s) => {
                    const v = s.values[i] || 0
                    if (!v) return null
                    const h = Math.max(1, (v / top) * plotH)
                    const yy = y(acc + v)
                    acc += v
                    // 2px of surface colour between stacked pieces
                    return <rect key={s.key} x={cx - barW / 2} y={yy} width={barW} height={Math.max(0, h - 2)} rx="2" fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
                  })}
                  <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} />
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div className="tip" style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%` }}>
              <strong>{markLabel || 'Day'} {labels[hover]}</strong>
              {live.filter((s) => s.values[hover] > 0).map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.name}: {fmt(s.values[hover])} {unit}</div>)}
              <div className="tip-total">Total: {fmt(totals[hover])} {unit}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One number against a limit (free allowance, budget). tone: ok | watch | over
export function Meter({ value, max, tone = 'ok', label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i className={tone} style={{ width: `${pct}%` }} />
    </div>
  )
}

// Daily calls of one service, no axes
export function Sparkline({ values, color, today = null }) {
  const W = 120, H = 28
  const max = Math.max(...values, 1)
  const last = today ? Math.min(today, values.length) : values.length
  const pts = values.slice(0, last).map((v, i) => `${(i / Math.max(values.length - 1, 1)) * W},${H - 2 - (v / max) * (H - 4)}`)
  if (last < 2 || !values.some((v) => v > 0)) return <span className="muted small-text">no calls yet</span>
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calls per day">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Smooth line chart (several series, dots, hover line with all values, legend, table view). Values may be negative.
//   series: [{ key, name, color, values: [] }]   future points (after `until`) are not drawn
export function LineChart({ labels, series, unit = 'TZS', height = 240, until = null, markLabel = 'Day' }) {
  const [hover, setHover] = useState(null)
  const [table, setTable] = useState(false)
  const n = labels.length
  const last = until === null ? n : Math.min(until, n)
  const all = series.flatMap((s) => s.values.slice(0, last))
  const hi = Math.max(...all, 0)
  const lo = Math.min(...all, 0)
  const sc = niceScale(Math.max(hi, -lo, 1), 4)
  const top = hi > 0 ? Math.ceil(hi / sc.step) * sc.step : 0
  const bottom = lo < 0 ? Math.floor(lo / sc.step) * sc.step : 0
  const span = top - bottom || sc.step

  const W = 640, L = 52, R = 14, T = 12, B = 26
  const plotW = W - L - R, plotH = height - T - B
  const x = (i) => L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = (v) => T + plotH - ((v - bottom) / span) * plotH
  const ticks = []
  for (let v = bottom; v <= top + sc.step / 2; v += sc.step) ticks.push(v)
  const every = Math.ceil(n / 10)

  // Smooth curve through the points (Catmull-Rom turned into Bezier). It never goes outside the points' own range by much.
  const path = (vals) => {
    const p = vals.slice(0, last).map((v, i) => [x(i), y(v)])
    if (p.length < 2) return ''
    let d = `M${p[0][0]},${p[0][1]}`
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
    }
    return d
  }

  if (!all.some((v) => v !== 0)) return <p className="muted">Nothing to show yet.</p>

  return (
    <div className="chart">
      <div className="chart-head">
        <ul className="legend">{series.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.name}</li>)}</ul>
        <button className="small" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>
      {table ? (
        <div className="table-wrap"><table className="rt chart-table">
          <thead><tr><th>{markLabel}</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead>
          <tbody>{labels.slice(0, last).map((l, i) => <tr key={l}><td>{l}</td>{series.map((s) => <td key={s.key}>{fmt(s.values[i] || 0)}</td>)}</tr>)}</tbody>
        </table></div>
      ) : (
        <div className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Line chart of ${series.map((s) => s.name).join(', ')} in ${unit}`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid-line zero' : 'grid-line'} />
                <text x={L - 6} y={y(v) + 4} textAnchor="end" className="axis-text">{v < 0 ? '-' : ''}{short(Math.abs(v))}</text>
              </g>
            ))}
            {labels.map((l, i) => i % every === 0 && <text key={l} x={x(i)} y={height - 7} textAnchor="middle" className="axis-text">{l}</text>)}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + plotH} className="cross" />}
            {series.map((s) => <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
            {series.map((s) => s.values.slice(0, last).map((v, i) => (
              (n <= 31 && (n <= 12 || i === hover || i === last - 1)) && <circle key={`${s.key}${i}`} cx={x(i)} cy={y(v)} r={i === hover ? 5 : 3.5} fill={s.color} stroke="var(--card)" strokeWidth="2" />
            )))}
            {labels.slice(0, last).map((l, i) => {
              const w = plotW / Math.max(n - 1, 1)
              return <rect key={l} x={x(i) - w / 2} y={T} width={w} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} />
            })}
          </svg>
          {hover !== null && (
            <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <strong>{markLabel} {labels[hover]}</strong>
              {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.name}: {fmt(s.values[hover] || 0)} {unit}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
