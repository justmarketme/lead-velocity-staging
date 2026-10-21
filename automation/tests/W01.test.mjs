// DRAFT for GATE-TEST-W01 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W01 Lead intake (web)  [+ the intake halves of W02 instant form and W03 Click-to-WhatsApp, which 4.6 says
// work "same as W01"].
// Money rule protected: we only ever count, message and charge for a real, consented, SA mobile lead that is
// not a duplicate, and the broker it is routed to is written BEFORE the first WhatsApp (1.3, 3.3, 2.1.2).
//
// Run:  node --test automation/tests/W01.test.mjs           (offline: the real workflow Code nodes + automation/lib/w01.mjs)
//       N8N_PUBLIC_URL=https://<tunnel> TEST_HOOKS_TOKEN=... node --test automation/tests/W01.test.mjs
//
// What runs offline: the Code nodes of automation/W01.json (Screen -> Guard -> Decide -> Inserted?, Lead ad ->
// submission, Route) executed through _n8ncode.mjs, which load automation/lib/w01.mjs exactly as n8n does
// (require('lv-automation').w01). Only the Postgres / HTTP / Execute Workflow nodes are emulated by a small
// in-memory store below (same columns, same digits-only smc_hash_contact rule). W03's conversation is
// automation/ctwa/w03.js (the module W03.json inlines). No stand-in model of the rules remains in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FIX, MODE, lead, broker, order, clone, ms, iso, D, H, MIN, sha256, online } from './_harness.mjs';
import { runCode, PG_CRED, NOT_RUN, ifBranch, evalParam } from './_n8ncode.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as W01 from '../lib/w01.mjs';

const { toE164, hashContact, IP_LIMIT_PER_HOUR } = W01;
const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const W3 = require('../ctwa/w03.js');
const WF = JSON.parse(readFileSync(new URL('../W01.json', import.meta.url), 'utf8'));

// Code nodes require('lv-automation') (I-46c); _n8ncode.mjs resolves that exact name to automation/index.cjs offline.
const RUN = WF;

const TOKEN = 'test-hooks-token-w01';
const SECRET = 'w01-test-lead-token-secret-0123456789abcdef';
const ENV = { TEST_HOOKS_ENABLED: 'true', TEST_HOOKS_TOKEN: TOKEN, LEAD_TOKEN_SECRET: SECRET, BRAND_ID: '00000000-0000-4000-8000-0000000005c1' }; // brands.id uuid (I-52b guard)
const N = {
  screen: 'Screen (w01.normaliseSubmission + screen)',
  screenIf: 'Screen passed?',
  context: 'Context: counters, prior lead, suppression, brokers',
  turnstileIf: 'Turnstile check needed? (page, secret set, not a test hook)',
  guard: 'Guard (w01.guard) + Lookup needed?',
  guardIf: 'Guard passed?',
  decide: 'Decide (w01.decide) + lead_token',
  kind: 'Kind?',
  inserted: 'Inserted? (a same-event_id race inserts nothing: answer, send nothing)',
  leadAd: 'Lead ad -> submission (w01.normaliseLeadAd + screen)',
  route: 'Route (w01.routeExisting)',
  bandIf: 'Quiz v2: ask the band on WhatsApp? (web lead, budget pending)',
  bandQuestion: 'Budget question (w01.budgetQuestion)',
};

// ============================================================================================
// Offline system: the workflow's Code nodes, with the database / sub-workflow nodes emulated.
// ============================================================================================
const dbBroker = (b) => ({
  id: b.broker_id, broker_id: b.broker_id, brand_id: b.brand_id, status: b.status, routing_on: b.routing_on, active: true,
  bookings_paused: b.bookings_paused, practice_name: b.practice_name, fsp_number: b.fsp_number, consent_mode: b.consent_mode,
  methods_supported: b.methods_supported,
  // capacity from the broker's open CRM lead orders (W01 Context query reads public.smc_order_capacity)
  ...orderFields(b.broker_id, 0),
});
function orderFields(brokerId, attachedNow) {
  const open = FIX.lead_orders.filter((o) => o.broker_id === brokerId && o.status === 'paid');
  const capacity = open.reduce((n, o) => n + o.lead_count, 0);
  const attached = open.reduce((n, o) => n + (o.attached || 0), 0) + attachedNow;
  return { order_capacity: capacity, order_attached: attached, order_remaining: Math.max(0, capacity - attached) };
}

function offlineSystem() {
  const db = { leads: new Map(), capi: [], jobs: [], activities: [], suppression: [], messages: [], events: [], sends: [] };
  const brokersOf = (brand) => FIX.brokers.filter((b) => b.brand_id === brand).map((b) => ({ ...dbBroker(b), ...orderFields(b.broker_id, [...db.leads.values()].filter((l) => l.broker_id === b.broker_id).length) }));

  /** "Context: counters, prior lead, suppression, brokers" (the SQL, in memory; counts are taken before this request). */
  function context(s, brand) {
    const k = s.keys || {};
    const count = (src, prefix, win) => (prefix ? db.events.filter((e) => e.source === src && e.external_id.startsWith(prefix) && s.now - e.t < win).length : 0);
    const ip_hits = count('w01_ip', k.ip_prefix, H);
    const number_hits = count('w01_num', k.num_prefix, D);
    for (const [src, id] of [['w01_ip', k.ip_external_id], ['w01_num', k.num_external_id]])
      if (id && !db.events.some((e) => e.source === src && e.external_id === id)) db.events.push({ source: src, external_id: id, t: s.now });
    const h = hashContact(s.mobile);
    const p = [...db.leads.values()].filter((l) => hashContact(l.phone) === h && l.brand_id === brand).sort((a, b) => ms(b.created_at) - ms(a.created_at))[0];
    return {
      brand_uuid: brand, ip_hits, number_hits,
      prior: p ? { id: p.id, brand_id: p.brand_id, created_at: p.created_at, line_type: p.line_type, duplicate_of: p.duplicate_of ?? null, broker_id: p.broker_id, opted_out_at: p.opted_out_at } : null,
      suppressed: db.suppression.some((x) => x.mobile_hash === h && (x.brand_id == null || x.brand_id === brand)),
      brokers: brokersOf(brand),
    };
  }

  const opts_turnstile = () => ({ success: true, hostname: 'sortmycover.co.za', action: 'lead' }); // siteverify reply (offline)
  /** Screen output (or Lead ad output) -> Context -> Guard -> [Twilio Lookup] -> Decide -> Kind -> writes. */
  async function pipeline(s, { env, brand, lookupResponse }) {
    if (!s.scr.ok) return { http: s.http, decision: null };
    const ctx = context(s, brand);
    // Real node sequence (I-53l): the Turnstile IF is evaluated; on its false branch Guard's input is the Context item
    // and the IF's output 0 is empty (NOT_RUN), exactly as n8n presents it.
    const tsNeeded = ifBranch(RUN, N.turnstileIf, { json: ctx, env, refs: { [N.screenIf]: s } });
    const gIn = tsNeeded ? opts_turnstile(s) : ctx;
    const [g] = await runCode(RUN, N.guard, { json: gIn, items: [gIn], env, refs: { [N.screenIf]: s, [N.context]: ctx, [N.turnstileIf]: tsNeeded ? ctx : NOT_RUN } });
    if (!g.json.g.ok) return { http: g.json.http, decision: null };
    const input = g.json.need_lookup ? lookupResponse ?? { error: { message: 'twilio 503' } } : g.json;
    const [d] = await runCode(RUN, N.decide, { json: input, env, refs: { [N.guardIf]: g.json } });
    const out = d.json;
    if (out.kind === 'duplicate') {
      const a = out.decision.activities[0];
      if (!db.activities.some((x) => x.idempotency_key === a.idempotency_key)) db.activities.push({ ...a, workflow: 'W01', kind: a.activity_type });
    }
    if (out.kind === 'insert') {
      const row = out.decision.row;
      const inserted = !db.leads.has(row.id);
      if (inserted) {
        db.leads.set(row.id, { ...row });
        for (const a of out.decision.activities) db.activities.push({ ...a, lead_id: row.id, workflow: 'W01', kind: a.activity_type });
      }
      const [ins] = await runCode(RUN, N.inserted, { items: inserted ? [{ lead_id: row.id }] : [], env, refs: { [N.kind]: out } });
      const c = ins.json.capi;
      if (c && !db.capi.some((e) => e.event_id === c.event_id && e.event_name === c.event_name)) db.capi.push(c); // CAPI Send: unique(event_id, event_name)
      const ft = ins.json.first_touch;
      if (ft) db.jobs.push({ workflow: ft.workflow, lead_id: ft.lead_id, not_before: ft.not_before, op: ft.op });
      // quiz v2 (2026-10-14): the branch "Quiz v2: ask the band on WhatsApp?" -> "Budget question (w01.budgetQuestion)" -> WhatsApp Send
      if (ifBranch(RUN, N.bandIf, { json: ins.json })) {
        const [bq] = await runCode(RUN, N.bandQuestion, { items: [ins.json], env });
        db.sends.push(bq.json);
      }
    }
    return { http: out.http, decision: out.decision, result: out.result };
  }

  const view = (row) => {
    if (!row) return null;
    const created = db.activities.find((a) => a.lead_id === row.id && a.activity_type === 'lead_created');
    // Physical columns (phone, consent_mode) plus the names this test was written with (mobile, consent_mode_at_capture).
    return { ...row, mobile: row.phone, consent_mode_at_capture: row.consent_mode, line_type_unverified: !!created?.payload?.lookup_unverified,
      qualified: row.disqualified_reason ? false : row.qualified ?? null };
  };

  return {
    db,
    page: async (fx, opts = {}) => {
      const sub = opts.sub ?? fx.submission;
      const now = opts.now ?? ms(sub.submitted_at);
      let lineType = opts.lineTypeName ?? fx.lookup?.line_type ?? 'mobile';
      let outage = false;
      if (opts.lineType) { try { lineType = opts.lineType(); } catch { outage = true; } }
      const headers = { 'content-type': 'application/json', 'cf-connecting-ip': sub.context?.client_ip, 'user-agent': sub.context?.client_user_agent };
      if (opts.hooks !== false) Object.assign(headers, { 'x-test-token': TOKEN, 'x-test-now': iso(now) }, outage ? {} : { 'x-test-lookup-line-type': lineType });
      const env = { ...ENV, ...(outage ? { TWILIO_LOOKUP_ENABLED: 'true' } : {}) };
      const [s] = await runCode(RUN, N.screen, { json: { headers, body: sub }, env });
      if (opts.hooks === false) s.json.now = now; // the virtual clock (n8n uses the wall clock when test hooks are off)
      const r = await pipeline(s.json, { env, brand: 'smc', lookupResponse: outage ? { error: { message: 'twilio 503' } } : undefined });
      return { http_status: r.http.http_status, body: r.http.body };
    },
    leadAd: async (item) => {
      const [s] = await runCode(RUN, N.leadAd, { items: [item], env: ENV });
      const r = await pipeline(s.json, { env: ENV, brand: item.lead.brand_id });
      return { http_status: r.decision?.response.http_status ?? s.json.http?.http_status, body: r.decision ? r.decision.response.body : s.json.http?.body, result: r.result };
    },
    /** W03 conversation (ctwa/w03.js, the module W03.json inlines) + W01 Lead core route (lib routeExisting, the Route node's call). */
    ctwa: async (fx) => {
      const c = fx.submission;
      const mobile = toE164('+' + c.wa_id);
      const lid = fx.lead_id ?? `lead_test_${fx.fixture_id}`;
      let thread = null;
      const out = [];
      for (const [i, m] of c.inbound.entries()) {
        const msg = { from: c.wa_id, id: `wamid.TEST.${i}`, timestamp: String(Math.floor(ms(m.at) / 1000)) };
        if (m.type === 'text') Object.assign(msg, { type: 'text', text: { body: m.text } }, m.referral ? { referral: m.referral } : {});
        else Object.assign(msg, { type: 'interactive', interactive: m.type === 'list' ? { type: 'list_reply', list_reply: { id: m.payload, title: m.payload } } : { type: 'button_reply', button_reply: { id: m.payload, title: m.payload } } });
        const r = W3.step(thread, msg, { at: m.at, mobile, profile_name: c.profile_name, lead_id: lid, broker: broker(), brand: { brand_id: 'smc', consent_mode: FIX.brand.consent_mode }, existing_open_lead_id: null, suppressed: false, is_synthetic: true });
        thread = r.thread;
        for (const a of r.actions) {
          if (a.kind === 'send') out.push({ at: m.at, kind: !out.length ? 'consent_buttons' : thread?.stage === 'closed' ? 'polite_close' : 'question', text: a.message.body });
          if (a.kind === 'insert_lead') db.leads.set(a.row.id, { ...a.row, created_at: m.at });
          if (a.kind === 'update_lead') Object.assign(db.leads.get(a.id), a.set);
          // W03.json: INSERT INTO suppression VALUES (public.smc_hash_contact($1), 'no_consent_ctwa', brand) - digits-only hash of the number.
          if (a.kind === 'suppress') db.suppression.push({ mobile_hash: hashContact(mobile), source: a.source, brand_id: 'smc', lead_id: null, added_at: m.at });
          if (a.kind === 'capi') db.capi.push({ lead_id: lid, event_name: a.event_name, event_id: a.event_id, action_source: a.action_source });
          if (a.kind === 'route_and_first_touch') {
            const l = db.leads.get(a.lead_id);
            const rt = W01.routeExisting(l, { brokers: brokersOf('smc'), now: ms(m.at) });
            if (rt.update) Object.assign(l, rt.update);
            if (rt.first_touch) db.jobs.push({ workflow: 'W06', lead_id: l.id, not_before: rt.first_touch.not_before });
          }
        }
      }
      db.messages.push(...out.map((o) => ({ ...o, to: mobile })));
      const row = [...db.leads.values()].find((l) => l.phone === mobile) ?? null;
      return { lead: view(row), messages: out };
    },
    state: async (leadId) => ({
      lead: view(db.leads.get(leadId)),
      capi: db.capi.filter((e) => e.lead_id === leadId),
      jobs: db.jobs.filter((j) => j.lead_id === leadId),
      activities: db.activities.filter((a) => a.lead_id === leadId),
    }),
    leadsByMobile: async (m) => [...db.leads.values()].filter((l) => l.phone === m),
    suppression: async () => db.suppression,
    messagesTo: async (m) => db.messages.filter((x) => x.to === m),
    suppress: async (m) => db.suppression.push({ mobile_hash: hashContact(m), source: 'stop', brand_id: null }),
  };
}

