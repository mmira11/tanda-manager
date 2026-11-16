import { describe, it, expect } from 'vitest'
import {
  paymentStats, roundStepState, daysUntil, compactCountdown, initials, canNudge, memberRounds,
} from '../utils/presentation'

describe('payment progress', () => {
  it('counts paid people, percent, and dollars', () => {
    const stats = paymentStats([
      { paid: true }, { paid: false }, { paid: true }, { paid: true }, { paid: false },
    ], 100)
    expect(stats).toMatchObject({ paid: 3, total: 5, percent: 60, collected: 300, pot: 500 })
  })

  it('is zero when nobody is in the round', () => {
    expect(paymentStats([], 80)).toMatchObject({ paid: 0, total: 0, percent: 0, collected: 0, pot: 0 })
  })

  it('rounds a partial percent', () => {
    expect(paymentStats([true, false, false], 40).percent).toBe(33)
  })
})

describe('round stepper states', () => {
  it('marks past, current, and future rounds', () => {
    expect(roundStepState(1, 3)).toBe('past')
    expect(roundStepState(2, 3)).toBe('past')
    expect(roundStepState(3, 3)).toBe('current')
    expect(roundStepState(4, 3)).toBe('future')
  })
})

describe('payout countdown helpers', () => {
  it('counts calendar days until a payout date', () => {
    expect(daysUntil('2099-06-14', new Date('2099-06-02T09:00:00'))).toBe(12)
    expect(daysUntil('2099-06-02', new Date('2099-06-02T09:00:00'))).toBe(0)
  })

  it('compacts a deadline into days and hours', () => {
    expect(compactCountdown({ days: 1, hours: 14, minutes: 5, done: false })).toBe('1d 14h')
    expect(compactCountdown({ days: 0, hours: 3, minutes: 20, done: false })).toBe('3h 20m')
    expect(compactCountdown({ days: 0, hours: 0, minutes: 0, done: true })).toBe('')
  })
})

describe('avatars and nudges', () => {
  it('builds initials from one or two names', () => {
    expect(initials('Maria')).toBe('MA')
    expect(initials('Rosa Lopez')).toBe('RL')
    expect(initials('')).toBe('?')
  })

  it('hides a nudge when the member paid or has no phone', () => {
    expect(canNudge({ paid: false, phone: '(555) 010-0101' })).toBe(true)
    expect(canNudge({ paid: true, phone: '(555) 010-0101' })).toBe(false)
    expect(canNudge({ paid: false, phone: '   ' })).toBe(false)
    expect(canNudge({ paid: false, phone: '' })).toBe(false)
  })
})

describe('member round list', () => {
  it('derives one round per member from the cycle start', () => {
    const rounds = memberRounds({
      cycle: { start_date: '2099-06-01', interval_days: 14 },
      current_round: { round_number: 2 },
      progress: [
        { slot: 1, display_first_name: 'Maria' },
        { slot: 2, display_first_name: 'Rosa' },
      ],
    })
    expect(rounds.map(round => [round.round, round.name, round.state, round.payoutDate])).toEqual([
      [1, 'Maria', 'past', '2099-06-02'],
      [2, 'Rosa', 'current', '2099-06-16'],
    ])
  })
})
