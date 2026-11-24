# Date Fix + Bilingual Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shift all 12 tanda schedule dates back 1 day (Fri/Sat instead of Sat/Sun) and add an EN/ES bilingual toggle to the public board that persists to localStorage.

**Architecture:** Fix 1 touches the schedule template, a localStorage migration in `useTandaStore`, and 3 test files. Fix 2 adds a `LABELS` object and `lang` state to `PublicBoard`, passes a `t` translation prop to all 3 public sub-components, and adds Paid/Pending text badges + "Who's next" row to `PaymentStatusList`.

**Tech Stack:** React 18, Vite, Vitest, @testing-library/react, Tailwind CSS, gh-pages deploy

---

## File Map

| File | Change |
|---|---|
| `src/data/scheduleTemplate.js` | All 12 collectDate/payoutDate values shift -1 day |
| `src/test/scheduleTemplate.test.js` | Update 2 date assertions |
| `src/test/rounds.test.js` | Update 3 date references in getCurrentRound tests |
| `src/hooks/useTandaStore.js` | Add `migrateStore()` + call it in `loadStore()` |
| `src/test/useTandaStore.test.js` | Add 1 migration test |
| `src/utils/rounds.js` | Add optional `locale` param to `getDayName` |
| `src/components/public/PublicBoard.jsx` | LABELS object, lang state, toggle button, pass `t` + new props to children, fix isComplete + header dates |
| `src/components/public/RecipientSpotlight.jsx` | Accept `t` prop, translate 4 strings |
| `src/components/public/CountdownTimer.jsx` | Accept `t` prop, translate 8 strings |
| `src/components/public/PaymentStatusList.jsx` | Accept `t`/`rounds`/`currentRoundNum` props, replace icons with Paid/Pending badges, add Who's next row |

---

## Task 1: Fix Schedule Dates + Tests + localStorage Migration

**Files:**
- Modify: `src/data/scheduleTemplate.js`
- Modify: `src/test/scheduleTemplate.test.js`
- Modify: `src/test/rounds.test.js`
- Modify: `src/hooks/useTandaStore.js`
- Modify: `src/test/useTandaStore.test.js`

### Step 1: Update scheduleTemplate.test.js with new dates (write failing tests first)

Replace the two date-specific test cases — the "has 12 rounds", "slots are sequential", and "constants" tests stay unchanged:

```js
// src/test/scheduleTemplate.test.js
import { describe, it, expect } from 'vitest'
import { ROUND_SCHEDULE, SLOT_COUNT, CONTRIBUTION, POT } from '../data/scheduleTemplate'

describe('scheduleTemplate', () => {
  it('has 12 rounds', () => {
    expect(ROUND_SCHEDULE).toHaveLength(12)
  })

  it('first round is Jun 12 collect / Jun 13 payout / slot 1', () => {
    expect(ROUND_SCHEDULE[0].collectDate).toBe('2026-06-12')
    expect(ROUND_SCHEDULE[0].payoutDate).toBe('2026-06-13')
    expect(ROUND_SCHEDULE[0].recipientSlot).toBe(1)
  })

  it('last round is Nov 13 collect / Nov 14 payout / slot 12', () => {
    expect(ROUND_SCHEDULE[11].collectDate).toBe('2026-11-13')
    expect(ROUND_SCHEDULE[11].payoutDate).toBe('2026-11-14')
    expect(ROUND_SCHEDULE[11].recipientSlot).toBe(12)
  })

  it('slots are sequential 1–12', () => {
    const slots = ROUND_SCHEDULE.map(r => r.recipientSlot)
    expect(slots).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
  })

  it('constants are correct', () => {
    expect(SLOT_COUNT).toBe(12)
    expect(CONTRIBUTION).toBe(200)
    expect(POT).toBe(2400)
  })
})
```

- [ ] **Step 2: Update rounds.test.js** — the `getCurrentRound` tests reference the old dates. Update the three date literals:

