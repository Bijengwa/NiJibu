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

// The bar that stays at the top while the page scrolls, with the page's categories.
// tabs: [{ id, label, count?, group? }]. A new `group` starts a small labelled section (for example Customer / Worker).
export function SubTabs({ tabs, value, onChange, right }) {
  return (
    <div className="subbar">
      <div className="subtabs" role="tablist">
        {tabs.map((t, i) => {
          const head = t.group && t.group !== tabs[i - 1]?.group ? <span className="subgroup">{t.group}</span> : null
          return (
            <span key={t.id} className="subtab-wrap">
              {head}
              <button role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
                {t.label}{t.count ? <span className="count">{t.count}</span> : null}
              </button>
            </span>
          )
        })}
      </div>
      {right}
    </div>
  )
}

// One number in a box. href makes the whole box a link. tone: good | warn | bad
export function Tile({ label, value, sub, tone, href }) {
  const body = (
    <>
      <span className="muted">{label}</span>
      <span className="big">{value}</span>
      {sub && <span className="muted small-text">{sub}</span>}
    </>
  )
  const cls = `card stat tile${tone ? ` ${tone}` : ''}`
  return href ? <a href={href} className={`${cls} link-card`}>{body}</a> : <div className={cls}>{body}</div>
}
