import { getPaidCount } from '../../utils/rounds'
import { SLOT_COUNT } from '../../data/scheduleTemplate'

export default function PaymentStatusList({ participants, payments }) {
  const paidCount = getPaidCount(payments)
  const pct = Math.round((paidCount / SLOT_COUNT) * 100)

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Contributions</h3>
        <span className="text-sm font-bold text-emerald-600">
          {paidCount} of {SLOT_COUNT} ✓
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-1">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {participants.map(p => (
          <div
            key={p.slot}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors ${
              payments[p.slot] ? 'bg-emerald-50' : 'bg-gray-50'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                payments[p.slot]
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {payments[p.slot] ? '✓' : '·'}
            </span>
            <span className="text-sm font-medium text-gray-700 truncate">
              {p.name || `Slot ${p.slot}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
