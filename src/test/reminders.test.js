// Phase 4 reminder logic (supabase/functions/_shared/reminders.js). Fake names and 555-01xx phones only.
import { describe, it, expect, vi } from 'vitest'
import {
  localClock, dueWindow, activeReminderWindow, recipients, renderMessage, isDryRun, optOutAction, toE164,
  twilioSignature, verifyTwilioSignature, runReminders, timingSafeEqual,
  resolveChannel, reminderAction, dispatchReminder, planReminderQueue,
} from '../../supabase/functions/_shared/reminders.js'

describe('timingSafeEqual (cron secret and Twilio signature)', () => {
  it('matches only identical strings, including different lengths and empties', () => {
    expect(timingSafeEqual('test-cron-secret', 'test-cron-secret')).toBe(true)
    expect(timingSafeEqual('test-cron-secret', 'test-cron-secreT')).toBe(false)
    expect(timingSafeEqual('test-cron-secret', 'test-cron-secret-longer')).toBe(false)
    expect(timingSafeEqual('', 'test-cron-secret')).toBe(false)
    expect(timingSafeEqual(null, '')).toBe(true) // the function also requires CRON_SECRET to be set
  })
})

// Collection is Friday 2026-11-20 (PST, UTC-8) and Friday 2026-07-10 (PDT, UTC-7).
const round = { id: 'r1', round_number: 3, collect_date: '2026-11-20' }
const at = iso => localClock(new Date(iso))

describe('window selection in Los Angeles time', () => {
  it('Thursday 9:00 is thursday_all, in standard and daylight time', () => {
    expect(dueWindow(at('2026-11-19T17:00:00Z'), round)).toBe('thursday_all')
    expect(dueWindow(localClock(new Date('2026-07-09T16:00:00Z')), { ...round, collect_date: '2026-07-10' })).toBe('thursday_all')
  })
  it('Friday 12:00 and 18:00 are the unpaid windows', () => {
    expect(dueWindow(at('2026-11-20T20:00:00Z'), round)).toBe('friday_noon')
    expect(dueWindow(at('2026-11-21T02:00:00Z'), round)).toBe('friday_evening') // 18:00 Fri in LA, already Sat in UTC
  })
  it('any other hour or day is not a window', () => {
    expect(dueWindow(at('2026-11-19T18:00:00Z'), round)).toBeNull() // Thu 10:00
    expect(dueWindow(at('2026-11-20T17:00:00Z'), round)).toBeNull() // Fri 09:00
    expect(dueWindow(at('2026-11-18T17:00:00Z'), round)).toBeNull() // Wed 09:00
    expect(dueWindow(at('2026-11-19T09:00:00Z'), round)).toBeNull() // Thu 09:00 UTC is Thu 01:00 in LA
  })
  it('follows the cycle reminder_settings times', () => {
    expect(dueWindow(at('2026-11-19T18:00:00Z'), round, { thursday_all_at: '10:00' })).toBe('thursday_all')
  })
  it('keeps the latest opened window so the list can be finished after the hour', () => {
    expect(activeReminderWindow(at('2026-11-19T16:00:00Z'), round)).toBeNull() // Thu 08:00
    expect(activeReminderWindow(at('2026-11-19T17:00:00Z'), round)).toBe('thursday_all')
    expect(activeReminderWindow(at('2026-11-19T18:00:00Z'), round)).toBe('thursday_all') // Thu 10:00, past the exact hour
    expect(activeReminderWindow(at('2026-11-20T17:00:00Z'), round)).toBe('thursday_all') // Fri 09:00
    expect(activeReminderWindow(at('2026-11-20T20:00:00Z'), round)).toBe('friday_noon')
    expect(activeReminderWindow(at('2026-11-20T21:00:00Z'), round)).toBe('friday_noon') // Fri 13:00
    expect(activeReminderWindow(at('2026-11-21T02:00:00Z'), round)).toBe('friday_evening')
    expect(activeReminderWindow(at('2026-11-21T18:00:00Z'), round)).toBeNull()
  })
})

const members = [
  { id: 'm1', display_first_name: 'Ada', phone: '(555) 010-0001' },
  { id: 'm2', display_first_name: 'Bea', phone: '555-010-0002' },
  { id: 'm3', display_first_name: 'Cal', phone: '5550100003' },
  { id: 'm4', display_first_name: 'Dee', phone: '' },
  { id: 'm5', display_first_name: 'Eve', phone: '5550100005', removed_at: '2026-11-01T00:00:00Z' },
  { id: 'm6', display_first_name: 'Fay', phone: '5550100006' }, // no payment row this round
]
const payments = [
  { round_id: 'r1', member_id: 'm1', paid_at: '2026-11-19T20:00:00Z' },
  { round_id: 'r1', member_id: 'm2', paid_at: null },
  { round_id: 'r1', member_id: 'm3', paid_at: null },
  { round_id: 'r1', member_id: 'm4', paid_at: null },
  { round_id: 'r1', member_id: 'm5', paid_at: null },
]
const names = list => list.map(item => item.member.display_first_name)

