import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LABELS } from '../data/labels'
import {
  paymentStats, roundStepState, daysUntil, compactCountdown, initials, canNudge, memberRoundSteps,
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
    expect(canNudge({ paid: false, phone: '555-0100' })).toBe(false)
    expect(canNudge({ paid: false, phone: '15550100104' })).toBe(true)
  })
})

describe('plural copy', () => {
  it('uses the singular when the count is 1', () => {
    expect(LABELS.en.allDone(1)).toContain('1 round')
    expect(LABELS.en.allDone(1)).not.toContain('rounds')
    expect(LABELS.en.allDone(2)).toContain('rounds')
    expect(LABELS.es.allDone(1)).toBe('La ronda terminó. ¡Excelente trabajo!')
    expect(LABELS.es.allDone(2)).toContain('rondas')
    expect(LABELS.es.groupPaid(1, 8)).toContain('pagó')
    expect(LABELS.es.groupPaid(4, 8)).toContain('pagaron')
    expect(LABELS.es.paidOf(1, 8)).toContain('pagó')
    expect(LABELS.es.paidOf(4, 8)).toContain('pagaron')
  })
})

describe('self-hosted font', () => {
  it('loads Inter from the package instead of Google Fonts', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const main = readFileSync(join(process.cwd(), 'src/main.jsx'), 'utf8')
    expect(css).not.toContain('fonts.googleapis.com')
    expect(main).toContain('@fontsource/inter/400.css')
    expect(main).toContain('@fontsource/inter/800.css')
  })
})

describe('member round list', () => {
  it('uses the rounds from the member board, including dates that are not an even interval', () => {
    const rounds = memberRoundSteps([
      { number: 2, collect_date: '2099-07-03', payout_date: '2099-07-04', recipient_first_name: 'Rosa' },
      { number: 1, collect_date: '2099-06-01', payout_date: '2099-08-20', recipient_first_name: 'Maria' },
    ], 2)
    expect(rounds.map(round => [round.round, round.name, round.state, round.payoutDate])).toEqual([
      [1, 'Maria', 'past', '2099-08-20'],
      [2, 'Rosa', 'current', '2099-07-04'],
    ])
  })
})
