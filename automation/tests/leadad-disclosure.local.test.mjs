// Lead-ad disclosure before hand-over, on the REAL schema (2026-10-18). W01 Lead core's own SQL and Code nodes run against the
// repo's migration chain in a throwaway Postgres (automation/tests/_localpg.mjs: Docker --network none, or native binaries;
// never the live project). Nothing is sent: the disclosure send is the shared sender's dry answer (dry:...).
//   band tap (W03 finishLeadAd) -> W01 core "Load CTWA lead + brokers" -> Route: 'disclose' (nothing written) -> the session
//   text -> "Log adviser_disclosed (after the send)" -> "Route after the disclosure" -> "Write routing": routed, AFTER the row.
//   A failed send (no message id) writes no row and holds the lead (held_disclosure_failed). A replay of the log finds the row.
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

test('lead-ad disclosure on the real schema: no route without adviser_disclosed; the row first, then the route', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const app = (sql, params) => q('SET ROLE n8n_app;\n' + sql, params);
  const j = (cell) => (cell === undefined || cell === '' ? null : JSON.parse(cell));
  const uuid = () => crypto.randomUUID();
  const BRAND = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  const user = uuid(); const MARK = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-ld-mark@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url, calendar_mode)
     VALUES ('${MARK}', '${user}', 'Synthetic Advisory', 'Mark Smith', 'synthetic-ld-mark@example.test', 'active', '${BRAND}', true, '12345', 'https://media.sortmycover.co.za/intro/synthetic/card.png', 'shared_fallback')`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${uuid()}', '${MARK}', 'synthetic SMC order', 20, 'paid', now(), '${BRAND}')`);
  const consent = W01.consentRegistry({ practice_name: 'Synthetic Advisory', fsp_number: '12345' })['CONSENT-NAMED-v5web'];
  const newLead = (mobile, { tap = true } = {}) => {
    const id = uuid();
    q(`INSERT INTO public.leads (id, brand_id, origin, source, first_name, phone, consent_text, consent_text_version, consent_mode, consent_at, consent_source, stage, routing_reason, budget_band, is_synthetic)
       VALUES ('${id}', '${BRAND}', 'lead_ad', 'Campaign Lead', 'Synthetic Thandi', '${mobile}', '${consent.replace(/'/g, "''")}', 'CONSENT-NAMED-v5web', 'named', now(), 'lead_ad', 'qualified', 'held_budget_pending', '1500_plus', true)`);
    // the band tap W07 logged (19 Oct 2026: the core Load query reads the 24-h window from it; none -> held_disclosure_pending)
    if (tap) q(`INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, lead_id, brand_id, content, status, workflow)
       VALUES ('whatsapp', 'inbound', 'client', 'admin', '${mobile}', '${id}', '${BRAND}', '[tap]', 'received', 'W07')`);
    return id;
  };
  const lead = (id) => j(q(`SELECT to_jsonb(l) FROM public.leads l WHERE l.id = '${id}'`)[0][0]);
  const acts = (id) => q(`SELECT activity_type FROM public.lead_activities WHERE lead_id = '${id}' ORDER BY occurred_at, activity_type`).map((r) => r[0]);
  const load = (id) => { const r = app(sqlOf('Load CTWA lead + brokers'), [id, 'true', '', 'false'])[0]; return { lead: j(r[0]), brokers: j(r[1]), first_touch: r[2] === 't', expect_broker_id: r[3] || null, hold_only: r[4] === 't' }; };
  const write = (rt) => app(sqlOf('Write routing (only if not routed yet) + timeline'), evalParam(WF, 'Write routing (only if not routed yet) + timeline', 'options.queryReplacement', { json: rt }));

  // ---- 0: no inbound WhatsApp in 24 h: no text could reach the lead -> held_disclosure_pending, never routed
  const Z = newLead('+27820000320', { tap: false });
  const xz = load(Z);
  assert.equal(xz.lead.window_open, false);
  const [rz] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xz] });
  assert.deepEqual([rz.json.r.action, rz.json.update], ['held', { routing_reason: 'held_disclosure_pending' }]);
  write(rz.json);
  assert.deepEqual([lead(Z).broker_id, lead(Z).routing_reason], [null, 'held_disclosure_pending']);

  // ---- A: the send goes out (dry): disclosed, then routed
  const A = newLead('+27820000321');
  const xa = load(A);
  assert.deepEqual(xa.lead.disclosed, [], 'nothing disclosed yet');
  const [ra] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xa] });
  assert.equal(ra.json.r.action, 'disclose', 'the route refuses without the disclosure');
  assert.equal(lead(A).broker_id, null);
  const [tx] = await runCode(WF, 'Disclosure text (w01.leadAdDisclosure)', { items: [ra.json] });
  assert.match(tx.json.text, /^Before I introduce you: Mark Smith from Synthetic Advisory, an authorised financial services provider \(FSP 12345\), will be the one on the call with you\. Introduced by SortMyCover\./);
  const refs = { 'Route (w01.routeExisting)': ra.json, 'Load CTWA lead + brokers': xa };
  const sent = { ok: true, external_id: `dry:${tx.json.correlation}`, messages: [{ id: `dry:${tx.json.correlation}` }] }; // smc-whatsapp-send under DRY_RUN_SENDS
  const logged = app(sqlOf('Log adviser_disclosed (after the send)'), evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: sent, refs }));
  assert.deepEqual(logged, [[MARK]]);
  const [rb] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{ broker_id: logged[0][0] }], refs });
  assert.equal(rb.json.r.action, 'routed');
  write(rb.json);
  const la = lead(A);
  assert.deepEqual([la.broker_id, la.order_state], [MARK, 'attached']);
  const order = acts(A);
  assert.ok(order.indexOf('adviser_disclosed') >= 0 && order.indexOf('adviser_disclosed') < order.indexOf('routed'), `the disclosure row is before the routing: ${order}`);
  const pl = j(q(`SELECT payload FROM public.lead_activities WHERE lead_id = '${A}' AND activity_type = 'adviser_disclosed'`)[0][0]);
  assert.deepEqual([pl.disclosure_version, pl.fsp, pl.message_id], ['LEADAD-DISCLOSE-v1', '12345', sent.external_id]);
  // a replay of the log (n8n retry) finds the same row; the reload now sees him as disclosed
  assert.deepEqual(app(sqlOf('Log adviser_disclosed (after the send)'), evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: sent, refs })), [[MARK]]);
  assert.deepEqual(load(A).lead.disclosed, [MARK]);

  // ---- B: the send failed: no row, held visibly, never routed
  const B = newLead('+27820000322');
  const xb = load(B);
  const [rbb] = await runCode(WF, 'Route (w01.routeExisting)', { items: [xb] });
  const refsB = { 'Route (w01.routeExisting)': rbb.json, 'Load CTWA lead + brokers': xb };
  const none = app(sqlOf('Log adviser_disclosed (after the send)'), evalParam(WF, 'Log adviser_disclosed (after the send)', 'options.queryReplacement', { json: { ok: false, error: 'outside_24h_window' }, refs: refsB }));
  assert.deepEqual(none, []);
  const [hb] = await runCode(WF, 'Route after the disclosure (w01.routeExisting)', { items: [{}], refs: refsB });
  write(hb.json);
  assert.deepEqual([lead(B).broker_id, lead(B).routing_reason], [null, 'held_disclosure_failed']);
  assert.equal(acts(B).includes('adviser_disclosed'), false);
});
