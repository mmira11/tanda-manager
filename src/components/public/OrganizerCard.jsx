import { useState } from 'react'

export default function OrganizerCard({ organizerName, organizerPhone, t }) {
  if (!organizerPhone) return null
  const digits = organizerPhone.replace(/\D/g, '')
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
          <button
            onClick={handleCopy}
            className="text-sm text-gray-500 hover:text-gold-600 transition-colors text-left"
          >
            {copied ? '✓ Copied!' : organizerPhone}
          </button>
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
