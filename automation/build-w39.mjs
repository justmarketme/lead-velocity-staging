#!/usr/bin/env node
// Generates automation/W39.json (Start page API: GET /start + POST /start/answers) for the hidden sortmycover.co.za/start/ page
// (Jono, 18 Oct 2026). Code nodes load the tested pure logic with require('lv-automation').w39 (I-46c); routing is W01 Lead
// core's (Execute Workflow by stable id smc-w01, the same path as W03's route_and_first_touch, with first_touch: false);
// WhatsApp goes through smc-whatsapp-send (it applies suppression, the 24-h window and DRY_RUN_SENDS itself).
// Stable top-level id smc-w39 (I-44b), credentials by name only (id ''), secrets via $env, workflow inactive, errorWorkflow
// smc-w22. Run: node automation/build-w39.mjs   (GEN_OUT_DIR=<dir> writes elsewhere: tests/generators.test.mjs)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// I-54f: every sender ends up behind a DRY_RUN_SENDS gate (W39 has none of its own: its only sender is smc-whatsapp-send).
const { gateSenders } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const { routeWaSends } = createRequire(import.meta.url)('./lib/wa-route.cjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: false, saveDataSuccessExecution: 'none', errorWorkflow: 'smc-w22' }; // tokens pass through items: successful runs are not saved
const PRE = (lib) => `const L = require('lv-automation').${lib.replace(/\.mjs$/, '')};\n`;
const ORIGINS = "={{ $env.PUBLIC_ALLOWED_ORIGINS || 'https://leadvelocity.co.za,https://www.leadvelocity.co.za' }}"; // as W04 GET /slots

let seq = 0; let X = 0;
const pos = () => [((X++) % 8) * 240, Math.floor((X - 1) / 8) * 200];
const node = (name, type, tv, parameters, extra = {}) => ({ id: `n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion: tv, position: pos(), parameters, ...extra });
const code = (name, lib, body) => node(name, 'code', 2, { mode: 'runOnceForAllItems', jsCode: PRE(lib) + body });
const pg = (name, query, repl, extra = {}) => node(name, 'postgres', 2.5, { operation: 'executeQuery', query, options: repl ? { queryReplacement: repl } : {} }, { credentials: PG, alwaysOutputData: true, ...extra });
// Callee name -> stable workflow id (I-44b). "W01 Lead core" -> smc-w01; "WhatsApp Send" (no W number) -> smc-whatsapp-send.
const workflowIdOf = (target) => { const m = /^W(\d\d)\b/.exec(target); return m ? `smc-w${m[1]}` : `smc-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; };
const sub = (name, target, wait = false, extra = {}) => node(name, 'executeWorkflow', 1.1, { source: 'database', workflowId: { __rl: true, mode: 'id', value: workflowIdOf(target), cachedResultName: target }, options: { waitForSubWorkflow: wait } }, extra);
const ifTrue = (name, expr) => node(name, 'if', 2, { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const sw = (name, expr, keys) => node(name, 'switch', 3, { rules: { values: keys.map((k) => ({ conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: expr, rightValue: k, operator: { type: 'string', operation: 'equals' } }] }, renameOutput: true, outputKey: k })) }, options: { fallbackOutput: 'none' } });
const respond = (name) => node(name, 'respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.body) }}', options: { responseCode: '={{ $json.status }}', responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } } });
const link = (c, from, to, out = 0) => { c[from] ??= { main: [] }; while (c[from].main.length <= out) c[from].main.push([]); c[from].main[out].push({ node: to, type: 'main', index: 0 }); };
const chain = (c, ...names) => { for (let i = 0; i + 1 < names.length; i++) link(c, names[i], names[i + 1]); };

// The lead, by the token's lead id only (the browser never sends a broker id). erased = W34 took the number away.
const LEAD_COLS = `l.id, l.brand_id, l.broker_id, l.first_name, l.phone, l.opted_out_at, (l.phone IS NULL) AS erased, l.stage, l.conv_state,
         l.age_band, l.budget_band, l.product_interest, l.disqualified_reason`;

