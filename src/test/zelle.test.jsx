// Phase 5 Zelle detection. Every email, sender, and amount here is made up.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  parseZelleEmail, normalizeName, matchMember, roundFor, scanEmails, verifySender, senderDomain, googleAuthResults,
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
import NeedsReviewCard from '../components/admin/NeedsReviewCard'
import { LABELS } from '../data/labels'
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

describe('roundFor', () => {
  const rounds = [
    { id: 'r1', round_number: 1, payout_date: '2026-06-13' },
    { id: 'r2', round_number: 2, payout_date: '2026-06-27' },
  ]
  it('uses the first round paying out on or after the day it arrived', () => {
    expect(roundFor('2026-06-12T19:30:00Z', rounds).id).toBe('r1')
    expect(roundFor('2026-06-14T08:00:00Z', rounds).id).toBe('r2') // Jun 14, 1:00 AM in LA
  })
  it('counts the day in Los Angeles time, not UTC', () => {
    // 06:30 UTC on Jun 14 is 11:30 PM on Jun 13 in LA: still round 1's payout day.
    expect(roundFor('2026-06-14T06:30:00Z', rounds).id).toBe('r1')
  })
  it('falls back to the last round after the schedule ends', () => {
    expect(roundFor('2026-12-01T00:00:00Z', rounds).id).toBe('r2')
  })
})

describe('scanEmails', () => {
  const cycle = { id: 'c1', contribution: 150, timezone: 'America/Los_Angeles' }
  const rounds = [{ id: 'r1', round_number: 1, payout_date: '2026-06-13' }]
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
    expect(result.counts).toEqual({ seen: 5, unverified: 1, parsed: 2, unparsed: 1, alreadyQueued: 1, queued: 2, suggested: 1, unmatched: 1 })
    expect(result.preview).toEqual([
      { round: 1, sender: 'Ana Prueba', amount: 150, suggested: 'Ana', reason: 'first_name' },
      { round: 1, sender: 'Zoe Nadie', amount: 150, suggested: null, reason: 'no_match' },
    ])
    expect(JSON.stringify(result.counts)).not.toMatch(/Ana|Zoe|150/)
  })

  it('a real run queues pending_review rows only, never payments', async () => {
    const rows = []
    const result = await scanEmails({ emails: emails.slice(0, 2), cycle, rounds, members, aliases: [], existingIds: new Set(), dryRun: false, insert: async row => rows.push(row), allowedDomains: BANK })
    expect(result.preview).toBeUndefined()
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'pending' && row.round_id === 'r1')).toBe(true)
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
})

describe('Match and Not tanda on the Needs-review card', () => {
  const t = LABELS.en
  const participants = [{ id: 'm1', slot: 1, name: 'Ana' }, { id: 'm2', slot: 2, name: 'Beto' }]
  const item = { id: 'rv1', sender_name: 'Ana Prueba', amount: 150, suggested_member_id: 'm1', round_id: 'r1' }

  it('pre-selects the suggestion and calls onMatch with the chosen member', async () => {
    const onMatch = vi.fn()
    const user = userEvent.setup()
    render(<NeedsReviewCard items={[item]} t={t} participants={participants} onMatch={onMatch} onDismiss={vi.fn()} />)
    expect(screen.getByLabelText('Who paid?').value).toBe('m1')
    await user.selectOptions(screen.getByLabelText('Who paid?'), 'm2')
    await user.click(screen.getByText('Match'))
    expect(onMatch).toHaveBeenCalledWith('rv1', 'm2')
  })

  it('keeps Match disabled until a member is chosen, and on archived cycles', () => {
    const { rerender } = render(<NeedsReviewCard items={[{ ...item, suggested_member_id: null }]} t={t} participants={participants} onMatch={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Match').disabled).toBe(true)
    rerender(<NeedsReviewCard items={[item]} t={t} participants={participants} readOnly onMatch={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Match').disabled).toBe(true)
  })

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

  it('dismissReview marks it not tanda without paying anyone', async () => {
    const db = seedCycle({ names: ['Ana'], contribution: 150 })
    db.pending_review = [{ id: 'rv2', cycle_id: 'cycle-1', round_id: 'round-1', status: 'pending', sender_name: 'Zoe Nadie', amount: 20, received_at: at }]
    const fake = installFakeSupabase({ db })
    const { result } = renderHook(() => useCycleStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.dismissReview('rv2'))
    expect(fake.tables.pending_review[0].status).toBe('ignored')
    expect(fake.tables.payments.every(p => p.paid_at === null)).toBe(true)
  })
})
