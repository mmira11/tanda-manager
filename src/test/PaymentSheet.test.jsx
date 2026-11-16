import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentSheet from '../components/admin/PaymentSheet'
import { LABELS } from '../data/labels'

const member = { slot: 2, name: 'Rosa', paid: false }

function openSheet(props = {}) {
  const onClose = vi.fn()
  const onToggle = vi.fn()
  render(
    <PaymentSheet
      member={member}
      t={LABELS.en}
      readOnly={false}
      onClose={onClose}
      onToggle={onToggle}
      {...props}
    />,
  )
  return { onClose, onToggle }
}

describe('payment sheet', () => {
  it('focuses Mark paid, traps Tab, and closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = openSheet()
    const dialog = screen.getByRole('dialog')
    const mark = within(dialog).getByRole('button', { name: 'Mark paid' })
    const close = within(dialog).getByRole('button', { name: 'Close' })

    expect(document.activeElement).toBe(mark)

    await user.tab()
    expect(document.activeElement).toBe(close)

    await user.tab()
    expect(document.activeElement).toBe(mark)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(close)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not focus a disabled mark button on an archived cycle', () => {
    openSheet({ readOnly: true })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Mark paid' })).toBeDisabled()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }))
  })
})
