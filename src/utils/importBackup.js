// Maps an old localStorage / Settings JSON export into one archived cycle.
// PIN and any GitHub token are ignored. Callers must log counts only — never names or phones.

import { isWholeCents } from './money.js'

export class ImportError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImportError'
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function fail(message) {
  throw new ImportError(message)
}

export function newAccessToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function daysBetween(start, end) {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Math.round(ms / 86400000)
}

function firstName(name, slot) {
  const token = String(name || '').trim().split(/\s+/)[0]
  return token || `Member ${slot}`
}

function parseBackup(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      fail('Invalid JSON')
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Backup is missing')
  if (!Array.isArray(data.participants) || data.participants.length === 0) fail('Backup has no participants')
  if (!Array.isArray(data.rounds) || data.rounds.length === 0) fail('Backup has no rounds')

  const slots = new Set()
  const participants = data.participants.map((row) => {
    if (!row || typeof row !== 'object') fail('A participant is invalid')
    const slot = row.slot
    if (!Number.isInteger(slot) || slot < 1) fail('A participant has an invalid slot')
    if (slots.has(slot)) fail('Two participants share a slot')
    slots.add(slot)
    return {
      slot,
      name: typeof row.name === 'string' ? row.name : '',
      phone: typeof row.phone === 'string' ? row.phone.trim() : '',
    }
  })

  const roundNumbers = new Set()
  const rounds = data.rounds.map((row) => {
    if (!row || typeof row !== 'object') fail('A round is invalid')
    const round = row.round
    if (!Number.isInteger(round) || round < 1) fail('A round number is invalid')
    if (roundNumbers.has(round)) fail('Two rounds share a number')
    roundNumbers.add(round)
    if (typeof row.collectDate !== 'string' || !DATE.test(row.collectDate)) fail('A round is missing a collection date')
    if (typeof row.payoutDate !== 'string' || !DATE.test(row.payoutDate)) fail('A round is missing a payout date')
    if (!slots.has(row.recipientSlot)) fail('A round recipient is not on the roster')
    const source = row.payments == null ? {} : row.payments
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail('A round has an invalid payments map')
    const paidBySlot = new Map()
    for (const key of Object.keys(source)) {
      const slot = Number(key)
      if (!slots.has(slot)) fail('A payment refers to a slot that is not on the roster')
      if (typeof source[key] !== 'boolean') fail('A payment value is not true or false')
      paidBySlot.set(slot, source[key])
    }
    return {
      round,
      collectDate: row.collectDate,
      payoutDate: row.payoutDate,
      recipientSlot: row.recipientSlot,
      paidBySlot,
      payoutSent: row.payoutSent === true,
      notes: typeof row.notes === 'string' ? row.notes : '',
    }
  })

  participants.sort((a, b) => a.slot - b.slot)
  rounds.sort((a, b) => a.round - b.round)

  const config = data.config && typeof data.config === 'object' && !Array.isArray(data.config) ? data.config : {}
  let intervalDays = null
  if (rounds.length >= 2) {
    const gap = daysBetween(rounds[0].collectDate, rounds[1].collectDate)
    if (gap > 0) intervalDays = gap
  }
  const paid = rounds.reduce(
    (sum, round) => sum + participants.filter(p => round.paidBySlot.get(p.slot) === true).length,
    0,
  )

  return {
    participants,
    rounds,
    config,
    startDate: rounds[0].collectDate,
    intervalDays,
    paid,
  }
}

export function inspectBackup(raw) {
  const parsed = parseBackup(raw)
  const contribution = Number(parsed.config.contribution)
  return {
    memberCount: parsed.participants.length,
    roundCount: parsed.rounds.length,
    paidCount: parsed.paid,
    paymentCount: parsed.participants.length * parsed.rounds.length,
    startDate: parsed.startDate,
    intervalDays: parsed.intervalDays,
    suggestedName: `Tanda ${parsed.startDate.slice(0, 4)}`,
    contribution: contribution > 0 ? contribution : null,
  }
}

export function buildImportPlan(raw, options = {}) {
  const parsed = parseBackup(raw)
  const { config, participants, rounds, startDate } = parsed
  const contribution = Number(options.contribution ?? config.contribution)
  if (!isWholeCents(contribution)) fail('Contribution must be a positive amount in whole cents')

  const intervalDays = Number.isInteger(options.intervalDays) && options.intervalDays > 0
    ? options.intervalDays
    : parsed.intervalDays
  if (!intervalDays) fail('Could not determine days between rounds')

  const explicitName = typeof options.name === 'string' ? options.name.trim() : ''
  const fileName = typeof config.name === 'string' ? config.name.trim() : ''
  const name = explicitName || fileName || `Tanda ${startDate.slice(0, 4)}`

  const makeToken = options.token || newAccessToken
  const used = new Set()
  const members = participants.map((person) => {
    const accessToken = makeToken()
    if (typeof accessToken !== 'string' || accessToken.length < 16 || used.has(accessToken)) {
      fail('Could not create a member link')
    }
    used.add(accessToken)
    return {
      slot: person.slot,
      display_first_name: firstName(person.name, person.slot),
      phone: person.phone || null,
      language_pref: 'en',
      access_token: accessToken,
    }
  })

  const payments = []
  for (const round of rounds) {
    for (const person of participants) {
      const paid = round.paidBySlot.get(person.slot) === true
      payments.push({
        roundNumber: round.round,
        slot: person.slot,
        amount: contribution,
        paid_at: paid ? `${round.payoutDate}T12:00:00.000Z` : null,
        source: paid ? 'manual' : null,
      })
    }
  }
  if (payments.length !== members.length * rounds.length) fail('Payment rows must equal members × rounds')

  const organizerName = typeof config.organizerName === 'string' ? config.organizerName.trim() : ''
  const organizerPhone = typeof config.organizerPhone === 'string' ? config.organizerPhone.trim() : ''

  return {
    cycle: {
      name,
      start_date: startDate,
      interval_days: intervalDays,
      contribution,
      status: 'archived',
      timezone: 'America/Los_Angeles',
      organizer_display_name: organizerName || null,
      zelle_destination: organizerPhone || null,
      archived_at: options.now || new Date().toISOString(),
    },
    members,
    rounds: rounds.map(round => ({
      round_number: round.round,
      collect_date: round.collectDate,
      payout_date: round.payoutDate,
      recipientSlot: round.recipientSlot,
      payout_sent: round.payoutSent,
      payout_sent_at: round.payoutSent ? `${round.payoutDate}T12:00:00.000Z` : null,
      notes: round.notes,
    })),
    payments,
  }
}

