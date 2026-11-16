import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeSupabase, seedCycle, adminSession } from './fakeSupabase'
import AdminGate from '../components/admin/AdminGate'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

describe('AdminGate', () => {
  it('signed out: sends a magic link that returns to /tanda-manager/admin', async () => {
    const fake = installFakeSupabase()
    const user = userEvent.setup()
    render(<AdminGate />)

    await user.type(await screen.findByLabelText('Email'), 'admin@example.com')
    await user.click(screen.getByText('Email me a sign-in link'))

    expect(await screen.findByText(/for a sign-in link/)).toBeTruthy()
    const { email, options } = fake.auth.signInWithOtp.mock.calls[0][0]
    expect(email).toBe('admin@example.com')
    expect(options.emailRedirectTo).toBe(`${window.location.origin}/tanda-manager/admin`)
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('signed in but not in admins: shows no data and offers sign out', async () => {
    const fake = installFakeSupabase({ session: adminSession, isAdmin: false })
    render(<AdminGate />)

    expect(await screen.findByText('Not an admin')).toBeTruthy()
    expect(fake.rpc).toHaveBeenCalledWith('is_admin')
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('admin with an active cycle: shows the dashboard', async () => {
    installFakeSupabase({ session: adminSession, isAdmin: true, db: seedCycle({ names: ['Ana', 'Beto', 'Cata'] }) })
    render(<AdminGate />)

    expect(await screen.findByRole('button', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Test Tanda')).toBeTruthy()
    expect(screen.getByText('admin@example.com')).toBeTruthy()
  })
})

describe('first run: create a cycle', () => {
  async function openForm() {
    const fake = installFakeSupabase({ session: adminSession, isAdmin: true })
    const user = userEvent.setup()
    render(<AdminGate />)
    await screen.findByText('Create a cycle')
    return { fake, user }
  }

  it('refuses to save until required fields are filled', async () => {
    const { fake, user } = await openForm()
    await user.click(screen.getByText('Create cycle'))

    expect(screen.getByText('Name is required')).toBeTruthy()
    expect(screen.getByText('Start date is required')).toBeTruthy()
    expect(screen.getByText('Enter a positive amount in dollars and cents')).toBeTruthy()
    expect(fake.tables.cycles).toHaveLength(0)
  })

  it('generates rounds and payment rows from the form, in payout order', async () => {
    const { fake, user } = await openForm()
    await user.type(screen.getByLabelText('Cycle name'), 'Tanda 2027')
    fireEvent.change(screen.getByLabelText('First collection date'), { target: { value: '2027-01-08' } })
    await user.clear(screen.getByLabelText('Days between rounds'))
    await user.type(screen.getByLabelText('Days between rounds'), '7')
    await user.type(screen.getByLabelText('Contribution per person ($)'), '150')
    await user.click(screen.getByText('+ Add member'))
    await user.type(screen.getByLabelText('Member 1 first name'), 'Ana')
    await user.type(screen.getByLabelText('Member 1 phone'), '5550000001')
    await user.type(screen.getByLabelText('Member 2 first name'), 'Beto')
    await user.type(screen.getByLabelText('Member 3 first name'), 'Cata')
    await user.click(screen.getByLabelText('Move member 3 up')) // Cata now pays out before Beto

    expect(screen.getByText(/3 rounds · \$450 pot each round/)).toBeTruthy()
    await user.click(screen.getByText('Create cycle'))

    expect(await screen.findByText('Round 1 of 3')).toBeTruthy()
    expect(screen.getByText('$450')).toBeTruthy()

    const [cycle] = fake.tables.cycles
    expect(cycle).toMatchObject({ name: 'Tanda 2027', start_date: '2027-01-08', interval_days: 7, contribution: 150, status: 'active' })
    const bySlot = Object.fromEntries(fake.tables.members.map(m => [m.slot, m]))
    expect([1, 2, 3].map(s => bySlot[s].display_first_name)).toEqual(['Ana', 'Cata', 'Beto'])
    expect(bySlot[1].phone).toBe('5550000001')
    expect(bySlot[2].phone).toBeNull()

    const rounds = [...fake.tables.rounds].sort((a, b) => a.round_number - b.round_number)
    expect(rounds.map(r => [r.collect_date, r.payout_date])).toEqual([
      ['2027-01-08', '2027-01-09'], ['2027-01-15', '2027-01-16'], ['2027-01-22', '2027-01-23'],
    ])
    expect(rounds.map(r => r.recipient_member_id)).toEqual([bySlot[1].id, bySlot[2].id, bySlot[3].id])

    expect(fake.tables.payments).toHaveLength(9)
    expect(fake.tables.payments.every(p => p.amount === 150 && p.paid_at === null)).toBe(true)
  })
})

describe('spanish admin chrome', () => {
  afterEach(() => localStorage.clear())

  it('translates cycle controls and the navigation label', async () => {
    localStorage.setItem('tanda_lang', 'es')
    installFakeSupabase({ session: adminSession, isAdmin: true, db: seedCycle({ names: ['Ana', 'Beto'] }) })
    const user = userEvent.setup()
    render(<AdminGate />)

    expect(await screen.findByRole('navigation', { name: 'Administración' })).toBeTruthy()
    expect(screen.getByLabelText('Cambiar idioma')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nuevo ciclo' })).toBeDisabled()
    expect(screen.getByLabelText('Ciclo')).toBeTruthy()
  })

  it('shows the archived banner in Spanish', async () => {
    localStorage.setItem('tanda_lang', 'es')
    const db = seedCycle({ names: ['Ana', 'Beto'], name: 'Finished' })
    db.cycles[0].status = 'archived'
    installFakeSupabase({ session: adminSession, isAdmin: true, db })
    render(<AdminGate />)
    expect(await screen.findByText('Ciclo archivado. El historial incluye cada ronda, también la última.')).toBeTruthy()
  })
})

describe('sign out', () => {
  it('returns to the sign-in screen', async () => {
    const fake = installFakeSupabase({ session: adminSession, isAdmin: true, db: seedCycle({ names: ['Ana', 'Beto'] }) })
    const user = userEvent.setup()
    render(<AdminGate />)

    await user.click(await screen.findByText('Settings'))
    expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(1)
    await user.click(screen.getByText('Sign out'))

    await waitFor(() => expect(screen.getByText('Admin Sign In')).toBeTruthy())
    expect(fake.auth.signOut).toHaveBeenCalled()
  })
})
