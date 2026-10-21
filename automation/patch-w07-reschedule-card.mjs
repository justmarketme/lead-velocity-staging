// automation/patch-w07-reschedule-card.mjs - the reschedule card (Jono, 19 Oct 2026).
// A reschedule request headed for W10 (a Reschedule tap reschedule:<booking_id> from booking_confirmed / a reminder,
// or Lindi's reschedule intent delegated to W10) gets ONE card from W07 instead of W10's slot list, when the brand's
// start_page switch is on: header-reschedule banner, the current booking, "Pick a new time" ->
// sortmycover.co.za/start/#move=1&lt=<lt1 token> (W39 move flow), and "Keep my time" (keep_it:<booking_id>, W10's
// existing no-change path) on the approved template. lib/wa-provider.mjs rescheduleCardPlan decides; without the brand
// switch, a lead token (LEAD_TOKEN_SECRET) or the Content SID (Twilio), or for any other W10 action, the item goes to
// W10 exactly as today. The card goes through smc-whatsapp-send (DRY_RUN_SENDS, suppression, provider switch) with
// record:true (the sub writes the communications row, so the never-silent guard sees it) and the correlation
// W07:reschedule_card:<wamid> (a retried inbound is a duplicate, not a second card).
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run after the other W07 patches: node automation/patch-w07-reschedule-card.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

const W10 = '-> W10';
const FLAG = 'Reschedule card: brand flag (W07)';
const PLAN = 'Reschedule card plan (W07)';
const IF = 'Reschedule card? (W07)';
const IN = 'SUB input (Send reschedule card (W07))';
const SEND = 'Send reschedule card (W07)';
const BACK = 'Not a card: on to W10 (W07)';

let changed = false;
if (!has(FLAG)) {
  const [x, y] = node(W10).position || [0, 0];
  const PG = node('Load context (lead, broker, live booking, window)').credentials;
  wf.nodes.push(
    { id: 'w07-resched-flag', name: FLAG, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [x - 480, y], credentials: PG, parameters: { operation: 'executeQuery',
      query: "-- brands.start_page (migration 20261018120000, default 'off'), read through to_jsonb so the query never depends on the column.\n" +
        "-- Always one row: the W10-bound item rides along as $2 and comes back as item.\n" +
        "SELECT $2::jsonb AS item,\n       coalesce((SELECT to_jsonb(br)->>'start_page' FROM public.brands br WHERE br.id = nullif($1, '')::uuid), 'off') = 'on' AS start_page;",
      options: { queryReplacement: "={{ [ $json.brand_id || '', JSON.stringify($json) ] }}" } } },
    { id: 'w07-resched-plan', name: PLAN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 360, y], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// lib/wa-provider.mjs rescheduleCardPlan (patch-w07-reschedule-card.mjs). No card -> the item goes to W10 unchanged.',
      "const A = require('lv-automation'); const P = A.waProvider;",
      "const item = typeof $json.item === 'string' ? JSON.parse($json.item) : ($json.item || {});",
      "const sp = $json.start_page === true || $json.start_page === 't';",
      'let token = null;',
      'if (sp && P.isRescheduleRequest(item) && item.lead && item.lead.id) { try { token = A.leadToken.mintLeadToken(item.lead.id, { secret: $env.LEAD_TOKEN_SECRET }).token; } catch (e) { token = null; } }',
      'const plan = P.rescheduleCardPlan(item, { start_page: sp, token, env: { WHATSAPP_PROVIDER: $env.WHATSAPP_PROVIDER, TWILIO_CONTENT_SIDS: $env.TWILIO_CONTENT_SIDS } });',
      'return { json: { ...item, reschedule_card: plan.send ? { via: plan.via, wa: plan.send } : null, reschedule_card_skip: plan.skip || null } };'].join('\n') } },
    { id: 'w07-resched-if', name: IF, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x - 240, y], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: 'c1', leftValue: '={{ !!$json.reschedule_card }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { id: 'w07-resched-in', name: IN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 120, y - 160], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// The card through smc-whatsapp-send; record:true = the sub writes the communications row (never-silent sees it).',
      'const c = $json.reschedule_card;',
      "return { json: { kind: 'prebuilt', wa: c.wa, to: c.wa && c.wa.to, record: true, caller: 'W07', bypass_suppression: false, phone_number_id: null,",
      '  lead_id: ($json.lead && $json.lead.id) || null, broker_id: null,',
      "  correlation: 'W07:reschedule_card:' + (($json.msg && ($json.msg.wamid || $json.msg.id)) || (($json.booking && $json.booking.id) || 'x') + ':' + Date.now()) } };"].join('\n') } },
    { id: 'w07-resched-send', name: SEND, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: [x, y - 160],
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } },
    { id: 'w07-resched-back', name: BACK, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 120, y + 120], parameters: { mode: 'runOnceForEachItem', jsCode:
      '// unchanged W10 input (the plan fields removed)\nconst j = { ...$json }; delete j.reschedule_card; delete j.reschedule_card_skip; return { json: j };' } },
  );
  // every connection into -> W10 (Route W10 output, Delegate to W10 output) now enters the card check first
  for (const [src, c] of Object.entries(wf.connections)) {
    if (src === BACK) continue;
    for (const arr of Object.values(c)) for (const outs of arr || []) for (const t of outs || []) if (t.node === W10) t.node = FLAG;
  }
  wf.connections[FLAG] = { main: [[{ node: PLAN, type: 'main', index: 0 }]] };
  wf.connections[PLAN] = { main: [[{ node: IF, type: 'main', index: 0 }]] };
  wf.connections[IF] = { main: [[{ node: IN, type: 'main', index: 0 }], [{ node: BACK, type: 'main', index: 0 }]] };
  wf.connections[IN] = { main: [[{ node: SEND, type: 'main', index: 0 }]] };
  wf.connections[BACK] = { main: [[{ node: W10, type: 'main', index: 0 }]] };
  changed = true;
}

// Review 21 Oct 2026 (smoke #12 follow-up): the cancel card's "I need a different time" row is reschedule:<booking>, answered
// HERE with the card (W10 never runs), so W10 cannot end the cancel card's typed-reason wait. The client chose a new time: end
// it beside the send, so a later typed reply is never read as a cancel reason.
const ENDWAIT = 'End typed-reason wait (reschedule card, W07)';
if (!has(ENDWAIT)) {
  const [x, y] = node(IN).position || [0, 0];
  wf.nodes.push({ id: 'w07-resched-endwait', name: ENDWAIT, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [x, y - 160], credentials: node(FLAG).credentials,
    alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { operation: 'executeQuery',
      query: "-- The client picked \"a different time\" (reschedule card): the cancel card's typed-reason wait ends here.\n" +
        "UPDATE public.leads l SET conv_state = l.conv_state - 'cancel_reason_pending', updated_at = now()\n WHERE l.id = $1::uuid AND l.conv_state ? 'cancel_reason_pending'\nRETURNING l.id;",
      options: { queryReplacement: "={{ [ ($json.lead && $json.lead.id) || '00000000-0000-0000-0000-000000000000' ] }}" } } });
  wf.connections[IF].main[0].push({ node: ENDWAIT, type: 'main', index: 0 });
  changed = true;
}

if (changed) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-reschedule-card:', changed ? 'changed' : 'already');
