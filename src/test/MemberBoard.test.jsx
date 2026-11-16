import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MemberBoard from '../components/public/MemberBoard'
import MemberLinkNotice from '../components/public/MemberLinkNotice'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))

const TOKEN = 'test-token-ada-0001'

function board({ paid = false, status = 'active' } = {}) {
  return {
    cycle: { name: 'Tanda 2099', contribution: 80, status, start_date: '2099-06-01', interval_days: 14 },
    me: {
      slot: 1,
      display_first_name: 'Ada',
      language_pref: 'en',
      payout_date: '2099-06-02',
      paid_this_round: paid,
      phone: '5550100199',
    },
    current_round: {
      round_number: 1,
      collect_date: '2099-06-01',
      payout_date: '2099-06-02',
      payout_sent: false,
      recipient_first_name: 'Bea',
    },
    progress: [
      { slot: 1, display_first_name: 'Ada', paid, is_recipient: false },
      { slot: 2, display_first_name: 'Bea', paid: true, is_recipient: true },
    ],
  }
}

function renderBoard(token = TOKEN) {
  return render(
    <MemoryRouter initialEntries={[`/m/${token}`]}>
      <Routes>
        <Route path="/m/:token" element={<MemberBoard />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  document.querySelectorAll('meta[name="robots"], meta[name="referrer"]').forEach(node => node.remove())
})

describe('member board', () => {
  it('shows status, payout date, recipient, and first names only', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    renderBoard()

    expect(await screen.findByText(/Your payment is pending this round/)).toBeTruthy()
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bea').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Jun 2/).length).toBeGreaterThan(0)
    expect(screen.getByText(/\$80 per person/)).toBeTruthy()
    expect(screen.queryByText('5550100199')).toBeNull()
    expect(screen.queryByText(/\$200/)).toBeNull()
    expect(screen.queryByText(/\$2,400/)).toBeNull()
    expect(document.querySelector('meta[name="robots"]').content).toContain('noindex')
    expect(document.querySelector('meta[name="referrer"]').content).toBe('no-referrer')
  })

  it('switches between English and Spanish', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    const user = userEvent.setup()
    renderBoard()
    await screen.findByText(/pending this round/)

    await user.click(screen.getByLabelText('Toggle language'))
    expect(screen.getByText(/pendiente esta ronda/)).toBeTruthy()

    await user.click(screen.getByLabelText('Toggle language'))
    expect(screen.getByText(/pending this round/)).toBeTruthy()
  })

  it('flips to paid when the board is refetched', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    supabase.rpc
      .mockResolvedValueOnce({ data: board({ paid: false }), error: null })
      .mockResolvedValue({ data: board({ paid: true }), error: null })
    renderBoard()
    expect(await screen.findByText(/pending this round/)).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByText(/paid for this round/)).toBeTruthy()
    expect(supabase.rpc).toHaveBeenCalledWith('get_member_board', { p_token: TOKEN })
    expect(screen.queryByText('5550100199')).toBeNull()
  })

  it('says the tanda is complete for an archived cycle', async () => {
    supabase.rpc.mockResolvedValue({ data: board({ status: 'archived', paid: true }), error: null })
    renderBoard()
    expect(await screen.findByText('Tanda Complete!')).toBeTruthy()
  })

  it('shows a bilingual message for a bad token', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'not found' } })
    renderBoard('not-a-real-token-value')

    expect(await screen.findByText('Link not found')).toBeTruthy()
    expect(screen.getByText('Enlace no encontrado')).toBeTruthy()
    expect(screen.queryByText(/P0002/)).toBeNull()
    expect(screen.queryByText('not-a-real-token-value')).toBeNull()
  })
})

describe('landing page', () => {
  it('points members at their texted link and organizers at sign in', () => {
    render(
      <MemoryRouter basename="/tanda-manager" initialEntries={['/tanda-manager/']}>
        <MemberLinkNotice />
      </MemoryRouter>,
    )
    expect(screen.getByText('Open the link the organizer texted you')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Organizer sign in' })).toHaveAttribute('href', '/tanda-manager/admin')
    expect(screen.queryByText(/Public Board/)).toBeNull()
  })
})
