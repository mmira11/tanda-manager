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
-- Supabase ships an empty supabase_realtime publication; mirror it so the N8 guard is meaningful.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
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
    insert into public.payments (round_id, member_id, amount)
      select r.id, m.id, 100 from public.rounds r join public.members m on m.cycle_id = r.cycle_id
      where r.cycle_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
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
  notFound('member-token-rosa01') // the pre-reissue link stays dead

  // Reissue without revoking first (what Regenerate link does): the new link works, the old one dies.
  psqlText(database, `
    insert into public.cycles (id, name, start_date, contribution, status) values
      ('dddddddd-0000-0000-0000-000000000004', 'Reissue Demo', '2097-04-01', 10, 'draft');
    insert into public.members (cycle_id, slot, display_first_name, access_token) values
      ('dddddddd-0000-0000-0000-000000000004', 1, 'Uma', 'reissue-token-old001');
  `)
  if (board('reissue-token-old001') !== 't') throw new Error(`${database}: link did not work before reissue`)
  psqlText(database, `update public.members set access_token = 'reissue-token-new001', token_revoked_at = null where access_token = 'reissue-token-old001';`)
  if (board('reissue-token-new001') !== 't') throw new Error(`${database}: reissued link does not work`)
  notFound('reissue-token-old001')

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

// N5: swap_payout_order is atomic, and removed members drop out of the member page.
// Uses the Familia Demo cycle: Maria (member-token-maria1, slot 1) and Rosa
// (member-token-rosa02 after assertLinkRevokeExpiry, slot 2). Fake data only.
function assertSoftDeleteReorder(database) {
  const ids = `
    (select id from public.members where access_token = 'member-token-maria1') as maria,
    (select id from public.members where access_token = 'member-token-rosa02') as rosa`
  const state = () => psqlText(database, `
    select string_agg(m.display_first_name || ':' || m.slot || ':' || r.round_number, ',' order by m.display_first_name)
    from public.members m join public.rounds r on r.recipient_member_id = m.id
    where m.cycle_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  `).trim()
  const swap = `select public.swap_payout_order(maria, rosa) from (select ${ids}) x;`

  const grants = psqlText(database, `
    select has_function_privilege('anon', 'public.swap_payout_order(uuid, uuid)', 'execute')::text
      || has_function_privilege('authenticated', 'public.swap_payout_order(uuid, uuid)', 'execute')::text;
  `).trim()
  if (grants !== 'falsetrue') throw new Error(`${database}: swap_payout_order grants are ${grants}`)

  const before = state()
  if (before !== 'Maria:1:1,Rosa:2:2') throw new Error(`${database}: unexpected starting order ${before}`)
  psqlText(database, swap)
  if (state() !== 'Maria:2:2,Rosa:1:1') throw new Error(`${database}: swap did not move slots and rounds together: ${state()}`)

  // Halfway failure: the member slots are already swapped when the rounds update raises.
  psqlText(database, `
    create or replace function public.test_block_round_update() returns trigger language plpgsql as $$
    begin raise exception 'blocked for test'; end $$;
    create trigger test_block_round_update before update on public.rounds
      for each row execute function public.test_block_round_update();
  `)
  const failure = psqlFails(database, swap)
  psqlText(database, `
    drop trigger test_block_round_update on public.rounds;
    drop function public.test_block_round_update();
  `)
  if (!failure.includes('blocked for test')) throw new Error(`${database}: swap failed for the wrong reason: ${failure}`)
  if (state() !== 'Maria:2:2,Rosa:1:1') throw new Error(`${database}: failed swap left a partial change: ${state()}`)

  const otherCycle = psqlFails(database, `
    select public.swap_payout_order(
      (select id from public.members where access_token = 'member-token-maria1'),
      (select id from public.members where access_token = 'expiry-token-recent1'));
  `)
  if (!otherCycle.includes('same cycle')) throw new Error(`${database}: cross-cycle swap was not refused: ${otherCycle}`)

  psqlText(database, `update public.members set removed_at = now() where access_token = 'member-token-rosa02';`)
  const board = JSON.parse(psqlText(database, `select get_member_board('member-token-maria1');`).trim().split('\n').pop())
  if (board.progress.length !== 1 || board.progress[0].display_first_name !== 'Maria') {
    throw new Error(`${database}: removed member still in progress: ${JSON.stringify(board.progress)}`)
  }
  const rosaRound = board.rounds.find(r => r.number === 1)
  if (!rosaRound || rosaRound.recipient_first_name !== null) {
    throw new Error(`${database}: removed member's round should have no recipient name: ${JSON.stringify(board.rounds)}`)
  }
  const removed = psqlFails(database, `select get_member_board('member-token-rosa02');`)
  if (!/not found/.test(removed)) throw new Error(`${database}: removed member's link still works`)
  const kept = psqlText(database, `
    select count(*) from public.payments p join public.members m on m.id = p.member_id
    where m.access_token = 'member-token-rosa02';
  `).trim()
  psqlText(database, `update public.members set removed_at = null where access_token = 'member-token-rosa02';`)
  console.log(`${database}: swap_payout_order is atomic; removed members leave progress, keep rows (${kept} payments)`)
}