/** The W02 "ingest" item (W02.json "Fetch lead via Graph + backstop") built from an instant-form fixture. */
function ingestItem(fx, { withText = true } = {}) {
  const p = fx.submission;
  const f = Object.fromEntries(p.field_data.map((x) => [x.name, x.values[0]]));
  return { action: 'ingest', lead: {
    origin: 'lead_ad', brand_id: 'smc', leadgen_id: p.leadgen_id, form_id: p.form_id, full_name: f.first_name, mobile_raw: f.phone_number,
    campaign_id: p.campaign_id, adset_id: p.adset_id, ad_id: p.ad_id, age_band: f.age_band, budget_band: f.budget_band,
    bond_children: { bond: f.has_bond === 'yes', children: f.has_dependants === 'yes' }, preferred_method: f.preferred_method,
    consent: withText
      ? { given: p.custom_disclaimer_responses.some((r) => r.checkbox_key === 'consent' && r.is_checked === '1'), text_version: p.consent_text_version, text: FIX.consent_texts[p.consent_text_version], captured_at: p.created_time }
      : { given: true, source: 'meta_instant_form', text_version: 'CONSENT-NAMED-v3+CONSENT-ADS-v1', captured_at: p.created_time },
    is_synthetic: true } };
}

function onlineSystem() {
  const hdr = (fx, o = {}) => ({ 'x-test-lookup-line-type': o.lineTypeName ?? fx.lookup?.line_type ?? 'mobile' });
  return {
    page: async (fx, opts = {}) => online.post('/lead', opts.sub ?? fx.submission, { now: opts.now ?? fx.submission.submitted_at, headers: hdr(fx, opts) }),
    leadAd: async (item) => online.post('/test/leadgen', item, {}),
    ctwa: async (fx) => {
      for (const m of fx.submission.inbound)
        await online.waInbound({ from: fx.submission.wa_id, now: ms(m.at), text: m.text, buttonPayload: m.type === 'button' ? m.payload : undefined, listId: m.type === 'list' ? m.payload : undefined });
      const s = await online.get(`/test/state?mobile=%2B${fx.submission.wa_id}`);
      return { lead: s.body?.lead ?? null, messages: s.body?.messages ?? [] };
    },
    state: (leadId) => online.state(leadId),
    leadsByMobile: async (m) => (await online.get(`/test/state?mobile=${encodeURIComponent(m)}`)).body?.leads ?? [],
    suppression: async () => (await online.get('/test/suppression')).body ?? [],
    messagesTo: async (m) => (await online.get(`/test/state?mobile=${encodeURIComponent(m)}`)).body?.messages ?? [],
    suppress: async (m) => online.post('/test/suppress', { mobile: m, source: 'stop' }),
  };
}
const fresh = () => (MODE === 'online' ? onlineSystem() : offlineSystem());

// ============================================================================================
// Structure: the committed automation/W01.json
// ============================================================================================
test('W01 structure: id smc-w01, inactive, nodes present, every connection resolves, credentials by name', () => {
  assert.equal(WF.id, 'smc-w01');
  assert.equal(WF.active, false);
  const names = new Set(WF.nodes.map((n) => n.name));
  assert.equal(names.size, WF.nodes.length, 'unique node names');
  const types = new Set(WF.nodes.map((n) => n.type));
  for (const t of ['webhook', 'code', 'postgres', 'if', 'switch', 'respondToWebhook', 'httpRequest', 'executeWorkflow', 'executeWorkflowTrigger'])
    assert.ok(types.has(`n8n-nodes-base.${t}`), t);
  for (const n of Object.values(N)) assert.ok(names.has(n), n);
  for (const [from, c] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), `connection source ${from}`);
    for (const out of c.main) for (const e of out) assert.ok(names.has(e.node), `${from} -> ${e.node}`);
  }
  for (const n of WF.nodes.filter((x) => x.credentials)) for (const cr of Object.values(n.credentials)) {
    assert.equal(cr.id, '', `${n.name}: credential by name only`);
    assert.ok(cr.name, n.name);
  }
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) assert.equal(n.credentials.postgres.name, PG_CRED, n.name);
  assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  const paths = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook').map((n) => n.parameters.path).sort();
  assert.deepEqual(paths, ['lead', 'lead/skip']);
});

test('W01 structure: Code nodes load lib/w01.mjs via lv-automation (no REPO_DIR import), sub-workflows referenced by id', () => {
  const codes = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
  for (const name of [N.screen, N.guard, N.decide, N.leadAd, N.route])
    assert.match(codes.find((n) => n.name === name).parameters.jsCode, /require\('lv-automation'\)\.w01;/, name);
  for (const n of codes) {
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL/, n.name);
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /lv-automation\//, `${n.name}: no subpath require`);
  }
  const subs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow');
  assert.ok(subs.length >= 4);
  for (const n of subs) {
    const ref = n.parameters.workflowId;
    assert.equal(ref.mode, 'id', n.name);
    const want = /^W(\d\d)\b/.exec(ref.cachedResultName);
    assert.equal(ref.value, want ? `smc-w${want[1]}` : ref.cachedResultName === 'WhatsApp Send' ? 'smc-whatsapp-send' : 'smc-capi-send', n.name);
  }
  assert.deepEqual([...new Set(subs.map((n) => n.parameters.workflowId.value))].sort(), ['smc-capi-send', 'smc-w06', 'smc-whatsapp-send']); // smc-whatsapp-send: the qualify_budget first touch (budget band moved out of the instant form, 2026-10-05)
});

test('W01 structure: every column the SQL names exists in the migrations', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
});

// ============================================================================================
// Behaviour (offline = the workflow's own Code nodes)
// ============================================================================================
test(`W01 [${MODE}] SA numbers normalise to E.164; anything else is refused`, () => {
  const ok = { '060 000 0101': '+27600000101', '+27 60 000 0101': '+27600000101', '0027600000101': '+27600000101', '27600000101': '+27600000101', '060-000-0110': '+27600000110', '(060) 000 0102': '+27600000102' };
  for (const [raw, want] of Object.entries(ok)) assert.equal(toE164(raw), want, raw);
  for (const bad of ['12345', '060 000 001', '+44 20 7946 0000', '0000000000', '', null, '+27 0600000101'])
    assert.equal(toE164(bad), null, String(bad));
});

test(`W01 [${MODE}] every page fixture gets the expected intake result`, async () => {
  const sys = fresh();
  for (const id of ['L01', 'L02', 'L07', 'L08', 'L10']) {
    const fx = lead(id);
    const exp = fx.expected.W01;
    const r = await sys.page(fx);
    assert.equal(r.http_status ?? r.status, exp.http_status, `${id} http`);
    assert.equal(r.body.status, exp.status, `${id} status`);
    if (exp.error_code) assert.equal(r.body.error_code, exp.error_code);
    if (exp.page_message) assert.equal(r.body.page_message, exp.page_message);
    if (exp.lead_row === false) {
      assert.equal((await sys.leadsByMobile(toE164(fx.submission.mobile))).length, 0, `${id} must not be stored`);
      continue;
    }
    const s = await sys.state(r.body.lead_id);
    if (exp.mobile) assert.equal(s.lead.mobile, exp.mobile);
    if ('broker_id' in exp) assert.equal(s.lead.broker_id ?? null, exp.broker_id, `${id} broker`);
    if (exp.delete_after) assert.equal(s.lead.retention_delete_after, exp.delete_after, `${id} out-of-band deleted within 24 h`);
    if (exp.first_touch === false) assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0, `${id} no WhatsApp`);
    if (exp.capi_lead === false) assert.equal(s.capi.filter((e) => e.event_name === 'Lead').length, 0, `${id} no CAPI Lead`);
  }
});

test(`W01 [${MODE}] landline and VoIP are rejected at the page with a friendly message; nothing stored`, async () => {
  const sys = fresh();
  for (const t of ['landline', 'voip', 'fixedVoip', 'nonFixedVoip', 'tollFree']) {
    const fx = clone(lead('L08'));
    fx.lookup.line_type = t;
    const r = await sys.page(fx, { lineType: () => t, lineTypeName: t });
    assert.equal(r.http_status ?? r.status, 422, t);
    assert.equal(r.body.page_message, 'Please use a mobile number.');
  }
  assert.equal((await sys.leadsByMobile('+27600000108')).length, 0);
});

test(`W01 [${MODE}] consent text, version, time, page and source are stored verbatim; attribution kept`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const r = await sys.page(fx);
  const l = (await sys.state(r.body.lead_id)).lead;
  const c = fx.submission.consent;
  assert.equal(l.consent_text, c.text);
  assert.equal(l.consent_text_version, c.version);
  assert.equal(ms(l.consent_at), ms(c.at));
  assert.equal(l.consent_page_url, c.page_url);
  assert.equal(l.consent_source, 'page');
  assert.equal(l.consent_mode_at_capture, 'named');
  assert.ok(l.consent_ads_at, 'advertising sentence ticked -> consent_ads_at set');
  for (const k of ['fbclid', 'fbp', 'fbc', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ad_id'])
    assert.equal(l[k], fx.submission.context[k], k);
  assert.equal(l.lead_event_id, fx.submission.context.event_id);
});

test(`W01 [${MODE}] unticked or missing consent -> 422, nothing stored`, async () => {
  const sys = fresh();
  for (const mutate of [(s) => { s.consent.checked = false; }, (s) => { delete s.consent; }]) {
    const fx = clone(lead('L02'));
    mutate(fx.submission);
    const r = await sys.page(fx, { sub: fx.submission });
    assert.equal(r.http_status ?? r.status, 422);
    assert.equal(r.body.error_code, 'consent_required');
  }
  assert.equal((await sys.leadsByMobile('+27600000102')).length, 0);
});

test(`W01 [${MODE}] routing writes broker_id (to a broker with an open paid lead order) BEFORE the first-touch job exists`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const r = await sys.page(fx);
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.equal(order().broker_id, s.lead.broker_id, 'the broker holds the open SortMyCover lead order the database attaches the lead to');
  assert.equal(s.lead.cycle_id, undefined, 'no cycles in the CRM chain');
  assert.ok(s.lead.routed_at, 'routed_at written');
  const ft = s.jobs.find((j) => j.workflow === 'W06');
  assert.ok(ft, 'first-touch job queued');
  assert.ok(ms(ft.not_before) >= ms(s.lead.routed_at), 'first touch can never precede routing');
});

test(`W01 [${MODE}] named consent must name the broker we route to, otherwise the lead is held (not messaged)`, async () => {
  const sys = fresh();
  const fx = clone(lead('L02'));
  fx.submission.consent.text = fx.submission.consent.text.replace(`${broker().practice_name} (FSP ${broker().fsp_number})`, 'Other Practice (FSP 99999)');
  const r = await sys.page(fx, { sub: fx.submission });
  assert.equal(r.body.status, 'held');
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id ?? null, null);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0);
  assert.equal(s.capi.length, 0, 'R6-11 / I-49c: held -> no CAPI Lead until handed over');
});

test(`W01 [${MODE}] CAPI Lead reuses the browser event_id; fallback evt_<lead_id>_lead; no ads consent -> not sent`, async () => {
  const sys = fresh();
  const r1 = await sys.page(lead('L01'));
  const s1 = await sys.state(r1.body.lead_id);
  assert.deepEqual(s1.capi.filter((e) => e.event_name === 'Lead').map((e) => e.event_id), [lead('L01').expected.W01.capi_lead_event_id]);

  const fx2 = clone(lead('L02'));
  delete fx2.submission.context.event_id; // JS off
  const r2 = await sys.page(fx2, { sub: fx2.submission });
  const s2 = await sys.state(r2.body.lead_id);
  assert.deepEqual(s2.capi.map((e) => e.event_id), [`evt_${r2.body.lead_id}_lead`]);

  const fx3 = clone(lead('L10'));
  fx3.submission.consent.includes_ads_sentence = false;
  const r3 = await sys.page(fx3, { sub: fx3.submission });
  assert.equal((await sys.state(r3.body.lead_id)).capi.length, 0, 'consent gate');
});

test(`W01 [${MODE}] duplicate within 90 days merges: no new lead, no WhatsApp, no CAPI Lead; day 91 is a new lead`, async () => {
  const sys = fresh();
  const first = await sys.page(lead('L01'));
  const dupFx = lead('L09');
  const r = await sys.page(dupFx, { leadId: 'lead_test_L09' });
  // GATE-TEST-W01: fixture expected status 'duplicate' + duplicate_of; 0.1/CONTRACTS says the /lead reply is 'accepted' with a fresh lead_token for the EXISTING lead, the page never learns it was a duplicate (CONTRACTS "lead_token" + "W01 / W06 / W15 interfaces"; needs-human-log 2026-10-03 (a))
  assert.equal(r.body.status, 'accepted');
  assert.equal(r.body.lead_id, first.body.lead_id);
  if (MODE === 'offline') {
    const v = LT.verifyLeadToken(r.body.lead_token, { secret: SECRET });
    assert.ok(v.ok && v.lead_id === first.body.lead_id, 'fresh token for the existing lead');
    assert.equal(r.body.duplicate_of, undefined, 'the page never learns');
  }
  assert.equal((await sys.leadsByMobile('+27600000101')).length, 1, 'one lead row');
  const s = await sys.state(first.body.lead_id);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 1, 'no second first-touch');
  assert.equal(s.capi.filter((e) => e.event_name === 'Lead').length, 1, 'no second CAPI Lead');
  assert.ok(s.activities.some((a) => a.kind === 'duplicate_submission'), 'merge logged on the timeline');

  // Same person resubmits 91 days after the first lead -> a new lead.
  const late = clone(lead('L09'));
  const t91 = ms(lead('L01').submission.submitted_at) + 91 * D;
  late.submission.submitted_at = iso(t91);
  late.submission.context.event_id = '5b0f7a2e-0009-4c1a-9a51-000000000091';
  const r91 = await sys.page(late, { sub: late.submission, now: t91, leadId: 'lead_test_L09_day91' });
  assert.equal(r91.body.status, 'accepted');
  assert.notEqual(r91.body.lead_id, first.body.lead_id, 'day 91 is a new lead');
});

