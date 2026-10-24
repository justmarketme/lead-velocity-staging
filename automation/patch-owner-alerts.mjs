// automation/patch-owner-alerts.mjs - W07 / W10: every owner alert is a WhatsApp to Jono from the SortMyCover number
// (owner rule, 24 Oct 2026; docs/OWNER-ALERTS-AUDIT.md; lib/owner-alert.mjs).
// Before: W07 "Alert ops" and "Pre-consent handoff" built an ops_alert with the TEXT in the name slot, "now" as the
// event, a dead URL button and (pre-consent) the full phone number; W07 never-silent and W10 rebook-failed posted to EMMA
// (Teams / Telegram), never WhatsApp. Now:
//   W07 "Alert ops (first name + initial, redacted)"          -> ownerAlert(): first name + phone last 3, KG too when sensitive
//   W07 "Pre-consent handoff: alert ops (nothing to the person)" -> ownerAlert() to both ops numbers, last 3 digits only
//   W07 "SUB input (Send ops alert)"                            -> passes a complete owner-alert item through unchanged
//   W07 never-silent / W10 rebook failed                        -> ownerAlert() -> smc-whatsapp-send (waits) -> ok? ; ok:false
//                                                                  -> the existing EMMA /api/notify chain (fallback only)
// W07.json / W10.json are maintained as JSON; this script is the reproducible record. Idempotent. Run after
// patch-w07-never-silent-alert.mjs, patch-w07-preconsent-handoff.mjs, patch-w10-subcall-inputs.mjs and
// patch-synthetic-ops-alerts.mjs (it re-applies over them): node automation/patch-owner-alerts.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SUB = { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' };
const to = (name) => ({ node: name, type: 'main', index: 0 });
const ifOk = (id, name, position) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: '={{ String($json.ok === true) }}', rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
const subSend = (id, name, position) => ({ id, name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position, onError: 'continueRegularOutput',
  parameters: { source: 'database', workflowId: SUB, options: { waitForSubWorkflow: true } },
  notes: 'Waits for the sender: Result { ok, external_id, error }. ok:false (no Content SID, Twilio error, sub down) takes the EMMA /api/notify fallback.' });

function load(file) {
  const F = new URL(`./${file}`, import.meta.url);
  const raw = readFileSync(F, 'utf8');
  const wf = JSON.parse(raw);
  const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`${file} has no node "${name}"`); return n; };
  const save = () => {
    const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
    const out = JSON.stringify(wf, null, indent) + (raw.endsWith('\n') ? '\n' : '');
    if (out !== raw) { writeFileSync(F, out); console.log(`${file}: changed`); } else console.log(`${file}: already`);
  };
  return { wf, node, save };
}

/** Insert BUILD -> SEND (sub, waits) -> OK? ; OK false -> the old gate. Idempotent. */
function ownerChain(wf, node, { build, send, ok, gate, ids }) {
  const C = wf.connections;
  const b = node(build);
  const [x, y] = b.position;
  if (!wf.nodes.some((n) => n.name === send)) wf.nodes.push(subSend(ids.send, send, [x + 220, y]));
  if (!wf.nodes.some((n) => n.name === ok)) wf.nodes.push(ifOk(ids.ok, ok, [x + 440, y]));
  node(send).parameters = subSend('', send, [0, 0]).parameters; node(send).onError = 'continueRegularOutput'; node(send).typeVersion = 1.2;
  node(ok).parameters = ifOk('', ok, [0, 0]).parameters;
  C[build] = { main: [[to(send)]] };
  C[send] = { main: [[to(ok)]] };
  C[ok] = { main: [[], [to(gate)]] };
}