// N11: payout on/after collect, collect dates rise with round number, real time zones.
// Familia Demo has rounds 1 (collects 2099-06-01) and 2 (collects 2099-07-03). Fake data only.
function assertScheduleValidation(database) {
  const cycle = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const maria = `(select id from public.members where access_token = 'member-token-maria1')`
  const mustFail = (label, sql, pattern) => {
    const error = psqlFails(database, sql)
    if (!pattern.test(error)) throw new Error(`${database}: ${label} failed for the wrong reason: ${error}`)
  }

  mustFail('payout before collect', `
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id)
    values ('${cycle}', 3, '2099-08-01', '2099-07-31', ${maria});
  `, /rounds_payout_on_or_after_collect/)
  mustFail('round 3 collecting before round 2', `
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id)
    values ('${cycle}', 3, '2099-06-15', '2099-06-16', ${maria});
  `, /out of date order/)
  mustFail('moving round 1 after round 2', `
    update public.rounds set collect_date = '2099-07-10', payout_date = '2099-07-11'
    where cycle_id = '${cycle}' and round_number = 1;
  `, /out of date order/)
  psqlText(database, `
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id)
    values ('${cycle}', 3, '2099-07-17', '2099-07-17', ${maria});
    delete from public.rounds where cycle_id = '${cycle}' and round_number = 3;
  `)

  // 011: payout dates must rise with the round number too (create, update).
  mustFail('round 3 paying out before round 2', `
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id)
    values ('${cycle}', 3, '2099-07-17', '2099-07-04', ${maria});
  `, /rounds_payout_on_or_after_collect|out of payout order/)
  mustFail('round 3 paying out on round 2 payout day', `
    insert into public.rounds (cycle_id, round_number, collect_date, payout_date, recipient_member_id)
    values ('${cycle}', 3, '2099-07-04', '2099-07-04', ${maria});
  `, /out of date order|out of payout order/)
  mustFail('moving round 1 payout after round 2 payout', `
    update public.rounds set payout_date = '2099-07-20'
    where cycle_id = '${cycle}' and round_number = 1;
  `, /out of payout order/)

  mustFail('made-up time zone', `update public.cycles set timezone = 'Mars/Olympus_Mons' where id = '${cycle}';`, /Unknown time zone/)
  mustFail('null time zone', `update public.cycles set timezone = null where id = '${cycle}';`, /Unknown time zone|null value/)
  psqlText(database, `update public.cycles set timezone = 'America/New_York' where id = '${cycle}';`)
  psqlText(database, `update public.cycles set timezone = 'America/Los_Angeles' where id = '${cycle}';`)
  console.log(`${database}: rounds stay in date order with payout on/after collect; time zones must be real`)
}

