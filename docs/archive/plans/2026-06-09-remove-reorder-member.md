# Remove & Reorder Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remove (with slot renumbering and confirmation warning) and up/down reorder to the admin roster, gated behind an "Edit Roster" toggle button.

**Architecture:** Two new store actions (`removeMember`, `reorderMember`) in `useTandaStore.js` handle all data mutations. `RosterEditor.jsx` gains an `editMode` boolean; when active, each `ParticipantRow` shows ↑ ↓ × controls and an inline confirmation expansion on ×.

**Tech Stack:** React 18, Vitest + @testing-library/react, Tailwind CSS, localStorage

---

## File Map

| File | Change |
|---|---|
| `src/hooks/useTandaStore.js` | Add `reorderMember` and `removeMember`; expose in return object |
| `src/test/useTandaStore.test.js` | Add tests for both new actions |
| `src/components/admin/RosterEditor.jsx` | Add edit mode, ↑↓× controls, inline confirmation |

---

## Task 1: `reorderMember` store action (TDD)

**Files:**
- Modify: `src/hooks/useTandaStore.js`
- Test: `src/test/useTandaStore.test.js`

- [ ] **Step 1: Add failing tests**

Append these tests inside the `describe('useTandaStore', ...)` block in `src/test/useTandaStore.test.js`:

```js
  it('reorderMember up swaps name and phone with the previous slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.reorderMember(4, 'up'))
    expect(result.current.store.participants[2].name).toBe('Dave')
    expect(result.current.store.participants[2].phone).toBe('444')
    expect(result.current.store.participants[3].name).toBe('Carol')
    expect(result.current.store.participants[3].phone).toBe('333')
    expect(result.current.store.participants[2].slot).toBe(3)
    expect(result.current.store.participants[3].slot).toBe(4)
  })

  it('reorderMember down swaps name and phone with the next slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.reorderMember(3, 'down'))
    expect(result.current.store.participants[2].name).toBe('Dave')
    expect(result.current.store.participants[3].name).toBe('Carol')
  })

  it('reorderMember up on first slot is a no-op', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(1, { name: 'Alice', phone: '111' }))
    act(() => result.current.reorderMember(1, 'up'))
    expect(result.current.store.participants[0].name).toBe('Alice')
  })

  it('reorderMember down on last slot is a no-op', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(12, { name: 'Last', phone: '999' }))
    act(() => result.current.reorderMember(12, 'down'))
    expect(result.current.store.participants[11].name).toBe('Last')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | grep -E "(reorderMember|FAIL|PASS|✓|✗|×)"
```

Expected: 4 failures with `result.current.reorderMember is not a function`

- [ ] **Step 3: Implement `reorderMember` in `src/hooks/useTandaStore.js`**

Add this callback after `addMember` (before `saveConfig`):

```js
  const reorderMember = useCallback((slot, direction) => {
    update(prev => {
      const idx = prev.participants.findIndex(p => p.slot === slot)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= prev.participants.length) return prev
      const a = prev.participants[idx]
      const b = prev.participants[swapIdx]
      const participants = prev.participants.map((p, i) => {
        if (i === idx)   return { ...p, name: b.name, phone: b.phone }
        if (i === swapIdx) return { ...p, name: a.name, phone: a.phone }
        return p
      })
      return { ...prev, participants }
    })
  }, [update])
```

Also add `reorderMember` to the return object at the bottom of `useTandaStore`:

```js
  return {
    store,
    updateParticipant,
    togglePayment,
    togglePayout,
    updateRoundNotes,
    addMember,
    reorderMember,
    saveConfig,
    exportData,
    importData,
    resetData,
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | grep -E "(reorderMember|FAIL|PASS)"
```

