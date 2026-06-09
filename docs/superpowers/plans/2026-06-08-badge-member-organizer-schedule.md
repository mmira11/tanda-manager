# Unpublished Badge, Add Member, Organizer Card, Round Schedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unpublished-changes badge to the publish button, an Add Member flow to the Roster tab, an organizer contact card and full round schedule to the public board, and fix the stale-data CDN caching bug.

**Architecture:** All store mutations already route through a single `update()` wrapper in `useTandaStore` — stamping `lastModified` there makes every future mutation dirty-trackable for free. New public board sections (`OrganizerCard`, `RoundSchedule`) are isolated components receiving props from `PublicBoard`. Dynamic pot/counts replace every hardcoded `SLOT_COUNT`/`POT` reference so the app scales to 13+ members naturally.

**Tech Stack:** React 18, Vite, Tailwind CSS (with `gold-*` custom palette), Vitest + @testing-library/react, localStorage persistence (`tanda_data`), GitHub Contents API for publishing.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/utils/github.js` | Modify | Append `?t=${Date.now()}` to `fetchPublicData` URL |
| `src/test/github.test.js` | Create | Test that fetch URL includes cache-busting param |
| `src/hooks/useTandaStore.js` | Modify | `lastModified: 0` in initial state; stamp in `update()`; add `addMember()`; `importData` stamps too |
| `src/test/useTandaStore.test.js` | Modify | Add 4 tests: lastModified initial, lastModified after mutation, addMember adds participant+round, addMember patches existing rounds |
| `src/components/admin/DataControls.jsx` | Modify | `lastPublished` state; compute `hasUnpublishedChanges`; badge UI; save timestamp on publish success |
| `src/components/admin/RosterEditor.jsx` | Modify | `AddMemberForm` sub-component; "Add Member" button at bottom; calls `addMember` from `useStore()` |
| `src/components/public/RecipientSpotlight.jsx` | Modify | Remove `POT` import; accept `pot` prop; render `pot` instead |
| `src/components/public/PaymentStatusList.jsx` | Modify | Remove `SLOT_COUNT` import; use `participants.length` for pct and header count |
| `src/components/public/PublicBoard.jsx` | Modify | Dynamic `/ {rounds.length}`; pass `pot` to RecipientSpotlight; add 4 new LABELS keys; render OrganizerCard + RoundSchedule; remove SLOT_COUNT import; fix footer |
| `src/components/public/OrganizerCard.jsx` | Create | Organizer avatar card with Zelle deep link |
| `src/components/public/RoundSchedule.jsx` | Create | Full round schedule list, bilingual |

---

## Task 0: Fix CDN cache-busting in github.js

**Files:**
- Modify: `src/utils/github.js:74-79`
- Create: `src/test/github.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/test/github.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPublicData } from '../utils/github'

