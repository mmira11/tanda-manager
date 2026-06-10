---
name: remove-reorder-member
description: Design for removing members from the roster (with renumbering and warning) and reordering via up/down arrows, accessed through an edit mode toggle in RosterEditor.
metadata:
  type: project
---

# Remove & Reorder Members — Design

## Summary

Add the ability to remove a member from the roster and reorder members via up/down arrows. Both actions are gated behind an "Edit Roster" edit mode toggle to prevent accidental taps during normal use.

## Scope

- Remove any member at any time (pre-tanda or mid-tanda)
- Warn before removing if the member has recorded payment history
- Renumber all slots and rounds after removal
- Reorder adjacent members via up/down arrows (instant, no confirmation)
- Inputs are read-only while in edit mode to keep the row layout stable

Out of scope: blocking removal based on payment history, drag-and-drop reordering.

## Data Model Changes

### `removeMember(slot)` — new store action

Steps executed atomically via the existing `update()` helper:

1. Remove participant where `participant.slot === slot`
2. Renumber remaining participants: for each participant with `slot > removed slot`, decrement slot by 1
3. Remove the round where `round.round === slot`
4. For remaining rounds with `round.round > slot`: decrement `round.round` by 1
5. For remaining rounds with `round.recipientSlot > slot`: decrement `recipientSlot` by 1
6. In every remaining round's `payments` object: delete key `slot`, then rename every key `Y > slot` to `Y - 1`

### `reorderMember(slot, direction)` — new store action

Swaps `name` and `phone` between the participant at `slot` and the adjacent participant (`slot - 1` for `'up'`, `slot + 1` for `'down'`). Round numbers, `recipientSlot` values, and payment keys are unchanged — rounds reference slot numbers, which stay fixed.

Guards: no-op if `direction === 'up'` and `slot === 1`, or `direction === 'down'` and `slot === participants.length`.

## UI Changes — `RosterEditor.jsx`

### Edit mode toggle

- Add `editMode` boolean state (default `false`)
- Above the participant list, render a button:
  - `editMode === false`: "Edit Roster" (secondary style, e.g. border-gray-300)
  - `editMode === true`: "Done" (gold style)
- Toggling "Done" exits edit mode and clears any open inline confirmation

### `ParticipantRow` changes

New props: `editMode`, `isFirst`, `isLast`, `onMoveUp`, `onMoveDown`, `onRemove`

Grid layout changes:
- Normal mode: `grid-cols-[2rem_1fr_1fr]` — slot badge, name input, phone input (unchanged)
- Edit mode: `grid-cols-[2rem_1fr_1fr_auto]` — adds a controls column with ↑ ↓ × buttons
- Name and phone inputs are `readOnly` in edit mode

Controls column (edit mode only):
- ↑ button: disabled and visually muted when `isFirst`
- ↓ button: disabled and visually muted when `isLast`
- × button: triggers inline confirmation expansion

### Inline confirmation

When × is clicked, the row expands below (same visual pattern as the "Add Member" form) showing:

- **No payment history**: "Remove [Name] from the roster? This cannot be undone."
- **Has payment history** (any `payments[slot] === true` in any round): "⚠️ [Name] has payment history. Removing them will delete all recorded payments."

Two buttons: **Remove** (red/destructive style) and **Cancel**.

Clicking Cancel or toggling "Done" closes the confirmation without removing.

## Helper — hasPaymentHistory(store, slot)

A small utility used in `ParticipantRow` to determine warning level:

```js
function hasPaymentHistory(store, slot) {
  return store.rounds.some(r => r.payments[slot] === true)
}
```

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useTandaStore.js` | Add `removeMember` and `reorderMember` actions; expose in return object |
| `src/components/admin/RosterEditor.jsx` | Add `editMode` state, Edit/Done button, update `ParticipantRow` with controls |