// ---- W07 ---------------------------------------------------------------------------------------------------------------
{
  const { wf, node, save } = load('W07.json');
  node('Alert ops (first name + initial, redacted)').parameters = { mode: 'runOnceForAllItems', jsCode: [
    '// One owner WhatsApp per recipient (Jono; KG too on a sensitive chat) through lib/owner-alert.mjs: template ops_update /',
    '// ops_alert from the SortMyCover number, first name + phone last 3 only, bypass_suppression (Jono\'s number is also a test lead).',
    '// Runs once for all items: a for-each Code node may not return an array (n8n: "A \'json\' property isn\'t an object", which',
    '// crashed every handoff on 17 Oct). notify = [] (a SYNTHETIC_TEST_NUMBERS subject, lib/w07.mjs escalationRow) -> no alert.',
    "const O = require('lv-automation').ownerAlert;",
    "const plans = $('Carry plan').all();",
    'const out = [];',
    '$input.all().forEach((it, i) => {',
    '  const j = (plans[i] || plans[0]).json;',
    '  const e = (j.plan && j.plan.escalation) || {};',
    '  const notify = Array.isArray(e.notify) ? e.notify : [];',
    '  if (!notify.length) return;',
    "  const esc = String(e.note || '').split(';')[0].replace(/^esc_kind=/, '').replace(/_/g, ' ') || e.kind || 'hand-off';",
    "  const red = e.severity === 'red';",
    '  const items = O.ownerAlert({',
    "    what: (red ? 'RED: ' : '') + 'Chat hand-off (' + esc + ')',",
    "    detail: O.personLabel(j.lead || {}) + '; ' + (red ? 'reply personally, nothing automated was sent' : 'the lead is waiting for a person') + '; open the conversation in the console',",
    "    who: notify.includes('KG') ? 'both' : 'owner', source: 'W07', key: (j.msg && j.msg.wamid) || e.ref_id || it.json.id || '',",
    '    subject: { phone: j.lead && j.lead.phone, from: j.msg && j.msg.from },',
    '  }, $env);',
    '  for (const item of items) out.push({ json: item, pairedItem: { item: i } });',
    '});',
    'return out;'].join('\n') };

  node('Pre-consent handoff: alert ops (nothing to the person)').parameters = { mode: 'runOnceForAllItems', jsCode: [
    '// handoff_pre_consent: lib/w07.mjs routeInbound (distress or "a person" from a number with no lead yet). One owner WhatsApp',
    '// per ops number (Jono + KG) through lib/owner-alert.mjs (ops_update / ops_alert); the person gets nothing automated.',
    '// POPIA: the last 3 digits only (find the chat in the SortMyCover WhatsApp inbox by the time and those digits);',
    '// a SYNTHETIC_TEST_NUMBERS number alerts nobody (the helper checks the subject).',
    "const O = require('lv-automation').ownerAlert;",
    'const out = [];',
    '$input.all().forEach((it, i) => {',
    '  const msg = it.json.msg || {};',
    "  const red = String(it.json.reason || '').startsWith('distress'); // the Route node carries route + reason only",
    '  const items = O.ownerAlert({',
    "    what: red ? 'RED: new WhatsApp in distress, no consent yet' : 'New WhatsApp asked for a person, no consent yet',",
    "    detail: O.personLabel({ first_name: msg.profile_name, phone: msg.from }) + '; nothing automated was sent: reply from the SortMyCover WhatsApp',",
    "    who: 'both', source: 'W07', key: msg.wamid || msg.from || '', subject: { from: msg.from },",
    '  }, $env);',
    '  for (const item of items) out.push({ json: item, pairedItem: { item: i } });',
    '});',
    'return out;'].join('\n') };

  const subIn = node('SUB input (Send ops alert)');
  const PASS = "// lib/owner-alert.mjs items (24 Oct 2026) arrive complete: kind prebuilt, record:false, bypass_suppression:true, correlation, caller.\nif ($json.kind === 'prebuilt' && $json.wa && $json.correlation) return { json: $json };\n";
  if (!subIn.parameters.jsCode.startsWith(PASS)) subIn.parameters.jsCode = PASS + subIn.parameters.jsCode;

  const BUILD = 'Never silent: owner alert (lib w07.neverSilentAlert)';
  node(BUILD).parameters = { mode: 'runOnceForAllItems', jsCode: [
    "const L = require('lv-automation').w07;",
    "const O = require('lv-automation').ownerAlert;",
    '// one owner WhatsApp per item through lib/owner-alert.mjs (the EMMA /api/notify body stays on the item as `request`, for',
    '// the fallback); none for a SYNTHETIC_TEST_NUMBERS number (the escalation row above is the record)',
    'const out = [];',
    '$input.all().forEach((_, i) => {',
    "  const j = $('Never silent: wait 25 s').itemMatching(i).json;",
    '  const request = L.neverSilentAlert(j, $env);',
    '  if (!request) return;',
    "  const items = O.ownerAlert({ what: 'Lead needs a person (Lindi sent a holding line)', detail: request.message.replace(/^SortMyCover:\\s*/, ''),",
    "    who: 'owner', source: 'W07', key: (j.msg && j.msg.wamid) || (j.lead && j.lead.id) || '', subject: { phone: j.lead && j.lead.phone, from: j.msg && j.msg.from } }, $env);",
    '  for (const item of items) out.push({ json: { ...item, request }, pairedItem: { item: i } });',
    '});',
    'return out;'].join('\n') };
  const NS_SEND = 'Never silent: owner WhatsApp (smc-whatsapp-send)';
  const NS_OK = 'Never silent: WhatsApp sent? (ok)';
  ownerChain(wf, node, { build: BUILD, send: NS_SEND, ok: NS_OK, gate: 'Live send? (Never silent: notify Jono (EMMA /api/notify))', ids: { send: 'w07-ns-owner-send', ok: 'w07-ns-owner-ok' } });
  const emma = node('Never silent: notify Jono (EMMA /api/notify)');
  emma.parameters.jsonBody = `={{ JSON.stringify($('${BUILD}').first().json.request) }}`;
  emma.notes = 'Fallback only (24 Oct 2026): runs when smc-whatsapp-send answered ok:false. Owner alert for every never-silent fallback (lib/w07.mjs neverSilentAlert): first name, the silent hand-off, the lead id; never the number or the message.';
  save();
}

