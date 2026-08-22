import { describe, it, expect } from 'vitest'
import { getCurrentRound, clampRound, getPaidCount, formatDate, getTandaSpan, formatSpanLabel, isTandaComplete, isPayoutWindow, formatRelativeTime, resolveMySlot } from '../utils/rounds'
import { ROUND_SCHEDULE } from '../data/scheduleTemplate'

const base = ROUND_SCHEDULE.map(r => ({
  ...r,
  payments: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, false])),
  payoutSent: false,
  notes: '',
}))

// Dates are anchored to local noon so the assertions describe a local calendar day
// rather than a UTC instant — a bare new Date('2026-06-14') is UTC midnight, which
// is the previous day west of Greenwich.
describe('getCurrentRound', () => {
  it('returns round 1 on the collection date', () => {
    expect(getCurrentRound(base, new Date('2026-06-12T12:00:00')).round).toBe(1)
  })

  it('returns round 1 on payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-13T12:00:00')).round).toBe(1)
  })

  it('returns round 2 after round 1 payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-14T12:00:00')).round).toBe(2)
  })

  it('returns round 12 after all rounds complete', () => {
    expect(getCurrentRound(base, new Date('2026-12-01T12:00:00')).round).toBe(12)
  })

  it('stays on round 6 through its own payout day', () => {
    expect(getCurrentRound(base, new Date('2026-08-22T09:00:00')).round).toBe(6)
    expect(getCurrentRound(base, new Date('2026-08-22T23:00:00')).round).toBe(6)
  })

  it('advances to round 7 the day after round 6 pays out', () => {
    expect(getCurrentRound(base, new Date('2026-08-23T09:00:00')).round).toBe(7)
  })
})

describe('clampRound', () => {
  it('passes through a round that exists', () => {
    expect(clampRound(5, base)).toBe(5)
  })

  it('falls back to the current round when the number is out of range', () => {
    const current = getCurrentRound(base).round
    expect(clampRound(99, base)).toBe(current)
    expect(clampRound(0, base)).toBe(current)
  })

  it('falls back to the current round for a non-number', () => {
    expect(clampRound(undefined, base)).toBe(getCurrentRound(base).round)
  })

  it('returns null rather than throwing when there are no rounds', () => {
    expect(clampRound(1, [])).toBeNull()
    expect(clampRound(1, undefined)).toBeNull()
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

describe('resolveMySlot', () => {
  const participants = [{ slot: 1, name: 'Ana' }, { slot: 2, name: 'Beto' }]
  it('returns the slot number when it exists', () => {
    expect(resolveMySlot('2', participants)).toBe(2)
  })
  it('returns null for missing, invalid, or stale slots', () => {
    expect(resolveMySlot(null, participants)).toBeNull()
    expect(resolveMySlot('abc', participants)).toBeNull()
    expect(resolveMySlot('9', participants)).toBeNull()
  })
})
