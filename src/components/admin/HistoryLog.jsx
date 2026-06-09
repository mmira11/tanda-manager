import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getPaidCount, formatDate } from '../../utils/rounds'

export default function HistoryLog() {
  const { store } = useStore()
  const { rounds, participants } = store
  const currentRound = getCurrentRound(rounds)
  const past = rounds.filter(r => r.round < currentRound.round).reverse()

  if (past.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 text-center">
        <div className="text-4xl mb-3">📋</div>
        <h3 className="font-semibold text-gray-700">No history yet</h3>
        <p className="text-sm text-gray-400 mt-1">
          Completed rounds will appear here after each payout.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Round History</h3>
      {past.map(round => {
        const recipient = participants.find(p => p.slot === round.recipientSlot)
        const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
        const paidCount = getPaidCount(round.payments)

        return (
          <div key={round.round} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-xs font-semibold text-gold-600 uppercase tracking-wider">
                  Round {round.round}
                </span>
                <h4 className="font-bold text-gray-900">{recipientName}</h4>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                round.payoutSent
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {round.payoutSent ? '✓ Paid Out' : 'Pending'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
              <span>Collected: <strong className="text-gray-900">{formatDate(round.collectDate)}</strong></span>
              <span>Paid out: <strong className="text-gray-900">{formatDate(round.payoutDate)}</strong></span>
            </div>
            <div className="text-sm text-gray-600 mb-2">
              Contributions: <strong className="text-gray-900">{paidCount} / {participants.length}</strong>
              <span className="text-gray-400 ml-1">(${paidCount * 200} of $2,400)</span>
            </div>
            {round.notes && (
              <div className="bg-gold-50 rounded-xl p-3 text-sm text-gray-700 italic border border-gold-100">
                {round.notes}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
