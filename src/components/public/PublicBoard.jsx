import { useStore } from '../../context/StoreContext'
import { getCurrentRound } from '../../utils/rounds'
import RecipientSpotlight from './RecipientSpotlight'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'

export default function PublicBoard() {
  const { store } = useStore()
  const { participants, rounds } = store

  if (!store.config.initialized) {
    return (
      <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Tanda 2026</h1>
          <p className="text-gray-500 mt-2 text-sm">Check back soon — the organizer is finishing setup.</p>
        </div>
      </div>
    )
  }

  const round = getCurrentRound(rounds)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  const isComplete = new Date() > new Date('2026-11-16T00:00:00')

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda 2026</h1>
            <p className="text-xs text-gray-500">Jun 13 – Nov 15, 2026 · $200/person</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 font-medium">Round</div>
            <div className="text-2xl font-black text-gold-600 leading-none">
              {round.round}
              <span className="text-sm font-medium text-gray-400"> / 12</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <RecipientSpotlight round={round} recipientName={recipientName} />
        <CountdownTimer collectDate={round.collectDate} isComplete={isComplete} />
        <PaymentStatusList participants={participants} payments={round.payments} />

        <p className="text-center text-xs text-gray-400 pb-6">
          Each person contributes $200 · Payout every Saturday · 12 rounds total
        </p>
      </div>
    </div>
  )
}
