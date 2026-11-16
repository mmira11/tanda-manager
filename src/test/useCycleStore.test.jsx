import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { useCycleStore } from '../hooks/useCycleStore'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

async function loaded(db) {
  const fake = installFakeSupabase({ db })
  const hook = renderHook(() => useCycleStore())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return { fake, result: hook.result }
}

const member = (fake, name) => fake.tables.members.find(m => m.display_first_name === name)
const roundOf = (fake, name) => fake.tables.rounds.find(r => r.recipient_member_id === member(fake, name).id)

describe('useCycleStore', () => {
  it('maps the active cycle into the store shape the admin UI uses', async () => {
    const { result } = await loaded(seedCycle({ names: ['Ana', 'Beto'], contribution: 125 }))
    const { config, participants, rounds } = result.current.store

    expect(config).toMatchObject({ name: 'Test Tanda', contribution: 125, intervalDays: 14, organizerPhone: '5550000000' })
    expect(participants.map(p => [p.slot, p.name])).toEqual([[1, 'Ana'], [2, 'Beto']])
    expect(rounds[1]).toMatchObject({ round: 2, collectDate: '2026-06-26', recipientSlot: 2, payments: { 1: false, 2: false } })
  })

  it('archives the active cycle, then a new cycle can be created', async () => {
    const { fake, result } = await loaded(seedCycle({ names: ['Ada', 'Bea'], name: 'Current', contribution: 40 }))
    await act(() => result.current.archiveCycle())

    expect(fake.tables.cycles[0]).toMatchObject({ status: 'archived' })
    expect(fake.tables.cycles[0].archived_at).toBeTruthy()
    expect(result.current.store.config.status).toBe('archived')

    await act(() => result.current.createCycle({
      name: 'Next Tanda',
      startDate: '2027-04-02',
      intervalDays: 14,
      contribution: 40,
      members: [{ name: 'Ada', phone: '' }, { name: 'Bea', phone: '' }],
    }))

    expect(result.current.store.config).toMatchObject({ name: 'Next Tanda', status: 'active' })
    expect(fake.tables.cycles.map(c => c.status).sort()).toEqual(['active', 'archived'])
  })

  it('returns no store when there is no active cycle', async () => {
    const { result } = await loaded({})
    expect(result.current.store).toBeNull()
  })

  it('addMember adds the next slot, a round one interval later, and payment rows', async () => {
    const { fake, result } = await loaded(seedCycle({ names: ['Ana', 'Beto'], contribution: 100 }))
    await act(() => result.current.addMember('Cata', ''))

    expect(member(fake, 'Cata').slot).toBe(3)
    expect(roundOf(fake, 'Cata')).toMatchObject({ round_number: 3, collect_date: '2026-07-10', payout_date: '2026-07-11' })
    expect(fake.tables.payments).toHaveLength(9)
    expect(result.current.store.rounds).toHaveLength(3)
  })

  it('reorderMember swaps payout order but keeps payments with each person', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto', 'Cata'] })
    db.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-1').paid_at = '2026-06-12T18:00:00.000Z'
    const { fake, result } = await loaded(db)

    await act(() => result.current.reorderMember(1, 'down'))

    expect(member(fake, 'Ana').slot).toBe(2)
    expect(member(fake, 'Beto').slot).toBe(1)
    expect(roundOf(fake, 'Beto').collect_date).toBe('2026-06-12')
    expect(roundOf(fake, 'Ana').collect_date).toBe('2026-06-26')
    expect(result.current.store.rounds[0].payments).toMatchObject({ 1: false, 2: true }) // Ana (now slot 2) paid round 1
  })

  it('removeMember deletes the member and their round, then closes the gaps', async () => {
    const { fake, result } = await loaded(seedCycle({ names: ['Ana', 'Beto', 'Cata'] }))
    await act(() => result.current.removeMember(2))

    expect(member(fake, 'Beto')).toBeUndefined()
    expect(member(fake, 'Cata').slot).toBe(2)
    expect(fake.tables.rounds.map(r => r.round_number).sort()).toEqual([1, 2])
    expect(fake.tables.payments).toHaveLength(4)
  })

  it('createCycle removes the half-built cycle when a later insert fails', async () => {
    const fake = installFakeSupabase({ failOn: (table, op) => table === 'payments' && op === 'insert' })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.createCycle({
      name: 'X', startDate: '2027-01-08', intervalDays: 14, contribution: 100,
      members: [{ name: 'Ana', phone: '' }, { name: 'Beto', phone: '' }],
    })).rejects.toMatchObject({ message: 'fake insert on payments failed' })

    expect(fake.tables.cycles).toHaveLength(0)
    expect(fake.tables.members).toHaveLength(0)
    expect(fake.tables.rounds).toHaveLength(0)
  })

  it('loads only this cycle’s unmatched Zelle rows', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto'], contribution: 100 })
    db.pending_review = [
      { id: 'rev-1', cycle_id: 'cycle-1', sender_name: 'J. LOPEZ', amount: 100, status: 'pending' },
      { id: 'rev-2', cycle_id: 'cycle-1', sender_name: 'A. DIAZ', amount: 100, status: 'matched' },
      { id: 'rev-3', cycle_id: 'other', sender_name: 'X. SAMPLE', amount: 50, status: 'pending' },
    ]
    const { result } = await loaded(db)
    expect(result.current.pendingReview.map(row => row.sender_name)).toEqual(['J. LOPEZ'])
  })

  it('surfaces a failed write and reloads the saved state', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto'] })
    const fake = installFakeSupabase({ db, failOn: (table, op) => table === 'payments' && op === 'upsert' })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.togglePayment(1, 1))

    expect(result.current.error).toBe('fake upsert on payments failed')
    expect(result.current.store.rounds[0].payments[1]).toBe(false)
    expect(fake.tables.payments.every(p => p.paid_at === null)).toBe(true)
  })
})