```js
// src/test/rounds.test.js
import { describe, it, expect } from 'vitest'
import { getCurrentRound, getPaidCount, formatDate } from '../utils/rounds'
import { ROUND_SCHEDULE } from '../data/scheduleTemplate'

const base = ROUND_SCHEDULE.map(r => ({
  ...r,
  payments: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, false])),
  payoutSent: false,
  notes: '',
}))

describe('getCurrentRound', () => {
  it('returns round 1 on the collection date', () => {
    expect(getCurrentRound(base, new Date('2026-06-12')).round).toBe(1)
  })

  it('returns round 1 on payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-13')).round).toBe(1)
  })

  it('returns round 2 after round 1 payout date', () => {
    expect(getCurrentRound(base, new Date('2026-06-14')).round).toBe(2)
  })

  it('returns round 12 after all rounds complete', () => {
    expect(getCurrentRound(base, new Date('2026-12-01')).round).toBe(12)
  })
})

describe('getPaidCount', () => {
  it('returns 0 when no payments', () => {
    expect(getPaidCount({ 1: false, 2: false })).toBe(0)
  })

  it('counts only paid slots', () => {
    expect(getPaidCount({ 1: true, 2: false, 3: true })).toBe(2)
  })

  it('counts all when fully paid', () => {
    const all = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true]))
    expect(getPaidCount(all)).toBe(12)
  })
})

describe('formatDate', () => {
  it('formats ISO date as readable string', () => {
    const result = formatDate('2026-06-12')
    expect(result).toContain('Jun')
    expect(result).toContain('12')
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail** (dates not updated yet)

```bash
npm test -- --run
```

Expected: 3 failures in `scheduleTemplate` + `rounds` test suites mentioning `2026-06-13`.

- [ ] **Step 4: Update scheduleTemplate.js** — replace the full `ROUND_SCHEDULE` array with dates shifted -1 day:

```js
// src/data/scheduleTemplate.js
export const SLOT_COUNT = 12
export const CONTRIBUTION = 200
export const POT = 2400

export const ROUND_SCHEDULE = [
  { round: 1,  collectDate: '2026-06-12', payoutDate: '2026-06-13', recipientSlot: 1  },
  { round: 2,  collectDate: '2026-06-26', payoutDate: '2026-06-27', recipientSlot: 2  },
  { round: 3,  collectDate: '2026-07-10', payoutDate: '2026-07-11', recipientSlot: 3  },
  { round: 4,  collectDate: '2026-07-24', payoutDate: '2026-07-25', recipientSlot: 4  },
  { round: 5,  collectDate: '2026-08-07', payoutDate: '2026-08-08', recipientSlot: 5  },
  { round: 6,  collectDate: '2026-08-21', payoutDate: '2026-08-22', recipientSlot: 6  },
  { round: 7,  collectDate: '2026-09-04', payoutDate: '2026-09-05', recipientSlot: 7  },
  { round: 8,  collectDate: '2026-09-18', payoutDate: '2026-09-19', recipientSlot: 8  },
  { round: 9,  collectDate: '2026-10-02', payoutDate: '2026-10-03', recipientSlot: 9  },
  { round: 10, collectDate: '2026-10-16', payoutDate: '2026-10-17', recipientSlot: 10 },
  { round: 11, collectDate: '2026-10-30', payoutDate: '2026-10-31', recipientSlot: 11 },
  { round: 12, collectDate: '2026-11-13', payoutDate: '2026-11-14', recipientSlot: 12 },
]
```

- [ ] **Step 5: Run tests — scheduleTemplate and rounds suites should now pass**

```bash
npm test -- --run
```

Expected: all tests pass (including the migration test we haven't written yet — it doesn't exist yet so it won't block).

- [ ] **Step 6: Add migration test to useTandaStore.test.js**

Add this test case inside the existing `describe('useTandaStore', ...)` block, after the existing `beforeEach`:

```js
it('migrates old-schedule dates back by one day on load', () => {
  const oldData = {
    config: { initialized: false, organizerName: '', organizerPhone: '', organizerSlot: 11, pin: '' },
    participants: Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, name: '', phone: '' })),
    rounds: [
      { round: 1,  collectDate: '2026-06-13', payoutDate: '2026-06-14', recipientSlot: 1,  payments: {}, payoutSent: false, notes: '' },
      { round: 2,  collectDate: '2026-06-27', payoutDate: '2026-06-28', recipientSlot: 2,  payments: {}, payoutSent: false, notes: '' },
      { round: 12, collectDate: '2026-11-14', payoutDate: '2026-11-15', recipientSlot: 12, payments: {}, payoutSent: false, notes: '' },
    ],
  }
  localStorage.setItem('tanda_data', JSON.stringify(oldData))
  const { result } = renderHook(() => useTandaStore())
  expect(result.current.store.rounds[0].collectDate).toBe('2026-06-12')
  expect(result.current.store.rounds[0].payoutDate).toBe('2026-06-13')
  expect(result.current.store.rounds[1].collectDate).toBe('2026-06-26')
  expect(result.current.store.rounds[2].collectDate).toBe('2026-11-13')
  expect(result.current.store.rounds[2].payoutDate).toBe('2026-11-14')
})
```

- [ ] **Step 7: Run tests to confirm migration test fails** (migration not written yet)

```bash
npm test -- --run
```

Expected: 1 new failure — the migration test.

- [ ] **Step 8: Add migration to useTandaStore.js**

Replace the `loadStore` function (and add `migrateStore` above it):

```js
// src/hooks/useTandaStore.js
import { useState, useCallback } from 'react'
import { ROUND_SCHEDULE, SLOT_COUNT } from '../data/scheduleTemplate'