// N9: rounds and members don't have to match. An import where one member has no payment row
// in round 1 is accepted, and the member page counts only that round's payment rows.
function assertRoundsNotMembers(database) {
  const plan = importPlan({
    name: 'Uneven Demo', dates: ['2098-08-07', '2098-08-08', '2098-08-21', '2098-08-22'], tokenPrefix: 'uneven-token',
  })
  plan.payments = plan.payments.filter(p => !(p.roundNumber === 1 && p.slot === 2)) // Beto skips round 1
  const summary = JSON.parse(psqlText(database, callImport(plan)).trim().split('\n').filter(Boolean).pop())
  if (summary.members !== 2 || summary.rounds !== 2 || summary.payments !== 3) {
    throw new Error(`${database}: uneven import summary was ${JSON.stringify(summary)}`)
  }
  const board = JSON.parse(psqlText(database, `select get_member_board('uneven-token-ana-0001');`).trim().split('\n').pop())
  if (board.current_round?.round_number !== 1) throw new Error(`${database}: expected round 1, got ${JSON.stringify(board.current_round)}`)
  const names = board.progress.map(p => p.display_first_name).join(',')
  if (names !== 'Ana') throw new Error(`${database}: round 1 progress should list only Ana, got ${names}`)

  // A stray payment row linking another cycle's member to this round must not leak their name.
  psqlText(database, `
    insert into public.payments (round_id, member_id, amount)
    select r.id, (select id from public.members where access_token = 'member-token-maria1'), 10
    from public.rounds r join public.cycles c on c.id = r.cycle_id
    where c.name = 'Uneven Demo' and r.round_number = 1;
  `)
  const scoped = JSON.parse(psqlText(database, `select get_member_board('uneven-token-ana-0001');`).trim().split('\n').pop())
  const scopedNames = scoped.progress.map(p => p.display_first_name).join(',')
  if (scopedNames !== 'Ana') throw new Error(`${database}: progress leaked another cycle's member: ${scopedNames}`)
  console.log(`${database}: an uneven import is accepted and progress counts only the round's payment rows`)
}

// N9 follow-up: three members, three rounds, but Ana receives twice (rounds 2 and 3) and
// Cy never does. Round 3 is listed first so it is stored first: the old unordered
// "limit 1" would have shown Ana round 3's date instead of her next payout (round 2).
function assertUnevenRounds(database) {
  const plan = {
    cycle: {
      name: 'Twice Demo', start_date: '2098-09-04', interval_days: 14, contribution: 20,
      timezone: 'America/Los_Angeles', archived_at: '2098-12-01T00:00:00Z',
    },
    members: [
      { slot: 1, display_first_name: 'Ana', access_token: 'twice-token-ana-0001' },
      { slot: 2, display_first_name: 'Beto', access_token: 'twice-token-beto-001' },
      { slot: 3, display_first_name: 'Cy', access_token: 'twice-token-cy-00001' },
    ],
    rounds: [
      { round_number: 3, collect_date: '2098-10-02', payout_date: '2098-10-03', recipientSlot: 1 },
      { round_number: 1, collect_date: '2098-09-04', payout_date: '2098-09-05', recipientSlot: 2 },
      { round_number: 2, collect_date: '2098-09-18', payout_date: '2098-09-19', recipientSlot: 1 },
    ],
    payments: [1, 2, 3].flatMap(roundNumber => [1, 2, 3].map(slot => ({ roundNumber, slot, amount: 20 }))),
  }
  const summary = JSON.parse(psqlText(database, callImport(plan)).trim().split('\n').filter(Boolean).pop())
  if (summary.members !== 3 || summary.rounds !== 3 || summary.payments !== 9) {
    throw new Error(`${database}: uneven-recipient import summary was ${JSON.stringify(summary)}`)
  }
  const board = token => JSON.parse(psqlText(database, `select get_member_board('${token}');`).trim().split('\n').pop())
  const ana = board('twice-token-ana-0001')
  if (ana.me.payout_date !== '2098-09-19') throw new Error(`${database}: Ana's next payout should be round 2, got ${ana.me.payout_date}`)
  if (ana.rounds.map(r => `${r.number}:${r.recipient_first_name}`).join(',') !== '1:Beto,2:Ana,3:Ana') {
    throw new Error(`${database}: rounds list was ${JSON.stringify(ana.rounds)}`)
  }
  const cy = board('twice-token-cy-00001')
  if (cy.me.payout_date !== null) throw new Error(`${database}: Cy has no payout round, got ${cy.me.payout_date}`)
  if (cy.progress.length !== 3) throw new Error(`${database}: Cy's board progress should list 3 payers, got ${cy.progress.length}`)
  console.log(`${database}: a member paid out twice sees their next payout; a member with none still gets a board`)
}

