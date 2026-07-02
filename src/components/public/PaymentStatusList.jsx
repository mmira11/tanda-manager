// src/components/public/PaymentStatusList.jsx
import { getPaidCount } from '../../utils/rounds'

export default function PaymentStatusList({ participants, payments, rounds, currentRoundNum, t, mySlot }) {
  const paidCount = getPaidCount(payments)
  const total = participants.length
  const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0

  const nextRound = rounds?.find(r => r.round === currentRoundNum + 1)
  const nextRecipient = nextRound
    ? participants.find(p => p.slot === nextRound.recipientSlot)?.name || `Slot ${nextRound.recipientSlot}`
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{t.contributions}</h3>
        <span className="text-sm font-bold text-emerald-600">
          {paidCount} {t.of} {total} ✓
        </span>
      </div>

      <div className="mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {participants.map((p, i) => (
            <span
              key={p.slot}
              className={`h-3 flex-1 min-w-[14px] rounded-full transition-colors ${
                payments[p.slot] ? 'bg-emerald-400 dot-pop' : 'bg-gray-200'
              }`}
              style={payments[p.slot] ? { animationDelay: `${i * 60}ms` } : undefined}
              title={p.name || `Slot ${p.slot}`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {participants.map(p => (
          <div
            key={p.slot}
            className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
              payments[p.slot] ? 'bg-emerald-50' : 'bg-gray-50'
            } ${p.slot === mySlot ? 'ring-2 ring-gold-400' : ''}`}
          >
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 transition-colors ${
                payments[p.slot]
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {payments[p.slot] ? t.paid : t.pending}
            </span>
            <span className="text-sm font-medium text-gray-700 truncate">
              {p.name || `Slot ${p.slot}`}
            </span>
          </div>
        ))}
      </div>

      {nextRecipient && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
          <span className="font-medium">{t.whosNext}:</span> {nextRecipient}
        </div>
      )}
    </div>
  )
}
