import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { StoreProvider, useStore } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'
import { holidayName } from '../utils/rounds'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

function Loaded() {
  const { store } = useStore()
  return store ? <AdminDashboard email="admin@example.com" /> : null
}

// 2026-08-22 is round 6's own payout day.
const PAYOUT_DAY_R6 = new Date('2026-08-22T09:00:00')
const NAMES = ['Ada', 'Bea', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ian', 'Jan', 'Kay', 'Lee']
let fake

const openSchedule = async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<StoreProvider><Loaded /></StoreProvider>)
  await user.click(await screen.findByRole('button', { name: 'Schedule' }))
  return user
}
const openRound = async (user, n) => {
  const list = screen.getByRole('list', { name: 'Rounds' })
  await user.click(within(list).getAllByRole('button')[n - 1])
}
const savedRound = n => fake.tables.rounds.find(r => r.round_number === n)
const savedPayment = (roundNum, slot) => fake.tables.payments.find(p =>
  p.round_id === savedRound(roundNum).id &&
  p.member_id === fake.tables.members.find(m => m.slot === slot).id)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: PAYOUT_DAY_R6 })
  fake = installFakeSupabase({ db: seedCycle({ names: NAMES, contribution: 200 }) })
})
afterEach(() => vi.useRealTimers())

describe('schedule list', () => {
  it('lists every round with its recipient and dates, and marks the current one', async () => {
    await openSchedule()
    const rows = within(screen.getByRole('list', { name: 'Rounds' })).getAllByRole('button')
    expect(rows).toHaveLength(12)
    expect(rows[5].getAttribute('aria-current')).toBe('step')
    expect(rows[5].textContent).toMatch(/^6Fay.*Fri, Aug 21 → Sat, Aug 22.*1\/12 paid$/)
    expect(rows[0].textContent).toMatch(/1\/12 paid$/)
    expect(rows[8].textContent).not.toMatch(/paid/)
  })

  it('flags holidays on the list and in the round', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea', 'Cal'], startDate: '2026-12-11', contribution: 200 })
    fake = installFakeSupabase({ db })
    vi.setSystemTime(new Date('2026-12-01T09:00:00'))
    const user = await openSchedule()
    const rows = within(screen.getByRole('list', { name: 'Rounds' })).getAllByRole('button')
    expect(rows[1].textContent).toMatch(/Christmas$/)
    await openRound(user, 2)
    expect(screen.getByText('Collect on Christmas')).toBeTruthy()
  })
})

