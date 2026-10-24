#!/usr/bin/env node
// Generates automation/W38.json: "W38 SMC lead alert (owner)" (18 Oct 2026, Jono: tell me whenever a SortMyCover lead or
// booking comes through; the dry-run ads route every lead to his own test practice, which has no WhatsApp number on purpose).
//   node automation/build-w38.mjs
// Logic: automation/lib/w38.mjs (tests: automation/tests/W38.test.mjs). Contract: CONTRACTS.md "W38 SMC lead alert (owner)".
// Every minute: new leads + bookings + console escalations + booking changes / voice call-backs / W01 routing since the watermark
// (workflow static data) -> ONE WhatsApp to the owner from the SortMyCover number through smc-whatsapp-send (lib/owner-alert.mjs; owner
// rule 24 Oct 2026, docs/OWNER-ALERTS-AUDIT.md). The sender answering ok:false falls back to EMMA POST
// https://emmadoesit.cloud/api/notify (x-emma-secret). The watermark moves only after an ok / 2xx, so a failed send is retried.
// Env: SMC_LEAD_ALERT_ENABLED ('true' = on; anything else: nothing runs), SMC_OWNER_WHATSAPP (else OPS_WHATSAPP_JONATHAN, else
// the documented default), TWILIO_CONTENT_SIDS (ops_update, else ops_alert), EMMA_SHARED_SECRET (fallback), DRY_RUN_SENDS
// (the sender dry-runs; the EMMA gate is inserted by gateSenders). Credential by name only (id ''), bound at import. Inactive in the file.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { NOTIFY_URL, ROW_LIMIT, ACTIVITY_TYPES } from './lib/w38.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { gateSenders } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `w38n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const code = (name, pos, jsCode) => node(name, 'code', 2, pos, { mode: 'runOnceForAllItems', jsCode });
const ifTrue = (name, pos, expr) => node(name, 'if', 2, pos, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const c = {};
const link = (from, to, out = 0) => { const x = (c[from] ||= { main: [] }); while (x.main.length <= out) x.main.push([]); x.main[out].push({ node: to, type: 'main', index: 0 }); };

const TRIGGER = 'Every minute';
const START = 'Start tick (w38.start: gate + window)';
const READ = 'Read new SMC leads, bookings, escalations, changes';
const PLAN = 'Plan alert (w38.plan)';
const OWNER = 'Owner WhatsApp item (w38.ownerItems)';
const OWNER_SEND = 'Owner WhatsApp (smc-whatsapp-send)';
const OWNER_OK = 'WhatsApp sent? (ok)';
const SEND = 'Notify Jono (EMMA /api/notify, fallback)';
const COMMIT = 'Commit or hold (w38.commit)';
const FAILING = 'Third failure in a row?';
const STOP = 'Fail the run once (W22 emails ops)';

// Data minimisation at the source: only these fields leave the database (and so reach n8n's execution data).
// `lead` = the first 8 characters of the lead id (an internal reference, not personal information): plan() folds a W01
// `routed` row that arrives in the same tick as its lead into the lead's own "routed to ..." line.
const PERSON = `'first_name', split_part(btrim(coalesce(l.first_name, '')), ' ', 1),
                    'phone_last3', right(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), 3),
                    'lead', left(l.id::text, 8)`;
// Test / real split (23 Oct 2026, lib/routing-split.mjs; $3 = SMC_TEST_BROKER_IDS, $4 = the test numbers as E.164 digits, from
// w38.splitParams): only two booleans leave the database. The number is compared here, in E.164 digits (SA local 0... -> 27...).
const PHONE_E164 = `regexp_replace(regexp_replace(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), '^00', ''), '^0([0-9]{9})$', '27\\1')`;
const SPLIT = (brokerCol) => `'test_lead', coalesce(l.is_synthetic, false) OR coalesce(${PHONE_E164} = ANY (string_to_array(nullif($4, ''), ',')), false),
                    'test_practice', CASE WHEN coalesce($3, '') = '' OR ${brokerCol} IS NULL THEN NULL ELSE ${brokerCol}::text = ANY (string_to_array($3, ',')) END`;
const ACTIVITY_IN = ACTIVITY_TYPES.map((t) => `'${t}'`).join(', ');
const QUERY = `-- W38 SMC owner alert: SortMyCover leads, bookings, console escalations and booking changes created after the window
-- start (the watermark minus the overlap; empty on the first run, so no rows, only now()). Only a first name, the last 3
-- digits of the number, attribution labels, the routed practice, the booking time + method, an escalation's kind / severity /
-- esc_kind token and an activity's type + new time leave the database: never email, the full number, note or message text.
-- Escalations W07 raised (ref_table communications: chat hand-offs, never-silent) are left out: W07 alerts those itself.
-- Test / real split: test_lead + test_practice (booleans) per item; split_unknown_ids = an SMC_TEST_BROKER_IDS id is no broker.
SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS db_now,
       CASE WHEN coalesce($3, '') = '' THEN false
            ELSE (SELECT count(*) FROM public.brokers b WHERE b.id::text = ANY (string_to_array($3, ','))) < cardinality(string_to_array($3, ',')) END AS split_unknown_ids,
       coalesce((SELECT jsonb_agg(u.j ORDER BY u.t) FROM (
         SELECT t, j FROM (
           SELECT l.created_at AS t, jsonb_build_object(
                    'kind', 'lead', 'id', l.id, 'created_at', l.created_at,
                    ${PERSON},
                    'origin', l.origin, 'angle', l.angle, 'utm_campaign', l.utm_campaign, 'utm_content', l.utm_content, 'ref', l.ref,
                    'practice', b.practice_name, 'repeat', l.duplicate_of IS NOT NULL, 'synthetic', l.is_synthetic,
                    ${SPLIT('l.broker_id')}) AS j
             FROM public.leads l
             LEFT JOIN public.brokers b ON b.id = l.broker_id
            WHERE l.brand_id = $1::uuid AND l.created_at > nullif($2, '')::timestamptz
           UNION ALL
           SELECT a.created_at, jsonb_build_object(
                    'kind', 'booking', 'id', a.id, 'created_at', a.created_at, 'at', a.appointment_date, 'method', a.method,
                    'status', a.status, 'rebooked', a.previous_booking_id IS NOT NULL,
                    ${PERSON},
                    'practice', b.practice_name, 'synthetic', coalesce(l.is_synthetic, false),
                    ${SPLIT('a.broker_id')})
             FROM public.appointments a
             LEFT JOIN public.leads l ON l.id = a.client_id
             LEFT JOIN public.brokers b ON b.id = a.broker_id
            WHERE a.brand_id = $1::uuid AND a.created_at > nullif($2, '')::timestamptz
           UNION ALL
           SELECT e.raised_at, jsonb_build_object(
                    'kind', 'escalation', 'id', e.id, 'created_at', e.raised_at, 'esc', e.kind, 'severity', e.severity,
                    'esc_kind', CASE WHEN coalesce(e.note, '') LIKE 'esc_kind=%' THEN split_part(split_part(e.note, ';', 1), '=', 2) ELSE '' END,
                    ${PERSON},
                    'practice', b.practice_name, 'synthetic', coalesce(l.is_synthetic, false),
                    ${SPLIT('e.broker_id')})
             FROM public.escalations e
             LEFT JOIN public.leads l ON l.id = e.lead_id
             LEFT JOIN public.brokers b ON b.id = e.broker_id
            WHERE e.brand_id = $1::uuid AND e.raised_at > nullif($2, '')::timestamptz AND coalesce(e.ref_table, '') <> 'communications'
           UNION ALL
           SELECT la.occurred_at, jsonb_build_object(
                    'kind', 'activity', 'id', la.id, 'created_at', la.occurred_at, 'activity', la.activity_type, 'at', la.payload->>'to',
                    ${PERSON},
                    'practice', b.practice_name, 'synthetic', coalesce(l.is_synthetic, false),
                    ${SPLIT('la.broker_id')})
             FROM public.lead_activities la
             LEFT JOIN public.leads l ON l.id = la.lead_id
             LEFT JOIN public.brokers b ON b.id = la.broker_id
            WHERE la.brand_id = $1::uuid AND la.occurred_at > nullif($2, '')::timestamptz AND la.activity_type IN (${ACTIVITY_IN})
         ) x ORDER BY t LIMIT ${ROW_LIMIT}) u), '[]'::jsonb) AS items;`;

const n = [];
n.push(node('Sticky: read me', 'stickyNote', 1, [0, -460], { width: 820, height: 410, content:
  '## W38 SMC owner alert (leads, bookings, escalations), 18 Oct 2026 / owner rule 24 Oct 2026\n' +
  'Every minute: new SortMyCover leads (public.leads), bookings (public.appointments), console escalations (public.escalations, not the ones W07 alerts itself) and booking changes / voice call-backs / W01 routing (public.lead_activities; a lead routed after its own tick gets a "Routed: ..., to <practice>" line) since the watermark in this workflow\'s static data -> ONE WhatsApp to the owner from the SortMyCover number through smc-whatsapp-send (lib/owner-alert.mjs: template ops_update, else ops_alert; SMC_OWNER_WHATSAPP, else OPS_WHATSAPP_JONATHAN). The sender answering ok:false -> EMMA POST https://emmadoesit.cloud/api/notify (Teams / Telegram) as the fallback.\n' +
  '- First run: watermark = the database\'s now(), nothing sent (history is never replayed). Each tick re-reads a 5-minute overlap and skips ids already sent (de-dupe map, at most 200).\n' +
  '- The watermark moves only after the sender answered ok (or EMMA 2xx: last.channel = emma, last.sender_error = why the sender said no); a failed send is retried on the next tick; the 3rd failure in a row fails the run once, so W22 emails ops.\n' +
  '- POPIA: first name, the last 3 digits of the number, source / ad angle, the routed practice, booking time (SAST) and method, an escalation\'s kind + severity + esc_kind token. Never email, the full number, ID numbers, note or message text.\n' +
  '- Test / real split (23 Oct 2026): each line says TEST practice / real adviser and [test data]; WRONG SIDE flags an item routed across the line; a top warning when SMC_TEST_BROKER_IDS names an id that is no broker.\n' +
  'Env: SMC_LEAD_ALERT_ENABLED=true (anything else: nothing runs and the state is dropped), SMC_OWNER_WHATSAPP / OPS_WHATSAPP_JONATHAN, TWILIO_CONTENT_SIDS (ops_update | ops_alert), EMMA_SHARED_SECRET (fallback), DRY_RUN_SENDS (the sender dry-runs: logged, watermark advances); SMC_TEST_BROKER_IDS / SMC_TEST_PHONES / SYNTHETIC_TEST_NUMBERS for the labels.\n' +
  'Logic: automation/lib/w38.mjs + lib/owner-alert.mjs. Generated by automation/build-w38.mjs; do not hand-edit.' }));
n.push(node(TRIGGER, 'scheduleTrigger', 1.2, [0, 0], { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }));
n.push(code(START, [220, 0],
`const L = require('lv-automation').w38;
// SMC_LEAD_ALERT_ENABLED !== 'true': nothing runs and the state is dropped (switching it on again starts fresh: no replay).
const sd = $getWorkflowStaticData('global');
const t = L.start(sd, { SMC_LEAD_ALERT_ENABLED: $env.SMC_LEAD_ALERT_ENABLED });
if (!t.run) { for (const k of Object.keys(sd)) delete sd[k]; return []; }
// test / real split labels (lib/routing-split.mjs): $3 test broker ids, $4 test numbers (E.164 digits); '' = none
return [{ json: { brand_id: t.brand_id, since: t.since, ...L.splitParams($env) } }];`));
n.push(node(READ, 'postgres', 2.5, [440, 0], { operation: 'executeQuery', query: QUERY,
  options: { queryReplacement: '={{ [ $json.brand_id, $json.since, $json.test_broker_ids || "", $json.test_phones || "" ] }}' } }, { credentials: PG }));
n.push(code(PLAN, [660, 0],
`const L = require('lv-automation').w38;
const sd = $getWorkflowStaticData('global');
const r = $input.first().json || {};
const p = L.plan(sd, r.items, r.db_now, { split_unknown_ids: r.split_unknown_ids === true });
// init (first run) and idle (nothing new): the new watermark is kept now and nothing is sent.
// send: "Commit or hold" keeps the new watermark only after the WhatsApp sender answered ok (or EMMA 2xx on the fallback).
if (p.action !== 'send') { Object.assign(sd, p.next); return []; }
return [{ json: p }];`));
n.push(code(OWNER, [880, 0],
`const L = require('lv-automation').w38;
// ONE smc-whatsapp-send item to the owner number (lib/owner-alert.mjs): record:false, bypass_suppression:true, template
// ops_update / ops_alert, from the SortMyCover number. The sender applies the dry-run switch and the Content SID itself
// (this node must not name that switch: egress-gate reads upstream nodes to decide whether the EMMA fallback needs its own gate).
const p = $input.first().json;
const items = L.ownerItems(p, { SMC_OWNER_WHATSAPP: $env.SMC_OWNER_WHATSAPP, OPS_WHATSAPP_JONATHAN: $env.OPS_WHATSAPP_JONATHAN, TWILIO_CONTENT_SIDS: $env.TWILIO_CONTENT_SIDS });
return items.map((it) => ({ json: it }));`));
n.push(node(OWNER_SEND, 'executeWorkflow', 1.2, [1100, 0],
  { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } },
  { onError: 'continueRegularOutput', notes: 'Waits for the sender: its Result { ok, external_id, error } decides the commit; ok:false (no SID, Twilio error, sub down) takes the EMMA fallback.' }));