Expected: 4 tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && git add src/hooks/useTandaStore.js src/test/useTandaStore.test.js && git commit -m "feat: add reorderMember store action"
```

---

## Task 2: `removeMember` store action (TDD)

**Files:**
- Modify: `src/hooks/useTandaStore.js`
- Test: `src/test/useTandaStore.test.js`

- [ ] **Step 1: Add failing tests**

Append these tests inside the `describe('useTandaStore', ...)` block in `src/test/useTandaStore.test.js`:

```js
  it('removeMember removes the participant at the given slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(3, { name: 'Carol', phone: '333' }))
    act(() => result.current.removeMember(3))
    expect(result.current.store.participants).toHaveLength(11)
    expect(result.current.store.participants.find(p => p.name === 'Carol')).toBeUndefined()
  })

  it('removeMember renumbers subsequent participant slots', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.updateParticipant(4, { name: 'Dave', phone: '444' }))
    act(() => result.current.removeMember(3))
    const dave = result.current.store.participants.find(p => p.name === 'Dave')
    expect(dave.slot).toBe(3)
    expect(result.current.store.participants[2].slot).toBe(3)
  })

  it('removeMember removes the corresponding round', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.removeMember(3))
    expect(result.current.store.rounds).toHaveLength(11)
    expect(result.current.store.rounds.find(r => r.round === 3)).toBeDefined()
    expect(result.current.store.rounds.find(r => r.round === 12)).toBeUndefined()
  })

  it('removeMember renumbers subsequent round numbers and recipientSlots', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.removeMember(3))
    const round3 = result.current.store.rounds.find(r => r.round === 3)
    expect(round3).toBeDefined()
    expect(round3.recipientSlot).toBe(3)
    const round11 = result.current.store.rounds.find(r => r.round === 11)
    expect(round11).toBeDefined()
    expect(round11.recipientSlot).toBe(11)
  })

  it('removeMember shifts payment keys in all rounds', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 5))
    act(() => result.current.removeMember(3))
    // slot 5 shifted to slot 4
    expect(result.current.store.rounds[0].payments[4]).toBe(true)
    expect(result.current.store.rounds[0].payments[5]).toBeUndefined()
    // removed slot 3 key is gone
    expect(result.current.store.rounds[0].payments[3]).toBeUndefined()
  })

  it('removeMember keeps payment keys for slots before the removed slot', () => {
    const { result } = renderHook(() => useTandaStore())
    act(() => result.current.togglePayment(1, 2))
    act(() => result.current.removeMember(5))
    expect(result.current.store.rounds[0].payments[2]).toBe(true)
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | grep -E "(removeMember|FAIL|PASS)"
```

Expected: 6 failures with `result.current.removeMember is not a function`

- [ ] **Step 3: Implement `removeMember` in `src/hooks/useTandaStore.js`**

Add this callback after `reorderMember` (before `saveConfig`):

```js
  const removeMember = useCallback((slot) => {
    update(prev => {
      const participants = prev.participants
        .filter(p => p.slot !== slot)
        .map(p => p.slot > slot ? { ...p, slot: p.slot - 1 } : p)

      const rounds = prev.rounds
        .filter(r => r.round !== slot)
        .map(r => {
          const payments = {}
          Object.entries(r.payments).forEach(([k, v]) => {
            const kNum = Number(k)
            if (kNum === slot) return
            payments[kNum > slot ? kNum - 1 : kNum] = v
          })
          return {
            ...r,
            round: r.round > slot ? r.round - 1 : r.round,
            recipientSlot: r.recipientSlot > slot ? r.recipientSlot - 1 : r.recipientSlot,
            payments,
          }
        })

      return { ...prev, participants, rounds }
    })
  }, [update])
```

Also add `removeMember` to the return object:

```js
  return {
    store,
    updateParticipant,
    togglePayment,
    togglePayout,
    updateRoundNotes,
    addMember,
    reorderMember,
    removeMember,
    saveConfig,
    exportData,
    importData,
    resetData,
  }
```

- [ ] **Step 4: Run all tests to confirm they pass**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && git add src/hooks/useTandaStore.js src/test/useTandaStore.test.js && git commit -m "feat: add removeMember store action with renumbering"
```

---

## Task 3: Edit mode UI — toggle button and controls column

**Files:**
- Modify: `src/components/admin/RosterEditor.jsx`

- [ ] **Step 1: Replace `RosterEditor.jsx` with the full updated file**

Replace the entire contents of `src/components/admin/RosterEditor.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { buildGroupSmsUrl } from '../../utils/messaging'

function hasPaymentHistory(store, slot) {
  return store.rounds.some(r => r.payments[slot] === true)
}

function ParticipantRow({ participant, editMode, isFirst, isLast, store }) {
  const { updateParticipant, reorderMember, removeMember } = useStore()
  const [name, setName] = useState(participant.name)
  const [phone, setPhone] = useState(participant.phone)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setName(participant.name)
    setPhone(participant.phone)
  }, [participant.name, participant.phone])

  useEffect(() => {
    if (!editMode) setConfirming(false)
  }, [editMode])

  const hasHistory = hasPaymentHistory(store, participant.slot)

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className={`grid gap-2 items-center py-2.5 ${editMode ? 'grid-cols-[2rem_1fr_1fr_auto]' : 'grid-cols-[2rem_1fr_1fr]'}`}>
        <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {participant.slot}
        </span>
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
          value={name}
          placeholder={`Slot ${participant.slot}`}
          readOnly={editMode}
          onChange={e => setName(e.target.value)}
          onBlur={() => !editMode && updateParticipant(participant.slot, { name: name.trim() })}
        />
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
          value={phone}
          placeholder="Phone"
          inputMode="tel"
          readOnly={editMode}
          onChange={e => setPhone(e.target.value)}
          onBlur={() => !editMode && updateParticipant(participant.slot, { phone: phone.trim() })}
        />
        {editMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => reorderMember(participant.slot, 'up')}
              disabled={isFirst}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              onClick={() => reorderMember(participant.slot, 'down')}
              disabled={isLast}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm"
              aria-label="Remove member"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mb-3 p-3 border-2 border-red-200 rounded-xl bg-red-50 space-y-2">
          <p className="text-sm text-gray-700">
            {hasHistory
              ? `⚠️ ${participant.name || `Slot ${participant.slot}`} has payment history. Removing them will delete all recorded payments.`
              : `Remove ${participant.name || `Slot ${participant.slot}`} from the roster? This cannot be undone.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => removeMember(participant.slot)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
            >
              Remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 bg-white border border-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RosterEditor() {
  const { store, addMember } = useStore()
  const [editMode, setEditMode] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  function handleFormReset() {
    setShowAddForm(false)
    setNewName('')
    setNewPhone('')
  }

  function handleAddSave() {
    if (!newName.trim()) return
    addMember(newName.trim(), newPhone.trim())
    handleFormReset()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Participant Roster</h3>
          <button
            onClick={() => setEditMode(m => !m)}
            className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${
              editMode
                ? 'bg-gold-500 text-white hover:bg-gold-600'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {editMode ? 'Done' : 'Edit Roster'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {editMode
            ? 'Use ↑↓ to reorder or × to remove a member.'
            : 'Edit any name or phone — changes save when you tap outside the field.'}
        </p>
        <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 mb-2 px-0.5">
          <span />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone (Zelle)</span>
        </div>
        <div>
          {store.participants.map((p, i) => (
            <ParticipantRow
              key={p.slot}
              participant={p}
              editMode={editMode}
              isFirst={i === 0}
              isLast={i === store.participants.length - 1}
              store={store}
            />
          ))}
        </div>

        {!editMode && (showAddForm ? (
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
                onClick={handleFormReset}
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
        ))}
      </div>

      {(() => {
        const withPhone = store.participants.filter(p => p.phone?.trim())
        const orgPhone = store.config?.organizerPhone || ''
        const body = `Welcome to Tanda 2026! 🎉 Collection is every Friday — please send $200 to ${orgPhone || 'the organizer'} via Zelle on collection day. Looking forward to a great tanda with everyone!`
        const groupUrl = buildGroupSmsUrl(withPhone, body)
        return (
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-1">Group Message</h3>
            <p className="text-xs text-gray-500 mb-4">
              Open your SMS app with all members pre-loaded and a welcome message ready to send.
            </p>
            <a
              href={groupUrl ?? undefined}
              onClick={!groupUrl ? e => e.preventDefault() : undefined}
              className={`flex items-center justify-center gap-2 w-full font-semibold py-2.5 rounded-xl text-sm transition-colors ${
                groupUrl
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <span>💬</span>
              Start Group Chat ({withPhone.length})
            </a>
            {withPhone.length < 2 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Add phone numbers to at least 2 members to enable.
              </p>
            )}
          </div>
        )
      })()}

      <div className="bg-gold-50 border border-gold-200 rounded-2xl p-4 text-sm text-gray-700">
        <strong>Tip:</strong> Phone numbers are used for SMS and WhatsApp reminders only.
        They're stored on this device and never shared.
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && git add src/components/admin/RosterEditor.jsx && git commit -m "feat: add edit mode with reorder and remove controls to RosterEditor"
```

---

## Task 4: Build and deploy

- [ ] **Step 1: Run full test suite one final time**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm test -- --reporter=verbose 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 2: Build**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm run build 2>&1 | tail -10
```

Expected: `dist/` built with no errors.

- [ ] **Step 3: Deploy to GitHub Pages**

```bash
cd /Users/miguelmiramontes/Desktop/projects/tanda-manager && npm run deploy 2>&1 | tail -5
```

Expected: `Published` message. Live at https://mmira11.github.io/tanda-manager
