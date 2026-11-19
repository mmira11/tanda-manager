import { useState } from 'react'
import { formatMoney } from '../../utils/money'
import { DEFAULT_TIME_ZONE, formatZonedDate } from '../../utils/rounds'

const TIMING = {
  early: 'timingEarly',
  on_time: 'timingOnTime',
  after_deadline: 'timingAfterDeadline',
  late: 'timingLate',
}

// Detected Zelle payments waiting for the admin (Phase 5). Nothing is paid until Match.
function ReviewItem({ item, t, participants, rounds, locale, timeZone, readOnly, onMatch, onDismiss }) {
  const suggested = participants.some(p => p.id === item.suggested_member_id) ? item.suggested_member_id : ''
  const [memberId, setMemberId] = useState(suggested)
  const knownRound = !rounds.length || rounds.some(r => r.id === item.round_id)
  const [roundId, setRoundId] = useState(knownRound ? (item.round_id || '') : '')
  const [reason, setReason] = useState('')
  const amountDiffers = String(item.match_reason || '').includes('amount_differs')
  const canMatch = !readOnly && !amountDiffers && Boolean(memberId) && Boolean(roundId)
  const chosen = rounds.find(r => r.id === roundId)
  const when = item.received_at ? formatZonedDate(item.received_at, locale, timeZone) : ''
  const timingKey = roundId === item.round_id ? TIMING[item.round_timing] : ''
  const detail = [when, chosen ? t.roundWord(chosen.round) : '', timingKey ? t[timingKey] : ''].filter(Boolean).join(' · ')

  return (
    <article className="rounded-2xl border border-amberwarm/80 bg-panel p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full border border-amberwarm text-amberwarm flex items-center justify-center font-bold shrink-0" aria-hidden="true">?</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-100">
            {t.zelleFrom(item.sender_name, formatMoney(item.amount))}
          </p>
          {detail && <p className="text-xs text-stone-400 mt-0.5">{detail}</p>}
        </div>
      </div>
      {rounds.length > 0 && (
        <select
          aria-label={t.round}
          value={roundId}
          disabled={readOnly}
          onChange={e => setRoundId(e.target.value)}
          className="w-full min-h-11 rounded-xl bg-ink border border-stone-600 text-stone-100 text-sm px-2"
        >
          <option value="">{t.round}</option>
          {rounds.map(r => <option key={r.id} value={r.id}>{t.roundWord(r.round)}</option>)}
        </select>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t.whoPaid}
          value={memberId}
          disabled={readOnly}
          onChange={e => setMemberId(e.target.value)}
          className="flex-1 min-w-[9rem] min-h-11 rounded-xl bg-ink border border-stone-600 text-stone-100 text-sm px-2"
        >
          <option value="">{t.whoPaid}</option>
          {participants.map(p => <option key={p.id} value={p.id}>{p.name || `#${p.slot}`}</option>)}
        </select>
        <button
          type="button"
          disabled={!canMatch}
          title={amountDiffers ? t.amountDiffersHint : undefined}
          onClick={() => onMatch(item.id, memberId, roundId)}
          className="shrink-0 min-h-11 px-3 rounded-xl bg-amberwarm text-ink text-sm font-bold disabled:opacity-50"
        >
          {t.match}
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onDismiss(item.id, reason.trim())}
          className="shrink-0 min-h-11 px-3 rounded-xl border border-stone-600 text-stone-300 text-sm font-semibold disabled:opacity-50"
        >
          {t.dismissItem}
        </button>
      </div>
      {amountDiffers && <p className="text-xs text-stone-400">{t.amountDiffersHint}</p>}
      <input
        aria-label={t.dismissReason}
        placeholder={t.dismissReason}
        value={reason}
        disabled={readOnly}
        onChange={e => setReason(e.target.value)}
        className="w-full min-h-11 rounded-xl bg-ink border border-stone-600 text-stone-100 text-sm px-3"
      />
    </article>
  )
}

export default function NeedsReviewCard({
  items,
  t,
  participants = [],
  rounds = [],
  locale = 'en-US',
  timeZone = DEFAULT_TIME_ZONE,
  readOnly = false,
  onMatch,
  onDismiss,
}) {
  if (!items?.length) return null
  return (
    <section aria-label={t.needsReview} className="space-y-2">
      <h2 className="text-sm font-semibold text-amberwarm">{t.needsReview}</h2>
      {items.map(item => (
        <ReviewItem
          key={item.id}
          item={item}
          t={t}
          participants={participants}
          rounds={rounds}
          locale={locale}
          timeZone={timeZone}
          readOnly={readOnly}
          onMatch={onMatch}
          onDismiss={onDismiss}
        />
      ))}
      <p className="text-xs text-stone-400">{t.matchHint}</p>
    </section>
  )
}
