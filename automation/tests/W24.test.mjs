// DRAFT for GATE-TEST-W24: Jonathan (and compliance-qa) approve or edit. W24 stays inactive until this is approved.
//
// W24 Compliance cleanse & calendar: automation/W24-compliance-cleanse.md section 8, cases 1-10 (synthetic data only).
// Rule protected: the licence to operate (2.3, register C2/C3). Every active number is checked against the NCC
// opt-out registry each month; every match lands on the one suppression list, is opted out through W15 (no
// message to the person), its broker is told, and a dated, PII-free evidence file proves it.
//
// Offline (default): the Code nodes run *from automation/W24.json* in a sandbox (real code). Postgres, file,
// HTTP and sub-workflow nodes are modelled below, one function per node, named after the node, so a query change
// must be mirrored here. Online: set N8N_PUBLIC_URL + TEST_HOOKS_TOKEN; needs staging-only hooks built with W24:
//   POST /test/w24/seed {leads[], suppression[], dsr_requests[], obligations[], registry_csv?, api_mock?, w15_fail_for?}
//   POST /test/w24/run {trigger: monthly|daily|manual, now}  -> {files{}, alerts[], w15_calls[]}
//   GET  /test/w24/state -> {suppression[], obligations[], leads[], files{}, alerts[], w15_calls[]}
// Run: node --test automation/tests/W24.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { MODE, broker as fixtureBroker, clone, ms, iso, MIN, H, D, sha256, online } from './_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WF = JSON.parse(readFileSync(join(HERE, '..', 'W24.json'), 'utf8'));
const node = (name) => {
  const n = WF.nodes.find((x) => x.name === name);
  assert.ok(n, `W24.json has node "${name}"`);
  return n;
};

// ---------------------------------------------------------------------------------------------
// Sandbox. $now is UTC-zoned here on purpose: only an explicit setZone('Africa/Johannesburg') gives SAST,
// so case 10 fails if the code ever reads the month in UTC.
// ---------------------------------------------------------------------------------------------
const ZONES = { 'Africa/Johannesburg': 2 * H, UTC: 0 };
class DT {
  constructor(t, off = 0) {
    this.t = t; this.off = off;
    const d = new Date(t + off);
    Object.assign(this, { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: ((d.getUTCDay() + 6) % 7) + 1 });
  }
  setZone(z) { assert.ok(z in ZONES, `zone ${z}`); return new DT(this.t, ZONES[z]); }
  toISO() {
    const s = new Date(this.t + this.off).toISOString().replace('Z', '');
    const h = this.off / H;
    return s + (h === 0 ? 'Z' : `+${String(h).padStart(2, '0')}:00`);
  }
  toFormat(f) {
    const p2 = (n) => String(n).padStart(2, '0');
    const map = { yyyy: String(this.year), MM: p2(this.month), dd: p2(this.day), HH: p2(this.hour), mm: p2(this.minute) };
    return f.replace(/yyyy|MM|dd|HH|mm/g, (k) => map[k]);
  }
}

function runCode(name, { input = [], refs = {}, env, now }) {
  const NOW = typeof now === 'number' ? now : ms(now);
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const ctx = vm.createContext({
    $input: wrap(input), $json: input[0] ?? {}, $env: env, $now: new DT(NOW, 0), require, Buffer, Date: FakeDate,
    $: (n) => { if (!refs[n]) throw new Error(`node "${n}" has not run`); return wrap(refs[n]); },
  });
  const out = vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx);
  return JSON.parse(JSON.stringify(out.map((i) => i.json)));
}

