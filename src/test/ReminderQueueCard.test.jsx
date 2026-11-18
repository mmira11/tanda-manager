import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LABELS } from '../data/labels'
import ReminderQueueCard from '../components/admin/ReminderQueueCard'
import DashboardView from '../components/admin/DashboardView'
import TabBar from '../components/ui/TabBar'
import { buildReminderView } from '../utils/reminderQueue'

const t = LABELS.en
const message = name => `Hi ${name}, send $100 to org@example.com.\n\nHola ${name}, envía $100 a org@example.com.`

const bea = { id: 'row-bea', name: 'Bea', phone: '(555) 010-0002', paid: false, message: message('Bea') }
const cal = { id: 'row-cal', name: 'Cal', phone: '12345', paid: false, message: message('Cal') }
const ada = { id: 'row-ada', name: 'Ada', phone: '(555) 010-0001', paid: true, message: message('Ada') }

function renderCard(items, props = {}) {
  const onMarkSent = vi.fn()
  const onSkip = vi.fn()
  const onMarkAll = vi.fn()
  render(
    <ReminderQueueCard
      t={t}
      items={items}
      windowLabel="Noon reminder"
      zelle="org@example.com"
      collectDate="2026-11-20"
      contribution={100}
      onMarkSent={onMarkSent}
      onSkip={onSkip}
      onMarkAll={onMarkAll}
      {...props}
    />,
  )
  return { onMarkSent, onSkip, onMarkAll }
}

describe('reminder queue card', () => {
  it('lists each person with the bilingual message and one-tap links', () => {
    renderCard([bea])
    expect(screen.getByRole('region', { name: 'Send reminders now' })).toBeTruthy()
    expect(screen.getByText(/Hola Bea/)).toBeTruthy()
    const sms = screen.getByRole('link', { name: 'SMS Bea' })
    const whatsApp = screen.getByRole('link', { name: 'WhatsApp Bea' })
    expect(sms.getAttribute('href')).toMatch(/^sms:/)
    expect(whatsApp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    expect(sms.className).toMatch(/min-h-11/)
    expect(sms.className).toMatch(/focus-visible:outline/)
    expect(screen.getByRole('region', { name: 'Send reminders now' }).textContent).not.toMatch(/555/)
  })

  it('sends exactly the message shown, tucked behind Show message', () => {
    renderCard([bea])
    const sms = screen.getByRole('link', { name: 'SMS Bea' }).getAttribute('href')
    const wa = screen.getByRole('link', { name: 'WhatsApp Bea' }).getAttribute('href')
    expect(decodeURIComponent(sms.split('body=')[1])).toBe(message('Bea'))
    expect(decodeURIComponent(wa.split('text=')[1])).toBe(message('Bea'))
    expect(screen.getByText('Show message').closest('details').open).toBe(false)
  })

  it('marks that row sent when SMS is tapped, and mark-all skips people who already paid', async () => {
    const user = userEvent.setup()
    const { onMarkSent, onSkip, onMarkAll } = renderCard([bea, cal, ada])
    expect(screen.getByLabelText('2 to send')).toBeTruthy()
    expect(screen.getByText('Paid')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'SMS Ada' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'SMS Cal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip Cal' })).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'SMS Bea' }))
    expect(onMarkSent).toHaveBeenCalledWith('row-bea')

    await user.click(screen.getByRole('button', { name: 'Skip Cal' }))
    expect(onSkip).toHaveBeenCalledWith('row-cal')

    await user.click(screen.getByRole('button', { name: 'Mark all done' }))
    expect(onMarkAll).toHaveBeenCalledWith(['row-bea', 'row-cal'])
  })

  it('stays hidden when everyone left in the queue has paid', () => {
    const { container } = render(
      <ReminderQueueCard t={t} items={[ada]} onMarkSent={() => {}} onSkip={() => {}} onMarkAll={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('region', { name: 'Send reminders now' })).toBeNull()
  })

  it('uses the Spanish labels', () => {
    render(
      <ReminderQueueCard
        t={LABELS.es}
        items={[bea]}
        zelle="org@example.com"
        collectDate="2026-11-20"
        contribution={100}
        onMarkSent={() => {}}
        onSkip={() => {}}
        onMarkAll={() => {}}
      />,
    )
    expect(screen.getByRole('region', { name: 'Enviar recordatorios' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar todos listos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'SMS a Bea' })).toBeTruthy()
  })
})