const STORAGE_KEY = 'tanda_data'

function buildInitialState() {
  return {
    config: {
      organizerName: '',
      organizerPhone: '',
      organizerSlot: 11,
      pin: '',
      initialized: false,
    },
    participants: Array.from({ length: SLOT_COUNT }, (_, i) => ({
      slot: i + 1,
      name: '',
      phone: '',
    })),
    rounds: ROUND_SCHEDULE.map(r => ({
      ...r,
      payments: Object.fromEntries(
        Array.from({ length: SLOT_COUNT }, (_, i) => [i + 1, false])
      ),
      payoutSent: false,
      notes: '',
    })),
  }
}

const DATE_MIGRATION = {
  '2026-06-13': '2026-06-12', '2026-06-14': '2026-06-13',
  '2026-06-27': '2026-06-26', '2026-06-28': '2026-06-27',
  '2026-07-11': '2026-07-10', '2026-07-12': '2026-07-11',
  '2026-07-25': '2026-07-24', '2026-07-26': '2026-07-25',
  '2026-08-08': '2026-08-07', '2026-08-09': '2026-08-08',
  '2026-08-22': '2026-08-21', '2026-08-23': '2026-08-22',
  '2026-09-05': '2026-09-04', '2026-09-06': '2026-09-05',
  '2026-09-19': '2026-09-18', '2026-09-20': '2026-09-19',
  '2026-10-03': '2026-10-02', '2026-10-04': '2026-10-03',
  '2026-10-17': '2026-10-16', '2026-10-18': '2026-10-17',
  '2026-10-31': '2026-10-30', '2026-11-01': '2026-10-31',
  '2026-11-14': '2026-11-13', '2026-11-15': '2026-11-14',
}

function migrateStore(data) {
  if (data?.rounds?.[0]?.collectDate !== '2026-06-13') return data
  return {
    ...data,
    rounds: data.rounds.map(r => ({
      ...r,
      collectDate: DATE_MIGRATION[r.collectDate] ?? r.collectDate,
      payoutDate:  DATE_MIGRATION[r.payoutDate]  ?? r.payoutDate,
    })),
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : buildInitialState()
    const migrated = migrateStore(data)
    if (migrated !== data) saveStore(migrated)
    return migrated
  } catch {
    return buildInitialState()
  }
}

