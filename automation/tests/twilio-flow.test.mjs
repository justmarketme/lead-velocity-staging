// The WhatsApp nurture flow on the CRM's Twilio account (2026-10-11). Offline and mocked: nothing is sent, no network,
// synthetic +27 numbers only. Covers: Twilio inbound payloads (text, taps, lists, media, Click-to-WhatsApp referral,
// completed Flows) and status callbacks; X-Twilio-Signature on the shared W07 ingress; ContentSid sends for templates,
// session buttons / lists and Flows, numbered by the same plan as the generated Content definitions; every workflow
// send routed through smc-whatsapp-send; communications logging (sub row, caller rows, status receipts, CRM timeline);
// the email verification (Resend from hello@sortmycover.co.za, code typed on WhatsApp, one-tap link); the /j/ join
// link; and the count-at-confirmed-attendance rule in the migration chain (proven on Postgres by the rehearsal and
// tests/W13-claim-tx.local.test.mjs).
// Run: node --test automation/tests/twilio-flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runCode } from './_n8ncode.mjs';
import * as P from '../lib/wa-provider.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';
import * as EV from '../lib/sub-email-verify.mjs';
import { routeInbound } from '../lib/w07.mjs';
import { joinRedirect, confirmDetail, bookingConfirmed } from '../lib/w05.mjs';
import { convert, buildAll, FLOW_TEMPLATES } from '../templates/twilio/build-content.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(A, '..');
const load = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
const W07 = load('W07.json'); const SUB = load('SUB-whatsapp-send.json'); const EVW = load('SUB-email-verify.json');
const { directWaSends } = await import('../lib/wa-route.cjs').then((m) => m.default || m);

const LEAD = '+27600000123'; const SENDER = '+27600000100'; // synthetic SA numbers only
const SIDS = {
  broker_intro_booked: 'HXintro', booking_confirmed: 'HXbc', reminder_2h: 'HXr2', broker_intro_slots_v2: 'HXv2',
  smc_session_buttons_2: 'HXb2', smc_session_buttons_3: 'HXb3', smc_session_list_3: 'HXl3', 'flow:1234567890': 'HXflow',
};
const ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: SENDER, TWILIO_CONTENT_SIDS: JSON.stringify(SIDS), TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_API_KEY_SID: 'SKtest', TWILIO_API_KEY_SECRET: 'secret', TWILIO_AUTH_TOKEN: 'authtok', WEBHOOK_URL: 'https://n8n.example.test',
  TWILIO_MEDIA_BASE_URL: 'https://media.sortmycover.co.za' };
const spec = (n) => JSON.parse(readFileSync(join(A, 'templates', `${n}.json`), 'utf8'));
const tw = { MessageSid: 'SM00000000000000000000000000000001', From: `whatsapp:${LEAD}`, To: `whatsapp:${SENDER}`, SmsStatus: 'received', WaId: LEAD.slice(1) };

