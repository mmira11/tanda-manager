// send-reminders: called every hour by pg_cron (supabase/cron/schedule_send_reminders.sql).
// Decides in Los Angeles time whether a reminder window is due, and either logs who would be
// texted (dry run, the default) or sends through Twilio.
//
// Function secrets (supabase secrets set …), never in the repo or the frontend:
//   CRON_SECRET          shared with the cron job (x-cron-secret header)
//   REMINDERS_DRY_RUN    anything but "false" means dry run (default)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase inside Edge Functions.
// Live sends also need reminder_settings.enabled = true for that cycle.
// Deploy with: supabase functions deploy send-reminders --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isDryRun, runReminders } from '../_shared/reminders.js'

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 })
  }

  const dryRun = isDryRun(Deno.env.get('REMINDERS_DRY_RUN'))
  const body = await req.json().catch(() => ({}))
  // A dry run may replay another moment (for example a whole payment week) with { "now": ISO }.
  const now = dryRun && body?.now ? new Date(body.now) : new Date()
  if (Number.isNaN(now.getTime())) return new Response('bad now', { status: 400 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const cycleRows = check(await db.from('cycles')
    .select('id, name, contribution, zelle_destination, timezone').eq('status', 'active'))
  const cycles = []
  for (const cycle of cycleRows) {
    const [settings, templates, rounds, members] = await Promise.all([
      db.from('reminder_settings').select('*').eq('cycle_id', cycle.id).maybeSingle().then(check),
      db.from('reminder_templates').select('kind, lang, body').eq('cycle_id', cycle.id).then(check),
      db.from('rounds').select('id, round_number, collect_date').eq('cycle_id', cycle.id).then(check),
      db.from('members').select('id, display_first_name, phone, removed_at').eq('cycle_id', cycle.id).then(check),
    ])
    const payments = rounds.length
      ? check(await db.from('payments').select('round_id, member_id, paid_at').in('round_id', rounds.map(r => r.id)))
      : []
    cycles.push({
      cycle,
      settings: settings ? { ...settings, timezone: settings.timezone || cycle.timezone } : { timezone: cycle.timezone },
      templates, rounds, members, payments,
    })
  }
  const optedOut = new Set(check(await db.from('sms_opt_outs').select('phone_e164')).map(r => r.phone_e164))

  const log = {
    async claim(row: Record<string, unknown>) {
      const rows = check(await db.from('reminder_log')
        .upsert(row, { onConflict: 'round_id,member_id,kind,dry_run', ignoreDuplicates: true })
        .select('id'))
      return rows?.[0]?.id ?? null
    },
    async finish(id: string, patch: Record<string, unknown>) {
      check(await db.from('reminder_log').update(patch).eq('id', id))
    },
    async optOut(phone: string) {
      check(await db.from('sms_opt_outs').upsert({ phone_e164: phone, keyword: 'twilio-21610' }, { onConflict: 'phone_e164' }))
    },
  }

  async function sendSms(to: string, text: string) {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const token = Deno.env.get('TWILIO_AUTH_TOKEN')
    const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')
    const from = Deno.env.get('TWILIO_FROM_NUMBER')
    if (!sid || !token || (!service && !from)) throw Object.assign(new Error('Twilio secrets are not set'), { code: 'config' })
    const form = new URLSearchParams({ To: to, Body: text })
    if (service) form.set('MessagingServiceSid', service)
    else form.set('From', from!)
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(json?.message || `Twilio ${res.status}`), { code: json?.code ?? res.status })
    return json.sid as string
  }

  const summary = await runReminders({ now, dryRun, cycles, optedOut, log, sendSms })
  // First names and windows only; no phone numbers in the function log.
  console.log(JSON.stringify({ at: now.toISOString(), dryRun, summary }))
  return Response.json({ dryRun, summary })
})
