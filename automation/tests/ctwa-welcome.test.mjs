// One-tap consent from the ad (Jono, 24 Oct 2026): the Meta welcome-message artefact (automation/meta/ctwa-welcome-message.json),
// its runbook and the env names stay in step with W03 (automation/ctwa/w03.js iceBreakerConsent).
// Run: node --test automation/tests/ctwa-welcome.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W3 = require('../ctwa/w03.js');
const J = JSON.parse(readFileSync(new URL('../meta/ctwa-welcome-message.json', import.meta.url), 'utf8'));
const MD = readFileSync(new URL('../meta/CTWA-WELCOME.md', import.meta.url), 'utf8');
const ENV = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('ctwa-welcome-message.json: the page_welcome_message shape Meta documents (greeting + ice_breakers), ONE button, limits, POPIA content', () => {
  const p = J.page_welcome_message;
  assert.deepEqual([p.type, p.version, p.landing_screen_type, p.media_type, p.text_format.customer_action_type], ['VISUAL_EDITOR', 2, 'welcome_message', 'text', 'ice_breakers']);
  const m = p.text_format.message;
  assert.equal(m.ice_breakers.length, 1, 'ONE button: the tap is the consent, nothing else to tap');
  assert.equal(m.ice_breakers[0].title, 'Yes, I agree'); assert.ok(m.ice_breakers[0].title.length <= 80);
  assert.ok(m.text.length <= 300, `greeting ${m.text.length} chars (page_welcome_message greeting limit documented for Messenger; none published for WhatsApp)`);
  for (const must of ['SortMyCover', 'POPIA', 'message you on WhatsApp', 'name and number', 'an authorised financial adviser', 'who will contact you',
    'Lead Velocity (Pty) Ltd is responsible for your details', 'Reply STOP to opt out', 'sortmycover.co.za/privacy']) assert.ok(m.text.includes(must), must);
  assert.doesNotMatch(m.text, /\bfree\b|\bAI\b|licensed|Mark|Oracle|FSP/i, 'generic wording: no adviser named before consent, no client-wording breaches');
  assert.equal(J._meta.consent_text_version, W3.ICEBREAKER_CONSENT_VERSION);
  assert.equal(J._meta.env.SMC_CTWA_WELCOME_TEXT.includes('text_format.message.text'), true);
});

test('W03 accepts exactly this file: the ice breaker as first message stores the greeting as consent_text (ctwa-icebreaker-v1) and sends the Start here card', () => {
  const m = J.page_welcome_message.text_format.message;
  const r = W3.step(null, { from: '27600000124', id: 'SMwm1', timestamp: '1', type: 'text', text: { body: m.ice_breakers[0].title }, referral: { source_type: 'ad', source_id: '1', ctwa_clid: 'c1' } },
    { at: '2026-10-24T08:12:49+02:00', mobile: '+27600000124', profile_name: 'Cassiem', lead_id: 'lead_wm_1', broker: null, brand: { brand_id: 'smc', consent_mode: 'named', start_page: true },
      existing_open_lead_id: null, suppressed: false, wamid: 'SMwm1', is_synthetic: true, start_page: { token: `lt1.lead_wm_1.1792240000.${'A'.repeat(43)}` }, icebreaker: { consent: m.ice_breakers[0].title, welcome: m.text } });
  const row = r.actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(row.consent_text, m.text); assert.equal(row.consent_text_version, W3.ICEBREAKER_CONSENT_VERSION); assert.equal(row.consent_source, 'ctwa_ad');
  assert.deepEqual(r.actions.filter((a) => a.kind === 'send').map((a) => a.message.type), ['cta_url'], 'no broker needed before the card (generic consent)');
});

test('runbook, env example and deploy runbook name both variables and the file', () => {
  for (const s of ['SMC_CTWA_ICEBREAKER_CONSENT', 'SMC_CTWA_WELCOME_TEXT', 'ctwa-welcome-message.json', 'page_welcome_message', 'ice_breakers',
    'developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp', 'informed', 'specific', 'voluntary']) assert.ok(MD.includes(s), s);
  for (const s of ['SMC_CTWA_ICEBREAKER_CONSENT=', 'SMC_CTWA_WELCOME_TEXT=']) assert.ok(ENV.includes(s), s);
});
