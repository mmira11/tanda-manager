export default function PaymentSheet({ member, t, readOnly, onClose, onToggle }) {
  if (!member) return null
  const paid = member.paid === true
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button type="button" aria-label={t.close} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-sheet-title"
        className="relative w-full max-w-lg bg-panel rounded-t-3xl p-5 pb-8 border-t border-white/10"
      >
        <h2 id="payment-sheet-title" className="text-xl font-bold text-stone-50">{member.name}</h2>
        <p className={`mt-1 text-sm font-semibold ${paid ? 'text-mint' : 'text-amberwarm'}`}>
          {paid ? t.paidState : t.unpaidState}
        </p>
        {readOnly && <p className="mt-3 text-sm text-stone-300">{t.archivedLocked}</p>}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onToggle(member)}
          className="mt-5 w-full min-h-12 rounded-2xl bg-mint text-ink font-bold disabled:opacity-50"
        >
          {paid ? t.markUnpaid : t.markPaid}
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full min-h-12 rounded-2xl text-stone-300 font-semibold">
          {t.close}
        </button>
      </div>
    </div>
  )
}
