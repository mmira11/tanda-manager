// src/components/admin/AdminDashboard.jsx — the organizer's four tabs, one job each:
// Today (who owes, mark paid, payout), Members (links and people), Schedule (rounds and
// dates), Settings (Zelle, Grokbot key, archive). Grokbot handles scheduled reminders.
import { useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { LABELS } from '../../data/labels'
import { formatMoney } from '../../utils/money'
import { getCurrentRound, getDayName, deadlineOnDate, getCountdownTo, dateLocale, inRound } from '../../utils/rounds'
import { compactCountdown, paymentStats } from '../../utils/presentation'
import DashboardView from './DashboardView'
import MembersView from './MembersView'
import ScheduleView from './ScheduleView'
import SettingsView from './SettingsView'
import PaymentSheet from './PaymentSheet'
import TabBar from '../ui/TabBar'
import { LangProvider } from '../../context/LangContext'

export default function AdminDashboard({ email, onNewCycle }) {
  const { store, error, clearError, togglePayment, togglePayout } = useStore()
  const [tab, setTab] = useState('dashboard')
  const [sheetSlot, setSheetSlot] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const readOnly = store.config.status === 'archived'
  // The organizer's screens are English only. Texts sent to members stay bilingual.
  const lang = 'en'
  const t = LABELS.en
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
  const countdownLabel = deadline && !readOnly ? compactCountdown(getCountdownTo(deadline, now)) : ''
  const unpaid = members.filter(member => !member.paid).length

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const tabs = [
    { id: 'dashboard', label: t.tabToday, icon: 'home', badge: readOnly ? 0 : unpaid },
    { id: 'members', label: t.tabMembers, icon: 'members' },
    { id: 'schedule', label: t.tabSchedule, icon: 'rounds' },
    { id: 'settings', label: t.tabSettings, icon: 'settings' },
  ]

  return (
    <LangProvider lang={lang}>
    <div className="admin-theme min-h-screen bg-ink text-stone-100">
      <div className="max-w-lg mx-auto px-4 pt-5 pb-28">
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
            cycleName={store.config.name}
            roundLabel={current ? t.roundOf(current.round, store.rounds.length) : ''}
            collectedLabel={formatMoney(stats.collected)}
            potLabel={formatMoney(stats.pot)}
            paid={stats.paid}
            total={stats.total}
            payoutLine={current ? t.payoutLine(payoutDay, recipient?.name || '') : ''}
            countdownLabel={countdownLabel}
            members={members}
            recipientSlot={current?.recipientSlot}
            recipientName={recipient?.name || ''}
            payoutSent={current?.payoutSent === true}
            onTogglePayout={current ? () => togglePayout(current.round) : undefined}
            onTogglePaid={member => togglePayment(current.round, member.slot)}
            contribution={store.config.contribution}
            zelle={store.config.organizerPhone}
            collectDate={current?.collectDate}
            readOnly={readOnly}
            onSelectMember={member => setSheetSlot(member.slot)}
          />
        )}
        {tab === 'members' && <MembersView readOnly={readOnly} />}
        {tab === 'schedule' && <ScheduleView readOnly={readOnly} />}
        {tab === 'settings' && <SettingsView email={email} onNewCycle={onNewCycle} />}
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