test(`W01 [${MODE}] double-submit (same event_id, same number) is idempotent`, async () => {
  const sys = fresh();
  const fx = lead('L10');
  const a = await sys.page(fx);
  const b = await sys.page(fx, { now: ms(fx.submission.submitted_at) + 3000, leadId: 'lead_test_L10_again' });
  // GATE-TEST-W01: fixture expected status 'duplicate' + duplicate_of; 0.1/CONTRACTS says 'accepted' + the existing lead_id (the page never learns) (needs-human-log 2026-10-03 (a))
  assert.equal(b.body.status, 'accepted');
  assert.equal(b.body.lead_id, a.body.lead_id);
  assert.equal((await sys.state(a.body.lead_id)).capi.length, 1);
});

test(`W01 [${MODE}] honeypot filled -> looks accepted to the bot, nothing stored, nothing sent (6B.5)`, async () => {
  const sys = fresh();
  const fx = clone(lead('L02'));
  fx.submission.honeypot = 'http://spam.example';
  const r = await sys.page(fx, { sub: fx.submission });
  assert.equal(r.http_status ?? r.status, 200);
  assert.equal((await sys.leadsByMobile('+27600000102')).length, 0);
});

test(`W01 [${MODE}] more than ${IP_LIMIT_PER_HOUR} submissions per IP per hour -> 429`, async (t) => {
  if (MODE === 'online') return t.skip('rate limit is exercised by the devops-security load test, not here');
  const sys = fresh();
  let last;
  for (let i = 0; i <= IP_LIMIT_PER_HOUR; i++) {
    const fx = clone(lead('L02'));
    fx.submission.mobile = `0600000${String(20 + i).padStart(3, '0')}`;
    // Test hooks off: the per-IP counter is live (hooks bypass it by design, W03-notes B.4).
    last = await sys.page(fx, { sub: fx.submission, now: ms(fx.submission.submitted_at) + i * MIN, leadId: `lead_rl_${i}`, hooks: false });
  }
  assert.equal(last.http_status, 429);
});

test(`W01 [${MODE}] Lookup outage fails open: lead accepted, line_type 'unknown' flagged (speed beats a dead API)`, async (t) => {
  if (MODE === 'online') return t.skip('needs a Lookup fault-injection hook; covered in the 6B.10 drill');
  const sys = fresh();
  const r = await sys.page(lead('L02'), { lineType: () => { throw new Error('twilio 503'); } });
  assert.equal(r.body.status, 'accepted');
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.line_type, 'unknown');
  assert.equal(l.line_type_unverified, true);
});

test(`W01 [${MODE}] a suppressed (STOPped) number is stored but never messaged`, async () => {
  const sys = fresh();
  await sys.suppress('+27600000102');
  const r = await sys.page(lead('L02'));
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0);
});

test(`W02 parity [${MODE}] instant-form lead (L03) gets the same treatment as a page lead`, async () => {
  const sys = fresh();
  const fx = lead('L03');
  const r = await sys.leadAd(ingestItem(fx));
  assert.equal(r.body.status, 'accepted');
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.mobile, fx.expected.W01.mobile);
  assert.equal(s.lead.leadgen_id, fx.expected.W01.leadgen_id);
  assert.equal(s.lead.broker_id, fx.expected.W01.broker_id);
  assert.equal(s.lead.consent_text, FIX.consent_texts['CONSENT-NAMED-v3+CONSENT-ADS-v1']);
  assert.deepEqual(s.capi.map((e) => e.event_id), [`evt_${r.body.lead_id}_lead`]);
});

test(`W02 parity [${MODE}] the production ingest item (registry version, no text) names the practice and is routed, not held`, async (t) => {
  if (MODE === 'online') return t.skip('offline check of the Lead ad -> submission + Decide nodes');
  const sys = fresh();
  const r = await sys.leadAd(ingestItem(lead('L03'), { withText: false }));
  assert.equal(r.body.status, 'accepted');
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.consent_text_version, 'CONSENT-NAMED-v3+CONSENT-ADS-v1');
  assert.ok(l.consent_text.includes(`${broker().practice_name} (FSP ${broker().fsp_number})`), l.consent_text);
  assert.equal(l.broker_id, broker().broker_id);
  assert.equal(r.result.outcome, 'accepted');
});

test(`W03 parity [${MODE}] CTWA consent-yes (L04): row at consent, verified by the tap, routed after qualifying`, async () => {
  const sys = fresh();
  const fx = lead('L04');
  const { lead: l } = await sys.ctwa(fx);
  const e = fx.expected.W01;
  assert.equal(ms(l.created_at), ms(e.lead_row_at));
  assert.equal(ms(l.verified_at), ms(e.verified_at));
  assert.equal(ms(l.routed_at), ms(e.routed_at));
  assert.equal(l.broker_id, e.broker_id);
  // GATE-TEST-W01: fixture expected consent_text_version 'ctwa-generic-v3' (generic); 0.1/CONTRACTS says named consent while one broker, so W03 asks with 'ctwa-named-v3' (NH-40 / needs-human-log 2026-10-03 (c))
  assert.equal(l.consent_text_version, MODE === 'offline' ? W3.CONSENT_NAMED_VERSION : e.consent_text_version);
  assert.equal(l.ctwa_clid, e.ctwa_clid);
});

test(`W03 parity [${MODE}] CTWA consent-no (L05): no lead row, only a hashed number for suppression, broker never named after "No"`, async () => {
  const sys = fresh();
  const fx = lead('L05');
  const { lead: l } = await sys.ctwa(fx);
  assert.equal(l, null);
  assert.equal((await sys.leadsByMobile('+27600000105')).length, 0);
  // GATE-TEST-W01: fixture expected sha256('+27600000105'); 0.1/CONTRACTS says digits-only smc_hash_contact (migration 12, I-38a) (needs-human-log 2026-10-03 (b))
  const want = MODE === 'offline' ? hashContact('+27600000105') : sha256('+27600000105');
  assert.equal(hashContact('+27600000105'), sha256('27600000105'));
  const supp = (await sys.suppression()).filter((s) => s.mobile_hash === want);
  assert.equal(supp.length, 1);
  assert.equal(supp[0].source, 'no_consent_ctwa');
  const msgs = await sys.messagesTo('+27600000105');
  // GATE-TEST-W01: fixture expected the broker never named to a non-consenting person; 0.1/CONTRACTS (named consent, ctwa-named-v3) names the practice IN the consent prompt so the person can decide; nothing after "No" names it (NH-40 / needs-human-log 2026-10-03 (c))
  if (MODE === 'offline') {
    assert.ok(msgs[0].kind === 'consent_buttons' && msgs[0].text.includes(broker().practice_name), 'named consent prompt names the practice');
    assert.ok(!JSON.stringify(msgs.slice(1)).includes(broker().practice_name), 'broker not named after "No thanks"');
    assert.ok(!JSON.stringify(msgs.slice(1)).includes('FSP'), 'no FSP after "No thanks"');
  } else assert.ok(!JSON.stringify(msgs).includes(broker().practice_name), 'broker not named to a non-consenting person');
});

test(`W03 parity [${MODE}] CTWA over-50 (L06, 18 Oct 2026): the age is recorded and the budget asked next; no close, no 24-h delete`, async () => {
  const sys = fresh();
  const fx = lead('L06');
  const { lead: l, messages } = await sys.ctwa(fx);
  const e = fx.expected.W01;
  assert.equal(l.age_band, e.age_band);
  assert.equal(l.disqualified_reason ?? null, null);
  assert.equal(l.retention_delete_after ?? null, null);
  assert.equal(messages.some((m) => m.kind === 'polite_close'), false);
  assert.match(messages.at(-1).text, /put towards cover each month/, 'the budget question is next');
});

// ============================================================================================
// The Code nodes on their own (what n8n runs, through _n8ncode.mjs)
// ============================================================================================
test('W01 node "Route (w01.routeExisting)" (W03 hand-off): routes once, then reports already_routed', async () => {
  const fx = lead('L04');
  const row = { id: fx.lead_id, brand_id: 'smc', origin: 'ctwa', broker_id: null, routed_at: null, opted_out_at: null, disqualified_reason: null,
    consent_text: W3.consentFor('named', broker()).text, consent_mode: 'named', suppressed: false };
  const brokers = FIX.brokers.map(dbBroker);
  const [a] = await runCode(RUN, N.route, { items: [{ lead: row, brokers }], env: ENV });
  assert.equal(a.json.r.action, 'routed');
  assert.equal(a.json.update.broker_id, broker().broker_id);
  assert.equal(a.json.r.first_touch.workflow, 'W06');
  const [b] = await runCode(RUN, N.route, { items: [{ lead: { ...row, ...a.json.update }, brokers }], env: ENV });
  assert.equal(b.json.r.action, 'already_routed');
  const [c] = await runCode(RUN, N.route, { items: [{ lead: { ...row, consent_text: 'I agree to share with Other Practice (FSP 99999).' }, brokers }], env: ENV });
  assert.equal(c.json.r.action, 'held');
});

test('W01 I-49c: a held page lead sends its CAPI Lead only at the hand-over (held -> no item; handed over -> exactly one)', async () => {
  const fx = lead('L02');
  const brokers = FIX.brokers.map(dbBroker);
  const row = { id: fx.lead_id, brand_id: 'smc', origin: 'page', broker_id: null, routed_at: null, opted_out_at: null, disqualified_reason: null,
    consent_text: 'I agree to share with Other Practice (FSP 99999).', consent_mode: 'named', suppressed: false,
    routing_reason: 'held_consent_names_other_practice', consent_ads_at: '2026-10-12T08:00:00+02:00', lead_event_id: 'evt_browser_1', created_at: '2026-10-12T08:00:00+02:00' };
  const hand = 'CAPI Lead at hand-over (held -> routed)';
  const [held] = await runCode(RUN, N.route, { items: [{ lead: row, brokers }], env: ENV });
  assert.equal(held.json.r.action, 'held');
  assert.deepEqual(await runCode(RUN, hand, { items: [{ lead_id: row.id, broker_id: null }], refs: { [N.route]: held.json } }), [], 'held: no CAPI item');
  const fixed = { ...row, consent_text: W3.consentFor('named', broker()).text };
  const [routed] = await runCode(RUN, N.route, { items: [{ lead: fixed, brokers }], env: ENV });
  assert.equal(routed.json.r.action, 'routed');
  const out = await runCode(RUN, hand, { items: [{ lead_id: row.id, broker_id: routed.json.update.broker_id }], refs: { [N.route]: routed.json } });
  assert.equal(out.length, 1, 'handed over: exactly one CAPI Lead');
  assert.deepEqual(out[0].json, { event_name: 'Lead', event_id: 'evt_browser_1', action_source: 'website', lead_id: row.id, brand_id: 'smc', event_time: row.created_at });
  // A CTWA lead is W03's CAPI (never sent here); a lead that was never held sent its Lead at intake.
  const [ctwa] = await runCode(RUN, N.route, { items: [{ lead: { ...fixed, origin: 'ctwa' }, brokers }], env: ENV });
  assert.equal(ctwa.json.r.capi, null);
  const [fresh0] = await runCode(RUN, N.route, { items: [{ lead: { ...fixed, routing_reason: null }, brokers }], env: ENV });
  assert.equal(fresh0.json.r.capi, null);
  const wf = RUN.nodes.find((n) => n.name === 'CAPI Send (Lead at hand-over)');
  assert.equal(wf.parameters.workflowId.value, 'smc-capi-send');
});

test('W01 node "Decide": email kept only for an invite method; CAPI payload carries ids only (never email)', async () => {
  const fx = clone(lead('L01'));
  fx.submission.preferred_method = 'teams';
  fx.submission.email = 'howzit+lerato.test@leadvelocity.co.za';
  const sys = offlineSystem();
  const r = await sys.page(fx, { sub: fx.submission });
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.email, fx.submission.email);
  assert.equal(l.email_purpose, 'meeting_invite');
  const c = sys.db.capi.find((e) => e.lead_id === r.body.lead_id);
  assert.deepEqual(Object.keys(c).sort(), ['action_source', 'brand_id', 'event_id', 'event_name', 'event_time', 'lead_id']);
  assert.ok(r.body.lead_token && LT.verifyLeadToken(r.body.lead_token, { secret: SECRET }).lead_id === r.body.lead_id, 'lead_token minted for the new lead');
  assert.deepEqual(r.body.methods_supported, broker().methods_supported);

  const fx2 = clone(lead('L02'));
  fx2.submission.preferred_method = 'phone';
  fx2.submission.email = 'someone@example.com';
  const r2 = await sys.page(fx2, { sub: fx2.submission });
  assert.equal((await sys.state(r2.body.lead_id)).lead.email, null, 'phone booking: no email stored (0.1 Email)');
});

// ============================================================================================
// I-52b: the fixture's named consent is the registry's text for the SEEDED broker, so a real POST /lead with L01
// passes W01's registry check against supabase/seed/smc_synthetic.sql (rehearsal F3); BRAND_ID must be the uuid (F1).
// ============================================================================================
const AF = await import('./fixtures/align-fixture.mjs');
const SEEDB = AF.seedBroker();
const pageConsentLeads = () => FIX.leads.filter((l) => l.submission && l.submission.consent && typeof l.submission.consent === 'object');

test('I-52b fixture consent = consent.json named text rendered for the seeded practice + FSP; W01 maps it to the seeded broker', async () => {
  // The seeded broker as W01's Context query builds it (practice_name = brokers.firm_name).
  const seeded = { ...dbBroker(broker()), practice_name: SEEDB.practice_name, fsp_number: SEEDB.fsp_number };
  assert.equal(broker().practice_name, SEEDB.practice_name, 'fixture broker practice = seed brokers.firm_name');
  assert.equal(broker().fsp_number, SEEDB.fsp_number, 'fixture broker FSP = seed brokers.fsp_number');
  const registry = W01.consentRegistry(seeded);
  const rendered = registry[AF.NAMED_VERSION];
  const C = JSON.parse(readFileSync(new URL('../../landing/config/consent.json', import.meta.url), 'utf8'));
  assert.equal(AF.NAMED_VERSION, C.named.version, 'the current named version from the registry');
  assert.equal(rendered, `${C.named.text.replace('{practice_name}', SEEDB.practice_name).replace('{fsp_number}', SEEDB.fsp_number)} ${C.ads}`);
  assert.equal(FIX.consent_texts[AF.NAMED_VERSION], rendered);
  assert.ok(!('named-v1-DRAFT' in FIX.consent_texts), 'no DRAFT version left in the fixture');
  const subs = pageConsentLeads();
  assert.ok(subs.length >= 6, 'every page lead with consent is covered');
  for (const fx of subs) {
    if (!fx.submission.consent.checked) continue;
    const sub = W01.normaliseSubmission(fx.submission);
    assert.equal(sub.consent.version, AF.NAMED_VERSION, fx.fixture_id);
    assert.equal(sub.consent.text, rendered, `${fx.fixture_id}: exact registry text`);
    assert.deepEqual(W01.consentAudit(sub, registry), { version: AF.NAMED_VERSION, known_version: true, matches_registry: true }, fx.fixture_id);
    const r = W01.routingFor(sub.consent.text, 'named', [seeded], seeded.brand_id);
    assert.equal(r.held, undefined, `${fx.fixture_id}: not held_consent_names_other_practice`);
    assert.equal(r.broker.broker_id, seeded.broker_id);
  }
  // Lead-ad fixture (L03) resolves its version from the same registry.
  const l3 = lead('L03').submission;
  assert.equal(l3.consent_text_version, AF.NAMED_VERSION);
  // The fixture file is exactly what the generator produces (second run is a no-op).
  const raw = readFileSync(new URL('./fixtures/synthetic-leads.json', import.meta.url), 'utf8');
  assert.equal(AF.align(raw), raw, 'run node automation/tests/fixtures/align-fixture.mjs');
});

