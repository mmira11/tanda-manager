import { describe, it, expect } from 'vitest'
import { getCurrentRound, getPaidCount, formatDate, getTandaSpan, formatSpanLabel, isTandaComplete, isPayoutWindow, formatRelativeTime } from '../utils/rounds'
import { ROUND_SCHEDULE } from '../data/scheduleTemplate'

const base = ROUND_SCHEDULE.map(r => ({
  ...r,
  payments: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, false])),
  payoutSent: false,
  notes: '',
}))

describe('getCurrentRound', () => {
  it('returns round 1 on the collection date', () => {
    expect(getCurrentRound(base, new Date('2026-06-12')).round).toBe(1)
  })

  it('returns round 1 on payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-13')).round).toBe(1)
  })

  it('returns round 2 after round 1 payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-14')).round).toBe(2)
  })

  it('returns round 12 after all rounds complete', () => {
    expect(getCurrentRound(base, new Date('2026-12-01')).round).toBe(12)
  })
})

describe('getPaidCount', () => {
  it('returns 0 when no payments', () => {
    expect(getPaidCount({ 1: false, 2: false })).toBe(0)
  })

  it('counts only paid slots', () => {
    expect(getPaidCount({ 1: true, 2: false, 3: true })).toBe(2)
  })

  it('counts all when fully paid', () => {
    const all = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true]))
    expect(getPaidCount(all)).toBe(12)
  })
})

describe('formatDate', () => {
  it('formats ISO date as readable string', () => {
    const result = formatDate('2026-06-12')
    expect(result).toContain('Jun')
    expect(result).toContain('12')
  })
})

const SPAN_ROUNDS = [
  { round: 1, collectDate: '2026-06-12', payoutDate: '2026-06-13' },
  { round: 2, collectDate: '2026-06-26', payoutDate: '2026-06-27' },
  { round: 3, collectDate: '2026-11-13', payoutDate: '2026-11-14' },
]

describe('getTandaSpan', () => {
  it('returns start/end/year from first collect and last payout', () => {
    expect(getTandaSpan(SPAN_ROUNDS)).toEqual({ start: '2026-06-12', end: '2026-11-14', year: 2026 })
  })
  it('returns null for empty or missing rounds', () => {
    expect(getTandaSpan([])).toBeNull()
    expect(getTandaSpan(undefined)).toBeNull()
  })
})

describe('formatSpanLabel', () => {
  const span = { start: '2026-06-12', end: '2026-11-14', year: 2026 }
  it('formats an en-US range', () => {
    expect(formatSpanLabel(span, 'en-US')).toBe('Jun 12 – Nov 14, 2026')
  })
  it('returns empty string for null span', () => {
    expect(formatSpanLabel(null, 'en-US')).toBe('')
  })
})

describe('isTandaComplete', () => {
  it('is false before the last payout day ends', () => {
    expect(isTandaComplete(SPAN_ROUNDS, new Date('2026-11-14T12:00:00'))).toBe(false)
  })
  it('is true after the last payout day ends', () => {
    expect(isTandaComplete(SPAN_ROUNDS, new Date('2026-11-15T00:00:01'))).toBe(true)
  })
  it('is false with no rounds', () => {
    expect(isTandaComplete([], new Date())).toBe(false)
  })
})

describe('isPayoutWindow', () => {
  const round = { collectDate: '2026-07-10', payoutDate: '2026-07-11' }
  it('is false before collection closes (8pm collect day)', () => {
    expect(isPayoutWindow(round, new Date('2026-07-10T19:59:00'))).toBe(false)
  })
  it('is true after collection close through payout day', () => {
    expect(isPayoutWindow(round, new Date('2026-07-10T20:00:01'))).toBe(true)
    expect(isPayoutWindow(round, new Date('2026-07-11T23:00:00'))).toBe(true)
  })
  it('is false after payout day ends', () => {
    expect(isPayoutWindow(round, new Date('2026-07-12T00:00:01'))).toBe(false)
  })
})

describe('formatRelativeTime', () => {
  const now = 1_000_000_000
  it('returns empty string when then is falsy', () => {
    expect(formatRelativeTime(null, now, 'en')).toBe('')
  })
  it('says just now under a minute (en/es)', () => {
    expect(formatRelativeTime(now - 30_000, now, 'en')).toBe('Updated just now')
    expect(formatRelativeTime(now - 30_000, now, 'es')).toBe('Actualizado justo ahora')
  })
  it('says minutes ago (en/es)', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now, 'en')).toBe('Updated 5 min ago')
    expect(formatRelativeTime(now - 5 * 60_000, now, 'es')).toBe('Actualizado hace 5 min')
  })
})
