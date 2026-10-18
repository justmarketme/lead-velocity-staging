// W39 Start page API (GET /start + POST /start/answers, the hidden sortmycover.co.za/start/ page, 18 Oct 2026).
// Run: node --test automation/tests/W39.test.mjs   (offline, synthetic data only)
// Logic under test: automation/lib/w39.mjs; the Code nodes of automation/W39.json run through _n8ncode.mjs the way n8n runs
// them. The end-to-end chain on the real schema (W39 -> W01 core -> W04 -> W05 hold -> finalize -> W06) is
// automation/tests/start-page.local.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { runCode, lvViolations, evalParam, PG_CRED } from './_n8ncode.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import { findUngated } from '../lib/egress-gate.cjs';
import * as W39 from '../lib/w39.mjs';
import * as W01 from '../lib/w01.mjs';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const WF = JSON.parse(readFileSync(new URL('../W39.json', import.meta.url), 'utf8'));
const SECRET = 's'.repeat(40);
const ENV = { LEAD_TOKEN_SECRET: SECRET, SUPABASE_JWT_SECRET: 'j'.repeat(40), PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za,https://www.sortmycover.co.za' };
const NOW = Date.parse('2026-10-19T09:00:00+02:00');
const LEAD_ID = '11111111-2222-4333-8444-555555555555';
const BROKER_ID = '22222222-3333-4444-8555-666666666666';
const tok = (id = LEAD_ID, now = NOW, secret = SECRET) => LT.mintLeadToken(id, { secret, nowMs: now }).token;
const H = (t, extra = {}) => ({ 'x-lead-token': t, origin: 'https://sortmycover.co.za', ...extra });
const LEAD = (over = {}) => ({ id: LEAD_ID, brand_id: 'b-smc', broker_id: null, first_name: 'Thandi Nkosi', phone: '+27600000138', opted_out_at: null, erased: false,
  stage: 'verified', conv_state: { state: 'start_page' }, age_band: null, budget_band: null, product_interest: null, disqualified_reason: null, ...over });
const BROKER = { id: BROKER_ID, adviser_name: 'Mark Smith', contact_person: 'Mark Smith', firm_name: 'Oracle Brokers', practice_name: 'Oracle Brokers (Pty) Ltd', fsp_number: '28418', methods_supported: ['teams', 'whatsapp_call', 'phone'] };
const RID = 'req-0001-abcd';
// a broker row as "Load lead + brokers (pick)" returns it (the W01 core list + display columns)
const PICK = { id: BROKER_ID, broker_id: BROKER_ID, brand_id: 'b-smc', status: 'active', routing_on: true, active: true, bookings_paused: false, practice_name: 'Oracle Brokers', firm_name: 'Oracle Brokers',
  contact_person: 'Mark Smith', fsp_number: '28418', consent_mode: 'named', accepts_low_budget: false, handles_wills: false, order_capacity: 20, order_attached: 1, order_remaining: 19 };
const decide = (answers, over = {}, opts = {}) => W39.decideAnswers({ lead: LEAD(over), answers, request_id: RID, now: NOW, ...opts });

function brokerJwt() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }); const p = b({ sub: '33333333-4444-4555-8666-777777777777', role: 'authenticated', aud: 'authenticated', exp: Math.floor(NOW / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', ENV.SUPABASE_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

// ---------------------------------------------------------------- caller + lead row check
test('token rejections: missing, malformed, bad signature, expired, broker JWT, both credentials -> 401 try_again (reason logged only); origin 403; no secret 503', () => {
  const r = (h, env = ENV, now = NOW) => W39.resolveCaller(h, env, now);
  assert.deepEqual(r({ origin: 'https://sortmycover.co.za' }), { ok: false, status: 401, body: { error: 'try_again' }, reason: 'no_credentials' });
  assert.equal(r(H('lt1.nope')).reason, 'malformed');
  assert.equal(r(H(tok(LEAD_ID, NOW, 'w'.repeat(40)))).reason, 'bad_signature');
  const old = tok(LEAD_ID, NOW - 15 * 86400_000);
  assert.deepEqual([r(H(old)).status, r(H(old)).reason], [401, 'expired']);
  assert.deepEqual([r({ authorization: `Bearer ${brokerJwt()}`, origin: 'https://sortmycover.co.za' }).status, r({ authorization: `Bearer ${brokerJwt()}` }).reason], [401, 'broker_jwt'], 'the page is the lead path only');
  assert.deepEqual([r(H(tok(), { authorization: `Bearer ${brokerJwt()}` })).status, r(H(tok(), { authorization: 'Bearer x' })).body], [401, { error: 'try_again' }]);
  assert.equal(r(H(tok(), { origin: 'https://evil.test' })).status, 403);
  assert.equal(r(H(tok()), { ...ENV, LEAD_TOKEN_SECRET: '' }).status, 503);
  for (const x of [r(H(old)), r(H('lt1.nope'))]) assert.deepEqual(x.body, { error: 'try_again' }, 'the reason never reaches the browser');
  assert.deepEqual(r(H(tok())), { ok: true, lead_id: LEAD_ID });
  assert.deepEqual(r({ 'X-Lead-Token': tok() }), { ok: true, lead_id: LEAD_ID }, 'header name is case-insensitive; no Origin = server-side caller');
});

test('lead row check: unknown, opted-out and erased leads are 401 on both endpoints', () => {
  assert.equal(W39.leadGate(null).status, 401);
  assert.equal(W39.leadGate(LEAD({ opted_out_at: '2026-10-18T10:00:00Z' })).reason, 'opted_out');
  assert.equal(W39.leadGate(LEAD({ erased: true })).reason, 'erased');
  assert.equal(decide({ intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, { opted_out_at: '2026-10-18T10:00:00Z' }).status, 401);
  assert.deepEqual(decide({ intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, { erased: true }).body, { error: 'try_again' });
  assert.equal(W39.leadGate(LEAD()).ok, true);
});

// ---------------------------------------------------------------- body
test('answers body: codes are whitelisted, request_id as W05, bands required for the cover intents; 400 { error: invalid }', () => {
  const ok = (b) => W39.parseAnswers({ request_id: RID, ...b });
  assert.deepEqual(ok({ intent: 'life', age_band: '45_50', has_cover: 'no', budget_band: '750_1250', want: 'family', extra: 'ignored' }),
    { ok: true, answers: { intent: 'life', age_band: '45_50', has_cover: 'no', budget_band: '750_1250', want: 'family' }, request_id: RID, confirm_adviser: null });
  assert.equal(ok({ intent: 'life', age_band: '45_50', budget_band: '750_1250', confirm_adviser: BROKER_ID }).confirm_adviser, BROKER_ID);
  for (const c of ['not a broker id', 42, { id: 1 }]) assert.deepEqual(ok({ intent: 'life', age_band: '45_50', budget_band: '750_1250', confirm_adviser: c }).body, { error: 'invalid' }, String(c));
  assert.deepEqual(ok({ intent: 'will' }).answers, { intent: 'will' }, 'will / other need no bands');
  assert.equal(ok({ intent: 'other' }).ok, true);
  for (const bad of [{ intent: 'car' }, { intent: 'life', age_band: '35-44', budget_band: '1500_plus' }, { intent: 'life', age_band: '35_44', budget_band: '1250plus' },
    { intent: 'life', age_band: '35_44' }, { intent: 'review', budget_band: '1500_plus' }, { intent: 'life', age_band: '35_44', budget_band: '1500_plus', want: 'car' }, {}]) {
    assert.deepEqual(ok(bad).body, { error: 'invalid' }, JSON.stringify(bad)); assert.equal(ok(bad).status, 400);
  }
  assert.equal(W39.parseAnswers({ intent: 'will', request_id: 'short' }).status, 400);
  assert.equal(W39.parseAnswers({ intent: 'will', request_id: 'a b c d e f g h' }).status, 400);
  assert.equal(W39.parseAnswers('not json').status, 400);
  assert.equal(W39.parseAnswers(JSON.stringify({ intent: 'will', request_id: RID })).ok, true, 'a raw JSON string body is parsed');
  for (const b of W39.BUDGET_BANDS) assert.ok(W01.KNOWN_BUDGET.has(b), `${b} is a leads_smc_checks budget code`);
  for (const a of W39.AGE_BANDS) assert.ok(Object.values(W01.AGE_TO_DB).includes(a), `${a} is a leads_smc_checks age code`);
});

// ---------------------------------------------------------------- every intent path
test('in band, tier A/B: bands + qualified_at + stage qualified, help_with + reasons, conv_state unbooked, routed without a first touch -> slots', () => {
  for (const [intent, help, reasons] of [['life', 'life', ['life_cover']], ['income', 'disability_income', ['disability']], ['illness', 'severe_illness', undefined], ['review', 'review', undefined]]) {
    const p = decide({ intent, age_band: '35_44', has_cover: 'unsure', budget_band: '1500_plus', want: 'bond' });
    assert.equal(p.kind, 'work'); assert.equal(p.path, 'route'); assert.equal(p.cover, true, 'a cover path: the adviser card first');
    assert.equal(p.set.age_band, '35_44'); assert.equal(p.set.budget_band, '1500_plus');
    assert.equal(p.set.qualified_at, '2026-10-19T09:00:00+02:00'); assert.equal(p.set.stage, 'qualified');
    assert.equal(p.set.conv_state.help_with, help); assert.ok(W01.HELP_WITH.has(help));
    assert.deepEqual(p.set.reasons, reasons);
    assert.equal(p.set.product_interest, undefined, 'only wills sets product_interest');
    assert.equal(p.set.conv_state.state, 'unbooked');
    assert.deepEqual(p.set.conv_state.start, { intent, has_cover: 'unsure', want: 'bond', at: '2026-10-19T09:00:00+02:00', via: 'start_page', request_id: RID });
    assert.equal(p.send, null); assert.equal(p.escalate, null); assert.deepEqual(p.notes, []);
    assert.deepEqual(p.activity, { activity_type: 'start_page_answers', idempotency_key: `w39:answers:${LEAD_ID}:${RID}`, payload: { path: 'route', intent, age_band: '35_44', has_cover: 'unsure', budget_band: '1500_plus', want: 'bond', request_id: RID, via: 'start_page' } });
    assert.equal(p.thread_stage, 'done', "W03's stall is cancelled");
  }
  for (const band of ['750_1250', '1250_1499']) assert.equal(decide({ intent: 'life', age_band: '45_50', budget_band: band }).set.stage, 'qualified', `${band} is tier B`);
  assert.deepEqual(W39.routeInput(LEAD_ID, BROKER_ID), { kind: 'route_and_first_touch', lead_id: LEAD_ID, first_touch: false, expect_broker_id: BROKER_ID, source: 'W39' });
});

test('in band, tier C (lt750): the band only (never qualified), routed (the trigger holds it unless the broker has the standing yes) -> slots | chat', () => {
  const p = decide({ intent: 'life', age_band: '35_44', budget_band: 'lt750' });
  assert.equal(p.path, 'route_tier_c'); assert.equal(p.cover, true);
  assert.equal(p.set.budget_band, 'lt750');
  assert.equal(p.set.qualified_at, undefined); assert.equal(p.set.stage, undefined);
  const lead = LEAD({ budget_band: 'lt750', consent_mode: 'generic' });
  const held = W39.coverStep({ plan: p, lead, brokers: [PICK] });
  assert.deepEqual([held.next, held.held, held.steps, held.hold], ['chat', 'held_low_budget', ['hold'], W39.holdInput(LEAD_ID)], 'no standing yes: W01 records the hold + lead_low_budget_held, never routes');
  assert.equal(W39.coverStep({ plan: p, lead, brokers: [{ ...PICK, accepts_low_budget: true }] }).next, 'adviser', 'standing yes: his card');
});

test('will: product_interest wills, conv_state handoff, a person (escalation) + the W03 wills line, never routed -> chat', () => {
  const p = decide({ intent: 'will' });
  assert.equal(p.path, 'will'); assert.equal(p.cover, false, 'never routed');
  assert.equal(p.set.product_interest, 'wills');
  assert.equal(p.set.conv_state.state, 'handoff');
  assert.equal(p.set.conv_state.help_with, 'wills');
  assert.deepEqual(p.send, { to: '+27600000138', kind: 'text', text: "Thanks Thandi. Wills are done with a Capital Legacy consultant, so I've asked a person from our team to message you here shortly to set up the call.", lead_id: LEAD_ID, correlation: `w39:will:${LEAD_ID}` });
  assert.match(p.escalate.note, /wills/);
  const a = W39.answer({ plan: p, broker_id: BROKER_ID, claimed: true });
  assert.deepEqual(a.body, { ok: true, next: 'chat' });
  assert.deepEqual(a.effects.map((e) => e.kind), ['send', 'escalate']);
  assert.deepEqual(a.effects[0].message, p.send);
});

test("other: conv_state unbooked (W07 reads the next message as free text), Lindi asks for a sentence -> chat", () => {
  const p = decide({ intent: 'other' });
  assert.equal(p.path, 'other'); assert.equal(p.cover, false, 'never routed');
  assert.equal(p.set.conv_state.state, 'unbooked');
  assert.deepEqual(p.set.reasons, ['other']);
  assert.equal(p.send.text, "No problem, tell me in a sentence what you're after and I'll point you the right way.");
  assert.equal(p.send.correlation, `w39:other:${LEAD_ID}`);
  assert.equal(W39.answer({ plan: p, broker_id: BROKER_ID, claimed: true }).body.next, 'chat');
});

test('out-of-band age, OUT_OF_BAND_AGE_BOOKS = false: the W03 outOfBand outcome (disqualified, deleted within 24 h, the same close) -> chat', () => {
  for (const age of ['lt35', '51plus']) {
    const p = decide({ intent: 'life', age_band: age, budget_band: '1500_plus' }, {}, { oobAgeBooks: false });
    assert.equal(p.path, 'oob_close'); assert.equal(p.cover, false);
    assert.equal(p.set.disqualified_reason, 'age_band'); assert.equal(p.set.stage, 'disqualified');
    assert.equal(p.set.retention_delete_after, new Date(NOW + 24 * 3600_000).toISOString());
    assert.equal(p.set.qualified_at, undefined);
    assert.equal(p.set.conv_state.state, 'closed_oob');
    assert.equal(p.send.text, 'Thanks for your answers. Based on them, we’re not the right fit for you right now, so we won’t pass your details on. Take care.');
    assert.equal(p.thread_stage, 'closed');
    assert.equal(W39.answer({ plan: p, broker_id: null, claimed: true }).body.next, 'chat');
  }
});

test('out-of-band age, OUT_OF_BAND_AGE_BOOKS = true (shipping, Jono 18 Oct): routed like in band, NEVER qualified_at, age_accepted + a timeline note -> slots', () => {
  assert.equal(W39.OUT_OF_BAND_AGE_BOOKS, true, 'Jono, 18 Oct 2026: under-35 / over-50 may book with Mark');
  for (const age of ['lt35', '51plus']) {
    const p = decide({ intent: 'income', age_band: age, budget_band: '1500_plus' }, {}, { oobAgeBooks: true });
    assert.equal(p.path, 'oob_book'); assert.equal(p.cover, true);
    assert.equal(p.set.age_band, age);
    assert.equal(p.set.qualified_at, undefined, 'never qualified'); assert.equal(p.set.stage, undefined);
    assert.equal(p.set.disqualified_reason, undefined);
    assert.equal(p.set.conv_state.state, 'unbooked');
    assert.equal(p.set.conv_state.age_accepted, true, 'logic.mjs decide() never closes it later');
    assert.equal(p.notes.length, 1);
    assert.deepEqual(p.notes[0].payload, { age_band: age, budget_band: '1500_plus', books: true, qualified: false, rule: 'OUT_OF_BAND_AGE_BOOKS (Jono, 18 Oct 2026)' });
    assert.equal(p.notes[0].idempotency_key, `w39:age_oob:${LEAD_ID}`);
    assert.equal(W39.coverStep({ plan: p, lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] }).next, 'adviser', 'the card first, like any cover lead');
  }
  // the default is the shipped value
  assert.equal(decide({ intent: 'life', age_band: 'lt35', budget_band: '1500_plus' }).path, 'oob_book');
  // W01 routing never refuses it (no disqualified_reason; the age is not a routing rule)
  const r = W01.routeExisting({ id: LEAD_ID, brand_id: 'smc', origin: 'ctwa', age_band: 'lt35', budget_band: '1500_plus', consent_mode: 'generic', consent_text: 'x' },
    { brokers: [{ id: BROKER_ID, broker_id: BROKER_ID, brand_id: 'smc', status: 'active', routing_on: true, active: true, order_remaining: 5, order_capacity: 20, order_attached: 1 }], first_touch: false });
  assert.equal(r.action, 'routed'); assert.equal(r.first_touch, null);
});

// ---------------------------------------------------------------- idempotency + response shapes
test('idempotency: the same request_id replays the first answer (nothing written or sent twice); effects only for the request that claimed its key', () => {
  const first = decide({ intent: 'will' });
  const again = W39.decideAnswers({ lead: LEAD(), answers: { intent: 'will' }, request_id: RID, prior: first.activity.payload, now: NOW + 60_000 });
  assert.deepEqual(again, { kind: 'replay', path: 'will', cover: false, confirm_adviser: null });
  assert.deepEqual(W39.answer({ plan: again, broker_id: null }), { status: 200, body: { ok: true, next: 'chat' }, effects: [] });
  assert.deepEqual(W39.answer({ plan: { kind: 'replay', path: 'route', cover: true }, step: { next: 'slots' }, broker_id: BROKER_ID }).body, { ok: true, next: 'slots' });
  assert.equal(W39.answersKey(LEAD_ID, RID, true), `w39:answers:${LEAD_ID}:${RID}:confirm`, 'the confirm call is its own idempotent call');
  assert.deepEqual(W39.answer({ plan: first, broker_id: null, claimed: false }).effects, [], 'lost the claim (a concurrent same request): no second message');
  // a new request_id is a new key; the WhatsApp correlation is per lead, so Lindi's line still goes once
  const other = W39.decideAnswers({ lead: LEAD(), answers: { intent: 'will' }, request_id: 'req-0002-abcd', now: NOW });
  assert.notEqual(other.activity.idempotency_key, first.activity.idempotency_key);
  assert.equal(other.send.correlation, first.send.correlation);
  assert.deepEqual(W39.answer({ plan: { kind: 'reject', status: 401, body: { error: 'try_again' } } }), { status: 401, body: { error: 'try_again' }, effects: [] });
});

test('GET /start view: first name, adviser from his row (practice + FSP), methods teams/phone only, answers so far, live booking (held = verify email)', () => {
  const lead = LEAD({ broker_id: BROKER_ID, age_band: '35_44', budget_band: '1250_1499', conv_state: { state: 'unbooked', start: { intent: 'life', has_cover: 'no', want: 'family', at: 'x', via: 'start_page' } } });
  const v = W39.startView({ lead, broker: BROKER, booking: { id: 'bk1', appointment_date: '2026-10-21T08:00:00+00:00', ends_at: '2026-10-21T08:30:00+00:00', method: 'teams', status: 'pending_verification' } });
  assert.deepEqual(v, { status: 200, body: { first_name: 'Thandi', adviser: { first_name: 'Mark', name: 'Mark Smith', firm: 'Oracle Brokers', fsp: '28418' }, methods: ['teams', 'phone'],
    answers: { intent: 'life', age_band: '35_44', has_cover: 'no', budget_band: '1250_1499', want: 'family' }, booking: { start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T10:30:00+02:00', method: 'teams', held: true } } });
  assert.equal(W39.startView({ lead, broker: BROKER, booking: { appointment_date: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T08:30:00Z', method: 'phone', status: 'booked' } }).body.booking.held, false);
  const fresh = W39.startView({ lead: LEAD(), broker: null, booking: null }).body;
  assert.deepEqual(fresh, { first_name: 'Thandi', adviser: null, methods: [], answers: {}, booking: null }, 'not routed: no adviser');
  assert.deepEqual(W39.startView({ lead: LEAD({ broker_id: BROKER_ID, budget_band: '1250plus' }), broker: { ...BROKER, methods_supported: ['zoom'] } }).body.methods, [], 'only teams / phone are offered');
  assert.equal(W39.startView({ lead: LEAD({ broker_id: BROKER_ID, budget_band: '1250plus' }), broker: { ...BROKER, firm_name: null } }).body.adviser.firm, 'Oracle Brokers (Pty) Ltd');
  assert.equal(W39.startView({ lead: LEAD({ budget_band: '1250plus' }) }).body.answers.budget_band, undefined, 'a legacy band is not a page answer');
  const raw = JSON.stringify(v);
  for (const k of ['+2760', LEAD_ID, BROKER_ID, 'opted', 'email']) assert.equal(raw.includes(k), false, `${k} never leaves`);
});

// ---------------------------------------------------------------- the workflow (W39.json), its real Code nodes
test('W39.json: stable id smc-w39, inactive, errorWorkflow smc-w22, credentials by name, require(lv-automation) only, sub-calls by id, SQL columns exist, no ungated sender', () => {
  assert.equal(WF.id, 'smc-w39'); assert.equal(WF.active, false);
  assert.deepEqual(lvViolations(WF, 'smc-w39'), []);
  for (const n of WF.nodes) for (const c of Object.values(n.credentials || {})) { assert.equal(c.id, ''); assert.equal(c.name, PG_CRED); }
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  assert.deepEqual(findUngated(WF), []);
  const raw = JSON.stringify(WF);
  assert.doesNotMatch(raw, /EAA[A-Za-z0-9]{20,}|sk_live|-----BEGIN|Bearer [A-Za-z0-9._-]{20,}|lt1\.[A-Za-z0-9-]{8,}\.\d/);
  const hooks = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  assert.deepEqual(hooks.map((h) => [h.parameters.httpMethod, h.parameters.path]), [['GET', 'start'], ['POST', 'start/answers']]);
  for (const h of hooks) { assert.match(h.parameters.options.allowedOrigins, /\$env\.PUBLIC_ALLOWED_ORIGINS/); assert.equal(h.parameters.responseMode, 'responseNode'); }
  for (const r of WF.nodes.filter((n) => n.type === 'n8n-nodes-base.respondToWebhook')) assert.deepEqual(r.parameters.options.responseHeaders.entries, [{ name: 'Cache-Control', value: 'no-store' }]);
  const subs = Object.fromEntries(WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => [n.parameters.workflowId.value, n.parameters.options.waitForSubWorkflow]));
  assert.deepEqual(subs, { 'smc-w01': true, 'smc-whatsapp-send': false }, 'routing waits (written before next: slots); the WhatsApp line is fire-and-forget');
  assert.equal(WF.nodes.find((n) => n.name === 'W01 Lead core (route, no W06 first touch; waits)').alwaysOutputData, true);
  assert.equal(WF.settings.saveDataSuccessExecution, 'none', 'tokens pass through items: successful runs are not saved');
  const names = new Set(WF.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(WF.connections)) { assert.ok(names.has(from), from); for (const out of c.main) for (const l of out) assert.ok(names.has(l.node), l.node); }
  const save = WF.nodes.find((n) => n.name === 'Save answers + timeline + cancel stall (one statement)').parameters.query;
  assert.match(save, /WHERE l\.id = \$1::uuid AND EXISTS \(SELECT 1 FROM claim\)/, 'the lead is written only by the request that claimed its key');
  assert.match(save, /UPDATE public\.wa_threads t[\s\S]*stall_due_at = NULL/, "W03's stall is cancelled");
  assert.doesNotMatch(save, /\bqualified\s*=/, 'leads.qualified is GENERATED');
});

test('W39.json via the real Code nodes: GET /start (token -> view) and POST /start/answers (parse -> decide -> answer), never echoing the token', async () => {
  const t = tok(LEAD_ID, Date.now()); // the Code nodes read the wall clock
  // GET
  const [c1] = await runCode(WF, 'Resolve caller (start)', { items: [{ headers: H(t) }], env: ENV });
  assert.deepEqual(c1.json, { ok: true, lead_id: LEAD_ID });
  const [bad] = await runCode(WF, 'Resolve caller (start)', { items: [{ headers: H('lt1.x') }], env: ENV });
  assert.deepEqual([bad.json.status, bad.json.body], [401, { error: 'try_again' }]);
  assert.deepEqual(evalParam(WF, 'Load lead, adviser, live booking', 'options.queryReplacement', { json: c1.json }), [LEAD_ID]);
  const [view] = await runCode(WF, 'View (w39.startView)', { items: [{ lead: LEAD({ broker_id: BROKER_ID }), broker: BROKER, booking: null }] });
  assert.equal(view.json.status, 200); assert.equal(view.json.body.adviser.fsp, '28418');
  const [gone] = await runCode(WF, 'View (w39.startView)', { items: [{ lead: LEAD({ opted_out_at: '2026-10-18T00:00:00Z' }), broker: BROKER, booking: null }] });
  assert.deepEqual([gone.json.status, gone.json.body], [401, { error: 'try_again' }]);
  // POST
  const body = { intent: 'life', age_band: '35_44', budget_band: '1500_plus', request_id: RID };
  const [q] = await runCode(WF, 'Resolve caller + parse (answers)', { items: [{ headers: H(t), body }], env: ENV });
  assert.deepEqual(q.json, { ok: true, lead_id: LEAD_ID, answers: { intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, request_id: RID, confirm_adviser: null, key: `w39:answers:${LEAD_ID}:${RID}` });
  const [inv] = await runCode(WF, 'Resolve caller + parse (answers)', { items: [{ headers: H(t), body: { intent: 'life', request_id: RID } }], env: ENV });
  assert.deepEqual([inv.json.status, inv.json.body], [400, { error: 'invalid' }]);
  const [noTok] = await runCode(WF, 'Resolve caller + parse (answers)', { items: [{ headers: {}, body }], env: ENV });
  assert.equal(noTok.json.status, 401, 'token first, then the body');
  const [d] = await runCode(WF, 'Decide (w39.decideAnswers)', { items: [{ lead: LEAD(), prior: null }], refs: { 'Resolve caller + parse (answers)': q.json } });
  assert.equal(d.json.plan.path, 'route');
  const repl = evalParam(WF, 'Save answers + timeline + cancel stall (one statement)', 'options.queryReplacement', { json: d.json });
  assert.equal(repl[0], LEAD_ID); assert.equal(JSON.parse(repl[1]).stage, 'qualified'); assert.deepEqual(JSON.parse(repl[3]), []);
  assert.equal(JSON.parse(repl[2]).idempotency_key, `w39:answers:${LEAD_ID}:${RID}`); assert.equal(repl[4], 'done');
  // phase (a): no W01 call at all; the routing input exists only after a confirm (two-phase tests below)

  const [ans] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: null }], refs: { 'Decide (w39.decideAnswers)': d.json, 'Save answers + timeline + cancel stall (one statement)': { claimed: 1 }, 'Adviser step (w39.coverStep)': { step: { next: 'adviser', adviser: { id: BROKER_ID } } } } });
  assert.deepEqual([ans.json.status, ans.json.body], [200, { ok: true, next: 'adviser', adviser: { id: BROKER_ID } }]);
  // replay: Save did not run (the try/catch reads it as not claimed)
  const [dr] = await runCode(WF, 'Decide (w39.decideAnswers)', { items: [{ lead: LEAD(), prior: { path: 'will' } }], refs: { 'Resolve caller + parse (answers)': q.json } });
  const [ar] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: null }], refs: { 'Decide (w39.decideAnswers)': dr.json } });
  assert.deepEqual([ar.json.body, ar.json.effects], [{ ok: true, next: 'chat' }, []]);
  // will: the effects become one decided WhatsApp send (no 'kind' leaks into it) + the escalation
  const qw = { ...q.json, answers: { intent: 'will' } };
  const [dw] = await runCode(WF, 'Decide (w39.decideAnswers)', { items: [{ lead: LEAD(), prior: null }], refs: { 'Resolve caller + parse (answers)': qw } });
  const [aw] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: null }], refs: { 'Decide (w39.decideAnswers)': dw.json, 'Save answers + timeline + cancel stall (one statement)': { claimed: 1 } } });
  const fx = await runCode(WF, 'Effects (claimed request only)', { items: [aw.json], refs: { 'Answer (w39.answer)': aw.json } });
  assert.deepEqual(fx.map((x) => x.json.kind), ['send', 'escalate']);
  const [wa] = await runCode(WF, 'WhatsApp input (Lindi line)', { items: [fx[0].json] });
  assert.deepEqual(wa.json, { to: '+27600000138', kind: 'text', text: W39.WILLS_TEXT('Thandi'), lead_id: LEAD_ID, correlation: `w39:will:${LEAD_ID}` }, 'the decided shape smc-whatsapp-send takes');
  assert.deepEqual(evalParam(WF, 'Escalate to a person (wills)', 'options.queryReplacement', { json: fx[1].json, refs: { 'Decide (w39.decideAnswers)': dw.json } })[0], LEAD_ID);
  for (const out of [c1.json, q.json, d.json, ans.json, aw.json]) assert.equal(JSON.stringify(out).includes(t), false, 'the token never travels past the caller check');
});

