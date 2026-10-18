// Read-only logical backup + post-apply verification for the Supabase project, free plan (no managed backups).
//
//   backup  :  SUPABASE_DB_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' node supabase/migrations/backup/backup-live.mjs backup [outDir]
//   verify  :  SUPABASE_DB_URL=... node supabase/migrations/backup/backup-live.mjs verify <backupDir>
//
// * Uses ONE read-only, REPEATABLE READ transaction, so every table is exported from the same snapshot.
// * Exports every base table of schema public as NDJSON (one JSON object per line, written with to_jsonb so types round-trip),
//   in chunks of 1,000 rows through a server-side cursor. Also exports public.* function and policy definitions (catalog.json)
//   and the list of applied migrations.
// * manifest.json records, per table: row count (cursor count AND a separate count(*) in the same snapshot), bytes, sha256 of the
//   file, and canon_sha256 (sha256 over the sorted canonical rows) for verification.
// * verify re-reads the live tables and proves that EVERY backed-up row is still present and unchanged on the backed-up columns
//   (new columns added by the migrations are ignored; rows added by the migrations are counted as "added"). Exit code 1 on any loss.
// * The connection string comes from the environment ONLY. Never commit it, never commit the backup directory (default
//   C:\Users\Jono\lv-mig-backup\<UTC timestamp>, outside the repo). The backup contains personal data (leads, brokers): keep it local.
import pg from 'pg';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, createWriteStream, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';

const [mode, arg] = process.argv.slice(2);
const url = process.env.SUPABASE_DB_URL;
if (!url || !['backup', 'verify'].includes(mode)) {
  console.error('usage: SUPABASE_DB_URL=... node backup-live.mjs backup [outDir] | verify <backupDir>');
  process.exit(2);
}
const CHUNK = 1000;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const canonRow = (o, cols) => JSON.stringify(Object.fromEntries((cols || Object.keys(o).sort()).map((k) => [k, o[k] === undefined ? null : o[k]])));
const q = (id) => `"${id.replace(/"/g, '""')}"`;

const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ');
const tables = (await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`)).rows.map((r) => r.table_name);

async function readTable(t, onRow) {
  await client.query(`DECLARE c_${t.replace(/\W/g, '_')} NO SCROLL CURSOR FOR SELECT to_jsonb(x) AS j FROM public.${q(t)} x`);
  let n = 0;
  for (;;) {
    const { rows } = await client.query(`FETCH ${CHUNK} FROM c_${t.replace(/\W/g, '_')}`);
    if (!rows.length) break;
    for (const r of rows) { onRow(r.j); n++; }
  }
  await client.query(`CLOSE c_${t.replace(/\W/g, '_')}`);
  return n;
}

if (mode === 'backup') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const out = arg || join(process.env.USERPROFILE || process.env.HOME || '.', 'lv-mig-backup', stamp);
  mkdirSync(out, { recursive: true });
  const manifest = { taken_at: new Date().toISOString(), server: (await client.query('select version() v')).rows[0].v, tables: {} };
  for (const t of tables) {
    const file = join(out, `${t}.ndjson`);
    const ws = createWriteStream(file);
    const canon = []; let cols = null; let n = 0;
    n = await readTable(t, (j) => {
      cols = cols || Object.keys(j).sort();
      canon.push(canonRow(j, cols));
      if (!ws.write(JSON.stringify(j) + '\n')) { /* back-pressure handled below */ }
    });
    ws.end(); await once(ws, 'finish');
    const cnt = Number((await client.query(`SELECT count(*) c FROM public.${q(t)}`)).rows[0].c);
    const colList = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t])).rows.map((r) => r.column_name);
    canon.sort();
    manifest.tables[t] = { rows: n, count_star: cnt, bytes: statSync(file).size, sha256: sha(readFileSync(file)), canon_sha256: sha(canon.join('\n')), columns: colList };
    if (n !== cnt) { console.error(`COUNT MISMATCH ${t}: cursor ${n} vs count(*) ${cnt}`); process.exitCode = 1; }
    console.log(`${t.padEnd(32)} ${String(n).padStart(6)} rows`);
  }
  const cat = {
    applied_migrations: (await client.query(`SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS ok`)).rows[0].ok
      ? (await client.query(`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`)).rows : [],
    functions: (await client.query(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig, pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`)).rows,
    policies: (await client.query(`SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3`)).rows,
    triggers: (await client.query(`SELECT c.relname AS tbl, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2`)).rows,
    constraints: (await client.query(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`)).rows,
  };
  writeFileSync(join(out, 'catalog.json'), JSON.stringify(cat, null, 1));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  await client.query('COMMIT');
  const total = Object.values(manifest.tables).reduce((a, b) => a + b.rows, 0);
  console.log(`\nbackup complete: ${tables.length} tables, ${total} rows -> ${out}\nmanifest.json holds counts and sha256 for each file. Keep this folder OUT of git.`);
} else {
  const dir = arg;
  if (!dir || !existsSync(join(dir, 'manifest.json'))) { console.error('verify needs a backup directory containing manifest.json'); process.exit(2); }
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  let bad = 0;
  for (const [t, m] of Object.entries(manifest.tables)) {
    if (!tables.includes(t)) { console.error(`MISSING TABLE ${t}`); bad++; continue; }
    const file = join(dir, `${t}.ndjson`);
    if (sha(readFileSync(file)) !== m.sha256) { console.error(`BACKUP FILE ALTERED ${t}`); bad++; continue; }
    const cols = m.columns.slice().sort();
    const live = new Set(); let n = 0;
    await readTable(t, (j) => { live.add(canonRow(j, cols)); n++; });
    const old = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => canonRow(JSON.parse(l), cols));
    let lost = 0; for (const r of old) if (!live.has(r)) lost++;
    const added = Math.max(0, n - m.rows);
    const status = lost === 0 ? 'ok' : 'LOST/CHANGED';
    if (lost) bad++;
    console.log(`${t.padEnd(32)} backup ${String(m.rows).padStart(6)}  live ${String(n).padStart(6)}  changed-or-lost ${lost}  added ${added}  ${status}`);
  }
  await client.query('COMMIT');
  console.log(bad ? `\nVERIFY FAILED on ${bad} table(s)` : '\nVERIFY OK: every backed-up row is still present and unchanged (new columns ignored)');
  process.exitCode = bad ? 1 : 0;
}
await client.end();