describe('who gets texted', () => {
  it('Thursday texts every payer with a phone, paid or not', () => {
    const { send, skipped } = recipients({ window: 'thursday_all', round, members, payments, optedOut: new Set() })
    expect(names(send)).toEqual(['Ada', 'Bea', 'Cal'])
    expect(skipped.map(s => [s.member.display_first_name, s.reason])).toEqual([['Dee', 'no_phone']])
  })
  it('Friday texts unpaid members only', () => {
    for (const window of ['friday_noon', 'friday_evening']) {
      const { send } = recipients({ window, round, members, payments, optedOut: new Set() })
      expect(names(send)).toEqual(['Bea', 'Cal'])
    }
  })
  it('skips opted-out phones', () => {
    const { send, skipped } = recipients({ window: 'friday_noon', round, members, payments, optedOut: new Set(['+15550100002']) })
    expect(names(send)).toEqual(['Cal'])
    expect(skipped.map(s => [s.member.display_first_name, s.reason])).toContainEqual(['Bea', 'opted_out'])
  })
  it('normalizes US numbers to E.164', () => {
    expect(toE164('(555) 010-0001')).toBe('+15550100001')
    expect(toE164('1-555-010-0001')).toBe('+15550100001')
    expect(toE164('12345')).toBeNull()
  })
})

describe('message text', () => {
  it('is English then Spanish, filled from the cycle template', () => {
    const templates = [
      { kind: 'friday_noon', lang: 'en', body: 'Hi {{firstName}}, send {{amount}} to {{zelle}}.' },
      { kind: 'friday_noon', lang: 'es', body: 'Hola {{firstName}}, envía {{amount}} a {{zelle}}.' },
    ]
    expect(renderMessage(templates, 'friday_noon', { firstName: 'Bea', amount: 150, zelle: 'org@example.com' }))
      .toBe('Hi Bea, send $150 to org@example.com.\n\nHola Bea, envía $150 a org@example.com.')
  })
  it('falls back to built-in bilingual text when a cycle has no templates', () => {
    const text = renderMessage([], 'thursday_all', { firstName: 'Ada', amount: 87.5 })
    expect(text).toMatch(/^Hi Ada, tanda collection is tomorrow\. Please send \$87\.50 by Zelle to the organizer/)
    expect(text).toMatch(/Hola Ada, el cobro de la tanda es mañana\. .*el organizador/)
  })
})

describe('STOP / opt-out', () => {
  it('recognizes Twilio and Spanish keywords only as the whole message', () => {
    for (const word of ['STOP', ' stop ', 'Unsubscribe', 'cancel', 'END', 'quit', 'ALTO', 'baja']) expect(optOutAction(word)).toBe('opt_out')
    for (const word of ['START', 'unstop', 'yes', 'sí']) expect(optOutAction(word)).toBe('opt_in')
    for (const word of ['please stop texting', 'hello', '']) expect(optOutAction(word)).toBeNull()
  })
  it('checks the Twilio signature and rejects a tampered request', async () => {
    const url = 'https://example.supabase.co/functions/v1/twilio-inbound'
    const params = { From: '+15550100002', Body: 'STOP', To: '+15550109999' }
    const header = await twilioSignature('test-auth-token', url, params)
    expect(await verifyTwilioSignature('test-auth-token', url, params, header)).toBe(true)
    expect(await verifyTwilioSignature('test-auth-token', url, { ...params, Body: 'START' }, header)).toBe(false)
    expect(await verifyTwilioSignature('other-token', url, params, header)).toBe(false)
    expect(await verifyTwilioSignature('test-auth-token', url, params, '')).toBe(false)
  })
})

function fakeLog() {
  const rows = []
  return {
    rows,
    optedOut: [],
    async claim(row) {
      const key = `${row.round_id}|${row.member_id}|${row.kind}|${row.dry_run}`
      if (rows.some(r => r.key === key)) return null
      const id = `log-${rows.length + 1}`
      rows.push({ ...row, key, id })
      return id
    },
    async finish(id, patch) { Object.assign(rows.find(r => r.id === id), patch) },
    async optOut(phone) { this.optedOut.push(phone) },
  }
}

const cycle = { id: 'c1', name: 'Demo Tanda', contribution: 150, zelle_destination: 'org@example.com' }
const fridayNoon = new Date('2026-11-20T20:00:00Z')
const data = settings => [{ cycle, settings, templates: [], rounds: [round], members, payments }]

