import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { render, screen, renderHook, waitFor, act } from '@testing-library/react'
import {
  buildImportPlan,
  formatImportSummary,
  inspectBackup,
  writeImport,
} from '../utils/importBackup'
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { useCycleStore } from '../hooks/useCycleStore'
import { StoreProvider, useStore } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

const PIN = 'pin-do-not-import'
const GITHUB_TOKEN = 'ghp_do_not_import'
const PHONE = '5550100001'

function backup(overrides = {}) {
  return {
    config: {
      organizerName: 'Org',
      organizerPhone: '5550100099',
      pin: PIN,
      githubToken: GITHUB_TOKEN,
      organizerSlot: 2,
    },
    participants: [
      { slot: 1, name: 'Ada Lovelace', phone: PHONE },
      { slot: 2, name: 'Bea', phone: '5550100002' },
    ],
    rounds: [
      {
        round: 1, collectDate: '2025-03-07', payoutDate: '2025-03-08', recipientSlot: 1,
        payments: { 1: true, 2: false }, payoutSent: true, notes: 'ok',
      },
      {
        round: 2, collectDate: '2025-03-21', payoutDate: '2025-03-22', recipientSlot: 2,
        payments: { 1: true, 2: true }, payoutSent: false, notes: '',
      },
    ],
    ...overrides,
  }
}

describe('buildImportPlan', () => {
  it('maps the old export into an archived cycle and drops pin and github token', () => {
    const plan = buildImportPlan(backup(), { contribution: 40, now: '2026-01-01T00:00:00.000Z' })
    const dumped = JSON.stringify(plan)

    expect(plan.cycle).toMatchObject({
      name: 'Tanda 2025',
      start_date: '2025-03-07',
      interval_days: 14,
      contribution: 40,
      status: 'archived',
      organizer_display_name: 'Org',
      zelle_destination: '5550100099',
    })
    expect(plan.members.map(m => m.display_first_name)).toEqual(['Ada', 'Bea'])
    expect(plan.members.map(m => m.phone)).toEqual([PHONE, '5550100002'])
    expect(new Set(plan.members.map(m => m.access_token)).size).toBe(2)
    expect(plan.members.every(m => m.access_token.length >= 16)).toBe(true)
    expect(plan.rounds.map(r => r.recipientSlot)).toEqual([1, 2])
    expect(plan.payments).toHaveLength(4)
    expect(plan.payments.filter(p => p.paid_at).map(p => [p.roundNumber, p.slot])).toEqual([[1, 1], [2, 1], [2, 2]])
    expect(plan.payments.find(p => p.roundNumber === 1 && p.slot === 1).paid_at).toBe('2025-03-08T12:00:00.000Z')
    expect(plan.payments.find(p => p.paid_at === null).source).toBeNull()
    expect(dumped).not.toContain(PIN)
    expect(dumped).not.toContain(GITHUB_TOKEN)
    expect(dumped).not.toContain('Lovelace')
  })

  it('refuses a backup whose payments do not line up with the roster', () => {
    const bad = backup()
    bad.rounds[0].payments = { 1: true, 9: false }
    expect(() => buildImportPlan(bad, { contribution: 40 })).toThrow(/not on the roster/)
  })

  it('requires a contribution instead of assuming one', () => {
    expect(() => buildImportPlan(backup())).toThrow(/Contribution is required/)
  })

  it('inspects counts without names or phones', () => {
    const info = inspectBackup(backup())
    expect(info).toMatchObject({ memberCount: 2, roundCount: 2, paymentCount: 4, paidCount: 3, startDate: '2025-03-07' })
    expect(JSON.stringify(info)).not.toContain('Ada')
    expect(JSON.stringify(info)).not.toContain(PHONE)
  })
})

