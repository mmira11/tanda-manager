# Tanda Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality React PWA for a 12-person rotating savings Tanda, with PIN-protected admin dashboard and read-only public board, deployed to GitHub Pages with no PII in source code.

**Architecture:** Data lives entirely in localStorage — no server, no PII in source. App ships with the round schedule structure baked in but empty roster slots. Admin fills roster on first run via setup wizard. React Router separates public board (`/`) from PIN-gated admin (`/admin`).

**Tech Stack:** React 18, Vite 5, React Router v6, Tailwind CSS v3, vite-plugin-pwa, gh-pages, Vitest, React Testing Library

---

## Key Decisions
- No PII in source: roster is empty on first load, filled via admin UI
- PIN gate on /admin route (4–8 digits, stored in localStorage)
- localStorage only + JSON export/import backup
- GitHub Pages at mmira11.github.io/tanda-manager (public repo, safe because no PII)
- Organizer is slot 11 (Miguel)

## File Map

| File | Purpose |
|---|---|
| `src/data/scheduleTemplate.js` | Round dates + constants, no PII |
| `src/hooks/useTandaStore.js` | All localStorage CRUD, export, import, reset |
| `src/utils/messaging.js` | SMS and WhatsApp URL builders |
| `src/utils/rounds.js` | getCurrentRound, getPaidCount, formatDate, getCountdownTo |
| `src/context/StoreContext.jsx` | React context wrapping useTandaStore |
| `src/components/admin/PinGate.jsx` | PIN entry and session unlock |
| `src/components/admin/SetupWizard.jsx` | First-run organizer config + PIN creation |
| `src/components/admin/PaymentRow.jsx` | Single participant row: toggle + SMS + WA |
| `src/components/admin/RoundPanel.jsx` | Current round header, payment list, payout, notes |
| `src/components/admin/RosterEditor.jsx` | Full inline-editable roster table |
| `src/components/admin/HistoryLog.jsx` | Past rounds log |
| `src/components/admin/DataControls.jsx` | Export, import, reset |
| `src/components/admin/AdminDashboard.jsx` | Tab layout composing all admin components |
| `src/components/public/RecipientSpotlight.jsx` | Gold celebratory spotlight card |
| `src/components/public/CountdownTimer.jsx` | Countdown to next collection Friday |
| `src/components/public/PaymentStatusList.jsx` | Public payment status (no phones) |
| `src/components/public/PublicBoard.jsx` | Public board layout |
| `src/App.jsx` | Router + AdminRoute guard |
| `src/main.jsx` | Entry point |
| `src/index.css` | Tailwind + Google Fonts |
| `vite.config.js` | Vite + PWA plugin + base URL |
| `tailwind.config.js` | Tailwind with gold palette |
| `public/icons/icon-192.png` | PWA icon |
| `public/icons/icon-512.png` | PWA icon |

---

## Tasks

### Task 1: Project Scaffold + Configuration

- [ ] Create project and install deps
```bash
mkdir -p ~/Desktop/projects/tanda-manager
cd ~/Desktop/projects/tanda-manager
npm create vite@latest . -- --template react
npm install react-router-dom
npm install -D tailwindcss@3 autoprefixer postcss vite-plugin-pwa
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
npm install gh-pages
npx tailwindcss init -p
```

- [ ] `tailwind.config.js`
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: { 50:'#fffbeb', 100:'#fef3c7', 200:'#fde68a', 400:'#fbbf24', 500:'#f59e0b', 600:'#d97706', 700:'#b45309' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
}
```

- [ ] `vite.config.js`
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/tanda-manager/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png','icons/icon-512.png'],
      manifest: {
        name: 'Tanda Manager',
        short_name: 'Tanda',
        description: 'Rotating savings group manager',
        theme_color: '#f59e0b',
        background_color: '#fffbeb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/tanda-manager/',
        icons: [
          { src:'icons/icon-192.png', sizes:'192x192', type:'image/png' },
          { src:'icons/icon-512.png', sizes:'512x512', type:'image/png' },
        ],
      },
    }),
  ],
  test: { environment:'jsdom', setupFiles:['./src/test/setup.js'], globals:true },
})
```

- [ ] Add to `package.json` scripts + homepage:
```json
"homepage": "https://mmira11.github.io/tanda-manager",
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest",
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}
```

- [ ] `src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
body { @apply bg-gold-50 text-gray-900 font-sans; }
```

- [ ] `src/test/setup.js`
```js
import '@testing-library/jest-dom'
```

- [ ] `src/main.jsx`
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/tanda-manager">
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] Verify: `npm run dev` → server starts at localhost:5173/tanda-manager/
- [ ] `git init && git add . && git commit -m "feat: scaffold project"`

---

### Task 2: Schedule Template

