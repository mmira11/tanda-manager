import { formatMoney } from '../../utils/money'

export default function NeedsReviewCard({ items, t }) {
  if (!items?.length) return null
  return (
    <section aria-label={t.needsReview} className="space-y-2">
      <h2 className="text-sm font-semibold text-amberwarm">{t.needsReview}</h2>
      {items.map(item => (
        <article key={item.id} className="rounded-2xl border border-amberwarm/80 bg-panel p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full border border-amberwarm text-amberwarm flex items-center justify-center font-bold shrink-0" aria-hidden="true">?</span>
          <p className="flex-1 text-sm font-medium text-stone-100 min-w-0">
            {t.zelleFrom(item.sender_name, formatMoney(item.amount))}
          </p>
          <button
            type="button"
            disabled
            title={t.matchUnavailable}
            className="shrink-0 min-h-11 px-3 rounded-xl bg-amberwarm text-ink text-sm font-bold disabled:opacity-70"
          >
            {t.match}
          </button>
        </article>
      ))}
      <p className="text-xs text-stone-400">{t.matchUnavailable}</p>
    </section>
  )
}
