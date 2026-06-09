export default function OrganizerCard({ organizerName, organizerPhone, t }) {
  if (!organizerPhone) return null
  const digits = organizerPhone.replace(/\D/g, '')
  const initial = organizerName ? organizerName[0].toUpperCase() : '?'

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-3">{t.contactOrganizer}</h3>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gold-500 text-white font-bold text-lg flex items-center justify-center flex-shrink-0">
          {initial}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{organizerName}</p>
          <p className="text-sm text-gray-500">{organizerPhone}</p>
        </div>
      </div>
      <a
        href={`zelle://${digits}`}
        className="block w-full text-center bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
      >
        {t.payViaZelle}
      </a>
    </div>
  )
}
