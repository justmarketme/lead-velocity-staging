// Disclosure gate on the generic WEB QUIZ path, on the REAL schema (20 Oct 2026). W01's own SQL and Code nodes run against the
// repo's migration chain in a throwaway Postgres (automation/tests/_localpg.mjs: Docker --network none, or native binaries; never
// the live project). Nothing is sent: the disclosure send is the shared sender's dry answer (dry:...). Synthetic data only.
//   POST /lead (quiz, GENERIC consent: no adviser named) -> W01 Decide + "Insert lead": stored, NOT routed (held_disclosure_pending)
//   the band tap opens the 24-h window -> W01 core "Load CTWA lead + brokers" -> Route: 'disclose' (nothing written)
//   -> the session text -> "Log adviser_disclosed (after the send)" -> "Route after the disclosure" -> routed, AFTER the row.
//   No window (no inbound in 24 h): held_disclosure_pending, never routed. A named-consent quiz lead is routed at intake (control).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import { runCode, evalParam } from './_n8ncode.mjs';
import * as W01 from '../lib/w01.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF = JSON.parse(readFileSync(join(ROOT, 'automation', 'W01.json'), 'utf8'));
const sqlOf = (name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, name); return n.parameters.query; };
const BACKEND = localPgBackend();
const GENERIC_TEXT = 'I agree that SortMyCover may message me on WhatsApp to book and remind me about my call, and may share my details with an adviser from an FSCA-authorised financial services provider.';

