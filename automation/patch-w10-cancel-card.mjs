// automation/patch-w10-cancel-card.mjs - W10 cancel card (Jono, 19 Oct 2026, mockup frames 15-16 "Cancel").
// A typed "cancel" (W07 delegate cancel_confirm) or a Cancel tap (cancel:<booking>) opens the cancel card instead of the bare
// Yes / Keep question: the header-cancel banner image FIRST (lib/wa-banner.cjs, WA_SESSION_BANNERS=on), then a list
// "Choose a reason" (lib/w10.mjs cancelCard). The reasons (lib/w10.mjs CANCEL_REASONS):
//   reschedule:<id>               I need a different time  -> W07 reschedule card / W10 offer (unchanged paths)
//   cancel_reason:not_ready|sorted_cover|not_expected:<id> -> the existing cancel (applyCancel, C1A unchanged) with its own
//                                                              closing line (delegate body), reason stored
//   cancel_reason:went_wrong:<id> -> hello@ line + Keep my call / Cancel it (cancel_yes), reason stored
//   cancel_reason:other:<id>      -> "type the reason" + Just cancel it / Keep my call; conv_state.cancel_reason_pending
//                                    (30 min); W07 sends the typed text back as delegate cancel_reason_text -> cancel
//   keep_it:<id>                  Keep my call (last list row) -> the existing Keep it (+ the wait is cleared)
// The reason: lead_activities 'cancel_reason' (key w10:cancel_reason:<booking>). The no-call path (C1A b, live booking)
// keeps the plain Yes / Keep confirm ("Cancel confirm buttons"). W10.json is maintained as JSON; this script is the
// reproducible record. Idempotent. Run after patch-w10-guest.mjs: node automation/patch-w10-cancel-card.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const swap = (n, key, from, to, obj = n.parameters) => {
  const v = obj[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W10 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  obj[key] = v.replace(from, to);
  return true;
};
const PG = node('Timeline: cancelled').credentials;
const C = wf.connections;
const to = (name) => ({ node: name, type: 'main', index: 0 });

// 1. Classify op carries the reason (and the booking id of a reason tap)
swap(node('Classify op'), 'jsCode', 'return { json: { ...j, op, pick: sp, booking_id: (sp && sp.booking_id) || (j.booking && j.booking.id) || null,',
  "const cr = L.parseCancelReason((j.msg && (j.msg.payload || j.msg.list_id)) || '');\nreturn { json: { ...j, op, pick: sp, cancel_reason: L.cancelReasonOf(j), booking_id: (sp && sp.booking_id) || (cr && cr.booking_id) || (j.booking && j.booking.id) || null,");

// 2. Merge context: the reason's closing line as the delegate body; a typed reason outside its wait does nothing
swap(node('Merge context'), 'jsCode', "const i = $('Classify op').item.json; const r = $json;\nreturn { json: { ...i,",
  "const i = $('Classify op').item.json; const r = $json;\nconst __o = { ...i,");
swap(node('Merge context'), 'jsCode', 'last_inbound_ms: r.last_inbound_at ? Date.parse(r.last_inbound_at) : NaN } };',
  "last_inbound_ms: r.last_inbound_at ? Date.parse(r.last_inbound_at) : NaN };\n" +
  "// cancel card (patch-w10-cancel-card.mjs): a typed \"Another reason\" counts only for its booking inside the 30-min wait\n" +
  "const W = require('lv-automation').w10;\n" +
  "if (__o.cancel_reason && __o.cancel_reason.typed && !W.typedReasonValid(__o.ld, __o.bk, Date.now())) __o.op = 'cancel_reason_stale';\n" +
  "__o.delegate = W.reasonDelegate(__o.op === 'cancel' ? __o.cancel_reason : null, __o.ld, __o.bk, __o.delegate || null);\n" +
  "__o.reason_params = W.reasonParams(__o.source === 'W12' ? null : __o.cancel_reason); // [code, typed text] for the SQL\n" +
  "__o.cancel_wait = __o.op === 'cancel_other' ? JSON.stringify(W.cancelReasonPending(__o.bk, Date.now())) : '';\n" +
  'return { json: __o };');

// 3. Op: two more outputs (fallback 'extra' moves to the end, unconnected as before)
const op = node('Op');
const rules = op.parameters.rules.values;
for (const key of ['cancel_problem', 'cancel_other']) {
  if (rules.some((r) => r.outputKey === key)) continue;
  const r = JSON.parse(JSON.stringify(rules[rules.length - 1]));
  r.outputKey = key; r.conditions.conditions[0].rightValue = key; r.conditions.conditions[0].id = `s${rules.length}`;
  rules.push(r);
}
const ix = (key) => rules.findIndex((r) => r.outputKey === key);

