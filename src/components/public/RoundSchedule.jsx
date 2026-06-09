import { formatDate } from '../../utils/rounds'

export default function RoundSchedule({ rounds, participants, currentRoundNum, t }) {
  if (!rounds?.length) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-3">{t.schedule}</h3>
      <div className="space-y-0.5">
        {rounds.map(r => {
          const recipient = participants.find(p => p.slot === r.recipientSlot)
          const name = recipient?.name || `Slot ${r.recipientSlot}`
          const isCurrent = r.round === currentRoundNum
          const isDone = r.payoutSent

          return (
            <div
              key={r.round}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${
                isCurrent ? 'border-l-4 border-gold-500 bg-gold-50' : ''
              }`}
            >
              <span
                className={`text-xs font-bold w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  isCurrent
                    ? 'border-gold-500 text-gold-700 bg-white'
                    : isDone
                    ? 'border-gray-200 text-gray-400'
                    : 'border-gray-300 text-gray-500'
                }`}
              >
                {r.round}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>
                  {name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDate(r.collectDate)} → {formatDate(r.payoutDate)}
                </p>
              </div>
              {isDone && (
                <span title={t.completed} className="text-emerald-500 font-bold text-sm flex-shrink-0">✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