describe('channel dispatcher', () => {
  it('defaults to queue and only calls Twilio when that channel is selected', async () => {
    const sendSms = vi.fn(async () => 'SM-test')
    expect(resolveChannel({})).toBe('queue')
    expect(resolveChannel({ channel: 'TWILIO' })).toBe('twilio')
    expect(resolveChannel({ channel: 'twilio' }, 'queue')).toBe('queue')
    expect(resolveChannel({ channel: 'sms' })).toBe('queue')
    await expect(dispatchReminder({ channel: 'queue', to: '+15550100002', body: 'Hi', sendSms })).resolves.toEqual({ channel: 'queue' })
    expect(sendSms).not.toHaveBeenCalled()
    await expect(dispatchReminder({ channel: 'twilio', to: '+15550100002', body: 'Hi', sendSms })).resolves.toEqual({ channel: 'twilio', sid: 'SM-test' })
    expect(sendSms).toHaveBeenCalledWith('+15550100002', 'Hi')
  })

  it('queues unless dry-run is explicit, and keeps Twilio off unless it is turned on', () => {
    expect(reminderAction({ channel: 'queue', enabled: true, hasDryRunEnv: true, dryRunEnv: undefined })).toBe('queue')
    expect(reminderAction({ channel: 'queue', enabled: true, hasDryRunEnv: true, dryRunEnv: 'true' })).toBe('dry_run')
    expect(reminderAction({ channel: 'twilio', enabled: true, hasDryRunEnv: true, dryRunEnv: undefined })).toBe('dry_run')
    expect(reminderAction({ channel: 'twilio', enabled: true, hasDryRunEnv: true, dryRunEnv: 'false' })).toBe('twilio')
    expect(reminderAction({ channel: 'queue', enabled: false, hasDryRunEnv: true })).toBe('dry_run')
  })
})

describe('manual reminder list', () => {
  it('builds the open window after the exact hour, unpaid members only', () => {
    const plan = planReminderQueue({
      now: new Date('2026-11-20T21:00:00Z'), // Fri 13:00 in Los Angeles, noon window still open
      cycle, settings: { enabled: true }, rounds: [round], members, payments, optedOut: new Set(),
    })
    expect(plan.window).toBe('friday_noon')
    expect(plan.rows.map(row => row.member_id)).toEqual(['m2', 'm3'])
    expect(plan.rows.every(row => row.kind === 'friday_noon')).toBe(true)
    const early = planReminderQueue({
      now: new Date('2026-11-19T16:00:00Z'), cycle, settings: {}, rounds: [round], members, payments, optedOut: new Set(),
    })
    expect(early).toMatchObject({ window: null, rows: [] })
  })
})

