import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { StoreProvider, useStore } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

// Like AdminGate's AdminHome: only mount the dashboard once the cycle has loaded.
function Loaded() {
  const { store } = useStore()
  return store ? <AdminDashboard email="admin@example.com" /> : null
}

// 2026-08-22 is round 6's own payout day — the day the round could not be marked.
const PAYOUT_DAY_R6 = new Date('2026-08-22T09:00:00')

const NAMES = ['Ada', 'Bea', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ian', 'Jan', 'Kay', 'Lee']

let fake

const setup = async (expected = 'Round 6 of 12') => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<StoreProvider><Loaded /></StoreProvider>)
  await user.click(await screen.findByRole('button', { name: 'Schedule' }))
  await screen.findByText(expected)
  return user
}

const savedRound = n => fake.tables.rounds.find(r => r.round_number === n)
const savedPayment = (roundNum, slot) => fake.tables.payments.find(p =>
  p.round_id === savedRound(roundNum).id &&
  p.member_id === fake.tables.members.find(m => m.slot === slot).id)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: PAYOUT_DAY_R6 })
  fake = installFakeSupabase({ db: seedCycle({ names: NAMES, contribution: 200 }) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('round selection', () => {
  it('opens on round 6 on its own payout day', async () => {
    await setup()
    expect(screen.queryByText(/Editing a past round/)).toBeNull()
    expect(screen.getByText('Closed at 6:00 PM')).toBeTruthy()
  })

  it('steps back to round 5 and shows the past-round bar with its payout date', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Previous round'))

    expect(screen.getByText('Round 5 of 12')).toBeTruthy()
    expect(screen.getByText(/Editing a past round — paid out Sat, Aug 8/)).toBeTruthy()
  })

  it('hides Reminders and Remind Unpaid on a past round', async () => {
    const user = await setup()
    expect(screen.getByText('Reminders')).toBeTruthy()
    expect(screen.getAllByText('6 PM').length).toBeGreaterThan(0)
    expect(screen.queryByText('8 PM')).toBeNull()
    expect(screen.getByText(/Remind Unpaid/)).toBeTruthy()

    await user.click(screen.getByLabelText('Previous round'))

    expect(screen.queryByText('Reminders')).toBeNull()
    expect(screen.queryByText(/Remind Unpaid/)).toBeNull()
  })

  it('"Back to current" returns to round 6', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText('Back to current'))

    expect(screen.getByText('Round 6 of 12')).toBeTruthy()
    expect(screen.queryByText(/Editing a past round/)).toBeNull()
  })

  it('disables the stepper at both ends of the schedule', async () => {
    const user = await setup()

    for (let i = 0; i < 5; i++) await user.click(screen.getByLabelText('Previous round'))
    expect(screen.getByText('Round 1 of 12')).toBeTruthy()
    expect(screen.getByLabelText('Previous round').disabled).toBe(true)

    for (let i = 0; i < 11; i++) await user.click(screen.getByLabelText('Next round'))
    expect(screen.getByText('Round 12 of 12')).toBeTruthy()
    expect(screen.getByLabelText('Next round').disabled).toBe(true)
  })
})

describe('marking a past payout', () => {
  it('marks round 5 payout sent and saves it to the rounds table', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText(/Mark Payout Sent to Eve/))

    expect(screen.getByText(/\$2,400 Sent to Eve/)).toBeTruthy()
    await waitFor(() => expect(savedRound(5).payout_sent).toBe(true))
    expect(savedRound(5).payout_sent_at).toBeTruthy()
  })

  it('leaves other rounds untouched', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText(/Mark Payout Sent to Eve/))

    await waitFor(() => expect(savedRound(5).payout_sent).toBe(true))
    expect(savedRound(6).payout_sent).toBe(false)
    expect(savedRound(4).payout_sent).toBe(false)
  })

  it('toggles a contribution on a past round', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Previous round'))
    const collection = screen.getByText('Collection Status').closest('div')
    const anaRow = within(collection).getByText('Ada').closest('div')

    await user.click(within(anaRow).getByText('Pending'))

    await waitFor(() => expect(savedPayment(5, 1).paid_at).not.toBeNull())
    expect(savedPayment(6, 1).paid_at).toBeNull()
  })
})

describe('marking someone paid', () => {
  it('writes paid_at and source=manual right away, with no publish step', async () => {
    const user = await setup()
    const collection = screen.getByText('Collection Status').closest('div')
    const betoRow = within(collection).getByText('Bea').closest('div')

    await user.click(within(betoRow).getByText('Pending'))

    await waitFor(() => expect(savedPayment(6, 2).source).toBe('manual'))
    expect(new Date(savedPayment(6, 2).paid_at).toISOString()).toBe(savedPayment(6, 2).paid_at)
    expect(screen.queryByText(/Publish/)).toBeNull()
  })

  it('unmarking clears paid_at and source', async () => {
    const user = await setup()
    const collection = screen.getByText('Collection Status').closest('div')
    const betoRow = () => within(collection).getByText('Bea').closest('div')

    await user.click(within(betoRow()).getByText('Pending'))
    await waitFor(() => expect(savedPayment(6, 2).paid_at).not.toBeNull())
    await user.click(within(betoRow()).getByText('✓ Paid'))

    await waitFor(() => expect(savedPayment(6, 2).paid_at).toBeNull())
    expect(savedPayment(6, 2).source).toBeNull()
  })
})

describe('amounts come from the cycle', () => {
  it('shows pot = contribution × members for a 5-person $150 cycle', async () => {
    fake = installFakeSupabase({
      db: seedCycle({ names: NAMES.slice(0, 5), contribution: 150, startDate: '2026-08-14', intervalDays: 7 }),
    })
    await setup('Round 2 of 5')

    expect(screen.getByText('$750')).toBeTruthy()
    expect(screen.getByText('$0 collected · $750 remaining')).toBeTruthy()
    expect(screen.queryByText(/\$2,400/)).toBeNull()
  })
})

describe('History → Edit', () => {
  it('jumps from a history card into that round', async () => {
    const user = await setup()
    const card = screen.getByText('Round 3').closest('div.bg-white')

    await user.click(within(card).getByText('Edit'))

    expect(screen.getByText('Round 3 of 12')).toBeTruthy()
    expect(screen.getByText(/Editing a past round/)).toBeTruthy()
  })

  it('lists round 5 as history on round 6 payout day', async () => {
    await setup()

    expect(screen.getByText('Round 5')).toBeTruthy()
    expect(screen.queryByText('Round 6')).toBeNull()
  })
})
