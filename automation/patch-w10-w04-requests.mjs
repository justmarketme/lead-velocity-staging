// automation/patch-w10-w04-requests.mjs - W10 sends W04 the request it reads, confirms a cancel, emails SortMyCover changes (17 Oct 2026).
// Live bug (cancel test, booking 997c6752): W10 handed W04 its own item at all four W04 calls. W04 reads
// { op: list | is_free | graph_token, broker_id } (lib/w04.subcallInput), so it rejected every call:
//   - "Graph token for broker (cancel)" got no token -> Graph DELETE sent "Bearer undefined" -> the Outlook event stayed;
//   - "W04 slots (exclude this booking)" saw op rebook_after_cancel -> subcall_rejected -> no times, no message, and the
//     client got W07's never-silent "something went wrong" instead of a cancel confirmation;
//   - the reschedule re-check and the move's graph token had the same fault.
// Also: "Email broker from howzit@" used $json.howzit_token, which nothing sets, so no adviser email ever left W10; and
// nobody emailed the client about a cancel or a move. Fix (this script + lib/w10.mjs):
//   1. a Code node in front of each W04 call builds W04's documented request (as W05 does);
//   2. Build offer sends the cancel confirmation as text when there are no times (lib/w10.offerMessage text_session);
//   3. SortMyCover brand -> the adviser notice through smc-email-send and the client email (booking_cancelled /
//      booking_updated) through smc-client-email; other brands keep howzit@, now on the app-only credential.
// W10.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-w10-w04-requests.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const find = (name) => wf.nodes.find((x) => x.name === name);
const node = (name) => { const n = find(name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const swap = (n, key, from, to) => {
  const v = n.parameters[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W10 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  n.parameters[key] = v.replace(from, to);
  return true;
};
const at = (name, dx, dy) => { const p = node(name).position; return [p[0] + dx, p[1] + dy]; };
const add = (n) => { if (find(n.name)) return false; wf.nodes.push(n); return true; };
const code = (id, name, position, jsCode, mode = 'runOnceForEachItem') => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode, jsCode } });
const ifNode = (id, name, position, expr) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position,
  parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: expr, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } });
const FN = "={{ ($env.SUPABASE_FUNCTIONS_URL || 'https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1') + ";
const C = wf.connections;
const targets = (src) => (C[src] && C[src].main) || [];
// Every connection into `to` now goes into `via`, and `via` feeds `to`.
const insertBefore = (via, to) => {
  let moved = false;
  for (const [src, outs] of Object.entries(C)) if (src !== via) for (const list of (outs.main || [])) for (const t of (list || [])) if (t.node === to) { t.node = via; moved = true; }
  if (!C[via]) { C[via] = { main: [[{ node: to, type: 'main', index: 0 }]] }; moved = true; }
  return moved;
};
const link = (from, to, out = 0) => {
  C[from] = C[from] || { main: [] };
  while (C[from].main.length <= out) C[from].main.push([]);
  if (C[from].main[out].some((t) => t.node === to)) return false;
  C[from].main[out].push({ node: to, type: 'main', index: 0 });
  return true;
};
const unlink = (from, to, out = 0) => {
  const list = targets(from)[out] || [];
  const i = list.findIndex((t) => t.node === to);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
};

const W04_NOTE = '// W04 reads { op: list | is_free | graph_token, broker_id, ... } (lib/w04.subcallInput). W10 used to pass its own item\n// (op rebook_after_cancel / reschedule / cancel), which W04 rejected (17 Oct 2026).\n';
const REQ_LIST = 'W04 request (list, exclude this booking)';
const REQ_FREE = 'W04 request (is_free, move)';
const REQ_TOKEN_MOVE = 'W04 request (graph_token, move)';
const REQ_TOKEN_CANCEL = 'W04 request (graph_token, cancel)';
const ADVISER_ROUTE = 'Adviser email route (w10.smcBrokerRelay)';
const ADVISER_SMC = 'SortMyCover adviser email?';
const ADVISER_RELAY = 'Email adviser from SortMyCover (smc-email-send)';
const HOWZIT = 'Email broker from howzit@ (Graph sendMail)';
const CLIENT_CANCEL = 'SMC client email (cancelled)';
const CLIENT_MOVE = 'SMC client email (moved)';
const CLIENT_LIVE = 'SortMyCover client email + live?';
const CLIENT_SEND = 'Email client from SortMyCover (smc-client-email)';

