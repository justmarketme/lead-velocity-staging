// DRAFT for GATE-TEST-W20: Jonathan approves or edits. The workflow is not switched on until this is approved.
//
// W20 Onboarding wizard: portal/spec/README.md "Acceptance scenarios" 1-7, plus the template contract.
// Money rule protected: no lead is ever routed to a broker who is not verified on the FSCA register, has no
// working calendar, has not signed, or whose card is not approved (0.3 #12, 6.1). The broker gets one nudge per
// stall, never at night, and Jonathan's Approve & go live is the only way to switch routing on.
//
// Offline (default): the Code nodes are executed *from automation/W20.json* in a sandbox (real code, not a copy).
// The Postgres and HTTP nodes are modelled below, one function per node, with the node name in the comment, so a
// change to a query must be mirrored here. Online: set N8N_PUBLIC_URL (+ INTERNAL_HMAC_SECRET, TEST_HOOKS_TOKEN);
// the same assertions run against the real webhooks. Online needs these staging-only hooks, built with W20:
//   POST /test/seed-broker {broker}          POST /test/mock {fsca:{fsp:{kind,statusCode,body}}, slots:{broker_id:[...]}, handoff_ok}
//   POST /test/w20-sweep {now}              GET  /test/broker-state?broker_id= -> {broker, sends[], emails[], alerts[], preflight_calls[], fsca_calls}
// Run: node --test automation/tests/W20.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import { FIX, MODE, broker as fixtureBroker, clone, ms, iso, MIN, H, D, sast, online, template } from './_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WF = JSON.parse(readFileSync(join(HERE, '..', 'W20.json'), 'utf8'));
const node = (name) => {
  const n = WF.nodes.find((x) => x.name === name);
  assert.ok(n, `W20.json has node "${name}"`);
  return n;
};

// W20.json still sends the names from portal/spec/proposed-templates.json. The submitted files use the
// broker_onb_ prefix (I-07). The W20 owner swaps the names 1:1; until then this map is the contract.
export const RENAME = {
  broker_onboarding_welcome: 'broker_onb_welcome',
  broker_onboarding_next: 'broker_onb_next',
  broker_calendar_ok: 'broker_onb_calendar_ok',
  broker_onboarding_ready: 'broker_onb_ready',
  broker_onboarding_nudge_24h: 'broker_onb_nudge_24h',
  broker_onboarding_nudge_72h: 'broker_onb_nudge_72h',
  broker_onboarding_issue: 'broker_onb_issue',
  broker_live: 'broker_onb_live',
};
const submitted = (name) => RENAME[name] || name;

const SECRET = process.env.INTERNAL_HMAC_SECRET || 'test-internal-hmac-secret-0123456789';
const ENV = {
  INTERNAL_HMAC_SECRET: SECRET, PORTAL_URL: 'https://app.leadvelocity.co.za', BRAND_ID: 'smc', DRY_RUN_SENDS: 'false',
  HOWZIT_MAILBOX: 'howzit@leadvelocity.co.za', N8N_PUBLIC_URL: 'https://n8n.test', FSCA_LIFE_CATEGORY_PATTERN: '',
};

// ---------------------------------------------------------------------------------------------
// Sandbox: luxon-compatible DateTime for Africa/Johannesburg (UTC+02:00 all year, no DST)
// ---------------------------------------------------------------------------------------------
const OFF = 2 * H;
const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
class DT {
  constructor(t) {
    this.t = t;
    const d = new Date(t + OFF);
    Object.assign(this, { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: ((d.getUTCDay() + 6) % 7) + 1, _dow: d.getUTCDay() });
  }
  setZone() { return this; }
  plus({ days = 0, hours = 0, minutes = 0 } = {}) { return new DT(this.t + days * D + hours * H + minutes * MIN); }
  toISO() { return iso(this.t); }
  toMillis() { return this.t; }
  toFormat(f) {
    const p2 = (n) => String(n).padStart(2, '0');
    const map = { cccc: DOWS[this._dow], ccc: DOWS[this._dow].slice(0, 3), LLL: MONS[this.month - 1], yyyy: String(this.year), MM: p2(this.month), dd: p2(this.day), d: String(this.day), HH: p2(this.hour), mm: p2(this.minute) };
    return f.replace(/cccc|ccc|LLL|yyyy|MM|dd|d|HH|mm/g, (k) => map[k]);
  }
}
const makeDateTime = (NOW) => ({ now: () => new DT(NOW), fromISO: (s) => new DT(Date.parse(s)), fromMillis: (t) => new DT(t) });

/** Execute one W20 Code node (runOnceForAllItems) with the given items and $('Node') references. */
async function runCode(name, { input = [], refs = {}, now, binary, httpCalls = [] } = {}) {
  const NOW = typeof now === 'number' ? now : ms(now);
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(NOW); }
    static now() { return NOW; }
  }
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const self = { helpers: { getBinaryDataBuffer: async () => binary, httpRequest: async (o) => { httpCalls.push(o); return {}; } } };
  const ctx = vm.createContext({
    $input: wrap(input), $json: input[0] ?? {}, $env: ENV, require, Buffer, Date: FakeDate, DateTime: makeDateTime(NOW), $now: new DT(NOW), __self: self,
    $: (n) => { if (!refs[n]) throw new Error(`test must supply $('${n}')`); return wrap(refs[n]); },
  });
  const out = await vm.runInContext(`(async function () {\n${node(name).parameters.jsCode}\n}).call(__self)`, ctx);
  return JSON.parse(JSON.stringify(out.map((i) => i.json)));
}

const toMs = (x) => (typeof x === 'number' ? x : ms(x));
const sign = (raw) => 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex');
const STEP_KEYS = ['profile', 'calendar', 'availability', 'agreement', 'card', 'media'];
const done = (by = 'broker', at = '2026-10-12T09:00:00+02:00') => ({ status: 'done', done_at: at, by });

