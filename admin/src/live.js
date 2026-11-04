// Live updates: one open connection to the server (/api/admin/events).
// When the server says "something changed", every open page reloads its data (see useLoad in utils.js).
import { getToken } from './api'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const CHANGED = 'nijibu:changed'
const fire = () => window.dispatchEvent(new Event(CHANGED))

// Returns a function that stops it (call it on logout)
export function startLive() {
  let stopped = false
  let ctrl = null

  async function run() {
    let first = true
    while (!stopped) {
      ctrl = new AbortController()
      try {
        const res = await fetch(`${BASE}/api/admin/events`, {
          headers: { Authorization: `Bearer ${getToken()}`, Accept: 'text/event-stream' },
          signal: ctrl.signal,
        })
        if (res.status === 401 || res.status === 403) return // logged out: stop
        if (!res.ok || !res.body) throw new Error('bad')
        if (!first) fire() // we may have missed changes while disconnected
        first = false
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop()
          if (parts.some((p) => p.startsWith('data:'))) fire()
        }
      } catch {
        // network problem: try again below
      }
      if (!stopped) await new Promise((r) => setTimeout(r, 3000))
    }
  }

  run()
  return () => { stopped = true; ctrl?.abort() }
}
