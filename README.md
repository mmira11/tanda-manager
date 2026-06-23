# Tanda Manager

A mobile-first PWA for running a rotating savings group (a *tanda*) — built to replace a group chat full of "did you send your $200 yet?" messages with a single source of truth everyone can check.

**[Live demo →](https://mmira11.github.io/tanda-manager/)**

## The problem

I'm part of a 12-person tanda: each round, every member contributes a fixed amount, one person collects the full pot, and the cycle rotates until everyone has been paid out once. Tracking who's paid, who's next, and when the schedule completed used to live across text threads and a spreadsheet nobody opened. I built this to fix that for the group I'm in — but it generalizes to any rotating-savings or pooled-contribution setup.

## What it does

**Public board** (no login) — anyone in the group can check the current round's recipient, the countdown to the next collection date, and a names-only payment status grid. No phone numbers or admin controls are exposed here.

**Admin dashboard** (PIN-gated) — the organizer can:
- Toggle each participant's payment status for the current round
- One-tap SMS or WhatsApp a payment reminder with a pre-filled message
- Mark the round's payout as sent
- Edit the roster (names, phone numbers) inline
- Review a full history log of completed rounds
- Export/import the entire dataset as JSON for backup

## Why it's built this way

A few decisions mattered more than they might look:

**No PII ever touches the source code.** The schedule template ships with empty roster slots — names and phone numbers are entered at runtime through a first-launch setup wizard and live only in the browser's `localStorage`. This is what makes it safe to keep this as a public repo: there's nothing sensitive to accidentally commit.

**Everything is local-first, by design, not by accident.** There's no backend. Data lives in `localStorage`, full stop. For a 12-person group with no real concurrency, syncing infrastructure would be solving a problem that doesn't exist — the tradeoff is that data is per-device, which is why export/import exists as the backup story instead of a database.

**The public board and admin dashboard are different trust boundaries, not just different routes.** The public view never receives phone numbers at all — it's not hidden with CSS, the data simply isn't in the props it renders. The PIN gate protects the admin route at the React Router level, with a first-run setup wizard that forces PIN creation before any data entry happens.

**Tests cover the logic that's actually risky to get wrong**, not the UI. `useTandaStore` (state transitions, persistence), `rounds.js` (date math for "which round are we in right now," since this runs for months unattended), and `messaging.js` (the SMS/WhatsApp link builders, since a malformed link means a reminder silently fails to send). UI components are intentionally untested — they're low-risk and high-churn.

## Tech stack

React 18 · Vite 5 · React Router v6 · Tailwind CSS · Vitest + React Testing Library · vite-plugin-pwa · gh-pages

## What I'd change at scale

If this needed to support multiple concurrent tandas or untrusted multi-device use, the local-first model breaks down fast — `localStorage` has no real conflict resolution, and "last device to write wins" stops being acceptable. I'd move state to a small backend (even just a serverless function + a managed database) and keep the PWA as a thin client. The messaging layer would also need to move server-side — `sms:` and `wa.me` links work fine for a 12-person manual flow but don't scale to a service that should run unattended.

## Running it locally

```bash
npm install
npm run dev      # localhost:5173/tanda-manager/
npm test         # run the Vitest suite
npm run deploy   # build + publish to gh-pages
```