// ---------------------------------------------------------------------------------------------
// A new broker in onboarding, built from the fixture broker (Mark Smith Financial Services, FSP 12345)
// ---------------------------------------------------------------------------------------------
const FB = fixtureBroker();
const T0 = ms('2026-10-12T09:00:00+02:00'); // Monday 09:00 SAST: first magic-link login
function newBroker(over = {}) {
  return {
    broker_id: 'brk_test_onb', brand_id: ENV.BRAND_ID, practice_name: FB.practice_name, practice_legal_name: null, fsp_number: FB.fsp_number,
    adviser_name: FB.adviser_name, adviser_whatsapp: FB.adviser_whatsapp, email: FB.email, bio_short: 'Helps young families in Cape Town.',
    languages: ['en'], years_advising: 12, status: 'onboarding', onboarding_step: 'profile', onboarding_progress: {}, onboarding_nudges: null,
    first_login_at: iso(T0), last_seen_at: iso(T0), onboarding_last_progress_at: iso(T0), fsp_check: null, fsp_verified_at: null,
    calendar_status: null, next_free_slot_at: null, preflight_run_id: null, preflight_card: null, routing_on: false, approved_live_at: null,
    onboarding_completed_at: null, ...over,
  };
}
const REGISTER_OK = { kind: 'ok', statusCode: 200, body: { found: true, status: 'Authorised', register_name: 'Mark Smith Financial Services (Pty) Ltd', categories: ['Long-term Insurance: Category A', 'Long-term Insurance: Category B1'] } };
const ADMIN = 'uid_admin_jonathan';

