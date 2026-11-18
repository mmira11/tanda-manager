// scan-zelle-email: reads Zelle "you received" emails from Gmail (read-only) and queues them in
// pending_review for the admin to confirm with Match. It never marks anyone paid.
//
// Function secrets (supabase secrets set …), never in the repo or the frontend:
//   CRON_SECRET            same shared secret as send-reminders (x-cron-secret header)
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//                          OAuth client + refresh token for the receiving inbox, granted only
//                          https://www.googleapis.com/auth/gmail.readonly
//   ZELLE_SENDER_DOMAINS   required: bank domain(s) the Zelle notices come from, comma-separated.
//                          Emails from other domains, or that fail Gmail's DKIM/DMARC check for
//                          that domain, are skipped and counted as "unverified".
//   ZELLE_GMAIL_QUERY      optional Gmail search; default 'subject:zelle'
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase inside Edge Functions.
//
// POST body (all optional):
//   { "dryRun": true }            default; parses and matches, writes nothing, returns a preview
//   { "dryRun": false }           queues new emails in pending_review
//   { "cycleId": "…" }            a specific cycle (for example last cycle); default the active one
//   { "after": "2026/06/01", "before": "2026/11/20" }   limit the Gmail search to a date range
// The function log carries counts only. The preview (names, amounts) goes only to the caller.
// Deploy with: supabase functions deploy scan-zelle-email --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { googleAuthResults, scanEmails } from '../_shared/zelle.js'
import { timingSafeEqual } from '../_shared/reminders.js'

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

function decode(data = '') {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

function collect(part: Part, out: { text: string; html: string }) {
  if (part.mimeType === 'text/plain' && part.body?.data) out.text += decode(part.body.data)
  if (part.mimeType === 'text/html' && part.body?.data) out.html += decode(part.body.data)
  for (const child of part.parts ?? []) collect(child, out)
  return out
}

async function gmailToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GMAIL_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GMAIL_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(`Gmail auth failed (${res.status})`)
  return json.access_token as string
}

async function fetchEmails(token: string, query: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const ids: string[] = []
  let pageToken = ''
  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Gmail list failed (${res.status})`)
    const json = await res.json()
    for (const m of json.messages ?? []) ids.push(m.id)
    pageToken = json.nextPageToken ?? ''
  } while (pageToken && ids.length < 1000)

  const emails = []
  for (const id of ids) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers })
    if (!res.ok) throw new Error(`Gmail get failed (${res.status})`)
    const msg = await res.json()
    const headers = (msg.payload?.headers ?? []) as { name: string; value: string }[]
    const header = (name: string) => headers.filter(h => h.name.toLowerCase() === name).map(h => h.value)
    const { text, html } = collect(msg.payload ?? {}, { text: '', html: '' })
    emails.push({
      id,
      from: header('from')[0] ?? '',
      // Only Gmail's own topmost Authentication-Results counts; senders can plant extra copies.
      authResults: googleAuthResults(header('authentication-results')),
      subject: header('subject')[0] ?? '',
      text, html,
      receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    })
  }
  return emails
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || !timingSafeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 })
  }
  // Required: the bank domain(s) Zelle notices come from, comma-separated. Without it, refuse.
  const allowedDomains = (Deno.env.get('ZELLE_SENDER_DOMAINS') ?? '').split(',').map(d => d.trim()).filter(Boolean)
  if (!allowedDomains.length) return new Response('ZELLE_SENDER_DOMAINS is not set', { status: 500 })
  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun !== false
  const dateOk = (v: unknown) => v == null || /^\d{4}\/\d{2}\/\d{2}$/.test(String(v))
  if (!dateOk(body?.after) || !dateOk(body?.before)) return new Response('after/before must be YYYY/MM/DD', { status: 400 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const cycleQuery = db.from('cycles').select('id, name, contribution, timezone, status')
  const cycles = check(await (body?.cycleId ? cycleQuery.eq('id', body.cycleId) : cycleQuery.eq('status', 'active')))
  const cycle = cycles?.[0]
  if (!cycle) return Response.json({ dryRun, counts: null, note: 'no matching cycle' })

  const [rounds, members] = await Promise.all([
    db.from('rounds').select('id, round_number, payout_date').eq('cycle_id', cycle.id).then(check),
    db.from('members').select('id, display_first_name, removed_at').eq('cycle_id', cycle.id).then(check),
  ])
  const aliases = members.length
    ? check(await db.from('payer_aliases').select('member_id, alias_name').in('member_id', members.map(m => m.id)))
    : []

  let query = Deno.env.get('ZELLE_GMAIL_QUERY') || 'subject:zelle'
  if (body?.after) query += ` after:${body.after}`
  if (body?.before) query += ` before:${body.before}`
  const emails = await fetchEmails(await gmailToken(), query)

  const existing = emails.length
    ? check(await db.from('pending_review').select('gmail_message_id').in('gmail_message_id', emails.map(e => e.id)))
    : []
  const existingIds = new Set(existing.map(r => r.gmail_message_id))

  const result = await scanEmails({
    emails, cycle, rounds, members, aliases, existingIds, dryRun, allowedDomains,
    insert: async (row: Record<string, unknown>) => {
      check(await db.from('pending_review').upsert(row, { onConflict: 'gmail_message_id', ignoreDuplicates: true }))
    },
  })
  // Counts only in the function log: no names, amounts, subjects, or bodies.
  console.log(JSON.stringify({ dryRun, cycleStatus: cycle.status, counts: result.counts }))
  return Response.json({ dryRun, cycle: cycle.name, ...result })
})
