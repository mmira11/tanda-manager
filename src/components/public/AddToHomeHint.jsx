import { useState } from 'react'

const KEY = 'tanda_home_hint_dismissed'

function shouldShow() {
  try {
    if (localStorage.getItem(KEY) === '1') return false
  } catch {
    return false
  }
  const standalone = window.navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)')?.matches === true
  return !standalone
}

// One-time card: how to put the member's page on the home screen. Hidden once it's there.
export default function AddToHomeHint({ t }) {
  const [show, setShow] = useState(shouldShow)
  if (!show) return null
  const ios = /iPhone|iPad|iPod/i.test(window.navigator.userAgent || '')

  function dismiss() {
    try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
    setShow(false)
  }

  return (
    <section className="bg-white rounded-3xl shadow-sm p-5 flex items-start gap-3">
      <span className="w-10 h-10 rounded-xl bg-coral/15 flex items-center justify-center shrink-0 text-lg" aria-hidden="true">📲</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-stone-900">{t.addHomeTitle}</h3>
        <p className="text-sm text-stone-600 mt-1">{ios ? t.addHomeIos : t.addHomeAndroid}</p>
        <button type="button" onClick={dismiss} className="mt-1 min-h-11 px-1 text-sm font-semibold text-coralink">
          {t.gotIt}
        </button>
      </div>
    </section>
  )
}
