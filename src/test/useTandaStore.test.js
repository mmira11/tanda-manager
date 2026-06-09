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
})
