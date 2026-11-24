// Phase 5 Zelle detection. Every email, sender, and amount here is made up.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  parseZelleEmail, normalizeName, matchMember, assignRound, scanEmails, verifySender, senderDomain, googleAuthResults,
  gmailSearchRange, gmailQuery, pickCycle,
} from '../../supabase/functions/_shared/zelle.js'

describe('second security review: planted headers and parser tricks', () => {
  const ok = 'mx.google.com; dkim=pass header.d=bank.example; dmarc=pass header.from=notify.bank.example'
  it('uses only the topmost header, and only if Gmail wrote it', () => {
    expect(googleAuthResults([ok, 'evil; dmarc=pass header.from=notify.bank.example'])).toBe(ok)
    expect(googleAuthResults(['attacker.example; dmarc=pass header.from=notify.bank.example', ok])).toBe('')
    expect(verifySender({ from: 'Bank <a@notify.bank.example>', authResults: 'evil; dmarc=pass header.from=notify.bank.example' }, ['bank.example']).ok).toBe(false)
  })
  it('reads the DKIM domain after the last @ and requires it to match the From domain', () => {
    const tricked = 'mx.google.com; dkim=pass header.i=bank.example@evil.example; dmarc=fail header.from=notify.bank.example'
    expect(verifySender({ from: 'Bank <a@notify.bank.example>', authResults: tricked }, ['bank.example', 'evil.example']).ok).toBe(false)
    const otherAllowed = 'mx.google.com; dkim=pass header.d=other.example; dmarc=fail header.from=notify.bank.example'
    expect(verifySender({ from: 'Bank <a@notify.bank.example>', authResults: otherAllowed }, ['bank.example', 'other.example']).ok).toBe(false)
  })
  it('accepts exactly one From address', () => {
    expect(senderDomain('<x@evil.example>, alerts@bank.example')).toBeNull()
    expect(senderDomain('"a@b" <alerts@bank.example>')).toBeNull()
    expect(senderDomain('alerts@bank.example')).toBe('bank.example')
  })
})

// A made-up bank domain and the headers Gmail would add for a genuine message from it.
const BANK = ['bank.example']
const FROM = 'Fake Bank <alerts@notify.bank.example>'
const AUTH = 'mx.google.com; dkim=pass header.i=@bank.example header.s=s1; spf=pass smtp.mailfrom=notify.bank.example; dmarc=pass (p=REJECT) header.from=notify.bank.example'
const genuine = { from: FROM, authResults: AUTH }

describe('verifySender (anyone can send "Ana sent you $150")', () => {
  it('accepts an allowlisted domain that Gmail authenticated', () => {
    expect(senderDomain(FROM)).toBe('notify.bank.example')
    expect(verifySender(genuine, BANK)).toEqual({ ok: true, domain: 'notify.bank.example' })
    expect(verifySender({ from: FROM, authResults: 'mx.google.com; dkim=pass header.d=bank.example' }, BANK).ok).toBe(true)
  })
  it('rejects other domains, look-alikes, missing allowlists, and failed authentication', () => {
    expect(verifySender({ from: 'Ana <ana@mail.example>', authResults: AUTH }, BANK)).toMatchObject({ ok: false, reason: 'domain_not_allowed' })
    expect(verifySender({ from: 'Bank <alerts@bank.example.evil.example>', authResults: AUTH }, BANK)).toMatchObject({ ok: false, reason: 'domain_not_allowed' })
    expect(verifySender({ from: 'Bank <alerts@notbank.example>', authResults: AUTH }, BANK)).toMatchObject({ ok: false, reason: 'domain_not_allowed' })
    expect(verifySender(genuine, [])).toMatchObject({ ok: false, reason: 'no_allowlist' })
    expect(verifySender({ from: FROM, authResults: 'mx.google.com; dkim=fail header.i=@bank.example; dmarc=fail header.from=notify.bank.example' }, BANK))
      .toMatchObject({ ok: false, reason: 'not_authenticated' })
    // DKIM passed, but for someone else's domain: a spoofed From with a valid signature from elsewhere.
    expect(verifySender({ from: FROM, authResults: 'mx.google.com; dkim=pass header.d=evil.example; dmarc=fail header.from=notify.bank.example' }, BANK))
      .toMatchObject({ ok: false, reason: 'not_authenticated' })
  })
})
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { useCycleStore } from '../hooks/useCycleStore'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

