# Tanda Manager

A mobile-first PWA for running a rotating savings group (a *tanda*) — built to replace a group chat full of "did you send your $200 yet?" messages with a single source of truth everyone can check.

**[Live demo →](https://mmira11.github.io/tanda-manager/)**

## The problem

I'm part of a 12-person tanda: each round, every member contributes a fixed amount, one person collects the full pot, and the cycle rotates until everyone has been paid out once. Tracking who's paid, who's next, and when the schedule completed used to live across text threads and a spreadsheet nobody opened. I built this to fix that for the group I'm in — but it generalizes to any rotating-savings or pooled-contribution setup.

## What it does

**Private member page** (`/m/:token`, no login): each member gets their own link. It shows whether they've paid this round, when they get paid out and how much, days left until the 6 PM collection cutoff, group progress by first name, every round in the schedule, and a Copy Zelle button. English and Spanish.

The phone remembers a member's link once it loads, so an icon added to the home screen (which opens `/`) goes straight back to their page. A link that stops working is forgotten. **Not you? → Forget this phone** on the Profile tab clears it on a shared phone or tablet.

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

**Archived cycles are locked in the database.** Restrictive policies block inserts, updates, and deletes on an archived cycle's members, rounds, payments, pending review rows, and payer aliases, so history can't be edited by accident. The cycle row itself can still be viewed and unarchived. `confirm_zelle_match` refuses an archived cycle before it changes a payment.

**The SQL is tested against real Postgres.** `npm run test:sql` applies `schema.sql` plus every migration twice on a throwaway database. It then checks the archive lock, the function grants, and that the member board leaks no phone or token. CI runs it on every push and pull request.

**Unit tests cover the logic that's risky to get wrong.** `rounds.js` handles date math such as "which round is it", deadlines in the cycle's time zone, and DST. `messaging.js` builds the SMS and WhatsApp links. `useCycleStore` handles reads and writes and runs against an in-memory fake Supabase client. There are also tests for the backup import and the main screens.

## Tech stack

React 18 · Vite 5 · React Router v6 · Tailwind CSS · Supabase (Postgres, Auth, RLS) · Vitest + React Testing Library · vite-plugin-pwa · gh-pages

## What's next

Nudges on the dashboard still open the phone's SMS app. The reminder queue below lists who to text at each window, and you send those from your phone with one tap. Zelle detection runs as a Supabase Edge Function. A detected Zelle payment stays in Needs review until you press Match.

## Supabase setup

1. **Create a Supabase project.** In the SQL editor, run `supabase/schema.sql`, then each file in `supabase/migrations/` in order (`002` → `017`). Each migration is safe to run more than once.
   - `013` — reminder log and SMS opt-outs
   - `014` — Zelle `pending_review` rows and `confirm_zelle_match`
   - `015` — the round the admin picked, an optional dismiss reason, and `round_timing` (`early`, `on_time`, `after_deadline`, `late`)
   - `016` — an archived cycle refuses Match, dismiss, and payer-alias edits. The cycle can still be viewed and unarchived.
   - `017` — reminder queue (`channel`, `queued` / `skipped`, admin RPCs). Queue mode needs this.

Apply `014`, then `015`, then `016`, then `017`. `015` replaces the two-argument `confirm_zelle_match` from `014`. `016` replaces it again. If `014` and `015` are already applied, run `016` next, then `017`.
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

## Edge functions

These are separate from the static site. Deploy them with the Supabase CLI after the migrations they need. Set secrets with `supabase secrets set`. They stay out of the repo and out of any `VITE_` variable. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided inside Edge Functions.

### send-reminders

Queue mode is the default. No Twilio account is required. At each window the function writes one `reminder_log` row per person (`status = queued`, `channel = queue`) and sends nothing. The dashboard shows **Send reminders now** / **Enviar recordatorios** while that window's list still has someone unpaid. Each row shows the bilingual message plus SMS and WhatsApp buttons. Tapping one opens your phone and marks that row sent. **Mark all done** clears the remaining unpaid rows. **Skip** drops one person. Someone who pays first stays on the card greyed out and is left out of the count.

Windows, in `America/Los_Angeles`: Thursday 9:00 everyone with a phone, Friday 12:00 and Friday 6:00 unpaid only. The same rules live in `supabase/functions/_shared/reminders.js`. The hourly job only writes during that exact hour. **Build reminder list now** on the dashboard uses the open window, so the list still appears if cron did not run. A person is never queued twice for the same round and window.

The old Twilio sender is still in the function. It stays off unless that cycle's `reminder_settings.channel` is `twilio` and `REMINDERS_DRY_RUN` is `false`.

Setup:

1. Run migration `017_reminder_queue.sql` (after `013`).
2. Deploy the function: `supabase functions deploy send-reminders --no-verify-jwt`
3. Set `CRON_SECRET` to a long random string. The cron job sends it as `x-cron-secret`.
4. Run `supabase/cron/schedule_send_reminders.sql` once. It turns on `pg_cron` and `pg_net` and reads two Vault secrets (`tanda_reminders_url`, `tanda_cron_secret`). It is safe to run more than once. It is not a migration: CI's Postgres has no `pg_cron`.

```bash
supabase functions deploy send-reminders --no-verify-jwt
supabase secrets set CRON_SECRET=...
```

To let the hour job fill the list, turn reminders on for the cycle. Until then, use **Build reminder list now**.

```sql
insert into public.reminder_settings (cycle_id, enabled, channel)
values ('<cycle-uuid>', true, 'queue')
on conflict (cycle_id) do update set enabled = true, channel = 'queue';
```

`REMINDERS_DRY_RUN=true` previews the queue and does not write rows to send. Leave that secret unset for normal queue use. Do not set Twilio keys unless you set `channel` to `twilio`.

### twilio-inbound

Twilio's "A message comes in" webhook. STOP opts that sender out of reminders. START opts them back in. Every request needs a valid Twilio signature.

```bash
supabase functions deploy twilio-inbound --no-verify-jwt
supabase secrets set \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_INBOUND_PUBLIC_URL=https://<project-ref>.supabase.co/functions/v1/twilio-inbound
```

`TWILIO_INBOUND_PUBLIC_URL` has to be the webhook URL configured in Twilio. The signature is checked against that exact string.

### scan-zelle-email

Needs migrations `014`, `015`, and `016`. Reads Zelle "you received" mail with the Gmail read-only scope and queues Needs review. It never marks anyone paid.

```bash
supabase functions deploy scan-zelle-email --no-verify-jwt
supabase secrets set \
  CRON_SECRET=... \
  GMAIL_CLIENT_ID=... \
  GMAIL_CLIENT_SECRET=... \
  GMAIL_REFRESH_TOKEN=... \
  ZELLE_SENDER_DOMAINS=bank.example
```

`CRON_SECRET` is the same value send-reminders uses. `ZELLE_GMAIL_QUERY` is optional (default `subject:zelle`). `ZELLE_SENDER_DOMAINS` is required: comma-separated bank domains. Mail from any other domain, or that fails Gmail's DKIM/DMARC check for that domain, is skipped.

The Google OAuth client has to be set to **In production**. A client left in Testing expires its refresh token after 7 days, and the scan stops until you authorize the inbox again. The scope is only `https://www.googleapis.com/auth/gmail.readonly`.

With no `after` date, the search starts 7 days before the cycle's first collection date and runs through today. That bound is what keeps the fetch under its 1,000-message cap. Mail dated before the window is counted as `out_of_window` and is not assigned to a round. With no `cycleId`, the only active cycle is scanned. If two cycles are active, the one with the earliest `start_date` is used and the response reports that choice (`cycleChoice: earliest_start_date`).

Schedule it by running `supabase/cron/schedule_scan_zelle_email.sql` in the SQL editor. The job runs every 30 minutes across Thursday–Saturday America/Los_Angeles; the file comments list the UTC times, because `pg_cron` is UTC. It posts `{"dryRun":false}`. The function still treats a missing `dryRun` as a dry run. The script is safe to run more than once. It expects a Vault secret `tanda_zelle_url` plus the same `tanda_cron_secret` as reminders.

## Running it locally

```bash
npm install
npm run dev        # localhost:5173/tanda-manager/
npm test           # Vitest suite (uses a mocked Supabase client)
npm run test:sql   # schema + migrations against a local Postgres (needs psql)
npm run deploy     # build + publish dist/ to gh-pages
```

`npm run deploy` builds with the keys in `.env.local`. The build copies `index.html` to `404.html` so GitHub Pages serves the app on deep links like `/admin` and `/m/:token`. Each deploy replaces everything on the `gh-pages` branch.