// ---------------------------------------------------------------------------------------------
// Synthetic data: 10 leads on the fixture broker, numbers stored in mixed formats (hash rule must normalise)
// ---------------------------------------------------------------------------------------------
const B = fixtureBroker();
const FORMATS = (i) => [`+2760000010${i}`, `060000010${i}`, `0027 60 000 010${i}`, `060-000-010${i}`][i % 4];
const e164digits = (i) => `2760000010${i}`;
const hashOf = (i) => sha256(e164digits(i)); // the one hash rule: E.164 digits without "+", SHA-256 hex
const leadId = (i) => `00000000-0000-4000-8000-00000000010${i}`;
const leads = () => Array.from({ length: 10 }, (_, i) => ({ id: leadId(i), broker_id: B.broker_id, brand_id: 'smc', phone: FORMATS(i), opted_out_at: null, retention_delete_after: '2027-10-01T00:00:00+02:00', is_synthetic: true }));
const OBLIGATIONS = () => [
  { code: 'C1', description: 'NCC direct-marketer registration renewal', owner: 'jonathan', due_at: null, last_done_at: null, status: 'amber' },
  { code: 'C2', description: 'Monthly NCC registry cleanse', owner: 'compliance-qa', due_at: '2026-11-01T06:00:00+02:00', last_done_at: '2026-10-01T06:05:00+02:00', status: 'green' },
  { code: 'C3', description: 'One suppression list', owner: 'compliance-qa', due_at: '2026-11-01T06:00:00+02:00', last_done_at: '2026-10-01T06:05:00+02:00', status: 'green' },
  { code: 'P4', description: 'Information Officer registration check', owner: 'jonathan', due_at: '2027-03-01T09:00:00+02:00', last_done_at: null, status: 'green' },
  { code: 'P5', description: 'PAIA manual review', owner: 'jonathan', due_at: '2027-06-01T09:00:00+02:00', last_done_at: null, status: 'green' },
  { code: 'P14', description: 'Breach drill', owner: 'devops-security', due_at: '2027-02-01T09:00:00+02:00', last_done_at: null, status: 'green' },
];
const NOV1 = ms('2026-11-01T06:00:00+02:00'); // Sunday 1 Nov 06:00 SAST = 04:00 UTC
const PII = /\+?27\d{9}/;