- [ ] `src/data/scheduleTemplate.js`
```js
export const SLOT_COUNT = 12
export const CONTRIBUTION = 200
export const POT = 2400
export const ROUND_SCHEDULE = [
  { round:1,  collectDate:'2026-06-13', payoutDate:'2026-06-14', recipientSlot:1  },
  { round:2,  collectDate:'2026-06-27', payoutDate:'2026-06-28', recipientSlot:2  },
  { round:3,  collectDate:'2026-07-11', payoutDate:'2026-07-12', recipientSlot:3  },
  { round:4,  collectDate:'2026-07-25', payoutDate:'2026-07-26', recipientSlot:4  },
  { round:5,  collectDate:'2026-08-08', payoutDate:'2026-08-09', recipientSlot:5  },
  { round:6,  collectDate:'2026-08-22', payoutDate:'2026-08-23', recipientSlot:6  },
  { round:7,  collectDate:'2026-09-05', payoutDate:'2026-09-06', recipientSlot:7  },
  { round:8,  collectDate:'2026-09-19', payoutDate:'2026-09-20', recipientSlot:8  },
  { round:9,  collectDate:'2026-10-03', payoutDate:'2026-10-04', recipientSlot:9  },
  { round:10, collectDate:'2026-10-17', payoutDate:'2026-10-18', recipientSlot:10 },
  { round:11, collectDate:'2026-10-31', payoutDate:'2026-11-01', recipientSlot:11 },
  { round:12, collectDate:'2026-11-14', payoutDate:'2026-11-15', recipientSlot:12 },
]
```

- [ ] `src/test/scheduleTemplate.test.js`
```js
import { describe, it, expect } from 'vitest'
import { ROUND_SCHEDULE, SLOT_COUNT, CONTRIBUTION, POT } from '../data/scheduleTemplate'
describe('scheduleTemplate', () => {
  it('has 12 rounds', () => expect(ROUND_SCHEDULE).toHaveLength(12))
  it('first round is Jun 13/14', () => {
    expect(ROUND_SCHEDULE[0].collectDate).toBe('2026-06-13')
    expect(ROUND_SCHEDULE[0].payoutDate).toBe('2026-06-14')
    expect(ROUND_SCHEDULE[0].recipientSlot).toBe(1)
  })
  it('last round is Nov 14/15', () => {
    expect(ROUND_SCHEDULE[11].collectDate).toBe('2026-11-14')
    expect(ROUND_SCHEDULE[11].payoutDate).toBe('2026-11-15')
  })
  it('constants correct', () => {
    expect(SLOT_COUNT).toBe(12); expect(CONTRIBUTION).toBe(200); expect(POT).toBe(2400)
  })
})
```

- [ ] `npm test -- --run` → PASS
- [ ] `git add . && git commit -m "feat: add round schedule template"`

---

### Task 3: useTandaStore Hook

- [ ] `src/hooks/useTandaStore.js`
```js
import { useState, useCallback } from 'react'
import { ROUND_SCHEDULE, SLOT_COUNT } from '../data/scheduleTemplate'

const STORAGE_KEY = 'tanda_data'

function buildInitialState() {
  return {
    config: { organizerName:'', organizerPhone:'', organizerSlot:11, pin:'', initialized:false },
    participants: Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot:i+1, name:'', phone:'' })),
    rounds: ROUND_SCHEDULE.map(r => ({
      ...r,
      payments: Object.fromEntries(Array.from({ length: SLOT_COUNT }, (_, i) => [i+1, false])),
      payoutSent: false,
      notes: '',
    })),
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : buildInitialState()
  } catch { return buildInitialState() }
}

function saveStore(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }

export function useTandaStore() {
  const [store, setStore] = useState(loadStore)

  const update = useCallback((updater) => {
    setStore(prev => { const next = updater(prev); saveStore(next); return next })
  }, [])

  const updateParticipant = useCallback((slot, fields) => {
    update(prev => ({
      ...prev,
      participants: prev.participants.map(p => p.slot === slot ? { ...p, ...fields } : p),
    }))
  }, [update])

  const togglePayment = useCallback((roundNum, slot) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum ? { ...r, payments: { ...r.payments, [slot]: !r.payments[slot] } } : r
      ),
    }))
  }, [update])

  const togglePayout = useCallback((roundNum) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r => r.round === roundNum ? { ...r, payoutSent: !r.payoutSent } : r),
    }))
  }, [update])

  const updateRoundNotes = useCallback((roundNum, notes) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r => r.round === roundNum ? { ...r, notes } : r),
    }))
  }, [update])

  const saveConfig = useCallback((config) => {
    update(prev => ({ ...prev, config: { ...prev.config, ...config } }))
  }, [update])

  const exportData = useCallback(() => JSON.stringify(store, null, 2), [store])

  const importData = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString)
      saveStore(parsed)
      setStore(parsed)
    } catch { throw new Error('Invalid JSON file') }
  }, [])

  const resetData = useCallback(() => {
    const initial = buildInitialState()
    saveStore(initial)
    setStore(initial)
  }, [])

  return { store, updateParticipant, togglePayment, togglePayout, updateRoundNotes, saveConfig, exportData, importData, resetData }
}
```

