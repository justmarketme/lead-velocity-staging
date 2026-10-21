// automation/patch-synthetic-ops-alerts.mjs - ops alerts caused by a test number WhatsApp nobody (21 Oct 2026, late).
// Live: during the smoke-fix deploy a wa-smoke inbound from +27600000921 (on SYNTHETIC_TEST_NUMBERS) reached W07
// "Send ops alert" and WhatsApped Jono (escalation esc_kind=unanswered, smc-whatsapp-send execution 12261). The sender only
// dry-runs a synthetic RECIPIENT; an ops alert goes to OPS_WHATSAPP_*, so the number that caused it was never checked.
// Fix (exact numbers only, lib/wa.mjs isSyntheticNumber via lib/w07.mjs syntheticSubject; never a range):
//   W07 plan nodes      -> planActions gets ctx.synthetic: the escalation row is still written, its note says synthetic, and
//                          notify = [] so "Alert ops (first name + initial, redacted)" builds no WhatsApp
//   W07 pre-consent     -> no ops_alert for a synthetic number (no lead yet, nothing else is sent either)
//   W07 never silent    -> no EMMA owner alert for a synthetic number (the "Never silent: escalation" row is the record)
//   W10 rebook failed   -> no EMMA owner alert for a synthetic lead
// W03 / W06 W22 producers carry `synthetic` (their generators); lib/w22.mjs sends a synthetic signal by email only.
// W07.json / W10.json are maintained as JSON, so this script is the reproducible record. Idempotent.
// Run after the other W07 / W10 patches (it re-applies over patch-w07-preconsent-handoff.mjs and
// patch-w07-never-silent-alert.mjs): node automation/patch-synthetic-ops-alerts.mjs
import { readFileSync, writeFileSync } from 'node:fs';

function patch(file, edits) {
  const F = new URL(`./${file}`, import.meta.url);
  const raw = readFileSync(F, 'utf8');
  const wf = JSON.parse(raw);
  const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`${file} has no node "${name}"`); return n; };
  const changed = edits.map(([name, from, to, mode]) => {
    const n = node(name);
    const v = n.parameters.jsCode;
    if (mode) n.parameters.mode = mode;
    if (v.includes(to)) return false;
    if (!v.includes(from)) throw new Error(`${file} "${name}": anchor not found: ${from.slice(0, 60)}`);
    n.parameters.jsCode = v.replace(from, to);
    return true;
  });
  const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
  const out = JSON.stringify(wf, null, indent) + (raw.endsWith('\n') ? '\n' : '');
  if (out !== raw) writeFileSync(F, out);
  console.log(`${file}:`, changed.map((c) => (c ? 'changed' : 'already')).join(' '));
}

const SYN = 'synthetic: L.syntheticSubject(j, $env), ';
patch('W07.json', [
  ['Parse NLU -> decide() -> plan', 'wamid: j.msg.wamid, disclosed:', `wamid: j.msg.wamid, ${SYN}disclosed:`],
  ['Plan without LLM (media only)', 'wamid: j.msg.wamid, disclosed:', `wamid: j.msg.wamid, ${SYN}disclosed:`],
  ['Pre-consent handoff: alert ops (nothing to the person)',
    "const out = [];\n$input.all().forEach((it, i) => {\n",
    "const W = require('lv-automation').w07;\nconst out = [];\n$input.all().forEach((it, i) => {\n" +
    "  if (W.syntheticSubject(it.json, $env)) return; // a SYNTHETIC_TEST_NUMBERS number: no ops WhatsApp (lib/w07.mjs syntheticSubject)\n"],
  ['Never silent: owner alert (lib w07.neverSilentAlert)',
    "const j = $('Never silent: wait 25 s').item.json;\nreturn { json: { request: L.neverSilentAlert(j) } };",
    "// one owner alert per item; none for a SYNTHETIC_TEST_NUMBERS number (the escalation row above is the record)\nconst out = [];\n" +
    "$input.all().forEach((_, i) => {\n  const request = L.neverSilentAlert($('Never silent: wait 25 s').itemMatching(i).json, $env);\n" +
    "  if (request) out.push({ json: { request }, pairedItem: { item: i } });\n});\nreturn out;",
    'runOnceForAllItems'],
]);
patch('W10.json', [
  ['Rebook failed: owner alert (w07.neverSilentAlert)',
    "const j = $('Decide move (w10.applyReschedule)').item.json;\nreturn { json: { request: W7.neverSilentAlert({ route: 'W10', lead: { id: j.ld.id, first_name: j.ld.first_name } }) } };",
    "// none for a SYNTHETIC_TEST_NUMBERS lead (lib/w07.mjs syntheticSubject)\nconst out = [];\n$input.all().forEach((_, i) => {\n" +
    "  const j = $('Decide move (w10.applyReschedule)').itemMatching(i).json;\n" +
    "  const request = W7.neverSilentAlert({ route: 'W10', lead: { id: j.ld.id, first_name: j.ld.first_name, phone: j.ld.phone } }, $env);\n" +
    "  if (request) out.push({ json: { request }, pairedItem: { item: i } });\n});\nreturn out;",
    'runOnceForAllItems'],
]);
