// Generates supabase/migrations/undo/<migration>.undo.sql from per-step catalog dumps taken on a LOCAL database
// (see supabase/drift/catalog-dump.sql and object-defs.sql). One undo file per migration; each reverses ONLY what that migration added or
// changed, assuming every LATER migration has already been undone (undo in reverse order: 23 -> 00).
//
//   node supabase/drift/gen-undo.mjs <dir-with-base.txt-00.txt-01.txt...-and-.defs files>
//
// What it can reverse: new tables / views / functions / triggers / policies / indexes / constraints / columns / enums / schemas / roles,
// changed CHECK constraints and policies on pre-existing tables, replaced functions and views (restored from the previous step's
// definition), and table grants that a migration revoked. What it cannot: DATA written into the new objects after apply (dropping
// them loses it), rows a migration inserted into pre-existing tables (listed as DELETEs where identifiable), and storage buckets
// (Supabase blocks direct DELETE on storage tables: remove the bucket with the Storage API / dashboard).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('usage: node gen-undo.mjs <dumpdir>'); process.exit(2); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const OUT = join(MIG, 'undo');
mkdirSync(OUT, { recursive: true });

const files = readdirSync(MIG).filter((f) => /^\d{14}_smc_\d\d_.*\.sql$/.test(f)).sort();
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;   // one identifier (column, constraint, policy, trigger, index name)
const qn = (qual) => { const t = qual.includes('.') ? qual : `public.${qual}`; return t.split('.').map((p) => `"${p}"`).join('.'); };
const norm = (t) => (t.includes('.') ? t : `public.${t}`);

function load(step) {
  const lines = readFileSync(join(dir, `${step}.txt`), 'utf8').split('\n').filter(Boolean);
  const m = { schema: new Map(), ext: new Map(), role: new Map(), col: new Map(), rel: new Map(), con: new Map(), idx: new Map(), pol: new Map(), trg: new Map(), fn: new Map(), tgrant: new Map(), bucket: new Map(), enum: new Map() };
  for (const l of lines) {
    const p = l.split('|'); const k = p[0];
    let key;
    if (k === 'col') key = `${p[1]}|${p[2]}`;
    else if (k === 'con') key = `${norm(p[1])}|${p[2]}`;
    else if (k === 'idx') key = `${p[1]}|${p[2]}`;
    else if (k === 'pol') key = `${p[1]}|${p[2]}`;
    else if (k === 'trg') key = `${norm(p[1])}|${p[2]}`;
    else if (k === 'fn') key = p[1];
    else if (k === 'tgrant') key = `${p[1]}|${p[2]}`;
    else key = p[1];
    if (m[k]) m[k].set(key, p);
  }
  const defs = new Map();
  const raw = existsSync(join(dir, `${step}.defs`)) ? readFileSync(join(dir, `${step}.defs`), 'utf8') : '';
  for (const rec of raw.split('\x1e')) { const i = rec.indexOf('\n'); if (i > 0) defs.set(rec.slice(0, i).trim(), rec.slice(i + 1).trim()); }
  return { m, defs };
}

const steps = ['base', ...files.map((f) => f.match(/_smc_(\d\d)_/)[1])];
const data = new Map(steps.map((s) => [s, load(s)]));

function privs(s) { return new Set((s || '').split(',').filter(Boolean)); }