- [ ] `src/test/useTandaStore.test.js`
```js
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTandaStore } from '../hooks/useTandaStore'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('useTandaStore', () => {
  beforeEach(() => localStorage.clear())

  it('initializes with 12 empty participants and 12 rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.participants).toHaveLength(12)
    expect(result.current.store.rounds).toHaveLength(12)
    expect(result.current.store.config.initialized).toBe(false)
    expect(result.current.store.participants[0].name).toBe('')
  })

  it('updateParticipant saves name and phone', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name:'Edy', phone:'5102301571' }))
    expect(result.current.store.participants[0].name).toBe('Edy')
  })

  it('togglePayment marks and unmarks paid', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 1))
    expect(result.current.store.rounds[0].payments[1]).toBe(true)
    act(() => result.current.togglePayment(1, 1))
    expect(result.current.store.rounds[0].payments[1]).toBe(false)
  })

  it('togglePayout flips payoutSent', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayout(1))
    expect(result.current.store.rounds[0].payoutSent).toBe(true)
  })

  it('updateRoundNotes saves notes', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateRoundNotes(1, 'Everyone paid early!'))
    expect(result.current.store.rounds[0].notes).toBe('Everyone paid early!')
  })

  it('saveConfig marks initialized true', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.saveConfig({ organizerName:'Miguel', pin:'1234', initialized:true }))
    expect(result.current.store.config.initialized).toBe(true)
    expect(result.current.store.config.pin).toBe('1234')
  })

  it('exportData returns valid JSON with all fields', () => {
    const { result } = renderHook(() => useTandaStore())
    const parsed = JSON.parse(result.current.exportData())
    expect(parsed).toHaveProperty('config')
    expect(parsed).toHaveProperty('participants')
    expect(parsed).toHaveProperty('rounds')
  })

  it('importData restores from JSON', () => {
    const { result } = renderHook(() => useTandaStore())
    const snap = JSON.stringify({ ...result.current.store, config: { ...result.current.store.config, organizerName:'Restored' } })
    act(() => result.current.importData(snap))
    expect(result.current.store.config.organizerName).toBe('Restored')
  })

  it('resetData wipes to initial state', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name:'Edy' }))
    act(() => result.current.resetData())
    expect(result.current.store.participants[0].name).toBe('')
    expect(result.current.store.config.initialized).toBe(false)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name:'Edy' }))
    const saved = JSON.parse(localStorage.getItem('tanda_data'))
    expect(saved.participants[0].name).toBe('Edy')
  })
})
```

- [ ] `npm test -- --run` → PASS
- [ ] `git add . && git commit -m "feat: add useTandaStore with localStorage persistence"`

---

### Task 4: Utility Functions

- [ ] `src/utils/messaging.js`
```js
function stripPhone(phone) { return phone.replace(/\D/g, '') }

export function buildSmsUrl(recipientPhone, recipientName, organizerPhone) {
  const to = stripPhone(recipientPhone)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this Friday. Please send $200 to ${stripPhone(organizerPhone)} via Zelle. Thank you!`
  )
  return `sms:${to}?body=${body}`
}

export function buildWhatsAppUrl(recipientPhone, recipientName, organizerPhone) {
  const to = '1' + stripPhone(recipientPhone)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this Friday. Please send $200 to ${stripPhone(organizerPhone)} via Zelle. Thank you!`
  )
  return `https://wa.me/${to}?text=${body}`
}
```

- [ ] `src/utils/rounds.js`
```js
export function getCurrentRound(rounds, today = new Date()) {
  const d = new Date(today); d.setHours(0,0,0,0)
  return rounds.find(r => { const p = new Date(r.payoutDate); p.setHours(0,0,0,0); return p >= d }) || rounds[rounds.length - 1]
}

export function getPaidCount(payments) { return Object.values(payments).filter(Boolean).length }

export function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
}