test(`W01 [${MODE}] I-52b L01 from the fixture routes to the seeded broker: consent_audit known_version, not held`, async () => {
  const sys = fresh();
  const r = await sys.page(lead('L01'));
  assert.equal(r.http_status, 200);
  assert.equal(r.body.status, 'accepted');
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.notEqual(s.lead.routing_reason, 'held_consent_names_other_practice');
  if (MODE === 'offline') {
    const a = s.activities.find((x) => x.activity_type === 'consent_audit');
    assert.ok(a, 'consent_audit on the timeline');
    assert.deepEqual(a.payload, { version: AF.NAMED_VERSION, known_version: true, matches_registry: true });
  }
});

test('I-52b registry check tolerates nothing it should not: DRAFT / suffixed / re-cased versions are unknown; FSP must match', () => {
  const b = { ...dbBroker(broker()) };
  const reg = W01.consentRegistry(b);
  const text = reg[AF.NAMED_VERSION];
  for (const v of ['named-v1-DRAFT', `${AF.NAMED_VERSION}-DRAFT`, `${AF.NAMED_VERSION} `, AF.NAMED_VERSION.toLowerCase(), 'CONSENT-NAMED-v1', '', null, '__proto__', 'toString'])
    assert.equal(W01.consentAudit({ consent: { version: v, text } }, reg).known_version, false, String(v));
  assert.equal(W01.consentAudit({ consent: { version: AF.NAMED_VERSION, text: text + ' ' } }, reg).matches_registry, false, 'one extra space is a mismatch');
  // A lead-ad version that is not in the registry carries no consent at all.
  const la = W01.normaliseLeadAd({ lead: { mobile_raw: '+27600000103', consent: { given: true, text_version: 'named-v1-DRAFT', captured_at: '2026-10-12T14:40:00+02:00' } } }, {});
  assert.equal(la.consent.checked, false);
  // Named routing: the practice AND its FSP number, as every named text renders them; an empty practice matches nothing.
  assert.equal(W01.routingFor(text.replace(`(FSP ${b.fsp_number})`, '(FSP 99999)'), 'named', [b], b.brand_id).held, 'held_consent_names_other_practice');
  assert.equal(W01.routingFor(text, 'named', [{ ...b, practice_name: '' }], b.brand_id).held, 'held_consent_names_other_practice');
  assert.equal(W01.routingFor(text, 'named', [b], b.brand_id).broker.broker_id, b.broker_id);
});

test('I-52b BRAND_ID must be the brands.id uuid: a slug or empty value fails fast with a clear error (no Postgres cast error)', async () => {
  const U = '00000000-0000-4000-8000-0000000005c1';
  assert.equal(W01.brandUuid(null, U), U);
  assert.equal(W01.brandUuid(U.toUpperCase(), 'smc'), U, 'a uuid brand on the item (W02 ingest) wins');
  for (const bad of ['smc', 'SMC', '', undefined, '1234', `${U}x`]) assert.throws(() => W01.brandUuid('smc', bad), /BRAND_ID must be the brands\.id uuid/, String(bad));
  const fx = lead('L01');
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10' };
  await assert.rejects(runCode(RUN, N.screen, { json: { headers, body: fx.submission }, env: { ...ENV, BRAND_ID: 'smc' } }), /BRAND_ID must be the brands\.id uuid/);
  const [ok] = await runCode(RUN, N.screen, { json: { headers, body: fx.submission }, env: ENV });
  assert.equal(ok.json.brand_id, U, 'Screen hands the uuid to the Context query');
  const item = { lead: { brand_id: 'smc', mobile_raw: '+27600000103', consent: { given: true, text_version: AF.NAMED_VERSION } } };
  await assert.rejects(runCode(RUN, N.leadAd, { items: [item], env: { ...ENV, BRAND_ID: 'smc' } }), /BRAND_ID must be the brands\.id uuid/);
  const ctx = WF.nodes.find((n) => n.name === N.context);
  assert.match(JSON.stringify(ctx.parameters), /\$6::uuid/, 'the Context query still casts; the guard runs before it');
});

test('I-52b fixture lead numbers never collide with the seed (leads +27600000001..10, broker +27600000099)', () => {
  const seedNums = new Set([...AF.seedLeadNumbers(), SEEDB.whatsapp]);
  assert.ok(seedNums.has('+27600000001') && seedNums.has('+27600000099'));
  for (const fx of FIX.leads) {
    const s = fx.submission || {};
    const raw = s.mobile ?? (s.wa_id ? '+' + s.wa_id : (s.field_data || []).find((f) => f.name === 'phone_number')?.values?.[0]);
    const e = toE164(raw);
    assert.ok(e, `${fx.fixture_id}: has a number`);
    assert.ok(!seedNums.has(e), `${fx.fixture_id}: ${e} collides with the seed`);
  }
});

