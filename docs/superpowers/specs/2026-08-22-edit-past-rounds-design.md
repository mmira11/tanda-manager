# Edit Past Rounds — Design

**Date:** 2026-08-22
**Status:** Approved by Miguel (pending spec review)

## Problem

Rounds 5 (Sergio, payout 2026-08-08) and 6 (Carolina, payout 2026-08-22) both paid
out, but neither payout was ever marked. The public board shows both without their ✓.
Two separate defects combine to make this unfixable through the UI.

### Defect 1 — rounds roll over a day early (root cause)

`getCurrentRound` parses payout dates with a bare `new Date(r.payoutDate)`. A
date-only ISO string parses as **UTC** midnight, which in the organizer's `America/Los_Angeles`
timezone is 17:00 the *previous* day; the following `setHours(0, 0, 0, 0)` then snaps
it to that previous day. Every payout date is therefore compared one day early, and
the "current" round advances a day before it should.

Observed on 2026-08-22 — Round 6's own payout day — the board already highlights
Round 7 as current. Round 6 was never the current round on the day it mattered, and
Round 5 met the same fate on 2026-08-08. That is *why* the payouts went unmarked: the
"This Round" tab was never showing the round the organizer was trying to close out.

Every other date helper in `rounds.js` anchors to local noon (`formatDate`,
`getDayName`, `getTandaSpan`, `isTandaComplete`, `isPayoutWindow` all use
`iso + 'T12:00:00'`). `getCurrentRound` is the sole exception.

### Defect 2 — no way back to a past round

`RoundPanel.jsx` hardcodes `getCurrentRound(rounds)`, so the admin "This Round" tab
only ever renders the current round. Past rounds appear only in `HistoryLog.jsx`,
which renders a read-only `✓ Paid Out / Pending` badge with no control attached. Once
a round rolls past, it is permanently uneditable.

Fixing Defect 1 alone would prevent recurrence but would not repair rounds 5 and 6.
Fixing Defect 2 alone would leave the organizer manually correcting every round in
arrears, forever. Both are in scope. (Confirmed with Miguel 2026-08-22.)

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

### 0. `utils/rounds.js` — fix `getCurrentRound` date parsing

Change `new Date(r.payoutDate)` to `new Date(r.payoutDate + 'T12:00:00')`, matching
the convention every other helper in the file already uses. Verified: with the fix,
Round 6 remains current through 2026-08-22 and rolls to Round 7 on 2026-08-23.

This breaks exactly one existing test — `'returns round 2 after round 1 payout date'`
in `test/rounds.test.js`, which passes `new Date('2026-06-14')`. That input carries
the *same* UTC off-by-one, so the test and the bug were agreeing with each other.
Anchoring the test's input dates to local noon (`'2026-06-14T12:00:00'`) makes all
four cases pass. Add a regression case asserting Round 6 is current on 2026-08-22.

**Visible side effect:** the public board's gold current-round highlight will move
from Round 7 back to Round 6 once deployed. That is the correct behavior, but it is a
change everyone will see.

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

- **Unit:** `clampRound` cases, corrected `getCurrentRound` inputs, and a regression
  case pinning Round 6 as current on 2026-08-22 — all in `test/rounds.test.js`.
- **Existing coverage:** the three mutators are already covered by
  `test/useTandaStore.test.js` and are unchanged.
- **Manual, in the dev server:** confirm the panel opens on Round 6 (not 7); step back
  to Round 5; mark both payouts sent; confirm the Reminders card is absent off-current;
  confirm the amber bar appears; confirm the publish banner lights up; confirm History
  shows both as ✓ Paid Out.

The real acceptance test is the public board: rounds 5 and 6 each showing a ✓ in
`RoundSchedule`, and the gold highlight sitting on Round 6.

Manual verification is blocked until `index.html` and `vite.config.js` are restored;
they are deleted in the working tree and `npm run dev` cannot boot without them.

## Deploy

GitHub Pages repo — branches get no preview URL. Preview locally via `npm run dev`.
Deploy is a manual `npm run deploy` from `main` after merge, then verify the served
asset hash against the local build.