const at = '2026-06-12T19:30:00.000Z'

describe('parseZelleEmail (fake fixtures)', () => {
  it('reads "<name> sent you $X" from the subject', () => {
    expect(parseZelleEmail({ subject: 'Ana Prueba sent you $150.00', receivedAt: at }))
      .toEqual({ senderName: 'Ana Prueba', amount: 150, receivedAt: at })
  })
  it('reads "You received $X from <name>" from a text body and stops at the sentence end', () => {
    const text = 'Hi there,\nYou received $1,250.50 from Beto Ejemplo. The money is now in your account.'
    expect(parseZelleEmail({ subject: 'Zelle payment', text, receivedAt: at }))
      .toMatchObject({ senderName: 'Beto Ejemplo', amount: 1250.5 })
  })
  it('reads an HTML body with accents and apostrophes', () => {
    const html = '<table><tr><td>You have received <b>$80</b> with Zelle® from <b>María O\'Demo</b> on Jun 12</td></tr></table>'
    expect(parseZelleEmail({ subject: 'Notice', html, receivedAt: at }))
      .toMatchObject({ senderName: "María O'Demo", amount: 80 })
  })
  it('reads "$X from <name> has been deposited"', () => {
    expect(parseZelleEmail({ text: '$75.00 payment from Cal Muestra has been deposited.', receivedAt: at }))
      .toMatchObject({ senderName: 'Cal Muestra', amount: 75 })
  })
  it('returns null for emails that are not a received payment', () => {
    expect(parseZelleEmail({ subject: 'You sent $150.00 to Dee Prueba', receivedAt: at })).toBeNull()
    expect(parseZelleEmail({ subject: 'Your Zelle limit changed', text: 'No money moved.', receivedAt: at })).toBeNull()
  })
})

const members = [
  { id: 'm1', display_first_name: 'Ana' },
  { id: 'm2', display_first_name: 'Beto' },
  { id: 'm3', display_first_name: 'Beto' }, // two Betos: first name alone is ambiguous
  { id: 'm4', display_first_name: 'Cal', removed_at: '2026-06-01T00:00:00Z' },
]

describe('matchMember', () => {
  it('normalizes names for comparison', () => {
    expect(normalizeName('  María   O\'Demo ')).toBe('maria odemo')
  })
  it('prefers a saved payer alias', () => {
    expect(matchMember({ senderName: 'A PRUEBA LLC', amount: 150, contribution: 150, members, aliases: [{ member_id: 'm2', alias_name: 'a prueba llc' }] }))
      .toEqual({ memberId: 'm2', reason: 'alias' })
  })
  it('falls back to a unique first name', () => {
    expect(matchMember({ senderName: 'Ana Prueba', amount: 150, contribution: 150, members, aliases: [] }))
      .toEqual({ memberId: 'm1', reason: 'first_name' })
  })
  it('suggests nobody when the first name is shared or unknown, or the member was removed', () => {
    expect(matchMember({ senderName: 'Beto Ejemplo', amount: 150, contribution: 150, members, aliases: [] }).memberId).toBeNull()
    expect(matchMember({ senderName: 'Zoe Nadie', amount: 150, contribution: 150, members, aliases: [] }))
      .toEqual({ memberId: null, reason: 'no_match' })
    expect(matchMember({ senderName: 'Cal Muestra', amount: 150, contribution: 150, members, aliases: [] }).memberId).toBeNull()
  })
  it('flags an amount that is not the contribution but still suggests the member', () => {
    expect(matchMember({ senderName: 'Ana Prueba', amount: 300, contribution: 150, members, aliases: [] }))
      .toEqual({ memberId: 'm1', reason: 'first_name,amount_differs' })
  })
})