// ---------------------------------------------------------------------------------------------
// Offline system: W20 lanes with real Code nodes + modelled Postgres/HTTP nodes
// ---------------------------------------------------------------------------------------------
function offlineSys() {
  const st = { brokers: new Map(), webhookEvents: new Set(), sends: [], emails: [], alerts: [], preflightCalls: [], fscaCalls: 0, register: REGISTER_OK, slots: [], handoffOk: true, admins: new Set([ADMIN]), timeline: new Set() };
  const B = (id) => st.brokers.get(id);
  const progress = (b, step, status, now) => { b.onboarding_progress = { ...(b.onboarding_progress || {}), [step]: { status, done_at: status === 'done' || status === 'defaulted' ? iso(now) : null, by: 'system' } }; };

  async function router(items, now) {
    const wa = items.filter((i) => i.channel === 'wa');
    if (wa.length) for (const p of await runCode('Compose WhatsApp payload', { input: wa, now })) {
      if (!st.timeline.has(p.idem + ':wa')) st.timeline.add(p.idem + ':wa'); // Log send (timeline): on conflict do nothing (logs only; it does not stop a send)
      st.sends.push({ at: iso(now), template: p.template, params: p.params, buttons: p.buttons, to: p.to, send: p.send, payload: p.payload, log_type: p.log_type });
    }
    const em = items.filter((i) => i.channel === 'email');
    if (em.length) for (const e of await runCode('Compose email (Graph sendMail)', { input: em, now })) st.emails.push({ at: iso(now), to: e.to, subject: e.subject, graph_url: e.graph_url, graph_body: e.graph_body, log_type: e.log_type });
    for (const a of items.filter((i) => i.channel === 'w22')) st.alerts.push({ at: iso(now), ...a });
  }

  // "Check onboarded (hard steps)" -> "Start compliance pre-flight" -> "Save preflight run"
  async function checkOnboarded(id, now) {
    const b = B(id); const P = b.onboarding_progress || {};
    const ok = b.status === 'onboarding' && b.fsp_verified_at && P.profile?.status === 'done' && P.calendar?.status === 'done'
      && ['done', 'defaulted'].includes(P.availability?.status) && P.agreement?.status === 'done' && P.card?.status === 'done';
    if (!ok) return;
    Object.assign(b, { status: 'onboarded', onboarding_completed_at: iso(now), onboarding_last_progress_at: iso(now) });
    const run_id = `pf-${id}-${now}`;
    st.preflightCalls.push({ broker_id: id, run_id, at: iso(now), checks: ['fsp_verified', 'consent_mode_set', 'intro_card_gate', 'calendar_slots', 'test_lead_e2e'] });
    Object.assign(b, { preflight_run_id: run_id, preflight_card: null }); // the pre-flight service echoes run_id (contract)
  }

  // Lane A: POST /w20/broker-event
  async function event(ev, { now, raw = JSON.stringify(ev), signature = sign(raw) } = {}) {
    now = typeof now === 'number' ? now : ms(now ?? ev.occurred_at);
    const [v] = await runCode('Verify signature', { input: [{ headers: { 'x-lv-signature': signature } }], binary: Buffer.from(raw), now });
    if (!v.valid) return { status: 401, reason: v.reason };
    // "Dedupe event": insert into webhook_events on conflict do nothing; zero rows = replay -> stop.
    const key = 'w20:' + v.event.event_id;
    if (st.webhookEvents.has(key)) return { status: 202, replay: true };
    st.webhookEvents.add(key);
    const b = B(v.event.broker_id);
    // "Load broker": only the selected columns + in_portal (last_seen_at within 10 min)
    const row = (({ broker_id, adviser_name, practice_name, fsp_number, email, adviser_whatsapp, status, onboarding_step, onboarding_progress, last_seen_at, first_login_at, onboarding_last_progress_at, brand_id }) =>
      ({ broker_id, adviser_name, practice_name, fsp_number, email, adviser_whatsapp, status, onboarding_step, onboarding_progress: onboarding_progress || {}, last_seen_at, first_login_at, onboarding_last_progress_at, brand_id }))(b);
    row.in_portal = !!b.last_seen_at && ms(b.last_seen_at) > now - 10 * MIN;
    const refs = { 'Verify signature': [v], 'Load broker': [row] };
    refs['Derive state'] = await runCode('Derive state', { refs, now });
    const type = v.event.type;
    if (type === 'broker.created') {
      const link = { hashed_token: 'mk_' + b.broker_id }; // "Make magic link" (Supabase admin generate_link)
      await router(await runCode('Build welcome', { input: [link], refs, now }), now);
    } else if (type === 'fsp.submitted') {
      // "FSCA register lookup": retryOnFail 3 tries, neverError, continueRegularOutput. A timeout throws (retried); a 5xx does not.
      const r = st.register;
      let item;
      if (r.kind === 'timeout') { st.fscaCalls += 3; item = { error: { message: 'ETIMEDOUT' } }; } else { st.fscaCalls += 1; item = { statusCode: r.statusCode, body: r.body }; }
      const [e] = await runCode('Evaluate FSCA result', { input: [item], refs, now });
      refs['Evaluate FSCA result'] = [e];
      // "Save fsp_check": attempts accumulate; fsp_verified_at only on verified
      b.fsp_check = { ...e.fsp_check, attempts: (b.fsp_check?.attempts || 0) + 1 };
      if (e.verdict === 'verified') b.fsp_verified_at = iso(now);
      if (e.verdict === 'verified') {
        // "Complete profile step": required fields + verified (headshot not required)
        if (b.fsp_verified_at && b.practice_name && b.adviser_name && b.adviser_whatsapp && b.email && b.bio_short && (b.languages || []).length && b.years_advising != null) {
          progress(b, 'profile', 'done', now); b.onboarding_last_progress_at = iso(now);
          await checkOnboarded(b.broker_id, now);
        }
      } else {
        progress(b, 'profile', 'blocked', now); // "Block profile step"
        await router(await runCode('Build FSP block messages', { refs, now }), now);
      }
    } else if (type === 'calendar.connected') {
      const [s] = await runCode('Evaluate slots', { input: [{ slots: st.slots }], refs, now }); // "Verify slots (W04 GET /slots)"
      refs['Evaluate slots'] = [s];
      if (s.slot_count > 0) {
        progress(b, 'calendar', 'done', now); Object.assign(b, { calendar_status: 'ok', next_free_slot_at: s.next_free_slot_at, onboarding_last_progress_at: iso(now) });
        await router(await runCode('Build calendar messages', { refs, now }), now);
        await checkOnboarded(b.broker_id, now);
      } else {
        await router(await runCode('Build calendar messages', { refs, now }), now);
      }
    } else if (type === 'calendar.failed') {
      await router(await runCode('Build calendar failure message', { refs, now }), now);
    } else if (type === 'agreement.signed') {
      await router(await runCode('Build agreement email', { refs, now, binary: Buffer.from('%PDF-1.7 test') }), now);
      await checkOnboarded(b.broker_id, now);
    } else if (['step.completed', 'card.approved'].includes(type)) {
      const ds = refs['Derive state'][0];
      if (!ds.in_portal) await router(await runCode('Build next-step prompt', { input: [ds], refs, now }), now); // "Broker away from portal?"
      await checkOnboarded(b.broker_id, now);
    }
    return { status: 202 };
  }

  // Lane B: POST /w20/preflight-result
  async function preflightResult(id, card, { now }) {
    now = toMs(now);
    const ev = { event_id: 'pf-res-' + card.run_id, type: 'preflight.result', broker_id: id, occurred_at: iso(now), payload: { card } };
    const raw = JSON.stringify(ev);
    const [v] = await runCode('Verify signature (preflight)', { input: [{ headers: { 'x-lv-signature': sign(raw) } }], binary: Buffer.from(raw), now });
    if (!v.valid) return { status: 401 };
    const b = B(id);
    if (b.preflight_run_id !== card.run_id) return { status: 200, ignored: 'stale_run_id' }; // "Save preflight card" where preflight_run_id = $3
    b.preflight_card = card;
    const saved = { broker_id: id, adviser_name: b.adviser_name, adviser_whatsapp: b.adviser_whatsapp, practice_name: b.practice_name, status: b.status, preflight_card: card };
    if (card.all_pass === true) {
      if (b.status !== 'onboarded') return { status: 200 }; // "Set ready_for_go_live" guard
      b.status = 'ready_for_go_live';
      await router(await runCode('Build ready messages', { input: [saved], now }), now);
    } else {
      await router(await runCode('Build pre-flight failure', { input: [saved], now }), now);
    }
    return { status: 200 };
  }

  // Lane C: POST /w20/go-live (console "Approve & go live", HUMAN GATE)
  async function goLive(id, { now, actor = ADMIN }) {
    now = toMs(now);
    const ev = { event_id: 'golive-' + id + '-' + now, type: 'go_live.approved', broker_id: id, occurred_at: iso(now), payload: { actor_uid: actor } };
    const raw = JSON.stringify(ev);
    const [v] = await runCode('Verify signature (go-live)', { input: [{ headers: { 'x-lv-signature': sign(raw) } }], binary: Buffer.from(raw), now });
    if (!v.valid) return { status: 401 };
    const b = B(id);
    // "Check gate preconditions"
    const fresh = b.preflight_card?.ran_at && ms(b.preflight_card.ran_at) > now - 24 * H;
    const ok = b.status === 'ready_for_go_live' && b.preflight_card?.all_pass === true && fresh && st.admins.has(actor);
    if (!ok && b.status === 'ready_for_go_live' && !fresh) st.preflightCalls.push({ broker_id: id, run_id: `pf-${id}-${now}`, at: iso(now), rerun: true, checks: ['fsp_verified', 'consent_mode_set', 'intro_card_gate', 'calendar_slots', 'test_lead_e2e'] }); // Stale pre-flight? -> Re-run pre-flight (stale)
    if (!ok) return { status: 409, error: b.status !== 'ready_for_go_live' ? 'not_ready' : (!fresh ? 'preflight_stale' : 'not_allowed') };
    Object.assign(b, { status: 'active', routing_on: true, approved_live_at: iso(now) }); // "Activate broker"
    const activated = { broker_id: id, adviser_name: b.adviser_name, adviser_whatsapp: b.adviser_whatsapp, email: b.email, practice_name: b.practice_name };
    if (!st.handoffOk) { // "Hand off to go-live step (W26/W16)" error output -> "Revert to ready_for_go_live"
      Object.assign(b, { status: 'ready_for_go_live', routing_on: false, approved_live_at: null });
      await router(await runCode('Build hand-off failure alert', { refs: { 'Activate broker': [activated] }, now }), now);
      return { status: 502, error: 'handoff_failed' };
    }
    await router(await runCode('Build live messages', { refs: { 'Activate broker': [activated] }, now }), now);
    return { status: 200, body: { ok: true, status: 'active' } };
  }

  // Lane D: every-30-min sweep
  async function sweep(now) {
    now = typeof now === 'number' ? now : ms(now);
    const go = await runCode('Within send hours (08:00-19:00 SAST)?', { input: [{}], now });
    if (go.length) {
      // "Find due nudges"
      const rows = [];
      for (const b of st.brokers.values()) {
        if (b.brand_id !== ENV.BRAND_ID || !['onboarding', 'onboarded'].includes(b.status)) continue;
        if (b.last_seen_at && ms(b.last_seen_at) >= now - 10 * MIN) continue;
        const nz = b.onboarding_nudges || {};
        if (nz.suppress_until && ms(nz.suppress_until) >= now) continue;
        if (b.status === 'onboarded' && ['done', 'skipped'].includes(b.onboarding_progress?.media?.status || 'todo')) continue;
        if (!b.onboarding_last_progress_at) continue;
        const n = nz.since && ms(nz.since) === ms(b.onboarding_last_progress_at) ? nz : {};
        const age = now - ms(b.onboarding_last_progress_at);
        const due = age >= 72 * H && !n['72h'] ? '72h' : age >= 24 * H && !n['24h'] ? '24h' : null;
        if (due) rows.push({ broker_id: b.broker_id, adviser_name: b.adviser_name, adviser_whatsapp: b.adviser_whatsapp, email: b.email, status: b.status, onboarding_progress: b.onboarding_progress, onboarding_last_progress_at: b.onboarding_last_progress_at, practice_name: b.practice_name, due });
      }
      if (rows.length) {
        const items = await runCode('Build nudge', { input: rows, now });
        for (const it of items.filter((i) => i.mark)) { // "Mark nudge sent (at-most-once)": before sending
          const b = B(it.broker_id); const nz = b.onboarding_nudges || {};
          b.onboarding_nudges = { ...nz, since: it.mark.since, [it.mark.due]: iso(now), ...(it.mark.due === '72h' ? { '24h': nz['24h'] || iso(now) } : {}) };
        }
        await router(items, now);
      }
    }
    // "Default untouched availability (24 h after calendar)" -> "Emit step.completed (availability)" (re-enters lane A, signed)
    const defaulted = [];
    for (const b of st.brokers.values()) {
      const P = b.onboarding_progress || {};
      if (b.brand_id === ENV.BRAND_ID && b.status === 'onboarding' && P.calendar?.status === 'done' && ms(P.calendar.done_at) < now - 24 * H && ['todo', 'doing'].includes(P.availability?.status || 'todo')) {
        progress(b, 'availability', 'defaulted', now); b.onboarding_last_progress_at = iso(now); defaulted.push({ broker_id: b.broker_id });
      }
    }
    if (defaulted.length) {
      const calls = [];
      await runCode('Emit step.completed (availability)', { input: defaulted, now, httpCalls: calls });
      for (const c of calls) await event(JSON.parse(c.body), { now, raw: c.body, signature: c.headers['x-lv-signature'] });
    }
    // "Stamp 48-h SLA miss" -> "Build SLA signal"
    const missed = [];
    for (const b of st.brokers.values()) {
      if (b.brand_id === ENV.BRAND_ID && b.status === 'onboarding' && ms(b.first_login_at) < now - 48 * H && !(b.onboarding_nudges || {}).sla_48h_missed_at) {
        b.onboarding_nudges = { ...(b.onboarding_nudges || {}), sla_48h_missed_at: iso(now) }; missed.push({ broker_id: b.broker_id, practice_name: b.practice_name });
      }
    }
    if (missed.length) await router(await runCode('Build SLA signal', { input: missed, now }), now);
  }

  return {
    st,
    seed: async (b) => { st.brokers.set(b.broker_id, clone(b)); },
    mock: async ({ register, slots, handoffOk } = {}) => { if (register) st.register = register; if (slots) st.slots = slots; if (handoffOk !== undefined) st.handoffOk = handoffOk; },
    touch: async (id, patch) => Object.assign(B(id), patch), // portal writes (step done, last_seen_at)
    event, preflightResult, goLive, sweep,
    state: async (id) => ({ broker: clone(B(id)), sends: st.sends, emails: st.emails, alerts: st.alerts, preflight_calls: st.preflightCalls, fsca_calls: st.fscaCalls }),
  };
}

