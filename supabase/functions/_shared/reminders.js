// Shared reminder logic for the send-reminders and twilio-inbound Edge Functions (Deno)
// and the Vitest tests (Node). Plain JavaScript with no imports so both runtimes load it.
//
// Windows, all in the cycle's time zone (America/Los_Angeles by default):
//   thursday_all   – the day before a round's collection date, at reminder_settings.thursday_all_at (09:00)
//   friday_noon    – collection day, at friday_noon_at (12:00), unpaid members only
//   friday_evening – collection day, at friday_evening_at (16:30), unpaid members only
// The 6 PM collection deadline stays 18:00. The last call goes out at 4:30 PM so people
// still have time to send. pg_cron runs at :00 and :30 UTC; this check matches the local
// hour and minute, so daylight saving needs no special handling.

export const WINDOWS = ['thursday_all', 'friday_noon', 'friday_evening']

export const DEFAULT_SETTINGS = {
  timezone: 'America/Los_Angeles',
  thursday_all_at: '09:00',
  friday_noon_at: '12:00',
  friday_evening_at: '16:30',
  enabled: false,
}

// Used when a cycle has no reminder_templates rows (cycles made with the create form).
export const DEFAULT_TEMPLATES = {
  thursday_all: {
    en: 'Hi {{firstName}}, friendly reminder that Tanda collection is tomorrow. Please send {{amount}} to {{zelle}} via Zelle. Thank you!',
    es: 'Hola {{firstName}}, te recordamos que el cobro de la tanda es mañana. Por favor envía {{amount}} {{toZelleEs}} por Zelle. ¡Gracias!',
  },
  friday_noon: {
    en: 'Hi {{firstName}}, friendly reminder that Tanda collection is today and closes at 6 PM. Please send {{amount}} to {{zelle}} via Zelle. Thank you!',
    es: 'Hola {{firstName}}, te recordamos que el cobro de la tanda es hoy y cierra a las 6 PM. Por favor envía {{amount}} {{toZelleEs}} por Zelle. ¡Gracias!',
  },
  friday_evening: {
    en: 'Hi {{firstName}}, last friendly reminder that Tanda collection closes at 6 PM today. Please send {{amount}} to {{zelle}} via Zelle as soon as you can. Thank you!',
    es: 'Hola {{firstName}}, último recordatorio: el cobro de la tanda cierra hoy a las 6 PM. Por favor envía {{amount}} {{toZelleEs}} por Zelle lo antes posible. ¡Gracias!',
  },
}

// Twilio's standard opt-out and opt-in keywords, plus common Spanish ones. Twilio matches a
// keyword only when it is the whole message (case and surrounding spaces ignored).
export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE', 'ALTO', 'PARAR', 'BAJA']
export const START_WORDS = ['START', 'YES', 'UNSTOP', 'SI', 'SÍ']

// Wall-clock date, hour, and minute in a time zone. now is a Date.
export function localClock(now, timeZone = DEFAULT_SETTINGS.timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now)
  const get = type => parts.find(p => p.type === type)?.value
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour, minute }
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// '16:30' or '16:30:00' → minutes since midnight. The cron fires on the minute, not just the hour.
function timeMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time).trim())
  if (!match) return NaN
  return Number(match[1]) * 60 + Number(match[2])
}

function clockMinutes(clock) {
  return clock.hour * 60 + (Number(clock.minute) || 0)
}

// Which window, if any, is due for this round at this local clock time.
export function dueWindow(clock, round, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  const nowMin = clockMinutes(clock)
  if (clock.date === addDaysIso(round.collect_date, -1) && nowMin === timeMinutes(s.thursday_all_at)) {
    return 'thursday_all'
  }
  if (clock.date === round.collect_date) {
    if (nowMin === timeMinutes(s.friday_noon_at)) return 'friday_noon'
    if (nowMin === timeMinutes(s.friday_evening_at)) return 'friday_evening'
  }
  return null
}

// US-style numbers to E.164: 10 digits → +1…, 11 digits starting with 1 → +1…, else null.
export function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// Who to text for a window. Payers are active members with a payment row in the round (N9);
// Friday windows keep only those who have not paid. Opted-out and phoneless members are skipped.
export function recipients({ window, round, members, payments, optedOut }) {
  const rows = payments.filter(p => p.round_id === round.id)
  const send = []
  const skipped = []
  for (const member of members) {
    if (member.removed_at) continue
    const row = rows.find(p => p.member_id === member.id)
    if (!row) continue
    // The recipient's contribution is waived. Never text them, paid or not.
    if ((round.recipient_member_id && member.id === round.recipient_member_id) || row.source === 'auto_recipient') {
      skipped.push({ member, reason: 'recipient' })
      continue
    }
    if (window !== 'thursday_all' && row.paid_at) continue
    const to = toE164(member.phone)
    if (!to) skipped.push({ member, reason: 'no_phone' })
    else if (optedOut.has(to)) skipped.push({ member, reason: 'opted_out' })
    else send.push({ member, to })
  }
  return { send, skipped }
}