test('loader: require("lv-automation").w39 is the same module', () => {
  const L = require('../index.cjs');
  assert.equal(typeof L.w39.decideAnswers, 'function');
  assert.ok(L.MODULES.w39);
});

// ---------------------------------------------------------------- disclosure before routing (two phases)
const CARD = { id: BROKER_ID, first_name: 'Mark', name: 'Mark Smith', firm: 'Oracle Brokers', fsp: '28418' };
const cover = (confirm, leadOver = {}, brokers = [PICK]) => {
  const lead = LEAD({ consent_mode: 'generic', ...leadOver });
  const plan = W39.decideAnswers({ lead, answers: { intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, request_id: RID, confirm_adviser: confirm, now: NOW });
  const step = W39.coverStep({ plan, lead, brokers });
  return { plan, step, lead };
};

test('phase (a), no confirm_adviser: the answers are stored, the adviser W01 WOULD pick is returned, NOTHING is routed', () => {
  const { plan, step } = cover(null);
  assert.equal(plan.kind, 'work'); assert.equal(plan.cover, true); assert.equal(plan.confirm_adviser, null);
  assert.equal(plan.set.age_band, '35_44', 'the answers are stored in this call');
  assert.deepEqual(step, { next: 'adviser', adviser: CARD, steps: [] });
  assert.equal(step.route, undefined); assert.equal(step.disclose, undefined);
  assert.deepEqual(W39.answer({ plan, step, broker_id: null, claimed: true }), { status: 200, body: { ok: true, next: 'adviser', adviser: CARD }, effects: [] });
  const raw = JSON.stringify(step.adviser);
  for (const k of ['email', 'phone', 'whatsapp', 'calendar', '@', '+27']) assert.equal(raw.includes(k), false, `${k} never reaches the page`);
  // the same rules as routeExisting: named consent for another practice, a full order, a wills lead -> chat
  assert.equal(cover(null, { consent_mode: 'named', consent_text: 'I agree ... Other Practice (FSP 1)' }).step.next, 'chat');
  assert.equal(cover(null, {}, [{ ...PICK, order_remaining: 0 }]).step.next, 'chat');
  assert.deepEqual(cover(null, {}, [{ ...PICK, routing_on: false }]).step.steps, ['hold'], 'no broker: a hold is recorded, never a route');
  assert.equal(cover(null, { product_interest: 'wills' }).step.held, 'held_no_wills_broker');
  // two brokers: the fairness rule of pickBroker decides, the page shows that one
  const other = { ...PICK, id: 'b2', broker_id: 'b2', contact_person: 'Ann Lee', order_attached: 0 };
  assert.equal(cover(null, {}, [PICK, other]).step.adviser.id, 'b2');
});

test('phase (b), confirm equals the pick: adviser_disclosed (START-DISCLOSE-v1) then the route, in that order, in the same plan -> slots once W01 routed him', () => {
  const { plan, step } = cover(BROKER_ID);
  assert.equal(plan.activity.idempotency_key, `w39:answers:${LEAD_ID}:${RID}:confirm`);
  assert.deepEqual(step.steps, ['disclose', 'route'], 'the disclosure row first, the routing call after it, never the other way round');
  assert.deepEqual(step.disclose, { activity_type: 'adviser_disclosed', idempotency_key: `w39:disclosed:${LEAD_ID}:${BROKER_ID}`, broker_id: BROKER_ID,
    payload: { broker_id: BROKER_ID, fsp: '28418', firm: 'Oracle Brokers', adviser: 'Mark Smith', disclosure_version: 'START-DISCLOSE-v1', via: 'start_page' } });
  assert.deepEqual(step.route, { kind: 'route_and_first_touch', lead_id: LEAD_ID, first_touch: false, expect_broker_id: BROKER_ID, source: 'W39' }, 'W01 may route only the adviser shown');
  assert.deepEqual(W39.answer({ plan, step, broker_id: BROKER_ID, claimed: true }).body, { ok: true, next: 'slots' });
  assert.deepEqual(W39.answer({ plan, step, broker_id: null, claimed: true }).body, { ok: true, next: 'chat' }, 'W01 refused (the pick changed in between): no slots');
  assert.deepEqual(W39.answer({ plan, step, broker_id: 'b2', claimed: true }).body, { ok: true, next: 'chat' });
});

test('phase (b), a mismatched confirm: the new adviser is shown, nothing is disclosed or routed', () => {
  const { step } = cover('00000000-0000-4000-8000-00000000dead');
  assert.deepEqual(step, { next: 'adviser', adviser: CARD, steps: [], changed: true });
  const none = cover(BROKER_ID, {}, [{ ...PICK, order_remaining: 0 }]).step;
  assert.equal(none.next, 'chat'); assert.equal(none.route, undefined); assert.equal(none.disclose, undefined);
});

test('already routed: the card is the current broker; a confirm of him logs the disclosure (no second route) -> slots; any other confirm -> his card again', () => {
  const routed = { broker_id: BROKER_ID, routed_at: '2026-10-19T08:00:00+02:00' };
  assert.deepEqual(cover(null, routed, [{ ...PICK, order_remaining: 0 }]).step, { next: 'adviser', adviser: CARD, steps: [] }, 'his card even with no room left (already reserved)');
  const ok = cover(BROKER_ID, routed).step;
  assert.deepEqual(ok.steps, ['disclose']); assert.equal(ok.next, 'slots'); assert.equal(ok.route, undefined);
  assert.equal(ok.disclose.idempotency_key, `w39:disclosed:${LEAD_ID}:${BROKER_ID}`, 'logged once per lead and broker (ON CONFLICT DO NOTHING)');
  assert.deepEqual(cover('b2', routed).step, { next: 'adviser', adviser: CARD, steps: [], changed: true });
});

test('no route without confirm_adviser, on every path; will / other / out-of-band close never route', () => {
  for (const answers of [{ intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, { intent: 'income', age_band: 'lt35', budget_band: '750_1250' }, { intent: 'review', age_band: '45_50', budget_band: 'lt750' }]) {
    const lead = LEAD({ consent_mode: 'generic' });
    const plan = W39.decideAnswers({ lead, answers, request_id: RID, now: NOW });
    for (const brokers of [[PICK], [{ ...PICK, accepts_low_budget: true }], []]) {
      const st = W39.coverStep({ plan, lead, brokers });
      assert.equal(st.route, undefined, JSON.stringify(answers)); assert.equal((st.steps || []).includes('route'), false);
      assert.equal(st.disclose, undefined);
    }
  }
  for (const answers of [{ intent: 'will' }, { intent: 'other' }]) {
    for (const confirm of [null, BROKER_ID]) {
      const plan = W39.decideAnswers({ lead: LEAD(), answers, request_id: RID, confirm_adviser: confirm, now: NOW });
      assert.equal(plan.cover, false); assert.equal(W39.answer({ plan, claimed: true }).body.next, 'chat');
    }
  }
  const close = W39.decideAnswers({ lead: LEAD(), answers: { intent: 'life', age_band: 'lt35', budget_band: '1500_plus' }, request_id: RID, confirm_adviser: BROKER_ID, now: NOW, oobAgeBooks: false });
  assert.equal(close.cover, false); assert.equal(close.path, 'oob_close');
  // the workflow: the Cover path? gate, then disclosure -> W01, wired in that order; W01's input comes only from coverStep
  const conn = (from) => WF.connections[from].main.map((o) => o.map((l) => l.node));
  assert.deepEqual(conn('Disclose? (confirmed adviser)'), [['Log adviser_disclosed (before routing)'], ['W01 call? (route the confirmed adviser | record a hold)']]);
  assert.deepEqual(conn('Log adviser_disclosed (before routing)'), [['W01 call? (route the confirmed adviser | record a hold)']]);
  assert.deepEqual(conn('W01 call? (route the confirmed adviser | record a hold)'), [['W01 Lead core input (no first touch)'], ['Re-read broker_id']]);
  const into = Object.entries(WF.connections).filter(([, c]) => c.main.some((o) => o.some((l) => l.node === 'W01 Lead core input (no first touch)'))).map(([f]) => f);
  assert.deepEqual(into, ['W01 call? (route the confirmed adviser | record a hold)'], 'the only way to W01');
  assert.match(WF.nodes.find((n) => n.name === 'W01 Lead core input (no first touch)').parameters.jsCode, /s\.route \|\| s\.hold/);
  // the pick reads the same broker list as W01 core (every key W01 routes on is there)
  const W01WF = JSON.parse(readFileSync(new URL('../W01.json', import.meta.url), 'utf8'));
  const keys = (q) => [...q.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]);
  const w01q = W01WF.nodes.find((n) => n.name === 'Load CTWA lead + brokers').parameters.query;
  const w39q = WF.nodes.find((n) => n.name === 'Load lead + brokers (pick)').parameters.query;
  for (const k of keys(w01q.slice(w01q.indexOf('jsonb_build_object'), w01q.indexOf('FROM public.brokers')))) assert.ok(w39q.includes(`'${k}'`), k);
});

test('W39.json via the real Code nodes: the two calls (adviser card, then confirm) and the disclosure SQL parameters', async () => {
  const t = tok(LEAD_ID, Date.now());
  const run = async (body) => {
    const [q] = await runCode(WF, 'Resolve caller + parse (answers)', { items: [{ headers: H(t), body }], env: ENV });
    const [d] = await runCode(WF, 'Decide (w39.decideAnswers)', { items: [{ lead: LEAD({ consent_mode: 'generic' }), prior: null }], refs: { 'Resolve caller + parse (answers)': q.json } });
    const [st] = await runCode(WF, 'Adviser step (w39.coverStep)', { items: [{ lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] }], refs: { 'Decide (w39.decideAnswers)': d.json } });
    return { q: q.json, d: d.json, st: st.json };
  };
  const body = { intent: 'life', age_band: '35_44', budget_band: '1500_plus', request_id: RID };
  const a = await run(body);
  assert.equal(a.q.key, `w39:answers:${LEAD_ID}:${RID}`);
  const [ansA] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: null }], refs: { 'Decide (w39.decideAnswers)': a.d, 'Save answers + timeline + cancel stall (one statement)': { claimed: 1 }, 'Adviser step (w39.coverStep)': a.st } });
  assert.deepEqual(ansA.json.body, { ok: true, next: 'adviser', adviser: CARD });
  const b = await run({ ...body, confirm_adviser: BROKER_ID });
  assert.equal(b.q.key, `w39:answers:${LEAD_ID}:${RID}:confirm`);
  assert.deepEqual(evalParam(WF, 'Log adviser_disclosed (before routing)', 'options.queryReplacement', { refs: { 'Adviser step (w39.coverStep)': b.st } }),
    [LEAD_ID, BROKER_ID, JSON.stringify(b.st.step.disclose.payload), `w39:disclosed:${LEAD_ID}:${BROKER_ID}`]);
  const [inp] = await runCode(WF, 'W01 Lead core input (no first touch)', { items: [{}], refs: { 'Adviser step (w39.coverStep)': b.st } });
  assert.deepEqual(inp.json, W39.routeInput(LEAD_ID, BROKER_ID));
  const [ansB] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: BROKER_ID }], refs: { 'Decide (w39.decideAnswers)': b.d, 'Save answers + timeline + cancel stall (one statement)': { claimed: 1 }, 'Adviser step (w39.coverStep)': b.st } });
  assert.deepEqual(ansB.json.body, { ok: true, next: 'slots' });
  assert.match(WF.nodes.find((n) => n.name === 'Log adviser_disclosed (before routing)').parameters.query, /'adviser_disclosed'/);
});