describe('writeImport', () => {
  it('inserts one archived cycle and refuses a second import with the same start date', async () => {
    const fake = installFakeSupabase()
    const plan = buildImportPlan(backup(), { contribution: 40, now: '2026-01-01T00:00:00.000Z', token: sequentialTokens() })
    const summary = await writeImport(fake, plan)

    expect(summary).toEqual({ cycleId: expect.any(String), members: 2, rounds: 2, payments: 4, paid: 3 })
    expect(formatImportSummary(summary)).toBe('members: 2\nrounds: 2\npayments: 4\npaid: 3')
    expect(formatImportSummary({ ...summary, display_first_name: 'Ada', phone: PHONE })).not.toContain('Ada')
    expect(formatImportSummary({ ...summary, phone: PHONE })).not.toContain(PHONE)
    expect(fake.tables.cycles).toHaveLength(1)
    expect(fake.tables.cycles[0].status).toBe('archived')
    expect(fake.tables.payments).toHaveLength(4)
    expect(fake.tables.reminder_templates).toHaveLength(6)
    expect(fake.tables.reminder_templates.some(row => row.body.includes('today'))).toBe(true)
    expect(JSON.stringify(fake.tables.reminder_templates)).not.toMatch(/\d{10}/)

    await expect(writeImport(fake, plan)).rejects.toThrow(/start date already exists/)
    expect(fake.tables.cycles).toHaveLength(1)
  })

  it('rolls the cycle back when a later insert fails', async () => {
    const fake = installFakeSupabase({ failOn: (table, op) => table === 'payments' && op === 'insert' })
    const plan = buildImportPlan(backup(), { contribution: 25, token: sequentialTokens() })
    await expect(writeImport(fake, plan)).rejects.toThrow(/Nothing was saved/)
    expect(fake.tables.cycles).toHaveLength(0)
    expect(fake.tables.members).toHaveLength(0)
    expect(fake.tables.rounds).toHaveLength(0)
  })
})

describe('useCycleStore import and cycle switch', () => {
  it('selects the imported archive and can switch back to the active cycle', async () => {
    const fake = installFakeSupabase({ db: seedCycle({ names: ['Ada', 'Bea'], name: 'Current', contribution: 30 }) })
    const hook = renderHook(() => useCycleStore())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))

    await act(() => hook.result.current.importBackup(JSON.stringify(backup()), { contribution: 40 }))

    expect(hook.result.current.store.config).toMatchObject({ name: 'Tanda 2025', status: 'archived', contribution: 40 })
    expect(hook.result.current.store.rounds).toHaveLength(2)
    expect(hook.result.current.store.participants.map(p => p.name)).toEqual(['Ada', 'Bea'])
    expect(hook.result.current.cycles.map(c => c.status).sort()).toEqual(['active', 'archived'])

    const active = fake.tables.cycles.find(c => c.status === 'active')
    await act(() => hook.result.current.selectCycle(active.id))
    expect(hook.result.current.store.config.name).toBe('Current')
  })

  it('shows an archived cycle when none is active', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], name: 'Finished' })
    db.cycles[0].status = 'archived'
    installFakeSupabase({ db })
    const hook = renderHook(() => useCycleStore())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.store.config).toMatchObject({ name: 'Finished', status: 'archived' })
  })
})

function Loaded() {
  const { store } = useStore()
  return store ? <AdminDashboard email="admin@example.com" /> : null
}

describe('archived history and personal links', () => {
  it('lists the final round in History for an archived cycle', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], name: 'Finished', startDate: '2027-06-04', contribution: 40 })
    db.cycles[0].status = 'archived'
    installFakeSupabase({ db })
    const user = userEvent.setup()
    render(<StoreProvider><Loaded /></StoreProvider>)

    await user.click(await screen.findByText('History'))

    expect(screen.getByText('Round 1')).toBeTruthy()
    expect(screen.getByText('Round 2')).toBeTruthy()
    expect(screen.getByText(/Archived cycle/)).toBeTruthy()
  })

  it('copies and regenerates a personal link without showing the token', async () => {
    const fake = installFakeSupabase({ db: seedCycle({ names: ['Ada', 'Bea'], contribution: 40 }) })
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<StoreProvider><Loaded /></StoreProvider>)

    await user.click(await screen.findByText('Roster'))
    expect(screen.queryByText('test-token-1')).toBeNull()
    await user.click(screen.getAllByText('Copy personal link')[0])
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/m\/test-token-1$/))

    await user.click(screen.getAllByText('Regenerate link')[0])
    await waitFor(() => {
      expect(fake.tables.members.find(m => m.slot === 1).access_token).not.toBe('test-token-1')
    })
    const next = fake.tables.members.find(m => m.slot === 1).access_token
    expect(screen.queryByText(next)).toBeNull()
    expect(screen.queryByText('test-token-1')).toBeNull()
  })
})

function sequentialTokens() {
  let n = 0
  return () => `token-test-${String(++n).padStart(8, '0')}`
}

describe('import-backup script', () => {
  it('prints a safe error and no personal data when the service key is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tanda-import-'))
    const file = join(dir, 'backup.json')
    writeFileSync(file, JSON.stringify(backup()))
    const result = spawnSync(process.execPath, ['scripts/import-backup.mjs', file, '--contribution', '40'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: 'utf8',
    })
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(output).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(output).not.toContain('Ada')
    expect(output).not.toContain('Lovelace')
    expect(output).not.toContain(PHONE)
    expect(output).not.toContain(PIN)
    expect(output).not.toContain(GITHUB_TOKEN)
  })
})
