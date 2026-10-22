// automation/patch-w02-instant-form-v2.mjs - W02 ingests the Meta instant form v2 (18 Oct 2026). Superseded in part by
// patch-w02-instant-form-v3.mjs (22 Oct 2026: generic CONSENT-GENERIC-v5form, version + text recorded on intake); run v2 then v3.
// The form (deliverables/media-buyer/instant-form-spec-v2.json) mirrors /start/: smc_intent, smc_age_band, smc_has_cover,
// first name, WhatsApp number, a required named-consent box (CONSENT-NAMED-v5web) and an optional ad-measurement box.
// Every age is accepted (lib/w01.mjs OUT_OF_BAND_AGE_BOOKS); W01 normaliseLeadAd reads the answers + the checkbox responses.
// W02 used to send a hard-coded v3 consent version and no answers beyond the bands; now it passes the form's answers map and
// custom_disclaimer_responses through unchanged, with the v2 consent version from lib/w01.mjs (one source).
// W02.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-w02-instant-form-v2.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W02.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W02 has no node "${name}"`); return n; };

const FETCH = `const M = require('lv-automation').metaAds;
const W01 = require('lv-automation').w01;
const client = M.createClient({ token: $env.META_SYSTEM_USER_TOKEN, apiVersion: $env.META_GRAPH_VERSION || $env.META_API_VERSION || 'v25.0', maxInlineWaitMs: 5000 });
const ev = $('Verify signature + parse leadgen events').item.json;
if ($input.item.json.id) return [{ json: { action: 'duplicate', leadgen_id: ev.leadgen_id } }]; // webhook re-delivery
const lead = await client.fetchLead(ev.leadgen_id);
const q = M.qualifyLead(lead);
if (!q.qualified) return [{ json: { action: 'routed_out', leadgen_id: ev.leadgen_id, form_id: lead.form_id, ad_id: lead.ad_id, reasons: q.reasons } }];
// Payload for "W01 Lead core" (same contract as the web path; origin = lead_ad). Instant form v2 (18 Oct 2026): every age is
// accepted (W01 OUT_OF_BAND_AGE_BOOKS); the answers map (smc_intent / smc_age_band / smc_has_cover) and the checkbox responses
// travel as Graph returned them and W01 normaliseLeadAd reads them. No raw Meta blobs beyond the form's own answers.
return [{ json: { action: 'ingest', lead: {
  origin: 'lead_ad', leadgen_id: lead.leadgen_id, form_id: lead.form_id, full_name: lead.full_name, first_name: lead.answers.first_name || null, mobile_raw: lead.phone, email: lead.email || null,
  campaign_id: lead.campaign_id, adset_id: lead.adset_id, ad_id: lead.ad_id, concept: lead.ad_parts && lead.ad_parts.concept, angle: lead.ad_parts && lead.ad_parts.angle,
  platform: lead.platform, answers: lead.answers, age_band: lead.answers.smc_age_band || lead.answers.age_band || null, budget_band: lead.answers.budget_band || null,
  preferred_method_ok: true, bond_children: q.bond_children,
  consent: { given: q.consent === true, source: 'meta_instant_form', form_id: lead.form_id, text_version: W01.LEAD_AD_CONSENT_VERSION, responses: lead.custom_disclaimer_responses, captured_at: lead.created_time },
  lead_event_id: 'evt_' + lead.leadgen_id + '_lead', is_synthetic: false } } }];`;

const STICKY_FROM = 'backstop qualification (bands + consent; form conditional logic is not trusted)';
const STICKY_TO = 'backstop (consent tick; every age accepted since the instant form v2, 18 Oct 2026: W01 OUT_OF_BAND_AGE_BOOKS, never qualified outside 35-50)';

const changed = [];
const f = node('Fetch lead via Graph + backstop');
// v3 (patch-w02-instant-form-v3.mjs) adds the consent text on top of this code: that state counts as applied here
const V3 = (x) => x.replace(' text: W01.LEAD_AD_CONSENT_TEXT,', '').split('\n').filter((l) => !l.startsWith('// Instant Form v3 (22 Oct 2026)') && !l.startsWith('// (CONSENT-GENERIC-v5form')).join('\n');
if (f.parameters.jsCode === FETCH || V3(f.parameters.jsCode) === FETCH) changed.push(false);
else if (f.parameters.jsCode.includes("text_version: 'CONSENT-NAMED-v3+CONSENT-ADS-v1'")) { f.parameters.jsCode = FETCH; changed.push(true); }
else throw new Error('W02 "Fetch lead via Graph + backstop": unexpected code, refusing to overwrite');
const s = node('Sticky: read me');
if (s.parameters.content.includes(STICKY_TO)) changed.push(false);
else if (s.parameters.content.includes(STICKY_FROM)) { s.parameters.content = s.parameters.content.replace(STICKY_FROM, STICKY_TO); changed.push(true); }
else throw new Error('W02 sticky: anchor not found');

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w02-instant-form-v2:', changed.map((c) => (c ? 'changed' : 'already')).join(' '));
