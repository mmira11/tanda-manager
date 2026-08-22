import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'
import { ROUND_SCHEDULE, SLOT_COUNT } from '../data/scheduleTemplate'

// 2026-08-22 is round 6's own payout day — the day the round could not be marked.
const PAYOUT_DAY_R6 = new Date('2026-08-22T09:00:00')

const NAMES = ['Ana', 'Beto', 'Cata', 'Dani', 'Eli', 'Fer', 'Gabi', 'Hugo', 'Ivan', 'Jimena', 'Karla', 'Luis']

function seed() {
  localStorage.setItem('tanda_data', JSON.stringify({
    config: { organizerName: 'Org', organizerPhone: '5550000000', organizerSlot: 11, pin: '1234', initialized: true },
    lastModified: 1000,
    participants: Array.from({ length: SLOT_COUNT }, (_, i) => ({
      slot: i + 1, name: NAMES[i], phone: `555000000${i % 10}`,
    })),
    rounds: ROUND_SCHEDULE.map(r => ({
      ...r,
      payments: Object.fromEntries(Array.from({ length: SLOT_COUNT }, (_, i) => [i + 1, false])),
      payoutSent: false,
      notes: '',
    })),
  }))
}

const setup = () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<StoreProvider><AdminDashboard /></StoreProvider>)
  return user
}

const savedRound = n => JSON.parse(localStorage.getItem('tanda_data')).rounds.find(r => r.round === n)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true, now: PAYOUT_DAY_R6 })
  seed()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('round selection', () => {
  it('opens on round 6 on its own payout day', () => {
    setup()
    expect(screen.getByText('Round 6 of 12')).toBeTruthy()
    expect(screen.queryByText(/Editing a past round/)).toBeNull()
  })

  it('steps back to round 5 and shows the past-round bar with its payout date', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))

    expect(screen.getByText('Round 5 of 12')).toBeTruthy()
    expect(screen.getByText(/Editing a past round — paid out Sat, Aug 8/)).toBeTruthy()
  })

  it('hides Reminders and Remind Unpaid on a past round', async () => {
    const user = setup()
    expect(screen.getByText('Reminders')).toBeTruthy()
    expect(screen.getByText(/Remind Unpaid/)).toBeTruthy()

    await user.click(screen.getByLabelText('Previous round'))

    expect(screen.queryByText('Reminders')).toBeNull()
    expect(screen.queryByText(/Remind Unpaid/)).toBeNull()
  })

  it('"Back to current" returns to round 6', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText('Back to current'))

    expect(screen.getByText('Round 6 of 12')).toBeTruthy()
    expect(screen.queryByText(/Editing a past round/)).toBeNull()
  })

  it('disables the stepper at both ends of the schedule', async () => {
    const user = setup()

    for (let i = 0; i < 5; i++) await user.click(screen.getByLabelText('Previous round'))
    expect(screen.getByText('Round 1 of 12')).toBeTruthy()
    expect(screen.getByLabelText('Previous round').disabled).toBe(true)

    for (let i = 0; i < 11; i++) await user.click(screen.getByLabelText('Next round'))
    expect(screen.getByText('Round 12 of 12')).toBeTruthy()
    expect(screen.getByLabelText('Next round').disabled).toBe(true)
  })
})

describe('marking a past payout', () => {
  it('marks round 5 payout sent and persists it', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText(/Mark Payout Sent to Eli/))

    expect(screen.getByText(/\$2,400 Sent to Eli/)).toBeTruthy()
    expect(savedRound(5).payoutSent).toBe(true)
  })

  it('bumps lastModified so the publish banner detects the change', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText(/Mark Payout Sent to Eli/))

    expect(JSON.parse(localStorage.getItem('tanda_data')).lastModified).toBeGreaterThan(1000)
  })

  it('leaves other rounds untouched', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))
    await user.click(screen.getByText(/Mark Payout Sent to Eli/))

    expect(savedRound(6).payoutSent).toBe(false)
    expect(savedRound(4).payoutSent).toBe(false)
  })

  it('toggles a contribution on a past round', async () => {
    const user = setup()
    await user.click(screen.getByLabelText('Previous round'))
    const collection = screen.getByText('Collection Status').closest('div')
    const anaRow = within(collection).getByText('Ana').closest('div')

    await user.click(within(anaRow).getByText('Pending'))

    expect(savedRound(5).payments['1']).toBe(true)
    expect(savedRound(6).payments['1']).toBe(false)
  })
})

describe('History → Edit', () => {
  it('jumps from a history card into that round', async () => {
    const user = setup()
    await user.click(screen.getByText('History'))
    const card = screen.getByText('Round 3').closest('div.bg-white')

    await user.click(within(card).getByText('Edit'))

    expect(screen.getByText('Round 3 of 12')).toBeTruthy()
    expect(screen.getByText(/Editing a past round/)).toBeTruthy()
  })

  it('lists round 5 as history on round 6 payout day', async () => {
    const user = setup()
    await user.click(screen.getByText('History'))

    expect(screen.getByText('Round 5')).toBeTruthy()
    expect(screen.queryByText('Round 6')).toBeNull()
  })
})
