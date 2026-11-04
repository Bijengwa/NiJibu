// Plain helpers for the charts: colours, the saved time range, the series loader, labels and curve maths.
import { useState } from 'react'
import { useLoad } from './utils'

export const C = { brown: 'var(--ch-1)', amber: 'var(--ch-2)', green: 'var(--ch-3)', blue: 'var(--ch-4)', red: 'var(--ch-5)', grey: 'var(--ch-6)' }

// ------------------------------------------------------------------ range
export const PRESETS = [
  { id: '1d', label: '1 day', n: 1, unit: 'day' },
  { id: '1w', label: '1 week', n: 1, unit: 'week' },
  { id: '1m', label: '1 month', n: 1, unit: 'month' },
  { id: '6m', label: '6 months', n: 6, unit: 'month' },
  { id: '1y', label: '1 year', n: 1, unit: 'year' },
]
export const UNITS = ['minute', 'hour', 'day', 'week', 'month', 'year']
export const UNIT_NAME = { minute: 'minutes', hour: 'hours', day: 'days', week: 'weeks', month: 'months', year: 'years' }
export const STEPS = [['auto', 'Auto'], ...UNITS.map((u) => [u, `Per ${u}`])]

export const preset = (id) => PRESETS.find((p) => p.id === id) || PRESETS[1]
const read = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(`nijibu_range_${key}`)); return v && typeof v === 'object' ? v : fallback } catch { return fallback }
}

// A saved range: { mode: 'preset' | 'last' | 'between', preset, n, unit, from, to, bucket }
export function useRange(key, defPreset = '1w') {
  const [range, setRange] = useState(() => {
    const r = read(key, null)
    const ok = r && ['preset', 'last', 'between'].includes(r.mode)
    return ok ? { bucket: 'auto', ...r } : { mode: 'preset', preset: defPreset, bucket: 'auto' }
  })
  const set = (r) => {
    setRange(r)
    try { localStorage.setItem(`nijibu_range_${key}`, JSON.stringify(r)) } catch { /* ignore */ }
  }
  return [range, set]
}

// The address part for the server. "Last N unit" is sent as it is, so the end is always "now" when the page reloads.
export function rangeQuery(r) {
  const p = new URLSearchParams()
  if (r.mode === 'between' && r.from && r.to && !Number.isNaN(new Date(r.from)) && !Number.isNaN(new Date(r.to)) && new Date(r.from) < new Date(r.to)) {
    p.set('from', new Date(r.from).toISOString())
    p.set('to', new Date(r.to).toISOString())
  } else if (r.mode === 'last' && Number(r.n) > 0 && UNITS.includes(r.unit)) {
    p.set('last', String(Number(r.n)))
    p.set('unit', r.unit)
  } else {
    const x = r.mode === 'preset' ? preset(r.preset) : preset('1m')
    p.set('last', String(x.n))
    p.set('unit', x.unit)
  }
  if (UNITS.includes(r.bucket)) p.set('bucket', r.bucket)
  return p.toString()
}

export const describe = (r) => {
  if (r.mode === 'preset') return preset(r.preset).label
  if (r.mode === 'last') return `Last ${r.n} ${UNIT_NAME[r.unit]}`
  return 'Custom dates'
}

// Loads a series for the chosen range. The old chart stays on screen while the new one loads.
export function useSeries(path, range) {
  const { data, error, loading } = useLoad(`${path}?${rangeQuery(range)}`)
  const [prev, setPrev] = useState(null)
  if (data && data !== prev) setPrev(data) // keep the last good data while the next range loads
  return { data: data || prev, error, loading }
}

// ------------------------------------------------------------------ labels (keys look like 2026-11-04T13:00:00, Tanzania time)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const part = (k) => {
  const [d, t] = k.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':')
  return { y, m, day, hh, mm, wd: new Date(Date.UTC(y, m - 1, day)).getUTCDay() }
}
export function shortLabel(k, bucket, multiDay) {
  const p = part(k)
  if (bucket === 'minute' || bucket === 'hour') return multiDay ? `${p.day} ${MON[p.m - 1]} ${p.hh}:${p.mm}` : `${p.hh}:${p.mm}`
  if (bucket === 'day' || bucket === 'week') return `${p.day} ${MON[p.m - 1]}`
  if (bucket === 'month') return `${MON[p.m - 1]} ${p.y}`
  return String(p.y)
}
export function longLabel(k, bucket) {
  const p = part(k)
  if (bucket === 'minute' || bucket === 'hour') return `${DAYS[p.wd]} ${p.day} ${MON[p.m - 1]}, ${p.hh}:${p.mm}`
  if (bucket === 'day') return `${DAYS[p.wd]} ${p.day} ${MON[p.m - 1]} ${p.y}`
  if (bucket === 'week') return `Week of ${p.day} ${MON[p.m - 1]} ${p.y}`
  if (bucket === 'month') return `${MON[p.m - 1]} ${p.y}`
  return String(p.y)
}

// ------------------------------------------------------------------ drawing helpers
export function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { top: 1, step: 1 / ticks }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  return { top: step * ticks, step }
}
export const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n * 10) / 10))

// A smooth curve that never goes below or above its own points (monotone cubic)
export function curve(p) {
  const n = p.length
  if (n < 2) return ''
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i] }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`
  }
  return d
}

