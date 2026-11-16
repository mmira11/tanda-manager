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
}

export function installFakeSupabase({ session = null, isAdmin = false, db = {}, failOn = null } = {}) {
  const tables = { cycles: [], members: [], rounds: [], payments: [], ...structuredClone(db) }
  let nextId = 1000
  const listeners = []
  const state = { session }

  function cascade(table, removed) {
    const ids = removed.map(r => r.id)
    if (table === 'cycles') {
      for (const t of ['members', 'rounds']) cascade(t, take(t, r => ids.includes(r.cycle_id)))
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
        const rows = payload.map(r => ({ id: `${table}-${nextId++}`, ...DEFAULTS[table], ...r }))
        tables[table].push(...rows)
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      if (op === 'upsert') {
        const rows = payload.map(r => {
          const existing = tables[table].find(x => conflictKeys.every(k => x[k] === r[k]))
          if (existing) return Object.assign(existing, r)
          const row = { id: `${table}-${nextId++}`, ...DEFAULTS[table], ...r }
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

  current = {
    tables,
    from: vi.fn(from),
    rpc: vi.fn(async name => (name === 'is_admin'
      ? { data: isAdmin, error: null }
      : { data: null, error: { message: `unknown rpc ${name}` } })),
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
    id: `member-${i + 1}`, cycle_id: cycle.id, slot: i + 1, display_first_name: n, phone: `555000000${i % 10}`,
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