describe('assignRound (collection windows)', () => {
  // Round 1 collects Jun 12 and pays out Jun 13. Round 2 collects Jun 26 and pays out Jun 27.
  // Early window opens 7 days before a collect date. Late grace runs 7 days after a payout.
  // A day in both the previous grace and the next early window goes to the next round.
  const rounds = [
    { id: 'r1', round_number: 1, collect_date: '2026-06-12', payout_date: '2026-06-13' },
    { id: 'r2', round_number: 2, collect_date: '2026-06-26', payout_date: '2026-06-27' },
  ]
  const on = (day, time = '19:00:00') => assignRound(`${day}T${time}Z`, rounds)

  it('assigns a payment made early, on collection day, after the deadline, and after payout', () => {
    expect(on('2026-06-10')).toMatchObject({ round: { id: 'r1' }, timing: 'early' })
    expect(on('2026-06-05')).toMatchObject({ round: { id: 'r1' }, timing: 'early' }) // first day of the window
    expect(on('2026-06-12')).toMatchObject({ round: { id: 'r1' }, timing: 'on_time' })
    expect(on('2026-06-13')).toMatchObject({ round: { id: 'r1' }, timing: 'after_deadline' })
    expect(on('2026-06-16')).toMatchObject({ round: { id: 'r1' }, timing: 'late' })
    expect(on('2026-06-22')).toMatchObject({ round: { id: 'r2' }, timing: 'early' })
    expect(on('2026-06-26')).toMatchObject({ round: { id: 'r2' }, timing: 'on_time' })
    expect(on('2026-06-27')).toMatchObject({ round: { id: 'r2' }, timing: 'after_deadline' })
    expect(on('2026-06-30')).toMatchObject({ round: { id: 'r2' }, timing: 'late' })
    expect(on('2026-07-04')).toMatchObject({ round: { id: 'r2' }, timing: 'late' }) // last grace day
  })

  it('counts the day in Los Angeles time', () => {
    // 06:30 UTC on Jun 13 is 11:30 PM on Jun 12 in LA: still round 1's collection day.
    expect(assignRound('2026-06-13T06:30:00Z', rounds)).toMatchObject({ round: { id: 'r1' }, timing: 'on_time' })
    // 08:00 UTC on Jun 14 is 1:00 AM on Jun 14 in LA: the day after round 1 paid out, so late for round 1.
    expect(assignRound('2026-06-14T08:00:00Z', rounds)).toMatchObject({ round: { id: 'r1' }, timing: 'late' })
  })

  it('gives an overlap day to the next collection', () => {
    // Jun 19 is inside round 1's 7-day grace and is the first day of round 2's early window.
    expect(on('2026-06-19')).toMatchObject({ round: { id: 'r2' }, timing: 'early' })
  })

  it('does not assign mail from before the window or after the last grace day', () => {
    expect(on('2026-06-04').timing).toBe('out_of_window')
    expect(on('2026-06-04').round).toBeNull()
    expect(on('2026-07-05')).toMatchObject({ round: null, timing: 'out_of_window' })
    expect(assignRound('2026-06-12T19:00:00Z', []).timing).toBe('out_of_window')
  })
})

describe('gmail search window and active-cycle choice', () => {
  const rounds = [
    { round_number: 2, collect_date: '2026-06-26', payout_date: '2026-06-27' },
    { round_number: 1, collect_date: '2026-06-12', payout_date: '2026-06-13' },
  ]

  it('searches from 7 days before the first collection date through today', () => {
    // 06:30 UTC on Jun 13 is still Jun 12 in Los Angeles, so "today" is Jun 12 and before: is Jun 13.
    const bounds = gmailSearchRange({ rounds, now: new Date('2026-06-13T06:30:00Z') })
    expect(bounds).toEqual({ windowStart: '2026-06-05', after: '2026/06/05', before: '2026/06/13' })
    expect(gmailQuery('subject:zelle', bounds)).toBe('subject:zelle after:2026/06/05 before:2026/06/13')
  })

  it('passes a caller date range through as written', () => {
    const bounds = gmailSearchRange({
      rounds, now: new Date('2026-06-13T06:30:00Z'), after: '2026/06/01', before: '2026/06/20',
    })
    expect(bounds.after).toBe('2026/06/01')
    expect(bounds.before).toBe('2026/06/20')
  })

  it('picks the earliest active cycle when more than one is active', () => {
    const cycles = [
      { id: 'b', status: 'active', start_date: '2026-08-01' },
      { id: 'a', status: 'active', start_date: '2026-06-01' },
    ]
    expect(pickCycle(cycles)).toMatchObject({
      cycle: { id: 'a' }, ambiguous: true, choice: 'earliest_start_date', activeCount: 2,
    })
    expect(pickCycle(cycles, 'b')).toMatchObject({ cycle: { id: 'b' }, choice: 'requested', ambiguous: false })
    // Same start date: the smaller id wins, whatever order the rows arrived in.
    expect(pickCycle([
      { id: 'm', status: 'active', start_date: '2026-06-01' },
      { id: 'c', status: 'active', start_date: '2026-06-01' },
    ]).cycle.id).toBe('c')
    expect(pickCycle([{ id: 'x', status: 'archived', start_date: '2026-01-01' }]).cycle).toBeNull()
  })
})

