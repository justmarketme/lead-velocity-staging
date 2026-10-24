// Banners on every lead-facing WhatsApp message (Jono, 19 Oct 2026): the template banner variants (generated Content,
// the sender's switch per TWILIO_CONTENT_SIDS key and method), the session banners in W03 / W07 (WA_SESSION_BANNERS),
// and the reschedule card in W07. Offline, synthetic data only.
// Run: node --test automation/tests/wa-banners.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCode, ifBranch } from './_n8ncode.mjs';
import * as P from '../lib/wa-provider.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';
import { classifyOp } from '../lib/w10.mjs';
import { routeInbound } from '../lib/w07.mjs';
import { buildAll } from '../templates/twilio/build-content.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const W03 = load('W03.json'); const W07 = load('W07.json');
const H = (n) => `https://n8n.sortmycover.co.za/media/whatsapp/headers/header-${n}.png`;
const BK = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: '+27600000000', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok' };
const sids = (o) => ({ ...ENV, TWILIO_CONTENT_SIDS: JSON.stringify(o) });
const tpl = (name, body, buttons = []) => {
  const components = [{ type: 'body', parameters: body.map((text) => ({ type: 'text', text })) }];
  buttons.forEach((b, i) => { if (b.url !== undefined) components.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: b.url }] }); else if (b) components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: b.qr }] }); });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: '27820000001', type: 'template', template: { name, language: { code: 'en' }, components } };
};
const send = (payload, env) => {
  const r = S.twilioRequest({ payload }, env);
  if (r.twilio_skip) return { skip: r.twilio_skip };
  const f = Object.fromEntries(new URLSearchParams(r.body));
  return { sid: f.ContentSid, vars: JSON.parse(f.ContentVariables || '{}') };
};
// what lib/w05.mjs bookingConfirmed sends (v1 shape): {{5}} = confirmDetail(method, id)
const confirmed = (detail) => tpl('booking_confirmed', ['Lerato', 'Mark Smith', 'Tue 21 Oct', '10:00', detail],
  [{ url: BK }, { qr: `confirm:${BK}` }, { qr: `reschedule:${BK}` }, { qr: `cancel:${BK}` }]);
const TEAMS = `Microsoft Teams (join link: https://sortmycover.co.za/j/${BK})`;

