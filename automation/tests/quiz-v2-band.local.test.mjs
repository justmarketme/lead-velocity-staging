// Quiz v2 band step, end to end on the REAL schema (2026-10-14). The nodes' own SQL and the libraries' own code run against the repo's
// migration chain in a throwaway Postgres (automation/tests/_localpg.mjs: Docker --network none, or native binaries; never the live
// project). Nothing is sent: the WhatsApp sender is only ASKED what it would do, with DRY_RUN_SENDS=true. Synthetic data only
// (+27 82 000 01xx, @example.test, is_synthetic = true).
//
// The chain under test, one lead at a time:
//   A  POST /lead (quiz v2, no band)  -> W01 Decide + "Insert lead" SQL  -> the lead is saved, routed, conv_state q_budget
//                                      -> W01 budgetQuestion -> smc-whatsapp-send: qualify_budget (dry; live request shape checked)
//      page booking                  -> a HELD slot (pending_verification); W05 finalize hands nothing over without the band
//      the WhatsApp button tap       -> W03 step + "Update lead" SQL: band set, lead qualified; "Load held slot + lead (finalize)"
//                                      now carries the band; with the email verified W05 finalize hands the booking over
//   B  no free broker at intake      -> held, still asked; the band tap routes it (W01 core Route + "Write routing" SQL)
//   C  under R750                    -> band recorded, never qualified; the database re-holds it (held_low_budget) + the one honest notice
//   D  broker with no bookable calendar -> a held slot is not a request; once released it appears in the CRM appointment queue
//      (appointment_request_sweep, the 10-minute SQL job) and carries the band
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import * as W01 from '../lib/w01.mjs';
import * as W5 from '../lib/w05.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';

const require = createRequire(import.meta.url);
const W3 = require('../ctwa/w03.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'automation', f), 'utf8'));
const WF01 = load('W01.json'); const WF03 = load('W03.json'); const WF05 = load('W05.json');
const sqlOf = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n.parameters.query; };
const BACKEND = localPgBackend();
const SQL_CONTEXT = sqlOf(WF01, 'Context: counters, prior lead, suppression, brokers');
const SQL_INSERT = sqlOf(WF01, 'Insert lead + timeline (one statement; broker_id written before W06 exists)');
const SQL_LOAD03 = sqlOf(WF03, 'Load context');
const SQL_UPDATE03 = sqlOf(WF03, 'Update lead (answers / out-of-band)');
const SQL_CORE_LOAD = sqlOf(WF01, 'Load CTWA lead + brokers');
const SQL_CORE_WRITE = sqlOf(WF01, 'Write routing (only if not routed yet) + timeline');
const SQL_FINALIZE = sqlOf(WF05, 'Load held slot + lead (finalize)');
const SQL_RELEASE = sqlOf(WF05, 'Release held slots past verify_by (+ timeline)');

const PNID = '27600156480'; // brands.phone_number_id of SortMyCover (live), digits of the receiving sender
const SIDS = { qualify_budget: 'HX5a0030506140a58a86e8611f15a5af64' };
const TWILIO_ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: `whatsapp:+${PNID}`, TWILIO_CONTENT_SIDS: JSON.stringify(SIDS), TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'authtok' };

