// In-memory stand-in for the Supabase client, enough for the queries the app makes.
// Usage in a test file:
//   vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())
//   const fake = installFakeSupabase({ session, isAdmin, db })
import { vi } from 'vitest'
import { buildRounds } from '../utils/rounds'

let current = null

export function mockModule() {
  return { supabase: new Proxy({}, { get: (_, key) => current[key] }) }
}

const DEFAULTS = {
  cycles: { status: 'draft', interval_days: 14, organizer_display_name: null, zelle_destination: null },
  members: { phone: null, language_pref: 'en' },
  rounds: { payout_sent: false, payout_sent_at: null, notes: '' },
  payments: { paid_at: null, source: null },
  reminder_settings: { timezone: 'America/Los_Angeles', enabled: false, channel: 'queue' },
  reminder_log: { dry_run: false, status: 'queued', channel: 'queue' },
  reminder_templates: {},
}

export function installFakeSupabase({ session = null, isAdmin = false, db = {}, failOn = null } = {}) {
  const tables = {
    cycles: [], members: [], rounds: [], payments: [],
    reminder_settings: [], reminder_templates: [], reminder_log: [], sms_opt_outs: [],
    pending_review: [], payer_aliases: [],
    ...structuredClone(db),
  }
  let nextId = 1000
  const listeners = []
  const state = { session }

  function cascade(table, removed) {
    const ids = removed.map(r => r.id)
    if (table === 'cycles') {
      for (const t of ['members', 'rounds', 'reminder_settings', 'reminder_templates', 'reminder_log']) {
        cascade(t, take(t, r => ids.includes(r.cycle_id)))
      }
    }
    if (table === 'rounds') take('payments', p => ids.includes(p.round_id))
    if (table === 'members') take('payments', p => ids.includes(p.member_id))
  }
  function take(table, pred) {
    const removed = tables[table].filter(pred)
    tables[table] = tables[table].filter(r => !pred(r))
    return removed
  }

  function from(table) {
    let op = 'select'
    let payload
    let conflictKeys = []
    let order = null
    let limit = null
    const filters = []

    const exec = () => {
      if (failOn && failOn(table, op)) return { data: null, error: { message: `fake ${op} on ${table} failed` } }
      const match = r => filters.every(f => f(r))
      if (op === 'select') {
        let rows = tables[table].filter(match).map(r => ({ ...r }))
        if (order) rows.sort((a, b) => (a[order] > b[order] ? 1 : -1))
        if (limit !== null) rows = rows.slice(0, limit)
        return { data: rows, error: null }
      }
      if (op === 'insert') {
        const rows = payload.map(r => ({ id: `${table}-${nextId++}`, ...(DEFAULTS[table] || {}), ...r }))
        tables[table].push(...rows)
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      if (op === 'upsert') {
        const rows = payload.map(r => {
          const existing = tables[table].find(x => conflictKeys.every(k => x[k] === r[k]))
          if (existing) return Object.assign(existing, r)
          const row = { id: `${table}-${nextId++}`, ...(DEFAULTS[table] || {}), ...r }
          tables[table].push(row)
          return row
        })
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      if (op === 'update') {
        const rows = tables[table].filter(match)
        rows.forEach(r => Object.assign(r, payload))
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      if (op === 'delete') {
        cascade(table, take(table, match))
        return { data: null, error: null }
      }
      throw new Error(`fake: unsupported op ${op}`)
    }

    const builder = {
      select() { return builder },
      insert(rows) { op = 'insert'; payload = [].concat(rows); return builder },
      upsert(rows, opts = {}) {
        op = 'upsert'
        payload = [].concat(rows)
        conflictKeys = (opts.onConflict || 'id').split(',')
        return builder
      },
      update(patch) { op = 'update'; payload = patch; return builder },
      delete() { op = 'delete'; return builder },
      eq(col, val) { filters.push(r => r[col] === val); return builder },
      in(col, vals) { filters.push(r => vals.includes(r[col])); return builder },
      order(col) { order = col; return builder },
      limit(n) { limit = n; return builder },
      then(resolve, reject) { return Promise.resolve().then(exec).then(resolve, reject) },
    }
    return builder
  }

  // Mirrors public.import_cycle (migration 006): all rows or none.
  async function importCycle(plan) {
    const snapshot = structuredClone(tables)
    const run = query => query.then(r => { if (r.error) throw new Error(r.error.message); return r.data })
    try {
      if (tables.cycles.some(c => c.start_date === plan.cycle.start_date)) {
        throw new Error('A cycle with this start date already exists')
      }
      const [cycle] = await run(from('cycles').insert({ ...plan.cycle, status: 'draft', archived_at: null }).select())
      const members = await run(from('members').insert(plan.members.map(m => ({ ...m, cycle_id: cycle.id }))).select())
      const memberBySlot = Object.fromEntries(members.map(m => [m.slot, m]))
      const rounds = await run(from('rounds').insert(plan.rounds.map(({ recipientSlot, ...r }) => {
        if (!memberBySlot[recipientSlot]) throw new Error('null value in column "recipient_member_id"')
        return { ...r, cycle_id: cycle.id, recipient_member_id: memberBySlot[recipientSlot].id }
      })).select())
      const roundByNumber = Object.fromEntries(rounds.map(r => [r.round_number, r]))
      await run(from('payments').insert(plan.payments.map(p => {
        if (!roundByNumber[p.roundNumber] || !memberBySlot[p.slot]) throw new Error('null value in column "member_id"')
        return {
          round_id: roundByNumber[p.roundNumber].id, member_id: memberBySlot[p.slot].id,
          amount: p.amount, paid_at: p.paid_at, source: p.source,
        }
      })))
      await run(from('reminder_settings').insert({ cycle_id: cycle.id }))
      await run(from('reminder_templates').insert((plan.reminder_templates || []).map(t => ({ ...t, cycle_id: cycle.id }))))
      await run(from('cycles').update({ status: 'archived', archived_at: plan.cycle.archived_at }).eq('id', cycle.id))
      return {
        data: {
          cycle_id: cycle.id, members: members.length, rounds: rounds.length,
          payments: plan.payments.length, paid: plan.payments.filter(p => p.paid_at).length,
        },
        error: null,
      }
    } catch (e) {
      for (const key of Object.keys(snapshot)) tables[key] = snapshot[key]
      return { data: null, error: { message: e.message } }
    }
  }

  current = {
    tables,
    from: vi.fn(from),
    rpc: vi.fn(async (name, args) => {
      if (name === 'is_admin') return { data: isAdmin, error: null }
      if (name === 'import_cycle') return importCycle(args.p_plan)
      if (name === 'confirm_zelle_match') {
        // Mirrors migrations 014, 015, and 016: an archived cycle fails before any write.
        // Otherwise the admin's round, if any, replaces the stored one. Then mark that member
        // paid for the review's round, close the review, and save the alias.
        const fail = message => ({ data: null, error: { message } })
        const review = tables.pending_review.find(r => r.id === args.p_review)
        if (!review) return fail('Review not found')
        if (review.status !== 'pending') return fail('This item was already handled')
        const cycle = tables.cycles.find(c => c.id === review.cycle_id)
        if (cycle && cycle.status === 'archived') return fail('cycle is archived')
        if (args.p_round) {
          const round = tables.rounds.find(r => r.id === args.p_round && r.cycle_id === review.cycle_id)
          if (!round) return fail('That round is not in this cycle')
          review.round_id = args.p_round
        }
        const member = tables.members.find(m => m.id === args.p_member && m.cycle_id === review.cycle_id && !m.removed_at)
        if (!member) return fail('That member is not in this cycle')
        const payment = tables.payments.find(p => p.round_id === review.round_id && p.member_id === args.p_member)
        if (!payment) return fail('That member has no payment for this round')
        if (Number(review.amount) !== Number(payment.amount)) {
          return fail('The Zelle amount does not match this payment; mark it by hand instead')
        }
        if (!payment.paid_at) Object.assign(payment, { paid_at: review.received_at, source: 'auto' })
        Object.assign(review, { status: 'matched', suggested_member_id: args.p_member, resolved_at: new Date().toISOString() })
        if (!tables.payer_aliases.some(a => a.member_id === args.p_member && a.alias_name === review.sender_name)) {
          tables.payer_aliases.push({ id: `alias-${nextId++}`, member_id: args.p_member, alias_name: review.sender_name })
        }
        return { data: null, error: null }
      }
      if (name === 'enqueue_reminders') {
        const rows = Array.isArray(args?.p_rows) ? args.p_rows : null
        if (!rows) return { data: null, error: { message: 'expected a list of reminders' } }
        let inserted = 0
        for (const row of rows) {
          if (!['thursday_all', 'friday_noon', 'friday_evening'].includes(row.kind)) {
            return { data: null, error: { message: 'invalid reminder window' } }
          }
          const existing = tables.reminder_log.find(item => item.round_id === row.round_id
            && item.member_id === row.member_id && item.kind === row.kind && item.dry_run === false)
          if (existing) continue
          tables.reminder_log.push({
            id: `reminder_log-${nextId++}`, ...row, dry_run: false, status: 'queued', channel: 'queue',
          })
          inserted += 1
        }
        return { data: inserted, error: null }
      }
      if (name === 'set_reminder_log_status') {
        if (!['sent', 'skipped'].includes(args?.p_status)) {
          return { data: null, error: { message: 'invalid reminder status' } }
        }
        const row = tables.reminder_log.find(item => item.id === args.p_id && item.status === 'queued')
        if (!row) return { data: null, error: { message: 'reminder not queued' } }
        row.status = args.p_status
        return { data: null, error: null }
      }
      if (name === 'swap_payout_order') {
        // Mirrors migration 008: swap slots and payout rounds together, or change nothing.
        const a = tables.members.find(m => m.id === args.p_a)
        const b = tables.members.find(m => m.id === args.p_b)
        if (!a || !b || a === b || a.cycle_id !== b.cycle_id) {
          return { data: null, error: { message: 'Both members must exist and be in the same cycle' } }
        }
        ;[a.slot, b.slot] = [b.slot, a.slot]
        for (const r of tables.rounds) {
          if (r.cycle_id !== a.cycle_id) continue
          if (r.recipient_member_id === a.id) r.recipient_member_id = b.id
          else if (r.recipient_member_id === b.id) r.recipient_member_id = a.id
        }
        return { data: null, error: null }
      }
      return { data: null, error: { message: `unknown rpc ${name}` } }
    }),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      onAuthStateChange: vi.fn(cb => {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      }),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => {
        state.session = null
        listeners.forEach(cb => cb('SIGNED_OUT', null))
        return { error: null }
      }),
    },
  }
  return current
}

export const adminSession = { user: { id: 'user-1', email: 'admin@example.com' } }

// Rows for one active cycle: members in payout order, a round per member, a payment row per member per round.
export function seedCycle({
  names, contribution = 200, startDate = '2026-06-12', intervalDays = 14, name = 'Test Tanda',
}) {
  const cycle = {
    id: 'cycle-1', name, start_date: startDate, interval_days: intervalDays, contribution,
    status: 'active', organizer_display_name: 'Org', zelle_destination: '5550000000',
  }
  const members = names.map((n, i) => ({
    id: `member-${i + 1}`, cycle_id: cycle.id, slot: i + 1, display_first_name: n,
    phone: `555010000${i % 10}`, access_token: `test-token-${i + 1}`,
  }))
  const rounds = buildRounds(startDate, intervalDays, names.length).map((r, i) => ({
    id: `round-${i + 1}`, cycle_id: cycle.id, round_number: r.roundNumber, collect_date: r.collectDate,
    payout_date: r.payoutDate, recipient_member_id: members[i].id, payout_sent: false, payout_sent_at: null, notes: '',
  }))
  const payments = rounds.flatMap(r => members.map(m => ({
    id: `pay-${r.id}-${m.id}`, round_id: r.id, member_id: m.id, amount: contribution, paid_at: null, source: null,
  })))
  return { cycles: [cycle], members, rounds, payments }
}
