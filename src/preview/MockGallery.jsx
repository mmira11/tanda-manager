import { useParams } from 'react-router-dom'
import { LABELS } from '../data/labels'
import { formatMoney } from '../utils/money'
import MemberExperience from '../components/public/MemberExperience'
import DashboardView from '../components/admin/DashboardView'
import TabBar from '../components/ui/TabBar'

function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const PEOPLE = [
  ['Maria', true, '(555) 010-0101'],
  ['Rosa', true, '(555) 010-0102'],
  ['Luis', false, '(555) 010-0103'],
  ['Ana', true, ''],
  ['Carmen', false, '(555) 010-0104'],
  ['Sofia', false, ''],
  ['Elena', true, '(555) 010-0105'],
  ['Pedro', false, '(555) 010-0106'],
]

function MemberPreview() {
  const board = {
    cycle: {
      name: 'Familia Demo',
      contribution: 100,
      status: 'active',
      start_date: '2099-03-06',
      interval_days: 14,
      timezone: 'America/Los_Angeles',
      zelle_destination: 'familia.demo',
    },
    me: {
      slot: 1,
      display_first_name: 'Maria',
      language_pref: 'es',
      payout_date: daysFromNow(12),
      paid_this_round: true,
    },
    current_round: {
      round_number: 3,
      collect_date: daysFromNow(1),
      payout_date: daysFromNow(2),
      payout_sent: false,
      recipient_first_name: 'Luis',
    },
    progress: PEOPLE.map(([name, paid], index) => ({
      slot: index + 1,
      display_first_name: name,
      paid,
      is_recipient: index === 2,
    })),
    rounds: PEOPLE.map(([name], index) => ({
      number: index + 1,
      collect_date: '2099-03-06',
      payout_date: index === 0 ? daysFromNow(12) : '2099-04-01',
      recipient_first_name: name,
    })),
  }
  return <MemberExperience board={board} lang="es" onToggleLang={() => {}} />
}

function AdminPreview() {
  const t = LABELS.en
  const members = PEOPLE.map(([name, paid, phone], index) => ({
    slot: index + 1, name, paid, phone,
  }))
  const paid = members.filter(member => member.paid).length
  return (
    <div className="min-h-screen bg-ink text-stone-100">
      <div className="max-w-lg mx-auto px-4 pt-5 pb-28">
        <DashboardView
          t={t}
          lang="en"
          onToggleLang={() => {}}
          cycleName="Familia Demo"
          roundLabel={t.roundOf(3, members.length)}
          collectedLabel={formatMoney(paid * 100)}
          potLabel={formatMoney(members.length * 100)}
          paid={paid}
          total={members.length}
          payoutLine={t.payoutLine('Saturday', 'Luis')}
          countdownLabel="1d 14h"
          members={members}
          contribution={100}
          zelle="familia.demo"
          collectDate={daysFromNow(1)}
          reviews={[]}
          readOnly={false}
          onSelectMember={() => {}}
        />
      </div>
      <TabBar
        tone="dark"
        label="Admin"
        active="dashboard"
        onChange={() => {}}
        tabs={[
          { id: 'dashboard', label: t.tabDashboard, icon: 'home' },
          { id: 'members', label: t.tabMembers, icon: 'members' },
          { id: 'schedule', label: t.tabSchedule, icon: 'rounds' },
          { id: 'settings', label: t.tabSettings, icon: 'settings' },
        ]}
      />
    </div>
  )
}

export default function MockGallery() {
  const { screen } = useParams()
  return screen === 'admin' ? <AdminPreview /> : <MemberPreview />
}