// ============================================================================================
// I-53l: the Guard node on the real page-lead node sequence (Turnstile IF false branch -> output 0 empty).
// ============================================================================================
test('I-53l: page lead with no TURNSTILE_SECRET_KEY / test hook: Guard runs with the Turnstile IF output 0 empty (no 500)', async () => {
  const fx = FIX.leads.find((l) => l.id === 'L01') || FIX.leads[0];
  const headers = { origin: 'https://sortmycover.co.za', 'x-test-token': TOKEN };
  for (const env of [ENV, { ...ENV, TEST_HOOKS_ENABLED: 'false' }, { ...ENV, TURNSTILE_SECRET_KEY: 'sk', TEST_HOOKS_ENABLED: 'false' }]) {
    const [s] = await runCode(RUN, N.screen, { json: { headers, body: fx.submission }, env: { PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za', ...env } });
    if (!s.json.scr.ok) continue;
    const ctx = { brand_uuid: ENV.BRAND_ID, ip_hits: 0, number_hits: 0, prior: null, suppressed: false, brokers: [] };
    const needed = ifBranch(RUN, N.turnstileIf, { json: ctx, env, refs: { [N.screenIf]: s.json } });
    assert.equal(needed, !!env.TURNSTILE_SECRET_KEY && !s.json.test_hooks && s.json.from === 'page');
    const input = needed ? { success: true, hostname: 'sortmycover.co.za', action: 'lead' } : ctx;
    const [g] = await runCode(RUN, N.guard, { json: input, items: [input], env, refs: { [N.screenIf]: s.json, [N.context]: ctx, [N.turnstileIf]: needed ? ctx : NOT_RUN } });
    assert.equal(g.json.g.ok, true, JSON.stringify(g.json.g));
    assert.equal(g.json.g.bot_check, needed ? 'passed' : 'skipped');
  }
  // The Guard code must not read the IF at all (its false branch is the common path).
  const js = RUN.nodes.find((n) => n.name === N.guard).parameters.jsCode;
  assert.doesNotMatch(js, /\$\('Turnstile check needed\?/);
});

// ============================================================================================
// Tier C (Jonathan, 2026-10-11): under R750 is stored and kept open, routed only by the standing yes or an admin
// ============================================================================================
const TC_AT = '2026-10-13T12:00:00+02:00';
const TC_NOW = Date.parse(TC_AT);
const tcBroker = (over = {}) => ({ id: '00000000-0000-4000-8000-0000000b0c01', broker_id: '00000000-0000-4000-8000-0000000b0c01', brand_id: 'smc', status: 'active', routing_on: true,
  practice_name: 'Synthetic Practice', fsp_number: 'TEST-00000', consent_mode: 'named', methods_supported: ['phone'], order_capacity: 5, order_attached: 0, order_remaining: 5, ...over });
// 19 Oct 2026: these fixtures use NAMED consent (the practice every tcBroker has). A generic-consent lead is routed only after
// adviser_disclosed for that broker (lib/w01.mjs isGenericConsent), pinned by the generic-consent tests at the end of this file.
const TC_CONSENT = 'synthetic consent text naming Synthetic Practice (FSP TEST-00000)';
const tcSub = (budget) => W01.normaliseSubmission({ first_name: 'Nomsa', mobile: '0600000171', consent: true, consent_text: TC_CONSENT, consent_version: 'CONSENT-NAMED-v1', consent_mode: 'named',
  age_band: '35_44', budget_band: budget, bond: 'yes', dependants: 'kids', work_cover: 'no', lang: 'en', started_at: TC_NOW - 60e3, request_id: 'req-tc-0001', context: { event_id: '5b0f7a2e-00c1-4c1a-9a51-0000000000c1' } }, {});
const tcCtx = (brokers) => ({ now: TC_NOW, line_type: 'mobile', mobile: '+27600000171', lead_id: '00000000-0000-4000-8000-0000000a0c01', brand_id: 'smc', brokers, consent_mode: 'named' });

test('tier C: the band map, tierOf, and the React quiz band 750_1499 (was unmapped, so wrongly out of band)', () => {
  assert.deepEqual(['lt750', '750_1250', '750_1499', '1250_1499', '1250plus', '1500_plus', null].map(W01.tierOf), ['C', 'B', 'B', 'B', 'B', 'A', null]);
  for (const v of ['lt750', 'under_500', '500_750', '<750']) assert.equal(W01.BUDGET_TO_DB[v], 'lt750', v);
  assert.equal(W01.BUDGET_TO_DB['750_1499'], '750_1499');
  assert.ok(W01.KNOWN_BUDGET.has('lt750') && !W01.QUAL_BUDGET.has('lt750'));
});

test('tier C page lead, no broker with the standing yes: stored, held_low_budget (open, not disqualified, no 24-h delete), one honest WhatsApp', () => {
  const d = W01.decide(tcSub('lt750'), tcCtx([tcBroker()]));
  assert.equal(d.kind, 'insert'); assert.equal(d.outcome, 'held');
  assert.deepEqual([d.row.broker_id, d.row.routing_reason, d.row.stage, d.row.disqualified_reason, d.row.retention_delete_after, d.row.budget_band], [null, 'held_low_budget', 'new', null, null, 'lt750']);
  assert.equal(d.first_touch, null, 'no broker intro'); assert.equal(d.capi, null, 'CAPI Lead waits for the hand-over (held_* rule)');
  assert.equal(d.response.body.status, 'held'); assert.ok(!('out_of_band' in d.response.body), 'the page shows no exit card');
  assert.deepEqual([d.notice.template, d.notice.to, d.notice.correlation, d.notice.variables[0]], ['lead_low_budget_held', '+27600000171', `w01:low_budget_held:${d.row.id}`, 'Nomsa']);
  assert.ok(d.activities.some((a) => a.activity_type === 'routing_held' && a.payload.reason === 'held_low_budget' && a.payload.lead_tier === 'C'));
});

test('tier C page lead, a broker with the standing yes and room: routed like any lead (W06 first touch); fairness only among standing-yes brokers', () => {
  const yes = tcBroker({ id: '00000000-0000-4000-8000-0000000b0c02', broker_id: '00000000-0000-4000-8000-0000000b0c02', accepts_low_budget: true, order_attached: 4, order_remaining: 1 });
  const d = W01.decide(tcSub('lt750'), tcCtx([tcBroker(), yes]));
  assert.equal(d.outcome, 'accepted'); assert.equal(d.row.broker_id, yes.broker_id, 'the emptier broker without the standing yes is never picked');
  assert.equal(d.first_touch.workflow, 'W06'); assert.equal(d.notice ?? null, null);
  // no room on the standing-yes broker -> held_low_budget (not held_no_capacity), even though another broker has room
  const full = { ...yes, order_remaining: 0 };
  assert.equal(W01.decide(tcSub('lt750'), tcCtx([tcBroker(), full])).row.routing_reason, 'held_low_budget');
  // tiers A/B are unchanged: any routable broker
  assert.equal(W01.decide(tcSub('750_1250'), tcCtx([tcBroker()])).outcome, 'accepted');
  assert.equal(W01.decide(tcSub('750_1499'), tcCtx([tcBroker()])).outcome, 'accepted', 'React quiz middle band');
});

test('tier C hand-over (W01 Lead core routeExisting): held -> held_low_budget + notice; standing yes -> routed + W06', () => {
  const lead = { id: '00000000-0000-4000-8000-0000000a0c03', brand_id: 'smc', origin: 'ctwa', phone: '+27600000173', first_name: 'Thabo', budget_band: 'lt750', consent_mode: 'named', consent_text: TC_CONSENT };
  const h = W01.routeExisting(lead, { brokers: [tcBroker()], now: TC_NOW });
  assert.deepEqual([h.action, h.update.routing_reason, h.notice.template], ['held', 'held_low_budget', 'lead_low_budget_held']);
  const r = W01.routeExisting(lead, { brokers: [tcBroker({ accepts_low_budget: true })], now: TC_NOW });
  assert.equal(r.action, 'routed'); assert.equal(r.first_touch.op, 'routed');
});

test('tier C sweep: an admin-assigned lead (manual_low_budget) starts the normal booking flow once qualifying is done; held 7 days closes politely', () => {
  const base = { id: '00000000-0000-4000-8000-0000000a0c04', origin: 'page', phone: '+27600000174', first_name: 'Lindi', created_at: '2026-10-05T09:00:00+02:00', conv_state: {} };
  const assigned = { ...base, broker_id: '00000000-0000-4000-8000-0000000b0c01', routing_reason: 'manual_low_budget', order_state: 'attached', first_message_at: null };
  assert.deepEqual(W01.lowBudgetHandoff(assigned), { op: 'routed', lead_id: base.id, origin: 'page', claim_key: `w01:low_budget_handoff:${base.id}` });
  for (const patch of [{ first_message_at: TC_AT }, { opted_out_at: TC_AT }, { order_state: 'released' }, { routing_reason: 'held_low_budget' }, { conv_state: { state: 'q_bond' } }, { broker_id: null }])
    assert.equal(W01.lowBudgetHandoff({ ...assigned, ...patch }), null, JSON.stringify(patch));
  const held = { ...base, broker_id: null, routing_reason: 'held_low_budget', stage: 'qualified' };
  assert.equal(W01.lowBudgetClose(held, Date.parse('2026-10-12T08:59:00+02:00')), null, 'not before 7 days');
  const c = W01.lowBudgetClose(held, Date.parse('2026-10-12T09:00:00+02:00'));
  assert.deepEqual(c.update, { stage: 'unbooked_closed', routing_reason: 'low_budget_no_taker', conv_state_state: 'closed_unbooked', closed_reason: 'low_budget_no_taker' });
  assert.ok(!('retention_delete_after' in c.update), 'not out of band: the normal retention clock applies');
  assert.deepEqual([c.send.template, c.send.correlation], ['lead_low_budget_closed', `w01:low_budget_closed:${base.id}`]);
  assert.equal(W01.lowBudgetClose(held, Date.parse('2026-10-12T21:00:00+02:00')), null, 'never in quiet hours');
  for (const patch of [{ broker_id: 'b' }, { opted_out_at: TC_AT }, { stage: 'unbooked_closed' }, { routing_reason: 'manual_low_budget' }])
    assert.equal(W01.lowBudgetClose({ ...held, ...patch }, Date.parse('2026-10-13T09:00:00+02:00')), null, JSON.stringify(patch));
});

test('W01.json tier C wiring: held notice on both paths via the shared sender; the 15-min sweep hands off to W06 and closes once', async () => {
  const nd = (n) => WF.nodes.find((x) => x.name === n);
  const to = (n) => (WF.connections[n]?.main || []).flat().map((c) => c.node);
  assert.ok(to(N.inserted).includes('Low-budget held notice? (tier C, no broker with the standing yes and room)'));
  assert.deepEqual(to('Low-budget held notice (w01.lowBudgetHeld)'), ['WhatsApp Send (lead_low_budget_held)']);
  assert.ok(to('Write routing (only if not routed yet) + timeline').includes('Low-budget held notice (CTWA / held at intake)'));
  for (const n of ['WhatsApp Send (lead_low_budget_held)', 'WhatsApp Send (lead_low_budget_held, core)', 'WhatsApp Send (lead_low_budget_closed)']) assert.equal(nd(n).parameters.workflowId.value, 'smc-whatsapp-send', n);
  assert.equal(nd('W06 First touch (low-budget hand-off)').parameters.workflowId.value, 'smc-w06');
  assert.match(nd(N.context).parameters.query, /accepts_low_budget/); assert.match(nd('Load CTWA lead + brokers').parameters.query, /accepts_low_budget/);
  assert.match(nd('Tier-C leads: assigned (hand off) or held 7 days (close)').parameters.query, /manual_low_budget[\s\S]*held_low_budget[\s\S]*7 days/);
  assert.match(nd('Close politely (only if still held) + timeline').parameters.query, /l\.routing_reason = 'held_low_budget' AND l\.broker_id IS NULL/);
  // the Plan node runs the lib on the query rows (offline, the real Code node)
  const out = await runCode(WF, 'Plan (w01.lowBudgetHandoff / lowBudgetClose)', { env: ENV, items: [
    { id: '00000000-0000-4000-8000-0000000a0c05', origin: 'ctwa', broker_id: 'b1', routing_reason: 'manual_low_budget', order_state: 'attached', conv_state: { state: 'unbooked' } },
    { id: '00000000-0000-4000-8000-0000000a0c06', phone: '+27600000176', broker_id: null, routing_reason: 'held_low_budget', stage: 'qualified', created_at: '2026-01-01T09:00:00+02:00' },
  ] });
  const types = out.map((i) => i.json.type);
  assert.equal(types[0], 'handoff');
  // the close is skipped only in quiet hours (wall clock); outside them it is planned
  if (types.length > 1) assert.equal(out[1].json.update.routing_reason, 'low_budget_no_taker');
});

// Wills (Jonathan, 2026-10-11): the four theme-B angles route only to brokers with handles_wills
test('wills angles: product_interest wills, routed only to a handles_wills broker, else held_no_wills_broker; life angles unchanged', () => {
  for (const a of ['children-guardian', 'will-myth', 'will-and-cover', 'where-is-the-will']) assert.equal(W01.productOf(a), 'wills', a);
  assert.equal(W01.productOf('new-bond'), 'life_cover');
  const willsSub = (angle) => ({ ...tcSub('1500_plus'), angle });
  const life = tcBroker();
  const wills = tcBroker({ id: '00000000-0000-4000-8000-0000000b0c09', broker_id: '00000000-0000-4000-8000-0000000b0c09', handles_wills: true });
  const held = W01.decide(willsSub('will-myth'), tcCtx([life]));
  assert.deepEqual([held.outcome, held.row.product_interest, held.row.routing_reason, held.row.broker_id], ['held', 'wills', 'held_no_wills_broker', null]);
  const ok = W01.decide(willsSub('children-guardian'), tcCtx([life, wills]));
  assert.equal(ok.row.broker_id, wills.broker_id, 'only the wills broker');
  const lifeLead = W01.decide(willsSub('new-bond'), tcCtx([life]));
  assert.deepEqual([lifeLead.row.product_interest, lifeLead.row.broker_id], ['life_cover', life.broker_id]);
  const rt = W01.routeExisting({ id: 'x', brand_id: 'smc', product_interest: 'wills', consent_mode: 'named', consent_text: TC_CONSENT }, { brokers: [life], now: TC_NOW });
  assert.deepEqual([rt.action, rt.update.routing_reason], ['held', 'held_no_wills_broker']);
  assert.match(WF.nodes.find((n) => n.name === N.context).parameters.query, /'handles_wills', b\.handles_wills/);
  assert.match(WF.nodes.find((n) => n.name === 'Insert lead + timeline (one statement; broker_id written before W06 exists)').parameters.query, /product_interest/);
});

// lv-site fc89d5a (2026-10-11): /book/ asks cover vs will and estate (or ?for=) and sends product_interest in the /lead body
test('page product_interest: whitelisted life_cover | wills is stored and routes; absent or unknown -> derived from the angle; a wills angle always wins', () => {
  const sub = (angle, product_interest) => W01.normaliseSubmission({ first_name: 'Nomsa', mobile: '0600000171', consent: true, consent_text: TC_CONSENT,
    consent_version: 'CONSENT-NAMED-v1', consent_mode: 'named', age_band: '35_44', budget_band: '1500_plus', lang: 'en', started_at: TC_NOW - 60e3,
    request_id: 'req-pi-0001', angle, ...(product_interest === undefined ? {} : { product_interest }), context: { event_id: '5b0f7a2e-00c1-4c1a-9a51-0000000000d1' } }, {});
  assert.equal(sub('cover', 'wills').product_interest, 'wills');
  assert.equal(sub('cover', ' WILLS ').product_interest, 'wills', 'trimmed, case-insensitive');
  for (const bad of ['funeral', '', 42, null, { x: 1 }]) assert.equal(sub('cover', bad).product_interest, null, String(bad));
  assert.equal(sub('cover').product_interest, null);
  const life = tcBroker();
  const wills = tcBroker({ id: '00000000-0000-4000-8000-0000000b0c09', broker_id: '00000000-0000-4000-8000-0000000b0c09', handles_wills: true });
  const row = (s, brokers = [life]) => W01.decide(s, tcCtx(brokers)).row;
  // /book/ wills choice on a life angle: stored as wills, never given to a life-cover broker
  assert.deepEqual([row(sub('cover', 'wills')).product_interest, row(sub('cover', 'wills')).routing_reason, row(sub('cover', 'wills')).broker_id], ['wills', 'held_no_wills_broker', null]);
  assert.equal(row(sub('cover', 'wills'), [life, wills]).broker_id, wills.broker_id);
  // explicit life_cover / absent / unknown on a life angle -> life_cover
  for (const p of ['life_cover', undefined, 'funeral']) assert.equal(row(sub('new-bond', p)).product_interest, 'life_cover', String(p));
  // a wills angle wins over a contradicting life_cover choice
  assert.equal(row(sub('will-myth', 'life_cover')).product_interest, 'wills');
  // the Screen Code node passes the field through unchanged (same normaliseSubmission as n8n runs)
  assert.match(WF.nodes.find((n) => n.name.startsWith('Screen (w01')).parameters.jsCode, /normaliseSubmission\(body/);
});

// ============================================================================================
// Quiz v2 (lv-site a206f12, 2026-10-13): the landing page no longer asks the budget. /lead carries budget_pending: true
// and help_with instead of budget_band. Spec: lv-site deliverables/website/quiz-v2-and-whatsapp-step.md section 2a.
// ============================================================================================
const v2Body = (over = {}, { tc = true } = {}) => {
  const fx = clone(lead('L01'));
  const s = fx.submission;
  if (s.quiz) delete s.quiz.budget_band;
  delete s.budget_band;
  // named consent for the tcBroker practice (tcCtx is named since 19 Oct 2026; generic now needs adviser_disclosed first)
  // (tc: false keeps the fixture's own named text for the seeded broker: the offline system routes to that broker)
  if (tc) { if (s.consent && typeof s.consent === 'object') s.consent.text = TC_CONSENT; else s.consent_text = TC_CONSENT; }
  return { fx, sub: { ...s, budget_pending: true, help_with: 'review', product_interest: 'life_cover', ...over } };
};

test('quiz v2: a web lead with budget_pending is routed (not out of band), gets the lead_token, help_with kept in conv_state, and the band question goes out on WhatsApp', async () => {
  const { fx, sub: pageSub } = v2Body({}, { tc: false });
  const { sub } = v2Body();
  const sys = offlineSystem();
  const r = await sys.page(fx, { sub: pageSub });
  assert.equal(r.body.status, 'accepted'); assert.ok(!r.body.out_of_band, 'no neutral exit');
  assert.ok(r.body.lead_token && LT.verifyLeadToken(r.body.lead_token, { secret: SECRET }).lead_id === r.body.lead_id, 'token minted: the booking widget opens');
  assert.deepEqual(r.body.methods_supported, broker().methods_supported);
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.broker_id, broker().broker_id); assert.equal(l.budget_band ?? null, null); assert.equal(l.disqualified_reason ?? null, null);
  assert.ok(!String(l.routing_reason).startsWith('held_'), 'routed, not held');
  // the band question: the approved qualify_budget template through the shared sender, once (correlation); the W06 first touch is unchanged
  assert.equal(sys.db.sends.length, 1);
  const q = sys.db.sends[0];
  assert.deepEqual([q.kind, q.template, q.to, q.lead_id, q.correlation], ['template', 'qualify_budget', l.phone, l.id, `w01:ask_budget:${l.id}`]);
  assert.deepEqual(q.buttons.map((b) => b.quick_reply), W01.BUDGET_TAP_IDS, 'the template taps are W03 ids');
  assert.deepEqual(sys.db.jobs.map((j) => [j.workflow, j.op]), [['W06', 'routed']], 'the disclosure first touch is still W06');
  // lib level: the same decision, with the conv_state and timeline entry the insert writes
  const s = W01.normaliseSubmission(sub, {});
  assert.deepEqual([s.budget_pending, s.help_with, s.product_interest, s.quiz.budget_band], [true, 'review', 'life_cover', null]);
  const d = W01.decide(s, tcCtx([tcBroker()]));
  assert.deepEqual([d.kind, d.outcome, d.mint_token, d.first_touch.workflow, d.budget_question], ['insert', 'accepted', true, 'W06', true]);
  assert.deepEqual(d.row.conv_state, { state: 'q_budget', budget_pending: true, help_with: 'review' }, 'q_budget is a qualifying state: W07 already sends the tap to W03');
  assert.ok(W01.QUALIFYING_STATES.has(d.row.conv_state.state));
  assert.ok(d.activities.some((a) => a.activity_type === 'budget_question_pending' && a.payload.help_with === 'review'));
  assert.ok(d.activities.some((a) => a.activity_type === 'routed' && a.payload.provisional_tier === 'B'));
  assert.ok(d.capi, 'CAPI Lead at routing, as for any routed page lead');
  // provisional tier B: any routable broker (no standing yes needed); no room -> held_no_capacity (not held_low_budget) and the band is STILL asked
  // (live today no broker is routable yet, so every v2 lead starts here)
  const held = W01.decide(s, tcCtx([tcBroker({ order_remaining: 0 })]));
  assert.deepEqual([held.outcome, held.row.routing_reason, held.budget_question, held.first_touch], ['held', 'held_no_capacity', true, null]);
  assert.deepEqual(held.row.conv_state, { state: 'q_budget', budget_pending: true, help_with: 'review' });
  assert.equal(held.response.body.status, 'held');
  // the insert SQL stores conv_state (the help_with home: no help_with column on public.leads, no DDL)
  assert.match(WF.nodes.find((n) => n.name === 'Insert lead + timeline (one statement; broker_id written before W06 exists)').parameters.query, /j->'conv_state'/);
  // wiring: Inserted? -> IF -> the SAME nodes the lead-ad path uses -> smc-whatsapp-send
  const to = (n) => (WF.connections[n]?.main || []).flat().map((c) => c.node);
  assert.ok(to(N.inserted).includes(N.bandIf)); assert.deepEqual(to(N.bandIf), [N.bandQuestion]);
  assert.deepEqual(to(N.bandQuestion), ['WhatsApp Send (qualify_budget)']);
  assert.equal(WF.nodes.find((n) => n.name === 'WhatsApp Send (qualify_budget)').parameters.workflowId.value, 'smc-whatsapp-send');
  // not for v1 web leads (they send a band) and not for a suppressed number
  assert.ok(!W01.decide(tcSub('750_1499'), tcCtx([tcBroker()])).budget_question, 'v1 web lead: no band question');
  assert.ok(!W01.decide(s, { ...tcCtx([tcBroker()]), suppressed: true }).budget_question, 'suppressed: nothing is sent');
});

test('quiz v2: no-JS form strings ("true"), help_with whitelisted, product derived from help_with; no band and no flag is still out of band', () => {
  const base = { first_name: 'Nomsa', mobile: '0600000171', consent: true, consent_text: TC_CONSENT, consent_version: 'CONSENT-NAMED-v1', consent_mode: 'named',
    age_band: '35_44', lang: 'en', started_at: TC_NOW - 60e3, request_id: 'req-v2-0001', context: { event_id: '5b0f7a2e-00c1-4c1a-9a51-0000000000e1' } };
  const s = W01.normaliseSubmission({ ...base, budget_pending: 'true', help_with: 'wills' }, {});
  assert.deepEqual([s.budget_pending, s.help_with, s.product_interest], [true, 'wills', 'wills'], 'no-JS: wills derived from help_with');
  for (const h of ['life', 'disability_income', 'severe_illness', 'review']) assert.equal(W01.normaliseSubmission({ ...base, help_with: h }, {}).product_interest, 'life_cover', h);
  assert.equal(W01.normaliseSubmission({ ...base, help_with: 'funeral' }, {}).help_with, null);
  assert.equal(W01.normaliseSubmission({ ...base, budget_pending: 'yes' }, {}).budget_pending, false);
  const none = W01.decide(W01.normaliseSubmission(base, {}), tcCtx([tcBroker()]));
  assert.deepEqual([none.outcome, none.row.disqualified_reason], ['not_qualified', 'budget_band'], 'no band, no budget_pending: unchanged rule');
  const wills = W01.decide(s, tcCtx([tcBroker()]));
  assert.deepEqual([wills.outcome, wills.row.routing_reason, wills.row.conv_state.help_with], ['held', 'held_no_wills_broker', 'wills'], 'wills still only to a wills broker');
  // age is still judged on the page: 51+ with budget_pending -> out of band
  assert.equal(W01.decide(W01.normaliseSubmission({ ...base, age_band: '51plus', budget_pending: true }, {}), tcCtx([tcBroker()])).row.disqualified_reason, 'age_band');
});

test('quiz v2: a v1 web lead that still sends a band is unchanged (routed on its tier, no conv_state, no budget-pending entry)', () => {
  const d = W01.decide(tcSub('750_1499'), tcCtx([tcBroker()]));
  assert.equal(d.outcome, 'accepted'); assert.equal(d.row.budget_band, '750_1499'); assert.equal(d.row.conv_state, undefined);
  assert.ok(!d.activities.some((a) => a.activity_type === 'budget_question_pending'));
  assert.equal(W01.decide(tcSub('lt750'), tcCtx([tcBroker()])).row.routing_reason, 'held_low_budget', 'tier C unchanged');
  // a band AND budget_pending (stale client): the band wins, nothing pending
  const both = W01.decide({ ...tcSub('1500_plus'), budget_pending: true }, tcCtx([tcBroker()]));
  assert.equal(both.row.conv_state, undefined); assert.equal(both.row.budget_band, '1500_plus');
});

test('quiz v2: the Meta instant-form path is unchanged (no band -> held_budget_pending, q_budget, W03 ask_budget, no token)', () => {
  const ad = W01.normaliseLeadAd({ lead: { origin: 'lead_ad', brand_id: 'smc', leadgen_id: 'lg_v2_1', form_id: 'f1', full_name: 'Synthetic Lerato', mobile_raw: '+27600000141',
    age_band: '35_44', consent: { given: true, text: 'synthetic consent', text_version: 'x-v1', captured_at: TC_AT } } }, { consent_texts: { 'x-v1': 'synthetic consent' } });
  const d = W01.decide({ ...ad, budget_pending: true, help_with: 'review' }, tcCtx([tcBroker()]));
  assert.deepEqual([d.outcome, d.row.routing_reason, d.row.broker_id, d.row.conv_state.state, d.mint_token, d.first_touch.workflow, d.first_touch.op],
    ['budget_pending', 'held_budget_pending', null, 'q_budget', false, 'W03', 'ask_budget']);
  assert.equal(d.row.conv_state.help_with, undefined, 'help_with is a page field only');
});

test('quiz v2: the band arrives later on the qualify_budget template -> recorded, qualified, routed if held, W05 finalize hands the held booking over', async () => {
  const W5 = await import('../lib/w05.mjs');
  const d = W01.decide(W01.normaliseSubmission(v2Body().sub, {}), tcCtx([tcBroker()]));
  const lead = { ...d.row }; // conv_state is q_budget straight from W01
  const ctx = { at: TC_AT, mobile: lead.phone, brand: { brand_id: 'smc', consent_mode: 'generic' }, existing_open_lead_id: lead.id, lead, broker: null };
  // the question a page lead sees on a re-ask is the template's five bands, forward-looking (never "what do you pay now")
  const t = W3.threadFromLead(lead);
  assert.deepEqual([t.origin, t.stage, t.from_lead], ['page', 'q_budget', true]);
  const q = W3.question('q_budget', null, t);
  assert.deepEqual(q.rows.map((r) => r.id), W01.BUDGET_TAP_IDS);
  assert.doesNotMatch(q.body, /current|paying|premium/i);
  // a template button arrives as { payload } (Twilio ButtonPayload through wa-provider normaliseTwilioInbound)
  const tapMsg = (id) => ({ type: 'button', payload: id });
  const r = W3.step(null, tapMsg('budget_750_1250'), ctx);
  const upd = r.actions.find((a) => a.kind === 'update_lead');
  assert.deepEqual(upd.set, { budget_band: '750_1250', conv_state_state: 'unbooked', qualified_at: TC_AT, stage: 'qualified' }, 'band recorded, lead qualified (age + reason came from the page)');
  assert.deepEqual(r.actions.filter((a) => ['route_and_first_touch', 'finalize_booking'].includes(a.kind)).map((a) => a.kind), ['route_and_first_touch', 'finalize_booking'], 'route first (no-op when routed), then finalize');
  assert.deepEqual(r.actions.find((a) => a.kind === 'finalize_booking'), { kind: 'finalize_booking', op: 'finalize', lead_id: lead.id });
  assert.equal(r.actions.find((a) => a.kind === 'send').message.body, 'Thanks, that helps the adviser prepare.');
  // the routing core is a no-op for a lead that already has its broker
  assert.equal(W01.routeExisting({ ...lead, suppressed: false }, { brokers: [tcBroker()], now: TC_NOW }).action, 'already_routed');
  // offerable: the lead now carries a tier and W05 hands over the held booking (email verified)
  const after = { ...lead, budget_band: upd.set.budget_band, email: 'a@gmail.com', email_verified: true };
  assert.equal(W01.tierOf(after.budget_band), 'B');
  const hold = { id: 'hv2', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', method: 'phone', booked_via: 'page', idempotency_key: 'page:v2:1', verify_by: '2026-10-14T10:00:00+02:00' };
  assert.equal(W5.finalizeRequest(hold, { ...after, budget_band: null }, TC_NOW), null, 'before the band: still held');
  assert.equal(W5.finalizeRequest(hold, after, TC_NOW).finalize_booking_id, 'hv2');
  // every template button: R1,500+ (A), R1,250-R1,499, and the two under-R750 buttons (tier C: band only, never qualified, no thank-you;
  // the database trigger re-holds it unless the broker has the standing yes, and route_and_first_touch sends the one honest held notice)
  const tap = (id) => W3.step(null, tapMsg(id), ctx).actions;
  assert.equal(tap('budget_1500_plus').find((a) => a.kind === 'update_lead').set.budget_band, '1500_plus');
  assert.equal(tap('budget_1250_1499').find((a) => a.kind === 'update_lead').set.budget_band, '1250_1499');
  for (const id of ['budget_under_500', 'budget_500_750']) {
    const a = tap(id);
    assert.deepEqual(a.find((x) => x.kind === 'update_lead').set, { budget_band: 'lt750', conv_state_state: 'unbooked' }, id);
    assert.ok(!a.some((x) => x.kind === 'send'), 'tier C: no thank-you; the held notice (if held) is the one message');
    assert.deepEqual(a.map((x) => x.kind).filter((k) => k === 'route_and_first_touch' || k === 'finalize_booking'), ['route_and_first_touch', 'finalize_booking']);
  }
  // not sure (typed through W07's NLU) -> one re-ask with the same five bands
  const u1 = W3.step(null, { type: 'text', text: 'not sure' }, { ...ctx, typed: { slots: { budget_band: 'unsure' } } });
  assert.equal(u1.actions.find((a) => a.kind === 'update_lead').set.conv_state_state, 'q_budget_clarify');
  assert.deepEqual(u1.actions.find((a) => a.kind === 'send').message.rows.map((x) => x.id), q.rows.map((x) => x.id), 'the re-ask keeps the five bands');
  // a held lead (no broker yet) is routed by the same action once the band is known
  const heldLead = { ...lead, broker_id: null, routed_at: null, routing_reason: 'held_no_capacity' };
  const hr = W01.routeExisting({ ...heldLead, budget_band: '750_1250', suppressed: false }, { brokers: [tcBroker()], now: TC_NOW });
  assert.equal(hr.action, 'routed'); assert.equal(hr.first_touch.workflow, 'W06');
});

test('W39 /start/ page (18 Oct 2026): routeExisting first_touch:false routes the same way with no W06 first touch; a held tier-C lead still gets its notice', async () => {
  const lead = { id: '00000000-0000-4000-8000-0000000a0c38', brand_id: 'smc', origin: 'ctwa', phone: '+27600000178', first_name: 'Thandi', budget_band: '1500_plus', consent_mode: 'named', consent_text: TC_CONSENT };
  const a = W01.routeExisting(lead, { brokers: [tcBroker()], now: TC_NOW });
  const b = W01.routeExisting(lead, { brokers: [tcBroker()], now: TC_NOW, first_touch: false });
  assert.deepEqual(b.update, a.update, 'same broker, same routing');
  assert.equal(a.first_touch.workflow, 'W06');
  assert.equal(b.first_touch, null, 'the page shows the slots: no broker_intro_slots card');
  const held = W01.routeExisting({ ...lead, budget_band: 'lt750' }, { brokers: [tcBroker()], now: TC_NOW, first_touch: false });
  assert.deepEqual([held.action, held.notice.template], ['held', 'lead_low_budget_held']);
  assert.ok(W01.QUALIFYING_STATES.has('start_page'), 'the low-budget hand-off waits while the page is pending');
  // the W01.json nodes: the flag rides from the caller through "Load CTWA lead + brokers" ($2) into Route; W06 only for first_touch
  const load = WF.nodes.find((n) => n.name === 'Load CTWA lead + brokers');
  assert.match(load.parameters.query, /\$2 <> 'false' AS first_touch/);
  assert.match(load.parameters.query, /NULLIF\(\$3, ''\) AS expect_broker_id, \$4 = 'true' AS hold_only/);
  assert.equal(load.parameters.options.queryReplacement, "={{ [$json.lead_id, String($json.first_touch !== false), $json.expect_broker_id || '', String($json.hold_only === true)] }}");
  const routeOut = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: { ...lead, routed_at: null, broker_id: null, suppressed: false }, brokers: [tcBroker()], first_touch: false }] });
  assert.equal(routeOut[0].json.r.first_touch, null);
  const w06 = await runCode(WF, 'W06 input (CTWA)', { items: [{ lead_id: lead.id, broker_id: tcBroker().id }], refs: { 'Route (w01.routeExisting)': routeOut[0].json } });
  assert.deepEqual(w06, [], 'no W06 first touch for the page');
  const ctwa = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: { ...lead, routed_at: null, broker_id: null, suppressed: false }, brokers: [tcBroker()], first_touch: true }] });
  const w06b = await runCode(WF, 'W06 input (CTWA)', { items: [{ lead_id: lead.id, broker_id: tcBroker().id }], refs: { 'Route (w01.routeExisting)': ctwa[0].json } });
  assert.deepEqual(w06b.map((i) => i.json), [{ op: 'routed', lead_id: lead.id, origin: 'ctwa' }], 'W03 path unchanged');
});

