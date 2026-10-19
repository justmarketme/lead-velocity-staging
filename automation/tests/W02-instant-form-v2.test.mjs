// Meta instant form v2 (18 Oct 2026, A/B arm vs click-to-WhatsApp): deliverables/media-buyer/instant-form-spec-v2.json.
// The form mirrors /start/ (intent, age band, cover today, first name, WhatsApp number), every age is accepted
// (lib/w01.mjs OUT_OF_BAND_AGE_BOOKS, as W39), the first WhatsApp is the start_here template to /start/ (19 Oct 2026; before
// its SID is set: qualify_budget < 60 s, the older tests below), and the
// required consent box is exactly the CONSENT-NAMED-v5web registry text for Mark's practice.
// Offline, real code: the W02 Code nodes (signature + Graph fetch, Graph stubbed), meta-ads normalizeLead / qualifyLead,
// the W01 "Lead ad -> submission" node, w01 normaliseLeadAd / withRegistryText / consentAudit / decide / budgetQuestion,
// and W03 (ctwa/w03.js) for the band tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeNode, nodeRequire, runCode, ifBranch } from './_n8ncode.mjs';
import * as W01 from '../lib/w01.mjs';
import * as W39 from '../lib/w39.mjs';

const require = createRequire(import.meta.url);
const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(A, '..');
const M = require('../ads/meta-ads.js');
const W3 = require('../ctwa/w03.js');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FX = json(join(A, 'tests', 'fixtures', 'instant-form-v2.json'));
const SPEC = json(join(ROOT, 'deliverables', 'media-buyer', 'instant-form-spec-v2.json'));
const SITE_CONSENT = json(join(ROOT, 'sites', 'sortmycover', 'config', 'consent.json'));
const W02 = json(join(A, 'W02.json'));
const W01WF = json(join(A, 'W01.json'));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const OPW = { id: '00000000-0000-4000-8000-0000000b0001', broker_id: '00000000-0000-4000-8000-0000000b0001', brand_id: 'smc', status: 'active', routing_on: true, active: true,
  practice_name: 'Oracle Private Wealth', fsp_number: '28418', consent_mode: 'named', methods_supported: ['teams', 'phone'], order_remaining: 10, order_capacity: 20, order_attached: 10 };
const LEAD_ID = '00000000-0000-4000-8000-0000000a0201';
const NOW = Date.parse('2026-10-18T14:00:30+02:00');
const ctx = (over = {}) => ({ now: NOW, line_type: 'mobile', mobile: '+27600000201', lead_id: LEAD_ID, brand_id: 'smc', brokers: [OPW], consent_mode: 'named', ...over });
const lead = (k) => FX.graph_leads[k];
/** What W01 "Decide" does with a lead-ad submission: fill the registry text with the routable broker, then decide. */
const decideOf = (sub, c = ctx()) => W01.decide(W01.withRegistryText(sub, OPW), c);