// ------------------------------------------------------------------ generated Content
test('every banner variant: header card, twilio/card, own approval name; no STOP line and no Add to calendar unless it mirrors a 17 Oct submission', () => {
  const defs = buildAll();
  const STOPLESS = (t) => String(t || '').replace(/\s*Reply STOP to opt out\.\s*$/, '');
  for (const v of P.TEMPLATE_VARIANTS) {
    const d = defs[`${v.key}.json`]; const v1 = defs[`${v.base}.json`];
    assert.ok(d, v.key);
    const card = d.content.types['twilio/card'];
    if (v.keep_header) assert.deepEqual(card.media, v1.content.types['twilio/card'].media, `${v.key}: v1 media header kept`);
    else assert.deepEqual(card.media, [H(v.header)], v.key);
    assert.equal(d._meta.approval.name, `smc_${v.key}`); assert.equal(d._meta.approval.category, v1._meta.approval.category);
    assert.equal(d.content.friendly_name, `smc_${v.key}`);
    if (v.sid) {
      assert.match(card.title, /Reply STOP to opt out\.$/, `${v.key}: mirrors what was submitted`);
      assert.ok(v.superseded_by, `${v.key}: names its replacement`);
    } else {
      assert.doesNotMatch(card.title, /\bSTOP\b/, v.key);
      assert.ok(!(card.actions || []).some((x) => /calendar/i.test(x.title) || /\/c\//.test(x.url || '')), `${v.key}: no Add to calendar`);
    }
    assert.doesNotMatch(card.title, /\bfree\b|\blicensed\b|virtual assistant/i);
    if (v.key !== 'broker_intro_booked_v2') assert.doesNotMatch(card.title, /\bAI\b/, v.key);
    if (!v.body && !v.buttons && !v.derive) {
      const t1 = v1.content.types; const b1 = (t1['whatsapp/card'] || t1['twilio/card'] || t1['twilio/text']);
      assert.equal(card.title, v.sid ? (b1.body || b1.title) : STOPLESS(b1.body || b1.title), `${v.key}: same body`);
      assert.deepEqual((card.actions || []).map((x) => [x.type, x.title]), (b1.actions || []).map((x) => [x.type, x.title]), `${v.key}: same buttons`);
    }
  }
  // the 17 Oct submissions are recorded, not re-created, and each has a STOP-free successor
  assert.equal(defs['booking_confirmed_v2.json']._meta.submitted, 'HXff2e2c298cc23411336ccd907ca1f5f4');
  assert.equal(defs['qualify_budget_v2.json']._meta.submitted, 'HXf52cd6d5e4631e1a3b51906d463f0178');
  for (const k of ['reminder_24h_v3', 'reminder_2h_v3', 'missed_you_v3', 'booking_confirmed_v4']) assert.ok(defs[`${k}.json`], k);
  assert.deepEqual(defs['missed_you_v3.json'].content.types['twilio/card'].media, [H('reschedule')]);
  assert.deepEqual(defs['prep_nudge_v2.json'].content.types['twilio/card'].media, [H('expect')]);
  for (const k of ['reach_check_v2', 'attended_thanks_v2']) assert.deepEqual(defs[`${k}.json`].content.types['twilio/card'].media, [H('aftercall')]);
  // the newer row wins when both SIDs are set (first listed)
  const keys = P.TEMPLATE_VARIANTS.map((v) => v.key);
  assert.ok(keys.indexOf('missed_you_v3') < keys.indexOf('missed_you_v2'));
  // video templates keep their own video (no variant); the intro cards keep their card
  for (const k of ['intro_media', 'unbooked_nudge_24h', 'broker_intro_slots']) assert.ok(!P.TEMPLATE_VARIANTS.some((v) => v.base === k), k);
  // the reschedule card carries no STOP line either
  assert.doesNotMatch(defs['reschedule_card.json'].content.types['twilio/card'].title, /\bSTOP\b/);
});

test('Add to calendar replaced: what_to_expect_v2 sends reschedule:<booking> from the v1 URL value', () => {
  const env = sids({ what_to_expect: 'HXw1', what_to_expect_v2: 'HXw2' });
  const r = send(tpl('what_to_expect', ['Lerato', 'Mark Smith', 'Microsoft Teams'], [{ url: BK }]), env);
  assert.deepEqual(r, { sid: 'HXw2', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: 'Microsoft Teams', 4: `reschedule:${BK}` } });
  // unused on the v4 path, so no variant: broker_intro_booked (/start/ bookings never get it), qualify_budget (start_here)
  for (const k of ['broker_intro_booked_v2', 'qualify_budget_v3']) assert.ok(!P.TEMPLATE_VARIANTS.some((v) => v.key === k), k);
});

test('v4b13: every TEMPLATE_VARIANTS entry has a committed content file (and it is current)', () => {
  const defs = buildAll();
  for (const v of P.TEMPLATE_VARIANTS) {
    const f = new URL(`../templates/twilio/content/${v.key}.json`, import.meta.url);
    let txt = null; try { txt = readFileSync(f, 'utf8'); } catch (_) { /* missing */ }
    assert.ok(txt, `${v.key}: no content file`);
    assert.equal(txt, JSON.stringify(defs[`${v.key}.json`], null, 2) + '\n', `${v.key}: stale`);
  }
});

test('v4b5 reminders: "Yes, confirmed" (confirm:<booking>) + Reschedule; 2h Teams adds Join Teams call', () => {
  const defs = buildAll();
  const a24 = defs['reminder_24h_v3.json'].content.types['twilio/card'];
  assert.deepEqual(a24.media, [H('reminder')]);
  assert.deepEqual(a24.actions.map((x) => x.title), ['Yes, confirmed', 'Reschedule']);
  assert.doesNotMatch(a24.title, /STOP|Tap Confirm/);
  const env = sids({ reminder_24h: 'HX24', reminder_24h_v3: 'HX24c', reminder_2h: 'HX2', reminder_2h_v3: 'HX2c', reminder_2h_teams_v3: 'HX2t' });
  assert.deepEqual(send(tpl('reminder_24h', ['Lerato', 'Microsoft Teams', 'Mark Smith', '10:00'], [{ qr: `confirm:${BK}` }, { qr: `reschedule:${BK}` }]), env),
    { sid: 'HX24c', vars: { 1: 'Lerato', 2: 'Microsoft Teams', 3: 'Mark Smith', 4: '10:00', 5: `confirm:${BK}`, 6: `reschedule:${BK}` } });
  assert.deepEqual(defs['reminder_2h_v3.json'].content.types['twilio/card'].actions.map((x) => x.title), ['Yes, confirmed', 'Reschedule']);
  // phone (20 Oct): fixed text, no whole-sentence variable: 1 first, 2 adviser first name, 3 number, 4 time
  assert.equal(defs['reminder_2h_v3.json'].content.types['twilio/card'].title, "Hi {{1}}, {{2}} will call you on {{3}} today at *{{4}}*. If you can't make it, reply here or tap Reschedule.");
  assert.deepEqual(send(tpl('reminder_2h', ['Lerato', 'Mark Smith', '10:00', 'Mark will call you on +27821234567.'], [{ qr: `reschedule:${BK}` }]), env),
    { sid: 'HX2c', vars: { 1: 'Lerato', 2: 'Mark', 3: '082 123 4567', 4: '10:00', 5: `confirm:${BK}`, 6: `reschedule:${BK}` } });
  // a WhatsApp call (or anything else) keeps v1 / v2
  assert.equal(send(tpl('reminder_2h', ['Lerato', 'Mark Smith', '10:00', 'Mark will WhatsApp-call you on +27821234567.'], [{ qr: `reschedule:${BK}` }]), env).sid, 'HX2');
  assert.deepEqual(defs['reminder_2h_teams_v3.json'].content.types['twilio/card'].actions.map((x) => x.title), ['Join Teams call', 'Yes, confirmed', 'Reschedule']);
  assert.deepEqual(send(tpl('reminder_2h', ['Lerato', 'Mark Smith', '10:00', `Join on Teams: https://sortmycover.co.za/j/${BK}`], [{ qr: `reschedule:${BK}` }]), env),
    { sid: 'HX2t', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: '10:00', 4: BK, 5: `confirm:${BK}`, 6: `reschedule:${BK}` } });
});