function buildW39() {
  seq = 0; X = 0; const c = {}; const n = [];
  n.push(node('Sticky: read me', 'stickyNote', 1, { width: 760, height: 380, content: 'W39 Start page API (automation-engineer, 18 Oct 2026). The hidden page sortmycover.co.za/start/#lt=<lt1 token> (W03 sends the link as ONE call-to-action when brands.start_page = on) replaces the WhatsApp qualifying taps. Caddy rewrites https://n8n.sortmycover.co.za/webhook/smc/<path> to /webhook/<path>. Header X-Lead-Token, lead path only (a broker JWT is 401), lead row check as W04 (unknown / opted out / erased -> 401 try_again). GET /start -> first name, adviser (practice + FSP from his row), methods (teams / phone only), answers so far, live booking (held = waiting on the email link). POST /start/answers -> bands + conv_state.start, help_with, one timeline row per request_id (idempotent), W03 stall cancelled; will -> a person (escalation) + Lindi says so; other -> Lindi asks for a sentence; age out of band -> OUT_OF_BAND_AGE_BOOKS (lib/w39.mjs); else W01 Lead core routes WITHOUT the W06 first touch (the page shows the slots) -> next slots | chat. Slots and booking stay W04 GET /slots and W05 POST /book. Logic automation/lib/w39.mjs, tests automation/tests/W39.test.mjs. CORS PUBLIC_ALLOWED_ORIGINS. Env LEAD_TOKEN_SECRET (+ _PREVIOUS).' }));

  // ---- GET /start
  n.push(node('GET /start', 'webhook', 2, { httpMethod: 'GET', path: 'start', responseMode: 'responseNode', options: { allowedOrigins: ORIGINS } }, { webhookId: 'w39-start-get' }));
  n.push(code('Resolve caller (start)', 'w39.mjs', `const j = $input.first().json;\nconst c = L.resolveCaller(j.headers || {}, $env, Date.now());\nreturn [{ json: c.ok ? { ok: true, lead_id: c.lead_id } : { ok: false, status: c.status, body: c.body, reason: c.reason } }];`));
  n.push(ifTrue('Caller ok? (start)', '$json.ok === true'));
  n.push(pg('Load lead, adviser, live booking', `-- The broker comes from leads.broker_id (CONTRACTS.md lead_token); the live booking is the lead's own (held or booked).
SELECT (SELECT to_jsonb(x) FROM (SELECT ${LEAD_COLS} FROM public.leads l WHERE l.id::text = $1 AND l.brand_id IS NOT NULL) x) AS lead,
       (SELECT to_jsonb(k) FROM (SELECT b.id, b.adviser_name, b.contact_person, b.firm_name, b.practice_name, b.fsp_number, b.methods_supported
                                   FROM public.leads l JOIN public.brokers b ON b.id = l.broker_id
                                  WHERE l.id::text = $1 AND l.brand_id IS NOT NULL AND b.brand_id IS NOT NULL) k) AS broker,
       (SELECT to_jsonb(a) FROM (SELECT a.id, a.appointment_date, a.ends_at, a.method, a.status FROM public.appointments a
                                  WHERE a.client_id::text = $1 AND a.brand_id IS NOT NULL AND a.status IN ('pending_verification','booked','confirmed') AND a.ends_at > now()
                                  ORDER BY a.appointment_date LIMIT 1) a) AS booking;`, '={{ [$json.lead_id] }}'));
  n.push(code('View (w39.startView)', 'w39.mjs', `const r = $input.first().json;\nconst g = L.leadGate(r.lead);\nif (!g.ok) return [{ json: { status: g.status, body: g.body, reason: g.reason } }];\nreturn [{ json: L.startView({ lead: r.lead, broker: r.broker, booking: r.booking }) }];`));
  n.push(respond('Respond (start)'));
  chain(c, 'GET /start', 'Resolve caller (start)', 'Caller ok? (start)');
  link(c, 'Caller ok? (start)', 'Load lead, adviser, live booking', 0); link(c, 'Caller ok? (start)', 'Respond (start)', 1);
  chain(c, 'Load lead, adviser, live booking', 'View (w39.startView)', 'Respond (start)');

  // ---- POST /start/answers
  n.push(node('POST /start/answers', 'webhook', 2, { httpMethod: 'POST', path: 'start/answers', responseMode: 'responseNode', options: { allowedOrigins: ORIGINS } }, { webhookId: 'w39-start-answers-post' }));
  n.push(code('Resolve caller + parse (answers)', 'w39.mjs', `const j = $input.first().json;\nconst c = L.resolveCaller(j.headers || {}, $env, Date.now());\nif (!c.ok) return [{ json: { ok: false, status: c.status, body: c.body, reason: c.reason } }];\nconst p = L.parseAnswers(j.body);\nif (!p.ok) return [{ json: { ok: false, status: p.status, body: p.body, reason: p.reason } }];\nreturn [{ json: { ok: true, lead_id: c.lead_id, answers: p.answers, request_id: p.request_id, key: L.answersKey(c.lead_id, p.request_id) } }];`));
  n.push(ifTrue('Caller + body ok? (answers)', '$json.ok === true'));
  n.push(pg('Load lead + earlier answer (same request_id)', `SELECT (SELECT to_jsonb(x) FROM (SELECT ${LEAD_COLS} FROM public.leads l WHERE l.id::text = $1 AND l.brand_id IS NOT NULL) x) AS lead,
       (SELECT a.payload FROM public.lead_activities a WHERE a.idempotency_key = $2 LIMIT 1) AS prior;`, '={{ [$json.lead_id, $json.key] }}'));
  n.push(code('Decide (w39.decideAnswers)', 'w39.mjs', `const r = $input.first().json;\nconst q = $('Resolve caller + parse (answers)').first().json;\nconst plan = L.decideAnswers({ lead: r.lead, answers: q.answers, request_id: q.request_id, prior: r.prior || null, now: Date.now(), oobAgeBooks: L.OUT_OF_BAND_AGE_BOOKS });\nreturn [{ json: { lead_id: q.lead_id, plan } }];`));
  n.push(sw('Plan?', '={{ $json.plan.kind }}', ['work', 'replay', 'reject']));
  n.push(code('Reject (401)', 'w39.mjs', `const p = $json.plan;\nreturn [{ json: { status: p.status || 401, body: p.body || { error: 'try_again' }, reason: p.reason || null } }];`));
  // One statement: claim the request_id (lead_activities idempotency key), then write the lead only if the claim is ours,
  // cancel W03's pending stall (wa_threads), and add the timeline notes. A repeat of the same request_id changes nothing.
  // Columns as W03 "Update lead (answers / out-of-band)": leads.qualified is GENERATED (never written); a stage only moves
  // forward from the pre-booking stages; conv_state is MERGED (start, help_with, state, age_accepted).
  n.push(pg('Save answers + timeline + cancel stall (one statement)', `WITH claim AS (
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  SELECT l.id, l.brand_id, l.broker_id, 'W39', 'lead', $3::jsonb->>'activity_type', $3::jsonb->'payload', now(), $3::jsonb->>'idempotency_key'
    FROM public.leads l WHERE l.id = $1::uuid
  ON CONFLICT DO NOTHING
  RETURNING lead_id),
u AS (
  UPDATE public.leads l
     SET age_band               = coalesce($2::jsonb->>'age_band', l.age_band),
         budget_band            = coalesce($2::jsonb->>'budget_band', l.budget_band),
         product_interest       = coalesce($2::jsonb->>'product_interest', l.product_interest),
         reasons                = CASE WHEN jsonb_typeof($2::jsonb->'reasons') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text($2::jsonb->'reasons')) ELSE l.reasons END,
         qualified_at           = coalesce(($2::jsonb->>'qualified_at')::timestamptz, l.qualified_at),
         disqualified_reason    = coalesce($2::jsonb->>'disqualified_reason', l.disqualified_reason),
         broker_id              = CASE WHEN $2::jsonb ? 'disqualified_reason' THEN NULL ELSE l.broker_id END,
         retention_delete_after = CASE WHEN $2::jsonb ? 'qualified_at' THEN NULL ELSE coalesce(($2::jsonb->>'retention_delete_after')::timestamptz, l.retention_delete_after) END,
         stage                  = CASE WHEN $2::jsonb ? 'stage' AND ($2::jsonb->>'stage' IN ('disqualified', 'opted_out') OR coalesce(l.stage, 'new') IN ('new', 'disclosed', 'verified', 'qualified'))
                                       THEN $2::jsonb->>'stage' ELSE l.stage END,
         stage_entered_at       = CASE WHEN $2::jsonb ? 'stage' AND ($2::jsonb->>'stage' IN ('disqualified', 'opted_out') OR coalesce(l.stage, 'new') IN ('new', 'disclosed', 'verified', 'qualified'))
                                       THEN now() ELSE l.stage_entered_at END,
         conv_state             = coalesce(l.conv_state, '{}'::jsonb) || coalesce($2::jsonb->'conv_state', '{}'::jsonb) || jsonb_build_object('last_turn_at', now()),
         updated_at             = now()
   WHERE l.id = $1::uuid AND EXISTS (SELECT 1 FROM claim)
  RETURNING l.id, l.brand_id, l.broker_id, l.phone),
th AS (
  UPDATE public.wa_threads t
     SET state = coalesce(t.state, '{}'::jsonb) || jsonb_build_object('stage', $5::text), stage = $5::text, stall_due_at = NULL, updated_at = now()
    FROM u
   WHERE t.brand_id = u.brand_id AND u.phone IS NOT NULL AND t.mobile_hash = public.smc_hash_contact(u.phone)
  RETURNING t.mobile_hash),
notes AS (
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  SELECT u.id, u.brand_id, u.broker_id, 'W39', 'system', x->>'activity_type', x->'payload', now(), x->>'idempotency_key'
    FROM u, jsonb_array_elements($4::jsonb) x
  ON CONFLICT DO NOTHING
  RETURNING id)
SELECT (SELECT count(*) FROM claim)::int AS claimed, (SELECT count(*) FROM u)::int AS updated, (SELECT count(*) FROM th)::int AS threads, (SELECT count(*) FROM notes)::int AS notes;`,
  "={{ [$json.lead_id, JSON.stringify($json.plan.set || {}), JSON.stringify($json.plan.activity), JSON.stringify($json.plan.notes || []), $json.plan.thread_stage || 'done'] }}"));
  n.push(ifTrue('Claimed + route? (in band / age accepted)', "$json.claimed > 0 && $('Decide (w39.decideAnswers)').first().json.plan.route === true"));
  n.push(code('W01 Lead core input (no first touch)', 'w39.mjs', `return [{ json: L.routeInput($('Decide (w39.decideAnswers)').first().json.lead_id) }];`));
  // Waits, so the routing is written before the page is told 'slots'. W01 writes broker_id/routed_at (the database attaches
  // the lead to the broker's open order or holds it: tier C, no capacity) and sends a held tier-C lead its one notice.
  n.push(sub('W01 Lead core (route, no W06 first touch; waits)', 'W01 Lead core', true, { alwaysOutputData: true }));
  n.push(pg('Re-read broker_id', 'SELECT l.broker_id FROM public.leads l WHERE l.id::text = $1;', "={{ [$('Decide (w39.decideAnswers)').first().json.lead_id] }}"));
  n.push(code('Answer (w39.answer)', 'w39.mjs', `const d = $('Decide (w39.decideAnswers)').first().json;\nlet claimed = false;\ntry { claimed = Number($('Save answers + timeline + cancel stall (one statement)').first().json.claimed) > 0; } catch (e) { claimed = false; } // replay: Save did not run\nconst plan = d.plan.kind === 'replay' ? { kind: 'replay', path: d.plan.path } : d.plan;\nreturn [{ json: L.answer({ plan, broker_id: $input.first().json.broker_id || null, claimed }) }];`));
  n.push(respond('Respond (answers)'));
  n.push(code('Effects (claimed request only)', 'w39.mjs', `return $('Answer (w39.answer)').first().json.effects.map((e) => ({ json: e }));`));
  n.push(sw('Effect?', '={{ $json.kind }}', ['send', 'escalate']));
  n.push(code('WhatsApp input (Lindi line)', 'w39.mjs', `// decided shape (smc-whatsapp-send writes the communications row; correlation w39:<path>:<lead> = once per lead)\nreturn $input.all().map((i) => ({ json: i.json.message }));`));
  n.push(sub('WhatsApp Send (Lindi line)', 'WhatsApp Send'));
  // Same mechanism as W03's wills opener ("Escalate to a person (opener)"): a console escalation; once a day per lead at most.
  n.push(pg('Escalate to a person (wills)', `INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, raised_at, note)
SELECT l.brand_id, 'human_handoff', 'normal', 'leads', l.id::text, l.id, now(), left($2, 500)
  FROM public.leads l
 WHERE l.id::text = $1
   AND NOT EXISTS (SELECT 1 FROM public.escalations e WHERE e.lead_id = l.id AND e.kind = 'human_handoff' AND e.raised_at > now() - interval '1 day')
RETURNING id;`, "={{ [$('Decide (w39.decideAnswers)').first().json.lead_id, $json.note || ''] }}", { onError: 'continueRegularOutput' }));

  chain(c, 'POST /start/answers', 'Resolve caller + parse (answers)', 'Caller + body ok? (answers)');
  link(c, 'Caller + body ok? (answers)', 'Load lead + earlier answer (same request_id)', 0); link(c, 'Caller + body ok? (answers)', 'Respond (answers)', 1);
  chain(c, 'Load lead + earlier answer (same request_id)', 'Decide (w39.decideAnswers)', 'Plan?');
  link(c, 'Plan?', 'Save answers + timeline + cancel stall (one statement)', 0); link(c, 'Plan?', 'Re-read broker_id', 1); link(c, 'Plan?', 'Reject (401)', 2);
  chain(c, 'Reject (401)', 'Respond (answers)');
  chain(c, 'Save answers + timeline + cancel stall (one statement)', 'Claimed + route? (in band / age accepted)');
  link(c, 'Claimed + route? (in band / age accepted)', 'W01 Lead core input (no first touch)', 0); link(c, 'Claimed + route? (in band / age accepted)', 'Re-read broker_id', 1);
  chain(c, 'W01 Lead core input (no first touch)', 'W01 Lead core (route, no W06 first touch; waits)', 'Re-read broker_id', 'Answer (w39.answer)', 'Respond (answers)');
  link(c, 'Answer (w39.answer)', 'Effects (claimed request only)');
  chain(c, 'Effects (claimed request only)', 'Effect?');
  link(c, 'Effect?', 'WhatsApp input (Lindi line)', 0); link(c, 'Effect?', 'Escalate to a person (wills)', 1);
  chain(c, 'WhatsApp input (Lindi line)', 'WhatsApp Send (Lindi line)');

  return { id: 'smc-w39', name: 'W39 Start page API', nodes: n, connections: c, active: false, settings: SETTINGS, pinData: {},
    tags: [{ name: 'booking' }, { name: 'intake' }], meta: { notes: 'automation-engineer. W39 /start/ page API; logic automation/lib/w39.mjs; tests automation/tests/W39.test.mjs. Generated by automation/build-w39.mjs; do not hand-edit.' } };
}

const OUT_DIR = process.env.GEN_OUT_DIR || HERE;
writeFileSync(join(OUT_DIR, 'W39.json'), JSON.stringify(routeWaSends(gateSenders(buildW39()), { caller: 'W39', nodes: {} }), null, 2) + '\n');
console.log(`wrote ${OUT_DIR === HERE ? 'automation' : OUT_DIR}/W39.json`);
