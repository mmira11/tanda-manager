// src/components/public/PublicBoard.jsx
import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getDayName, getTandaSpan, formatSpanLabel, isTandaComplete, formatRelativeTime } from '../../utils/rounds'
import { fetchPublicData } from '../../utils/github'
import { LABELS } from '../../data/labels'
import { migrateStore } from '../../hooks/useTandaStore'
import { CONTRIBUTION } from '../../data/scheduleTemplate'
import RecipientSpotlight from './RecipientSpotlight'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'
import OrganizerCard from './OrganizerCard'
import RoundSchedule from './RoundSchedule'

export default function PublicBoard() {
  const { store } = useStore()
  const [liveData, setLiveData] = useState(null)
  const [lang, setLang] = useState(() => localStorage.getItem('tanda_lang') || 'en')
  const [lastFetched, setLastFetched] = useState(null)

  useEffect(() => {
    let cancelled = false
    function refresh() {
      fetchPublicData()
        .then(data => {
          if (cancelled) return
          setLiveData(migrateStore(data))
          setLastFetched(Date.now())
        })
        .catch(() => {})
    }
    refresh()
    function onVisibility() {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, 60000)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    localStorage.setItem('tanda_lang', next)
    setLang(next)
  }

  const data = liveData || store
  const { participants, rounds } = data
  const t = { ...LABELS[lang], allDone: LABELS[lang].allDone(rounds.length) }
  const span = getTandaSpan(rounds)
  const title = span ? `Tanda ${span.year}` : 'Tanda'
  const locale = lang === 'es' ? 'es' : 'en-US'

  if (!data.config.initialized) {
    return (
      <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500 mt-2 text-sm">{t.setupMsg}</p>
        </div>
      </div>
    )
  }

  const round = getCurrentRound(rounds)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  const isComplete = isTandaComplete(rounds)
  const collectDayName = rounds.length ? getDayName(rounds[0].collectDate, locale) : (lang === 'es' ? 'viernes' : 'Friday')
  const payoutDayName  = rounds.length ? getDayName(rounds[0].payoutDate,  locale) : (lang === 'es' ? 'sábado' : 'Saturday')

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <p className="text-xs text-gray-500">{span ? `${formatSpanLabel(span, locale)} · ` : ''}${CONTRIBUTION} {t.perPerson}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center text-xs font-semibold rounded-full border border-gray-200 overflow-hidden"
              aria-label="Toggle language"
            >
              <span className={`px-2.5 py-1 transition-colors ${lang === 'en' ? 'bg-gold-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                EN
              </span>
              <span className={`px-2.5 py-1 transition-colors ${lang === 'es' ? 'bg-gold-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                ES
              </span>
            </button>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">{t.round}</div>
              <div className="text-2xl font-black text-gold-600 leading-none">
                {round.round}
                <span className="text-sm font-medium text-gray-400"> / {rounds.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {lastFetched && (
          <p className="text-center text-[11px] text-gray-400 -mb-2">
            {formatRelativeTime(lastFetched, Date.now(), lang)}
          </p>
        )}
        <RecipientSpotlight
          round={round}
          recipientName={recipientName}
          t={t}
          pot={participants.length * CONTRIBUTION}
          totalRounds={rounds.length}
        />
        <CountdownTimer
          collectDate={round.collectDate}
          isComplete={isComplete}
          organizerName={data.config.organizerName}
          organizerPhone={data.config.organizerPhone}
          t={t}
        />
        <PaymentStatusList
          participants={participants}
          payments={round.payments}
          rounds={rounds}
          currentRoundNum={round.round}
          t={t}
        />
        <OrganizerCard
          organizerName={data.config.organizerName}
          organizerPhone={data.config.organizerPhone}
          t={t}
        />
        <RoundSchedule
          rounds={rounds}
          participants={participants}
          currentRoundNum={round.round}
          t={t}
        />
        <p className="text-center text-xs text-gray-400 pb-6">
          {lang === 'en'
            ? `Send $${CONTRIBUTION} to the organizer every other ${collectDayName} · Payout every other ${payoutDayName} · ${rounds.length} rounds total`
            : `Envía $${CONTRIBUTION} al organizador cada ${collectDayName} de por medio · Pago cada ${payoutDayName} de por medio · ${rounds.length} rondas en total`
          }
        </p>
      </div>
    </div>
  )
}