describe('round detail', () => {
  it('marks a past payout sent and leaves other rounds alone', async () => {
    const user = await openSchedule()
    await openRound(user, 5)
    expect(screen.getByRole('heading', { name: 'Round 5 · Eve' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mark payout sent to Eve' }))
    expect(screen.getByRole('button', { name: /\$2,200 sent to Eve/ })).toBeTruthy()
    await waitFor(() => expect(savedRound(5).payout_sent).toBe(true))
    expect(savedRound(5).payout_sent_at).toBeTruthy()
    expect(savedRound(6).payout_sent).toBe(false)
  })

  it('marks and unmarks a payment on any round: paid_at and source=manual, then cleared', async () => {
    const user = await openSchedule()
    await openRound(user, 5)
    expect(screen.getByText('$2,200 pot · 1 of 12 paid')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Eve: paid, recipient' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Ada: not paid' }))
    await waitFor(() => expect(savedPayment(5, 1).source).toBe('manual'))
    expect(savedPayment(5, 1).paid_at).not.toBeNull()
    expect(savedPayment(6, 1).paid_at).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ada: paid' }))
    await waitFor(() => expect(savedPayment(5, 1).paid_at).toBeNull())
    expect(savedPayment(5, 1).source).toBeNull()
  })

  it('moves the dates, refuses out-of-order ones, and saves notes', async () => {
    const user = await openSchedule()
    await openRound(user, 9)
    const save = screen.getByRole('button', { name: 'Save round' })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Move to Thu, Oct 1' }))
    expect(screen.getByLabelText('Collect by 6 PM').value).toBe('2026-10-01')
    expect(screen.getByLabelText('Payout').value).toBe('2026-10-02')

    fireEvent.change(screen.getByLabelText('Payout'), { target: { value: '2026-09-25' } })
    expect(screen.getByRole('alert').textContent).toBe('Round 9 pays out before it collects')
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Payout'), { target: { value: '2026-10-02' } })
    fireEvent.change(screen.getByLabelText('Notes (only you see these)'), { target: { value: 'Moved a day early' } })
    await user.click(save)
    await waitFor(() => expect(savedRound(9).collect_date).toBe('2026-10-01'))
    expect(savedRound(9).payout_date).toBe('2026-10-02')
    expect(savedRound(9).notes).toBe('Moved a day early')
    expect(savedRound(10).collect_date).toBe('2026-10-16')
    expect(screen.getByRole('status').textContent).toMatch(/Saved/)
  })

  it('refuses a date that runs into the next round', async () => {
    const user = await openSchedule()
    await openRound(user, 9)
    fireEvent.change(screen.getByLabelText('Collect by 6 PM'), { target: { value: '2026-10-16' } })
    fireEvent.change(screen.getByLabelText('Payout'), { target: { value: '2026-10-17' } })
    expect(screen.getByRole('alert').textContent).toBe('Round 10 collects on or before round 9')
    expect(screen.getByRole('button', { name: 'Save round' })).toBeDisabled()
  })

  it('changes who receives', async () => {
    const user = await openSchedule()
    await openRound(user, 7)
    await user.selectOptions(screen.getByLabelText('Receives this round'), '1')
    await waitFor(() => expect(savedRound(7).recipient_member_id).toBe('member-1'))
  })

  it('pot and payments count only members with a payment row in that round (N9)', async () => {
    const db = seedCycle({ names: NAMES.slice(0, 5), contribution: 150, startDate: '2026-08-14', intervalDays: 7 })
    db.payments = db.payments.filter(p => !(p.round_id === 'round-2' && p.member_id === 'member-5'))
    fake = installFakeSupabase({ db })
    const user = await openSchedule()
    await openRound(user, 2)
    expect(screen.getByText('$450 pot · 1 of 4 paid')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Eve: not paid' })).toBeNull()
    await user.click(screen.getByText('‹ Schedule'))
    await openRound(user, 1)
    expect(screen.getByText('$600 pot · 1 of 5 paid')).toBeTruthy()
  })

  it('handles more rounds than members, one person receiving twice (N9)', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], contribution: 50 })
    db.rounds.push({
      id: 'round-3', cycle_id: 'cycle-1', round_number: 3, collect_date: '2026-07-10', payout_date: '2026-07-11',
      recipient_member_id: 'member-1', payout_sent: false, payout_sent_at: null, notes: '',
    })
    db.payments.push(
      { id: 'pay-r3-m1', round_id: 'round-3', member_id: 'member-1', amount: 50, paid_at: null, source: null },
      { id: 'pay-r3-m2', round_id: 'round-3', member_id: 'member-2', amount: 50, paid_at: null, source: null },
    )
    fake = installFakeSupabase({ db })
    const user = await openSchedule()
    const rows = within(screen.getByRole('list', { name: 'Rounds' })).getAllByRole('button')
    expect(rows.map(r => r.textContent.slice(0, 4))).toEqual(['1Ada', '2Bea', '3Ada'])
    await openRound(user, 3)
    expect(screen.getByRole('heading', { name: 'Round 3 · Ada' })).toBeTruthy()
    expect(screen.getByText('$50 pot · 1 of 2 paid')).toBeTruthy()
  })

  it('is read-only on an archived cycle', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], contribution: 50 })
    db.cycles[0].status = 'archived'
    fake = installFakeSupabase({ db })
    const user = await openSchedule()
    const rows = within(screen.getByRole('list', { name: 'Rounds' })).getAllByRole('button')
    expect(rows.some(r => r.getAttribute('aria-current'))).toBe(false)
    await openRound(user, 1)
    expect(screen.getByLabelText('Collect by 6 PM')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ada: paid, recipient' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save round' })).toBeNull()
  })
})

describe('holidayName', () => {
  it('knows fixed and floating US holidays', () => {
    expect(holidayName('2026-12-25')).toBe('Christmas')
    expect(holidayName('2026-11-26')).toBe('Thanksgiving')
    expect(holidayName('2026-11-27')).toBe('Day after Thanksgiving')
    expect(holidayName('2027-01-01')).toBe("New Year's Day")
    expect(holidayName('2027-05-09')).toBe("Mother's Day")
    expect(holidayName('2027-05-31')).toBe('Memorial Day')
    expect(holidayName('2026-09-07')).toBe('Labor Day')
    expect(holidayName('2027-01-08')).toBeNull()
    expect(holidayName('')).toBeNull()
  })
})