const changed = [];
const did = (label, v) => changed.push([label, !!v]);

// 1. W04 requests
did('req list', add(code('p10-w04-list', REQ_LIST, at('W04 slots (exclude this booking)', -200, 160),
  W04_NOTE + "const j = $('Merge context').item.json;\nreturn { json: { op: 'list', broker_id: j.br.id, lead_id: j.ld.id, exclude_booking_id: j.bk.id } };")));
did('req list wire', insertBefore(REQ_LIST, 'W04 slots (exclude this booking)'));
did('req free', add(code('p10-w04-free', REQ_FREE, at('W04 Outlook getSchedule re-check', -200, 160),
  W04_NOTE + "const j = $('Merge context').item.json;\nconst end = new Date(Date.parse(j.pick.start) + j.br.slot_minutes * 60000).toISOString();\nreturn { json: { op: 'is_free', broker_id: j.br.id, lead_id: j.ld.id, exclude_booking_id: j.bk.id, start: j.pick.start, end } };")));
did('req free wire', insertBefore(REQ_FREE, 'W04 Outlook getSchedule re-check'));
did('req token move', add(code('p10-w04-token-move', REQ_TOKEN_MOVE, at('Graph token for broker', -200, 160),
  W04_NOTE + "return { json: { op: 'graph_token', broker_id: $('Merge context').item.json.br.id } };")));
did('req token move wire', insertBefore(REQ_TOKEN_MOVE, 'Graph token for broker'));
did('req token cancel', add(code('p10-w04-token-cancel', REQ_TOKEN_CANCEL, at('Graph token for broker (cancel)', -200, 160),
  W04_NOTE + "return { json: { op: 'graph_token', broker_id: $('Decide cancel (w10.applyCancel)').item.json.br.id } };")));
did('req token cancel wire', insertBefore(REQ_TOKEN_CANCEL, 'Graph token for broker (cancel)'));

// 2. context: brand code, verified email, FSP / practice (SortMyCover emails)
const load = node('Load booking, lead, broker, brand');
did('load lead', swap(load, 'query', 'l.email, l.email_status, l.conv_state,', 'l.email, l.email_status, l.email_verified, l.conv_state,'));
did('load broker', swap(load, 'query', 'b.contact_person, b.whatsapp_number,', 'b.contact_person, b.fsp_number, b.practice_name, b.firm_name, b.whatsapp_number,'));
did('load brand', swap(load, 'query', 'br.booking_ui, br.booking_flow_id,', 'br.booking_ui, br.booking_flow_id, br.code AS brand_code,'));
const merge = node('Merge context');
did('merge lead', swap(merge, 'jsCode', 'email: r.email, email_status: r.email_status, conv_state:', 'email: r.email, email_status: r.email_status, email_verified: r.email_verified === true, conv_state:'));
did('merge broker', swap(merge, 'jsCode', 'br: { id: r.broker_id, contact_person: r.contact_person,', 'br: { id: r.broker_id, contact_person: r.contact_person, fsp_number: r.fsp_number || null, practice_name: r.practice_name || null, firm_name: r.firm_name || null,'));
did('merge brand', swap(merge, 'jsCode', 'booking_flow_id: r.booking_flow_id }', 'booking_flow_id: r.booking_flow_id, code: r.brand_code || null }'));

// 3. the cancel confirmation when no times can be offered (lib/w10.offerMessage -> text_session)
did('offer text', swap(node('Build offer (Flow / list / template)'), 'jsCode', '\nreturn { json: { ...j, offer: o,',
  "\nelse if (o.kind === 'text_session') wa = { type: 'text', text: { body: o.body } };\nreturn { json: { ...j, offer: o,"));

// 4. adviser email: SortMyCover -> smc-email-send; other brands -> howzit@ on the app-only credential
did('notice cancel tag', swap(node('Broker notice (cancelled) + rebook once?'), 'jsCode', "op: 'rebook_after_cancel', to: 'broker',", "op: 'rebook_after_cancel', to: 'broker', bk_id: j.bk.id, email_kind: 'cancelled',"));
did('notice move tag', swap(node('Lead + broker messages (moved)'), 'jsCode', "{ json: { to: 'broker', channel:", "{ json: { to: 'broker', brand: j.brand, bk_id: j.bk.id, email_kind: 'moved', channel:"));
did('adviser route', add(code('p10-adviser-route', ADVISER_ROUTE, at(HOWZIT, -220, 0),
  "// SortMyCover brand -> smc-email-send request (Resend, SortMyCover sender); other brands -> relay null -> howzit@.\nconst L = require('lv-automation').w10;\nreturn { json: { ...$json, relay: L.smcBrokerRelay($json, Date.now()) } };")));
