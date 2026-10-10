// Decided 2026-10-05: Meta Lead Ads terms forbid income / financial questions in instant forms without Meta's permission.
// The monthly budget band moved from the instant form to the first WhatsApp step; the qualifying logic is unchanged.
// Real code: meta-ads qualifyLead (W02 backstop), w01 normaliseLeadAd/decide/budgetQuestion/routeExisting, W07 router,
// W03 (ctwa/w03.js, inlined in W03.json), the committed W01.json wiring and the qualify_budget template. Offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as W01 from '../lib/w01.mjs';
import * as W07 from '../lib/w07.mjs';
import { templateSpec, templateShape } from '../lib/sub-whatsapp-send.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = require('../ads/meta-ads.js');
const W3 = require('../ctwa/w03.js');
const SPEC = JSON.parse(readFileSync(join(ROOT, 'deliverables', 'media-buyer', 'instant-form-spec.json'), 'utf8'));
const WF01 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W01.json'), 'utf8'));
const WF03 = readFileSync(join(ROOT, 'automation', 'W03.json'), 'utf8');
const AT = '2026-10-12T14:40:00+02:00';
const NOW = Date.parse(AT);

test('instant form spec: no budget (or any income/financial) question; routing rules no longer mention it', () => {
  const keys = SPEC.questions.map((q) => q.key || q.type);
  assert.ok(!keys.includes('budget_band'), keys.join());
  for (const q of SPEC.questions) assert.doesNotMatch(`${q.label || ''} ${(q.options || []).map((o) => o.value).join(' ')}`, /\bR\d|income|salary|budget|afford|set aside/i, q.key);
  const rules = SPEC._ui_only.conditional_logic_and_disqualifying_ending.routing_rules;
  assert.ok(!JSON.stringify(rules).includes('budget'));
  assert.match(SPEC._budget_band_moved.where_now, /qualify_budget/);
  const md = readFileSync(join(ROOT, 'deliverables', 'media-buyer', 'campaign-spec.md'), 'utf8');
  assert.doesNotMatch(md.slice(md.indexOf('**3.3 Questions'), md.indexOf('**3.4')), /\| Roughly what monthly amount/);
});

test('W02 backstop (qualifyLead): no band -> qualified + budget_pending; an older form band is judged by the same bands', () => {
  const lead = (a) => ({ answers: a, consent_raw: true });
  const r = M.qualifyLead(lead({ age_band: '45_50', call_ok: 'yes' }));
  assert.deepEqual([r.qualified, r.budget_pending], [true, true]);
  for (const b of ['750_1250', '1250plus', '1250_1499', '1500_plus']) assert.equal(M.qualifyLead(lead({ age_band: '35_44', budget_band: b, call_ok: 'yes' })).qualified, true, b);
  for (const b of ['lt500', '500_750']) assert.deepEqual(M.qualifyLead(lead({ age_band: '35_44', budget_band: b, call_ok: 'yes' })).reasons, ['budget_band'], b);
  assert.deepEqual(M.qualifyLead(lead({ age_band: '51plus', call_ok: 'yes' })).reasons, ['age_band'], 'age still decided in the form');
});

const sub = () => W01.normaliseLeadAd({ lead: { origin: 'lead_ad', brand_id: 'smc', leadgen_id: 'lg_budget_1', form_id: 'f1', full_name: 'Synthetic Lerato', mobile_raw: '+27600000141',
  age_band: '45_50', bond_children: { bond: true, children: true }, consent: { given: true, text_version: 'named-v1-DRAFT', text: 'synthetic consent text', captured_at: AT }, is_synthetic: true } }, {});
const ctx = { now: NOW, line_type: 'mobile', mobile: '+27600000141', lead_id: '00000000-0000-4000-8000-0000000a0141', brand_id: 'smc', brokers: [], consent_mode: 'named' };

