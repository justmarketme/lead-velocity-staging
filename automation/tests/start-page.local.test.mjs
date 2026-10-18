// The /start/ page, end to end on the REAL schema (2026-10-18). The workflows' own SQL (W03, W39, W01 core, W04, W05, W06) and
// their own Code nodes / libraries run against the repo's migration chain in a throwaway Postgres (automation/tests/_localpg.mjs:
// Docker --network none, or native binaries; never the live project). Nothing is sent: DRY_RUN_SENDS=true and every
// WhatsApp send is only planned. Synthetic data only (+27 82 000 03xx, @example.test).
//
// The chain under test:
//   W03  a CTWA "Hi" -> consent buttons; "Yes" -> lead row + ONE call-to-action with sortmycover.co.za/start/#lt=<token>
//        (brands.start_page = 'on'), conv_state start_page, a stall in wa_threads
//   W39  GET /start (not routed yet) -> POST /start/answers (in band) -> bands + qualified, W01 core routes WITHOUT a first
//        touch -> next 'slots'; the same request again replays; GET /start now shows the adviser
//   W04  GET /slots with the same token (shared calendar: Mark's hours minus our appointments)
//   W05  POST /book (Teams, email, no Turnstile secret) -> HELD (pending_verification); the email link (ev1) -> op finalize ->
//        the same row promoted to booked -> fan-out W06 op booking
//   W06  the one intro card (broker_intro_booked, with the practice + FSP disclosure), recorded as a DRY communications row
//   +    an under-35 lead (OUT_OF_BAND_AGE_BOOKS): routed, never qualified, a timeline note; a will: a person (escalation)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import { runCode, evalParam } from './_n8ncode.mjs';
import * as W4 from '../lib/w04.mjs';
import * as W5 from '../lib/w05.mjs';
import * as W39 from '../lib/w39.mjs';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'automation', f), 'utf8'));
const WF01 = load('W01.json'); const WF03 = load('W03.json'); const WF04 = load('W04.json'); const WF05 = load('W05.json'); const WF06 = load('W06.json'); const WF38 = load('W39.json');
const sqlOf = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n.parameters.query; };
const BACKEND = localPgBackend();
const PNID = '27600156480';
const SECRET = crypto.randomBytes(24).toString('hex');
const ENV = { LEAD_TOKEN_SECRET: SECRET, SUPABASE_JWT_SECRET: 'j'.repeat(40), PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za', DRY_RUN_SENDS: 'true', SITE_URL: 'https://sortmycover.co.za' };
const HOL = new Set(require('../index.cjs').holidays.holidays.map((h) => h.date));

test('the /start/ page on the real schema: CTA link -> answers -> routed without a first touch -> slots -> held booking -> email link -> booked -> intro card (dry)', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const app = (sql, params) => q('SET ROLE n8n_app;\n' + sql, params); // workflow SQL runs as n8n_app (RLS, grants)
  const j = (cell) => (cell === undefined || cell === '' ? null : JSON.parse(cell));
  const uuid = () => crypto.randomUUID();
  const BRAND = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  assert.equal(q(`SELECT start_page FROM public.brands WHERE id = '${BRAND}'`)[0][0], 'off', 'the switch ships off');
  q(`UPDATE public.brands SET phone_number_id = '${PNID}', start_page = 'on' WHERE id = '${BRAND}'`);

  // ---- Mark: SMC-ready, a paid order, shared calendar (no Graph), Teams + phone
  const user = uuid(); const MARK = uuid(); const ORDER = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-sp-mark@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url, calendar_mode, methods_supported)
     VALUES ('${MARK}', '${user}', 'Synthetic Advisory', 'Mark Smith', 'synthetic-sp-mark@example.test', 'active', '${BRAND}', true, '12345',
             'https://media.sortmycover.co.za/intro/synthetic/card.png', 'shared_fallback', ARRAY['teams','phone'])`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${ORDER}', '${MARK}', 'synthetic SMC order', 20, 'paid', now(), '${BRAND}')`);

  const lead = (id) => j(q(`SELECT to_jsonb(l) FROM public.leads l WHERE l.id = '${id}'`)[0][0]);
  const acts = (id) => q(`SELECT activity_type FROM public.lead_activities WHERE lead_id = '${id}' ORDER BY occurred_at, id`).map((r) => r[0]);
  const thread = (mobile) => { const r = q(`SELECT stage, stall_due_at FROM public.wa_threads WHERE brand_id = '${BRAND}' AND mobile_hash = public.smc_hash_contact('${mobile}')`)[0]; return r ? { stage: r[0], stall_due_at: r[1] || null } : null; };

  /** One inbound WhatsApp message through W03: the adapter, "Load context", "W03 step" (real Code node), "Save thread", the lead insert. */
  const w03 = async (mobile, msg, profile = 'Synthetic Thandi') => {
    const [ad] = await runCode(WF03, 'W07 hand-off -> Cloud API message', { items: [{ source: 'W07', profile_name: profile, msg: { wamid: `SM${uuid().replace(/-/g, '')}`, from: mobile, at_ms: Date.now(), phone_number_id: PNID, ...msg } }] });
    const c = app(sqlOf(WF03, 'Load context'), [PNID, mobile, ''])[0];
    const ctxRow = { brand_id: c[0], broker: j(c[1]), existing_open_lead_id: c[2] || null, lead: j(c[3]), suppressed: c[4] === 't', thread: j(c[5]), new_lead_id: c[6], start_page: c[7] === 't' };
    const [st] = await runCode(WF03, 'W03 step', { items: [ctxRow], refs: { 'W07 hand-off -> Cloud API message': ad.json }, env: ENV });
    if (st.json.store_thread) app(sqlOf(WF03, 'Save thread'), evalParam(WF03, 'Save thread', 'options.queryReplacement', { json: st.json }));
    const fan = await runCode(WF03, 'Fan out actions', { items: [st.json] });
    for (const f of fan.filter((x) => x.json.kind === 'insert_lead')) app(sqlOf(WF03, 'Insert lead (consent at the tap)'), evalParam(WF03, 'Insert lead (consent at the tap)', 'options.queryReplacement', { json: f.json }));
    for (const f of fan.filter((x) => x.json.kind === 'update_lead')) app(sqlOf(WF03, 'Update lead (answers / out-of-band)'), evalParam(WF03, 'Update lead (answers / out-of-band)', 'options.queryReplacement', { json: f.json }));
    return { ctxRow, st: st.json, sends: fan.filter((x) => x.json.kind === 'send').map((x) => x.json.message) };
  };
  const H = (tok) => ({ 'x-lead-token': tok, origin: 'https://sortmycover.co.za' });

  /** GET /start through W39's nodes. */
  const getStart = async (tok) => {
    const [c] = await runCode(WF38, 'Resolve caller (start)', { items: [{ headers: H(tok) }], env: ENV });
    if (!c.json.ok) return c.json;
    const r = app(sqlOf(WF38, 'Load lead, adviser, live booking'), evalParam(WF38, 'Load lead, adviser, live booking', 'options.queryReplacement', { json: c.json }))[0];
    const [v] = await runCode(WF38, 'View (w39.startView)', { items: [{ lead: j(r[0]), broker: j(r[1]), booking: j(r[2]) }] });
    return v.json;
  };
  /** W01 Lead core, route branch, with W39's input: "Load CTWA lead + brokers" -> Route -> "Write routing" -> "W06 input (CTWA)". */
  const w01core = async (input) => {
    const row = app(sqlOf(WF01, 'Load CTWA lead + brokers'), evalParam(WF01, 'Load CTWA lead + brokers', 'options.queryReplacement', { json: input }))[0];
    const [rt] = await runCode(WF01, 'Route (w01.routeExisting)', { items: [{ lead: j(row[0]), brokers: j(row[1]), first_touch: row[2] === 't' }] });
    let written = [];
    if (['routed', 'held'].includes(rt.json.r.action)) {
      written = app(sqlOf(WF01, 'Write routing (only if not routed yet) + timeline'), evalParam(WF01, 'Write routing (only if not routed yet) + timeline', 'options.queryReplacement', { json: rt.json }))
        .map(([lead_id, broker_id]) => ({ lead_id, broker_id: broker_id || null }));
    }
    const w06 = written.length ? await runCode(WF01, 'W06 input (CTWA)', { items: written, refs: { 'Route (w01.routeExisting)': rt.json } }) : [];
    return { r: rt.json.r, w06 };
  };
  /** POST /start/answers through W39's nodes (and W01 core when the plan routes). */
  const postAnswers = async (tok, body) => {
    const [c] = await runCode(WF38, 'Resolve caller + parse (answers)', { items: [{ headers: H(tok), body }], env: ENV });
    if (!c.json.ok) return { status: c.json.status, body: c.json.body };
    const r = app(sqlOf(WF38, 'Load lead + earlier answer (same request_id)'), evalParam(WF38, 'Load lead + earlier answer (same request_id)', 'options.queryReplacement', { json: c.json }))[0];
    const [d] = await runCode(WF38, 'Decide (w39.decideAnswers)', { items: [{ lead: j(r[0]), prior: j(r[1]) }], refs: { 'Resolve caller + parse (answers)': c.json } });
    if (d.json.plan.kind === 'reject') { const [rj] = await runCode(WF38, 'Reject (401)', { json: d.json }); return { status: rj.json.status, body: rj.json.body }; }
    const refs = { 'Decide (w39.decideAnswers)': d.json };
    let core = null;
    if (d.json.plan.kind === 'work') {
      const s = app(sqlOf(WF38, 'Save answers + timeline + cancel stall (one statement)'), evalParam(WF38, 'Save answers + timeline + cancel stall (one statement)', 'options.queryReplacement', { json: d.json }))[0];
      refs['Save answers + timeline + cancel stall (one statement)'] = { claimed: Number(s[0]), updated: Number(s[1]), threads: Number(s[2]), notes: Number(s[3]) };
      if (Number(s[0]) > 0 && d.json.plan.route) {
        const [inp] = await runCode(WF38, 'W01 Lead core input (no first touch)', { items: [{}], refs });
        core = await w01core(inp.json);
      }
    }
    const bk = app(sqlOf(WF38, 'Re-read broker_id'), evalParam(WF38, 'Re-read broker_id', 'options.queryReplacement', { refs }))[0]; // psql drops an all-NULL row
    const [a] = await runCode(WF38, 'Answer (w39.answer)', { items: [{ broker_id: (bk && bk[0]) || null }], refs });
    if (a.json.effects.some((e) => e.kind === 'escalate')) {
      const e = a.json.effects.find((x) => x.kind === 'escalate');
      app(sqlOf(WF38, 'Escalate to a person (wills)'), evalParam(WF38, 'Escalate to a person (wills)', 'options.queryReplacement', { json: e, refs }));
    }
    return { status: a.json.status, body: a.json.body, effects: a.json.effects, plan: d.json.plan, save: refs['Save answers + timeline + cancel stall (one statement)'] || null, core };
  };

  // =========================================================================================== 1. W03: the CTA link
  const MOBILE = '+27820000301';
  const first = await w03(MOBILE, { type: 'text', text: 'Hi', referral: { source_id: '120200000000000001', source_type: 'ad', ctwa_clid: 'clid_sp_1' } });
  assert.deepEqual(first.sends.map((m) => m.type), ['button'], 'consent first (named: Synthetic Advisory, FSP 12345)');
  assert.match(first.sends[0].body, /Synthetic Advisory \(FSP 12345\)/);
  assert.equal(first.ctxRow.start_page, true, 'W03 Load context reads brands.start_page');
  const yes = await w03(MOBILE, { type: 'button', payload: 'consent_yes', text: 'Yes, continue' });
  assert.equal(yes.sends.length, 1);
  const cta = yes.sends[0];
  assert.equal(cta.type, 'cta_url');
  assert.match(cta.body, /^Thanks Synthetic\. Lovely to have you here\. Tap below to answer a few quick questions and pick a time with Mark\./);
  const TOKEN = cta.url.split('#lt=')[1];
  assert.ok(cta.url.startsWith('https://sortmycover.co.za/start/#lt=lt1.'), 'the token rides in the fragment');
  const LEAD_ID = LT.verifyLeadToken(TOKEN, { secret: SECRET }).lead_id;
  const l0 = lead(LEAD_ID);
  assert.deepEqual([l0.origin, l0.stage, l0.conv_state.state, l0.broker_id], ['ctwa', 'verified', 'start_page', null], 'CTWA lead stored at the tap, not routed yet');
  assert.ok(thread(MOBILE).stall_due_at, 'a stall like q_age');
  assert.equal(thread(MOBILE).stage, 'start_page');
  // the outbound row W03 stores is the body only
  const [body] = await runCode(WF03, 'Build Cloud API body', { items: [{ message: cta, _mobile: MOBILE, _pnid: PNID, _brand_id: BRAND, _lead_id: LEAD_ID, _wamid: 'SMx' }] });
  assert.equal(body.json.body.interactive.action.parameters.url, cta.url); assert.doesNotMatch(body.json.content, /lt1\./);

  // =========================================================================================== 2. W39
  const v0 = await getStart(TOKEN);
  assert.deepEqual(v0, { status: 200, body: { first_name: 'Synthetic', adviser: null, methods: [], answers: {}, booking: null } });
  assert.deepEqual((await getStart('lt1.bad')).body, { error: 'try_again' });
  const bad = await postAnswers(TOKEN, { intent: 'life', request_id: 'req-sp-0001' });
  assert.deepEqual([bad.status, bad.body], [400, { error: 'invalid' }]);
  const BODY = { intent: 'life', age_band: '35_44', has_cover: 'no', budget_band: '1500_plus', want: 'family', request_id: 'req-sp-0001' };
  const a1 = await postAnswers(TOKEN, BODY);
  assert.deepEqual([a1.status, a1.body], [200, { ok: true, next: 'slots' }]);
  assert.equal(a1.core.r.action, 'routed'); assert.equal(a1.core.r.first_touch, null);
  assert.deepEqual(a1.core.w06, [], 'NO W06 first touch: the page shows the slots');
  assert.deepEqual(a1.save, { claimed: 1, updated: 1, threads: 1, notes: 0 });
  const l1 = lead(LEAD_ID);
  assert.deepEqual([l1.age_band, l1.budget_band, l1.stage, l1.broker_id, l1.order_state, l1.lead_tier], ['35_44', '1500_plus', 'qualified', MARK, 'attached', null]);
  assert.ok(l1.qualified_at); assert.equal(l1.first_message_at, null);
  assert.equal(l1.conv_state.state, 'unbooked'); assert.equal(l1.conv_state.help_with, 'life');
  assert.deepEqual([l1.conv_state.start.intent, l1.conv_state.start.has_cover, l1.conv_state.start.want, l1.conv_state.start.via], ['life', 'no', 'family', 'start_page']);
  assert.deepEqual(l1.reasons, ['life_cover']);
  assert.deepEqual(thread(MOBILE), { stage: 'done', stall_due_at: null }, "W03's stall is cancelled");
  assert.ok(acts(LEAD_ID).includes('start_page_answers') && acts(LEAD_ID).includes('routed'));
  assert.equal(acts(LEAD_ID).includes('first_touch_claimed'), false);
  // the same request again: replayed, nothing new
  const before = acts(LEAD_ID).length;
  const a2 = await postAnswers(TOKEN, BODY);
  assert.deepEqual([a2.body, a2.plan.kind, a2.effects], [{ ok: true, next: 'slots' }, 'replay', []]);
  assert.equal(acts(LEAD_ID).length, before);
  const v1 = await getStart(TOKEN);
  assert.deepEqual(v1.body.adviser, { first_name: 'Mark', name: 'Mark Smith', firm: 'Synthetic Advisory', fsp: '12345' });
  assert.deepEqual(v1.body.methods, ['teams', 'phone']);
  assert.deepEqual(v1.body.answers, { intent: 'life', age_band: '35_44', has_cover: 'no', budget_band: '1500_plus', want: 'family' });

  // =========================================================================================== 3. W04 GET /slots (same token)
  const now = Date.now();
  const c4 = W4.resolveCaller(H(TOKEN), { days: '14' }, ENV, now);
  assert.equal(c4.ok, true);
  const r4 = app(sqlOf(WF04, 'Load lead + broker + holds (http)'), [c4.lead_id, ''])[0];
  const x4 = { lane: 'http', req: c4, lead: j(r4[0]), broker: j(r4[1]), bookings: j(r4[2]) || [] };
  const p4 = W4.planRequest(x4);
  assert.deepEqual([p4.next, p4.route], ['compute', 'shared'], 'shared calendar: no Graph');
  const s4 = W4.respond({ ...x4, busy: [], route: p4.route, now, holidays: HOL });
  assert.equal(s4.status, 200); assert.ok(s4.body.slots.length > 0, 'slots listed');
  assert.deepEqual(s4.body.methods, ['teams', 'phone']);
  const SLOT = s4.body.slots[0];

  // =========================================================================================== 4. W05 POST /book -> held
  const EMAIL = 'synthetic-sp-thandi@example.test';
  const W05_LOAD = sqlOf(WF05, 'Load lead, broker, replay, live booking');
  const isFree = (dec) => { // W05 -> W04 is_free (sub lane)
    const req = W4.subcallInput(dec.is_free);
    const r = app(sqlOf(WF04, 'Load broker + holds (sub)'), [req.broker_id])[0];
    return W4.respond({ lane: 'sub', req, broker: j(r[0]), bookings: j(r[1]) || [], busy: [], route: 'shared', now: Date.now(), holidays: HOL });
  };
  const book = (c) => { // Load -> decide -> is_free -> afterCheck -> Insert appointment
    const x = app(W05_LOAD, [c.req.lead_id, c.req.idempotency_key, ''])[0];
    const ctx = { lane: c.lane, mode: c.mode, req: c.req, lead: j(x[0]), broker: j(x[1]), broker_by_user: j(x[2]), existing: j(x[3]), live: j(x[4]), mx: { 'example.test': true }, now: Date.now(), test_clock: false };
    const dec = W5.decide(ctx);
    assert.equal(dec.action, 'check', JSON.stringify(dec.body || dec.reason || dec.action)); // Decision? output 5 -> is_free input
    const chk = W5.afterCheck(ctx, dec, isFree(dec));
    assert.equal(chk.action, 'insert', JSON.stringify(chk.body || chk));
    const item = { ctx, dec, check: chk, action: chk.action, status: chk.status, body: chk.body, row: chk.row || null, lane: c.lane };
    const ins = app(sqlOf(WF05, 'Insert appointment (re-check overlap + buffer, idempotent)'), evalParam(WF05, 'Insert appointment (re-check overlap + buffer, idempotent)', 'options.queryReplacement', { json: item, refs: { 'Decide (w05.decide + MX)': { ctx, dec } } }));
    const cols = ['id', 'client_id', 'broker_id', 'appointment_date', 'ends_at', 'method', 'status', 'booked_at', 'booked_via', 'idempotency_key', 'verify_by'];
    const row = Object.fromEntries(cols.map((k, i) => [k, ins[0][i] || null]));
    return { ctx, dec, chk, row, item };
  };
  const p5 = W5.parseHttp(H(TOKEN), { slot_start: SLOT.start, method: 'teams', email: EMAIL, request_id: 'req-sp-book-01', context: { source: 'start_page' } }, ENV, Date.now());
  assert.equal(p5.ok, true);
  assert.equal(p5.guard.turnstile_needed, false, 'TURNSTILE_SECRET_KEY unset: no Turnstile check');
  assert.equal(W5.bookGuard(p5.guard, { ip_hits: 0, lead_hits: 0, turnstile: null }, ENV).ok, true);
  assert.equal(p5.req.booked_via, 'page', 'appointments.booked_via stays page (its CHECK has no start_page)');
  const b1 = book(p5);
  assert.equal(b1.row.status, 'pending_verification', 'HELD: the email is not verified');
  const h = W5.holdPending(b1.ctx, b1.dec.plan, b1.row);
  app(sqlOf(WF05, 'Save hold: lead email (unverified) + timeline'), evalParam(WF05, 'Save hold: lead email (unverified) + timeline', 'options.queryReplacement', { json: { ...b1.item, booking: b1.row, hold: h } }));
  assert.equal(h.response.status, 201); assert.equal(h.response.body.held, true); assert.equal(h.response.body.verify, 'email');
  const vHeld = await getStart(TOKEN);
  assert.equal(vHeld.body.booking.held, true); assert.equal(vHeld.body.booking.method, 'teams');

  // =========================================================================================== 5. ev1 link -> finalize -> booked
  q(`UPDATE public.leads SET email_verified = true, email_verified_at = now(), email_verified_via = 'link' WHERE id = '${LEAD_ID}'`); // what smc-email-verify does on GET /v/<ev1>
  const fin = app(sqlOf(WF05, 'Load held slot + lead (finalize)'), [LEAD_ID, ''])[0];
  const freq = W5.finalizeRequest(j(fin[0]), j(fin[1]), Date.now());
  assert.ok(freq && freq.finalize_booking_id === b1.row.id, 'the held row is handed over');
  const b2 = book({ lane: 'sub', ok: true, req: freq, hdr: {} });
  assert.deepEqual([b2.row.id, b2.row.status], [b1.row.id, 'booked'], 'the same row is PROMOTED, nothing re-inserted');
  const sharedItem = W5.sharedEventItem(b2.ctx, b2.dec.plan, {}, {});
  const ev = W5.afterEvent(sharedItem); // no shared calendar id in this test: no Graph call
  const f = W5.finish(b2.ctx, b2.dec.plan, b2.row, ev, { site: ENV.SITE_URL, ics_secret: SECRET });
  app(sqlOf(WF05, 'Save event ids + lead (stage, broker, invite email)'), evalParam(WF05, 'Save event ids + lead (stage, broker, invite email)', 'options.queryReplacement', { json: { ...b2.item, booking: b2.row, ev, f } }));
  app(sqlOf(WF05, 'Timeline: booked'), evalParam(WF05, 'Timeline: booked', 'options.queryReplacement', { refs: { 'After event (w05.finish)': { ...b2.item, booking: b2.row, ev, f } } }));
  assert.equal(lead(LEAD_ID).stage, 'booked');
  assert.ok(f.w06 && f.w06.op === 'booking', 'fan-out: W06 op booking');
  const vBooked = await getStart(TOKEN);
  assert.equal(vBooked.body.booking.held, false);

  // =========================================================================================== 6. W06 op booking -> the intro card, dry
  const r6 = app(sqlOf(WF06, 'Load lead, broker, brand, live booking'), [LEAD_ID, f.w06.booking_id])[0];
  const cols6 = ['id', 'brand_id', 'origin', 'first_name', 'phone', 'language', 'broker_id', 'routed_at', 'stage', 'opted_out_at', 'duplicate_of', 'disqualified_reason', 'first_message_at', 'suppressed', 'practice_name', 'fsp_number', 'adviser_name', 'intro_card_url', 'booking_ui', 'booking'];
  const l6 = Object.fromEntries(cols6.map((k, i) => [k, r6[i] === '' ? null : r6[i]]));
  l6.suppressed = l6.suppressed === 't'; l6.booking = j(r6[19]);
  const trig = { 'Called by W01 / W05 / W07 (op routed | skip | booking | status)': f.w06 };
  const [hold6] = await runCode(WF06, 'Hold for the in-page booking? (w06.holdSeconds)', { items: [l6], refs: trig });
  assert.deepEqual([hold6.json.blocked, hold6.json.hold_s], [null, 0], 'a ctwa lead: not blocked, no 45-s page hold');
  const claim = app(sqlOf(WF06, 'Claim the one first touch (w06:first:{lead_id})'), evalParam(WF06, 'Claim the one first touch (w06:first:{lead_id})', 'options.queryReplacement', { json: hold6.json }));
  assert.equal(claim.length, 1, 'W39 sent no first touch, so the booking claims the one intro card');
  const [cl] = await runCode(WF06, 'Claimed? -> need W04 slots?', { items: claim.map((r) => ({ lead_id: r[0] })), refs: { 'Hold for the in-page booking? (w06.holdSeconds)': hold6.json, 'Event after hold': {} } }); // .isExecuted is undefined = not run (no hold)
  assert.deepEqual([cl.json.claimed, cl.json.need_slots, cl.json.late_booking], [true, false, false]);
  const [plan6] = await runCode(WF06, 'Plan card (w06.planFirstTouch + toCloudApi)', { items: [{}], refs: { 'Claimed? -> need W04 slots?': cl.json }, env: ENV });
  assert.equal(plan6.json.plan.template, 'broker_intro_booked', 'the disclosure card with the booked time (practice + FSP + adviser)');
  assert.equal(plan6.json.dry, true, 'DRY_RUN_SENDS');
  const stand = await runCode(WF06, 'Dry run: stand-in response (external_id dry:w06:first:{lead_id})', { json: plan6.json });
  const [evid] = await runCode(WF06, 'Evidence rows (w06.communicationRow + sentUpdate)', { items: [stand[0].json], refs: { 'Plan card (w06.planFirstTouch + toCloudApi)': plan6.json } });
  app(sqlOf(WF06, 'Log card + stamp lead + timeline (one statement; last_contact_at only with a wamid)'), evalParam(WF06, 'Log card + stamp lead + timeline (one statement; last_contact_at only with a wamid)', 'options.queryReplacement', { json: evid.json }));
  const comm = q(`SELECT template_name, external_id, metadata->>'dry_run', metadata->>'is_disclosure', content FROM public.communications WHERE lead_id = '${LEAD_ID}' AND workflow = 'W06'`);
  assert.equal(comm.length, 1);
  assert.deepEqual(comm[0].slice(0, 4), ['broker_intro_booked', `dry:w06:first:${LEAD_ID}`, 'true', 'true'], 'recorded as dry, as disclosure evidence');
  assert.match(comm[0][4], /Synthetic Advisory \(FSP 12345\)/);
  assert.ok(lead(LEAD_ID).first_message_at, 'first_message_at is stamped by the intro card');

  // =========================================================================================== 7. under 35 (OUT_OF_BAND_AGE_BOOKS) and a will
  const yes2 = await (async () => { const m = '+27820000302'; await w03(m, { type: 'text', text: 'Hi', referral: { source_id: '1', source_type: 'ad' } }, 'Synthetic Sipho'); return w03(m, { type: 'button', payload: 'consent_yes', text: 'Yes' }, 'Synthetic Sipho'); })();
  const TOK2 = yes2.sends[0].url.split('#lt=')[1];
  const ID2 = LT.verifyLeadToken(TOK2, { secret: SECRET }).lead_id;
  const o = await postAnswers(TOK2, { intent: 'income', age_band: 'lt35', budget_band: '750_1250', request_id: 'req-sp-0002' });
  assert.deepEqual(o.body, { ok: true, next: 'slots' }, 'Jono, 18 Oct: under-35 may book with Mark');
  const lo = lead(ID2);
  assert.deepEqual([lo.age_band, lo.qualified_at, lo.stage, lo.broker_id, lo.disqualified_reason], ['lt35', null, 'verified', MARK, null], 'routed, never qualified');
  assert.equal(lo.conv_state.age_accepted, true);
  assert.ok(acts(ID2).includes('start_page_age_out_of_band'));

  const yes3 = await (async () => { const m = '+27820000303'; await w03(m, { type: 'text', text: 'Hi', referral: { source_id: '1', source_type: 'ad' } }, 'Synthetic Lerato'); return w03(m, { type: 'button', payload: 'consent_yes', text: 'Yes' }, 'Synthetic Lerato'); })();
  const TOK3 = yes3.sends[0].url.split('#lt=')[1];
  const ID3 = LT.verifyLeadToken(TOK3, { secret: SECRET }).lead_id;
  const w = await postAnswers(TOK3, { intent: 'will', request_id: 'req-sp-0003' });
  assert.deepEqual(w.body, { ok: true, next: 'chat' });
  assert.deepEqual(lead(ID3).product_interest, 'wills'); assert.equal(lead(ID3).conv_state.state, 'handoff'); assert.equal(lead(ID3).broker_id, null);
  assert.equal(q(`SELECT count(*) FROM public.escalations WHERE lead_id = '${ID3}' AND kind = 'human_handoff'`)[0][0], '1', 'a person is asked');
  const send = w.effects.find((e) => e.kind === 'send').message;
  assert.equal(send.kind, 'text'); assert.match(send.text, /Capital Legacy consultant/);
  // opted out: both endpoints refuse the token at once
  q(`UPDATE public.leads SET opted_out_at = now() WHERE id = '${ID3}'`);
  assert.deepEqual((await getStart(TOK3)).body, { error: 'try_again' });
  assert.equal((await postAnswers(TOK3, { intent: 'other', request_id: 'req-sp-0004' })).status, 401);
});