// ------------------------------------------------------------------------------------------- the spec itself
test('spec v2: exact strings, question order and keys, no banned words in anything the person sees', () => {
  assert.equal(SPEC.intro.headline.text, 'Book a 30-minute call with an authorised adviser');
  assert.deepEqual(SPEC.questions_section.questions.map((q) => q.key), ['smc_intent', 'smc_age_band', 'smc_has_cover', 'first_name', 'phone_number']);
  const [qi, qa, qc] = SPEC.questions_section.questions;
  assert.deepEqual(qi.options.map((o) => [o.key, o.value]), [['life', 'Life cover'], ['disability', 'Disability cover'], ['income', 'Income protection'], ['illness', 'Severe illness cover'], ['review', 'Not sure yet']]);
  assert.deepEqual(qa.options.map((o) => [o.key, o.value]), [['lt35', 'Under 35'], ['35_44', '35 to 44'], ['45_50', '45 to 50'], ['51plus', 'Over 50']]);
  assert.deepEqual(qc.options.map((o) => [o.key, o.value]), [['yes_work', 'Yes, through work'], ['yes_own', 'Yes, my own'], ['no', 'No'], ['unsure', 'Not sure']]);
  assert.equal(qc.label.text, 'Do you have any life, disability or income cover now?');
  assert.equal(SPEC.questions_section.questions[4].label.text, 'WhatsApp number');
  // the option labels are W01's own vocabulary (a hand-built form is matched on them)
  for (const o of qi.options) assert.equal(W01.LEAD_AD_INTENT[o.key].label, o.value);
  for (const o of qa.options) assert.equal(W01.LEAD_AD_AGE[o.key], o.value);
  for (const o of qc.options) assert.equal(W01.LEAD_AD_HAS_COVER[o.key], o.value);
  // every visible string: chars is right, no banned word; "Lead Velocity" only inside the verbatim consent text
  const seen = [];
  const walk = (v, path) => {
    if (v && typeof v === 'object' && typeof v.text === 'string' && typeof v.chars === 'number') { assert.equal([...v.text].length, v.chars, path); seen.push([path, v.text]); }
    if (v && typeof v === 'object' && typeof v.value === 'string' && typeof v.chars === 'number') { assert.equal([...v.value].length, v.chars, path); seen.push([path, v.value]); }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== '_meta' && k !== 'sources' && k !== 'disclosure_check') walk(x, `${path}.${k}`);
  };
  walk(SPEC, 'spec');
  assert.ok(seen.length >= 25, `visible strings found: ${seen.length}`);
  for (const [path, t] of seen) {
    assert.doesNotMatch(t, /\bfree\b|costs nothing|no cost|licensed|\bAI\b|Capital Legacy/i, path);
    if (!path.includes('custom_disclaimer.checkboxes')) assert.doesNotMatch(t, /Lead Velocity/, path);
    assert.doesNotMatch(t, /\bR\d|budget|income\b(?! protection| cover)|salary|afford/i, `${path}: no financial question`);
  }
  assert.ok(!SPEC.questions_section.questions.some((q) => /email/i.test(q.meta_type)), 'no email');
  assert.equal(SPEC.form_settings.form_type.ui, 'Higher intent');
  assert.deepEqual([SPEC.privacy_policy.url, SPEC.privacy_policy.link_text], ['https://sortmycover.co.za/privacy/', 'Privacy notice']);
  assert.deepEqual([SPEC.thank_you.headline.text, SPEC.thank_you.description.text, SPEC.thank_you.button.text.text, SPEC.thank_you.button.url],
    ['Check WhatsApp', 'Lindi will send you a Start here link on WhatsApp in a moment. Tap it to pick a time for your call.', 'Chat on WhatsApp', 'https://wa.me/27600156480']); // 19 Oct 2026: the next step is the start_here template
  assert.equal(SPEC.intro.description_bullets[1].text, 'Lindi from SortMyCover sends you a Start here link on WhatsApp.');
  assert.ok(SPEC.sources.length >= 4 && SPEC.sources.every((s) => /^https:\/\//.test(s.url)));
});

test('spec v2: the consent boxes are the registry texts word for word (required named box, optional ads box, both unticked)', () => {
  const [c1, c2] = SPEC.custom_disclaimer.checkboxes;
  assert.deepEqual([c1.key, c1.required, c1.ticked_by_default, c1.consent_version], ['consent', true, false, 'CONSENT-NAMED-v5web']);
  assert.deepEqual([c2.key, c2.required, c2.ticked_by_default, c2.consent_version], ['consent_ads', false, false, 'CONSENT-ADS-v2web']);
  const reg = W01.consentRegistry(OPW);
  assert.equal(c1.text, reg[c1.consent_version], 'what the form shows = what W01 stores and audits');
  // and both equal the site's own config (sites/sortmycover/config/consent.json), filled for Mark's practice
  assert.equal(c1.text, SITE_CONSENT.named.text.replace('{practice_name}', 'Oracle Private Wealth').replace('{fsp_number}', '28418'));
  assert.equal(c2.text, SITE_CONSENT.ads.text);
  assert.equal(SITE_CONSENT.named.version, W01.LEAD_AD_CONSENT_VERSION);
  assert.match(c1.text, /Oracle Private Wealth \(FSP 28418\)/);
  assert.ok(W01.namesPractice(c1.text, OPW), 'named-mode routing accepts it');
  for (const c of SPEC.custom_disclaimer.checkboxes) assert.doesNotMatch(c.text, /\{practice_name\}|\{fsp_number\}/, 'no placeholder left');
});

// ------------------------------------------------------------------------------------------- normalisation
test('normaliseLeadAd: every option, as its key or its label, maps to the /start/ code and the W01 HELP_WITH code', () => {
  const sub = (fields) => W01.normaliseLeadAd({ ...lead('keys_in_band'), field_data: Object.entries(fields).map(([name, v]) => ({ name, values: [v] })).concat([{ name: 'phone_number', values: ['+27600000201'] }]) });
  const want = { life: ['life', 'life'], disability: ['income', 'disability_income'], income: ['income', 'disability_income'], illness: ['illness', 'severe_illness'], review: ['review', 'review'] };
  for (const [key, { label }] of Object.entries(W01.LEAD_AD_INTENT)) for (const v of [key, label, label.toUpperCase()]) {
    const s = sub({ smc_intent: v });
    assert.deepEqual([s.lead_ad.intent, s.lead_ad.intent_option, s.help_with, s.product_interest], [...want[key].slice(0, 1), key, want[key][1], 'life_cover'], v);
    assert.ok(W39.INTENTS.includes(s.lead_ad.intent) && W01.HELP_WITH.has(s.help_with), v);
    assert.equal(W39.HELP_WITH_OF[s.lead_ad.intent], key === 'disability' || key === 'income' ? 'disability_income' : s.help_with, 'same vocabulary as /start/');
  }
  for (const [code, label] of Object.entries(W01.LEAD_AD_AGE)) for (const v of [code, label]) {
    assert.equal(sub({ smc_age_band: v }).quiz.age_band, code, v);
    assert.ok(W39.AGE_BANDS.includes(code));
  }
  for (const [code, label] of Object.entries(W01.LEAD_AD_HAS_COVER)) for (const v of [code, label]) {
    assert.equal(sub({ smc_has_cover: v }).lead_ad.has_cover, code, v);
    assert.ok(W39.HAS_COVER.includes(code));
  }
  // an unknown answer is dropped, never guessed
  const odd = sub({ smc_intent: 'Car insurance', smc_age_band: '60', smc_has_cover: 'Maybe' });
  assert.deepEqual([odd.lead_ad, odd.help_with, odd.quiz.age_band], [null, null, null]);
});

test('normaliseLeadAd on the fixtures: keys, labels, a hand-built form (Meta field names + checkbox keys), consent and ads ticks', () => {
  const k = W01.normaliseLeadAd(lead('keys_in_band'));
  assert.deepEqual([k.first_name, k.mobile_raw, k.quiz.age_band, k.lead_ad.intent, k.lead_ad.intent_option, k.lead_ad.has_cover, k.help_with], ['Thandi', '+27600000201', '45_50', 'income', 'income', 'unsure', 'disability_income']);
  assert.deepEqual([k.consent.checked, k.consent.version, k.consent.ads, k.consent.ads_version, k.consent.source], [true, 'CONSENT-NAMED-v5web', true, 'CONSENT-ADS-v2web', 'lead_ad']);
  assert.deepEqual([k.context.leadgen_id, k.context.form_id, k.context.ad_id], ['lg_v2_0201', 'form_v2_01', 'ad_v2_01']);
  const u = W01.normaliseLeadAd(lead('under_35'));
  assert.deepEqual([u.quiz.age_band, u.lead_ad.intent, u.lead_ad.has_cover, u.consent.checked, u.consent.ads], ['lt35', 'life', 'no', true, false], 'ads box unticked -> no ads');
  const h = W01.normaliseLeadAd(lead('hand_built_over_50'));
  assert.deepEqual([h.quiz.age_band, h.lead_ad.intent, h.help_with, h.lead_ad.has_cover, h.consent.checked, h.consent.ads], ['51plus', 'illness', 'severe_illness', 'yes', true, false],
    'Meta keys: the ticked box is the consent; the ads choice is not assumed');
  // no tick on the required box -> no lead
  const none = W01.normaliseLeadAd({ ...lead('keys_in_band'), custom_disclaimer_responses: [{ checkbox_key: 'consent', is_checked: '' }, { checkbox_key: 'consent_ads', is_checked: '1' }] });
  assert.equal(W01.screen(none).reason, 'consent_required');
});

// ------------------------------------------------------------------------------------------- consent audit
test('consent audit: the stored text is the registry text for Mark (pass); an edited text fails', () => {
  const sub = W01.withRegistryText(W01.normaliseLeadAd(lead('keys_in_band')), OPW);
  const reg = W01.consentRegistry(OPW);
  assert.deepEqual(W01.consentAudit(sub, reg), { version: 'CONSENT-NAMED-v5web', known_version: true, matches_registry: true });
  assert.equal(sub.consent.text, SPEC.custom_disclaimer.checkboxes[0].text);
  const d = decideOf(W01.normaliseLeadAd(lead('keys_in_band')));
  assert.equal(d.row.consent_text, SPEC.custom_disclaimer.checkboxes[0].text, 'leads.consent_text = what the form showed');
  assert.ok(d.row.consent_ads_at, 'ads box ticked -> consent_ads_at');
  // wrong text: the form shows a different wording than the registry holds for that version
  const edited = { ...sub, consent: { ...sub.consent, text: sub.consent.text.replace('18 or older', '21 or older') } };
  assert.equal(W01.consentAudit(edited, reg).matches_registry, false);
  assert.equal(W01.consentAudit({ ...sub, consent: { ...sub.consent, text: sub.consent.text + ' ' } }, reg).matches_registry, false, 'one extra space fails');
  // a spec drift fails too: the hand-built form must be typed from the registry text
  assert.notEqual(SPEC.custom_disclaimer.checkboxes[0].text.replace('Oracle Private Wealth', 'Oracle Wealth'), reg['CONSENT-NAMED-v5web']);
  // a text naming another practice is never handed over to Mark (named mode holds it at the band tap's routing)
  const other = { ...OPW, practice_name: 'Other Practice', fsp_number: '99999' };
  const row = W01.decide(W01.withRegistryText(W01.normaliseLeadAd(lead('keys_in_band')), other), ctx()).row;
  assert.deepEqual(W01.routeExisting({ ...row, budget_band: '1500_plus' }, { brokers: [OPW], now: NOW }), { action: 'held', update: { routing_reason: 'held_consent_names_other_practice' }, notice: null });
});

// ------------------------------------------------------------------------------------------- intake decisions
test('decide: in band -> stored unrouted, answers in conv_state like /start/, first touch = qualify_budget within 60 s', () => {
  const d = decideOf(W01.normaliseLeadAd(lead('keys_in_band')));
  assert.deepEqual([d.outcome, d.row.routing_reason, d.row.broker_id, d.row.stage, d.row.disqualified_reason, d.row.product_interest, d.row.age_band],
    ['budget_pending', 'held_budget_pending', null, 'new', null, 'life_cover', '45_50']);
  assert.equal(d.row.conv_state.state, 'q_budget');
  assert.equal(d.row.conv_state.help_with, 'disability_income');
  assert.deepEqual({ ...d.row.conv_state.start, at: undefined }, { intent: 'income', intent_option: 'income', has_cover: 'unsure', form_id: 'form_v2_01', at: undefined, via: 'lead_ad' });
  assert.equal(d.row.conv_state.age_accepted, undefined);
  assert.ok(!d.activities.some((a) => a.activity_type === 'lead_ad_age_out_of_band'));
  assert.equal(d.row.qualified_at, undefined, 'never qualified at intake');
  // the first touch: W03 ask_budget, not before the insert, 60-s deadline -> the approved qualify_budget template
  assert.deepEqual([d.first_touch.workflow, d.first_touch.op, d.first_touch.deadline_s, d.first_touch.not_before, d.first_touch.lead_id], ['W03', 'ask_budget', 60, d.row.created_at, LEAD_ID]);
  assert.ok(Date.parse(d.first_touch.not_before) - NOW <= 60_000);
  const q = W01.budgetQuestion(d.row);
  assert.deepEqual([q.kind, q.template, q.to, q.variables[0], q.correlation], ['template', 'qualify_budget', '+27600000201', 'Thandi', `w01:ask_budget:${LEAD_ID}`]);
  assert.deepEqual(q.buttons.map((b) => b.quick_reply), W3.BUDGET_ROWS.map(([id]) => id));
  assert.equal(d.capi, null, 'CAPI Lead waits for the hand-over');
  // W01.json routes this first touch to the shared sender, not to W06
  assert.equal(ifBranch(W01WF, 'Budget question first? (lead ad, no band in the form)', { json: { first_touch: d.first_touch } }), true);
});

test('decide: under 35 is accepted exactly like 35-50 (no close, no 24-h delete, no special flag or note)', () => {
  const d = decideOf(W01.normaliseLeadAd(lead('under_35')), ctx({ mobile: '+27820000202' }));
  assert.deepEqual([d.outcome, d.row.stage, d.row.disqualified_reason, d.row.retention_delete_after, d.row.age_band], ['budget_pending', 'new', null, null, 'lt35']);
  assert.equal(d.row.conv_state.age_accepted, undefined);
  assert.equal(d.row.conv_state.state, 'q_budget');
  assert.equal(d.activities.some((a) => a.activity_type === 'lead_ad_age_out_of_band'), false);
  assert.equal(d.first_touch.op, 'ask_budget', 'same first touch as anyone');
  assert.equal(W01.OUT_OF_BAND_AGE_BOOKS, W39.OUT_OF_BAND_AGE_BOOKS, 'one switch for /start/ and the instant form');
  // over 50 from a hand-built form: same
  const o = decideOf(W01.normaliseLeadAd(lead('hand_built_over_50')), ctx({ mobile: '+27600000204' }));
  assert.deepEqual([o.outcome, o.row.age_band, o.row.conv_state.age_accepted, o.row.consent_ads_at], ['budget_pending', '51plus', undefined, null]);
});

test('decide: a missing intent (and missing cover answer) is tolerated: stored, asked the band, no help_with', () => {
  const s = W01.normaliseLeadAd(lead('no_intent'));
  assert.deepEqual([s.lead_ad, s.help_with, s.quiz.age_band, s.consent.checked], [null, null, '35_44', true]);
  const d = decideOf(s, ctx({ mobile: '+27600000203' }));
  assert.deepEqual([d.outcome, d.row.conv_state.state, d.row.conv_state.help_with, d.row.conv_state.start, d.first_touch.op], ['budget_pending', 'q_budget', undefined, undefined, 'ask_budget']);
  // no age at all: accepted like any age
  const noAge = W01.normaliseLeadAd({ ...lead('no_intent'), field_data: lead('no_intent').field_data.filter((f) => f.name !== 'smc_age_band') });
  const n = decideOf(noAge, ctx({ mobile: '+27600000203' }));
  assert.deepEqual([n.outcome, n.row.age_band, n.row.conv_state && n.row.conv_state.state], ['budget_pending', null, 'q_budget']);
});

// ------------------------------------------------------------------------------------------- the band tap (W03)
test('band tap: in band -> qualified + routed; under 35 -> the same (qualified on the band, every age counts), delete date cleared', () => {
  const tap = (row, id) => {
    const msg = { from: row.phone.replace('+', ''), type: 'button', button: { payload: id }, payload: id };
    return W3.step(null, msg, { at: '2026-10-18T14:05:00+02:00', mobile: row.phone, lead_id: row.id, lead: row, existing_open_lead_id: row.id, brand: { brand_id: 'smc', consent_mode: 'named' }, broker: null });
  };
  const inBand = decideOf(W01.normaliseLeadAd(lead('keys_in_band'))).row;
  const r1 = tap(inBand, 'budget_1500_plus');
  const u1 = r1.actions.find((a) => a.kind === 'update_lead').set;
  assert.deepEqual([u1.budget_band, u1.stage, !!u1.qualified_at], ['1500_plus', 'qualified', true]);
  assert.ok(r1.actions.some((a) => a.kind === 'route_and_first_touch'));
  const young = decideOf(W01.normaliseLeadAd(lead('under_35')), ctx({ mobile: '+27820000202' })).row;
  const r2 = tap(young, 'budget_1500_plus');
  const u2 = r2.actions.find((a) => a.kind === 'update_lead').set;
  assert.deepEqual([u2.budget_band, !!u2.qualified_at, u2.stage], ['1500_plus', true, 'qualified'], 'qualified on the band, whatever the age');
  assert.ok(r2.actions.some((a) => a.kind === 'route_and_first_touch'), 'routed to Mark like anyone');
  assert.ok(!r2.actions.some((a) => a.kind === 'send'), 'no close message');
  // hand-over: routeExisting routes it (no age rule there), W06 sends the intro card
  const rt = W01.routeExisting({ ...young, budget_band: '1500_plus', consent_ads_at: null }, { brokers: [OPW], now: NOW });
  assert.deepEqual([rt.action, rt.first_touch && rt.first_touch.workflow], ['routed', 'W06']);
});

// ------------------------------------------------------------------------------------------- W02 end to end (offline)
const SECRET = 'test_app_secret_v2';
const sign = (buf) => 'sha256=' + createHmac('sha256', SECRET).update(buf).digest('hex');
async function w02(graphLead) {
  const buf = Buffer.from(JSON.stringify(FX.webhook), 'utf8');
  const item = { json: { headers: { 'x-hub-signature-256': sign(buf) } }, binary: { data: { data: buf.toString('base64') } } };
  const verify = new AsyncFunction('$json', '$env', '$', '$input', 'require', codeNode(W02, 'Verify signature + parse leadgen events').parameters.jsCode);
  const ev = (await verify(item.json, { META_APP_SECRET: SECRET }, () => { throw new Error('no refs'); }, { all: () => [item], first: () => item }, nodeRequire))[0].json;
  // Graph stubbed: fetchLead returns what Meta returns, through the real normalizeLead
  const fields = [];
  const lv = nodeRequire('lv-automation');
  const stub = (id) => (id === 'lv-automation'
    ? { w01: lv.w01, metaAds: { ...M, createClient: () => ({ fetchLead: async (leadgenId) => { fields.push(leadgenId); return M.normalizeLead(graphLead); } }) } }
    : nodeRequire(id));
  const fetch = new AsyncFunction('$json', '$env', '$', '$input', 'require', codeNode(W02, 'Fetch lead via Graph + backstop').parameters.jsCode);
  const $ = (k) => { if (k !== 'Verify signature + parse leadgen events') throw new Error(k); return { item: { json: ev } }; };
  const out = await fetch({}, {}, $, { item: { json: {} } }, stub);
  return { ev, out: out[0].json, fetched: fields };
}

test('W02 webhook -> Graph lead -> ingest item -> W01 core: same answers, consent and first touch as the Graph path', async () => {
  const { ev, out, fetched } = await w02(lead('under_35'));
  assert.deepEqual([ev.valid, ev.leadgen_id, ev.form_id], [true, 'lg_v2_0201', 'form_v2_01']);
  assert.deepEqual(fetched, ['lg_v2_0201']);
  assert.equal(out.action, 'ingest', 'every age passes the W02 backstop now');
  assert.equal(out.lead.consent.text_version, 'CONSENT-NAMED-v5web');
  assert.deepEqual(out.lead.consent.responses, lead('under_35').custom_disclaimer_responses);
  // the real W01 "Lead ad -> submission" node
  const [n] = await runCode(W01WF, 'Lead ad -> submission (w01.normaliseLeadAd + screen)', { items: [out], env: { BRAND_ID: '00000000-0000-4000-8000-0000000005c1' } });
  const s = n.json.sub;
  assert.equal(n.json.scr.ok, true);
  assert.deepEqual([n.json.mobile, s.first_name, s.quiz.age_band, s.lead_ad.intent, s.lead_ad.has_cover, s.help_with, s.consent.checked, s.consent.ads], ['+27820000202', 'Sipho', 'lt35', 'life', 'no', 'life', true, false]);
  const d = decideOf(s, ctx({ mobile: n.json.mobile }));
  assert.deepEqual([d.outcome, d.row.conv_state.age_accepted, d.first_touch.op, d.row.consent_text], ['budget_pending', undefined, 'ask_budget', SPEC.custom_disclaimer.checkboxes[0].text]);
  // without a consent tick the W02 backstop routes it out (anonymous counter only)
  const no = await w02({ ...lead('keys_in_band'), custom_disclaimer_responses: [{ checkbox_key: 'consent', is_checked: '' }] });
  assert.deepEqual([no.out.action, no.out.reasons], ['routed_out', ['no_consent']]);
});

// ------------------------------------------------------------------------------------------- the cover answer, every path
test('cover answer (4 options, 18 Oct 2026): /start/ (W39), the Instant Form (W01 Graph lead + W02 ingest item) store the same code and work_cover; legacy values still read', () => {
  // [what the person picked as each path sends it, stored code, leads.work_cover]
  const CASES = [
    [{ start: 'yes_work', form: 'Yes, through work' }, 'yes_work', true],
    [{ start: 'yes_own', form: 'Yes, my own' }, 'yes_own', false],
    [{ start: 'no', form: 'No' }, 'no', false],
    [{ start: 'unsure', form: 'Not sure' }, 'unsure', null],
    [{ start: 'yes', form: 'Yes' }, 'yes', null], // legacy three-option "Yes": type unknown
    [{ start: 'not_sure', form: 'not_sure' }, 'unsure', null], // legacy key
  ];
  const LEAD = { id: LEAD_ID, brand_id: 'b-smc', broker_id: null, origin: 'ctwa', first_name: 'Thandi', phone: '+27600000201', opted_out_at: null, erased: false, stage: 'verified', conv_state: {} };
  for (const [sent, code, work] of CASES) {
    // /start/: POST /start/answers -> conv_state.start.has_cover + leads.work_cover (the W39 Save statement writes it)
    const p = W39.parseAnswers({ intent: 'life', age_band: '35_44', budget_band: '1500_plus', has_cover: sent.start, request_id: 'req-cover-0001' });
    assert.equal(p.ok, true, sent.start);
    const plan = W39.decideAnswers({ lead: LEAD, answers: p.answers, request_id: p.request_id, now: NOW });
    assert.equal(plan.set.conv_state.start.has_cover, code, `/start/ ${sent.start}`);
    assert.equal(plan.set.work_cover ?? null, work, `/start/ work_cover ${sent.start}`);
    assert.equal(W39.startView({ lead: { ...LEAD, conv_state: { start: { has_cover: code } } } }).body.answers.has_cover, code, 'GET /start returns it as stored');
    // the Instant Form, Graph lead (W01 normaliseLeadAd -> decide -> conv_state.start) and the W02 ingest item (answers map)
    const g = W01.normaliseLeadAd({ ...lead('keys_in_band'), field_data: [{ name: 'smc_has_cover', values: [sent.form] }, { name: 'phone_number', values: ['+27600000201'] }] });
    const w = W01.normaliseLeadAd({ lead: { mobile_raw: '+27600000201', first_name: 'Thandi', answers: { smc_has_cover: sent.form }, consent: { given: true, text_version: 'CONSENT-NAMED-v5web' } } });
    for (const [s, path] of [[g, 'graph'], [w, 'w02']]) {
      assert.equal(s.lead_ad.has_cover, code, `${path} ${sent.form}`);
      assert.equal(s.quiz.work_cover, work, `${path} work_cover ${sent.form}`);
    }
    const d = decideOf(g);
    assert.equal(d.row.conv_state.start.has_cover, code, 'stored on the lead row');
    assert.equal(d.row.work_cover, work, 'leads.work_cover -> the pre-call brief');
  }
  assert.equal(W39.parseAnswers({ intent: 'life', age_band: '35_44', budget_band: '1500_plus', has_cover: 'maybe', request_id: 'req-cover-0001' }).status, 400);
  // chat: Lindi asks no cover question (W03 / W07 / conversation/*), so there is no third path to map
  const W39WF = JSON.parse(readFileSync(new URL('../W39.json', import.meta.url), 'utf8'));
  assert.match(W39WF.nodes.find((n) => n.name === 'Save answers + timeline + cancel stall (one statement)').parameters.query, /work_cover\s+= coalesce\(\(\$2::jsonb->>'work_cover'\)::boolean, l\.work_cover\)/);
});

// ------------------------------------------------------------------------------------------- the /start/ path (19 Oct 2026)
// Jono: Instant Form leads take the SAME path as WhatsApp / web leads: the form's consent, then the start_here TEMPLATE
// (lt1 token as its URL-button variable), then /start/ v4. Gate: w01.startHereReady (Twilio + start_here SID + secret).
const LT = require('../security/lead-token.js');
const SW = await import('../lib/sub-whatsapp-send.mjs');
const TOKEN_SECRET = 'test-lead-token-secret-0123456789abcdef';
const READY_ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: JSON.stringify({ start_here: 'HXstarthere0000000000000000000000' }), LEAD_TOKEN_SECRET: TOKEN_SECRET };