test('booking_confirmed v3 (Teams / phone): header-booked, the "Life happens" line, no Add to calendar / Confirm / Cancel', () => {
  const defs = buildAll();
  const teams = defs['booking_confirmed_teams_v3.json'].content.types['twilio/card'];
  assert.deepEqual(teams.media, [H('booked')]);
  assert.match(teams.title, /by Microsoft Teams\. The invite is in your email, and you can join straight from the button below\. Life happens\. If you ever need to move your call, just come back to this chat and ask to reschedule\.$/);
  assert.deepEqual(teams.actions, [{ type: 'URL', title: 'Join Teams call', url: 'https://sortmycover.co.za/j/{{5}}' }, { type: 'QUICK_REPLY', title: 'Reschedule', id: '{{6}}' }]);
  const phone = defs['booking_confirmed_phone_v3.json'].content.types['twilio/card'];
  assert.match(phone.title, /^Hi \{\{1\}\}, you are booked\. \{\{2\}\} will call you on \{\{3\}\} at \*\{\{4\}\}\* on \*\{\{5\}\}\*\. Life happens\./);
  assert.deepEqual(phone.actions, [{ type: 'QUICK_REPLY', title: 'Reschedule', id: '{{6}}' }]);
  for (const c of [teams, phone]) assert.ok(!c.actions.some((a) => /calendar|Confirm|Cancel/.test(a.title)));
});

// ------------------------------------------------------------------ the sender's switch
test('booking_confirmed: v1 until a variant SID exists; Teams -> teams_v3 (join id as URL suffix, reschedule id), else v2, else v1', () => {
  const p = confirmed(TEAMS);
  const v1 = send(p, sids({ booking_confirmed: 'HXv1' }));
  assert.equal(v1.sid, 'HXv1'); assert.equal(v1.vars['5'], TEAMS); assert.equal(v1.vars['6'], BK); assert.equal(v1.vars['8'], `reschedule:${BK}`);
  const t = send(p, sids({ booking_confirmed: 'HXv1', booking_confirmed_v2: 'HXv2', booking_confirmed_teams_v3: 'HXteams' }));
  assert.deepEqual(t, { sid: 'HXteams', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: 'Tue 21 Oct', 4: '10:00', 5: BK, 6: `reschedule:${BK}` } });
  // phone today ("phone call", no number in {{5}}): the phone variant does not fit -> v2 (same plan as v1)
  const ph = send(confirmed('phone call'), sids({ booking_confirmed: 'HXv1', booking_confirmed_v2: 'HXv2', booking_confirmed_teams_v3: 'HXteams', booking_confirmed_phone_v3: 'HXphone' }));
  assert.equal(ph.sid, 'HXv2'); assert.equal(Object.keys(ph.vars).length, 9);
  // with the number in {{5}} (the w05 confirmDetail change): phone_v3, adviser first name, number, time, date
  const ph2 = send(confirmed('phone call on 082 123 4567'), sids({ booking_confirmed: 'HXv1', booking_confirmed_phone_v3: 'HXphone' }));
  assert.deepEqual(ph2, { sid: 'HXphone', vars: { 1: 'Lerato', 2: 'Mark', 3: '082 123 4567', 4: '10:00', 5: 'Tue 21 Oct', 6: `reschedule:${BK}` } });
  // no SID anywhere -> the same skip as before (email fallback)
  assert.equal(send(p, sids({})).skip, 'twilio_content_sid_missing');
});

