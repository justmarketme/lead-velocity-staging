// automation/patch-w10-smoke-c3.mjs - W10 fixes from the 21 Oct 2026 smoke test (checklist SMOKE-TEST-SMC-2026-10-21.md).
//  #3  phone -> Teams: W10 no longer saves the method itself or tells the client first. "Method lead message" still builds the
//      ONE message; for a change it rides to W05 (update_method notify_wa) and W05 sends it only after the Outlook PATCH and the
//      save worked (lib/w05.mjs afterMethodPatch). W05 is waited for, so W39's re-read sees the real method.
//  #11 /start/ move: W39 waits only for the claim, the W04 re-check and the row moved in place. "Moved?" hands the rest (Graph
//      PATCH, W09 re-plan, timeline, lead + adviser notices, client email) to W10's own second execution (op move_effects, not
//      waited for; lib/w10.mjs moveEffectsRequest / moveEffectsItem). A retry with the same request_id is idempotent: W39's key
//      w39:move:<lead>:<request_id> is claimed once (Claim reschedule key), a second call replays and the row answers.
//  #12 the cancel card opens the typed-reason wait (conv_state.cancel_reason_pending, 30 min, this booking); a typed reply is
//      matched to the card's rows (lib/w10.mjs typedCancelReason, keep first); any other W10 op ends the wait.
//  #40 a move in place sets conv_state.state 'rescheduling' -> 'booked' in the same statement.
// W10.json is maintained as JSON; this script is the reproducible record. Idempotent. Run: node automation/patch-w10-smoke-c3.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const C = wf.connections;
const to = (name) => ({ node: name, type: 'main', index: 0 });
const PG = node('Timeline: cancelled').credentials;
const code = (id, name, position, jsCode, mode = 'runOnceForEachItem') => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode, jsCode } });
const ifNode = (id, name, position, expr) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } });
const pg = (id, name, position, query, repl) => ({ id, name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position, credentials: PG, alwaysOutputData: true, onError: 'continueRegularOutput',
  parameters: { operation: 'executeQuery', query, options: { queryReplacement: repl } } });
const setJs = (name, js) => { node(name).parameters.jsCode = js; };
const swap = (name, from, too) => { const n = node(name); const s = JSON.stringify(n.parameters); if (s.includes(from)) n.parameters = JSON.parse(s.split(from).join(too)); };

// ------------------------------------------------------------------ #3 method change: W05 owns it, the message follows it
const MLM = 'Method lead message (one message)';
const W5REQ = 'W05 request (update_method)';
const W5 = 'W05 update event method (Teams link / body)';
if (has('Save method')) {
  wf.nodes = wf.nodes.filter((n) => n.name !== 'Save method');
  delete C['Save method'];
}
C['Method result'].main[0] = [to(MLM)];
setJs(MLM, [
  "const L = require('lv-automation').w10;",
  '// I-39a: change -> METHOD_CHANGED (or delegate.body); reject -> lead_lines + SAME_METHOD with the adviser\'s methods.',
  "// Smoke #3: a change is NOT sent here. W05 sends this one message only after the Outlook PATCH and the save worked.",
  "const j = $('Decide method change').item.json;",
  'const m = L.methodMessage(j.d, j.bk, j.ld, j.br, j.delegate || null, j.method);',
  'const wa = L.toWa(j.ld.phone, m);',
  "return { json: j.d.action === 'change' ? { to: 'lead', ld: j.ld, wa: null, w05_notify: wa } : { to: 'lead', ld: j.ld, wa } };"].join('\n'));
C[MLM] = { main: [[to('Has WhatsApp payload + live?'), to(W5REQ)]] };
setJs(W5REQ, [
  "const L = require('lv-automation').w10;",
  "const j = $('Decide method change').first().json;",
  "if (!j.d || j.d.action !== 'change') return [];",
  "const r = L.w05UpdateMethod(j.bk, j.method, $input.first().json.w05_notify || null);",
  'return r.ok ? [{ json: r.req }] : [];'].join('\n'));
const w5 = node(W5);
w5.parameters.options = { ...(w5.parameters.options || {}), waitForSubWorkflow: true };
w5.onError = 'continueRegularOutput';

