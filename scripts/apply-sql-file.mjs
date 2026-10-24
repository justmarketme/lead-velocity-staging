#!/usr/bin/env node
// Apply one .sql file to the live Supabase database from the laptop, then (optionally) run a named check.
//   node scripts/apply-sql-file.mjs docs/APPLY-LIVE-20261024-broker-visibility.sql --check broker-visibility
// Reads SUPABASE_DB_URL from the shell or the repo-root .env (never printed). The file runs as one simple-query
// batch, so its own BEGIN/COMMIT make it all-or-nothing. Used by scripts/go-live-20261024.sh.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = (key) => {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return '';
  const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') : '';
};

// Named checks: one row of counts, and the counts that mean "done".
export const CHECKS = {
  'broker-visibility': {
    sql: `select
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('smc_lead_verified', 'smc_lead_routed_to_me')) as new_functions,
      (select count(*)::int from pg_policies where schemaname = 'public'
        and policyname = 'smc broker read timeline of own lead') as timeline_policy,
      (select count(*)::int from pg_policies where schemaname = 'public'
        and policyname = 'smc broker sees verified leads only' and qual like '%verified_at%') as leads_rule`,
    want: { new_functions: 2, timeline_policy: 1, leads_rule: 1 },
  },
};

const main = async () => {
  const args = process.argv.slice(2);
  const file = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--check')[0];
  const checkName = args.includes('--check') ? args[args.indexOf('--check') + 1] : null;
  const checkOnly = args.includes('--check-only');
  if ((!file && !checkOnly) || (checkName && !CHECKS[checkName])) {
    console.error('usage: node scripts/apply-sql-file.mjs <file.sql> [--check broker-visibility] | --check-only --check <name>');
    process.exit(2);
  }
  const url = process.env.SUPABASE_DB_URL || envFile('SUPABASE_DB_URL');
  if (!url) { console.error('SUPABASE_DB_URL is not set (repo .env or shell). Supabase > Project Settings > Database > Connection string.'); process.exit(2); }

  // Supabase's server certificate is signed by Supabase's own CA, so verify-full fails without it: encrypt, don't verify.
  const u = new URL(url); u.searchParams.delete('sslmode');
  const local = /^(localhost|127\.0\.0\.1|::1)$/.test(u.hostname) || u.searchParams.has('host');
  const client = new pg.Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    if (!checkOnly) {
      await client.query(readFileSync(join(ROOT, file), 'utf8'));
      console.log(`applied ${file}`);
    }
    if (checkName) {
      const { want, sql } = CHECKS[checkName];
      const row = (await client.query(sql)).rows[0];
      const ok = Object.entries(want).every(([k, v]) => row[k] === v);
      console.log(`check ${checkName}: ${JSON.stringify(row)} ${ok ? 'OK' : `NOT OK (want ${JSON.stringify(want)})`}`);
      if (!ok) process.exitCode = 1;
    }
  } finally { await client.end(); }
};

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
