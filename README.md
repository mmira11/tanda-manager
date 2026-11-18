# Tanda Manager

A mobile-first PWA for running a rotating savings group (a *tanda*) — built to replace a group chat full of "did you send your $200 yet?" messages with a single source of truth everyone can check.

**[Live demo →](https://mmira11.github.io/tanda-manager/)**

## The problem

I'm part of a 12-person tanda: each round, every member contributes a fixed amount, one person collects the full pot, and the cycle rotates until everyone has been paid out once. Tracking who's paid, who's next, and when the schedule completed used to live across text threads and a spreadsheet nobody opened. I built this to fix that for the group I'm in — but it generalizes to any rotating-savings or pooled-contribution setup.

## What it does

**Private member page** (`/m/:token`, no login): each member gets their own link. It shows whether they've paid this round, when they get paid out and how much, days left until the 6 PM collection cutoff, group progress by first name, every round in the schedule, and a Copy Zelle button. English and Spanish.

**Admin dashboard** (`/admin`, email magic link): the organizer can:
- Create a cycle from a name, start date, days between rounds, contribution, and members in payout order. The rounds and one payment row per member per round are generated from that.
- Mark each member paid for any round. It saves right away.
- Send a Nudge: one tap opens the phone's SMS app with an English/Spanish reminder already filled in.
- Mark the round's payout as sent
- Edit the roster and copy each member's private link
- Review past rounds and pending Zelle matches
- Archive a finished cycle (it becomes read-only), start a new one, or import an old JSON backup

The landing page at `/` points members to their private link and has an organizer sign-in button.

## Why it's built this way

A few decisions mattered more than they might look:

**No PII ever touches the source code.** Names, phone numbers, and tokens live only in the database, and nothing in the repo or the built site contains them. `.env.local`, backups, and exports are gitignored. The browser only ever gets the public anon key.

**Row-level security, not the UI, guards the data.** Every table has RLS enabled, and only users listed in `admins` (checked by `is_admin()`) can read or write. The admin route also checks `is_admin()` before loading anything, but the database would refuse a non-admin either way.

**Members never read tables directly.** The member page calls one `security definer` function, `get_member_board(token)`. It returns that member's own status plus first names and paid/unpaid for the group, the round list, and the organizer's Zelle destination. It never returns phone numbers, other members' tokens, or payer aliases. Anonymous users can run only that function.

**Archived cycles are locked in the database.** Restrictive policies block inserts, updates, and deletes on an archived cycle's members, rounds, and payments, so history can't be edited by accident.

**The SQL is tested against real Postgres.** `npm run test:sql` applies `schema.sql` plus every migration twice on a throwaway database. It then checks the archive lock, the function grants, and that the member board leaks no phone or token. CI runs it on every push and pull request.

**Unit tests cover the logic that's risky to get wrong.** `rounds.js` handles date math such as "which round is it", deadlines in the cycle's time zone, and DST. `messaging.js` builds the SMS and WhatsApp links. `useCycleStore` handles reads and writes and runs against an in-memory fake Supabase client. There are also tests for the backup import and the main screens.

## Tech stack

React 18 · Vite 5 · React Router v6 · Tailwind CSS · Supabase (Postgres, Auth, RLS) · Vitest + React Testing Library · vite-plugin-pwa · gh-pages

## What's next

Reminders still go out by hand through `sms:` links. The schema already has `payer_aliases`, `reminder_settings`, `reminder_templates`, and `pending_review` for the next step:
- Scheduled reminders sent server-side
- Matching incoming Zelle emails to members automatically, with anything unclear landing in the Needs-review card

## Supabase setup

1. **Create a Supabase project.** In the SQL editor, run `supabase/schema.sql`, then each file in `supabase/migrations/` in order (`002` → `011`). Each migration is safe to run more than once.
2. **Turn on email sign-in.** Under Authentication → Providers, enable Email. The app sends magic links only and won't create new users (`shouldCreateUser: false`), so create your own user under Authentication → Users.
3. **Allow the redirect URLs.** Under Authentication → URL Configuration, add every address you'll sign in from, including the `/tanda-manager/` base path:
   - `http://localhost:5173/tanda-manager/admin`
   - `https://<your-github-username>.github.io/tanda-manager/admin`
4. **Make yourself an admin.** Copy your user's UUID from Authentication → Users, then run:
   ```sql
   insert into public.admins (user_id, email) values ('<your-user-uuid>', '<your-email>');
   ```
5. **Add your keys locally.** Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings → API. `.env.local` is gitignored.

Never put the service-role key in a `VITE_` variable or in frontend code. The only thing that uses it is the optional `scripts/import-backup.mjs`, which reads it from `.env.local`. Importing a backup from Admin → Settings doesn't need it.

## Running it locally

```bash
npm install
npm run dev        # localhost:5173/tanda-manager/
npm test           # Vitest suite (uses a mocked Supabase client)
npm run test:sql   # schema + migrations against a local Postgres (needs psql)
npm run deploy     # build + publish dist/ to gh-pages
```

`npm run deploy` builds with the keys in `.env.local`. The build copies `index.html` to `404.html` so GitHub Pages serves the app on deep links like `/admin` and `/m/:token`. Each deploy replaces everything on the `gh-pages` branch.
