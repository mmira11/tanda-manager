// Zelle "you received" email parsing and member matching (Phase 5). Shared by the
// scan-zelle-email Edge Function (Deno) and the Vitest tests (Node). No imports.
//
// It only ever produces pending_review rows. Marking someone paid happens later, when an
// admin presses Match (confirm_zelle_match in migration 014).
//
// Summaries returned for logging carry counts only: no sender names, amounts, or bodies.

const MONEY = String.raw`\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)`
// A name directly before "sent you": letters, spaces, apostrophes, hyphens, inner periods.
const NAME = String.raw`([\p{L}][\p{L}'’.\- ]{0,58}[\p{L}])`
// A name after "from …": as short as possible, ending at punctuation or a following word.
const NAME_LAZY = String.raw`([\p{L}][\p{L}'’.\- ]{0,58}?[\p{L}])`
const END = String.raw`(?=\s*(?:[.,;:!(\n]|$)|\s+(?:on|to|into|has|was|is|and|for)\b)`

// Common wordings of bank Zelle notices. If your bank uses different wording, the dry run
// reports those emails as "unparsed" so the pattern can be added.
const PATTERNS = [
  { re: new RegExp(`${NAME}\\s+sent\\s+you\\s+${MONEY}`, 'iu'), name: 1, amount: 2 },
  { re: new RegExp(`you(?:'ve|\\s+have)?\\s+received\\s+${MONEY}\\s+(?:with\\s+zelle\\S*\\s+)?from\\s+${NAME_LAZY}${END}`, 'iu'), name: 2, amount: 1 },
  { re: new RegExp(`${MONEY}\\s+(?:payment\\s+)?from\\s+${NAME_LAZY}\\s+(?:was|has\\s+been)\\s+(?:deposited|received)`, 'iu'), name: 2, amount: 1 },
]

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
}

function toAmount(text) {
  return Number(String(text).replace(/,/g, ''))
}

