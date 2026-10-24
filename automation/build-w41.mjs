#!/usr/bin/env node
// Generates automation/W41.json: "W41 SMC broker lead notice (routed, not booked)" (24 Oct 2026, Jonathan: a client who
// consented and was routed to an adviser but stopped before confirming a time must reach the adviser at once, with the
// client's details in the portal, how far they got, that we are nudging them, and everything that follows).
//   node automation/build-w41.mjs
// Logic: automation/lib/w41.mjs (tests: automation/tests/W41.test.mjs). Contract: CONTRACTS.md "W41 SMC broker lead notice".
// Every hour (Jonathan, 24 Oct 2026: "it can check every hour"; runs on the VPS n8n, so nothing depends on a laptop):
// routed, unbooked SortMyCover leads past the grace -> claim one timeline row per lead (ON CONFLICT DO NOTHING RETURNING)
// -> claimed only: WhatsApp broker_lead_routed via smc-whatsapp-send + email via smc-email-send. The ad's own headline
// (the CTWA referral kept in the ctwa_consent timeline row) names the ad in both.
// Env: SMC_BROKER_LEAD_NOTICE_ENABLED ('true' = on), SMC_BROKER_LEAD_NOTICE_GRACE_MIN (default 10), PORTAL_BASE,
// LINDI_RELAY_TOKEN + SUPABASE_FUNCTIONS_URL (smc-email-send), DRY_RUN_SENDS (gate inserted by gateSenders; the WhatsApp
// sub gates itself). Credential by name only (id ''), bound at import. Inactive in the file.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ACTIVITY } from './lib/w41.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { gateSenders } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `w41n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const code = (name, pos, jsCode) => node(name, 'code', 2, pos, { mode: 'runOnceForAllItems', jsCode });
const ifTrue = (name, pos, expr) => node(name, 'if', 2, pos, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const c = {};
const link = (from, to, out = 0) => { const x = (c[from] ||= { main: [] }); while (x.main.length <= out) x.main.push([]); x.main[out].push({ node: to, type: 'main', index: 0 }); };

const TRIGGER = 'Every hour';
const START = 'Start tick (w41.start: gate + parameters)';
const READ = 'Read routed, unbooked SMC leads (past the grace)';
const PLAN = 'Plan notices (w41.plan)';
const CLAIM = 'Claim: one timeline row per lead (RETURNING)';
const CLAIMED = 'Claimed this tick (w41.claimed) -> send items';
const IS_WA = 'WhatsApp item?';
const WA = '-> WhatsApp Send (broker_lead_routed)';
const EMAIL = 'Email adviser from SortMyCover (smc-email-send)';
const SWEEP = 'Route at consent? (w41.sweepStart)';
const SWEEP_READ = 'Read consented, unrouted CTWA leads (WhatsApp window open)';
const SWEEP_PLAN = 'W01 inputs (w41.routeInputs)';
const SWEEP_ROUTE = '-> W01 Lead core (name the adviser, then route; one lead per call)';

// Data minimisation at the source: the adviser's own number and email (to reach him), the client's first name, last
// initial, origin and timestamps. Never the client's number or email, ID numbers or message text.
const QUERY = `-- W41 SMC broker lead notice: SortMyCover leads routed to an adviser at least $2 minutes ago (inside 7 days), not test data,
-- not opted out, not disqualified, with no live booking and no notice yet. Only what the message needs leaves the database.
SELECT l.id AS lead_id, l.brand_id, l.broker_id, l.routed_at, l.created_at, l.consent_at, l.origin, l.is_synthetic,
       split_part(btrim(coalesce(l.first_name, '')), ' ', 1) AS first_name,
       left(btrim(coalesce(nullif(btrim(coalesce(l.last_name, '')), ''), split_part(btrim(coalesce(l.first_name, '')), ' ', 2))), 1) AS last_initial,
       split_part(btrim(coalesce(b.adviser_name, b.contact_person, '')), ' ', 1) AS adviser_first,
       coalesce(b.adviser_whatsapp, b.whatsapp_number) AS broker_whatsapp,
       b.email AS broker_email,
       EXISTS (SELECT 1 FROM public.lead_activities p
                WHERE p.lead_id = l.id AND p.activity_type LIKE 'start_page_%' AND p.activity_type <> 'start_page_pending') AS opened_page,
       (SELECT count(*) FROM public.lead_activities nn WHERE nn.lead_id = l.id AND nn.activity_type = 'nurture_sent') AS nudges,
       (SELECT c.payload->'provenance'->'referral'->>'headline' FROM public.lead_activities c
         WHERE c.lead_id = l.id AND c.activity_type IN ('ctwa_consent', 'consent') ORDER BY c.occurred_at LIMIT 1) AS ad_headline
  FROM public.leads l
  JOIN public.brokers b ON b.id = l.broker_id
 WHERE l.brand_id = $1::uuid
   AND l.routed_at IS NOT NULL
   AND l.routed_at <= now() - make_interval(mins => $2::int)
   AND l.routed_at > now() - interval '7 days'
   AND l.opted_out_at IS NULL
   AND l.disqualified_reason IS NULL
   AND coalesce(l.is_synthetic, false) = false
   AND NOT EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.client_id = l.id AND a.status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show'))
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities d WHERE d.idempotency_key = 'w41:broker_routed:' || l.id::text)
 ORDER BY l.routed_at
 LIMIT $3::int;`;

// Route at consent (24 Oct 2026): consented click-to-WhatsApp leads still unrouted inside the WhatsApp window. Test data never
// (a synthetic lead must not reach a real adviser through a sweep); held leads only when the hold was about the disclosure.
const SWEEP_QUERY = `-- W41 route at consent: SortMyCover click-to-WhatsApp leads that consented within $2 hours and have no adviser yet.
SELECT l.id AS lead_id
  FROM public.leads l
 WHERE l.brand_id = $1::uuid
   AND l.origin = 'ctwa'
   AND l.broker_id IS NULL
   AND l.verified_at > now() - make_interval(hours => $2::int)
   AND l.opted_out_at IS NULL
   AND l.disqualified_reason IS NULL
   AND coalesce(l.is_synthetic, false) = false
   AND (l.routing_reason IS NULL OR l.routing_reason IN ('held_disclosure_pending', 'start_page_pending'))
 ORDER BY l.verified_at
 LIMIT $3::int;`;

// The claim: one row per lead, the idempotency key is the lock. Only the rows inserted now come back.
const CLAIM_SQL = `INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT r.lead_id, r.brand_id, r.broker_id, 'W41', 'system', '${ACTIVITY}', r.payload, now(), r.key
  FROM jsonb_to_recordset($1::jsonb) AS r(lead_id uuid, brand_id uuid, broker_id uuid, key text, payload jsonb)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id;`;

const n = [];
n.push(node('Sticky: read me', 'stickyNote', 1, [0, -400], { width: 820, height: 350, content:
  '## W41 SMC broker lead notice (routed, not booked), 24 Oct 2026\n' +
  'Every hour (runs on the VPS n8n, nothing depends on a laptop): SortMyCover leads routed to an adviser at least SMC_BROKER_LEAD_NOTICE_GRACE_MIN (10) minutes ago, inside 7 days, not test data, not opted out, not disqualified, with no live booking and no notice yet.\n' +
  '- The ad: the CTWA referral headline kept in the ctwa_consent timeline row ("Book a 30-minute call with Mark") names the ad in the WhatsApp and the email; the portal shows the same.\n' +
  '- Claim first: ONE lead_activities row per lead (broker_notified_routed, key w41:broker_routed:<lead>, ON CONFLICT DO NOTHING RETURNING). Only the rows inserted this tick are sent; a lead is told about once.\n' +
  '- Sends: WhatsApp template broker_lead_routed through smc-whatsapp-send (honours DRY_RUN_SENDS; skips while the template has no Content SID; W22 on failure) + a plain-text email from SortMyCover through smc-email-send.\n' +
  '- The grace keeps a client who books straight away to ONE adviser message (W05 broker_new_booking). A later booking still sends broker_new_booking as before.\n' +
  '- POPIA: the adviser\'s own number and email, the client\'s first name + last initial, origin and times. Never the client\'s number or email, ID numbers or message text.\n' +
  '- Route at consent (second branch, every hour): click-to-WhatsApp leads that consented in the last 23 h and have no adviser yet -> W01 Lead core, one lead per call (names the adviser first with the CHAT-DISCLOSE text, then routes). SMC_ROUTE_AT_CONSENT=false turns it off.\n' +
  'Env: SMC_BROKER_LEAD_NOTICE_ENABLED=true (anything else: nothing runs), SMC_BROKER_LEAD_NOTICE_GRACE_MIN, PORTAL_BASE, LINDI_RELAY_TOKEN, SUPABASE_FUNCTIONS_URL, DRY_RUN_SENDS.\n' +
  'Logic: automation/lib/w41.mjs. Generated by automation/build-w41.mjs; do not hand-edit.' }));
n.push(node(TRIGGER, 'scheduleTrigger', 1.2, [0, 0], { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }));
n.push(code(START, [220, 0],
`const L = require('lv-automation').w41;
const t = L.start({ SMC_BROKER_LEAD_NOTICE_ENABLED: $env.SMC_BROKER_LEAD_NOTICE_ENABLED, SMC_BROKER_LEAD_NOTICE_GRACE_MIN: $env.SMC_BROKER_LEAD_NOTICE_GRACE_MIN });
if (!t.run) return [];
return [{ json: { brand_id: t.brand_id, grace_min: t.grace_min, limit: t.limit } }];`));
n.push(node(READ, 'postgres', 2.5, [440, 0], { operation: 'executeQuery', query: QUERY, options: { queryReplacement: '={{ [ $json.brand_id, $json.grace_min, $json.limit ] }}' } }, { credentials: PG, alwaysOutputData: false }));
n.push(code(PLAN, [660, 0],
`const L = require('lv-automation').w41;
const rows = $input.all().map((i) => i.json).filter((r) => r && r.lead_id);
const plans = L.plan(rows, { PORTAL_BASE: $env.PORTAL_BASE });
if (!plans.length) return [];
// one item carrying every plan: the claim is one statement, the join after it reads this item back
return [{ json: { plans, claim_rows: L.claimRows(plans) } }];`));
n.push(node(CLAIM, 'postgres', 2.5, [880, 0], { operation: 'executeQuery', query: CLAIM_SQL, options: { queryReplacement: '={{ [ JSON.stringify($json.claim_rows) ] }}' } }, { credentials: PG, alwaysOutputData: true }));
n.push(code(CLAIMED, [1100, 0],
`const L = require('lv-automation').w41;
const plans = $('${PLAN}').first().json.plans || [];
const returned = $input.all().map((i) => i.json).filter((r) => r && r.lead_id);
const mine = L.claimed(plans, returned);
return mine.flatMap((p) => L.fanOut(p)).map((j) => ({ json: j }));`));
n.push(ifTrue(IS_WA, [1320, 0], "$json.kind === 'prebuilt'"));
n.push(node(WA, 'executeWorkflow', 1.1, [1540, -120], { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: false } }));
n.push(node(EMAIL, 'httpRequest', 4.2, [1540, 120], {
  method: 'POST', url: "={{ ($env.SUPABASE_FUNCTIONS_URL || 'https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1') + '/smc-email-send' }}",
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.LINDI_RELAY_TOKEN }}' }, { name: 'Idempotency-Key', value: "={{ $json.relay.idempotency_key || '' }}" }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.relay.body) }}',
  options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } }, { onError: 'continueRegularOutput' }));

