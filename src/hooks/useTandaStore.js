import { useState, useCallback } from 'react'
import { ROUND_SCHEDULE, SLOT_COUNT } from '../data/scheduleTemplate'

const STORAGE_KEY = 'tanda_data'

function buildInitialState() {
  return {
    config: {
      organizerName: '',
      organizerPhone: '',
      organizerSlot: 11,
      pin: '',
      initialized: false,
    },
    participants: Array.from({ length: SLOT_COUNT }, (_, i) => ({
      slot: i + 1,
      name: '',
      phone: '',
    })),
    rounds: ROUND_SCHEDULE.map(r => ({
      ...r,
      payments: Object.fromEntries(
        Array.from({ length: SLOT_COUNT }, (_, i) => [i + 1, false])
      ),
      payoutSent: false,
      notes: '',
    })),
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : buildInitialState()
  } catch {
    return buildInitialState()
  }
}

function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useTandaStore() {
  const [store, setStore] = useState(loadStore)

  const update = useCallback((updater) => {
    setStore(prev => {
      const next = updater(prev)
      saveStore(next)
      return next
    })
  }, [])

  const updateParticipant = useCallback((slot, fields) => {
    update(prev => ({
      ...prev,
      participants: prev.participants.map(p =>
        p.slot === slot ? { ...p, ...fields } : p
      ),
    }))
  }, [update])

  const togglePayment = useCallback((roundNum, slot) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum
          ? { ...r, payments: { ...r.payments, [slot]: !r.payments[slot] } }
          : r
      ),
    }))
  }, [update])

  const togglePayout = useCallback((roundNum) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum ? { ...r, payoutSent: !r.payoutSent } : r
      ),
    }))
  }, [update])

  const updateRoundNotes = useCallback((roundNum, notes) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum ? { ...r, notes } : r
      ),
    }))
  }, [update])

  const saveConfig = useCallback((config) => {
    update(prev => ({ ...prev, config: { ...prev.config, ...config } }))
  }, [update])

  const exportData = useCallback(() => JSON.stringify(store, null, 2), [store])

  const importData = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString)
      saveStore(parsed)
      setStore(parsed)
    } catch {
      throw new Error('Invalid JSON file')
    }
  }, [])

  const resetData = useCallback(() => {
    const initial = buildInitialState()
    saveStore(initial)
    setStore(initial)
  }, [])

  return {
    store,
    updateParticipant,
    togglePayment,
    togglePayout,
    updateRoundNotes,
    saveConfig,
    exportData,
    importData,
    resetData,
  }
}