const CARD = 'Cancel card (w10.cancelCard)';
const B_IF = 'Cancel banner first? (live)';
const B_IN = 'SUB input (Send cancel banner)';
const B_SEND = 'Send cancel banner';
const B_DONE = 'Cancel banner done';
const SAVE = 'Save cancel reason (+ typed-reason wait)';
const REPLY = 'Cancel reason reply (w10.cancelProblemWa / cancelOtherWa)';
const CLEAR = 'Keep: clear the typed-reason wait';
const SEND_IF = 'Has WhatsApp payload + live?';
if (!has(CARD)) {
  const [x, y] = node('Cancel confirm buttons').position;
  wf.nodes.push(
    { id: 'w10-cancel-card', name: CARD, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y - 120], parameters: { mode: 'runOnceForEachItem', jsCode: [
      "// lib/w10.mjs cancelCard: the reason list (+ the header-cancel banner image to send FIRST when WA_SESSION_BANNERS=on).",
      "const L = require('lv-automation').w10;",
      'const j = $json;',
      "const c = L.cancelCard(j.bk, j.ld, { WA_SESSION_BANNERS: $env.WA_SESSION_BANNERS, WHATSAPP_PROVIDER: $env.WHATSAPP_PROVIDER });",
      "return { json: { to: 'lead', ld: j.ld, wa: c.wa, _banner: c.banner } };"].join('\n') } },
    { id: 'w10-cancel-bif', name: B_IF, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 120, y - 120], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: "={{ String(!!$json._banner && !!$json.wa && $env.DRY_RUN_SENDS !== 'true') }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } },
    { id: 'w10-cancel-bin', name: B_IN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 240, y - 240], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// The banner image through smc-whatsapp-send (same transport, DRY_RUN_SENDS and suppression as the list); own correlation.',
      'const wa = $json._banner;',
      "const exec = (typeof $execution !== 'undefined' && $execution && $execution.id) || 'x';",
      "const idx = (typeof $itemIndex !== 'undefined') ? $itemIndex : 0;",
      "return { json: { kind: 'prebuilt', wa, to: wa && wa.to, record: false, caller: 'W10', bypass_suppression: false, phone_number_id: null, lead_id: null, broker_id: null,",
      "  correlation: 'W10:cancel_banner:' + exec + ':' + idx } };"].join('\n') } },
    { id: 'w10-cancel-bsend', name: B_SEND, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: [x + 360, y - 240], onError: 'continueRegularOutput',
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } },
    { id: 'w10-cancel-bdone', name: B_DONE, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 480, y - 240], parameters: { mode: 'runOnceForEachItem', jsCode: `// the list goes only after the image\nreturn { json: $('${B_IF}').item.json };` } },
    { id: 'w10-cancel-save', name: SAVE, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [x, y + 480], credentials: PG, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { operation: 'executeQuery',
      query: "-- The cancel reason (lead_activities 'cancel_reason', one row per booking, last reason wins; no cancel_reason column exists).\n" +
        "-- $7 = the typed-reason wait for \"Another reason\" (conv_state.cancel_reason_pending: { booking_id, until }), '' = clear it.\n" +
        "WITH r AS (\n  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, notes, occurred_at, idempotency_key)\n" +
        "  SELECT $1::uuid, $2::uuid, $3::uuid, 'W10', 'lead', 'cancel_reason', jsonb_build_object('booking_id', $4::text, 'reason', $5::text), NULLIF($6, ''), now(), 'w10:cancel_reason:' || $4 WHERE $5 <> ''\n" +
        "  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, notes = EXCLUDED.notes, occurred_at = now()\n  RETURNING id),\n" +
        "w AS (\n  UPDATE public.leads l\n     SET conv_state = CASE WHEN $7 <> '' THEN COALESCE(l.conv_state, '{}'::jsonb) || jsonb_build_object('cancel_reason_pending', $7::jsonb)\n                           ELSE COALESCE(l.conv_state, '{}'::jsonb) - 'cancel_reason_pending' END,\n         updated_at = now()\n" +
        "   WHERE l.id = $1::uuid AND ($7 <> '' OR l.conv_state ? 'cancel_reason_pending')\n  RETURNING l.id)\n" +
        'SELECT (SELECT count(*) FROM r)::int AS saved, (SELECT count(*) FROM w)::int AS wait;',
      options: { queryReplacement: "={{ [$json.ld.id, $json.bk.brand_id, $json.bk.broker_id, $json.bk.id, $json.reason_params[0], $json.reason_params[1], $json.cancel_wait || ''] }}" } } },
    { id: 'w10-cancel-reply', name: REPLY, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 240, y + 480], parameters: { mode: 'runOnceForEachItem', jsCode: [
      "const L = require('lv-automation').w10;",
      "const j = $('Merge context').item.json;",
      "// \"Something went wrong\" -> hello@ + Keep my call / Cancel it; \"Another reason\" -> type it + Just cancel it / Keep my call",
      "return { json: { to: 'lead', ld: j.ld, wa: j.op === 'cancel_problem' ? L.cancelProblemWa(j.bk, j.ld) : L.cancelOtherWa(j.bk, j.ld) } };"].join('\n') } },
    { id: 'w10-cancel-clear', name: CLEAR, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [0, 920], credentials: PG, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { operation: 'executeQuery',
      query: "-- Keep my call: the typed-reason wait (cancel card \"Another reason\") ends, so a later message is never read as a reason.\nUPDATE public.leads l SET conv_state = l.conv_state - 'cancel_reason_pending', updated_at = now()\n WHERE l.id = $1::uuid AND l.conv_state ? 'cancel_reason_pending'\nRETURNING l.id;",
      options: { queryReplacement: '={{ [$json.ld.id] }}' } } },
  );
  // cancel_ask -> the card (the no-call confirm keeps "Cancel confirm buttons")
  C.Op.main[ix('cancel_ask')] = [to(CARD)];
  C[CARD] = { main: [[to(B_IF)]] };
  C[B_IF] = { main: [[to(B_IN)], [to(SEND_IF)]] };
  C[B_IN] = { main: [[to(B_SEND)]] };
  C[B_SEND] = { main: [[to(B_DONE)]] };
  C[B_DONE] = { main: [[to(SEND_IF)]] };
  while (C.Op.main.length < rules.length) C.Op.main.push([]);
  C.Op.main[ix('cancel_problem')] = [to(SAVE)];
  C.Op.main[ix('cancel_other')] = [to(SAVE)];
  C[SAVE] = { main: [[to(REPLY)]] };
  C[REPLY] = { main: [[to(SEND_IF)]] };
  C.Op.main[ix('keep')] = [...C.Op.main[ix('keep')], to(CLEAR)];
}