// ---------------------------------------------------------------------------------------------
// Offline system
// ---------------------------------------------------------------------------------------------
function offlineSys(envOver = {}) {
  const env = { NCC_REGISTRY_MODE: 'csv', NCC_REGISTRY_ENDPOINT: '', NCC_REGISTRY_BATCH_SIZE: '1000', W24_INCLUDE_LEGACY: 'false', W24_TEST_MODE: 'true', W24_EVIDENCE_DIR: '/home/node/compliance/evidence', W24_INBOX_DIR: '/home/node/compliance/inbox', ...envOver };
  const st = { leads: [], suppression: [], dsr: [], obligations: OBLIGATIONS(), files: {}, alerts: [], w15Calls: [], w15FailFor: new Set(), api: null, apiCalls: 0, writeFail: false };
  const digits = (p) => { const d = String(p).replace(/\D/g, ''); return d.startsWith('00') ? d.slice(2) : d.startsWith('0') ? '27' + d.slice(1) : d; };
  const monthStart = (now) => { const d = new Date(now + 2 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 2 * H; };
  const dom = (now) => new Date(now + 2 * H).getUTCDate();

  async function failure(ctx, error, now) {
    const [a] = runCode('Build failure alert', { input: [{ error }], refs: { 'Set run context': [ctx] }, env, now });
    const c2 = st.obligations.find((o) => o.code === 'C2'); // "Mark C2 amber/red (failure)"
    c2.status = dom(now) - 1 >= 3 ? 'red' : 'amber';
    st.alerts.push({ via: 'Alert compliance-qa (W22)', ...a });
    return { ok: false, alert: a };
  }

  async function cleanse(now, triggerItem) {
    const [ctx] = runCode('Set run context', { input: [triggerItem], env, now });
    const refs = { 'Set run context': [ctx] };
    // "Read active leads"
    const supp = new Set(st.suppression.map((s) => s.mobile_hash));
    const active = st.leads.filter((l) => l.phone != null && (l.brand_id != null || ctx.include_legacy) && (!!l.is_synthetic === ctx.test_mode) && l.opted_out_at == null
      && (l.retention_delete_after == null || ms(l.retention_delete_after) > now))
      .map((l) => ({ lead_id: l.id, broker_id: l.broker_id, brand_id: l.brand_id, phone_e164: ctx.mode === 'api' ? '+' + digits(l.phone) : null, mobile_hash: sha256(digits(l.phone)) }))
      .filter((l) => !supp.has(l.mobile_hash));
    refs['Read active leads'] = active.length ? active : [{}]; // n8n Postgres: zero rows -> one empty item when alwaysOutputData; the code filters j.lead_id
    const batches = runCode('Batch for registry', { input: refs['Read active leads'], refs, env, now });
    let registry;
    const route = batches[0].route;
    if (route === 'api') {
      const responses = [];
      for (const b of batches) { // "NCC registry check (HTTP)": retry 3, error output -> failure
        st.apiCalls += 1;
        try { responses.push(await st.api(b)); } catch (e) { return failure(ctx, { message: e.message }, now); }
      }
      try { registry = runCode('Normalise registry response', { input: responses, refs, env, now }); } catch (e) { return failure(ctx, { message: e.message }, now); }
    } else if (route === 'csv') {
      const path = `${ctx.inbox_dir}/ncc-registry-${ctx.run_month}.csv`;
      if (!(path in st.files)) return failure(ctx, { message: `The file "${path}" could not be accessed.` }, now); // "Read registry CSV" error output
      const [head, ...lines] = st.files[path].trim().split(/\r?\n/); // "Parse registry CSV" (extractFromFile, header row)
      const cols = head.split(',').map((c) => c.trim());
      const rows = lines.map((ln) => Object.fromEntries(ln.split(',').map((v, i) => [cols[i], v.trim()])));
      try { registry = runCode('Hash registry numbers', { input: rows, refs, env, now }); } catch (e) { return failure(ctx, { message: e.message }, now); }
    } else {
      registry = batches; // route none -> straight to Intersect
    }
    const [run] = runCode('Intersect with active leads', { input: registry, refs, env, now });
    refs['Intersect with active leads'] = [run];
    // "Upsert registry blocks into suppression": unique (mobile_hash, source)
    let inserted = 0;
    for (const m of run.matches) if (!st.suppression.some((s) => s.mobile_hash === m.mobile_hash && s.source === 'ncc_registry')) { st.suppression.push({ mobile_hash: m.mobile_hash, source: 'ncc_registry', brand_id: m.brand_id, lead_id: m.lead_id, added_at: iso(now) }); inserted += 1; }
    if (run.match_count > 0) { // "Any registry matches?"
      const items = runCode('Matches to items', { refs, env, now });
      const results = items.map((it) => { // "W15 suppress lead (reason ncc_registry)": the W15 contract (NH-CQ-W24-3)
        st.w15Calls.push(it);
        if (st.w15FailFor.has(it.lead_id)) return { error: 'W15 failed (test)' };
        const l = st.leads.find((x) => x.id === it.lead_id);
        l.opted_out_at = iso(now); l.stage = 'opted_out';
        return { ok: true, broker_id: it.broker_id, broker_notified: it.notify_broker, schedules_cancelled: 2 };
      });
      refs['Collapse W15 results'] = runCode('Collapse W15 results', { input: results, env, now });
    }
    // "Reconcile STOP + objections"
    let stopFixed = 0; let objFixed = 0;
    for (const l of st.leads.filter((x) => x.phone != null && x.opted_out_at != null)) {
      const h = sha256(digits(l.phone));
      if (!st.suppression.some((s) => s.mobile_hash === h)) { st.suppression.push({ mobile_hash: h, source: 'stop', brand_id: l.brand_id, lead_id: l.id, added_at: l.opted_out_at }); stopFixed += 1; }
    }
    for (const d of st.dsr.filter((x) => x.kind === 'object' && x.mobile_hash)) {
      if (!st.suppression.some((s) => s.mobile_hash === d.mobile_hash)) { st.suppression.push({ mobile_hash: d.mobile_hash, source: 'objection', added_at: d.verified_at || d.received_at }); objFixed += 1; }
    }
    refs['Reconcile STOP + objections'] = [{ stop_gaps_fixed: stopFixed, objection_gaps_fixed: objFixed }];
    // "Count suppression list"
    const by = (rows) => rows.reduce((a, s) => ({ ...a, [s.source]: (a[s.source] || 0) + 1 }), {});
    const ms0 = monthStart(now);
    const contactable = st.leads.filter((l) => l.phone != null && l.opted_out_at == null && st.suppression.some((s) => s.mobile_hash === sha256(digits(l.phone)))).length;
    refs['Count suppression list'] = [{ suppression_rows: st.suppression.length, suppressed_people: new Set(st.suppression.map((s) => s.mobile_hash)).size, by_source: by(st.suppression), added_this_month: by(st.suppression.filter((s) => ms(s.added_at) >= ms0)), blocked_but_contactable: contactable }];
    const [ev] = runCode('Build evidence file', { refs, env, now });
    // "Write evidence .md" / "Write matches .csv (hashes only)": error output -> failure
    if (st.writeFail) return failure(ctx, { message: 'EACCES: permission denied' }, now);
    st.files[`${ev.evidence_dir}/${ev.run_month}.md`] = ev.md;
    st.files[`${ev.evidence_dir}/${ev.run_month}-registry-matches.csv`] = ev.csv;
    // "Close C2 in obligations register"
    const next = monthStart(now + 32 * D - (dom(now) - 1) * D) + 6 * H;
    for (const o of st.obligations.filter((x) => ['C2', 'C3'].includes(x.code))) Object.assign(o, { last_done_at: iso(now), evidence_url: ev.evidence_url, status: ev.red ? 'red' : 'amber', due_at: iso(next) });
    st.alerts.push({ via: 'Ask IO to sign off (W22)', run_id: ctx.run_id, red: ev.red, evidence_url: ev.evidence_url });
    return { ok: true, ctx, run, inserted, evidence: ev };
  }

  async function daily(now) {
    const out = { retried: null, overdueAlert: false, reminders: [] };
    // "Check this month's cleanse"
    const c2 = st.obligations.find((o) => o.code === 'C2');
    const cleanse_missing = c2 ? (c2.last_done_at == null || ms(c2.last_done_at) < monthStart(now)) : true;
    const chk = { cleanse_missing, register_seeded: !!c2, days_since_due: dom(now) - 1 };
    if (chk.cleanse_missing && chk.days_since_due >= 1) out.retried = await cleanse(now, chk); // "Retry today?"
    if (chk.cleanse_missing && chk.days_since_due >= 3) { out.overdueAlert = true; st.alerts.push({ via: 'Alert Jonathan: cleanse overdue (W22)', days_since_due: chk.days_since_due }); }
    // "Dated reminders due"
    const today = Date.UTC(...(() => { const d = new Date(now + 2 * H); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })());
    const isoDow = ((new Date(now + 2 * H).getUTCDay() + 6) % 7) + 1;
    for (const o of st.obligations.filter((x) => ['C1', 'P4', 'P5', 'P14'].includes(x.code))) {
      let daysLeft = null;
      if (o.due_at) { const d = new Date(ms(o.due_at) + 2 * H); daysLeft = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today) / D); }
      const hit = [60, 30, 7, 1, 0].includes(daysLeft) || ((o.due_at == null || ms(o.due_at) < now) && isoDow === 1);
      if (hit) { const r = { code: o.code, days_left: daysLeft, state: o.due_at == null ? 'undated' : ms(o.due_at) < now ? 'overdue' : 'upcoming' }; out.reminders.push(r); st.alerts.push({ via: 'Send renewal reminders (W22)', ...r }); }
    }
    return out;
  }

  return {
    st, env,
    seed: async ({ leads: L = leads(), suppression = [], dsr = [], obligations, csv, api, w15FailFor = [], writeFail = false } = {}) => {
      st.leads = clone(L); st.suppression = clone(suppression); st.dsr = clone(dsr); if (obligations) st.obligations = clone(obligations);
      if (csv) st.files[`${env.W24_INBOX_DIR}/${csv.month}.csv`.replace(/\/(\d{4}-\d{2})\.csv$/, '/ncc-registry-$1.csv')] = csv.body;
      if (api) st.api = api; st.w15FailFor = new Set(w15FailFor); st.writeFail = writeFail;
    },
    monthly: (now) => cleanse(typeof now === 'number' ? now : ms(now), { timestamp: iso(typeof now === 'number' ? now : ms(now)) }),
    manual: (now) => cleanse(typeof now === 'number' ? now : ms(now), {}),
    daily: (now) => daily(typeof now === 'number' ? now : ms(now)),
    state: async () => ({ suppression: st.suppression, obligations: st.obligations, leads: st.leads, files: st.files, alerts: st.alerts, w15_calls: st.w15Calls, api_calls: st.apiCalls }),
  };
}