n.push(ifTrue(OWNER_OK, [1320, 0], '$json.ok === true'));
n.push(node(SEND, 'httpRequest', 4.2, [1760, 160], {
  method: 'POST', url: NOTIFY_URL,
  sendHeaders: true, headerParameters: { parameters: [{ name: 'content-type', value: 'application/json' }, { name: 'x-emma-secret', value: '={{ $env.EMMA_SHARED_SECRET }}' }] },
  sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify($('${PLAN}').first().json.request) }}`,
  options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } }, { onError: 'continueRegularOutput' }));
n.push(code(COMMIT, [1980, 0],
`const L = require('lv-automation').w38;
// Sender ok (or EMMA 2xx on the fallback, or the dry-run stub): keep the new watermark. Anything else: keep the old one, so the next tick sends the same items.
const sd = $getWorkflowStaticData('global');
const p = $('${PLAN}').first().json;
// the sender's own answer: when EMMA carried the tick, last.sender_error keeps why the WhatsApp rung said no
let sender = null; try { sender = $('${OWNER_SEND}').first().json; } catch (_) { sender = null; }
const c = L.commit(sd, p, $input.first().json || {}, new Date().toISOString(), sender);
for (const k of Object.keys(sd)) delete sd[k];
Object.assign(sd, c.state);
if (c.dry_run) console.log('[W38 DRY_RUN_SENDS=true: logged, not sent]\\n' + p.message);
return [{ json: { delivered: c.delivered, dry_run: c.dry_run, status: c.status, channel: c.channel, items: p.items, fails: c.state.fails || 0, alert: c.alert } }];`));
n.push(ifTrue(FAILING, [2200, 0], '$json.alert === true'));
n.push(node(STOP, 'stopAndError', 1, [2420, 0], { errorMessage: '=W38: neither smc-whatsapp-send nor EMMA /api/notify has delivered the SortMyCover owner alert {{ $json.fails }} ticks in a row (last status {{ $json.status }}). The watermark is held and every tick retries.' }));

link(TRIGGER, START);
link(START, READ);
link(READ, PLAN);
link(PLAN, OWNER);
link(OWNER, OWNER_SEND);
link(OWNER_SEND, OWNER_OK);
link(OWNER_OK, COMMIT, 0);
link(OWNER_OK, SEND, 1);
link(SEND, COMMIT);
link(COMMIT, FAILING);
link(FAILING, STOP, 0);

// gateSenders inserts "Live send? (Notify Jono ...)" (DRY_RUN_SENDS) before the EMMA POST and a dry-run stub that hands
// { dry_run: true, statusCode: 200 } to "Commit or hold". The WhatsApp sender gates itself (SUB.test.mjs).
const wf = gateSenders({ id: 'smc-w38', name: 'W38 SMC lead alert (owner)', nodes: n, connections: c, active: false,
  settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', saveManualExecutions: true,
    saveExecutionProgress: false, errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner' },
  pinData: {}, tags: [{ name: 'SortMyCover' }, { name: 'alerts' }], meta: { notes: 'Generated by automation/build-w38.mjs; logic automation/lib/w38.mjs + lib/owner-alert.mjs; do not hand-edit.' } });
writeFileSync(join(HERE, 'W38.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote automation/W38.json', wf.nodes.length, 'nodes');
