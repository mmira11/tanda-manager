// Shared reminder logic for the send-reminders and twilio-inbound Edge Functions (Deno)
// and the Vitest tests (Node). Plain JavaScript with no imports so both runtimes load it.
//
// Windows, all in the cycle's time zone (America/Los_Angeles by default):
//   thursday_all   – the day before a round's collection date, at reminder_settings.thursday_all_at (09:00)
//   friday_noon    – collection day, at friday_noon_at (12:00), unpaid members only
//   friday_evening – collection day, at friday_evening_at (18:00), unpaid members only
// pg_cron calls the function every hour on the hour (UTC); the window check here is what
// pins the sends to Los Angeles time, so daylight saving needs no special handling.

export const WINDOWS = ['thursday_all', 'friday_noon', 'friday_evening']

export const DEFAULT_SETTINGS = {
  timezone: 'America/Los_Angeles',
  thursday_all_at: '09:00',
  friday_noon_at: '12:00',
  friday_evening_at: '18:00',
  enabled: false,
}

// Used when a cycle has no reminder_templates rows (cycles made with the create form).
export const DEFAULT_TEMPLATES = {
  thursday_all: {
    en: 'Hi {{firstName}}, tanda collection is tomorrow. Please send {{amount}} by Zelle to {{zelle}}. Thank you!',
    es: 'Hola {{firstName}}, el cobro de la tanda es mañana. Por favor envía {{amount}} por Zelle a {{zelle}}. ¡Gracias!',
  },
  friday_noon: {
    en: 'Hi {{firstName}}, tanda collection is today and closes at 6 PM. Please send {{amount}} by Zelle to {{zelle}}.',
    es: 'Hola {{firstName}}, el cobro de la tanda es hoy y cierra a las 6 PM. Por favor envía {{amount}} por Zelle a {{zelle}}.',
  },
  friday_evening: {
    en: 'Hi {{firstName}}, last call: tanda collection closes now. Please send {{amount}} by Zelle to {{zelle}}.',
    es: 'Hola {{firstName}}, último aviso: el cobro de la tanda cierra ahora. Por favor envía {{amount}} por Zelle a {{zelle}}.',
  },
}

// Twilio's standard opt-out and opt-in keywords, plus common Spanish ones. Twilio matches a
// keyword only when it is the whole message (case and surrounding spaces ignored).
export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE', 'ALTO', 'PARAR', 'BAJA']
export const START_WORDS = ['START', 'YES', 'UNSTOP', 'SI', 'SÍ']

// Wall-clock date and hour in a time zone. now is a Date.
export function localClock(now, timeZone = DEFAULT_SETTINGS.timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(now)
  const get = type => parts.find(p => p.type === type)?.value
  const hour = Number(get('hour')) % 24
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour }
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function hourOf(time) {
  return Number(String(time).slice(0, 2))
}

// Which window, if any, is due for this round at this local clock time.
export function dueWindow(clock, round, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  if (clock.date === addDaysIso(round.collect_date, -1) && clock.hour === hourOf(s.thursday_all_at)) {
    return 'thursday_all'
  }
  if (clock.date === round.collect_date) {
    if (clock.hour === hourOf(s.friday_noon_at)) return 'friday_noon'
    if (clock.hour === hourOf(s.friday_evening_at)) return 'friday_evening'
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
  const vars = { firstName: firstName || '', amount: money(amount), zelle: zelle || 'the organizer' }
  const esVars = { ...vars, zelle: zelle || 'el organizador' }
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

// One run of the hourly job.
//   cycles:  [{ cycle, settings, templates, rounds, members, payments }] for active cycles
//   optedOut: Set of E.164 phones
//   log.claim(row) → id when this member/window/round/mode is new, null when already logged
//   log.finish(id, { status, twilio_sid, error }); log.optOut(phone)
//   sendSms(to, body) → Twilio message SID; throws an error with .code on failure
// A cycle only sends for real when dryRun is false AND reminder_settings.enabled is true.
// Returns a summary with first names only (no phones) for the function log.
export async function runReminders({ now, dryRun, cycles, optedOut, log, sendSms }) {
  const summary = []
  for (const { cycle, settings, templates, rounds, members, payments } of cycles) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) }
    const clock = localClock(now, s.timezone)
    const live = !dryRun && s.enabled === true
    for (const round of rounds) {
      const window = dueWindow(clock, round, s)
      if (!window) continue
      const { send, skipped } = recipients({ window, round, members, payments, optedOut })
      const entry = {
        cycle: cycle.name, round: round.round_number, window, localDate: clock.date,
        mode: live ? 'live' : 'dry_run', texted: [], alreadyLogged: [], failed: [],
        skipped: skipped.map(({ member, reason }) => `${member.display_first_name} (${reason})`),
      }
      for (const { member, to } of send) {
        // Re-check: an earlier send in this run may have just found this number unsubscribed.
        if (optedOut.has(to)) { entry.skipped.push(`${member.display_first_name} (opted_out)`); continue }
        const id = await log.claim({
          cycle_id: cycle.id, round_id: round.id, member_id: member.id, kind: window,
          local_date: clock.date, dry_run: !live, status: live ? 'sending' : 'dry_run',
        })
        if (!id) { entry.alreadyLogged.push(member.display_first_name); continue }
        if (!live) { entry.texted.push(member.display_first_name); continue }
        const body = renderMessage(templates || [], window, {
          firstName: member.display_first_name, amount: cycle.contribution, zelle: cycle.zelle_destination,
        })
        try {
          const sid = await sendSms(to, body)
          await log.finish(id, { status: 'sent', twilio_sid: sid })
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
