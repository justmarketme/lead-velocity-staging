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

test('any age, OUT_OF_BAND_AGE_BOOKS = true (Jono, 18 Oct: every age books and counts): exactly like 35-50, qualified on the budget -> the adviser card', () => {
  assert.equal(W39.OUT_OF_BAND_AGE_BOOKS, true);
  for (const age of ['lt35', '35_44', '45_50', '51plus']) {
    const p = decide({ intent: 'income', age_band: age, budget_band: '1500_plus' }, {}, { oobAgeBooks: true });
    assert.equal(p.path, 'route', age); assert.equal(p.cover, true);
    assert.equal(p.set.age_band, age);
    assert.equal(p.set.qualified_at, '2026-10-19T09:00:00+02:00', `${age}: qualified on the band`); assert.equal(p.set.stage, 'qualified');
    assert.equal(p.set.disqualified_reason, undefined);
    assert.equal(p.set.conv_state.state, 'unbooked');
    assert.equal(p.set.conv_state.age_accepted, undefined, 'no special flag: nothing closes an age any more');
    assert.deepEqual(p.notes, []);
    assert.equal(W39.coverStep({ plan: p, lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] }).next, 'adviser');
  }
  assert.equal(decide({ intent: 'life', age_band: 'lt35', budget_band: 'lt750' }).set.qualified_at, undefined, 'tier C: band only, any age');
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

test('GET /start view (v4): first name, pretty phone, adviser card (id, practice, FSP, approved bio + photo), methods teams/phone, answers, contact, live booking', () => {
  const lead = LEAD({ broker_id: BROKER_ID, age_band: '35_44', income_band: '40k_60k', call_number: '+27821110000', alt_number: '+27600000999',
    conv_state: { state: 'unbooked', start: { topics: ['life', 'will', 'bogus'], at: 'x', via: 'start_page' } } });
  const v = W39.startView({ lead, broker: BROKER, booking: { id: 'bk1', appointment_date: '2026-10-21T08:00:00+00:00', ends_at: '2026-10-21T08:30:00+00:00', method: 'teams', status: 'pending_verification' } });
  assert.deepEqual(v, { status: 200, body: { first_name: 'Thandi', phone_pretty: '060 000 0138', adviser: { id: BROKER_ID, first_name: 'Mark', name: 'Mark Smith', firm: 'Oracle Brokers', fsp: '28418', bio: null, photo_url: null },
    methods: ['teams', 'phone'], answers: { age_band: '35_44', income_band: '40k_60k', topics: ['life', 'will'] }, contact: { call_number: '082 111 0000', alt_number: '060 000 0999' },
    booking: { start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T10:30:00+02:00', method: 'teams', held: true } } });
  assert.equal(W39.startView({ lead, broker: BROKER, booking: { appointment_date: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T08:30:00Z', method: 'phone', status: 'booked' } }).body.booking.held, false);
  // not routed: the preview pick (the adviser W01 would choose) is shown first; nobody can take it -> null
  const fresh = W39.startView({ lead: LEAD({ consent_mode: 'generic' }), broker: null, brokers: [PICK], booking: null }).body;
  assert.deepEqual(fresh, { first_name: 'Thandi', phone_pretty: '060 000 0138', adviser: CARD, methods: ['teams', 'phone'], answers: {}, contact: {}, booking: null }, 'v4: the card before anything is asked');
  assert.equal(W39.startView({ lead: LEAD({ consent_mode: 'generic' }), brokers: [{ ...PICK, order_remaining: 0 }] }).body.adviser, null);
  assert.equal(W39.startView({ lead: LEAD(), brokers: null }).body.adviser, null, 'no list: no card');
  assert.deepEqual(W39.startView({ lead: LEAD({ broker_id: BROKER_ID }), broker: { ...BROKER, methods_supported: ['zoom'] } }).body.methods, [], 'only teams / phone are offered');
  assert.equal(W39.startView({ lead: LEAD({ broker_id: BROKER_ID }), broker: { ...BROKER, firm_name: null } }).body.adviser.firm, 'Oracle Brokers (Pty) Ltd');
  // v3 answers stay readable for a page opened before the deploy
  const v3 = W39.startView({ lead: LEAD({ age_band: '45_50', budget_band: '1250_1499', conv_state: { start: { intent: 'life', has_cover: 'no', want: 'family' } } }) }).body.answers;
  assert.deepEqual(v3, { age_band: '45_50', intent: 'life', has_cover: 'no', budget_band: '1250_1499', want: 'family' });
  const raw = JSON.stringify(v);
  for (const k of ['+2760', '+2782', LEAD_ID, 'opted', 'email', 'consent']) assert.equal(raw.includes(k), false, `${k} never leaves`);
});

test('adviser card: bio only when the bio review is accepted or there is none; photo only an APPROVED headshot or an approved intro card, https only', () => {
  const bio = 'With 26 years of experience, I help families protect the people they love.';
  assert.equal(W39.approvedBio({ bio_short: bio }), bio, 'no review: his own bio');
  assert.equal(W39.approvedBio({ bio_short: bio, bio_review: { status: 'accepted' } }), bio);
  for (const status of ['changes_suggested', 'declined', undefined]) assert.equal(W39.approvedBio({ bio_short: bio, bio_review: { status } }), null, String(status));
  assert.equal(W39.approvedBio({ bio_short: '  ' }), null);
  assert.equal(W39.approvedPhoto({ headshot_approved_url: 'https://media.sortmycover.co.za/h/mark.jpg', intro_card_url: 'https://x/card.png', card_approved_at: '2026-10-13' }), 'https://media.sortmycover.co.za/h/mark.jpg');
  assert.equal(W39.approvedPhoto({ intro_card_url: 'https://x/card.png', card_approved_at: '2026-10-13T10:00:00Z' }), 'https://x/card.png', 'the approved intro card');
  assert.equal(W39.approvedPhoto({ intro_card_url: 'https://x/card.png' }), null, 'card not approved in the portal');
  assert.equal(W39.approvedPhoto({ headshot_url: 'https://raw/upload.jpg' }), null, 'the raw upload is never sent');
  assert.equal(W39.approvedPhoto({ headshot_approved_url: 'http://insecure/x.jpg' }), null);
  assert.deepEqual(W39.adviserCard({ ...PICK, bio_short: bio, bio_review: { status: 'changes_suggested' }, intro_card_url: 'https://x/c.png', card_approved_at: 't' }), { ...CARD, photo_url: 'https://x/c.png' });
  assert.deepEqual(W39.adviserCard({ ...PICK, bio_short: bio, bio_review: { status: 'accepted' } }).bio, bio);
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
  assert.deepEqual(hooks.map((h) => [h.parameters.httpMethod, h.parameters.path]), [['GET', 'start'], ['POST', 'start/answers'], ['POST', 'start/adviser'], ['POST', 'start/contact'], ['POST', 'start/move']]);
  assert.equal(new Set(hooks.map((h) => h.webhookId)).size, hooks.length, 'one webhookId per path');
  for (const h of hooks) { assert.ok(h.parameters.options.allowedOrigins.split(',').includes('https://sortmycover.co.za'), 'sortmycover.co.za may call /start'); assert.equal(h.parameters.responseMode, 'responseNode'); }
  for (const r of WF.nodes.filter((n) => n.type === 'n8n-nodes-base.respondToWebhook')) assert.deepEqual(r.parameters.options.responseHeaders.entries, [{ name: 'Cache-Control', value: 'no-store' }]);
  const subs = Object.fromEntries(WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => [n.parameters.workflowId.value, n.parameters.options.waitForSubWorkflow]));
  assert.deepEqual(subs, { 'smc-w01': true, 'smc-whatsapp-send': false, 'smc-w10': true }, 'routing and the move wait (written before the answer); the WhatsApp line is fire-and-forget');
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
  assert.deepEqual(evalParam(WF, 'Escalate to a person (wills / web lead)', 'options.queryReplacement', { json: fx[1].json, refs: { 'Decide (w39.decideAnswers)': dw.json } })[0], LEAD_ID);
  for (const out of [c1.json, q.json, d.json, ans.json, aw.json]) assert.equal(JSON.stringify(out).includes(t), false, 'the token never travels past the caller check');
});

test('loader: require("lv-automation").w39 is the same module', () => {
  const L = require('../index.cjs');
  assert.equal(typeof L.w39.decideAnswers, 'function');
  assert.ok(L.MODULES.w39);
});

// ---------------------------------------------------------------- disclosure before routing (two phases)
const CARD = { id: BROKER_ID, first_name: 'Mark', name: 'Mark Smith', firm: 'Oracle Brokers', fsp: '28418', bio: null, photo_url: null };
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

test('a /start/ page web lead (origin page, start_page_pending): never a session text; will / other go to a person; routed like any unrouted lead', () => {
  const web = (over = {}) => LEAD({ origin: 'page', routing_reason: 'start_page_pending', consent_mode: 'generic', ...over });
  const will = W39.decideAnswers({ lead: web(), answers: { intent: 'will' }, request_id: RID, now: NOW });
  assert.equal(will.send, null, 'no 24-h session: no WhatsApp text'); assert.match(will.escalate.note, /wills/);
  const other = W39.decideAnswers({ lead: web(), answers: { intent: 'other' }, request_id: RID, now: NOW });
  assert.equal(other.send, null); assert.match(other.escalate.note, /web lead/);
  assert.deepEqual(W39.answer({ plan: other, claimed: true }).effects.map((e) => e.kind), ['escalate']);
  const close = W39.decideAnswers({ lead: web(), answers: { intent: 'life', age_band: 'lt35', budget_band: '1500_plus' }, request_id: RID, now: NOW, oobAgeBooks: false });
  assert.equal(close.send, null);
  // the two phases work the same for it
  const plan = W39.decideAnswers({ lead: web(), answers: { intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, request_id: RID, now: NOW });
  assert.equal(W39.coverStep({ plan, lead: web(), brokers: [PICK] }).next, 'adviser');
  const conf = W39.decideAnswers({ lead: web(), answers: { intent: 'life', age_band: '35_44', budget_band: '1500_plus' }, request_id: RID, confirm_adviser: BROKER_ID, now: NOW });
  assert.deepEqual(W39.coverStep({ plan: conf, lead: web(), brokers: [PICK] }).steps, ['disclose', 'route']);
  // a WhatsApp lead keeps Lindi's session lines
  assert.ok(W39.decideAnswers({ lead: LEAD({ origin: 'ctwa' }), answers: { intent: 'other' }, request_id: RID, now: NOW }).send);
  assert.match(WF.nodes.find((n) => n.name === 'Load lead + earlier answer (same request_id)').parameters.query, /l\.origin, l\.routing_reason/);
});

// ================================================================ v4 (Jono approved mockup v4.2, 19 Oct 2026)
const RID4 = 'req-v4-0001';
const runAdviser = async (body, lead = LEAD({ consent_mode: 'generic' }), brokers = [PICK]) => {
  const t = tok(LEAD_ID, Date.now());
  const [q] = await runCode(WF, 'Resolve caller + parse (answers) [adviser]', { items: [{ headers: H(t), body }], env: ENV });
  if (!q.json.ok) return { q: q.json };
  const [d] = await runCode(WF, 'Decide (w39.decideAdviser)', { items: [{ lead, prior: null }], refs: { 'Resolve caller + parse (answers) [adviser]': q.json } });
  const [st] = await runCode(WF, 'Adviser step (w39.coverStep) [adviser]', { items: [{ lead, brokers }], refs: { 'Decide (w39.decideAdviser)': d.json } });
  return { q: q.json, d: d.json, st: st.json };
};

test('POST /start/adviser: no answers; no confirm -> the card, nothing routed; confirm = the pick -> adviser_disclosed then W01 (first_touch false, expect_broker_id) -> slots', async () => {
  assert.deepEqual(W39.parseAdviser({ request_id: RID4 }), { ok: true, request_id: RID4, confirm_adviser: null });
  for (const bad of [{}, { request_id: 'x' }, { request_id: RID4, confirm_adviser: 'not an id!' }]) assert.deepEqual(W39.parseAdviser(bad).body, { error: 'invalid' }, JSON.stringify(bad));
  const a = W39.decideAdviser({ lead: LEAD({ consent_mode: 'generic' }), request_id: RID4, now: NOW });
  assert.deepEqual([a.kind, a.path, a.cover, a.thread_stage], ['work', 'adviser', true, 'done'], "W03's stall is cancelled");
  assert.deepEqual(a.set, { conv_state: { via: 'start_page', state: 'unbooked' } }, 'only marks the lead as on the page (W05 bandKnown reads via)');
  assert.equal(a.activity.idempotency_key, `w39:adviser:${LEAD_ID}:${RID4}`);
  assert.deepEqual(W39.coverStep({ plan: a, lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] }), { next: 'adviser', adviser: CARD, steps: [] });
  assert.deepEqual(W39.decideAdviser({ lead: LEAD({ conv_state: { state: 'booked_wait' } }), request_id: RID4, now: NOW }).set.conv_state, { via: 'start_page' }, 'a later state is never rewound');
  const b = W39.decideAdviser({ lead: LEAD({ consent_mode: 'generic' }), request_id: RID4, confirm_adviser: BROKER_ID, now: NOW });
  assert.equal(b.key, `w39:adviser:${LEAD_ID}:${RID4}:confirm`);
  const sb = W39.coverStep({ plan: b, lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] });
  assert.deepEqual(sb.steps, ['disclose', 'route']); assert.equal(sb.disclose.payload.disclosure_version, 'START-DISCLOSE-v1');
  assert.deepEqual(sb.route, W39.routeInput(LEAD_ID, BROKER_ID));
  assert.deepEqual(W39.answer({ plan: b, step: sb, broker_id: BROKER_ID, claimed: true }).body, { ok: true, next: 'slots' });
  assert.deepEqual(W39.coverStep({ plan: { ...b, confirm_adviser: 'someone-else' }, lead: LEAD({ consent_mode: 'generic' }), brokers: [PICK] }).next, 'adviser', 'a changed pick: the new card');
  assert.equal(W39.coverStep({ plan: b, lead: LEAD({ consent_mode: 'generic' }), brokers: [{ ...PICK, order_remaining: 0 }] }).next, 'chat', 'no broker -> chat');
  // tier: unknown band = provisional B (W01 page budget_pending); every age; a tier-C-only broker never gets a band-less lead it cannot judge
  assert.equal(W39.pickAdviser(LEAD({ consent_mode: 'generic', budget_band: null }), [PICK]).adviser.id, BROKER_ID);
  assert.deepEqual(W39.decideAdviser({ lead: LEAD(), request_id: RID4, prior: { path: 'adviser' } }), { kind: 'replay', path: 'adviser', cover: true, confirm_adviser: null }, 'the same call again replays');
  assert.equal(W39.decideAdviser({ lead: LEAD({ opted_out_at: 'x' }), request_id: RID4 }).status, 401);
  // via the real Code nodes
  const r1 = await runAdviser({ request_id: RID4 });
  assert.deepEqual(r1.q, { ok: true, lead_id: LEAD_ID, request_id: RID4, confirm_adviser: null, key: `w39:adviser:${LEAD_ID}:${RID4}` });
  assert.deepEqual(r1.st.step, { next: 'adviser', adviser: CARD, steps: [] });
  const [ans1] = await runCode(WF, 'Answer (w39.answer) [adviser]', { items: [{ broker_id: null }], refs: { 'Decide (w39.decideAdviser)': r1.d, 'Save answers + timeline + cancel stall (one statement) [adviser]': { claimed: 1 }, 'Adviser step (w39.coverStep) [adviser]': r1.st } });
  assert.deepEqual(ans1.json.body, { ok: true, next: 'adviser', adviser: CARD });
  const r2 = await runAdviser({ request_id: RID4, confirm_adviser: BROKER_ID });
  const [inp] = await runCode(WF, 'W01 Lead core input (no first touch) [adviser]', { items: [{}], refs: { 'Adviser step (w39.coverStep) [adviser]': r2.st } });
  assert.deepEqual(inp.json, W39.routeInput(LEAD_ID, BROKER_ID));
  const [ans2] = await runCode(WF, 'Answer (w39.answer) [adviser]', { items: [{ broker_id: BROKER_ID }], refs: { 'Decide (w39.decideAdviser)': r2.d, 'Save answers + timeline + cancel stall (one statement) [adviser]': { claimed: 1 }, 'Adviser step (w39.coverStep) [adviser]': r2.st } });
  assert.deepEqual(ans2.json.body, { ok: true, next: 'slots' });
  // the cloned chain: disclosure THEN W01, the same order; its own webhook; nothing references the answers chain's nodes
  const conn = (from) => WF.connections[from].main.map((o) => o.map((l) => l.node));
  assert.deepEqual(conn('Disclose? (confirmed adviser) [adviser]'), [['Log adviser_disclosed (before routing) [adviser]'], ['W01 call? (route the confirmed adviser | record a hold) [adviser]']]);
  assert.deepEqual(conn('Log adviser_disclosed (before routing) [adviser]'), [['W01 call? (route the confirmed adviser | record a hold) [adviser]']]);
  const advNodes = WF.nodes.filter((x) => x.name.endsWith(' [adviser]') || x.name === 'Decide (w39.decideAdviser)');
  for (const x of advNodes) for (const m of JSON.stringify(x.parameters).matchAll(/\$\('([^']+)'\)/g)) assert.ok(m[1].endsWith(' [adviser]') || m[1] === 'Decide (w39.decideAdviser)', `${x.name} -> ${m[1]}`);
  assert.equal(WF.nodes.find((x) => x.name === 'POST /start/answers [adviser]').parameters.path, 'start/adviser');
});

test('POST /start/contact: SA numbers only (+27), call_number null = the WhatsApp number, alt_number + alt_purpose reach_fallback, idempotent per request_id', async () => {
  const P = (b) => W39.parseContact({ request_id: RID4, ...b });
  assert.deepEqual(P({ call_number: '082 111 0000', alt_number: '+27 (60) 000-0999' }), { ok: true, request_id: RID4, call_number: '+27821110000', alt_number: '+27600000999' });
  assert.deepEqual(P({}), { ok: true, request_id: RID4, call_number: null, alt_number: null }, 'nothing given: use the WhatsApp number');
  for (const [b, field] of [[{ call_number: '+44 20 7946 0958' }, 'call_number'], [{ alt_number: '12345' }, 'alt_number'], [{ call_number: 821110000 }, 'call_number']]) {
    const r = P(b); assert.deepEqual([r.status, r.body], [400, { error: 'invalid', field }], JSON.stringify(b));
  }
  assert.deepEqual(W39.parseContact({ call_number: '0821110000' }).body, { error: 'invalid', field: 'request_id' });
  const d = (c, a, over = {}) => W39.decideContact({ lead: LEAD(over), call_number: c, alt_number: a, request_id: RID4, now: NOW });
  assert.deepEqual(d('+27821110000', '+27600000999').set, { call_number: '+27821110000', alt_number: '+27600000999', alt_purpose: 'reach_fallback', call_number_changed: true });
  assert.deepEqual(d('+27600000138', null).set, { call_number: null, alt_number: null, alt_purpose: null, call_number_changed: false }, 'the WhatsApp number itself is stored as null');
  assert.deepEqual(d(null, '+27600000138').set.alt_number, null, 'a fallback equal to the number he will call is dropped');
  assert.deepEqual(d('+27821110000', '+27600000138').set.alt_number, '+27600000138', 'the WhatsApp number is a fine fallback for another call number');
  assert.equal(d('+27821110000', null, { call_number: '+27821110000' }).set.call_number_changed, false);
  const plan = d('+27821110000', '+27600000999');
  assert.equal(plan.activity.idempotency_key, `w39:contact:${LEAD_ID}:${RID4}`);
  assert.equal(JSON.stringify(plan.activity).includes('2782'), false, 'the timeline keeps no numbers');
  assert.deepEqual(W39.contactAnswer(plan), { status: 200, body: { ok: true } });
  assert.deepEqual(W39.decideContact({ lead: LEAD(), request_id: RID4, prior: { path: 'contact' } }), { kind: 'replay', path: 'contact' });
  assert.deepEqual(W39.contactAnswer(W39.decideContact({ lead: LEAD({ erased: true }), request_id: RID4 })), { status: 401, body: { error: 'try_again' } });
  // workflow
  const t = tok(LEAD_ID, Date.now());
  const [q] = await runCode(WF, 'Resolve caller + parse (contact)', { items: [{ headers: H(t), body: { request_id: RID4, call_number: '0821110000' } }], env: ENV });
  assert.deepEqual(q.json, { ok: true, lead_id: LEAD_ID, request_id: RID4, call_number: '+27821110000', alt_number: null, key: `w39:contact:${LEAD_ID}:${RID4}` });
  const [qb] = await runCode(WF, 'Resolve caller + parse (contact)', { items: [{ headers: H(t), body: { request_id: RID4, alt_number: 'nope' } }], env: ENV });
  assert.deepEqual([qb.json.status, qb.json.body], [400, { error: 'invalid', field: 'alt_number' }]);
  const [dc] = await runCode(WF, 'Decide (w39.decideContact)', { items: [{ lead: LEAD(), prior: null }], refs: { 'Resolve caller + parse (contact)': q.json } });
  const repl = evalParam(WF, 'Save contact numbers (one statement)', 'options.queryReplacement', { json: dc.json });
  assert.equal(repl[0], LEAD_ID); assert.equal(JSON.parse(repl[1]).call_number, '+27821110000');
  const sql = WF.nodes.find((x) => x.name === 'Save contact numbers (one statement)').parameters.query;
  assert.match(sql, /WHERE l\.id = \$1::uuid AND EXISTS \(SELECT 1 FROM claim\)/, 'written only by the request that claimed its key');
  assert.match(sql, /alt_purpose\s+= NULLIF/);
});

test('POST /start/answers v4 { age_band, income_band, topics[] }: stored, help_with + reasons, qualified, will -> a note + a person, never routed -> done; v3 bodies still accepted', async () => {
  const P = (b) => W39.parseAnswers({ request_id: RID4, ...b });
  assert.deepEqual(P({ age_band: '45_50', income_band: '60k_100k', topics: ['review', 'life', 'review'] }), { ok: true, v: 4, answers: { age_band: '45_50', income_band: '60k_100k', topics: ['review', 'life'] }, request_id: RID4, confirm_adviser: null });
  for (const bad of [{ age_band: '45_50', income_band: '60k_100k', topics: [] }, { age_band: '45_50', income_band: 'R60k', topics: ['life'] }, { income_band: '60k_100k', topics: ['life'] },
    { age_band: '45_50', income_band: '60k_100k', topics: ['car'] }, { age_band: '45_50', income_band: '60k_100k', topics: 'life' }, { age_band: '45_50', topics: ['life'] }]) {
    assert.deepEqual([P(bad).status, P(bad).body], [400, { error: 'invalid' }], JSON.stringify(bad));
  }
  for (const b of W39.INCOME_BANDS) assert.ok(['lt20k', '20k_40k', '40k_60k', '60k_100k', '100kplus', 'prefer_not'].includes(b), `${b}: leads_capture_v2_checks income_band`);
  assert.equal(P({ intent: 'life', age_band: '35_44', budget_band: '1500_plus' }).v, undefined, 'the v3 body keeps its own parser');
  assert.equal(P({ intent: 'life', age_band: '35_44', budget_band: '1500_plus' }).ok, true);
  const dv = (topics, over = {}) => W39.decideAnswers({ lead: LEAD({ broker_id: BROKER_ID, stage: 'booked', ...over }), answers: { age_band: '35_44', income_band: '20k_40k', topics }, request_id: RID4, now: NOW });
  const p = dv(['disability_income', 'life', 'new_bond']);
  assert.deepEqual([p.kind, p.path, p.cover, p.send, p.escalate], ['work', 'answers_v4', false, null, null], 'never routes, no WhatsApp line');
  assert.deepEqual(p.set, { age_band: '35_44', income_band: '20k_40k', qualified_at: '2026-10-19T09:00:00+02:00', stage: 'qualified', reasons: ['disability', 'life_cover'],
    conv_state: { start: { topics: ['disability_income', 'life', 'new_bond'], at: '2026-10-19T09:00:00+02:00', via: 'start_page', request_id: RID4 }, help_with: 'disability_income', via: 'start_page' } });
  assert.equal(p.set.budget_band, undefined, 'the budget question is gone');
  assert.equal(dv(['new_bond']).set.conv_state.help_with, 'life', 'a new bond is life cover for the bond');
  assert.equal(dv(['severe_illness']).set.reasons, undefined, 'no reasons code for severe illness');
  assert.ok(W01.HELP_WITH.has(dv(['review']).set.conv_state.help_with));
  const w = dv(['will', 'severe_illness']);
  assert.equal(w.set.conv_state.help_with, 'severe_illness', 'help_with: the first topic that is not a will');
  assert.equal(w.set.product_interest, undefined, 'never product_interest wills (it would hold a routed lead)');
  assert.deepEqual(w.notes.map((x) => [x.activity_type, x.idempotency_key]), [['start_page_will_requested', `w39:will:${LEAD_ID}`]]);
  assert.match(w.escalate.note, /will/); assert.equal(w.send, null);
  assert.equal(dv(['will']).set.conv_state.help_with, 'wills');
  const a = W39.answer({ plan: w, claimed: true });
  assert.deepEqual([a.body, a.effects.map((e) => e.kind)], [{ ok: true, next: 'done' }, ['escalate']]);
  assert.deepEqual(W39.answer({ plan: { kind: 'replay', path: 'answers_v4', cover: false } }).body, { ok: true, next: 'done' }, 'a replay answers done too');
  // the workflow
  const t = tok(LEAD_ID, Date.now());
  const [q] = await runCode(WF, 'Resolve caller + parse (answers)', { items: [{ headers: H(t), body: { age_band: '35_44', income_band: 'prefer_not', topics: ['life'], request_id: RID4 } }], env: ENV });
  assert.deepEqual(q.json.answers, { age_band: '35_44', income_band: 'prefer_not', topics: ['life'] });
  const [d] = await runCode(WF, 'Decide (w39.decideAnswers)', { items: [{ lead: LEAD({ broker_id: BROKER_ID }), prior: null }], refs: { 'Resolve caller + parse (answers)': q.json } });
  assert.equal(d.json.plan.path, 'answers_v4');
  const repl = evalParam(WF, 'Save answers + timeline + cancel stall (one statement)', 'options.queryReplacement', { json: d.json });
  assert.equal(JSON.parse(repl[1]).income_band, 'prefer_not');
  assert.match(WF.nodes.find((x) => x.name === 'Save answers + timeline + cancel stall (one statement)').parameters.query, /income_band\s+= coalesce\(\$2::jsonb->>'income_band'/);
  const [ans] = await runCode(WF, 'Answer (w39.answer)', { items: [{ broker_id: BROKER_ID }], refs: { 'Decide (w39.decideAnswers)': d.json, 'Save answers + timeline + cancel stall (one statement)': { claimed: 1 } } });
  assert.deepEqual(ans.json.body, { ok: true, next: 'done' });
});

test('POST /start/move (v4.6): W10 moves the live booking (one implementation); a slot past now + 14 days or in the past -> 400; the answer comes from the re-read row', async () => {
  const P = (b, now = NOW) => W39.parseMove({ request_id: RID4, ...b }, now);
  assert.deepEqual(P({ slot_start: '2026-10-22T10:00:00+02:00', method: 'teams' }), { ok: true, request_id: RID4, slot_start: '2026-10-22T10:00:00+02:00', method: 'teams' });
  assert.equal(P({ slot_start: '2026-11-02T08:30:00+02:00' }).ok, true, 'day 14 from now');
  for (const [b, field] of [[{ slot_start: '2026-11-03T10:00:00+02:00' }, 'slot_start'], [{ slot_start: '2026-10-18T10:00:00+02:00' }, 'slot_start'], [{ slot_start: 'tomorrow' }, 'slot_start'],
    [{ slot_start: '2026-10-22T10:00:00+02:00', method: 'zoom' }, 'method']]) assert.deepEqual([P(b).status, P(b).body], [400, { error: 'invalid', field }], JSON.stringify(b));
  // 14 days from TODAY, not from the old booking: the old booking is 13 days out, a time 2 days after it is refused
  assert.equal(P({ slot_start: '2026-11-03T10:00:00+02:00' }).ok, false);
  const BK = { id: 'bk-1', appointment_date: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T08:30:00Z', method: 'phone', status: 'booked' };
  const req = P({ slot_start: '2026-10-22T10:00:00+02:00' });
  const m = W39.moveRequest({ lead: LEAD(), booking: BK, req });
  assert.deepEqual(m.w10, { source: 'W39', lead_id: LEAD_ID, booking: { id: 'bk-1' }, msg: { list_id: 'slot_2026-10-22T10:00:00+02:00:resched:bk-1', wamid: `w39move:${RID4}` }, idempotency_key: `w39:move:${LEAD_ID}:${RID4}` });
  const W10 = await import('../lib/w10.mjs');
  assert.equal(W10.classifyOp(m.w10), 'pick', "W10's own pick op"); assert.deepEqual(W10.parseSlotPayload(m.w10.msg.list_id), { start: '2026-10-22T10:00:00+02:00', booking_id: 'bk-1' });
  assert.equal(m.method, null);
  const mm = W39.moveRequest({ lead: LEAD(), booking: BK, req: { ...req, method: 'teams' } });
  assert.deepEqual(mm.method.delegate, { action: 'change_method', method: 'teams' }); assert.equal(W10.classifyOp(mm.method), 'change_method');
  assert.deepEqual(W39.moveRequest({ lead: LEAD(), booking: null, req }), { kind: 'none', status: 409, body: { error: 'no_booking' } });
  assert.equal(W39.moveRequest({ lead: LEAD(), booking: { ...BK, appointment_date: '2026-10-22T08:00:00Z' }, req }).kind, 'same');
  const moved = { ...BK, appointment_date: '2026-10-22T08:00:00Z', ends_at: '2026-10-22T08:30:00Z' };
  assert.deepEqual(W39.moveAnswer({ plan: m, after: moved }), { status: 200, body: { ok: true, moved: true, booking: { start: '2026-10-22T10:00:00+02:00', end: '2026-10-22T10:30:00+02:00', method: 'phone', held: false } } });
  assert.deepEqual(W39.moveAnswer({ plan: m, after: BK }), { status: 409, body: { error: 'slot_taken' } }, 'W10 found the slot gone: the old time stands');
  assert.equal(W39.moveAnswer({ plan: { kind: 'reject', status: 401, body: { error: 'try_again' } } }).status, 401);
  // W04 is_free (what W10 re-checks with) measures the 14 days from now as well
  const W4 = await import('../lib/w04.mjs');
  const HOL = new Set(require('../index.cjs').holidays.holidays.map((h) => h.date)); const b = { id: BROKER_ID, status: 'active', methods_supported: ['teams', 'phone'] };
  const fr = (start, now) => W4.respond({ lane: 'sub', req: W4.subcallInput({ op: 'is_free', broker_id: BROKER_ID, start, end: new Date(Date.parse(start) + 30 * 60e3).toISOString() }), broker: b, bookings: [], busy: [], route: 'shared', now, holidays: HOL });
  assert.equal(fr('2026-10-29T10:00:00+02:00', NOW).free, true, 'a weekday 10 days out');
  assert.equal(fr('2026-11-04T10:00:00+02:00', NOW).free, false, '16 days out: past the horizon from now');
  // workflow wiring: the move waits for W10, then re-reads the row
  const t = tok(LEAD_ID, Date.now());
  const soon = new Date(Math.floor((Date.now() + 3 * 86400e3) / 1800e3) * 1800e3).toISOString(); // a 30-min grid time
  const [q] = await runCode(WF, 'Resolve caller + parse (move)', { items: [{ headers: H(t), body: { request_id: RID4, slot_start: soon } }], env: ENV });
  assert.equal(q.json.ok, true);
  const [far] = await runCode(WF, 'Resolve caller + parse (move)', { items: [{ headers: H(t), body: { request_id: RID4, slot_start: new Date(Date.now() + 15 * 86400e3).toISOString() } }], env: ENV });
  assert.deepEqual([far.json.status, far.json.body], [400, { error: 'invalid', field: 'slot_start' }]);
  const [pl] = await runCode(WF, 'Plan move (w39.moveRequest)', { items: [{ lead: LEAD(), booking: BK }], refs: { 'Resolve caller + parse (move)': q.json } });
  const [w10in] = await runCode(WF, 'W10 input (move)', { items: [{}], refs: { 'Plan move (w39.moveRequest)': pl.json } });
  assert.equal(w10in.json.source, 'W39');
  const conn = (from) => WF.connections[from].main.map((o) => o.map((l) => l.node));
  assert.deepEqual(conn('W10 input (move)'), [['W10 Reschedule / cancel (move; waits)']]);
  assert.deepEqual(conn('W10 Reschedule / cancel (move; waits)'), [['Method change? (move)']]);
  assert.deepEqual(conn('Re-read booking (move)'), [['Answer (w39.moveAnswer)']]);
  const [ans] = await runCode(WF, 'Answer (w39.moveAnswer)', { items: [{}], refs: { 'Plan move (w39.moveRequest)': pl.json, 'Re-read booking (move)': { after: { ...BK, appointment_date: soon, ends_at: soon } } } });
  assert.equal(ans.json.body.moved, true, JSON.stringify(ans.json));
});
