// One-time import of an old tanda JSON export into an archived Supabase cycle.
// Reads SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from the
// environment or .env.local. Never prints the key, names, or phone numbers.
//
//   node scripts/import-backup.mjs ./tanda-backup.json --contribution 150
//
// Prefer Admin → Settings → Import backup when you are already signed in.
// The service-role key stays in .env.local and must not be committed.

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildImportPlan, formatImportSummary, ImportError, writeImport } from '../src/utils/importBackup.js'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function readArgs(argv) {
  if (argv.some(arg => arg === '--key' || arg.startsWith('--service') || /service_role/i.test(arg))) {
    throw new ImportError('Do not pass keys on the command line. Put SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  }
  let file = null
  let contribution
  let name
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--contribution') contribution = argv[++i]
    else if (arg === '--name') name = argv[++i]
    else if (arg.startsWith('--')) throw new ImportError('Unknown option')
    else if (!file) file = arg
    else throw new ImportError('Pass one backup file')
  }
  if (!file) throw new ImportError('Usage: node scripts/import-backup.mjs <backup.json> --contribution <amount>')
  return { file, contribution, name }
}

async function main() {
  const { file, contribution, name } = readArgs(process.argv.slice(2))
  loadEnvFile(resolve(process.cwd(), '.env.local'))
  loadEnvFile(resolve(process.cwd(), '.env'))

  const raw = readFileSync(resolve(file), 'utf8')
  const plan = buildImportPlan(raw, {
    contribution: contribution === undefined ? undefined : Number(contribution),
    name,
  })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new ImportError(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit that file), or use Import backup in admin while signed in.',
    )
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const summary = await writeImport(supabase, plan)
  console.log(formatImportSummary(summary))
}

main().catch((error) => {
  console.error(error instanceof ImportError ? error.message : 'Import failed.')
  process.exit(1)
})
