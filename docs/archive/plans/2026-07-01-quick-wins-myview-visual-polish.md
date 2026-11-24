# Quick Wins + My View + Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship in-flight WIP, make the public board fresh and data-driven, add a publish/backup nudge in admin, add a personalized "My view" for members, and give the public board a visual "wow" pass.

**Architecture:** React 18 + Vite PWA, localStorage store on the organizer's device, sanitized JSON published to gh-pages and fetched by the public board. All changes are frontend-only; no new dependencies. New shared logic goes in `src/utils/rounds.js` and a new `src/hooks/usePublish.js`; public-board labels move to `src/data/labels.js`.

**Tech Stack:** React 18, Tailwind CSS 3, Vitest + Testing Library, gh-pages deploy.

## Global Constraints

- No new runtime dependencies (spec §7, Architecture notes).
- All animation is CSS (transform/opacity only); respect `prefers-reduced-motion` (spec §7).
- EN/ES parity for every public-board string (spec §2, §3, §6).
- Data shape unchanged; new localStorage keys only: `tanda_my_slot`, `tanda_last_backup` (spec, Architecture notes).
- Tests: `npx vitest run` must be green at every commit.
- Contribution amount comes from `CONTRIBUTION` in `src/data/scheduleTemplate.js` — never hardcode `$200` in new code.

---

### Task 1: Ship existing WIP

The working tree already contains completed work (timed 12 PM/8 PM reminders in RoundPanel, Zelle copy-button in OrganizerCard, "Collection closes in" label, collectDate threading into PaymentRow). Verify and commit as-is.

**Files:**
- Modify (already modified, commit only): `src/components/admin/PaymentRow.jsx`, `src/components/admin/RoundPanel.jsx`, `src/components/public/OrganizerCard.jsx`, `src/components/public/PublicBoard.jsx`, `src/utils/messaging.js`, `src/utils/rounds.js`
- Also commit: `README.md` (untracked)

**Interfaces:**
- Produces: `buildTimedReminderSmsUrl(phone, name, orgPhone, time)`, `buildTimedReminderWhatsAppUrl(phone, name, orgPhone, time)` in `src/utils/messaging.js` (already written in the working tree).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS. If any fail, STOP and report — do not commit failing WIP.

- [ ] **Step 2: Commit the WIP**

```bash
git add src/ README.md
git commit -m "feat: timed 12PM/8PM reminders, Zelle copy button, collection-close labels"
```

---

### Task 2: Date/time utilities (getTandaSpan, formatSpanLabel, isPayoutWindow, formatRelativeTime)

