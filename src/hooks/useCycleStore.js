// src/hooks/useCycleStore.js — admin data for the active cycle, read/written straight to Supabase.
// Exposes the same store shape the admin components already use:
//   { config, participants: [{ id, slot, name, phone }], rounds: [{ id, round, collectDate,
//     payoutDate, recipientSlot, payments: { [slot]: bool }, payoutSent, notes }] }
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { notifyBoardChanged } from '../lib/boardSync'
import { addDays, buildRounds } from '../utils/rounds'
import { buildImportPlan, newAccessToken, writeImport } from '../utils/importBackup'

function check({ data, error }) {
  if (error) throw error
  return data
}

export function toStore(cycle, members, rounds, payments) {
  const slotById = Object.fromEntries(members.map(m => [m.id, m.slot]))
  return {
    config: {
      cycleId: cycle.id,
      name: cycle.name,
      startDate: cycle.start_date,
      intervalDays: cycle.interval_days,
      contribution: Number(cycle.contribution),
      organizerName: cycle.organizer_display_name || '',
      organizerPhone: cycle.zelle_destination || '',
      status: cycle.status,
    },
    participants: members.map(m => ({
      id: m.id, slot: m.slot, name: m.display_first_name, phone: m.phone || '',
      accessToken: m.access_token || '',
    })),
    rounds: rounds.map(r => ({
      id: r.id,
      round: r.round_number,
      collectDate: r.collect_date,
      payoutDate: r.payout_date,
      recipientSlot: slotById[r.recipient_member_id],
      payoutSent: r.payout_sent,
      notes: r.notes,
      payments: Object.fromEntries(
        payments
          .filter(p => p.round_id === r.id && slotById[p.member_id] !== undefined)
          .map(p => [slotById[p.member_id], p.paid_at !== null])
      ),
    })),
  }
}

function pickCycle(cycles, preferredId) {
  if (preferredId) {
    const chosen = cycles.find(cycle => cycle.id === preferredId)
    if (chosen) return chosen
  }
  return cycles.find(cycle => cycle.status === 'active') || cycles[0] || null
}

