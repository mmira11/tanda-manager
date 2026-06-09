// src/components/public/PublicBoard.jsx
import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getDayName } from '../../utils/rounds'
import { fetchPublicData } from '../../utils/github'
import { migrateStore } from '../../hooks/useTandaStore'
import { CONTRIBUTION } from '../../data/scheduleTemplate'
import RecipientSpotlight from './RecipientSpotlight'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'
import OrganizerCard from './OrganizerCard'
import RoundSchedule from './RoundSchedule'

const LABELS = {
  en: {
    recipient:     "This round's recipient",
    collection:    'Collection',
    payout:        'Payout',
    nextIn:        'Next collection in',
    days:          'days',
    hours:         'hours',
    mins:          'mins',
    contributions: 'Contributions',
    pending:       'Pending',
    paid:          'Paid',
    whosNext:      "Who's next",
    round:         'Round',
    of:            'of',
    perPerson:     'per person',
    collectionDay: 'Collection day is here!',
    sendTo:        'Please send $200 to',
    organizer:     'the organizer',
    viaZelle:      'via Zelle',
    today:         'today.',
    tandaDone:     'Tanda Complete!',
    allDone:       'All 12 rounds finished. Amazing job everyone!',
    congrats:         'Congratulations',
    payoutDone:       'Payout complete!',
    contactOrganizer: 'Contact Organizer',
    payViaZelle:      'Pay via Zelle',
    schedule:         'Round Schedule',
    completed:        'Completed',
  },
  es: {
    recipient:     'El turno de esta ronda',
    collection:    'Cobro',
    payout:        'Pago',
    nextIn:        'Próximo cobro en',
    days:          'días',
    hours:         'horas',
    mins:          'mins',
    contributions: 'Aportaciones',
    pending:       'Pendiente',
    paid:          'Pagado',
    whosNext:      'Quién sigue',
    round:         'Ronda',
    of:            'de',
    perPerson:     'por persona',
    collectionDay: '¡Día de cobro!',
    sendTo:        'Por favor envía $200 a',
    organizer:     'el organizador',
    viaZelle:      'por Zelle',
    today:         'hoy.',
    tandaDone:     '¡Tanda completa!',
    allDone:       'Las 12 rondas terminaron. ¡Excelente trabajo!',
    congrats:         'Felicidades',
    payoutDone:       '¡Pago completado!',
    contactOrganizer: 'Contactar al organizador',
    payViaZelle:      'Pagar por Zelle',
    schedule:         'Calendario de rondas',
    completed:        'Completada',
  },
}

export default function PublicBoard() {
  const { store } = useStore()
  const [liveData, setLiveData] = useState(null)
  const [lang, setLang] = useState(() => localStorage.getItem('tanda_lang') || 'en')

  useEffect(() => {
    fetchPublicData()
      .then(data => setLiveData(migrateStore(data)))
      .catch(() => {})
  }, [])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    localStorage.setItem('tanda_lang', next)
    setLang(next)
  }

  const data = liveData || store
  const t = LABELS[lang]
  const { participants, rounds } = data

  if (!data.config.initialized) {
    return (
      <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Tanda 2026</h1>
          <p className="text-gray-500 mt-2 text-sm">Check back soon — the organizer is finishing setup.</p>
        </div>
      </div>
    )
  }

  const round = getCurrentRound(rounds)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  const isComplete = new Date() > new Date('2026-11-15T00:00:00')
  const locale = lang === 'es' ? 'es' : 'en-US'
  const collectDayName = rounds.length ? getDayName(rounds[0].collectDate, locale) : (lang === 'es' ? 'viernes' : 'Friday')
  const payoutDayName  = rounds.length ? getDayName(rounds[0].payoutDate,  locale) : (lang === 'es' ? 'sábado' : 'Saturday')

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda 2026</h1>
            <p className="text-xs text-gray-500">Jun 12 – Nov 14, 2026 · $200 {t.perPerson}</p>
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