test('W39 disclosure before routing: expect_broker_id routes only the confirmed adviser; hold_only records a hold and never routes', async () => {
  const lead = { id: '00000000-0000-4000-8000-0000000a0c39', brand_id: 'smc', origin: 'ctwa', phone: '+27600000179', first_name: 'Thandi', budget_band: '1500_plus', consent_mode: 'named', consent_text: TC_CONSENT };
  const B = tcBroker();
  const ok = W01.routeExisting(lead, { brokers: [B], now: TC_NOW, first_touch: false, expect_broker_id: B.id });
  assert.equal(ok.action, 'routed'); assert.equal(ok.update.broker_id, B.id);
  assert.deepEqual(W01.routeExisting(lead, { brokers: [B], now: TC_NOW, first_touch: false, expect_broker_id: '00000000-0000-4000-8000-00000000ffff' }), { action: 'skip', reason: 'broker_changed' });
  assert.deepEqual(W01.routeExisting(lead, { brokers: [B], now: TC_NOW, first_touch: false, hold_only: true }), { action: 'skip', reason: 'not_disclosed' }, 'a broker that became free is not routed without the card');
  const held = W01.routeExisting({ ...lead, budget_band: 'lt750' }, { brokers: [B], now: TC_NOW, first_touch: false, hold_only: true });
  assert.deepEqual([held.action, held.update.routing_reason, held.notice.template], ['held', 'held_low_budget', 'lead_low_budget_held']);
  const [rt] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: { ...lead, routed_at: null, broker_id: null, suppressed: false }, brokers: [B], first_touch: false, expect_broker_id: 'someone-else', hold_only: false }] });
  assert.deepEqual(rt.json.r, { action: 'skip', reason: 'broker_changed' }, 'the Route node passes the options through');
  const [h] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: { ...lead, routed_at: null, broker_id: null, suppressed: false }, brokers: [B], first_touch: false, expect_broker_id: null, hold_only: true }] });
  assert.equal(h.json.r.reason, 'not_disclosed');
});

// ============================================================================================
// /start/ page web intake (desktop "Book" without a token, Jono 18 Oct 2026): POST /lead with start_page: true
// ============================================================================================
const OPW = { ...tcBroker(), practice_name: 'Oracle Private Wealth', fsp_number: '28418', consent_mode: 'named' };
const spBody = (over = {}) => ({ first_name: 'Thandi', mobile: '0600000181', consent: true,
  consent_text: W01.consentRegistry(OPW)['CONSENT-NAMED-v5web'], consent_version: 'CONSENT-NAMED-v5web', consent_mode: 'named',
  consent_ads: true, consent_ads_text: W01.WEB_CONSENT.ads.text, consent_ads_version: W01.WEB_CONSENT.ads.version,
  page_url: 'https://sortmycover.co.za/start/?ref=w-book&via=google', started_at: TC_NOW - 60e3, request_id: 'req-sp-web-0001', honeypot: '',
  context: { ref: 'w-book', utm: { utm_source: 'google' }, event_id: '5b0f7a2e-00c1-4c1a-9a51-0000000005b1' }, start_page: true, ...over });