describe('runReminders', () => {
  it('dry run logs who would be texted and the window, and sends nothing', async () => {
    const log = fakeLog()
    const sendSms = vi.fn()
    const summary = await runReminders({ now: fridayNoon, dryRun: true, cycles: data({ enabled: true }), optedOut: new Set(), log, sendSms })

    expect(sendSms).not.toHaveBeenCalled()
    expect(summary).toEqual([expect.objectContaining({ window: 'friday_noon', round: 3, mode: 'dry_run', texted: ['Bea', 'Cal'] })])
    expect(log.rows.map(r => [r.member_id, r.kind, r.status, r.dry_run])).toEqual([
      ['m2', 'friday_noon', 'dry_run', true], ['m3', 'friday_noon', 'dry_run', true],
    ])
    expect(JSON.stringify(summary)).not.toMatch(/555/)
  })

  it('logs each member once per window even if the hourly job runs twice', async () => {
    const log = fakeLog()
    const first = await runReminders({ now: fridayNoon, dryRun: true, cycles: data(), optedOut: new Set(), log, sendSms: vi.fn() })
    const second = await runReminders({ now: fridayNoon, dryRun: true, cycles: data(), optedOut: new Set(), log, sendSms: vi.fn() })
    expect(first[0].texted).toEqual(['Bea', 'Cal'])
    expect(second[0].texted).toEqual([])
    expect(second[0].alreadyLogged).toEqual(['Bea', 'Cal'])
    expect(log.rows).toHaveLength(2)
  })

  it('stays a dry run while the cycle has reminders turned off, even with live sending on', async () => {
    const sendSms = vi.fn()
    const summary = await runReminders({ now: fridayNoon, dryRun: false, cycles: data({ enabled: false }), optedOut: new Set(), log: fakeLog(), sendSms })
    expect(sendSms).not.toHaveBeenCalled()
    expect(summary[0].mode).toBe('dry_run')
  })

  it('live mode texts unpaid members, skips opted-out ones, and records a Twilio unsubscribe', async () => {
    const log = fakeLog()
    const sendSms = vi.fn(async to => {
      if (to === '+15550100003') throw Object.assign(new Error('unsubscribed'), { code: 21610 })
      return 'SM-test-1'
    })
    const summary = await runReminders({
      now: fridayNoon, dryRun: false, cycles: data({ enabled: true, channel: 'twilio' }), optedOut: new Set(), log, sendSms,
    })
    expect(sendSms).toHaveBeenCalledTimes(2)
    expect(sendSms.mock.calls[0][0]).toBe('+15550100002')
    expect(sendSms.mock.calls[0][1]).toMatch(/^Hi Bea, .*\$150.*\n\nHola Bea, /s)
    expect(summary[0]).toMatchObject({ mode: 'live', texted: ['Bea'], failed: ['Cal'] })
    expect(log.optedOut).toEqual(['+15550100003'])
    expect(log.rows.map(r => r.status)).toEqual(['sent', 'failed'])

    const again = await runReminders({
      now: fridayNoon, dryRun: false, cycles: data({ enabled: true, channel: 'twilio' }), optedOut: new Set(['+15550100003']), log, sendSms,
    })
    expect(sendSms).toHaveBeenCalledTimes(2) // nothing new: Bea already sent, Cal now opted out
    expect(again[0].skipped).toContain('Cal (opted_out)')
  })

  it('stops texting a number in the same run once Twilio says it is unsubscribed', async () => {
    // Two members share one fake phone; the first send comes back as 21610.
    const shared = [
      { id: 's1', display_first_name: 'Gil', phone: '5550100007' },
      { id: 's2', display_first_name: 'Hal', phone: '555-010-0007' },
    ]
    const sharedPayments = [
      { round_id: 'r1', member_id: 's1', paid_at: null },
      { round_id: 'r1', member_id: 's2', paid_at: null },
    ]
    const optedOut = new Set()
    const sendSms = vi.fn(async () => { throw Object.assign(new Error('unsubscribed'), { code: 21610 }) })
    const summary = await runReminders({
      now: fridayNoon, dryRun: false, optedOut, log: fakeLog(), sendSms,
      cycles: [{ cycle, settings: { enabled: true, channel: 'twilio' }, templates: [], rounds: [round], members: shared, payments: sharedPayments }],
    })
    expect(sendSms).toHaveBeenCalledTimes(1)
    expect(optedOut.has('+15550100007')).toBe(true)
    expect(summary[0]).toMatchObject({ failed: ['Gil'], texted: [], skipped: ['Hal (opted_out)'] })
  })

  it('queue mode writes one queued row per recipient and does not double-queue or text', async () => {
    const log = fakeLog()
    const sendSms = vi.fn()
    const first = await runReminders({
      now: fridayNoon, dryRun: false, cycles: data({ enabled: true }), optedOut: new Set(), log, sendSms,
    })
    const second = await runReminders({
      now: fridayNoon, dryRun: false, cycles: data({ enabled: true }), optedOut: new Set(), log, sendSms,
    })
    expect(sendSms).not.toHaveBeenCalled()
    expect(first[0]).toMatchObject({ mode: 'queue', channel: 'queue', queued: ['Bea', 'Cal'], texted: [] })
    expect(second[0].queued).toEqual([])
    expect(second[0].alreadyLogged).toEqual(['Bea', 'Cal'])
    expect(log.rows).toHaveLength(2)
    expect(log.rows.map(row => [row.status, row.channel, row.dry_run])).toEqual([
      ['queued', 'queue', false],
      ['queued', 'queue', false],
    ])
    expect(JSON.stringify(first)).not.toMatch(/555/)
  })

  it('with the secrets unset, the queue is live and Twilio stays a dry run', async () => {
    const sendSms = vi.fn(async () => 'SM-test')
    const log = fakeLog()
    const queued = await runReminders({
      now: fridayNoon, hasDryRunEnv: true, dryRunEnv: undefined, dryRun: true,
      cycles: data({ enabled: true }), optedOut: new Set(), log, sendSms,
    })
    expect(queued[0].mode).toBe('queue')
    expect(log.rows.map(row => row.status)).toEqual(['queued', 'queued'])
    expect(sendSms).not.toHaveBeenCalled()

    const preview = await runReminders({
      now: fridayNoon, hasDryRunEnv: true, dryRunEnv: undefined,
      cycles: data({ enabled: true, channel: 'twilio' }), optedOut: new Set(), log: fakeLog(), sendSms,
    })
    expect(preview[0].mode).toBe('dry_run')
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('does nothing outside a window', async () => {
    const summary = await runReminders({ now: new Date('2026-11-20T18:00:00Z'), dryRun: true, cycles: data(), optedOut: new Set(), log: fakeLog(), sendSms: vi.fn() })
    expect(summary).toEqual([])
  })

  it('treats anything but "false" as dry run', () => {
    expect(isDryRun(undefined)).toBe(true)
    expect(isDryRun('true')).toBe(true)
    expect(isDryRun('FALSE')).toBe(false)
    expect(isDryRun(' false ')).toBe(false)
  })
})