function onlineSys(envOver = {}) {
  return {
    seed: async (o = {}) => online.post('/test/w24/seed', { leads: leads(), ...o, csv: o.csv, api_mock: o.api ? 'unknown_shape' : undefined, w15_fail_for: o.w15FailFor, env: envOver, is_synthetic: true }),
    monthly: async (now) => (await online.post('/test/w24/run', { trigger: 'monthly', now: iso(now) })).body,
    manual: async (now) => (await online.post('/test/w24/run', { trigger: 'manual', now: iso(now) })).body,
    daily: async (now) => (await online.post('/test/w24/run', { trigger: 'daily', now: iso(now) })).body,
    state: async () => (await online.get('/test/w24/state')).body,
  };
}
const fresh = (envOver) => (MODE === 'online' ? onlineSys(envOver) : offlineSys(envOver));
const offlineOnly = (t) => MODE === 'online' && t.skip('offline-only: reads sandbox internals');
const csvFor = (idx, month = '2026-11', extra = []) => ({ month, body: 'msisdn\n' + [...idx.map((i) => `0${e164digits(i).slice(2)}`), ...extra].join('\n') + '\n' });
const evidencePath = (m) => `/home/node/compliance/evidence/${m}.md`;
const csvPath = (m) => `/home/node/compliance/evidence/${m}-registry-matches.csv`;
const cell = (md, label) => { const row = md.split('\n').find((r) => r.startsWith('| ' + label)); assert.ok(row, `evidence row "${label}"`); return row.split('|')[2].trim(); };

