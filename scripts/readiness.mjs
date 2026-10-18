#!/usr/bin/env node
// scripts/readiness.mjs — Section 7 go-live readiness check ("console readiness check (auto)").
//
// Every Section 7 node in build/tasks.json (S7-01 … S7-28) has the acceptance test
// "console readiness check (auto) — line must be green". This is that check. It evaluates each line and prints
//   S7-xx | green/amber/red | evidence | what is missing
// `--json` prints one JSON document instead (schema "lv.readiness.v1", rendered by the console Go-live screen;
// see deliverables/platform-architect/console-portal.md "Readiness (Go-live screen)").
// Exit code 1 if any line is red (red blocks the Go-live button, docs/MASTER-PROMPT.md Section 7), else 0.
//
// Node 18+, zero dependencies. No network, no secrets printed, no database. It reads the repo, runs the named
// offline test suites (`node --test`, SMC_TEST_OFFLINE=1) and the repo's own checkers (eval gate dry run,
// template check, brand hex check, W25 price diff), reads build/tasks.json (read-only) for human-gate status,
// reads env/.env for the PRESENCE of live config (values are never printed or stored; only a set/unset bit and,
// for Paystack, the live-key prefix), and reads evidence logs under build/evidence/.
//
// Status rule (same for every line):
//   green = every check in the line passes.
//   amber = the line is "waiting on the world": every BUILD check passes (what we can make in the repo today is
//           done and its tests pass) and only LIVE checks (external clocks, live config, human sign-off, a run on
//           production) are missing. Only lines whose Section 7 text contains a repo-satisfiable half may be amber
//           (`amber: true` below); purely external lines stay red until green.
//   red   = anything else: a build item is missing, any check FAILS (a suite or checker exits non-zero), or the
//           line is purely external and not yet evidenced. S7-26 is special per Section 7: pre-payment it is amber
//           "ready to provision" when its build half passes.
// `missing` means not there yet; `fail` means it is there and broken. A fail always makes the line red.
//   post-launch (NH-61, confirmed 2026-10-03) = the line is built and tested but switched off until after launch
//           (S7-23 Paystack, S7-24 FNB inContact / statement import). It is reported as "post-launch (NH-61)", never
//           blocks Go live, and still goes red if its own suites FAIL (built code must stay working). If its live half is
//           ever evidenced it turns green. Cycle 1 is paid by EFT in advance and marked paid with one tap: that is
//           checked by the S7-NH61 line instead.
//
// Evidence logs (the live half). One append-only JSON-lines file per line: build/evidence/S7-xx.jsonl.
// Each row is {"at": ISO-8601, "by": "<agent|jonathan|kg|workflow id>", "<key>": <value>, ...}; rows are merged in
// order (a later row overrides a key). Writers: the owning workflow (W20/W21/W22/W26/W27…) or the console's
// "record evidence" action. No secrets and no personal information in these files (IDs and booleans only).
// Two shared logs: build/evidence/whatsapp-templates.jsonl (one row per template decision, the
// deliverables/meta-operator/template-submission-runbook.md §5 log row: name, status, category_decided,
// cost_delta_note, …) and build/evidence/capi-test-events.jsonl (one row per Events Manager test-event check).
// The keys each line needs are listed in its comment block and in the "what is missing" column.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const JSON_OUT = ARGS.includes('--json');
const ENV_FILE = (() => { const i = ARGS.indexOf('--env-file'); return i >= 0 ? resolve(ARGS[i + 1]) : join(ROOT, '.env'); })();
const EVIDENCE_DIR = process.env.READINESS_EVIDENCE_DIR ? resolve(process.env.READINESS_EVIDENCE_DIR) : join(ROOT, 'build', 'evidence');
// I-49h: smc-capi-send appends its Events Manager test-event rows to $CAPI_EVIDENCE_PATH (n8n volume, default
// /data/evidence/capi-test-events.jsonl inside the container). S7-11 / S7-14 read that file when the variable is set
// (process.env only; point it at the host path of the volume); otherwise <evidence dir>/capi-test-events.jsonl.
const CAPI_EVIDENCE_PATH = process.env.CAPI_EVIDENCE_PATH ? resolve(process.env.CAPI_EVIDENCE_PATH) : null;
const SUITE_TIMEOUT_MS = 180_000;

