// LOCAL rehearsal of the smc migration chain on the live-schema mirror. Never touches the live project.
//   node supabase/drift/rehearse-chain.mjs            (Docker postgres:17-alpine, --network none, removed afterwards)
// Steps (each prints PASS/FAIL; exit code 1 on any FAIL):
//   1 baseline: pg-stub + prelude + real-public-schema + synthetic seed, data snapshot (_snap) and catalog dump
//   2 apply every ^\d{14}_smc_ file in order, one transaction each, catalog dump after each step (for gen-undo.mjs)
//   3 re-apply the whole chain (idempotency): catalog identical to the first apply
//   4 existing rows unchanged: every pre-existing table's baseline columns hash identical (allowed: audit_log row count growth)
//   5 security audit (post-apply-security-audit.sql) + smoke-nurture.sql (one rolled-back transaction of functional checks)
//   6 generate undo files (gen-undo.mjs) and run them in reverse: catalog and data identical to the baseline (bucket excepted)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startLocalPg } from '../../automation/tests/_localpg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const D = join(ROOT, 'supabase', 'drift');
const MIG = join(ROOT, 'supabase', 'migrations');
const OUT = process.env.REHEARSE_OUT || join(tmpdir(), 'lv-rehearsal');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const files = readdirSync(MIG).filter((f) => /^\d{14}_smc_\d\d_.*\.sql$/.test(f)).sort();
let failed = 0;
const report = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `\n      ${detail}` : ''}`); };

const pg = startLocalPg('docker');
try {
  const at = (args = []) => ['-At', ...args];
  const catalog = () => pg.file(join(D, 'catalog-dump.sql'), at());
  const defs = () => pg.file(join(D, 'object-defs.sql'), at());
  const snap = () => pg.sql('SELECT t||\'|\'||n||\'|\'||h FROM _snap.take() ORDER BY 1;', at());
  const dump = (step) => { writeFileSync(join(OUT, `${step}.txt`), catalog()); writeFileSync(join(OUT, `${step}.defs`), defs()); };

  // 1 baseline
  pg.file(join(ROOT, 'automation', 'tests', 'fixtures', 'pg-stub.sql'));
  pg.file(join(D, 'real-public-prelude.sql'));
  pg.file(join(D, readdirSync(D).find((f) => /^real-public-schema-.*\.sql$/.test(f))));
  pg.file(join(D, 'real-seed-synthetic.sql'));
  pg.sql('ALTER DATABASE postgres SET search_path = "$user", public, extensions');
  pg.file(join(D, 'snapshot-baseline.sql'));
  const baseData = snap();
  const baseAudit8 = pg.file(join(D, 'post-apply-security-audit.sql'), ['-A', '-F', ' | ']);
  dump('base');
  report(true, `baseline built (${baseData.trim().split('\n').length} tables snapshotted)`);

  // 2 apply in order
  for (const f of files) {
    const step = f.match(/_smc_(\d\d)_/)[1];
    try { pg.file(join(MIG, f), ['-1']); dump(step); report(true, `apply ${f}`); }
    catch (e) { report(false, `apply ${f}`, String(e.stderr || e.message).trim().split('\n').slice(-6).join('\n      ')); throw new Error('stop'); }
  }
  const afterFirst = catalog();

  // 3 idempotency
  let reOk = true;
  for (const f of files) { try { pg.file(join(MIG, f), ['-1']); } catch (e) { reOk = false; report(false, `re-apply ${f}`, String(e.stderr || e.message).trim().split('\n').slice(-4).join('\n      ')); } }
  const afterSecond = catalog();
  const diff = (a, b) => { const A = new Set(a.split('\n')), B = new Set(b.split('\n')); return [...[...A].filter((x) => !B.has(x)).map((x) => `- ${x}`), ...[...B].filter((x) => !A.has(x)).map((x) => `+ ${x}`)]; };
  const d2 = diff(afterFirst, afterSecond);
  report(reOk && d2.length === 0, 're-apply whole chain: no error, catalog unchanged', d2.slice(0, 12).join('\n      '));

  // 4 existing rows unchanged
  const afterData = snap();
  const bd = new Map(baseData.trim().split('\n').map((l) => { const [t, n, h] = l.split('|'); return [t, { n, h }]; }));
  const changed = [];
  for (const l of afterData.trim().split('\n')) {
    const [t, n, h] = l.split('|'); const b = bd.get(t);
    if (!b) continue;
    if (b.h !== h || b.n !== n) changed.push(`${t}: rows ${b.n} -> ${n}${b.h !== h ? ' (content hash changed)' : ''}`);
  }
  const allowed = changed.filter((c) => /^audit_log: rows \d+ -> \d+ \(content hash changed\)$/.test(c));
  report(changed.length === allowed.length, 'pre-existing rows unchanged (baseline columns of all live tables)', changed.join('\n      '));
  if (allowed.length) console.log(`      note: ${allowed.join('; ')} (smc_audit rows for the chain's own seed writes)`);
  const legacyAudit = pg.sql("SELECT count(*) FROM public.audit_log WHERE actor_role IS NULL;", at()).trim();
  const baseAudit = (bd.get('audit_log') || {}).n;
  report(legacyAudit === baseAudit, `legacy audit rows intact (${legacyAudit} = baseline ${baseAudit})`);

  // 5 security audit + smoke
  const audit = pg.file(join(D, 'post-apply-security-audit.sql'), ['-A', '-F', ' | ']);
  writeFileSync(join(OUT, 'security-audit.txt'), audit);
  const secOf = (txt, title) => { const m = txt.split(/^--- /m).find((s) => s.startsWith(title)) || ''; return m.split('\n').slice(1).filter((l) => l && !/^\(\d+ rows?\)$/.test(l)); };
  const pre8 = new Set(secOf(baseAudit8, '8.').slice(1));   // open policies that already exist live (public forms, tunnel_config)
  const sec = (title) => secOf(audit, title);
  const bodyRows = (title) => sec(title).slice(1);   // first line = column header
  for (const [n, label] of [['1.', 'chain tables without RLS'], ['2.', 'anon privileges on new objects'], ['4.', 'definers without pinned search_path'],
                            ['5.', 'new anon-callable definers'], ['8.', 'NEW open anon/public policies (baseline ones excluded)'], ['11.', 'secret-looking literals']]) {
    const rows = bodyRows(n).filter((r) => !(n === '8.' && pre8.has(r))).filter((r) => !(n === '1.' && /^public\.(?!(brands|webhook_events|outcomes|replacements|wa_threads|lead_offers|suppression|escalations|broker_media|incidents|capi_log)$)/.test(r)));
    report(rows.length === 0, `security audit ${n} ${label}: none`, rows.join('\n      '));
  }
  const pre = bodyRows('5b.')[0];
  report(pre === '19', `pre-existing anon-callable definers unchanged (19): ${pre}`);
  try { const s = pg.file(join(D, 'smoke-nurture.sql')); writeFileSync(join(OUT, 'smoke.txt'), s); report(/SMOKE OK/.test(s), 'smoke-nurture.sql (capacity, replacements, guards, n8n_app scope, anon)'); }
  catch (e) { report(false, 'smoke-nurture.sql', String(e.stderr || e.message).trim().split('\n').slice(-6).join('\n      ')); }

  // 6 undo
  execFileSync(process.execPath, [join(D, 'gen-undo.mjs'), OUT], { stdio: 'inherit' });
  let undoOk = true;
  for (const f of [...files].reverse()) {
    try { pg.file(join(MIG, 'undo', f.replace(/\.sql$/, '.undo.sql'))); }
    catch (e) { undoOk = false; report(false, `undo ${f}`, String(e.stderr || e.message).trim().split('\n').slice(-4).join('\n      ')); break; }
  }
  const afterUndo = catalog();
  const base = readFileSync(join(OUT, 'base.txt'), 'utf8');
  const du = diff(base, afterUndo).filter((l) => !/^\+ bucket\|broker-media\|/.test(l) && !/^\+ ext\|btree_gist$/.test(l));
  report(undoOk && du.length === 0, 'undo 07..00: catalog identical to the baseline (broker-media bucket + btree_gist extension excepted)', du.slice(0, 20).join('\n      '));
  const undoData = snap();
  report(undoData === baseData, 'undo: data identical to the baseline', undoData === baseData ? '' : diff(baseData, undoData).slice(0, 10).join('\n      '));
} catch (e) {
  if (e.message !== 'stop') { failed++; console.log(`FAIL  ${e.stack || e.message}`); }
} finally {
  pg.stop();
}
console.log(failed ? `\nREHEARSAL FAILED (${failed})` : '\nREHEARSAL PASSED');
process.exit(failed ? 1 : 0);
