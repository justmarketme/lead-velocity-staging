#!/usr/bin/env node
// Generates automation/W09.json, automation/W12.json and automation/W13.json (DRAFTS pending GATE-TEST-W09/W12/W13).
// The logic lives in automation/lib/w09.mjs, w12.mjs, w13.mjs (pure, no I/O); every Code node loads it with
// require('lv-automation').w09 / .w12 / .w13 (I-46c: n8n's runner allow-lists the exact name `lv-automation` =
// automation/index.cjs; NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation), so automation/tests/W09/W12/W13.test.mjs exercise
// the running code. Every workflow has a stable top-level id (smc-w09 / smc-w12 / smc-w13, I-44b); Execute Workflow
// nodes and settings.errorWorkflow reference other workflows by id (smc-wNN), the name is kept as cachedResultName.
//   node automation/build-w09-w12-w13.mjs
// Credentials by name only (id ''), every secret via $env, workflows inactive, sends behind DRY_RUN_SENDS.
// Zero dependencies.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PG_CRED = 'LV Supabase - n8n_app (least privilege)';
const PG = { postgres: { id: '', name: PG_CRED } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, errorWorkflow: 'smc-w22' };

let seq = 0;
let NODES = [];
let CONN = {};
const P = (col, row) => [col * 240, row * 200];
const add = (x) => { NODES.push(x); return x.name; };
const node = (name, type, typeVersion, pos, parameters, extra = {}) => add({ id: `n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position: P(...pos), parameters, ...extra });
const code = (name, pos, jsCode, mode = 'runOnceForEachItem') => node(name, 'code', 2, pos, { mode, jsCode });
const pg = (name, pos, query, replacement, extra = {}) => node(name, 'postgres', 2.5, pos, { operation: 'executeQuery', query, options: replacement ? { queryReplacement: replacement } : {} }, { credentials: PG, alwaysOutputData: false, ...extra });
// Callee name -> stable workflow id (I-44b). "W04 Slots API" -> smc-w04; "CAPI Send" (no W number) -> smc-capi-send.
const workflowIdOf = (target) => { const m = /^W(\d\d)\b/.exec(target); return m ? `smc-w${m[1]}` : `smc-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; };
const sub = (name, pos, target, wait = false) => node(name, 'executeWorkflow', 1.1, pos, { source: 'database', workflowId: { __rl: true, mode: 'id', value: workflowIdOf(target), cachedResultName: target }, options: { waitForSubWorkflow: wait } });
const trigger = (name, pos) => node(name, 'executeWorkflowTrigger', 1.1, pos, { inputSource: 'passthrough' });
const cron = (name, pos, expression) => node(name, 'scheduleTrigger', 1.2, pos, { rule: { interval: [{ field: 'cronExpression', expression }] } });
const sticky = (content) => node('Sticky: read me', 'stickyNote', 1, [0, -2], { width: 900, height: 380, content });
const ifTrue = (name, pos, expr) => node(name, 'if', 2, pos, { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } });
const switchOn = (name, pos, expr, keys) => node(name, 'switch', 3, pos, {
  rules: { values: keys.map((k, i) => ({ outputKey: k, renameOutput: true, conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: `s${i}`, leftValue: `={{ ${expr} }}`, rightValue: k, operator: { type: 'string', operation: 'equals' } }] } })) },
  options: { fallbackOutput: 'extra' }
});
const link = (from, to, out = 0) => {
  CONN[from] ??= { main: [] };
  while (CONN[from].main.length <= out) CONN[from].main.push([]);
  CONN[from].main[out].push({ node: to, type: 'main', index: 0 });
};
const IMPORT = (mod) => `const L = require('lv-automation').${mod};\n`;
const ACTIVITY_COLS = 'lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key';

// ---------------------------------------------------------------------------------------------------------------
// Shared send chain: every item carries `send` = { to: 'lead'|'broker', wa, lead_id, brand_id, broker_id, template,
// category, key, workflow }. DRY_RUN_SENDS guard; communications row; I-38d last_contact_at for lead sends Meta
// accepted (wamid); a rejected send is logged once (W22 reads the timeline) - never retried in a loop.
// ---------------------------------------------------------------------------------------------------------------
function sendChain(wf, col, row) {
  const live = ifTrue('Live send?', [col, row], "$env.DRY_RUN_SENDS !== 'true'");
  const http = node('Send WhatsApp', 'httpRequest', 4.2, [col + 1, row], {
    method: 'POST',
    url: '=https://graph.facebook.com/{{ $env.META_GRAPH_VERSION }}/{{ $env.PHONE_NUMBER_ID }}/messages',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.META_SYSTEM_USER_TOKEN }}' }, { name: 'Content-Type', value: 'application/json' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.send.wa) }}',
    options: { timeout: 10000, response: { response: { neverError: true } } }
  });
  const store = pg('Store outbound', [col + 2, row - 1],
    `INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id, lead_id, broker_id, author, workflow, template_name, template_category, metadata)
VALUES ($1::uuid, 'whatsapp', 'outbound', 'system', $2, $3, $4, $5, $6, $7::uuid, $8::uuid, 'system', '${wf}', $9, $10, $11::jsonb)
ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING;`,
    `={{ (() => { const s = $('Live send?').item.json.send; const id = ($json.messages && $json.messages[0] && $json.messages[0].id) || null; return [s.brand_id, s.to === 'lead' ? 'client' : 'broker', s.wa.to, s.template || (s.wa.type === 'interactive' ? 'interactive' : 'text'), id || $env.DRY_RUN_SENDS === 'true' ? 'sent' : 'failed', id || (($env.DRY_RUN_SENDS === 'true' ? 'dry:' : 'failed:') + s.key), s.lead_id, s.broker_id, s.template || null, s.template ? 'utility' : 'service', JSON.stringify({ key: s.key, to: s.to, dry_run: $env.DRY_RUN_SENDS === 'true' })]; })() }}`,
    { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 });
  const touch = pg('Touch leads.last_contact_at (lead outbound)', [col + 2, row],
    `-- CONTRACTS.md I-38d: every lead-facing send Meta accepted (wamid) updates last_contact_at (W34 retention clock).
-- Broker messages, dry runs and rejected sends do not.
UPDATE public.leads SET last_contact_at = now()
 WHERE id = $1::uuid AND $2 = 'lead' AND $3 <> ''
RETURNING id;`,
    `={{ (() => { const s = $('Live send?').item.json.send; return [s.lead_id, s.to, ($json.messages && $json.messages[0] && $json.messages[0].id) || '']; })() }}`);
  const acc = ifTrue('Accepted by Meta? (wamid)', [col + 2, row + 1], '!!($json.messages && $json.messages[0] && $json.messages[0].id)');
  const fail = pg('Log send failed (once; W22 reads it)', [col + 3, row + 1],
    `INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT $1::uuid, $2::uuid, $3::uuid, NULL, '${wf}', 'system', 'send_failed', $4::jsonb, now(), 'send_failed:' || $5
 WHERE $1::uuid IS NOT NULL OR $3::uuid IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;`,
    `={{ (() => { const s = $('Live send?').item.json.send; return [s.lead_id, s.brand_id, s.broker_id, JSON.stringify({ key: s.key, template: s.template, error: ($json.error && ($json.error.message || $json.error.code)) || 'no wamid' }), s.key]; })() }}`);
  link(live, http, 0); link(live, store, 1);
  link(http, store); link(http, touch); link(http, acc);
  link(acc, fail, 1);
  return live;
}

const rejectNode = (wf, pos, idExpr) => pg('Log subcall_rejected (CONTRACTS: never guessed)', pos,
  `INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT x.lead_id, x.brand_id, x.broker_id, NULL, '${wf}', 'system', 'subcall_rejected', $3::jsonb, now(), NULL
  FROM (SELECT COALESCE($1::uuid, a.client_id) AS lead_id, a.brand_id, a.broker_id
          FROM (SELECT 1) one
          LEFT JOIN public.appointments a ON a.id = $2::uuid) x
 WHERE x.lead_id IS NOT NULL OR x.broker_id IS NOT NULL;`,
  `={{ [${idExpr}.lead_id || null, ${idExpr}.booking_id || null, JSON.stringify({ missing: $json.missing, asked_op: $json.asked_op || null, source: $json.source || null })] }}`);

const finish = (id, name, notes, tags) => {
  const wf = { id, name, nodes: NODES, connections: CONN, active: false, settings: SETTINGS, pinData: {}, tags: tags.map((t) => ({ name: t })), meta: { notes } };
  NODES = []; CONN = {}; seq = 0;
  return wf;
};

