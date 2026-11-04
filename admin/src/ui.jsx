import { useEffect, useRef } from 'react'
import { Icon } from './icons'

export function Trend({ value }) {
  if (value === null || value === undefined) return <span className="muted">new</span>
  if (value === 0) return <span className="muted">0%</span>
  return <span className={value > 0 ? 'up' : 'down'}>{value > 0 ? '+' : ''}{value}%</span>
}

export function Badge({ tone = 'plain', children }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, select, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Notice({ text, error }) {
  if (!text) return null
  return <p className={error ? 'error' : 'ok'} role={error ? 'alert' : 'status'}>{text}</p>
}