export function useCycleStore() {
  const [store, setStore] = useState(null)
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const storeRef = useRef(null)
  const selectedIdRef = useRef(null)
  const requestRef = useRef(0)
  storeRef.current = store

  const load = useCallback(async (preferredId) => {
    const request = ++requestRef.current
    try {
      const cycleRows = check(await supabase.from('cycles').select('id, name, status, start_date, contribution'))
      if (request !== requestRef.current) return
      const sorted = [...cycleRows].sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0))
      setCycles(sorted)
      const cycleSummary = pickCycle(sorted, preferredId ?? selectedIdRef.current)
      if (!cycleSummary) {
        selectedIdRef.current = null
        setStore(null)
        return
      }
      selectedIdRef.current = cycleSummary.id
      const cycle = check(await supabase.from('cycles').select('*').eq('id', cycleSummary.id).limit(1))[0]
      if (!cycle) {
        selectedIdRef.current = null
        setStore(null)
        return
      }
      const [members, rounds] = await Promise.all([
        supabase.from('members').select('id, slot, display_first_name, phone, access_token')
          .eq('cycle_id', cycle.id).order('slot').then(check),
        supabase.from('rounds').select('*')
          .eq('cycle_id', cycle.id).order('round_number').then(check),
      ])
      const payments = rounds.length
        ? check(await supabase.from('payments').select('round_id, member_id, paid_at')
            .in('round_id', rounds.map(r => r.id)))
        : []
      if (request !== requestRef.current) return
      setStore(toStore(cycle, members, rounds, payments))
    } catch (e) {
      if (request !== requestRef.current) return
      setError(e.message || String(e))
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Apply an optional optimistic change, then write. Any failure shows the error and reloads.
  const run = useCallback(async (optimistic, write) => {
    if (optimistic) setStore(s => (s ? optimistic(s) : s))
    try {
      await write()
      if (!optimistic) await load()
    } catch (e) {
      setError(e.message || String(e))
      await load()
    }
  }, [load])

  const patchRound = (roundNum, fn) => s => ({
    ...s,
    rounds: s.rounds.map(r => (r.round === roundNum ? fn(r) : r)),
  })

  const togglePayment = useCallback((roundNum, slot) => {
    const s = storeRef.current
    const round = s.rounds.find(r => r.round === roundNum)
    const member = s.participants.find(p => p.slot === slot)
    const paid = !round.payments[slot]
    return run(
      patchRound(roundNum, r => ({ ...r, payments: { ...r.payments, [slot]: paid } })),
      async () => {
        check(await supabase.from('payments').upsert({
          round_id: round.id,
          member_id: member.id,
          amount: s.config.contribution,
          paid_at: paid ? new Date().toISOString() : null,
          source: paid ? 'manual' : null,
        }, { onConflict: 'round_id,member_id' }))
        notifyBoardChanged()
      }
    )
  }, [run])

  const togglePayout = useCallback((roundNum) => {
    const round = storeRef.current.rounds.find(r => r.round === roundNum)
    const sent = !round.payoutSent
    return run(
      patchRound(roundNum, r => ({ ...r, payoutSent: sent })),
      async () => check(await supabase.from('rounds')
        .update({ payout_sent: sent, payout_sent_at: sent ? new Date().toISOString() : null })
        .eq('id', round.id))
    )
  }, [run])

  const updateRoundNotes = useCallback((roundNum, notes) => {
    const round = storeRef.current.rounds.find(r => r.round === roundNum)
    return run(
      patchRound(roundNum, r => ({ ...r, notes })),
      async () => check(await supabase.from('rounds').update({ notes }).eq('id', round.id))
    )
  }, [run])

  const updateParticipant = useCallback((slot, fields) => {
    const member = storeRef.current.participants.find(p => p.slot === slot)
    const patch = {}
    if ('name' in fields) patch.display_first_name = fields.name
    if ('phone' in fields) patch.phone = fields.phone || null
    return run(
      s => ({ ...s, participants: s.participants.map(p => (p.slot === slot ? { ...p, ...fields } : p)) }),
      async () => check(await supabase.from('members').update(patch).eq('id', member.id))
    )
  }, [run])

  // New member takes the next slot and a new round one interval after the last one.
  const addMember = useCallback((name, phone) => {
    if (!name.trim()) return
    const s = storeRef.current
    const { cycleId, intervalDays, startDate, contribution } = s.config
    const slot = s.participants.length + 1
    const last = s.rounds[s.rounds.length - 1]
    const collectDate = last ? addDays(last.collectDate, intervalDays) : startDate
    return run(null, async () => {
      const [member] = check(await supabase.from('members').insert({
        cycle_id: cycleId, slot, display_first_name: name.trim(), phone: phone.trim() || null,
      }).select())
      const [round] = check(await supabase.from('rounds').insert({
        cycle_id: cycleId,
        round_number: s.rounds.length + 1,
        collect_date: collectDate,
        payout_date: addDays(collectDate, 1),
        recipient_member_id: member.id,
      }).select())
      check(await supabase.from('payments').insert([
        ...s.rounds.map(r => ({ round_id: r.id, member_id: member.id, amount: contribution })),
        ...[...s.participants, member].map(p => ({ round_id: round.id, member_id: p.id, amount: contribution })),
      ]))
    })
  }, [run])

  // Swap payout positions with the neighbor. Payments stay with each person; round dates stay put.
  const reorderMember = useCallback((slot, direction) => {
    const s = storeRef.current
    const otherSlot = direction === 'up' ? slot - 1 : slot + 1
    const a = s.participants.find(p => p.slot === slot)
    const b = s.participants.find(p => p.slot === otherSlot)
    if (!a || !b) return
    const roundA = s.rounds.find(r => r.recipientSlot === slot)
    const roundB = s.rounds.find(r => r.recipientSlot === otherSlot)
    return run(null, async () => {
      // (cycle_id, slot) is unique, so park one member on a temporary slot first.
      check(await supabase.from('members').update({ slot: 100000 + slot }).eq('id', a.id))
      check(await supabase.from('members').update({ slot }).eq('id', b.id))
      check(await supabase.from('members').update({ slot: otherSlot }).eq('id', a.id))
      if (roundA) check(await supabase.from('rounds').update({ recipient_member_id: b.id }).eq('id', roundA.id))
      if (roundB) check(await supabase.from('rounds').update({ recipient_member_id: a.id }).eq('id', roundB.id))
    })
  }, [run])

  // Delete the member and the round they receive, then close the gaps in slot and round numbers.
  const removeMember = useCallback((slot) => {
    const s = storeRef.current
    const member = s.participants.find(p => p.slot === slot)
    const round = s.rounds.find(r => r.recipientSlot === slot)
    return run(null, async () => {
      if (round) check(await supabase.from('rounds').delete().eq('id', round.id))
      check(await supabase.from('members').delete().eq('id', member.id))
      for (const p of s.participants.filter(p => p.slot > slot)) {
        check(await supabase.from('members').update({ slot: p.slot - 1 }).eq('id', p.id))
      }
      if (round) {
        for (const r of s.rounds.filter(r => r.round > round.round)) {
          check(await supabase.from('rounds').update({ round_number: r.round - 1 }).eq('id', r.id))
        }
      }
    })
  }, [run])

  const saveConfig = useCallback(({ organizerName, organizerPhone }) => {
    const { cycleId } = storeRef.current.config
    return run(
      s => ({ ...s, config: { ...s.config, organizerName, organizerPhone } }),
      async () => check(await supabase.from('cycles').update({
        organizer_display_name: organizerName || null,
        zelle_destination: organizerPhone || null,
      }).eq('id', cycleId))
    )
  }, [run])

  const exportData = useCallback(() => JSON.stringify(storeRef.current, null, 2), [])

  const selectCycle = useCallback((id) => {
    selectedIdRef.current = id
    return load(id)
  }, [load])

  const importBackup = useCallback(async (raw, options) => {
    const summary = await writeImport(supabase, buildImportPlan(raw, options))
    await load(summary.cycleId)
    return summary
  }, [load])

  const regenerateLink = useCallback((slot) => {
    const member = storeRef.current.participants.find(p => p.slot === slot)
    const accessToken = newAccessToken()
    return run(
      s => ({ ...s, participants: s.participants.map(p => (p.slot === slot ? { ...p, accessToken } : p)) }),
      async () => check(await supabase.from('members').update({ access_token: accessToken }).eq('id', member.id)),
    )
  }, [run])

  // form: { name, startDate, intervalDays, contribution, organizerName, organizerPhone,
  //         members: [{ name, phone }] in payout order }. Throws on failure.
  const createCycle = useCallback(async (form) => {
    const [cycle] = check(await supabase.from('cycles').insert({
      name: form.name.trim(),
      start_date: form.startDate,
      interval_days: form.intervalDays,
      contribution: form.contribution,
      status: 'active',
      organizer_display_name: form.organizerName?.trim() || null,
      zelle_destination: form.organizerPhone?.trim() || null,
    }).select())
    try {
      const members = check(await supabase.from('members').insert(
        form.members.map((m, i) => ({
          cycle_id: cycle.id, slot: i + 1, display_first_name: m.name.trim(), phone: m.phone.trim() || null,
        }))
      ).select()).sort((x, y) => x.slot - y.slot)
      const plan = buildRounds(form.startDate, form.intervalDays, members.length)
      const rounds = check(await supabase.from('rounds').insert(
        plan.map((r, i) => ({
          cycle_id: cycle.id,
          round_number: r.roundNumber,
          collect_date: r.collectDate,
          payout_date: r.payoutDate,
          recipient_member_id: members[i].id,
        }))
      ).select())
      check(await supabase.from('payments').insert(
        rounds.flatMap(r => members.map(m => ({ round_id: r.id, member_id: m.id, amount: form.contribution })))
      ))
    } catch (e) {
      // Don't leave a half-built active cycle behind; the delete cascades to its rows.
      await supabase.from('cycles').delete().eq('id', cycle.id)
      throw e
    }
    await load()
  }, [load])

  return {
    store,
    cycles,
    loading,
    error,
    clearError: () => setError(''),
    reload: load,
    selectCycle,
    importBackup,
    regenerateLink,
    createCycle,
    togglePayment,
    togglePayout,
    updateRoundNotes,
    updateParticipant,
    addMember,
    reorderMember,
    removeMember,
    saveConfig,
    exportData,
  }
}