// =============================================================================================================== W09
function buildW09() {
  sticky('W09 Reminder sequence (client), 4.6 item 6 + 4.12. DRAFT pending GATE-TEST-W09 (nodes stay "in progress" until Jonathan approves automation/tests/W09.test.mjs).\n' +
    'Logic: automation/lib/w09.mjs (pure), loaded by every Code node through the lv-automation loader (index.cjs). Jobs are lead_activities rows (activity_type reminder_job, idempotency_key w09:{booking}:{touch}:{at}); a job is finished by ONE append-only reminder_done row (key w09done:{job key}: sent / skipped / cancelled), so each touch is sent at most once even if two ticks overlap (ON CONFLICT DO NOTHING is the claim; no retry storm).\n' +
    'Entries (CONTRACTS.md "Sub-workflow interfaces"): schedule {booking_id} (W05) · rebuild {booking_id} (W10, W05 previous_booking_id) · cancel_all {booking_id|lead_id} (W10, W13, W15) · pause {lead_id, reason} (W07, W15) · resume {lead_id} (console) · taps confirm:{bk} / play_voice_note:{bk} / looking_forward:{bk} (W07) · tick (every 5 min; staging test hook passes {op:"tick", now, is_synthetic:true}, honoured only with TEST_HOOKS_ENABLED=true and only for synthetic leads).\n' +
    'Sequence: what_to_expect T0+10 min · intro_media(_voice) T-48 h if booked >= 3 days out else T0+15 min (once per lead) · reminder_24h + prep_nudge T-24 h (skipped < 24 h ahead) · reminder_2h · reminder_10m. Quiet hours 20:00-08:00 SAST (reminder_10m exempt). Stops at send time on STOP, suppression, pause, booking moved/not live, meeting started, 12-message budget (reminders are essential).\n' +
    'Every lead send Meta accepts touches leads.last_contact_at (I-38d). Needs NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation. Env: DRY_RUN_SENDS, META_GRAPH_VERSION, PHONE_NUMBER_ID, META_SYSTEM_USER_TOKEN, TEST_HOOKS_ENABLED.');

  const tSub = trigger('Called by W05 / W07 / W10 / W13 / W15 / console', [0, 0]);
  const tCron = cron('Every 5 minutes (due reminders)', [0, 1], '*/5 * * * *');
  const tickIn = code('Tick input', [1, 1], 'return { json: { op: \'tick\' } };');
  const cls = code('Classify + validate (w09.classifyOp)', [2, 0], IMPORT('w09') +
`const j = $json;
const op = L.classifyOp(j);
const v = L.validateInput(op, j);
const wall = Date.now();
const now = L.nowFrom(j, $env, wall);
const booking_id = j.booking_id || (j.msg ? L.tapBookingId(j.msg) : null) || null;
return { json: { ...j, op: v.ok ? op : 'reject', asked_op: op, missing: v.ok ? [] : v.missing, booking_id, lead_id: j.lead_id || (j.lead && j.lead.id) || null, now_iso: L.iso(now), synthetic_only: now !== wall } };`);
  link(tSub, cls); link(tCron, tickIn); link(tickIn, cls);
  const OPS = ['schedule', 'rebuild', 'cancel_all', 'pause', 'resume', 'tick', 'confirm', 'media_tap', 'reject'];
  const sw = switchOn('Op', [3, 0], '$json.op', OPS);
  link(cls, sw);

  // ---- schedule / rebuild
  const load = pg('Load booking, lead, broker (plan)', [4, -1],
`SELECT a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, a.cycle_id, a.appointment_date, a.status,
       COALESCE(a.booked_at, a.created_at) AS booked_at,
       l.language, l.opted_out_at, l.is_synthetic,
       b.intro_video_url, b.intro_voice_url, b.intro_media_pref,
       -- once per lead lineage: what_to_expect / intro media already sent for ANY booking of this lead
       COALESCE((SELECT jsonb_agg(DISTINCT d.payload->>'touch') FROM public.lead_activities d
                  WHERE d.lead_id = a.client_id AND d.activity_type = 'reminder_done' AND d.payload->>'status' = 'sent'), '[]'::jsonb) AS lineage_sent
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.client_id
  JOIN public.brokers b ON b.id = a.broker_id
 WHERE a.id = $1::uuid AND a.brand_id IS NOT NULL;`,
    '={{ [$json.booking_id] }}');
  link(sw, load, 0); link(sw, load, 1);
  const plan = code('Plan (w09.planFromRow)', [5, -1], IMPORT('w09') +
`const c = $('Classify + validate (w09.classifyOp)').item.json;
const r = $json;
if (!r.booking_id) return { json: { skip: true } };
const p = L.planFromRow(r, c.op, Date.parse(c.now_iso), { clockShifted: c.synthetic_only === true });
return { json: { ...r, op: c.op, start: p.start, compressed: p.plan.compressed, rows: p.rows } };`);
  link(load, plan);
  const cancelOld = pg('Cancel unsent jobs for an older time (rebuild)', [6, -1],
`-- W10 move / W05 rebook: unsent jobs planned for another start time are finished as 'cancelled' (append-only).
INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT j.lead_id, j.brand_id, j.broker_id, j.cycle_id, 'W09', 'system', 'reminder_done',
       jsonb_build_object('key', j.idempotency_key, 'touch', j.payload->>'touch', 'status', 'cancelled', 'why', 'booking_moved'), now(), 'w09done:' || j.idempotency_key
  FROM public.lead_activities j
 WHERE j.activity_type = 'reminder_job' AND j.payload->>'booking_id' = $1::text AND j.payload->>'start' <> $2::text
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities d WHERE d.idempotency_key = 'w09done:' || j.idempotency_key)
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.booking_id, $json.start] }}', { alwaysOutputData: true });
  link(plan, cancelOld);
  const insJobs = pg('Insert jobs (one row per key)', [7, -1],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'W09', 'system', 'reminder_job',
       jsonb_build_object('booking_id', $5::text, 'touch', r.touch, 'template', r.template, 'at', r.at, 'start', r.start, 'compressed', r.compressed),
       now(), r.key
  FROM jsonb_to_recordset($6::jsonb) AS r(key text, touch text, template text, at text, start text, compressed boolean)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key;`,
    "={{ (() => { const p = $('Plan (w09.planFromRow)').item.json; return [p.lead_id, p.brand_id, p.broker_id, p.cycle_id, p.booking_id, JSON.stringify(p.rows || [])]; })() }}");
  link(cancelOld, insJobs);

  // ---- cancel_all
  const cancelAll = pg('Cancel all unsent jobs (booking or lead)', [4, 0],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT j.lead_id, j.brand_id, j.broker_id, j.cycle_id, 'W09', 'system', 'reminder_done',
       jsonb_build_object('key', j.idempotency_key, 'touch', j.payload->>'touch', 'status', 'cancelled', 'why', $3::text), now(), 'w09done:' || j.idempotency_key
  FROM public.lead_activities j
 WHERE j.activity_type = 'reminder_job'
   AND (j.payload->>'booking_id' = $1::text OR j.lead_id = $2::uuid)
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities d WHERE d.idempotency_key = 'w09done:' || j.idempotency_key)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key;`,
    "={{ [$json.booking_id || null, $json.lead_id || null, $json.reason || $json.source || 'cancel_all'] }}");
  link(sw, cancelAll, 2);

  // ---- pause / resume (append-only; the latest of the two wins at send time)
  const pause = pg('Pause reminders (lead)', [4, 1],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT l.id, l.brand_id, l.broker_id, l.cycle_id, 'W09', 'system', $2, jsonb_build_object('reason', $3::text, 'by', $4::text), now(), NULL
  FROM public.leads l WHERE l.id = $1::uuid;`,
    "={{ [$json.lead_id, 'reminder_paused', $json.reason, $json.source || null] }}");
  const resume = pg('Resume reminders (console, a human)', [4, 2],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT l.id, l.brand_id, l.broker_id, l.cycle_id, 'W09', 'admin', $2, jsonb_build_object('by', $3::text), now(), NULL
  FROM public.leads l WHERE l.id = $1::uuid;`,
    "={{ [$json.lead_id, 'reminder_resumed', $json.decided_by || 'console'] }}");
  link(sw, pause, 3); link(sw, resume, 4);

  // ---- tick: due jobs -> decide -> claim -> send
  const due = pg('Due jobs (pending, at <= now)', [4, 3],
`SELECT j.idempotency_key AS key, j.lead_id, j.brand_id, j.broker_id, j.cycle_id,
       j.payload->>'booking_id' AS booking_id, j.payload->>'touch' AS touch, j.payload->>'template' AS template,
       j.payload->>'at' AS at, j.payload->>'start' AS start,
       a.status AS booking_status, a.appointment_date, a.method, a.call_number AS booking_call_number,
       l.first_name, l.phone, l.language, l.opted_out_at, l.call_number AS lead_call_number,
       b.adviser_name, b.contact_person, b.phone_number AS broker_phone, b.whatsapp_number AS broker_whatsapp, b.intro_video_url, b.intro_voice_url,
       br.domain,
       EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = public.smc_hash_contact(l.phone)) AS suppressed,
       COALESCE((SELECT p.activity_type = 'reminder_paused' FROM public.lead_activities p
                  WHERE p.lead_id = j.lead_id AND p.activity_type IN ('reminder_paused','reminder_resumed')
                  ORDER BY p.occurred_at DESC LIMIT 1), false) AS paused,
       (SELECT count(*) FROM public.communications c WHERE c.lead_id = j.lead_id AND c.direction = 'outbound') AS outbound_count
  FROM public.lead_activities j
  JOIN public.appointments a ON a.id = (j.payload->>'booking_id')::uuid
  JOIN public.leads l ON l.id = j.lead_id
  JOIN public.brokers b ON b.id = a.broker_id
  LEFT JOIN public.brands br ON br.id = a.brand_id
 WHERE j.activity_type = 'reminder_job'
   AND (j.payload->>'at')::timestamptz <= $1::timestamptz
   AND (j.payload->>'at')::timestamptz > $1::timestamptz - interval '2 days'
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities d WHERE d.idempotency_key = 'w09done:' || j.idempotency_key)
   AND (NOT $2::boolean OR l.is_synthetic)
 ORDER BY (j.payload->>'at')::timestamptz
 LIMIT 200;`,
    '={{ [$json.now_iso, $json.synthetic_only] }}');
  link(sw, due, 5);
  const decide = code('Decide (w09.dueFromRow)', [5, 3], IMPORT('w09') +
`const c = $('Classify + validate (w09.classifyOp)').first().json;
const d = L.dueFromRow($json, Date.parse(c.now_iso));
return { json: { key: $json.key, lead_id: $json.lead_id, brand_id: $json.brand_id, broker_id: $json.broker_id, cycle_id: $json.cycle_id, touch: d.job.touch, action: d.decision.action, reason: d.decision.reason || null, send: d.send } };`);
  link(due, decide);
  const act = switchOn('Due action', [6, 3], '$json.action', ['send', 'skip']); // defer: nothing written, the next tick after 08:00 sends it
  link(decide, act);
  const claim = pg('Claim send (w09done key, first tick wins)', [7, 3],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'W09', 'system', 'reminder_done', jsonb_build_object('key', $5::text, 'touch', $6::text, 'status', 'sent', 'dry_run', $7::boolean), now(), 'w09done:' || $5)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    "={{ [$json.lead_id, $json.brand_id, $json.broker_id, $json.cycle_id, $json.key, $json.touch, $env.DRY_RUN_SENDS === 'true'] }}");
  const skip = pg('Finish as skipped (opt-out, moved, paused, budget, quiet)', [7, 4],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'W09', 'system', 'reminder_done', jsonb_build_object('key', $5::text, 'touch', $6::text, 'status', 'skipped', 'why', $7::text), now(), 'w09done:' || $5)
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.lead_id, $json.brand_id, $json.broker_id, $json.cycle_id, $json.key, $json.touch, $json.reason] }}');
  link(act, claim, 0); link(act, skip, 1);
  const claimed = ifTrue('Claimed? (send once)', [8, 3], '!!$json.id');
  link(claim, claimed);
  const pass = code('Send item (job)', [9, 3], "return { json: { send: $('Decide (w09.dueFromRow)').item.json.send } };");
  link(claimed, pass, 0);

  // ---- confirm tap
  const confirm = pg('Confirm booking (T-24 h Confirm tap)', [4, 5],
`WITH c AS (
  UPDATE public.appointments
     SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, $2::timestamptz), updated_at = now()
   WHERE id = $1::uuid AND status IN ('booked','confirmed')
  RETURNING id, client_id, brand_id, broker_id, cycle_id, appointment_date),
