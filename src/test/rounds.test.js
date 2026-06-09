import { describe, it, expect } from 'vitest'
import { getCurrentRound, getPaidCount, formatDate } from '../utils/rounds'
import { ROUND_SCHEDULE } from '../data/scheduleTemplate'

const base = ROUND_SCHEDULE.map(r => ({
  ...r,
  payments: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, false])),
  payoutSent: false,
  notes: '',
}))

describe('getCurrentRound', () => {
  it('returns round 1 on the collection date', () => {
    expect(getCurrentRound(base, new Date('2026-06-13')).round).toBe(1)
  })

  it('returns round 1 on payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-14')).round).toBe(1)
  })

  it('returns round 2 after round 1 payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-15')).round).toBe(2)
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
    const result = formatDate('2026-06-13')
    expect(result).toContain('Jun')
    expect(result).toContain('13')
  })
})
