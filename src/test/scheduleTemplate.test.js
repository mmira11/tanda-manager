import { describe, it, expect } from 'vitest'
import { ROUND_SCHEDULE, SLOT_COUNT, CONTRIBUTION, POT } from '../data/scheduleTemplate'

describe('scheduleTemplate', () => {
  it('has 12 rounds', () => {
    expect(ROUND_SCHEDULE).toHaveLength(12)
  })

  it('first round is Jun 12 collect / Jun 13 payout / slot 1', () => {
    expect(ROUND_SCHEDULE[0].collectDate).toBe('2026-06-12')
    expect(ROUND_SCHEDULE[0].payoutDate).toBe('2026-06-13')
    expect(ROUND_SCHEDULE[0].recipientSlot).toBe(1)
  })

  it('last round is Nov 13 collect / Nov 14 payout / slot 12', () => {
    expect(ROUND_SCHEDULE[11].collectDate).toBe('2026-11-13')
    expect(ROUND_SCHEDULE[11].payoutDate).toBe('2026-11-14')
    expect(ROUND_SCHEDULE[11].recipientSlot).toBe(12)
  })

  it('slots are sequential 1–12', () => {
    const slots = ROUND_SCHEDULE.map(r => r.recipientSlot)
    expect(slots).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
  })

  it('constants are correct', () => {
    expect(SLOT_COUNT).toBe(12)
    expect(CONTRIBUTION).toBe(200)
    expect(POT).toBe(2400)
  })
})
