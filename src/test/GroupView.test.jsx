import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MemberExperience from '../components/public/MemberExperience'

const board = {
  cycle: { name: 'Demo', contribution: 100, status: 'active', timezone: 'America/Los_Angeles', zelle_destination: 'demo' },
  me: { slot: 2, display_first_name: 'Rosa', language_pref: 'en', payout_date: '2099-01-16', paid_this_round: false },
  current_round: { round_number: 1, collect_date: '2099-01-08', payout_date: '2099-01-09', payout_sent: false, recipient_first_name: 'Ana' },
  progress: [
    { slot: 1, display_first_name: 'Ana', paid: true, is_recipient: true },
    { slot: 2, display_first_name: 'Rosa', paid: false, is_recipient: false },
    { slot: 3, display_first_name: 'Luis', paid: true, is_recipient: false },
  ],
  rounds: [
    { number: 1, collect_date: '2099-01-08', payout_date: '2099-01-09', recipient_first_name: 'Ana' },
    { number: 2, collect_date: '2099-01-15', payout_date: '2099-01-16', recipient_first_name: 'Rosa' },
    { number: 3, collect_date: '2099-01-22', payout_date: '2099-01-23', recipient_first_name: 'Luis' },
  ],
}

async function openGroup(lang = 'en') {
  const user = userEvent.setup()
  render(<MemberExperience board={board} lang={lang} onToggleLang={() => {}} preview />)
  await user.click(screen.getByRole('button', { name: lang === 'es' ? 'Grupo' : 'Group' }))
}

describe('group tab', () => {
  it('shows everyone in this round, pending first, with the pot collected', async () => {
    await openGroup()
    expect(screen.getByText('Round 1 of 3')).toBeTruthy()
    expect(screen.getByText('$200 of $300 collected')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('67')

    const list = screen.getByRole('list', { name: 'Who has paid this round' })
    const rows = within(list).getAllByRole('listitem').map(li => li.textContent)
    expect(rows[0]).toMatch(/^RORosaYouPending$/)
    expect(rows.slice(1).every(r => r.endsWith('✓ Paid'))).toBe(true)
    expect(within(list).getByText(/Receives this round/)).toBeTruthy()
  })

  it('lists the payout order and marks my turn', async () => {
    await openGroup()
    const order = screen.getByRole('heading', { name: 'Payout order' }).parentElement
    const items = within(order).getAllByRole('listitem')
    expect(items.map(li => li.textContent.replace(/[A-Z][a-z]{2}, .*$/, ''))).toEqual(['1Ana', '2RosaYou', '3Luis'])
    expect(items[0].getAttribute('aria-current')).toBe('step')
  })

  it('is translated', async () => {
    await openGroup('es')
    expect(screen.getByText('$200 de $300 reunidos')).toBeTruthy()
    expect(screen.getByText('Orden de pagos')).toBeTruthy()
  })
})

describe('member home, action first', () => {
  it('unpaid: leads with the amount due, deadline and the copy button, and links to the group', async () => {
    const user = userEvent.setup()
    render(<MemberExperience board={board} lang="en" onToggleLang={() => {}} preview />)
    expect(screen.getByRole('heading', { name: '$100 due' })).toBeTruthy()
    expect(screen.getByText(/^Closes .*Jan 8 at 6:00 PM$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Zelle and pay' })).toBeEnabled()
    expect(screen.getByText('Your turn to receive')).toBeTruthy()
    expect(screen.getByText('2 of 3 paid')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'See group' }))
    expect(screen.getByRole('heading', { name: 'Payout order' })).toBeTruthy()
  })

  it('paid: confirms and shows the next payment instead of the pay button', () => {
    const paidBoard = { ...board, me: { ...board.me, paid_this_round: true } }
    render(<MemberExperience board={paidBoard} lang="en" onToggleLang={() => {}} preview />)
    expect(screen.getByRole('heading', { name: "You're paid" })).toBeTruthy()
    expect(screen.getByText(/^Next payment: .*Jan 15 · \$100$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy Zelle and pay' })).toBeNull()
  })
})
