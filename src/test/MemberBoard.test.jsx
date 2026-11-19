import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MemberBoard from '../components/public/MemberBoard'
import MemberLinkNotice from '../components/public/MemberLinkNotice'
import { supabase } from '../lib/supabase'
import { LABELS } from '../data/labels'

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
    rounds: [
      { number: 1, collect_date: '2099-06-01', payout_date: '2099-06-02', recipient_first_name: 'Ada' },
      { number: 2, collect_date: '2099-07-03', payout_date: '2099-07-04', recipient_first_name: 'Bea' },
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

describe('home-screen icon opens the member board', () => {
  function renderApp(path) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<MemberLinkNotice />} />
          <Route path="/m/:token" element={<MemberBoard />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('remembers a working link, and the start page goes back to it', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    const first = renderBoard()
    expect(await screen.findByText('$80 due')).toBeTruthy()
    // The link is saved in an effect after the board shows; wait for it rather than racing it.
    await waitFor(() => expect(localStorage.getItem('tanda_member_token')).toBe(TOKEN))
    first.unmount()

    renderApp('/') // what a home-screen icon opens
    expect(await screen.findByText('$80 due')).toBeTruthy()
    expect(supabase.rpc).toHaveBeenLastCalledWith('get_member_board', { p_token: TOKEN })
  })

  it('forgets a link that stopped working, so the start page shows the normal message', async () => {
    localStorage.setItem('tanda_member_token', TOKEN)
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'not found' } })
    const first = renderApp('/')
    expect(await screen.findByText('Link not found')).toBeTruthy()
    await waitFor(() => expect(localStorage.getItem('tanda_member_token')).toBeNull())
    first.unmount()

    renderApp('/')
    expect(screen.getByText(LABELS.en.useLinkTitle)).toBeTruthy()
  })

  it('"Forget this phone" on the Profile tab clears the saved link and shows the landing page', async () => {
    const user = userEvent.setup()
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    renderApp(`/m/${TOKEN}`)
    expect(await screen.findByText('$80 due')).toBeTruthy()
    await waitFor(() => expect(localStorage.getItem('tanda_member_token')).toBe(TOKEN))

    await user.click(screen.getByRole('button', { name: /Profile/ }))
    await user.click(screen.getByText('Forget this phone'))

    expect(localStorage.getItem('tanda_member_token')).toBeNull()
    expect(screen.getByText(LABELS.en.useLinkTitle)).toBeTruthy()
  })

  it('shows the normal landing page on a phone that never opened a link', () => {
    renderApp('/')
    expect(screen.getByText(LABELS.en.useLinkTitle)).toBeTruthy()
  })
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  document.querySelectorAll('meta[name="robots"], meta[name="referrer"]').forEach(node => node.remove())
})