t AS (
  INSERT INTO public.lead_activities (${ACTIVITY_COLS})
  SELECT c.client_id, c.brand_id, c.broker_id, c.cycle_id, 'W09', 'lead', 'booking_confirmed', jsonb_build_object('booking_id', c.id::text), now(), 'w09:confirm:' || c.id::text
    FROM c
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id),
s AS (
  UPDATE public.leads l SET stage = 'confirmed', updated_at = now()
    FROM c WHERE l.id = c.client_id AND l.stage = 'booked'
  RETURNING l.id)
SELECT c.id AS booking_id, c.client_id AS lead_id, c.brand_id, c.broker_id, c.appointment_date,
       l.first_name, l.phone, l.language, b.adviser_name, b.contact_person,
       (SELECT count(*) FROM t) > 0 AS first_tap
  FROM c
  JOIN public.leads l ON l.id = c.client_id
  JOIN public.brokers b ON b.id = c.broker_id;`,
    "={{ [$json.booking_id, $json.now_iso] }}");
  link(sw, confirm, 6);
  const firstTap = ifTrue('First Confirm tap? (reply once)', [5, 5], '$json.first_tap === true');
  link(confirm, firstTap);
  const confirmReply = code('Confirm reply (w09.confirmReply)', [6, 5], IMPORT('w09') +
`const r = $json; const c = $('Classify + validate (w09.classifyOp)').item.json;
const m = L.confirmReply({ first_name: r.first_name, phone: r.phone, language: r.language }, { appointment_date: r.appointment_date }, { adviser_name: r.adviser_name, contact_person: r.contact_person }, Date.parse(c.now_iso));
return { json: { send: { to: 'lead', wa: m.wa, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, template: null, category: 'service', key: 'w09:confirm_reply:' + r.booking_id, workflow: 'W09' } } };`);
  link(firstTap, confirmReply, 0);

  // ---- intro media taps (Play voice note / Looking forward to it)
  const mediaLoad = pg('Load booking (intro media tap)', [4, 6],
`WITH t AS (
  UPDATE public.appointments SET intro_played_at = COALESCE(intro_played_at, now()), updated_at = now()
   WHERE id = $1::uuid AND $2 = 'play_voice_note'
  RETURNING id)
SELECT a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, a.cycle_id,
       l.phone, l.language, b.intro_voice_url
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.client_id
  JOIN public.brokers b ON b.id = a.broker_id
 WHERE a.id = $1::uuid;`,
    "={{ [$json.booking_id, String(($json.msg && $json.msg.payload) || '').split(':')[0]] }}");
  link(sw, mediaLoad, 7);
  const mediaTap = code('Intro media tap (w09.mediaTapReply)', [5, 6], IMPORT('w09') +
`const r = $json; const c = $('Classify + validate (w09.classifyOp)').item.json;
const m = L.mediaTapReply(c.msg || {}, { phone: r.phone, language: r.language }, { intro_voice_url: r.intro_voice_url || {} });
return { json: { ...r, activity: m.activity, send: m.wa ? { to: 'lead', wa: m.wa, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, template: null, category: 'service', key: 'w09:voice_played:' + r.booking_id + ':' + ((c.msg && c.msg.wamid) || c.now_iso), workflow: 'W09' } : null } };`);
  link(mediaLoad, mediaTap);
  const mediaLog = pg('Timeline: intro media tap', [6, 6],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'W09', 'lead', $5, jsonb_build_object('booking_id', $6::text), now(), NULL);`,
    '={{ [$json.lead_id, $json.brand_id, $json.broker_id, $json.cycle_id, $json.activity, $json.booking_id] }}');
  link(mediaTap, mediaLog);
  const hasVoice = ifTrue('Voice note to send?', [6, 7], "!!$('Intro media tap (w09.mediaTapReply)').item.json.send");
  link(mediaTap, hasVoice);

  link(sw, rejectNode('W09', [4, 8], '$json'), 8);

  const live = sendChain('W09', 10, 4);
  link(pass, live); link(confirmReply, live); link(hasVoice, live, 0);

  return finish('smc-w09', 'W09 Reminder sequence (DRAFT pending GATE-TEST-W09)',
    'automation-engineer. W09 reminder sequence (4.6 item 6, 4.12); logic automation/lib/w09.mjs; tests automation/tests/W09.test.mjs (GATE-TEST-W09). Generated by automation/build-w09-w12-w13.mjs.',
    ['reminders', 'whatsapp', 'draft']);
}