test('start_here gate: Twilio + the start_here Content SID + LEAD_TOKEN_SECRET, anything missing -> false (the qualify_budget path)', () => {
  assert.equal(W01.startHereReady(READY_ENV), true);
  assert.equal(W01.startHereReady({ ...READY_ENV, TWILIO_CONTENT_SIDS: JSON.stringify({ smc_start_cta: 'HX1' }) }), false, 'no start_here SID');
  assert.equal(W01.startHereReady({ ...READY_ENV, TWILIO_CONTENT_SIDS: 'not json' }), false);
  assert.equal(W01.startHereReady({ ...READY_ENV, LEAD_TOKEN_SECRET: ' ' }), false, 'no secret');
  assert.equal(W01.startHereReady({ ...READY_ENV, WHATSAPP_PROVIDER: 'meta' }), false, 'start_here is Twilio Content only (not submitted to Meta)');
  assert.equal(W01.startHereReady({}), false);
});

test('start_here ready: lead ad -> stored UNROUTED like the desktop start-page lead, answers kept, first touch start_here, no qualify_budget, no CAPI, consent as before', () => {
  const sub = W01.normaliseLeadAd(lead('keys_in_band'));
  const old = decideOf(sub);
  const d = decideOf(sub, ctx({ start_here: true }));
  assert.deepEqual([d.kind, d.outcome, d.row.routing_reason, d.row.broker_id, d.row.routed_at, d.row.stage, d.row.disqualified_reason],
    ['insert', 'start_page', 'start_page_pending', null, null, 'new', null]);
  assert.equal(d.row.routing_reason, W01.START_PAGE_PENDING);
  assert.deepEqual([d.row.conv_state.state, d.row.conv_state.via, d.row.conv_state.help_with], ['start_page', 'start_page', 'disability_income']);
  assert.deepEqual(d.row.conv_state.start, old.row.conv_state.start, 'the form answers stay in conv_state.start exactly as before');
  assert.ok(W01.QUALIFYING_STATES.has(d.row.conv_state.state), 'chat while the page is pending still goes W07 -> W03');
  assert.deepEqual([d.first_touch.workflow, d.first_touch.op, d.first_touch.deadline_s, d.first_touch.lead_id], ['W01', 'start_here', 60, LEAD_ID]);
  assert.equal(d.capi, null, 'no CAPI Lead at intake: routeExisting sends it once at the hand-over');
  assert.equal(d.mint_token, false, 'a lead ad has no page response: the token is minted by the start_here send only');
  assert.ok(!d.activities.some((a) => a.activity_type === 'budget_question_pending'));
  assert.ok(d.activities.some((a) => a.activity_type === 'start_page_pending' && a.payload.first_touch === 'start_here'));
  // consent recorded exactly as on the qualify_budget path (instant-form-spec-v2 mapping unchanged)
  for (const k of ['consent_text', 'consent_text_version', 'consent_mode', 'consent_at', 'consent_source', 'consent_ads_at', 'consent_page_url', 'lead_event_id', 'age_band', 'work_cover'])
    assert.deepEqual(d.row[k], old.row[k], k);
  assert.equal(d.row.consent_text, SPEC.custom_disclaimer.checkboxes[0].text);
  // every age: under 35 and over 50 take the same path
  for (const [k, m] of [['under_35', '+27820000202'], ['hand_built_over_50', '+27600000204']]) {
    const x = decideOf(W01.normaliseLeadAd(lead(k)), ctx({ mobile: m, start_here: true }));
    assert.deepEqual([x.outcome, x.row.disqualified_reason, x.first_touch.op], ['start_page', null, 'start_here'], k);
  }
  // without the gate: the old path, unchanged
  assert.deepEqual([old.outcome, old.row.routing_reason, old.row.conv_state.state, old.first_touch.workflow, old.first_touch.op], ['budget_pending', 'held_budget_pending', 'q_budget', 'W03', 'ask_budget']);
  assert.deepEqual(decideOf(sub, ctx({ start_here: false })), old);
  // a form that still carries a band (older form) is judged at intake as before: the gate changes nothing there
  const banded = decideOf({ ...sub, quiz: { ...sub.quiz, budget_band: '1500_plus' } }, ctx({ start_here: true }));
  assert.deepEqual([banded.outcome, banded.first_touch.workflow], ['accepted', 'W06']);
});