const REMINDER_BODIES = [
  ['thursday_all', 'en', "Good morning peoples! It's Tanda week! Just want to give a friendly reminder to get that zelle in. Once my bot receives the zelle I'll mark you paid. My auto bot messages will go out as friendly reminders"],
  ['thursday_all', 'es', 'Buenos días! Es semana de tanda. Un recordatorio amistoso para enviar el Zelle. Cuando el bot lo reciba, te marco como pagado. Los mensajes automáticos son solo recordatorios.'],
  ['friday_noon', 'en', 'Hi {{firstName}}, friendly reminder that Tanda collection is today. Please send {{amount}} via Zelle to {{zelle}}. Thank you!'],
  ['friday_noon', 'es', 'Hola {{firstName}}, te recuerdo que el cobro de la tanda es hoy. Por favor envía {{amount}} por Zelle a {{zelle}}. ¡Gracias!'],
  ['friday_evening', 'en', 'Hi {{firstName}}, last call — Tanda collection is today. Please send {{amount}} via Zelle to {{zelle}} now. Thank you!'],
  ['friday_evening', 'es', 'Hola {{firstName}}, último aviso — el cobro de la tanda es hoy. Por favor envía {{amount}} por Zelle a {{zelle}} ahora. ¡Gracias!'],
]

function resultOf(query) {
  if (query.error) throw query.error
  return query.data
}

export async function writeImport(supabase, plan) {
  const existing = resultOf(await supabase.from('cycles').select('id').eq('start_date', plan.cycle.start_date))
  if (existing.length > 0) fail('A cycle with this start date already exists')

  let cycleId = null
  try {
    // Child rows are inserted while the cycle is still a draft. The archived-cycle
    // write lock (see migration 003) rejects member/round/payment writes once
    // status is archived, so the flip happens only after those inserts succeed.
    const [cycle] = resultOf(await supabase.from('cycles').insert({
      ...plan.cycle,
      status: 'draft',
      archived_at: null,
    }).select())
    cycleId = cycle.id
    const members = resultOf(await supabase.from('members').insert(
      plan.members.map(member => ({ ...member, cycle_id: cycle.id })),
    ).select())
    const memberBySlot = Object.fromEntries(members.map(member => [member.slot, member]))
    const rounds = resultOf(await supabase.from('rounds').insert(
      plan.rounds.map(round => ({
        cycle_id: cycle.id,
        round_number: round.round_number,
        collect_date: round.collect_date,
        payout_date: round.payout_date,
        recipient_member_id: memberBySlot[round.recipientSlot].id,
        payout_sent: round.payout_sent,
        payout_sent_at: round.payout_sent_at,
        notes: round.notes,
      })),
    ).select())
    const roundByNumber = Object.fromEntries(rounds.map(round => [round.round_number, round]))
    const payments = plan.payments.map(payment => ({
      round_id: roundByNumber[payment.roundNumber].id,
      member_id: memberBySlot[payment.slot].id,
      amount: payment.amount,
      paid_at: payment.paid_at,
      source: payment.source,
    }))
    if (payments.length !== members.length * rounds.length) fail('Payment rows must equal members × rounds')
    resultOf(await supabase.from('payments').insert(payments))
    resultOf(await supabase.from('reminder_settings').insert({
      cycle_id: cycle.id,
      timezone: 'America/Los_Angeles',
      thursday_all_at: '09:00',
      friday_noon_at: '12:00',
      friday_evening_at: '18:00',
      enabled: false,
    }))
    resultOf(await supabase.from('reminder_templates').insert(
      REMINDER_BODIES.map(([kind, lang, body]) => ({ cycle_id: cycle.id, kind, lang, body })),
    ))
    resultOf(await supabase.from('cycles').update({
      status: 'archived',
      archived_at: plan.cycle.archived_at,
    }).eq('id', cycle.id))
    return {
      cycleId: cycle.id,
      members: members.length,
      rounds: rounds.length,
      payments: payments.length,
      paid: payments.filter(payment => payment.paid_at).length,
    }
  } catch (error) {
    if (cycleId) await supabase.from('cycles').delete().eq('id', cycleId)
    if (error instanceof ImportError) throw error
    throw new ImportError('Import failed. Nothing was saved.')
  }
}

export function formatImportSummary(summary) {
  return [
    `members: ${summary.members}`,
    `rounds: ${summary.rounds}`,
    `payments: ${summary.payments}`,
    `paid: ${summary.paid}`,
  ].join('\n')
}
