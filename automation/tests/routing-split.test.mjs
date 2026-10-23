// Test leads vs real leads (Jono, 23 Oct 2026): "all the test information must still go to the test email. But any new and real
// clients coming through must go through to Mark's calendar." automation/lib/routing-split.mjs + every broker-selection point:
// W01 decide (page / lead ad) and its consent-mode broker, W01 Lead core routeExisting (+ after the disclosure), W39 preview pick
// and confirm (pickAdviser via routingFor), W03 "Load context" (SQL, parameters from the hand-off node).
// Rule: with SMC_TEST_BROKER_IDS set, a test lead (leads.is_synthetic, a SYNTHETIC_TEST_NUMBERS or SMC_TEST_PHONES number) goes
// only to a test practice and a real lead never to one; an empty pool holds the lead exactly like "no routable broker".
// With SMC_TEST_BROKER_IDS unset, routing is exactly as before.
// Run: node --test automation/tests/routing-split.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCode, NOT_RUN, ifBranch, evalParam } from './_n8ncode.mjs';
import { lead } from './_harness.mjs';
import * as TR from '../lib/routing-split.mjs';
import * as W01 from '../lib/w01.mjs';
import * as W39 from '../lib/w39.mjs';

const wf = (id) => JSON.parse(readFileSync(new URL(`../${id}.json`, import.meta.url), 'utf8'));
const WF01 = wf('W01');
const WF03 = wf('W03');
const WF39 = wf('W39');

const BRAND = '00000000-0000-4000-8000-0000000005c1';
const TEST_ID = 'f688380e-fb68-4bfc-a9ee-4bf37ce76dcc'; // the test practice ("Mark Weston", Jono's test mailbox)
const REAL_ID = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6'; // Mark
const PRACTICE = 'Synthetic Test Advisory (TEST ONLY)'; // both rows name the same practice + FSP, as live (one firm, two rows)
const FSP = 'TEST-00000';
const CONSENT = `I agree that SortMyCover may share my details with ${PRACTICE} (FSP ${FSP}), an authorised financial services provider.`;
const REAL_PHONE = '+27825550101'; // a client: on no list
const TESTER = '+27825550199'; // Jono / KG: SMC_TEST_PHONES (really sent to)
const SMOKE = '+27600000921'; // wa-smoke.sh: SYNTHETIC_TEST_NUMBERS (never sent to)

// The test practice has the lower fill ratio, so with the rule OFF it wins every pick: the 23 Oct live bug (a real ad lead
// pinned to the test practice) is the "unchanged" baseline, and the rule ON must move real leads to Mark.
const broker = (id, extra = {}) => ({ id, broker_id: id, brand_id: BRAND, status: 'active', routing_on: true, active: true, bookings_paused: false,
  practice_name: PRACTICE, firm_name: PRACTICE, fsp_number: FSP, consent_mode: 'named', methods_supported: ['teams', 'phone'],
  accepts_low_budget: false, handles_wills: false, adviser_name: 'Mark Weston', contact_person: 'Mark Weston',
  order_capacity: 20, order_attached: id === TEST_ID ? 0 : 10, order_remaining: id === TEST_ID ? 20 : 10, ...extra });
const BOTH = [broker(TEST_ID), broker(REAL_ID)];
const ONLY_TEST = [broker(TEST_ID)];
const ONLY_REAL = [broker(REAL_ID)];

const ON = { SMC_TEST_BROKER_IDS: TEST_ID, SMC_TEST_PHONES: '+27 82 555 0199, +27 83 000 0000', SYNTHETIC_TEST_NUMBERS: '+27600000921' };
const OFF = { SMC_TEST_PHONES: ON.SMC_TEST_PHONES, SYNTHETIC_TEST_NUMBERS: ON.SYNTHETIC_TEST_NUMBERS }; // lists set, rule off