test('start_here send: decided shape, lt1 token minted for the lead and ONLY in the URL button; Twilio {1: first name, 2: token}, no Body; DRY_RUN_SENDS honoured', () => {
  const d = decideOf(W01.normaliseLeadAd(lead('keys_in_band')), ctx({ start_here: true }));
  const s = W01.startHere(d.row, TOKEN_SECRET, NOW);
  assert.deepEqual([s.kind, s.template, s.to, s.variables, s.lead_id, s.correlation], ['template', 'start_here', '+27600000201', ['Thandi'], LEAD_ID, `w01:start_here:${LEAD_ID}`]);
  const token = s.buttons[0].url;
  const v = LT.verifyLeadToken(token, { secret: TOKEN_SECRET, nowMs: NOW });
  assert.deepEqual([v.ok, v.lead_id], [true, LEAD_ID], 'a real lt1 lead token for this lead');
  assert.ok(!s.variables.some((x) => String(x).includes(token)), 'never in a body variable');
  assert.equal(W01.startHere(d.row, '', NOW), null);
  assert.equal(W01.startHere({ ...d.row, first_name: null }, TOKEN_SECRET, NOW).variables[0], 'there');
  // the real shared sender: the template matches the submitted spec, the URL button parameter = the token
  const n = SW.normalise(s);
  assert.equal(n.valid, true);
  const env = { ...READY_ENV, TWILIO_WHATSAPP_FROM: '+27600156480', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret' };
  const live = SW.decide(n, { brand_id: 'smc', suppressed: false }, env, NOW);
  assert.equal(live.action, 'send', JSON.stringify(live));
  const urlBtn = live.payload.template.components.find((c) => c.type === 'button' && c.sub_type === 'url');
  assert.deepEqual(urlBtn.parameters, [{ type: 'text', text: token }]);
  const req = SW.twilioRequest(live, env);
  const form = Object.fromEntries(new URLSearchParams(req.body));
  assert.deepEqual([form.ContentSid, form.Body], ['HXstarthere0000000000000000000000', undefined], 'ContentSid, never a text Body');
  assert.deepEqual(JSON.parse(form.ContentVariables), { 1: 'Thandi', 2: token });
  assert.equal(SW.logContent(live), 'template:start_here', 'the communications row never carries the token');
  const dry = SW.decide(n, { brand_id: 'smc', suppressed: false }, { ...env, DRY_RUN_SENDS: 'true' }, NOW);
  assert.deepEqual([dry.action, dry.external_id, dry.payload], ['dry', `dry:w01:start_here:${LEAD_ID}`, undefined]);
});

test('W01.json: the start_here first touch goes through the real nodes to smc-whatsapp-send; never to W06 or the qualify_budget template', async () => {
  const d = decideOf(W01.normaliseLeadAd(lead('keys_in_band')), ctx({ start_here: true }));
  const it = { first_touch: d.first_touch, decision: d };
  assert.equal(ifBranch(W01WF, 'First touch? (routed, not suppressed)', { json: it }), true);
  assert.equal(ifBranch(W01WF, 'Start here first? (lead ad -> /start/ page)', { json: it }), true);
  assert.equal(ifBranch(W01WF, 'Budget question first? (lead ad, no band in the form)', { json: it }), false);
  assert.deepEqual(await runCode(W01WF, 'W06 input', { items: [it] }), [], 'no W06 first touch');
  const out = await runCode(W01WF, 'Start here (w01.startHere: token in the URL button only)', { items: [it], env: { LEAD_TOKEN_SECRET: TOKEN_SECRET } });
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].json.template, LT.verifyLeadToken(out[0].json.buttons[0].url, { secret: TOKEN_SECRET }).lead_id], ['start_here', LEAD_ID]);
  assert.deepEqual(await runCode(W01WF, 'Start here (w01.startHere: token in the URL button only)', { items: [it], env: {} }), [], 'no secret: nothing sent');
  const to = (name) => (W01WF.connections[name] ? W01WF.connections[name].main.flat().map((x) => x.node) : []);
  assert.ok(to('First touch? (routed, not suppressed)').includes('Start here first? (lead ad -> /start/ page)'));
  assert.deepEqual(to('Start here (w01.startHere: token in the URL button only)'), ['WhatsApp Send (start_here)']);
  assert.equal(W01WF.nodes.find((x) => x.name === 'WhatsApp Send (start_here)').parameters.workflowId.value, 'smc-whatsapp-send');
  assert.match(codeNode(W01WF, 'Decide (w01.decide) + lead_token').parameters.jsCode, /start_here: L\.startHereReady\(\$env\)/);
  // the old path is still routed as before
  const old = decideOf(W01.normaliseLeadAd(lead('keys_in_band')));
  assert.equal(ifBranch(W01WF, 'Start here first? (lead ad -> /start/ page)', { json: { first_touch: old.first_touch } }), false);
  assert.equal(ifBranch(W01WF, 'Budget question first? (lead ad, no band in the form)', { json: { first_touch: old.first_touch } }), true);
});