function onlineSys() {
  const post = (path, body, now, headers = {}) => online.post(path, body, { now, headers });
  const signed = async (path, ev, now) => { const raw = JSON.stringify(ev); return (await post(path, ev, now, { 'x-lv-signature': sign(raw) })); };
  return {
    seed: async (b) => post('/test/seed-broker', { broker: b, is_synthetic: true }),
    mock: async ({ register, slots, handoffOk } = {}) => post('/test/mock', { fsca: register, slots, handoff_ok: handoffOk }),
    touch: async (id, patch) => post('/test/seed-broker', { broker: { broker_id: id, ...patch }, merge: true, is_synthetic: true }),
    event: async (ev, { now, raw, signature } = {}) => { const r = await post('/w20/broker-event', raw ? JSON.parse(raw) : ev, now ?? ev.occurred_at, { 'x-lv-signature': signature ?? sign(raw ?? JSON.stringify(ev)) }); return { status: r.status, replay: r.body?.replay }; },
    preflightResult: async (id, card, { now }) => signed('/w20/preflight-result', { event_id: 'pf-res-' + card.run_id, type: 'preflight.result', broker_id: id, occurred_at: iso(toMs(now)), payload: { card } }, now),
    goLive: async (id, { now, actor = ADMIN }) => { const r = await signed('/w20/go-live', { event_id: 'golive-' + id + '-' + toMs(now), type: 'go_live.approved', broker_id: id, occurred_at: iso(toMs(now)), payload: { actor_uid: actor } }, now); return { status: r.status, error: r.body?.error, body: r.body }; },
    sweep: async (now) => post('/test/w20-sweep', { now: iso(typeof now === 'number' ? now : ms(now)) }),
    state: async (id) => (await online.get(`/test/broker-state?broker_id=${encodeURIComponent(id)}`)).body,
  };
}
const fresh = () => (MODE === 'online' ? onlineSys() : offlineSys());
const evt = (type, over = {}) => ({ event_id: over.event_id || `ev_${type}_${Math.random().toString(36).slice(2, 10)}`, type, broker_id: 'brk_test_onb', step: over.step ?? null, occurred_at: over.occurred_at || iso(T0), payload: over.payload || {} });
const sendsOf = (s, tpl) => s.sends.filter((m) => submitted(m.template) === tpl);
const offlineOnly = (t) => MODE === 'online' && t.skip('offline-only: reads the sandbox directly');

/** All hard steps done except `missing` (portal writes), FSP verified. */
const nearlyDone = (missing, over = {}) => newBroker({
  fsp_verified_at: iso(T0), last_seen_at: iso(T0 - H),
  onboarding_progress: Object.fromEntries(['profile', 'calendar', 'availability', 'agreement', 'card'].filter((k) => k !== missing).map((k) => [k, done()])), ...over,
});

