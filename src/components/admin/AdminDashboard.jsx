import { useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { LABELS } from '../../data/labels'
import { formatMoney } from '../../utils/money'
import { getCurrentRound, getDayName, deadlineOnDate, getCountdownTo, dateLocale, inRound } from '../../utils/rounds'
import { compactCountdown, paymentStats } from '../../utils/presentation'
import RoundPanel from './RoundPanel'
import RosterEditor from './RosterEditor'
import HistoryLog from './HistoryLog'
import DataControls from './DataControls'
import DashboardView from './DashboardView'
import PaymentSheet from './PaymentSheet'
import TabBar from '../ui/TabBar'
import { LangProvider } from '../../context/LangContext'
import { buildReminderView } from '../../utils/reminderQueue'

function readLang() {
  try {
    const value = localStorage.getItem('tanda_lang')
    return value === 'es' || value === 'en' ? value : 'en'
  } catch {
    return 'en'
  }
}

export default function AdminDashboard({ email, onNewCycle }) {
  const {
    store, cycles, selectCycle, archiveCycle, error, clearError, pendingReview, togglePayment,
    confirmMatch, dismissReview, reminderMeta, buildReminderList, markReminders,
  } = useStore()
  const [tab, setTab] = useState('dashboard')
  const [lang, setLang] = useState(readLang)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [reminderNotice, setReminderNotice] = useState('')
  const [reminderBuilding, setReminderBuilding] = useState(false)
  const [selectedRound, setSelectedRound] = useState(() => getCurrentRound(store.rounds).round)
  const [sheetSlot, setSheetSlot] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const hasActive = cycles.some(cycle => cycle.status === 'active')
  const viewingActive = store.config.status === 'active'
  const readOnly = store.config.status === 'archived'
  const t = LABELS[lang] || LABELS.en
  const current = getCurrentRound(store.rounds)
  const payers = inRound(current, store.participants)
  const stats = paymentStats(
    payers.map(person => current?.payments?.[person.slot] === true),
    store.config.contribution,
  )
  const members = payers.map(person => ({
    slot: person.slot,
    name: person.name,
    phone: person.phone,
    paid: current?.payments?.[person.slot] === true,
  }))
  const sheetMember = members.find(person => person.slot === sheetSlot) || null
  const recipient = store.participants.find(person => person.slot === current?.recipientSlot)
  const payoutDay = current ? getDayName(current.payoutDate, dateLocale(lang)) : ''
  const deadline = current ? deadlineOnDate(current.collectDate, store.config.timezone).getTime() : null
  const countdownLabel = deadline ? compactCountdown(getCountdownTo(deadline, now)) : ''
  const queue = buildReminderView({
    now,
    timezone: store.config.timezone,
    settings: reminderMeta.settings,
    rounds: store.rounds,
    participants: store.participants,
    queued: reminderMeta.queued,
    templates: reminderMeta.templates,
    contribution: store.config.contribution,
    zelle: store.config.organizerPhone,
  })
  const windowLabel = {
    thursday_all: t.reminderThursday,
    friday_noon: t.reminderNoon,
    friday_evening: t.reminderEvening,
  }[queue.window] || ''

  async function onBuildReminders() {
    setReminderBuilding(true)
    setReminderNotice('')
    try {
      const plan = await buildReminderList(now)
      if (!plan?.window) setReminderNotice(t.noReminderWindow)
      else if (!plan.rows?.length) setReminderNotice(t.noReminderRecipients)
    } catch {
      // buildReminderList already surfaces the message.
    } finally {
      setReminderBuilding(false)
    }
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    try { localStorage.setItem('tanda_lang', next) } catch { /* private mode */ }
    setLang(next)
  }

  const editRound = (roundNum) => {
    setSelectedRound(roundNum)
    setTab('schedule')
  }

  const tabs = [
    { id: 'dashboard', label: t.tabDashboard, icon: 'home', badge: queue.count },
    { id: 'members', label: t.tabMembers, icon: 'members' },
    { id: 'schedule', label: t.tabSchedule, icon: 'rounds' },
    { id: 'settings', label: t.tabSettings, icon: 'settings' },
  ]

  return (
    <LangProvider lang={lang}>
    <div className="admin-theme min-h-screen bg-ink text-stone-100">
      <div className="max-w-lg mx-auto px-4 pt-5 pb-28">
        {email && <p className="mb-3 truncate text-[11px] text-stone-400">{email}</p>}
        {confirmArchive && (
          <div role="dialog" aria-modal="true" aria-labelledby="archive-title" className="mb-4 bg-panel border border-white/10 rounded-2xl p-4">
            <h2 id="archive-title" className="font-semibold text-stone-50">Archive this cycle?</h2>
            <p className="text-sm text-stone-300 mt-1">
              Payments and the roster will be locked. You can still view history, then start a new cycle.
            </p>
            <h3 className="font-semibold text-stone-50 mt-3">¿Archivar este ciclo?</h3>
            <p className="text-sm text-stone-300 mt-1">
              Los pagos y la lista quedarán bloqueados. Podrás ver el historial y luego empezar un ciclo nuevo.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setConfirmArchive(false); archiveCycle() }}
                className="flex-1 bg-mint text-ink font-semibold py-2.5 rounded-xl text-sm min-h-11"
              >
                {t.archiveCycle}
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="flex-1 border border-white/15 font-semibold py-2.5 rounded-xl text-sm min-h-11"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}
        {readOnly && (
          <div className="mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-stone-200">
            {t.archivedBanner}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-3 bg-red-950/40 border border-red-400/30 rounded-xl px-4 py-2.5">
            <p className="text-sm text-red-200 flex-1">{t.couldntSave(error)}</p>
            <button type="button" onClick={clearError} className="text-xs font-semibold text-red-100 min-h-11">{t.dismiss}</button>
          </div>
        )}

        {tab === 'dashboard' && (
          <DashboardView
            t={t}
            lang={lang}
            onToggleLang={toggleLang}
            cycleName={store.config.name}
            roundLabel={current ? t.roundOf(current.round, store.rounds.length) : ''}
            collectedLabel={formatMoney(stats.collected)}
            potLabel={formatMoney(stats.pot)}
            paid={stats.paid}
            total={stats.total}
            payoutLine={current ? t.payoutLine(payoutDay, recipient?.name || '') : ''}
            countdownLabel={countdownLabel}
            members={members}
            contribution={store.config.contribution}
            zelle={store.config.organizerPhone}
            collectDate={current?.collectDate}
            reviews={pendingReview}
            participants={store.participants}
            rounds={store.rounds}
            locale={dateLocale(lang)}
            timeZone={store.config.timezone}
            onMatchReview={confirmMatch}
            onDismissReview={dismissReview}
            readOnly={readOnly}
            onSelectMember={member => setSheetSlot(member.slot)}
            reminderItems={queue.items}
            reminderWindowLabel={windowLabel}
            reminderCollectDate={queue.collectDate}
            onMarkSent={id => markReminders([id], 'sent')}
            onSkipReminder={id => markReminders([id], 'skipped')}
            onMarkAllReminders={ids => markReminders(ids, 'sent')}
            onBuildReminders={onBuildReminders}
            reminderBuilding={reminderBuilding}
            reminderNotice={reminderNotice}
          />
        )}
        {tab === 'members' && <RosterEditor readOnly={readOnly} />}
        {tab === 'schedule' && (
          <div className="space-y-4">
            <RoundPanel selectedRound={selectedRound} onSelectRound={setSelectedRound} readOnly={readOnly} />
            <HistoryLog onEditRound={editRound} />
          </div>
        )}
        {tab === 'settings' && (
          <div className="space-y-4">
            {cycles.length > 0 && (
              <label className="block text-sm text-stone-300">
                {t.cycleLabel}
                <select
                  aria-label={t.cycleLabel}
                  value={store.config.cycleId}
                  onChange={e => selectCycle(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-ink border border-white/15 px-3 py-3 text-sm text-stone-100"
                >
                  {cycles.map(cycle => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name} · {cycle.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {hasActive && (
              <p className="text-xs text-stone-400">
                Archive the active cycle before starting another.
                {' '}Archiva el ciclo activo antes de empezar otro.
              </p>
            )}
            <div className="flex gap-2">
              {viewingActive && (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="flex-1 min-h-11 text-sm font-semibold rounded-xl border border-white/15"
                >
                  {t.archive}
                </button>
              )}
              {onNewCycle && (
                <button
                  type="button"
                  onClick={onNewCycle}
                  disabled={hasActive}
                  title={hasActive ? t.archiveFirst : undefined}
                  className="flex-1 min-h-11 text-sm font-semibold rounded-xl bg-mint text-ink disabled:opacity-40"
                >
                  {t.newCycle}
                </button>
              )}
            </div>
            <DataControls email={email} />
          </div>
        )}
      </div>

      {sheetMember && (
        <PaymentSheet
          member={sheetMember}
          t={t}
          readOnly={readOnly}
          onClose={() => setSheetSlot(null)}
          onToggle={member => togglePayment(current.round, member.slot)}
        />
      )}

      <TabBar tabs={tabs} active={tab} onChange={setTab} tone="dark" label={t.adminNav} />
    </div>
    </LangProvider>
  )
}
