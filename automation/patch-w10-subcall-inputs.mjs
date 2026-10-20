// automation/patch-w10-subcall-inputs.mjs - W10 sends W05 / W09 their documented requests (v4b21, 20 Oct 2026 live bug).
// Live: a no-show -> missed_you -> the lead taps a time -> W10 after-meeting path (applyReschedule new_booking) -> W10 passed
// its own item to W05 (fire-and-forget) -> W05 parseSub "missing slot_start, method, idempotency_key" (subcall_rejected),
// while W10 had already set the old booking 'rescheduled' and said "Done": the lead thought they were booked; nothing was.
// The same mistake fed W09 rebuild / cancel_all a Graph response and W05 update_method a Save-method row.
// New graph (lib/w10.mjs rebookRequest / w09Rebuild / w09CancelAll / w05UpdateMethod):
//   Move result[new_booking] -> W05 rebook request -> Rebook request ok?
//     true  -> -> W05 new booking (WAITS, error output) -> Rebooking stored? (re-read by idempotency key) -> Rebooked?
//                 booked / confirmed -> Old booking -> rescheduled -> Timeline -> Lead + broker messages (none for a rebooking:
//                 W05 sent booking_confirmed + broker_new_booking itself)
//                 else -> nothing here: W05 answered the lead itself (held -> hold message; slot taken -> SLOT_TAKEN + next 3;
//                 opted out -> silence); anything still silent is caught by W07's never-silent guard (route W10)
//     false / W05 error -> Rebook failed: holding line (w07.neverSilentText) + owner alert (w07.neverSilentAlert, EMMA
//                 /api/notify behind DRY_RUN_SENDS); the old booking is kept
//   W09 rebuild / cancel_all and W05 update_method get a request node in front.
// W10.json is maintained as JSON; this script is the reproducible record. Idempotent. Run: node automation/patch-w10-subcall-inputs.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const C = wf.connections;
const to = (name) => ({ node: name, type: 'main', index: 0 });
const PG = node('Timeline: cancelled').credentials;
const code = (id, name, position, jsCode) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForEachItem', jsCode } });
/** Point every edge that targets `target` at `via` instead. */
const redirect = (target, via) => { for (const [src, v] of Object.entries(C)) { if (src === via) continue; for (const o of v.main || []) for (const t of o || []) if (t.node === target) t.node = via; } };

const W05 = '-> W05 new booking (after the meeting)';
const REQ = 'W05 rebook request (w10.rebookRequest)';
const OK = 'Rebook request ok?';
const READ = 'Rebooking stored? (re-read by idempotency key)';
const BOOKED = 'Rebooked? (booked / confirmed)';
const OLD = 'Old booking -> rescheduled';
const FAIL_WA = 'Rebook failed: holding line (w07.neverSilentText)';
const FAIL_AL = 'Rebook failed: owner alert (w07.neverSilentAlert)';
const LIVE_AL = 'Live alert? (rebook failed)';
const NOTIFY = 'Notify Jono (EMMA /api/notify, rebook failed)';
const SEND_IF = 'Has WhatsApp payload + live?';
const MSGS = 'Lead + broker messages (moved)';