// ------------------------------------------------------------------ #12 the cancel card opens the typed-reason wait
const MERGE = 'Merge context';
const WAITIF = 'Typed-reason wait change? (card opens it, other ops end it)';
const WAITPG = 'Typed-reason wait (open for the card / end it)';
{
  const m = node(MERGE);
  const a = "__o.cancel_wait = __o.op === 'cancel_other' ? JSON.stringify(W.cancelReasonPending(__o.bk, Date.now())) : '';";
  const b = "__o.cancel_wait = ['cancel_other', 'cancel_ask'].includes(__o.op) ? JSON.stringify(W.cancelReasonPending(__o.bk, Date.now())) : ''; // smoke #12: the card opens the wait too\n__o.clear_wait = W.clearsReasonWait(__o.op, __o.ld); // any other op ends it (a tap on another row, a move, a method change)";
  if (!m.parameters.jsCode.includes('__o.clear_wait')) {
    if (!m.parameters.jsCode.includes(a)) throw new Error('Merge context anchor not found');
    m.parameters.jsCode = m.parameters.jsCode.replace(a, b);
  }
}
if (!has(WAITIF)) {
  const [x, y] = node(MERGE).position;
  wf.nodes.push(ifNode('w10-c3-wait-if', WAITIF, [x, y + 260], "$json.op === 'cancel_ask' || $json.clear_wait === true"));
  wf.nodes.push(pg('w10-c3-wait-pg', WAITPG, [x + 220, y + 260],
    "-- Smoke #12: the cancel card asks \"can you tell me why?\", so it opens the typed-reason wait (conv_state.cancel_reason_pending,\n-- 30 min, this booking; W07 routes the next free text back as cancel_reason_text). $2 = '' ends the wait: the client left\n-- the card another way (another row, a move on /start/, a method change), so a later message is never read as a reason.\nUPDATE public.leads l\n   SET conv_state = CASE WHEN $2 <> '' THEN COALESCE(l.conv_state, '{}'::jsonb) || jsonb_build_object('cancel_reason_pending', $2::jsonb)\n                         ELSE l.conv_state - 'cancel_reason_pending' END,\n       updated_at = now()\n WHERE l.id = $1::uuid AND ($2 <> '' OR l.conv_state ? 'cancel_reason_pending')\nRETURNING l.id;",
    "={{ [$json.ld.id, $json.op === 'cancel_ask' ? ($json.cancel_wait || '') : ''] }}"));
  C[WAITIF] = { main: [[to(WAITPG)], []] };
}
if (!C[MERGE].main[0].some((t) => t.node === WAITIF)) C[MERGE].main[0].push(to(WAITIF));