// =============================================================================================
// Structure
// =============================================================================================
test(`W24 [${MODE}] export: inactive, Africa/Johannesburg, no success data stored, crons 1st 06:00 + daily 06:00, credentials by name`, (t) => {
  if (offlineOnly(t)) return;
  assert.equal(WF.active ?? false, false);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.settings.saveDataSuccessExecution, 'none');
  assert.equal(WF.settings.saveManualExecutions, false);
  const crons = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.scheduleTrigger').map((n) => n.parameters.rule.interval[0].expression).sort();
  assert.deepEqual(crons, ['0 6 * * *', '0 6 1 * *']);
  for (const n of WF.nodes) for (const c of Object.values(n.credentials || {})) assert.ok(c.name && !('data' in c), n.name);
  assert.doesNotMatch(JSON.stringify(WF), PII);
});

// =============================================================================================
// Case 1: 10 synthetic leads, 2 on the registry CSV
// =============================================================================================
test(`W24 [${MODE}] case 1: 10 leads, 2 on the registry -> 2 ncc_registry rows, W15 x2 without a lead message, evidence matches 2, invariant 0, PASS`, async () => {
  const sys = fresh();
  await sys.seed({ csv: csvFor([2, 7], '2026-11', ['0600009999']) }); // + one registry number we do not hold
  const r = await sys.monthly(NOV1);
  const s = await sys.state();
  const rows = s.suppression.filter((x) => x.source === 'ncc_registry');
  assert.deepEqual(rows.map((x) => x.mobile_hash).sort(), [hashOf(2), hashOf(7)].sort(), 'hash rule normalises 0..., 0027..., dashes');
  assert.equal(s.w15_calls.length, 2);
  for (const c of s.w15_calls) {
    assert.equal(c.send_lead_confirmation, false, 'never message a registry-blocked number');
    assert.equal(c.notify_broker, true);
    assert.equal(c.reason, 'ncc_registry');
    assert.match(c.idempotency_key, /^W24-2026-11-/);
  }
  const md = s.files[evidencePath('2026-11')];
  assert.ok(md, 'evidence file written');
  assert.equal(cell(md, 'Registry matches'), '2');
  assert.equal(cell(md, 'Active leads checked'), '10 (legacy included: false; synthetic run: true)');
  assert.match(cell(md, 'Invariant'), /^0 \(pass\)/);
  assert.match(cell(md, 'Result'), /^PASS/);
  assert.match(cell(md, 'Leads suppressed via W15'), /^2 \/ 0/);
  if (MODE === 'offline') assert.equal(r.evidence.red, false);
  const c2 = s.obligations.find((o) => o.code === 'C2');
  assert.equal(c2.status, 'amber', 'awaiting the IO tap');
  assert.equal(c2.evidence_url, 'compliance/evidence/2026-11.md');
  assert.equal(c2.due_at, '2026-12-01T06:00:00+02:00');
  assert.equal(s.obligations.find((o) => o.code === 'C3').status, 'amber');
  assert.equal(s.files[csvPath('2026-11')].trim().split('\n').length, 3, 'header + 2 hash rows');
});

// =============================================================================================
// Case 2: idempotent re-run
// =============================================================================================
test(`W24 [${MODE}] case 2: re-running the same month inserts nothing, calls W15 no more, keeps this month's totals`, async () => {
  const sys = fresh();
  await sys.seed({ csv: csvFor([2, 7]) });
  await sys.monthly(NOV1);
  const before = clone((await sys.state()).suppression);
  await sys.manual(NOV1 + 2 * H);
  const s = await sys.state();
  assert.deepEqual(s.suppression, before, 'no new suppression rows');
  assert.equal(s.w15_calls.length, 2, 'W15 not called again');
  const md = s.files[evidencePath('2026-11')];
  assert.equal(cell(md, 'Registry matches'), '0', 'nothing new this run');
  assert.match(cell(md, 'Added this month by source'), /"ncc_registry":2/, 'the month still shows its 2 registry blocks');
  assert.match(cell(md, 'Suppression list total'), /^2 \/ 2/);
});