if (!has(REQ)) {
  const [x, y] = node(W05).position;
  wf.nodes.push(
    code('w10-rebook-req', REQ, [x - 220, y + 160], [
      '// W05 documented book (CONTRACTS "Sub-workflow interfaces"), checked with W05\'s own parseSub before it is sent.',
      "const L = require('lv-automation').w10;",
      "const r = L.rebookRequest($('Decide move (w10.applyReschedule)').item.json);",
      'return { json: { ...(r.req || {}), _ok: r.ok, _reason: r.reason || null } };'].join('\n')),
    { id: 'w10-rebook-ok', name: OK, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x - 110, y + 160], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: '={{ String($json._ok === true) }}', rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } },
    { id: 'w10-rebook-read', name: READ, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: [x + 220, y + 160], credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
      query: "-- What W05 actually stored (its reply to a waiting caller is its last node, not a contract): the row for this key.\nSELECT (SELECT to_jsonb(k) FROM (SELECT a.id, a.status FROM public.appointments a WHERE a.idempotency_key = $1 LIMIT 1) k) AS booking;",
      options: { queryReplacement: `={{ [$('${REQ}').item.json.idempotency_key || ''] }}` } } },
    { id: 'w10-rebook-booked', name: BOOKED, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 440, y + 160], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: "={{ String(['booked', 'confirmed'].includes(($json.booking || {}).status)) }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } },
    code('w10-rebook-fail-wa', FAIL_WA, [x + 220, y + 320], [
      '// The rebooking could not be made: keep the old booking, ONE warm holding line (never a failure word), and a person follows up.',
      "const W7 = require('lv-automation').w07;",
      "const j = $('Decide move (w10.applyReschedule)').item.json;",
      "const body = W7.neverSilentText('W10', { first_name: j.ld.first_name || '', lang: j.ld.language === 'af' ? 'af' : 'en' });",
      "return { json: { to: 'lead', ld: j.ld, wa: { messaging_product: 'whatsapp', to: j.ld.phone, type: 'text', text: { body } } } };"].join('\n')),
    code('w10-rebook-fail-al', FAIL_AL, [x + 220, y + 480], [
      "const W7 = require('lv-automation').w07;",
      "const j = $('Decide move (w10.applyReschedule)').item.json;",
      "return { json: { request: W7.neverSilentAlert({ route: 'W10', lead: { id: j.ld.id, first_name: j.ld.first_name } }) } };"].join('\n')),
    { id: 'w10-rebook-live-al', name: LIVE_AL, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 440, y + 480], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: "={{ String($env.DRY_RUN_SENDS !== 'true') }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] } } },
    { id: 'w10-rebook-notify', name: NOTIFY, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 660, y + 480], onError: 'continueRegularOutput',
      parameters: { method: 'POST', url: 'https://emmadoesit.cloud/api/notify', sendHeaders: true, headerParameters: { parameters: [{ name: 'content-type', value: 'application/json' }, { name: 'x-emma-secret', value: '={{ $env.EMMA_SHARED_SECRET }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.request) }}', options: { timeout: 10000, response: { response: { fullResponse: true, neverError: true } } } } },
  );
  const w5 = node(W05);
  w5.parameters.options = { ...(w5.parameters.options || {}), waitForSubWorkflow: true };
  w5.onError = 'continueErrorOutput';
  redirect(W05, REQ);
  C[REQ] = { main: [[to(OK)]] };
  C[OK] = { main: [[to(W05)], [to(FAIL_WA), to(FAIL_AL)]] };
  C[W05] = { main: [[to(READ)], [to(FAIL_WA), to(FAIL_AL)]] };
  C[READ] = { main: [[to(BOOKED)]] };
  C[BOOKED] = { main: [[to(OLD)], []] };
  C[FAIL_WA] = { main: [[to(SEND_IF)]] };
  C[FAIL_AL] = { main: [[to(LIVE_AL)]] };
  C[LIVE_AL] = { main: [[to(NOTIFY)], []] };
}
// a rebooking's confirmation + broker notice come from W05 (booking_confirmed, broker_new_booking): no second "Done" here
const m = node(MSGS);
const GUARD = "if (j.d.action !== 'move') return []; // after-meeting rebooking: W05 sent booking_confirmed + broker_new_booking";
if (!m.parameters.jsCode.includes(GUARD)) {
  const a = "const j = $('Decide move (w10.applyReschedule)').item.json;\n";
  if (!m.parameters.jsCode.includes(a)) throw new Error('W10 messages node anchor not found');
  m.parameters.jsCode = m.parameters.jsCode.replace(a, a + GUARD + '\n');
}

// W09 rebuild / cancel_all and W05 update_method: the documented request in front of each call
const front = (target, id, name, js) => {
  if (has(name)) return;
  const [x, y] = node(target).position;
  wf.nodes.push(code(id, name, [x - 110, y - 120], js));
  redirect(target, name);
  C[name] = { main: [[to(target)]] };
};
front('W09 rebuild reminders', 'w10-w09-rebuild-req', 'W09 request (rebuild, move)',
  "const L = require('lv-automation').w10;\nconst j = $('Decide move (w10.applyReschedule)').item.json;\nreturn { json: L.w09Rebuild(j.bk, j.new_start) };");
front('W09 cancel all reminders', 'w10-w09-cancel-req', 'W09 request (cancel_all, cancel)',
  "const L = require('lv-automation').w10;\nreturn { json: L.w09CancelAll($('Decide cancel (w10.applyCancel)').item.json.bk) };");
front('W05 update event method (Teams link / body)', 'w10-w05-method-req', 'W05 request (update_method)',
  "const L = require('lv-automation').w10;\nconst j = $('Decide method change').first().json;\nconst r = L.w05UpdateMethod(j.bk, j.method);\nreturn r.ok ? [{ json: r.req }] : [];");
node('W05 request (update_method)').parameters.mode = 'runOnceForAllItems';

const out = JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { writeFileSync(FILE, out); console.log('patch-w10-subcall-inputs: changed'); } else console.log('patch-w10-subcall-inputs: already');