function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useTandaStore() {
  const [store, setStore] = useState(loadStore)

  const update = useCallback((updater) => {
    setStore(prev => {
      const next = updater(prev)
      saveStore(next)
      return next
    })
  }, [])

  const updateParticipant = useCallback((slot, fields) => {
    update(prev => ({
      ...prev,
      participants: prev.participants.map(p =>
        p.slot === slot ? { ...p, ...fields } : p
      ),
    }))
  }, [update])

  const togglePayment = useCallback((roundNum, slot) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum
          ? { ...r, payments: { ...r.payments, [slot]: !r.payments[slot] } }
          : r
      ),
    }))
  }, [update])

  const togglePayout = useCallback((roundNum) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum ? { ...r, payoutSent: !r.payoutSent } : r
      ),
    }))
  }, [update])

  const updateRoundNotes = useCallback((roundNum, notes) => {
    update(prev => ({
      ...prev,
      rounds: prev.rounds.map(r =>
        r.round === roundNum ? { ...r, notes } : r
      ),
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
    } catch {
      throw new Error('Invalid JSON file')
    }
  }, [])

  const resetData = useCallback(() => {
    const initial = buildInitialState()
    saveStore(initial)
    setStore(initial)
  }, [])

  return {
    store,
    updateParticipant,
    togglePayment,
    togglePayout,
    updateRoundNotes,
    saveConfig,
    exportData,
    importData,
    resetData,
  }
}
```

- [ ] **Step 9: Run all tests — all 27 should pass**

```bash
npm test -- --run
```

Expected: `Test Files 4 passed`, `Tests 27 passed` (or whatever the new total is with the migration test added). Zero failures.

- [ ] **Step 10: Commit**

```bash
git add src/data/scheduleTemplate.js src/hooks/useTandaStore.js src/test/scheduleTemplate.test.js src/test/rounds.test.js src/test/useTandaStore.test.js
git commit -m "$(cat <<'EOF'
fix: shift all tanda dates back 1 day to correct Fri/Sat schedule

All 12 round collect/payout dates shifted -1 day so collection falls
on Friday and payout on Saturday. Adds one-time localStorage migration
for existing data.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PublicBoard — Language Infrastructure

**Files:**
- Modify: `src/utils/rounds.js` (add locale param to getDayName)
- Modify: `src/components/public/PublicBoard.jsx` (LABELS, lang state, toggle button, fix dates, pass t + new props)

- [ ] **Step 1: Add optional locale param to getDayName in rounds.js**

Replace just the `getDayName` function (leave all other functions unchanged):

```js
export function getDayName(iso, locale = 'en-US') {
  return new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long' })
}
```

- [ ] **Step 2: Replace PublicBoard.jsx** with the new version that has LABELS, lang toggle, and passes `t`/`rounds`/`currentRoundNum` to children. Note: `isComplete` threshold updated to Nov 15, header text updated to Jun 12–Nov 14.

```jsx
// src/components/public/PublicBoard.jsx
import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { getCurrentRound, getDayName } from '../../utils/rounds'
import { fetchPublicData } from '../../utils/github'
import RecipientSpotlight from './RecipientSpotlight'
import CountdownTimer from './CountdownTimer'
import PaymentStatusList from './PaymentStatusList'

const LABELS = {
  en: {
    recipient:     "This round's recipient",
    collection:    'Collection',
    payout:        'Payout',
    nextIn:        'Next collection in',
    days:          'days',
    hours:         'hours',
    mins:          'mins',
    contributions: 'Contributions',
    pending:       'Pending',
    paid:          'Paid',
    whosNext:      "Who's next",
    round:         'Round',
    of:            'of',
    perPerson:     'per person',
    collectionDay: 'Collection day is here!',
    sendTo:        'Please send $200 to',
    viaZelle:      'via Zelle',
    today:         'today.',
    tandaDone:     'Tanda Complete!',
    allDone:       'All 12 rounds finished. Amazing job everyone!',
    congrats:      'Congratulations',
    payoutDone:    'Payout complete!',
  },
  es: {
    recipient:     'El turno de esta ronda',
    collection:    'Cobro',
    payout:        'Pago',
    nextIn:        'Próximo cobro en',
    days:          'días',
    hours:         'horas',
    mins:          'mins',
    contributions: 'Aportaciones',
    pending:       'Pendiente',
    paid:          'Pagado',
    whosNext:      'Quién sigue',
    round:         'Ronda',
    of:            'de',
    perPerson:     'por persona',
    collectionDay: '¡Día de cobro!',
    sendTo:        'Por favor envía $200 a',
    viaZelle:      'por Zelle',
    today:         'hoy.',
    tandaDone:     '¡Tanda completa!',
    allDone:       '¡Las 12 rondas terminaron. ¡Excelente trabajo!',
    congrats:      'Felicidades',
    payoutDone:    '¡Pago completado!',
  },
}

export default function PublicBoard() {
  const { store } = useStore()
  const [liveData, setLiveData] = useState(null)
  const [lang, setLang] = useState(() => localStorage.getItem('tanda_lang') || 'en')

  useEffect(() => {
    fetchPublicData()
      .then(setLiveData)
      .catch(() => {})
  }, [])

  function toggleLang() {
    const next = lang === 'en' ? 'es' : 'en'
    localStorage.setItem('tanda_lang', next)
    setLang(next)
  }

  const data = liveData || store
  const { participants, rounds } = data
  const t = LABELS[lang]

  if (!data.config.initialized) {
    return (
      <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-6xl mb-4">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Tanda 2026</h1>
          <p className="text-gray-500 mt-2 text-sm">Check back soon — the organizer is finishing setup.</p>
        </div>
      </div>
    )
  }

  const round = getCurrentRound(rounds)
  const recipient = participants.find(p => p.slot === round.recipientSlot)
  const recipientName = recipient?.name || `Slot ${round.recipientSlot}`
  const isComplete = new Date() > new Date('2026-11-15T00:00:00')
  const locale = lang === 'es' ? 'es' : 'en-US'
  const collectDayName = rounds.length ? getDayName(rounds[0].collectDate, locale) : (lang === 'es' ? 'viernes' : 'Friday')
  const payoutDayName  = rounds.length ? getDayName(rounds[0].payoutDate,  locale) : (lang === 'es' ? 'sábado' : 'Saturday')

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda 2026</h1>
            <p className="text-xs text-gray-500">Jun 12 – Nov 14, 2026 · $200 {t.perPerson}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center text-xs font-semibold rounded-full border border-gray-200 overflow-hidden"
              aria-label="Toggle language"
            >
              <span className={`px-2.5 py-1 transition-colors ${lang === 'en' ? 'bg-gold-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                EN
              </span>
              <span className={`px-2.5 py-1 transition-colors ${lang === 'es' ? 'bg-gold-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                ES
              </span>
            </button>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">{t.round}</div>
              <div className="text-2xl font-black text-gold-600 leading-none">
                {round.round}
                <span className="text-sm font-medium text-gray-400"> / 12</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <RecipientSpotlight round={round} recipientName={recipientName} t={t} />
        <CountdownTimer
          collectDate={round.collectDate}
          isComplete={isComplete}
          organizerName={data.config.organizerName}
          organizerPhone={data.config.organizerPhone}
          t={t}
        />
        <PaymentStatusList
          participants={participants}
          payments={round.payments}
          rounds={rounds}
          currentRoundNum={round.round}
          t={t}
        />
        <p className="text-center text-xs text-gray-400 pb-6">
          {lang === 'en'
            ? `Send $200 to the organizer every ${collectDayName} · Payout every ${payoutDayName} · 12 rounds total`
            : `Envía $200 al organizador cada ${collectDayName} · Pago cada ${payoutDayName} · 12 rondas en total`
          }
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests — all should still pass** (PublicBoard has no unit tests, child components not yet changed so no breakage)

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/utils/rounds.js src/components/public/PublicBoard.jsx
git commit -m "$(cat <<'EOF'
feat: add bilingual infrastructure to PublicBoard

Adds LABELS object, lang state with localStorage persistence, EN/ES
toggle button in header. Passes t prop to all public sub-components.
Also fixes isComplete threshold and header date text.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Translate RecipientSpotlight

**Files:**
- Modify: `src/components/public/RecipientSpotlight.jsx`

- [ ] **Step 1: Replace RecipientSpotlight.jsx** — accept `t` prop, translate 5 strings, keep all styling unchanged:

```jsx
// src/components/public/RecipientSpotlight.jsx
import { formatDate } from '../../utils/rounds'
import { POT } from '../../data/scheduleTemplate'

export default function RecipientSpotlight({ round, recipientName, t }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 rounded-3xl p-6 text-white shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />
      <div className="absolute top-1/2 right-8 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {t.round} {round.round} {t.of} 12
          </span>
        </div>

        <p className="text-white/80 text-sm font-medium mb-1">
          🎉 {t.recipient}
        </p>
        <h2 className="text-4xl font-black tracking-tight mb-1 drop-shadow-sm">
          {recipientName || '—'}
        </h2>
        <div className="text-5xl font-black mb-5 drop-shadow-sm">
          ${POT.toLocaleString()}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">{t.collection}</p>
            <p className="font-bold text-sm mt-0.5">{formatDate(round.collectDate)}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">{t.payout}</p>
            <p className="font-bold text-sm mt-0.5">{formatDate(round.payoutDate)}</p>
          </div>
        </div>

        {round.payoutSent && (
          <div className="mt-4 bg-white/25 rounded-2xl p-4 text-center border border-white/30">
            <div className="text-2xl mb-1">🎊</div>
            <p className="font-bold">{t.payoutDone}</p>
            <p className="text-white/80 text-sm">{t.congrats}, {recipientName}!</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests — all pass**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/RecipientSpotlight.jsx
git commit -m "$(cat <<'EOF'
feat: translate RecipientSpotlight for EN/ES support

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Translate CountdownTimer

**Files:**
- Modify: `src/components/public/CountdownTimer.jsx`

- [ ] **Step 1: Replace CountdownTimer.jsx** — accept `t` prop, translate all user-visible strings:

```jsx
// src/components/public/CountdownTimer.jsx
import { useState, useEffect } from 'react'
import { getCountdownTo } from '../../utils/rounds'

export default function CountdownTimer({ collectDate, isComplete, organizerName, organizerPhone, t }) {
  const [time, setTime] = useState(() => getCountdownTo(collectDate))

  useEffect(() => {
    if (isComplete) return
    const id = setInterval(() => setTime(getCountdownTo(collectDate)), 30000)
    return () => clearInterval(id)
  }, [collectDate, isComplete])

  if (isComplete) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 text-center">
        <div className="text-3xl mb-2">🏁</div>
        <p className="text-lg font-bold text-gold-600">{t.tandaDone}</p>
        <p className="text-sm text-gray-500 mt-1">{t.allDone}</p>
      </div>
    )
  }

  if (time.done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gold-200 bg-gold-50 text-center">
        <div className="text-3xl mb-2">🎯</div>
        <p className="font-bold text-gray-900">{t.collectionDay}</p>
        <p className="text-sm text-gray-600 mt-1">
          {t.sendTo} <strong>{organizerName || 'the organizer'}</strong> {t.viaZelle}
          {organizerPhone ? ` (${organizerPhone})` : ''} {t.today}
        </p>
      </div>
    )
  }

  const units = [
    { value: time.days,    label: t.days },
    { value: time.hours,   label: t.hours },
    { value: time.minutes, label: t.mins },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 text-center">
        {t.nextIn}
      </p>
      <div className="flex items-center justify-center gap-3">
        {units.map(({ value, label }, i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="text-center min-w-[3rem]">
              <div className="text-3xl font-black text-gray-900 tabular-nums">
                {String(value).padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-400 font-medium mt-0.5">{label}</div>
            </div>
            {i < units.length - 1 && (
              <div className="text-2xl font-black text-gray-200 pb-4">:</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests — all pass**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/CountdownTimer.jsx
git commit -m "$(cat <<'EOF'
feat: translate CountdownTimer for EN/ES support

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Translate PaymentStatusList + Paid/Pending Badges + Who's Next

**Files:**
- Modify: `src/components/public/PaymentStatusList.jsx`

- [ ] **Step 1: Replace PaymentStatusList.jsx** — accept `t`, `rounds`, `currentRoundNum` props; replace icon badges with text badges; add "Who's next" row at bottom:

```jsx
// src/components/public/PaymentStatusList.jsx
import { getPaidCount } from '../../utils/rounds'
import { SLOT_COUNT } from '../../data/scheduleTemplate'

export default function PaymentStatusList({ participants, payments, rounds, currentRoundNum, t }) {
  const paidCount = getPaidCount(payments)
  const pct = Math.round((paidCount / SLOT_COUNT) * 100)

  const nextRound = rounds?.find(r => r.round === currentRoundNum + 1)
  const nextRecipient = nextRound
    ? participants.find(p => p.slot === nextRound.recipientSlot)?.name || `Slot ${nextRound.recipientSlot}`
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{t.contributions}</h3>
        <span className="text-sm font-bold text-emerald-600">
          {paidCount} {t.of} {SLOT_COUNT} ✓
        </span>
      </div>

      <div className="mb-1">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {participants.map(p => (
          <div
            key={p.slot}
            className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
              payments[p.slot] ? 'bg-emerald-50' : 'bg-gray-50'
            }`}
          >
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 transition-colors ${
                payments[p.slot]
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {payments[p.slot] ? t.paid : t.pending}
            </span>
            <span className="text-sm font-medium text-gray-700 truncate">
              {p.name || `Slot ${p.slot}`}
            </span>
          </div>
        ))}
      </div>

      {nextRecipient && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
          <span className="font-medium">{t.whosNext}:</span> {nextRecipient}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests — all pass**

```bash
npm test -- --run
```

Expected: all tests pass. Zero failures.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/PaymentStatusList.jsx
git commit -m "$(cat <<'EOF'
feat: translate PaymentStatusList, add Paid/Pending badges and Who's next

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Deploy + Publish

- [ ] **Step 1: Run all tests one final time**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Deploy to GitHub Pages**

```bash
npm run deploy
```

Expected: build succeeds, `gh-pages` pushes `dist/` to the `gh-pages` branch. Final output: `Published`.

- [ ] **Step 3: Publish to the public board**

1. Open the app at `https://mmira11.github.io/tanda-manager/` (or `localhost` if running dev)
2. Log in with your admin PIN
3. Go to the **Settings** tab
4. Click **↑ Publish to Public Board**
5. Wait for the green "Published!" confirmation

The live public board will now show the corrected dates (Fri Jun 12 / Sat Jun 13) and the EN/ES toggle.