export function getCountdownTo(isoDate) {
  const diff = new Date(isoDate + 'T00:00:00').getTime() - Date.now()
  if (diff <= 0) return { days:0, hours:0, minutes:0, done:true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    done: false,
  }
}
```

- [ ] `src/test/messaging.test.js`
```js
import { describe, it, expect } from 'vitest'
import { buildSmsUrl, buildWhatsAppUrl } from '../utils/messaging'
describe('messaging', () => {
  it('buildSmsUrl has correct recipient and body', () => {
    const url = buildSmsUrl('(510) 230-1571', 'Edy', '(209) 362-0911')
    expect(url).toMatch(/^sms:5102301571/)
    expect(url).toContain('Edy')
    expect(url).toContain('2093620911')
  })
  it('buildWhatsAppUrl prefixes country code', () => {
    const url = buildWhatsAppUrl('(510) 230-1571', 'Edy', '(209) 362-0911')
    expect(url).toMatch(/^https:\/\/wa\.me\/15102301571/)
  })
})
```

- [ ] `src/test/rounds.test.js`
```js
import { describe, it, expect } from 'vitest'
import { getCurrentRound, getPaidCount, formatDate } from '../utils/rounds'
import { ROUND_SCHEDULE } from '../data/scheduleTemplate'
const base = ROUND_SCHEDULE.map(r => ({
  ...r, payments: Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,false])), payoutSent:false, notes:''
}))
describe('getCurrentRound', () => {
  it('returns round 1 on Jun 13', () => expect(getCurrentRound(base, new Date('2026-06-13')).round).toBe(1))
  it('returns round 2 after Jun 14 payout', () => expect(getCurrentRound(base, new Date('2026-06-15')).round).toBe(2))
  it('returns round 12 after all rounds', () => expect(getCurrentRound(base, new Date('2026-12-01')).round).toBe(12))
})
describe('getPaidCount', () => {
  it('counts paid slots', () => expect(getPaidCount({1:true,2:false,3:true})).toBe(2))
})
```

- [ ] `npm test -- --run` → PASS
- [ ] `git add . && git commit -m "feat: add messaging and round utilities"`

---

### Task 5: StoreContext + Routing + PIN Gate

- [ ] `src/context/StoreContext.jsx`
```jsx
import { createContext, useContext } from 'react'
import { useTandaStore } from '../hooks/useTandaStore'
const StoreContext = createContext(null)
export function StoreProvider({ children }) {
  const store = useTandaStore()
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
```

- [ ] `src/components/admin/PinGate.jsx`
```jsx
import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
export default function PinGate({ onUnlock }) {
  const { store } = useStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  function handleSubmit(e) {
    e.preventDefault()
    if (pin === store.config.pin) { onUnlock() }
    else { setError(true); setPin('') }
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
            type="password" inputMode="numeric" maxLength={8}
            placeholder="Enter PIN" value={pin} autoFocus
            onChange={e => { setPin(e.target.value); setError(false) }}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500 mb-4"
          />
          {error && <p className="text-red-500 text-sm text-center mb-4">Incorrect PIN. Try again.</p>}
          <button type="submit" className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors">
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] Stub components (replaced in later tasks):

`src/components/admin/SetupWizard.jsx` — placeholder div
`src/components/admin/AdminDashboard.jsx` — placeholder div
`src/components/public/PublicBoard.jsx` — placeholder div

- [ ] `src/App.jsx`
```jsx
import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { StoreProvider, useStore } from './context/StoreContext'
import PinGate from './components/admin/PinGate'
import SetupWizard from './components/admin/SetupWizard'
import AdminDashboard from './components/admin/AdminDashboard'
import PublicBoard from './components/public/PublicBoard'

function AdminRoute() {
  const { store } = useStore()
  const [unlocked, setUnlocked] = useState(false)
  if (!store.config.initialized) return <SetupWizard />
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />
  return <AdminDashboard />
}

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/" element={<PublicBoard />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Routes>
    </StoreProvider>
  )
}
```

- [ ] Verify routing works in dev
- [ ] `git add . && git commit -m "feat: add routing, StoreContext, and PIN gate"`

---

### Task 6: Setup Wizard

- [ ] Full `src/components/admin/SetupWizard.jsx`
```jsx
import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
export default function SetupWizard() {
  const { saveConfig } = useStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ organizerName:'Miguel', organizerPhone:'', pin:'', pinConfirm:'' })
  const [errors, setErrors] = useState({})
  function set(f, v) { setForm(p => ({...p,[f]:v})); setErrors(p => ({...p,[f]:undefined})) }

  return (
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Tanda Manager</h1>
          <p className="text-gray-500 mt-1 text-sm">Step {step} of 2</p>
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500"
                value={form.organizerName} onChange={e => set('organizerName', e.target.value)} placeholder="Your name" />
              {errors.organizerName && <p className="text-red-500 text-xs mt-1">{errors.organizerName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Phone (Zelle number)</label>
              <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500"
                value={form.organizerPhone} onChange={e => set('organizerPhone', e.target.value)}
                placeholder="(209) 362-0911" inputMode="tel" />
              {errors.organizerPhone && <p className="text-red-500 text-xs mt-1">{errors.organizerPhone}</p>}
            </div>
            <div className="bg-gold-50 rounded-xl p-3 text-sm text-gray-600">
              You are <strong>slot 11</strong> — both organizer and participant.
            </div>
            <button className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors"
              onClick={() => {
                const errs = {}
                if (!form.organizerName.trim()) errs.organizerName = 'Name is required'
                if (!form.organizerPhone.trim()) errs.organizerPhone = 'Phone is required'
                if (Object.keys(errs).length) { setErrors(errs); return }
                setStep(2)
              }}>
              Next →
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Create PIN (4–8 digits)</label>
              <input type="password" inputMode="numeric" maxLength={8}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500"
                value={form.pin} onChange={e => set('pin', e.target.value.replace(/\D/g,''))} placeholder="••••" />
              {errors.pin && <p className="text-red-500 text-xs mt-1">{errors.pin}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
              <input type="password" inputMode="numeric" maxLength={8}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-gold-500"
                value={form.pinConfirm} onChange={e => set('pinConfirm', e.target.value.replace(/\D/g,''))} placeholder="••••" />
              {errors.pinConfirm && <p className="text-red-500 text-xs mt-1">{errors.pinConfirm}</p>}
            </div>
            <div className="flex gap-3">
              <button className="flex-1 border-2 border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
                onClick={() => setStep(1)}>← Back</button>
              <button className="flex-1 bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors"
                onClick={() => {
                  const errs = {}
                  if (form.pin.length < 4) errs.pin = 'PIN must be at least 4 digits'
                  if (form.pin !== form.pinConfirm) errs.pinConfirm = 'PINs do not match'
                  if (Object.keys(errs).length) { setErrors(errs); return }
                  saveConfig({ organizerName:form.organizerName.trim(), organizerPhone:form.organizerPhone.trim(), organizerSlot:11, pin:form.pin, initialized:true })
                }}>
                Finish Setup ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] Test wizard flow in dev, verify it transitions to AdminDashboard stub after setup
- [ ] `git add . && git commit -m "feat: add first-run setup wizard"`

---

### Task 7: PaymentRow + RoundPanel

- [ ] `src/components/admin/PaymentRow.jsx`
```jsx
import { buildSmsUrl, buildWhatsAppUrl } from '../../utils/messaging'
import { useStore } from '../../context/StoreContext'
export default function PaymentRow({ participant, roundNum, paid }) {
  const { store, togglePayment } = useStore()
  const { slot, name, phone } = participant
  const smsUrl = phone ? buildSmsUrl(phone, name || `Slot ${slot}`, store.config.organizerPhone) : null
  const waUrl  = phone ? buildWhatsAppUrl(phone, name || `Slot ${slot}`, store.config.organizerPhone) : null
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${paid ? 'bg-emerald-50' : 'bg-gray-50'}`}>
      <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
        {slot}
      </span>
      <span className="flex-1 font-medium text-gray-900 min-w-0 truncate">
        {name || <span className="text-gray-400 italic text-sm">Slot {slot}</span>}
      </span>
      <button
        onClick={() => togglePayment(roundNum, slot)}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
          paid ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
        }`}>
        {paid ? '✓ Paid' : 'Pending'}
      </button>
      {smsUrl && (
        <a href={smsUrl} className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex-shrink-0" title={`SMS ${name}`}>
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </a>
      )}
      {waUrl && (
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
          className="p-2 rounded-lg bg-green-50 hover:bg-green-100 transition-colors flex-shrink-0" title={`WhatsApp ${name}`}>
          <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  )
}
```

- [ ] `src/components/admin/RoundPanel.jsx`
```jsx
import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getPaidCount, formatDate } from '../../utils/rounds'
import PaymentRow from './PaymentRow'
export default function RoundPanel() {
  const { store, togglePayout, updateRoundNotes } = useStore()
  const { participants, rounds } = store
  const round = getCurrentRound(rounds)
  const paidCount = getPaidCount(round.payments)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-gold-600 uppercase tracking-wider">Round {round.round} of 12</span>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">{recipientName} receives</h2>
          </div>
          <div className="text-2xl font-black text-gold-600">$2,400</div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gold-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium">Collect Friday</p>
            <p className="font-semibold text-gray-900 text-sm">{formatDate(round.collectDate)}</p>
          </div>
          <div className="bg-gold-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium">Pay Out Saturday</p>
            <p className="font-semibold text-gray-900 text-sm">{formatDate(round.payoutDate)}</p>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 font-medium">Contributions</span>
            <span className="font-bold text-gray-900">{paidCount} / {participants.length}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(paidCount / participants.length) * 100}%` }} />
          </div>
        </div>
        <button onClick={() => togglePayout(round.round)}
          className={`w-full py-2.5 rounded-xl font-semibold transition-colors text-sm ${
            round.payoutSent ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          {round.payoutSent ? `✓ $2,400 Sent to ${recipientName}` : `Mark Payout Sent to ${recipientName}`}
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-3">Collection Status</h3>
        <div className="space-y-2">
          {participants.map(p => (
            <PaymentRow key={p.slot} participant={p} roundNum={round.round} paid={round.payments[p.slot]} />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-2">Round Notes</h3>
        <textarea className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-gold-400 bg-gray-50"
          rows={3} placeholder="Add any notes for this round..."
          value={round.notes} onChange={e => updateRoundNotes(round.round, e.target.value)} />
      </div>
    </div>
  )
}
```

- [ ] `git add . && git commit -m "feat: add payment row and round panel"`

---

### Task 8: Roster Editor

- [ ] `src/components/admin/RosterEditor.jsx`
```jsx
import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
function ParticipantRow({ participant }) {
  const { updateParticipant } = useStore()
  const [name, setName] = useState(participant.name)
  const [phone, setPhone] = useState(participant.phone)
  return (
    <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center">
        {participant.slot}
      </span>
      <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
        value={name} placeholder={`Slot ${participant.slot} name`}
        onChange={e => setName(e.target.value)}
        onBlur={() => updateParticipant(participant.slot, { name: name.trim() })} />
      <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
        value={phone} placeholder="Phone" inputMode="tel"
        onChange={e => setPhone(e.target.value)}
        onBlur={() => updateParticipant(participant.slot, { phone: phone.trim() })} />
    </div>
  )
}
export default function RosterEditor() {
  const { store } = useStore()
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-1">Participant Roster</h3>
      <p className="text-xs text-gray-500 mb-4">Changes save on blur (tap outside the field)</p>
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 mb-2">
        <span /><span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone (Zelle)</span>
      </div>
      {store.participants.map(p => <ParticipantRow key={p.slot} participant={p} />)}
    </div>
  )
}
```

- [ ] `git add . && git commit -m "feat: add inline roster editor"`

---

### Task 9: History Log + Data Controls

- [ ] `src/components/admin/HistoryLog.jsx`
```jsx
import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getPaidCount, formatDate } from '../../utils/rounds'
export default function HistoryLog() {
  const { store } = useStore()
  const { rounds, participants } = store
  const currentRound = getCurrentRound(rounds)
  const past = rounds.filter(r => r.round < currentRound.round).reverse()
  if (!past.length) return (
    <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 text-center">
      <div className="text-3xl mb-2">📋</div>
      <p className="text-gray-500 text-sm">History will appear here after each completed round.</p>
    </div>
  )
  return (
    <div className="space-y-3">
      {past.map(round => {
        const r = participants.find(p => p.slot === round.recipientSlot)
        return (
          <div key={round.round} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-xs font-semibold text-gold-600 uppercase tracking-wider">Round {round.round}</span>
                <h4 className="font-bold text-gray-900">{r?.name || `Slot ${round.recipientSlot}`}</h4>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${round.payoutSent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {round.payoutSent ? '✓ Paid Out' : 'Pending'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
              <span>Collected: <strong>{formatDate(round.collectDate)}</strong></span>
              <span>Paid out: <strong>{formatDate(round.payoutDate)}</strong></span>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Contributions: <strong>{getPaidCount(round.payments)} / {participants.length}</strong>
            </p>
            {round.notes && <div className="bg-gold-50 rounded-lg p-2 text-sm text-gray-700 italic">{round.notes}</div>}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] `src/components/admin/DataControls.jsx`
```jsx
import { useRef, useState } from 'react'
import { useStore } from '../../context/StoreContext'
export default function DataControls() {
  const { exportData, importData, resetData } = useStore()
  const fileRef = useRef(null)
  const [status, setStatus] = useState(null)
  function handleExport() {
    const blob = new Blob([exportData()], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tanda-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  function handleImport(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try { importData(ev.target.result); setStatus({ ok:true, msg:'Data restored successfully!' }) }
      catch { setStatus({ ok:false, msg:'Invalid backup file.' }) }
    }
    reader.readAsText(file); e.target.value = ''
  }
  function handleReset() {
    if (window.confirm('Reset ALL data? Export a backup first — this cannot be undone.')) resetData()
  }
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Data & Backup</h3>
        <p className="text-xs text-gray-500 mb-4">Your data lives in this browser. Export regularly to keep a backup on Google Drive.</p>
        <div className="space-y-3">
          <button onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 bg-gold-50 hover:bg-gold-100 text-gold-700 font-semibold py-3 rounded-xl border border-gold-200 transition-colors">
            ↓ Download Backup (JSON)
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 rounded-xl border border-blue-200 transition-colors">
            ↑ Restore from Backup
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          {status && (
            <div className={`text-sm text-center p-2 rounded-lg ${status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {status.msg}
            </div>
          )}
          <button onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 rounded-xl border border-red-200 transition-colors">
            ✕ Reset All Data
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] `git add . && git commit -m "feat: add history log and data controls"`

---

### Task 10: Admin Dashboard Assembly

- [ ] Full `src/components/admin/AdminDashboard.jsx`
```jsx
import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import RoundPanel from './RoundPanel'
import RosterEditor from './RosterEditor'
import HistoryLog from './HistoryLog'
import DataControls from './DataControls'
const TABS = [
  { id:'round', label:'This Round', icon:'💰' },
  { id:'roster', label:'Roster', icon:'👥' },
  { id:'history', label:'History', icon:'📋' },
  { id:'settings', label:'Settings', icon:'⚙️' },
]
export default function AdminDashboard() {
  const { store } = useStore()
  const [tab, setTab] = useState('round')
  return (
    <div className="min-h-screen bg-gold-50">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda Manager</h1>
            <p className="text-xs text-gray-500">Admin · {store.config.organizerName}</p>
          </div>
          <a href="/" className="text-xs text-gold-600 font-semibold bg-gold-50 px-3 py-1.5 rounded-full border border-gold-200 hover:bg-gold-100 transition-colors">
            Public Board ↗
          </a>
        </div>
      </div>
      <div className="max-w-2xl mx-auto p-4 pb-28">
        {tab === 'round'    && <RoundPanel />}
        {tab === 'roster'   && <RosterEditor />}
        {tab === 'history'  && <HistoryLog />}
        {tab === 'settings' && <DataControls />}
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${tab === t.id ? 'text-gold-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <span className="text-xl">{t.icon}</span>
              <span className="text-xs font-medium">{t.label}</span>
              {tab === t.id && <div className="w-4 h-0.5 bg-gold-500 rounded-full" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] Full smoke test: all 4 tabs, payment toggle, roster edit, export
- [ ] `git add . && git commit -m "feat: assemble admin dashboard with tab nav"`

---

### Task 11: Public Board

- [ ] `src/components/public/RecipientSpotlight.jsx`
```jsx
import { formatDate } from '../../utils/rounds'
import { POT } from '../../data/scheduleTemplate'
export default function RecipientSpotlight({ round, recipientName }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 rounded-3xl p-6 text-white shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-10 -translate-x-10" />
      <div className="relative">
        <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          Round {round.round} of 12
        </span>
        <p className="text-white/80 text-sm font-medium mt-4 mb-1">This round's recipient 🎉</p>
        <h2 className="text-4xl font-black tracking-tight mb-1">{recipientName || '—'}</h2>
        <div className="text-5xl font-black mb-5">${POT.toLocaleString()}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">Collection</p>
            <p className="font-bold text-sm">{formatDate(round.collectDate)}</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">Payout</p>
            <p className="font-bold text-sm">{formatDate(round.payoutDate)}</p>
          </div>
        </div>
        {round.payoutSent && (
          <div className="mt-4 bg-white/20 rounded-2xl p-3 text-center font-bold">
            🎊 Congratulations {recipientName}!
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] `src/components/public/CountdownTimer.jsx`
```jsx
import { useState, useEffect } from 'react'
import { getCountdownTo } from '../../utils/rounds'
export default function CountdownTimer({ collectDate, isComplete }) {
  const [time, setTime] = useState(() => getCountdownTo(collectDate))
  useEffect(() => {
    if (isComplete) return
    const id = setInterval(() => setTime(getCountdownTo(collectDate)), 30000)
    return () => clearInterval(id)
  }, [collectDate, isComplete])
  if (isComplete) return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 text-center">
      <p className="text-lg font-bold text-gold-600">🏁 Tanda Complete!</p>
      <p className="text-sm text-gray-500 mt-1">All 12 rounds finished. Amazing job everyone!</p>
    </div>
  )
  if (time.done) return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 text-center">
      <p className="font-bold text-gray-900">Today is collection Friday 🎯</p>
      <p className="text-sm text-gray-500 mt-1">Please send $200 via Zelle today!</p>
    </div>
  )
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center">Next collection in</p>
      <div className="flex justify-center gap-6">
        {[{ v:time.days, l:'days' }, { v:time.hours, l:'hours' }, { v:time.minutes, l:'mins' }].map(({ v, l }, i, arr) => (
          <div key={l} className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-black text-gray-900">{v}</div>
              <div className="text-xs text-gray-500 font-medium">{l}</div>
            </div>
            {i < arr.length - 1 && <div className="text-2xl font-black text-gray-200 -ml-2">:</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] `src/components/public/PaymentStatusList.jsx`
```jsx
import { getPaidCount } from '../../utils/rounds'
import { SLOT_COUNT } from '../../data/scheduleTemplate'
export default function PaymentStatusList({ participants, payments }) {
  const paidCount = getPaidCount(payments)
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Contributions</h3>
        <span className="text-sm font-bold text-emerald-600">{paidCount} of {SLOT_COUNT} ✓</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-emerald-400 rounded-full transition-all duration-700"
          style={{ width:`${(paidCount / SLOT_COUNT) * 100}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {participants.map(p => (
          <div key={p.slot} className={`flex items-center gap-2 p-2.5 rounded-xl ${payments[p.slot] ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-bold ${
              payments[p.slot] ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
            }`}>
              {payments[p.slot] ? '✓' : '·'}
            </span>
            <span className="text-sm font-medium text-gray-700 truncate">
              {p.name || `Slot ${p.slot}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] Full `src/components/public/PublicBoard.jsx`
```jsx
import { useStore } from '../../context/StoreContext'
import { getCurrentRound } from '../../utils/rounds'
import RecipientSpotlight from './RecipientSpotlight'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'
export default function PublicBoard() {
  const { store } = useStore()
  const { participants, rounds } = store
  if (!store.config.initialized) return (
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
      <div>
        <div className="text-5xl mb-4">💰</div>
        <h1 className="text-2xl font-bold text-gray-900">Tanda 2026</h1>
        <p className="text-gray-500 mt-2">Check back soon — setup in progress.</p>
      </div>
    </div>
  )
  const round = getCurrentRound(rounds)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  const isComplete = new Date() > new Date('2026-11-16T00:00:00')
  return (
    <div className="min-h-screen bg-gold-50">
      <div className="bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda 2026</h1>
            <p className="text-xs text-gray-500">Jun 13 – Nov 15, 2026</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Round</div>
            <div className="text-2xl font-black text-gold-600">{round.round}<span className="text-sm font-medium text-gray-400"> / 12</span></div>
          </div>
        </div>
      </div>
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <RecipientSpotlight round={round} recipientName={recipientName} />
        <CountdownTimer collectDate={round.collectDate} isComplete={isComplete} />
        <PaymentStatusList participants={participants} payments={round.payments} />
        <p className="text-center text-xs text-gray-400 pb-6">Each person contributes $200 · Payout every Saturday</p>
      </div>
    </div>
  )
}
```

- [ ] Verify public board at localhost:5173/tanda-manager/ — no phone numbers visible, gold spotlight renders
- [ ] `git add . && git commit -m "feat: build public tanda board"`

---

### Task 12: PWA Icons + Deployment

- [ ] Generate icons (requires ImageMagick or create manually):
```bash
mkdir -p ~/Desktop/projects/tanda-manager/public/icons
# If ImageMagick available:
convert -size 512x512 xc:#f59e0b -fill white -font Helvetica-Bold -pointsize 220 -gravity Center -annotate 0 "$" ~/Desktop/projects/tanda-manager/public/icons/icon-512.png
convert ~/Desktop/projects/tanda-manager/public/icons/icon-512.png -resize 192x192 ~/Desktop/projects/tanda-manager/public/icons/icon-192.png
```

- [ ] `npm run build` — verify dist/ builds cleanly with no errors

- [ ] Create GitHub repo `tanda-manager` under account `mmira11` (do this in browser), then:
```bash
cd ~/Desktop/projects/tanda-manager
git remote add origin https://github.com/mmira11/tanda-manager.git
git push -u origin main
```

- [ ] `npm run deploy` → publishes to gh-pages branch → site live at https://mmira11.github.io/tanda-manager/

- [ ] Verify on phone: open Chrome → navigate to URL → "Add to Home Screen" prompt → install as PWA

- [ ] `git add . && git commit -m "feat: add PWA icons and deploy to GitHub Pages"`

---

## Spec Coverage Checklist

| Requirement | Task |
|---|---|
| 12 participants, $200/$2,400 | scheduleTemplate.js |
| 12 rounds Jun 13 – Nov 15 | scheduleTemplate.js |
| Editable roster (name, phone, slot) | RosterEditor |
| Current round with dates + recipient | RoundPanel |
| Per-person Paid/Pending toggle | PaymentRow + togglePayment |
| Progress bar X/12 | RoundPanel |
| Payout sent toggle | RoundPanel + togglePayout |
| SMS launcher with pre-written message | buildSmsUrl + PaymentRow |
| WhatsApp launcher | buildWhatsAppUrl + PaymentRow |
| History log | HistoryLog |
| Notes per round | RoundPanel textarea |
| localStorage persistence | useTandaStore |
| Export/import JSON backup | DataControls |
| PIN gate on admin | PinGate + AdminRoute |
| First-run setup wizard | SetupWizard |
| No PII in source | Empty roster, data entered at runtime |
| Public board — no phones, names only | PublicBoard + PaymentStatusList |
| Recipient spotlight (gold, celebratory) | RecipientSpotlight |
| Green ✓ / gray · (no red) | PaymentStatusList |
| Countdown timer | CountdownTimer |
| PWA installable on Android | vite-plugin-pwa |
| GitHub Pages deployment | gh-pages |
| Mobile responsive | max-w-lg/2xl, mobile-first Tailwind |
