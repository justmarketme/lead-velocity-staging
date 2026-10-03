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
import { FIX, MODE, lead, broker, cycle, clone, ms, iso, D, H, MIN, sha256, online } from './_harness.mjs';
import { runCode, PG_CRED } from './_n8ncode.mjs';
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
};

// ============================================================================================
// Offline system: the workflow's Code nodes, with the database / sub-workflow nodes emulated.
// ============================================================================================
const dbBroker = (b) => ({
  id: b.broker_id, broker_id: b.broker_id, brand_id: b.brand_id, status: b.status, routing_on: b.routing_on, active: true,
  bookings_paused: b.bookings_paused, practice_name: b.practice_name, fsp_number: b.fsp_number, consent_mode: b.consent_mode,
  current_cycle_id: b.current_cycle_id, tier_code: b.tier_code, methods_supported: b.methods_supported,
  committed_leads: (FIX.cycles.find((c) => c.cycle_id === b.current_cycle_id) || {}).committed_leads ?? null,
});

function offlineSystem() {
  const db = { leads: new Map(), capi: [], jobs: [], activities: [], suppression: [], messages: [], events: [] };
  const brokersOf = (brand) => FIX.brokers.filter((b) => b.brand_id === brand).map((b) => ({ ...dbBroker(b), leads_this_cycle: [...db.leads.values()].filter((l) => l.broker_id === b.broker_id && l.cycle_id === b.current_cycle_id).length }));

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

  /** Screen output (or Lead ad output) -> Context -> Guard -> [Twilio Lookup] -> Decide -> Kind -> writes. */
  async function pipeline(s, { env, brand, lookupResponse }) {
    if (!s.scr.ok) return { http: s.http, decision: null };
    const ctx = context(s, brand);
    const [g] = await runCode(RUN, N.guard, { json: s, env, refs: { [N.screenIf]: s, [N.context]: ctx, [N.turnstileIf]: s } });
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
      : { given: true, source: 'meta_instant_form', text_version: 'CONSENT-NAMED-v1+CONSENT-ADS-v1', captured_at: p.created_time },
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
    assert.equal(ref.value, want ? `smc-w${want[1]}` : 'smc-capi-send', n.name);
  }
  assert.deepEqual([...new Set(subs.map((n) => n.parameters.workflowId.value))].sort(), ['smc-capi-send', 'smc-w06']);
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

test(`W01 [${MODE}] routing writes broker_id (and cycle) BEFORE the first-touch job exists`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const r = await sys.page(fx);
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.equal(s.lead.cycle_id, cycle().cycle_id);
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
  assert.equal(s.lead.consent_text, FIX.consent_texts['CONSENT-NAMED-v1+CONSENT-ADS-v1']);
  assert.deepEqual(s.capi.map((e) => e.event_id), [`evt_${r.body.lead_id}_lead`]);
});

test(`W02 parity [${MODE}] the production ingest item (registry version, no text) names the practice and is routed, not held`, async (t) => {
  if (MODE === 'online') return t.skip('offline check of the Lead ad -> submission + Decide nodes');
  const sys = fresh();
  const r = await sys.leadAd(ingestItem(lead('L03'), { withText: false }));
  assert.equal(r.body.status, 'accepted');
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.consent_text_version, 'CONSENT-NAMED-v1+CONSENT-ADS-v1');
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
  // GATE-TEST-W01: fixture expected consent_text_version 'ctwa-v1' (generic); 0.1/CONTRACTS says named consent while one broker, so W03 asks with 'ctwa-named-v2' (NH-40 / needs-human-log 2026-10-03 (c))
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
  // GATE-TEST-W01: fixture expected the broker never named to a non-consenting person; 0.1/CONTRACTS (named consent, ctwa-named-v2) names the practice IN the consent prompt so the person can decide; nothing after "No" names it (NH-40 / needs-human-log 2026-10-03 (c))
  if (MODE === 'offline') {
    assert.ok(msgs[0].kind === 'consent_buttons' && msgs[0].text.includes(broker().practice_name), 'named consent prompt names the practice');
    assert.ok(!JSON.stringify(msgs.slice(1)).includes(broker().practice_name), 'broker not named after "No thanks"');
    assert.ok(!JSON.stringify(msgs.slice(1)).includes('FSP'), 'no FSP after "No thanks"');
  } else assert.ok(!JSON.stringify(msgs).includes(broker().practice_name), 'broker not named to a non-consenting person');
});

test(`W03 parity [${MODE}] CTWA out-of-band age (L06): polite close, no hand-over, deleted within 24 h`, async () => {
  const sys = fresh();
  const fx = lead('L06');
  const { lead: l, messages } = await sys.ctwa(fx);
  const e = fx.expected.W01;
  assert.equal(l.qualified, false);
  assert.equal(l.disqualified_reason, e.disqualified_reason);
  assert.equal(l.broker_id ?? null, null);
  assert.equal(ms(l.retention_delete_after), ms(e.delete_after));
  assert.ok(messages.some((m) => m.kind === 'polite_close'));
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