test('reminders: 2h Teams -> join button variant; 10m online -> "Join your call"; phone keeps v1 / v2', () => {
  const all = sids({ reminder_2h: 'HX2', reminder_2h_v2: 'HX2b', reminder_2h_teams_v3: 'HX2t', reminder_10m: 'HX10', reminder_10m_online_v3: 'HX10o' });
  const r2 = send(tpl('reminder_2h', ['Lerato', 'Mark Smith', '10:00', `Join on Teams: https://sortmycover.co.za/j/${BK}`], [{ qr: `reschedule:${BK}` }]), all);
  assert.deepEqual(r2, { sid: 'HX2t', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: '10:00', 4: BK, 5: `confirm:${BK}`, 6: `reschedule:${BK}` } });
  const r2p = send(tpl('reminder_2h', ['Lerato', 'Mark Smith', '10:00', 'Mark will call you on 082 123 4567.'], [{ qr: `reschedule:${BK}` }]), all);
  assert.equal(r2p.sid, 'HX2b');
  const r10 = send(tpl('reminder_10m', ['Lerato', 'Mark Smith', `Join here: https://sortmycover.co.za/j/${BK}`]), all);
  assert.deepEqual(r10, { sid: 'HX10o', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: BK } });
  assert.equal(send(tpl('reminder_10m', ['Lerato', 'Mark Smith', 'Mark will call you from 082 555 0100.']), all).sid, 'HX10');
});

test('a variant that drops a text header renumbers the buttons (intro_media_voice_v2: buttons {{5}} {{6}})', () => {
  const spec = S.templateSpec('intro_media_voice');
  const p = { ...tpl('intro_media_voice', ['Lerato', 'Mark Smith', 'Tue 21 Oct', '10:00'], [{ qr: `play_voice:${BK}` }, { qr: `reschedule:${BK}` }]) };
  p.template.components.unshift({ type: 'header', parameters: [{ type: 'text', text: 'Mark Smith' }] });
  assert.ok(spec);
  const r = send(p, sids({ intro_media_voice: 'HXv', intro_media_voice_v2: 'HXv2' }));
  assert.deepEqual(r, { sid: 'HXv2', vars: { 1: 'Lerato', 2: 'Mark Smith', 3: 'Tue 21 Oct', 4: '10:00', 5: `play_voice:${BK}`, 6: `reschedule:${BK}` } });
  assert.equal(send(p, sids({ intro_media_voice: 'HXv' })).vars['5'], 'Mark Smith', 'v1 numbering unchanged');
});

// ------------------------------------------------------------------ session banners
const list = (ids) => ({ messaging_product: 'whatsapp', to: '27820000001', type: 'interactive', interactive: { type: 'list', body: { text: 'Which age group are you in?' }, action: { button: 'Choose age', sections: [{ title: 'Options', rows: ids.map((id) => ({ id, title: id })) }] } } });
const btns = (ids) => ({ messaging_product: 'whatsapp', to: '27820000001', type: 'interactive', interactive: { type: 'button', body: { text: 'Shall we go on?' }, action: { buttons: ids.map((id) => ({ type: 'reply', reply: { id, title: id } })) } } });
const ON = { WA_SESSION_BANNERS: 'on', WHATSAPP_PROVIDER: 'twilio' };