**Files:**
- Modify: `src/utils/rounds.js`
- Test: `src/test/rounds.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 3, 4, 8):
  - `getTandaSpan(rounds) -> { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', year: number } | null`
  - `formatSpanLabel(span, locale) -> string` e.g. `"Jun 12 – Nov 14, 2026"`
  - `isTandaComplete(rounds, now?) -> boolean`
  - `isPayoutWindow(round, now?) -> boolean` (true from collectDate 20:00 through payoutDate 23:59:59)
  - `formatRelativeTime(thenMs, nowMs, lang) -> string` (`''` if thenMs falsy; "Updated just now" under 60s; "Updated X min ago" after)

- [ ] **Step 1: Write the failing tests**

Append to `src/test/rounds.test.js`:

```js
import { getTandaSpan, formatSpanLabel, isTandaComplete, isPayoutWindow, formatRelativeTime } from '../utils/rounds'

const SPAN_ROUNDS = [
  { round: 1, collectDate: '2026-06-12', payoutDate: '2026-06-13' },
  { round: 2, collectDate: '2026-06-26', payoutDate: '2026-06-27' },
  { round: 3, collectDate: '2026-11-13', payoutDate: '2026-11-14' },
]

describe('getTandaSpan', () => {
  it('returns start/end/year from first collect and last payout', () => {
    expect(getTandaSpan(SPAN_ROUNDS)).toEqual({ start: '2026-06-12', end: '2026-11-14', year: 2026 })
  })
  it('returns null for empty or missing rounds', () => {
    expect(getTandaSpan([])).toBeNull()
    expect(getTandaSpan(undefined)).toBeNull()
  })
})

describe('formatSpanLabel', () => {
  const span = { start: '2026-06-12', end: '2026-11-14', year: 2026 }
  it('formats an en-US range', () => {
    expect(formatSpanLabel(span, 'en-US')).toBe('Jun 12 – Nov 14, 2026')
  })
  it('returns empty string for null span', () => {
    expect(formatSpanLabel(null, 'en-US')).toBe('')
  })
})

describe('isTandaComplete', () => {
  it('is false before the last payout day ends', () => {
    expect(isTandaComplete(SPAN_ROUNDS, new Date('2026-11-14T12:00:00'))).toBe(false)
  })
  it('is true after the last payout day ends', () => {
    expect(isTandaComplete(SPAN_ROUNDS, new Date('2026-11-15T00:00:01'))).toBe(true)
  })
  it('is false with no rounds', () => {
    expect(isTandaComplete([], new Date())).toBe(false)
  })
})

describe('isPayoutWindow', () => {
  const round = { collectDate: '2026-07-10', payoutDate: '2026-07-11' }
  it('is false before collection closes (8pm collect day)', () => {
    expect(isPayoutWindow(round, new Date('2026-07-10T19:59:00'))).toBe(false)
  })
  it('is true after collection close through payout day', () => {
    expect(isPayoutWindow(round, new Date('2026-07-10T20:00:01'))).toBe(true)
    expect(isPayoutWindow(round, new Date('2026-07-11T23:00:00'))).toBe(true)
  })
  it('is false after payout day ends', () => {
    expect(isPayoutWindow(round, new Date('2026-07-12T00:00:01'))).toBe(false)
  })
})

describe('formatRelativeTime', () => {
  const now = 1_000_000_000
  it('returns empty string when then is falsy', () => {
    expect(formatRelativeTime(null, now, 'en')).toBe('')
  })
  it('says just now under a minute (en/es)', () => {
    expect(formatRelativeTime(now - 30_000, now, 'en')).toBe('Updated just now')
    expect(formatRelativeTime(now - 30_000, now, 'es')).toBe('Actualizado justo ahora')
  })
  it('says minutes ago (en/es)', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now, 'en')).toBe('Updated 5 min ago')
    expect(formatRelativeTime(now - 5 * 60_000, now, 'es')).toBe('Actualizado hace 5 min')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/rounds.test.js`
Expected: FAIL — `getTandaSpan` etc. are not exported.

- [ ] **Step 3: Implement the utilities**

Append to `src/utils/rounds.js`:

```js
export function getTandaSpan(rounds) {
  if (!rounds || rounds.length === 0) return null
  const start = rounds[0].collectDate
  const end = rounds[rounds.length - 1].payoutDate
  return { start, end, year: new Date(end + 'T12:00:00').getFullYear() }
}

export function formatSpanLabel(span, locale = 'en-US') {
  if (!span) return ''
  const fmt = iso =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  return `${fmt(span.start)} – ${fmt(span.end)}, ${span.year}`
}

export function isTandaComplete(rounds, now = new Date()) {
  const span = getTandaSpan(rounds)
  if (!span) return false
  return now > new Date(span.end + 'T23:59:59')
}

export function isPayoutWindow(round, now = new Date()) {
  const open = new Date(round.collectDate + 'T20:00:00')
  const close = new Date(round.payoutDate + 'T23:59:59')
  return now >= open && now <= close
}

export function formatRelativeTime(thenMs, nowMs, lang = 'en') {
  if (!thenMs) return ''
  const mins = Math.floor((nowMs - thenMs) / 60000)
  if (mins < 1) return lang === 'es' ? 'Actualizado justo ahora' : 'Updated just now'
  return lang === 'es' ? `Actualizado hace ${mins} min` : `Updated ${mins} min ago`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/rounds.js src/test/rounds.test.js
git commit -m "feat: add tanda span, payout window, and relative time utilities"
```

---

### Task 3: Extract labels + derive hardcoded values from data

**Files:**
- Create: `src/data/labels.js`
- Modify: `src/components/public/PublicBoard.jsx`

**Interfaces:**
- Consumes: `getTandaSpan`, `formatSpanLabel`, `isTandaComplete` (Task 2).
- Produces: `LABELS` export from `src/data/labels.js` — same keys as today plus `updatedJustNow`, `updatedAgo(m)`, `setupMsg`, `findMyName`, `whoAreYou`, `notYou`, `yourStatusPaid`, `yourStatusPending`, `yourTurn`, `receivedPayout(n)`, `close` (My-view keys are consumed in Task 7).

- [ ] **Step 1: Create `src/data/labels.js`**

Move the entire `LABELS` object out of `PublicBoard.jsx` verbatim, adding the new keys. Full file:

```js
// src/data/labels.js — public board strings, EN/ES
export const LABELS = {
  en: {
    recipient:     "This round's recipient",
    collection:    'Collection',
    payout:        'Payout',
    nextIn:        'Collection closes in',
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
    organizer:     'the organizer',
    viaZelle:      'via Zelle',
    today:         'today.',
    tandaDone:     'Tanda Complete!',
    allDone:       n => `All ${n} rounds finished. Amazing job everyone!`,
    congrats:         'Congratulations',
    payoutDone:       'Payout complete!',
    contactOrganizer: 'Contact Organizer',
    zelleInstruction: phone => `Send $200 via Zelle to ${phone}`,
    copyNumber:       'Copy Number',
    copiedConfirm:    'Copied!',
    schedule:         'Round Schedule',
    completed:        'Completed',
    updatedJustNow:   'Updated just now',
    updatedAgo:       m => `Updated ${m} min ago`,
    setupMsg:         'Check back soon — the organizer is finishing setup.',
    findMyName:       'Find my name 👋',
    whoAreYou:        'Tap your name',
    notYou:           'Not you?',
    yourStatusPaid:   "You're paid for this round",
    yourStatusPending:'Your payment is pending this round',
    yourTurn:         'Your turn',
    receivedPayout:   n => `You received your payout in Round ${n} 🎉`,
    close:            'Close',
  },
  es: {
    recipient:     'El turno de esta ronda',
    collection:    'Cobro',
    payout:        'Pago',
    nextIn:        'El cobro cierra en',
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
    organizer:     'el organizador',
    viaZelle:      'por Zelle',
    today:         'hoy.',
    tandaDone:     '¡Tanda completa!',
    allDone:       n => `Las ${n} rondas terminaron. ¡Excelente trabajo!`,
    congrats:         'Felicidades',
    payoutDone:       '¡Pago completado!',
    contactOrganizer: 'Contactar al organizador',
    zelleInstruction: phone => `Envía $200 por Zelle al ${phone}`,
    copyNumber:       'Copia el número',
    copiedConfirm:    '¡Copiado!',
    schedule:         'Calendario de rondas',
    completed:        'Completada',
    updatedJustNow:   'Actualizado justo ahora',
    updatedAgo:       m => `Actualizado hace ${m} min`,
    setupMsg:         'Vuelve pronto — el organizador está terminando la configuración.',
    findMyName:       'Encuentra tu nombre 👋',
    whoAreYou:        'Toca tu nombre',
    notYou:           '¿No eres tú?',
    yourStatusPaid:   'Ya pagaste esta ronda',
    yourStatusPending:'Tu pago está pendiente esta ronda',
    yourTurn:         'Tu turno',
    receivedPayout:   n => `Recibiste tu pago en la Ronda ${n} 🎉`,
    close:            'Cerrar',
  },
}
```

Note: `sendTo`/`zelleInstruction` keep the literal `$200` they have today — keep those strings byte-identical to current behavior; the no-hardcoding constraint applies to new code.

- [ ] **Step 2: Update `PublicBoard.jsx` to use labels + derived values**

In `src/components/public/PublicBoard.jsx`:

1. Delete the inline `LABELS` constant; add `import { LABELS } from '../../data/labels'` and extend the existing `utils/rounds` import with `getTandaSpan, formatSpanLabel, isTandaComplete`.
2. Replace the hardcoded pieces inside the component:

```jsx
const span = getTandaSpan(rounds)
const title = span ? `Tanda ${span.year}` : 'Tanda'
const isComplete = isTandaComplete(rounds)
```

3. Header block: `<h1 ...>{title}</h1>` and

```jsx
<p className="text-xs text-gray-500">{span ? formatSpanLabel(span, locale) : ''} · ${CONTRIBUTION} {t.perPerson}</p>
```

(NOTE: `locale` is currently computed *below* the header usage — move `const locale = lang === 'es' ? 'es' : 'en-US'` up, right after `const t = ...`, before the early returns.)

4. Delete `const isComplete = new Date() > new Date('2026-11-15T00:00:00')`.

5. Setup screen: translate it. Replace the `!data.config.initialized` block's texts:

```jsx
if (!data.config.initialized) {
  return (
    <div className="min-h-screen bg-gold-50 flex items-center justify-center p-8 text-center">
      <div>
        <div className="text-6xl mb-4">💰</div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500 mt-2 text-sm">{t.setupMsg}</p>
      </div>
    </div>
  )
}
```

(`t`, `title`, and `span` must therefore be computed before this early return; `rounds` is available from the existing `const { participants, rounds } = data` destructuring which already precedes it.)

- [ ] **Step 3: Run tests + eyeball dev server**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run dev` (background) and load `http://localhost:5173/tanda-manager/` — header shows "Tanda 2026" + "Jun 12 – Nov 14, 2026 · $200 per person" derived from data; ES toggle translates the month names in the range.

- [ ] **Step 4: Commit**

```bash
git add src/data/labels.js src/components/public/PublicBoard.jsx
git commit -m "refactor: extract public labels; derive title, span, and completion from data"
```

---

### Task 4: Public board freshness (auto-refetch + "Updated X ago")

**Files:**
- Modify: `src/components/public/PublicBoard.jsx`

**Interfaces:**
- Consumes: `formatRelativeTime` (Task 2), `fetchPublicData` (existing).

- [ ] **Step 1: Replace the one-shot fetch effect**

In `PublicBoard.jsx`, replace the existing `useEffect(() => { fetchPublicData()... }, [])` with:

```jsx
const [lastFetched, setLastFetched] = useState(null)

useEffect(() => {
  let cancelled = false
  function refresh() {
    fetchPublicData()
      .then(data => {
        if (cancelled) return
        setLiveData(migrateStore(data))
        setLastFetched(Date.now())
      })
      .catch(() => {})
  }
  refresh()
  function onVisibility() {
    if (!document.hidden) refresh()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const id = setInterval(() => {
    if (!document.hidden) refresh()
  }, 60000)
  return () => {
    cancelled = true
    document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(id)
  }
}, [])
```

- [ ] **Step 2: Render the freshness caption**

As the first child of the content container (`<div className="max-w-lg mx-auto p-4 space-y-4">`), add:

```jsx
{lastFetched && (
  <p className="text-center text-[11px] text-gray-400 -mb-2">
    {formatRelativeTime(lastFetched, Date.now(), lang)}
  </p>
)}
```

Add `formatRelativeTime` to the `utils/rounds` import. (The 60s refetch interval updates `lastFetched`, which re-renders the caption; no separate ticker needed.)

- [ ] **Step 3: Verify manually**

Dev server: caption shows "Updated just now" after load; switch tab away/back → network tab shows a refetch.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/public/PublicBoard.jsx
git commit -m "feat: auto-refresh public data on focus and 60s interval with freshness caption"
```

---

### Task 5: usePublish hook + DataControls refactor

**Files:**
- Create: `src/hooks/usePublish.js`
- Modify: `src/components/admin/DataControls.jsx`
- Test: `src/test/usePublish.test.jsx`

**Interfaces:**
- Consumes: `loadGitHubToken`, `saveGitHubToken`, `publishToGitHub` (existing `utils/github.js`).
- Produces: `usePublish(store)` returning `{ githubToken, updateToken, status, error, lastPublished, hasUnpublishedChanges, publish }`. `status` is `null | 'loading' | 'ok' | 'error'`. **Takes `store` as an argument** (not via context) so it is testable and usable anywhere.

- [ ] **Step 1: Write the failing test**

Create `src/test/usePublish.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../utils/github', () => ({
  loadGitHubToken: vi.fn(() => 'tok_test'),
  saveGitHubToken: vi.fn(),
  publishToGitHub: vi.fn(),
}))

