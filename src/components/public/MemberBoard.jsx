// Private member page. Reads get_member_board only — never the payments table —
// and refetches on a timer (and on an empty realtime signal) so a mark-paid shows up.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LABELS } from '../../data/labels'
import { useMemberBoard } from '../../hooks/useMemberBoard'
import MemberExperience from './MemberExperience'

function savedLang() {
  try {
    const value = localStorage.getItem('tanda_lang')
    return value === 'es' || value === 'en' ? value : null
  } catch {
    return null
  }
}

function usePrivateHead() {
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'
    referrer.content = 'no-referrer'
    document.head.append(robots, referrer)
    return () => {
      robots.remove()
      referrer.remove()
    }
  }, [])
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-sm p-8 w-full max-w-sm text-center">{children}</div>
    </div>
  )
}

function LinkNotFound() {
  const en = LABELS.en
  const es = LABELS.es
  return (
    <Shell>
      <div className="text-5xl mb-3">🔗</div>
      <h1 className="text-2xl font-bold text-stone-900">{en.linkNotFound}</h1>
      <p className="text-stone-500 mt-2 text-sm">{en.linkNotFoundBody}</p>
      <h2 className="text-xl font-bold text-stone-900 mt-6">{es.linkNotFound}</h2>
      <p className="text-stone-500 mt-2 text-sm">{es.linkNotFoundBody}</p>
    </Shell>
  )
}

function boardComplete(board, today = new Date()) {
  if (board.cycle?.status === 'archived') return true
  const payout = board.current_round?.payout_date
  if (!payout) return false
  return today > new Date(`${payout}T23:59:59`)
}

export default function MemberBoard() {
  const { token } = useParams()
  const { board, status } = useMemberBoard(token)
  const [lang, setLang] = useState(() => savedLang() || 'en')
  usePrivateHead()

  useEffect(() => {
    if (savedLang() || !board?.me?.language_pref) return
    if (board.me.language_pref === 'es') setLang('es')
  }, [board])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    try { localStorage.setItem('tanda_lang', next) } catch { /* private mode */ }
    setLang(next)
  }

  if (status === 'loading') return <Shell><p className="text-stone-500">Loading…</p></Shell>
  if (status === 'notfound') return <LinkNotFound />
  if (status !== 'ready' || !board) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-stone-900">{LABELS.en.linkNotFound}</h1>
        <p className="text-stone-500 mt-2 text-sm">Something went wrong. Try the link again in a moment.</p>
        <h2 className="text-lg font-bold text-stone-900 mt-4">{LABELS.es.linkNotFound}</h2>
        <p className="text-stone-500 mt-2 text-sm">Algo salió mal. Intenta el enlace de nuevo en un momento.</p>
      </Shell>
    )
  }

  return (
    <MemberExperience
      board={board}
      lang={lang}
      onToggleLang={toggleLang}
      complete={boardComplete(board)}
    />
  )
}
