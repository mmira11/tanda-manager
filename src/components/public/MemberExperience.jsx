import { useEffect, useState } from 'react'
import { LABELS } from '../../data/labels'
import { formatMoney } from '../../utils/money'
import { dateLocale, deadlineOnDate, formatDate, getCountdownTo } from '../../utils/rounds'
import { compactCountdown, daysUntil, memberRoundSteps, paymentStats } from '../../utils/presentation'
import Logo from '../ui/Logo'
import LangToggle from '../ui/LangToggle'
import TabBar from '../ui/TabBar'
import RoundStepper from './RoundStepper'
import ProgressRing from '../admin/ProgressRing'
import Celebration, { alreadySeen, markSeen } from './Celebration'
import AddToHomeHint from './AddToHomeHint'
import GroupView from './GroupView'

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

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 text-teal" aria-hidden="true">
      <path d="M3 8.2 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MemberExperience({ board, lang, onToggleLang, complete = false, onForgetDevice, preview = false }) {
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
  const myName = board.me?.display_first_name || ''
  const myTurn = progress.some(p => p.slot === board.me?.slot && p.is_recipient === true)
  // Rounds carry first names only, so "mine" is my name on my payout date.
  const isMine = item => item.name === myName && item.payoutDate === payoutDate
  const [celebration, setCelebration] = useState(null)
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

  useEffect(() => {
    if (preview || complete || !round) return
    const n = round.round_number
    if (myTurn && !alreadySeen('turn', n)) setCelebration('turn')
    else if (paid && !alreadySeen('paid', n)) setCelebration('paid')
  }, [preview, complete, round, myTurn, paid])

  function closeCelebration() {
    markSeen(celebration, round.round_number)
    setCelebration(null)
  }

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
    { id: 'group', label: t.tabGroup, icon: 'members' },
    { id: 'profile', label: t.tabProfile, icon: 'profile' },
  ]

  return (
    <div className="min-h-screen bg-cream text-stone-900">
      {preview && (
        <p className="bg-stone-900 text-white text-xs font-semibold text-center px-4 py-2">
          Preview: this is what {myName || 'this member'} sees. Nothing is saved on your phone.
        </p>
      )}
      <header className="px-4 pt-5 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 truncate">{board.cycle?.name || 'Tanda'}</h1>
            <p className="text-xs text-stone-500 truncate">{t.tagline}</p>
          </div>
          <LangToggle lang={lang} onToggle={onToggleLang} label={t.toggleLanguage} />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-28 space-y-4">
        {tab === 'home' && (
          <>
            <div className="card-in">
              <h2 className="text-2xl font-extrabold text-stone-900">{t.greeting(myName)}</h2>
              <p className="text-sm text-stone-500 mt-0.5">{t.greetingSub} 🌸</p>
            </div>

            {complete && (
              <div className="bg-white rounded-3xl shadow-sm p-5 text-center">
                <p className="text-lg font-bold text-teal">{t.tandaDone}</p>
                <p className="text-sm text-stone-500 mt-1">{t.allDone(progress.length)}</p>
              </div>
            )}

            {round?.recipient_first_name && !complete && (
              <section className="card-in relative overflow-hidden rounded-3xl p-5 text-white shadow-sm bg-gradient-to-br from-teal to-[#0B5A55]">
                <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/10" aria-hidden="true" />
                <div className="absolute inset-y-0 w-20 bg-white/10 blur-md animate-shimmer" aria-hidden="true" />
                <p className="relative text-sm font-semibold text-white/80">{t.roundWord(round.round_number)}</p>
                <p className="relative text-xl font-extrabold mt-1">
                  {myTurn ? t.yourRound : `${t.receiving(round.recipient_first_name)} 🎉`}
                </p>
                <p className="relative text-sm text-white/90 mt-1">
                  {t.receivingPot(formatMoney(stats.pot), formatDate(round.payout_date, locale))}
                </p>
              </section>
            )}

            {round && (
              <section className="card-in relative overflow-hidden bg-white rounded-3xl shadow-sm p-5">
                {paid && !complete && <Confetti />}
                {(complete || !round.recipient_first_name) && (
                  <p className="text-sm font-semibold text-teal">{t.roundWord(round.round_number)}</p>
                )}
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

                <div className="mt-5">
                  <ProgressRing
                    value={stats.paid}
                    max={stats.total}
                    label={t.groupPaid(stats.paid, stats.total)}
                    track="#EFE9DF"
                    stroke="#127A74"
                    size="w-36 h-36"
                  >
                    <p className="text-2xl font-extrabold text-teal leading-none">{stats.percent}%</p>
                    <p className="text-[11px] font-semibold text-stone-500 mt-1 leading-tight">{t.groupPaid(stats.paid, stats.total)}</p>
                  </ProgressRing>
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

            {!preview && <AddToHomeHint t={t} />}
          </>
        )}

        {tab === 'rounds' && (
          <section className="bg-white rounded-3xl shadow-sm p-4 space-y-2">
            <h2 className="font-bold text-lg px-1">{t.roundsTitle}</h2>
            {rounds.length === 0 && <p className="text-sm text-stone-500 px-1">{t.noRounds}</p>}
            {rounds.map(item => (
              <div key={item.round} className={`rounded-2xl px-3 py-3 flex items-center gap-3 ${isMine(item) ? 'bg-coral/15 ring-2 ring-coral/40' : item.state === 'current' ? 'bg-teal/10' : 'bg-cream'}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${item.state === 'future' ? 'bg-stone-200 text-stone-500' : 'bg-teal text-white'}`}>
                  {item.round}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">
                    {item.name}
                    {isMine(item) && (
                      <span className="ml-2 align-middle rounded-full bg-coral text-ink text-[11px] font-bold px-2 py-0.5">{t.youBadge}</span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500">{formatDate(item.payoutDate, locale)}</p>
                </div>
                {item.state === 'past' && <CheckIcon />}
              </div>
            ))}
          </section>
        )}

        {tab === 'group' && (
          <GroupView board={board} t={t} locale={locale} rounds={rounds} isMine={isMine} complete={complete} />
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
            {onForgetDevice && !preview && (
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

      {celebration === 'turn' && (
        <Celebration
          emoji="🎁"
          title={t.celebrateTitle(myName)}
          body={t.celebrateBody(formatMoney(stats.pot), formatDate(round.payout_date, locale))}
          button={t.yay}
          onClose={closeCelebration}
        />
      )}
      {celebration === 'paid' && (
        <Celebration
          emoji="💕"
          title={t.paidThanks(myName)}
          body={t.paidThanksBody}
          button={t.yay}
          onClose={closeCelebration}
        />
      )}
    </div>
  )
}