// =============================================================================================
// Structure + template contract
// =============================================================================================
test(`W20 [${MODE}] export: inactive, Africa/Johannesburg, success executions not stored, credentials by name, no secrets`, (t) => {
  if (offlineOnly(t)) return;
  assert.equal(WF.active ?? false, false);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.settings.saveDataSuccessExecution, 'none');
  const names = new Set(WF.nodes.map((n) => n.name));
  assert.equal(names.size, WF.nodes.length);
  for (const [a, c] of Object.entries(WF.connections)) { assert.ok(names.has(a), a); for (const o of c.main) for (const l of o) assert.ok(names.has(l.node), l.node); }
  for (const n of WF.nodes) for (const c of Object.values(n.credentials || {})) assert.ok(c.name && !('data' in c), n.name);
  assert.doesNotMatch(JSON.stringify(WF), /sk-ant-|EAA[A-Za-z0-9]{40}|BEGIN [A-Z ]*PRIVATE KEY|\+27\d{9}/);
});

test(`W20 [${MODE}] every WhatsApp W20 sends matches a submitted template: same body parameter count and URL-button suffixes`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  await sys.seed(newBroker({ last_seen_at: iso(T0 - H) }));
  await sys.event(evt('broker.created'));
  await sys.mock({ register: { kind: 'ok', statusCode: 200, body: { found: false } } });
  await sys.event(evt('fsp.submitted', { step: 'profile' }));
  await sys.mock({ register: REGISTER_OK, slots: [] });
  await sys.event(evt('fsp.submitted', { step: 'profile' }));
  await sys.event(evt('calendar.connected', { step: 'calendar' }));
  await sys.mock({ slots: [{ start: '2026-10-13T10:00:00+02:00' }] });
  await sys.event(evt('calendar.connected', { step: 'calendar' }));
  await sys.event(evt('calendar.failed', { step: 'calendar', payload: { reason: 'admin_consent' } }));
  await sys.event(evt('step.completed', { step: 'calendar' }));
  await sys.sweep(T0 + 24 * H + 30 * MIN);
  await sys.sweep(T0 + 72 * H + 30 * MIN); // availability was defaulted at +24.5 h (new clock) -> this is that stall's 24-h nudge
  await sys.sweep(T0 + 97 * H);             // 72 h after the default -> 72-h nudge
  const s = await sys.state('brk_test_onb');
  const used = new Set();
  for (const m of s.sends) {
    const name = submitted(m.template); used.add(name);
    const tpl = template(name); // throws if the file is missing
    const body = tpl.components.find((c) => c.type === 'BODY').text;
    assert.equal((body.match(/\{\{\d+\}\}/g) || []).length, (m.params || []).length, `${name}: body parameter count`);
    const urlVars = (tpl.components.find((c) => c.type === 'BUTTONS')?.buttons || []).filter((b) => b.type === 'URL' && /\{\{1\}\}/.test(b.url)).length;
    assert.equal((m.buttons || []).filter((b) => b.suffix).length, urlVars, `${name}: URL suffix count`);
    for (const p of m.params) assert.doesNotMatch(String(p), /[\n\t]/, `${name}: no newline in a parameter`);
  }
  for (const n of ['broker_onb_welcome', 'broker_onb_issue', 'broker_onb_calendar_ok', 'broker_onb_next', 'broker_onb_nudge_24h', 'broker_onb_nudge_72h']) assert.ok(used.has(n), `${n} exercised`);
});

test('W20 W20.json sends the submitted template names (broker_onb_*) directly', () => {
  const sent = new Set([...JSON.stringify(WF).matchAll(/template: '([a-z_0-9]+)'/g)].map((m) => m[1]));
  for (const n of sent) assert.equal(submitted(n), n, `${n} -> ${submitted(n)}`);
  assert.ok(sent.size >= 6, 'the broker_onb_* sends are found');
});

// =============================================================================================
// Scenario 1: welcome once, idempotent on a replayed event_id; signature + freshness
// =============================================================================================
test(`W20 [${MODE}] S1 broker.created -> one welcome WhatsApp + one email from howzit@ (bcc howzit@); a replayed event_id sends nothing`, async () => {
  const sys = fresh();
  await sys.seed(newBroker());
  const ev = evt('broker.created', { event_id: 'ev_created_1' });
  assert.equal((await sys.event(ev)).status, 202);
  const r2 = await sys.event(ev, { now: T0 + 2 * MIN });
  assert.equal(r2.status, 202);
  const s = await sys.state('brk_test_onb');
  const w = sendsOf(s, 'broker_onb_welcome');
  assert.equal(w.length, 1, 'welcome WhatsApp exactly once');
  assert.deepEqual(w[0].params, ['Mark']);
  assert.equal(w[0].buttons[0].suffix, 'mk_brk_test_onb', 'magic-link token in the Open my portal button');
  const e = s.emails.filter((m) => m.log_type === 'welcome');
  assert.equal(e.length, 1);
  if (MODE === 'offline') {
    assert.match(e[0].graph_url, /users\/howzit%40leadvelocity\.co\.za\/sendMail$/);
    assert.deepEqual(e[0].graph_body.message.bccRecipients, [{ emailAddress: { address: 'howzit@leadvelocity.co.za' } }]);
  }
});

test(`W20 [${MODE}] S1 a bad signature or an event older than 15 min is rejected 401 and sends nothing`, async () => {
  const sys = fresh();
  await sys.seed(newBroker());
  const ev = evt('broker.created');
  assert.equal((await sys.event(ev, { signature: 'sha256=' + '0'.repeat(64) })).status, 401);
  assert.equal((await sys.event(ev, { now: T0 + 16 * MIN })).status, 401, 'stale_or_replayed');
  const s = await sys.state('brk_test_onb');
  assert.equal(s.sends.length + s.emails.length, 0);
});

// =============================================================================================
// Scenario 2: FSCA register check
// =============================================================================================
test(`W20 [${MODE}] S2 FSP on the register, authorised, name matches, long-term category -> verified, profile done, no alert`, async () => {
  const sys = fresh();
  await sys.seed(newBroker());
  await sys.mock({ register: REGISTER_OK });
  await sys.event(evt('fsp.submitted', { step: 'profile' }));
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.fsp_check.status, 'verified');
  assert.ok(s.broker.fsp_verified_at);
  assert.equal(s.broker.onboarding_progress.profile.status, 'done');
  assert.equal(s.alerts.length, 0);
  assert.equal(s.sends.length, 0, 'the portal shows the tick; no WhatsApp');
});