test('sessionBanner: off by default; on -> image first with the step header; skipped where a header fits or nothing maps', () => {
  assert.deepEqual(P.sessionBanner(list(['age_35_44']), { WHATSAPP_PROVIDER: 'twilio' }).banner, null, 'default off');
  const a = P.sessionBanner(list(['age_lt35', 'age_35_44']), ON);
  assert.deepEqual(a.banner, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '27820000001', type: 'image', image: { link: H('intent') } });
  assert.equal(P.sessionBanner(btns(['consent_yes', 'consent_no']), ON).banner.image.link, H('welcome'), 'Twilio quick replies take no media');
  assert.equal(P.sessionBanner(list([`slot_2026-10-21T08:00:00Z:${BK}`, 'other_times']), ON).banner.image.link, H('booked'));
  // Meta reply buttons take the image header inline: no extra message
  const m = P.sessionBanner(btns(['consent_yes']), { ...ON, WHATSAPP_PROVIDER: 'meta' });
  assert.equal(m.banner, null); assert.deepEqual(m.wa.interactive.header, { type: 'image', image: { link: H('welcome') } });
  assert.equal(P.sessionBanner(list(['age_35_44']), { ...ON, WHATSAPP_PROVIDER: 'meta' }).banner.image.link, H('intent'), 'Meta lists take no image header');
  // already carries a header (the Start here card), text, a later question: nothing
  const cta = { to: '27820000001', type: 'interactive', interactive: { type: 'cta_url', header: { type: 'image', image: { link: H('welcome') } }, body: { text: 'x' }, action: { name: 'cta_url', parameters: { display_text: 'Start here', url: 'https://sortmycover.co.za/start/#lt=lt1.x' } } } };
  assert.equal(P.sessionBanner(cta, ON).banner, null);
  assert.equal(P.sessionBanner({ to: '1', type: 'text', text: { body: 'hi' } }, ON).banner, null);
  assert.equal(P.sessionBanner(list(['budget_lt500']), ON).banner, null, 'one banner per step, not on every question');
});

test('the banner image is dry under DRY_RUN_SENDS and maps to a Twilio MediaUrl send', () => {
  const b = P.sessionBanner(list(['age_35_44']), ON).banner;
  const n = S.normalise({ kind: 'prebuilt', wa: b, record: false, caller: 'W03', correlation: 'W03:banner:1:0' });
  assert.equal(S.decide(n, {}, { ...ENV, DRY_RUN_SENDS: 'true' }).action, 'dry');
  const live = S.decide(n, {}, ENV);
  assert.equal(live.action, 'send');
  const f = Object.fromEntries(new URLSearchParams(S.twilioRequest(live, ENV).body));
  assert.equal(f.MediaUrl, H('intent')); assert.equal(f.ContentSid, undefined);
});

test('W03: the banner goes first through its own send, behind the gate and the reply claim, and never blocks the reply', async () => {
  const c = W03.connections;
  assert.equal(c['Live send? (W03)'].main[0][0].node, 'Banner first? (W03)');
  assert.equal(c['Banner first? (W03)'].main[0][0].node, 'SUB input (WhatsApp send (banner))');
  assert.equal(c['WhatsApp send (banner)'].main[0][0].node, 'Banner done: the message (W03)');
  assert.equal(c['Banner done: the message (W03)'].main[0][0].node, 'SUB input (WhatsApp send (session))');
  assert.equal(c['Banner first? (W03)'].main[1][0].node, 'SUB input (WhatsApp send (session))');
  const bn = W03.nodes.find((n) => n.name === 'WhatsApp send (banner)');
  assert.equal(bn.parameters.workflowId.value, 'smc-whatsapp-send'); assert.equal(bn.onError, 'continueRegularOutput');
  const item = { kind: 'send', message: { type: 'list', body: 'Which age group are you in?', button: 'Choose age', rows: [{ id: 'age_35_44', title: '35 to 44' }] }, _mobile: '+27820000001', _pnid: 'pn', _brand_id: 'b', _lead_id: 'l', _wamid: 'SM1' };
  const [off] = await runCode(W03, 'Build Cloud API body', { items: [item], env: { WHATSAPP_PROVIDER: 'twilio' } });
  assert.equal(off.json.banner, null);
  const [on] = await runCode(W03, 'Build Cloud API body', { items: [item], env: { WHATSAPP_PROVIDER: 'twilio', WA_SESSION_BANNERS: 'on' } });
  assert.equal(on.json.banner.image.link, H('intent')); assert.equal(on.json.body.interactive.type, 'list');
  assert.equal(ifBranch(W03, 'Banner first? (W03)', { json: { out: on.json } }), true);
  assert.equal(ifBranch(W03, 'Banner first? (W03)', { json: { out: off.json } }), false);
  const sub = await runCode(W03, 'SUB input (WhatsApp send (banner))', { json: { out: on.json } });
  assert.equal(sub.json.wa.type, 'image'); assert.equal(sub.json.kind, 'prebuilt');
  const back = await runCode(W03, 'Banner done: the message (W03)', { refs: { 'Banner first? (W03)': { out: on.json } } });
  assert.equal(back.json.out.body.interactive.type, 'list', 'the reply follows the banner');
});

