import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LABELS } from '../data/labels'
import NeedsReviewCard from '../components/admin/NeedsReviewCard'

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

