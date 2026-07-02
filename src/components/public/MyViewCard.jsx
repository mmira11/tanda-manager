// src/components/public/MyViewCard.jsx — personalized "ticket" for the saved member
import { formatDate } from '../../utils/rounds'

export default function MyViewCard({ mySlot, participants, rounds, currentRound, pot, t, onClear }) {
  const me = participants.find(p => p.slot === mySlot)
  if (!me) return null
  const myRound = rounds.find(r => r.recipientSlot === mySlot)
  const paid = !!currentRound.payments[mySlot]
  const received = myRound && (myRound.payoutSent || currentRound.round > myRound.round)

  return (
    <div className="relative bg-white rounded-2xl shadow-md border-l-4 border-gold-500 overflow-hidden">
      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gold-50 rounded-full border border-gray-200" aria-hidden="true" />
      <span className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gold-50 rounded-full border border-gray-200" aria-hidden="true" />
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-gray-900">{me.name}</p>
          <button onClick={onClear} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
            {t.notYou}
          </button>
        </div>

        <p className={`text-sm font-semibold ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
          {paid ? `✓ ${t.yourStatusPaid}` : `● ${t.yourStatusPending}`}
        </p>

        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          {received ? (
            <p className="text-sm font-medium text-gray-700">{t.receivedPayout(myRound.round)}</p>
          ) : myRound ? (
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gold-700">{t.yourTurn}:</span>{' '}
              {t.round} {myRound.round} · {formatDate(myRound.payoutDate)} ·{' '}
              <span className="font-bold">${(pot ?? 0).toLocaleString()}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
