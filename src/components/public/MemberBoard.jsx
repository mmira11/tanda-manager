// Private member page. Reads get_member_board only — never the payments table —
// and refetches on a timer (and on an empty realtime signal) so a mark-paid shows up.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LABELS } from '../../data/labels'
import { useMemberBoard } from '../../hooks/useMemberBoard'
import { formatMoney } from '../../utils/money'
import { formatDate, formatRelativeTime } from '../../utils/rounds'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'
import RecipientSpotlight from './RecipientSpotlight'

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
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">{children}</div>
    </div>
  )
}

function LinkNotFound() {
  const en = LABELS.en
  const es = LABELS.es
  return (
    <Shell>
      <div className="text-5xl mb-3">🔗</div>
      <h1 className="text-2xl font-bold text-gray-900">{en.linkNotFound}</h1>
      <p className="text-gray-500 mt-2 text-sm">{en.linkNotFoundBody}</p>
      <h2 className="text-xl font-bold text-gray-900 mt-6">{es.linkNotFound}</h2>
      <p className="text-gray-500 mt-2 text-sm">{es.linkNotFoundBody}</p>
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
  const [fetchedAt, setFetchedAt] = useState(null)
  usePrivateHead()

  useEffect(() => {
    if (status === 'ready') setFetchedAt(Date.now())
  }, [status, board])

  useEffect(() => {
    if (savedLang() || !board?.me?.language_pref) return
    if (board.me.language_pref === 'es') setLang('es')
  }, [board])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    try { localStorage.setItem('tanda_lang', next) } catch { /* private mode */ }
    setLang(next)
  }

  if (status === 'loading') return <Shell><p className="text-gray-500">Loading…</p></Shell>
  if (status === 'notfound') return <LinkNotFound />
  if (status !== 'ready' || !board) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-900">{LABELS.en.linkNotFound}</h1>
        <p className="text-gray-500 mt-2 text-sm">Something went wrong. Try the link again in a moment.</p>
        <h2 className="text-lg font-bold text-gray-900 mt-4">{LABELS.es.linkNotFound}</h2>
        <p className="text-gray-500 mt-2 text-sm">Algo salió mal. Intenta el enlace de nuevo en un momento.</p>
      </Shell>
    )
  }

  const t = LABELS[lang] || LABELS.en
  const progress = board.progress || []
  const round = board.current_round
  const contribution = Number(board.cycle?.contribution) || 0
  const pot = contribution * progress.length
  const participants = progress.map(person => ({ slot: person.slot, name: person.display_first_name }))
  const payments = Object.fromEntries(progress.map(person => [person.slot, person.paid === true]))
  const viewRound = round && {
    round: round.round_number,
    collectDate: round.collect_date,
    payoutDate: round.payout_date,
    payoutSent: round.payout_sent,
    recipientSlot: progress.find(person => person.is_recipient)?.slot,
    payments,
  }
  const complete = boardComplete(board)
  const labels = { ...t, allDone: t.allDone(progress.length) }
  const paid = board.me?.paid_this_round === true

  return (
    <div className="min-h-screen bg-gold-50">
      <div className="bg-gradient-to-r from-white via-gold-50/60 to-white border-b border-gold-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{board.cycle?.name || 'Tanda'}</h1>
            <p className="text-xs text-gray-500">{formatMoney(contribution)} {t.perPerson}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center text-xs font-semibold rounded-full border border-gray-200 overflow-hidden"
              aria-label="Toggle language"
            >
              <span className={`px-2.5 py-1 ${lang === 'en' ? 'bg-gold-500 text-white' : 'text-gray-400'}`}>EN</span>
              <span className={`px-2.5 py-1 ${lang === 'es' ? 'bg-gold-500 text-white' : 'text-gray-400'}`}>ES</span>
            </button>
            {round && (
              <div className="text-right">
                <div className="text-xs text-gray-400 font-medium">{t.round}</div>
                <div className="text-2xl font-black text-gold-600 leading-none">
                  {round.round_number}
                  <span className="text-sm font-medium text-gray-400"> / {progress.length}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {fetchedAt && (
          <p className="text-center text-[11px] text-gray-400">{formatRelativeTime(fetchedAt, Date.now(), lang)}</p>
        )}

        <div className="bg-white rounded-2xl shadow-md border-l-4 border-gold-500 p-4">
          <p className="font-bold text-gray-900">{board.me?.display_first_name}</p>
          <p className={`text-sm font-semibold mt-1 ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
            {paid ? `✓ ${t.yourStatusPaid}` : `● ${t.yourStatusPending}`}
          </p>
          {board.me?.payout_date && (
            <p className="text-sm text-gray-700 mt-3 pt-3 border-t border-dashed border-gray-200">
              <span className="font-semibold text-gold-700">{t.yourTurn}:</span>{' '}
              {formatDate(board.me.payout_date)} · {formatMoney(pot)}
            </p>
          )}
        </div>

        {viewRound && (
          <RecipientSpotlight
            round={viewRound}
            recipientName={round.recipient_first_name}
            t={labels}
            pot={pot}
            totalRounds={progress.length}
          />
        )}

        {viewRound && (
          <CountdownTimer
            collectDate={viewRound.collectDate}
            isComplete={complete}
            amountLabel={formatMoney(contribution)}
            t={labels}
          />
        )}

        {complete && !viewRound && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 text-center">
            <p className="text-lg font-bold text-gold-600">{t.tandaDone}</p>
            <p className="text-sm text-gray-500 mt-1">{labels.allDone}</p>
          </div>
        )}

        <PaymentStatusList
          participants={participants}
          payments={payments}
          rounds={viewRound ? [viewRound] : []}
          currentRoundNum={viewRound?.round}
          t={labels}
          mySlot={board.me?.slot}
        />
      </div>
    </div>
  )
}