for (const [label, register, reason] of [
  ['FSP not found', { kind: 'ok', statusCode: 200, body: { found: false } }, 'not_found'],
  ['register name differs', { ...REGISTER_OK, body: { ...REGISTER_OK.body, register_name: 'Ubuntu Wealth Partners CC' } }, 'name_mismatch'],
  ['not authorised for long-term (life)', { ...REGISTER_OK, body: { ...REGISTER_OK.body, categories: ['Short-term Insurance: Personal Lines'] } }, 'not_authorised_for_life'],
  ['licence not active', { ...REGISTER_OK, body: { ...REGISTER_OK.body, status: 'Lapsed' } }, 'not_active:Lapsed'],
]) {
  test(`W20 [${MODE}] S2 ${label} -> blocked, red alert to Jonathan, soft broker message, never verified`, async () => {
    const sys = fresh();
    await sys.seed(newBroker());
    await sys.mock({ register });
    await sys.event(evt('fsp.submitted', { step: 'profile' }));
    const s = await sys.state('brk_test_onb');
    assert.equal(s.broker.fsp_check.status, 'blocked');
    assert.equal(s.broker.fsp_check.reason, reason);
    assert.equal(s.broker.fsp_verified_at, null);
    assert.equal(s.broker.onboarding_progress.profile.status, 'blocked');
    const a = s.alerts.filter((x) => x.signal_key === 'fsca_check_mismatch');
    assert.equal(a.length, 1); assert.equal(a[0].severity, 'red'); assert.match(a[0].first_action, /FSCA register/);
    const m = sendsOf(s, 'broker_onb_issue');
    assert.equal(m.length, 1);
    assert.match(m[0].params[1], /could not match your FSP number/);
    assert.doesNotMatch(m[0].params.join(' '), /fail|fraud|reject|invalid/i, 'soft wording');
  });
}

test(`W20 [${MODE}] S2 register lookup times out on all 3 tries -> pending_manual, amber alert, broker told we check by hand`, async () => {
  const sys = fresh();
  await sys.seed(newBroker());
  await sys.mock({ register: { kind: 'timeout' } });
  await sys.event(evt('fsp.submitted', { step: 'profile' }));
  const s = await sys.state('brk_test_onb');
  assert.equal(s.fsca_calls, 3, 'node retryOnFail: 3 tries');
  assert.equal(s.broker.fsp_check.status, 'pending_manual');
  assert.equal(s.broker.fsp_check.reason, 'lookup_error');
  const a = s.alerts.find((x) => x.signal_key === 'fsca_check_pending_manual');
  assert.ok(a); assert.equal(a.severity, 'amber');
  assert.match(sendsOf(s, 'broker_onb_issue')[0].params[2], /checking it by hand/);
});

test(`W20 [${MODE}] S2 attempts accumulate across re-submits (the portal switches to a hand check after 3)`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  await sys.seed(newBroker());
  await sys.mock({ register: { kind: 'ok', statusCode: 200, body: { found: false } } });
  for (let i = 0; i < 3; i++) await sys.event(evt('fsp.submitted', { step: 'profile' }));
  assert.equal((await sys.state('brk_test_onb')).broker.fsp_check.attempts, 3);
});

// =============================================================================================
// Scenario 3: stall nudges (24 h, 72 h), quiet hours, clock reset
// =============================================================================================
async function sweepEvery30(sys, from, to) { for (let t = from; t <= to; t += 30 * MIN) await sys.sweep(t); }

test(`W20 [${MODE}] S3 24 h without progress -> exactly one nudge naming the stalled step; 72 h -> second nudge + email + console to-do; never a third`, async () => {
  const sys = fresh();
  // Profile done Monday 09:00, then nothing. Stalled step = calendar.
  await sys.seed(newBroker({ fsp_verified_at: iso(T0), last_seen_at: iso(T0), onboarding_progress: { profile: done() } }));
  await sweepEvery30(sys, T0 + 30 * MIN, T0 + 7 * D);
  const s = await sys.state('brk_test_onb');
  const n24 = sendsOf(s, 'broker_onb_nudge_24h');
  const n72 = sendsOf(s, 'broker_onb_nudge_72h');
  assert.equal(n24.length, 1, 'one 24-h nudge');
  assert.equal(n72.length, 1, 'one 72-h nudge');
  assert.equal(n24[0].at, iso(T0 + 24 * H), 'Tue 09:00 (inside send hours)');
  assert.deepEqual(n24[0].params.slice(0, 3), ['Mark', 'Connect your Outlook calendar', '1 minute']);
  assert.equal(n24[0].buttons[0].suffix, 'calendar');
  assert.equal(n72[0].at, iso(T0 + 72 * H));
  assert.equal(n72[0].params[1], 'Connect your Outlook calendar');
  assert.equal(s.emails.filter((e) => e.log_type === 'nudge_72h_email').length, 1, '72-h email');
  assert.equal(s.alerts.filter((a) => a.signal_key === 'broker_onboarding_stalled').length, 1, 'console to-do for Jonathan via W22');
});

test(`W20 [${MODE}] S3 no WhatsApp nudge between 19:00 and 08:00 SAST (spec 10 rule 3); a nudge due at 21:00 goes at 08:00`, async () => {
  const sys = fresh();
  const late = ms('2026-10-12T21:00:00+02:00');
  await sys.seed(newBroker({ last_seen_at: iso(late), onboarding_last_progress_at: iso(late), first_login_at: iso(late) }));
  await sweepEvery30(sys, late, late + 4 * D);
  const s = await sys.state('brk_test_onb');
  assert.ok(s.sends.length >= 1);
  for (const m of s.sends) { const h = sast(ms(m.at)).hh; assert.ok(h >= 8 && h < 19, `${m.template} at ${m.at}`); }
  assert.equal(sendsOf(s, 'broker_onb_nudge_24h')[0].at, '2026-10-14T08:00:00+02:00');
});

test(`W20 [${MODE}] S3 progress resets the clock: no nudge right after progress; the 72-h nudge of the old stall never fires`, async () => {
  const sys = fresh();
  await sys.seed(newBroker({ fsp_verified_at: iso(T0), onboarding_progress: { profile: done() }, last_seen_at: iso(T0) }));
  await sweepEvery30(sys, T0 + 30 * MIN, T0 + 30 * H);
  assert.equal(sendsOf(await sys.state('brk_test_onb'), 'broker_onb_nudge_24h').length, 1);
  const p = T0 + 30 * H + 15 * MIN; // Tue 15:15: calendar step done in the portal
  await sys.touch('brk_test_onb', { onboarding_last_progress_at: iso(p), last_seen_at: iso(p), onboarding_progress: { profile: done(), calendar: done('broker', iso(p)) } });
  await sweepEvery30(sys, p + 15 * MIN, T0 + 72 * H + 30 * MIN);
  const s = await sys.state('brk_test_onb');
  assert.equal(sendsOf(s, 'broker_onb_nudge_72h').length, 0, 'old stall closed');
  const again = sendsOf(s, 'broker_onb_nudge_24h');
  assert.equal(again.length, 2, 'a new stall gets its own 24-h nudge');
  assert.ok(ms(again[1].at) >= p + 24 * H, 'not before 24 h after the progress');
  assert.notEqual(again[1].params[1], 'Connect your Outlook calendar', 'names the new stalled step');
});