// =============================================================================================
// Case 3: reconcile STOP + objections
// =============================================================================================
test(`W24 [${MODE}] case 3: a STOPped lead with no suppression row -> added as stop; an objection with mobile_hash -> objection`, async () => {
  const sys = fresh();
  const L = leads(); L[4].opted_out_at = '2026-10-20T10:00:00+02:00'; // STOP handled by W15 but the row is missing
  const objHash = sha256('27600000999');
  await sys.seed({ leads: L, csv: csvFor([]), dsr: [{ kind: 'object', mobile_hash: objHash, received_at: '2026-10-21T09:00:00+02:00', verified_at: '2026-10-21T10:00:00+02:00' }] });
  await sys.monthly(NOV1);
  const s = await sys.state();
  assert.deepEqual(s.suppression.filter((x) => x.source === 'stop').map((x) => x.mobile_hash), [hashOf(4)]);
  assert.deepEqual(s.suppression.filter((x) => x.source === 'objection').map((x) => x.mobile_hash), [objHash]);
  assert.equal(cell(s.files[evidencePath('2026-11')], 'STOP gaps closed / objection gaps closed'), '1 / 1');
});

// =============================================================================================
// Case 4: API mode, unknown response shape
// =============================================================================================
test(`W24 [${MODE}] case 4: API mode + unknown response shape -> failure path, C2 amber, no evidence file, alert without numbers`, async () => {
  const sys = fresh({ NCC_REGISTRY_MODE: 'api', NCC_REGISTRY_ENDPOINT: 'https://registry.example.test/v1/check' });
  await sys.seed({ api: async (batch) => ({ status: 'ok', echo: batch.numbers }) }); // neither blocked[] nor results[]
  const r = await sys.monthly(NOV1);
  const s = await sys.state();
  if (MODE === 'offline') assert.equal(r.ok, false);
  assert.equal(s.files[evidencePath('2026-11')], undefined, 'no evidence file');
  assert.equal(s.obligations.find((o) => o.code === 'C2').status, 'amber');
  const a = s.alerts.find((x) => x.kind === 'w24_failure');
  assert.ok(a); assert.deepEqual(a.to, ['compliance-qa']);
  assert.match(a.message, /unrecognised NCC registry response shape/);
  assert.doesNotMatch(JSON.stringify(s.alerts), PII);
  assert.equal(s.suppression.length, 0);
});

test(`W24 [${MODE}] API mode with blocked[] and results[] shapes both map back to the right leads (batch size honoured)`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh({ NCC_REGISTRY_MODE: 'api', NCC_REGISTRY_ENDPOINT: 'https://registry.example.test/v1/check', NCC_REGISTRY_BATCH_SIZE: '4' });
  let n = 0;
  await sys.seed({ api: async (b) => (n++ % 2 === 0 ? { blocked: b.numbers.filter((x) => x.endsWith('1')) } : { results: b.numbers.map((x) => ({ number: x.replace('+27', '0'), blocked: x.endsWith('5') })) }) });
  await sys.monthly(NOV1);
  const s = await sys.state();
  assert.equal(s.api_calls, 3, '10 numbers / batch 4 = 3 calls');
  assert.deepEqual(s.suppression.map((x) => x.mobile_hash).sort(), [hashOf(1), hashOf(5)].sort());
});

test(`W24 [${MODE}] API mode without an endpoint falls back to csv and records a note`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh({ NCC_REGISTRY_MODE: 'api', NCC_REGISTRY_ENDPOINT: '' });
  await sys.seed({ csv: csvFor([3]) });
  const r = await sys.monthly(NOV1);
  assert.equal(r.ctx.mode, 'csv');
  assert.match(cell((await sys.state()).files[evidencePath('2026-11')], 'Notes / errors'), /NCC_REGISTRY_ENDPOINT not set, using csv/);
  assert.equal(r.ctx.mode === 'csv' && r.run.matches[0].mobile_hash, hashOf(3));
});