describe('scanEmails', () => {
  const cycle = { id: 'c1', contribution: 150, timezone: 'America/Los_Angeles' }
  const rounds = [{ id: 'r1', round_number: 1, collect_date: '2026-06-12', payout_date: '2026-06-13' }]
  const emails = [
    { id: 'g1', ...genuine, subject: 'Ana Prueba sent you $150.00', receivedAt: at },
    { id: 'g2', ...genuine, subject: 'Zoe Nadie sent you $150.00', receivedAt: at },
    { id: 'g3', ...genuine, subject: 'Your monthly statement', receivedAt: at },
    { id: 'g4', ...genuine, subject: 'Ana Prueba sent you $150.00', receivedAt: at },
    { id: 'g5', from: 'Ana <ana@mail.example>', authResults: 'dkim=pass header.d=mail.example', subject: 'Ana Prueba sent you $150.00', receivedAt: at },
  ]

  it('dry run writes nothing and returns counts plus a preview for the caller', async () => {
    const insert = vi.fn()
    const result = await scanEmails({ emails, cycle, rounds, members, aliases: [], existingIds: new Set(['g4']), dryRun: true, insert, allowedDomains: BANK })
    expect(insert).not.toHaveBeenCalled()
    expect(result.counts).toEqual({ seen: 5, unverified: 1, parsed: 2, unparsed: 1, outOfWindow: 0, alreadyQueued: 1, queued: 2, suggested: 1, unmatched: 1 })
    expect(result.preview).toEqual([
      { round: 1, timing: 'on_time', sender: 'Ana Prueba', amount: 150, suggested: 'Ana', reason: 'first_name' },
      { round: 1, timing: 'on_time', sender: 'Zoe Nadie', amount: 150, suggested: null, reason: 'no_match' },
    ])
    expect(JSON.stringify(result.counts)).not.toMatch(/Ana|Zoe|150/)
  })

  it('a real run queues pending_review rows only, never payments', async () => {
    const rows = []
    const result = await scanEmails({ emails: emails.slice(0, 2), cycle, rounds, members, aliases: [], existingIds: new Set(), dryRun: false, insert: async row => rows.push(row), allowedDomains: BANK })
    expect(result.preview).toBeUndefined()
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'pending' && row.round_id === 'r1' && row.round_timing === 'on_time')).toBe(true)
    expect(rows[0]).toMatchObject({ gmail_message_id: 'g1', email_from: 'notify.bank.example', suggested_member_id: 'm1', sender_name: 'Ana Prueba', amount: 150 })
    expect(Object.keys(rows[0])).not.toContain('paid_at')
  })

  it('queues nothing from unverified senders, and nothing at all without an allowlist', async () => {
    const insert = vi.fn()
    const spoof = await scanEmails({ emails: [emails[4]], cycle, rounds, members, aliases: [], existingIds: new Set(), dryRun: false, insert, allowedDomains: BANK })
    const noList = await scanEmails({ emails: emails.slice(0, 2), cycle, rounds, members, aliases: [], existingIds: new Set(), dryRun: false, insert, allowedDomains: [] })
    expect(insert).not.toHaveBeenCalled()
    expect(spoof.counts).toMatchObject({ unverified: 1, queued: 0 })
    expect(noList.counts).toMatchObject({ unverified: 2, queued: 0 })
  })

  it('reports mail from before the collection window and does not queue it', async () => {
    const insert = vi.fn()
    const old = { id: 'old', ...genuine, subject: 'Ana Prueba sent you $150.00', receivedAt: '2026-01-01T19:00:00Z' }
    const result = await scanEmails({
      emails: [old], cycle, rounds, members, aliases: [], existingIds: new Set(), dryRun: true, insert, allowedDomains: BANK,
    })
    expect(insert).not.toHaveBeenCalled()
    expect(result.counts).toMatchObject({ parsed: 1, outOfWindow: 1, queued: 0, suggested: 0 })
    expect(result.preview).toEqual([
      { round: null, timing: 'out_of_window', sender: 'Ana Prueba', amount: 150, suggested: null, reason: 'out_of_window' },
    ])
  })
})

