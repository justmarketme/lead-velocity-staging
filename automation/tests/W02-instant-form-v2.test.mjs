// Meta instant form v2 (18 Oct 2026, A/B arm vs click-to-WhatsApp): deliverables/media-buyer/instant-form-spec-v2.json.
// The form mirrors /start/ (intent, age band, cover today, first name, WhatsApp number), every age is accepted
// (lib/w01.mjs OUT_OF_BAND_AGE_BOOKS, as W39), the budget stays the first WhatsApp (qualify_budget < 60 s), and the
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
  assert.deepEqual(qc.options.map((o) => [o.key, o.value]), [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']]);
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
    ['Check WhatsApp', 'Lindi will message you in a moment to pick a time.', 'Chat on WhatsApp', 'https://wa.me/27600156480']);
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

test('decide: under 35 is accepted (no out-of-band close, no 24-h delete), age_accepted + a timeline note, never qualified', () => {
  const d = decideOf(W01.normaliseLeadAd(lead('under_35')), ctx({ mobile: '+27820000202' }));
  assert.deepEqual([d.outcome, d.row.stage, d.row.disqualified_reason, d.row.retention_delete_after, d.row.age_band], ['budget_pending', 'new', null, null, 'lt35']);
  assert.equal(d.row.conv_state.age_accepted, true);
  assert.equal(d.row.conv_state.state, 'q_budget');
  const note = d.activities.find((a) => a.activity_type === 'lead_ad_age_out_of_band');
  assert.deepEqual(note.payload, { age_band: 'lt35', budget_band: null, books: true, qualified: false, rule: W39.OUT_OF_BAND_AGE_BOOKS && 'OUT_OF_BAND_AGE_BOOKS (Jono, 18 Oct 2026)', via: 'lead_ad' });
  assert.equal(note.idempotency_key, `w01:age_oob:${LEAD_ID}`);
  assert.equal(d.first_touch.op, 'ask_budget', 'same first touch as anyone');
  assert.equal(W01.OUT_OF_BAND_AGE_BOOKS, W39.OUT_OF_BAND_AGE_BOOKS, 'one switch for /start/ and the instant form');
  // over 50 from a hand-built form: same
  const o = decideOf(W01.normaliseLeadAd(lead('hand_built_over_50')), ctx({ mobile: '+27600000204' }));
  assert.deepEqual([o.outcome, o.row.age_band, o.row.conv_state.age_accepted, o.row.consent_ads_at], ['budget_pending', '51plus', true, null]);
});

test('decide: a missing intent (and missing cover answer) is tolerated: stored, asked the band, no help_with', () => {
  const s = W01.normaliseLeadAd(lead('no_intent'));
  assert.deepEqual([s.lead_ad, s.help_with, s.quiz.age_band, s.consent.checked], [null, null, '35_44', true]);
  const d = decideOf(s, ctx({ mobile: '+27600000203' }));
  assert.deepEqual([d.outcome, d.row.conv_state.state, d.row.conv_state.help_with, d.row.conv_state.start, d.first_touch.op], ['budget_pending', 'q_budget', undefined, undefined, 'ask_budget']);
  // no age at all: accepted like an out-of-band age (books, never qualified)
  const noAge = W01.normaliseLeadAd({ ...lead('no_intent'), field_data: lead('no_intent').field_data.filter((f) => f.name !== 'smc_age_band') });
  const n = decideOf(noAge, ctx({ mobile: '+27600000203' }));
  assert.deepEqual([n.outcome, n.row.age_band, n.row.conv_state.age_accepted], ['budget_pending', null, true]);
});

// ------------------------------------------------------------------------------------------- the band tap (W03)
test('band tap: in band -> qualified + routed; under 35 -> routed, NO qualified_at, delete date cleared', () => {
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
  assert.deepEqual([u2.budget_band, u2.qualified_at, u2.stage, u2.keep_lead], ['1500_plus', undefined, undefined, true]);
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
  assert.deepEqual([d.outcome, d.row.conv_state.age_accepted, d.first_touch.op, d.row.consent_text], ['budget_pending', true, 'ask_budget', SPEC.custom_disclaimer.checkboxes[0].text]);
  // without a consent tick the W02 backstop routes it out (anonymous counter only)
  const no = await w02({ ...lead('keys_in_band'), custom_disclaimer_responses: [{ checkbox_key: 'consent', is_checked: '' }] });
  assert.deepEqual([no.out.action, no.out.reasons], ['routed_out', ['no_consent']]);
});
