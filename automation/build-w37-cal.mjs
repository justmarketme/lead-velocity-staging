#!/usr/bin/env node
// Generates automation/W37.json: Cal.com desktop booking -> Lead Velocity CRM -> WhatsApp (17 Oct 2026).
// Design: sites/sortmycover/docs/CALCOM-BOOKING-FLOW.md. Logic: automation/lib/w37-cal.mjs (tests: automation/tests/W37.test.mjs).
//   node automation/build-w37-cal.mjs
// Credentials by name only (id ''), secrets via $env (CAL_WEBHOOK_SECRET, BRAND_ID, optional CAL_CONSENT_FIELD), inactive.
// The template send goes through smc-whatsapp-send, which applies DRY_RUN_SENDS, suppression, the provider switch and
// TWILIO_CONTENT_SIDS (no SID for booking_confirm_chat yet -> the send is skipped and logged, nothing else changes).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, errorWorkflow: 'smc-w22' };
let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `w37n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const code = (name, pos, jsCode, mode = 'runOnceForAllItems') => node(name, 'code', 2, pos, { mode, jsCode });
const pg = (name, pos, query, replacement, extra = {}) => node(name, 'postgres', 2.5, pos, { operation: 'executeQuery', query, options: { queryReplacement: replacement } }, { credentials: PG, ...extra });
const ifTrue = (name, pos, expr) => node(name, 'if', 2, pos, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const c = {};
const link = (from, to, out = 0) => { const x = (c[from] ||= { main: [] }); while (x.main.length <= out) x.main.push([]); x.main[out].push({ node: to, type: 'main', index: 0 }); };
const PLAN = "$('Plan (w37.planCal)').item.json";

const n = [];
n.push(node('Sticky: read me', 'stickyNote', 1, [0, -380], { width: 760, height: 330, content:
  '## W37 Cal.com booking intake (17 Oct 2026)\nPOST /webhook/cal from Cal.com (BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED). `x-cal-signature-256` = HMAC-SHA256(raw body, CAL_WEBHOOK_SECRET), checked before anything is read; answers 200 at once (401 when the signature is wrong).\n' +
  '- Created: lead (consent_source calcom, CONSENT-CALCOM-v1, the checkbox wording, ref = page code, utm_* from "via"), appointment (booked_via page, idempotency_key calcom:<uid>), consent activity with provenance, one lead_optins row, then the UTILITY template `booking_confirm_chat` ("Yes, let\'s chat" -> W07 contact confirm).\n' +
  '- Rescheduled: new appointment linked to the old one (old -> rescheduled). Cancelled: appointment cancelled, Lindi\'s conv_state back to unbooked.\n' +
  '- No broker for the organiser email, no valid +27 number, or no consent tick: console escalation, nothing sent.\n' +
  'Needs: CAL_WEBHOOK_SECRET, BRAND_ID, the adviser\'s brokers.calendar_email = the Cal.com organiser email, TWILIO_CONTENT_SIDS.booking_confirm_chat after Meta approval. Inactive until Jono activates it.' }));
n.push(node('POST /cal (Cal.com)', 'webhook', 2, [0, 0], { httpMethod: 'POST', path: 'cal', responseMode: 'responseNode', options: { rawBody: true } }, { webhookId: 'smc-w37-cal' }));
n.push(code('Verify signature + normalise (w37)', [220, 0],
`const L = require('lv-automation').w37;
const it = $input.first();
// raw bytes exactly as Cal.com signed them (rawBody: true -> binary.data)
let raw = '';
try { raw = it.binary && it.binary.data && it.binary.data.data ? Buffer.from(it.binary.data.data, 'base64').toString('utf8') : ''; } catch (e) { raw = ''; }
if (!raw) { try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = ''; } }
const h = it.json.headers || {};
const v = L.verifyCalSignature(raw, h['x-cal-signature-256'], $env.CAL_WEBHOOK_SECRET);
if (!v.ok) return [{ json: { valid: false, reason: v.reason } }];
let body; try { body = JSON.parse(raw); } catch (e) { return [{ json: { valid: false, reason: 'json' } }]; }
const ev = L.normaliseCal(body, { consentField: $env.CAL_CONSENT_FIELD });
return [{ json: { valid: true, ev } }];`));
n.push(node('Respond 200 / 401', 'respondToWebhook', 1.1, [440, -120], { respondWith: 'noData', options: { responseCode: '={{ $json.valid ? 200 : 401 }}' } }));
n.push(ifTrue('Booking event?', [440, 60], '$json.valid === true && !!$json.ev && $json.ev.ok === true'));
n.push(pg('Claim (other / calcom:<event>:<uid>)', [660, 60],
`-- Cal.com retries a webhook that did not get a 2xx; one row per event + booking uid makes every retry a no-op.
INSERT INTO public.webhook_events (source, external_id, brand_id, signature_ok)
VALUES ('other', 'calcom:' || $1 || ':' || $2, nullif($3, '')::uuid, true)
ON CONFLICT (source, external_id) DO NOTHING
RETURNING id;`, "={{ [ $json.ev.event, $json.ev.uid, $env.BRAND_ID || '' ] }}"));
n.push(pg('Load context (broker, lead, booking)', [880, 60],
`-- broker = the SortMyCover adviser whose calendar Cal.com booked into (organiser email = brokers.calendar_email or email);
-- lead = the open lead with this WhatsApp number; appointment = this booking uid; prev_appointment = the uid it replaces.
SELECT
  (SELECT row_to_json(b) FROM (SELECT id, contact_person, adviser_name FROM public.brokers
     WHERE brand_id = $1::uuid AND $2 <> '' AND (lower(calendar_email) = $2 OR lower(email) = $2)
     ORDER BY active DESC NULLS LAST, created_at LIMIT 1) b) AS broker,
  (SELECT row_to_json(l) FROM (SELECT id, broker_id, email FROM public.leads
     WHERE brand_id = $1::uuid AND $3 <> '' AND phone = $3 AND opted_out_at IS NULL ORDER BY created_at DESC LIMIT 1) l) AS lead,
  (SELECT row_to_json(a) FROM (SELECT id, client_id, status, reschedule_count FROM public.appointments WHERE idempotency_key = 'calcom:' || $4) a) AS appointment,
  (SELECT row_to_json(a) FROM (SELECT id, client_id, status, reschedule_count FROM public.appointments WHERE $5 <> '' AND idempotency_key = 'calcom:' || $5) a) AS prev_appointment,
  EXISTS (SELECT 1 FROM public.suppression s WHERE $3 <> '' AND s.mobile_hash = public.smc_hash_contact($3) AND s.source <> 'no_consent_ctwa') AS suppressed;`,
  "={{ (() => { const e = $('Verify signature + normalise (w37)').item.json.ev; return [ $env.BRAND_ID || '', e.organizer_email || '', e.phone || '', e.uid, e.reschedule_uid || '' ]; })() }}"));
n.push(code('Plan (w37.planCal)', [1100, 60],
`const L = require('lv-automation').w37;
const ev = $('Verify signature + normalise (w37)').first().json.ev;
const plan = L.planCal(ev, $input.first().json, { now: new Date().toISOString(), brandId: $env.BRAND_ID || null });
return [{ json: { ...plan, ev } }];`));
n.push(node('Action?', 'switch', 3, [1320, 60], { rules: { values: ['book', 'reschedule', 'cancel', 'escalate'].map((v) => ({ outputKey: v, renameOutput: true,
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.action }}', rightValue: v, operator: { type: 'string', operation: 'equals' } }] } })) }, options: { fallbackOutput: 'none' } }));
const UPSERT = `-- One statement: the lead (new, or the open lead with this number), the appointment, the old booking closed on a reschedule,
-- and the consent / booking activity with the provenance record. Constraint conflicts (double booking, overlap, same uid) -> no
-- appointment row; the run then escalates instead of sending.
WITH ex AS (SELECT id FROM public.leads WHERE id = nullif($1, '')::uuid),
ins AS (
  INSERT INTO public.leads (id, brand_id, broker_id, routed_at, routing_reason, phone, dedupe_hash, email, email_status, first_name, last_name,
                            origin, source, ref, utm_source, utm_campaign, utm_content, consent_text, consent_text_version, consent_mode,
                            consent_at, consent_source, stage, stage_entered_at, conv_state)
  SELECT gen_random_uuid(), $2::uuid, $3::uuid, now(), 'calcom_booking', $4, public.smc_hash_contact($4), nullif($5, ''),
         CASE WHEN nullif($5, '') IS NULL THEN NULL ELSE 'unchecked' END, nullif($6, ''), nullif($7, ''),
         'page', $8, nullif($9, ''), nullif($10, ''), nullif($11, ''), nullif($12, ''), $13, $14, 'generic',
         $15::timestamptz, 'calcom', 'booked', now(), jsonb_build_object('state', 'booked', 'via', 'calcom')
   WHERE NOT EXISTS (SELECT 1 FROM ex)
  RETURNING id),
