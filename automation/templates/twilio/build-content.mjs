#!/usr/bin/env node
// Generates the Twilio Content API definitions for the WhatsApp nurture flow (2026-10-11) from the reviewed Meta templates
// in automation/templates/*.json, plus the generic session templates (buttons / lists) and the session Flow launches.
//   node automation/templates/twilio/build-content.mjs          # writes automation/templates/twilio/content/*.json
//   node automation/templates/twilio/build-content.mjs --check  # exit 1 when a committed file differs (CI / tests)
// Nothing is sent anywhere: submission is submit-twilio.mjs, dry-run by default, and only Jonathan runs --submit.
//
// Each output file is { _meta, content }. `content` is exactly the POST https://content.twilio.com/v1/Content body
// (friendly_name, language, variables = review samples, types). `_meta.key` is the TWILIO_CONTENT_SIDS key the sender
// looks up (lib/wa-provider.mjs): the Meta template name, `smc_session_buttons_N`, `smc_session_list_N`, or
// `flow:<flow_id>`. Variable numbers come from lib/wa-provider.mjs twilioVarPlan(), the SAME function the sender uses.
//
// Type choice (Twilio docs, 2026-10-11; SETUP-TWILIO.md "Sources"):
//   image / video header      -> twilio/card (media "https://<static host>/{{n}}": Twilio needs a static domain;
//                                 the WhatsApp text goes in `title`; footer -> `subtitle`)
//   FLOW button               -> whatsapp/flows (flow_token is a variable; first page served by the W28 endpoint)
//   any other header / buttons-> whatsapp/card (header_text, body, footer, QUICK_REPLY ids = variables, URL suffix)
//   body only                 -> twilio/text
// Placeholders resolved by submit-twilio.mjs from env: __TWILIO_MEDIA_BASE_URL__, __BOOKING_FLOW_ID__, __RESCHEDULE_FLOW_ID__.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { twilioVarPlan, defaultPayload, START_CTA_KEY, START_PAGE_LINK, START_CTA_HEADER, START_CTA_BUTTON, TEMPLATE_VARIANTS, variantSpec,
  RESCHEDULE_LINK, RESCHEDULE_CTA_KEY, RESCHEDULE_TEMPLATE, RESCHEDULE_BUTTON, KEEP_BUTTON, rescheduleCardBody, headerUrl } from '../../lib/wa-provider.mjs';
import { START_PAGE_STEPS } from '../../ctwa/w03.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..');
const OUT = join(HERE, 'content');
const MEDIA = '__TWILIO_MEDIA_BASE_URL__';

