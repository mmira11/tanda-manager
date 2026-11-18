// Landing page. The old public roster lived here; members now open /m/:token.
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { LABELS } from '../../data/labels'
import { savedMemberToken } from '../../utils/memberLink'

export default function MemberLinkNotice() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('tanda_lang') || 'en' } catch { return 'en' }
  })
  const t = LABELS[lang] || LABELS.en

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    try { localStorage.setItem('tanda_lang', next) } catch { /* private mode */ }
    setLang(next)
  }

  // Opened from a home-screen icon on a phone that already opened its member link.
  const saved = savedMemberToken()
  if (saved) return <Navigate to={`/m/${encodeURIComponent(saved)}`} replace />

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-sm p-8 w-full max-w-sm text-center">
        <button
          onClick={toggleLang}
          aria-label={t.toggleLanguage}
          className="text-xs font-semibold text-coralink border border-coral/40 rounded-full px-3 py-1 mb-4 min-h-11"
        >
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
        <div className="text-5xl mb-3">🤝</div>
        <h1 className="text-2xl font-bold text-stone-900">{t.useLinkTitle}</h1>
        <p className="text-stone-500 mt-2 text-sm">{t.useLinkBody}</p>
        <Link
          to="/admin"
          className="mt-6 inline-block w-full bg-teal hover:opacity-90 text-white font-semibold py-3 rounded-xl transition-colors min-h-12"
        >
          {t.organizerSignIn}
        </Link>
      </div>
    </div>
  )
}
