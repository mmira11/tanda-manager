import { buildSmsUrl, buildWhatsAppUrl } from '../../utils/messaging'
import { useStore } from '../../context/StoreContext'

export default function PaymentRow({ participant, roundNum, paid, collectDate }) {
  const { store, togglePayment } = useStore()
  const { slot, name, phone } = participant
  const displayName = name || `Slot ${slot}`
  const smsUrl = phone ? buildSmsUrl(phone, displayName, store.config.organizerPhone, collectDate) : null
  const waUrl  = phone ? buildWhatsAppUrl(phone, displayName, store.config.organizerPhone, collectDate) : null

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${paid ? 'bg-emerald-50' : 'bg-gray-50'}`}>
      <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {slot}
      </span>

      <span className="flex-1 font-medium text-gray-900 min-w-0 truncate">
        {name || <span className="text-gray-400 italic text-sm">Slot {slot}</span>}
      </span>

      <button
        onClick={() => togglePayment(roundNum, slot)}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
          paid
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
        }`}
      >
        {paid ? '✓ Paid' : 'Pending'}
      </button>

      {smsUrl && (
        <a
          href={smsUrl}
          className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex-shrink-0"
          title={`Text ${displayName}`}
        >
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </a>
      )}

      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-green-50 hover:bg-green-100 transition-colors flex-shrink-0"
          title={`WhatsApp ${displayName}`}
        >
          <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  )
}
