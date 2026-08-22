# Edit Past Rounds — Design

**Date:** 2026-08-22
**Status:** Approved by Miguel (pending spec review)

## Problem

There is no way to correct a round after it has passed.

`RoundPanel.jsx` hardcodes `getCurrentRound(rounds)`, so the admin "This Round" tab
only ever renders the round whose `payoutDate >= today`. As of 2026-08-22 that is
Round 6. Rounds 1–5 appear only in `HistoryLog.jsx`, which renders a read-only
`✓ Paid Out / Pending` badge with no control attached.

Concretely: Round 5 (collect 2026-08-07, payout 2026-08-08) paid out, but the payout
was never marked. The organizer has no path in the UI to record it, and members
looking at the public board see Round 5 without its ✓.

## Goal

Let the organizer select any round — past, current, or future — and edit it with the
same controls the current round already has. Edits flow to the public board through
the existing publish path.

## Non-goals

- No new publish plumbing. `update()` in `useTandaStore` already bumps `lastModified`,
  `PublishBanner` already keys off `store.lastModified > lastPublished`, and
  `RoundSchedule.jsx` already reads `r.payoutSent` per round. A past-round edit
  therefore surfaces "Unpublished changes" and reaches the public board with no
  changes to that machinery.
- No audit trail / edit history. Not asked for.
- No confirmation dialog on past-round edits. The amber context bar (below) is the
  guard; a modal on every toggle would make bulk correction painful.

## Approach

Parameterize `RoundPanel` by round number instead of hardcoding the current round,
and make History link into it.

Rejected alternatives:

- **Inline edit mode in `HistoryLog`** — would rebuild the payment-toggle UI a second
  time, leaving two editors to keep in sync.
- **Separate "Edit past round" screen** — a whole new tab and component for what is
  "the same panel, a different round."

## Changes

### 1. `utils/rounds.js` — new helper

```js
export function clampRound(n, rounds)
```

Returns `n` if a round with that number exists in `rounds`; otherwise returns the
current round's number (via `getCurrentRound`). Guards against a stale
`selectedRound` after `removeMember` deletes a round and renumbers the rest — a real
crash path today, since `removeMember` filters `r.round !== slot` and decrements
higher round numbers.

Tested in `test/rounds.test.js`: in-range number passes through; out-of-range number
falls back to current; empty/absent rounds do not throw.

### 2. `AdminDashboard.jsx` — own the selection

- New state: `selectedRound`, initialized to `getCurrentRound(store.rounds).round`.
- Pass `selectedRound` and `setSelectedRound` to `RoundPanel`.
- Pass `setSelectedRound` and `setTab` to `HistoryLog`.
- Tab label stays "This Round" — it is the round *workspace*, and the panel's own
  header states which round is loaded.

### 3. `RoundPanel.jsx` — render the selected round

- Accept `selectedRound` / `setSelectedRound` props.
- `const round = rounds.find(r => r.round === clampRound(selectedRound, rounds))`.
- **Round stepper** in the card header: `‹` / `›` buttons around the existing
  "Round N of 12" label. `‹` disabled on the first round, `›` on the last.
- **Off-current context bar** — when `selectedRound !== currentRound.round`, an amber
  bar above the card: "Editing a past round — paid out {formatDate(payoutDate)}" with
  a "Back to current" button. For a future round the same bar reads "Editing an
  upcoming round". This is the only thing distinguishing history from today, so it
  must be unmissable.
- **Hide reminders on non-current rounds.** When `selectedRound !== currentRound.round`,
  omit both the "Remind Unpaid" button and the entire Reminders card. Texting a
  payment reminder for a round that already paid out is worse than useless.
  (Confirmed with Miguel 2026-08-22.)
- Everything else is untouched: `PaymentRow` already takes `roundNum`, and
  `togglePayment(roundNum, slot)` / `togglePayout(roundNum)` /
  `updateRoundNotes(roundNum, notes)` are already round-addressed. No store changes
  at all.

### 4. `HistoryLog.jsx` — make the edit discoverable

Add an "Edit" button to each history card that calls `setSelectedRound(round.round)`
and switches to the round tab. This closes the actual UX failure: History is where
the organizer looks for a past round, and today it is a dead end.

## Data flow

```
AdminDashboard [selectedRound]
  ├── RoundPanel(selectedRound, setSelectedRound)
  │     └── togglePayment / togglePayout / updateRoundNotes  (roundNum = selectedRound)
  │           └── useTandaStore.update() → lastModified = Date.now() → localStorage
  ├── HistoryLog(setSelectedRound, setTab)   "Edit" → jump to round tab
  └── PublishBanner  ← lastModified > lastPublished → "Unpublished changes" → Publish
                                                          └── publishToGitHub → tanda-data.json
                                                                └── PublicBoard → RoundSchedule ✓
```

## Error handling

- Stale `selectedRound` (round removed): `clampRound` falls back to the current round.
  No crash, no blank panel.
- Empty `rounds` (pre-setup): `App` renders `SetupWizard` before this path is
  reachable, so no additional guard is added. `clampRound` still tolerates it.

## Testing

- **Unit:** `clampRound` cases in `test/rounds.test.js`.
- **Existing coverage:** the three mutators are already covered by
  `test/useTandaStore.test.js` and are unchanged.
- **Manual, in the dev server:** navigate to Round 5, mark payout sent, confirm the
  Reminders card is absent, confirm the amber bar appears, confirm the publish banner
  lights up, confirm History shows Round 5 as ✓ Paid Out.

Manual verification is blocked until `index.html` and `vite.config.js` are restored;
they are deleted in the working tree and `npm run dev` cannot boot without them.

## Deploy

GitHub Pages repo — branches get no preview URL. Preview locally via `npm run dev`.
Deploy is a manual `npm run deploy` from `main` after merge, then verify the served
asset hash against the local build.