// =============================================================================================
// Case 5: missing CSV, daily retry, day-4 escalation
// =============================================================================================
test(`W24 [${MODE}] case 5: missing CSV -> failure; day 2 retries; day 4 alerts Jonathan and C2 is red; a dropped file then passes`, async () => {
  const sys = fresh();
  await sys.seed({});
  const r1 = await sys.monthly(NOV1);
  if (MODE === 'offline') assert.equal(r1.ok, false);
  let s = await sys.state();
  assert.equal(s.obligations.find((o) => o.code === 'C2').status, 'amber');
  assert.equal(s.files[evidencePath('2026-11')], undefined);
  const d2 = await sys.daily(ms('2026-11-02T06:00:00+02:00'));
  if (MODE === 'offline') { assert.ok(d2.retried, 'day 2 retries'); assert.equal(d2.overdueAlert, false); }
  await sys.daily(ms('2026-11-03T06:00:00+02:00'));
  const d4 = await sys.daily(ms('2026-11-04T06:00:00+02:00'));
  s = await sys.state();
  if (MODE === 'offline') assert.equal(d4.overdueAlert, true);
  assert.equal(s.alerts.filter((a) => a.via === 'Alert Jonathan: cleanse overdue (W22)').length, 1, 'Jonathan alerted on day 4 only');
  assert.equal(s.obligations.find((o) => o.code === 'C2').status, 'red');
  assert.equal(s.alerts.filter((a) => a.kind === 'w24_failure').length, 4, 'monthly + 3 daily retries each alert compliance-qa');
  if (MODE === 'offline') {
    await sys.seed({ csv: csvFor([1]) });
    const d5 = await sys.daily(ms('2026-11-05T06:00:00+02:00'));
    assert.equal(d5.retried.ok, true);
    assert.equal((await sys.state()).obligations.find((o) => o.code === 'C2').status, 'amber', 'done, awaiting IO');
    const d6 = await sys.daily(ms('2026-11-06T06:00:00+02:00'));
    assert.equal(d6.retried, null, 'no retry once this month is done');
  }
});

test(`W24 [${MODE}] case 5: day 1 belongs to the monthly trigger (the daily branch does not retry on the 1st)`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  await sys.seed({});
  const d1 = await sys.daily(NOV1);
  assert.equal(d1.retried, null);
});

// =============================================================================================
// Case 6: zero active leads
// =============================================================================================
test(`W24 [${MODE}] case 6: zero active leads -> evidence written with 0 checked, PASS`, async () => {
  const sys = fresh();
  await sys.seed({ leads: [] });
  await sys.monthly(NOV1);
  const s = await sys.state();
  const md = s.files[evidencePath('2026-11')];
  assert.ok(md);
  assert.match(cell(md, 'Active leads checked'), /^0 /);
  assert.equal(cell(md, 'Registry mechanism used'), 'none (no active leads)');
  assert.match(cell(md, 'Result'), /^PASS/);
});

// =============================================================================================
// Case 7: a W15 failure -> RED
// =============================================================================================
test(`W24 [${MODE}] case 7: W15 fails for one match -> result RED, C2 red, invariant catches the still-contactable lead`, async () => {
  const sys = fresh();
  await sys.seed({ csv: csvFor([2, 7]), w15FailFor: [leadId(7)] });
  await sys.monthly(NOV1);
  const s = await sys.state();
  const md = s.files[evidencePath('2026-11')];
  assert.match(cell(md, 'Result'), /RED/);
  assert.match(cell(md, 'Leads suppressed via W15'), /^1 \/ 1/);
  assert.match(cell(md, 'Invariant'), /^1 \*\*RED\*\*/);
  assert.equal(s.obligations.find((o) => o.code === 'C2').status, 'red');
});

// =============================================================================================
// Case 8: dated reminders
// =============================================================================================
test(`W24 [${MODE}] case 8: C1 due in 30 days -> one reminder; undated C1 -> one reminder on Monday, none on Tuesday`, async () => {
  const sys = fresh();
  const mon = ms('2026-11-02T06:00:00+02:00'); // Monday
  const ob = OBLIGATIONS().map((o) => (o.code === 'C2' ? { ...o, last_done_at: '2026-11-01T06:05:00+02:00' } : o));
  await sys.seed({ obligations: ob.map((o) => (o.code === 'C1' ? { ...o, due_at: '2026-12-02T09:00:00+02:00' } : o)) });
  let s = await sys.daily(mon);
  let st = await sys.state();
  assert.deepEqual(st.alerts.filter((a) => a.via === 'Send renewal reminders (W22)').map((a) => [a.code, a.days_left]), [['C1', 30]]);
  const sys2 = fresh();
  await sys2.seed({ obligations: ob }); // C1 undated
  await sys2.daily(mon);
  await sys2.daily(mon + D); // Tuesday
  st = await sys2.state();
  const rem = st.alerts.filter((a) => a.via === 'Send renewal reminders (W22)');
  assert.deepEqual(rem.map((a) => [a.code, a.state]), [['C1', 'undated']], 'Monday only');
  assert.ok(s !== undefined);
});