test('W07: the plan node passes replies through when off, adds the banner when on; banner send never blocks', async () => {
  const c = W07.connections;
  assert.equal(c['Carry reply after pause'].main[0][0].node, 'Session banner plan (W07)');
  assert.equal(c['Banner first? (W07)'].main[1][0].node, 'SUB input (Send WhatsApp (session, in 24-h window))');
  assert.equal(c['Banner done: the message (W07)'].main[0][0].node, 'SUB input (Send WhatsApp (session, in 24-h window))');
  assert.equal(W07.nodes.find((n) => n.name === 'WhatsApp send (banner, W07)').onError, 'continueRegularOutput');
  const wa = list([`slot_2026-10-21T08:00:00Z:${BK}`]);
  const off = await runCode(W07, 'Session banner plan (W07)', { json: { wa, x: 1 }, env: { WHATSAPP_PROVIDER: 'twilio' } });
  assert.deepEqual(off.json, { wa, x: 1, _banner: null });
  const on = await runCode(W07, 'Session banner plan (W07)', { json: { wa }, env: ON });
  assert.equal(on.json._banner.image.link, H('booked'));
  const sub = await runCode(W07, 'SUB input (WhatsApp send (banner, W07))', { json: on.json });
  assert.match(sub.json.correlation, /^W07:banner:/); assert.equal(sub.json.wa.type, 'image');
});

// ------------------------------------------------------------------ reschedule card
const SECRET = 'x'.repeat(40);
const W10_ITEM = (over = {}) => ({ route: 'W10', brand_id: 'b1', adviser_first: 'Mark', msg: { wamid: 'SMr1', from: '+27820000001', type: 'button', payload: `reschedule:${BK}`, text: 'Reschedule' },
  lead: { id: '11111111-2222-4333-8444-555555555555', first_name: 'Thandi', phone: '+27820000001' }, broker: { contact_person: 'Mark Smith' },
  booking: { id: BK, appointment_date: '2026-10-21T08:00:00Z', method: 'teams', status: 'booked' }, ...over });

test('rescheduleCardPlan: a Reschedule tap or the reschedule intent -> the card; anything else -> W10 as today', () => {
  const token = 'lt1.abc.def';
  const env = sids({ smc_reschedule_cta: 'HXrc' });
  const s = P.rescheduleCardPlan(W10_ITEM(), { start_page: true, token, env });
  assert.equal(s.via, 'session_cta');
  const i = s.send.interactive;
  assert.deepEqual(i.header, { type: 'image', image: { link: H('reschedule') } });
  assert.equal(i.body.text, 'No problem, Thandi, life happens. Your call with Mark is booked for Wed 21 Oct at 10:00. Tap below to pick a new time. You can choose any open time in the next 14 days.');
  assert.equal(i.action.parameters.url, `https://sortmycover.co.za/start/#move=1&lt=${token}`);
  assert.equal(i.action.parameters.display_text, 'Pick a new time');
  // Twilio maps it to the session card, the token alone as {{2}}; never a text Body
  const f = Object.fromEntries(new URLSearchParams(S.twilioRequest({ payload: s.send }, env).body));
  assert.equal(f.ContentSid, 'HXrc'); assert.equal(JSON.parse(f.ContentVariables)['2'], token); assert.equal(f.Body, undefined);
  // approved template (works in and out of the window): "Keep my time" = keep_it:<booking>
  const envT = sids({ smc_reschedule_cta: 'HXrc', reschedule_card: 'HXtpl' });
  const t = P.rescheduleCardPlan(W10_ITEM({ msg: { wamid: 'SMr2' }, delegate: { to: 'W10', action: 'reschedule', actions: ['reschedule'] } }), { start_page: true, token, env: envT });
  assert.equal(t.via, 'template');
  const ft = Object.fromEntries(new URLSearchParams(S.twilioRequest({ payload: t.send }, envT).body));
  assert.deepEqual({ sid: ft.ContentSid, vars: JSON.parse(ft.ContentVariables) }, { sid: 'HXtpl', vars: { 1: 'Thandi', 2: 'Mark', 3: 'Wed 21 Oct', 4: '10:00', 5: token, 6: `keep_it:${BK}` } });
  // not a card: switch off, no token, no SID, another W10 action, no live booking
  assert.equal(P.rescheduleCardPlan(W10_ITEM(), { start_page: false, token, env }).skip, 'start_page_off');
  assert.equal(P.rescheduleCardPlan(W10_ITEM(), { start_page: true, token: null, env }).skip, 'no_lead_token');
  assert.equal(P.rescheduleCardPlan(W10_ITEM(), { start_page: true, token, env: sids({}) }).skip, 'twilio_reschedule_content_missing');
  assert.equal(P.rescheduleCardPlan(W10_ITEM({ msg: { payload: `cancel:${BK}` } }), { start_page: true, token, env }).skip, 'not_reschedule');
  assert.equal(P.rescheduleCardPlan(W10_ITEM({ delegate: { to: 'W10', action: 'cancel_confirm' } }), { start_page: true, token, env }).skip, 'not_reschedule');
  assert.equal(P.rescheduleCardPlan(W10_ITEM({ booking: null }), { start_page: true, token, env }).skip, 'no_live_booking');
  // generated Content: banner + URL + Keep my time on the template; the session card has the one URL button
  const defs = buildAll();
  const card = defs['reschedule_card.json'].content.types['twilio/card'];
  assert.deepEqual(card.media, [H('reschedule')]);
  assert.deepEqual(card.actions, [{ type: 'URL', title: 'Pick a new time', url: 'https://sortmycover.co.za/start/#move=1&lt={{5}}' }, { type: 'QUICK_REPLY', title: 'Keep my time', id: '{{6}}' }]);
  assert.equal(defs['smc_reschedule_cta.json']._meta.session_only, true);
});