upd AS (
  UPDATE public.leads l
     SET email = coalesce(l.email, nullif($5, '')), broker_id = coalesce(l.broker_id, $3::uuid), routed_at = coalesce(l.routed_at, now()),
         ref = coalesce(l.ref, nullif($9, '')), utm_source = coalesce(l.utm_source, nullif($10, '')),
         utm_campaign = coalesce(l.utm_campaign, nullif($11, '')), utm_content = coalesce(l.utm_content, nullif($12, '')),
         stage = 'booked', stage_entered_at = now(),
         conv_state = coalesce(l.conv_state, '{}'::jsonb) || jsonb_build_object('state', 'booked', 'via', 'calcom'), updated_at = now()
   WHERE l.id = (SELECT id FROM ex)
  RETURNING l.id),
lead AS (SELECT id FROM ins UNION ALL SELECT id FROM upd),
prev AS (
  UPDATE public.appointments SET status = 'rescheduled', updated_at = now()
   WHERE $22 <> '' AND id = nullif($22, '')::uuid AND status IN ('booked', 'confirmed', 'pending_verification')
  RETURNING id),
appt AS (
  INSERT INTO public.appointments (client_id, broker_id, brand_id, appointment_date, ends_at, method, status, booked_via, booked_at,
                                   idempotency_key, consent_ref, ical_uid, calendar_provider, calendar_email, previous_booking_id, reschedule_count)
  SELECT (SELECT id FROM lead), $3::uuid, $2::uuid, $16::timestamptz, $17::timestamptz, $18, 'booked', $26, now(),
         $19, $19, $20, 'outlook', nullif($21, ''), nullif($22, '')::uuid, $23::int
  ON CONFLICT DO NOTHING
  RETURNING id),