// =============================================================================================================== W12
function buildW12() {
  sticky('W12 Outcome, disposition & feedback (two-sided), 4.6 W12 row + 4.12a + Schedule C/D + 0.1 broker feedback rule. DRAFT pending GATE-TEST-W12.\n' +
    'Logic: automation/lib/w12.mjs (pure), loaded by every Code node through the lv-automation loader (index.cjs).\n' +
    'Broker side: broker_outcome_check at slot end + 15 min (Attended / No-show / Rescheduled), ONE nudge 3 h later. Attended -> one-tap disposition list at once (session; the tap opened his window; 4.12a codes; template broker_disposition only out of window) -> W29 takes the reply, asks quality 1-5 and the optional voice note. Unmarked at 24 h -> attended + auto_marked + unconfirmed (flagged in the console; two in a cycle -> Jonathan calls the broker). W11 keeps its 24-h backstop (ON CONFLICT (booking_id) DO NOTHING on both sides).\n' +
    'Lead side: reach_check at slot end + 30 min. Broker "No-show" counts only after the lead stays silent for the 2-h reach window; lead "No, not yet" waits for the broker (R6-03): still unmarked at broker_nudge_at = BROKER no-show (Schedule D: lines.mjs BROKER_NO_SHOW_APOLOGY, W10 rebook at our cost, KG alerted, never a replacement); a broker Attended / Rescheduled / No-show against it = conflict for KG in the console, nothing to the lead; Unreachable/wrong number = normal W13 path. Sides disagree -> console queue, nothing guessed.\n' +
    'Writes: outcomes (one row per booking, first writer wins), appointments.status, leads.stage, lead_activities timeline (w12:mark / w12:reach rows, last tap wins per CONTRACTS). Calls: W29 outcome_recorded (every outcome; pulse/facts, quality index), CAPI Send Attended, W13 no_show (missed_you + 48-h clock), W10 rebook. Voice note (op voice_note): only the WhatsApp media reference is stored (outcomes.voice_note_url = whatsapp-media:{id}).\n' +
    'Needs NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation. Env: DRY_RUN_SENDS, META_GRAPH_VERSION, PHONE_NUMBER_ID, META_SYSTEM_USER_TOKEN, TEST_HOOKS_ENABLED.');

  const tSub = trigger('Called by W07 / W11 / portal', [0, 0]);
  const tCron = cron('Every 5 minutes (post-call sweep)', [0, 1], '*/5 * * * *');
  const tickIn = code('Tick input', [1, 1], "return { json: { op: 'tick' } };");
  const cls = code('Classify + validate (w12.classifyOp)', [2, 0], IMPORT('w12') +
`const j = $json;
const op = L.classifyOp(j);
const v = L.validateInput(op, j);
const wall = Date.now();
const now = L.nowFrom(j, $env, wall);
const tap = L.parseTap(j.msg || {});
return { json: { ...j, op: v.ok ? op : 'reject', asked_op: op, missing: v.ok ? [] : v.missing, tap, booking_id: (tap && tap.booking_id) || j.booking_id || null, now_iso: L.iso(now), synthetic_only: now !== wall } };`);
  link(tSub, cls); link(tCron, tickIn); link(tickIn, cls);
  const OPS = ['tick', 'broker_tap', 'reach', 'auto_attended', 'voice_note', 'feedback', 'reject'];
  const sw = switchOn('Op', [3, 0], '$json.op', OPS);
  link(cls, sw);

  // ---- taps: record the side (last tap wins, one row per booking, CONTRACTS "reach_check rows")
  const markB = pg('Record broker mark (w12:mark, last tap wins)', [4, 1],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT a.client_id, a.brand_id, a.broker_id, a.cycle_id, 'W12', 'broker', 'broker_outcome_mark', jsonb_build_object('mark', $2::text, 'booking_id', a.id::text), now(), 'w12:mark:' || a.id::text
  FROM public.appointments a WHERE a.id = $1::uuid
ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, occurred_at = EXCLUDED.occurred_at
RETURNING lead_id, broker_id, payload->>'mark' AS mark;`,
    '={{ [$json.booking_id, $json.tap.mark] }}');
  const markL = pg('Record reach answer (w12:reach, last tap wins)', [4, 2],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT a.client_id, a.brand_id, a.broker_id, a.cycle_id, 'W12', 'lead', 'reach_check', jsonb_build_object('answer', $2::text, 'booking_id', a.id::text), now(), 'w12:reach:' || a.id::text
  FROM public.appointments a WHERE a.id = $1::uuid
ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, occurred_at = EXCLUDED.occurred_at
RETURNING lead_id, payload->>'answer' AS answer;`,
    '={{ [$json.booking_id, $json.tap.answer] }}');
  link(sw, markB, 1); link(sw, markL, 2);

  // ---- meeting state (sweep: every finished meeting without an outcome; tap: this booking)
  const state = pg('Meeting state (ended, no outcome yet)', [5, 0],
`SELECT a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, a.cycle_id, a.appointment_date, a.ends_at AS slot_end, a.status,
       l.first_name, l.last_name, l.phone, l.language, l.opted_out_at,
       b.adviser_name, b.contact_person, b.adviser_whatsapp, b.whatsapp_number,
       (SELECT m.payload->>'mark' FROM public.lead_activities m WHERE m.idempotency_key = 'w12:mark:' || a.id::text) AS broker_mark,
       (SELECT r.payload->>'answer' FROM public.lead_activities r WHERE r.idempotency_key = 'w12:reach:' || a.id::text) AS reach,
       EXISTS (SELECT 1 FROM public.lead_activities s WHERE s.idempotency_key = 'w12:outcome_check:' || a.id::text) AS sent_outcome_check,
       EXISTS (SELECT 1 FROM public.lead_activities s WHERE s.idempotency_key = 'w12:broker_nudge:' || a.id::text) AS sent_broker_nudge,
       EXISTS (SELECT 1 FROM public.lead_activities s WHERE s.idempotency_key = 'w12:reach_check:' || a.id::text) AS sent_reach_check,
       EXISTS (SELECT 1 FROM public.outcomes o WHERE o.booking_id = a.id) AS outcome_exists
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.client_id
  JOIN public.brokers b ON b.id = a.broker_id
 WHERE a.brand_id IS NOT NULL
   AND a.status IN ('booked','confirmed')
   AND ($3::uuid IS NOT NULL OR a.ends_at <= $1::timestamptz)
   AND a.ends_at > $1::timestamptz - interval '48 hours'
   AND ($3::uuid IS NULL OR a.id = $3::uuid)
   AND (NOT $2::boolean OR l.is_synthetic)
   AND NOT EXISTS (SELECT 1 FROM public.outcomes o WHERE o.booking_id = a.id)
 ORDER BY a.ends_at
 LIMIT 200;`,
    "={{ (() => { const c = $('Classify + validate (w12.classifyOp)').item.json; return [c.now_iso, c.synthetic_only, c.op === 'tick' ? null : c.booking_id]; })() }}");
  link(sw, state, 0); link(markB, state); link(markL, state);
  const decide = code('Decide (w12.sweepItems)', [6, 0], IMPORT('w12') +
`const c = $('Classify + validate (w12.classifyOp)').first().json;
const now = Date.parse(c.now_iso);
const out = [];
for (const it of $input.all()) if (it.json.booking_id) for (const x of L.sweepItems(it.json, now)) out.push({ json: x });
return out;`, 'runOnceForAllItems');
  link(state, decide);
  const kind = switchOn('Sweep item', [7, 0], '$json.fu', ['send', 'resolve']);
  link(decide, kind);
  const msgItem = code('Message item', [8, -2], 'return { json: $json };');
  link(kind, msgItem, 0);
  const claimMsg = pg('Claim message (w12 key, sent once)', [8, -1],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, 'W12', 'system', 'post_call_message', jsonb_build_object('template', $4::text, 'to', $5::text), now(), $6)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    '={{ [$json.send.lead_id, $json.send.brand_id, $json.send.broker_id, $json.send.template, $json.send.to, $json.send.key] }}');
  link(msgItem, claimMsg);
  const claimed = ifTrue('Claimed? (send once)', [9, -1], '!!$json.id');
  link(claimMsg, claimed);
  const claimedItem = code('Send item (claimed)', [10, -1], "return { json: { send: $('Message item').item.json.send } };");
  link(claimed, claimedItem, 0);

  // ---- resolve -> outcomes row (first writer wins) + appointment + lead stage + timeline + unconfirmed flags
  const writeQ = ifTrue('Write outcome? (not pending, not disputed)', [8, 1], '!!$json.o');
  link(kind, writeQ, 1);
  const ins = pg('Insert outcome + appointment + stage + timeline', [9, 1],
`WITH o AS (
  INSERT INTO public.outcomes (booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, lead_reach_check, marked_via, marked_at, auto_marked, unconfirmed, dispute_status)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9::timestamptz, $10::boolean, $11::boolean, $12)
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id, booking_id, lead_id, cycle_id),
ap AS (UPDATE public.appointments SET status = $13, updated_at = now() WHERE id IN (SELECT booking_id FROM o) RETURNING id),
st AS (UPDATE public.leads SET stage = COALESCE($14, stage), updated_at = now() WHERE id IN (SELECT lead_id FROM o) RETURNING id),
tl AS (
  INSERT INTO public.lead_activities (${ACTIVITY_COLS})
  SELECT o.lead_id, $5::uuid, $3::uuid, o.cycle_id, 'W12', 'system', 'outcome_recorded', jsonb_build_object('booking_id', o.booking_id::text, 'outcome', $6::text, 'auto_marked', $10::boolean, 'unconfirmed', $11::boolean, 'reach', $7::text), now(), 'w12:outcome:' || o.booking_id::text
    FROM o
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING id),
fl AS (
  INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, broker_id, raised_at, note)
  SELECT $5::uuid, 'outcome_unmarked', 'normal', 'outcomes', o.id::text, o.lead_id, $3::uuid, now(), 'esc_kind=outcome_unmarked; auto-marked attended at 24 h, unconfirmed'
    FROM o WHERE $11::boolean
  RETURNING id),
two AS (
  INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, broker_id, raised_at, note)
  SELECT $5::uuid, 'outcome_unmarked', 'urgent', 'outcomes', o.id::text, $3::uuid, now(), 'esc_kind=two_unconfirmed; Jonathan calls the broker (4.12a)'
    FROM o
   WHERE $11::boolean AND (SELECT count(*) FROM public.outcomes x WHERE x.cycle_id = o.cycle_id AND x.unconfirmed) + 1 >= 2
  RETURNING id)
SELECT o.id AS outcome_id FROM o;`,
    "={{ (() => { const x = $json; const r = x.row; const o = x.o; return [r.booking_id, r.lead_id, r.broker_id, r.cycle_id, r.brand_id, x.r.outcome, o.lead_reach_check, o.marked_via, o.marked_at, o.auto_marked, o.unconfirmed, o.dispute_status, o.appointment_status, o.lead_stage]; })() }}");
  link(writeQ, ins, 0);
  const fu = code('Follow-ups (w12.followUps)', [10, 1], IMPORT('w12') +
`const out = [];
$input.all().forEach((it, i) => {
  // inserted rows carry outcome_id (first writer only); the false branch of the If is the disputed item itself
  const src = it.json.outcome_id ? $('Write outcome? (not pending, not disputed)').itemMatching(i).json : it.json;
  for (const x of L.followUps(src.r, src.row, it.json.outcome_id || null)) out.push({ json: x });
});
return out;`, 'runOnceForAllItems');
  link(ins, fu); link(writeQ, fu, 1); // disputed (no row): alert only

  // ---- auto_attended (W11 inserted the row; W12 runs the attended path only, never asks the broker again)
  const auto = pg('Load auto-attended outcome (W11)', [4, 3],
`SELECT o.id AS outcome_id, o.booking_id, o.lead_id, o.broker_id, o.cycle_id, o.brand_id, o.lead_reach_check AS reach,
       a.appointment_date, a.ends_at AS slot_end,
       l.first_name, l.last_name, l.phone, l.language, l.opted_out_at,
       b.adviser_name, b.contact_person, b.adviser_whatsapp, b.whatsapp_number
  FROM public.outcomes o
  JOIN public.appointments a ON a.id = o.booking_id
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.brokers b ON b.id = o.broker_id
 WHERE o.id = $1::uuid AND o.outcome = 'attended' AND o.auto_marked;`,
    '={{ [$json.outcome_id] }}');
  link(sw, auto, 3);
  const autoFu = code('Auto-attended follow-ups (w12.resolveOutcome at 24 h)', [5, 3], IMPORT('w12') +
`const out = [];
for (const it of $input.all()) {
  const row = it.json; if (!row.outcome_id) continue;
  const r = L.resolveOutcome({ slotEnd: row.slot_end, brokerMark: null, reach: row.reach === 'yes' ? 'yes' : null, optedOut: Boolean(row.opted_out_at), leadId: row.lead_id }, Date.parse(row.slot_end) + L.AUTO_ATTEND_AFTER_END);
  for (const x of L.followUps(r, row, row.outcome_id)) out.push({ json: x });
}
return out;`, 'runOnceForAllItems');
  link(auto, autoFu);

  const fuSw = switchOn('Follow-up', [11, 2], '$json.fu', ['send', 'capi', 'w29', 'w13', 'w10', 'alert']);
  link(fu, fuSw); link(autoFu, fuSw);
  const capi = sub('CAPI Send (Attended)', [12, 2], 'CAPI Send');
  const w29 = sub('W29 outcome_recorded (quality, pulse facts)', [12, 3], 'W29 Feedback loop');
  const w13 = sub('W13 no_show (missed_you + 48-h clock)', [12, 4], 'W13 No-show & replacement');
  const w10 = sub('W10 rebook (Schedule D / broker Rescheduled)', [12, 5], 'W10 Reschedule / cancel');
  const alert = pg('Escalate (KG broker no-show / console dispute)', [12, 6],
`INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, broker_id, raised_at, note)
SELECT $1::uuid, $2, $3, 'appointments', $4, $5::uuid, $6::uuid, now(), $7
 WHERE NOT EXISTS (SELECT 1 FROM public.escalations e WHERE e.ref_table = 'appointments' AND e.ref_id = $4 AND e.kind = $2 AND e.resolved_at IS NULL);`,
    '={{ [$json.brand_id, $json.kind, $json.severity, $json.booking_id, $json.lead_id, $json.broker_id, $json.note] }}');
  link(fuSw, capi, 1); link(fuSw, w29, 2); link(fuSw, w13, 3); link(fuSw, w10, 4); link(fuSw, alert, 5);

  // ---- I-50f: a broker mark after the Schedule D apology went out -> KG conflict (escalation), nothing else
  const lateQ = pg('Late broker mark? (apology already sent)', [5, -2],
`SELECT o.id AS outcome_id, o.outcome, a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, $2::text AS mark,
       l.first_name, l.last_name, b.adviser_name, b.contact_person,
       EXISTS (SELECT 1 FROM public.lead_activities s WHERE s.idempotency_key = 'w12:apology:' || a.id::text) AS apology_sent
  FROM public.outcomes o
  JOIN public.appointments a ON a.id = o.booking_id
  JOIN public.leads l ON l.id = a.client_id
  JOIN public.brokers b ON b.id = a.broker_id
 WHERE o.booking_id = $1::uuid AND o.outcome = 'broker_no_show';`,
    "={{ [$('Classify + validate (w12.classifyOp)').item.json.booking_id, $json.mark || ''] }}");
  const lateFu = code('Late mark conflict (w12.lateMarkConflict)', [6, -2], IMPORT('w12') +
`const out = [];
for (const it of $input.all()) for (const x of L.lateMarkConflict(it.json)) out.push({ json: x });
return out;`, 'runOnceForAllItems');
  link(markB, lateQ); link(lateQ, lateFu); link(lateFu, fuSw);

  // ---- Attended tap -> disposition ask at once (list in window)
  const attTap = ifTrue('Attended tap? (ask disposition now)', [5, 1], "$json.mark === 'attended'");
  link(markB, attTap);
  const dispLoad = pg('Load meeting (disposition ask)', [6, 2],
`SELECT a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, a.cycle_id, a.appointment_date,
       l.first_name, l.last_name, l.phone, l.language,
       b.adviser_name, b.contact_person, b.adviser_whatsapp, b.whatsapp_number,
       (SELECT max(c.created_at) FROM public.communications c WHERE c.broker_id = b.id AND c.lead_id IS NULL AND c.direction = 'inbound' AND c.sender_type = 'broker') AS broker_last_inbound_at,
       EXISTS (SELECT 1 FROM public.outcomes o WHERE o.booking_id = a.id AND o.disposition_code IS NOT NULL) AS already_dispositioned
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.client_id
  JOIN public.brokers b ON b.id = a.broker_id
 WHERE a.id = $1::uuid;`,
    "={{ [$('Classify + validate (w12.classifyOp)').item.json.booking_id] }}");
  link(attTap, dispLoad, 0); link(sw, dispLoad, 5);
  const disp = code('Disposition ask (w12.dispositionItem)', [7, 2], IMPORT('w12') +
`const c = $('Classify + validate (w12.classifyOp)').first().json;
const out = [];
for (const it of $input.all()) {
  const r = it.json;
  if (!r.booking_id || r.already_dispositioned) continue;
  // an Attended tap opened the broker's 24-h window (the list); a portal/console 'feedback' op uses his last inbound
  const last = c.op === 'broker_tap' ? Date.parse(c.now_iso) : (r.broker_last_inbound_at ? Date.parse(r.broker_last_inbound_at) : NaN);
  out.push({ json: L.dispositionItem(r, Date.parse(c.now_iso), last) });
}
return out;`, 'runOnceForAllItems');
  link(dispLoad, disp);
  link(disp, msgItem);

  // ---- voice note: media reference only
  const vn = code('Voice note reference (w12.voiceNoteRef)', [4, 7], IMPORT('w12') +
`const m = $json.msg || { media: 'audio', media_id: $json.media_id };
const ref = L.voiceNoteRef(m);
return { json: { ...$json, ref, from: (m && m.from) || $json.from || null } };`);
  link(sw, vn, 4);
  const vnSave = pg('Store voice note reference (no audio, no transcript here)', [5, 7],
`UPDATE public.outcomes o SET voice_note_url = $2, updated_at = now()
 WHERE o.id = (SELECT x.id FROM public.outcomes x JOIN public.brokers b ON b.id = x.broker_id
                WHERE x.outcome = 'attended' AND x.voice_note_url IS NULL
                  AND (x.booking_id = $3::uuid OR ($3::uuid IS NULL AND (b.adviser_whatsapp = $1 OR b.whatsapp_number = $1) AND x.updated_at > now() - interval '60 minutes'))
                ORDER BY x.updated_at DESC LIMIT 1)
   AND $2 IS NOT NULL
RETURNING o.id, o.lead_id;`,
    '={{ [$json.from, $json.ref ? $json.ref.voice_note_url : null, $json.booking_id || null] }}');
  link(vn, vnSave);

  link(sw, rejectNode('W12', [4, 8], '$json'), 6);

  const live = sendChain('W12', 13, 0);
  link(claimedItem, live); link(fuSw, live, 0);

  return finish('smc-w12', 'W12 Outcome, disposition & feedback (DRAFT pending GATE-TEST-W12)',
    'automation-engineer. W12 outcome, disposition & feedback, two-sided (4.6, 4.12a, Schedule C/D); logic automation/lib/w12.mjs; tests automation/tests/W12.test.mjs (GATE-TEST-W12). Generated by automation/build-w09-w12-w13.mjs.',
    ['outcomes', 'whatsapp', 'draft']);
}