// ---- W10 ---------------------------------------------------------------------------------------------------------------
{
  const { wf, node, save } = load('W10.json');
  const BUILD = 'Rebook failed: owner alert (w07.neverSilentAlert)';
  node(BUILD).parameters = { mode: 'runOnceForAllItems', jsCode: [
    "const W7 = require('lv-automation').w07;",
    "const O = require('lv-automation').ownerAlert;",
    '// one owner WhatsApp per item through lib/owner-alert.mjs (the EMMA /api/notify body stays on the item as `request`, for',
    '// the fallback); none for a SYNTHETIC_TEST_NUMBERS lead (lib/w07.mjs syntheticSubject)',
    'const out = [];',
    '$input.all().forEach((_, i) => {',
    "  const j = $('Decide move (w10.applyReschedule)').itemMatching(i).json;",
    "  const request = W7.neverSilentAlert({ route: 'W10', lead: { id: j.ld.id, first_name: j.ld.first_name, phone: j.ld.phone } }, $env);",
    '  if (!request) return;',
    "  const items = O.ownerAlert({ what: 'Rebooking failed, old booking kept (Lindi sent a holding line)', detail: request.message.replace(/^SortMyCover:\\s*/, ''),",
    "    who: 'owner', source: 'W10', key: (j.bk && j.bk.id) || j.ld.id || '', subject: { phone: j.ld.phone } }, $env);",
    '  for (const item of items) out.push({ json: { ...item, request }, pairedItem: { item: i } });',
    '});',
    'return out;'].join('\n') };
  const RB_SEND = 'Rebook failed: owner WhatsApp (smc-whatsapp-send)';
  const RB_OK = 'Rebook failed: WhatsApp sent? (ok)';
  ownerChain(wf, node, { build: BUILD, send: RB_SEND, ok: RB_OK, gate: 'Live alert? (rebook failed)', ids: { send: 'w10-rebook-owner-send', ok: 'w10-rebook-owner-ok' } });
  const emma = node('Notify Jono (EMMA /api/notify, rebook failed)');
  emma.parameters.jsonBody = `={{ JSON.stringify($('${BUILD}').first().json.request) }}`;
  emma.notes = 'Fallback only (24 Oct 2026): runs when smc-whatsapp-send answered ok:false.';
  save();
}
