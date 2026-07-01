import { useState } from 'react'

export default function OrganizerCard({ organizerName, organizerPhone, t }) {
  if (!organizerPhone) return null
  const initial = organizerName ? organizerName[0].toUpperCase() : '?'
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(organizerPhone).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-3">{t.contactOrganizer}</h3>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gold-500 text-white font-bold text-lg flex items-center justify-center flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{organizerName}</p>
          <p className="text-sm text-gray-500">{organizerPhone}</p>
        </div>
      </div>
      <p className="text-sm text-gray-700 mb-2">{t.zelleInstruction(organizerPhone)}</p>
      <button
        onClick={handleCopy}
        className="block w-full text-center bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
      >
        {copied ? t.copiedConfirm : t.copyNumber}
      </button>
    </div>
  )
}