// The nurture flow inside the CRM (CRM-NURTURE-SCHEMA.md): lead-facing + the broker messages of W05-W13 / W15.
// Billing, onboarding, weekly-report and ops templates belong to the dropped layers (D5) and are not converted.
export const FLOW_TEMPLATES = [
  // CORE (submit first)
  'qualify_budget', 'broker_intro_booked', 'broker_intro_slots', 'booking_confirmed', 'reminder_24h', 'reminder_2h', 'missed_you',
  // reminders, reschedule, intro media, nurture, outcome
  'reminder_10m', 'what_to_expect', 'prep_nudge', 'reschedule_offer', 'intro_media', 'intro_media_voice',
  'unbooked_nudge_2h', 'unbooked_nudge_24h', 'unbooked_nudge_24h_text', 'unbooked_nudge_72h', 'reach_check', 'attended_thanks', 'invite_email_bounced',
  // tier C (under R750, 2026-10-11): held open while we look for an adviser with the standing yes; polite close after 7 days
  'lead_low_budget_held', 'lead_low_budget_closed',
  // verify gate (2026-10-11): the slot is held until the email is verified; released + rebook nudge otherwise
  'booking_held_verify_email', 'booking_hold_released',
  // Cal.com desktop booking (2026-10-17): brings the booker into the chat with Lindi (quick reply booking_chat_yes:<id>)
  'booking_confirm_chat',
  // the Flow launches (after the Flows are published in Meta)
  'broker_intro_slots_v2', 'reschedule_offer_v2',
  // broker side of the flow
  'broker_new_booking', 'broker_booking_changed', 'broker_outcome_check', 'broker_disposition', 'broker_quality', 'broker_lead_offer',
  'broker_lead_opted_out', 'broker_daily_digest', 'precall_brief',
  // W22 Alerts, lean (2026-10-18): the one ops template, to our own numbers (Jono / KG) for red alerts
  'ops_alert',
  // lead-ad intro card WITH the SortMyCover disclosure (2026-10-18): proposal, for Jono with the Instant Form launch (BROKER-INTRO-V3.md)
  'broker_intro_slots_v3',
  // Start here for Instant Form leads (19 Oct 2026): the smc_start_cta text as an approved template (they never messaged us)
  'start_here',
];
export const CORE = FLOW_TEMPLATES.slice(0, 7);
// Session Flow launches (inside the 24-h window, W10 flow_session): body {{1}}, flow_token {{2}}.
export const SESSION_FLOWS = [
  { key: 'flow:__RESCHEDULE_FLOW_ID__', name: 'smc_flow_reschedule', flow_id: '__RESCHEDULE_FLOW_ID__', button_text: 'Pick a new time', first_page: 'METHOD' },
  { key: 'flow:__BOOKING_FLOW_ID__', name: 'smc_flow_booking', flow_id: '__BOOKING_FLOW_ID__', button_text: 'Pick a time', first_page: 'METHOD' },
];

const body = (spec) => (spec.components.find((c) => c.type === 'BODY') || {});
const header = (spec) => spec.components.find((c) => c.type === 'HEADER');
const footer = (spec) => (spec.components.find((c) => c.type === 'FOOTER') || {}).text;
const buttons = (spec) => (spec.components.find((c) => c.type === 'BUTTONS') || {}).buttons || [];

/** Meta text with its own {{1}}.. -> Twilio numbering starting at `offset + 1` (body offset 0 = unchanged). */
const renumber = (text, offset) => String(text || '').replace(/\{\{(\d+)\}\}/g, (_, d) => `{{${Number(d) + offset}}}`);

