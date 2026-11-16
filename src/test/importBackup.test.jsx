import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { render, screen, renderHook, waitFor, act, fireEvent } from '@testing-library/react'
import {
  buildImportPlan,
  formatImportSummary,
  inspectBackup,
  writeImport,
} from '../utils/importBackup'
import { isWholeCents } from '../utils/money'
import { installFakeSupabase, seedCycle, adminSession } from './fakeSupabase'
import { useCycleStore } from '../hooks/useCycleStore'
import { StoreProvider, useStore } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'
import AdminGate from '../components/admin/AdminGate'

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

  it('requires a contribution in whole cents', () => {
    expect(() => buildImportPlan(backup())).toThrow(/whole cents/)
    expect(() => buildImportPlan(backup(), { contribution: 87.555 })).toThrow(/whole cents/)
    expect(() => buildImportPlan(backup(), { contribution: 1e8 })).toThrow(/whole cents/)
    expect(isWholeCents(99999999.99)).toBe(true)
    expect(isWholeCents(1e8)).toBe(false)
    expect(buildImportPlan(backup(), { contribution: 10.5, now: '2026-01-01T00:00:00.000Z', token: sequentialTokens() }).cycle.contribution).toBe(10.5)
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

  it('writes through one import_cycle call, not table by table', async () => {
    const fake = installFakeSupabase()
    const plan = buildImportPlan(backup(), { contribution: 40, token: sequentialTokens() })
    await writeImport(fake, plan)

    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.rpc.mock.calls[0][0]).toBe('import_cycle')
    expect(fake.rpc.mock.calls[0][1].p_plan.reminder_templates).toHaveLength(6)
    // The only direct table call is the read-only duplicate start-date check.
    expect(fake.from.mock.calls.map(([table]) => table)).toEqual(['cycles'])
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

  it('shows an archived cycle and still offers New cycle', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], name: 'Finished', contribution: 40 })
    db.cycles[0].status = 'archived'
    installFakeSupabase({ session: adminSession, isAdmin: true, db })
    render(<AdminGate />)

    expect(await screen.findByText('Finished')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('button', { name: 'New cycle' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getAllByRole('button', { name: 'Pending' })[0]).toBeDisabled()
  })
})

describe('archive then create', () => {
  it('asks in both languages, then unlocks New cycle', async () => {
    installFakeSupabase({
      session: adminSession,
      isAdmin: true,
      db: seedCycle({ names: ['Ada', 'Bea'], name: 'Current', contribution: 40 }),
    })
    const user = userEvent.setup()
    render(<AdminGate />)

    expect(await screen.findByText('Current')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('button', { name: 'New cycle' })).toBeDisabled()
    expect(screen.getByText(/Archiva el ciclo activo/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Archive this cycle?')).toBeTruthy()
    expect(screen.getByText('¿Archivar este ciclo?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Archive cycle' }))

    expect(await screen.findByText(/Archived cycle/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New cycle' })).toBeEnabled()
  })
})

describe('import then create', () => {
  it('imports an archived cycle and then creates an active one', async () => {
    const fake = installFakeSupabase({ session: adminSession, isAdmin: true })
    const user = userEvent.setup()
    render(<AdminGate />)

    await user.click(await screen.findByText('Import a backup instead'))
    const file = new File([JSON.stringify(backup())], 'tanda-backup.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Backup file'), file)
    await user.type(screen.getByLabelText('Contribution per person'), '40')
    await user.click(screen.getByText('Import as archived cycle'))

    expect(await screen.findByText('Tanda 2025')).toBeTruthy()
    expect(fake.tables.cycles.map(c => c.status)).toEqual(['archived'])

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'New cycle' }))
    await user.type(screen.getByLabelText('Cycle name'), 'Next Tanda')
    fireEvent.change(screen.getByLabelText('First collection date'), { target: { value: '2027-04-02' } })
    await user.type(screen.getByLabelText('Contribution per person ($)'), '40')
    await user.type(screen.getByLabelText('Member 1 first name'), 'Ada')
    await user.type(screen.getByLabelText('Member 2 first name'), 'Bea')
    await user.click(screen.getByText('Create cycle'))

    expect(await screen.findByText('Next Tanda')).toBeTruthy()
    expect(fake.tables.cycles.map(c => c.status).sort()).toEqual(['active', 'archived'])
    expect(screen.getByText('Round 1 of 2')).toBeTruthy()
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

    await user.click(await screen.findByRole('button', { name: 'Schedule' }))

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

    await user.click(await screen.findByRole('button', { name: 'Members' }))
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