describe('dashboard reminder count', () => {
  it('shows the card and a badge, and keeps the build button when the queue is empty', () => {
    render(
      <DashboardView
        t={t}
        lang="en"
        onToggleLang={() => {}}
        cycleName="Demo Tanda"
        roundLabel="Round 1 of 2"
        collectedLabel="$0"
        potLabel="$200"
        paid={0}
        total={2}
        payoutLine=""
        countdownLabel=""
        members={[]}
        contribution={100}
        zelle="org@example.com"
        collectDate="2026-11-20"
        reviews={[]}
        readOnly={false}
        onSelectMember={() => {}}
        reminderItems={[bea, ada]}
        reminderWindowLabel="Noon reminder"
        onMarkSent={() => {}}
        onSkipReminder={() => {}}
        onMarkAllReminders={() => {}}
        onBuildReminders={() => {}}
      />,
    )
    expect(screen.getByRole('region', { name: 'Send reminders now' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'SMS Ada' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Build reminder list now' })).toBeTruthy()
  })

  it('offers Build reminder list now when nothing is queued', () => {
    render(
      <DashboardView
        t={t}
        lang="en"
        onToggleLang={() => {}}
        cycleName="Demo Tanda"
        roundLabel=""
        collectedLabel="$0"
        potLabel="$0"
        paid={0}
        total={0}
        members={[]}
        contribution={100}
        zelle="org@example.com"
        reviews={[]}
        readOnly={false}
        onSelectMember={() => {}}
        reminderItems={[]}
        onBuildReminders={() => {}}
        reminderNotice="No reminder window is open right now."
      />,
    )
    expect(screen.queryByRole('region', { name: 'Send reminders now' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Build reminder list now' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/No reminder window/)
  })

  it('counts only unpaid queued rows for the open window', () => {
    const view = buildReminderView({
      now: new Date('2026-11-20T21:00:00Z'),
      timezone: 'America/Los_Angeles',
      settings: { friday_noon_at: '12:00', friday_evening_at: '18:00', thursday_all_at: '09:00' },
      contribution: 100,
      zelle: 'org@example.com',
      templates: [],
      participants: [
        { id: 'm1', slot: 1, name: 'Ada', phone: '(555) 010-0001' },
        { id: 'm2', slot: 2, name: 'Bea', phone: '(555) 010-0002' },
      ],
      rounds: [{
        id: 'r1', round: 3, collectDate: '2026-11-20', payments: { 1: true, 2: false },
      }],
      queued: [
        { id: 'row-ada', round_id: 'r1', member_id: 'm1', kind: 'friday_noon', status: 'queued', dry_run: false, channel: 'queue' },
        { id: 'row-bea', round_id: 'r1', member_id: 'm2', kind: 'friday_noon', status: 'queued', dry_run: false, channel: 'queue' },
        { id: 'row-old', round_id: 'r1', member_id: 'm2', kind: 'thursday_all', status: 'queued', dry_run: false, channel: 'queue' },
      ],
    })
    expect(view.window).toBe('friday_noon')
    expect(view.count).toBe(1)
    expect(view.items.map(item => [item.name, item.paid])).toEqual([['Ada', true], ['Bea', false]])
  })
})

describe('dashboard tab badge', () => {
  it('shows the unpaid count on Dashboard and hides it at zero', () => {
    render(
      <TabBar
        tone="dark"
        active="dashboard"
        onChange={() => {}}
        tabs={[
          { id: 'dashboard', label: 'Dashboard', icon: 'home', badge: 2 },
          { id: 'members', label: 'Members', icon: 'members', badge: 0 },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Dashboard, 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Members' }).textContent).not.toMatch(/0/)
  })
})
