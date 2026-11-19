import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LABELS } from '../data/labels'
import StillOweCard from '../components/admin/StillOweCard'
import MemberAvatarGrid from '../components/admin/MemberAvatarGrid'
import DashboardView from '../components/admin/DashboardView'
import TabBar from '../components/ui/TabBar'
import { buildReminderView } from '../utils/reminderQueue'

const t = LABELS.en
const message = name => `Hi ${name}, send $100 to org@example.com.\n\nHola ${name}, envía $100 a org@example.com.`

const bea = { id: 'row-bea', slot: 2, name: 'Bea', phone: '(555) 010-0002', paid: false, message: message('Bea') }
const cal = { id: 'row-cal', slot: 3, name: 'Cal', phone: '12345', paid: false, message: message('Cal') }
const ada = { id: 'row-ada', slot: 1, name: 'Ada', phone: '(555) 010-0001', paid: true, message: message('Ada') }

const members = [
  { slot: 1, name: 'Ada', paid: true, phone: '(555) 010-0001' },
  { slot: 2, name: 'Bea', paid: false, phone: '(555) 010-0002' },
  { slot: 3, name: 'Cal', paid: false, phone: '12345' },
  { slot: 4, name: 'Dee', paid: false, phone: '' },
]

function renderCard(props = {}) {
  const handlers = {
    onSelect: vi.fn(), onTogglePaid: vi.fn(), onMarkSent: vi.fn(), onSkipReminder: vi.fn(),
    onMarkAllReminders: vi.fn(), onBuildReminders: vi.fn(),
  }
  render(
    <StillOweCard
      t={t}
      members={members}
      recipientSlot={4}
      contribution={100}
      zelle="org@example.com"
      collectDate="2026-11-20"
      reminderItems={[]}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('still owe list', () => {
  it('lists unpaid people first with Mark paid, and paid people as chips', async () => {
    const user = userEvent.setup()
    const { onTogglePaid, onSelect } = renderCard()
    expect(screen.getByRole('heading', { name: 'Still owe · 3' })).toBeTruthy()
    const owe = screen.getByRole('list', { name: 'Still owe · 3' })
    expect(within(owe).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringMatching(/^BEBea.*Mark paid.*SMS$/),
      expect.stringMatching(/^CACal.*No phone on file.*Mark paid$/),
      expect.stringMatching(/^DEDee.*Receives this round.*Mark paid$/),
    ])
    await user.click(within(owe).getAllByRole('button', { name: 'Mark paid' })[0])
    expect(onTogglePaid).toHaveBeenCalledWith(members[1])
    await user.click(screen.getByRole('button', { name: 'Ada, Paid' }))
    expect(onSelect).toHaveBeenCalledWith(members[0])
    expect(document.body.textContent).not.toMatch(/555/)
  })

  it('without a queue, SMS is the friendly nudge for people with a valid phone', () => {
    renderCard({ collectDate: '2099-06-12' })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('aria-label')).toBe('Text Bea a reminder')
    const body = decodeURIComponent(links[0].getAttribute('href').split('body=')[1])
    const [english, spanish] = body.split('\n\n')
    expect(english).toBe('Hi Bea, friendly reminder that Tanda collection is on Friday, Jun 12. Please send $100 to org@example.com via Zelle. Thank you!')
    expect(spanish).toBe('Hola Bea, un recordatorio amigable de que la colección de Tanda es el viernes 12 de junio. Por favor, envíe 100 dólares a org@example.com a través de Zelle. ¡Gracias!')
    expect(screen.getByRole('button', { name: 'Build reminder list now' })).toBeTruthy()
  })

  it('folds queued reminders into the rows: exact message, SMS/WhatsApp mark sent, Skip, Mark all skips paid', async () => {
    const user = userEvent.setup()
    const { onMarkSent, onSkipReminder, onMarkAllReminders } = renderCard({
      reminderItems: [bea, cal, ada],
      reminderWindowLabel: 'Noon reminder',
    })
    expect(screen.getByText('Noon reminder · 2 to send')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Build reminder list now' })).toBeNull()

    const sms = screen.getByRole('link', { name: 'Text Bea a reminder' })
    const wa = screen.getByRole('link', { name: 'WhatsApp Bea' })
    expect(decodeURIComponent(sms.getAttribute('href').split('body=')[1])).toBe(message('Bea'))
    expect(decodeURIComponent(wa.getAttribute('href').split('text=')[1])).toBe(message('Bea'))
    expect(sms.className).toMatch(/min-h-11/)
    expect(sms.className).toMatch(/focus-visible:outline/)
    expect(screen.getAllByText('Show message')[0].closest('details').open).toBe(false)
    expect(screen.queryByRole('link', { name: 'Text Cal a reminder' })).toBeNull()

    await user.click(sms)
    expect(onMarkSent).toHaveBeenCalledWith('row-bea')
    await user.click(screen.getByRole('button', { name: 'Skip Cal' }))
    expect(onSkipReminder).toHaveBeenCalledWith('row-cal')
    await user.click(screen.getByRole('button', { name: 'Mark all done' }))
    expect(onMarkAllReminders).toHaveBeenCalledWith(['row-bea', 'row-cal'])
  })

  it('read-only (archived): no reminders, no Mark paid', () => {
    renderCard({ readOnly: true, reminderItems: [bea] })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark all done' })).toBeNull()
  })

  it('says everyone has paid when nobody owes', () => {
    renderCard({ members: members.map(m => ({ ...m, paid: true })) })
    expect(screen.getByRole('heading', { name: 'Everyone has paid this round' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Build reminder list now' })).toBeNull()
  })
})

describe('dashboard', () => {
  const base = {
    t, cycleName: 'Demo Tanda', roundLabel: 'Round 1 of 4', collectedLabel: '$100', potLabel: '$400',
    paid: 1, total: 4, payoutLine: 'Payout Saturday → Dee', countdownLabel: '1d 4h', members,
    recipientSlot: 4, recipientName: 'Dee', contribution: 100, zelle: 'org@example.com',
    collectDate: '2026-11-20', reviews: [], readOnly: false, onSelectMember: () => {}, reminderItems: [],
  }

  it('leads with the round, countdown, money and payout, then the owe list', async () => {
    const user = userEvent.setup()
    const onTogglePayout = vi.fn()
    render(<DashboardView {...base} payoutSent={false} onTogglePayout={onTogglePayout} onBuildReminders={() => {}} />)
    expect(screen.getByText('Round 1 of 4')).toBeTruthy()
    expect(screen.getByText('1d 4h')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    await user.click(screen.getByRole('button', { name: 'Mark payout to Dee as sent' }))
    expect(onTogglePayout).toHaveBeenCalled()
    const text = document.body.textContent
    expect(text.indexOf('Payout Saturday')).toBeLessThan(text.indexOf('Still owe · 3'))
  })

  it('shows a sent payout as pressed', () => {
    render(<DashboardView {...base} payoutSent onTogglePayout={() => {}} />)
    const btn = screen.getByRole('button', { name: /Payout to Dee marked sent/ })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toBe('Sent ✓')
  })

  it('shows the build notice when no reminder window is open', () => {
    render(<DashboardView {...base} onBuildReminders={() => {}} reminderNotice="No reminder window is open right now." />)
    expect(screen.getByRole('status').textContent).toMatch(/No reminder window/)
  })
})

describe('reminder view', () => {
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

describe('avatar row with nudges', () => {
  it('shows everyone, and a Nudge only for unpaid people with a valid phone, using the friendly text', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<MemberAvatarGrid members={members} contribution={100} zelle="org@example.com" collectDate="2099-06-12" t={t} onSelect={onSelect} />)
    const grid = screen.getByRole('list', { name: 'Who has paid this round' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4)
    const nudges = within(grid).getAllByRole('link')
    expect(nudges.map(a => a.getAttribute('aria-label'))).toEqual(['Nudge Bea'])
    expect(decodeURIComponent(nudges[0].getAttribute('href').split('body=')[1]))
      .toMatch(/^Hi Bea, friendly reminder that Tanda collection is on Friday, Jun 12\./)
    expect(grid.textContent).not.toMatch(/555/)
    await user.click(screen.getByRole('button', { name: 'Ada, Paid' }))
    expect(onSelect).toHaveBeenCalledWith(members[0])
  })

  it('hides nudges on an archived cycle', () => {
    render(<MemberAvatarGrid members={members} contribution={100} zelle="z" collectDate="2099-06-12" t={t} readOnly onSelect={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('sits on the dashboard between the money card and the Still owe list', () => {
    render(<DashboardView t={t} cycleName="Demo" roundLabel="Round 1 of 4" collectedLabel="$100" potLabel="$400" paid={1} total={4}
      payoutLine="Payout Saturday → Dee" members={members} recipientSlot={4} recipientName="Dee" contribution={100}
      zelle="z" collectDate="2099-06-12" reviews={[]} readOnly={false} onSelectMember={() => {}} reminderItems={[]} />)
    const grid = screen.getByRole('list', { name: 'Who has paid this round' })
    const owe = screen.getByRole('heading', { name: 'Still owe · 3' })
    expect(grid.compareDocumentPosition(owe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