test('"Keep my time" (keep_it:<booking>) routes to W10, whose op is keep: no booking change', () => {
  const r = routeInbound({ from: '+27820000001', type: 'button', payload: `keep_it:${BK}`, text: 'Keep my time' }, { lead: { id: 'l', stage: 'booked', conv_state: {} }, broker_numbers: new Set(), ops_numbers: new Set(), has_live_booking: true });
  assert.equal(r.route, 'W10');
  assert.equal(classifyOp({ msg: { payload: `keep_it:${BK}` } }), 'keep');
});

test('W07 wiring: every W10 hand-off passes the card check; the card goes through the sub (record:true), dry under DRY_RUN_SENDS', async () => {
  const c = W07.connections;
  const into = Object.entries(c).flatMap(([src, x]) => (x.main || []).flat().filter((t) => t && t.node === '-> W10').map(() => src));
  assert.deepEqual(into, ['Not a card: on to W10 (W07)'], 'only the card check feeds W10');
  assert.equal(c['Reschedule card? (W07)'].main[0][0].node, 'SUB input (Send reschedule card (W07))');
  assert.equal(W07.nodes.find((n) => n.name === 'Send reschedule card (W07)').parameters.workflowId.value, 'smc-whatsapp-send');
  const item = W10_ITEM();
  const env = { ...sids({ smc_reschedule_cta: 'HXrc' }), LEAD_TOKEN_SECRET: SECRET };
  const plan = await runCode(W07, 'Reschedule card plan (W07)', { json: { item, start_page: true }, env });
  assert.equal(plan.json.reschedule_card.via, 'session_cta');
  assert.match(plan.json.reschedule_card.wa.interactive.action.parameters.url, /^https:\/\/sortmycover\.co\.za\/start\/#move=1&lt=lt1\./);
  const off = await runCode(W07, 'Reschedule card plan (W07)', { json: { item, start_page: false }, env });
  assert.equal(off.json.reschedule_card, null); assert.equal(ifBranch(W07, 'Reschedule card? (W07)', { json: off.json }), false);
  const back = await runCode(W07, 'Not a card: on to W10 (W07)', { json: off.json });
  assert.deepEqual(back.json, item, 'W10 gets the item unchanged');
  const sub = await runCode(W07, 'SUB input (Send reschedule card (W07))', { json: plan.json });
  assert.equal(sub.json.record, true); assert.equal(sub.json.correlation, 'W07:reschedule_card:SMr1');
  const n = S.normalise(sub.json);
  assert.equal(S.decide(n, {}, { ...env, DRY_RUN_SENDS: 'true' }).action, 'dry');
});

test('what_to_expect_v4 (5e copy, expect banner, no calendar button) and the start_here template (Instant Form)', () => {
  const defs = buildAll();
  const w = defs['what_to_expect_v4.json'].content.types['twilio/card'];
  assert.deepEqual(w.media, [H('expect')]); assert.deepEqual(w.actions, [{ type: 'QUICK_REPLY', title: 'Reschedule', id: '{{5}}' }]);
  assert.match(w.title, /About 30 minutes, by \{\{3\}\}\.[\s\S]*firm, FSP number and how they are paid[\s\S]*Nothing is bought on the call\.[\s\S]*payslip or a current policy schedule nearby it helps, but it isn't needed\./);
  assert.doesNotMatch(w.title, /\bfree\b/i);
  const r = send(tpl('what_to_expect', ['Lerato', 'Mark Smith', 'Microsoft Teams'], [{ url: BK }]), sids({ what_to_expect: 'HXw1', what_to_expect_v2: 'HXw2', what_to_expect_v4: 'HXw4' }));
  assert.deepEqual(r, { sid: 'HXw4', vars: { 1: 'Lerato', 2: 'Mark', 3: 'Microsoft Teams', 4: 'Mark', 5: `reschedule:${BK}` } });
  assert.doesNotMatch(defs['start_here.json'].content.types['twilio/card'].title, /\bSTOP\b/);
  // start_here: key exactly start_here, approval, welcome card, body {{1}} = first name, URL suffix {{2}} = the token
  const s = defs['start_here.json'];
  assert.equal(s._meta.key, 'start_here'); assert.equal(s._meta.approval.name, 'smc_start_here'); assert.equal(s._meta.approval.category, 'UTILITY');
  const c = s.content.types['twilio/card'];
  assert.deepEqual(c.media, [H('welcome')]);
  assert.match(c.title, /^Hi \{\{1\}\}, I'm Lindi from SortMyCover\. Here's how it works:\n1\. Pick a time/);
  assert.deepEqual(c.actions, [{ type: 'URL', title: 'Start here', url: 'https://sortmycover.co.za/start/#lt={{2}}' }]);
  // the decided shape W01 sends through smc-whatsapp-send
  const tok = 'lt1.lead_x.1792240000.' + 'A'.repeat(43);
  const n = S.normalise({ to: '+27820000001', kind: 'template', template: 'start_here', variables: ['Lerato'], buttons: [{ url: tok }], lead_id: 'l1', correlation: 'W01:start_here:l1' });
  const env = sids({ start_here: 'HXsh' });
  const d = S.decide(n, {}, env);
  assert.equal(d.action, 'send', JSON.stringify(d));
  const f = Object.fromEntries(new URLSearchParams(S.twilioRequest(d, env).body));
  assert.deepEqual({ sid: f.ContentSid, vars: JSON.parse(f.ContentVariables) }, { sid: 'HXsh', vars: { 1: 'Lerato', 2: tok } });
  assert.equal(S.decide(n, {}, { ...env, DRY_RUN_SENDS: 'true' }).action, 'dry');
});

test("v4b12: after Lindi's reply while /start/ is pending, W07 sends the Start here link again with a fresh token (never on a handoff)", async () => {
  assert.ok(W07.connections['Send WhatsApp (session, in 24-h window)'].main[0].some((t) => t.node === 'Start here again plan (W07)'));
  assert.equal(W07.nodes.find((n) => n.name === 'Send Start here again (W07)').parameters.workflowId.value, 'smc-whatsapp-send');
  const env = { ...sids({ smc_start_cta: 'HXcta' }), LEAD_TOKEN_SECRET: SECRET };
  const s = { msg: { wamid: 'SMa1', from: '+27820000001' }, adviser_first: 'Mark', handoff: false,
    lead: { id: '11111111-2222-4333-8444-555555555555', phone: '+27820000001', conv_state: { state: 'start_page' } } };
  const run = (x) => runCode(W07, 'Start here again plan (W07)', { json: {}, env, refs: { 'Anything to send?': x } });
  const a = await run(s);
  const i = a.json.start_again.interactive;
  assert.equal(i.type, 'cta_url'); assert.equal(i.body.text, 'Tap below to pick your time with Mark.');
  assert.deepEqual(i.header, { type: 'image', image: { link: H('welcome') } });
  assert.match(i.action.parameters.url, /^https:\/\/sortmycover\.co\.za\/start\/#lt=lt1\./);
  assert.equal(ifBranch(W07, 'Start here again? (W07)', { json: a.json }), true);
  // Twilio: the smc_start_cta Content with the fresh token as {{2}}, never a text body
  const f = Object.fromEntries(new URLSearchParams(S.twilioRequest({ payload: a.json.start_again }, env).body));
  assert.equal(f.ContentSid, 'HXcta'); assert.equal(f.Body, undefined);
  for (const x of [{ ...s, handoff: true }, { ...s, lead: { ...s.lead, conv_state: { state: 'unbooked' } } }]) {
    const b = await run(x); assert.equal(b.json.start_again, null); assert.equal(ifBranch(W07, 'Start here again? (W07)', { json: b.json }), false);
  }
  const sub = await runCode(W07, 'SUB input (Send Start here again (W07))', { json: a.json });
  assert.equal(sub.json.record, true); assert.equal(sub.json.correlation, 'W07:start_again:SMa1');
  assert.equal(S.decide(S.normalise(sub.json), {}, { ...env, DRY_RUN_SENDS: 'true' }).action, 'dry');
});