did('adviser if', add(ifNode('p10-adviser-smc', ADVISER_SMC, at(HOWZIT, 0, -160), '={{ String(!!$json.relay) }}')));
did('adviser relay', add({ id: 'p10-adviser-relay', name: ADVISER_RELAY, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(HOWZIT, 220, -160), onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: FN + "'/smc-email-send' }}", sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.LINDI_RELAY_TOKEN }}' }, { name: 'Idempotency-Key', value: "={{ $json.relay.idempotency_key || '' }}" }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.relay.body) }}',
    options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } } }));
did('adviser unlink', unlink('Email to broker?', HOWZIT));
did('adviser wire 1', link('Email to broker?', ADVISER_ROUTE));
did('adviser wire 2', link(ADVISER_ROUTE, ADVISER_SMC));
did('adviser wire 3', link(ADVISER_SMC, ADVISER_RELAY, 0));
did('adviser wire 4', link(ADVISER_SMC, HOWZIT, 1));
const howzit = node(HOWZIT);
if (howzit.parameters.authentication !== 'genericCredentialType') {
  howzit.parameters.authentication = 'genericCredentialType';
  howzit.parameters.genericAuthType = 'oAuth2Api';
  howzit.parameters.headerParameters.parameters = howzit.parameters.headerParameters.parameters.filter((p) => p.name !== 'Authorization');
  howzit.credentials = { oAuth2Api: { id: '', name: 'MS Graph app-only - howzit@ Mail.Send' } };
  howzit.onError = 'continueRegularOutput';
  did('howzit credential', true);
} else did('howzit credential', false);

// 5. client email: booking_cancelled after a cancel, booking_updated after a move (SortMyCover leads with a verified email)
did('client cancel', add(code('p10-client-cancel', CLIENT_CANCEL, at('Broker notice (cancelled) + rebook once?', 220, 320),
  "const L = require('lv-automation').w10;\nconst j = $('Decide cancel (w10.applyCancel)').item.json;\nreturn { json: { smc_email: L.smcClientChangeEmail(j, 'booking_cancelled', Date.now()) } };")));
did('client move', add(code('p10-client-move', CLIENT_MOVE, at('Lead + broker messages (moved)', 220, 320),
  "// One email per move (this node gets the lead and the broker item); an after-meeting rebooking is a W05 booking with its own email.\nconst L = require('lv-automation').w10;\nconst d = $('Decide move (w10.applyReschedule)').first().json;\nif (!d.d || d.d.action !== 'move') return [];\nreturn [{ json: { smc_email: L.smcClientChangeEmail(d, 'booking_updated', Date.now(), { start: d.new_start, end: d.new_end }) } }];",
  'runOnceForAllItems')));
did('client if', add(ifNode('p10-client-live', CLIENT_LIVE, at('Broker notice (cancelled) + rebook once?', 440, 320), "={{ String(!!$json.smc_email && $env.DRY_RUN_SENDS !== 'true') }}")));
did('client send', add({ id: 'p10-client-send', name: CLIENT_SEND, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at('Broker notice (cancelled) + rebook once?', 660, 320), onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: FN + "'/smc-client-email' }}", sendHeaders: true,
    headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.LINDI_RELAY_TOKEN }}' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.smc_email) }}',
    options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } } }));
did('client wire 1', link('Broker notice (cancelled) + rebook once?', CLIENT_CANCEL));
did('client wire 2', link('Lead + broker messages (moved)', CLIENT_MOVE));
did('client wire 3', link(CLIENT_CANCEL, CLIENT_LIVE));
did('client wire 4', link(CLIENT_MOVE, CLIENT_LIVE));
did('client wire 5', link(CLIENT_LIVE, CLIENT_SEND, 0));

if (changed.some(([, v]) => v)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w10-w04-requests:', changed.map(([k, v]) => `${k}=${v ? 'changed' : 'already'}`).join(' '));