function undoFor(prevStep, curStep, fname) {
  const A = data.get(prevStep).m, B = data.get(curStep).m, defsA = data.get(prevStep).defs;
  const out = [];
  const add = (...l) => out.push(...l);
  const relExistedBefore = (t) => t.startsWith('storage.') || A.rel.has(t);
  const roleCfgNote = [];

  // 1. new triggers / policies on tables that existed before (tables created here are dropped whole)
  for (const [key, p] of B.trg) if (!A.trg.has(key) && relExistedBefore(norm(p[1]))) add(`DROP TRIGGER IF EXISTS ${q(p[2])} ON ${qn(norm(p[1]))};`);
  for (const [key, p] of B.pol) if (!A.pol.has(key) && relExistedBefore(p[1])) add(`DROP POLICY IF EXISTS ${q(p[2])} ON ${qn(p[1])};`);
  // changed or removed policies: restore the previous definition
  for (const [key, p] of A.pol) {
    const cur = B.pol.get(key);
    if (cur && cur.join('|') === p.join('|')) continue;
    if (!relExistedBefore(p[1]) ) continue;
    if (cur) add(`DROP POLICY IF EXISTS ${q(p[2])} ON ${qn(p[1])};`);
    const roles = p[5] && p[5] !== 'public' ? ` TO ${p[5]}` : '';
    const perm = p[3] === 'RESTRICTIVE' ? ' AS RESTRICTIVE' : '';
    add(`CREATE POLICY ${q(p[2])} ON ${qn(p[1])}${perm} FOR ${p[4]}${roles}${p[6] ? `\n  USING (${p[6]})` : ''}${p[7] ? `\n  WITH CHECK (${p[7]})` : ''};`);
  }
  // 2. RLS flag turned on for a table that existed before
  for (const [t, p] of B.rel) { const a = A.rel.get(t); if (a && p[2] === 'r' && p[3] !== a[3]) add(`ALTER TABLE ${qn(t)} ${a[3] === 'rls=true' ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;  -- was ${a[3]}`); }
  // 3. views: drop new; restore replaced
  for (const [t, p] of B.rel) {
    if (p[2] !== 'v') continue;
    const a = A.rel.get(t);
    if (!a) { add(`DROP VIEW IF EXISTS ${qn(t)} CASCADE;`); continue; }
    const dA = defsA.get(`view|${t}`), dB = data.get(curStep).defs.get(`view|${t}`);
    if (dA && dB && dA !== dB) add(`DROP VIEW IF EXISTS ${qn(t)} CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)`, `${dA.replace(/;s*$/, '')};`);
  }
  // 4. functions: drop new, restore replaced
  for (const [sig, p] of B.fn) {
    const a = A.fn.get(sig);
    const name = sig.replace(/^([^.]+)\.([^(]+)\((.*)\)$/, (_, s, n, args) => `${s}.${n}(${args})`);
    if (!a) { add(`DROP FUNCTION IF EXISTS ${name} CASCADE;`); continue; }
    const dA = defsA.get(`fn|${sig}`), dB = data.get(curStep).defs.get(`fn|${sig}`);
    if (dA && dB && dA !== dB) add(`${dA.replace(/\s+$/, '')};  -- restore previous definition (function was replaced here)`);
    if (a.join('|') !== p.join('|') && dA === dB) add(`-- NOTE: ACL/config of ${sig} changed here: was ${a.slice(2).join(' ')}`);
  }
  // 5. constraints on pre-existing tables: drop new, restore changed/removed
  for (const [key, p] of B.con) if (!A.con.has(key) && relExistedBefore(norm(p[1]))) add(`ALTER TABLE ${qn(norm(p[1]))} DROP CONSTRAINT IF EXISTS ${q(p[2])};`);
  for (const [key, p] of A.con) {
    const cur = B.con.get(key);
    if (cur && cur[3] === p[3]) continue;
    if (!B.rel.has(norm(p[1]))) continue;
    if (cur) add(`ALTER TABLE ${qn(norm(p[1]))} DROP CONSTRAINT IF EXISTS ${q(p[2])};`);
    add(`ALTER TABLE ${qn(norm(p[1]))} ADD CONSTRAINT ${q(p[2])} ${p[3]};  -- previous definition`);
  }
  // 6. indexes on pre-existing tables
  for (const [key, p] of B.idx) if (!A.idx.has(key) && relExistedBefore(p[1])) add(`DROP INDEX IF EXISTS ${qn(p[1].split('.')[0] + '.' + p[2])};`);
  // 7. columns on pre-existing tables (LOSES the data in them)
  const droppedCols = [];
  for (const [key, p] of B.col) if (!A.col.has(key) && relExistedBefore(p[1]) && A.rel.get(p[1])?.[2] !== 'v') droppedCols.push(p);
  for (const p of droppedCols) add(`ALTER TABLE ${qn(p[1])} DROP COLUMN IF EXISTS ${q(p[2])} CASCADE;  -- data in this column is lost`);
  // altered columns (NOT NULL relaxed etc.)
  for (const [key, p] of A.col) {
    const cur = B.col.get(key); if (!cur || A.rel.get(p[1])?.[2] === 'v') continue;
    if (cur[4] !== p[4] && p[4] === 'NN') add(`DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM ${qn(p[1])} WHERE ${q(p[2])} IS NULL) THEN ALTER TABLE ${qn(p[1])} ALTER COLUMN ${q(p[2])} SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on ${p[1]}.${p[2]}: rows with NULL exist (written since the migration)'; END IF; END $u$;`);
    else if (cur[3] !== p[3] || cur[5] !== p[5]) add(`-- NOTE: ${p[1]}.${p[2]} changed type/default here: was ${p[3]} ${p[5] ? 'default ' + p[5] : ''}`);
  }
  // 8. new tables (data lost), types, schemas, roles
  const newTables = [...B.rel].filter(([t, p]) => !A.rel.has(t) && p[2] !== 'v').map(([t]) => t);
  for (const t of newTables) add(`DROP TABLE IF EXISTS ${qn(t)} CASCADE;  -- all rows lost`);
  for (const [t, p] of B.enum) if (!A.enum.has(t)) add(`DROP TYPE IF EXISTS public.${q(t)} CASCADE;`);
  for (const [s] of B.schema) if (!A.schema.has(s)) add(`DROP SCHEMA IF EXISTS ${q(s)} CASCADE;`);
  for (const [r] of B.role) if (!A.role.has(r)) add(`DROP OWNED BY ${q(r)};`, `DROP ROLE IF EXISTS ${q(r)};`);
  for (const [e] of B.ext) if (!A.ext.has(e)) add(`-- NOTE: extension ${e} was created here; drop it only if nothing else uses it: DROP EXTENSION IF EXISTS ${q(e)};`);
  for (const [b, p] of B.bucket) if (!A.bucket.has(b)) add(`-- NOTE: storage bucket "${b}" was created here. Supabase blocks DELETE on storage tables from SQL: empty and delete it with the Storage API or the dashboard.`);
  for (const [b, p] of B.bucket) { const a = A.bucket.get(b); if (a && a.join('|') !== p.join('|')) add(`-- NOTE: bucket ${b} settings changed here; was ${a.slice(2).join(' ')}`); }
  // 9. grants removed on tables that existed before: give them back (this RE-OPENS the earlier exposure; see the review file)
  const regrant = [];
  for (const [key, p] of A.tgrant) {
    const cur = B.tgrant.get(key); const before = privs(p[3]), after = privs(cur?.[3]);
    const lost = [...before].filter((x) => !after.has(x));
    if (lost.length && B.rel.has(p[1])) regrant.push(`GRANT ${lost.join(', ')} ON ${qn(p[1])} TO ${p[2]};`);
  }
  if (regrant.length) { add('-- Privileges this migration revoked from pre-existing tables (restoring them RE-OPENS the earlier, weaker posture):'); add(...regrant); }
  return out;
}

const dataNotes = {
  '03': ["-- Rows inserted into pre-existing tables by this migration:", "DELETE FROM public.sla_thresholds WHERE channel = 'smc_first_message';"],
  '02': ["-- Rows written by the smc_audit trigger (seeds and every later SMC write) are in the live public.audit_log; they carry actor_role, legacy fn_audit rows do not."],
};
const preNotes = {
  '02': ["-- Remove the audit rows the smc chain wrote (the 41 legacy rows have actor_role NULL and stay). This also erases the audit history of any SMC activity since the apply.",
         "DELETE FROM public.audit_log WHERE actor_role IS NOT NULL;"],
};

for (let i = 0; i < files.length; i++) {
  const f = files[i]; const step = steps[i + 1]; const prev = steps[i];
  const lines = undoFor(prev, step, f);
  const body = [
    `-- UNDO of ${f}`,
    `-- Generated ${new Date().toISOString().slice(0, 10)} from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).`,
    `-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.`,
    '-- Review before running. Run in one transaction.',
    'BEGIN;',
    'SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped',
    ...(preNotes[step] || []),
    ...(lines.length ? lines : ['-- (nothing structural to reverse)']),
    ...(dataNotes[step] || []),
    'COMMIT;',
    '',
  ].join('\n');
  writeFileSync(join(OUT, f.replace(/\.sql$/, '.undo.sql')), body);
}
console.log(`wrote ${files.length} undo files to ${OUT}`);
