// src/components/admin/SettingsView.jsx — this cycle at a glance, your Zelle, Grokbot's
// access key, and the once-in-a-while actions: download, archive / new cycle, sign out.
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/money'
import { isValidUsPhone } from '../../utils/messaging'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const card = 'bg-panel rounded-2xl border border-white/10 p-4'
const heading = 'text-xs font-bold tracking-wide text-stone-400 uppercase'
const field = 'w-full min-h-11 rounded-xl border border-white/15 bg-ink px-3 text-sm text-stone-100'
const ghost = `min-h-11 px-3 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 ${focus}`
const shortDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function GrokbotCard({ readOnly }) {
  const { loadBotKey, createBotKey, revokeBotKeys } = useStore()
  const [active, setActive] = useState(undefined) // undefined = loading
  const [freshKey, setFreshKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try { setActive(await loadBotKey()) } catch (e) { setActive(null); setError(e.message || String(e)) }
  }, [loadBotKey])
  useEffect(() => { refresh() }, [refresh])

  async function make() {
    if (active && !window.confirm('Make a new key? Grokbot stops working until you give it the new one.')) return
    setBusy(true); setError(''); setCopied(false)
    try { setFreshKey(await createBotKey()); await refresh() } catch (e) { setError(e.message || String(e)) }
    setBusy(false)
  }

  async function turnOff() {
    if (!window.confirm('Turn off Grokbot\'s key? It stops working right away.')) return
    setBusy(true); setError('')
    try { await revokeBotKeys(); setFreshKey(''); await refresh() } catch (e) { setError(e.message || String(e)) }
    setBusy(false)
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(freshKey); setCopied(true) } catch { window.prompt('Copy Grokbot\'s key', freshKey) }
  }

  return (
    <section className={`${card} space-y-3`} aria-labelledby="grokbot-title">
      <div className="flex items-center gap-3">
        <h2 id="grokbot-title" className={`${heading} flex-1`}>Grokbot</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${active ? 'bg-mint/15 text-mint' : 'bg-white/10 text-stone-400'}`}>
          {active === undefined ? '…' : active ? 'On' : 'Off'}
        </span>
      </div>
      <p className="text-sm text-stone-300">
        A key lets Grokbot see who still owes this round (first names and phones) and mark payments. Nothing else.
      </p>
      {active && <p className="text-xs text-stone-400">Key made {shortDay(active.created_at.slice(0, 10))}.</p>}
      {freshKey && (
        <div className="rounded-xl border border-amberwarm/40 bg-amberwarm/10 p-3 space-y-2">
          <p className="text-xs font-bold text-amberwarm">Copy this now. It won't be shown again.</p>
          <code className="block break-all text-xs text-stone-100">{freshKey}</code>
          <button type="button" onClick={copyKey} className={`${ghost} w-full`}>{copied ? 'Copied' : 'Copy key'}</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={make} disabled={busy} className={`${ghost} disabled:opacity-40`}>{active ? 'New key' : 'Make key'}</button>
          <button type="button" onClick={turnOff} disabled={busy || !active} className={`min-h-11 rounded-xl border border-red-400/40 text-sm font-semibold text-red-300 disabled:opacity-30 ${focus}`}>
            Turn off
          </button>
        </div>
      )}
    </section>
  )
}

export default function SettingsView({ email, onNewCycle }) {
  const { store, cycles, selectCycle, saveConfig, exportData, archiveCycle } = useStore()
  const { config, rounds } = store
  const [organizerName, setOrganizerName] = useState(config.organizerName)
  const [zelle, setZelle] = useState(config.organizerPhone)
  const [saved, setSaved] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const hasActive = cycles.some(cycle => cycle.status === 'active')
  const isActive = config.status === 'active'

  useEffect(() => { setOrganizerName(config.organizerName); setZelle(config.organizerPhone) }, [config.organizerName, config.organizerPhone])
  const dirty = organizerName !== config.organizerName || zelle !== config.organizerPhone

  async function save() {
    await saveConfig({ organizerName: organizerName.trim(), organizerPhone: zelle.trim() })
    setSaved(true)
  }

  function download() {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tanda-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const first = rounds[0]
  const last = rounds[rounds.length - 1]
  const rows = [
    ['Name', config.name],
    ['Contribution', `${formatMoney(config.contribution)} every ${config.intervalDays} days`],
    ['Runs', first && last ? `${shortDay(first.collectDate)} – ${shortDay(last.payoutDate)}` : '—'],
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-stone-50">Settings</h1>

      <section className={card} aria-labelledby="cycle-title">
        <h2 id="cycle-title" className={heading}>{isActive ? 'This cycle' : 'Viewing'}</h2>
        <dl className="mt-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 items-center min-h-11 border-t border-white/5 first:border-t-0 text-sm">
              <dt className="text-stone-400">{k}</dt>
              <dd className="font-semibold text-stone-100 text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {cycles.length > 1 && (
          <label className="block mt-2 text-xs font-semibold text-stone-400">
            Switch cycle
            <select
              aria-label="Cycle"
              value={config.cycleId}
              onChange={e => selectCycle(e.target.value)}
              className={`${field} mt-1`}
            >
              {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className={`${card} space-y-2`} aria-labelledby="zelle-title">
        <h2 id="zelle-title" className={heading}>Your Zelle</h2>
        <label htmlFor="org-zelle" className="block text-xs text-stone-400">Members copy this to pay you</label>
        <input id="org-zelle" className={field} value={zelle} inputMode="tel" disabled={!isActive}
          onChange={e => { setZelle(e.target.value); setSaved(false) }} />
        {zelle.trim() && /^\D*\d/.test(zelle) && !isValidUsPhone(zelle) && !zelle.includes('@') && (
          <p className="text-xs font-semibold text-amberwarm">Check this number: it needs 10 digits.</p>
        )}
        <label htmlFor="org-name" className="block text-xs text-stone-400">Your name in messages (optional)</label>
        <input id="org-name" className={field} value={organizerName} disabled={!isActive}
          onChange={e => { setOrganizerName(e.target.value); setSaved(false) }} />
        {isActive && dirty && (
          <button type="button" onClick={save} className={`w-full min-h-11 rounded-xl bg-mint text-ink text-sm font-bold ${focus}`}>Save</button>
        )}
        {saved && !dirty && <p role="status" className="text-xs text-stone-400">Saved</p>}
      </section>

      <GrokbotCard readOnly={!isActive} />

      <section className="space-y-2">
        <button type="button" onClick={download} className={`${ghost} w-full`}>Download a copy (JSON)</button>
        {isActive && !confirmArchive && (
          <button type="button" onClick={() => setConfirmArchive(true)} className={`${ghost} w-full`}>Archive cycle…</button>
        )}
        {confirmArchive && (
          <div role="dialog" aria-modal="false" aria-labelledby="archive-title" className={`${card} space-y-2`}>
            <h2 id="archive-title" className="font-semibold text-stone-50">Archive this cycle?</h2>
            <p className="text-sm text-stone-300">Payments and members are locked. You can still view it, then start a new cycle. Member links stop working 30 days later.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setConfirmArchive(false); archiveCycle() }} className={`min-h-11 rounded-xl bg-mint text-ink text-sm font-bold ${focus}`}>
                Archive cycle
              </button>
              <button type="button" onClick={() => setConfirmArchive(false)} className={ghost}>Cancel</button>
            </div>
          </div>
        )}
        {onNewCycle && !hasActive && (
          <button type="button" onClick={onNewCycle} className={`w-full min-h-11 rounded-xl bg-mint text-ink text-sm font-bold ${focus}`}>New cycle</button>
        )}
        <div className="pt-2 text-center">
          {email && <p className="text-xs text-stone-500 truncate">Signed in as {email}</p>}
          <button type="button" onClick={() => supabase.auth.signOut()} className={`min-h-11 px-4 text-sm font-semibold text-stone-400 ${focus}`}>Sign out</button>
        </div>
      </section>
    </div>
  )
}
