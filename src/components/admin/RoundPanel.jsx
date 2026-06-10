import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getPaidCount, formatDate, getDayName } from '../../utils/rounds'
import { buildSmsUrl, buildGroupSmsUrl, buildReminderBody } from '../../utils/messaging'
import PaymentRow from './PaymentRow'

export default function RoundPanel() {
  const { store, togglePayout, updateRoundNotes } = useStore()
  const { participants, rounds } = store
  const round = getCurrentRound(rounds)
  const paidCount = getPaidCount(round.payments)
  const total = participants.length
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`

  const allPaid = paidCount === total
  const orgPhone = store.config?.organizerPhone || ''
  const unpaidWithPhone = participants.filter(p => !round.payments[p.slot] && p.phone?.trim())

  let reminderUrl = null
  if (unpaidWithPhone.length === 1) {
    reminderUrl = buildSmsUrl(unpaidWithPhone[0].phone, unpaidWithPhone[0].name, orgPhone, round.collectDate)
  } else if (unpaidWithPhone.length >= 2) {
    const body = buildReminderBody(round.round, formatDate(round.collectDate), orgPhone)
    reminderUrl = buildGroupSmsUrl(unpaidWithPhone, body)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-gold-600 uppercase tracking-wider">
              Round {round.round} of 12
            </span>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">
              {recipientName} receives
            </h2>
          </div>
          <div className="text-2xl font-black text-gold-600">$2,400</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gold-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium">Collect {getDayName(round.collectDate)}</p>
            <p className="font-semibold text-gray-900 text-sm mt-0.5">{formatDate(round.collectDate)}</p>
          </div>
          <div className="bg-gold-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium">Pay Out {getDayName(round.payoutDate)}</p>
            <p className="font-semibold text-gray-900 text-sm mt-0.5">{formatDate(round.payoutDate)}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-600 font-medium">Contributions received</span>
            <span className="font-bold text-gray-900">{paidCount} / {total}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(paidCount / total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ${paidCount * 200} collected · ${(total - paidCount) * 200} remaining
          </p>
        </div>

        {!allPaid && (
          <a
            href={reminderUrl ?? undefined}
            onClick={!reminderUrl ? e => e.preventDefault() : undefined}
            className={`flex items-center justify-center gap-2 w-full font-semibold py-2.5 rounded-xl text-sm transition-colors mb-3 ${
              reminderUrl
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            💬 Remind Unpaid ({unpaidWithPhone.length})
          </a>
        )}

        <button
          onClick={() => togglePayout(round.round)}
          className={`w-full py-3 rounded-xl font-semibold transition-colors text-sm ${
            round.payoutSent
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {round.payoutSent
            ? `✓ $2,400 Sent to ${recipientName}`
            : `Mark Payout Sent to ${recipientName}`}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-3">Collection Status</h3>
        <div className="space-y-2">
          {participants.map(p => (
            <PaymentRow
              key={p.slot}
              participant={p}
              roundNum={round.round}
              paid={round.payments[p.slot]}
              collectDate={round.collectDate}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-2">Round Notes</h3>
        <textarea
          className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-gold-400 bg-gray-50 transition-colors"
          rows={3}
          placeholder="Add any notes for this round..."
          value={round.notes}
          onChange={e => updateRoundNotes(round.round, e.target.value)}
        />
      </div>
    </div>
  )
}