test('W01: a lead-ad lead without a band is stored unrouted (q_budget) and its first touch is the budget question < 60 s', () => {
  const d = W01.decide(sub(), ctx);
  assert.equal(d.outcome, 'budget_pending');
  assert.deepEqual([d.row.stage, d.row.broker_id, d.row.routing_reason, d.row.conv_state.state, d.row.budget_band, d.row.disqualified_reason], ['new', null, 'held_budget_pending', 'q_budget', null, null]);
  assert.equal(d.capi, null, 'CAPI Lead waits for the hand-over (held_* rule)');
  assert.deepEqual([d.first_touch.workflow, d.first_touch.op, d.first_touch.deadline_s], ['W03', 'ask_budget', 60]);
  const q = W01.budgetQuestion(d.row);
  assert.equal(q.template, 'qualify_budget'); assert.equal(q.to, '+27600000141'); assert.deepEqual(q.variables, ['Synthetic']);
  const shape = templateShape(templateSpec('qualify_budget'));
  assert.equal(shape.counts.body, q.variables.length); assert.equal(shape.counts.quick_reply, q.buttons.length);
  assert.equal(templateSpec('qualify_budget').category, 'UTILITY');
  assert.deepEqual(q.buttons.map((b) => b.quick_reply), W3.BUDGET_ROWS.map(([id]) => id), 'tap ids are W03 budget row ids');
  // an out-of-band age still never gets a message; an older form band is judged at intake as before
  assert.equal(W01.decide({ ...sub(), quiz: { ...sub().quiz, age_band: '51plus' } }, ctx).outcome, 'not_qualified');
  assert.equal(W01.decide({ ...sub(), quiz: { ...sub().quiz, budget_band: 'lt750' } }, ctx).outcome, 'not_qualified');
  assert.equal(W01.decide({ ...sub(), quiz: { ...sub().quiz, budget_band: '1500_plus' } }, ctx).outcome !== 'budget_pending', true);
  // page leads are unchanged: a missing band is out of band there
  assert.equal(W01.decide({ ...sub(), channel: 'page' }, ctx).outcome, 'not_qualified');
});

test('W01.json: insert writes conv_state; first touch branches to the budget question via the shared sender, W06 skips it', () => {
  const nd = (n) => WF01.nodes.find((x) => x.name === n);
  assert.match(JSON.stringify(nd('Insert lead + timeline (one statement; broker_id written before W06 exists)').parameters), /conv_state/);
  const to = (n) => (WF01.connections[n]?.main || []).flat().map((c) => c.node);
  assert.ok(to('First touch? (routed, not suppressed)').includes('Budget question first? (lead ad, no band in the form)'));
  assert.deepEqual(to('Budget question first? (lead ad, no band in the form)'), ['Budget question (w01.budgetQuestion)']);
  assert.deepEqual(to('Budget question (w01.budgetQuestion)'), ['WhatsApp Send (qualify_budget)']);
  assert.equal(nd('WhatsApp Send (qualify_budget)').parameters.workflowId.value, 'smc-whatsapp-send');
  assert.match(nd('W06 input').parameters.jsCode, /workflow !== 'W03'/);
  assert.match(WF03, /finishLeadAd/, 'W03.json carries the regenerated w03.js');
});

test('the tap: W07 routes it to W03; same bands decide; in band -> qualified + routed + W06 intro; out -> polite close', () => {
  const d = W01.decide(sub(), ctx);
  const lead = { ...d.row, conv_state: { state: 'q_budget' } };
  for (const [id, inBand] of [['budget_under_500', false], ['budget_500_750', false], ['budget_750_1250', true], ['budget_1250_1499', true], ['budget_1500_plus', true]]) {
    const msg = { from: '27600000141', type: 'button', button: { payload: id }, payload: id };
    assert.equal(W07.routeInbound(msg, { lead, broker_numbers: new Set(), ops_numbers: new Set() }).route, 'W03', id);
    const r = W3.step(null, msg, { at: AT, mobile: lead.phone, lead_id: lead.id, lead, existing_open_lead_id: lead.id, brand: { brand_id: 'smc', consent_mode: 'named' }, broker: null });
    const upd = r.actions.filter((a) => a.kind === 'update_lead').map((a) => a.set);
    if (inBand) {
      assert.equal(upd[0].stage, 'qualified', id);
      assert.equal(upd[0].budget_band, W3.BUDGET_TO_DB[id.slice(7)]);
      assert.ok(r.actions.some((a) => a.kind === 'route_and_first_touch'), 'hand-over goes through W01 routing');
      assert.ok(!r.actions.some((a) => a.kind === 'send'), 'nothing else is asked');
    } else {
      assert.deepEqual([upd[0].stage, upd[0].disqualified_reason, upd[0].broker_id], ['disqualified', 'budget_band', null], id);
      assert.ok(upd[0].retention_delete_after, 'deleted within 24 h');
      assert.ok(!r.actions.some((a) => a.kind === 'route_and_first_touch'), 'never handed over');
    }
  }
  // hand-over: routeExisting routes the held lead and sends the CAPI Lead now
  const brokers = [{ id: '00000000-0000-4000-8000-0000000b0001', broker_id: '00000000-0000-4000-8000-0000000b0001', brand_id: 'smc', status: 'active', routing_on: true, practice_name: 'Synthetic Practice', firm_name: 'Synthetic Practice', fsp_number: 'TEST-00000', current_cycle_id: 'c1', methods_supported: ['phone'], consent_mode: 'named' }];
  const rt = W01.routeExisting({ ...lead, consent_ads_at: AT, stage: 'qualified', budget_band: '1500_plus' }, { brokers, now: NOW });
  if (rt.action === 'routed') { assert.ok(rt.capi, 'CAPI Lead at hand-over'); assert.equal(rt.first_touch.workflow, 'W06'); }
  else assert.equal(rt.action, 'held', 'only a consent/capacity hold may stop it (never the budget)');
});

