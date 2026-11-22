// src/hooks/useCycleStore.js — admin data for the active cycle, read/written straight to Supabase.
// Exposes the same store shape the admin components already use:
//   { config, participants: [{ id, slot, name, phone }], rounds: [{ id, round, collectDate,
//     payoutDate, recipientSlot, payments: { [slot]: bool }, payoutSent, notes }] }
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { addDays, buildRounds, isValidTimeZone } from '../utils/rounds'
import { buildImportPlan, newAccessToken, writeImport } from '../utils/importBackup'
import { planReminderQueue } from '../utils/reminderQueue'

const EMPTY_REMINDERS = { settings: null, templates: [], queued: [], optedOut: [] }

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
      language: m.language_pref === 'es' ? 'es' : 'en',
      linkSentAt: m.link_sent_at || null,
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
          // auto_recipient is the waiver, not money received. The screen still shows
          // that person as settled because they are the round's recipient.
          .map(p => [slotById[p.member_id], p.paid_at !== null && p.source !== 'auto_recipient'])
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
  const [reminderMeta, setReminderMeta] = useState(EMPTY_REMINDERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const storeRef = useRef(null)
  const reminderRef = useRef(EMPTY_REMINDERS)
  const selectedIdRef = useRef(null)
  const requestRef = useRef(0)
  storeRef.current = store
  reminderRef.current = reminderMeta

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
        setReminderMeta(EMPTY_REMINDERS)
        return
      }
      selectedIdRef.current = cycleSummary.id
      const cycle = check(await supabase.from('cycles').select('*').eq('id', cycleSummary.id).limit(1))[0]
      if (!cycle) {
        selectedIdRef.current = null
        setStore(null)
        setPendingReview([])
        setReminderMeta(EMPTY_REMINDERS)
        return
      }
      const [members, rounds, settingsRows, templates, queued, optOuts] = await Promise.all([
        supabase.from('members').select('id, slot, display_first_name, phone, access_token, token_revoked_at, removed_at, language_pref, link_sent_at')
          .eq('cycle_id', cycle.id).order('slot').then(check),
        supabase.from('rounds').select('*')
          .eq('cycle_id', cycle.id).order('round_number').then(check),
        supabase.from('reminder_settings').select('*').eq('cycle_id', cycle.id).then(check),
        supabase.from('reminder_templates').select('kind, lang, body').eq('cycle_id', cycle.id).then(check),
        supabase.from('reminder_log').select('*').eq('cycle_id', cycle.id).eq('status', 'queued').then(check),
        supabase.from('sms_opt_outs').select('phone_e164').then(check),
      ])
      const payments = rounds.length
        ? check(await supabase.from('payments').select('round_id, member_id, paid_at, source')
            .in('round_id', rounds.map(r => r.id)))
        : []
      const reviews = check(await supabase.from('pending_review')
        .select('id, sender_name, amount, raw_subject, status, received_at, suggested_member_id, round_id, round_timing, match_reason')
        .eq('cycle_id', cycle.id)
        .eq('status', 'pending'))
      if (request !== requestRef.current) return
      setStore(toStore(cycle, members, rounds, payments))
      setPendingReview(reviews)
      setReminderMeta({
        settings: settingsRows[0] || null,
        templates,
        queued,
        optedOut: optOuts.map(row => row.phone_e164),
      })
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
    // The recipient does not pay this round. Unmarking them would look like a debt.
    if (!round || !member || slot === round.recipientSlot) return
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
    if ('language' in fields) patch.language_pref = fields.language === 'es' ? 'es' : 'en'
    if ('linkSentAt' in fields) patch.link_sent_at = fields.linkSentAt
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

  // Move a round's collect and payout days. The database refuses a payout before its
  // collection or dates that fall out of round order (migration 009).
  const updateRoundDates = useCallback((roundNum, collectDate, payoutDate) => {
    const round = storeRef.current.rounds.find(r => r.round === roundNum)
    if (!round) return
    return run(
      patchRound(roundNum, r => ({ ...r, collectDate, payoutDate })),
      async () => check(await supabase.from('rounds')
        .update({ collect_date: collectDate, payout_date: payoutDate }).eq('id', round.id))
    )
  }, [run])

  // Grokbot's key: only a hash is stored. createBotKey returns the key once.
  const loadBotKey = useCallback(async () => {
    const rows = check(await supabase.from('bot_keys').select('created_at, revoked_at'))
    return rows.filter(row => !row.revoked_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null
  }, [])

  const createBotKey = useCallback(async () => check(await supabase.rpc('create_bot_key')), [])

  const revokeBotKeys = useCallback(async () => { check(await supabase.rpc('revoke_bot_keys')) }, [])

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
      // Draft until every child row is in, so an interrupted save (closed tab, lost
      // signal) never leaves an empty cycle marked active.
      status: 'draft',
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
      check(await supabase.from('cycles').update({ status: 'active' }).eq('id', cycle.id))
    } catch (e) {
      // Don't leave a half-built active cycle behind; the delete cascades to its rows.
      await supabase.from('cycles').delete().eq('id', cycle.id)
      throw e
    }
    await load(cycle.id)
  }, [load])

  // A cycle with no rounds or no members was never finished (an interrupted create).
  // Deleting it cascades to any child rows; it never held payments.
  const deleteIncompleteCycle = useCallback(async () => {
    const current = storeRef.current
    if (!current || (current.rounds.length > 0 && current.participants.length > 0)) return
    try {
      check(await supabase.from('cycles').delete().eq('id', current.config.cycleId))
      selectedIdRef.current = null
      await load()
    } catch (e) {
      setError(e.message || String(e))
    }
  }, [load])

  // Phase 5: the admin confirms a detected Zelle payment. confirm_zelle_match marks that
  // member paid for the round the admin picked, closes the review, and saves the alias.
  // Migration 016 refuses an archived cycle before it changes a payment. Dismiss sets the
  // row aside and can store a short reason.
  const confirmMatch = useCallback((reviewId, memberId, roundId) => run(null, async () => {
    check(await supabase.rpc('confirm_zelle_match', {
      p_review: reviewId,
      p_member: memberId,
      p_round: roundId || null,
    }))
  }), [run])

  const dismissReview = useCallback((reviewId, reason) => run(
    null,
    async () => check(await supabase.from('pending_review')
      .update({
        status: 'ignored',
        resolved_at: new Date().toISOString(),
        dismiss_reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      }).eq('id', reviewId)),
  ), [run])

  const buildReminderList = useCallback(async (now = new Date()) => {
    const s = storeRef.current
    if (!s || s.config.status === 'archived') return { window: null, rows: [] }
    const meta = reminderRef.current
    const plan = planReminderQueue({
      now,
      cycle: { id: s.config.cycleId },
      settings: { ...(meta.settings || {}), timezone: meta.settings?.timezone || s.config.timezone },
      rounds: s.rounds.map(round => ({
        id: round.id,
        round_number: round.round,
        collect_date: round.collectDate,
        recipient_member_id: s.participants.find(person => person.slot === round.recipientSlot)?.id ?? null,
      })),
      members: s.participants.map(person => ({
        id: person.id, display_first_name: person.name, phone: person.phone, removed_at: null,
      })),
      // Only members with a payment row in that round (N9): someone not paying a round is not reminded.
      payments: s.rounds.flatMap(round => s.participants
        .filter(person => Object.prototype.hasOwnProperty.call(round.payments || {}, person.slot))
        .map(person => ({
          round_id: round.id,
          member_id: person.id,
          paid_at: round.payments[person.slot] ? 'paid' : null,
        }))),
      optedOut: new Set(meta.optedOut || []),
    })
    if (!plan.window || plan.rows.length === 0) return plan
    try {
      check(await supabase.rpc('enqueue_reminders', { p_rows: plan.rows }))
      await load()
      return plan
    } catch (e) {
      setError(e.message || String(e))
      throw e
    }
  }, [load])

  const markReminders = useCallback(async (ids, status) => {
    const done = []
    try {
      for (const id of ids) {
        check(await supabase.rpc('set_reminder_log_status', { p_id: id, p_status: status }))
        done.push(id)
      }
    } catch (e) {
      setError(e.message || String(e))
      await load()
      return
    }
    const finished = new Set(done)
    setReminderMeta(meta => ({ ...meta, queued: meta.queued.filter(row => !finished.has(row.id)) }))
  }, [load])

  return {
    store,
    cycles,
    pendingReview,
    reminderMeta,
    buildReminderList,
    markReminders,
    confirmMatch,
    dismissReview,
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
    deleteIncompleteCycle,
    updateRoundDates,
    loadBotKey,
    createBotKey,
    revokeBotKeys,
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
