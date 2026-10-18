// W03, a brand-new number's first message (KG's test, 18 Oct 2026, n8n execution 3421), on the real schema as n8n_app.
// Before: "Action?" fanned the run's actions out and n8n's v1 order (a node's children top to bottom by canvas position) ran
// the session send + "Store outbound (W03)" before "Insert lead": communications_lead_id_fkey stopped the run, so the reply
// went out and no lead row was ever written. This test replays the actions in the order n8n runs them (read from W03.json
// positions), through the workflow's own Code nodes and SQL, and asserts the lead exists before its first communications row
// and that nothing throws. It also covers SUB smc-whatsapp-send's log row for an ops alert (executions 3427 / 3432: RLS).
// Run: node --test automation/tests/w03-first-message.local.test.mjs  (needs Docker or native Postgres; skips otherwise)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import { runCode, evalParam } from './_n8ncode.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
const WF03 = load('W03.json'); const SUB = load('SUB-whatsapp-send.json');
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n; };
const sqlOf = (wf, name) => node(wf, name).parameters.query;
const BACKEND = localPgBackend();
const PNID = '27600156480';
const ENV = { LEAD_TOKEN_SECRET: crypto.randomBytes(24).toString('hex'), DRY_RUN_SENDS: 'true', SITE_URL: 'https://sortmycover.co.za' };

/** The Switch's outputs in the order n8n's v1 engine runs them: children sorted by canvas position, top first, then left. */
function actionOrder(wf) {
  const sw = wf.connections['Action?'].main;
  const keys = node(wf, 'Action?').parameters.rules.values.map((r) => r.outputKey);
  return keys.map((k, i) => ({ kind: k, target: sw[i][0].node, pos: node(wf, sw[i][0].node).position }))
    .sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0]);
}

test('W03.json: every DB-write branch runs before the send branch; Store outbound can never stop the run', () => {
  const order = actionOrder(WF03).map((x) => x.kind);
  for (const k of ['insert_lead', 'update_lead', 'suppress']) assert.ok(order.indexOf(k) < order.indexOf('send'), `${k} before send: ${order.join(' > ')}`);
  // Lindi's reply still goes before the hand-offs that message the client (the adviser card via W01 -> W06, a W07 reply)
  for (const k of ['route_and_first_touch', 'forward_w07', 'finalize_booking']) assert.ok(order.indexOf('send') < order.indexOf(k), `send before ${k}: ${order.join(' > ')}`);
  const store = node(WF03, 'Store outbound (W03)');
  assert.equal(store.onError, 'continueRegularOutput');
  assert.match(store.parameters.query, /\(SELECT l\.id FROM public\.leads l WHERE l\.id = nullif\(\$5, ''\)::uuid\)/);
  const rec = node(SUB, 'Record communications row (claim before the Graph call)');
  assert.equal(rec.onError, 'continueRegularOutput');
  assert.match(rec.parameters.query, /COALESCE\(NULLIF\(\$4, ''\)::uuid, NULLIF\(\$14, ''\)::uuid\)/);
  assert.match(node(SUB, 'Claimed and a live send?').parameters.conditions.conditions[0].leftValue, /\$json\.error !== undefined/);
});