test('quiz v2 band step on the real schema: lead saved, band asked (dry), tap sets the band, held booking carries it, request appears', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const uuid = () => crypto.randomUUID();
  const j = (cell) => (cell === undefined || cell === '' ? null : JSON.parse(cell));
  const BRAND = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  q(`UPDATE public.brands SET phone_number_id = '${PNID}' WHERE id = '${BRAND}'`);

  // ---- one SMC-ready synthetic broker with a paid order (the W13 local test's shape)
  const user = uuid(); const BROKER = uuid(); const ORDER = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-qv2-broker@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url)
     VALUES ('${BROKER}', '${user}', 'Synthetic FSP', 'Synthetic Adviser', 'synthetic-qv2-broker@example.test', 'active', '${BRAND}', true, '12345', 'https://media.sortmycover.co.za/intro/synthetic/card.png')`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${ORDER}', '${BROKER}', 'synthetic SMC order', 30, 'paid', now(), '${BRAND}')`);

  // ---- helpers that run the workflows' own steps
  const brokersFor = (mobile) => j(q(SQL_CONTEXT, ['', '', '', '', mobile, BRAND])[0][5]) || [];
  const quizBody = (mobile, over = {}) => ({
    first_name: 'Synthetic Nomsa', mobile, consent: true, consent_text: 'synthetic consent text', consent_version: 'CONSENT-GENERIC-v1', consent_mode: 'generic',
    age_band: '35_44', budget_pending: true, help_with: 'review', product_interest: 'life_cover', lang: 'en', started_at: Date.now() - 60e3,
    request_id: `req-${mobile}`, is_synthetic: true, context: { event_id: uuid() }, ...over,
  });
  /** POST /lead, quiz v2: normalise -> Decide (with the brokers the Context SQL returns) -> the Insert node's SQL. */
  const postLead = (mobile, over = {}) => {
    const sub = W01.normaliseSubmission(quizBody(mobile, over), {});
    const d = W01.decide(sub, { now: Date.now(), line_type: 'mobile', mobile, lead_id: uuid(), brand_id: BRAND, brokers: brokersFor(mobile), consent_mode: 'generic' });
    if (d.kind !== 'insert') return { d };
    d.row.is_synthetic = true;
    q(SQL_INSERT, [JSON.stringify(d.row), JSON.stringify(d.activities)]);
    return { d, id: d.row.id };
  };
  const lead = (id) => { const r = q(`SELECT to_jsonb(l) FROM public.leads l WHERE l.id = '${id}'`); return r[0] ? j(r[0][0]) : null; };
  const acts = (id) => q(`SELECT activity_type FROM public.lead_activities WHERE lead_id = '${id}' ORDER BY occurred_at, id`).map((r) => r[0]);
  /** a button tap from the qualify_budget template, through W03 "Load context" -> "W03 step" -> the action nodes */
  const tap = (mobile, leadId, buttonId) => {
    const c = q(SQL_LOAD03, [PNID, mobile, leadId]);
    assert.equal(c.length, 1, 'W03 Load context returns one row');
    const [brand_id, broker, existing, leadRow, suppressed, thread] = [c[0][0], j(c[0][1]), c[0][2], j(c[0][3]), c[0][4], c[0][5]];
    assert.equal(brand_id, BRAND, 'the receiving number resolves to the SMC brand');
    assert.equal(existing, leadId, 'the open lead is found (W07 passed it, or the 90-day match)');
    const r = W3.step(thread || null, { type: 'button', payload: buttonId }, { at: new Date().toISOString(), mobile, profile_name: 'Synthetic', lead_id: uuid(), broker,
      brand: { brand_id, consent_mode: 'generic' }, existing_open_lead_id: existing, suppressed: suppressed === 't', wamid: `wamid-${uuid()}`, is_synthetic: false, lead: leadRow, typed: null, hops: 0, phone_number_id: PNID });
    for (const a of r.actions) if (a.kind === 'update_lead') q(SQL_UPDATE03, [a.id, JSON.stringify(a.set)]);
    return r.actions;
  };
  /** W01 core "route_and_first_touch": Load CTWA lead + brokers -> Route (w01.routeExisting) -> Write routing */
  const core = (leadId) => {
    const row = q(SQL_CORE_LOAD, [leadId])[0];
    const r = W01.routeExisting(j(row[0]), { brokers: j(row[1]) || [], now: Date.now() });
    if (['routed', 'held'].includes(r.action)) q(SQL_CORE_WRITE, [leadId, JSON.stringify(r.update || { routing_reason: r.update && r.update.routing_reason })]);
    return r;
  };
  let slotNo = 0; // one hour apart: the database forbids overlapping slots for one broker
  const hold = (leadId, over = {}) => {
    const id = uuid(); slotNo += 1;
    q(`INSERT INTO public.appointments (id, broker_id, client_id, brand_id, appointment_date, ends_at, status, verify_by, method, booked_via, idempotency_key)
       VALUES ('${id}', '${over.broker || BROKER}', '${leadId}', '${BRAND}', now() + interval '2 days' + interval '${slotNo} hours', now() + interval '2 days 30 minutes' + interval '${slotNo} hours', 'pending_verification', now() + interval '1 day', 'phone', 'page', 'page:${leadId}:1')`);
    return id;
  };
  const finalizeView = (leadId) => { const r = q(SQL_FINALIZE, [leadId, ''])[0]; return { hold: j(r[0]), lead: j(r[1]) }; };
  const verifyEmail = (leadId) => q(`UPDATE public.leads SET email = 'synthetic-${leadId.slice(0, 8)}@example.test', email_verified = true, email_verified_at = now(), email_verified_via = 'link' WHERE id = '${leadId}'`);

  // =========================================================================================== A: the whole chain
  const MOBILE_A = '+27820000101';
  const A = postLead(MOBILE_A);
  assert.equal(A.d.outcome, 'accepted'); assert.equal(A.d.budget_question, true);
  const a0 = lead(A.id);
  assert.equal(a0.broker_id, BROKER); assert.equal(a0.budget_band, null); assert.equal(a0.is_synthetic, true); assert.equal(a0.origin, 'page');
  assert.equal(a0.order_state, 'attached', 'the database reserved the place on the broker\'s order');
  assert.deepEqual(a0.conv_state, { state: 'q_budget', budget_pending: true, help_with: 'review' });
  assert.ok(acts(A.id).includes('budget_question_pending') && acts(A.id).includes('routed'));
  // the WhatsApp the workflow would send: the approved template, asked of the shared sender with DRY_RUN_SENDS=true, once
  const ask = W01.budgetQuestion(a0);
  const n = S.normalise(ask);
  assert.ok(n.valid, JSON.stringify(n.missing));
  const dry = S.decide(n, { brand_id: BRAND }, { ...TWILIO_ENV, DRY_RUN_SENDS: 'true' });
  assert.deepEqual([dry.action, dry.template, dry.external_id], ['dry', 'qualify_budget', `dry:w01:ask_budget:${A.id}`], 'dry run: recorded, never sent');
  const live = S.decide(n, { brand_id: BRAND }, { ...TWILIO_ENV, DRY_RUN_SENDS: 'false' }); // what the go-live gate will send (we only look at the request)
  assert.equal(live.action, 'send');
  const form = new URLSearchParams(S.twilioRequest(live, TWILIO_ENV).body);
  assert.equal(form.get('ContentSid'), SIDS.qualify_budget); assert.equal(form.get('To'), `whatsapp:${MOBILE_A}`);
  const vars = JSON.parse(form.get('ContentVariables'));
  assert.equal(vars['1'], a0.first_name, 'the name the visitor gave on the page (a first name field)');
  assert.deepEqual([2, 3, 4, 5, 6].map((k) => vars[String(k)]), W01.BUDGET_TAP_IDS, 'the five button ids are exactly the ids W03 understands');

  // the page books a slot: a HELD slot (the email is not verified) with no band yet
  const holdA = hold(A.id);
  let fin = finalizeView(A.id);
  assert.equal(fin.hold.status, 'pending_verification'); assert.equal(fin.lead.budget_band, null);
  verifyEmail(A.id); // email first (the link was tapped) ...
  fin = finalizeView(A.id);
  assert.equal(W5.finalizeRequest(fin.hold, fin.lead, Date.now()), null, '... email verified but no band: still held, nothing reaches the adviser');
  // the client taps "R750 to R1,250" on the template
  const acA = tap(MOBILE_A, A.id, 'budget_750_1250');
  assert.deepEqual(acA.map((x) => x.kind), ['cancel_stall', 'update_lead', 'send', 'route_and_first_touch', 'finalize_booking']);
  const a1 = lead(A.id);
  assert.deepEqual([a1.budget_band, a1.stage, a1.broker_id], ['750_1250', 'qualified', BROKER], 'band saved, lead qualified, still with its broker');
  assert.ok(a1.qualified_at && a1.conv_state.state === 'unbooked' && a1.conv_state.help_with === 'review', 'the reason from the page survives');
  assert.equal(core(A.id).action, 'already_routed', 'route_and_first_touch is a no-op for a routed lead');
  fin = finalizeView(A.id); // W05 op finalize: the held booking now carries the band
  assert.equal(fin.lead.budget_band, '750_1250');
  const req = W5.finalizeRequest(fin.hold, fin.lead, Date.now());
  assert.ok(req && req.op === 'book' && req.lead_id === A.id && req.email_confirmed === true && req.finalize_booking_id === holdA, 'the held booking is handed over (op book, finalize_booking_id = the hold)');
  const notice = W5.brokerNotice({ lead: { ...fin.lead, phone: MOBILE_A, id: A.id }, broker: { adviser_name: 'Synthetic Adviser', email: 'a@example.test' } }, { start: new Date(Date.now() + 2 * 86400e3).toISOString(), method: 'phone' });
  assert.equal(notice.vars[6], 'R750-R1,250', 'the broker notice shows the band');
  // after the answer the state is no longer a qualifying one, so a late tap on the old message is not W03's (W07 owns it): nothing changes.
  // And the Update lead SQL never pulls a booked lead back to 'qualified' (forward-only stage guard), whoever asks.
  q(`UPDATE public.leads SET stage = 'booked' WHERE id = '${A.id}'`);
  q(SQL_UPDATE03, [A.id, JSON.stringify({ budget_band: '1500_plus', qualified_at: new Date().toISOString(), stage: 'qualified' })]);
  assert.deepEqual([lead(A.id).stage, lead(A.id).budget_band], ['booked', '1500_plus'], 'band written, stage stays booked');
  q(SQL_UPDATE03, [A.id, JSON.stringify({ stage: 'disqualified', disqualified_reason: 'age_band' })]);
  assert.equal(lead(A.id).stage, 'disqualified', 'disqualified / opted_out may be written from any stage');

  // =========================================================================================== B: no free broker at intake
  q(`UPDATE public.brokers SET routing_on = false WHERE id = '${BROKER}'`);
  const MOBILE_B = '+27820000102';
  const B = postLead(MOBILE_B);
  assert.deepEqual([B.d.outcome, B.d.budget_question, B.d.row.routing_reason.startsWith('held_')], ['held', true, true]);
  assert.equal(lead(B.id).broker_id, null); assert.equal(lead(B.id).conv_state.state, 'q_budget', 'a held web lead is still asked the band');
  q(`UPDATE public.brokers SET routing_on = true WHERE id = '${BROKER}'`); // a broker became free
  tap(MOBILE_B, B.id, 'budget_1500_plus');
  assert.equal(lead(B.id).budget_band, '1500_plus');
  const rb = core(B.id);
  assert.equal(rb.action, 'routed'); assert.equal(rb.first_touch.workflow, 'W06');
  assert.equal(lead(B.id).broker_id, BROKER, 'the band tap routed the held lead (route_and_first_touch)');

  // =========================================================================================== C: under R750
  const MOBILE_C = '+27820000103';
  const C = postLead(MOBILE_C);
  assert.equal(lead(C.id).broker_id, BROKER);
  const acC = tap(MOBILE_C, C.id, 'budget_under_500');
  assert.ok(!acC.some((x) => x.kind === 'send'), 'no thank-you for tier C');
  const c1 = lead(C.id);
  assert.deepEqual([c1.budget_band, c1.stage, c1.broker_id, c1.routing_reason, c1.lead_tier], ['lt750', 'new', null, 'held_low_budget', 'C'], 'recorded as tier C, not qualified, re-held by the database trigger (no standing yes)');
  const rc = core(C.id);
  assert.equal(rc.action, 'held'); assert.equal(rc.notice.template, 'lead_low_budget_held', 'the one honest message');

  // =========================================================================================== D: no bookable calendar -> the CRM queue
  const MOBILE_D = '+27820000104';
  const D = postLead(MOBILE_D);
  const holdD = hold(D.id);
  tap(MOBILE_D, D.id, 'budget_1500_plus');
  assert.equal(lead(D.id).stage, 'qualified');
  // the sweep skips synthetic leads (live safety) and leads with a live or held appointment; make this one count like a real lead
  q(`UPDATE public.leads SET is_synthetic = false, stage_entered_at = now() - interval '1 hour' WHERE id = '${D.id}'`);
  q(`UPDATE public.brokers SET calendar_status = NULL, calendar_mode = NULL WHERE id = '${BROKER}'`); // Mark's Outlook is not connected
  assert.equal(q('SELECT public.appointment_request_sweep()')[0][0], '0', 'a held slot is not a request: the lead is already waiting on its time');
  // the hold times out (email never verified): the W05 release sweep cancels it ...
  q(`UPDATE public.appointments SET verify_by = now() - interval '1 minute' WHERE id = '${holdD}'`);
  const released = q(SQL_RELEASE);
  assert.equal(released.length, 1, 'W05 released the hold');
  // ... and the CRM's 10-minute sweep turns the qualified, band-carrying lead into a request instead of letting it vanish
  assert.equal(q('SELECT public.appointment_request_sweep()')[0][0], '1');
  const rq = q(`SELECT a.status, a.request_source, a.broker_id IS NULL, l.budget_band, l.stage FROM public.appointments a JOIN public.leads l ON l.id = a.client_id WHERE a.client_id = '${D.id}' AND a.status = 'requested'`);
  assert.deepEqual(rq, [['requested', 'whatsapp', 't', '1500_plus', 'qualified']], 'the appointment request appears in the allocation queue and its lead carries the band');
  assert.ok(acts(D.id).includes('appointment_requested'));
  // a lead that never gave a band is NOT queued: nothing may reach a broker without it
  const E = postLead('+27820000105'); const holdE = hold(E.id);
  q(`UPDATE public.leads SET is_synthetic = false, stage_entered_at = now() - interval '1 hour' WHERE id = '${E.id}'`);
  q(`UPDATE public.appointments SET verify_by = now() - interval '1 minute' WHERE id = '${holdE}'`); q(SQL_RELEASE);
  assert.equal(q('SELECT public.appointment_request_sweep()')[0][0], '0', 'no band, not qualified, no request');
});