/** One Meta template spec -> { _meta, content }. */
export function convert(spec) {
  const plan = twilioVarPlan(spec);
  const B = plan.filter((s) => s.kind === 'body').length;
  const vars = {};
  const ex = body(spec).example && body(spec).example.body_text && body(spec).example.body_text[0] || [];
  plan.filter((s) => s.kind === 'body').forEach((s) => { vars[String(s.n)] = String(ex[s.i] ?? `sample${s.n}`); });
  const h = header(spec);
  const hText = plan.filter((s) => s.kind === 'header_text');
  hText.forEach((s, k) => { vars[String(s.n)] = String(((h.example || {}).header_text || [])[k] ?? 'sample'); });
  const hMedia = plan.find((s) => s.kind === 'header_media');
  if (hMedia) vars[String(hMedia.n)] = hMedia.format === 'VIDEO' ? 'samples/intro_video_sample.mp4' : 'samples/intro_card_sample.png';
  const btn = buttons(spec);
  const actions = [];
  let flow = null;
  btn.forEach((b, index) => {
    const slot = plan.find((s) => s.kind === 'button' && s.index === index);
    if (b.type === 'QUICK_REPLY') { actions.push({ type: 'QUICK_REPLY', title: b.text, id: `{{${slot.n}}}` }); vars[String(slot.n)] = `${defaultPayload(b.text)}:sample`; }
    else if (b.type === 'URL') {
      if (slot) {
        const url = String(b.url).replace(/\{\{\d+\}\}/, `{{${slot.n}}}`);
        actions.push({ type: 'URL', title: b.text, url });
        const sample = String((b.example || [])[0] || '');
        const prefix = String(b.url).split(/\{\{\d+\}\}/)[0];
        vars[String(slot.n)] = sample.startsWith(prefix) ? sample.slice(prefix.length) : 'sample';
      } else actions.push({ type: 'URL', title: b.text, url: b.url });
    } else if (b.type === 'PHONE_NUMBER') actions.push({ type: 'PHONE_NUMBER', title: b.text, phone: b.phone_number });
    else if (b.type === 'FLOW') { flow = { b, slot }; vars[String(slot.n)] = 'ft1.sample'; }
  });
  const text = renumber(body(spec).text, 0);
  let types;
  if (flow) {
    types = { 'whatsapp/flows': {
      body: text, button_text: flow.b.text, flow_id: flow.b.flow_id, flow_token: `{{${flow.slot.n}}}`, flow_first_page_id: 'METHOD',
      is_flow_first_page_endpoint: flow.b.flow_action === 'data_exchange',
      ...(footer(spec) ? { subtitle: footer(spec) } : {}),
      ...(hMedia ? { media_url: `${MEDIA}/{{${hMedia.n}}}` } : {}),
    } };
  } else if (hMedia) {
    types = { 'twilio/card': { title: text, ...(footer(spec) ? { subtitle: footer(spec) } : {}), media: [`${MEDIA}/{{${hMedia.n}}}`], ...(actions.length ? { actions } : {}) } };
  } else if (h && h.banner) {
    // banner variant (lib/wa-provider.mjs TEMPLATE_VARIANTS): the static header card, no variable
    types = { 'twilio/card': { title: text, ...(footer(spec) ? { subtitle: footer(spec) } : {}), media: [h.banner], ...(actions.length ? { actions } : {}) } };
  } else if (actions.length || (h && h.format === 'TEXT') || footer(spec)) {
    types = { 'whatsapp/card': {
      body: text,
      ...(h && h.format === 'TEXT' ? { header_text: renumber(h.text, B) } : {}),
      ...(footer(spec) ? { footer: footer(spec) } : {}),
      ...(actions.length ? { actions } : {}),
    } };
  } else types = { 'twilio/text': { body: text } };
  return {
    _meta: { key: spec.name, source: `automation/templates/${spec.name}.json`, approval: { name: `smc_${spec.name}`, category: spec.category || 'UTILITY' },
      var_plan: plan.map((s) => ({ n: s.n, kind: s.kind, ...(s.type ? { type: s.type, index: s.index } : {}), ...(s.src != null && s.src !== s.index ? { v1_index: s.src } : {}) })), core: CORE.includes(spec.name) },
    content: { friendly_name: `smc_${spec.name}`, language: spec.language || 'en', variables: vars, types },
  };
}

/** Generic session buttons (1..3, twilio/quick-reply): body {{1}}, then title/id pairs. No approval (session type). */
export function sessionButtons(n) {
  const actions = []; const vars = { 1: 'Please choose one' };
  for (let k = 0; k < n; k++) { actions.push({ title: `{{${2 + 2 * k}}}`, id: `{{${3 + 2 * k}}}` }); vars[String(2 + 2 * k)] = `Option ${k + 1}`; vars[String(3 + 2 * k)] = `option_${k + 1}`; }
  return { _meta: { key: `smc_session_buttons_${n}`, approval: null, session_only: true }, content: { friendly_name: `smc_session_buttons_${n}`, language: 'en', variables: vars, types: { 'twilio/quick-reply': { body: '{{1}}', actions } } } };
}

