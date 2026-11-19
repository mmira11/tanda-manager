import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeSupabase, seedCycle } from './fakeSupabase'
import { StoreProvider, useStore } from '../context/StoreContext'
import AdminDashboard from '../components/admin/AdminDashboard'
import { linkMessage } from '../components/admin/MembersView'

vi.mock('../lib/supabase', async () => (await import('./fakeSupabase')).mockModule())

function Loaded() {
  const { store } = useStore()
  return store ? <AdminDashboard email="admin@example.com" onNewCycle={() => {}} /> : null
}

async function open(tab, db = seedCycle({ names: ['Ada', 'Bea', 'Cal'], contribution: 200 })) {
  const fake = installFakeSupabase({ db })
  const user = userEvent.setup()
  render(<StoreProvider><Loaded /></StoreProvider>)
  await user.click(await screen.findByRole('button', { name: tab }))
  return { fake, user }
}
const member = (fake, slot) => fake.tables.members.find(m => m.slot === slot)

describe('Members', () => {
  it('shows one compact row per person and tracks links sent', async () => {
    const { fake, user } = await open('Members')
    expect(screen.getByRole('heading', { name: 'Members · 3' })).toBeTruthy()
    expect(screen.getByText('Links sent: 0 of 3')).toBeTruthy()
    const rows = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/^ADAdaENRound 1 · link not sentSend link⋯$/)

    const send = screen.getByRole('link', { name: 'Send Ada their link' })
    const body = decodeURIComponent(send.getAttribute('href').split('body=')[1])
    expect(body).toMatch(/^Hi Ada! Here's your private link for Test Tanda: http.*\/m\/test-token-1\n/)
    expect(body).toMatch(/¡Hola Ada! Este es tu enlace privado/)
    send.addEventListener('click', e => e.preventDefault())
    await user.click(send)
    await waitFor(() => expect(member(fake, 1).link_sent_at).toBeTruthy())
    expect(screen.getByText('Links sent: 1 of 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send Ada their link' }).textContent).toBe('Resend')
    expect(document.body.textContent).not.toMatch(/test-token|555/)
  })

  it('copies the link message when a member has no usable phone', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], contribution: 200 })
    db.members[1].phone = '555'
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const { fake, user } = await open('Members', db)
    await user.click(screen.getByRole('button', { name: "Copy Bea's link message" }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Hi Bea! .*\/m\/test-token-2/))
    await waitFor(() => expect(member(fake, 2).link_sent_at).toBeTruthy())
  })

  it('sets language, edits name and phone in the ⋯ sheet', async () => {
    const { fake, user } = await open('Members')
    await user.click(screen.getByRole('button', { name: 'More for Bea' }))
    const sheet = screen.getByRole('dialog', { name: 'Bea' })
    await user.click(within(sheet).getByRole('button', { name: 'Español' }))
    await waitFor(() => expect(member(fake, 2).language_pref).toBe('es'))

    await user.clear(within(sheet).getByLabelText('Phone'))
    await user.type(within(sheet).getByLabelText('Phone'), '555-010-0222')
    await user.clear(within(sheet).getByLabelText('First name'))
    await user.type(within(sheet).getByLabelText('First name'), 'Beatriz')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(member(fake, 2).display_first_name).toBe('Beatriz'))
    expect(member(fake, 2).phone).toBe('555-010-0222')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))
    const row = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')[1]
    expect(row.textContent).toMatch(/^BEBeatrizES/)
    const body = decodeURIComponent(screen.getByRole('link', { name: 'Send Beatriz their link' }).getAttribute('href').split('body=')[1])
    expect(body).toMatch(/^¡Hola Beatriz!/)
  })

  it('moves and removes from the sheet', async () => {
    const { fake, user } = await open('Members')
    await user.click(screen.getByRole('button', { name: 'More for Ada' }))
    expect(screen.getByRole('button', { name: 'Move earlier' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove from tanda…' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(member(fake, 1).removed_at).toBeTruthy())
    expect(member(fake, 1).token_revoked_at).toBeTruthy()
  })

  it('adds a member and opens a group text without any private links', async () => {
    const { fake, user } = await open('Members')
    const group = screen.getByRole('link', { name: 'Group text' })
    const body = decodeURIComponent(group.getAttribute('href').split('body=')[1])
    expect(body).toMatch(/Welcome to Test Tanda!/)
    expect(body).not.toMatch(/\/m\//)
    await user.click(screen.getByRole('button', { name: '+ Add' }))
    await user.type(screen.getByLabelText('New member first name'), 'Dee')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(fake.tables.members.some(m => m.display_first_name === 'Dee')).toBe(true))
  })

  it('archived: view only, no Send link or Add', async () => {
    const db = seedCycle({ names: ['Ada', 'Bea'], contribution: 200 })
    db.cycles[0].status = 'archived'
    await open('Members', db)
    expect(screen.queryByRole('link', { name: /their link/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Add' })).toBeNull()
    expect(screen.queryByText(/Links sent/)).toBeNull()
  })

  it('link message puts the member language first', () => {
    const person = { name: 'Ana', accessToken: 'tok-abc', language: 'es' }
    expect(linkMessage(person, 'Tanda')).toMatch(/^¡Hola Ana! .*tok-abc[\s\S]*\n\nHi Ana!/)
    expect(linkMessage({ ...person, language: 'en' }, 'Tanda')).toMatch(/^Hi Ana!/)
  })
})

describe('Settings', () => {
  it('saves your Zelle and shows the cycle summary', async () => {
    const { fake, user } = await open('Settings')
    expect(screen.getByText('$200 every 14 days')).toBeTruthy()
    const zelle = screen.getByLabelText('Members copy this to pay you')
    await user.clear(zelle)
    await user.type(zelle, '209-555-0101')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fake.tables.cycles[0].zelle_destination).toBe('209-555-0101'))
    expect(screen.queryByText(/Import backup/i)).toBeNull()
  })

  it('makes a Grokbot key, shows it once, and turns it off', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { fake, user } = await open('Settings')
    const card = screen.getByRole('heading', { name: 'Grokbot' }).closest('section')
    expect(await within(card).findByText('Off')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Make key' }))
    expect(await within(card).findByText(/won't be shown again/)).toBeTruthy()
    const key = within(card).getByText(/^tbk_/).textContent
    expect(within(card).getByText('On')).toBeTruthy()
    expect(fake.tables.bot_keys.filter(k => !k.revoked_at)).toHaveLength(1)
    expect(JSON.stringify(fake.tables.bot_keys)).not.toContain(`"${key}"`)

    await user.click(within(card).getByRole('button', { name: 'Turn off' }))
    expect(await within(card).findByText('Off')).toBeTruthy()
    expect(within(card).queryByText(/^tbk_/)).toBeNull()
    expect(fake.tables.bot_keys.every(k => k.revoked_at)).toBe(true)
  })
})
