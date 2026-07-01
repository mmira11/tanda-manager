import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getPaidCount, formatDate, getDayName } from '../../utils/rounds'
import { buildSmsUrl, buildGroupSmsUrl, buildReminderBody, buildTimedReminderSmsUrl, buildTimedReminderWhatsAppUrl } from '../../utils/messaging'
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
        <h3 className="font-semibold text-gray-900 mb-3">Reminders</h3>
        <div className="space-y-2">
          {participants.map(p => {
            const isPaid = round.payments[p.slot]
            const displayName = p.name || `Slot ${p.slot}`
            const sms12 = p.phone ? buildTimedReminderSmsUrl(p.phone, displayName, orgPhone, '12pm') : null
            const wa12  = p.phone ? buildTimedReminderWhatsAppUrl(p.phone, displayName, orgPhone, '12pm') : null
            const sms8  = p.phone ? buildTimedReminderSmsUrl(p.phone, displayName, orgPhone, '8pm') : null
            const wa8   = p.phone ? buildTimedReminderWhatsAppUrl(p.phone, displayName, orgPhone, '8pm') : null
            return (
              <div key={p.slot} className={`flex items-start gap-3 p-3 rounded-xl ${isPaid ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {p.slot}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{displayName}</p>
                  {isPaid ? (
                    <span className="text-emerald-600 text-xs font-semibold">✓ Paid</span>
                  ) : p.phone ? (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 w-10 flex-shrink-0">12 PM</span>
                        <a href={sms12} className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors" title={`SMS 12 PM reminder to ${displayName}`}>
                          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </a>
                        <a href={wa12} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 transition-colors" title={`WhatsApp 12 PM reminder to ${displayName}`}>
                          <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 w-10 flex-shrink-0">8 PM</span>
                        <a href={sms8} className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors" title={`SMS 8 PM final notice to ${displayName}`}>
                          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </a>
                        <a href={wa8} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 transition-colors" title={`WhatsApp 8 PM final notice to ${displayName}`}>
                          <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No phone on file</span>
                  )}
                </div>
              </div>
            )
          })}
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