act AS (
  INSERT INTO public.lead_activities (lead_id, brand_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  SELECT (SELECT id FROM lead), $2::uuid, 'W37', 'lead', $24, $25::jsonb || jsonb_build_object('appointment_id', (SELECT id FROM appt)), now(), 'W37:' || $24 || ':' || $20
  ON CONFLICT DO NOTHING
  RETURNING id)
SELECT (SELECT id FROM lead) AS lead_id, (SELECT id FROM appt) AS appointment_id, (SELECT count(*) FROM prev) AS prev_closed, (SELECT count(*) FROM act) AS activities;`;
const UPSERT_ARGS = `={{ (() => { const p = $json; const l = p.lead; const a = p.appointment; return [ l.id || '', l.brand_id, l.broker_id, l.phone, l.email || '', l.first_name || '', l.last_name || '',
  l.source, l.ref || '', l.utm_source || '', l.utm_campaign || '', l.utm_content || '', l.consent_text, l.consent_text_version, l.consent_at,
  a.starts_at, a.ends_at, a.method, a.idempotency_key, p.ev.uid, a.calendar_email || '', a.previous_booking_id || '', String(a.reschedule_count || 0),
  p.activity.type, JSON.stringify(p.activity.payload), a.booked_via ]; })() }}`;
n.push(pg('Book: lead + appointment + consent (one statement)', [1540, -120], UPSERT, UPSERT_ARGS));
n.push(pg('Reschedule: new appointment + close the old one', [1540, 40], UPSERT, UPSERT_ARGS));
n.push(node('Opt-in record (lead_optins)', 'postgres', 2.5, [1760, -240], { operation: 'executeQuery', options: { queryReplacement: `={{ [ $json.lead_id, ${PLAN}.lead.brand_id, JSON.stringify(${PLAN}.optin || {}) ] }}` },
  query: `-- one append-only provenance row per consent (migration 20261017150000_lead_optins, not applied yet: until then this
-- node errors and the run carries on). channel is derived by the table's trigger.
INSERT INTO public.lead_optins (lead_id, brand_id, ref_code, via_source, via_campaign, via_content, referral_source_type,
                                referral_source_id, referral_source_url, referral_headline, ctwa_clid, consent_version,
                                consent_text, opener_text, message_sid, received_at, recorded_by)
SELECT $1::uuid, $2::uuid, o->>'ref_code', o->>'via_source', o->>'via_campaign', o->>'via_content', o->>'referral_source_type',
       o->>'referral_source_id', o->>'referral_source_url', o->>'referral_headline', o->>'ctwa_clid', o->>'consent_version',
       o->>'consent_text', o->>'opener_text', o->>'message_sid', (o->>'received_at')::timestamptz, o->>'recorded_by'
  FROM (SELECT $3::jsonb AS o) x
 WHERE $1 <> '' AND o->>'consent_version' IS NOT NULL
ON CONFLICT (message_sid) DO NOTHING
RETURNING id;` }, { credentials: PG, onError: 'continueRegularOutput' }));
n.push(ifTrue('Appointment stored?', [1760, -60], '!!$json.appointment_id'));
n.push(ifTrue('Send the confirm template?', [1980, -120], `!!${PLAN}.send`));
n.push(code('SUB input (booking_confirm_chat)', [2200, -180],
`const L = require('lv-automation').w37;
const p = $('Plan (w37.planCal)').item.json;
const s = L.confirmSend(p, $json.appointment_id, $json.lead_id);
return s ? [{ json: s }] : [];`));
n.push(node('WhatsApp Send (booking_confirm_chat)', 'executeWorkflow', 1.1, [2420, -180],
  { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } }, { onError: 'continueRegularOutput' }));
n.push(pg('Cancel: appointment + Lindi context', [1540, 200],
`WITH a AS (
  UPDATE public.appointments SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE id = $1::uuid AND status IN ('booked', 'confirmed', 'pending_verification')
  RETURNING id, client_id, brand_id),
l AS (
  UPDATE public.leads SET conv_state = coalesce(conv_state, '{}'::jsonb) || jsonb_build_object('state', 'unbooked', 'calcom_cancelled_at', now()),
         updated_at = now()
   WHERE id = (SELECT client_id FROM a)
  RETURNING id)
INSERT INTO public.lead_activities (lead_id, brand_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT a.client_id, a.brand_id, 'W37', 'lead', 'calcom_cancelled', $2::jsonb, now(), 'W37:calcom_cancelled:' || $3
  FROM a
ON CONFLICT DO NOTHING
RETURNING id;`, "={{ [ $json.appointment_id, JSON.stringify($json.activity.payload), $json.ev.uid ] }}"));
const ESC = (name, pos) => pg(name, pos,
`INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, raised_at, note)
VALUES (nullif($1, '')::uuid, 'needs_human', 'normal', 'appointments', $2, nullif($3, '')::uuid, now(), left($4, 500))
RETURNING id;`, `={{ (() => { const p = ${PLAN}; return [ $env.BRAND_ID || '', 'calcom:' + p.ev.uid, ($json.lead_id) || '', p.note || ('Cal.com ' + p.ev.event + ' ' + p.ev.uid + ': booking not stored (time taken or a duplicate); call the client') ]; })() }}`, { onError: 'continueRegularOutput' });
n.push(ESC('Escalate (Cal.com, needs a person)', [1540, 360]));
n.push(ESC('Escalate (booking not stored)', [1980, 40]));

link('POST /cal (Cal.com)', 'Verify signature + normalise (w37)');
link('Verify signature + normalise (w37)', 'Respond 200 / 401');
link('Verify signature + normalise (w37)', 'Booking event?');
link('Booking event?', 'Claim (other / calcom:<event>:<uid>)', 0);
link('Claim (other / calcom:<event>:<uid>)', 'Load context (broker, lead, booking)');
link('Load context (broker, lead, booking)', 'Plan (w37.planCal)');
link('Plan (w37.planCal)', 'Action?');
link('Action?', 'Book: lead + appointment + consent (one statement)', 0);
link('Action?', 'Reschedule: new appointment + close the old one', 1);
link('Action?', 'Cancel: appointment + Lindi context', 2);
link('Action?', 'Escalate (Cal.com, needs a person)', 3);
for (const s of ['Book: lead + appointment + consent (one statement)', 'Reschedule: new appointment + close the old one']) {
  link(s, 'Opt-in record (lead_optins)');
  link(s, 'Appointment stored?');
}
link('Appointment stored?', 'Send the confirm template?', 0);
link('Appointment stored?', 'Escalate (booking not stored)', 1);
link('Send the confirm template?', 'SUB input (booking_confirm_chat)', 0);
link('SUB input (booking_confirm_chat)', 'WhatsApp Send (booking_confirm_chat)');

const wf = { id: 'smc-w37', name: 'W37 Cal.com booking intake', nodes: n, connections: c, active: false, settings: SETTINGS, pinData: {},
  tags: [{ name: 'intake' }, { name: 'calcom' }], meta: { notes: 'Generated by automation/build-w37-cal.mjs; logic automation/lib/w37-cal.mjs; do not hand-edit.' } };
writeFileSync(join(HERE, 'W37.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote automation/W37.json');