// ------------------------------------------------------------------ #11 the move answers once the row moved
const DM = "$('Decide move (w10.applyReschedule)')";
const MEC = 'Move effects context (w10.moveEffectsItem)';
const MER = 'Move effects request (w10.moveEffectsRequest)';
const ME = '-> W10 move effects (not waited)';
const MOVED = 'Moved? (else slot taken in the last second)';
{
  const op = node('Op');
  if (!op.parameters.rules.values.some((r) => r.outputKey === 'move_effects')) {
    op.parameters.rules.values.push({ outputKey: 'move_effects', renameOutput: true, conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 's10', leftValue: '={{ $json.op }}', rightValue: 'move_effects', operator: { type: 'string', operation: 'equals' } }] } });
  }
  const ix = op.parameters.rules.values.findIndex((r) => r.outputKey === 'move_effects');
  while (C.Op.main.length <= ix) C.Op.main.push([]);
  C.Op.main[ix] = [to(MEC)];
}
if (!has(MER)) {
  const [x, y] = node(MOVED).position;
  wf.nodes.push(code('w10-c3-move-req', MER, [x + 110, y + 120], [
    '// Smoke #11: the row moved. Answer the caller now (W39 waits for this execution); the Graph PATCH, W09 re-plan, timeline,',
    "// notices and client email run in W10's own second execution with the decided move and the booking as it was before.",
    "const L = require('lv-automation').w10;",
    `return { json: L.moveEffectsRequest(${DM}.item.json) };`].join('\n')));
  wf.nodes.push({ id: 'w10-c3-move-sub', name: ME, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: [x + 330, y + 120],
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w10', cachedResultName: 'W10 Reschedule / cancel' }, options: { waitForSubWorkflow: false } } });
  C[MER] = { main: [[to(ME)]] };
}
C[MOVED].main[0] = [to(MER)];
if (!has(MEC)) {
  const [x, y] = node('Graph target (move)').position;
  wf.nodes.push(code('w10-c3-move-ctx', MEC, [x - 220, y + 120], [
    "// Smoke #11: the effects execution (op move_effects). Merge context reloaded the row (already at the new time); the decided",
    "// move and the old time come from the caller, so every node below reads the same item the waited move used to give them.",
    "const L = require('lv-automation').w10;",
    "return { json: L.moveEffectsItem($('Merge context').item.json) };"].join('\n')));
  C[MEC] = { main: [[to('Graph target (move)')]] };
}
// effect-only nodes read the effects context
const MECREF = `$('${MEC}')`;
for (const n of ['Graph PATCH event (same event id)', 'Graph PATCH event (howzit@ shared calendar)', 'SMC client email (moved)', 'W09 request (rebuild, move)']) swap(n, DM, MECREF);
// shared with the after-meeting rebooking (still in the waited execution): effects context when it ran, else Decide move
{
  const t = node('Timeline: moved (+ rebooked_after_no_show, second reschedule flag)');
  const a = "const j = $('Decide move (w10.applyReschedule)').item.json;";
  const b = `let j; try { j = ${MECREF}.item.json; } catch (e) { j = ${DM}.item.json; }`;
  if (t.parameters.options.queryReplacement.includes(a)) t.parameters.options.queryReplacement = t.parameters.options.queryReplacement.replace(a, b);
  const m = node('Lead + broker messages (moved)');
  const a2 = "const j = $('Decide move (w10.applyReschedule)').item.json;\n";
  const b2 = `let j; try { j = ${MECREF}.item.json; } catch (e) { j = ${DM}.item.json; } // smoke #11: effects execution, else the after-meeting rebooking\n`;
  if (m.parameters.jsCode.includes(a2)) m.parameters.jsCode = m.parameters.jsCode.replace(a2, b2);
}

// ------------------------------------------------------------------ #40 a move ends 'rescheduling'
{
  const mv = node('Move booking in place (re-check overlap + buffer)');
  if (!mv.parameters.query.includes("jsonb_build_object('state', 'booked')")) {
    const a = "UPDATE public.appointments a\n   SET appointment_date = $3::timestamptz, ends_at = $4::timestamptz, reschedule_count = a.reschedule_count + 1,\n       status = 'booked', confirmed_at = NULL, updated_at = now()\n  FROM chk\n WHERE a.id = $1::uuid AND chk.free AND a.status IN ('booked','confirmed')\nRETURNING a.id, a.graph_event_id, a.reschedule_count;";
    if (!mv.parameters.query.includes(a)) throw new Error('Move SQL anchor not found');
    mv.parameters.query = mv.parameters.query.replace(a, "mv AS (\n" + a.replace('RETURNING a.id, a.graph_event_id, a.reschedule_count;', 'RETURNING a.id, a.graph_event_id, a.reschedule_count, a.client_id),') +
      "\n-- smoke #40: the conversation leaves 'rescheduling' once the call has moved (else the after-call line can never fire)\ncs AS (\n  UPDATE public.leads l SET conv_state = l.conv_state || jsonb_build_object('state', 'booked'), updated_at = now()\n    FROM mv WHERE l.id = mv.client_id AND l.conv_state->>'state' = 'rescheduling'\n  RETURNING l.id)\nSELECT mv.id, mv.graph_event_id, mv.reschedule_count FROM mv;");
    mv.parameters.query = mv.parameters.query.replace('WITH chk AS (', 'WITH chk AS (').replace(/\)\nmv AS \(/u, '),\nmv AS (');
  }
}

const out = JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { writeFileSync(FILE, out); console.log('patch-w10-smoke-c3: changed'); } else console.log('patch-w10-smoke-c3: already');