// ============================================================================================ lib/routing-split.mjs
test('isTestLead: is_synthetic (boolean, t, true), a SYNTHETIC_TEST_NUMBERS number, an SMC_TEST_PHONES number in any format', () => {
  for (const v of [true, 't', 'true']) assert.equal(TR.isTestLead({ phone: REAL_PHONE, is_synthetic: v }, ON), true, String(v));
  for (const v of [false, 'f', null, undefined]) assert.equal(TR.isTestLead({ phone: REAL_PHONE, is_synthetic: v }, ON), false, String(v));
  assert.equal(TR.isTestLead({ phone: SMOKE }, ON), true, 'SYNTHETIC_TEST_NUMBERS');
  // digits only, the same normalisation as SYNTHETIC_TEST_NUMBERS: +27 / spaces / dashes / no plus all match
  for (const p of ['+27825550199', '+27 82 555 0199', '27825550199', '+27-82-555-0199', 'whatsapp:+27825550199']) assert.equal(TR.isTestLead({ phone: p }, ON), true, p);
  for (const p of ['+27825550101', '', null, '0199', '+27825550198']) assert.equal(TR.isTestLead({ phone: p }, ON), false, String(p));
  assert.equal(TR.isTestLead({ phone: TESTER }, { SMC_TEST_PHONES: '27825550199;27830000000' }), true, '; separated');
  assert.equal(TR.isTestLead(null, ON), false);
});

test('isTestBroker / routingPool: ids are case-insensitive; SMC_TEST_BROKER_IDS unset, empty or blank = no pool (rule off)', () => {
  assert.equal(TR.isTestBroker({ broker_id: TEST_ID.toUpperCase() }, ON), true);
  assert.equal(TR.isTestBroker({ id: TEST_ID }, { SMC_TEST_BROKER_IDS: ` ${TEST_ID.toUpperCase()} , x` }), true);
  assert.equal(TR.isTestBroker(TEST_ID, ON), true, 'bare id');
  assert.equal(TR.isTestBroker({ id: REAL_ID }, ON), false);
  assert.equal(TR.isTestBroker({}, ON), false);
  for (const env of [{}, OFF, { SMC_TEST_BROKER_IDS: '' }, { SMC_TEST_BROKER_IDS: ' , ' }, undefined]) {
    assert.equal(TR.routingPool({ phone: TESTER, is_synthetic: true }, env), null, JSON.stringify(env));
  }
  assert.deepEqual(TR.routingPool({ phone: REAL_PHONE }, ON), { test: false, test_broker_ids: [TEST_ID] });
  assert.deepEqual(TR.routingPool({ phone: TESTER }, ON), { test: true, test_broker_ids: [TEST_ID] });
  // inPool / poolBrokers: no pool keeps everyone; a pool splits them
  assert.deepEqual(TR.poolBrokers(BOTH, null), BOTH);
  assert.deepEqual(TR.poolBrokers(BOTH, TR.routingPool({ phone: REAL_PHONE }, ON)).map((b) => b.id), [REAL_ID]);
  assert.deepEqual(TR.poolBrokers(BOTH, TR.routingPool({ phone: TESTER }, ON)).map((b) => b.id), [TEST_ID]);
  assert.equal(TR.inPool({ id: TEST_ID.toUpperCase() }, { test: true, test_broker_ids: [TEST_ID] }), true);
});

test('w01 / w39 re-export the pool helpers the Code nodes call (L.routingPool, L.inPool)', () => {
  assert.equal(W01.routingPool, TR.routingPool);
  assert.equal(W01.inPool, TR.inPool);
  assert.equal(W39.routingPool, TR.routingPool);
});