describe('member board', () => {
  it('shows status, payout date, recipient, and first names only', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    renderBoard()

    expect(await screen.findByText('$80 due')).toBeTruthy()
    expect(screen.getByText(/Hi, Ada!/)).toBeTruthy()
    expect(screen.getAllByText(/\$160/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Jun 2/).length).toBeGreaterThan(0)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.getAllByText('Bea').length).toBeGreaterThan(0)
    expect(screen.getByText(/Jul 4/)).toBeTruthy()
    expect(screen.queryByText(/Jun 16/)).toBeNull()
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
    await screen.findByText('$80 due')

    await user.click(screen.getByLabelText('Toggle language'))
    expect(screen.getByText('Debes $80')).toBeTruthy()
    expect(screen.getByText(/¡Hola, Ada!/)).toBeTruthy()
    expect(screen.getByLabelText('Cambiar idioma')).toBeTruthy()

    await user.click(screen.getByLabelText('Cambiar idioma'))
    expect(screen.getByText('$80 due')).toBeTruthy()
  })

  it('flips to paid when the board is refetched', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    supabase.rpc
      .mockResolvedValueOnce({ data: board({ paid: false }), error: null })
      .mockResolvedValue({ data: board({ paid: true }), error: null })
    renderBoard()
    expect(await screen.findByText('$80 due')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByText("You're paid")).toBeTruthy()
    expect(supabase.rpc).toHaveBeenCalledWith('get_member_board', { p_token: TOKEN })
    expect(screen.queryByText('5550100199')).toBeNull()
  })

  it('never opens a Realtime channel and refetches when the tab regains focus (N8)', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: board({ paid: false }), error: null })
      .mockResolvedValue({ data: board({ paid: true }), error: null })
    renderBoard()
    expect(await screen.findByText('$80 due')).toBeTruthy()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(await screen.findByText("You're paid")).toBeTruthy()
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('says the tanda is complete for an archived cycle', async () => {
    supabase.rpc.mockResolvedValue({ data: board({ status: 'archived', paid: true }), error: null })
    renderBoard()
    expect(await screen.findByText('Tanda Complete!')).toBeTruthy()
  })

  it('shows Cargando while a Spanish member waits for the board', () => {
    localStorage.setItem('tanda_lang', 'es')
    supabase.rpc.mockReturnValue(new Promise(() => {}))
    renderBoard()
    expect(screen.getByText('Cargando…')).toBeTruthy()
  })

  it('copies the organizer Zelle handle without showing it', async () => {
    const data = board()
    data.cycle.zelle_destination = 'familia.demo'
    supabase.rpc.mockResolvedValue({ data, error: null })
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Copy Zelle and pay' }))

    expect(writeText).toHaveBeenCalledWith('familia.demo')
    expect(await screen.findByRole('status')).toHaveTextContent('Copied')
    expect(screen.queryByText('familia.demo')).toBeNull()
    expect(screen.queryByText('5550100199')).toBeNull()
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

describe('member page highlights', () => {
  it('says who receives this round and marks my own round with You', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null })
    const user = userEvent.setup()
    renderBoard()
    expect(await screen.findByText('This round goes to Bea 🎉')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Tanda 2099' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Group' }))
    const order = screen.getByRole('heading', { name: 'Payout order' }).parentElement
    const mine = within(order).getByText('You').closest('li')
    expect(mine.textContent).toMatch(/Ada/)
    expect(screen.queryByRole('button', { name: 'My Rounds' })).toBeNull()
  })

  it('thanks a member once when their payment lands', async () => {
    supabase.rpc.mockResolvedValue({ data: board({ paid: true }), error: null })
    const user = userEvent.setup()
    const first = renderBoard()
    expect(await screen.findByRole('dialog', { name: 'Thank you, Ada! 💕' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Yay!' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    first.unmount()

    renderBoard()
    expect(await screen.findByText("You're paid")).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('celebrates the round that is mine', async () => {
    const data = board()
    data.progress = data.progress.map(p => ({ ...p, is_recipient: p.slot === 1 }))
    data.current_round.recipient_first_name = 'Ada'
    supabase.rpc.mockResolvedValue({ data, error: null })
    renderBoard()
    expect(await screen.findByRole('dialog', { name: "It's your turn, Ada! 🎉" })).toBeTruthy()
    expect(screen.getByText('This round is yours! 🎉')).toBeTruthy()
  })

  it('organizer preview saves nothing on the phone and hides Forget this phone', async () => {
    localStorage.setItem('tanda_lang', 'es')
    supabase.rpc.mockResolvedValue({ data: board({ paid: true }), error: null })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/m/${TOKEN}?preview=1`]}>
        <Routes>
          <Route path="/m/:token" element={<MemberBoard />} />
        </Routes>
      </MemoryRouter>,
    )
    // Ada's language_pref is en, so the preview ignores this phone's Spanish setting.
    expect(await screen.findByText(/Preview: this is what Ada sees/)).toBeTruthy()
    expect(screen.getByText("You're paid")).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('tanda_member_token')).toBeNull()
    expect(localStorage.getItem('tanda_seen_paid_1')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Profile/ }))
    expect(screen.queryByText('Forget this phone')).toBeNull()
  })
})