import { loadGitHubToken, publishToGitHub } from '../utils/github'
import { usePublish } from '../hooks/usePublish'

const store = { lastModified: 5000, config: {}, participants: [], rounds: [] }

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  loadGitHubToken.mockReturnValue('tok_test')
})

describe('usePublish', () => {
  it('reports unpublished changes when store is newer than last publish', () => {
    localStorage.setItem('tanda_last_published', '1000')
    const { result } = renderHook(() => usePublish(store))
    expect(result.current.hasUnpublishedChanges).toBe(true)
  })

  it('publish success records timestamp and sets ok status', async () => {
    publishToGitHub.mockResolvedValueOnce()
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(result.current.status).toBe('ok')
    expect(localStorage.getItem('tanda_last_published')).toBe('5000')
    expect(result.current.hasUnpublishedChanges).toBe(false)
  })

  it('publish failure sets error status and message', async () => {
    publishToGitHub.mockRejectedValueOnce(new Error('Bad credentials'))
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('Bad credentials')
  })

  it('does nothing without a token', async () => {
    loadGitHubToken.mockReturnValue('')
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(publishToGitHub).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/usePublish.test.jsx`
Expected: FAIL — `usePublish` module not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/usePublish.js`:

```js
// src/hooks/usePublish.js — shared publish state/logic for admin surfaces
import { useState, useCallback } from 'react'
import { loadGitHubToken, saveGitHubToken, publishToGitHub } from '../utils/github'

export function usePublish(store) {
  const [githubToken, setGithubToken] = useState(loadGitHubToken)
  const [status, setStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [error, setError] = useState('')
  const [lastPublished, setLastPublished] = useState(
    () => parseInt(localStorage.getItem('tanda_last_published') || '0')
  )

  const updateToken = useCallback((val) => {
    setGithubToken(val)
    saveGitHubToken(val)
  }, [])

  const publish = useCallback(async () => {
    if (!githubToken) return
    setStatus('loading')
    setError('')
    try {
      await publishToGitHub(githubToken, store)
      const ts = store.lastModified
      localStorage.setItem('tanda_last_published', String(ts))
      setLastPublished(ts)
      setStatus('ok')
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }, [githubToken, store])

  return {
    githubToken,
    updateToken,
    status,
    error,
    lastPublished,
    hasUnpublishedChanges: store.lastModified > lastPublished,
    publish,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/usePublish.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor DataControls to use the hook**

In `src/components/admin/DataControls.jsx`:

1. Remove the import of `loadGitHubToken, saveGitHubToken, publishToGitHub`; add `import { usePublish } from '../../hooks/usePublish'`.
2. Delete these local pieces: `githubToken`/`setGithubToken` state, `publishStatus`/`publishError` state, `lastPublished` state, `hasUnpublishedChanges` const, `handleTokenChange`, `handlePublish`.
3. Add at the top of the component: `const { githubToken, updateToken, status: publishStatus, error: publishError, hasUnpublishedChanges, publish } = usePublish(store)`.
4. In JSX: token input `onChange={e => updateToken(e.target.value)}`; publish button `onClick={publish}`; everything else (disabled logic, status messages) keeps working with the renamed variables unchanged.

- [ ] **Step 6: Run full suite + verify behavior unchanged**

Run: `npx vitest run`
Expected: PASS. Dev server: Settings tab still shows token input, "Unpublished changes" dot, and the publish button behaves as before.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePublish.js src/test/usePublish.test.jsx src/components/admin/DataControls.jsx
git commit -m "refactor: extract usePublish hook from DataControls"
```

---

### Task 6: Admin publish banner + backup nudge

**Files:**
- Create: `src/components/admin/PublishBanner.jsx`
- Modify: `src/components/admin/AdminDashboard.jsx`, `src/components/admin/DataControls.jsx`

**Interfaces:**
- Consumes: `usePublish(store)` (Task 5).
- Produces: `<PublishBanner onGoToSettings={fn} />` — self-contained; reads store via `useStore()`.
- New localStorage key: `tanda_last_backup` (ms timestamp string), written by DataControls export.

- [ ] **Step 1: Record backup timestamp on export**

In `src/components/admin/DataControls.jsx` `handleExport()`, after `URL.revokeObjectURL(url)` add:

```js
localStorage.setItem('tanda_last_backup', String(Date.now()))
```

- [ ] **Step 2: Create the banner component**

Create `src/components/admin/PublishBanner.jsx`:

```jsx
// src/components/admin/PublishBanner.jsx — cross-tab publish + backup nudge
import { useStore } from '../../context/StoreContext'
import { usePublish } from '../../hooks/usePublish'

const FOURTEEN_DAYS = 14 * 86400000

export default function PublishBanner({ onGoToSettings }) {
  const { store } = useStore()
  const { githubToken, status, error, hasUnpublishedChanges, publish } = usePublish(store)

  const lastBackup = parseInt(localStorage.getItem('tanda_last_backup') || '0')
  const backupStale = !lastBackup || Date.now() - lastBackup > FOURTEEN_DAYS
  const backupLabel = lastBackup
    ? `${Math.floor((Date.now() - lastBackup) / 86400000)} days ago`
    : 'never'

  if (!hasUnpublishedChanges && !backupStale && status !== 'ok' && status !== 'error') return null

  return (
    <div className="mb-4 space-y-2">
      {hasUnpublishedChanges && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
          <p className="text-sm text-amber-800 font-medium flex-1">Unpublished changes</p>
          {githubToken ? (
            <button
              onClick={publish}
              disabled={status === 'loading'}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Publishing…' : 'Publish'}
            </button>
          ) : (
            <button
              onClick={onGoToSettings}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Set up publishing
            </button>
          )}
        </div>
      )}
      {status === 'ok' && !hasUnpublishedChanges && (
        <p className="text-xs text-emerald-600 font-medium px-1">Published! Public board is up to date.</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 px-1">{error}</p>
      )}
      {backupStale && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
          <p className="text-xs text-gray-500 flex-1">
            Last full backup: <strong>{backupLabel}</strong> — published data doesn't include phone numbers.
          </p>
          <button
            onClick={onGoToSettings}
            className="text-xs font-semibold text-gold-600 hover:text-gold-700 flex-shrink-0"
          >
            Back up
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Render it in AdminDashboard (all tabs except Settings)**

In `src/components/admin/AdminDashboard.jsx`, import it and render above the tab content. It is hidden on the `settings` tab to avoid duplicate publish state next to DataControls' own controls:

```jsx
import PublishBanner from './PublishBanner'
// ...inside the content container:
<div className="max-w-2xl mx-auto p-4 pb-28">
  {tab !== 'settings' && <PublishBanner onGoToSettings={() => setTab('settings')} />}
  {tab === 'round'    && <RoundPanel />}
  {tab === 'roster'   && <RosterEditor />}
  {tab === 'history'  && <HistoryLog />}
  {tab === 'settings' && <DataControls />}
</div>
```

- [ ] **Step 4: Verify manually + run tests**

Dev server → admin: toggle a payment on Rounds tab → amber banner appears; Publish button works (or "Set up publishing" jumps to Settings when no token). Backup line shows "never" until you export once, then disappears for 14 days.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/PublishBanner.jsx src/components/admin/AdminDashboard.jsx src/components/admin/DataControls.jsx
git commit -m "feat: cross-tab publish banner with backup staleness nudge"
```

---

### Task 7: My view (member personalization)

**Files:**
- Modify: `src/utils/rounds.js`, `src/components/public/PublicBoard.jsx`, `src/components/public/PaymentStatusList.jsx`
- Create: `src/components/public/MyViewCard.jsx`, `src/components/public/NamePicker.jsx`
- Test: `src/test/rounds.test.js`

**Interfaces:**
- Consumes: `LABELS` keys from Task 3 (`findMyName`, `whoAreYou`, `notYou`, `yourStatusPaid`, `yourStatusPending`, `yourTurn`, `receivedPayout`, `round`, `close`), `formatDate` (existing), `CONTRIBUTION` (existing).
- Produces:
  - `resolveMySlot(saved, participants) -> number | null` in `utils/rounds.js`
  - `<NamePicker participants t onPick(slot) />`
  - `<MyViewCard mySlot participants rounds currentRound pot t onClear />`
  - `PaymentStatusList` gains optional `mySlot` prop (highlights that row).
- localStorage key: `tanda_my_slot`.

- [ ] **Step 1: Write failing test for resolveMySlot**

Append to `src/test/rounds.test.js`:

```js
import { resolveMySlot } from '../utils/rounds'

describe('resolveMySlot', () => {
  const participants = [{ slot: 1, name: 'Ana' }, { slot: 2, name: 'Beto' }]
  it('returns the slot number when it exists', () => {
    expect(resolveMySlot('2', participants)).toBe(2)
  })
  it('returns null for missing, invalid, or stale slots', () => {
    expect(resolveMySlot(null, participants)).toBeNull()
    expect(resolveMySlot('abc', participants)).toBeNull()
    expect(resolveMySlot('9', participants)).toBeNull()
  })
})
```

(Import note: `resolveMySlot` can be added to the existing `../utils/rounds` import line at the top of the file instead of a second import statement.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/rounds.test.js`
Expected: FAIL — `resolveMySlot` not exported.

- [ ] **Step 3: Implement resolveMySlot**

Append to `src/utils/rounds.js`:

```js
export function resolveMySlot(saved, participants) {
  const n = Number(saved)
  if (!saved || !Number.isInteger(n)) return null
  return participants.some(p => p.slot === n) ? n : null
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Create NamePicker**

Create `src/components/public/NamePicker.jsx`:

```jsx
// src/components/public/NamePicker.jsx — one-time "find my name" chooser
import { useState } from 'react'

export default function NamePicker({ participants, t, onPick }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white border-2 border-dashed border-gold-300 text-gold-700 font-semibold text-sm py-2.5 rounded-2xl hover:bg-gold-50 transition-colors"
      >
        {t.findMyName}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gold-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">{t.whoAreYou}</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
          {t.close}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {participants.filter(p => p.name).map(p => (
          <button
            key={p.slot}
            onClick={() => onPick(p.slot)}
            className="text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gold-50 hover:text-gold-700 rounded-xl py-2.5 px-3 text-left truncate transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create MyViewCard (ticket style)**

Create `src/components/public/MyViewCard.jsx`:

```jsx
// src/components/public/MyViewCard.jsx — personalized "ticket" for the saved member
import { formatDate } from '../../utils/rounds'

export default function MyViewCard({ mySlot, participants, rounds, currentRound, pot, t, onClear }) {
  const me = participants.find(p => p.slot === mySlot)
  if (!me) return null
  const myRound = rounds.find(r => r.recipientSlot === mySlot)
  const paid = !!currentRound.payments[mySlot]
  const received = myRound && (myRound.payoutSent || currentRound.round > myRound.round)

  return (
    <div className="relative bg-white rounded-2xl shadow-md border-l-4 border-gold-500 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-gray-900">{me.name}</p>
          <button onClick={onClear} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
            {t.notYou}
          </button>
        </div>

        <p className={`text-sm font-semibold ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
          {paid ? `✓ ${t.yourStatusPaid}` : `● ${t.yourStatusPending}`}
        </p>

        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          {received ? (
            <p className="text-sm font-medium text-gray-700">{t.receivedPayout(myRound.round)}</p>
          ) : myRound ? (
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gold-700">{t.yourTurn}:</span>{' '}
              {t.round} {myRound.round} · {formatDate(myRound.payoutDate)} ·{' '}
              <span className="font-bold">${(pot ?? 0).toLocaleString()}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Highlight my row in PaymentStatusList**

In `src/components/public/PaymentStatusList.jsx`, add `mySlot` to the props destructure and change the row wrapper class:

```jsx
className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
  payments[p.slot] ? 'bg-emerald-50' : 'bg-gray-50'
} ${p.slot === mySlot ? 'ring-2 ring-gold-400' : ''}`}
```

- [ ] **Step 8: Wire into PublicBoard**

In `PublicBoard.jsx`:

```jsx
import { resolveMySlot } from '../../utils/rounds'   // extend existing import line
import MyViewCard from './MyViewCard'
import NamePicker from './NamePicker'

// state (near lang state):
const [mySlotRaw, setMySlotRaw] = useState(() => localStorage.getItem('tanda_my_slot'))

// after `const { participants, rounds } = data`:
const mySlot = resolveMySlot(mySlotRaw, participants)

// clear stale saved slot silently:
useEffect(() => {
  if (mySlotRaw && mySlot === null) {
    localStorage.removeItem('tanda_my_slot')
    setMySlotRaw(null)
  }
}, [mySlotRaw, mySlot])

function pickName(slot) {
  localStorage.setItem('tanda_my_slot', String(slot))
  setMySlotRaw(String(slot))
}
function clearMySlot() {
  localStorage.removeItem('tanda_my_slot')
  setMySlotRaw(null)
}
```

In the content JSX, insert directly above `<RecipientSpotlight ...>`:

```jsx
{mySlot ? (
  <MyViewCard
    mySlot={mySlot}
    participants={participants}
    rounds={rounds}
    currentRound={round}
    pot={participants.length * CONTRIBUTION}
    t={t}
    onClear={clearMySlot}
  />
) : (
  <NamePicker participants={participants} t={t} onPick={pickName} />
)}
```

And pass `mySlot={mySlot}` to `<PaymentStatusList ...>`.

NOTE: all hooks (including the stale-slot `useEffect`) must sit above the `!data.config.initialized` early return to keep hook order stable.

- [ ] **Step 9: Verify manually + run tests**

Dev server: tap "Find my name 👋" → pick a name → ticket card shows paid status + "Your turn: Round N · date · $2,400"; row highlighted in contributions; "Not you?" clears; ES toggle translates all of it.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/utils/rounds.js src/test/rounds.test.js src/components/public/NamePicker.jsx src/components/public/MyViewCard.jsx src/components/public/PaymentStatusList.jsx src/components/public/PublicBoard.jsx
git commit -m "feat: My view — personal member card with payout ticket and row highlight"
```

---

### Task 8: Visual "wow" pass

**Files:**
- Modify: `src/index.css`, `src/components/public/RecipientSpotlight.jsx`, `src/components/public/CountdownTimer.jsx`, `src/components/public/PaymentStatusList.jsx`, `src/components/public/PublicBoard.jsx`, `src/components/public/MyViewCard.jsx`

**Interfaces:**
- Consumes: `isPayoutWindow` (Task 2).
- Produces: CSS classes `animate-shimmer`, `card-in`, `digit-roll`, `dot-pop`, `confetti-piece` used by the components; no JS API changes.

- [ ] **Step 1: Add keyframes + reduced-motion guard to `src/index.css`**

Append:

```css
/* --- Tanda visual polish --- */
@keyframes shimmer {
  0%   { transform: translateX(-150%) skewX(-15deg); }
  100% { transform: translateX(350%) skewX(-15deg); }
}
.animate-shimmer {
  animation: shimmer 3.5s ease-in-out infinite;
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card-in {
  animation: card-in 0.5s ease-out both;
}

@keyframes digit-roll {
  from { opacity: 0; transform: translateY(-0.4em); }
  to   { opacity: 1; transform: translateY(0); }
}
.digit-roll {
  animation: digit-roll 0.35s ease-out;
}

@keyframes dot-pop {
  0%   { transform: scale(0.4); }
  70%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
.dot-pop {
  animation: dot-pop 0.4s ease-out both;
}

@keyframes confetti-fall {
  0%   { opacity: 1; transform: translateY(-10px) rotate(0deg); }
  100% { opacity: 0; transform: translateY(140px) rotate(540deg); }
}
.confetti-piece {
  position: absolute;
  top: 0;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  animation: confetti-fall 2.8s ease-in both;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .animate-shimmer, .card-in, .digit-roll, .dot-pop, .confetti-piece {
    animation: none;
  }
  .confetti-piece { display: none; }
}
```

- [ ] **Step 2: RecipientSpotlight — shimmer, medallion, confetti**

Rewrite `src/components/public/RecipientSpotlight.jsx`:

```jsx
// src/components/public/RecipientSpotlight.jsx
import { formatDate, isPayoutWindow } from '../../utils/rounds'

const CONFETTI_COLORS = ['#fff', '#fde68a', '#f59e0b', '#34d399', '#93c5fd']

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    left: `${(i * 41) % 100}%`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    animationDelay: `${(i % 8) * 0.18}s`,
  }))
  return (
    <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="confetti-piece" style={style} />
      ))}
    </div>
  )
}

export default function RecipientSpotlight({ round, recipientName, t, pot, totalRounds }) {
  const celebrate = isPayoutWindow(round) || round.payoutSent
  const initial = (recipientName || '?')[0].toUpperCase()

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 rounded-3xl p-6 text-white shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />
      <div className="absolute top-1/2 right-8 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />
      {/* shimmer sweep */}
      <div className="absolute inset-y-0 w-24 bg-white/15 blur-md animate-shimmer pointer-events-none" aria-hidden="true" />
      {celebrate && <Confetti />}

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {t.round} {round.round} {t.of} {totalRounds}
          </span>
        </div>

        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-white/25 border-2 border-white/60 shadow-inner flex items-center justify-center flex-shrink-0">
            <span className="text-3xl font-black drop-shadow-sm">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/80 text-sm font-medium">🎉 {t.recipient}</p>
            <h2 className="text-4xl font-black tracking-tight drop-shadow-sm truncate">
              {recipientName || '—'}
            </h2>
          </div>
        </div>
        <div className="text-6xl font-black mb-5 drop-shadow tracking-tight">
          ${(pot ?? 0).toLocaleString()}
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

- [ ] **Step 3: CountdownTimer — rolling digits + urgency pulse**

In `src/components/public/CountdownTimer.jsx`, replace the final return block (the countdown card) with:

```jsx
const urgent = time.days === 0

return (
  <div className={`bg-white rounded-2xl shadow-sm p-4 border transition-colors ${urgent ? 'border-gold-300' : 'border-gray-100'}`}>
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 text-center">
      {t.nextIn}
    </p>
    <div className="flex items-center justify-center gap-3">
      {units.map(({ value, label }, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="text-center min-w-[3rem]">
            <div
              key={value}
              className={`text-3xl font-black tabular-nums digit-roll ${urgent ? 'text-gold-600' : 'text-gray-900'}`}
            >
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
```

(The `key={value}` on the digit div re-mounts it when the value changes, re-triggering the `digit-roll` animation. `const urgent = ...` goes right before the return, after the `units` array.)

- [ ] **Step 4: PaymentStatusList — segmented dot track**

In `src/components/public/PaymentStatusList.jsx`, replace the progress-bar block (the `<div className="mb-1">…</div>` containing the `h-2.5` bar and pct caption) with a per-member segment track:

```jsx
<div className="mb-1">
  <div className="flex items-center gap-1.5 flex-wrap">
    {participants.map((p, i) => (
      <span
        key={p.slot}
        className={`h-3 flex-1 min-w-[14px] rounded-full transition-colors ${
          payments[p.slot] ? 'bg-emerald-400 dot-pop' : 'bg-gray-200'
        }`}
        style={payments[p.slot] ? { animationDelay: `${i * 60}ms` } : undefined}
        title={p.name || `Slot ${p.slot}`}
      />
    ))}
  </div>
  <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
</div>
```

- [ ] **Step 5: PublicBoard — staggered card entrance + header polish**

In `PublicBoard.jsx`:

1. Wrap each direct child of the content container (`MyViewCard`/`NamePicker` block, `RecipientSpotlight`, `CountdownTimer`, `PaymentStatusList`, `OrganizerCard`, `RoundSchedule`) in a stagger div:

```jsx
<div className="card-in" style={{ animationDelay: '0ms' }}>{/* MyViewCard-or-NamePicker block */}</div>
<div className="card-in" style={{ animationDelay: '70ms' }}><RecipientSpotlight ... /></div>
<div className="card-in" style={{ animationDelay: '140ms' }}><CountdownTimer ... /></div>
<div className="card-in" style={{ animationDelay: '210ms' }}><PaymentStatusList ... /></div>
<div className="card-in" style={{ animationDelay: '280ms' }}><OrganizerCard ... /></div>
<div className="card-in" style={{ animationDelay: '350ms' }}><RoundSchedule ... /></div>
```

2. Header: change the header wrapper class to add a subtle gold accent:

```jsx
<div className="bg-gradient-to-r from-white via-gold-50/60 to-white border-b border-gold-100 px-4 py-4 shadow-sm">
```

- [ ] **Step 6: MyViewCard ticket punch-holes**

In `MyViewCard.jsx`, inside the root `div` (it is already `relative ... overflow-hidden` — change `overflow-hidden` to `overflow-visible` is NOT needed; keep hidden and place the notches just inside), add before `<div className="p-4">`:

```jsx
<span className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gold-50 rounded-full border border-gray-200" aria-hidden="true" />
<span className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gold-50 rounded-full border border-gray-200" aria-hidden="true" />
```

(These read as ticket punch-holes against the page's `bg-gold-50` background.)

- [ ] **Step 7: Verify visuals + tests**

Dev server, mobile viewport (~390px): shimmer sweeps the gold card; digits roll on minute change; segments pop in stagger; cards fade in staggered on load; ticket has punch-holes; enable OS reduced-motion → animations off, layout intact.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/components/public/
git commit -m "feat: visual polish — shimmer spotlight, confetti, rolling countdown, segment track, staggered cards"
```

---

### Task 9: Final verification, build, deploy

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 3: Preview smoke test**

Run: `npm run preview` (background) and open the preview URL. Verify: public board renders with animations, My view flow works, admin PIN gate loads, banner appears after a change.

- [ ] **Step 4: Deploy**

Run: `npm run deploy`
Expected: "Published" from gh-pages.

- [ ] **Step 5: Verify live site**

Open https://mmira11.github.io/tanda-manager — confirm new visuals, freshness caption, and My view on the deployed site (hard refresh or incognito to bypass PWA cache).

- [ ] **Step 6: Push main**

```bash
git status --short   # should be clean
git push origin main
```
