import { useState } from 'react'
import { formatMoney } from '../../utils/money'

// Detected Zelle payments waiting for the admin (Phase 5). Nothing is paid until Match.
function ReviewItem({ item, t, participants, readOnly, onMatch, onDismiss }) {
  const suggested = participants.some(p => p.id === item.suggested_member_id) ? item.suggested_member_id : ''
  const [memberId, setMemberId] = useState(suggested)
  const canMatch = !readOnly && Boolean(memberId) && Boolean(item.round_id)

  return (
    <article className="rounded-2xl border border-amberwarm/80 bg-panel p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full border border-amberwarm text-amberwarm flex items-center justify-center font-bold shrink-0" aria-hidden="true">?</span>
        <p className="flex-1 text-sm font-medium text-stone-100 min-w-0">
          {t.zelleFrom(item.sender_name, formatMoney(item.amount))}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label={t.whoPaid}
          value={memberId}
          disabled={readOnly}
          onChange={e => setMemberId(e.target.value)}
          className="flex-1 min-h-11 rounded-xl bg-ink border border-stone-600 text-stone-100 text-sm px-2"
        >
          <option value="">{t.whoPaid}</option>
          {participants.map(p => <option key={p.id} value={p.id}>{p.name || `#${p.slot}`}</option>)}
        </select>
        <button
          type="button"
          disabled={!canMatch}
          onClick={() => onMatch(item.id, memberId)}
          className="shrink-0 min-h-11 px-3 rounded-xl bg-amberwarm text-ink text-sm font-bold disabled:opacity-50"
        >
          {t.match}
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onDismiss(item.id)}
          className="shrink-0 min-h-11 px-3 rounded-xl border border-stone-600 text-stone-300 text-sm font-semibold disabled:opacity-50"
        >
          {t.notTanda}
        </button>
      </div>
    </article>
  )
}

export default function NeedsReviewCard({ items, t, participants = [], readOnly = false, onMatch, onDismiss }) {
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
          readOnly={readOnly}
          onMatch={onMatch}
          onDismiss={onDismiss}
        />
      ))}
      <p className="text-xs text-stone-400">{t.matchHint}</p>
    </section>
  )
}
