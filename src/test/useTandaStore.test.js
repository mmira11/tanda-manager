import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTandaStore } from '../hooks/useTandaStore'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('useTandaStore', () => {
  beforeEach(() => localStorage.clear())

  it('initializes with 12 empty participants and 12 rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.participants).toHaveLength(12)
    expect(result.current.store.rounds).toHaveLength(12)
    expect(result.current.store.config.initialized).toBe(false)
    expect(result.current.store.participants[0].name).toBe('')
  })

  it('updateParticipant saves name and phone', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name: 'Edy', phone: '5102301571' }))
    expect(result.current.store.participants[0].name).toBe('Edy')
    expect(result.current.store.participants[0].phone).toBe('5102301571')
  })

  it('togglePayment marks and unmarks paid', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 1))
    expect(result.current.store.rounds[0].payments[1]).toBe(true)
    act(() => result.current.togglePayment(1, 1))
    expect(result.current.store.rounds[0].payments[1]).toBe(false)
  })

  it('togglePayout flips payoutSent', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayout(1))
    expect(result.current.store.rounds[0].payoutSent).toBe(true)
  })

  it('updateRoundNotes saves notes', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateRoundNotes(1, 'Everyone paid early!'))
    expect(result.current.store.rounds[0].notes).toBe('Everyone paid early!')
  })

  it('saveConfig marks initialized true and stores pin', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.saveConfig({ organizerName: 'Miguel', pin: '1234', initialized: true }))
    expect(result.current.store.config.initialized).toBe(true)
    expect(result.current.store.config.pin).toBe('1234')
  })

  it('exportData returns valid JSON with all fields', () => {
    const { result } = renderHook(() => useTandaStore())
    const parsed = JSON.parse(result.current.exportData())
    expect(parsed).toHaveProperty('config')
    expect(parsed).toHaveProperty('participants')
    expect(parsed).toHaveProperty('rounds')
  })

  it('importData restores from JSON string', () => {
    const { result } = renderHook(() => useTandaStore())
    const snap = JSON.stringify({ ...result.current.store, config: { ...result.current.store.config, organizerName: 'Restored' } })
    act(() => result.current.importData(snap))
    expect(result.current.store.config.organizerName).toBe('Restored')
  })

  it('resetData wipes to initial state', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name: 'Edy' }))
    act(() => result.current.resetData())
    expect(result.current.store.participants[0].name).toBe('')
    expect(result.current.store.config.initialized).toBe(false)
  })

  it('persists to localStorage after update', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name: 'Edy' }))
    const saved = JSON.parse(localStorage.getItem('tanda_data'))
    expect(saved.participants[0].name).toBe('Edy')
  })

  it('migrates old-schedule dates when importing a backup', () => {
    const oldBackup = JSON.stringify({
      config: { initialized: true, organizerName: 'Test', organizerPhone: '', organizerSlot: 1, pin: '1234' },
      participants: Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, name: `Person ${i + 1}`, phone: '' })),
      rounds: [
        { round: 1,  collectDate: '2026-06-13', payoutDate: '2026-06-14', recipientSlot: 1,  payments: {}, payoutSent: false, notes: '' },
        { round: 2,  collectDate: '2026-06-27', payoutDate: '2026-06-28', recipientSlot: 2,  payments: {}, payoutSent: false, notes: '' },
        { round: 12, collectDate: '2026-11-14', payoutDate: '2026-11-15', recipientSlot: 12, payments: {}, payoutSent: false, notes: '' },
      ],
    })
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.importData(oldBackup))
    expect(result.current.store.rounds[0].collectDate).toBe('2026-06-12')
    expect(result.current.store.rounds[0].payoutDate).toBe('2026-06-13')
    expect(result.current.store.rounds[1].collectDate).toBe('2026-06-26')
    expect(result.current.store.rounds[2].collectDate).toBe('2026-11-13')
    expect(result.current.store.rounds[2].payoutDate).toBe('2026-11-14')
  })

  it('migrates old-schedule dates back by one day on load', () => {
    const oldData = {
      config: { initialized: false, organizerName: '', organizerPhone: '', organizerSlot: 11, pin: '' },
      participants: Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, name: '', phone: '' })),
      rounds: [
        { round: 1,  collectDate: '2026-06-13', payoutDate: '2026-06-14', recipientSlot: 1,  payments: {}, payoutSent: false, notes: '' },
        { round: 2,  collectDate: '2026-06-27', payoutDate: '2026-06-28', recipientSlot: 2,  payments: {}, payoutSent: false, notes: '' },
        { round: 12, collectDate: '2026-11-14', payoutDate: '2026-11-15', recipientSlot: 12, payments: {}, payoutSent: false, notes: '' },
      ],
    }
    localStorage.setItem('tanda_data', JSON.stringify(oldData))
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.rounds[0].collectDate).toBe('2026-06-12')
    expect(result.current.store.rounds[0].payoutDate).toBe('2026-06-13')
    expect(result.current.store.rounds[1].collectDate).toBe('2026-06-26')
    expect(result.current.store.rounds[2].collectDate).toBe('2026-11-13')
    expect(result.current.store.rounds[2].payoutDate).toBe('2026-11-14')
  })

  it('initializes lastModified as 0', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.lastModified).toBe(0)
  })

  it('updates lastModified after any mutation', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.lastModified).toBe(0)
    act(() => result.current.updateParticipant(1, { name: 'Edy' }))
    expect(result.current.store.lastModified).toBeGreaterThan(0)
  })

  it('reorderMember up swaps name and phone with the previous slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.reorderMember(4, 'up'))
    expect(result.current.store.participants[2].name).toBe('Dave')
    expect(result.current.store.participants[2].phone).toBe('444')
    expect(result.current.store.participants[3].name).toBe('Carol')
    expect(result.current.store.participants[3].phone).toBe('333')
    expect(result.current.store.participants[2].slot).toBe(3)
    expect(result.current.store.participants[3].slot).toBe(4)
  })

  it('reorderMember down swaps name and phone with the next slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.reorderMember(3, 'down'))
    expect(result.current.store.participants[2].name).toBe('Dave')
    expect(result.current.store.participants[3].name).toBe('Carol')
  })

  it('reorderMember up on first slot is a no-op', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name: 'Alice', phone: '111' }))
    act(() => result.current.reorderMember(1, 'up'))
    expect(result.current.store.participants[0].name).toBe('Alice')
  })

  it('reorderMember down on last slot is a no-op', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(12, { name: 'Last', phone: '999' }))
    act(() => result.current.reorderMember(12, 'down'))
    expect(result.current.store.participants[11].name).toBe('Last')
  })

  it('removeMember removes the participant at the given slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.removeMember(3))
    expect(result.current.store.participants).toHaveLength(11)
    expect(result.current.store.participants.find(p => p.name === 'Carol')).toBeUndefined()
  })

  it('removeMember renumbers subsequent participant slots', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.removeMember(3))
    const dave = result.current.store.participants.find(p => p.name === 'Dave')
    expect(dave.slot).toBe(3)
    expect(result.current.store.participants[2].slot).toBe(3)
  })

  it('removeMember removes the corresponding round', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.removeMember(3))
    expect(result.current.store.rounds).toHaveLength(11)
    expect(result.current.store.rounds.find(r => r.round === 3)).toBeDefined()
    expect(result.current.store.rounds.find(r => r.round === 12)).toBeUndefined()
  })

  it('removeMember renumbers subsequent round numbers and recipientSlots', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.removeMember(3))
    const round3 = result.current.store.rounds.find(r => r.round === 3)
    expect(round3).toBeDefined()
    expect(round3.recipientSlot).toBe(3)
    const round11 = result.current.store.rounds.find(r => r.round === 11)
    expect(round11).toBeDefined()
    expect(round11.recipientSlot).toBe(11)
  })

  it('removeMember shifts payment keys in all rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 5))
    act(() => result.current.removeMember(3))
    // slot 5 shifted to key 4, so payments[4] is true
    expect(result.current.store.rounds[0].payments[4]).toBe(true)
    // payments object has 11 keys (one slot removed from 12)
    expect(Object.keys(result.current.store.rounds[0].payments)).toHaveLength(11)
    // key 12 no longer exists
    expect(result.current.store.rounds[0].payments[12]).toBeUndefined()
  })

  it('removeMember keeps payment keys for slots before the removed slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 2))
    act(() => result.current.removeMember(5))
    expect(result.current.store.rounds[0].payments[2]).toBe(true)
  })

  it('addMember adds a 13th participant with correct slot, name, phone', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.addMember('Alice', '5551234567'))
    expect(result.current.store.participants).toHaveLength(13)
    const added = result.current.store.participants[12]
    expect(added.slot).toBe(13)
    expect(added.name).toBe('Alice')
    expect(added.phone).toBe('5551234567')
  })

  it('addMember appends a round 14 days after the last round and patches all existing rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.addMember('Alice', '5551234567'))
    expect(result.current.store.rounds).toHaveLength(13)
    const newRound = result.current.store.rounds[12]
    expect(newRound.round).toBe(13)
    expect(newRound.collectDate).toBe('2026-11-27') // 14 days after 2026-11-13
    expect(newRound.payoutDate).toBe('2026-11-28')  // 15 days after 2026-11-13
    expect(newRound.recipientSlot).toBe(13)
    expect(Object.keys(newRound.payments)).toHaveLength(13)
    // all existing rounds now have slot 13 in their payments map
    result.current.store.rounds.slice(0, 12).forEach(r => {
      expect(r.payments).toHaveProperty('13')
      expect(r.payments[13]).toBe(false)
    })
  })
})
