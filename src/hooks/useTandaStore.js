// src/hooks/useTandaStore.js
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
    lastModified: 0,
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

const DATE_MIGRATION = {
  '2026-06-13': '2026-06-12', '2026-06-14': '2026-06-13',
  '2026-06-27': '2026-06-26', '2026-06-28': '2026-06-27',
  '2026-07-11': '2026-07-10', '2026-07-12': '2026-07-11',
  '2026-07-25': '2026-07-24', '2026-07-26': '2026-07-25',
  '2026-08-08': '2026-08-07', '2026-08-09': '2026-08-08',
  '2026-08-22': '2026-08-21', '2026-08-23': '2026-08-22',
  '2026-09-05': '2026-09-04', '2026-09-06': '2026-09-05',
  '2026-09-19': '2026-09-18', '2026-09-20': '2026-09-19',
  '2026-10-03': '2026-10-02', '2026-10-04': '2026-10-03',
  '2026-10-17': '2026-10-16', '2026-10-18': '2026-10-17',
  '2026-10-31': '2026-10-30', '2026-11-01': '2026-10-31',
  '2026-11-14': '2026-11-13', '2026-11-15': '2026-11-14',
}

export function migrateStore(data) {
  if (data?.rounds?.[0]?.collectDate !== '2026-06-13') return data
  return {
    ...data,
    rounds: data.rounds.map(r => ({
      ...r,
      collectDate: DATE_MIGRATION[r.collectDate] ?? r.collectDate,
      payoutDate:  DATE_MIGRATION[r.payoutDate]  ?? r.payoutDate,
    })),
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : buildInitialState()
    const migrated = migrateStore(data)
    if (migrated !== data) saveStore(migrated)
    return migrated
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
      const next = { ...updater(prev), lastModified: Date.now() }
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

  const addMember = useCallback((name, phone) => {
    update(prev => {
      if (!name.trim()) return { ...prev }
      const newSlot = prev.participants.length + 1
      const lastRound = prev.rounds[prev.rounds.length - 1]
      const lastCollectMs = new Date(lastRound.collectDate + 'T12:00:00').getTime()
      const newCollect = new Date(lastCollectMs + 14 * 86400000).toISOString().slice(0, 10)
      const newPayout  = new Date(lastCollectMs + 15 * 86400000).toISOString().slice(0, 10)
      return {
        ...prev,
        participants: [
          ...prev.participants,
          { slot: newSlot, name: name.trim(), phone: phone.trim() },
        ],
        rounds: [
          ...prev.rounds.map(r => ({
            ...r,
            payments: { ...r.payments, [newSlot]: false },
          })),
          {
            round: newSlot,
            collectDate: newCollect,
            payoutDate:  newPayout,
            recipientSlot: newSlot,
            payments: Object.fromEntries(
              Array.from({ length: newSlot }, (_, i) => [i + 1, false])
            ),
            payoutSent: false,
            notes: '',
          },
        ],
      }
    })
  }, [update])

  const saveConfig = useCallback((config) => {
    update(prev => ({ ...prev, config: { ...prev.config, ...config } }))
  }, [update])

  const exportData = useCallback(() => JSON.stringify(store, null, 2), [store])

  const importData = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString)
      const migrated = migrateStore(parsed)
      migrated.lastModified = Date.now()
      saveStore(migrated)
      setStore(migrated)
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
    addMember,
    saveConfig,
    exportData,
    importData,
    resetData,
  }
}