test('generic web quiz on the real schema: never routed before adviser_disclosed; the row first, then the route', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const app = (sql, params) => q('SET ROLE n8n_app;\n' + sql, params);
  const j = (cell) => (cell === undefined || cell === '' ? null : JSON.parse(cell));
  const uuid = () => crypto.randomUUID();
  const BRAND = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  const user = uuid(); const MARK = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-gw-mark@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url, calendar_mode)
     VALUES ('${MARK}', '${user}', 'Synthetic Advisory', 'Mark Smith', 'synthetic-gw-mark@example.test', 'active', '${BRAND}', true, '12345', 'https://media.sortmycover.co.za/intro/synthetic/card.png', 'shared_fallback')`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${uuid()}', '${MARK}', 'synthetic SMC order', 20, 'paid', now(), '${BRAND}')`);

  const brokersFor = (mobile) => j(app(sqlOf('Context: counters, prior lead, suppression, brokers'), ['', '', '', '', mobile, BRAND])[0][5]) || [];
  const quizBody = (mobile, over = {}) => ({
    first_name: 'Synthetic Zanele', mobile, consent: true, consent_text: GENERIC_TEXT, consent_version: 'CONSENT-GENERIC-v5web', consent_mode: 'generic',
    age_band: '35_44', budget_band: '1500_plus', help_with: 'life', product_interest: 'life_cover', lang: 'en', started_at: Date.now() - 60e3,
    request_id: `req-${mobile}`, is_synthetic: true, context: { event_id: uuid() }, ...over,
  });
  /** POST /lead (quiz): normalise -> Decide (with the brokers the Context SQL returns) -> the Insert node's SQL. */
  const postLead = (mobile, over = {}, mode = 'generic') => {
    const sub = W01.normaliseSubmission(quizBody(mobile, over), {});
    const d = W01.decide(sub, { now: Date.now(), line_type: 'mobile', mobile, lead_id: uuid(), brand_id: BRAND, brokers: brokersFor(mobile), consent_mode: mode });
    assert.equal(d.kind, 'insert', JSON.stringify(d).slice(0, 300));
    d.row.is_synthetic = true;
    app(sqlOf('Insert lead + timeline (one statement; broker_id written before W06 exists)'), [JSON.stringify(d.row), JSON.stringify(d.activities)]);
    return { d, id: d.row.id };
  };
  const lead = (id) => j(q(`SELECT to_jsonb(l) FROM public.leads l WHERE l.id = '${id}'`)[0][0]);
  const acts = (id) => q(`SELECT activity_type FROM public.lead_activities WHERE lead_id = '${id}' ORDER BY occurred_at, activity_type`).map((r) => r[0]);
  const tap = (id, mobile) => q(`INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, lead_id, brand_id, content, status, workflow)
     VALUES ('whatsapp', 'inbound', 'client', 'admin', '${mobile}', '${id}', '${BRAND}', '[tap]', 'received', 'W07')`);
  const load = (id) => { const r = app(sqlOf('Load CTWA lead + brokers'), [id, 'true', '', 'false'])[0]; return { lead: j(r[0]), brokers: j(r[1]), first_touch: r[2] === 't', expect_broker_id: r[3] || null, hold_only: r[4] === 't' }; };
  const write = (rt) => app(sqlOf('Write routing (only if not routed yet) + timeline'), evalParam(WF, 'Write routing (only if not routed yet) + timeline', 'options.queryReplacement', { json: rt }));

  // ---- control: the same quiz with NAMED consent is routed at intake (the gate is about generic consent, not the page)
  const N = postLead('+27820000331', { consent_text: `synthetic consent text: Synthetic Advisory (FSP 12345)`, consent_version: 'CONSENT-NAMED-v3', consent_mode: 'named' }, 'named');
  assert.equal(lead(N.id).broker_id, MARK, 'named consent: routed at intake');

  // ---- A: generic consent: stored, never routed at intake, nothing sent to the adviser
  const MOBILE_A = '+27820000332';
  const A = postLead(MOBILE_A);
  const a0 = lead(A.id);
  assert.deepEqual([a0.broker_id, a0.routing_reason, a0.consent_mode], [null, W01.DISCLOSURE_PENDING, 'generic']);
  assert.ok(!acts(A.id).includes('routed') && !acts(A.id).includes('adviser_disclosed'));
  // W01 core before any inbound WhatsApp: no text can reach the lead, so it stays held
  const xNoWin = load(A.id);
  assert.equal(xNoWin.lead.window_open, false, 'no inbound WhatsApp yet');
  const [rNoWin] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xNoWin] });
  assert.deepEqual([rNoWin.json.r.action, rNoWin.json.update], ['held', { routing_reason: W01.DISCLOSURE_PENDING }], 'no window: a visible hold, no text');
  write(rNoWin.json);
  assert.equal(lead(A.id).broker_id, null);

  // ---- the band tap opens the window: disclose first (nothing written), then the row, then the route
  tap(A.id, MOBILE_A);
  const xa = load(A.id);
  assert.equal(xa.lead.window_open, true);
  assert.deepEqual(xa.lead.disclosed, []);
  const [ra] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xa] });
  assert.equal(ra.json.r.action, 'disclose', 'the route refuses a generic lead without the disclosure');
  assert.equal(lead(A.id).broker_id, null);
  const [tx] = await runCode(WF, 'Disclosure text (w01.leadAdDisclosure)', { items: [ra.json] });
  assert.match(tx.json.text, /Mark Smith from Synthetic Advisory, an authorised financial services provider \(FSP 12345\)/);
  const refs = { 'Route (w01.routeExisting)': ra.json, 'Load CTWA lead + brokers': xa };
  const sent = { ok: true, external_id: `dry:${tx.json.correlation}`, messages: [{ id: `dry:${tx.json.correlation}` }] }; // smc-whatsapp-send under DRY_RUN_SENDS
  const logged = app(sqlOf('Log adviser_disclosed (after the send)'), evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: sent, refs }));
  assert.deepEqual(logged, [[MARK]]);
  const pl = j(q(`SELECT payload FROM public.lead_activities WHERE lead_id = '${A.id}' AND activity_type = 'adviser_disclosed'`)[0][0]);
  assert.deepEqual([pl.disclosure_version, pl.fsp], ['CHAT-DISCLOSE-v1', '12345'], 'a generic non-lead-ad lead gets the chat disclosure version');
  const [rb] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{ broker_id: logged[0][0] }], refs });
  assert.equal(rb.json.r.action, 'routed');
  write(rb.json);
  const la = lead(A.id);
  assert.deepEqual([la.broker_id, la.order_state], [MARK, 'attached']);
  const order = acts(A.id);
  assert.ok(order.indexOf('adviser_disclosed') >= 0 && order.indexOf('adviser_disclosed') < order.indexOf('order_attached'), `the disclosure row is before the reservation the routing makes: ${order}`);

  // ---- B: the disclosure send failed: no row, held visibly, never routed
  const MOBILE_B = '+27820000333';
  const B = postLead(MOBILE_B);
  tap(B.id, MOBILE_B);
  const xb = load(B.id);
  const [rbb] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xb] });
  assert.equal(rbb.json.r.action, 'disclose');
  const refsB = { 'Route (w01.routeExisting)': rbb.json, 'Load CTWA lead + brokers': xb };
  assert.deepEqual(app(sqlOf('Log adviser_disclosed (after the send)'), evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: { ok: false, error: 'outside_24h_window' }, refs: refsB })), []);
  const [hb] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{}], refs: refsB });
  write(hb.json);
  assert.deepEqual([lead(B.id).broker_id, lead(B.id).routing_reason], [null, 'held_disclosure_failed']);
  assert.equal(acts(B.id).includes('adviser_disclosed'), false);
});