n.push(code(SWEEP, [220, 300],
`const L = require('lv-automation').w41;
const t = L.sweepStart({ SMC_ROUTE_AT_CONSENT: $env.SMC_ROUTE_AT_CONSENT });
if (!t.run) return [];
return [{ json: { brand_id: t.brand_id, window_h: t.window_h, limit: t.limit } }];`));
n.push(node(SWEEP_READ, 'postgres', 2.5, [440, 300], { operation: 'executeQuery', query: SWEEP_QUERY, options: { queryReplacement: '={{ [ $json.brand_id, $json.window_h, $json.limit ] }}' } }, { credentials: PG, alwaysOutputData: false }));
n.push(code(SWEEP_PLAN, [660, 300],
`const L = require('lv-automation').w41;
return L.routeInputs($input.all().map((i) => i.json)).map((j) => ({ json: j }));`));
n.push(node(SWEEP_ROUTE, 'executeWorkflow', 1.1, [880, 300], { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w01', cachedResultName: 'W01 Lead core' }, mode: 'each', options: { waitForSubWorkflow: true } }, { onError: 'continueRegularOutput' }));

link(TRIGGER, START);
link(TRIGGER, SWEEP);
link(SWEEP, SWEEP_READ);
link(SWEEP_READ, SWEEP_PLAN);
link(SWEEP_PLAN, SWEEP_ROUTE);
link(START, READ);
link(READ, PLAN);
link(PLAN, CLAIM);
link(CLAIM, CLAIMED);
link(CLAIMED, IS_WA);
link(IS_WA, WA, 0);
link(IS_WA, EMAIL, 1);

// gateSenders inserts "Live send? (Email adviser ...)" (DRY_RUN_SENDS) before the email POST and a dry-run stub.
// The WhatsApp sub (smc-whatsapp-send) honours DRY_RUN_SENDS itself.
const wf = gateSenders({ id: 'smc-w41', name: 'W41 SMC broker lead notice (routed, not booked)', nodes: n, connections: c, active: false,
  settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', saveManualExecutions: true,
    saveExecutionProgress: false, errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner' },
  pinData: {}, tags: [{ name: 'SortMyCover' }, { name: 'broker' }], meta: { notes: 'Generated by automation/build-w41.mjs; logic automation/lib/w41.mjs; do not hand-edit.' } });
writeFileSync(join(HERE, 'W41.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote automation/W41.json', wf.nodes.length, 'nodes');