function money(amount) {
  const n = Number(amount) || 0
  return Number.isInteger(n)
    ? `$${n.toLocaleString('en-US')}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ''))
}

// One text with English first, then Spanish.
export function renderMessage(templates, kind, { firstName, amount, zelle }) {
  const pick = lang => templates.find(t => t.kind === kind && t.lang === lang)?.body || DEFAULT_TEMPLATES[kind][lang]
  // {{amountEs}} reads "200 dólares"; {{toZelleEs}} is "a <zelle>" or "al organizador".
  const saved = String(zelle || '').trim()
  const amountEs = `${money(amount).slice(1)} dólares`
  const vars = { firstName: firstName || '', amount: money(amount), amountEs, zelle: saved || 'the organizer', toZelleEs: saved ? `a ${saved}` : 'al organizador' }
  const esVars = { ...vars, zelle: saved || 'el organizador' }
  return `${fill(pick('en'), vars)}\n\n${fill(pick('es'), esVars)}`
}

export function isDryRun(value) {
  return String(value ?? '').trim().toLowerCase() !== 'false'
}

export function optOutAction(body) {
  const word = String(body || '').trim().toUpperCase()
  if (STOP_WORDS.includes(word)) return 'opt_out'
  if (START_WORDS.includes(word)) return 'opt_in'
  return null
}

// Twilio's request signature: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)).
export async function twilioSignature(authToken, url, params) {
  const data = url + Object.keys(params).sort().map(key => key + params[key]).join('')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  let binary = ''
  for (const byte of new Uint8Array(sig)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Compares two secrets without stopping at the first different character.
export function timingSafeEqual(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0)
  return diff === 0
}

export async function verifyTwilioSignature(authToken, url, params, header) {
  if (!authToken || !header) return false
  return timingSafeEqual(await twilioSignature(authToken, url, params), header)
}

// queue is the default and sends nothing. twilio is the old paid path, off unless chosen.
export function resolveChannel(settings, override) {
  const forced = String(override ?? '').trim().toLowerCase()
  const raw = forced || String(settings?.channel ?? '').trim().toLowerCase() || 'queue'
  return raw === 'twilio' ? 'twilio' : 'queue'
}

// What this cycle should do for a due window.
// hasDryRunEnv matches the Edge Function: the queue runs unless REMINDERS_DRY_RUN=true,
// and Twilio stays a dry run unless that secret is "false". Tests that only pass dryRun
// keep the older switch (false means perform the channel's action).
export function reminderAction({ channel = 'queue', enabled = false, dryRun = true, dryRunEnv, hasDryRunEnv = false } = {}) {
  const resolved = resolveChannel({ channel })
  if (enabled !== true) return 'dry_run'
  if (hasDryRunEnv) {
    if (resolved === 'twilio') return isDryRun(dryRunEnv) ? 'dry_run' : 'twilio'
    return String(dryRunEnv ?? '').trim().toLowerCase() === 'true' ? 'dry_run' : 'queue'
  }
  if (dryRun !== false) return 'dry_run'
  return resolved
}

// Replaying { "now": ISO } is only for an explicit dry run, or Twilio's default dry run.
export function allowReminderReplay(channel, dryRunEnv) {
  if (String(dryRunEnv ?? '').trim().toLowerCase() === 'true') return true
  return resolveChannel({}, channel) === 'twilio' && isDryRun(dryRunEnv)
}

// The window that has already opened for this round and has not been replaced by the next one.
// dueWindow is the exact hour the cron writes rows. This stays open afterwards so the admin
// can still work the list, or build it by hand if that hour was missed.
export function activeReminderWindow(clock, round, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  const dayBefore = addDaysIso(round.collect_date, -1)
  const nowMin = clockMinutes(clock)
  if (clock.date === dayBefore) return nowMin >= timeMinutes(s.thursday_all_at) ? 'thursday_all' : null
  if (clock.date === round.collect_date) {
    if (nowMin >= timeMinutes(s.friday_evening_at)) return 'friday_evening'
    if (nowMin >= timeMinutes(s.friday_noon_at)) return 'friday_noon'
    return 'thursday_all'
  }
  return null
}

export function openReminder(clock, rounds, settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) }
  const round = [...(rounds || [])]
    .filter(item => item?.collect_date && activeReminderWindow(clock, item, s))
    .sort((a, b) => String(a.collect_date).localeCompare(String(b.collect_date))
      || (a.round_number || 0) - (b.round_number || 0))[0]
  if (!round) return { window: null, round: null }
  return { window: activeReminderWindow(clock, round, s), round }
}

// Rows the manual "Build reminder list now" button inserts. Same people as the cron.
export function planReminderQueue({ now, cycle, settings, rounds, members, payments, optedOut }) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) }
  const clock = localClock(now, s.timezone)
  const { window, round } = openReminder(clock, rounds, s)
  if (!window || !round) return { window: null, localDate: clock.date, rows: [] }
  const { send } = recipients({ window, round, members, payments, optedOut: optedOut || new Set() })
  return {
    window,
    localDate: clock.date,
    roundId: round.id,
    rows: send.map(({ member }) => ({
      cycle_id: cycle.id,
      round_id: round.id,
      member_id: member.id,
      kind: window,
      local_date: clock.date,
    })),
  }
}

// Channel dispatcher. queue returns without calling out. twilio uses sendSms.
export async function dispatchReminder({ channel, to, body, sendSms }) {
  const resolved = resolveChannel({}, channel)
  if (resolved !== 'twilio') return { channel: 'queue' }
  if (typeof sendSms !== 'function') {
    throw Object.assign(new Error('Twilio sender is not configured'), { code: 'config' })
  }
  const sid = await sendSms(to, body)
  return { channel: 'twilio', sid }
}

// One run of the hourly job.
//   cycles:  [{ cycle, settings, templates, rounds, members, payments }] for active cycles
//   optedOut: Set of E.164 phones
//   log.claim(row) → id when this member/window/round/mode is new, null when already logged
//   log.finish(id, { status, twilio_sid, error }); log.optOut(phone)
//   sendSms(to, body) → Twilio message SID; throws an error with .code on failure
//   channel: optional REMINDER_CHANNEL override ("twilio" or "queue")
// Queue is the default: one reminder_log row per recipient, status queued, no external send.
// Twilio runs only when the channel is twilio and that path is not in dry run.
// A cycle with reminder_settings.enabled not true stays a dry run either way.
// Returns a summary with first names only (no phones) for the function log.
export async function runReminders({
  now, dryRun, dryRunEnv, hasDryRunEnv = false, channel: channelOverride, cycles, optedOut, log, sendSms,
}) {
  const summary = []
  for (const { cycle, settings, templates, rounds, members, payments } of cycles) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) }
    const clock = localClock(now, s.timezone)
    const channel = resolveChannel(s, channelOverride)
    const action = reminderAction({
      channel, enabled: s.enabled === true, dryRun, dryRunEnv, hasDryRunEnv,
    })
    for (const round of rounds) {
      const window = dueWindow(clock, round, s)
      if (!window) continue
      const { send, skipped } = recipients({ window, round, members, payments, optedOut })
      const entry = {
        cycle: cycle.name, round: round.round_number, window, localDate: clock.date, channel,
        mode: action === 'twilio' ? 'live' : action, texted: [], queued: [], alreadyLogged: [], failed: [],
        skipped: skipped.map(({ member, reason }) => `${member.display_first_name} (${reason})`),
      }
      for (const { member, to } of send) {
        // Re-check: an earlier send in this run may have just found this number unsubscribed.
        if (optedOut.has(to)) { entry.skipped.push(`${member.display_first_name} (opted_out)`); continue }
        const id = await log.claim({
          cycle_id: cycle.id, round_id: round.id, member_id: member.id, kind: window,
          local_date: clock.date, dry_run: action === 'dry_run', channel,
          status: action === 'queue' ? 'queued' : action === 'twilio' ? 'sending' : 'dry_run',
        })
        if (!id) { entry.alreadyLogged.push(member.display_first_name); continue }
        if (action === 'dry_run') { entry.texted.push(member.display_first_name); continue }
        if (action === 'queue') { entry.queued.push(member.display_first_name); continue }
        const body = renderMessage(templates || [], window, {
          firstName: member.display_first_name, amount: cycle.contribution, zelle: cycle.zelle_destination,
        })
        try {
          const result = await dispatchReminder({ channel: 'twilio', to, body, sendSms })
          await log.finish(id, { status: 'sent', twilio_sid: result.sid })
          entry.texted.push(member.display_first_name)
        } catch (error) {
          // 21610: Twilio already has this number as unsubscribed. Record it so we stop trying.
          if (String(error?.code) === '21610') {
            optedOut.add(to) // honor it for the rest of this run too (e.g. two members sharing a phone)
            await log.optOut(to)
          }
          await log.finish(id, { status: 'failed', error: String(error?.code || error?.message || error) })
          entry.failed.push(member.display_first_name)
        }
      }
      summary.push(entry)
    }
  }
  return summary
}
