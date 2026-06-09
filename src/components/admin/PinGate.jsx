import { useState } from 'react'
import { useStore } from '../../context/StoreContext'

export default function PinGate({ onUnlock }) {
  const { store } = useStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (pin === store.config.pin) {
      onUnlock()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Access</h1>
          <p className="text-gray-500 mt-1 text-sm">Enter your PIN to continue</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="Enter PIN"
            value={pin}
            autoFocus
            onChange={e => { setPin(e.target.value); setError(false) }}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500 mb-4"
          />
          {error && (
            <p className="text-red-500 text-sm text-center mb-4">Incorrect PIN. Try again.</p>
          )}
          <button
            type="submit"
            className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
