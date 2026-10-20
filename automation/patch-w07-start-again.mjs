// automation/patch-w07-start-again.mjs - v4b12 (Jono, 19 Oct 2026): while the /start/ page is pending, a chat message gets
// Lindi's normal reply (lib/w07.mjs routes it to nlu instead of W03's age taps) and then the Start here link again, with a
// fresh lead token: "Tap below to pick your time with {adviser_first}." (lib/wa-provider.mjs startAgainPlan). It runs after
// the reply's send, through smc-whatsapp-send (DRY_RUN_SENDS, suppression, provider; Twilio = smc_start_cta, never a text
// body with the token), record:true (the sub writes the communications row), correlation W07:start_again:<wamid> (a
// retried inbound is a duplicate). No link after a handoff, or when the token / Content SID is missing.
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run after the other W07 patches: node automation/patch-w07-start-again.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

const SEND = 'Send WhatsApp (session, in 24-h window)';
const PLAN = 'Start here again plan (W07)';
const IF = 'Start here again? (W07)';
const IN = 'SUB input (Send Start here again (W07))';
const OUT = 'Send Start here again (W07)';

let changed = false;
if (!has(PLAN)) {
  const [x, y] = node(SEND).position || [0, 0];
  wf.nodes.push(
    { id: 'w07-again-plan', name: PLAN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 240, y + 200], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// v4b12 (patch-w07-start-again.mjs): Start here again after Lindi\'s reply while the /start/ page is pending.',
      "const A = require('lv-automation'); const P = A.waProvider;",
      "const s = $('Anything to send?').item.json;",
      'const lead = s.lead || {};',
      "const pending = ((lead.conv_state || {}).state) === 'start_page';",
      'let token = null;',
      'if (pending && lead.id) { try { token = A.leadToken.mintLeadToken(lead.id, { secret: $env.LEAD_TOKEN_SECRET }).token; } catch (e) { token = null; } }',
      'const plan = P.startAgainPlan({ lead, adviser_first: s.adviser_first || (s.broker && s.broker.contact_person) || \'\', handoff: !!s.handoff, token,',
      '  env: { WHATSAPP_PROVIDER: $env.WHATSAPP_PROVIDER, TWILIO_CONTENT_SIDS: $env.TWILIO_CONTENT_SIDS } });',
      'return { json: { start_again: plan.send || null, start_again_skip: plan.skip || null, lead_id: lead.id || null, wamid: (s.msg && (s.msg.wamid || s.msg.id)) || null } };'].join('\n') } },
    { id: 'w07-again-if', name: IF, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 360, y + 200], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: 'c1', leftValue: '={{ !!$json.start_again }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { id: 'w07-again-in', name: IN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 480, y + 140], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// The link through smc-whatsapp-send; record:true = the sub writes the communications row.',
      "return { json: { kind: 'prebuilt', wa: $json.start_again, to: $json.start_again.to, record: true, caller: 'W07', bypass_suppression: false, phone_number_id: null,",
      "  lead_id: $json.lead_id, broker_id: null, correlation: 'W07:start_again:' + ($json.wamid || ($json.lead_id + ':' + Date.now())) } };"].join('\n') } },
    { id: 'w07-again-send', name: OUT, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: [x + 600, y + 140], onError: 'continueRegularOutput',
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } },
  );
  wf.connections[SEND].main[0].push({ node: PLAN, type: 'main', index: 0 });
  wf.connections[PLAN] = { main: [[{ node: IF, type: 'main', index: 0 }]] };
  wf.connections[IF] = { main: [[{ node: IN, type: 'main', index: 0 }], []] };
  wf.connections[IN] = { main: [[{ node: OUT, type: 'main', index: 0 }]] };
  changed = true;
}

if (changed) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-start-again:', changed ? 'changed' : 'already');
