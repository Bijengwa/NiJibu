import { useEffect, useState } from 'react'
import { api } from './api'
import { CHANGED } from './live'

export const fmt = (n) => Number(n || 0).toLocaleString('en-US')
export const tzs = (n) => `${fmt(n)} TZS`
export const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

// Load a GET path. Changing the path loads again; reload() refreshes after an action.
export function useLoad(path) {
  const [state, setState] = useState({ path: null, data: null, error: '' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    api(path)
      .then((data) => live && setState({ path, data, error: '' }))
      .catch((e) => live && setState({ path, data: null, error: e.message }))
    return () => { live = false }
  }, [path, tick])
  // The server says something changed: load again quietly (the old data stays on screen until the new arrives)
  useEffect(() => {
    let wait = null
    const on = () => { clearTimeout(wait); wait = setTimeout(() => setTick((t) => t + 1), 150) }
    window.addEventListener(CHANGED, on)
    return () => { window.removeEventListener(CHANGED, on); clearTimeout(wait) }
  }, [])
  const loading = state.path !== path
  return { data: loading ? null : state.data, error: loading ? '' : state.error, loading, reload: () => setTick((t) => t + 1) }
}
