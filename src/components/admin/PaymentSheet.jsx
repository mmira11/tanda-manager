import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function PaymentSheet({ member, t, readOnly, onClose, onToggle }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!member) return undefined
    const node = dialogRef.current
    if (!node) return undefined
    const previous = document.activeElement
    const focusable = () => [...node.querySelectorAll(FOCUSABLE)]
    focusable()[0]?.focus()

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [member?.slot])

  if (!member) return null
  const recipient = member.isRecipient === true
  const paid = member.paid === true || recipient
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button type="button" aria-label={t.close} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-sheet-title"
        className="relative w-full max-w-lg bg-panel rounded-t-3xl p-5 pb-8 border-t border-white/10"
      >
        <h2 id="payment-sheet-title" className="text-xl font-bold text-stone-50">{member.name}</h2>
        <p className={`mt-1 text-sm font-semibold ${paid ? 'text-mint' : 'text-amberwarm'}`}>
          {recipient ? t.recipientNoPay : paid ? t.paidState : t.unpaidState}
        </p>
        {readOnly && <p className="mt-3 text-sm text-stone-300">{t.archivedLocked}</p>}
        {!recipient && (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onToggle(member)}
            className="mt-5 w-full min-h-12 rounded-2xl bg-mint text-ink font-bold disabled:opacity-50"
          >
            {paid ? t.markUnpaid : t.markPaid}
          </button>
        )}
        <button type="button" onClick={onClose} className="mt-2 w-full min-h-12 rounded-2xl text-stone-300 font-semibold">
          {t.close}
        </button>
      </div>
    </div>
  )
}