// 4. a cancel with a reason stores it in the same statement as the cancel timeline row (and ends the typed-reason wait)
const tl = node('Timeline: cancelled');
swap(tl, 'query', "INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)\nVALUES ($1::uuid, $2::uuid, $3::uuid, 'W10', $5, 'booking_cancelled'",
  "-- cancel card (patch-w10-cancel-card.mjs): $6 reason code ('' = none), $7 the typed \"Another reason\" text\n" +
  "WITH r AS (\n  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, notes, occurred_at, idempotency_key)\n" +
  "  SELECT $1::uuid, $2::uuid, $3::uuid, 'W10', 'lead', 'cancel_reason', jsonb_build_object('booking_id', $4::text, 'reason', $6::text), NULLIF($7, ''), now(), 'w10:cancel_reason:' || $4 WHERE $6 <> ''\n" +
  "  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, notes = COALESCE(EXCLUDED.notes, lead_activities.notes), occurred_at = now()\n  RETURNING id),\n" +
  "w AS (\n  UPDATE public.leads l SET conv_state = l.conv_state - 'cancel_reason_pending', updated_at = now()\n   WHERE l.id = $1::uuid AND l.conv_state ? 'cancel_reason_pending'\n  RETURNING l.id)\n" +
  "INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)\nVALUES ($1::uuid, $2::uuid, $3::uuid, 'W10', $5, 'booking_cancelled'");
swap(tl, 'queryReplacement', "j.source === 'W12' ? 'broker' : 'lead']; })() }}",
  "j.source === 'W12' ? 'broker' : 'lead', (j.reason_params || ['', ''])[0], (j.reason_params || ['', ''])[1]]; })() }}", tl.parameters.options);

const out = JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { writeFileSync(FILE, out); console.log('patch-w10-cancel-card: changed'); } else console.log('patch-w10-cancel-card: already');
