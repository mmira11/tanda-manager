# Quick Wins + My View + Visual Polish — Design

**Date:** 2026-07-01
**Status:** Approved by Miguel (pending spec review)

## Goal

Ship the in-flight WIP, fix freshness/correctness gaps, reduce organizer friction, close the backup hole, add a personalized member view, and give the public board a visual "wow" pass the family will be proud of.

## Scope

Seven work items, in order. Each is independently shippable; deploy happens once at the end (`npm run deploy`).

### 1. Ship existing WIP

Commit the uncommitted working-tree changes as-is (they are complete and coherent):

- Timed 12 PM / 8 PM per-member reminder buttons in `RoundPanel.jsx` (SMS + WhatsApp, via `buildTimedReminderSmsUrl` / `buildTimedReminderWhatsAppUrl` in `messaging.js`).
- `OrganizerCard` change: replace `zelle://` deep link with instruction text + "Copy Number" button.
- Label change: "Next collection in" → "Collection closes in" (EN/ES).
- `collectDate` threading into `PaymentRow` messaging URLs.

Run full test suite first; commit with a descriptive message.

### 2. Public board freshness

**Problem:** `PublicBoard` fetches `tanda-data.json` once on mount. Members with the PWA open see stale data, with no freshness indicator.

**Change (in `PublicBoard.jsx`):**

- Refetch on `visibilitychange` (when the tab/PWA becomes visible).
- Refetch on a 60-second interval while the page is visible; pause the interval when hidden.
- Track `lastFetched` timestamp; render a small "Updated X min ago" caption (EN: `Updated just now / X min ago`; ES: `Actualizado justo ahora / hace X min`) under the header.
- Failed refetches keep the previous data silently (current behavior).

New util `formatRelativeTime(then, now, lang)` in `utils/rounds.js` (or a new `utils/time.js`), with tests.

### 3. Derive hardcoded values from data

**Problem:** `PublicBoard.jsx` hardcodes the title "Tanda 2026", the range "Jun 12 – Nov 14, 2026", and the completion date `2026-11-15`. The "check back soon" setup screen ignores the ES translation.

**Change:**

- New helper `getTandaSpan(rounds)` in `utils/rounds.js` returning `{ start, end, year }` from first `collectDate` and last `payoutDate`. Tested.
- Title becomes `Tanda {year}`; date range formatted per locale from `getTandaSpan`.
- Completion check: `new Date() > end of last payoutDate` (replaces the hardcoded `2026-11-15`).
- Setup screen ("check back soon") uses the current `lang` labels for both EN and ES.
- Fallbacks: if `rounds` is empty, keep current static strings so nothing crashes pre-setup.

### 4. Publish nudge in admin

**Problem:** Payments are marked in the Rounds tab; the publish button lives in the Data tab. Easy to forget → members see stale data.

**Change:**

- Extract publish logic (token load, `publishToGitHub`, `tanda_last_published` bookkeeping, status state) from `DataControls.jsx` into a shared hook `usePublish()` (new file `src/hooks/usePublish.js`).
- `AdminDashboard.jsx` renders a slim amber banner above the tab content whenever `store.lastModified > lastPublished`: "Unpublished changes" + one-tap **Publish** button + inline success/error state. Visible from every tab.
- If no GitHub token is saved, the banner's button reads "Set up publishing" and switches to the Data tab instead.
- `DataControls` keeps its existing UI, now backed by the same hook (no duplicated logic).
- Hook gets tests (mocking `publishToGitHub`).

### 5. Backup reminder

**Problem:** Published JSON strips member phone numbers (intentionally). If the organizer's phone dies, restore-from-public loses all phones. Full backups (JSON export) have no nudge.

**Change:**

- On JSON export in `DataControls`, save `tanda_last_backup` timestamp to localStorage.
- In the admin banner area: if last backup is `never` or older than 14 days, show a secondary muted line: "Last full backup: {never / X days ago} — published data doesn't include phone numbers." with a "Back up" action that switches to the Data tab.
- No automatic downloads; nudge only.

### 6. My view (member personalization)

**Convenience view, no auth — same public data.**

- A "Find my name 👋" chip under the header on the public board. Tapping opens the member list (names from published data); picking one saves `tanda_my_slot` to localStorage.
- Once set:
  - A personal card ("ticket" style, see §7) appears near the top: this round's paid/pending status for that member, their payout round number, payout date, and pot amount ("Your turn: Round 7 · Sep 4 · $2,400"). If their payout already happened, show "You received your payout in Round N 🎉".
  - Their row in `PaymentStatusList` is highlighted.
  - A small "Not you?" link on the card clears `tanda_my_slot`.
- Fully translated (EN/ES).
- Edge cases: if the saved slot no longer exists in the data (roster change), silently clear it.

### 7. Visual "wow" pass

Direction: **warm celebration** — lean into the gold identity. Public board is the showpiece; admin gets a light consistency pass. All CSS/Tailwind + small keyframes in `index.css`; **no animation libraries**. Respect `prefers-reduced-motion` (disable nonessential animation).

- **Recipient spotlight:** richer layered gold gradient, subtle shimmer sweep animation, recipient initial in a decorated medallion, one-time confetti burst (pure CSS particles) when the page loads during a payout window (between collection close and payout day end).
- **Countdown:** flip/roll animation on digit change, soft pulse styling when < 24h to collection close.
- **Contributions:** replace the single progress bar with a segmented 12-dot track — one dot per member, filled green when paid, with a fill-in animation.
- **Motion:** staggered fade/slide-in for cards on load; check-in animation when rows render paid; smooth language-toggle transition.
- **Typography & depth:** larger recipient name, layered shadows, gradient accents, subtle gold texture in the header.
- **My view card:** ticket-style treatment (perforation edge, gold trim) — the VIP artifact of the board.
- **Admin touch-up:** new banner styled to match, consistent button styles. No layout changes.

Performance guardrails: animations are transform/opacity only; confetti is capped (~30 particles, one-shot); Lighthouse-visible regressions are a blocker.

## Architecture notes

- No new runtime dependencies.
- New files: `src/hooks/usePublish.js`, optional `src/utils/time.js`, `src/components/public/MyViewCard.jsx`, `src/components/public/NamePicker.jsx`.
- `LABELS` in `PublicBoard.jsx` grows new keys; if it becomes unwieldy (>~120 lines), extract to `src/data/labels.js`.
- Data shape unchanged — no migration needed. `tanda_my_slot`, `tanda_last_backup` are new localStorage keys on top of existing ones.

## Error handling

- Refetch failures: keep last good data, never blank the board.
- Publish failures: inline error in banner (existing pattern from DataControls).
- Missing/empty rounds: `getTandaSpan` returns null → components fall back to current static strings.
- Stale `tanda_my_slot`: cleared silently.

## Testing

- New unit tests: `getTandaSpan`, `formatRelativeTime`, `usePublish` (mocked fetch), My-view slot resolution (valid/stale slot).
- Existing suite must stay green (`npx vitest run`).
- Manual verification on the deployed site (mobile viewport) for visuals and My view flow.

## Out of scope

- Real backend / live sync (rejected as overkill).
- Auth for My view.
- Admin visual redesign beyond the consistency touch-up.
- Push notifications.
