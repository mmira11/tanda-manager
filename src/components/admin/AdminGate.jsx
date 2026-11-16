// src/components/admin/AdminGate.jsx — Supabase session + is_admin() in front of every admin screen.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { StoreProvider, useStore } from '../../context/StoreContext'
import AdminDashboard from './AdminDashboard'
import CreateCycleForm from './CreateCycleForm'
import ImportBackup from './ImportBackup'

function Screen({ children }) {
  return (
    <div className="admin-theme min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">{children}</div>
    </div>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}admin`,
        shouldCreateUser: false,
      },
    })
    if (error) {
      setStatus('error')
      setError(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <Screen>
      <div className="text-4xl mb-3">🔐</div>
      <h1 className="text-2xl font-bold text-gray-900">Admin Sign In</h1>
      {status === 'sent' ? (
        <p className="text-gray-600 mt-3 text-sm">
          Check <strong>{email.trim()}</strong> for a sign-in link. You can close this tab.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            aria-label="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500"
          />
          {status === 'error' && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </Screen>
  )
}

function NotAdmin({ email }) {
  return (
    <Screen>
      <div className="text-4xl mb-3">🚫</div>
      <h1 className="text-xl font-bold text-gray-900">Not an admin</h1>
      <p className="text-gray-500 mt-2 text-sm">{email} is signed in but doesn't have admin access.</p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-6 w-full border-2 border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50"
      >
        Sign out
      </button>
    </Screen>
  )
}

function AdminHome({ email }) {
  const { store, loading, error, reload } = useStore()
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const cycleId = store?.config?.cycleId
  const cycleBeforeCreate = useRef(null)

  useEffect(() => {
    if (creating && cycleId && cycleId !== cycleBeforeCreate.current) setCreating(false)
  }, [creating, cycleId])

  useEffect(() => {
    if (importing && store && !creating) setImporting(false)
  }, [importing, store, creating])

  if (loading) return <Screen><p className="text-gray-500">Loading…</p></Screen>
  if (!store && error && !creating) {
    return (
      <Screen>
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={reload} className="mt-4 text-gold-600 font-semibold">Try again</button>
      </Screen>
    )
  }
  if (importing && (!store || creating)) {
    return (
      <div className="admin-theme min-h-screen bg-ink p-4">
        <div className="max-w-lg mx-auto">
          <ImportBackup onCancel={() => setImporting(false)} />
        </div>
      </div>
    )
  }
  if (!store || creating) {
    return (
      <CreateCycleForm
        onImport={() => setImporting(true)}
        onCancel={creating ? () => setCreating(false) : undefined}
      />
    )
  }
  return (
    <AdminDashboard
      email={email}
      onNewCycle={() => {
        cycleBeforeCreate.current = cycleId
        setCreating(true)
      }}
    />
  )
}

export default function AdminGate() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [isAdmin, setIsAdmin] = useState(null)
  const userId = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setIsAdmin(null)
    if (!userId) return
    let cancelled = false
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!cancelled) setIsAdmin(!error && data === true)
    })
    return () => { cancelled = true }
  }, [userId])

  if (session === undefined || (session && isAdmin === null)) {
    return <Screen><p className="text-gray-500">Loading…</p></Screen>
  }
  if (!session) return <SignIn />
  if (!isAdmin) return <NotAdmin email={session.user.email} />
  return (
    <StoreProvider>
      <AdminHome email={session.user.email} />
    </StoreProvider>
  )
}
