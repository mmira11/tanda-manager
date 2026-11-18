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

// The round a payment received at this moment belongs to: the first round whose payout day
// (in the cycle's time zone) is on or after the day it arrived, else the last round.
export function roundFor(receivedAt, rounds, timeZone = 'America/Los_Angeles') {
  if (!rounds.length) return null
  const day = localDate(new Date(receivedAt), timeZone)
  const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number)
  return ordered.find(r => r.payout_date >= day) || ordered[ordered.length - 1]
}

// One scan. emails: [{ id, subject, text, html, receivedAt }] from Gmail.
// insert(row) writes one pending_review row (ignored when gmail_message_id already exists).
// In a dry run nothing is written and `preview` lists what would be queued, for the caller only.
export async function scanEmails({ emails, cycle, rounds, members, aliases, existingIds, dryRun, insert }) {
  const counts = { seen: emails.length, parsed: 0, unparsed: 0, alreadyQueued: 0, queued: 0, suggested: 0, unmatched: 0 }
  const preview = []
  for (const email of emails) {
    if (existingIds.has(email.id)) { counts.alreadyQueued += 1; continue }
    const parsed = parseZelleEmail(email)
    if (!parsed) { counts.unparsed += 1; continue }
    counts.parsed += 1
    const round = roundFor(parsed.receivedAt, rounds, cycle.timezone || 'America/Los_Angeles')
    const { memberId, reason } = matchMember({ ...parsed, contribution: cycle.contribution, members, aliases })
    if (memberId) counts.suggested += 1
    else counts.unmatched += 1
    const row = {
      cycle_id: cycle.id,
      round_id: round?.id ?? null,
      gmail_message_id: email.id,
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
      preview.push({ round: round?.round_number ?? null, sender: parsed.senderName, amount: parsed.amount, suggested: name, reason })
    } else {
      await insert(row)
    }
    counts.queued += 1
  }
  return { counts, preview: dryRun ? preview : undefined }
}