test('the ONE reminder: +3 h, same template, never 20:00-08:00 SAST (shifted to 08:00), once, then delete 24 h after it', () => {
  const H = 3600e3;
  const created = Date.parse('2026-10-12T10:00:00+02:00');
  const lead = { id: '00000000-0000-4000-8000-0000000a0142', phone: '+27600000142', first_name: 'Synthetic', origin: 'lead_ad', routing_reason: 'held_budget_pending',
    broker_id: null, opted_out_at: null, disqualified_reason: null, qualified_at: null, created_at: new Date(created).toISOString(), conv_state: { state: 'q_budget' } };
  assert.equal(W01.budgetReminder(lead, created + 2.9 * H), null, 'not before 3 h');
  const r = W01.budgetReminder(lead, created + 3 * H);
  assert.ok(r, 'due at 13:00 SAST');
  assert.equal(r.send.template, 'qualify_budget'); assert.deepEqual(r.send.buttons, W01.budgetQuestion(lead).buttons, 'same template, same taps');
  assert.equal(r.send.correlation, `w01:ask_budget_reminder:${lead.id}`, 'its own idempotency key (the first send keeps w01:ask_budget)');
  assert.equal(Date.parse(r.retention_delete_after) - Date.parse(r.reminded_at), 24 * H, 'no tap -> deleted 24 h after the reminder');
  // once: after the mark nothing more, ever
  const reminded = { ...lead, conv_state: { ...lead.conv_state, budget_reminded_at: r.reminded_at } };
  for (const h of [4, 24, 72]) assert.equal(W01.budgetReminder(reminded, created + h * H), null, `+${h} h: nothing`);
  // quiet hours: a lead in at 18:30 is due 21:30 -> held all night -> goes at the 08:00 sweep
  const eve = { ...lead, created_at: '2026-10-12T18:30:00+02:00' };
  for (const t of ['2026-10-12T21:30:00+02:00', '2026-10-13T02:00:00+02:00', '2026-10-13T07:59:00+02:00']) assert.equal(W01.budgetReminder(eve, Date.parse(t)), null, t);
  assert.ok(W01.budgetReminder(eve, Date.parse('2026-10-13T08:00:00+02:00')), '08:00 next morning');
  assert.equal(W01.budgetReminder(eve, Date.parse('2026-10-12T20:00:00+02:00')), null, '20:00 is quiet');
  // never for a lead that tapped, opted out, was routed or is not a lead-ad budget lead
  for (const patch of [{ qualified_at: AT }, { opted_out_at: AT }, { broker_id: 'b' }, { disqualified_reason: 'budget_band' }, { origin: 'page' }, { conv_state: { state: 'unbooked' } }])
    assert.equal(W01.budgetReminder({ ...lead, ...patch }, created + 4 * H), null, JSON.stringify(patch));
});

test('reminder wiring: W01 15-min sweep -> mark before send (at-most-once) -> shared sender; a tap in time clears the delete date', () => {
  const nd = (n) => WF01.nodes.find((x) => x.name === n);
  const to = (n) => (WF01.connections[n]?.main || []).flat().map((c) => c.node);
  assert.equal(nd('Every 15 min: budget reminder sweep').parameters.rule.interval[0].minutesInterval, 15);
  assert.deepEqual(to('Every 15 min: budget reminder sweep'), ['Leads waiting on the budget tap (> 3 h, not reminded)']);
  assert.deepEqual(to('Budget reminder (w01.budgetReminder)'), ['Mark reminded (at-most-once) + delete 24 h after']);
  assert.match(nd('Mark reminded (at-most-once) + delete 24 h after').parameters.query, /WHERE id = \$1::uuid AND conv_state->>'budget_reminded_at' IS NULL/);
  assert.deepEqual(to('Reminder send input (only rows just marked)'), ['WhatsApp Send (qualify_budget reminder)']);
  assert.equal(nd('WhatsApp Send (qualify_budget reminder)').parameters.workflowId.value, 'smc-whatsapp-send');
  assert.match(WF03, /retention_delete_after = CASE WHEN \$2::jsonb \? 'qualified_at' THEN NULL/);
});