// N8: an anonymous client can't receive payment or member events. Realtime postgres_changes
// only exist for tables in the supabase_realtime publication and are filtered by the
// subscriber's read access, so check both: no app table is published, and anon can't read any.
function assertNoAnonRealtime(database) {
  const published = psqlText(database, `
    select coalesce(string_agg(tablename, ','), '') from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public';
  `).trim()
  if (published) throw new Error(`${database}: tables publish realtime changes: ${published}`)

  const exposed = psqlText(database, `
    select coalesce(string_agg(c.relname, ','), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select'));
  `).trim()
  if (exposed) throw new Error(`${database}: anon can read, or RLS is off for: ${exposed}`)

  for (const table of ['payments', 'members', 'rounds', 'cycles']) {
    const error = psqlFails(database, `set role anon; select count(*) from public.${table};`)
    if (!/permission denied/.test(error)) throw new Error(`${database}: anon read of ${table} failed for the wrong reason: ${error}`)
  }
  console.log(`${database}: no table publishes realtime changes and anon can't read payments, members, rounds, or cycles`)
}

// Phase 4: the reminder log keeps one row per member, window, round, and mode; opt-outs need
// a real E.164 phone; signed-in non-admins see nothing. Fake data only.
function assertReminderTables(database) {
  const insert = `
    insert into public.reminder_log (cycle_id, round_id, member_id, kind, local_date, dry_run, status)
    select r.cycle_id, r.id, r.recipient_member_id, 'friday_noon', r.collect_date, true, 'dry_run'
    from public.rounds r where r.cycle_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and r.round_number = 1
    on conflict (round_id, member_id, kind, dry_run) do nothing
    returning id;`
  // psql also prints the "INSERT 0 n" tag, so count only the returned ids.
  const ids = sql => psqlText(database, sql).split('\n').filter(line => /^[0-9a-f-]{36}$/.test(line.trim())).length
  const first = ids(insert)
  const second = ids(insert)
  if (first !== 1 || second !== 0) throw new Error(`${database}: reminder_log dedupe failed (${first}, ${second})`)

  const badPhone = psqlFails(database, `insert into public.sms_opt_outs (phone_e164) values ('5550100002');`)
  if (!/check constraint/.test(badPhone)) throw new Error(`${database}: a non-E.164 opt-out was accepted: ${badPhone}`)
  psqlText(database, `insert into public.sms_opt_outs (phone_e164, keyword) values ('+15550100002', 'STOP') on conflict do nothing;`)

  const seen = psqlText(database, `
    set role authenticated;
    select (select count(*) from public.reminder_log) || ',' || (select count(*) from public.sms_opt_outs);
  `).trim().split('\n').pop()
  if (seen !== '0,0') throw new Error(`${database}: a non-admin could read reminder rows (${seen})`)
  console.log(`${database}: reminder_log logs each window once; opt-outs need E.164; non-admins see neither`)
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
assertSoftDeleteReorder(fresh)
assertScheduleValidation(fresh)
assertRoundsNotMembers(fresh)
assertUnevenRounds(fresh)
assertNoAnonRealtime(fresh)
assertReminderTables(fresh)

console.log('b) original schema (before review migrations), 003 only, 002 skipped, applied twice')
recreate(legacy)
const oldSchema = join(scratch, 'schema-before-migrations.sql')
writeFileSync(oldSchema, execFileSync('git', ['show', `${OLD_SCHEMA_REV}:supabase/schema.sql`], { cwd: root, encoding: 'utf8' }))
applyFile(legacy, oldSchema)
applyMigrations(legacy, { skip: ['002_review_fixes.sql'] })
assertArchiveLock(legacy)
assertAtomicImport(legacy)
assertLinkRevokeExpiry(legacy)
assertSoftDeleteReorder(legacy)
assertScheduleValidation(legacy)
assertRoundsNotMembers(legacy)
assertUnevenRounds(legacy)
assertNoAnonRealtime(legacy)
assertReminderTables(legacy)

rmSync(scratch, { recursive: true, force: true })
console.log('SQL ok: fresh schema + migrations x2, and legacy schema + 003 onward (002 skipped) x2')