// ============================================================================================ lib/w01.mjs pickBroker / routingFor
test('pickBroker: test lead -> test practice only, real lead -> real adviser only, never a fall-through either way', () => {
  const real = TR.routingPool({ phone: REAL_PHONE }, ON);
  const tester = TR.routingPool({ phone: TESTER }, ON);
  const synth = TR.routingPool({ phone: REAL_PHONE, is_synthetic: true }, ON);
  assert.equal(W01.pickBroker(BOTH, BRAND, 'B', null, real).broker_id, REAL_ID);
  assert.equal(W01.pickBroker(BOTH, BRAND, 'B', null, tester).broker_id, TEST_ID);
  assert.equal(W01.pickBroker(BOTH, BRAND, 'B', null, synth).broker_id, TEST_ID);
  assert.equal(W01.pickBroker(ONLY_TEST, BRAND, 'B', null, real), null, 'real lead never falls through to the test practice');
  assert.equal(W01.pickBroker(ONLY_REAL, BRAND, 'B', null, tester), null, 'test lead never falls through to Mark');
  // nobody in the pool = the same hold as no capacity (and tier C / wills keep their own hold reasons)
  assert.deepEqual(W01.routingFor(CONSENT, 'named', ONLY_TEST, BRAND, 'B', null, real), { held: 'held_no_capacity' });
  assert.deepEqual(W01.routingFor(CONSENT, 'named', ONLY_REAL, BRAND, 'B', null, tester), { held: 'held_no_capacity' });
  assert.deepEqual(W01.routingFor(CONSENT, 'named', ONLY_TEST, BRAND, 'C', null, real), { held: 'held_low_budget' });
  assert.deepEqual(W01.routingFor(CONSENT, 'named', ONLY_TEST, BRAND, 'B', 'wills', real), { held: 'held_no_wills_broker' });
  assert.equal(W01.routingFor(CONSENT, 'named', BOTH, BRAND, 'B', null, real).broker.broker_id, REAL_ID);
});

test('SMC_TEST_BROKER_IDS unset: every pick is exactly what it was before the rule (same broker, same hold, same reason)', () => {
  const lists = [BOTH, ONLY_TEST, ONLY_REAL, [broker(REAL_ID, { order_attached: 0, order_remaining: 20 }), broker(TEST_ID)], []];
  for (const brokers of lists) for (const tier of ['A', 'B', 'C', null]) for (const product of [null, 'life_cover', 'wills'])
    for (const l of [{ phone: REAL_PHONE }, { phone: TESTER }, { phone: SMOKE }, { phone: REAL_PHONE, is_synthetic: true }]) {
      const pool = TR.routingPool(l, OFF);
      assert.equal(pool, null);
      assert.deepEqual(W01.pickBroker(brokers, BRAND, tier, product, pool), W01.pickBroker(brokers, BRAND, tier, product));
      assert.deepEqual(W01.routingFor(CONSENT, 'named', brokers, BRAND, tier, product, pool), W01.routingFor(CONSENT, 'named', brokers, BRAND, tier, product));
    }
  // and the baseline itself: rule off, a real lead goes to the test practice (the 23 Oct bug the rule fixes)
  assert.equal(W01.pickBroker(BOTH, BRAND, 'B', null, TR.routingPool({ phone: REAL_PHONE }, OFF)).broker_id, TEST_ID);
});