// ------------------------------------------------------------------ inbound payloads
test('inbound: Twilio text / quick reply / list (ListId and ButtonPayload) / media normalise to the W07 msg shape', () => {
  const one = (p) => P.normaliseTwilioInbound({ ...tw, ...p }, 1_760_000_000_000)[0].msg;
  assert.equal(one({ Body: 'Hello' }).text, 'Hello');
  assert.deepEqual([one({ ButtonPayload: 'confirm:bk1', ButtonText: 'Confirm' }).payload, one({ ButtonPayload: 'confirm:bk1' }).type], ['confirm:bk1', 'button']);
  assert.equal(one({ ListId: 'slot_2026-10-14T10:00:00+02:00', ListTitle: 'Tue 10:00' }).list_id, 'slot_2026-10-14T10:00:00+02:00');
  const best = one({ ButtonPayload: 'best_mornings', ButtonText: 'Mornings' });
  assert.deepEqual([best.list_id, best.payload], ['best_mornings', null], 'a list row that arrives as ButtonPayload is still a list pick');
  const m = one({ NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages/MM1/Media/ME1', MediaContentType0: 'video/mp4' });
  assert.deepEqual([m.media, m.media_id.startsWith('twilio:https://api.twilio.com/')], ['video', true]);
  assert.equal(one({ Body: 'hi' }).phone_number_id, SENDER.slice(1), 'the receiving sender digits (brands.phone_number_id under Twilio)');
});

test('inbound: Click-to-WhatsApp referral params (ReferralCtwaClid ...) reach W03 as msg.referral', () => {
  const m = P.normaliseTwilioInbound({ ...tw, Body: 'Check my life cover', ReferralCtwaClid: 'ARAkLk', ReferralSourceId: '1203', ReferralSourceType: 'ad', ReferralSourceUrl: 'https://fb.me/x', ReferralHeadline: 'Cover check' }, 0)[0].msg;
  assert.deepEqual(m.referral, { source_id: '1203', source_url: 'https://fb.me/x', source_type: 'ad', headline: 'Cover check', ctwa_clid: 'ARAkLk' });
  assert.equal(routeInbound(m, { lead: null }).route, 'W03');
});

test('inbound: a completed Flow (InteractiveData / FlowData, never Body) becomes flow_complete and books through W05', () => {
  const resp = { flow_token: 'ft1.lead.book.-.1.sig', method: 'teams', slot: '2026-10-14T10:00:00+02:00', email: 'lerato@example.com' };
  for (const p of [{ InteractiveData: JSON.stringify({ flowResponse: resp }) }, { FlowData: JSON.stringify(resp) }]) {
    const m = P.normaliseTwilioInbound({ ...tw, Body: '', ...p }, 0)[0].msg;
    assert.equal(m.payload, 'flow_complete');
    assert.deepEqual(JSON.parse(m.flow_response), resp, 'same nfm_reply.response_json string W05 parses');
    assert.equal(routeInbound(m, { lead: { id: 'l1', conv_state: { state: 'unbooked' } } }).route, 'W05');
  }
});

test('status callbacks: queued/sent/delivered/read (EventType=READ)/undelivered/failed -> the W07 receipt statuses', () => {
  const st = (p) => P.normaliseTwilioInbound({ MessageSid: 'SM9', ...p }, 7000)[0];
  assert.equal(st({ MessageStatus: 'queued' }).status, 'sent');
  assert.equal(st({ MessageStatus: 'delivered' }).status, 'delivered');
  assert.equal(st({ MessageStatus: 'read' }).status, 'read');
  assert.equal(st({ MessageStatus: 'delivered', EventType: 'READ' }).status, 'read');
  assert.match(st({ MessageStatus: 'undelivered', ErrorCode: '63016' }).error, /^63016/);
  assert.deepEqual(Object.keys(st({ MessageStatus: 'sent' })).sort(), ['error', 'kind', 'status', 'ts', 'wamid']);
});

// ------------------------------------------------------------------ signature on the shared ingress
const URL_ = 'https://n8n.example.test/webhook/whatsapp-twilio';
const sign = (params, url = URL_, tok = 'authtok') => createHmac('sha1', tok).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
const ingress = (params, sig, env = ENV) => runCode(W07, 'Verify signature + normalise', { json: {}, env, items: [{ headers: sig ? { 'x-twilio-signature': sig } : {}, body: params, webhookUrl: URL_ }] });

test('X-Twilio-Signature: Auth Token HMAC-SHA1 over URL + sorted params; an API key secret, a tampered param or another URL fail', async () => {
  const p = { ...tw, Body: 'Yes' };
  assert.equal((await ingress(p, sign(p)))[0].json.valid, true);
  assert.equal((await ingress(p, sign(p, URL_, 'secret')))[0].json.valid, false, 'the API key secret cannot sign');
  assert.equal((await ingress({ ...p, Body: 'No' }, sign(p)))[0].json.valid, false);
  assert.equal((await ingress(p, sign(p, 'https://other.example.test/webhook/whatsapp-twilio')))[0].json.valid, false);
  const flow = { ...tw, Body: '', InteractiveData: JSON.stringify({ flowResponse: { flow_token: 'ft1.x' } }) };
  const out = await ingress(flow, sign(flow));
  assert.equal(out[0].json.msg.payload, 'flow_complete');
});

// ------------------------------------------------------------------ outbound: ContentSid sends
test('template send: Content variables follow the submitted spec (body, image path under the media base, URL suffix, quick-reply ids)', () => {
  const wa = { messaging_product: 'whatsapp', to: LEAD.slice(1), type: 'template', template: { name: 'broker_intro_booked', language: { code: 'en' }, components: [
    { type: 'header', parameters: [{ type: 'image', image: { link: 'https://media.sortmycover.co.za/intro/b1/en/v1/card.png' } }] },
    { type: 'body', parameters: ['Lerato', 'Mark Smith FS', '12345', 'Mark Smith', 'Microsoft Teams', 'Tue 14 Oct', '10:00'].map((text) => ({ type: 'text', text })) },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'bk1' }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'reschedule:bk1' }] },
    // index 2 (Cancel) left out on purpose: Meta would send the button text; Twilio gets the same slug
  ] } };
  const r = S.twilioRequest({ provider: 'twilio', payload: wa }, ENV);
  const form = new URLSearchParams(r.body);
  assert.equal(form.get('ContentSid'), 'HXintro');
  assert.equal(form.get('To'), `whatsapp:${LEAD}`); assert.equal(form.get('From'), `whatsapp:${SENDER}`);
  assert.equal(form.get('StatusCallback'), 'https://n8n.example.test/webhook/whatsapp-twilio');
  assert.equal(form.get('Body'), null, 'no Body next to a ContentSid');
  assert.deepEqual(JSON.parse(form.get('ContentVariables')), { 1: 'Lerato', 2: 'Mark Smith FS', 3: '12345', 4: 'Mark Smith', 5: 'Microsoft Teams', 6: 'Tue 14 Oct', 7: '10:00', 8: 'intro/b1/en/v1/card.png', 9: 'bk1', 10: 'reschedule:bk1', 11: 'cancel' });
  assert.match(r.auth, /^Basic /);
  const off = JSON.parse(JSON.stringify(wa)); off.template.components[0].parameters[0].image.link = 'https://elsewhere.example.test/card.png';
  assert.equal(S.twilioRequest({ payload: off }, ENV).twilio_skip, 'twilio_media_outside_base', 'Twilio needs the static media domain');
  assert.equal(S.twilioRequest({ payload: wa }, { ...ENV, TWILIO_CONTENT_SIDS: '{}' }).twilio_skip, 'twilio_content_sid_missing');
});