describe('confirmMatch and dismissReview in the store', () => {

  it('confirmMatch marks only that member paid, closes the review, and saves the alias', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto'], contribution: 150 })
    db.pending_review = [{
      id: 'rv1', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Ana Prueba',
      amount: 150, received_at: at, suggested_member_id: 'member-1',
    }]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pendingReview).toHaveLength(1)
    expect(fake.tables.payments.every(p => p.paid_at === null)).toBe(true) // detection alone paid no one

    await act(() => result.current.confirmMatch('rv1', 'member-1'))
    const paid = fake.tables.payments.filter(p => p.paid_at)
    expect(paid).toEqual([expect.objectContaining({ round_id: 'round-1', member_id: 'member-1', paid_at: at, source: 'auto' })])
    expect(fake.tables.pending_review[0]).toMatchObject({ status: 'matched', suggested_member_id: 'member-1' })
    expect(fake.tables.payer_aliases).toEqual([expect.objectContaining({ member_id: 'member-1', alias_name: 'Ana Prueba' })])
    expect(result.current.pendingReview).toHaveLength(0)
  })

  it('refuses a Match whose amount is not the payment amount, and keeps a hand-marked payment as is', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto'], contribution: 150 })
    db.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-2').paid_at = '2026-06-12T18:00:00.000Z'
    db.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-2').source = 'manual'
    db.pending_review = [
      { id: 'rv3', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Ana Prueba', amount: 75, received_at: at },
      { id: 'rv4', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Beto Ejemplo', amount: 150, received_at: at },
    ]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.confirmMatch('rv3', 'member-1'))
    expect(result.current.error).toMatch(/does not match/)
    expect(fake.tables.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-1').paid_at).toBeNull()
    expect(fake.tables.pending_review.find(r => r.id === 'rv3').status).toBe('pending')

    await act(() => result.current.confirmMatch('rv4', 'member-2'))
    expect(fake.tables.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-2'))
      .toMatchObject({ paid_at: '2026-06-12T18:00:00.000Z', source: 'manual' })
    expect(fake.tables.pending_review.find(r => r.id === 'rv4').status).toBe('matched')
  })

  it('refuses Match when the cycle is archived and does not pay anyone', async () => {
    const db = seedCycle({ names: ['Ana'], contribution: 150 })
    db.cycles[0].status = 'archived'
    db.pending_review = [{
      id: 'rv-arch', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending',
      sender_name: 'Ana Prueba', amount: 150, received_at: at,
    }]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.confirmMatch('rv-arch', 'member-1', 'round-1'))
    expect(result.current.error).toMatch(/cycle is archived/)
    expect(fake.tables.payments.every(p => p.paid_at === null)).toBe(true)
    expect(fake.tables.pending_review[0]).toMatchObject({ status: 'pending', round_id: 'round-1' })
    expect(fake.tables.payer_aliases).toEqual([])
  })

  it('dismissReview sets the row aside, keeps an optional reason, and pays nobody', async () => {
    const db = seedCycle({ names: ['Ana'], contribution: 150 })
    db.pending_review = [{ id: 'rv2', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Zoe Nadie', amount: 20, received_at: at }]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.dismissReview('rv2', 'combined'))
    expect(fake.tables.pending_review[0]).toMatchObject({ status: 'ignored', dismiss_reason: 'combined' })
    expect(fake.tables.payments.every(p => p.paid_at === null)).toBe(true)
  })

  it('confirmMatch pays the round the admin picked', async () => {
    const db = seedCycle({ names: ['Ana', 'Beto'], contribution: 150 })
    db.pending_review = [{
      id: 'rv5', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Ana Prueba',
      amount: 150, received_at: at, suggested_member_id: 'member-1',
    }]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.confirmMatch('rv5', 'member-1', 'round-2'))
    expect(fake.tables.payments.find(p => p.round_id === 'round-2' && p.member_id === 'member-1'))
      .toMatchObject({ paid_at: at, source: 'auto' })
    expect(fake.tables.payments.find(p => p.round_id === 'round-1' && p.member_id === 'member-1').paid_at).toBeNull()
    expect(fake.tables.pending_review[0]).toMatchObject({ status: 'matched', round_id: 'round-2' })
  })
})