const spCtx = (over = {}) => ({ now: TC_NOW, line_type: 'mobile', mobile: '+27600000181', lead_id: '00000000-0000-4000-8000-0000000a05b1', brand_id: 'smc', brokers: [OPW], consent_mode: 'named', ...over });

test('start page web intake: stored with the named v5web consent, NOT routed (start_page_pending), no first touch / WhatsApp / CAPI yet, a lead_token', () => {
  const sub = W01.normaliseSubmission(spBody(), {});
  assert.equal(sub.start_page, true); assert.equal(sub.consent.ads, true, 'the separate ad-measurement choice is recorded');
  const d = W01.decide(sub, spCtx());
  assert.deepEqual([d.kind, d.outcome, d.mint_token], ['insert', 'start_page', true]);
  assert.deepEqual([d.row.broker_id, d.row.routed_at, d.row.routing_reason, d.row.stage, d.row.disqualified_reason], [null, null, 'start_page_pending', 'new', null]);
  assert.deepEqual(d.row.conv_state, { state: 'start_page', via: 'start_page' });
  assert.equal(d.first_touch, null); assert.equal(d.capi, null, 'CAPI Lead at the hand-over (W39 confirm), like a held page lead'); assert.equal(d.notice, undefined);
  assert.equal(d.row.consent_text, W01.consentRegistry(OPW)['CONSENT-NAMED-v5web']);
  assert.match(d.row.consent_text, /Oracle Private Wealth \(FSP 28418\)/);
  assert.ok(d.row.consent_ads_at, 'ads consent recorded');
  assert.deepEqual(W01.consentAudit(sub, W01.consentRegistry(OPW)), { version: 'CONSENT-NAMED-v5web', known_version: true, matches_registry: true }, 'registry check: the exact text for Mark\'s practice');
  assert.equal(W01.consentAudit(W01.normaliseSubmission(spBody({ consent_text: 'edited' }), {}), W01.consentRegistry(OPW)).matches_registry, false);
  assert.deepEqual(W01.pageResponse(d, 'lt1.tok'), { http_status: 200, body: { ok: true, status: 'accepted', lead_id: d.row.id, lead_token: 'lt1.tok' } });
  assert.ok(d.activities.some((a) => a.activity_type === 'start_page_pending'));
  // no answers yet, any age: never out of band here (W39 decides on the page)
  for (const over of [{}, { age_band: '51plus' }, { age_band: 'lt35', budget_band: 'lt750' }]) assert.equal(W01.decide(W01.normaliseSubmission(spBody(over), {}), spCtx()).outcome, 'start_page', JSON.stringify(over));
  // the same body without the flag is the old quiz path (no answers -> out of band)
  assert.equal(W01.decide(W01.normaliseSubmission(spBody({ start_page: false }), {}), spCtx()).outcome, 'not_qualified');
  // a STOPped number stays suppressed, never a token
  const sup = W01.decide(sub, spCtx({ suppressed: true }));
  assert.deepEqual([sup.outcome, sup.mint_token], ['suppressed', false]);
  // a 90-day duplicate gets a fresh token for the EXISTING lead, routed or not (opted out: none)
  const prior = { id: '00000000-0000-4000-8000-0000000a05b0', brand_id: 'smc', created_at: TC_AT, broker_id: null, opted_out_at: null };
  const dup = W01.decide(sub, spCtx({ prior }));
  assert.deepEqual([dup.kind, dup.lead_id, dup.mint_token], ['duplicate', prior.id, true]);
  assert.equal(W01.decide(sub, spCtx({ prior: { ...prior, opted_out_at: TC_AT } })).mint_token, false);
  assert.equal(W01.decide(W01.normaliseSubmission(spBody({ start_page: false }), {}), spCtx({ prior })).mint_token, false, 'the old rule for other page posts');
});

test('start page web lead at the hand-over (W39 confirm): routed like any page lead, CAPI Lead now (start_page_pending counts as held), named consent strict', () => {
  const lead = { id: '00000000-0000-4000-8000-0000000a05b1', brand_id: 'smc', origin: 'page', routing_reason: 'start_page_pending', budget_band: '1500_plus', consent_mode: 'named',
    consent_text: W01.consentRegistry(OPW)['CONSENT-NAMED-v5web'], consent_ads_at: TC_AT, lead_event_id: 'evt-sp', created_at: TC_AT, phone: '+27600000181', first_name: 'Thandi' };
  const r = W01.routeExisting(lead, { brokers: [OPW], now: TC_NOW, first_touch: false, expect_broker_id: OPW.id });
  assert.equal(r.action, 'routed'); assert.equal(r.first_touch, null);
  assert.equal(r.capi.event_name, 'Lead');
  const other = { ...OPW, practice_name: 'Another Practice' };
  assert.equal(W01.routeExisting(lead, { brokers: [other], now: TC_NOW, first_touch: false, expect_broker_id: OPW.id }).update.routing_reason, 'held_consent_names_other_practice', 'named consent: only the practice named in the text');
});

// ============================================================================================
// Lead-ad disclosure before hand-over (18 Oct 2026): a form lead is routed only after the SortMyCover disclosure
// ============================================================================================
const LD_BROKER = { ...OPW, contact_person: 'Mark Smith' };
const LD_LEAD = (over = {}) => ({ id: '00000000-0000-4000-8000-0000000a1d01', brand_id: 'smc', origin: 'lead_ad', routing_reason: 'held_budget_pending', budget_band: '1500_plus',
  consent_mode: 'named', consent_text: W01.consentRegistry(OPW)['CONSENT-NAMED-v5web'], consent_ads_at: TC_AT, lead_event_id: 'evt-ld', created_at: TC_AT,
  phone: '+27600000191', first_name: 'Thandi', disclosed: [], ...over });
const V3_ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: JSON.stringify({ broker_intro_slots_v3: 'HXv3' }) };
const DISCLOSURE = 'Before I introduce you: Mark Smith from Oracle Private Wealth, an authorised financial services provider (FSP 28418), will be the one on the call with you. Introduced by SortMyCover. SortMyCover gives no financial advice, product comparisons or premium quotes. Advisers pay SortMyCover a fee that does not depend on whether you buy anything.';

test('lead-ad disclosure: the route REFUSES a lead-ad lead without adviser_disclosed for that broker and asks for the disclosure first', () => {
  const opts = { brokers: [LD_BROKER], now: TC_NOW, require_disclosure: W01.disclosureRequired(LD_LEAD(), {}) };
  assert.equal(opts.require_disclosure, true);
  const r = W01.routeExisting(LD_LEAD(), opts);
  assert.equal(r.action, 'disclose'); assert.equal(r.update, undefined, 'nothing to write: no broker_id'); assert.equal(r.first_touch, undefined);
  assert.deepEqual(r.disclose.send, { to: '+27600000191', kind: 'text', text: DISCLOSURE, lead_id: LD_LEAD().id, correlation: `w01:disclosure:${LD_LEAD().id}:${LD_BROKER.id}` });
  assert.ok(r.disclose.send.text.length <= 1024);
  assert.doesNotMatch(r.disclose.send.text, /\bfree\b|\bAI\b|Lead Velocity/i);
  assert.deepEqual(r.disclose.activity, { activity_type: 'adviser_disclosed', idempotency_key: `w01:disclosed:${LD_LEAD().id}:${LD_BROKER.id}`, broker_id: LD_BROKER.id,
    payload: { broker_id: LD_BROKER.id, fsp: '28418', firm: 'Oracle Private Wealth', adviser: 'Mark Smith', disclosure_version: 'LEADAD-DISCLOSE-v1', via: 'whatsapp_session' } });
  // disclosed for ANOTHER broker is not enough
  assert.equal(W01.routeExisting(LD_LEAD({ disclosed: ['someone-else'] }), opts).action, 'disclose');
  // disclosed for him: routed, first touch W06, CAPI Lead at the hand-over (held_budget_pending)
  const ok = W01.routeExisting(LD_LEAD({ disclosed: [LD_BROKER.id] }), opts);
  assert.deepEqual([ok.action, ok.update.broker_id, ok.first_touch.workflow, ok.capi.event_name], ['routed', LD_BROKER.id, 'W06', 'Lead']);
  // after the send: routed with the row, held visibly without it
  assert.equal(W01.routeAfterDisclosure(LD_LEAD(), opts, LD_BROKER.id).action, 'routed');
  assert.deepEqual(W01.routeAfterDisclosure(LD_LEAD(), opts, null), { action: 'held', update: { routing_reason: 'held_disclosure_failed' }, notice: null });
  // nobody can take the lead: no disclosure (the held path sends no intro), the held notice as today
  const held = W01.routeExisting(LD_LEAD({ budget_band: 'lt750' }), opts);
  assert.deepEqual([held.action, held.notice.template], ['held', 'lead_low_budget_held']);
});

test('lead-ad disclosure: v3 configured -> no interim text (the card carries it); CTWA and /start/ (W39) leads are unchanged', () => {
  assert.equal(W01.introV3Ready(V3_ENV), true);
  assert.equal(W01.introV3Ready({ WHATSAPP_PROVIDER: 'meta', TWILIO_CONTENT_SIDS: V3_ENV.TWILIO_CONTENT_SIDS }), false, 'Meta provider: the v3 SID means nothing');
  assert.equal(W01.introV3Ready({ WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: '{bad' }), false);
  assert.equal(W01.disclosureRequired(LD_LEAD(), V3_ENV), false);
  assert.equal(W01.routeExisting(LD_LEAD(), { brokers: [LD_BROKER], now: TC_NOW, require_disclosure: W01.disclosureRequired(LD_LEAD(), V3_ENV) }).action, 'routed');
  for (const origin of ['ctwa', 'page', 'comment', 'dm']) {
    const l = LD_LEAD({ origin });
    assert.equal(W01.disclosureRequired(l, {}), false, origin);
    assert.equal(W01.routeExisting(l, { brokers: [LD_BROKER], now: TC_NOW, require_disclosure: W01.disclosureRequired(l, {}) }).action, 'routed', origin);
  }
  // W39 (origin page / ctwa, expect_broker_id): unchanged
  assert.equal(W01.routeExisting(LD_LEAD({ origin: 'page' }), { brokers: [LD_BROKER], now: TC_NOW, first_touch: false, expect_broker_id: LD_BROKER.id }).action, 'routed');
});

test('W01.json lead-ad disclosure branch: Route -> disclosure text -> WhatsApp Send (waits) -> adviser_disclosed row -> Route again -> write; the real Code nodes', async () => {
  const conn = (from) => WF.connections[from].main.map((o) => o.map((l) => l.node));
  assert.ok(conn('Route (w01.routeExisting)')[0].includes('Disclose first? (lead ad, before routing)'));
  assert.deepEqual(conn('Disclose first? (lead ad, before routing)'), [['Disclosure text (w01.leadAdDisclosure)']]);
  assert.deepEqual(conn('Disclosure text (w01.leadAdDisclosure)'), [['WhatsApp Send (disclosure, waits)']]);
  assert.deepEqual(conn('WhatsApp Send (disclosure, waits)'), [['Log adviser_disclosed (after the send)']]);
  assert.deepEqual(conn('Log adviser_disclosed (after the send)'), [['Route after the disclosure (w01.routeExisting)']]);
  assert.deepEqual(conn('Route after the disclosure (w01.routeExisting)'), [['Routed or held? (write it)']]);
  const send = WF.nodes.find((n) => n.name === 'WhatsApp Send (disclosure, waits)');
  assert.equal(send.parameters.options.waitForSubWorkflow, true, 'the route waits for the send');
  assert.equal(send.parameters.workflowId.value, 'smc-whatsapp-send');
  const load = WF.nodes.find((n) => n.name === 'Load CTWA lead + brokers').parameters.query;
  assert.match(load, /a\.activity_type = 'adviser_disclosed'\) AS disclosed/); assert.match(load, /'contact_person', b\.contact_person/);
  const logq = WF.nodes.find((n) => n.name === 'Log adviser_disclosed (after the send)').parameters.query;
  assert.match(logq, /AND \$4 <> ''/, 'no message id, no row');
  // the Code nodes
  const lead = LD_LEAD();
  const [rt] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead, brokers: [LD_BROKER], first_touch: true, expect_broker_id: null, hold_only: false }] });
  assert.equal(rt.json.r.action, 'disclose'); assert.equal(rt.json.routed, false);
  assert.equal(ifBranch(WF, 'Routed or held? (write it)', { json: rt.json }), false, 'no write, no W06, no CAPI on the first pass');
  const [v3] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead, brokers: [LD_BROKER], first_touch: true }] , env: V3_ENV });
  assert.equal(v3.json.r.action, 'routed', 'v3 configured: no interim text');
  const [tx] = await runCode(WF, 'Disclosure text (w01.leadAdDisclosure)', { items: [rt.json] });
  assert.equal(tx.json.text, DISCLOSURE);
  const refs = { 'Route (w01.routeExisting)': rt.json, 'Load CTWA lead + brokers': { lead, brokers: [LD_BROKER], first_touch: true, expect_broker_id: null, hold_only: false } };
  const p = evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: { ok: true, external_id: 'dry:w01:disclosure', messages: [{ id: 'dry:w01:disclosure' }] }, refs });
  assert.deepEqual([p[0], p[1], p[3], p[4]], [lead.id, LD_BROKER.id, 'dry:w01:disclosure', `w01:disclosed:${lead.id}:${LD_BROKER.id}`]);
  assert.equal(evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: { ok: false, error: 'outside_24h_window' }, refs })[3], '', 'a failed send writes no row');
  const [after] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{ broker_id: LD_BROKER.id }], refs });
  assert.deepEqual([after.json.r.action, after.json.update.broker_id], ['routed', LD_BROKER.id]);
  const [failed] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{}], refs });
  assert.deepEqual(failed.json.update, { routing_reason: 'held_disclosure_failed' });
  // the hand-over nodes see the second pass: W06 first touch + CAPI for the routed lead
  const both = { 'Route (w01.routeExisting)': rt.json, 'Route after the disclosure (w01.routeExisting)': after.json };
  const w06 = await runCode(WF, 'W06 input (CTWA)', { items: [{ lead_id: lead.id, broker_id: LD_BROKER.id }], refs: both });
  assert.deepEqual(w06.map((i) => i.json), [{ op: 'routed', lead_id: lead.id, origin: 'ctwa' }]);
  const capi = await runCode(WF, 'CAPI Lead at hand-over (held -> routed)', { items: [{ lead_id: lead.id, broker_id: LD_BROKER.id }], refs: both });
  assert.equal(capi.length, 1);
});

