import { useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { Badge, Modal, Notice, Tabs, Trend } from './ui'
import { ago, fmt, tzs, useLoad } from './utils'

const DAYS = [7, 30, 90]
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const toWords = (v) => v.split(/[,\n]/).map((w) => w.trim()).filter(Boolean)
const mapLink = (a) => `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=15/${a.lat}/${a.lng}`

// ------------------------------------------------------------ 1) Registered
// One form for both: register a new job (job = null) or edit one.
// A rename changes the name for everyone at once. The workers who chose the job get an SMS and a notification.
function JobModal({ job, onClose, onDone }) {
  const [sw, setSw] = useState(job?.name_sw || '')
  const [en, setEn] = useState(job?.name_en || '')
  const [words, setWords] = useState((job?.aliases || []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const renaming = !!job && (sw.trim() !== job.name_sw || en.trim() !== job.name_en)
  const toList = () => words.split(/[,\n]/).map((w) => w.trim()).filter(Boolean)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (job) {
        const body = { name_sw: sw, name_en: en, aliases: toList() }
        const r = await api(`/api/admin/services/${job.id}`, { method: 'PATCH', body })
        onDone(r.renamed ? `Saved. ${r.workers_notified} worker(s) told about the new name.` : 'Saved.')
      } else {
        await api('/api/admin/services', { method: 'POST', body: { name_sw: sw, name_en: en, aliases: toList() } })
        onDone(`Registered "${en}".`)
      }
    } catch (err) {
      setError(err.status === 409 ? 'A job with this name already exists. Use that job, or change the name.' : err.message)
    } finally { setBusy(false) }
  }

  return (
    <Modal title={job ? 'Edit job' : 'Register a new job'} onClose={onClose}>
      <form onSubmit={submit}>
        {!job && <p className="muted">The job appears in the list for customers and workers right away.</p>}
        <label htmlFor="jsw">Name in Swahili</label>
        <input id="jsw" value={sw} onChange={(e) => setSw(e.target.value)} maxLength={80} required />
        <label htmlFor="jen">Name in English</label>
        <input id="jen" value={en} onChange={(e) => setEn(e.target.value)} maxLength={80} required />
        <label htmlFor="jwords">Other words customers type (separate with commas)</label>
        <input id="jwords" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. kufua, laundry" />
        {renaming && (
          <p className="small-text">
            <Badge tone="warn">Name change</Badge>{' '}
            {job.workers_linked > 0
              ? `${fmt(job.workers_linked)} worker(s) with this job get an SMS and a notification. The old name stays as a search word.`
              : 'No worker has this job yet. The old name stays as a search word.'}
          </p>
        )}
        <Notice text={error} error />
        <div className="actions">
          <button type="button" className="small" onClick={onClose}>Cancel</button>
          <button className="small solid" disabled={busy}>{busy ? 'Saving...' : job ? 'Save' : 'Register job'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Registered({ days, onNotice }) {
  const { data, error, loading, reload } = useLoad(`/api/admin/jobs/registered?days=${days}`)
  const [busy, setBusy] = useState(0)
  const [modal, setModal] = useState(null) // { job } : job = null means a new job

  async function toggle(j) {
    setBusy(j.id)
    try {
      await api(`/api/admin/services/${j.id}`, { method: 'PATCH', body: { active: !j.active } })
      reload()
    } catch (e) { onNotice(e.message, true) } finally { setBusy(0) }
  }

  if (loading) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  return (
    <>
      <div className="pad filter">
        <button className="small solid" onClick={() => setModal({ job: null })}>Register a job</button>
        <span className="muted">{fmt(data.items.length)} jobs</span>
      </div>
      <div className="table-wrap"><table className="rt">
        <thead>
          <tr><th>Job</th><th>Searches</th><th>No provider</th><th>Requests</th><th>Providers</th><th>Avg price</th><th>Earned</th><th>Action</th></tr>
        </thead>
        <tbody>
          {data.items.map((j) => (
            <tr key={j.id} className={j.active ? '' : 'off'}>
              <td data-label="Job">
                <strong>{j.name_en}</strong> <span className="muted">{j.name_sw}</span>
                {j.aliases?.length > 0 && (
                  <div className="chips">
                    {j.aliases.slice(0, 4).map((a) => <span key={a} className="chip">{a}</span>)}
                    {j.aliases.length > 4 && <span className="chip">+{j.aliases.length - 4}</span>}
                  </div>
                )}
              </td>
              <td data-label="Searches">{fmt(j.searches)} <span className="muted">({fmt(j.people)} people)</span> {j.searches > 0 && <Trend value={j.searches_trend} />}</td>
              <td data-label="No provider">{j.no_provider > 0 ? <Badge tone="warn">{fmt(j.no_provider)}</Badge> : <span className="muted">0</span>}</td>
              <td data-label="Requests">{fmt(j.requests)} <span className="muted">({fmt(j.completed)} done)</span></td>
              <td data-label="Providers">{j.providers === 0 ? <Badge tone="bad">0</Badge> : <>{fmt(j.providers)} <span className="muted">({fmt(j.providers_online)} online)</span></>}</td>
              <td data-label="Avg price">{j.avg_price ? tzs(j.avg_price) : <span className="muted">-</span>}</td>
              <td data-label="Earned">{j.earned ? tzs(j.earned) : <span className="muted">-</span>}</td>
              <td data-label="Action">
                <div className="row-actions">
                  <button className="small" onClick={() => setModal({ job: j })}>Edit</button>
                  <button className="small" disabled={busy === j.id} onClick={() => toggle(j)}>{j.active ? 'Switch off' : 'Switch on'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {modal && (
        <JobModal
          job={modal.job}
          onClose={() => setModal(null)}
          onDone={(text) => { setModal(null); onNotice(text); reload() }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------ 2) Requested but not registered
function AddJobModal({ group, onClose, onDone }) {
  const [sw, setSw] = useState(title(group.query))
  const [en, setEn] = useState(title(group.query))
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api('/api/admin/jobs/missing/add', { method: 'POST', body: { normalized: group.normalized, name_sw: sw, name_en: en, aliases: toWords(words) } })
      onDone(`Added "${en}". ${r.customers_notified} customers told, ${r.providers_linked} workers linked.`)
    } catch (err) { setError(err.status === 409 ? 'A job with this English name already exists. Use Merge instead.' : err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Add as a new job" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">{fmt(group.searches)} searches{group.workers > 0 ? `, ${group.workers} workers wrote it` : ''}. Workers who wrote it are linked, and customers who searched are told.</p>
        <label htmlFor="sw">Name in Swahili</label>
        <input id="sw" value={sw} onChange={(e) => setSw(e.target.value)} maxLength={80} required />
        <label htmlFor="en">Name in English</label>
        <input id="en" value={en} onChange={(e) => setEn(e.target.value)} maxLength={80} required />
        <label htmlFor="aw">Other words customers type (separate with commas)</label>
        <input id="aw" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. kufua, laundry" />
        <p className="small-text muted">"{group.query}" is saved as a search word automatically.</p>
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Adding...' : 'Add job'}</button></div>
      </form>
    </Modal>
  )
}

function MergeModal({ heading, word, preselect, services, onClose, onSubmit }) {
  const [id, setId] = useState(preselect || '')
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!id) return setError('Choose a job.')
    setBusy(true); setError('')
    try { await onSubmit(Number(id), toWords(words)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={heading} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">"{word}" becomes another word for the job you choose. The next search with it will find the job.</p>
        <label htmlFor="svc">Existing job</label>
        <select id="svc" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose...</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name_en} / {s.name_sw}</option>)}
        </select>
        <label htmlFor="mw">Extra search words for this job (optional, separate with commas)</label>
        <input id="mw" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. kufua, laundry" />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Merge'}</button></div>
      </form>
    </Modal>
  )
}

function Missing({ days, onNotice }) {
  const { data, error, loading, reload } = useLoad(`/api/admin/jobs/missing?days=${days}`)
  const reg = useLoad('/api/admin/jobs/registered?days=7')
  const [modal, setModal] = useState(null) // { kind: 'add' | 'merge', group, preselect }

  const done = (text) => { setModal(null); onNotice(text); reload() }
  async function ignore(g) {
    try { await api('/api/admin/jobs/missing/ignore', { method: 'POST', body: { normalized: g.normalized } }); onNotice(`Ignored "${g.query}".`); reload() }
    catch (e) { onNotice(e.message, true) }
  }

  if (loading) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  if (!data.items.length) return <p className="muted">No missing searches in this period.</p>
  const services = (reg.data?.items || []).filter((s) => s.active)
  return (
    <>
      <div className="table-wrap"><table className="rt">
        <thead><tr><th>Customers searched</th><th>Searches</th><th>Workers</th><th>Where</th><th>Last seen</th><th>Action</th></tr></thead>
        <tbody>
          {data.items.map((g) => (
            <tr key={g.normalized}>
              <td data-label="Customers searched">
                <strong>{g.query}</strong>
                {g.spellings.length > 1 && <div className="chips">{g.spellings.filter((s) => s !== g.query).map((s) => <span key={s} className="chip">{s}</span>)}</div>}
                {g.similar.length > 0 && (
                  <div className="muted small-text">Maybe the same as: {g.similar.map((s, i) => (
                    <button key={s.id} className="linkish" onClick={() => setModal({ kind: 'merge', group: g, preselect: s.id })}>{i ? ', ' : ''}{s.name_en}</button>
                  ))}</div>
                )}
              </td>
              <td data-label="Searches">
                {fmt(g.searches)} <span className="muted">({fmt(g.customers)} people)</span> <Trend value={g.trend} />
                {g.repeat_people > 0 && <div><Badge tone="warn">{g.repeat_people} tried again</Badge></div>}
              </td>
              <td data-label="Workers">{g.workers > 0 ? <Badge tone="good">{g.workers} offer it</Badge> : <Badge tone="warn">None. Find workers</Badge>}</td>
              <td data-label="Where">
                {g.areas.length ? g.areas.map((a) => (
                  <a key={`${a.lat},${a.lng}`} className="area" href={mapLink(a)} target="_blank" rel="noreferrer">{a.lat}, {a.lng} ({a.searches})</a>
                )) : <span className="muted">-</span>}
              </td>
              <td data-label="Last seen">{ago(g.last_seen)}</td>
              <td data-label="Action">
                <div className="row-actions">
                  <button className="small solid" onClick={() => setModal({ kind: 'add', group: g })}>Add job</button>
                  <button className="small" onClick={() => setModal({ kind: 'merge', group: g })}>Merge</button>
                  <button className="small" onClick={() => ignore(g)}>Ignore</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {modal?.kind === 'add' && <AddJobModal group={modal.group} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'merge' && (
        <MergeModal
          heading="Merge into an existing job" word={modal.group.query} preselect={modal.preselect} services={services} onClose={() => setModal(null)}
          onSubmit={async (service_id, aliases) => {
            const r = await api('/api/admin/jobs/missing/merge', { method: 'POST', body: { normalized: modal.group.normalized, service_id, aliases } })
            done(`Merged. ${r.customers_notified} customers told.`)
          }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------ 3) Worker suggestions
// A worker wrote a job that is not in the list. It already works for him (pending job). The admin checks it,
// then approves (maybe fixing the names), merges it into a job that already exists, or rejects it.
function Suggestions({ onNotice }) {
  const { data, error, loading, reload } = useLoad('/api/admin/suggestions')
  const reg = useLoad('/api/admin/jobs/registered?days=7')
  const [modal, setModal] = useState(null)

  const done = (text) => { setModal(null); onNotice(text); reload() }

  if (loading) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  if (!data.items.length) return <p className="muted">No worker suggestions waiting.</p>
  const services = (reg.data?.items || []).filter((s) => s.active)
  return (
    <>
      <div className="table-wrap"><table className="rt">
        <thead><tr><th>Job workers wrote</th><th>Workers (call to confirm)</th><th>Demand</th><th>Action</th></tr></thead>
        <tbody>
          {data.items.map((g) => (
            <tr key={g.first_id}>
              <td data-label="Job workers wrote">
                <strong>{g.name_sw}</strong> <span className="muted">/ {g.name_en}</span>
                {g.similar?.length > 0 && (
                  <div className="small-text"><Badge tone="warn">Maybe already registered</Badge> <span className="muted">{g.similar.map((x) => x.name_en).join(', ')}</span></div>
                )}
              </td>
              <td data-label="Workers">
                {g.providers.map((p) => (
                  <div key={p.suggestion_id} className="small-text">
                    {p.name || 'No name'} <a href={`tel:+${p.phone}`}>+{p.phone}</a> {p.verified ? <Badge tone="good">verified</Badge> : <Badge tone="plain">not verified</Badge>}
                  </div>
                ))}
              </td>
              <td data-label="Demand">
                <div className="small-text">{g.searches > 0 ? <Badge tone="good">{fmt(g.searches)} searches</Badge> : <span className="muted">no searches</span>}</div>
                {g.requests > 0 && <div className="small-text muted">{fmt(g.requests)} requests already</div>}
              </td>
              <td data-label="Action">
                <div className="row-actions">
                  <button className="small solid" onClick={() => setModal({ kind: 'add', group: g })}>Approve</button>
                  <button className="small" onClick={() => setModal({ kind: 'merge', group: g })}>Merge</button>
                  <button className="small" onClick={() => setModal({ kind: 'reject', group: g })}>Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {modal?.kind === 'add' && <SuggestionAdd group={modal.group} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'reject' && <SuggestionReject group={modal.group} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'merge' && (
        <MergeModal
          heading="Merge into an existing job" word={modal.group.name_en} services={services} onClose={() => setModal(null)}
          onSubmit={async (service_id, aliases) => {
            const r = await api(`/api/admin/suggestions/${modal.group.first_id}/merge`, { method: 'POST', body: { service_id, aliases } })
            done(`Merged. ${r.providers_linked} workers linked, ${r.customers_notified} customers told.`)
          }}
        />
      )}
    </>
  )
}

function SuggestionAdd({ group, onClose, onDone }) {
  const [sw, setSw] = useState(group.name_sw)
  const [en, setEn] = useState(group.name_en)
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api(`/api/admin/suggestions/${group.first_id}/approve`, { method: 'POST', body: { name_sw: sw, name_en: en, aliases: toWords(words) } })
      onDone(`Approved "${en}". ${r.providers_linked} workers told, ${r.customers_notified ?? 0} customers told.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Approve this job" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Check the names. {group.count} worker(s) already use this job. They are told it is approved.</p>
        <label htmlFor="sw2">Name in Swahili</label>
        <input id="sw2" value={sw} onChange={(e) => setSw(e.target.value)} maxLength={80} required />
        <label htmlFor="en2">Name in English</label>
        <input id="en2" value={en} onChange={(e) => setEn(e.target.value)} maxLength={80} required />
        <label htmlFor="aw2">Other words customers type (separate with commas)</label>
        <input id="aw2" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. kufua, laundry" />
        <p className="small-text"><a href={`https://translate.google.com/?sl=sw&tl=en&text=${encodeURIComponent(sw)}`} target="_blank" rel="noreferrer">Check the translation</a></p>
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Approve'}</button></div>
      </form>
    </Modal>
  )
}

function SuggestionReject({ group, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api(`/api/admin/suggestions/${group.first_id}/reject`, { method: 'POST', body: { reason } })
      onDone(`Rejected "${group.name_en}".`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Reject this job" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">The job is removed from the worker(s). They are told, with your reason.</p>
        <label htmlFor="rr">Reason (the worker will read this)</label>
        <input id="rr" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. This is not a home service" />
        <Notice text={error} error />
        <div className="actions"><button type="button" className="small" onClick={onClose}>Cancel</button><button className="small solid" disabled={busy}>{busy ? 'Saving...' : 'Reject'}</button></div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------ 4) Search log
const OUTCOME = {
  requested: { tone: 'good', text: 'Requested' },
  found: { tone: 'plain', text: 'Found, no request' },
  no_provider: { tone: 'warn', text: 'No provider near' },
  no_match: { tone: 'bad', text: 'No such job' },
}
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function SearchLog({ days }) {
  const [outcome, setOutcome] = useState('')
  const { data, error, loading } = useLoad(`/api/admin/searches?days=${days}${outcome ? `&outcome=${outcome}` : ''}`)
  if (loading) return <p className="muted">Loading...</p>
  if (error) return <Notice text={error} error />
  const s = data.stats
  return (
    <>
      <div className="grid pad">
        <div className="card stat"><span className="muted">Searches</span><span className="big">{fmt(s.searches)}</span><span className="muted">{fmt(s.people)} people</span></div>
        <div className="card stat"><span className="muted">Passed (found)</span><span className="big">{s.success_rate === null ? '-' : `${s.success_rate}%`}</span><span className="muted">{fmt(s.requested + s.found)} of {fmt(s.searches)}</span></div>
        <div className="card stat"><span className="muted">Failed</span><span className="big">{fmt(s.no_provider + s.no_match)}</span><span className="muted">{fmt(s.no_match)} no job, {fmt(s.no_provider)} no provider</span></div>
        <div className="card stat"><span className="muted">Searched again after failing</span><span className="big">{fmt(s.retries)}</span><span className="muted">{fmt(s.people_retried)} people</span></div>
      </div>
      {data.top_retriers.length > 0 && (
        <div className="pad">
          <p className="section">Kept trying (the first search failed)</p>
          <ul className="retriers">
            {data.top_retriers.map((r, i) => (
              <li key={i}><strong>{r.name || (r.phone ? `+${r.phone}` : 'Customer')}</strong> searched "{r.label}" <Badge tone="warn">{r.attempts} times</Badge></li>
            ))}
          </ul>
        </div>
      )}
      <div className="pad filter">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Result">
          <option value="">All results</option>
          <option value="requested">Requested</option>
          <option value="found">Found, no request</option>
          <option value="no_provider">No provider near</option>
          <option value="no_match">No such job</option>
        </select>
        <span className="muted">Newest first, up to 300</span>
      </div>
      {data.items.length === 0 ? <p className="muted">No searches in this period.</p> : (
        <div className="table-wrap">
          <table className="rt">
            <thead><tr><th>When</th><th>Customer</th><th>Searched</th><th>Result</th><th>Try</th><th>Where</th></tr></thead>
            <tbody>
              {data.items.map((r) => {
                const o = OUTCOME[r.outcome]
                return (
                  <tr key={r.id}>
                    <td>{when(r.at)}</td>
                    <td>{r.name || (r.phone ? `+${r.phone}` : <span className="muted">-</span>)}{r.name && r.phone && <div className="muted small-text">+{r.phone}</div>}</td>
                    <td>{r.label}{r.kind === 'typed' && <span className="muted small-text"> typed</span>}</td>
                    <td><Badge tone={o.tone}>{o.text}</Badge>{r.providers_found > 0 && <span className="muted small-text"> {r.providers_found} near</span>}</td>
                    <td>{r.attempt > 1 ? <Badge tone={r.retry ? 'warn' : 'plain'}>#{r.attempt}{r.retry ? ' after fail' : ''}</Badge> : <span className="muted">1</span>}</td>
                    <td>{r.lat !== null && r.lng !== null ? <a className="area" href={mapLink({ lat: r.lat.toFixed(4), lng: r.lng.toFixed(4) })} target="_blank" rel="noreferrer">{r.lat.toFixed(3)}, {r.lng.toFixed(3)}</a> : <span className="muted">-</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------ Page
export default function Jobs({ initialTab }) {
  const [tab, setTab] = useState(['registered', 'missing', 'suggestions', 'searches'].includes(initialTab) ? initialTab : 'missing')
  const [days, setDays] = useState(30)
  const [notice, setNotice] = useState({ text: '', error: false })
  const note = (text, error = false) => setNotice({ text, error })
  const counts = useLoad('/api/admin/summary')

  return (
    <div className="stack wide">
      <p className="muted lead">
        <Icon name="gaps" size={15} /> What customers ask for, what is registered, and what workers offer.
      </p>
      <div className="bar">
        <Tabs
          value={tab}
          onChange={(t) => { setTab(t); note('') }}
          tabs={[
            { id: 'missing', label: 'Not registered', count: counts.data?.needs_action.missing_jobs },
            { id: 'suggestions', label: 'Worker suggestions', count: counts.data?.needs_action.suggestions },
            { id: 'registered', label: 'Registered' },
            { id: 'searches', label: 'Search log' },
          ]}
        />
        {tab !== 'suggestions' && (
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" className="period">
            {DAYS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        )}
      </div>
      <Notice text={notice.text} error={notice.error} />
      <div className="card flush">
        {tab === 'registered' && <Registered days={days} onNotice={note} />}
        {tab === 'missing' && <Missing days={days} onNotice={note} />}
        {tab === 'suggestions' && <Suggestions onNotice={note} />}
        {tab === 'searches' && <SearchLog days={days} />}
      </div>
    </div>
  )
}