// =============================================================================================================== W13
function buildW13() {
  sticky('W13 No-show & replacement, 0.1 (per-cycle cap, "committed", shortfall) + 4.6 item 11 + 4.12a + Schedule C (C1A from W10) / D. DRAFT pending GATE-TEST-W13.\n' +
    'Logic: automation/lib/w13.mjs (pure), loaded by every Code node through the lv-automation loader (index.cjs).\n' +
    'ONE counter, ONE writer: public.replacements. Rows not "rejected" count against cycles.replacement_cap (snapshotted from pricing.replacement_cap_cycle: Bronze 4 / Silver 6 / Gold 9, no weekly cap). W10 (C1A claims), W29 (unreachable / nofit_criteria, withdraw on correction) and W12 (lead no-show) all CALL this workflow; none of them writes replacements. Claims are serialised per cycle with pg_advisory_xact_lock and counted after the lock; the smc_replacements_cap trigger stamps cap_position / over_cap; one replacement per lead (replacements_one_per_lead + a withdrawn claim frees the lead).\n' +
    'No-show: W12 confirms it (both sides) -> missed_you with 3 new times (ONE offer) -> 48 h without a rebook or a reply -> replacement_due (second no-show: at once) -> 48-h dispute window -> approved. Never for a broker no-show, never for "didn\'t buy". Over the cap -> claim recorded as rejected (cap_reached), Jonathan alerted; the committed number is unchanged.\n' +
    'Shortfall / extension / pro-rata credit are W19\'s: W13 only emits lead_activities replacement_approved rows (key w13:approved:{id}).\n' +
    'Needs NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation. Env: DRY_RUN_SENDS, META_GRAPH_VERSION, PHONE_NUMBER_ID, META_SYSTEM_USER_TOKEN, TEST_HOOKS_ENABLED.');

  const tSub = trigger('Called by W12 / W29 / W10 / console', [0, 0]);
  const tCron = cron('Hourly (48-h clocks: rebook wait + dispute window)', [0, 1], '7 * * * *');
  const tickIn = code('Tick input', [1, 1], "return { json: { op: 'tick' } };");
  const cls = code('Normalise + validate (w13.normaliseInput)', [2, 0], IMPORT('w13') +
`const j = $json;
const wall = Date.now();
const now = L.nowFrom(j, $env, wall);
if (j.op === 'tick') return { json: { op: 'tick', now_iso: L.iso(now), synthetic_only: now !== wall } };
const n = L.normaliseInput(j, now);
const v = L.validateInput(n);
return { json: { ...n, second_no_show: j.second_no_show === true, op: v.ok ? n.op : 'reject', asked_op: n.op || null, missing: v.ok ? [] : v.missing, now_iso: L.iso(now), synthetic_only: now !== wall } };`);
  link(tSub, cls); link(tCron, tickIn); link(tickIn, cls);
  const sw = switchOn('Op', [3, 0], '$json.op', ['claim', 'withdraw', 'no_show', 'dispute', 'decide', 'tick', 'reject']);
  link(cls, sw);

  // ---- claim (W10 C1A, W29 dispositions, system uncontactable, no-show clock) -> one shared claim chain
  const ctx = pg('Claim context (lead, cycle, cap)', [5, -1],
`SELECT l.id AS lead_id, l.brand_id, l.broker_id, l.first_name, l.last_name, l.verified_at,
       cy.id AS cycle_id, cy.replacement_cap, cy.tier_code, o.id AS outcome_id
  FROM public.leads l
  LEFT JOIN public.outcomes o ON o.id = $2::uuid
  JOIN public.brokers b ON b.id = l.broker_id
  LEFT JOIN public.cycles cy ON cy.id = COALESCE($3::uuid, o.cycle_id, l.cycle_id, b.current_cycle_id)
 WHERE l.id = COALESCE($1::uuid, o.lead_id);`,
    '={{ [$json.lead_id || null, $json.outcome_id || null, $json.cycle_id || null] }}');
  const claimIn = code('Claim input', [4, -1], 'return { json: $json };');
  link(sw, claimIn, 0); link(claimIn, ctx);
  const dec = code('Decide claim (w13.claimDecision)', [6, -1], IMPORT('w13') +
`const src = $('Claim input').item.json; // W10 / W29 / system claim, or the no-show path (carries trig)
const row = $json;
const d = L.claimDecision(src, row);
return { json: { ...row, source: src.source || null, booking_id: src.booking_id || null, idempotency_key: src.idempotency_key || null, claim: d.claim, why: d.why || null, trig: d.trig || null } };`);
  link(ctx, dec);
  const doClaim = ifTrue('Opens a replacement?', [7, -1], '$json.claim === true');
  link(dec, doClaim);
  const notDue = pg('Timeline: not a replacement (why)', [8, 0],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'W13', 'system', 'replacement_not_opened', jsonb_build_object('why', $5::text, 'source', $6::text), now(), NULL);`,
    '={{ [$json.lead_id, $json.brand_id, $json.broker_id, $json.cycle_id, $json.why, $json.source] }}');
  link(doClaim, notDue, 1);
  const claim = pg('Claim replacement (per-cycle lock, cap, one per lead)', [8, -1],
`-- One statement batch = one transaction: the advisory lock serialises claims for this cycle, so the count below
-- (taken after the lock) is exact. Rows not 'rejected' count (same rule as smc_replacements_cap and lib/w13 COUNTED).
SELECT pg_advisory_xact_lock(hashtext('w13:cycle:' || $4::text));
WITH used AS (SELECT count(*) AS n FROM public.replacements r WHERE r.cycle_id = $4::uuid AND r.status <> 'rejected'),
cap AS (SELECT cy.replacement_cap AS cap FROM public.cycles cy WHERE cy.id = $4::uuid),
ins AS (
  INSERT INTO public.replacements (lead_id, outcome_id, cycle_id, broker_id, brand_id, reason, reason_code, claimed_at, dispute_window_ends_at, status, note)
  SELECT $1::uuid, $2::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9::timestamptz, $9::timestamptz + interval '48 hours',
         CASE WHEN used.n >= cap.cap THEN 'rejected' ELSE 'due' END,
         CASE WHEN used.n >= cap.cap THEN 'cap_reached' END
    FROM used, cap
   WHERE NOT EXISTS (SELECT 1 FROM public.replacements x
                      WHERE x.lead_id = $1::uuid AND NOT (x.status = 'rejected' AND COALESCE(x.note, '') = 'withdrawn'))
  ON CONFLICT DO NOTHING
  RETURNING id, lead_id, cycle_id, status, note, cap_position, over_cap, dispute_window_ends_at, reason_code)
SELECT ins.*, cap.cap, (SELECT n FROM used) + 1 AS used_after FROM ins, cap;`,
    '={{ [$json.lead_id, $json.outcome_id || null, null, $json.cycle_id, $json.broker_id, $json.brand_id, $json.trig.reason, $json.trig.reason_code, $json.trig.due_at] }}');
  link(doClaim, claim, 0);
  const note = code('Alert + timeline text (w13.alertNote, committed wording)', [9, -1], IMPORT('w13') +
`// F11 (REHEARSAL-L01): the claim batch returns the pg_advisory_xact_lock row as well as the insert row, so this node runs
// once over all items, keeps only real replacements rows (id + lead_id) and finds its claim by lead_id (no .item lookup).
// Lead already holds a replacement -> only the lock row arrives -> nothing to alert.
const decided = $('Decide claim (w13.claimDecision)').all().map((i) => i.json);
const out = [];
$input.all().forEach((it, idx) => {
  const r = it.json || {};
  if (!r.id || !r.lead_id) return;
  const c = decided.find((d) => d.lead_id === r.lead_id) || decided[0] || {};
  const capReached = r.status === 'rejected' && r.note === 'cap_reached';
  const text = L.alertNote(capReached ? 'cap_reached' : 'due', { lead: { first_name: c.first_name, last_name: c.last_name }, used: r.cap_position, cap: r.cap, reason_code: r.reason_code, window_ends_at: r.dispute_window_ends_at ? L.iso(r.dispute_window_ends_at) : null });
  out.push({ json: { ...r, brand_id: c.brand_id, broker_id: c.broker_id, cap_reached: capReached, note_text: text, esc_kind: capReached ? 'other' : 'replacement_dispute', severity: capReached ? 'urgent' : 'normal', activity: capReached ? 'replacement_cap_reached' : 'replacement_due' }, pairedItem: { item: idx } });
});
return out;`, 'runOnceForAllItems');
  link(claim, note);
  const record = pg('Escalate + timeline + lead stage', [10, -1],
`WITH e AS (
  INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, broker_id, raised_at, note)
  VALUES ($1::uuid, $2, $3, 'replacements', $4, $5::uuid, $6::uuid, now(), $7)
  RETURNING id),