test('start_here lead at the W39 hand-over: routed after START-DISCLOSE-v1 (no LEADAD session text), ONE CAPI Lead, never a second', () => {
  const d = decideOf(W01.normaliseLeadAd(lead('keys_in_band')), ctx({ start_here: true }));
  assert.ok(d.row.consent_ads_at, 'the form ticked the ad-measurement box');
  const capis = [d.capi].filter(Boolean);
  // W39 POST /start/adviser logs adviser_disclosed for Mark, then calls W01 core (expect_broker_id, first_touch false)
  const lead0 = { ...d.row, disclosed: [OPW.id] };
  const opts = { brokers: [OPW], now: NOW + 600_000, first_touch: false, expect_broker_id: OPW.id, require_disclosure: W01.disclosureRequired(lead0, {}) };
  assert.equal(opts.require_disclosure, true, 'the interim rule is still on for lead-ad leads; the W39 disclosure row satisfies it');
  const r = W01.routeExisting(lead0, opts);
  assert.deepEqual([r.action, r.update.broker_id, r.first_touch], ['routed', OPW.id, null]);
  if (r.capi) capis.push(r.capi);
  // a retry / second W39 call on the routed lead: no second Lead
  const again = W01.routeExisting({ ...lead0, ...r.update }, opts);
  assert.equal(again.action, 'already_routed');
  if (again.capi) capis.push(again.capi);
  assert.equal(capis.length, 1, 'exactly one CAPI Lead per Instant Form lead');
  assert.deepEqual([capis[0].event_name, capis[0].event_id, capis[0].action_source], ['Lead', `evt_${LEAD_ID}_lead`, 'system_generated']);
  // the old path (the lead answers in chat instead): without the row the route asks for the LEADAD-DISCLOSE-v1 session text first
  assert.equal(W01.routeExisting({ ...d.row, disclosed: [] }, { ...opts, first_touch: true }).action, 'disclose');
});
