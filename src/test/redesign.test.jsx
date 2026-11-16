import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LABELS } from '../data/labels'
import NeedsReviewCard from '../components/admin/NeedsReviewCard'
import MemberAvatarGrid from '../components/admin/MemberAvatarGrid'
import RoundStepper from '../components/public/RoundStepper'

const t = LABELS.en

describe('Needs review', () => {
  it('stays hidden when there is nothing to match', () => {
    const { container } = render(<NeedsReviewCard items={[]} t={t} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Match')).toBeNull()
  })

  it('shows an unmatched Zelle row and a match button that does not write', () => {
    render(
      <NeedsReviewCard
        t={t}
        items={[{ id: 'rev-1', sender_name: 'J. LOPEZ', amount: 200, status: 'pending' }]}
      />,
    )
    expect(screen.getByText('Zelle from J. LOPEZ $200')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Match' })).toBeDisabled()
  })
})

describe('member avatar grid', () => {
  const members = [
    { slot: 1, name: 'Maria', paid: true, phone: '(555) 010-0101' },
    { slot: 2, name: 'Rosa', paid: false, phone: '(555) 010-0102' },
    { slot: 3, name: 'Ana', paid: false, phone: '' },
  ]

  it('offers a nudge only to unpaid members who have a phone', () => {
    render(
      <MemberAvatarGrid
        members={members}
        contribution={100}
        zelle="familia.demo"
        collectDate="2099-06-12"
        t={t}
        onSelect={() => {}}
      />,
    )
    const nudges = screen.getAllByRole('link', { name: /Nudge/ })
    expect(nudges).toHaveLength(1)
    expect(nudges[0].getAttribute('href')).toMatch(/^sms:/)
    expect(screen.queryByText('(555) 010-0102')).toBeNull()
  })
})

describe('round stepper', () => {
  it('marks past, current, and future rounds', () => {
    render(
      <RoundStepper
        label="Rounds"
        rounds={[
          { round: 1, state: 'past' },
          { round: 2, state: 'current' },
          { round: 3, state: 'future' },
        ]}
      />,
    )
    expect(screen.getByRole('listitem', { name: '1' }).getAttribute('data-state')).toBe('past')
    expect(screen.getByRole('listitem', { name: '2' }).getAttribute('data-state')).toBe('current')
    expect(screen.getByRole('listitem', { name: '3' }).getAttribute('data-state')).toBe('future')
  })
})