describe('fetchPublicData', () => {
  afterEach(() => vi.restoreAllMocks())

  it('appends a cache-busting timestamp to the fetch URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchPublicData()
    const calledUrl = mockFetch.mock.calls[0][0]
    expect(calledUrl).toMatch(/\?t=\d+$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/github.test.js
```

Expected: FAIL — `expect(calledUrl).toMatch(/\?t=\d+$/)` fails because the URL has no `?t=` param.

- [ ] **Step 3: Fix the URL in fetchPublicData**

In `src/utils/github.js`, change line 76–77:

```js
export async function fetchPublicData() {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('No public data found')
  return res.json()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/github.test.js
```

Expected: PASS — 1 test passes.

- [ ] **Step 5: Run all tests to confirm no regressions**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/github.js src/test/github.test.js
git commit -m "fix: bust CDN cache in fetchPublicData with ?t=Date.now() query param"
```

---

## Task 1: Add lastModified + addMember to useTandaStore

**Files:**
- Modify: `src/hooks/useTandaStore.js`
- Modify: `src/test/useTandaStore.test.js`

- [ ] **Step 1: Write the failing tests**

Append these four tests to the `describe('useTandaStore', ...)` block in `src/test/useTandaStore.test.js`:

```js
  it('initializes lastModified as 0', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.lastModified).toBe(0)
  })

  it('updates lastModified after any mutation', () => {
    const { result } = renderHook(() => useTandaStore())
    expect(result.current.store.lastModified).toBe(0)
    act(() => result.current.updateParticipant(1, { name: 'Edy' }))
    expect(result.current.store.lastModified).toBeGreaterThan(0)
  })

  it('addMember adds a 13th participant with correct slot, name, phone', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.addMember('Alice', '5551234567'))
    expect(result.current.store.participants).toHaveLength(13)
    const added = result.current.store.participants[12]
    expect(added.slot).toBe(13)
    expect(added.name).toBe('Alice')
    expect(added.phone).toBe('5551234567')
  })

  it('addMember appends a round 14 days after the last round and patches all existing rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.addMember('Alice', '5551234567'))
    expect(result.current.store.rounds).toHaveLength(13)
    const newRound = result.current.store.rounds[12]
    expect(newRound.round).toBe(13)
    expect(newRound.collectDate).toBe('2026-11-27') // 14 days after 2026-11-13
    expect(newRound.payoutDate).toBe('2026-11-28')  // 15 days after 2026-11-13
    expect(newRound.recipientSlot).toBe(13)
    expect(Object.keys(newRound.payments)).toHaveLength(13)
    // all existing rounds now have slot 13 in their payments map
    result.current.store.rounds.slice(0, 12).forEach(r => {
      expect(r.payments).toHaveProperty('13')
      expect(r.payments[13]).toBe(false)
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/useTandaStore.test.js
```

Expected: 4 new tests fail — `lastModified` is undefined; `addMember` is not a function.

- [ ] **Step 3: Add lastModified to buildInitialState**

In `src/hooks/useTandaStore.js`, add `lastModified: 0` inside `buildInitialState()`:

```js
function buildInitialState() {
  return {
    config: {
      organizerName: '',
      organizerPhone: '',
      organizerSlot: 11,
      pin: '',
      initialized: false,
    },
    lastModified: 0,
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
```

- [ ] **Step 4: Stamp lastModified in update()**

Change the `update` callback so it stamps `lastModified` on every mutation:

```js
const update = useCallback((updater) => {
  setStore(prev => {
    const next = updater(prev)
    next.lastModified = Date.now()
    saveStore(next)
    return next
  })
}, [])
```

- [ ] **Step 5: Add addMember callback**

Add this after the `updateRoundNotes` definition:

```js
const addMember = useCallback((name, phone) => {
  update(prev => {
    const newSlot = prev.participants.length + 1
    const lastRound = prev.rounds[prev.rounds.length - 1]
    const lastCollectMs = new Date(lastRound.collectDate + 'T12:00:00').getTime()
    const newCollect = new Date(lastCollectMs + 14 * 86400000).toISOString().slice(0, 10)
    const newPayout  = new Date(lastCollectMs + 15 * 86400000).toISOString().slice(0, 10)
    return {
      ...prev,
      participants: [
        ...prev.participants,
        { slot: newSlot, name: name.trim(), phone: phone.trim() },
      ],
      rounds: [
        ...prev.rounds.map(r => ({
          ...r,
          payments: { ...r.payments, [newSlot]: false },
        })),
        {
          round: newSlot,
          collectDate: newCollect,
          payoutDate:  newPayout,
          recipientSlot: newSlot,
          payments: Object.fromEntries(
            Array.from({ length: newSlot }, (_, i) => [i + 1, false])
          ),
          payoutSent: false,
          notes: '',
        },
      ],
    }
  })
}, [update])
```

- [ ] **Step 6: Stamp lastModified in importData**

Change `importData` so imported data is also marked as modified (so the publish badge appears after a restore):

```js
const importData = useCallback((jsonString) => {
  try {
    const parsed = JSON.parse(jsonString)
    const migrated = migrateStore(parsed)
    migrated.lastModified = Date.now()
    saveStore(migrated)
    setStore(migrated)
  } catch {
    throw new Error('Invalid JSON file')
  }
}, [])
```

- [ ] **Step 7: Export addMember from the hook**

Add `addMember` to the return object of `useTandaStore`:

```js
return {
  store,
  updateParticipant,
  togglePayment,
  togglePayout,
  updateRoundNotes,
  addMember,
  saveConfig,
  exportData,
  importData,
  resetData,
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run src/test/useTandaStore.test.js
```

Expected: All 16 tests pass (12 existing + 4 new).

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useTandaStore.js src/test/useTandaStore.test.js
git commit -m "feat: track lastModified on every mutation and add addMember to store"
```

---

## Task 2: Unpublished changes badge in DataControls

**Files:**
- Modify: `src/components/admin/DataControls.jsx`

- [ ] **Step 1: Add lastPublished state**

Inside the `DataControls` component, add `lastPublished` state after the existing `publishError` state declaration (around line 11):

```js
const [lastPublished, setLastPublished] = useState(
  () => parseInt(localStorage.getItem('tanda_last_published') || '0')
)
const hasUnpublishedChanges = store.lastModified > lastPublished
```

- [ ] **Step 2: Save timestamp on publish success**

Replace the `setPublishStatus('ok')` line inside `handlePublish` with:

```js
setPublishStatus('ok')
const ts = store.lastModified
localStorage.setItem('tanda_last_published', String(ts))
setLastPublished(ts)
```

The full `handlePublish` function should now read:

```js
async function handlePublish() {
  if (!githubToken) return
  setPublishStatus('loading')
  setPublishError('')
  try {
    await publishToGitHub(githubToken, store)
    setPublishStatus('ok')
    const ts = store.lastModified
    localStorage.setItem('tanda_last_published', String(ts))
    setLastPublished(ts)
  } catch (err) {
    setPublishStatus('error')
    setPublishError(err.message)
  }
}
```

- [ ] **Step 3: Add badge UI above the Publish button**

Inside the "Public board sync" card, insert the badge just before the `<button>` for publish (before the line with `onClick={handlePublish}`):

```jsx
{hasUnpublishedChanges && (
  <p className="text-xs text-orange-600 font-semibold mb-2 flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block flex-shrink-0" />
    Unpublished changes
  </p>
)}
<button
  onClick={handlePublish}
  disabled={!githubToken || publishStatus === 'loading'}
  className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold py-3 rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  {publishStatus === 'loading' ? 'Publishing…' : '↑ Publish to Public Board'}
</button>
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass (no unit tests for this component, but confirm nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/DataControls.jsx
git commit -m "feat: show unpublished changes badge on publish button when store is dirty"
```

---

## Task 3: Add Member form in RosterEditor

**Files:**
- Modify: `src/components/admin/RosterEditor.jsx`

- [ ] **Step 1: Import useState and addMember**

The file already imports `useState` from React (used in `ParticipantRow`). Add `addMember` to the `useStore()` destructure inside `RosterEditor`:

```js
export default function RosterEditor() {
  const { store, addMember } = useStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
```

- [ ] **Step 2: Add handleAddSave function**

Inside `RosterEditor`, below the state declarations:

```js
function handleAddSave() {
  if (!newName.trim()) return
  addMember(newName.trim(), newPhone.trim())
  setNewName('')
  setNewPhone('')
  setShowAddForm(false)
}
```

- [ ] **Step 3: Add the button and inline form below the participant list**

Replace the closing `</div>` after `{store.participants.map(...)}` block and add the button + form. The full inner card JSX becomes:

```jsx
<div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
  <h3 className="font-semibold text-gray-900 mb-1">Participant Roster</h3>
  <p className="text-xs text-gray-500 mb-4">
    Edit any name or phone — changes save when you tap outside the field.
  </p>
  <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 mb-2 px-0.5">
    <span />
    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone (Zelle)</span>
  </div>
  <div>
    {store.participants.map(p => (
      <ParticipantRow key={p.slot} participant={p} />
    ))}
  </div>

  {showAddForm ? (
    <div className="mt-4 p-4 border-2 border-gold-200 rounded-xl bg-gold-50 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {store.participants.length + 1}
        </span>
        <span className="text-xs text-gray-400">Slot auto-assigned</span>
      </div>
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-white transition-colors"
        value={newName}
        placeholder="Name"
        onChange={e => setNewName(e.target.value)}
      />
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-white transition-colors"
        value={newPhone}
        placeholder="Phone (Zelle)"
        inputMode="tel"
        onChange={e => setNewPhone(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={handleAddSave}
          disabled={!newName.trim()}
          className="flex-1 bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => { setShowAddForm(false); setNewName(''); setNewPhone('') }}
          className="flex-1 bg-white border border-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowAddForm(true)}
      className="mt-4 w-full border-2 border-gold-400 text-gold-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-50 transition-colors"
    >
      + Add Member
    </button>
  )}
</div>
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RosterEditor.jsx
git commit -m "feat: add Add Member button and inline form to Roster tab"
```

---

## Task 4: Dynamic pot/counts in RecipientSpotlight, PaymentStatusList, PublicBoard

**Files:**
- Modify: `src/components/public/RecipientSpotlight.jsx:3-5,26`
- Modify: `src/components/public/PaymentStatusList.jsx:2,7,19`
- Modify: `src/components/public/PublicBoard.jsx:7,132,141,158-159`

### RecipientSpotlight

- [ ] **Step 1: Replace POT import with pot prop**

Replace the entire file content of `src/components/public/RecipientSpotlight.jsx`:

```jsx
// src/components/public/RecipientSpotlight.jsx
import { formatDate } from '../../utils/rounds'

export default function RecipientSpotlight({ round, recipientName, t, pot, totalRounds }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 rounded-3xl p-6 text-white shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />
      <div className="absolute top-1/2 right-8 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {t.round} {round.round} {t.of} {totalRounds}
          </span>
        </div>

        <p className="text-white/80 text-sm font-medium mb-1">
          🎉 {t.recipient}
        </p>
        <h2 className="text-4xl font-black tracking-tight mb-1 drop-shadow-sm">
          {recipientName || '—'}
        </h2>
        <div className="text-5xl font-black mb-5 drop-shadow-sm">
          ${pot.toLocaleString()}
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

### PaymentStatusList

- [ ] **Step 2: Replace SLOT_COUNT with participants.length**

Replace the entire file content of `src/components/public/PaymentStatusList.jsx`:

```jsx
// src/components/public/PaymentStatusList.jsx
import { getPaidCount } from '../../utils/rounds'

export default function PaymentStatusList({ participants, payments, rounds, currentRoundNum, t }) {
  const paidCount = getPaidCount(payments)
  const total = participants.length
  const pct = Math.round((paidCount / total) * 100)

  const nextRound = rounds?.find(r => r.round === currentRoundNum + 1)
  const nextRecipient = nextRound
    ? participants.find(p => p.slot === nextRound.recipientSlot)?.name || `Slot ${nextRound.recipientSlot}`
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{t.contributions}</h3>
        <span className="text-sm font-bold text-emerald-600">
          {paidCount} {t.of} {total} ✓
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

### PublicBoard — dynamic counts only (new components added in Task 7)

- [ ] **Step 3: Remove SLOT_COUNT import and fix hardcoded counts**

In `src/components/public/PublicBoard.jsx`:

1. Change the import on line 7 from:
   ```js
   import { CONTRIBUTION, SLOT_COUNT } from '../../data/scheduleTemplate'
   ```
   to:
   ```js
   import { CONTRIBUTION } from '../../data/scheduleTemplate'
   ```

2. Change the round counter pill (around line 132) from:
   ```jsx
   <span className="text-sm font-medium text-gray-400"> / 12</span>
   ```
   to:
   ```jsx
   <span className="text-sm font-medium text-gray-400"> / {rounds.length}</span>
   ```

3. Change the `<RecipientSpotlight>` call (line 141) to pass `pot` and `totalRounds`:
   ```jsx
   <RecipientSpotlight
     round={round}
     recipientName={recipientName}
     t={t}
     pot={participants.length * CONTRIBUTION}
     totalRounds={rounds.length}
   />
   ```

4. Change the footer paragraph (lines 158–159) from:
   ```jsx
   {lang === 'en'
     ? `Send $${CONTRIBUTION} to the organizer every ${collectDayName} · Payout every ${payoutDayName} · ${SLOT_COUNT} rounds total`
     : `Envía $${CONTRIBUTION} al organizador cada ${collectDayName} · Pago cada ${payoutDayName} · ${SLOT_COUNT} rondas en total`
   }
   ```
   to:
   ```jsx
   {lang === 'en'
     ? `Send $${CONTRIBUTION} to the organizer every ${collectDayName} · Payout every ${payoutDayName} · ${rounds.length} rounds total`
     : `Envía $${CONTRIBUTION} al organizador cada ${collectDayName} · Pago cada ${payoutDayName} · ${rounds.length} rondas en total`
   }
   ```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/RecipientSpotlight.jsx src/components/public/PaymentStatusList.jsx src/components/public/PublicBoard.jsx
git commit -m "feat: replace hardcoded POT/SLOT_COUNT with dynamic participants.length * CONTRIBUTION"
```

---

## Task 5: Create OrganizerCard component

**Files:**
- Create: `src/components/public/OrganizerCard.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/public/OrganizerCard.jsx`:

```jsx
export default function OrganizerCard({ organizerName, organizerPhone, t }) {
  if (!organizerPhone) return null
  const digits = organizerPhone.replace(/\D/g, '')
  const initial = organizerName ? organizerName[0].toUpperCase() : '?'

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-3">{t.contactOrganizer}</h3>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gold-500 text-white font-bold text-lg flex items-center justify-center flex-shrink-0">
          {initial}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{organizerName}</p>
          <p className="text-sm text-gray-500">{organizerPhone}</p>
        </div>
      </div>
      <a
        href={`zelle://${digits}`}
        className="block w-full text-center bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
      >
        {t.payViaZelle}
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass (component has no unit tests — it will be verified visually after wiring in Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/components/public/OrganizerCard.jsx
git commit -m "feat: add OrganizerCard component with Zelle deep link"
```

---

## Task 6: Create RoundSchedule component

**Files:**
- Create: `src/components/public/RoundSchedule.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/public/RoundSchedule.jsx`:

```jsx
import { formatDate } from '../../utils/rounds'

export default function RoundSchedule({ rounds, participants, currentRoundNum, t }) {
  if (!rounds?.length) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-3">{t.schedule}</h3>
      <div className="space-y-0.5">
        {rounds.map(r => {
          const recipient = participants.find(p => p.slot === r.recipientSlot)
          const name = recipient?.name || `Slot ${r.recipientSlot}`
          const isCurrent = r.round === currentRoundNum
          const isDone = r.payoutSent

          return (
            <div
              key={r.round}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${
                isCurrent ? 'border-l-4 border-gold-500 bg-gold-50' : ''
              }`}
            >
              <span
                className={`text-xs font-bold w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  isCurrent
                    ? 'border-gold-500 text-gold-700 bg-white'
                    : isDone
                    ? 'border-gray-200 text-gray-400'
                    : 'border-gray-300 text-gray-500'
                }`}
              >
                {r.round}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>
                  {name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDate(r.collectDate)} → {formatDate(r.payoutDate)}
                </p>
              </div>
              {isDone && (
                <span title={t.completed} className="text-emerald-500 font-bold text-sm flex-shrink-0">✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/RoundSchedule.jsx
git commit -m "feat: add RoundSchedule component showing all rounds with current gold highlight"
```

---

## Task 7: Wire OrganizerCard + RoundSchedule into PublicBoard with new LABELS keys

**Files:**
- Modify: `src/components/public/PublicBoard.jsx`

This task makes three targeted edits to `PublicBoard.jsx`:
1. Add imports for the two new components
2. Add 4 new keys to both `en` and `es` LABELS objects
3. Render `<OrganizerCard>` and `<RoundSchedule>` after `<PaymentStatusList>`

- [ ] **Step 1: Add imports**

At the top of `src/components/public/PublicBoard.jsx`, after the existing component imports, add:

```js
import OrganizerCard from './OrganizerCard'
import RoundSchedule from './RoundSchedule'
```

- [ ] **Step 2: Add new LABELS keys**

In the `LABELS` object, add the 4 new keys to both language objects.

For `en`, add after `payoutDone`:
```js
    contactOrganizer: 'Contact Organizer',
    payViaZelle:      'Pay via Zelle',
    schedule:         'Round Schedule',
    completed:        'Completed',
```

For `es`, add after `payoutDone`:
```js
    contactOrganizer: 'Contactar al organizador',
    payViaZelle:      'Pagar por Zelle',
    schedule:         'Calendario de rondas',
    completed:        'Completada',
```

- [ ] **Step 3: Render OrganizerCard and RoundSchedule**

In `PublicBoard.jsx`, inside the content `<div className="max-w-lg mx-auto p-4 space-y-4">`, add `<OrganizerCard>` and `<RoundSchedule>` after `<PaymentStatusList>` and before the footer `<p>`:

```jsx
<PaymentStatusList
  participants={participants}
  payments={round.payments}
  rounds={rounds}
  currentRoundNum={round.round}
  t={t}
/>
<OrganizerCard
  organizerName={data.config.organizerName}
  organizerPhone={data.config.organizerPhone}
  t={t}
/>
<RoundSchedule
  rounds={rounds}
  participants={participants}
  currentRoundNum={round.round}
  t={t}
/>
<p className="text-center text-xs text-gray-400 pb-6">
  {lang === 'en'
    ? `Send $${CONTRIBUTION} to the organizer every ${collectDayName} · Payout every ${payoutDayName} · ${rounds.length} rounds total`
    : `Envía $${CONTRIBUTION} al organizador cada ${collectDayName} · Pago cada ${payoutDayName} · ${rounds.length} rondas en total`
  }
</p>
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/PublicBoard.jsx
git commit -m "feat: wire OrganizerCard and RoundSchedule into PublicBoard with bilingual labels"
```

---

## Task 8: Deploy

**Files:** None (deployment only)

- [ ] **Step 1: Run the full test suite one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Deploy to GitHub Pages**

```bash
npm run deploy
```

Expected: Build succeeds and gh-pages branch is updated. You'll see output like `Published` from the gh-pages npm package.

- [ ] **Step 3: Remind the organizer to publish**

After deploy completes, inform the user:

> "Deploy complete. Now open the admin dashboard, go to **Settings → Public Board**, and click **↑ Publish to Public Board** so the live public board gets the latest tanda data (the new organizer card, round schedule, and any payment updates will appear after publish)."