test(`W20 [${MODE}] S3 a broker active in the portal in the last 10 min is not nudged by the sweep`, async () => {
  const sys = fresh();
  const at = T0 + 25 * H;
  await sys.seed(newBroker({ last_seen_at: iso(at - 5 * MIN) }));
  await sys.sweep(at);
  assert.equal((await sys.state('brk_test_onb')).sends.length, 0);
});

test(`W20 [${MODE}] S3 availability untouched 24 h after the calendar step -> defaulted (never stalls go-live)`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  const cal = T0 + H;
  await sys.seed(newBroker({ fsp_verified_at: iso(T0), last_seen_at: iso(cal), onboarding_progress: { profile: done(), calendar: done('system', iso(cal)) } }));
  await sys.sweep(cal + 24 * H + 30 * MIN);
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.onboarding_progress.availability.status, 'defaulted');
  assert.equal(s.broker.onboarding_progress.availability.by, 'system');
});

// =============================================================================================
// Scenario 4: calendar connected with 0 slots
// =============================================================================================
test(`W20 [${MODE}] S4 calendar.connected with 0 slots -> "check your hours" message, calendar step NOT done`, async () => {
  const sys = fresh();
  await sys.seed(newBroker({ last_seen_at: iso(T0 - H) }));
  await sys.mock({ slots: [] });
  await sys.event(evt('calendar.connected', { step: 'calendar' }));
  const s = await sys.state('brk_test_onb');
  assert.notEqual(s.broker.onboarding_progress.calendar?.status, 'done');
  const m = sendsOf(s, 'broker_onb_issue');
  assert.equal(m.length, 1);
  assert.match(m[0].params[1], /cannot see any free time/);
  assert.match(m[0].params[2], /Check your hours/);
  assert.equal(m[0].buttons[0].suffix, 'calendar');
});

test(`W20 [${MODE}] S4 calendar.connected with slots -> step done, next free slot cached, "Calendar connected" with the slot label`, async () => {
  const sys = fresh();
  await sys.seed(newBroker({ last_seen_at: iso(T0 - H) }));
  await sys.mock({ slots: [{ start: '2026-10-13T10:00:00+02:00' }, { start: '2026-10-14T09:00:00+02:00' }] });
  await sys.event(evt('calendar.connected', { step: 'calendar' }));
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.onboarding_progress.calendar.status, 'done');
  assert.equal(s.broker.calendar_status, 'ok');
  assert.equal(s.broker.next_free_slot_at, '2026-10-13T10:00:00+02:00');
  assert.deepEqual(sendsOf(s, 'broker_onb_calendar_ok')[0].params, ['Mark', 'Tue 13 Oct, 10:00']);
});

// =============================================================================================
// Scenario 5: onboarded -> pre-flight once -> ready_for_go_live; stale pre-flight
// =============================================================================================
test(`W20 [${MODE}] S5 last hard step done -> onboarded, pre-flight called exactly once (a second event does not re-call)`, async () => {
  const sys = fresh();
  await sys.seed(nearlyDone('card'));
  await sys.touch('brk_test_onb', { onboarding_progress: { ...nearlyDone().onboarding_progress } });
  await sys.event(evt('card.approved', { step: 'card' }));
  await sys.event(evt('step.completed', { step: 'media', occurred_at: iso(T0 + MIN) }));
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'onboarded');
  assert.ok(s.broker.onboarding_completed_at);
  assert.equal(s.preflight_calls.length, 1);
  assert.deepEqual(s.preflight_calls[0].checks, ['fsp_verified', 'consent_mode_set', 'intro_card_gate', 'calendar_slots', 'test_lead_e2e']);
});

test(`W20 [${MODE}] S5 video/media never blocks: all 5 hard steps done, media todo -> onboarded`, async () => {
  const sys = fresh();
  await sys.seed(nearlyDone(null));
  await sys.event(evt('step.completed', { step: 'agreement' }));
  assert.equal((await sys.state('brk_test_onb')).broker.status, 'onboarded');
});

test(`W20 [${MODE}] S5 FSP not verified -> not onboarded even if every step says done`, async () => {
  const sys = fresh();
  await sys.seed(nearlyDone(null, { fsp_verified_at: null }));
  await sys.event(evt('step.completed', { step: 'card' }));
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'onboarding');
  assert.equal(s.preflight_calls.length, 0);
});

async function toOnboarded(sys) {
  await sys.seed(nearlyDone(null));
  await sys.event(evt('step.completed', { step: 'card' }));
  return (await sys.state('brk_test_onb')).preflight_calls[0].run_id;
}
const card = (run_id, ran_at, pass = true, failIds = []) => ({ run_id, ran_at, all_pass: pass, checks: ['fsp_verified', 'consent_mode_set', 'intro_card_gate', 'calendar_slots', 'test_lead_e2e'].map((id) => ({ id, label: id, pass: !failIds.includes(id), detail: '' })) });

test(`W20 [${MODE}] S5 pre-flight pass -> ready_for_go_live, broker told "Jonathan will switch you on", Jonathan gets the gate (never auto-approves)`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'ready_for_go_live');
  assert.equal(s.broker.routing_on, false, 'routing stays off until the human gate');
  assert.equal(sendsOf(s, 'broker_onb_ready').length, 1);
  const g = s.alerts.find((a) => a.kind === 'w20_go_live_ready');
  assert.ok(g); assert.deepEqual(g.to, ['jonathan']); assert.match(g.default_if_ignored, /never auto-approves/);
});

test(`W20 [${MODE}] S5 pre-flight fail -> stays onboarded, red alert; a calendar_slots failure also tells the broker`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN), false, ['calendar_slots']), { now: T0 + 5 * MIN });
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'onboarded');
  assert.equal(s.alerts.find((a) => a.signal_key === 'preflight_failed').severity, 'red');
  assert.match(sendsOf(s, 'broker_onb_issue')[0].params[1], /does not show any free time/);
});

