// The /start/ page, end to end on the REAL schema (2026-10-18). The workflows' own SQL (W03, W39, W01 core, W04, W05, W06) and
// their own Code nodes / libraries run against the repo's migration chain in a throwaway Postgres (automation/tests/_localpg.mjs:
// Docker --network none, or native binaries; never the live project). Nothing is sent: DRY_RUN_SENDS=true and every
// WhatsApp send is only planned. Synthetic data only (+27 82 000 03xx, @example.test).
//
// The chain under test (v4 order, Jono approved mockup v4.2, 19 Oct 2026):
//   W03  a CTWA "Hi" -> consent buttons; "Yes" -> lead row + ONE "Start here" call-to-action with sortmycover.co.za/start/#lt=<token>
//        (brands.start_page = 'on'), conv_state start_page, a stall in wa_threads
//   W39  GET /start (not routed yet: the preview card) -> POST /start/adviser: no confirm = the card, nothing routed; a wrong
//        confirm routes nothing; confirm -> adviser_disclosed, THEN W01 core routes WITHOUT a first touch -> next 'slots'
//   W04  GET /slots with the same token (shared calendar: Mark's hours minus our appointments)
//   W05  POST /book (Teams, email) -> HELD for the email only (never for the budget band: start-page = band-known); the email
//        link -> op finalize -> booked -> W06 op booking (the one intro card, dry); then POST /start/answers v4 -> done
//   phone a CTWA lead: POST /start/contact (call_number + alt_number) -> /book phone with NO email -> booked at once
//   move POST /start/move -> W10's own pick op (claim, is_free, move in place) -> the re-read row; past now + 14 days -> 400
//   web  POST /lead start_page (desktop "Book", no token) -> adviser -> slots -> contact -> /book phone + email -> held for the
//        email (an unproven number) -> link -> booked -> answers v4 -> done
//   +    a v3 body (pages opened before the deploy): a will -> a person (escalation)
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
import * as W01 from '../lib/w01.mjs';
import * as W10 from '../lib/w10.mjs';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'automation', f), 'utf8'));
const WF01 = load('W01.json'); const WF03 = load('W03.json'); const WF04 = load('W04.json'); const WF05 = load('W05.json'); const WF06 = load('W06.json'); const WF39 = load('W39.json'); const WF10 = load('W10.json'); const WF12 = load('W12.json');
/** The v4 "Start here" message (Jono, 19 Oct 2026). */
const START_HERE_RE = /^Hi Synthetic, I'm Lindi from SortMyCover./;
const sqlOf = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n.parameters.query; };
const BACKEND = localPgBackend();
const PNID = '27600156480';
const SECRET = crypto.randomBytes(24).toString('hex');
const ENV = { LEAD_TOKEN_SECRET: SECRET, SUPABASE_JWT_SECRET: 'j'.repeat(40), PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za', DRY_RUN_SENDS: 'true', SITE_URL: 'https://sortmycover.co.za' };
const HOL = new Set(require('../index.cjs').holidays.holidays.map((h) => h.date));

test('the /start/ page v4 on the real schema: CTA link -> adviser confirm -> slots -> (contact) -> book -> verify -> booked -> answers -> done, never held for the band', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
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
    const [c] = await runCode(WF39, 'Resolve caller (start)', { items: [{ headers: H(tok) }], env: ENV });
    if (!c.json.ok) return c.json;
    const r = app(sqlOf(WF39, 'Load lead, adviser, live booking'), evalParam(WF39, 'Load lead, adviser, live booking', 'options.queryReplacement', { json: c.json }))[0];
    const [v] = await runCode(WF39, 'View (w39.startView)', { items: [{ lead: j(r[0]), broker: j(r[1]), brokers: j(r[2]), booking: j(r[3]) }] });
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
  /** POST /start/answers or POST /start/adviser through W39's own nodes (the adviser chain is the cloned ' [adviser]' one). */
  const chainRun = async (tok, body, kind = 'answers') => {
    const x = kind === 'adviser' ? ' [adviser]' : '';
    const N = (nm) => nm + x;
    const DEC = kind === 'adviser' ? 'Decide (w39.decideAdviser)' : 'Decide (w39.decideAnswers)';
    const [c] = await runCode(WF39, N('Resolve caller + parse (answers)'), { items: [{ headers: H(tok), body }], env: ENV });
    if (!c.json.ok) return { status: c.json.status, body: c.json.body };
    const r = app(sqlOf(WF39, N('Load lead + earlier answer (same request_id)')), evalParam(WF39, N('Load lead + earlier answer (same request_id)'), 'options.queryReplacement', { json: c.json }))[0];
    const [d] = await runCode(WF39, DEC, { items: [{ lead: j(r[0]), prior: j(r[1]) }], refs: { [N('Resolve caller + parse (answers)')]: c.json } });
    if (d.json.plan.kind === 'reject') { const [rj] = await runCode(WF39, N('Reject (401)'), { json: d.json }); return { status: rj.json.status, body: rj.json.body }; }
    const refs = { [DEC]: d.json };
    const SAVE = N('Save answers + timeline + cancel stall (one statement)');
    let core = null;
    if (d.json.plan.kind === 'work') {
      const sv = app(sqlOf(WF39, SAVE), evalParam(WF39, SAVE, 'options.queryReplacement', { json: d.json }))[0];
      refs[SAVE] = { claimed: Number(sv[0]), updated: Number(sv[1]), threads: Number(sv[2]), notes: Number(sv[3]) };
    }
    // cover path (also on a replay): the adviser card first; the disclosure row, THEN W01 (route the confirmed adviser | hold)
    if (d.json.plan.cover) {
      const pr = app(sqlOf(WF39, N('Load lead + brokers (pick)')), evalParam(WF39, N('Load lead + brokers (pick)'), 'options.queryReplacement', { refs }))[0];
      const [st] = await runCode(WF39, N('Adviser step (w39.coverStep)'), { items: [{ lead: j(pr[0]), brokers: j(pr[1]) }], refs });
      refs[N('Adviser step (w39.coverStep)')] = st.json;
      if (st.json.step.steps.includes('disclose')) app(sqlOf(WF39, N('Log adviser_disclosed (before routing)')), evalParam(WF39, N('Log adviser_disclosed (before routing)'), 'options.queryReplacement', { refs }));
      if (st.json.step.route || st.json.step.hold) {
        const [inp] = await runCode(WF39, N('W01 Lead core input (no first touch)'), { items: [{}], refs });
        core = await w01core(inp.json);
      }
    }
    const bk = app(sqlOf(WF39, N('Re-read broker_id')), evalParam(WF39, N('Re-read broker_id'), 'options.queryReplacement', { refs }))[0]; // psql drops an all-NULL row
    const [a] = await runCode(WF39, N('Answer (w39.answer)'), { items: [{ broker_id: (bk && bk[0]) || null }], refs });
    if (a.json.effects.some((e) => e.kind === 'escalate')) {
      const e = a.json.effects.find((y) => y.kind === 'escalate');
      app(sqlOf(WF39, 'Escalate to a person (wills / web lead)'), evalParam(WF39, 'Escalate to a person (wills / web lead)', 'options.queryReplacement', { json: e, refs: { 'Decide (w39.decideAnswers)': d.json } }));
    }
    const sk = N('Adviser step (w39.coverStep)');
    return { status: a.json.status, body: a.json.body, effects: a.json.effects, plan: d.json.plan, save: refs[SAVE] || null, core, step: refs[sk] ? refs[sk].step : null };
  };
  const postAnswers = (tok, body) => chainRun(tok, body, 'answers');
  const postAdviser = (tok, body) => chainRun(tok, body, 'adviser');
  /** POST /start/contact through W39's nodes. */
  const postContact = async (tok, body) => {
    const [c] = await runCode(WF39, 'Resolve caller + parse (contact)', { items: [{ headers: H(tok), body }], env: ENV });
    if (!c.json.ok) return { status: c.json.status, body: c.json.body };
    const r = app(sqlOf(WF39, 'Load lead + earlier call (contact)'), evalParam(WF39, 'Load lead + earlier call (contact)', 'options.queryReplacement', { json: c.json }))[0];
    const [d] = await runCode(WF39, 'Decide (w39.decideContact)', { items: [{ lead: j(r[0]), prior: j(r[1]) }], refs: { 'Resolve caller + parse (contact)': c.json } });
    if (d.json.plan.kind === 'work') app(sqlOf(WF39, 'Save contact numbers (one statement)'), evalParam(WF39, 'Save contact numbers (one statement)', 'options.queryReplacement', { json: d.json }));
    const [a] = await runCode(WF39, 'Answer (w39.contactAnswer)', { items: [{}], refs: { 'Decide (w39.decideContact)': d.json } });
    return { status: a.json.status, body: a.json.body, plan: d.json.plan };
  };

  // =========================================================================================== 1. W03: the CTA link
  const MOBILE = '+27820000301';
  const first = await w03(MOBILE, { type: 'text', text: 'Hi', referral: { source_id: '120200000000000001', source_type: 'ad', ctwa_clid: 'clid_sp_1' } });
  assert.deepEqual(first.sends.map((m) => m.type), ['button'], 'consent first (generic v4: SortMyCover only, no adviser named)');
  assert.match(first.sends[0].body, /^Thanks, Synthetic\. Before we book your call, we need your consent \(POPIA\):/);
  assert.doesNotMatch(first.sends[0].body, /Synthetic Advisory|FSP 12345/, 'the adviser is named on /start/, before routing');
  assert.equal(first.ctxRow.start_page, true, 'W03 Load context reads brands.start_page');
  const yes = await w03(MOBILE, { type: 'button', payload: 'consent_yes', text: 'Yes, continue' });
  assert.equal(yes.sends.length, 1);
  const cta = yes.sends[0];
  assert.equal(cta.type, 'cta_url');
  assert.match(cta.body, START_HERE_RE, 'the v4 "Start here" message');
  const TOKEN = cta.url.split('#lt=')[1];
  assert.ok(cta.url.startsWith('https://sortmycover.co.za/start/#lt=lt1.'), 'the token rides in the fragment');
  const LEAD_ID = LT.verifyLeadToken(TOKEN, { secret: SECRET }).lead_id;
  const l0 = lead(LEAD_ID);
  assert.deepEqual([l0.origin, l0.stage, l0.conv_state.state, l0.broker_id], ['ctwa', 'verified', 'start_page', null], 'CTWA lead stored at the tap, not routed yet');
  assert.deepEqual([l0.consent_mode, /generic-v4/i.test(l0.consent_text_version)], ['generic', true], 'the new generic consent version is stored');
  assert.match(l0.consent_text, /share your details with an authorised financial adviser/);
  assert.ok(thread(MOBILE).stall_due_at, 'a stall like q_age');
  assert.equal(thread(MOBILE).stage, 'start_page');
  // the outbound row W03 stores is the body only
  const [body] = await runCode(WF03, 'Build Cloud API body', { items: [{ message: cta, _mobile: MOBILE, _pnid: PNID, _brand_id: BRAND, _lead_id: LEAD_ID, _wamid: 'SMx' }] });
  assert.equal(body.json.body.interactive.action.parameters.url, cta.url); assert.doesNotMatch(body.json.content, /lt1\./);

  // =========================================================================================== 2. W39 v4: the card first, then the confirm
  const CARD = { id: MARK, first_name: 'Mark', name: 'Mark Smith', firm: 'Synthetic Advisory', fsp: '12345', bio: null, photo_url: null };
  const v0 = await getStart(TOKEN);
  assert.deepEqual(v0, { status: 200, body: { first_name: 'Synthetic', phone_pretty: '082 000 0301', adviser: CARD, methods: ['teams', 'phone'], answers: {}, contact: {}, booking: null } },
    'not routed yet: the preview card (the adviser W01 would choose)');
  assert.deepEqual((await getStart('lt1.bad')).body, { error: 'try_again' });
  assert.deepEqual((await postAdviser(TOKEN, { request_id: 'x' })).body, { error: 'invalid' });
  // no confirm: the card again; NOTHING is routed
  const a0 = await postAdviser(TOKEN, { request_id: 'req-sp-0001' });
  assert.deepEqual([a0.status, a0.body], [200, { ok: true, next: 'adviser', adviser: CARD }]);
  assert.equal(a0.core, null, 'no W01 call without the confirm');
  assert.deepEqual(a0.save, { claimed: 1, updated: 1, threads: 1, notes: 0 });
  const la = lead(LEAD_ID);
  assert.deepEqual([la.broker_id, la.routed_at, la.budget_band, la.stage, la.conv_state.via], [null, null, null, 'verified', 'start_page'], 'on the page, not routed, no band');
  assert.deepEqual(thread(MOBILE), { stage: 'done', stall_due_at: null }, "W03's stall is cancelled");
  assert.equal(acts(LEAD_ID).includes('adviser_disclosed'), false);
  // a confirm for somebody else: his card again, still nothing routed
  const wrong = await postAdviser(TOKEN, { request_id: 'req-sp-0001b', confirm_adviser: crypto.randomUUID() });
  assert.deepEqual(wrong.body, { ok: true, next: 'adviser', adviser: CARD });
  assert.equal(lead(LEAD_ID).broker_id, null); assert.equal(wrong.core, null);
  // confirm Mark -> adviser_disclosed, THEN routed (no W06 first touch) -> slots
  const a1 = await postAdviser(TOKEN, { request_id: 'req-sp-0001', confirm_adviser: MARK });
  assert.deepEqual([a1.status, a1.body], [200, { ok: true, next: 'slots' }]);
  assert.deepEqual(a1.step.steps, ['disclose', 'route']);
  assert.equal(a1.core.r.action, 'routed'); assert.equal(a1.core.r.first_touch, null);
  assert.deepEqual(a1.core.w06, [], 'NO W06 first touch: the page shows the slots');
  const timeline = q(`SELECT activity_type, payload FROM public.lead_activities WHERE lead_id = '${LEAD_ID}' AND activity_type IN ('adviser_disclosed', 'routed') ORDER BY occurred_at`);
  assert.deepEqual(timeline.map((r) => r[0]), ['adviser_disclosed', 'routed'], 'the disclosure is on the timeline before the routing');
  assert.deepEqual(j(timeline[0][1]), { broker_id: MARK, fsp: '12345', firm: 'Synthetic Advisory', adviser: 'Mark Smith', disclosure_version: 'START-DISCLOSE-v1', via: 'start_page' });
  const l1 = lead(LEAD_ID);
  assert.deepEqual([l1.budget_band, l1.broker_id, l1.order_state, l1.qualified_at], [null, MARK, 'attached', null], 'routed with no band (provisional tier B), not qualified yet');
  assert.equal(l1.first_message_at, null); assert.equal(l1.conv_state.state, 'unbooked');
  assert.equal(acts(LEAD_ID).includes('first_touch_claimed'), false);
  // the same request again: replayed, nothing new
  const before = acts(LEAD_ID).length;
  const a2 = await postAdviser(TOKEN, { request_id: 'req-sp-0001', confirm_adviser: MARK });
  assert.deepEqual([a2.body, a2.plan.kind], [{ ok: true, next: 'slots' }, 'replay']);
  assert.equal(acts(LEAD_ID).length, before, 'no second disclosure row, no second route');
  const v1 = await getStart(TOKEN);
  assert.deepEqual([v1.body.adviser, v1.body.methods], [CARD, ['teams', 'phone']], 'routed: his card');

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
  // a Teams booking with an unverified email is held until min(now + 24 h, start - 2 h); W05 refuses a hold with < 15 min to
  // verify (too_soon_to_verify), so take the first slot that leaves room (slots[0] can be ~2 h out, depending on the clock)
  const SLOT = s4.body.slots.find((x) => Date.parse(x.start) - now > 4 * 3600_000);
  assert.ok(SLOT, 'a slot at least 4 h out');

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
  assert.equal(b1.dec.plan.hold_for, 'email', 'held for the email link, never for the budget band (start-page = band-known)');
  const h = W5.holdPending(b1.ctx, b1.dec.plan, b1.row);
  app(sqlOf(WF05, 'Save hold: lead email (unverified) + timeline'), evalParam(WF05, 'Save hold: lead email (unverified) + timeline', 'options.queryReplacement', { json: { ...b1.item, booking: b1.row, hold: h } }));
  assert.equal(h.response.status, 201); assert.equal(h.response.body.held, true); assert.equal(h.response.body.verify, 'email');
  const vHeld = await getStart(TOKEN);
  assert.equal(vHeld.body.booking.held, true); assert.equal(vHeld.body.booking.method, 'teams');

  // =========================================================================================== 5. ev1 link -> finalize -> booked
  q(`UPDATE public.leads SET email_verified = true, email_verified_at = now(), email_verified_via = 'link' WHERE id = '${LEAD_ID}'`); // what smc-email-verify does on GET /v/<ev1>
  const fin = app(sqlOf(WF05, 'Load held slot + lead (finalize)'), [LEAD_ID, ''])[0];
  const freq = W5.finalizeRequest(j(fin[0]), j(fin[1]), Date.now());
  assert.ok(freq && freq.finalize_booking_id === b1.row.id, 'the held row is handed over with NO budget band (v4 asks none)');
  assert.equal(j(fin[1]).budget_band, null);
  const b2 = book({ lane: 'sub', ok: true, req: freq, hdr: {} });
  assert.deepEqual([b2.row.id, b2.row.status], [b1.row.id, 'booked'], 'the same row is PROMOTED, nothing re-inserted');
  const sharedItem = W5.sharedEventItem(b2.ctx, b2.dec.plan, {}, {});
  const ev = W5.afterEvent(sharedItem); // no shared calendar id in this test: no Graph call
  const f = W5.finish(b2.ctx, b2.dec.plan, b2.row, ev, { site: ENV.SITE_URL, ics_secret: SECRET });
  app(sqlOf(WF05, 'Save event ids + lead (stage, broker, invite email)'), evalParam(WF05, 'Save event ids + lead (stage, broker, invite email)', 'options.queryReplacement', { json: { ...b2.item, booking: b2.row, ev, f } }));
  app(sqlOf(WF05, 'Timeline: booked'), evalParam(WF05, 'Timeline: booked', 'options.queryReplacement', { refs: { 'After event (w05.finish)': { ...b2.item, booking: b2.row, ev, f } } }));
  assert.equal(lead(LEAD_ID).stage, 'booked');
  // v4 (Jono, 19 Oct 2026): a /start/ booking never gets W06 broker_intro_booked (no SID, no SMS sender): W05 sends booking_confirmed
  assert.equal(f.w06, null, 'no W06 fan-out for a start-page booking');
  assert.equal(f.w07, null, 'no W07 "which number" ask: the page took the number');
  assert.equal(f.lead_wa.template.name, 'booking_confirmed', 'W05 sends the booked message (v3 Teams variant once its SID is set)');
  assert.match(JSON.stringify(f.lead_wa), /Microsoft Teams \(join link: https:\/\/sortmycover\.co\.za\/j\//);
  assert.deepEqual(f.start_touch, { lead_id: LEAD_ID, booking_id: b1.row.id, idempotency_key: `w06:first:${LEAD_ID}` });
  const vBooked = await getStart(TOKEN);
  assert.equal(vBooked.body.booking.held, false);
  // the accepted send (a wamid) stamps first_message_at and W06's one-card claim, so no later W06 event sends a card
  const TOUCH = 'Touch leads.last_contact_at (lead sends)';
  app(sqlOf(WF05, TOUCH), [LEAD_ID, 'lead', 'wamid.synthetic-booked-1', 'true']);
  assert.ok(lead(LEAD_ID).first_message_at, 'first_message_at stamped by the booked message');
  assert.equal(q(`SELECT count(*) FROM public.lead_activities WHERE idempotency_key = 'w06:first:${LEAD_ID}'`)[0][0], '1', 'the one-card claim is taken');
  const claim6 = app(sqlOf(WF06, 'Claim the one first touch (w06:first:{lead_id})'), [LEAD_ID, 'booking', b1.row.id]);
  assert.equal(claim6.length, 0, 'a later W06 event cannot claim a second card');
  assert.equal(q(`SELECT count(*) FROM public.communications WHERE lead_id = '${LEAD_ID}' AND template_name = 'broker_intro_booked'`)[0][0], '0');

  // =========================================================================================== 6b. POST /start/answers v4 (after booking) -> done
  const ANS = { age_band: '35_44', income_band: '30k_50k', topics: ['life', 'new_bond', 'will'], request_id: 'req-sp-ans-01' };
  assert.deepEqual((await postAnswers(TOKEN, { ...ANS, topics: ['car'] })).body, { error: 'invalid' });
  const an = await postAnswers(TOKEN, ANS);
  assert.deepEqual([an.status, an.body], [200, { ok: true, next: 'done' }]);
  assert.equal(an.core, null, 'answers never route');
  const l7 = lead(LEAD_ID);
  assert.deepEqual([l7.age_band, l7.income_band, l7.stage, l7.broker_id, l7.budget_band, l7.product_interest], ['35_44', '30k_50k', 'booked', MARK, null, null], 'stored (a new bracket: migration 20261019200000); a booked lead stays booked; never product_interest wills');
  assert.ok(l7.qualified_at, 'Qualified: income R15k+ and age 35-50');
  assert.deepEqual([l7.conv_state.start.topics, l7.conv_state.help_with, l7.conv_state.start.via], [['life', 'new_bond', 'will'], 'life', 'start_page']);
  assert.deepEqual(l7.reasons, ['life_cover']);
  assert.ok(acts(LEAD_ID).includes('start_page_will_requested'), 'the will is noted for a person');
  assert.equal(q(`SELECT count(*) FROM public.escalations WHERE lead_id = '${LEAD_ID}' AND kind = 'human_handoff'`)[0][0], '1', 'a person is asked about the will');
  const vA = await getStart(TOKEN);
  assert.deepEqual(vA.body.answers, { age_band: '35_44', income_band: '30k_50k', topics: ['life', 'new_bond', 'will'] });
  const anAgain = await postAnswers(TOKEN, ANS);
  assert.deepEqual([anAgain.body, anAgain.plan.kind, anAgain.effects], [{ ok: true, next: 'done' }, 'replay', []], 'the same request replays (no second escalation)');
  // Meta Qualified (W12 quality sweep): a /start/ lead with age + income and NO budget band qualifies, exactly once
  const QS = 'Quality events due (Qualified + GoodFit, not in capi_log)';
  const qualifiedDue = () => app(sqlOf(WF12, QS), [new Date(Date.now() + 60e3).toISOString(), 'false']).filter((r) => r[0] === 'Qualified' && r[1] === LEAD_ID);
  assert.equal(qualifiedDue().length, 1, 'W12 offers Qualified for the v4 lead (no budget_band)');
  const [qi] = await runCode(WF12, 'Quality events (w12.qualityEventItems)', { items: qualifiedDue().map((r) => ({ event_name: r[0], lead_id: r[1], brand_id: r[2], ctwa_clid: r[3] || null, event_time: r[4], quality_score: null })),
    refs: { 'Classify + validate (w12.classifyOp)': { now_iso: new Date().toISOString() } } });
  assert.deepEqual([qi.json.event_name, qi.json.event_id], ['Qualified', `evt_${LEAD_ID}_qualified`]);
  q(`INSERT INTO public.capi_log (lead_id, brand_id, event_name, event_id, action_source, status) VALUES ('${LEAD_ID}', '${BRAND}', 'Qualified', '${qi.json.event_id}', '${qi.json.action_source}', 'test')`); // what CAPI Send logs
  assert.equal(qualifiedDue().length, 0, 'once: capi_log dedupes the next tick');

  // =========================================================================================== 6c. POST /start/move -> W10's own move
  const W10_LOAD = sqlOf(WF10, 'Load booking, lead, broker, brand');
  /** W10 pick, the move lane: Classify op -> Load -> Merge context -> Claim key -> W04 is_free -> Decide move -> Move in place. */
  const w10move = async (input) => {
    const cl = await runCode(WF10, 'Classify op', { json: input });
    assert.equal(cl.json.op, 'pick');
    const rows = app(W10_LOAD, evalParam(WF10, 'Load booking, lead, broker, brand', 'options.queryReplacement', { json: cl.json }));
    const one = j(app(`SELECT to_jsonb(x) FROM (${W10_LOAD.replace(/;\s*$/, '')}) x`, evalParam(WF10, 'Load booking, lead, broker, brand', 'options.queryReplacement', { json: cl.json }))[0][0]);
    assert.ok(rows.length && one, 'W10 found the booking');
    const mc = await runCode(WF10, 'Merge context', { json: one, refs: { 'Classify op': cl.json } });
    const claim = app(sqlOf(WF10, 'Claim reschedule key (idempotency)'), evalParam(WF10, 'Claim reschedule key (idempotency)', 'options.queryReplacement', { json: mc.json }));
    const isf = await runCode(WF10, 'W04 request (is_free, move)', { json: {}, refs: { 'Merge context': mc.json } });
    const req = W4.subcallInput(isf.json);
    const r = app(sqlOf(WF04, 'Load broker + holds (sub)'), [req.broker_id])[0];
    const free = W4.respond({ lane: 'sub', req, broker: j(r[0]), bookings: j(r[1]) || [], busy: [], route: 'shared', now: Date.now(), holidays: HOL });
    const dm = await runCode(WF10, 'Decide move (w10.applyReschedule)', { json: free, refs: { 'Merge context': mc.json, 'Claim reschedule key (idempotency)': { id: claim.length ? claim[0][0] : null } } });
    let moved = [];
    if (dm.json.d.action === 'move') moved = app(sqlOf(WF10, 'Move booking in place (re-check overlap + buffer)'), evalParam(WF10, 'Move booking in place (re-check overlap + buffer)', 'options.queryReplacement', { json: dm.json }));
    return { d: dm.json.d, moved };
  };
  const postMove = async (tok, body) => {
    const [c] = await runCode(WF39, 'Resolve caller + parse (move)', { items: [{ headers: H(tok), body }], env: ENV });
    if (!c.json.ok) return { status: c.json.status, body: c.json.body };
    const r = app(sqlOf(WF39, 'Load lead + live booking (move)'), evalParam(WF39, 'Load lead + live booking (move)', 'options.queryReplacement', { json: c.json }))[0];
    const [pl] = await runCode(WF39, 'Plan move (w39.moveRequest)', { items: [{ lead: j(r[0]), booking: j(r[1]) }], refs: { 'Resolve caller + parse (move)': c.json } });
    let w10 = null;
    if (pl.json.plan.kind === 'move') { const [inp] = await runCode(WF39, 'W10 input (move)', { items: [{}], refs: { 'Plan move (w39.moveRequest)': pl.json } }); w10 = await w10move(inp.json); }
    const refs = { 'Plan move (w39.moveRequest)': pl.json };
    if (['move', 'same', 'method_only'].includes(pl.json.plan.kind)) {
      const rr = app(sqlOf(WF39, 'Re-read booking (move)'), evalParam(WF39, 'Re-read booking (move)', 'options.queryReplacement', { refs }))[0];
      refs['Re-read booking (move)'] = { after: j(rr[0]) };
    }
    const [a] = await runCode(WF39, 'Answer (w39.moveAnswer)', { items: [{}], refs });
    return { status: a.json.status, body: a.json.body, w10, plan: pl.json.plan };
  };
  const NEW = s4.body.slots.find((x) => x.start !== SLOT.start && Date.parse(x.start) > Date.parse(SLOT.start));
  const far = new Date(Date.now() + 15 * 86400e3); far.setUTCMinutes(0, 0, 0);
  assert.deepEqual((await postMove(TOKEN, { slot_start: far.toISOString(), request_id: 'req-sp-move-0' })).body, { error: 'invalid', field: 'slot_start' }, 'past now + 14 days: 400');
  const mv = await postMove(TOKEN, { slot_start: NEW.start, request_id: 'req-sp-move-1' });
  assert.equal(mv.w10.d.action, 'move', "W10's own move");
  assert.deepEqual([mv.status, mv.body.ok, mv.body.moved, mv.body.booking.start, mv.body.booking.held], [200, true, true, NEW.start, false]);
  const ap = q(`SELECT id, appointment_date, reschedule_count, status FROM public.appointments WHERE client_id = '${LEAD_ID}' AND status IN ('booked','confirmed')`);
  assert.equal(ap.length, 1, 'the same row moved, no second booking');
  assert.deepEqual([ap[0][0], Date.parse(ap[0][1]), ap[0][2]], [b1.row.id, Date.parse(NEW.start), '1']);
  assert.equal((await getStart(TOKEN)).body.booking.start, NEW.start);
  const mvAgain = await postMove(TOKEN, { slot_start: NEW.start, request_id: 'req-sp-move-1' });
  assert.deepEqual([mvAgain.body.moved, mvAgain.plan.kind], [false, 'same'], 'the same request again: nothing moves twice');

  // =========================================================================================== 7. a CTWA lead on the phone: contact numbers, NO email, booked at once
  const yes2 = await (async () => { const m = '+27820000302'; await w03(m, { type: 'text', text: 'Hi', referral: { source_id: '1', source_type: 'ad' } }, 'Synthetic Sipho'); return w03(m, { type: 'button', payload: 'consent_yes', text: 'Yes' }, 'Synthetic Sipho'); })();
  const TOK2 = yes2.sends[0].url.split('#lt=')[1];
  const ID2 = LT.verifyLeadToken(TOK2, { secret: SECRET }).lead_id;
  assert.equal((await postAdviser(TOK2, { request_id: 'req-sp-0002' })).body.next, 'adviser');
  assert.deepEqual((await postAdviser(TOK2, { request_id: 'req-sp-0002', confirm_adviser: MARK })).body, { ok: true, next: 'slots' });
  assert.deepEqual((await postContact(TOK2, { request_id: 'req-sp-c2', call_number: '+44 20 1234 5678' })).body, { error: 'invalid', field: 'call_number' });
  const ct = await postContact(TOK2, { request_id: 'req-sp-c2', call_number: '082 000 0399', alt_number: '060 000 0398' });
  assert.deepEqual([ct.status, ct.body], [200, { ok: true }]);
  const lc = lead(ID2);
  assert.deepEqual([lc.call_number, lc.alt_number, lc.alt_purpose], ['+27820000399', '+27600000398', 'reach_fallback'], 'call_number + alt_number stored');
  assert.deepEqual((await getStart(TOK2)).body.contact, { call_number: '082 000 0399', alt_number: '060 000 0398' });
  const c2 = W4.resolveCaller(H(TOK2), { days: '14' }, ENV, Date.now());
  const r2 = app(sqlOf(WF04, 'Load lead + broker + holds (http)'), [c2.lead_id, ''])[0];
  const x2 = { lane: 'http', req: c2, lead: j(r2[0]), broker: j(r2[1]), bookings: j(r2[2]) || [] };
  const s2 = W4.respond({ ...x2, busy: [], route: W4.planRequest(x2).route, now: Date.now(), holidays: HOL });
  const PSLOT = s2.body.slots.find((x) => x.start !== NEW.start && x.start !== SLOT.start);
  const p2 = W5.parseHttp(H(TOK2), { slot_start: PSLOT.start, method: 'phone', request_id: 'req-sp-book-02', context: { source: 'start_page' } }, ENV, Date.now());
  assert.equal(p2.ok, true, JSON.stringify(p2.body || p2));
  const bp = book(p2);
  assert.equal(bp.row.status, 'booked', 'phone + a WhatsApp-proven lead: no email, booked at once, never held for the band');
  const apCall = (id) => q(`SELECT call_number FROM public.appointments WHERE id = '${id}'`)[0][0];
  assert.equal(apCall(bp.row.id), '+27820000399', 'the appointment carries the number the lead chose (call_number || phone)');
  // (a new phone booking with no budget band and no email: W05 continues to the Outlook event / broker notice / W06 as any booking)

  // a page opened before the deploy still posts the v3 body: a will -> a person (escalation), never routed
  const yes3 = await (async () => { const m = '+27820000303'; await w03(m, { type: 'text', text: 'Hi', referral: { source_id: '1', source_type: 'ad' } }, 'Synthetic Lerato'); return w03(m, { type: 'button', payload: 'consent_yes', text: 'Yes' }, 'Synthetic Lerato'); })();
  const TOK3 = yes3.sends[0].url.split('#lt=')[1];
  const ID3 = LT.verifyLeadToken(TOK3, { secret: SECRET }).lead_id;
  const w = await postAnswers(TOK3, { intent: 'will', request_id: 'req-sp-0003', confirm_adviser: MARK });
  assert.deepEqual(w.body, { ok: true, next: 'chat' }); assert.equal(w.core, null, 'a v3 will never routes, confirm or not');
  assert.deepEqual(lead(ID3).product_interest, 'wills'); assert.equal(lead(ID3).broker_id, null);
  assert.equal(q(`SELECT count(*) FROM public.escalations WHERE lead_id = '${ID3}' AND kind = 'human_handoff'`)[0][0], '1', 'a person is asked');
  // opted out: every endpoint refuses the token at once
  q(`UPDATE public.leads SET opted_out_at = now() WHERE id = '${ID3}'`);
  assert.deepEqual((await getStart(TOK3)).body, { error: 'try_again' });
  assert.equal((await postAdviser(TOK3, { request_id: 'req-sp-0004' })).status, 401);
  assert.equal((await postContact(TOK3, { request_id: 'req-sp-0004' })).status, 401);

  // =========================================================================================== 8. the web path: POST /lead start_page (no token yet)
  // Desktop "Book" opens /start/?ref=w-book&via=google with no token; step 0 posts /lead. W01's own nodes: Context SQL ->
  // "Decide (w01.decide) + lead_token" (real Code node) -> "Insert lead + timeline".
  const MOBILE_W = '+27820000311';
  const webBody = { first_name: 'Synthetic Naledi', mobile: '082 000 0311', consent: true,
    consent_text: W01.consentRegistry({ practice_name: 'Synthetic Advisory', fsp_number: '12345' })['CONSENT-NAMED-v5web'], consent_version: 'CONSENT-NAMED-v5web', consent_mode: 'named',
    consent_ads: true, consent_ads_text: W01.WEB_CONSENT.ads.text, consent_ads_version: W01.WEB_CONSENT.ads.version,
    page_url: 'https://sortmycover.co.za/start/?ref=w-book&via=google', started_at: Date.now() - 60e3, request_id: 'req-sp-web-0311', honeypot: '',
    context: { ref: 'w-book', utm: { utm_source: 'google' }, event_id: crypto.randomUUID() }, start_page: true };
  const postLead = async (body) => {
    const sub = W01.normaliseSubmission(body, {});
    const scr = W01.screen(sub, { now: Date.now() });
    assert.equal(scr.ok, true, JSON.stringify(scr));
    const cx = app(sqlOf(WF01, 'Context: counters, prior lead, suppression, brokers'), ['', '', '', '', scr.mobile, BRAND])[0];
    const ctx = { brand_uuid: cx[0], ip_hits: Number(cx[1]), number_hits: Number(cx[2]), prior: j(cx[3]), suppressed: cx[4] === 't', brokers: j(cx[5]) || [] };
    const gp = { from: 'page', sub, scr, ctx, mobile: scr.mobile, now: Date.now(), lead_id: crypto.randomUUID(), g: { ok: true, bot_check: 'skipped' }, need_lookup: false, lookup_override: null, test_hooks: false, form_post: false };
    const [d] = await runCode(WF01, 'Decide (w01.decide) + lead_token', { items: [{}], refs: { 'Guard passed?': gp }, env: ENV });
    if (d.json.kind === 'insert') app(sqlOf(WF01, 'Insert lead + timeline (one statement; broker_id written before W06 exists)'), evalParam(WF01, 'Insert lead + timeline (one statement; broker_id written before W06 exists)', 'options.queryReplacement', { json: d.json }));
    return d.json;
  };
  const wl = await postLead(webBody);
  assert.deepEqual([wl.kind, wl.decision.outcome, wl.http.http_status, wl.http.body.ok, wl.http.body.status], ['insert', 'start_page', 200, true, 'accepted']);
  const WTOK = wl.http.body.lead_token;
  const WID = LT.verifyLeadToken(WTOK, { secret: SECRET }).lead_id;
  assert.equal(WID, wl.http.body.lead_id);
  const w0 = lead(WID);
  assert.deepEqual([w0.origin, w0.broker_id, w0.routing_reason, w0.conv_state.state, w0.consent_text_version, w0.disqualified_reason], ['page', null, 'start_page_pending', 'start_page', 'CONSENT-NAMED-v5web', null], 'stored, not routed');
  assert.ok(w0.consent_ads_at, 'the optional ad-measurement choice is recorded');
  assert.ok(acts(WID).includes('start_page_pending') && acts(WID).includes('consent_audit'));
  assert.equal(q(`SELECT payload->>'matches_registry' FROM public.lead_activities WHERE lead_id = '${WID}' AND activity_type = 'consent_audit'`)[0][0], 'true', 'the exact named v5web text for this practice');
  // the same number again within 90 days: a fresh token for the SAME lead, no second lead
  const again = await postLead({ ...webBody, request_id: 'req-sp-web-0311b', context: { ...webBody.context, event_id: crypto.randomUUID() } });
  assert.equal(again.kind, 'duplicate'); assert.equal(LT.verifyLeadToken(again.http.body.lead_token, { secret: SECRET }).lead_id, WID);
  assert.equal(q(`SELECT count(*) FROM public.leads WHERE phone = '${MOBILE_W}'`)[0][0], '1');

  const vw = await getStart(WTOK);
  assert.deepEqual(vw.body, { first_name: 'Synthetic', phone_pretty: '082 000 0311', adviser: CARD, methods: ['teams', 'phone'], answers: {}, contact: {}, booking: null });
  const wa = await postAdviser(WTOK, { request_id: 'req-sp-web-a1' });
  assert.deepEqual(wa.body, { ok: true, next: 'adviser', adviser: CARD });
  assert.equal(lead(WID).broker_id, null, 'no confirm: still not routed');
  const wb = await postAdviser(WTOK, { request_id: 'req-sp-web-a1', confirm_adviser: MARK });
  assert.deepEqual(wb.body, { ok: true, next: 'slots' });
  assert.equal(wb.core.r.capi.event_name, 'Lead', 'the CAPI Lead goes at the hand-over, like any held page lead');
  assert.deepEqual([lead(WID).broker_id, lead(WID).routing_reason, lead(WID).order_state], [MARK, 'single_broker', 'attached']);
  const wtl = q(`SELECT activity_type FROM public.lead_activities WHERE lead_id = '${WID}' AND activity_type IN ('adviser_disclosed', 'routed') ORDER BY occurred_at`).map((r) => r[0]);
  assert.deepEqual(wtl, ['adviser_disclosed', 'routed']);
  // slots -> book (held) -> verify -> booked -> W06 intro card (dry)
  const cw = W4.resolveCaller(H(WTOK), { days: '14' }, ENV, Date.now());
  const rw = app(sqlOf(WF04, 'Load lead + broker + holds (http)'), [cw.lead_id, ''])[0];
  const xw = { lane: 'http', req: cw, lead: j(rw[0]), broker: j(rw[1]), bookings: j(rw[2]) || [] };
  const sw = W4.respond({ ...xw, busy: [], route: W4.planRequest(xw).route, now: Date.now(), holidays: HOL });
  assert.ok(sw.body.slots.length > 0);
  const WSLOT = sw.body.slots.find((x) => ![SLOT.start, NEW.start, PSLOT.start].includes(x.start));
  // phone: the number Mark should call + a fallback (desktop: the WhatsApp number is not proven, so the email link still holds it)
  assert.deepEqual((await postContact(WTOK, { request_id: 'req-sp-web-c1', call_number: '011 000 0311', alt_number: '082 000 0311' })).body, { ok: true });
  const lw = lead(WID);
  assert.deepEqual([lw.call_number, lw.alt_number, lw.alt_purpose], ['+27110000311', '+27820000311', 'reach_fallback'], 'a landline to call, the WhatsApp number as the fallback');
  const pw = W5.parseHttp(H(WTOK), { slot_start: WSLOT.start, method: 'phone', email: 'synthetic-sp-naledi@example.test', request_id: 'req-sp-web-book', context: { source: 'start_page' } }, ENV, Date.now());
  const bw = book(pw);
  assert.equal(bw.row.status, 'pending_verification');
  assert.equal(bw.dec.plan.hold_for, 'email', 'held for the email link only (an unproven number), never for the budget band');
  assert.equal(apCall(bw.row.id), '+27110000311');
  const hw = W5.holdPending(bw.ctx, bw.dec.plan, bw.row);
  app(sqlOf(WF05, 'Save hold: lead email (unverified) + timeline'), evalParam(WF05, 'Save hold: lead email (unverified) + timeline', 'options.queryReplacement', { json: { ...bw.item, booking: bw.row, hold: hw } }));
  assert.equal(hw.response.body.held, true);
  q(`UPDATE public.leads SET email_verified = true, email_verified_at = now(), email_verified_via = 'link' WHERE id = '${WID}'`);
  const fw = app(sqlOf(WF05, 'Load held slot + lead (finalize)'), [WID, ''])[0];
  const bw2 = book({ lane: 'sub', ok: true, req: W5.finalizeRequest(j(fw[0]), j(fw[1]), Date.now()), hdr: {} });
  assert.deepEqual([bw2.row.id, bw2.row.status], [bw.row.id, 'booked']);
  const evw = W5.afterEvent(W5.sharedEventItem(bw2.ctx, bw2.dec.plan, {}, {}));
  const ffw = W5.finish(bw2.ctx, bw2.dec.plan, bw2.row, evw, { site: ENV.SITE_URL, ics_secret: SECRET });
  app(sqlOf(WF05, 'Save event ids + lead (stage, broker, invite email)'), evalParam(WF05, 'Save event ids + lead (stage, broker, invite email)', 'options.queryReplacement', { json: { ...bw2.item, booking: bw2.row, ev: evw, f: ffw } }));
  assert.equal(lead(WID).stage, 'booked');
  assert.equal(ffw.w06, null, 'no W06 card for the web lead either');
  assert.equal(ffw.lead_wa.template.name, 'booking_confirmed', 'the approved template with the booked time (no session needed)');
  assert.match(JSON.stringify(ffw.lead_wa), /phone call on 011 000 0311/, 'the number Mark will call (booking_confirmed_phone_v3 reads it)');
  assert.equal(ffw.w07, null);
  // answers after booking -> done
  const wans = await postAnswers(WTOK, { age_band: '51plus', income_band: 'prefer_not', topics: ['review', 'severe_illness'], request_id: 'req-sp-web-ans' });
  assert.deepEqual(wans.body, { ok: true, next: 'done' });
  const lwa = lead(WID);
  assert.deepEqual([lwa.age_band, lwa.income_band, lwa.conv_state.start.topics, lwa.conv_state.help_with, lwa.stage], ['51plus', 'prefer_not', ['review', 'severe_illness'], 'review', 'booked'], 'every age; income + topics stored');
  assert.equal(lwa.qualified_at, null, 'over 50 / prefer not to say: books and is routed, but not Qualified (Jono, 19 Oct)');
  // a web lead's "something else" goes to a person, never a session text
  const wl2 = await postLead({ ...webBody, mobile: '082 000 0312', request_id: 'req-sp-web-0312', context: { ...webBody.context, event_id: crypto.randomUUID() } });
  const wo = await postAnswers(wl2.http.body.lead_token, { intent: 'other', request_id: 'req-sp-web-o1' }); // a v3 body
  assert.deepEqual(wo.body, { ok: true, next: 'chat' }); assert.deepEqual(wo.effects.map((e) => e.kind), ['escalate']);
});
