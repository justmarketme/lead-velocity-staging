// automation/patch-w02-social.mjs - W02 hands Page comments and Messenger events to W40 Social replies (21 Oct 2026).
// Plan: Desktop\EMMA\checklist\SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md section 5 item 6: "Wire the unused branch to W40, add
// standby events to the forwarding check, and add an on/off switch."
//   - The Page webhook (meta-leadgen) is the only Page callback Meta allows per app, so feed comments, Messenger messages,
//     standby (another app owns the thread) and hand-over events arrive here. Until 20 Oct they were forwarded to W30 / W31;
//     since D5 the forward items were built and then dropped. Now: one 'w40' item with the ORIGINAL bytes (base64) and the
//     original X-Hub-Signature-256 header; W40 checks the signature itself.
//   - Switch: the forward runs only when SOCIAL_MODE is 'shadow' or 'live' (unset / off = nothing leaves W02, exactly as
//     today). Lead ads are untouched: the leadgen path and the 200 response do not change.
// W02.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent; refuses unknown code.
// Run: node automation/patch-w02-social.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W02.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W02 has no node "${name}"`); return n; };

const VERIFY = 'Verify signature + parse leadgen events';
const IF_NAME = 'Social forward on? (SOCIAL_MODE)';
const SUB_NAME = 'W40 Social replies (Page comments + Messenger)';

const OLD_FWD = `// Page object: feed comments -> W30, Messenger DMs -> W31. Forward the ORIGINAL body (base64 of the received bytes) + the
// original signature header; the callee verifies it itself. Nothing is re-serialised, nothing is trusted because W02 checked it.
if (body && body.object === 'page') {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const hasComment = entries.some((e) => (e.changes || []).some((c) => c && c.field === 'feed' && c.value && c.value.item === 'comment'));
  const hasDm = entries.some((e) => Array.isArray(e.messaging) && e.messaging.length > 0);
  const fwd = (route) => ({ json: { valid: true, route, raw_body_b64: buf.toString('base64'), signature: sig } });
  if (hasComment) out.push(fwd('w30'));
  if (hasDm) out.push(fwd('w31'));
}`;
const NEW_FWD = `// Page object: feed comments, Messenger messages, standby (another app owns the thread) and hand-over events -> W40 Social
// replies. Forward the ORIGINAL body (base64 of the received bytes) + the original signature header; W40 verifies it itself.
// Nothing is re-serialised, nothing is trusted because W02 checked it. "Social forward on?" sends it only when SOCIAL_MODE is on.
if (body && body.object === 'page') {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const nonEmpty = (a) => Array.isArray(a) && a.length > 0;
  const social = entries.some((e) => (e.changes || []).some((c) => c && c.field === 'feed' && c.value && c.value.item === 'comment')
    || nonEmpty(e.messaging) || nonEmpty(e.standby));
  if (social) out.push({ json: { valid: true, route: 'w40', raw_body_b64: buf.toString('base64'), signature: sig } });
}`;
const OLD_RAW_NOTE = '// Raw bytes exactly as received (binary), kept for the byte-for-byte forward to W30 / W31 (I-16, I-25).';
const NEW_RAW_NOTE = '// Raw bytes exactly as received (binary), kept for the byte-for-byte forward to W40 Social replies (I-16, I-25).';
const STICKY_FROM = 'Page ingress (I-16/I-25): this callback is the Meta `page` object. leadgen changes take the path above; Page feed / messages events get the 200 and nothing else (W30/W31 retired 19 Oct 2026).';
const STICKY_TO = 'Page ingress (I-16/I-25): this callback is the Meta `page` object. leadgen changes take the path above. Page feed comments, Messenger messages, standby and hand-over events get the 200 and, only when SOCIAL_MODE is shadow or live, go to W40 Social replies (raw bytes + signature, W40 re-checks; 21 Oct 2026). SOCIAL_MODE unset / off = nothing is forwarded.';

const changed = [];
const v = node(VERIFY);
let js = v.parameters.jsCode;
if (js.includes(NEW_FWD)) changed.push(false);
else if (js.includes(OLD_FWD)) { js = js.replace(OLD_FWD, NEW_FWD); changed.push(true); }
else throw new Error(`W02 "${VERIFY}": unexpected forward block, refusing to overwrite`);
if (js.includes(OLD_RAW_NOTE)) js = js.replace(OLD_RAW_NOTE, NEW_RAW_NOTE);
v.parameters.jsCode = js;

const s = node('Sticky: read me');
if (s.parameters.content.includes(STICKY_TO)) changed.push(false);
else if (s.parameters.content.includes(STICKY_FROM)) { s.parameters.content = s.parameters.content.replace(STICKY_FROM, STICKY_TO); changed.push(true); }
else throw new Error('W02 sticky: anchor not found');

if (!wf.nodes.some((n) => n.name === IF_NAME)) {
  wf.nodes.push({ id: 'n16', name: IF_NAME, type: 'n8n-nodes-base.if', typeVersion: 2, position: [660, -300], parameters: { conditions: {
    options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
    conditions: [{ id: 'c1', leftValue: "={{ String($json.route === 'w40' && ['shadow', 'live'].includes(String($env.SOCIAL_MODE || '').trim().toLowerCase())) }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
  wf.nodes.push({ id: 'n17', name: SUB_NAME, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [880, -300],
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w40', cachedResultName: 'W40 Social replies' }, options: { waitForSubWorkflow: false } },
    onError: 'continueRegularOutput' });
  wf.connections[VERIFY].main[0].push({ node: IF_NAME, type: 'main', index: 0 });
  wf.connections[IF_NAME] = { main: [[{ node: SUB_NAME, type: 'main', index: 0 }]] };
  changed.push(true);
} else changed.push(false);

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w02-social:', changed.map((c) => (c ? 'changed' : 'already')).join(' '));
