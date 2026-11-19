// src/components/admin/ScheduleView.jsx — the cycle's rounds as a list. Tap a round to
// change its dates, who receives, its payments, payout and notes (RoundDetail).
import { useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { formatMoney } from '../../utils/money'
import { addDays, getCurrentRound, holidayName, inRound, validateSchedule } from '../../utils/rounds'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const ghost = `min-h-11 px-3 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 ${focus}`
const field = 'w-full min-h-11 rounded-xl border border-white/15 bg-ink px-3 text-sm text-stone-100'

const shortDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function roundHoliday(round) {
  const collect = holidayName(round.collectDate)
  if (collect) return `Collect on ${collect}`
  const payout = holidayName(round.payoutDate)
  return payout ? `Payout on ${payout}` : null
}

function RoundDetail({ roundNum, readOnly, onBack }) {
  const { store, togglePayment, togglePayout, updateRoundNotes, updateRoundDates, assignRecipient } = useStore()
  const { rounds, participants, config } = store
  const round = rounds.find(r => r.round === roundNum)
  const [collect, setCollect] = useState(round.collectDate)
  const [payout, setPayout] = useState(round.payoutDate)
  const [notes, setNotes] = useState(round.notes || '')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    setCollect(round.collectDate)
    setPayout(round.payoutDate)
    setNotes(round.notes || '')
  }, [round.collectDate, round.payoutDate, round.notes])

  const payers = inRound(round, participants)
  const paidCount = payers.filter(p => round.payments[p.slot] === true).length
  const pot = payers.length * config.contribution
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const datesChanged = collect !== round.collectDate || payout !== round.payoutDate
  const notesChanged = notes !== (round.notes || '')
  const draft = rounds.map(r => (r.round === roundNum ? { ...r, collectDate: collect, payoutDate: payout } : r))
  const problem = !collect || !payout ? 'Pick both dates' : validateSchedule(draft)
  const holiday = roundHoliday({ collectDate: collect, payoutDate: payout })

  function shift(days) {
    setCollect(addDays(collect, days))
    setPayout(addDays(payout, days))
    setSaved('')
  }

  async function save() {
    if (problem) return
    if (datesChanged) await updateRoundDates(roundNum, collect, payout)
    if (notesChanged) await updateRoundNotes(roundNum, notes)
    setSaved('Saved. Members see the new dates right away.')
  }

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className={`min-h-11 text-sm font-semibold text-stone-400 ${focus}`}>‹ Schedule</button>
        <h1 className="text-xl font-extrabold tracking-tight text-stone-50">
          Round {round.round} · {recipient?.name || 'Needs a recipient'}
        </h1>
        <p className="text-sm text-stone-400">{formatMoney(pot)} pot · {paidCount} of {payers.length} paid</p>
      </div>

      {holiday && (
        <section className="rounded-2xl border border-amberwarm/40 bg-amberwarm/10 px-4 py-3">
          <p className="text-sm font-bold text-amberwarm">{holiday}</p>
          <p className="text-sm text-stone-300">Move it? Members see the new date as soon as you save.</p>
        </section>
      )}

      <section className="bg-panel rounded-2xl border border-white/10 p-4 space-y-3" aria-label="Dates">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="collect-date" className="block text-xs font-semibold text-stone-400 mb-1">Collect by 6 PM</label>
            <input id="collect-date" type="date" className={field} value={collect} disabled={readOnly}
              onChange={e => { setCollect(e.target.value); setSaved('') }} />
          </div>
          <div>
            <label htmlFor="payout-date" className="block text-xs font-semibold text-stone-400 mb-1">Payout</label>
            <input id="payout-date" type="date" className={field} value={payout} disabled={readOnly}
              onChange={e => { setPayout(e.target.value); setSaved('') }} />
          </div>
        </div>
        {!readOnly && collect && payout && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => shift(-1)} className={ghost}>Move to {shortDay(addDays(collect, -1))}</button>
            <button type="button" onClick={() => shift(1)} className={ghost}>Move to {shortDay(addDays(collect, 1))}</button>
          </div>
        )}
        {problem && datesChanged && <p role="alert" className="text-xs font-semibold text-red-300">{problem}</p>}
      </section>

      <section className="bg-panel rounded-2xl border border-white/10 p-4 space-y-2">
        <label htmlFor="recipient" className="block text-xs font-semibold text-stone-400">Receives this round</label>
        <select
          id="recipient"
          className={field}
          disabled={readOnly}
          value={recipient ? String(recipient.slot) : ''}
          onChange={e => e.target.value && assignRecipient(roundNum, Number(e.target.value))}
        >
          {!recipient && <option value="">Needs a recipient</option>}
          {participants.map(p => <option key={p.slot} value={String(p.slot)}>{p.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => togglePayout(roundNum)}
          disabled={readOnly || !recipient}
          aria-pressed={round.payoutSent ? 'true' : 'false'}
          className={`w-full min-h-11 rounded-xl text-sm font-semibold disabled:opacity-50 ${focus} ${round.payoutSent ? 'bg-mint text-ink' : 'border border-white/15 text-stone-100'}`}
        >
          {round.payoutSent ? `✓ ${formatMoney(pot)} sent to ${recipient?.name || ''}` : `Mark payout sent to ${recipient?.name || '…'}`}
        </button>
      </section>

      <section className="bg-panel rounded-2xl border border-white/10 p-4" aria-labelledby="payments-title">
        <h2 id="payments-title" className="text-sm font-bold text-stone-50 mb-1">Payments · {paidCount} of {payers.length}</h2>
        <ul>
          {payers.map(p => {
            const paid = round.payments[p.slot] === true
            return (
              <li key={p.slot} className="flex items-center gap-3 py-1.5 border-t border-white/5 first:border-t-0">
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-stone-100">{p.name}</span>
                <button
                  type="button"
                  onClick={() => togglePayment(roundNum, p.slot)}
                  disabled={readOnly}
                  aria-pressed={paid ? 'true' : 'false'}
                  aria-label={`${p.name}: ${paid ? 'paid' : 'not paid'}`}
                  className={`min-h-11 min-w-24 rounded-xl text-sm font-semibold disabled:opacity-60 ${focus} ${paid ? 'bg-mint/15 text-mint' : 'border border-white/15 text-stone-300'}`}
                >
                  {paid ? '✓ Paid' : 'Not paid'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="bg-panel rounded-2xl border border-white/10 p-4 space-y-2">
        <label htmlFor="round-notes" className="block text-xs font-semibold text-stone-400">Notes (only you see these)</label>
        <textarea id="round-notes" rows={2} className={`${field} py-2`} value={notes} disabled={readOnly}
          onChange={e => { setNotes(e.target.value); setSaved('') }} />
      </section>

      {!readOnly && (
        <button
          type="button"
          onClick={save}
          disabled={!(datesChanged || notesChanged) || Boolean(problem)}
          className={`w-full min-h-12 rounded-2xl bg-mint text-ink text-base font-bold disabled:opacity-40 ${focus}`}
        >
          Save round
        </button>
      )}
      {saved && <p role="status" className="text-sm text-stone-300 text-center">{saved}</p>}
    </div>
  )
}

export default function ScheduleView({ readOnly = false, openRound = null, onOpenRound }) {
  const { store } = useStore()
  const { rounds, participants, config } = store
  const [selected, setSelected] = useState(openRound)
  useEffect(() => { if (openRound != null) setSelected(openRound) }, [openRound])

  if (selected != null && rounds.some(r => r.round === selected)) {
    return <RoundDetail roundNum={selected} readOnly={readOnly} onBack={() => { setSelected(null); onOpenRound?.(null) }} />
  }

  const current = getCurrentRound(rounds)
  const potFor = r => inRound(r, participants).length * config.contribution
  const first = rounds[0]
  const last = rounds[rounds.length - 1]

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold text-stone-400 truncate">
          {config.name} · every {config.intervalDays} days · {formatMoney(potFor(current))} pot
        </p>
        <h1 className="text-xl font-extrabold tracking-tight text-stone-50">Schedule</h1>
        {first && last && <p className="text-xs text-stone-400">{shortDay(first.collectDate)} – {shortDay(last.payoutDate)}</p>}
      </header>
      <ol className="space-y-1.5" aria-label="Rounds">
        {rounds.map(r => {
          const recipient = participants.find(p => p.slot === r.recipientSlot)
          const payers = inRound(r, participants)
          const paid = payers.filter(p => r.payments[p.slot] === true).length
          const isCurrent = !readOnly && r.round === current.round
          const isPast = r.round < current.round || readOnly
          const holiday = roundHoliday(r)
          const tag = holiday ? holiday.replace(/^(Collect|Payout) on /, '')
            : isCurrent ? `${paid}/${payers.length} paid`
              : isPast ? (r.payoutSent ? 'Paid out ✓' : `${paid}/${payers.length} paid`) : null
          return (
            <li key={r.round}>
              <button
                type="button"
                onClick={() => { setSelected(r.round); onOpenRound?.(r.round) }}
                aria-current={isCurrent ? 'step' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left min-h-11 ${focus} ${isCurrent ? 'bg-mint/10 border border-mint/40' : 'bg-panel border border-white/5'}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? 'bg-mint text-ink' : 'bg-white/10 text-stone-300'}`}>
                  {r.round}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block truncate text-[15px] font-semibold ${recipient ? 'text-stone-50' : 'text-amberwarm'}`}>
                    {recipient?.name || 'Needs a recipient'}
                  </span>
                  <span className="block text-xs text-stone-400">{shortDay(r.collectDate)} → {shortDay(r.payoutDate)}</span>
                </span>
                {tag && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${holiday ? 'bg-amberwarm/20 text-amberwarm' : 'bg-mint/15 text-mint'}`}>
                    {tag}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
