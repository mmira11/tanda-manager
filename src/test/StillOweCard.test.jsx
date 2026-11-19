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
  const handlers = { onSelect: vi.fn(), onTogglePaid: vi.fn() }
  render(
    <StillOweCard
      t={t}
      members={members}
      recipientSlot={4}
      contribution={100}
      zelle="org@example.com"
      collectDate="2099-06-12"
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('still owe list (Today)', () => {
  it('lists only unpaid people, each with Nudge (valid phone only) and Mark paid', async () => {
    const user = userEvent.setup()
    const { onTogglePaid, onSelect } = renderCard()
    expect(screen.getByRole('heading', { name: 'Still owe · 3' })).toBeTruthy()
    const owe = screen.getByRole('list', { name: 'Still owe · 3' })
    expect(within(owe).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'BEBeaNudgeMark paid',
      'CACalNo phone on fileMark paid',
      'DEDeeReceives this roundMark paid',
    ])
    await user.click(within(owe).getAllByRole('button', { name: 'Mark paid' })[0])
    expect(onTogglePaid).toHaveBeenCalledWith(members[1])
    await user.click(within(owe).getByRole('button', { name: 'Bea' }))
    expect(onSelect).toHaveBeenCalledWith(members[1])
    expect(document.body.textContent).not.toMatch(/555/)
    expect(screen.getByText(/Reminders are sent by Grokbot/)).toBeTruthy()
  })

  it('Nudge sends the friendly two-paragraph text', () => {
    renderCard()
    const nudge = screen.getByRole('link', { name: 'Nudge Bea' })
    const [english, spanish] = decodeURIComponent(nudge.getAttribute('href').split('body=')[1]).split('\n\n')
    expect(english).toBe('Hi Bea, friendly reminder that Tanda collection is on Friday, Jun 12. Please send $100 to org@example.com via Zelle. Thank you!')
    expect(spanish).toBe('Hola Bea, un recordatorio amigable de que la colección de Tanda es el viernes 12 de junio. Por favor, envíe 100 dólares a org@example.com a través de Zelle. ¡Gracias!')
  })

  it('read-only (archived): no Nudge, no Mark paid', () => {
    renderCard({ readOnly: true })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull()
  })

  it('says everyone has paid when nobody owes', () => {
    renderCard({ members: members.map(m => ({ ...m, paid: true })) })
    expect(screen.getByRole('heading', { name: 'Everyone has paid this round' })).toBeTruthy()
  })
})

describe('Today', () => {
  const base = {
    t, cycleName: 'Demo Tanda', roundLabel: 'Round 1 of 4', collectedLabel: '$100', potLabel: '$400',
    paid: 1, total: 4, payoutLine: 'Payout Saturday → Dee', countdownLabel: '1d 4h', members,
    recipientSlot: 4, recipientName: 'Dee', contribution: 100, zelle: 'org@example.com',
    collectDate: '2026-11-20', readOnly: false, onSelectMember: () => {},
  }

  it('leads with round, countdown, money and payout, then avatars, then who owes; no review or reminder queue', async () => {
    const user = userEvent.setup()
    const onTogglePayout = vi.fn()
    render(<DashboardView {...base} payoutSent={false} onTogglePayout={onTogglePayout} />)
    expect(screen.getByText('Round 1 of 4')).toBeTruthy()
    expect(screen.getByText('1d 4h')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    await user.click(screen.getByRole('button', { name: 'Mark payout to Dee as sent' }))
    expect(onTogglePayout).toHaveBeenCalled()
    const grid = screen.getByRole('list', { name: 'Who has paid this round' })
    expect(within(grid).queryByRole('link')).toBeNull()
    const owe = screen.getByRole('heading', { name: 'Still owe · 3' })
    expect(grid.compareDocumentPosition(owe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Needs review/)).toBeNull()
    expect(screen.queryByRole('button', { name: /reminder list/i })).toBeNull()
  })

  it('shows a sent payout as pressed', () => {
    render(<DashboardView {...base} payoutSent onTogglePayout={() => {}} />)
    const btn = screen.getByRole('button', { name: /Payout to Dee marked sent/ })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toBe('Sent ✓')
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