test('the generated Content definitions use exactly the numbers the sender fills (one plan, no drift)', () => {
  for (const name of FLOW_TEMPLATES) {
    const def = convert(spec(name));
    const used = new Set([...JSON.stringify(def.content.types).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    const plan = P.twilioVarPlan(spec(name));
    assert.deepEqual([...used].sort((a, b) => a - b), plan.map((s) => s.n), `${name}: placeholders = plan`);
    assert.deepEqual(Object.keys(def.content.variables).map(Number).sort((a, b) => a - b), plan.map((s) => s.n), `${name}: a sample for every variable`);
    assert.equal(def._meta.approval.category, 'UTILITY');
  }
  const intro = convert(spec('broker_intro_booked')).content.types['twilio/card'];
  assert.match(intro.media[0], /^__TWILIO_MEDIA_BASE_URL__\/\{\{8\}\}$/);
  const v2 = convert(spec('broker_intro_slots_v2')).content.types['whatsapp/flows'];
  assert.deepEqual([v2.flow_token, v2.is_flow_first_page_endpoint, v2.flow_first_page_id], ['{{6}}', true, 'METHOD']);
  assert.ok(convert(spec('reminder_2h')).content.types['whatsapp/card'], 'text-only templates with buttons -> whatsapp/card');
  execFileSync(process.execPath, [join(A, 'templates', 'twilio', 'build-content.mjs'), '--check'], { stdio: 'pipe' }); // committed files are current
});

test('Flow launch: template FLOW button token and the in-session Flow message map to whatsapp/flows Content', () => {
  const tpl = { to: LEAD.slice(1), type: 'template', template: { name: 'broker_intro_slots_v2', components: [
    { type: 'header', parameters: [{ type: 'image', image: { link: 'https://media.sortmycover.co.za/intro/b1/card.png' } }] },
    { type: 'body', parameters: ['Lerato', 'Mark Smith FS', '12345', 'Mark Smith'].map((text) => ({ type: 'text', text })) },
    { type: 'button', sub_type: 'flow', index: '0', parameters: [{ type: 'action', action: { flow_token: 'ft1.l1.book.-.99.sig' } }] }] } };
  const r = S.twilioRequest({ payload: tpl }, ENV);
  assert.deepEqual(JSON.parse(new URLSearchParams(r.body).get('ContentVariables')), { 1: 'Lerato', 2: 'Mark Smith FS', 3: '12345', 4: 'Mark Smith', 5: 'intro/b1/card.png', 6: 'ft1.l1.book.-.99.sig' });
  const session = { to: LEAD.slice(1), type: 'interactive', interactive: { type: 'flow', body: { text: 'Pick a new time' }, action: { name: 'flow', parameters: { flow_message_version: '3', flow_id: '1234567890', flow_token: 'resched:bk1', flow_cta: 'Pick a new time', flow_action: 'data_exchange' } } } };
  const s = P.toTwilioRequest(session, ENV);
  assert.deepEqual([s.form.ContentSid, s.via, JSON.parse(s.form.ContentVariables)[2]], ['HXflow', 'session_content', 'resched:bk1']);
  assert.equal(P.toTwilioRequest({ ...session, interactive: { ...session.interactive, action: { parameters: { flow_id: '999', flow_token: 't' } } } }, ENV).reason, 'twilio_flow_content_missing', 'a Flow never degrades to text');
});

test('session interactive: buttons and lists use the generic Content templates (ids / titles as variables)', () => {
  const btn = { to: LEAD.slice(1), type: 'interactive', interactive: { type: 'button', body: { text: 'Can we use your details?' }, action: { buttons: [{ type: 'reply', reply: { id: 'consent_yes', title: 'Yes, go ahead' } }, { type: 'reply', reply: { id: 'no_thanks', title: 'No thanks' } }] } } };
  const b = P.toTwilioRequest(btn, ENV);
  assert.deepEqual([b.form.ContentSid, JSON.parse(b.form.ContentVariables)], ['HXb2', { 1: 'Can we use your details?', 2: 'Yes, go ahead', 3: 'consent_yes', 4: 'No thanks', 5: 'no_thanks' }]);
  const list = { to: LEAD.slice(1), type: 'interactive', interactive: { type: 'list', body: { text: 'Open times' }, action: { button: 'See times', sections: [{ rows: [1, 2, 3].map((k) => ({ id: `slot_2026-10-1${k}T10:00:00+02:00`, title: `Day ${k} 10:00` })) }] } } };
  const l = P.toTwilioRequest(list, ENV);
  const v = JSON.parse(l.form.ContentVariables);
  assert.deepEqual([l.form.ContentSid, v[2], v[3], v[4], v[5]], ['HXl3', 'See times', 'slot_2026-10-11T10:00:00+02:00', 'Day 1 10:00', 'Day 1 10:00']);
  const defs = buildAll();
  assert.equal(defs['smc_session_list_3.json'].content.types['twilio/list-picker'].items.length, 3);
  assert.equal(defs['smc_session_buttons_2.json']._meta.approval, null, 'session types need no WhatsApp approval');
});

// ------------------------------------------------------------------ one transport for every workflow send
test('every in-scope workflow sends through smc-whatsapp-send (no direct Graph / WhatsApp node send left)', () => {
  for (const w of ['W03', 'W05', 'W06', 'W07', 'W08', 'W09', 'W10', 'W11', 'W12', 'W13', 'W15', 'W23', 'W28', 'SUB-email-verify']) {
    const wf = load(`${w}.json`);
    assert.deepEqual(directWaSends(wf), [], `${w} still posts to WhatsApp directly`);
  }
  // only the sub itself holds the Graph and Twilio transports
  assert.deepEqual(directWaSends(SUB), ['Graph POST /messages']);
  assert.ok(SUB.nodes.some((n) => /api\.twilio\.com\/2010-04-01\/Accounts\/.+\/Messages\.json/.test(n.parameters.url || '')));
});

test('a routed send node: the adapter turns the body the workflow built into a prebuilt sub input; the sub returns the id shape callers read', async () => {
  const W09 = load('W09.json');
  const [adapter] = await Promise.all([runCode(W09, 'SUB input (Send WhatsApp)', { json: { send: { wa: { messaging_product: 'whatsapp', to: LEAD.slice(1), type: 'text', text: { body: 'See you soon' } } } } })]);
  assert.deepEqual([adapter.json.kind, adapter.json.record, adapter.json.caller, adapter.json.wa.text.body], ['prebuilt', false, 'W09', 'See you soon']);
  assert.match(adapter.json.correlation, /^W09:Send WhatsApp:/);
  assert.equal(W09.nodes.find((n) => n.name === 'Send WhatsApp').parameters.options.waitForSubWorkflow, true);
  // through the sub: valid, sent as text, Twilio form built, result carries messages[0].id = the Twilio MessageSid
  const n = (await runCode(SUB, 'Normalise input', { json: adapter.json })).json;
  assert.equal(n.valid, true);
  const d = (await runCode(SUB, 'Decide (suppression, allow-list, window, template, dry run)', { json: {}, env: ENV, refs: { 'Normalise input': n } })).json;
  assert.deepEqual([d.action, d.sent_as, d.record], ['send', 'text', false]);
  const req = (await runCode(SUB, 'Build Twilio request (Messages API form)', { json: {}, env: ENV, refs: { 'Decide (suppression, allow-list, window, template, dry run)': d } })).json;
  assert.equal(new URLSearchParams(req.body).get('Body'), 'See you soon');
  const interp = (await runCode(SUB, 'Interpret Graph response', { json: { statusCode: 201, body: { sid: 'SM0000000000000000000000000000abcd', status: 'queued' } } })).json;
  const res = (await runCode(SUB, 'Result', { json: {}, refs: { 'Decide (suppression, allow-list, window, template, dry run)': d, 'Interpret Graph response': interp } })).json;
  assert.equal(res.messages[0].id, 'SM0000000000000000000000000000abcd');
  assert.equal(res.body.messages[0].id, 'SM0000000000000000000000000000abcd', 'W05 reads $json.body.messages');
});

test('prebuilt sends: suppression still applies (W15 STOP confirmation alone bypasses it); DRY_RUN_SENDS returns a dry id', () => {
  const n = S.normalise({ kind: 'prebuilt', wa: { to: LEAD, type: 'text', text: { body: 'x' } }, correlation: 'c1', record: true });
  assert.equal(S.decide(n, { suppressed: true }, ENV).reason, 'suppressed');
  const stop = S.normalise({ kind: 'prebuilt', wa: { to: LEAD, type: 'text', text: { body: 'You will get no more messages.' } }, correlation: 'c2', bypass_suppression: true });
  assert.equal(S.decide(stop, { suppressed: true }, ENV).action, 'send');
  const dry = S.decide(n, {}, { ...ENV, DRY_RUN_SENDS: 'true' });
  assert.deepEqual([dry.action, S.result(dry).messages[0].id], ['dry', 'dry:c1']);
  assert.equal(S.normalise({ kind: 'prebuilt', wa: { to: LEAD, type: 'carousel' }, correlation: 'c3' }).valid, false);
});

// ------------------------------------------------------------------ communications logging (the CRM timeline)
test('communications: the sub records record:true sends on the lead / broker resolved from the number; caller rows and receipts key on the SID', () => {
  const ctx = SUB.nodes.find((n) => n.name.startsWith('Load context')).parameters.query;
  assert.match(ctx, /regexp_replace\(coalesce\(l\.phone, ''\), '\\D', '', 'g'\) = \$3/, 'lead resolved from the recipient digits');
  assert.match(ctx, /resolved_lead_id[\s\S]*resolved_broker_id/);
  const rec = SUB.nodes.find((n) => n.name.startsWith('Record communications row')).parameters;
  assert.match(rec.query, /INSERT INTO public\.communications \(channel, direction, sender_type, recipient_type, recipient_contact, lead_id, broker_id, brand_id/);
  assert.match(rec.query, /'whatsapp', 'outbound'/);
  const upd = SUB.nodes.find((n) => n.name.startsWith('Update communications row')).parameters.query;
  assert.match(upd, /external_id = NULLIF\(\$3, ''\)/, 'external_id = Twilio MessageSid');
  // W07: inbound rows (lead_id + broker_id) and status callbacks update the row by external_id (the MessageSid)
  const inbound = W07.nodes.find((n) => n.name.startsWith('Store inbound')).parameters.query;
  assert.match(inbound, /external_id, lead_id, broker_id[\s\S]*'whatsapp', 'inbound'/);
  const receipt = W07.nodes.find((n) => n.name.startsWith('Status receipt')).parameters.query;
  assert.match(receipt, /WHERE channel = 'whatsapp' AND external_id = \$1/);
  // the CRM hub reads communications by lead_id (UnifiedCommunicationHub)
  const hub = readFileSync(join(ROOT, 'src', 'components', 'communications', 'UnifiedCommunicationHub.tsx'), 'utf8');
  assert.match(hub, /from\('communications'\)[\s\S]*eq\('lead_id', recipientId\)/);
  // record:true where the workflow has no log node of its own
  for (const [w, node] of [['W05', 'Send WhatsApp'], ['W10', 'Send WhatsApp'], ['W28', 'WhatsApp send list'], ['W23', 'WhatsApp: got it']]) {
    assert.match(load(`${w}.json`).nodes.find((n) => n.name === `SUB input (${node})`).parameters.jsCode, /record: true/, `${w} ${node}`);
  }
});

// ------------------------------------------------------------------ W23 broker video from Twilio
test('W23: a Twilio MediaUrl is downloaded with Basic auth (API key); a Meta media id still goes through Graph', () => {
  const W23 = load('W23.json');
  const c = W23.connections;
  assert.deepEqual(c['Find broker by number (unknown numbers stop here)'].main[0].map((x) => x.node), ['Twilio media? (MediaUrl, WHATSAPP_PROVIDER=twilio)']);
  assert.deepEqual(c['Twilio media? (MediaUrl, WHATSAPP_PROVIDER=twilio)'].main.map((o) => o[0].node), ['Download media (Twilio MediaUrl, Basic auth)', 'Get media URL']);
  assert.deepEqual(c['Download media (Twilio MediaUrl, Basic auth)'].main[0].map((x) => x.node), ['Prepare job (WhatsApp)']);
  const dl = W23.nodes.find((n) => n.name === 'Download media (Twilio MediaUrl, Basic auth)').parameters;
  assert.match(dl.headerParameters.parameters[0].value, /TWILIO_API_KEY_SID/);
  assert.equal(dl.options.response.response.responseFormat, 'file');
  const cond = W23.nodes.find((n) => n.name.startsWith('Twilio media?')).parameters.conditions.conditions[0].leftValue;
  assert.match(cond, /api\\\\\.twilio\\\\\.com|api\\\.twilio\\\.com/);
  assert.equal(P.twilioMediaRequest('twilio:https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME', { TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' }).headers.Authorization, 'Basic ' + Buffer.from('AC:t').toString('base64'), 'falls back to the CRM AccountSid:AuthToken pair');
});

// ------------------------------------------------------------------ email verification (clause 5.8(b))
const SECRET = 'x'.repeat(40);
const lead = (o = {}) => ({ id: '61000000-0000-4000-8000-000000000001', first_name: 'Lerato', email: 'lerato@example.com', email_verified: false, adviser_name: 'Mark Smith', ...o });
test('email verification: Resend email from hello@sortmycover.co.za with code + link; only the hash is stored; 10-min gap', () => {
  const now = Date.parse('2026-10-11T10:00:00Z');
  const p = EV.issuePlan(lead(), { EMAIL_VERIFY_SECRET: SECRET, RESEND_API_KEY: 're_test' }, now);
  assert.equal(p.action, 'send');
  assert.equal(p.resend.url, 'https://api.resend.com/emails');
  assert.equal(p.resend.body.from, 'SortMyCover <hello@sortmycover.co.za>');
  assert.deepEqual(p.resend.body.to, ['lerato@example.com']);
  const code = /code: (\d{6})/.exec(p.resend.body.text)[1];
  assert.match(p.resend.body.text, /https:\/\/sortmycover\.co\.za\/v\/ev1\./);
  assert.ok(!JSON.stringify(p.set).includes(code), 'the code itself is never stored');
  assert.match(p.resend.headers['Idempotency-Key'], /^ev:61000000/);
  assert.equal(EV.issuePlan(lead({ email_verify_sent_at: new Date(now - 60_000).toISOString() }), { EMAIL_VERIFY_SECRET: SECRET, RESEND_API_KEY: 'k' }, now).reason, 'recently_sent');
  assert.equal(EV.issuePlan(lead({ email_verified: true }), { EMAIL_VERIFY_SECRET: SECRET, RESEND_API_KEY: 'k' }, now).reason, 'already_verified');
  assert.equal(EV.issuePlan(lead(), { RESEND_API_KEY: 'k' }, now).reason, 'secret_missing');
  // the typed code (W07 -> smc-email-verify op code)
  const stored = { ...lead(), ...p.set };
  assert.deepEqual([EV.codePlan(stored, code, now + 1000).ok, EV.codePlan(stored, code, now + 1000).set.email_verified_via], [true, 'code']);
  const wrong = EV.codePlan(stored, '000000' === code ? '111111' : '000000', now);
  assert.deepEqual([wrong.ok, wrong.set.email_verify_attempts, wrong.reply], [false, 1, EV.REPLY.wrong]);
  assert.equal(EV.codePlan(stored, code, now + 25 * 3600_000).reissue, true, 'expired -> a fresh code is sent');
  // the one-tap link
  const token = /\/v\/(ev1\.[^\s]+)/.exec(p.resend.body.text)[1];
  assert.equal(EV.leadIdFromToken(token), stored.id);
  assert.equal(EV.linkPlan(token, stored, { EMAIL_VERIFY_SECRET: SECRET }, now).set.email_verified_via, 'link');
  assert.equal(EV.linkPlan(token, { ...stored, email: 'other@example.com' }, { EMAIL_VERIFY_SECRET: SECRET }, now).status, 404, 'a changed email kills old links');
  assert.equal(EV.interpretResend({ statusCode: 200, body: { id: 're_123' } }).external_id, 're_123');
});

test('email verification is wired: W05 issues after an invite booking, W07 routes a typed code, the sub is DRY_RUN-gated and logs to communications', async () => {
  const W05 = load('W05.json');
  assert.deepEqual(W05.connections['Save event ids + lead (stage, broker, invite email)'].main[0].map((x) => x.node).sort(), ['Email verification item (invite email stored)', 'Timeline: booked']);
  assert.equal(W05.nodes.find((n) => n.name === '-> Email verify (smc-email-verify issue)').parameters.workflowId.value, 'smc-email-verify');
  // W07 route: only a 6-digit message while a code is outstanding
  const msg = (text) => ({ text, payload: null, list_id: null, from: LEAD });
  assert.equal(routeInbound(msg('482 913'), { lead: { id: 'l', email_verify_pending: true, conv_state: {} } }).route, 'email_code');
  assert.notEqual(routeInbound(msg('482913'), { lead: { id: 'l', email_verify_pending: false, conv_state: {} } }).route, 'email_code');
  assert.equal(routeInbound(msg('STOP'), { lead: { id: 'l', email_verify_pending: true, conv_state: {} } }).route, 'W15');
  const route = W07.nodes.find((n) => n.name === 'Route');
  const i = route.parameters.rules.values.findIndex((v) => v.outputKey === 'email_code');
  assert.deepEqual(W07.connections.Route.main[i].map((x) => x.node), ['Email code -> verify item']);
  const item = await runCode(W07, 'Email code -> verify item', { json: { lead: { id: 'l1' }, msg: { text: '482 913', wamid: 'SM1', from: LEAD } } });
  assert.deepEqual(item.json, { op: 'code', lead_id: 'l1', code: '482913', wamid: 'SM1', to: LEAD });
  assert.match(W07.nodes.find((n) => n.name === 'Route (deterministic) + prefilter').parameters.jsCode, /email_code' \? '\[email verification code\]'/, 'the code is never stored in communications');
  // the sub: gate, Resend, communications row without the code
  const gate = EVW.nodes.find((n) => n.name === 'Live send? (Resend)');
  assert.match(JSON.stringify(gate.parameters), /DRY_RUN_SENDS !== 'true'/);
  const log = EVW.nodes.find((n) => n.name.startsWith('Log email in communications')).parameters.query;
  assert.match(log, /'email', 'outbound'[\s\S]*'\[email verification: code \+ link\]'/);
  const http = EVW.nodes.find((n) => n.name.startsWith('Resend POST'));
  assert.match(http.parameters.url, /resend\.url/);
  const plan = await runCode(EVW, 'Plan issue (code + link, 10-min gap)', { json: lead({ brand_id: 'b', broker_id: null }), env: { EMAIL_VERIFY_SECRET: SECRET, RESEND_API_KEY: 'k' } });
  assert.equal(plan.json.action, 'send');
  const hook = EVW.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.deepEqual([hook.parameters.path, hook.parameters.httpMethod], ['v/:token', 'GET']);
});

// ------------------------------------------------------------------ Teams join link
test('booking_confirmed carries the Teams join link; GET /j/{id} redirects only a live online booking to a meeting host', () => {
  const bk = '71000000-0000-4000-8000-000000000001';
  assert.equal(confirmDetail('teams', bk), `Microsoft Teams (join link: https://sortmycover.co.za/j/${bk})`);
  assert.equal(confirmDetail('phone', bk), 'phone call');
  const wa = bookingConfirmed({ lead: { first_name: 'Lerato', phone: LEAD }, broker: { adviser_name: 'Mark Smith' } }, { start: '2026-10-14T10:00:00+02:00', method: 'teams' }, { id: bk });
  assert.match(wa.template.components.find((c) => c.type === 'body').parameters[4].text, /\/j\/71000000/);
  const live = { id: bk, method: 'teams', status: 'confirmed', join_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x' };
  assert.deepEqual([joinRedirect({ booking_id: bk }, live).status, joinRedirect({ booking_id: bk }, live).headers.Location], [302, live.join_url]);
  assert.equal(joinRedirect({ booking_id: bk }, { ...live, status: 'cancelled' }).status, 404);
  assert.equal(joinRedirect({ booking_id: bk }, { ...live, join_url: 'https://evil.example.test/x' }).status, 404, 'only meeting hosts');
  assert.equal(joinRedirect({ booking_id: 'nope' }, live).status, 404);
  const jHook = load('W05.json').nodes.find((n) => n.name === 'GET /j/:booking_id (join link)');
  assert.equal(jHook.parameters.path, 'j/:booking_id');
  // n8n prefixes a :param path with the webhookId: the public /j/ and /v/ links are rewritten to exactly those
  const y = readFileSync(join(A, 'vps', 'traefik', 'docker-compose.traefik.yml'), 'utf8');
  assert.ok(y.includes(`link-rewrite.replacepathregex.replacement=/webhook/${jHook.webhookId}/j/$$1`));
  const vHook = EVW.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.ok(y.includes(`link-rewrite-v.replacepathregex.replacement=/webhook/${vHook.webhookId}/v/$$1`));
});

// ------------------------------------------------------------------ count at confirmed attendance (DB rule, statically)
test('migration chain: a lead is reserved at routing and COUNTED at booked + attendance confirmed; routing needs a ready broker (FSP)', () => {
  const m02 = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011020000_smc_02_core.sql'), 'utf8');
  const m03 = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011030000_smc_03_orders_outcomes.sql'), 'utf8');
  assert.match(m02, /CONSTRAINT brokers_smc_routing_ready CHECK \(\s*routing_on IS NOT TRUE OR \(\s*btrim\(coalesce\(fsp_number/);
  const route = /FUNCTION public\.smc_leads_route_check\(\)[\s\S]*?END \$\$;/.exec(m03)[0];
  const attach = /FUNCTION public\.smc_leads_attach_order\(\)[\s\S]*?END \$\$;/.exec(m03)[0];
  assert.match(route, /smc_broker_ready\(NEW\.broker_id\)/);
  assert.match(route, /held_broker_not_ready/);
  assert.ok(!/INSERT INTO public\.lead_order_items/.test(route + attach), 'routing never counts a lead');
  const count = /FUNCTION public\.smc_count_on_confirm\(\)[\s\S]*?END \$\$;/.exec(m03)[0];
  assert.match(count, /NEW\.confirmed_at IS NULL/);
  assert.match(count, /INSERT INTO public\.lead_order_items/);
  assert.match(m03, /CREATE TRIGGER smc_count_on_confirm\s+AFTER INSERT OR UPDATE OF status, confirmed_at ON public\.appointments/);
  assert.match(m03, /CREATE TRIGGER smc_leads_release_reservation\s+BEFORE UPDATE OF opted_out_at, stage ON public\.leads/);
  assert.match(m03, /CREATE TRIGGER smc_outcome_release_reservation\s+AFTER INSERT ON public\.outcomes/);
  // the undo files were regenerated by the rehearsal and drop the new objects
  const undo = readFileSync(join(ROOT, 'supabase', 'migrations', 'undo', '20261011030000_smc_03_orders_outcomes.undo.sql'), 'utf8');
  for (const o of ['smc_count_on_confirm', 'smc_broker_ready', 'smc_leads_release_reservation', 'order_state']) assert.ok(undo.includes(o), `undo drops ${o}`);
  const undo02 = readFileSync(join(ROOT, 'supabase', 'migrations', 'undo', '20261011020000_smc_02_core.undo.sql'), 'utf8');
  assert.ok(undo02.includes('brokers_smc_routing_ready'));
});

test('tier C (under R750): the held / closed templates are Content definitions with one body variable; a held notice maps 1:1 (mocked, no send)', async () => {
  const W01 = await import('../lib/w01.mjs');
  for (const name of ['lead_low_budget_held', 'lead_low_budget_closed']) {
    assert.ok(FLOW_TEMPLATES.includes(name), name);
    const c = JSON.parse(readFileSync(join(A, 'templates', 'twilio', 'content', `${name}.json`), 'utf8'));
    assert.deepEqual(c._meta.var_plan, [{ n: 1, kind: 'body' }], name);
    const body = c.content.types['whatsapp/card'].body;
    assert.match(body, /Reply STOP to opt out\.$/, name);
    assert.doesNotMatch(body, /\bR\d|premium|guarantee|will call you|recommend/i, `${name}: no amounts, no promise of a call, no advice`);
  }
  const n = W01.lowBudgetHeld({ id: '00000000-0000-4000-8000-0000000a0c09', phone: LEAD, first_name: 'Nomsa Dlamini' });
  const wa = { messaging_product: 'whatsapp', to: n.to.slice(1), type: 'template', template: { name: n.template, language: { code: 'en' }, components: [{ type: 'body', parameters: n.variables.map((text) => ({ type: 'text', text })) }] } };
  const r = S.twilioRequest({ provider: 'twilio', payload: wa }, { ...ENV, TWILIO_CONTENT_SIDS: JSON.stringify({ ...SIDS, lead_low_budget_held: 'HXlowheld' }) });
  const form = new URLSearchParams(r.body);
  assert.equal(form.get('ContentSid'), 'HXlowheld'); assert.deepEqual(JSON.parse(form.get('ContentVariables')), { 1: 'Nomsa' });
  assert.equal(form.get('To'), `whatsapp:${LEAD}`); assert.ok(!/\+1/.test(form.get('To')));
});

test('migration chain, tier C: routed only with the standing yes or an admin (manual_low_budget), held_low_budget otherwise, accept recorded, counting unchanged', () => {
  const m02 = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011020000_smc_02_core.sql'), 'utf8');
  const m03 = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011030000_smc_03_orders_outcomes.sql'), 'utf8');
  const m05 = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011050000_smc_05_access.sql'), 'utf8');
  assert.match(m02, /ADD COLUMN IF NOT EXISTS accepts_low_budget\s+boolean NOT NULL DEFAULT false/);
  assert.match(m02, /lead_tier IN \('A','B','C'\)/);
  assert.match(m05, /NEW\.accepts_low_budget\s+IS DISTINCT FROM OLD\.accepts_low_budget/, 'brokers cannot switch it on themselves');
  const route = /FUNCTION public\.smc_leads_route_check\(\)[\s\S]*?END \$\$;/.exec(m03)[0];
  assert.match(route, /held_low_budget/); assert.match(route, /manual_low_budget/); assert.match(route, /accepts_low_budget/);
  assert.ok(!/disqualified/.test(route), 'tier C is never disqualified by routing');
  assert.match(m03, /CREATE TRIGGER smc_leads_route_check\s+BEFORE INSERT OR UPDATE OF broker_id, brand_id, budget_band ON public\.leads/);
  assert.match(m03, /INSERT INTO public\.lead_offers AS o[\s\S]*?decided_via/);
  const undo02 = readFileSync(join(ROOT, 'supabase', 'migrations', 'undo', '20261011020000_smc_02_core.undo.sql'), 'utf8');
  assert.ok(undo02.includes('"accepts_low_budget"'), 'undo drops the switch');
});

// ------------------------------------------------------------------ fixtures / config: SA numbers only
test('no +1 / US number in the Twilio fixtures, content definitions or env examples', () => {
  const files = [join(A, 'tests', 'twilio-flow.test.mjs'), join(A, 'tests', 'wa-provider.test.mjs'), join(A, 'SETUP-TWILIO.md'),
    ...readdirSync(join(A, 'templates', 'twilio', 'content')).map((f) => join(A, 'templates', 'twilio', 'content', f))];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/(whatsapp:)?\+1[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/.test(t), `${f} has a +1 number`);
  }
});
