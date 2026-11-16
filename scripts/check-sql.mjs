// Apply schema.sql and supabase/migrations against a real Postgres, twice.
// Stand-in anon and authenticated roles stand in for Supabase. No secrets.
//
//   npm run test:sql
//   DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:sql
//
// Without DATABASE_URL the script uses local peer auth: sudo -u postgres psql.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const scratch = mkdtempSync(join(tmpdir(), 'tanda-sql-'))
const adminUrl = process.env.DATABASE_URL || ''
const OLD_SCHEMA_REV = 'f7fbdc2'

const bootstrap = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`

function psqlArgs(database, tuplesOnly) {
  const args = ['-v', 'ON_ERROR_STOP=1']
  if (tuplesOnly) args.push('-tA')
  if (adminUrl) {
    // Pass host and port as flags. A bare -d name after a URI makes psql
    // ignore the URI and dial the local Unix socket.
    const url = new URL(adminUrl)
    args.push(
      '--host', url.hostname,
      '--port', url.port || '5432',
      '--username', decodeURIComponent(url.username || 'postgres'),
      '--dbname', database,
    )
    const env = { ...process.env }
    if (url.password) env.PGPASSWORD = decodeURIComponent(url.password)
    return { cmd: 'psql', args, env }
  }
  args.push('--dbname', database)
  return { cmd: 'sudo', args: ['-u', 'postgres', 'psql', ...args], env: process.env }
}

function psql(database, file) {
  const { cmd, args, env } = psqlArgs(database, false)
  execFileSync(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'], input: readFileSync(file), env })
}

function psqlText(database, sql) {
  const { cmd, args, env } = psqlArgs(database, true)
  return execFileSync(cmd, args, { encoding: 'utf8', input: sql, env })
}

function recreate(name) {
  psqlText('postgres', `
    drop database if exists ${name} with (force);
    create database ${name};
  `)
  const file = join(scratch, `${name}-bootstrap.sql`)
  writeFileSync(file, bootstrap)
  psql(name, file)
}

function migrationFiles() {
  return readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()
}

function applyFile(database, file) {
  console.log(`  ${database}: ${file}`)
  psql(database, file)
}

function applyMigrations(database, { skip = [], passes = 2 } = {}) {
  const files = migrationFiles().filter(name => !skip.includes(name))
  for (let pass = 1; pass <= passes; pass += 1) {
    console.log(`pass ${pass}`)
    for (const name of files) applyFile(database, join(migrationsDir, name))
  }
}

function assertArchiveLock(database) {
  const count = Number(psqlText(database, `
    select count(*) from pg_policies
    where schemaname = 'public' and policyname like '%when_archived';
  `).trim())
  if (count !== 6) {
    throw new Error(`${database}: expected 6 archived-cycle policies, found ${count}`)
  }
  const deadline = psqlText(database, `
    select pg_get_functiondef('public.get_member_board(text)'::regprocedure);
  `)
  if (!deadline.includes('collect_deadline') || !deadline.includes('v_cycle.timezone')) {
    throw new Error(`${database}: get_member_board is missing the cycle-timezone deadline`)
  }
  if (!deadline.includes('zelle_destination')) {
    throw new Error(`${database}: get_member_board is missing the organizer Zelle destination`)
  }
  if (!/security definer/i.test(deadline) || !deadline.includes('search_path')) {
    throw new Error(`${database}: get_member_board must stay SECURITY DEFINER with search_path`)
  }
  if (!deadline.includes("'rounds'") || !deadline.includes('recipient_first_name')) {
    throw new Error(`${database}: get_member_board is missing the rounds list`)
  }
  const grants = psqlText(database, `
    select has_function_privilege('anon', 'public.get_member_board(text)', 'execute')::text
      || has_function_privilege('authenticated', 'public.get_member_board(text)', 'execute')::text;
  `).trim()
  if (grants !== 'truetrue') {
    throw new Error(`${database}: get_member_board grants changed (${grants})`)
  }
  const boardText = psqlText(database, `
    insert into public.cycles (id, name, start_date, contribution, status, zelle_destination)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Familia Demo', '2099-06-01', 100, 'active', 'familia.demo');
    insert into public.members (id, cycle_id, slot, display_first_name, phone, access_token) values
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'Maria', '5550100199', 'member-token-maria1'),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'Rosa', '5550100102', 'member-token-rosa01');
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, '2099-06-01', '2099-06-02', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, '2099-07-03', '2099-07-04', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
    select get_member_board('member-token-maria1');
  `).trim().split('\n').filter(Boolean).pop()
  const board = JSON.parse(boardText)
  const rounds = board.rounds
  if (!Array.isArray(rounds) || rounds.length !== 2) {
    throw new Error(`${database}: expected 2 rounds, got ${JSON.stringify(rounds)}`)
  }
  const keys = Object.keys(rounds[0]).sort().join(',')
  if (keys !== 'collect_date,number,payout_date,recipient_first_name') {
    throw new Error(`${database}: round keys are ${keys}`)
  }
  if (rounds[1].number !== 2 || rounds[1].payout_date !== '2099-07-04' || rounds[1].recipient_first_name !== 'Rosa') {
    throw new Error(`${database}: round payload was rewritten: ${JSON.stringify(rounds[1])}`)
  }
  const dumped = JSON.stringify(board)
  if (dumped.includes('5550100199') || dumped.includes('member-token')) {
    throw new Error(`${database}: get_member_board exposed a phone or token`)
  }
  console.log(`${database}: 6 archive policies, member board keeps Zelle, rounds, and the same grants`)
}

// Runs SQL that must fail. Returns psql's error text; throws if it succeeded.
function psqlFails(database, sql) {
  const { cmd, args, env } = psqlArgs(database, true)
  try {
    execFileSync(cmd, args, { encoding: 'utf8', input: sql, env, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    return String(error.stderr || error.message)
  }
  throw new Error(`${database}: expected this SQL to fail:\n${sql}`)
}

// Fake data only. Two members, two rounds, four payments (three paid).
function importPlan({ name, dates, tokenPrefix, badPaymentSlot = null }) {
  const [collect1, payout1, collect2, payout2] = dates
  return {
    cycle: {
      name, start_date: collect1, interval_days: 14, contribution: 50, timezone: 'America/Los_Angeles',
      organizer_display_name: 'Org Demo', zelle_destination: '5550100100', archived_at: '2098-12-01T00:00:00Z',
    },
    members: [
      { slot: 1, display_first_name: 'Ana', phone: '5550100111', language_pref: 'en', access_token: `${tokenPrefix}-ana-0001` },
      { slot: 2, display_first_name: 'Beto', phone: '5550100112', language_pref: 'es', access_token: `${tokenPrefix}-beto-001` },
    ],
    rounds: [
      { round_number: 1, collect_date: collect1, payout_date: payout1, recipientSlot: 1, payout_sent: true, payout_sent_at: `${payout1}T12:00:00Z`, notes: '' },
      { round_number: 2, collect_date: collect2, payout_date: payout2, recipientSlot: 2, payout_sent: false, payout_sent_at: null, notes: '' },
    ],
    payments: [
      { roundNumber: 1, slot: 1, amount: 50, paid_at: `${collect1}T18:00:00Z`, source: 'manual' },
      { roundNumber: 1, slot: 2, amount: 50, paid_at: `${collect1}T18:00:00Z`, source: 'manual' },
      { roundNumber: 2, slot: 1, amount: 50, paid_at: `${collect2}T18:00:00Z`, source: 'manual' },
      // With badPaymentSlot set, this row points at a member that does not exist. The cycle,
      // members, and rounds are already written when the payments insert fails.
      { roundNumber: 2, slot: badPaymentSlot ?? 2, amount: 50, paid_at: null, source: null },
    ],
    reminder_templates: [
      { kind: 'friday_noon', lang: 'en', body: 'Hi {{firstName}}, collection is today.' },
      { kind: 'friday_noon', lang: 'es', body: 'Hola {{firstName}}, el cobro es hoy.' },
    ],
  }
}

const callImport = plan => `select public.import_cycle($plan$${JSON.stringify(plan)}$plan$::jsonb);`

function assertAtomicImport(database) {
  const grants = psqlText(database, `
    select has_function_privilege('anon', 'public.import_cycle(jsonb)', 'execute')::text
      || has_function_privilege('authenticated', 'public.import_cycle(jsonb)', 'execute')::text;
  `).trim()
  if (grants !== 'falsetrue') {
    throw new Error(`${database}: import_cycle should run for authenticated only, got ${grants}`)
  }

  const good = importPlan({
    name: 'Atomic Demo', dates: ['2098-01-02', '2098-01-03', '2098-01-16', '2098-01-17'], tokenPrefix: 'import-token',
  })
  const summary = JSON.parse(psqlText(database, callImport(good)).trim().split('\n').filter(Boolean).pop())
  if (summary.members !== 2 || summary.rounds !== 2 || summary.payments !== 4 || summary.paid !== 3) {
    throw new Error(`${database}: import summary was ${JSON.stringify(summary)}`)
  }
  const status = psqlText(database, `select status from public.cycles where start_date = '2098-01-02';`).trim()
  if (status !== 'archived') throw new Error(`${database}: imported cycle status is ${status}`)

  const duplicate = psqlFails(database, callImport(good))
  if (!duplicate.includes('start date already exists')) {
    throw new Error(`${database}: second import with the same start date did not fail cleanly: ${duplicate}`)
  }

  const halfway = importPlan({
    name: 'Halfway Demo', dates: ['2098-05-01', '2098-05-02', '2098-05-15', '2098-05-16'],
    tokenPrefix: 'halfway-token', badPaymentSlot: 9,
  })
  const failure = psqlFails(database, callImport(halfway))
  if (!/null value in column "member_id"/.test(failure)) {
    throw new Error(`${database}: halfway import failed for the wrong reason: ${failure}`)
  }
  const left = psqlText(database, `
    select (select count(*) from public.cycles where start_date = '2098-05-01' or name = 'Halfway Demo')
      || ',' || (select count(*) from public.members where access_token like 'halfway-token-%')
      || ',' || (select count(*) from public.rounds where collect_date in ('2098-05-01', '2098-05-15'))
      || ',' || (select count(*) from public.cycles where status = 'draft');
  `).trim()
  if (left !== '0,0,0,0') {
    throw new Error(`${database}: halfway import left rows behind (cycles,members,rounds,drafts = ${left})`)
  }
  console.log(`${database}: import_cycle is atomic: happy path archived, halfway failure left nothing`)
}

// N7: revoked links and links for cycles archived 30+ days ago return "not found".
// Fake cycles in 2097, fake tokens. Runs after assertArchiveLock, which created the
// active Familia Demo cycle with member-token-maria1 and member-token-rosa01.
function assertLinkRevokeExpiry(database) {
  const board = token => psqlText(database, `select get_member_board('${token}') is not null;`).trim()
  const notFound = token => {
    const error = psqlFails(database, `select get_member_board('${token}');`)
    if (!/not found/.test(error)) throw new Error(`${database}: ${token} failed for the wrong reason: ${error}`)
  }

  if (board('member-token-maria1') !== 't') throw new Error(`${database}: active link stopped working`)
  psqlText(database, `update public.members set token_revoked_at = now() where access_token = 'member-token-rosa01';`)
  notFound('member-token-rosa01')
  if (board('member-token-maria1') !== 't') throw new Error(`${database}: revoking Rosa broke Maria's link`)
  psqlText(database, `update public.members set token_revoked_at = null, access_token = 'member-token-rosa02' where access_token = 'member-token-rosa01';`)
  if (board('member-token-rosa02') !== 't') throw new Error(`${database}: regenerated link does not work`)

  psqlText(database, `
    insert into public.cycles (id, name, start_date, contribution, status, archived_at) values
      ('dddddddd-0000-0000-0000-000000000001', 'Recent Archive', '2097-01-01', 10, 'archived', now() - interval '29 days'),
      ('dddddddd-0000-0000-0000-000000000002', 'Old Archive',    '2097-02-01', 10, 'archived', now() - interval '31 days'),
      ('dddddddd-0000-0000-0000-000000000003', 'Undated Archive','2097-03-01', 10, 'archived', null);
    insert into public.members (cycle_id, slot, display_first_name, access_token) values
      ('dddddddd-0000-0000-0000-000000000001', 1, 'Lia', 'expiry-token-recent1'),
      ('dddddddd-0000-0000-0000-000000000002', 1, 'Noe', 'expiry-token-old0001'),
      ('dddddddd-0000-0000-0000-000000000003', 1, 'Ivo', 'expiry-token-undated');
  `)
  if (board('expiry-token-recent1') !== 't') throw new Error(`${database}: link expired before 30 days`)
  notFound('expiry-token-old0001')
  notFound('expiry-token-undated')
  console.log(`${database}: member links revoke, regenerate, and expire 30 days after archive`)
}

const fresh = 'tanda_sql_fresh'
const legacy = 'tanda_sql_legacy'

console.log('a) fresh schema.sql, then every migration twice')
recreate(fresh)
applyFile(fresh, join(root, 'supabase', 'schema.sql'))
applyMigrations(fresh)
assertArchiveLock(fresh)
assertAtomicImport(fresh)
assertLinkRevokeExpiry(fresh)

console.log('b) original schema (before review migrations), 003 only, 002 skipped, applied twice')
recreate(legacy)
const oldSchema = join(scratch, 'schema-before-migrations.sql')
writeFileSync(oldSchema, execFileSync('git', ['show', `${OLD_SCHEMA_REV}:supabase/schema.sql`], { cwd: root, encoding: 'utf8' }))
applyFile(legacy, oldSchema)
applyMigrations(legacy, { skip: ['002_review_fixes.sql'] })
assertArchiveLock(legacy)
assertAtomicImport(legacy)
assertLinkRevokeExpiry(legacy)

rmSync(scratch, { recursive: true, force: true })
console.log('SQL ok: fresh schema + migrations x2, and legacy schema + 003 onward (002 skipped) x2')