t AS (
  INSERT INTO public.lead_activities (${ACTIVITY_COLS})
  VALUES ($5::uuid, $1::uuid, $6::uuid, $8::uuid, 'W13', 'system', $9, jsonb_build_object('replacement_id', $4::text, 'status', $10::text, 'cap_position', $11::int), now(), 'w13:claim:' || $4)
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING id)
UPDATE public.leads SET stage = 'replacement_due', updated_at = now()
 WHERE id = $5::uuid AND $10 = 'due'
RETURNING id;`,
    '={{ [$json.brand_id, $json.esc_kind, $json.severity, $json.id, $json.lead_id, $json.broker_id, $json.note_text, $json.cycle_id, $json.activity, $json.status, $json.cap_position] }}');
  link(note, record);
  const isDue = ifTrue('Due? (stop any reminders left)', [11, -1], "$('Alert + timeline text (w13.alertNote, committed wording)').item.json.status === 'due'");
  link(record, isDue);
  const stopRem = code('W09 cancel_all payload', [12, -1], "return { json: { op: 'cancel_all', lead_id: $('Alert + timeline text (w13.alertNote, committed wording)').item.json.lead_id, reason: 'replacement_due', source: 'W13' } };");
  link(isDue, stopRem, 0);
  const w09 = sub('W09 cancel_all (lead)', [13, -1], 'W09 Reminder sequence');
  link(stopRem, w09);

  // ---- withdraw (W29 correction; only a 'due' row, only inside the window)
  const wd = pg('Withdraw (W29 correction, inside the window only)', [4, 1],
`WITH w AS (
  UPDATE public.replacements r SET status = 'rejected', note = 'withdrawn', updated_at = now()
   WHERE r.lead_id = COALESCE($1::uuid, (SELECT o.lead_id FROM public.outcomes o WHERE o.id = $2::uuid))
     AND r.status = 'due' AND r.dispute_window_ends_at > $3::timestamptz
  RETURNING r.id, r.lead_id, r.cycle_id, r.broker_id, r.brand_id)
INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT w.lead_id, w.brand_id, w.broker_id, w.cycle_id, 'W13', 'broker', 'replacement_withdrawn', jsonb_build_object('replacement_id', w.id::text), now(), 'w13:withdrawn:' || w.id::text
  FROM w
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.lead_id || null, $json.outcome_id || null, $json.now_iso] }}');
  link(sw, wd, 1);

  // ---- no_show (from W12): start the 48-h clock, offer missed_you once, or claim at once on a second no-show
  const ns = pg('No-show context + 48-h clock (w13:no_show:{booking})', [4, 2],
`WITH ctx AS (
  SELECT a.id AS booking_id, a.client_id AS lead_id, a.brand_id, a.broker_id, a.cycle_id,
         l.first_name, l.phone, l.opted_out_at, b.adviser_name, b.contact_person,
         EXISTS (SELECT 1 FROM public.outcomes x WHERE x.lead_id = a.client_id AND x.outcome = 'no_show' AND x.booking_id <> a.id) AS second_no_show
    FROM public.appointments a
    JOIN public.leads l ON l.id = a.client_id
    JOIN public.brokers b ON b.id = a.broker_id
   WHERE a.id = $1::uuid),
clk AS (
  INSERT INTO public.lead_activities (${ACTIVITY_COLS})
  SELECT ctx.lead_id, ctx.brand_id, ctx.broker_id, ctx.cycle_id, 'W13', 'system', 'no_show_clock',
         jsonb_build_object('booking_id', ctx.booking_id::text, 'outcome_id', $2::text, 'confirmed_at', $3::text, 'second', ctx.second_no_show), now(), 'w13:no_show:' || ctx.booking_id::text
    FROM ctx
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id)
SELECT ctx.*, (SELECT count(*) FROM clk) > 0 AS first_call FROM ctx;`,
    '={{ [$json.booking_id, $json.outcome_id, $json.confirmed_at] }}');
  link(sw, ns, 2);
  const nsFirst = ifTrue('First call for this no-show?', [5, 2], '$json.first_call === true');
  link(ns, nsFirst);
  const nsSecond = ifTrue('Second no-show? (claim at once)', [6, 2], '$json.second_no_show === true');
  link(nsFirst, nsSecond, 0);
  const secondTrig = code('No-show clock decision', [7, 1], IMPORT('w13') +
`// One node, two entries: a second no-show (claim at once) and the hourly 48-h clock rows.
const c = $('Normalise + validate (w13.normaliseInput)').first().json;
const r = $json;
const trig = r.second_no_show === true && !r.confirmed_at_row
  ? L.replacementTrigger({ kind: 'no_show', confirmed_at: c.confirmed_at || c.now_iso, second_no_show: true })
  : L.noShowClock(r);
return { json: { op: 'claim', lead_id: r.lead_id, outcome_id: r.outcome_id || c.outcome_id || null, cycle_id: r.cycle_id || null, booking_id: r.booking_id, source: 'W13 no_show', trig, decided_key: 'w13:no_show_decided:' + r.booking_id } };`);
  link(nsSecond, secondTrig, 0);
  const decided = pg('No-show decided (once per booking)', [8, 1],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT a.client_id, a.brand_id, a.broker_id, a.cycle_id, 'W13', 'system', 'no_show_decided', jsonb_build_object('due', $2::boolean, 'why', $3::text), now(), $4
  FROM public.appointments a WHERE a.id = $1::uuid
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    '={{ [$json.booking_id, !!$json.trig.due, $json.trig.why || null, $json.decided_key] }}');
  link(secondTrig, decided);
  const decidedDue = ifTrue('Decided now + due?', [9, 1], "!!$json.id && $('No-show clock decision').item.json.trig.due === true");
  link(decided, decidedDue);
  const toClaim = code('Claim input (no-show)', [10, 1], "return { json: $('No-show clock decision').item.json };");
  link(decidedDue, toClaim, 0);
  link(toClaim, claimIn);
  // first no-show: one missed_you offer with 3 new times (W04 waits), then the clock runs
  const slotsIn = code('W04 list input', [6, 3], "const r = $('No-show context + 48-h clock (w13:no_show:{booking})').item.json; return { json: { broker_id: r.broker_id, limit: 10 } };");
  const slots = sub('W04 slots for missed_you (waits)', [7, 3], 'W04 Slots API', true);
  link(nsSecond, slotsIn, 1); link(slotsIn, slots);
  const optedOut = code('missed_you (w13.missedYouItem)', [8, 3], IMPORT('w13') +
`const r = $('No-show context + 48-h clock (w13:no_show:{booking})').item.json;
if (r.opted_out_at) return { json: { send: null, why: 'opted_out' } };
const m = L.missedYouItem(r, ($json.slots || []));
return { json: { ...m, booking_id: r.booking_id, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id } };`);
  link(slots, optedOut);
  const claimMy = pg('Claim missed_you (sent once)', [9, 3],
`INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT $1::uuid, $2::uuid, $3::uuid, NULL, 'W13', 'system', 'missed_you', jsonb_build_object('booking_id', $4::text, 'sent', $5::boolean, 'why', $6::text), now(), 'w13:missed_you:' || $4
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    '={{ [$json.lead_id, $json.brand_id, $json.broker_id, $json.booking_id, !!$json.send, $json.why || null] }}');
  link(optedOut, claimMy);
  const myOk = ifTrue('Claimed + message built?', [10, 3], "!!$json.id && !!$('missed_you (w13.missedYouItem)').item.json.send");
  link(claimMy, myOk);
  const mySend = code('Send item (missed_you)', [11, 3], "return { json: { send: $('missed_you (w13.missedYouItem)').item.json.send } };");
  link(myOk, mySend, 0);

  // ---- console: dispute / decide
  const disp = pg('Dispute (Lead Velocity, inside the 48-h window)', [4, 5],
`WITH d AS (
  UPDATE public.replacements SET status = 'disputed', updated_at = now()
   WHERE id = $1::uuid AND status = 'due' AND dispute_window_ends_at > $2::timestamptz
  RETURNING id, lead_id, broker_id, brand_id)
INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, broker_id, raised_at, note)
SELECT d.brand_id, 'replacement_dispute', 'normal', 'replacements', d.id::text, d.lead_id, d.broker_id, now(), 'esc_kind=replacement_disputed; Lead Velocity disputes inside the 48-h window (Schedule C)'
  FROM d