test(`W20 [${MODE}] S5 a result for an old run_id is ignored`, async () => {
  const sys = fresh();
  await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card('pf-old-run', iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  assert.equal((await sys.state('brk_test_onb')).broker.status, 'onboarded');
});

test(`W20 [${MODE}] S5 stale pass (> 24 h) -> Approve & go live refused 409 preflight_stale, broker not switched on`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  const r = await sys.goLive('brk_test_onb', { now: T0 + 25 * H });
  assert.equal(r.status, 409); assert.equal(r.error, 'preflight_stale');
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'ready_for_go_live'); assert.equal(s.broker.routing_on, false);
});

test(`W20 [${MODE}] S5 stale pass -> 409 AND the pre-flight is re-run once; a not-ready 409 does not re-run`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  const r = await sys.goLive('brk_test_onb', { now: T0 + 25 * H });
  assert.equal(r.status, 409); assert.equal(r.error, 'preflight_stale');
  const s = await sys.state('brk_test_onb');
  assert.equal(s.preflight_calls.length, 2, 'original run + one re-run');
  assert.equal(s.broker.status, 'ready_for_go_live'); assert.equal(s.broker.routing_on, false);
});

test('W20 S5 workflow wiring: the 409 path of "Gate preconditions met?" also reaches a pre-flight re-run, and the 409 body is unchanged', () => {
  const next = (WF.connections['Gate preconditions met?']?.main?.[1] || []).map((l) => l.node);
  assert.ok(next.includes('Respond 409 (go-live)'), 'still answers 409');
  assert.ok(next.some((x) => /pre-?flight/i.test(x)), `409 path goes to ${next.join(', ')}`);
  assert.deepEqual((WF.connections['Stale pre-flight?'].main[0] || []).map((l) => l.node), ['Re-run pre-flight (stale)']);
  assert.deepEqual((WF.connections['Re-run pre-flight (stale)'].main[0] || []).map((l) => l.node), ['Save preflight run (re-run)']);
  const q = node('Save preflight run (re-run)').parameters.query;
  assert.match(q, /status = 'ready_for_go_live'/, 'only touches a broker still waiting for the gate');
  assert.doesNotMatch(q, /preflight_card\s*=/, 'does not wipe the old card');
});

test('W20 broker audio routing is stated on the sticky note (pre-live -> W23, active -> W29)', () => {
  const c = node('About W20').parameters.content;
  assert.match(c, /pre-live[^\n]*W23/); assert.match(c, /active[^\n]*W29/);
});

// =============================================================================================
// Scenario 6: go-live gate
// =============================================================================================
test(`W20 [${MODE}] S6 go_live.approved before ready_for_go_live -> 409 not_ready, nothing changes, nothing sent`, async () => {
  const sys = fresh();
  await sys.seed(nearlyDone('card'));
  const r = await sys.goLive('brk_test_onb', { now: T0 + MIN });
  assert.equal(r.status, 409); assert.equal(r.error, 'not_ready');
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'onboarding'); assert.equal(s.broker.routing_on, false);
  assert.equal(s.sends.length, 0);
});

test(`W20 [${MODE}] S6 ready + fresh pass + admin -> active, routing on, "you're live" with the next Monday; non-admin -> 409`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  assert.equal((await sys.goLive('brk_test_onb', { now: T0 + H, actor: 'uid_not_admin' })).status, 409);
  const r = await sys.goLive('brk_test_onb', { now: T0 + 2 * H });
  assert.equal(r.status, 200);
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'active'); assert.equal(s.broker.routing_on, true);
  assert.deepEqual(sendsOf(s, 'broker_onb_live')[0].params, ['Mark', 'Monday 19 Oct'], 'Mon 12 Oct 11:00 -> next Monday');
});

test(`W20 [${MODE}] S6 hand-off failure -> reverted to ready_for_go_live, routing off, 502, red alert, no "you're live"`, async () => {
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  await sys.mock({ handoffOk: false });
  const r = await sys.goLive('brk_test_onb', { now: T0 + H });
  assert.equal(r.status, 502);
  const s = await sys.state('brk_test_onb');
  assert.equal(s.broker.status, 'ready_for_go_live'); assert.equal(s.broker.routing_on, false);
  assert.equal(sendsOf(s, 'broker_onb_live').length, 0);
  assert.equal(s.alerts.find((a) => a.signal_key === 'go_live_handoff_failed').severity, 'red');
});

// =============================================================================================
// Scenario 7: do not talk over the product
// =============================================================================================
test(`W20 [${MODE}] S7 broker active in the portal in the last 10 min -> step prompt skipped; away 15 min -> one "next step" prompt`, async () => {
  const sys = fresh();
  await sys.seed(newBroker({ fsp_verified_at: iso(T0), onboarding_progress: { profile: done() }, last_seen_at: iso(T0 - 5 * MIN) }));
  await sys.event(evt('step.completed', { step: 'profile' }));
  assert.equal(sendsOf(await sys.state('brk_test_onb'), 'broker_onb_next').length, 0);
  await sys.touch('brk_test_onb', { last_seen_at: iso(T0 - 15 * MIN) });
  await sys.event(evt('step.completed', { step: 'profile' }));
  const n = sendsOf(await sys.state('brk_test_onb'), 'broker_onb_next');
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].params, ['Mark', 'Your details and FSP number', 'Connect your Outlook calendar', '1 minute']);
  assert.equal(n[0].buttons[0].suffix, 'calendar');
});

test(`W20 [${MODE}] POPIA/FAIS: nothing W20 sends names a lead, a product, an insurer or a price`, async (t) => {
  if (offlineOnly(t)) return;
  const sys = fresh();
  const run = await toOnboarded(sys);
  await sys.preflightResult('brk_test_onb', card(run, iso(T0 + 5 * MIN)), { now: T0 + 5 * MIN });
  await sys.goLive('brk_test_onb', { now: T0 + H });
  const s = await sys.state('brk_test_onb');
  const text = JSON.stringify([s.sends.map((m) => m.params), s.emails.map((e) => e.graph_body.message.body.content)]);
  assert.doesNotMatch(text, /\bR\s?\d/, 'no rand amount');
  assert.doesNotMatch(text, /premium|guarantee|Sanlam|Old Mutual|Discovery|Liberty/i);
  assert.ok(FIX.brokers.length >= 1);
});
