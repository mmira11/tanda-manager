import { useEffect, useState } from 'react'
import { LABELS } from '../../data/labels'
import { formatMoney } from '../../utils/money'
import { dateLocale, deadlineOnDate, formatDate, getCountdownTo } from '../../utils/rounds'
import { compactCountdown, daysUntil, memberRoundSteps, paymentStats } from '../../utils/presentation'
import Logo from '../ui/Logo'
import LangToggle from '../ui/LangToggle'
import TabBar from '../ui/TabBar'
import RoundStepper from './RoundStepper'

function Confetti() {
  const dots = [
    { left: '12%', top: '14%', color: '#F4795B', size: 7 },
    { left: '82%', top: '10%', color: '#127A74', size: 6 },
    { left: '90%', top: '24%', color: '#F5B942', size: 5 },
    { left: '22%', top: '8%', color: '#FB7185', size: 5 },
    { left: '72%', top: '20%', color: '#C44832', size: 4 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 motion-only" aria-hidden="true">
      {dots.map(dot => (
        <span
          key={`${dot.left}-${dot.top}`}
          className="confetti-dot"
          style={{ left: dot.left, top: dot.top, width: dot.size, height: dot.size, backgroundColor: dot.color }}
        />
      ))}
    </div>
  )
}

function CalendarIcon() {
  return (
    <span className="w-10 h-10 rounded-xl bg-white text-teal flex items-center justify-center shrink-0" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function MemberExperience({ board, lang, onToggleLang, complete = false, onForgetDevice }) {
  const t = LABELS[lang] || LABELS.en
  const locale = dateLocale(lang)
  const [tab, setTab] = useState('home')
  const [toast, setToast] = useState(false)
  const progress = board.progress || []
  const round = board.current_round
  const stats = paymentStats(progress, board.cycle?.contribution)
  const rounds = memberRoundSteps(board.rounds, round?.round_number, board)
  const paid = board.me?.paid_this_round === true
  const zelle = board.cycle?.zelle_destination?.trim() || ''
  const payoutDate = board.me?.payout_date
  const days = daysUntil(payoutDate)
  const deadlineMs = round?.collect_deadline
    ? new Date(round.collect_deadline).getTime()
    : round?.collect_date
      ? deadlineOnDate(round.collect_date, board.cycle?.timezone).getTime()
      : null
  const [time, setTime] = useState(() => (deadlineMs ? getCountdownTo(deadlineMs) : null))

  useEffect(() => {
    if (!deadlineMs) return undefined
    const id = setInterval(() => setTime(getCountdownTo(deadlineMs)), 30000)
    return () => clearInterval(id)
  }, [deadlineMs])

  async function copyZelle() {
    if (!zelle) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(zelle)
    } catch {
      window.prompt?.(t.copyZelle, zelle)
    }
    setToast(true)
    window.setTimeout(() => setToast(false), 1800)
  }

  const tabs = [
    { id: 'home', label: t.tabHome, icon: 'home' },
    { id: 'rounds', label: t.tabMyRounds, icon: 'rounds' },
    { id: 'profile', label: t.tabProfile, icon: 'profile' },
  ]

  return (
    <div className="min-h-screen bg-cream text-stone-900">
      <header className="px-4 pt-5 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900">Tanda</h1>
            <p className="text-xs text-stone-500 truncate">{t.tagline}</p>
          </div>
          <LangToggle lang={lang} onToggle={onToggleLang} label={t.toggleLanguage} />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-28 space-y-4">
        {tab === 'home' && (
          <>
            <div>
              <h2 className="text-2xl font-extrabold text-stone-900">{t.greeting(board.me?.display_first_name || '')}</h2>
              <p className="text-sm text-stone-500 mt-0.5">{t.greetingSub} 🌸</p>
            </div>

            {complete && (
              <div className="bg-white rounded-3xl shadow-sm p-5 text-center">
                <p className="text-lg font-bold text-teal">{t.tandaDone}</p>
                <p className="text-sm text-stone-500 mt-1">{t.allDone(progress.length)}</p>
              </div>
            )}

            {round && (
              <section className="relative overflow-hidden bg-white rounded-3xl shadow-sm p-5">
                {paid && !complete && <Confetti />}
                <p className="text-sm font-semibold text-teal">{t.roundWord(round.round_number)}</p>
                <p className={`text-3xl font-extrabold mt-1 ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {paid ? t.paidBig : t.pendingBig}
                </p>
                {!paid && time && (
                  <p className="text-sm font-medium text-amber-700 mt-1">
                    {time.done ? t.collectionDay : t.closesIn(compactCountdown(time))}
                  </p>
                )}

                {payoutDate && (
                  <div className="mt-4 bg-cream rounded-2xl p-3 flex items-center gap-3">
                    <CalendarIcon />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-stone-500">{t.yourPayout}</p>
                      <p className="font-bold text-stone-900">{formatDate(payoutDate, locale)} · {formatMoney(stats.pot)}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{t.thanksLine}</p>
                    </div>
                    {days != null && (
                      <div className="text-center shrink-0 pl-2">
                        <span className="text-coral text-lg" aria-hidden="true">♡</span>
                        <p className="text-[11px] font-bold text-coralink leading-tight max-w-16">{t.daysLeft(days)}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-stone-700">{t.groupPaid(stats.paid, stats.total)}</span>
                    <span className="font-bold text-teal">{stats.percent}%</span>
                  </div>
                  <div
                    className="mt-2 h-2.5 bg-stone-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={stats.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t.groupPaid(stats.paid, stats.total)}
                  >
                    <div className="h-full bg-teal rounded-full" style={{ width: `${stats.percent}%` }} />
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white rounded-3xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-stone-900">{t.roundsTitle}</h3>
                <button type="button" onClick={() => setTab('rounds')} className="text-sm font-semibold text-coralink min-h-11 px-1">
                  {t.seeAll}
                </button>
              </div>
              <RoundStepper rounds={rounds} label={t.roundsTitle} />
            </section>

            <div>
              <button
                type="button"
                onClick={copyZelle}
                disabled={!zelle}
                className="w-full min-h-14 rounded-2xl bg-teal text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" />
                </svg>
                {t.copyZelle}
              </button>
              <p className="text-center text-xs text-stone-500 mt-2">{zelle ? t.copyZelleHint : t.zelleMissing}</p>
            </div>
          </>
        )}

        {tab === 'rounds' && (
          <section className="bg-white rounded-3xl shadow-sm p-4 space-y-2">
            <h2 className="font-bold text-lg px-1">{t.roundsTitle}</h2>
            {rounds.length === 0 && <p className="text-sm text-stone-500 px-1">{t.noRounds}</p>}
            {rounds.map(item => (
              <div key={item.round} className={`rounded-2xl px-3 py-3 flex items-center gap-3 ${item.state === 'current' ? 'bg-teal/10' : 'bg-cream'}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${item.state === 'future' ? 'bg-stone-200 text-stone-500' : 'bg-teal text-white'}`}>
                  {item.round}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{item.name}</p>
                  <p className="text-xs text-stone-500">{formatDate(item.payoutDate, locale)}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'profile' && (
          <section className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
            <h2 className="text-2xl font-extrabold">{board.me?.display_first_name}</h2>
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{t.profileLanguage}</p>
              <p className="mt-1 font-semibold">{lang === 'es' ? 'Español' : 'English'}</p>
              <button type="button" onClick={onToggleLang} className="mt-2 min-h-11 px-4 rounded-full bg-coral text-ink text-sm font-bold">
                {lang === 'en' ? 'ES' : 'EN'}
              </button>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{t.profilePayout}</p>
              <p className="mt-1 font-semibold">
                {payoutDate ? `${formatDate(payoutDate, locale)} · ${formatMoney(stats.pot)}` : '—'}
              </p>
            </div>
            {onForgetDevice && (
              <div className="pt-4 border-t border-stone-100">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{t.notYou}</p>
                <button type="button" onClick={onForgetDevice} className="mt-2 min-h-11 px-4 rounded-full border border-stone-300 text-stone-700 text-sm font-semibold">
                  {t.forgetDevice}
                </button>
                <p className="mt-2 text-xs text-stone-500">{t.forgetDeviceHint}</p>
              </div>
            )}
          </section>
        )}
      </main>

      {toast && (
        <p role="status" className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg z-30">
          {t.copiedToast}
        </p>
      )}

      <TabBar tabs={tabs} active={tab} onChange={setTab} label={t.roundsTitle} />
    </div>
  )
}