test('a first message from a number with no lead: lead row first, then its communications row, nothing throws (both openers)', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const app = (sql, params) => q('SET ROLE n8n_app;\n' + sql, params);
  const j = (cell) => (cell === undefined || cell === '' ? null : JSON.parse(cell));
  const BRAND = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  q(`UPDATE public.brands SET phone_number_id = '${PNID}' WHERE id = '${BRAND}'`);
  const ORDER = actionOrder(WF03);
  // a routable adviser, as in start-page.local.test.mjs (without one the ad path closes politely: no lead to test)
  const user = crypto.randomUUID(); const MARK = crypto.randomUUID();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-fm-mark@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, fsp_number, intro_card_url, calendar_mode, methods_supported)
     VALUES ('${MARK}', '${user}', 'Synthetic Advisory', 'Mark Smith', 'synthetic-fm-mark@example.test', 'active', '${BRAND}', true, '12345',
             'https://media.sortmycover.co.za/intro/synthetic/card.png', 'shared_fallback', ARRAY['teams','phone'])`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${crypto.randomUUID()}', '${MARK}', 'synthetic SMC order', 20, 'paid', now(), '${BRAND}')`);

  /** One inbound through W03 exactly as "Called by W07 (CTWA lead)" receives it, then every action in n8n's branch order. */
  const inbound = async (mobile, msg, profile) => {
    const wamid = `SM${crypto.randomUUID().replace(/-/g, '')}`;
    const [ad] = await runCode(WF03, 'W07 hand-off -> Cloud API message', { items: [{ source: 'W07', profile_name: profile, msg: { wamid, from: mobile, at_ms: Date.now(), phone_number_id: PNID, ...msg } }] });
    const c = app(sqlOf(WF03, 'Load context'), [PNID, mobile, ''])[0];
    const ctxRow = { brand_id: c[0], broker: j(c[1]), existing_open_lead_id: c[2] || null, lead: j(c[3]), suppressed: c[4] === 't', thread: j(c[5]), new_lead_id: c[6], start_page: c[7] === 't' };
    const [st] = await runCode(WF03, 'W03 step', { items: [ctxRow], refs: { 'W07 hand-off -> Cloud API message': ad.json }, env: ENV });
    if (st.json.store_thread) app(sqlOf(WF03, 'Save thread'), evalParam(WF03, 'Save thread', 'options.queryReplacement', { json: st.json }));
    const fan = (await runCode(WF03, 'Fan out actions', { items: [st.json] })).map((x) => x.json);
    const log = [];
    for (const { kind } of ORDER) for (const f of fan.filter((x) => x.kind === kind)) {
      if (kind === 'insert_lead') { app(sqlOf(WF03, 'Insert lead (consent at the tap)'), evalParam(WF03, 'Insert lead (consent at the tap)', 'options.queryReplacement', { json: f })); log.push(['insert_lead', f.row.id]); }
      if (kind === 'update_lead') app(sqlOf(WF03, 'Update lead (answers / out-of-band)'), evalParam(WF03, 'Update lead (answers / out-of-band)', 'options.queryReplacement', { json: f }));
      if (kind === 'send') {
        const out = { brand_id: f._brand_id, lead_id: f._lead_id || '', mobile: f._mobile, wamid: f._wamid, content: f.message.body };
        const params = evalParam(WF03, 'Store outbound (W03)', 'options.queryReplacement', { json: {}, refs: { 'Reply claim (w07:reply:{wamid})': { out } } });
        const leadThere = out.lead_id ? q(`SELECT count(*) FROM public.leads WHERE id = '${out.lead_id}'`)[0][0] === '1' : false;
        app(sqlOf(WF03, 'Store outbound (W03)'), params); // throws on any SQL error: the run must not stop here
        log.push(['send', out.lead_id, leadThere]);
      }
    }
    return { fan, log };
  };

  // (1) website opener: the first message itself carries consent, so this one run inserts the lead AND replies
  const m1 = '+27600000501';
  const r1 = await inbound(m1, { type: 'text', text: "Hi Lindi, I'd like to chat about cover for my family. I agree that SortMyCover may message me on WhatsApp about this and share my details with an authorised adviser. Ref w-home" }, 'Synthetic Mortso');
  const ins1 = r1.log.find((x) => x[0] === 'insert_lead');
  assert.ok(ins1, 'the opener inserts the lead');
  for (const s of r1.log.filter((x) => x[0] === 'send')) if (s[1]) assert.equal(s[2], true, 'the lead row exists before its first communications row');
  assert.ok(r1.log.findIndex((x) => x[0] === 'insert_lead') < r1.log.findIndex((x) => x[0] === 'send'));
  const comm1 = q(`SELECT lead_id FROM public.communications WHERE recipient_contact = '${m1}' AND workflow = 'W03'`);
  assert.ok(comm1.length >= 1 && comm1.every((r) => r[0] === ins1[1]), 'every W03 reply row carries the new lead');

  // (2) the ad pre-fill from a new number: consent first (no lead yet, a reply with no lead), then the tap inserts the lead
  const m2 = '+27600000502';
  const r2a = await inbound(m2, { type: 'text', text: "Hi, I'd like to book a 30-minute call with an adviser.", referral: { source_type: 'ad', source_id: '120200000000000001', ctwa_clid: 'ARAk_x' } }, 'Synthetic Thandi');
  assert.ok(r2a.log.some((x) => x[0] === 'send'), 'the consent question went out');
  const r2b = await inbound(m2, { type: 'interactive', payload: 'consent_yes', text: 'Yes, continue' }, 'Synthetic Thandi');
  const ins2 = r2b.log.find((x) => x[0] === 'insert_lead');
  assert.ok(ins2, 'the consent tap inserts the lead');
  for (const s of r2b.log.filter((x) => x[0] === 'send')) if (s[1]) assert.equal(s[2], true);
  assert.equal(q(`SELECT count(*) FROM public.leads WHERE phone = '${m2}'`)[0][0], '1');

  // (3) belt and braces: a reply whose lead row is missing is still logged (lead_id null), never a foreign-key stop
  const ghost = crypto.randomUUID();
  const params = evalParam(WF03, 'Store outbound (W03)', 'options.queryReplacement', { json: {}, refs: { 'Reply claim (w07:reply:{wamid})': { out: { brand_id: BRAND, lead_id: ghost, mobile: '+27600000503', wamid: 'SMghost', content: 'hi' } } } });
  app(sqlOf(WF03, 'Store outbound (W03)'), params);
  const g = q(`SELECT lead_id, metadata->>'lead_id_wanted' FROM public.communications WHERE external_id = 'dry:w03:SMghost'`)[0];
  assert.deepEqual(g, ['', ghost]);

  // (4) SUB smc-whatsapp-send: an ops alert (W22 -> Jono, no lead, no broker) is logged as a brand row, recipient 'admin'
  const rec = 'Record communications row (claim before the Graph call)';
  const alert = { lead_id: '', broker_id: '', brand_id: '', action: 'send', sent_as: 'text', kind: 'prebuilt', correlation: 'W22:alert:test1', to: '27725548057', record: true, caller: 'W22' };
  const p4 = evalParam(SUB, rec, 'options.queryReplacement', { json: alert, env: { BRAND_ID: BRAND } });
  const id4 = app(sqlOf(SUB, rec), p4);
  assert.equal(id4.length, 1, 'the row is written under n8n_app RLS');
  assert.deepEqual(q(`SELECT recipient_type, brand_id::text FROM public.communications WHERE metadata->>'correlation' = 'W22:alert:test1'`)[0], ['admin', BRAND]);
});