/** Generic session list (1..10 items, twilio/list-picker): body {{1}}, button {{2}}, then id/item/description. Session only. */
export function sessionList(n) {
  const items = []; const vars = { 1: 'Here are the open times', 2: 'See times' };
  for (let k = 0; k < n; k++) {
    items.push({ id: `{{${3 + 3 * k}}}`, item: `{{${4 + 3 * k}}}`, description: `{{${5 + 3 * k}}}` });
    vars[String(3 + 3 * k)] = `slot_${k + 1}`; vars[String(4 + 3 * k)] = `Tue 14 Oct ${String(9 + k).padStart(2, '0')}:00`; vars[String(5 + 3 * k)] = 'South African time';
  }
  return { _meta: { key: `smc_session_list_${n}`, approval: null, session_only: true }, content: { friendly_name: `smc_session_list_${n}`, language: 'en', variables: vars, types: { 'twilio/list-picker': { body: '{{1}}', button: '{{2}}', items } } } };
}

/** Session Flow launch (W10 flow_session): whatsapp/flows needs approval even in-session (Twilio docs). */
export function sessionFlow(f) {
  return { _meta: { key: f.key, approval: { name: f.name, category: 'UTILITY' } },
    content: { friendly_name: f.name, language: 'en', variables: { 1: 'Tap below to pick a new time with your adviser.', 2: 'ft1.sample' },
      types: { 'whatsapp/flows': { body: '{{1}}', button_text: f.button_text, flow_id: f.flow_id, flow_token: '{{2}}', flow_first_page_id: f.first_page, is_flow_first_page_endpoint: true } } } };
}

/**
 * The /start/ page link (W03, brand flag start_page, 18 Oct 2026; copy + header-welcome 19 Oct): one session twilio/card, static header image, body {{1}},
 * one URL button whose URL ends in the token {{2}} after a STATIC '#lt=' (the token rides in the fragment, CONTRACTS.md
 * lead_token; Twilio substitutes only a URL suffix and documents no '#' encoding). Session only: no WhatsApp approval
 * (an unapproved card in session may carry one URL button). Created once by Jonathan: submit-twilio.mjs --only smc_start_cta --submit.
 */
export function startCta() {
  return { _meta: { key: START_CTA_KEY, approval: null, session_only: true },
    content: { friendly_name: START_CTA_KEY, language: 'en',
      variables: { 1: `Hi Thandi, I'm Lindi from SortMyCover. ${START_PAGE_STEPS}`, 2: 'lt1.sample' },
      types: { 'twilio/card': { title: '{{1}}', media: [START_CTA_HEADER], actions: [{ type: 'URL', title: START_CTA_BUTTON, url: `${START_PAGE_LINK}{{2}}` }] } } } };
}

/**
 * Banner variant (Jono, 19 Oct 2026) of a lead-facing template: same body / variables / buttons / category as v1, the
 * static header card instead of a text header. Its own key (TWILIO_CONTENT_SIDS) and approval name smc_<key>; the
 * sender switches to it only once that key has a SID. `_meta.submitted` = the SID of a variant already created.
 */
export function convertVariant(spec, v) {
  const d = convert(variantSpec(spec, v));
  d._meta = { ...d._meta, key: v.key, base: v.base, header: v.keep_header ? 'v1 media header (kept)' : v.header, ...(v.superseded_by ? { superseded_by: v.superseded_by } : {}), source: `automation/templates/${v.base}.json + lib/wa-provider.mjs TEMPLATE_VARIANTS`, core: false,
    ...(v.sid ? { submitted: v.sid } : {}) };
  return d;
}

/**
 * The reschedule card (Jono, 19 Oct 2026; lib/wa-provider.mjs rescheduleCardPlan, sent by W07 instead of W10's slot list).
 * Template reschedule_card: approved twilio/card (banner + body + URL "Pick a new time" + quick reply "Keep my time"), so
 * it works inside AND outside the 24-h window; numbering = body {{1}}-{{4}}, URL token {{5}}, keep id {{6}} (no spec file:
 * the sender numbers body then buttons in payload order). Session smc_reschedule_cta: the same banner and text with ONE
 * URL button (an unapproved session card cannot mix a URL and a quick reply).
 */