const p = (rel) => join(ROOT, rel);
const exists = (rel) => existsSync(p(rel));
const read = (rel) => readFileSync(p(rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

// ---------------------------------------------------------------------------------------------------------------
// Inputs that are computed once
// ---------------------------------------------------------------------------------------------------------------

// Human gates and node titles from build/tasks.json (read-only).
const TASKS = readJson('build/tasks.json');
const NODE = new Map(TASKS.nodes.map((n) => [n.id, n]));

// Live config presence: process.env overlaid by .env (names only; values never leave this function except as booleans).
const ENV_SET = new Map();
const ENV_PREFIX = new Map(); // name -> first 8 chars, only for the keys in PREFIX_KEYS (live-vs-test detection)
const PREFIX_KEYS = new Set(['PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY']);
const placeholder = (v) => !v || /^(changeme|todo|xxx+|<.*>|\.\.\.|replace[-_ ]?me)$/i.test(v.trim());
function loadEnv() {
  const put = (k, v) => { const ok = !placeholder(v); ENV_SET.set(k, ok); if (ok && PREFIX_KEYS.has(k)) ENV_PREFIX.set(k, String(v).trim().slice(0, 8)); };
  for (const [k, v] of Object.entries(process.env)) put(k, v);
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      put(m[1], m[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2'));
    }
  }
}
loadEnv();

// Evidence logs.
const evidencePath = (file) => (file === 'capi-test-events.jsonl' && CAPI_EVIDENCE_PATH ? CAPI_EVIDENCE_PATH : join(EVIDENCE_DIR, file));
const evidenceLabel = (file) => (file === 'capi-test-events.jsonl' && CAPI_EVIDENCE_PATH ? CAPI_EVIDENCE_PATH : `build/evidence/${file}`);
function evidence(file) {
  const f = evidencePath(file);
  if (!existsSync(f)) return null;
  const rows = [];
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { rows.push({ _bad_row: line.slice(0, 40) }); }
  }
  return rows;
}
const merged = (file) => { const rows = evidence(file); return rows ? Object.assign({}, ...rows) : null; };

// Git-tracked files (to ignore git-ignored local artefacts such as landing/reports in the price diff).
const TRACKED = (() => {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? new Set(r.stdout.split('\0').filter(Boolean)) : null;
})();

// Offline test suites, run once each (in parallel, 4 at a time) before any line is evaluated.
const SUITES = [
  'automation/tests/W01.test.mjs', 'automation/tests/W04.test.mjs', 'automation/tests/W05.test.mjs',
  'automation/tests/W06.test.mjs', 'automation/tests/W09.test.mjs', 'automation/tests/W12.test.mjs',
  'automation/tests/W13.test.mjs', 'automation/tests/W14.test.mjs', 'automation/tests/W15.test.mjs',
  'automation/tests/W16.test.mjs', 'automation/tests/W17.test.mjs', 'automation/tests/W18.test.mjs',
  'automation/tests/W20.test.mjs', 'automation/tests/W22.test.mjs', 'automation/tests/W24.test.mjs',
  'automation/tests/W25.test.mjs', 'automation/tests/W26.test.mjs', 'automation/tests/W32.test.mjs',
  'automation/tests/W34.test.mjs', 'automation/tests/W35.test.mjs', 'automation/tests/generators.test.mjs',
  'automation/billing/billing.test.js', 'automation/billing/autorenew.test.js', 'automation/billing/manual-eft.test.js', 'automation/capi/capi.test.js',
  'automation/ads/meta-ads.test.js', 'automation/media/media.test.js', 'automation/media/w23-auth.test.js',
  'automation/security/verify-webhooks.test.js', 'optimisation/spc.test.js', 'optimisation/workflows.test.js',
  'scripts/build-broker-report-email.test.mjs',
];
// Repo checkers (each a node script with a pass/fail exit code).
const COMMANDS = {
  evals: ['evals/run.mjs', '--dry-run'], // 6B.1 eval gate (FAIS 100%, tone 95%, STOP 100%, baseline)
  templates: ['automation/templates/check.mjs'], // Meta template limits + wording rules, all *.json templates
  hex: ['brand/scripts/check-no-hex.mjs'], // tokens.css/tokens.json the only colour source (P1-BRAND-KIT)
  pricediff: ['automation/billing/price-diff.mjs', '--json'], // W25 repo diff
};
const RESULTS = new Map();

function childEnv() {
  const env = { ...process.env, SMC_TEST_OFFLINE: '1', NO_COLOR: '1' };
  delete env.NODE_TEST_CONTEXT; // when this script itself runs under `node --test`, nested runners must be top-level
  delete env.NODE_OPTIONS;
  return env;
}
function run(key, args) {
  return new Promise((done) => {
    const t0 = Date.now();
    let out = '';
    let child;
    try {
      child = spawn(process.execPath, args, { cwd: ROOT, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { RESULTS.set(key, { code: -1, out: String(e), ms: 0 }); return done(); }
    const timer = setTimeout(() => child.kill('SIGKILL'), SUITE_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { out += String(e); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      RESULTS.set(key, { code: signal ? -1 : code, signal, out, ms: Date.now() - t0 });
      done();
    });
  });
}
async function runAll() {
  const jobs = [
    ...SUITES.map((s) => () => (exists(s) ? run(`suite:${s}`, ['--test', '--test-reporter=tap', s]) : (RESULTS.set(`suite:${s}`, { code: null, out: '', ms: 0 }), Promise.resolve()))),
    ...Object.entries(COMMANDS).map(([k, a]) => () => (exists(a[0]) ? run(`cmd:${k}`, a) : (RESULTS.set(`cmd:${k}`, { code: null, out: '', ms: 0 }), Promise.resolve()))),
  ];
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const j = jobs[i++]; await j(); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// ---------------------------------------------------------------------------------------------------------------
// Check constructors. Each returns { name, half: 'build'|'live'|'info', state: 'pass'|'missing'|'fail', detail }.
// 'info' checks are shown but never change the line status (e.g. "external opinion commissioned (not blocking)").
// ---------------------------------------------------------------------------------------------------------------
const PASS = 'pass', MISSING = 'missing', FAIL = 'fail';
const mk = (half, name, state, detail) => ({ name, half, state, detail });

function file(half, rel, label = rel) {
  return mk(half, label, exists(rel) && statSync(p(rel)).size > 0 ? PASS : MISSING, exists(rel) ? `${rel}` : `${rel} not found`);
}
function files(half, rels, label) {
  const miss = rels.filter((r) => !exists(r));
  return mk(half, label, miss.length ? MISSING : PASS, miss.length ? `missing: ${miss.join(', ')}` : `${rels.length} files present`);
}
function grep(half, rel, re, label) {
  if (!exists(rel)) return mk(half, label, MISSING, `${rel} not found`);
  return mk(half, label, re.test(read(rel)) ? PASS : MISSING, re.test(read(rel)) ? `${rel} matches ${re}` : `${rel} lacks ${re}`);
}
// n8n workflow export built: automation/Wxx.json exists, parses, and has nodes.
function workflow(half, id) {
  const rel = `automation/${id}.json`;
  if (!exists(rel)) return mk(half, `${id} workflow built`, MISSING, `${rel} not built yet`);
  const j = readJson(rel);
  const n = Array.isArray(j.nodes) ? j.nodes.length : 0;
  return mk(half, `${id} workflow built`, n > 0 ? PASS : FAIL, n > 0 ? `${rel} (${n} nodes)` : `${rel} has no nodes`);
}
function suite(half, rel) {
  if (!SUITES.includes(rel)) throw new Error(`suite ${rel} not registered in SUITES`);
  const r = RESULTS.get(`suite:${rel}`);
  const name = `${rel.split('/').pop()} passes`;
  if (!r || r.code === null) return mk(half, name, MISSING, `${rel} not found`);
  const n = (k) => { const m = r.out.match(new RegExp(`^# ${k} (\\d+)`, 'm')); return m ? Number(m[1]) : null; };
  const pass = n('pass'), fail = n('fail');
  if (r.code === 0) return mk(half, name, PASS, `${rel}: ${pass ?? '?'} pass, 0 fail`);
  return mk(half, name, FAIL, `${rel}: exit ${r.code}${r.signal ? ` (${r.signal})` : ''}, ${fail ?? '?'} fail`);
}
function command(half, key, label) {
  const r = RESULTS.get(`cmd:${key}`);
  if (!r || r.code === null) return mk(half, label, MISSING, `${COMMANDS[key][0]} not found`);
  const last = r.out.trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  return mk(half, label, r.code === 0 ? PASS : FAIL, `${COMMANDS[key].join(' ')}: exit ${r.code}${last ? ` (${last.slice(0, 120)})` : ''}`);
}
function env(half, names, label) {
  const unset = names.filter((n) => !ENV_SET.get(n));
  return mk(half, label || `${names.join(' + ')} set`, unset.length ? MISSING : PASS, unset.length ? `env not set: ${unset.join(', ')}` : `env set: ${names.join(', ')}`);
}
function envAny(half, names, label) {
  const hit = names.find((n) => ENV_SET.get(n));
  return mk(half, label, hit ? PASS : MISSING, hit ? `env set: ${hit}` : `env not set: one of ${names.join(' / ')}`);
}
function gate(half, id) {
  const n = NODE.get(id);
  if (!n) return mk(half, id, FAIL, 'not in build/tasks.json');
  return mk(half, id, n.status === 'green' ? PASS : MISSING, `${n.status} (${n.title.slice(0, 60).trim()})`);
}
// One evidence key in build/evidence/<line>.jsonl. `ok` decides pass; `want` is printed when missing.
function ev(half, line, key, want, ok = (v) => v === true) {
  const m = merged(`${line}.jsonl`);
  const need = (() => { const x = want.match(/^(.+?): (.+)$/); return x ? `need ${x[1]} (${x[2]})` : `need ${want}`; })();
  if (!m || !(key in m)) return mk(half, key, MISSING, `${need} [evidence/${line}.jsonl]`);
  return mk(half, key, ok(m[key]) ? PASS : MISSING, ok(m[key]) ? `${JSON.stringify(m[key])} [evidence/${line}.jsonl]` : `is ${JSON.stringify(m[key])}, ${need} [evidence/${line}.jsonl]`);
}
function evFile(half, name, label, want) {
  const rows = evidence(name);
  return mk(half, label, rows && rows.length ? PASS : MISSING, rows && rows.length ? `${evidenceLabel(name)}: ${rows.length} row(s)` : `${evidenceLabel(name)} (${want})`);
}
// WhatsApp template decisions (runbook §5 log). Latest row per template name wins.
function templateLog() {
  const rows = evidence('whatsapp-templates.jsonl');
  if (!rows) return null;
  const by = new Map();
  for (const r of rows) if (r && r.name) by.set(r.name, { ...(by.get(r.name) || {}), ...r });
  return by;
}
function templatesApproved(half, names, label, needCategory = false) {
  const log = templateLog();
  if (!log) return mk(half, label, MISSING, `build/evidence/whatsapp-templates.jsonl not found (runbook §5 log: ${names.length} template(s) APPROVED)`);
  const bad = names.filter((n) => { const r = log.get(n); return !r || String(r.status).toUpperCase() !== 'APPROVED' || (needCategory && !(r.category_decided && 'cost_delta_note' in r)); });
  return mk(half, label, bad.length ? MISSING : PASS, bad.length ? `not APPROVED${needCategory ? ' with category + cost logged' : ''}: ${bad.join(', ')}` : `${names.length} APPROVED${needCategory ? ', category + cost logged' : ''}`);
}
function templatesTracked(half, names, label) {
  const log = templateLog();
  if (!log) return mk(half, label, MISSING, `build/evidence/whatsapp-templates.jsonl not found (${names.length} templates submitted and tracked)`);
  const bad = names.filter((n) => !log.get(n)?.status);
  return mk(half, label, bad.length ? MISSING : PASS, bad.length ? `${bad.length} of ${names.length} not submitted/tracked (e.g. ${bad.slice(0, 4).join(', ')})` : `${names.length} submitted and tracked`);
}
function custom(half, name, fn) {
  const r = fn();
  return mk(half, name, r[0], r[1]);
}

const SUBMIT = exists('automation/templates/submit.sh') ? read('automation/templates/submit.sh') : '';
const list = (v) => ((SUBMIT.match(new RegExp(`^${v}=\\(([\\s\\S]*?)\\)`, 'm')) || [])[1] || '').split(/\s+/).filter(Boolean);
const CORE_TEMPLATES = list('CORE');
const REST_TEMPLATES = list('REST');
const OPS_TEMPLATES = exists('automation/templates') ? readdirSync(p('automation/templates')).filter((f) => /^ops_.*\.json$/.test(f)).map((f) => f.replace(/\.json$/, '')) : [];
const CORE_WORKFLOWS = ['W01', 'W04', 'W05', 'W06', 'W09', 'W12', 'W13', 'W15'];

// ---------------------------------------------------------------------------------------------------------------
// The 28 lines. Each comment block states the exact evidence that turns the line green (docs/MASTER-PROMPT.md
// Section 7 wording and the S7 node titles in build/tasks.json).
// ---------------------------------------------------------------------------------------------------------------
const LINES = [
  // S7-01 Acquisition — "15 broker-neutral concepts approved; assets in all 3 ratios; all ads approved by Meta and paused at R0."
  // GREEN when: deliverables/creative-strategist/concepts.csv holds 15 concepts (C01–C15); the visual-producer
  // manifest has a rendered asset for every concept in 1:1, 4:5 and 9:16 and every file exists; build/evidence/S7-01.jsonl
  // has concepts_approved=true (compliance-qa + Jonathan, NH-35), ads_approved_all=true and ads_paused_r0=true
  // (W21 ads sync: every ad review status APPROVED, effective_status PAUSED, spend R0); GATE-ADS-APPROVE-3 green.
  { id: 'S7-01', amber: true, checks: () => [
    custom('build', '15 concepts in concepts.csv', () => {
      const rel = 'deliverables/creative-strategist/concepts.csv';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const ids = new Set((read(rel).match(/^"?C(0[1-9]|1[0-5])\b/gm) || []).map((s) => s.replace('"', '')));
      return [ids.size === 15 ? PASS : MISSING, `${ids.size} of 15 concepts`];
    }),
    custom('build', 'assets in all 3 ratios', () => {
      const rel = 'deliverables/visual-producer/assets/manifest.json';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const m = readJson(rel);
      const need = ['1:1', '4:5', '9:16'];
      const have = {};
      let missingFiles = 0;
      for (const f of m.files || []) {
        if (f.file && !exists(`deliverables/visual-producer/assets/${f.file}`)) missingFiles++;
        if (f.status === 'rendered') (have[f.concept] ||= new Set()).add(f.ratio);
      }
      const short = [];
      for (let i = 1; i <= 15; i++) { const c = `C${String(i).padStart(2, '0')}`; const lack = need.filter((r) => !have[c]?.has(r)); if (lack.length) short.push(`${c} ${lack.join('/')}`); }
      if (missingFiles) return [MISSING, `${missingFiles} manifest file(s) not on disk`];
      return [short.length ? MISSING : PASS, short.length ? `no rendered asset: ${short.join(', ')}` : `15 concepts x 3 ratios rendered (${(m.files || []).length} files)`];
    }),
    ev('live', 'S7-01', 'concepts_approved', 'true: compliance-qa + Jonathan sign-off of the 15 concepts (NH-35)'),
    gate('live', 'GATE-ADS-APPROVE-3'),
    ev('live', 'S7-01', 'ads_approved_all', 'true: every ad APPROVED by Meta (W21 ads sync)'),
    ev('live', 'S7-01', 'ads_paused_r0', 'true: every ad PAUSED, spend R0 (W21 ads sync)'),
  ] },

  // S7-02 Acquisition — Brand bible v1 published (/brand/): SVG logo system, favicon set verified light/dark, every
  // 4D.4b.3 placement exported, tokens.css the only colour source, trust layer live (About, How we make money, Privacy, complaints).
  // GREEN when: brand/brand-bible.md + .pdf exist; >= 8 SVG logos in brand/logo; the favicon set and favicon-check.html
  // exist; every brand/exports/manifest.json row is ok and on disk; `node brand/scripts/check-no-hex.mjs` exits 0;
  // the four trust pages exist in landing/holding; GATE-DOMAINS + GATE-DNS green; build/evidence/S7-02.jsonl has
  // brand_published=true (/brand/ reachable), favicon_verified_light_dark=true and trust_layer_live=true
  // (About, How we make money, Privacy, Complaints return 200 on sortmycover.co.za).
  { id: 'S7-02', amber: true, checks: () => [
    files('build', ['brand/brand-bible.md', 'brand/brand-bible.pdf', 'brand/tokens.css', 'brand/tokens.json'], 'brand bible v1 + tokens'),
    custom('build', 'SVG logo system (>= 8)', () => { const n = exists('brand/logo') ? readdirSync(p('brand/logo')).filter((f) => f.endsWith('.svg')).length : 0; return [n >= 8 ? PASS : MISSING, `${n} SVG logos in brand/logo`]; }),
    files('build', ['brand/favicon/favicon.svg', 'brand/favicon/favicon.ico', 'brand/favicon/apple-touch-icon.png', 'brand/favicon/manifest.webmanifest', 'brand/favicon/mask-icon.svg', 'brand/favicon/favicon-check.html'], 'favicon set + light/dark check page'),
    custom('build', 'every 4D.4b.3 placement exported', () => {
      const rel = 'brand/exports/manifest.json';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const fsRows = readJson(rel).files || [];
      const bad = fsRows.filter((f) => !f.ok || !exists(`brand/${f.file}`));
      return [fsRows.length && !bad.length ? PASS : MISSING, bad.length ? `${bad.length} export(s) not ok/on disk` : `${fsRows.length} placements exported`];
    }),
    command('build', 'hex', 'tokens.css the only colour source (check-no-hex)'),
    files('build', ['landing/holding/about.html', 'landing/holding/how-we-make-money.html', 'landing/holding/privacy.html', 'landing/holding/complaints.html'], 'trust layer pages built'),
    gate('live', 'GATE-DOMAINS'),
    gate('live', 'GATE-DNS'),
    ev('live', 'S7-02', 'brand_published', 'true: brand bible v1 reachable at /brand/'),
    ev('live', 'S7-02', 'favicon_verified_light_dark', 'true: favicon-check.html reviewed in light and dark'),
    ev('live', 'S7-02', 'trust_layer_live', 'true: About, How we make money, Privacy, Complaints return 200 on sortmycover.co.za'),
  ] },

  // S7-03 Acquisition — Contact-data quality: Lookup line-type check live on W01; email typo/MX check inside the Flow and on
  // the page; bounce → WhatsApp correction path tested with a deliberately wrong address; call-number confirm / alt number /
  // best time taps live and landing in the pre-call brief.
  // GREEN when: W01 + W05 suites pass and both workflows are built; the page has the typo check and the booking Flow has
  // the email field; reach_check + precall_brief templates exist; TWILIO_LOOKUP_ENABLED + TWILIO_ACCOUNT_SID +
  // EMAIL_PROBE_ENABLED are set; build/evidence/S7-03.jsonl has bounce_correction_tested=true (deliberately wrong address
  // → WhatsApp correction prompt) and call_number_taps_in_brief=true (confirm / alt number / best time land in the brief).
  { id: 'S7-03', amber: true, checks: () => [
    suite('build', 'automation/tests/W01.test.mjs'),
    suite('build', 'automation/tests/W05.test.mjs'),
    workflow('build', 'W01'),
    workflow('build', 'W05'),
    grep('build', 'landing/template/page.js', /typo/i, 'email typo check on the page'),
    grep('build', 'automation/flows/booking-flow.json', /"input-type":\s*"email"/, 'email field inside the Flow'),
    files('build', ['automation/templates/reach_check.json', 'automation/templates/precall_brief.json'], 'reach-check + pre-call brief templates'),
    env('live', ['TWILIO_LOOKUP_ENABLED', 'TWILIO_ACCOUNT_SID'], 'Twilio Lookup line-type check live'),
    env('live', ['EMAIL_PROBE_ENABLED'], 'email MX/disposable probe live'),
    ev('live', 'S7-03', 'bounce_correction_tested', 'true: deliberately wrong address bounced and the WhatsApp correction arrived'),
    ev('live', 'S7-03', 'call_number_taps_in_brief', 'true: confirm / alt number / best time taps landed in the pre-call brief'),
  ] },

  // S7-04 Acquisition — Decision data (6A2): facts schema populated from the synthetic cycle; metric dictionary complete;
  // seven watchlist tiles live; "Ask the data" passes the 20 owner questions; pulse carries the "what this means for the business" line.
  // GREEN when: migration smc_04 defines the facts schema and its fact_* views; knowledge/metrics.md has >= 30 M-entries,
  // each with SQL; analytics/ask-the-data-questions.json has 20 questions with SQL + expected answers; analytics/watchlist.sql
  // defines tiles 1–7; the pulse prompt and ops.pulses carry the business line; Ask.tsx/Today.tsx exist; and
  // build/evidence/S7-04.jsonl has facts_populated_synthetic=true (staging DB, synthetic cycle), ask_the_data_pass=20
  // (analytics/tests/ask-questions.test.py 20 of 20 on that DB), watchlist_tiles_live>=7 (console) and
  // pulse_business_line_seen=true (first pulse row has business_line).
  { id: 'S7-04', amber: true, checks: () => [
    custom('build', 'facts schema (smc_04)', () => {
      const rel = 'supabase/migrations/20261002040000_smc_04_facts.sql';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const s = read(rel); const views = (s.match(/CREATE OR REPLACE VIEW facts\.fact_\w+/gi) || []).length;
      return [/CREATE SCHEMA IF NOT EXISTS facts/i.test(s) && views >= 8 ? PASS : MISSING, `facts schema, ${views} fact_* views`];
    }),
    custom('build', 'metric dictionary complete', () => {
      if (!exists('knowledge/metrics.md')) return [MISSING, 'knowledge/metrics.md not found'];
      const parts = read('knowledge/metrics.md').split(/^## (?=M\d+ )/m).slice(1);
      const noSql = parts.filter((x) => !/\*\*SQL\b/.test(x)).map((x) => x.split(' ')[0]);
      return [parts.length >= 30 && !noSql.length ? PASS : MISSING, noSql.length ? `entries without SQL: ${noSql.join(', ')}` : `${parts.length} metrics, each with SQL`];
    }),
    custom('build', '20 Ask-the-data questions scripted', () => {
      const rel = 'analytics/ask-the-data-questions.json';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const q = readJson(rel).questions || [];
      const ok = q.filter((x) => x.sql && x.expected_on_synthetic).length;
      return [ok >= 20 ? PASS : MISSING, `${ok} of 20 questions with SQL + expected answer`];
    }),
    custom('build', 'seven watchlist tiles defined', () => {
      if (!exists('analytics/watchlist.sql')) return [MISSING, 'analytics/watchlist.sql not found'];
      const s = read('analytics/watchlist.sql');
      const lack = [1, 2, 3, 4, 5, 6, 7].filter((n) => !new RegExp(`view facts\\.v_watchlist_${n}_`, 'i').test(s));
      return [lack.length ? MISSING : PASS, lack.length ? `tiles not defined: ${lack.join(', ')}` : 'tiles 1–7 (+ tile 0) defined'];
    }),
    grep('build', 'optimisation/prompts/pulse.md', /What this means for the business/, 'pulse business line (prompt)'),
    grep('build', 'supabase/migrations/20261002030000_smc_03_ops_reporting.sql', /business_line\s+text/, 'pulse business line (ops.pulses column)'),
    files('build', ['src/pages/smc/Ask.tsx', 'src/pages/smc/Today.tsx'], 'console Ask + Today screens'),
    ev('live', 'S7-04', 'facts_populated_synthetic', 'true: facts views return the synthetic cycle on the staging DB'),
    ev('live', 'S7-04', 'ask_the_data_pass', '20: ask-questions.test.py 20 of 20 on that DB', (v) => Number(v) >= 20),
    ev('live', 'S7-04', 'watchlist_tiles_live', '>= 7 tiles showing real values in the console', (v) => Number(v) >= 7),
    ev('live', 'S7-04', 'pulse_business_line_seen', 'true: first ops.pulses row carries business_line'),
  ] },

  // S7-05 Acquisition — World-class bar (6B): eval gate in CI with golden set; W35 lead pulse; usability test done; WCAG AA
  // pass; bot protection on /lead and /book; DKIM + DMARC live; W34 DSR + breach runbook; /brand/tokens.json consumed by every
  // surface; single FAQ corpus; rehearsal done; drills scheduled; CPL-vs-model tile pinned for 14 days.
  // GREEN when: `node evals/run.mjs --dry-run` exits 0 with a golden set >= 200; the Makefile `check` target (NH-06 default) or a CI workflow
  // runs evals/run.mjs; W35 suite passes, W35 workflow + lead_pulse template exist; a11y tests exist; W01 + W05 (where Turnstile,
  // honeypot and rate limits live) are built and the page loads Turnstile; W34 suite passes, W34 workflow + breach runbook
  // (compliance register Part 3) exist; tokens.json consumed by landing, portal, console portal css and report email;
  // knowledge/faq.md + the landing FAQ config exist; watchlist tile 0 (CPL vs model) exists; TURNSTILE_SECRET_KEY set;
  // GATE-USABILITY green; build/evidence/S7-05.jsonl has usability_test_done, wcag_aa_pass, dkim_dmarc_live,
  // rehearsal_done, drills_scheduled and cpl_tile_pinned all true.
  { id: 'S7-05', amber: true, checks: () => [
    command('build', 'evals', 'eval gate dry run passes'),
    custom('build', 'golden set >= 200', () => { const n = exists('evals/golden-set.json') ? (readJson('evals/golden-set.json').cases || []).length : 0; return [n >= 200 ? PASS : MISSING, `${n} golden cases`]; }),
    custom('build', 'eval gate wired in the unattended check', () => {
      // NH-06 default: unattended runs are a Makefile on the n8n host, not GitHub Actions. Either satisfies the line.
      const d = '.github/workflows';
      const ci = exists(d) && readdirSync(p(d)).some((f) => /\.ya?ml$/.test(f) && /evals\/run\.mjs/.test(read(`${d}/${f}`)));
      const mk = exists('Makefile') && /evals\/run\.mjs/.test(read('Makefile')) && /^check:/m.test(read('Makefile'));
      const hit = ci || mk;
      return [hit ? PASS : MISSING, hit ? (mk ? 'make check runs evals/run.mjs (NH-06 Makefile default)' : 'CI job runs evals/run.mjs') : 'neither Makefile `check` nor a .github/workflows job runs evals/run.mjs (NH-06)'];
    }),
    custom('build', '/book + /lead guard (Turnstile + rate limit)', () => {
      const w05 = exists('automation/W05.json') ? read('automation/W05.json') : '';
      const w01 = exists('automation/W01.json') ? read('automation/W01.json') : '';
      const ok = /turnstile/i.test(w05) && /turnstile/i.test(w01);
      return [ok ? PASS : MISSING, ok ? 'Turnstile referenced in W01 and W05' : 'W05 /book has no Turnstile/rate-limit guard yet (I-45h, R6-08)'];
    }),
    suite('build', 'automation/tests/W35.test.mjs'),
    workflow('build', 'W35'),
    file('build', 'automation/templates/lead_pulse.json', 'lead_pulse template'),
    files('build', ['landing/tests/a11y.md', 'landing/tests/contrast.py'], 'WCAG AA checks in the build'),
    workflow('build', 'W01'),
    workflow('build', 'W05'),
    grep('build', 'landing/template/page.js', /turnstile/i, 'bot challenge on the page'),
    suite('build', 'automation/tests/W34.test.mjs'),
    workflow('build', 'W34'),
    grep('build', 'deliverables/contracts-drafter/compliance-register.md', /Breach runbook/i, 'breach runbook (POPIA s22)'),
    custom('build', '/brand/tokens.json consumed by every surface', () => {
      const surfaces = ['landing/build.mjs', 'landing/template/page.css', 'portal/intro-media/step.css', 'src/pages/portal/portal.css', 'landing/holding/styles.css', 'scripts/build-broker-report-email.mjs', 'brand/templates/_base.css'];
      const lack = surfaces.filter((s) => !exists(s) || !/tokens\.(json|css)/.test(read(s)));
      return [exists('brand/tokens.json') && !lack.length ? PASS : MISSING, lack.length ? `not reading tokens: ${lack.join(', ')}` : `${surfaces.length} surfaces read tokens`];
    }),
    files('build', ['knowledge/faq.md', 'landing/config/faq.json'], 'single FAQ corpus'),
    grep('build', 'analytics/watchlist.sql', /v_watchlist_0_cpl_vs_model/, 'CPL-vs-model tile defined'),
    env('live', ['TURNSTILE_SECRET_KEY'], 'bot protection key set'),
    gate('live', 'GATE-USABILITY'),
    ev('live', 'S7-05', 'usability_test_done', 'true: five-person test run, every stall became a task (6B.3)'),
    ev('live', 'S7-05', 'wcag_aa_pass', 'true: axe AA pass on page, portal, console'),
    ev('live', 'S7-05', 'dkim_dmarc_live', 'true: DKIM signing on + DMARC record verified via dns.google'),
    ev('live', 'S7-05', 'rehearsal_done', 'true: 6B.10 day-in-the-life rehearsal on production URLs'),
    ev('live', 'S7-05', 'drills_scheduled', 'true: quarterly drills on the calendar'),
    ev('live', 'S7-05', 'cpl_tile_pinned', 'true: CPL-vs-model pinned first for 14 days'),
  ] },

  // S7-06 Acquisition — Intro video module (4.10b): step explainer clip + example video live; interview → 3 scripts → FAIS gate
  // → record (iOS/Android tested) → AI check → W23 pipeline (captions, lower-third, ≤ 16 MB, OGG) → approve → stored;
  // WhatsApp-capture path tested; 24/72-h nudges wired.
  // GREEN when: portal/intro-media interview/scripts/record/approve pages exist; the eval dry run (script gate fixtures)
  // passes; automation/media check.js + pipeline.sh (≤ 16 MB MP4, OGG/Opus) exist and media + w23-auth suites pass; W23 is
  // built; the W20 suite passes and the 24 h/72 h nudge templates exist; VITE_SMC_EXPLAINER_URL set; build/evidence/S7-06.jsonl
  // has explainer_clip_live, example_video_live, record_tested_ios, record_tested_android, whatsapp_capture_tested and
  // nudges_wired all true.
  { id: 'S7-06', amber: true, checks: () => [
    files('build', ['portal/intro-media/interview.html', 'portal/intro-media/scripts.html', 'portal/intro-media/record.html', 'portal/intro-media/approve.html'], 'interview → scripts → record → approve pages'),
    command('build', 'evals', 'script FAIS gate (eval dry run)'),
    files('build', ['automation/media/check.js', 'automation/media/captions.js', 'automation/media/pipeline.sh'], 'AI check + captions + W23 pipeline'),
    grep('build', 'automation/media/pipeline.sh', /16 MB[\s\S]*OGG/i, 'pipeline ≤ 16 MB + OGG'),
    suite('build', 'automation/media/media.test.js'),
    suite('build', 'automation/media/w23-auth.test.js'),
    workflow('build', 'W23'),
    suite('build', 'automation/tests/W20.test.mjs'),
    files('build', ['automation/templates/intro_media.json', 'automation/templates/intro_media_voice.json', 'automation/templates/broker_onb_nudge_24h.json', 'automation/templates/broker_onb_nudge_72h.json'], 'intro media + 24/72-h nudge templates'),
    env('live', ['VITE_SMC_EXPLAINER_URL'], 'explainer clip URL configured'),
    ev('live', 'S7-06', 'explainer_clip_live', 'true: step explainer clip plays in the portal'),
    ev('live', 'S7-06', 'example_video_live', 'true: example intro video live'),
    ev('live', 'S7-06', 'record_tested_ios', 'true: record step tested on iOS'),
    ev('live', 'S7-06', 'record_tested_android', 'true: record step tested on Android'),
    ev('live', 'S7-06', 'whatsapp_capture_tested', 'true: WhatsApp-capture path tested end to end'),
    ev('live', 'S7-06', 'nudges_wired', 'true: 24/72-h nudges fire from W20 on staging'),
  ] },

  // S7-07 Acquisition — Broker weekly report (4.10a): W14 generates from synthetic cycle data; WhatsApp 6-liner, portal
  // Reports tab and email/PDF all show the same numbers; one-ask button works; judge rubric passes.
  // GREEN when: W14 is built and its suite passes; the report-email suite passes; Reports.tsx, broker_weekly(+_noask)
  // templates, the report rubric and the synthetic proofs (PDF) exist; build/evidence/S7-07.jsonl has
  // w14_generated_staging=true (W14 run on the staging DB synthetic cycle), surfaces_match=true (6-liner = Reports tab =
  // email/PDF), one_ask_works=true and judge_rubric_pass=true (W33 grade on the generated report).
  { id: 'S7-07', amber: true, checks: () => [
    workflow('build', 'W14'),
    suite('build', 'automation/tests/W14.test.mjs'),
    suite('build', 'scripts/build-broker-report-email.test.mjs'),
    files('build', ['src/pages/portal/Reports.tsx', 'automation/templates/broker_weekly.json', 'automation/templates/broker_weekly_noask.json', 'optimisation/rubrics/report.md'], 'Reports tab + 6-liner templates + rubric'),
    file('build', 'deliverables/analytics-reporter/proofs/SortMyCover-week-2-Oct-2026.pdf', 'synthetic email/PDF proof'),
    ev('live', 'S7-07', 'w14_generated_staging', 'true: W14 generated from the synthetic cycle on staging'),
    ev('live', 'S7-07', 'surfaces_match', 'true: WhatsApp 6-liner, Reports tab and email/PDF show the same numbers'),
    ev('live', 'S7-07', 'one_ask_works', 'true: one-ask button tested'),
    ev('live', 'S7-07', 'judge_rubric_pass', 'true: W33 report rubric pass'),
  ] },

  // S7-08 Acquisition — Pulse screen + notifications (6.8b): Today screen live, 11 faculty tiles with control limits, Approve
  // creates a task, ops_* templates approved, DND + dedupe + escalation tested with synthetic alerts.
  // GREEN when: Today.tsx exists; ops.proposals has the 11 faculties; W22 + W32 are built and their suites pass (DND,
  // dedupe, escalation, approve); the ops_* templates exist and the template check passes; every ops_* template is APPROVED
  // in build/evidence/whatsapp-templates.jsonl; build/evidence/S7-08.jsonl has today_screen_live, synthetic_alerts_tested
  // and approve_creates_task all true (on staging).
  { id: 'S7-08', amber: true, checks: () => [
    file('build', 'src/pages/smc/Today.tsx', 'Today screen built'),
    custom('build', '11 faculty tiles', () => {
      const rel = 'supabase/migrations/20261002030000_smc_03_ops_reporting.sql';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const m = read(rel).match(/faculty\s+text NOT NULL CHECK \(faculty IN \(([^)]*)\)/);
      const n = m ? m[1].split(',').length : 0;
      return [n === 11 ? PASS : MISSING, `${n} faculties in ops.proposals`];
    }),
    workflow('build', 'W22'),
    workflow('build', 'W32'),
    suite('build', 'automation/tests/W22.test.mjs'),
    suite('build', 'automation/tests/W32.test.mjs'),
    custom('build', 'ops_* templates drafted', () => [OPS_TEMPLATES.length >= 7 ? PASS : MISSING, `${OPS_TEMPLATES.length} ops_* templates`]),
    command('build', 'templates', 'template check passes'),
    templatesApproved('live', OPS_TEMPLATES, 'ops_* templates approved'),
    ev('live', 'S7-08', 'today_screen_live', 'true: Today screen live on the console with the 11 tiles and control limits'),
    ev('live', 'S7-08', 'synthetic_alerts_tested', 'true: DND + dedupe + escalation tested on staging with synthetic alerts'),
    ev('live', 'S7-08', 'approve_creates_task', 'true: Approve on a proposal created a task'),
  ] },

  // S7-09 Acquisition — Optimisation loop: W32 daily pulse + W33 judge scheduled; SLOs and control limits seeded from
  // synthetic data; first pulse and first weekly memo generated; Approve button creates a task; daily + weekly caps set.
  // GREEN when: W32 + W33 built; W32, spc and workflows suites pass; optimisation/slos.json, control-limits.md and the
  // synthetic first pulse/memo exist; daily + weekly caps are in w32-plan.js; build/evidence/S7-09.jsonl has
  // w32_w33_scheduled, slos_seeded_db, first_pulse_generated, first_weekly_memo_generated and approve_creates_task all true.
  { id: 'S7-09', amber: true, checks: () => [
    workflow('build', 'W32'),
    workflow('build', 'W33'),
    suite('build', 'automation/tests/W32.test.mjs'),
    suite('build', 'optimisation/spc.test.js'),
    suite('build', 'optimisation/workflows.test.js'),
    files('build', ['optimisation/slos.json', 'optimisation/control-limits.md', 'optimisation/SYNTHETIC-FIRST-PULSE.md'], 'SLOs + control limits + synthetic first pulse/memo'),
    grep('build', 'optimisation/n8n-code/w32-plan.js', /caps:\s*\{\s*daily:[^}]*weekly:/, 'daily + weekly caps'),
    ev('live', 'S7-09', 'w32_w33_scheduled', 'true: W32 06:30 pulse and W33 judge active on the schedule'),
    ev('live', 'S7-09', 'slos_seeded_db', 'true: SLOs + seed control limits in the DB'),
    ev('live', 'S7-09', 'first_pulse_generated', 'true: first ops.pulses row by W32'),
    ev('live', 'S7-09', 'first_weekly_memo_generated', 'true: first weekly memo by W32'),
    ev('live', 'S7-09', 'approve_creates_task', 'true: Approve created a task'),
  ] },

  // S7-10 Acquisition — Comments & DMs: W30/W31 live on the Page and IG; hide-word list approved; first 50 replies reviewed;
  // public-reply SLA dashboard green on synthetic comments.
  // GREEN when: W30 + W31 built; hide-words.txt, rules.json, reply corpus and MEASUREMENT.md exist; GATE-HIDE-WORDS green;
  // PAGE_ID + IG_USER_ID set; build/evidence/S7-10.jsonl has w30_w31_live_page_ig, first_50_replies_reviewed and
  // reply_sla_dashboard_green all true.
  { id: 'S7-10', amber: true, checks: () => [
    workflow('build', 'W30'),
    workflow('build', 'W31'),
    files('build', ['community/hide-words.txt', 'community/rules.json', 'community/reply-corpus.md', 'community/MEASUREMENT.md'], 'hide words + rules + reply corpus + SLA measurement'),
    gate('live', 'GATE-HIDE-WORDS'),
    env('live', ['PAGE_ID', 'IG_USER_ID'], 'Page + IG ids set'),
    ev('live', 'S7-10', 'w30_w31_live_page_ig', 'true: W30/W31 subscribed and replying on the Page and IG'),
    ev('live', 'S7-10', 'first_50_replies_reviewed', 'true: first 50 live replies reviewed'),
    ev('live', 'S7-10', 'reply_sla_dashboard_green', 'true: public-reply SLA dashboard green on synthetic comments'),
  ] },

  // S7-11 Acquisition — Pixel/CAPI: domain verified, event priority set, EMQ ≥ 6 on test events, exclusions + engagement
  // audiences created (4.4a Phase 1). Purely external: red until green.
  // GREEN when: PIXEL_ID (or META_PIXEL_ID) is set; GATE-PIXEL green; the CAPI test-events log exists ($CAPI_EVIDENCE_PATH when set,
  // else build/evidence/capi-test-events.jsonl; Events Manager test-event checks); build/evidence/S7-11.jsonl has domain_verified=true, event_priority_set=true, emq>=6,
  // exclusion_audiences_created=true and engagement_audiences_created=true. (capi suite + pixel.js are shown as prep.)
  { id: 'S7-11', amber: false, checks: () => [
    suite('build', 'automation/capi/capi.test.js'),
    file('build', 'landing/shared/pixel.js', 'pixel.js'),
    envAny('live', ['PIXEL_ID', 'META_PIXEL_ID'], 'Pixel id set'),
    gate('live', 'GATE-PIXEL'),
    evFile('live', 'capi-test-events.jsonl', 'CAPI test-events log', 'Events Manager test-event checks'),
    ev('live', 'S7-11', 'domain_verified', 'true: sortmycover.co.za verified in Business Manager'),
    ev('live', 'S7-11', 'event_priority_set', 'true: event priority configured'),
    ev('live', 'S7-11', 'emq', '>= 6 on test events', (v) => Number(v) >= 6),
    ev('live', 'S7-11', 'exclusion_audiences_created', 'true'),
    ev('live', 'S7-11', 'engagement_audiences_created', 'true'),
  ] },

  // S7-12 Acquisition — SortMyCover Facebook Page + Instagram live, linked, disclosure in About, 7-day warm-up done; Business
  // Portfolio verified (or verification submitted); all Meta IDs stored in the brands row and visible in the CRM (W27 health green).
  // GREEN when: GATE-META-PAGE-IG green; PAGE_ID, IG_USER_ID, META_BUSINESS_ID set; GATE-META-PORTFOLIO green or
  // S7-12.jsonl portfolio_verification in {verified, submitted}; S7-12.jsonl has page_ig_linked, about_disclosure,
  // brands_row_meta_ids and w27_health_green true and warmup_days >= 7. (W27 + profile/cover exports shown as prep.)
  { id: 'S7-12', amber: false, checks: () => [
    workflow('build', 'W27'),
    file('build', 'brand/exports/manifest.json', 'profile + cover exports'),
    gate('live', 'GATE-META-PAGE-IG'),
    env('live', ['PAGE_ID', 'IG_USER_ID', 'META_BUSINESS_ID'], 'Meta ids set'),
    ev('live', 'S7-12', 'page_ig_linked', 'true: Page and IG live and linked'),
    ev('live', 'S7-12', 'about_disclosure', 'true: disclosure in About'),
    ev('live', 'S7-12', 'warmup_days', '>= 7', (v) => Number(v) >= 7),
    NODE.get('GATE-META-PORTFOLIO')?.status === 'green' ? gate('live', 'GATE-META-PORTFOLIO')
      : ev('live', 'S7-12', 'portfolio_verification', '"verified" or "submitted" (or GATE-META-PORTFOLIO green)', (v) => ['verified', 'submitted'].includes(v)),
    ev('live', 'S7-12', 'brands_row_meta_ids', 'true: all Meta ids in the brands row, visible in the CRM'),
    ev('live', 'S7-12', 'w27_health_green', 'true: W27 asset health green'),
  ] },

  // S7-13 Acquisition — Campaigns A (instant form, Higher Intent + Rich Creative variant), B (landing page), C (CTWA) created
  // exactly per campaign-spec.md; Special Ad Category decision recorded. Purely external: red until green.
  // GREEN when: AD_ACCOUNT_ID set; GATE-AD-ACCOUNT + GATE-CAMPAIGN-PUBLISH green; S7-13.jsonl has campaign_a_created,
  // campaign_a2_rich_creative_created, campaign_b_created, campaign_c_created, spec_diff_clean (W21 read-back equals
  // campaign-spec.md) all true and special_ad_category_decision a non-empty string (what Meta showed, section 10).
  { id: 'S7-13', amber: false, checks: () => [
    grep('build', 'deliverables/media-buyer/campaign-spec.md', /## 4\. Campaign A[\s\S]*## 5\. Campaign B[\s\S]*## 6\. Test C[\s\S]*## 10\. Special Ad Category/, 'campaign-spec A/B/C + section 10'),
    file('build', 'deliverables/media-buyer/instant-form-spec.json', 'instant form spec'),
    suite('build', 'automation/ads/meta-ads.test.js'),
    env('live', ['AD_ACCOUNT_ID'], 'ad account id set'),
    gate('live', 'GATE-AD-ACCOUNT'),
    gate('live', 'GATE-CAMPAIGN-PUBLISH'),
    ev('live', 'S7-13', 'campaign_a_created', 'true: A (instant form, Higher Intent)'),
    ev('live', 'S7-13', 'campaign_a2_rich_creative_created', 'true: A2 Rich Creative variant'),
    ev('live', 'S7-13', 'campaign_b_created', 'true: B (landing page)'),
    ev('live', 'S7-13', 'campaign_c_created', 'true: C (CTWA)'),
    ev('live', 'S7-13', 'spec_diff_clean', 'true: W21 read-back equals campaign-spec.md'),
    ev('live', 'S7-13', 'special_ad_category_decision', 'non-empty: what Meta showed (spec section 10)', (v) => typeof v === 'string' && v.trim().length > 0),
  ] },

  // S7-14 Acquisition — Pixel + CAPI verified in Events Manager (test events received, event_id dedupe working); Lead Ads
  // webhook subscribed and tested. Purely external: red until green.
  // GREEN when: PIXEL_ID (or META_PIXEL_ID) and a CAPI token (META_SYSTEM_USER_TOKEN or META_CAPI_TOKEN) are set; the CAPI
  // test-events log exists ($CAPI_EVIDENCE_PATH when set, else build/evidence/capi-test-events.jsonl); S7-14.jsonl has event_id_dedupe_verified, lead_ads_webhook_subscribed, lead_ads_webhook_tested true.
  { id: 'S7-14', amber: false, checks: () => [
    suite('build', 'automation/capi/capi.test.js'),
    workflow('build', 'W02'),
    envAny('live', ['PIXEL_ID', 'META_PIXEL_ID'], 'Pixel id set'),
    envAny('live', ['META_CAPI_TOKEN', 'META_SYSTEM_USER_TOKEN'], 'CAPI token set'),
    evFile('live', 'capi-test-events.jsonl', 'test events received', 'Events Manager test-event checks'),
    ev('live', 'S7-14', 'event_id_dedupe_verified', 'true: browser + server events deduplicated by event_id'),
    ev('live', 'S7-14', 'lead_ads_webhook_subscribed', 'true'),
    ev('live', 'S7-14', 'lead_ads_webhook_tested', 'true: test lead from the Lead Ads testing tool reached W02'),
  ] },

  // S7-15 Acquisition — Landing pages live on Hostinger (go.leadvelocity.co.za), Lighthouse ≥ 90 mobile, LCP < 2.5 s,
  // consent checkbox unticked by default, privacy + terms pages live.
  // (Host: 0.1 makes sortmycover.co.za the consumer domain; go.leadvelocity.co.za is the LV fallback, NH-48. Either counts.)
  // GREEN when: every local Lighthouse report in landing/reports is mobile, performance >= 0.90, LCP < 2500 ms; the consent
  // checkbox in landing/template/index.html carries no `checked`; privacy.html and a terms page exist in landing/holding;
  // GATE-DNS green; S7-15.jsonl has landing_live=true, lighthouse_live_mobile>=90, lcp_live_ms<2500 and
  // privacy_terms_live=true (measured on the production host).
  { id: 'S7-15', amber: true, checks: () => [
    custom('build', 'Lighthouse ≥ 90 mobile, LCP < 2.5 s (local)', () => {
      const d = 'landing/reports';
      const reps = exists(d) ? readdirSync(p(d)).filter((f) => f.endsWith('.report.json')) : [];
      if (!reps.length) return [MISSING, 'no landing/reports/*.report.json (run landing/lighthouse.sh)'];
      const bad = [];
      for (const f of reps) {
        const r = readJson(`${d}/${f}`);
        const perf = r.categories?.performance?.score ?? 0, lcp = r.audits?.['largest-contentful-paint']?.numericValue ?? Infinity;
        if (r.configSettings?.formFactor !== 'mobile' || perf < 0.9 || lcp >= 2500) bad.push(`${f} perf ${perf} lcp ${Math.round(lcp)}`);
      }
      return [bad.length ? MISSING : PASS, bad.length ? bad.join('; ') : `${reps.length} pages, mobile perf ≥ 0.90, LCP < 2.5 s (local preview)`];
    }),
    custom('build', 'consent checkbox unticked by default', () => {
      const rel = 'landing/template/index.html';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const tag = (read(rel).match(/<input[^>]*id="consent"[^>]*>/) || [])[0];
      if (!tag) return [MISSING, 'consent checkbox not found'];
      return /\bchecked\b/.test(tag) ? [FAIL, 'consent checkbox is pre-ticked'] : [PASS, 'consent checkbox has no checked attribute'];
    }),
    file('build', 'landing/holding/privacy.html', 'privacy page'),
    custom('build', 'terms page', () => {
      const cands = ['landing/holding/terms.html', 'landing/holding/terms-of-use.html', 'landing/holding/terms/index.html'];
      const hit = cands.find(exists);
      return [hit ? PASS : MISSING, hit || `no terms page (looked for ${cands.join(', ')})`];
    }),
    gate('live', 'GATE-DNS'),
    ev('live', 'S7-15', 'landing_live', 'true: pages served on the production host (sortmycover.co.za or go.leadvelocity.co.za)'),
    ev('live', 'S7-15', 'lighthouse_live_mobile', '>= 90 on the live URL', (v) => Number(v) >= 90),
    ev('live', 'S7-15', 'lcp_live_ms', '< 2500 on the live URL', (v) => Number(v) > 0 && Number(v) < 2500),
    ev('live', 'S7-15', 'privacy_terms_live', 'true: privacy + terms pages return 200 live'),
  ] },

  // S7-16 Conversation & booking — WhatsApp Business number live on Cloud API; Business Verification complete; the 7 core
  // templates approved (any category — category cost logged); the rest submitted and tracked; standby number registered on
  // the same WABA; quality-rating alert in W22; display name approved. Purely external: red until green.
  // GREEN when: WABA_ID, PHONE_NUMBER_ID, STANDBY_PHONE_NUMBER_ID set; GATE-WABA + GATE-META-PORTFOLIO green; the template
  // approval file build/evidence/whatsapp-templates.jsonl exists with the 7 CORE templates of submit.sh APPROVED with
  // category_decided + cost_delta_note logged and every REST template carrying a status; W22 has the quality-rating alert;
  // S7-16.jsonl has business_verification_complete, display_name_approved and standby_same_waba true.
  { id: 'S7-16', amber: false, checks: () => [
    command('build', 'templates', 'template check passes'),
    custom('build', '7 core templates listed', () => [CORE_TEMPLATES.length === 7 ? PASS : MISSING, `submit.sh CORE: ${CORE_TEMPLATES.join(', ') || 'none'}`]),
    grep('build', 'automation/W22.json', /quality_rating/, 'quality-rating alert in W22'),
    env('live', ['WABA_ID', 'PHONE_NUMBER_ID', 'STANDBY_PHONE_NUMBER_ID'], 'WABA + number + standby ids set'),
    gate('live', 'GATE-WABA'),
    gate('live', 'GATE-META-PORTFOLIO'),
    evFile('live', 'whatsapp-templates.jsonl', 'template approval file', 'runbook §5 log, one row per template decision'),
    templatesApproved('live', CORE_TEMPLATES, '7 core templates approved, category cost logged', true),
    templatesTracked('live', REST_TEMPLATES, 'the rest submitted and tracked'),
    ev('live', 'S7-16', 'business_verification_complete', 'true'),
    ev('live', 'S7-16', 'display_name_approved', 'true'),
    ev('live', 'S7-16', 'standby_same_waba', 'true: standby number registered on the same WABA'),
  ] },

  // S7-17 Conversation & booking — LLM agent passed the 50-prompt adversarial red-team with zero advice leaks; guardrail gate
  // on; human-handoff tested to Jonathan's and KG's numbers.
  // GREEN when: the eval dry run exits 0 (FAIS rate 1, every red-team unsafe draft blocked: fais.redteam_output_gate
  // pass = total) with >= 50 red-team cases; evals/results/latest-live.json exists with rates.fais = 1 and no blockers
  // (live guardrail classifier run); evals/red-team.json signoff is no longer PENDING (compliance-qa, 4.11);
  // S7-17.jsonl has guardrail_gate_on, handoff_tested_jonathan and handoff_tested_kg true.
  { id: 'S7-17', amber: true, checks: () => [
    command('build', 'evals', 'eval gate dry run passes'),
    custom('build', 'red-team zero leaks (dry run)', () => {
      const n = exists('evals/red-team.json') ? (readJson('evals/red-team.json').cases || []).length : 0;
      const rel = 'evals/results/latest-dry.json';
      if (!exists(rel)) return [MISSING, `${rel} not written`];
      const r = readJson(rel); const g = r.metric?.['fais.redteam_output_gate'];
      if (n < 50) return [MISSING, `${n} red-team cases (< 50)`];
      if (!g || r.rates?.fais !== 1 || g.pass !== g.total) return [FAIL, `FAIS ${r.rates?.fais}, red-team gate ${g ? `${g.pass}/${g.total}` : 'n/a'}`];
      return [PASS, `${n} red-team cases; output gate blocked ${g.pass}/${g.total}; FAIS rate 1`];
    }),
    files('build', ['conversation/guardrail.mjs', 'conversation/prompts/guardrail.md', 'conversation/handoff.md'], 'guardrail + handoff built'),
    custom('live', 'live red-team run (guardrail classifier)', () => {
      const rel = 'evals/results/latest-live.json';
      if (!exists(rel)) return [MISSING, `${rel} (needs ANTHROPIC_API_KEY: node evals/run.mjs)`];
      const r = readJson(rel);
      return r.rates?.fais === 1 && !(r.blockers || []).length ? [PASS, `${rel}: FAIS 1, no blockers`] : [FAIL, `${rel}: FAIS ${r.rates?.fais}, ${(r.blockers || []).length} blocker(s)`];
    }),
    custom('live', 'compliance-qa red-team sign-off', () => {
      const s = exists('evals/red-team.json') ? String(readJson('evals/red-team.json').signoff || '') : '';
      const ok = /^(PASS|SIGNED)\b/i.test(s) && /compliance-qa/i.test(s); // R6-06: explicit PASS/SIGNED by compliance-qa, not merely non-PENDING
      return [ok ? PASS : MISSING, s ? `signoff: ${s.slice(0, 60)}` : 'no signoff field'];
    }),
    ev('live', 'S7-17', 'guardrail_gate_on', 'true: guardrail gate enabled in production W07'),
    ev('live', 'S7-17', 'handoff_tested_jonathan', "true: human handoff reached Jonathan's number"),
    ev('live', 'S7-17', 'handoff_tested_kg', "true: human handoff reached KG's number"),
  ] },

  // S7-18 Conversation & booking — GET /slots returns Mark's real Outlook availability via Graph getSchedule; POST /book
  // creates the Outlook event (Teams link when method = Teams) and stores the Graph event.id on the booking; .ics works on iOS and Android.
  // GREEN when: W04 + W05 suites pass and both workflows are built; the page builds an .ics (BEGIN:VCALENDAR); GATE-ENTRA
  // green; MS_TENANT_ID + MS_GRAPH_CLIENT_ID set; S7-18.jsonl has slots_real_outlook, book_creates_outlook_event,
  // graph_event_id_stored, teams_link_on_teams, ics_ios and ics_android all true.
  { id: 'S7-18', amber: true, checks: () => [
    suite('build', 'automation/tests/W04.test.mjs'),
    suite('build', 'automation/tests/W05.test.mjs'),
    workflow('build', 'W04'),
    workflow('build', 'W05'),
    grep('build', 'landing/template/page.js', /BEGIN:VCALENDAR/, '.ics generator'),
    gate('live', 'GATE-ENTRA'),
    env('live', ['MS_TENANT_ID', 'MS_GRAPH_CLIENT_ID'], 'Graph app configured'),
    ev('live', 'S7-18', 'slots_real_outlook', "true: GET /slots returned Mark's real Outlook free/busy (getSchedule)"),
    ev('live', 'S7-18', 'book_creates_outlook_event', 'true'),
    ev('live', 'S7-18', 'graph_event_id_stored', 'true: bookings row holds the Graph event.id'),
    ev('live', 'S7-18', 'teams_link_on_teams', 'true: Teams link present when method = Teams'),
    ev('live', 'S7-18', 'ics_ios', 'true: .ics opens on iOS'),
    ev('live', 'S7-18', 'ics_android', 'true: .ics opens on Android'),
  ] },

  // S7-19 Conversation & booking — Full synthetic run (10 leads) passed on production URLs: intake → intro card → booking →
  // reminders (time-shifted) → outcome → no-show → replacement counter → STOP.
  // GREEN when: the fixture has 10 synthetic leads; the 8 core-path suites + generators pass; the 8 core workflows are
  // built (W01, W04, W05, W06, W09, W12, W13, W15); S7-19.jsonl has synthetic_run_production=true with
  // synthetic_run_leads=10 and every stage in synthetic_run_stages true
  // (intake, intro_card, booking, reminders, outcome, no_show, replacement_counter, stop).
  { id: 'S7-19', amber: true, checks: () => [
    custom('build', '10 synthetic leads fixture', () => {
      const rel = 'automation/tests/fixtures/synthetic-leads.json';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const j = readJson(rel); const n = (j.leads || []).length;
      return [n === 10 ? PASS : MISSING, `${n} synthetic leads`];
    }),
    ...['W01', 'W04', 'W05', 'W06', 'W09', 'W12', 'W13', 'W15'].map((w) => suite('build', `automation/tests/${w}.test.mjs`)),
    suite('build', 'automation/tests/generators.test.mjs'),
    custom('build', 'core workflows built', () => {
      const lack = CORE_WORKFLOWS.filter((w) => !exists(`automation/${w}.json`));
      return [lack.length ? MISSING : PASS, lack.length ? `not built: ${lack.join(', ')} (waiting on GATE-TEST-*)` : 'all 8 core workflows built'];
    }),
    ev('live', 'S7-19', 'synthetic_run_production', 'true: 10-lead run passed on production URLs'),
    ev('live', 'S7-19', 'synthetic_run_leads', '10', (v) => Number(v) === 10),
    ev('live', 'S7-19', 'synthetic_run_stages', 'all of intake, intro_card, booking, reminders, outcome, no_show, replacement_counter, stop true',
      (v) => v && ['intake', 'intro_card', 'booking', 'reminders', 'outcome', 'no_show', 'replacement_counter', 'stop'].every((k) => v[k] === true)),
  ] },

  // S7-20 Broker — Mark's row complete: FSP verified on FSCA register, calendar connected, methods/hours/capacity set, intro
  // card approved, voice/video approved, consent_mode set. Purely external: red until green.
  // GREEN when: S7-20.jsonl (written by W20 from the brokers row) has fsp_verified, calendar_connected,
  // methods_hours_capacity_set, intro_card_approved, voice_video_approved true and consent_mode in {named, generic}
  // ("named" while one broker, 0.1; "generic" only with GATE-OPINION green). (W20 suite + workflow shown as prep.)
  { id: 'S7-20', amber: false, checks: () => [
    suite('build', 'automation/tests/W20.test.mjs'),
    workflow('build', 'W20'),
    ev('live', 'S7-20', 'fsp_verified', 'true: FSP verified on the FSCA register'),
    ev('live', 'S7-20', 'calendar_connected', 'true'),
    ev('live', 'S7-20', 'methods_hours_capacity_set', 'true'),
    ev('live', 'S7-20', 'intro_card_approved', 'true'),
    ev('live', 'S7-20', 'voice_video_approved', 'true'),
    ev('live', 'S7-20', 'consent_mode', '"named" (0.1), or "generic" with GATE-OPINION green',
      (v) => v === 'named' || (v === 'generic' && NODE.get('GATE-OPINION')?.status === 'green')),
  ] },

  // S7-21 Broker — Agreement e-signed; authorisation letter signed; tier selected; Paystack plan or EFT reference issued.
  // Purely external: red until green.
  // GREEN when: GATE-AGREEMENT green; S7-21.jsonl has agreement_esigned, authorisation_letter_signed true, tier_selected in
  // {bronze, silver, gold} and payment_reference_issued true (Paystack plan or EFT reference).
  { id: 'S7-21', amber: false, checks: () => [
    files('build', ['deliverables/contracts-drafter/broker-services-agreement.md', 'src/pages/portal/Agreement.tsx'], 'agreement + in-portal e-sign screen'),
    gate('live', 'GATE-AGREEMENT'),
    ev('live', 'S7-21', 'agreement_esigned', 'true'),
    ev('live', 'S7-21', 'authorisation_letter_signed', 'true'),
    ev('live', 'S7-21', 'tier_selected', 'bronze | silver | gold', (v) => ['bronze', 'silver', 'gold'].includes(String(v).toLowerCase())),
    ev('live', 'S7-21', 'payment_reference_issued', 'true: Paystack plan or EFT reference issued'),
  ] },

  // S7-22 Broker — Explainer video watched (portal tracks completion) or Jonathan has walked him through. Purely external.
  // GREEN when: S7-22.jsonl has explainer_watched=true (brokers.explainer_watched_at set at 90 %) or jonathan_walkthrough=true.
  { id: 'S7-22', amber: false, checks: () => [
    files('build', ['deliverables/broker-success/explainer-script.md', 'src/pages/portal/Start.tsx'], 'explainer + completion tracking built'),
    (() => {
      const m = merged('S7-22.jsonl') || {};
      const ok = m.explainer_watched === true || m.jonathan_walkthrough === true;
      return mk('live', 'explainer watched or walked through', ok ? PASS : MISSING, ok ? `S7-22.jsonl ${m.explainer_watched ? 'explainer_watched' : 'jonathan_walkthrough'}=true` : 'build/evidence/S7-22.jsonl: explainer_watched or jonathan_walkthrough (true)');
    })(),
  ] },

  // S7-23 Platform & money — Paystack live keys, plans per tier, webhooks verified with a R1 live transaction (refunded).
  // Purely external: red until green.
  // GREEN when: PAYSTACK_SECRET_KEY starts sk_live_ and PAYSTACK_PUBLIC_KEY starts pk_live_ (prefix only is read);
  // GATE-PAYSTACK-KYC + GATE-R1-LIVE green; S7-23.jsonl (the R1 transaction log) has plans_per_tier listing bronze, silver,
  // gold, r1_reference (non-empty), r1_webhook_verified=true and r1_refunded=true. (billing suites shown as prep.)
  { id: 'S7-23', amber: false, postLaunch: 'NH-61', checks: () => [
    suite('build', 'automation/billing/billing.test.js'),
    suite('build', 'automation/billing/autorenew.test.js'),
    suite('build', 'automation/tests/W16.test.mjs'),
    custom('live', 'Paystack live keys in .env', () => {
      const s = ENV_PREFIX.get('PAYSTACK_SECRET_KEY') || '', k = ENV_PREFIX.get('PAYSTACK_PUBLIC_KEY') || '';
      const ok = s.startsWith('sk_live_') && k.startsWith('pk_live_');
      return [ok ? PASS : MISSING, ok ? 'sk_live_ + pk_live_ present' : `PAYSTACK_SECRET_KEY ${s ? (s.startsWith('sk_live_') ? 'live' : 'not live') : 'unset'}, PAYSTACK_PUBLIC_KEY ${k ? (k.startsWith('pk_live_') ? 'live' : 'not live') : 'unset'}`];
    }),
    gate('live', 'GATE-PAYSTACK-KYC'),
    gate('live', 'GATE-R1-LIVE'),
    evFile('live', 'S7-23.jsonl', 'R1 transaction log', 'R1 live transaction + refund rows'),
    ev('live', 'S7-23', 'plans_per_tier', '["bronze","silver","gold"]', (v) => Array.isArray(v) && ['bronze', 'silver', 'gold'].every((t) => v.map((x) => String(x).toLowerCase()).includes(t))),
    ev('live', 'S7-23', 'r1_reference', 'Paystack reference of the R1 live transaction', (v) => typeof v === 'string' && v.length > 0),
    ev('live', 'S7-23', 'r1_webhook_verified', 'true: signed webhook received and verified'),
    ev('live', 'S7-23', 'r1_refunded', 'true'),
  ] },

  // S7-24 Platform & money — FNB inContact alerts arriving at howzit@ and parsed (test with a R1 EFT); statement import scheduled.
  // Purely external: red until green.
  // GREEN when: GATE-INCONTACT green; HOWZIT_MAILBOX and FNB_INCONTACT_SENDER (or FNB_SENDER_ADDRESSES) set;
  // S7-24.jsonl has incontact_alerts_arriving, r1_eft_parsed and statement_import_scheduled true. (W17/W18 shown as prep.)
  { id: 'S7-24', amber: false, postLaunch: 'NH-61', checks: () => [
    suite('build', 'automation/tests/W17.test.mjs'),
    suite('build', 'automation/tests/W18.test.mjs'),
    workflow('build', 'W17'),
    workflow('build', 'W18'),
    gate('live', 'GATE-INCONTACT'),
    env('live', ['HOWZIT_MAILBOX'], 'howzit@ mailbox configured'),
    envAny('live', ['FNB_INCONTACT_SENDER', 'FNB_SENDER_ADDRESSES'], 'inContact sender configured'),
    ev('live', 'S7-24', 'incontact_alerts_arriving', 'true: alerts arriving at howzit@'),
    ev('live', 'S7-24', 'r1_eft_parsed', 'true: R1 EFT alert parsed by W17'),
    ev('live', 'S7-24', 'statement_import_scheduled', 'true: W18 statement import on its schedule'),
  ] },

  // S7-25 Platform & money — `pricing` table is the only price source — repo diff clean (W25).
  // GREEN when: the W25 suite passes; pricing.seed.json has the three tiers; migrations define public.pricing;
  // `node automation/billing/price-diff.mjs --json` has no failing typed price in a git-tracked file; S7-25.jsonl has
  // pricing_table_live=true (pricing rows live in the DB) and w25_site_sync_clean=true (W25 run against the deployed site).
  // AMBER today when the W25 test passes and only the diff/live half is missing.
  { id: 'S7-25', amber: true, checks: () => [
    suite('build', 'automation/tests/W25.test.mjs'),
    custom('build', 'pricing seed: 3 tiers', () => {
      const rel = 'automation/billing/pricing.seed.json';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const t = (readJson(rel).rows || []).map((r) => String(r.tier_code || r.tier || r.code || '').toLowerCase());
      const ok = ['bronze', 'silver', 'gold'].every((x) => t.some((y) => y.includes(x)));
      return [ok ? PASS : MISSING, `tiers: ${t.join(', ')}`];
    }),
    custom('build', 'pricing table in migrations', () => {
      const d = 'supabase/migrations';
      const hit = readdirSync(p(d)).find((f) => /^\d{14}_smc_.*\.sql$/.test(f) && /CREATE TABLE IF NOT EXISTS (public\.)?pricing\b/i.test(read(`${d}/${f}`)));
      return [hit ? PASS : MISSING, hit ? `${d}/${hit}` : 'no CREATE TABLE pricing in the smc migrations'];
    }),
    custom('live', 'repo price diff clean (W25)', () => {
      const r = RESULTS.get('cmd:pricediff');
      if (!r || r.code === null) return [MISSING, 'price-diff.mjs not found'];
      let j; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { return [FAIL, 'price-diff --json output unreadable']; }
      const filesHit = Object.entries(j.failing_files || {}).filter(([f]) => !TRACKED || TRACKED.has(f));
      const n = filesHit.reduce((a, [, c]) => a + c, 0);
      return [n ? MISSING : PASS, n ? `${n} typed price(s) in ${filesHit.length} tracked file(s), e.g. ${filesHit.slice(0, 4).map(([f]) => f).join(', ')} (legacy B2B tiers: NH-14)` : 'no typed tier price outside the allowed places'];
    }),
    ev('live', 'S7-25', 'pricing_table_live', 'true: pricing rows live in the DB (migration applied + seeded)'),
    ev('live', 'S7-25', 'w25_site_sync_clean', 'true: W25 diff against the deployed site clean'),
  ] },

  // S7-26 Platform & money — VPS provisioned (bought after first payment — W26 step 1), nightly pg_dump copied off-server,
  // backups on, secrets in .env, uptime monitor pinging api.; webhook signature verification on for Meta, WhatsApp, Paystack.
  // Pre-payment this line shows amber "ready to provision"; it goes green inside W26 and is the last line before the button.
  // GREEN when: provision.sh, pg_dump_nightly.sh, cron.lv-backup, UPTIME.md and the Traefik compose exist; W26 and
  // verify-webhooks suites pass; GATE-VPS green; VPS_HOST + BACKUP_S3_BUCKET set; S7-26.jsonl has vps_provisioned,
  // nightly_pgdump_offsite_ok, backups_on, secrets_in_env, uptime_monitor_api, webhook_sig_meta, webhook_sig_whatsapp,
  // webhook_sig_paystack all true. AMBER ("ready to provision") while GATE-VPS is not green and the build half passes.
  { id: 'S7-26', amber: 'pre-payment', checks: () => [
    files('build', ['automation/vps/provision.sh', 'automation/backup/pg_dump_nightly.sh', 'automation/backup/cron.lv-backup', 'automation/vps/UPTIME.md', 'automation/vps/traefik/docker-compose.traefik.yml'], 'W26 provisioning kit'),
    suite('build', 'automation/tests/W26.test.mjs'),
    suite('build', 'automation/security/verify-webhooks.test.js'),
    gate('live', 'GATE-VPS'),
    env('live', ['VPS_HOST', 'BACKUP_S3_BUCKET'], 'VPS + off-server backup target set'),
    custom('build', 'ANTHROPIC_BASE_URL unset or default in .env', () => {
      const e = exists('.env') ? read('.env') : (exists('automation/.env') ? read('automation/.env') : '');
      const m = e.match(/^ANTHROPIC_BASE_URL=(.*)$/m);
      const v = m ? m[1].trim() : '';
      const ok = !v || v === 'https://api.anthropic.com';
      return [ok ? PASS : FAIL, ok ? 'unset/default' : 'non-default value present (local egress stub must never reach production, R6-09)'];
    }),
    ev('live', 'S7-26', 'vps_provisioned', 'true: W26 step 1 done'),
    ev('live', 'S7-26', 'nightly_pgdump_offsite_ok', 'true: last nightly pg_dump copied off-server'),
    ev('live', 'S7-26', 'backups_on', 'true'),
    ev('live', 'S7-26', 'secrets_in_env', 'true: secrets only in the VPS .env'),
    ev('live', 'S7-26', 'uptime_monitor_api', 'true: uptime monitor pinging api.'),
    ev('live', 'S7-26', 'webhook_sig_meta', 'true'),
    ev('live', 'S7-26', 'webhook_sig_whatsapp', 'true'),
    ev('live', 'S7-26', 'webhook_sig_paystack', 'true'),
  ] },

  // S7-27 Platform & money — Console dashboard shows live spend/leads/qualified/booked/show; alerts route to both phones.
  // GREEN when: Today.tsx + Ads.tsx exist; W21 + W22 built and the W22 + meta-ads suites pass; OPS_WHATSAPP_JONATHAN +
  // OPS_WHATSAPP_KG set; S7-27.jsonl has console_live_metrics=true (spend, leads, qualified, booked, show from live data)
  // and alerts_route_both_phones=true (a test alert reached both phones).
  { id: 'S7-27', amber: true, checks: () => [
    files('build', ['src/pages/smc/Today.tsx', 'src/pages/smc/Ads.tsx'], 'console dashboard screens'),
    workflow('build', 'W21'),
    workflow('build', 'W22'),
    suite('build', 'automation/tests/W22.test.mjs'),
    suite('build', 'automation/ads/meta-ads.test.js'),
    env('live', ['OPS_WHATSAPP_JONATHAN', 'OPS_WHATSAPP_KG'], 'both alert phones configured'),
    ev('live', 'S7-27', 'console_live_metrics', 'true: spend / leads / qualified / booked / show from live data'),
    ev('live', 'S7-27', 'alerts_route_both_phones', 'true: test alert reached Jonathan and KG'),
  ] },

  // S7-28 Compliance — Information Officer registered; PAIA manual + privacy notice published; NCC direct-marketer registration
  // submitted; W24 cleanse scheduled; obligations register populated; external opinion commissioned (not blocking).
  // GREEN when: the PAIA manual, privacy page, IO pack and NCC pack exist; the compliance register has >= 20 table rows; W24 is
  // built and its suite passes; GATE-INFO-OFFICER + GATE-NCC green; S7-28.jsonl has paia_published,
  // privacy_notice_published and w24_scheduled true. GATE-OPINION is shown as info and never blocks.
  { id: 'S7-28', amber: true, checks: () => [
    files('build', ['deliverables/contracts-drafter/paia-manual.md', 'landing/holding/privacy.html', 'landing/holding/terms.html', 'deliverables/contracts-drafter/information-officer-pack.md', 'deliverables/contracts-drafter/ncc-direct-marketer-pack.md'], 'PAIA manual + privacy + terms pages + IO/NCC packs'),
    ev('live', 'S7-28', 'w24_monthly_evidence', 'true: first W24 monthly cleanse evidence file present (R6-07)'),
    ev('live', 'S7-28', 'ncc_renewal_date', 'non-empty: dated NCC registration renewal (C1)'),
    ev('live', 'S7-28', 'breach_drill_done', 'true: P14 breach drill run (R6-07)'),
    custom('build', 'obligations register populated', () => {
      const rel = 'deliverables/contracts-drafter/compliance-register.md';
      if (!exists(rel)) return [MISSING, `${rel} not found`];
      const rows = (read(rel).match(/^\|(?!\s*-)/gm) || []).length;
      return [rows >= 20 ? PASS : MISSING, `${rows} register table rows`];
    }),
    workflow('build', 'W24'),
    suite('build', 'automation/tests/W24.test.mjs'),
    gate('live', 'GATE-INFO-OFFICER'),
    gate('live', 'GATE-NCC'),
    ev('live', 'S7-28', 'paia_published', 'true: PAIA manual published'),
    ev('live', 'S7-28', 'privacy_notice_published', 'true: privacy notice live'),
    ev('live', 'S7-28', 'w24_scheduled', 'true: W24 cleanse on its schedule'),
    gate('info', 'GATE-OPINION'),
  ] },

  // S7-NH61 Platform & money — cycle-1 payment path (NH-61): EFT in advance per 30-day cycle, Jonathan taps "Payment received".
  // Replaces S7-23/S7-24 on the launch path (those are post-launch). Build-only: nothing external is needed.
  // GREEN when: automation/billing/manual-eft.test.js passes (the one-tap fires the same W16 payment.received event as an
  // automated match, the console page and the W16 /billing/payment-received webhook exist, the checkout shows manual EFT only with
  // PAYSTACK_ENABLED off, W17/W18 schedules are off by default); no bank account details in checkout/templates/invoice/contract
  // generators; W16 is built.
  { id: 'S7-NH61', title: 'Cycle-1 payment: EFT in advance per 30-day cycle, one-tap "Payment received" (NH-61)', amber: false, checks: () => [
    suite('build', 'automation/billing/manual-eft.test.js'),
    workflow('build', 'W16'),
    grep('build', 'automation/W16.json', /billing\/payment-received/, 'W16 has the one-tap webhook'),
    files('build', ['src/pages/smc/Payments.tsx'], 'console Payments page (Payment received button)'),
    grep('build', 'src/pages/smc/Payments.tsx', /Payment received/, 'button reads "Payment received"'),
    custom('build', 'no bank account details in the build', () => {
      const targets = ['billing/checkout/index.html', 'billing/checkout/checkout.js', 'src/components/dashboard/InvoiceGenerator.tsx', 'src/components/dashboard/ContractGenerator.tsx',
        'src/utils/contractToDocx.ts', 'automation/.env.example'];
      const bad = targets.filter((t) => exists(t) && /\b(account number|account #|branch code|BANK_ACCOUNT|BANK_BRANCH|data-bank|First National)/i.test(read(t)));
      return [bad.length ? FAIL : PASS, bad.length ? `bank details found in: ${bad.join(', ')}` : `${targets.length} files clean`];
    }),
  ] },
];

// ---------------------------------------------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------------------------------------------
function statusOf(line, checks) {
  const gating = checks.filter((c) => c.half !== 'info');
  if (gating.some((c) => c.state === FAIL)) return 'red';
  if (gating.every((c) => c.state === PASS)) return 'green';
  if (line.postLaunch) return 'post-launch';
  const build = gating.filter((c) => c.half === 'build');
  const buildDone = build.length > 0 && build.every((c) => c.state === PASS);
  if (line.amber === true && buildDone) return 'amber';
  if (line.amber === 'pre-payment' && buildDone && NODE.get('GATE-VPS')?.status !== 'green') return 'amber';
  return 'red';
}

function evaluate() {
  const exceptions = [];
  const out = [];
  for (const line of LINES) {
    const node = NODE.get(line.id);
    let checks;
    try { checks = line.checks(); } catch (e) {
      exceptions.push({ id: line.id, error: String(e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e) });
      checks = [mk('build', 'evaluator', FAIL, `exception: ${e && e.message}`)];
    }
    const status = statusOf(line, checks);
    const evidence = checks.filter((c) => c.state === PASS).map((c) => `${c.name}: ${c.detail}`);
    const missing = checks.filter((c) => c.state !== PASS && c.half !== 'info').map((c) => `${c.state === FAIL ? 'FAIL ' : ''}${c.name}: ${c.detail}`);
    const note = line.amber === 'pre-payment' && status === 'amber' ? 'ready to provision' : undefined;
    out.push({
      id: line.id,
      section: node ? String(node.section || '').replace(/^7 \/ /, '') : '',
      title: node ? (node.note || node.title) : (line.title || '(node missing in build/tasks.json)'),
      status,
      ...(note ? { note } : {}),
      ...(status === 'post-launch' ? { note: `post-launch (${line.postLaunch})` } : {}),
      build_done: checks.filter((c) => c.half === 'build').every((c) => c.state === PASS),
      evidence,
      missing,
      checks,
    });
  }
  return { lines: out, exceptions };
}

function gitSha() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

await runAll();
const { lines, exceptions } = evaluate();
const counts = { green: 0, amber: 0, red: 0, 'post-launch': 0 };
for (const l of lines) counts[l.status]++;
const report = {
  schema: 'lv.readiness.v1',
  generated_at: new Date().toISOString(),
  git_sha: gitSha(),
  env_file_present: existsSync(ENV_FILE),
  evidence_dir: EVIDENCE_DIR.startsWith(ROOT) ? EVIDENCE_DIR.slice(ROOT.length + 1) : EVIDENCE_DIR,
  counts,
  go_live_ready: counts.red === 0 && counts.amber === 0, // post-launch lines (NH-61) never block
  lines,
  exceptions,
};

if (JSON_OUT) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const sq = (s) => s.replace(/\s*\|\s*/g, ' / ');
  console.log('S7-xx | status | evidence | what is missing');
  for (const l of lines) {
    const passN = l.checks.filter((c) => c.state === PASS && c.half !== 'info').length;
    const allN = l.checks.filter((c) => c.half !== 'info').length;
    const ev = `${passN}/${allN} checks${l.evidence.length ? ': ' + l.evidence.slice(0, 3).map((e) => sq(e.split(':')[0])).join('; ') + (l.evidence.length > 3 ? '; …' : '') : ''}`;
    const miss = l.missing.length ? l.missing.map(sq).join('; ') : '—';
    console.log(`${l.id} | ${l.status === 'post-launch' ? l.note : l.status + (l.note ? ` (${l.note})` : '')} | ${ev} | ${miss}`);
  }
  console.log(`\ngreen ${counts.green} · amber ${counts.amber} · red ${counts.red} · post-launch ${counts['post-launch']}${exceptions.length ? ` · ${exceptions.length} exception(s)` : ''} · Go live ${report.go_live_ready ? 'available' : 'blocked'}`);
  for (const e of exceptions) console.log(`exception ${e.id}: ${e.error}`);
}
process.exitCode = counts.red > 0 || exceptions.length ? 1 : 0;