// ============================================================================================ W01.json Decide (page / lead ad)
const ENV01 = { TEST_HOOKS_ENABLED: 'false', LEAD_TOKEN_SECRET: 'routing-split-test-secret-0123456789abcdef', BRAND_ID: BRAND, PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za' };
/** The real W01 node sequence for one page lead: Screen -> (Turnstile IF) -> Guard -> Decide, with the brokers the Context query loaded. */
async function pageDecide(phone, brokers, env) {
  const e = { ...ENV01, ...env };
  const body = { ...lead('L01').submission, mobile: phone, consent: { ...lead('L01').submission.consent, text: CONSENT, version: 'CONSENT-NAMED-v3' } };
  const [s] = await runCode(WF01, 'Screen (w01.normaliseSubmission + screen)', { json: { headers: { origin: 'https://sortmycover.co.za' }, body }, env: e });
  assert.equal(s.json.scr.ok, true, JSON.stringify(s.json.scr));
  const ctx = { brand_uuid: BRAND, ip_hits: 0, number_hits: 0, prior: null, suppressed: false, brokers };
  const needed = ifBranch(WF01, 'Turnstile check needed? (page, secret set, not a test hook)', { json: ctx, env: e, refs: { 'Screen passed?': s.json } });
  const [g] = await runCode(WF01, 'Guard (w01.guard) + Lookup needed?', { json: ctx, items: [ctx], env: e,
    refs: { 'Screen passed?': s.json, 'Context: counters, prior lead, suppression, brokers': ctx, 'Turnstile check needed? (page, secret set, not a test hook)': needed ? ctx : NOT_RUN } });
  assert.equal(g.json.g.ok, true);
  const [d] = await runCode(WF01, 'Decide (w01.decide) + lead_token', { json: g.json, env: e, refs: { 'Guard passed?': g.json } });
  return d.json.decision;
}

test('W01 Decide node: real client -> Mark, tester / smoke number -> the test practice; no fall-through; env unset unchanged', async () => {
  assert.equal((await pageDecide(REAL_PHONE, BOTH, ON)).row.broker_id, REAL_ID);
  assert.equal((await pageDecide('082 555 0199', BOTH, ON)).row.broker_id, TEST_ID, 'SMC_TEST_PHONES, local format on the page');
  assert.equal((await pageDecide(SMOKE, BOTH, ON)).row.broker_id, TEST_ID, 'SYNTHETIC_TEST_NUMBERS');
  const realHeld = await pageDecide(REAL_PHONE, ONLY_TEST, ON);
  assert.equal(realHeld.outcome, 'held');
  assert.equal(realHeld.row.broker_id ?? null, null);
  assert.equal(realHeld.row.routing_reason, 'held_no_capacity', 'the normal "no routable broker" hold');
  const testHeld = await pageDecide(TESTER, ONLY_REAL, ON);
  assert.equal(testHeld.outcome, 'held');
  assert.equal(testHeld.row.routing_reason, 'held_no_capacity');
  // rule off: exactly today's pick (the test practice wins on fill ratio), for every number
  for (const p of [REAL_PHONE, TESTER, SMOKE]) assert.equal((await pageDecide(p, BOTH, OFF)).row.broker_id, TEST_ID, p);
});

test('W01 Decide node: the consent-mode broker (selection point "routable") is taken from the lead\'s own pool', async () => {
  // the test practice set to generic consent: before the rule a real lead read ITS consent mode and was held for disclosure
  const brokers = [broker(TEST_ID, { consent_mode: 'generic' }), broker(REAL_ID)];
  const on = await pageDecide(REAL_PHONE, brokers, ON);
  assert.equal(on.row.consent_mode, 'named');
  assert.equal(on.row.broker_id, REAL_ID);
  const off = await pageDecide(REAL_PHONE, brokers, OFF);
  assert.equal(off.row.consent_mode, 'generic', 'rule off: unchanged (the first active broker in the list)');
});

// ============================================================================================ W01.json Lead core (W03 / W39 route)
const ctwaLead = (extra = {}) => ({ id: '11111111-1111-4111-8111-111111111111', brand_id: BRAND, origin: 'ctwa', broker_id: null, routed_at: null, opted_out_at: null,
  disqualified_reason: null, consent_text: CONSENT, consent_mode: 'named', consent_text_version: 'ctwa-named-v3', routing_reason: null, budget_band: '750_1499',
  phone: REAL_PHONE, first_name: 'Cyrus', product_interest: null, is_synthetic: false, suppressed: false, disclosed: [], window_open: true, ...extra });
const route = async (l, brokers, env, extra = {}) => (await runCode(WF01, 'Route (w01.routeExisting)', { items: [{ lead: l, brokers, first_touch: true, expect_broker_id: null, hold_only: false, ...extra }], env }))[0].json.r;

test('W01 Lead core Route node: real CTWA lead -> Mark only; is_synthetic / tester lead -> test practice only; env unset unchanged', async () => {
  assert.equal((await route(ctwaLead(), BOTH, ON)).update.broker_id, REAL_ID);
  assert.equal((await route(ctwaLead({ is_synthetic: true }), BOTH, ON)).update.broker_id, TEST_ID, 'leads.is_synthetic');
  assert.equal((await route(ctwaLead({ phone: TESTER }), BOTH, ON)).update.broker_id, TEST_ID, 'SMC_TEST_PHONES');
  assert.deepEqual(await route(ctwaLead(), ONLY_TEST, ON), { action: 'held', update: { routing_reason: 'held_no_capacity' }, notice: null });
  assert.deepEqual(await route(ctwaLead({ phone: TESTER }), ONLY_REAL, ON), { action: 'held', update: { routing_reason: 'held_no_capacity' }, notice: null });
  assert.equal((await route(ctwaLead(), BOTH, OFF)).update.broker_id, TEST_ID, 'rule off: unchanged');
  // W39 confirm: W01 routes only the adviser the page showed; a test practice id for a real lead is never routed
  assert.equal((await route(ctwaLead(), BOTH, ON, { first_touch: false, expect_broker_id: TEST_ID })).reason, 'broker_changed');
  assert.equal((await route(ctwaLead(), BOTH, ON, { first_touch: false, expect_broker_id: REAL_ID })).update.broker_id, REAL_ID);
});

test('W01 Lead core: Route after the disclosure uses the same pool; the load SQL reads leads.is_synthetic', async () => {
  const l = ctwaLead({ consent_mode: 'generic', consent_text_version: 'CTWA-GENERIC-v4' });
  const load = { lead: l, brokers: BOTH, first_touch: true, expect_broker_id: null, hold_only: false };
  const [after] = await runCode(WF01, 'Route after the disclosure (w01.routeExisting)', { items: [{ broker_id: REAL_ID }], env: ON, refs: { 'Load CTWA lead + brokers': load } });
  assert.equal(after.json.r.update.broker_id, REAL_ID);
  const [held] = await runCode(WF01, 'Route after the disclosure (w01.routeExisting)', { items: [{ broker_id: TEST_ID }], env: ON, refs: { 'Load CTWA lead + brokers': { ...load, brokers: ONLY_TEST } } });
  assert.equal(held.json.r.action, 'held');
  assert.match(WF01.nodes.find((n) => n.name === 'Load CTWA lead + brokers').parameters.query, /\bl\.is_synthetic\b/);
});

// ============================================================================================ W39 (/start/ preview + confirm)
const startLead = (extra = {}) => ({ ...ctwaLead({ origin: 'page', consent_mode: 'generic', consent_text_version: 'CONSENT-GENERIC-v5web' }), erased: false, conv_state: {}, ...extra });

test('W39 Adviser step (both chains) + GET /start view: the card shown is the lead\'s own pool; env unset unchanged', async () => {
  const plan = { kind: 'work', cover: true, confirm_adviser: null };
  for (const [node, decide] of [['Adviser step (w39.coverStep)', 'Decide (w39.decideAnswers)'], ['Adviser step (w39.coverStep) [adviser]', 'Decide (w39.decideAdviser)']]) {
    const step = async (l, brokers, env) => (await runCode(WF39, node, { json: { lead: l, brokers }, env, refs: { [decide]: { lead_id: l.id, plan } } }))[0].json.step;
    assert.equal((await step(startLead(), BOTH, ON)).adviser.id, REAL_ID, node);
    assert.equal((await step(startLead({ phone: TESTER }), BOTH, ON)).adviser.id, TEST_ID, node);
    assert.equal((await step(startLead({ is_synthetic: true }), BOTH, ON)).adviser.id, TEST_ID, node);
    const none = await step(startLead(), ONLY_TEST, ON);
    assert.equal(none.next, 'chat', 'real lead, only the test practice: no card, a hold (never the test practice)');
    assert.deepEqual(none.steps, ['hold']);
    assert.equal((await step(startLead(), BOTH, OFF)).adviser.id, TEST_ID, 'rule off: unchanged');
  }
  const view = async (l, env) => (await runCode(WF39, 'View (w39.startView)', { json: { lead: l, broker: null, brokers: BOTH, booking: null }, env }))[0].json.body.adviser;
  assert.equal((await view(startLead(), ON)).id, REAL_ID);
  assert.equal((await view(startLead({ phone: TESTER }), ON)).id, TEST_ID);
  assert.equal((await view(startLead(), OFF)).id, TEST_ID);
  // the lead rows those nodes read carry the phone and is_synthetic
  const pick = WF39.nodes.find((n) => n.name === 'Load lead + brokers (pick)').parameters.query;
  assert.match(pick, /l\.phone, l\.is_synthetic/);
  assert.match(WF39.nodes.find((n) => n.name === 'Load lead, adviser, live booking').parameters.query, /'is_synthetic', p\.is_synthetic/);
});

// ============================================================================================ W03 Load context (CTWA first contact)
test('W03 hand-off node -> Load context parameters: is_test + the test ids; SQL splits the pool, numbering intact; env unset = no filter', async () => {
  const handoff = async (from, env, extra = {}) => (await runCode(WF03, 'W07 hand-off -> Cloud API message', {
    items: [{ source: 'W07', msg: { wamid: 'wamid.RS1', from, type: 'text', text: 'Hi', at_ms: Date.parse('2026-10-23T10:00:00+02:00'), phone_number_id: '27600156480' }, lead: null, ...extra }], env }))[0].json;
  const params = (j) => evalParam(WF03, 'Load context', 'options.queryReplacement', { json: j });
  const real = await handoff(REAL_PHONE, ON);
  assert.equal(real.is_test, false);
  assert.deepEqual(params(real), ['27600156480', REAL_PHONE, '', 'false', TEST_ID]);
  assert.deepEqual(params(await handoff(TESTER, ON)).slice(3), ['true', TEST_ID]);
  assert.deepEqual(params(await handoff(SMOKE, ON)).slice(3), ['true', TEST_ID]);
  assert.deepEqual(params(await handoff(REAL_PHONE, ON, { lead: { id: 'x', is_synthetic: true } })).slice(3), ['true', TEST_ID]);
  assert.deepEqual(params(await handoff(TESTER, OFF)).slice(3), ['false', ''], 'rule off: empty id list = the SQL filter is off');
  const q = WF03.nodes.find((n) => n.name === 'Load context').parameters.query;
  const used = new Set([...q.replace(/--[^\n]*/g, '').matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  assert.deepEqual([...used].sort(), [1, 2, 3, 4, 5], 'five parameters, five values');
  assert.match(q, /AND \(coalesce\(\$5, ''\) = '' OR \(b\.id::text = ANY \(string_to_array\(lower\(\$5\), ','\)\)\) = \(coalesce\(\$4, ''\) = 'true' OR coalesce\(ol\.is_synthetic, false\)\)\)/);
  assert.match(q, /SELECT l\.id, l\.is_synthetic FROM public\.leads l/);
});

// ============================================================================================ review 23 Oct 2026
// A tester or smoke number typed in SA local form ('082 ...') or with 00, or an id list with quotes, must not silently flip a
// lead or a broker to the other side; the W03 synthetic flag reads SYNTHETIC_TEST_NUMBERS the same way; CAPI skips testers.
test('review: SA local / 00 / spaced numbers on either list or on the lead match the same E.164 number, nothing wider', async () => {
  const { e164Digits, isSyntheticNumber } = await import('../lib/wa.mjs');
  for (const [v, d] of [['0825550199', '27825550199'], ['082 555 0199', '27825550199'], ['0027825550199', '27825550199'], ['+27825550199', '27825550199'],
    ['whatsapp:+27825550199', '27825550199'], ['825550199', '825550199'], ['08255501990', '08255501990'], ['', '']]) assert.equal(e164Digits(v), d, v);
  for (const list of ['0825550199', '082 555 0199', '0027825550199', '+27 82 555 0199', '27825550199', '082 555 0199; 0830000000', '0825550199 0830000000']) {
    const env = { SMC_TEST_BROKER_IDS: TEST_ID, SMC_TEST_PHONES: list };
    for (const p of [TESTER, '0825550199', '27825550199']) assert.equal(TR.isTestLead({ phone: p }, env), true, `${list} / ${p}`);
    assert.equal(TR.isTestLead({ phone: REAL_PHONE }, env), false, `${list}: a real number stays real`);
    assert.deepEqual(TR.poolBrokers(BOTH, TR.routingPool({ phone: TESTER }, env)).map((b) => b.id), [TEST_ID], `${list}: tester -> test practice, never Mark`);
  }
  for (const list of ['0600000921', '060 000 0921', '+27 60 000 0921', '27600000921']) {
    assert.equal(isSyntheticNumber(SMOKE, { SYNTHETIC_TEST_NUMBERS: list }), true, list);
    assert.equal(TR.isTestLead({ phone: SMOKE }, { SYNTHETIC_TEST_NUMBERS: list }), true, list);
  }
  assert.equal(isSyntheticNumber('+27600000922', { SYNTHETIC_TEST_NUMBERS: '0600000921' }), false, 'exact number only');
  assert.deepEqual(TR.testPhoneDigits({ SMC_TEST_PHONES: '082 555 0199, +27825550199', SYNTHETIC_TEST_NUMBERS: '0600000921' }), ['27600000921', '27825550199']);
});

test('review: SMC_TEST_BROKER_IDS with quotes (whole value or each id) still names the test practice', () => {
  for (const v of [`"${TEST_ID}"`, `'${TEST_ID}'`, `"${TEST_ID},${'0'.repeat(8)}-0000-4000-8000-000000000000"`, `"${TEST_ID}", "x"`]) {
    assert.equal(TR.isTestBroker({ id: TEST_ID }, { SMC_TEST_BROKER_IDS: v }), true, v);
    assert.deepEqual(TR.poolBrokers(BOTH, TR.routingPool({ phone: REAL_PHONE }, { SMC_TEST_BROKER_IDS: v })).map((b) => b.id), [REAL_ID], `${v}: real lead -> Mark`);
  }
});

test('review: W03 step stores is_synthetic for a SYNTHETIC_TEST_NUMBERS number in any format, never for a tester (their sends are real)', async () => {
  const require = (await import('node:module')).createRequire(import.meta.url);
  const W3 = require('../ctwa/w03.js');
  const b = broker(TEST_ID);
  const thread = { stage: 'await_consent', origin: { origin: 'ctwa' }, consent: W3.consentFor('named', b), answers: {}, first_at: '2026-10-23T10:00:00+02:00', broker_id: TEST_ID };
  const ctxRow = { brand_id: BRAND, broker: b, existing_open_lead_id: null, lead: null, suppressed: false, thread, new_lead_id: '11111111-2222-4333-8444-555555555555' };
  const syn = async (mobile, env) => {
    const ad = { msg: { from: mobile.slice(1), id: 'RS2', timestamp: '1792310060', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, at: '2026-10-23T10:01:00+02:00', mobile, profile_name: 'T', external_id: 'RS2', hops: 0 };
    const [st] = await runCode(WF03, 'W03 step', { items: [ctxRow], env, refs: { 'W07 hand-off -> Cloud API message': ad } });
    return st.json.actions.find((a) => a.kind === 'insert_lead').row.is_synthetic;
  };
  assert.equal(await syn(SMOKE, { SYNTHETIC_TEST_NUMBERS: '060 000 0921' }), true, 'local-form list entry');
  assert.equal(await syn(SMOKE, ON), true);
  assert.equal(await syn(TESTER, ON), false, 'a tester is a test lead for routing, but never stored synthetic (that would dry-run his sends)');
  assert.equal(await syn(REAL_PHONE, ON), false);
  assert.match(WF03.nodes.find((n) => n.name === 'W03 step').parameters.jsCode, /WAL\.isSyntheticNumber\(m\.mobile, \$env\)/);
});

test('review: SUB-capi-send skips a tester\'s lead like a synthetic one (CAPI_SYNTHETIC_TEST_EVENT_CODE still marks it a test event)', async () => {
  const CAPI = await import('../lib/sub-capi-send.mjs');
  const n = CAPI.normalise({ event_name: 'Lead', event_id: 'l:rs', action_source: 'system_generated', lead_id: '00000000-0000-0000-0000-0000000000a9', brand_id: BRAND });
  const ctx = (phone) => ({ found: true, consent_ads_at: '2026-10-23T10:00:00Z', phone, pixel_id: 'px', dataset_id: 'ds', duplicate: false, is_synthetic: false });
  const env = { DRY_RUN_SENDS: 'false', SMC_TEST_PHONES: '082 555 0199' };
  assert.equal(CAPI.build(n, ctx(TESTER), env).reason, 'synthetic_lead');
  assert.equal(CAPI.build(n, ctx(REAL_PHONE), env).action, 'send', 'a real lead still goes');
  assert.equal(CAPI.build(n, ctx(TESTER), { DRY_RUN_SENDS: 'false' }).action, 'send', 'SMC_TEST_PHONES unset: unchanged');
  const marked = CAPI.build(n, ctx(TESTER), { ...env, CAPI_SYNTHETIC_TEST_EVENT_CODE: 'TESTE2E' });
  assert.equal(marked.action, 'send'); assert.equal(marked.body.test_event_code, 'TESTE2E');
});
