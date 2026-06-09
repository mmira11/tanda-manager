import { useState } from 'react'
import { useStore } from '../../context/StoreContext'

export default function SetupWizard() {
  const { saveConfig } = useStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    organizerName: 'Miguel',
    organizerPhone: '',
    pin: '',
    pinConfirm: '',
  })
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function goToStep2() {
    const errs = {}
    if (!form.organizerName.trim()) errs.organizerName = 'Name is required'
    if (!form.organizerPhone.trim()) errs.organizerPhone = 'Phone is required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setStep(2)
  }

  function finish() {
    const errs = {}
    if (form.pin.length < 4) errs.pin = 'PIN must be at least 4 digits'
    if (form.pin !== form.pinConfirm) errs.pinConfirm = 'PINs do not match'
    if (Object.keys(errs).length) { setErrors(errs); return }
    saveConfig({
      organizerName: form.organizerName.trim(),
      organizerPhone: form.organizerPhone.trim(),
      organizerSlot: 11,
      pin: form.pin,
      initialized: true,
    })
  }

  return (
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Tanda Manager</h1>
          <p className="text-gray-500 mt-1 text-sm">
            <span className={step === 1 ? 'text-gold-600 font-semibold' : 'text-gray-400'}>Step 1</span>
            <span className="mx-2 text-gray-300">→</span>
            <span className={step === 2 ? 'text-gold-600 font-semibold' : 'text-gray-400'}>Step 2</span>
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500 transition-colors"
                value={form.organizerName}
                onChange={e => set('organizerName', e.target.value)}
                placeholder="Your name"
              />
              {errors.organizerName && <p className="text-red-500 text-xs mt-1">{errors.organizerName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Phone (Zelle number)</label>
              <input
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500 transition-colors"
                value={form.organizerPhone}
                onChange={e => set('organizerPhone', e.target.value)}
                placeholder="(209) 362-0911"
                inputMode="tel"
              />
              {errors.organizerPhone && <p className="text-red-500 text-xs mt-1">{errors.organizerPhone}</p>}
            </div>
            <div className="bg-gold-50 border border-gold-200 rounded-xl p-3 text-sm text-gray-700">
              You are <strong>slot 11</strong> — both organizer and participant in the Tanda.
            </div>
            <button
              onClick={goToStep2}
              className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-2">
              Create a PIN to protect your admin dashboard. You'll enter this each time you open it.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Create PIN (4–8 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500"
                value={form.pin}
                onChange={e => set('pin', e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
              />
              {errors.pin && <p className="text-red-500 text-xs mt-1">{errors.pin}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500"
                value={form.pinConfirm}
                onChange={e => set('pinConfirm', e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
              {errors.pinConfirm && <p className="text-red-500 text-xs mt-1">{errors.pinConfirm}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border-2 border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={finish}
                className="flex-1 bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Finish Setup ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
