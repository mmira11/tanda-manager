// src/hooks/useCycleStore.js — admin data for the active cycle, read/written straight to Supabase.
// Exposes the same store shape the admin components already use:
//   { config, participants: [{ id, slot, name, phone }], rounds: [{ id, round, collectDate,
//     payoutDate, recipientSlot, payments: { [slot]: bool }, payoutSent, notes }] }
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { notifyBoardChanged } from '../lib/boardSync'
import { addDays, buildRounds, isValidTimeZone } from '../utils/rounds'
import { buildImportPlan, newAccessToken, writeImport } from '../utils/importBackup'

function check({ data, error }) {
  if (error) throw error
  return data
}

export function toStore(cycle, members, rounds, payments) {
  // Removed members (N5) keep their rows for history but drop out of the roster and totals.
  const active = members.filter(m => !m.removed_at)
  const slotById = Object.fromEntries(members.map(m => [m.id, m.slot]))
  const activeIds = new Set(active.map(m => m.id))
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
      timezone: isValidTimeZone(cycle.timezone) ? cycle.timezone : 'America/Los_Angeles',
      // Slots stay unique across removed members too, so new members go after the highest one.
      nextSlot: Math.max(0, ...members.map(m => m.slot)) + 1,
    },
    participants: active.map(m => ({
      id: m.id, slot: m.slot, name: m.display_first_name, phone: m.phone || '',
      accessToken: m.access_token || '',
      linkRevoked: Boolean(m.token_revoked_at),
    })),
    rounds: rounds.map(r => ({
      id: r.id,
      round: r.round_number,
      collectDate: r.collect_date,
      payoutDate: r.payout_date,
      recipientSlot: slotById[r.recipient_member_id],
      needsRecipient: !activeIds.has(r.recipient_member_id),
      payoutSent: r.payout_sent,
      notes: r.notes,
      payments: Object.fromEntries(
        payments
          .filter(p => p.round_id === r.id && activeIds.has(p.member_id))
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
  const [pendingReview, setPendingReview] = useState([])
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
        setPendingReview([])
        return
      }
      selectedIdRef.current = cycleSummary.id
      const cycle = check(await supabase.from('cycles').select('*').eq('id', cycleSummary.id).limit(1))[0]
      if (!cycle) {
        selectedIdRef.current = null
        setStore(null)
        setPendingReview([])
        return
      }
      const [members, rounds] = await Promise.all([
        supabase.from('members').select('id, slot, display_first_name, phone, access_token, token_revoked_at, removed_at')
          .eq('cycle_id', cycle.id).order('slot').then(check),
        supabase.from('rounds').select('*')
          .eq('cycle_id', cycle.id).order('round_number').then(check),
      ])
      const payments = rounds.length
        ? check(await supabase.from('payments').select('round_id, member_id, paid_at')
            .in('round_id', rounds.map(r => r.id)))
        : []
      const reviews = check(await supabase.from('pending_review')
        .select('id, sender_name, amount, raw_subject, status, received_at')
        .eq('cycle_id', cycle.id)
        .eq('status', 'pending'))
      if (request !== requestRef.current) return
      setStore(toStore(cycle, members, rounds, payments))
      setPendingReview(reviews)
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
    const slot = s.config.nextSlot
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

  // Swap payout positions with the next active member up or down, in one transaction
  // (swap_payout_order, migration 008). Payments stay with each person; round dates stay put.
  const reorderMember = useCallback((slot, direction) => {
    const list = storeRef.current.participants
    const i = list.findIndex(p => p.slot === slot)
    const a = list[i]
    const b = list[direction === 'up' ? i - 1 : i + 1]
    if (!a || !b) return
    return run(null, async () => check(await supabase.rpc('swap_payout_order', { p_a: a.id, p_b: b.id })))
  }, [run])

  // Soft-delete (N5): keep payment history and the member's round; revoke their link.
  // The round then shows "Needs a recipient" until assignRecipient picks someone.
  const removeMember = useCallback((slot) => {
    const member = storeRef.current.participants.find(p => p.slot === slot)
    const now = new Date().toISOString()
    return run(null, async () => check(await supabase.from('members')
      .update({ removed_at: now, token_revoked_at: now }).eq('id', member.id)))
  }, [run])

  const assignRecipient = useCallback((roundNum, slot) => {
    const s = storeRef.current
    const round = s.rounds.find(r => r.round === roundNum)
    const member = s.participants.find(p => p.slot === slot)
    if (!round || !member) return
    return run(null, async () => check(await supabase.from('rounds')
      .update({ recipient_member_id: member.id }).eq('id', round.id)))
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
      s => ({ ...s, participants: s.participants.map(p => (p.slot === slot ? { ...p, accessToken, linkRevoked: false } : p)) }),
      async () => check(await supabase.from('members')
        .update({ access_token: accessToken, token_revoked_at: null }).eq('id', member.id)),
    )
  }, [run])

  // Stops the member's current link (migration 007). Regenerate issues a working one.
  const revokeLink = useCallback((slot) => {
    const member = storeRef.current.participants.find(p => p.slot === slot)
    return run(
      s => ({ ...s, participants: s.participants.map(p => (p.slot === slot ? { ...p, linkRevoked: true } : p)) }),
      async () => check(await supabase.from('members')
        .update({ token_revoked_at: new Date().toISOString() }).eq('id', member.id)),
    )
  }, [run])

  // form: { name, startDate, intervalDays, contribution, organizerName, organizerPhone,
  //         members: [{ name, phone }] in payout order }. Throws on failure.
  const archiveCycle = useCallback(async () => {
    const { cycleId, status } = storeRef.current.config
    if (status !== 'active') return
    try {
      check(await supabase.from('cycles').update({
        status: 'archived',
        archived_at: new Date().toISOString(),
      }).eq('id', cycleId))
      // Reload so the cycle list drops "active" and New cycle can open.
      await load(cycleId)
    } catch (e) {
      setError(e.message || String(e))
    }
  }, [load])

  const createCycle = useCallback(async (form) => {
    const existingActive = check(await supabase.from('cycles').select('id').eq('status', 'active').limit(1))
    if (existingActive.length > 0) {
      throw new Error('An active cycle already exists. Archive it before starting another.')
    }
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
    await load(cycle.id)
  }, [load])

  return {
    store,
    cycles,
    pendingReview,
    loading,
    error,
    clearError: () => setError(''),
    reload: load,
    selectCycle,
    importBackup,
    archiveCycle,
    regenerateLink,
    revokeLink,
    assignRecipient,
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