// ============================================================================================
// Generic consent (19 Oct 2026): the CTWA consent becomes GENERIC (CTWA-GENERIC-v4, names no adviser / firm). A lead's details
// may go to a broker only AFTER that adviser was named to the lead (adviser_disclosed for THAT broker). Named consent: unchanged.
// "No broker notice" = no routing write, no W06 first touch (the intro card / broker side), no CAPI Lead, no tier-C notice.
// ============================================================================================
const GEN_LEAD = (over = {}) => ({ id: '00000000-0000-4000-8000-0000000a9e01', brand_id: 'smc', origin: 'ctwa', routing_reason: null, budget_band: '1500_plus',
  consent_mode: 'generic', consent_text_version: 'CTWA-GENERIC-v4', consent_text: 'I agree that SortMyCover may share my details with an authorised adviser ...',
  consent_ads_at: TC_AT, created_at: TC_AT, phone: '+27600000291', first_name: 'Ayanda', disclosed: [], window_open: true, ...over });
const noNotice = (r, label) => {
  assert.notEqual(r.action, 'routed', label);
  assert.ok(!r.update || !r.update.broker_id, `${label}: no broker written`);
  assert.ok(!r.first_touch, `${label}: no W06 first touch`);
  assert.ok(!r.capi, `${label}: no CAPI Lead`);
  assert.ok(!r.notice, `${label}: no notice`);
};

test('generic consent rule: which consents count; a named lead keeps today\'s behaviour', () => {
  for (const l of [{ consent_mode: 'generic' }, { consent_text_version: 'CTWA-GENERIC-v4' }, { consent_text_version: 'ctwa-generic-v3' }, { consent_text_version: 'CONSENT-GENERIC-v5web' }])
    assert.equal(W01.isGenericConsent(l), true, JSON.stringify(l));
  for (const l of [{ consent_mode: 'named', consent_text_version: 'ctwa-named-v3' }, { consent_mode: 'named', consent_text_version: 'CONSENT-NAMED-v5web' }, null])
    assert.equal(W01.isGenericConsent(l), false, JSON.stringify(l));
  assert.equal(W01.disclosureRequired(GEN_LEAD(), V3_ENV), true, 'the v3 card comes after routing: never enough for a generic consent');
  // named consent, CTWA: routed at once, exactly as before (no disclosure step)
  const named = W01.routeExisting({ ...LD_LEAD(), origin: 'ctwa' }, { brokers: [LD_BROKER], now: TC_NOW });
  assert.deepEqual([named.action, named.first_touch.workflow], ['routed', 'W06']);
});

test('(c) generic CTWA lead, old tap path (start_page off): band tap -> route_and_first_touch -> the session disclosure, THEN routing; never before', () => {
  // the tap flow emits route_and_first_touch (W03); W01 core then decides
  const lead = GEN_LEAD();
  for (const require_disclosure of [false, true]) { // enforced by routeExisting itself, whatever the caller passes
    const r = W01.routeExisting(lead, { brokers: [LD_BROKER], now: TC_NOW, require_disclosure });
    assert.equal(r.action, 'disclose');
    noNotice(r, `first pass, require_disclosure ${require_disclosure}`);
    assert.equal(r.disclose.send.text, DISCLOSURE, 'adviser, practice, FSP + the SortMyCover disclosure');
    assert.deepEqual([r.disclose.send.kind, r.disclose.activity.activity_type, r.disclose.activity.payload.disclosure_version, r.disclose.activity.broker_id],
      ['text', 'adviser_disclosed', 'CHAT-DISCLOSE-v1', LD_BROKER.id]);
  }
  // after the send logged adviser_disclosed for him: routed, W06 first touch, CAPI once
  const after = W01.routeAfterDisclosure(lead, { brokers: [LD_BROKER], now: TC_NOW }, LD_BROKER.id);
  assert.deepEqual([after.action, after.update.broker_id, after.first_touch.workflow], ['routed', LD_BROKER.id, 'W06']);
  // a failed send: held, nothing to the broker
  noNotice(W01.routeAfterDisclosure(lead, { brokers: [LD_BROKER], now: TC_NOW }, null), 'send failed');
  // disclosed for ANOTHER broker only: asks again for this one
  assert.equal(W01.routeExisting({ ...lead, disclosed: ['00000000-0000-4000-8000-0000000b0fff'] }, { brokers: [LD_BROKER], now: TC_NOW }).action, 'disclose');
  // no open session (the 24-h window closed): held visibly, no text, no routing
  const shut = W01.routeExisting(GEN_LEAD({ window_open: false }), { brokers: [LD_BROKER], now: TC_NOW });
  assert.deepEqual([shut.action, shut.update], ['held', { routing_reason: 'held_disclosure_pending' }]);
  noNotice(shut, 'window closed');
});

test('(a) chat path: a start_here lead that replies instead of tapping Start here -> taps -> route_and_first_touch -> disclosure first', () => {
  // W03: a message while the page is pending falls back to the tap questions; nothing is routed on that message
  const row = { id: '00000000-0000-4000-8000-0000000a9e02', brand_id: 'smc', origin: 'lead_ad', phone: '+27600000292', first_name: 'Thandi',
    routing_reason: 'start_page_pending', conv_state: { state: 'start_page', via: 'start_page' } };
  const s = W3.step(null, { from: '27600000292', type: 'text', text: 'hi', payload: null }, { at: TC_AT, mobile: row.phone, lead_id: row.id, lead: row, existing_open_lead_id: row.id,
    brand: { brand_id: 'smc', consent_mode: 'named' }, broker: null });
  assert.ok(!s.actions.some((a) => a.kind === 'route_and_first_touch'), 'no routing on the reply');
  // the band tap's route_and_first_touch: named lead-ad (interim rule) and a generic one both disclose first
  for (const l of [LD_LEAD({ routing_reason: 'start_page_pending' }), GEN_LEAD({ origin: 'lead_ad', routing_reason: 'start_page_pending' })]) {
    const r = W01.routeExisting(l, { brokers: [LD_BROKER], now: TC_NOW, require_disclosure: W01.disclosureRequired(l, {}) });
    assert.equal(r.action, 'disclose', l.consent_mode);
    noNotice(r, l.consent_mode);
  }
});

test('(b) Instant Form -> start_here -> /start/: W39 logged adviser_disclosed before calling W01 core -> routed with no extra text; never before it', () => {
  const l = GEN_LEAD({ origin: 'lead_ad', routing_reason: 'start_page_pending', window_open: false });
  const opts = { brokers: [LD_BROKER], now: TC_NOW, first_touch: false, expect_broker_id: LD_BROKER.id, require_disclosure: W01.disclosureRequired(l, {}) };
  noNotice(W01.routeExisting(l, opts), 'before W39 disclosed');
  const r = W01.routeExisting({ ...l, disclosed: [LD_BROKER.id] }, opts);
  assert.deepEqual([r.action, r.update.broker_id, r.first_touch], ['routed', LD_BROKER.id, null]);
  assert.equal(r.capi.event_name, 'Lead', 'the one CAPI Lead at the hand-over');
});

test('intake: a generic-consent page / form lead is never routed at intake (held_disclosure_pending); a named one is, as before', () => {
  const genBroker = tcBroker({ consent_mode: 'generic' });
  const sub = W01.normaliseSubmission({ first_name: 'Nomsa', mobile: '0600000171', consent: true, consent_text: 'synthetic generic consent', consent_version: 'CONSENT-GENERIC-v5web',
    consent_mode: 'generic', age_band: '35_44', budget_band: '1500_plus', lang: 'en', started_at: TC_NOW - 60e3 }, {});
  const d = W01.decide(sub, { ...tcCtx([genBroker]), consent_mode: 'generic' });
  assert.deepEqual([d.outcome, d.row.broker_id, d.row.routed_at, d.row.routing_reason, d.first_touch, d.capi], ['held', null, null, 'held_disclosure_pending', null, null]);
  assert.equal(d.notice, null);
  // quiz v2 (band pending): still held, the band question still goes out (its tap opens the session for the disclosure)
  const v2 = W01.decide({ ...sub, budget_pending: true, quiz: { ...sub.quiz, budget_band: null } }, { ...tcCtx([genBroker]), consent_mode: 'generic' });
  assert.deepEqual([v2.row.routing_reason, v2.budget_question, v2.first_touch], ['held_disclosure_pending', true, null]);
  // named: routed at intake exactly as before
  assert.equal(W01.decide(tcSub('1500_plus'), tcCtx([tcBroker()])).outcome, 'accepted');
  // at the hand-over the held lead discloses first (CAPI then goes once, held_* rule)
  const r = W01.routeExisting({ ...d.row, disclosed: [], window_open: true }, { brokers: [genBroker], now: TC_NOW });
  assert.equal(r.action, 'disclose');
});

test('/start/ step 0 generic consent on a named-mode brand is stored as generic, so W39 can route after the adviser card (20 Oct 2026)', () => {
  // KG's desktop test, 20 Oct 2026: the brand default (named) overrode the page's generic consent and W39 held the lead
  // (held_consent_names_other_practice), so no times were shown.
  const sub = W01.normaliseSubmission({ first_name: 'Test', mobile: '0600000172', consent: true, consent_text: 'synthetic generic consent', consent_version: 'CONSENT-GENERIC-v5web',
    consent_mode: 'generic', start_page: true, lang: 'en', started_at: TC_NOW - 60e3 }, { channel: 'page' });
  const d = W01.decide({ ...sub, channel: 'page', start_page: true }, { ...tcCtx([tcBroker()]), consent_mode: 'named' });
  assert.equal(d.row.consent_mode, 'generic');
  assert.ok(!W01.routingFor(d.row.consent_text, d.row.consent_mode, [tcBroker()], d.row.brand_id, 'B').held, 'a generic lead is routable (the page discloses first)');
  // a named page consent on the same brand stays named
  assert.equal(W01.decide(tcSub('1500_plus'), { ...tcCtx([tcBroker()]), consent_mode: 'named' }).row.consent_mode, 'named');
});

test('(d) admin assignment (tier C sweep): a generic lead an admin assigned is NOT handed off (W06) until its adviser was named', async () => {
  const assigned = { id: '00000000-0000-4000-8000-0000000a9e03', brand_id: 'smc', origin: 'ctwa', broker_id: LD_BROKER.id, routing_reason: 'manual_low_budget',
    order_state: 'attached', first_message_at: null, opted_out_at: null, conv_state: { state: 'unbooked' }, consent_mode: 'generic', consent_text_version: 'CTWA-GENERIC-v4', disclosed: [] };
  assert.equal(W01.lowBudgetHandoff(assigned), null, 'undisclosed generic: no intro');
  assert.equal(W01.lowBudgetHandoff({ ...assigned, disclosed: [LD_BROKER.id] }).op, 'routed');
  assert.equal(W01.lowBudgetHandoff({ ...assigned, consent_mode: 'named', consent_text_version: 'ctwa-named-v3' }).op, 'routed', 'named: as before');
  const out = await runCode(WF, 'Plan (w01.lowBudgetHandoff / lowBudgetClose)', { env: ENV, items: [assigned] });
  assert.deepEqual(out, []);
});

test('W01.json: the core Load query gives routeExisting the consent version, the disclosed brokers and the 24-h window; the Route node holds / discloses a generic lead', async () => {
  const load = WF.nodes.find((n) => n.name === 'Load CTWA lead + brokers').parameters.query;
  assert.match(load, /l\.consent_text_version/);
  assert.match(load, /cm\.direction = 'inbound'[\s\S]*interval '24 hours'\) AS window_open/);
  const sweep = WF.nodes.find((n) => n.name === 'Tier-C leads: assigned (hand off) or held 7 days (close)').parameters.query;
  assert.match(sweep, /l\.consent_mode, l\.consent_text_version/); assert.match(sweep, /AS disclosed/);
  const [rt] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: GEN_LEAD(), brokers: [LD_BROKER], first_touch: true }] });
  assert.equal(rt.json.r.action, 'disclose');
  assert.equal(ifBranch(WF, 'Routed or held? (write it)', { json: rt.json }), false, 'no write, no W06, no CAPI');
  assert.equal(ifBranch(WF, 'Disclose first? (lead ad, before routing)', { json: rt.json }), true, 'the session text goes first');
  const [held] = await runCode(WF, 'Route (w01.routeExisting)', { items: [{ lead: GEN_LEAD({ window_open: false }), brokers: [LD_BROKER], first_touch: true }] });
  assert.deepEqual([held.json.r.action, held.json.update], ['held', { routing_reason: 'held_disclosure_pending' }]);
  const w06 = await runCode(WF, 'W06 input (CTWA)', { items: [{ lead_id: GEN_LEAD().id, broker_id: null }], refs: { 'Route (w01.routeExisting)': held.json } });
  assert.deepEqual(w06, [], 'a hold never reaches W06');
});

// Smoke test #13 (21 Oct 2026): the low-budget close follows the same CPA contact hours as every W01 lead send.
test('low-budget close: not on a Sunday, a Saturday afternoon or a public holiday; the next allowed sweep sends it', () => {
  const held = { id: '00000000-0000-4000-8000-0000000a0c05', origin: 'page', phone: '+27600000175', first_name: 'Lindi', created_at: '2026-10-17T09:00:00+02:00',
    conv_state: {}, broker_id: null, routing_reason: 'held_low_budget', stage: 'qualified' };
  assert.equal(W01.lowBudgetClose(held, Date.parse('2026-10-24T13:30:00+02:00')), null, 'Saturday afternoon');
  assert.equal(W01.lowBudgetClose(held, Date.parse('2026-10-25T10:00:00+02:00')), null, 'Sunday');
  assert.equal(W01.lowBudgetClose(held, Date.parse('2026-11-04T10:00:00+02:00')), null, 'election day 4 Nov');
  assert.ok(W01.lowBudgetClose(held, Date.parse('2026-10-24T09:30:00+02:00')), 'Saturday 09:00-13:00');
  assert.ok(W01.lowBudgetClose(held, Date.parse('2026-10-26T08:00:00+02:00')), 'Monday 08:00');
});