RETURNING id;`,
    '={{ [$json.replacement_id, $json.now_iso] }}');
  link(sw, disp, 3);
  const decide = pg('Decide dispute (upheld -> rejected, else approved) + emit', [4, 6],
`WITH d AS (
  UPDATE public.replacements
     SET status = CASE WHEN $2::boolean THEN 'rejected' ELSE 'approved' END,
         note = CASE WHEN $2::boolean THEN 'dispute_upheld' ELSE note END,
         decided_at = now(), updated_at = now()
   WHERE id = $1::uuid AND status = 'disputed'
  RETURNING id, lead_id, cycle_id, broker_id, brand_id, status)
INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT d.lead_id, d.brand_id, d.broker_id, d.cycle_id, 'W13', 'admin', 'replacement_' || d.status, jsonb_build_object('replacement_id', d.id::text, 'for', 'W19 shortfall / W14 lines'), now(), 'w13:' || d.status || ':' || d.id::text
  FROM d
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.replacement_id, $json.upheld] }}');
  link(sw, decide, 4);

  // ---- tick: settle closed windows (emit replacement_approved for W19) + 48-h no-show clocks
  const settle = pg('Settle: window closed -> approved (emit for W19)', [4, 7],
`WITH s AS (
  UPDATE public.replacements r SET status = 'approved', decided_at = now(), updated_at = now()
   WHERE r.status = 'due' AND r.dispute_window_ends_at <= $1::timestamptz
     AND (NOT $2::boolean OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = r.lead_id AND l.is_synthetic))
  RETURNING r.id, r.lead_id, r.cycle_id, r.broker_id, r.brand_id)
INSERT INTO public.lead_activities (${ACTIVITY_COLS})
SELECT s.lead_id, s.brand_id, s.broker_id, s.cycle_id, 'W13', 'system', 'replacement_approved', jsonb_build_object('replacement_id', s.id::text, 'for', 'W19 shortfall / W14 lines'), now(), 'w13:approved:' || s.id::text
  FROM s
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.now_iso, $json.synthetic_only] }}');
  const clocks = pg('No-show clocks past 48 h (undecided)', [4, 8],
`SELECT k.lead_id, k.brand_id, k.broker_id, k.cycle_id, k.payload->>'booking_id' AS booking_id, k.payload->>'outcome_id' AS outcome_id,
       k.payload->>'confirmed_at' AS confirmed_at, true AS confirmed_at_row,
       (SELECT min(a.created_at) FROM public.appointments a WHERE a.client_id = k.lead_id AND a.previous_booking_id = (k.payload->>'booking_id')::uuid) AS rebooked_at,
       (SELECT min(x.occurred_at) FROM public.lead_activities x WHERE x.lead_id = k.lead_id AND x.activity_type = 'rebooked_after_no_show' AND x.occurred_at >= (k.payload->>'confirmed_at')::timestamptz) AS rebooked_activity_at,
       (SELECT min(c.created_at) FROM public.communications c WHERE c.lead_id = k.lead_id AND c.direction = 'inbound' AND c.created_at > (k.payload->>'confirmed_at')::timestamptz) AS replied_at
  FROM public.lead_activities k
  JOIN public.leads l ON l.id = k.lead_id
 WHERE k.activity_type = 'no_show_clock'
   AND (k.payload->>'confirmed_at')::timestamptz + interval '48 hours' <= $1::timestamptz
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities d WHERE d.idempotency_key = 'w13:no_show_decided:' || (k.payload->>'booking_id'))
   AND (NOT $2::boolean OR l.is_synthetic)
 LIMIT 200;`,
    '={{ [$json.now_iso, $json.synthetic_only] }}');
  link(sw, settle, 5); link(sw, clocks, 5);
  link(clocks, secondTrig);

  link(sw, rejectNode('W13', [4, 9], '$json'), 6);

  const live = sendChain('W13', 13, 3);
  link(mySend, live);

  return finish('smc-w13', 'W13 No-show & replacement (DRAFT pending GATE-TEST-W13)',
    'automation-engineer. W13 no-show & replacement (0.1, 4.6 item 11, 4.12a, Schedule C/D); the ONE replacement counter (W10/W12/W29 call it); logic automation/lib/w13.mjs; tests automation/tests/W13.test.mjs (GATE-TEST-W13). Generated by automation/build-w09-w12-w13.mjs.',
    ['replacements', 'whatsapp', 'draft']);
}

for (const [file, wf] of [['W09.json', buildW09()], ['W12.json', buildW12()], ['W13.json', buildW13()]]) {
  writeFileSync(join(HERE, file), JSON.stringify(wf, null, 2) + '\n');
  console.log(`${file}: ${wf.nodes.length} nodes`);
}
