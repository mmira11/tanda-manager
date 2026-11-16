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
  console.log(`${database}: 6 archive policies, get_member_board uses the cycle timezone`)
}

const fresh = 'tanda_sql_fresh'
const legacy = 'tanda_sql_legacy'

console.log('a) fresh schema.sql, then every migration twice')
recreate(fresh)
applyFile(fresh, join(root, 'supabase', 'schema.sql'))
applyMigrations(fresh)
assertArchiveLock(fresh)

console.log('b) original schema (before review migrations), 003 only, 002 skipped, applied twice')
recreate(legacy)
const oldSchema = join(scratch, 'schema-before-migrations.sql')
writeFileSync(oldSchema, execFileSync('git', ['show', `${OLD_SCHEMA_REV}:supabase/schema.sql`], { cwd: root, encoding: 'utf8' }))
applyFile(legacy, oldSchema)
applyMigrations(legacy, { skip: ['002_review_fixes.sql'] })
assertArchiveLock(legacy)

rmSync(scratch, { recursive: true, force: true })
console.log('SQL ok: fresh schema + migrations x2, and legacy schema + 003 (002 skipped) x2')