const RESCHEDULE_SAMPLE = { first: 'Thandi', adviser: 'Mark', date: 'Wed 21 Oct', time: '10:00' };
export function rescheduleCard() {
  const title = rescheduleCardBody({ first: '{{1}}', adviser: '{{2}}', date: '{{3}}', time: '{{4}}' }); // no STOP line (Jono 19 Oct: consent only)
  return { _meta: { key: RESCHEDULE_TEMPLATE, source: 'lib/wa-provider.mjs rescheduleCardBody', approval: { name: `smc_${RESCHEDULE_TEMPLATE}`, category: 'UTILITY' }, core: false,
    var_plan: [1, 2, 3, 4].map((n) => ({ n, kind: 'body' })).concat([{ n: 5, kind: 'button', type: 'url', index: 0 }, { n: 6, kind: 'button', type: 'quick_reply', index: 1 }]) },
    content: { friendly_name: `smc_${RESCHEDULE_TEMPLATE}`, language: 'en', variables: { 1: 'Thandi', 2: 'Mark', 3: 'Wed 21 Oct', 4: '10:00', 5: 'lt1.sample', 6: 'keep_it:sample' },
      types: { 'twilio/card': { title, subtitle: 'SortMyCover', media: [headerUrl('reschedule')], actions: [
        { type: 'URL', title: RESCHEDULE_BUTTON, url: `${RESCHEDULE_LINK}{{5}}` }, { type: 'QUICK_REPLY', title: KEEP_BUTTON, id: '{{6}}' }] } } } };
}
export function rescheduleCta() {
  return { _meta: { key: RESCHEDULE_CTA_KEY, approval: null, session_only: true },
    content: { friendly_name: RESCHEDULE_CTA_KEY, language: 'en', variables: { 1: rescheduleCardBody(RESCHEDULE_SAMPLE), 2: 'lt1.sample' },
      types: { 'twilio/card': { title: '{{1}}', media: [headerUrl('reschedule')], actions: [{ type: 'URL', title: RESCHEDULE_BUTTON, url: `${RESCHEDULE_LINK}{{2}}` }] } } } };
}

export function buildAll() {
  const out = {};
  for (const name of FLOW_TEMPLATES) {
    const spec = JSON.parse(readFileSync(join(TEMPLATES, `${name}.json`), 'utf8'));
    out[`${name}.json`] = convert(spec);
  }
  for (const v of TEMPLATE_VARIANTS) {
    const spec = JSON.parse(readFileSync(join(TEMPLATES, `${v.base}.json`), 'utf8'));
    out[`${v.key}.json`] = convertVariant(spec, v);
  }
  for (let n = 1; n <= 3; n++) out[`smc_session_buttons_${n}.json`] = sessionButtons(n);
  for (let n = 1; n <= 10; n++) out[`smc_session_list_${n}.json`] = sessionList(n);
  for (const f of SESSION_FLOWS) out[`${f.name}.json`] = sessionFlow(f);
  out[`${START_CTA_KEY}.json`] = startCta();
  out[`${RESCHEDULE_TEMPLATE}.json`] = rescheduleCard();
  out[`${RESCHEDULE_CTA_KEY}.json`] = rescheduleCta();
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const all = buildAll();
  let bad = 0;
  if (!check) mkdirSync(OUT, { recursive: true });
  for (const [f, def] of Object.entries(all)) {
    const p = join(OUT, f);
    const txt = JSON.stringify(def, null, 2) + '\n';
    if (check) { if (!existsSync(p) || readFileSync(p, 'utf8') !== txt) { console.error(`stale: ${f}`); bad++; } }
    else writeFileSync(p, txt);
  }
  if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (!all[f]) { if (check) { console.error(`orphan: ${f}`); bad++; } else unlinkSync(join(OUT, f)); }
  console.log(check ? (bad ? `${bad} stale` : 'content definitions up to date') : `wrote ${Object.keys(all).length} definitions to automation/templates/twilio/content/`);
  process.exit(bad ? 1 : 0);
}