function cleanName(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

// { subject, text, html, receivedAt } → { senderName, amount, receivedAt } or null.
export function parseZelleEmail({ subject = '', text = '', html = '', receivedAt }) {
  const haystacks = [subject, text, htmlToText(html)].filter(Boolean)
  for (const hay of haystacks) {
    for (const { re, name, amount } of PATTERNS) {
      const m = hay.match(re)
      if (!m) continue
      const value = toAmount(m[amount])
      if (!Number.isFinite(value) || value <= 0) continue
      return { senderName: cleanName(m[name]), amount: value, receivedAt }
    }
  }
  return null
}

// Lowercase, no accents, letters and spaces only: "José  O'Neil" → "jose oneil".
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Suggest a member for a sender. Never decides payment; the admin confirms.
//   members: [{ id, display_first_name, removed_at }]   aliases: [{ member_id, alias_name }]
// → { memberId: string | null, reason }
export function matchMember({ senderName, amount, contribution, members, aliases }) {
  const active = members.filter(m => !m.removed_at)
  const ids = new Set(active.map(m => m.id))
  const sender = normalizeName(senderName)

  let memberId = null
  let reason = 'no_match'
  const byAlias = [...new Set(aliases.filter(a => ids.has(a.member_id) && normalizeName(a.alias_name) === sender).map(a => a.member_id))]
  if (byAlias.length === 1) {
    memberId = byAlias[0]
    reason = 'alias'
  } else if (byAlias.length > 1) {
    reason = 'ambiguous'
  } else {
    const first = sender.split(' ')[0]
    const byFirst = active.filter(m => normalizeName(m.display_first_name).split(' ')[0] === first)
    if (byFirst.length === 1) {
      memberId = byFirst[0].id
      reason = 'first_name'
    } else if (byFirst.length > 1) {
      reason = 'ambiguous'
    }
  }
  if (Number(amount) !== Number(contribution)) reason += ',amount_differs'
  return { memberId, reason }
}

function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = type => parts.find(p => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Calendar-day math on 'YYYY-MM-DD', in UTC so a DST change cannot shift the day.
// Duplicated from src/utils/rounds.js: this file is imported by Deno and by Vitest and has no imports.
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// How early a payment can arrive and still belong to the first collection, and how long
// after a payout it can still be late for that round. The Gmail search uses the same lead.
export const WINDOW_LEAD_DAYS = 7
export const LATE_GRACE_DAYS = 7

// Which round a payment belongs to, by collection window (cycle time zone, calendar days).
//
// Primary rule: the round whose collect_date is the nearest date on or after the payment
// day. That covers a payment made early and a payment made on collection day.
//
// A payment made after that collection still stays with the round when:
//   - the day is on or before the round's payout_date ("after_deadline"), or
//   - the day is after the payout, within LATE_GRACE_DAYS, and still before the next
//     round's early window (collect_date minus WINDOW_LEAD_DAYS). That one is "late".
// On a day that falls in both the previous round's grace and the next round's early
// window, the next round wins. The admin can change the round before pressing Match.
//
// A day before the first collect_date minus WINDOW_LEAD_DAYS, or after the last
// payout_date plus LATE_GRACE_DAYS, is "out_of_window". It is not given to round 1
// or to the last round.
//
// → { round, timing } where timing is early | on_time | after_deadline | late | out_of_window.
export function assignRound(receivedAt, rounds, timeZone = 'America/Los_Angeles') {
  const ordered = [...(rounds || [])]
    .filter(r => r && r.collect_date && r.payout_date)
    .sort((a, b) => a.round_number - b.round_number)
  if (!ordered.length || !receivedAt || Number.isNaN(new Date(receivedAt).getTime())) {
    return { round: null, timing: 'out_of_window' }
  }
  const day = localDate(new Date(receivedAt), timeZone)
  const first = ordered[0]
  if (day < addDays(first.collect_date, -WINDOW_LEAD_DAYS)) {
    return { round: null, timing: 'out_of_window' }
  }

  const upcomingIndex = ordered.findIndex(r => r.collect_date >= day)
  if (upcomingIndex === -1) {
    const last = ordered[ordered.length - 1]
    if (day <= last.payout_date) {
      return { round: last, timing: day > last.collect_date ? 'after_deadline' : 'on_time' }
    }
    if (day <= addDays(last.payout_date, LATE_GRACE_DAYS)) return { round: last, timing: 'late' }
    return { round: null, timing: 'out_of_window' }
  }

  const upcoming = ordered[upcomingIndex]
  const prev = ordered[upcomingIndex - 1]
  if (prev && day <= prev.payout_date) return { round: prev, timing: 'after_deadline' }
  if (prev && day > prev.payout_date) {
    const lateUntil = addDays(prev.payout_date, LATE_GRACE_DAYS)
    const earlyFrom = addDays(upcoming.collect_date, -WINDOW_LEAD_DAYS)
    if (day <= lateUntil && day < earlyFrom) return { round: prev, timing: 'late' }
  }
  if (day < upcoming.collect_date) return { round: upcoming, timing: 'early' }
  return { round: upcoming, timing: 'on_time' }
}

// Default Gmail search bounds. after: includes its day; before: excludes its day, so the
// default before is the day after today in the cycle's time zone (today's mail is included).
// A before/after the caller already sent is Gmail's own form and is passed through.
// windowStart is the first day that may be assigned to a round.
export function gmailSearchRange({ rounds, timeZone = 'America/Los_Angeles', now = new Date(), after, before } = {}) {
  const ordered = [...(rounds || [])]
    .filter(r => r && r.collect_date)
    .sort((a, b) => a.round_number - b.round_number)
  const windowStart = ordered.length ? addDays(ordered[0].collect_date, -WINDOW_LEAD_DAYS) : null
  const today = localDate(now, timeZone)
  const slash = iso => iso.replace(/-/g, '/')
  return {
    windowStart,
    after: after || (windowStart ? slash(windowStart) : null),
    before: before || slash(addDays(today, 1)),
  }
}

export function gmailQuery(base, bounds) {
  let query = base || 'subject:zelle'
  if (bounds?.after) query += ` after:${bounds.after}`
  if (bounds?.before) query += ` before:${bounds.before}`
  return query
}

// Several active cycles must not depend on whichever row the database returns first.
// With no cycleId, use the earliest start_date, then the smallest id, and say so.
// → { cycle, ambiguous, choice, activeCount }
export function pickCycle(cycles, cycleId) {
  const list = [...(cycles || [])]
  if (cycleId) {
    const cycle = list.find(c => c.id === cycleId) || null
    return {
      cycle,
      ambiguous: false,
      choice: cycle ? 'requested' : 'none',
      activeCount: cycle ? 1 : 0,
    }
  }
  const active = list.filter(c => c.status === 'active').sort((a, b) => {
    const byStart = String(a.start_date || '').localeCompare(String(b.start_date || ''))
    return byStart || String(a.id).localeCompare(String(b.id))
  })
  if (!active.length) return { cycle: null, ambiguous: false, choice: 'none', activeCount: 0 }
  return {
    cycle: active[0],
    ambiguous: active.length > 1,
    choice: active.length > 1 ? 'earliest_start_date' : 'only_active',
    activeCount: active.length,
  }
}

// The domain part of a From header: 'Bank <alerts@notify.bank.example>' → 'notify.bank.example'.
// Exactly one mailbox, or null: 'Bank <a@b.example>' or 'a@b.example'. Anything with a second
// address ('<x@evil.example>, a@bank.example') or an '@' in the display name is rejected.
export function senderDomain(from) {
  const text = String(from || '').trim()
  if ((text.match(/@/g) || []).length !== 1) return null
  const match = text.match(/^(?:[^<>,]*<\s*)?[^\s<>@,]+@([a-z0-9.-]+\.[a-z]{2,})\s*>?$/i)
  return match ? match[1].toLowerCase() : null
}

function inAllowlist(domain, allowedDomains) {
  return Boolean(domain) && allowedDomains.some(d => domain === d || domain.endsWith(`.${d}`))
}

// Gmail prepends its own Authentication-Results header (authserv-id mx.google.com). Senders can
// add their own copies further down, so only the topmost one, and only if Gmail wrote it, counts.
export function googleAuthResults(headerValues) {
  const first = String((headerValues || [])[0] || '').trim()
  return /^mx\.google\.com\b/i.test(first) ? first : ''
}

// The signing domain is aligned when it equals the From domain or is a parent of it.
function aligned(signer, fromDomain) {
  return Boolean(signer) && (fromDomain === signer || fromDomain.endsWith(`.${signer}`))
}

// Only trust an email that comes from an allowed bank domain AND that Gmail authenticated for
// that domain (DMARC pass for the From domain, or DKIM pass signed by an allowed domain).
// Anyone can send a message that says "Ana sent you $150"; this keeps those out of review.
export function verifySender({ from, authResults }, allowedDomains) {
  const allowed = (allowedDomains || []).map(d => String(d).trim().toLowerCase()).filter(Boolean)
  if (!allowed.length) return { ok: false, reason: 'no_allowlist' }
  const domain = senderDomain(from)
  if (!inAllowlist(domain, allowed)) return { ok: false, reason: 'domain_not_allowed', domain }
  const results = String(authResults || '').toLowerCase()
  if (!/^mx\.google\.com\b/.test(results)) return { ok: false, reason: 'not_authenticated', domain }
  const dmarc = [...results.matchAll(/dmarc=pass[^;]*?header\.from=([a-z0-9.-]+)/g)].map(m => m[1])
  // DKIM identity as a domain only: header.d=<domain>, or the part after the last '@' of header.i.
  const dkim = [
    ...[...results.matchAll(/dkim=pass[^;]*?header\.d=([a-z0-9.-]+)/g)].map(m => m[1]),
    ...[...results.matchAll(/dkim=pass[^;]*?header\.i=[^;\s]*@([a-z0-9.-]+)/g)].map(m => m[1]),
  ]
  const authenticated = dmarc.some(d => d === domain)
    || dkim.some(d => inAllowlist(d, allowed) && aligned(d, domain))
  if (!authenticated) return { ok: false, reason: 'not_authenticated', domain }
  return { ok: true, domain }
}

// One scan. emails: [{ id, from, authResults, subject, text, html, receivedAt }] from Gmail.
// Emails that are not from an allowed, authenticated bank domain are counted and skipped.
// insert(row) writes one pending_review row (ignored when gmail_message_id already exists).
// In a dry run nothing is written and `preview` lists what would be queued, for the caller only.
export async function scanEmails({ emails, cycle, rounds, members, aliases, existingIds, dryRun, insert, allowedDomains }) {
  const counts = {
    seen: emails.length, unverified: 0, parsed: 0, unparsed: 0,
    outOfWindow: 0, alreadyQueued: 0, queued: 0, suggested: 0, unmatched: 0,
  }
  const preview = []
  const zone = cycle.timezone || 'America/Los_Angeles'
  for (const email of emails) {
    if (existingIds.has(email.id)) { counts.alreadyQueued += 1; continue }
    const sender = verifySender(email, allowedDomains)
    if (!sender.ok) { counts.unverified += 1; continue }
    const parsed = parseZelleEmail(email)
    if (!parsed) { counts.unparsed += 1; continue }
    counts.parsed += 1
    const { round, timing } = assignRound(parsed.receivedAt, rounds, zone)
    // Mail from before the collection window is reported and never given a round.
    if (!round || timing === 'out_of_window') {
      counts.outOfWindow += 1
      if (dryRun) {
        preview.push({
          round: null, timing: 'out_of_window', sender: parsed.senderName,
          amount: parsed.amount, suggested: null, reason: 'out_of_window',
        })
      }
      continue
    }
    const { memberId, reason } = matchMember({ ...parsed, contribution: cycle.contribution, members, aliases })
    if (memberId) counts.suggested += 1
    else counts.unmatched += 1
    const row = {
      cycle_id: cycle.id,
      round_id: round.id,
      round_timing: timing,
      gmail_message_id: email.id,
      email_from: sender.domain,
      received_at: new Date(parsed.receivedAt).toISOString(),
      sender_name: parsed.senderName,
      amount: parsed.amount,
      raw_subject: email.subject || null,
      suggested_member_id: memberId,
      match_reason: reason,
      status: 'pending',
    }
    if (dryRun) {
      const name = members.find(m => m.id === memberId)?.display_first_name || null
      preview.push({
        round: round.round_number, timing, sender: parsed.senderName,
        amount: parsed.amount, suggested: name, reason,
      })
    } else {
      await insert(row)
    }
    counts.queued += 1
  }
  return { counts, preview: dryRun ? preview : undefined }
}