test(`W24 [${MODE}] case 8: reminders at 60, 30, 7, 1 and 0 days, and nothing in between`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  const due = '2027-03-01T09:00:00+02:00';
  await sys.seed({ obligations: OBLIGATIONS().map((o) => (o.code === 'P4' ? { ...o, due_at: due } : o.code === 'C1' ? { ...o, due_at: '2028-01-01T09:00:00+02:00' } : { ...o, last_done_at: '2026-12-31T06:00:00+02:00' })) });
  for (let t0 = ms('2026-12-29T06:00:00+02:00'); t0 <= ms('2027-03-01T06:00:00+02:00'); t0 += D) await sys.daily(t0);
  const p4 = (await sys.state()).alerts.filter((a) => a.via === 'Send renewal reminders (W22)' && a.code === 'P4').map((a) => a.days_left);
  assert.deepEqual(p4, [60, 30, 7, 1, 0]);
});

// =============================================================================================
// Case 9: no PII in evidence or alerts
// =============================================================================================
test(`W24 [${MODE}] case 9: evidence .md and every alert payload contain no phone number (+27/27 + 9 digits)`, async () => {
  const sys = fresh();
  await sys.seed({ csv: csvFor([0, 1, 2, 3]) });
  await sys.monthly(NOV1);
  const sys2 = fresh({ NCC_REGISTRY_MODE: 'api', NCC_REGISTRY_ENDPOINT: 'https://registry.example.test/v1/check' });
  await sys2.seed({ api: async () => ({ unexpected: true }) });
  await sys2.monthly(NOV1);
  const a = await sys.state(); const b = await sys2.state();
  assert.doesNotMatch(a.files[evidencePath('2026-11')], PII);
  assert.doesNotMatch(JSON.stringify([a.alerts, b.alerts]), PII);
  assert.doesNotMatch(a.files[csvPath('2026-11')], /\b0\d{9}\b|\+27/, 'matches csv holds hashes only');
});

// =============================================================================================
// Case 10: timezone
// =============================================================================================
test(`W24 [${MODE}] case 10: a trigger at 1 Nov 06:00 SAST (04:00 UTC) -> run_month 2026-11; 1 Nov 00:30 SAST (31 Oct UTC) is still November`, async (t) => {
  if (offlineOnly(t)) return;
  const env = offlineSys().env;
  assert.equal(runCode('Set run context', { input: [{ timestamp: 'x' }], env, now: ms('2026-11-01T04:00:00Z') })[0].run_month, '2026-11');
  const late = runCode('Set run context', { input: [{ timestamp: 'x' }], env, now: ms('2026-10-31T22:30:00Z') })[0];
  assert.equal(late.run_month, '2026-11');
  assert.equal(late.run_id, 'W24-2026-11');
  assert.equal(late.trigger, 'monthly');
  assert.match(late.run_started_at, /\+02:00$/);
});

// =============================================================================================
// Scope rules (section 3 step 1)
// =============================================================================================
test(`W24 [${MODE}] scope: legacy (brand_id null) leads only with W24_INCLUDE_LEGACY=true; non-synthetic leads never in a test run; expired retention skipped`, async (t) => {
  if (offlineOnly(t)) return;
  const L = leads();
  L[0].brand_id = null; L[1].is_synthetic = false; L[2].retention_delete_after = '2026-10-01T00:00:00+02:00';
  const sys = fresh();
  await sys.seed({ leads: L, csv: csvFor([0, 1, 2]) });
  const r = await sys.monthly(NOV1);
  assert.equal(r.run.active_checked, 7);
  assert.equal(r.run.match_count, 0);
  const sys2 = fresh({ W24_INCLUDE_LEGACY: 'true' });
  await sys2.seed({ leads: L, csv: csvFor([0, 1, 2]) });
  const r2 = await sys2.monthly(NOV1);
  assert.equal(r2.run.active_checked, 8);
  assert.deepEqual(r2.run.matches.map((m) => m.mobile_hash), [hashOf(0)]);
});

test(`W24 [${MODE}] an evidence write failure takes the failure path (C2 not closed)`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  await sys.seed({ csv: csvFor([2]), writeFail: true });
  const r = await sys.monthly(NOV1);
  assert.equal(r.ok, false);
  const c2 = (await sys.state()).obligations.find((o) => o.code === 'C2');
  assert.equal(c2.last_done_at, '2026-10-01T06:05:00+02:00');
  assert.equal(c2.status, 'amber');
  assert.ok(MIN > 0);
});
