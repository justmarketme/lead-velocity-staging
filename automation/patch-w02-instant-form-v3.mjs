// automation/patch-w02-instant-form-v3.mjs - W02 records the Instant Form v3 consent on intake (22 Oct 2026).
// The v3 form (deliverables/media-buyer/instant-form-spec-v3.json, SOCIAL-AUDIT row 22) has a generic required checkbox,
// CONSENT-GENERIC-v5form: no practice name, no FSP number, privacy link inside the text. W02 now carries BOTH the version and
// the exact text the person ticked (lib/w01.mjs LEAD_AD_FORM_CONSENT, one source) in the ingest item, so the consent record
// W01 writes (leads.consent_text / consent_text_version / consent_mode, the consent_audit row) is complete on intake even
// before any broker is known. The answers map and custom_disclaimer_responses still travel unchanged (v2 patch).
// W02.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-w02-instant-form-v3.mjs (after patch-w02-instant-form-v2.mjs)
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W02.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W02 has no node "${name}"`); return n; };

const FROM = "consent: { given: q.consent === true, source: 'meta_instant_form', form_id: lead.form_id, text_version: W01.LEAD_AD_CONSENT_VERSION, responses: lead.custom_disclaimer_responses, captured_at: lead.created_time },";
const TO = "consent: { given: q.consent === true, source: 'meta_instant_form', form_id: lead.form_id, text_version: W01.LEAD_AD_CONSENT_VERSION, text: W01.LEAD_AD_CONSENT_TEXT, responses: lead.custom_disclaimer_responses, captured_at: lead.created_time },";
const NOTE_FROM = '// travel as Graph returned them and W01 normaliseLeadAd reads them. No raw Meta blobs beyond the form\'s own answers.';
const NOTE_TO = NOTE_FROM + '\n// Instant Form v3 (22 Oct 2026): the consent is recorded on intake as the version AND the exact text the person ticked\n// (CONSENT-GENERIC-v5form, lib/w01.mjs LEAD_AD_FORM_CONSENT), generic: the adviser is named before any hand-over.';

const STICKY_FROM = 'backstop (consent tick; every age accepted since the instant form v2, 18 Oct 2026: W01 OUT_OF_BAND_AGE_BOOKS, never qualified outside 35-50)';
const STICKY_TO = STICKY_FROM + '; consent recorded on intake as version + exact text (Instant Form v3, CONSENT-GENERIC-v5form, 22 Oct 2026)';

const changed = [];
const f = node('Fetch lead via Graph + backstop');
const c = f.parameters.jsCode;
if (c.includes(TO) && c.includes(NOTE_TO)) changed.push(false);
else if (c.includes(FROM) && c.includes(NOTE_FROM) && !c.includes(NOTE_TO)) { f.parameters.jsCode = c.replace(FROM, TO).replace(NOTE_FROM, NOTE_TO); changed.push(true); }
else throw new Error('W02 "Fetch lead via Graph + backstop": unexpected code (run patch-w02-instant-form-v2.mjs first), refusing to overwrite');
const s = node('Sticky: read me');
if (s.parameters.content.includes(STICKY_TO)) changed.push(false);
else if (s.parameters.content.includes(STICKY_FROM)) { s.parameters.content = s.parameters.content.replace(STICKY_FROM, STICKY_TO); changed.push(true); }
else throw new Error('W02 sticky: anchor not found');

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w02-instant-form-v3:', changed.map((x) => (x ? 'changed' : 'already')).join(' '));
