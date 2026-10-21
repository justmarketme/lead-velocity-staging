// automation/patch-smoke-c2-sends.mjs - smoke test 21 Oct 2026 (checklist SMOKE-TEST-SMC-2026-10-21.md), send layer:
//  #6 W08 "Send close line": the CLOSE_UNBOOKED line goes past the suppression row "Save tap result" wrote a moment
//     before it (bypass_suppression, the same rule as W15's one STOP confirmation). Only this node; the nudges keep the gate.
//     Review 21 Oct: only when THIS tap wrote the row (suppressed > 0); a second "No thanks" keeps the gate.
//  #7 W07 / W08 "Store outbound": the row's status comes from the send result. A send smc-whatsapp-send refused or that
//     failed (suppressed, not allow-listed, provider error) is 'failed' with the reason and no id; only a DRY_RUN_SENDS
//     stand-in (no send attempted) carries a dry:<...> id. communications_status_check allows pending|sent|delivered|
//     failed|received|read, so never 'skipped'.
// W07.json and W08.json are maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-smoke-c2-sends.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const load = (f) => { const raw = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'); return { raw, wf: JSON.parse(raw) }; };
const save = (f, { raw, wf }) => {
  const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
  const out = JSON.stringify(wf, null, indent) + (raw.endsWith('\n') ? '\n' : '');
  if (out !== raw) { writeFileSync(new URL(`./${f}`, import.meta.url), out); console.log(`${f}: patched`); } else console.log(`${f}: already patched`);
};
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`no node "${name}"`); return n; };
/** Replace `from` with `to` once; already `to` -> no-op; neither -> the JSON drifted, stop. */
function swap(n, key, from, to) {
  const holder = key === 'query' ? n.parameters : key === 'jsCode' ? n.parameters : n.parameters.options;
  const v = holder[key];
  if (v.includes(to)) return;
  if (!v.includes(from)) throw new Error(`"${n.name}" ${key}: expected text not found (the JSON changed; update this patch)`);
  holder[key] = v.replace(from, to);
}

// ---------------------------------------------------------------- W08
const w8 = load('W08.json');
// review 21 Oct: only the tap that wrote the row (Save tap result suppressed > 0) bypasses; a repeat "No thanks" never does
const CLOSE_BYPASS = `record: true, caller: "W08", bypass_suppression: (Number($('Save tap result').item.json.suppressed) > 0) === true,`;
{
  const n = node(w8.wf, 'SUB input (Send close line)');
  for (const from of ['record: true, caller: "W08", bypass_suppression: true,', 'record: true, caller: "W08", bypass_suppression: false,']) {
    if (n.parameters.jsCode.includes(from)) n.parameters.jsCode = n.parameters.jsCode.replace(from, CLOSE_BYPASS);
  }
  if (!n.parameters.jsCode.includes(CLOSE_BYPASS)) throw new Error('"SUB input (Send close line)": expected text not found (the JSON changed; update this patch)');
}
const s8 = node(w8.wf, 'Store outbound');
swap(s8, 'query', "template_name, template_category, metadata)\nVALUES ($1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, $3, 'sent', $4, $5::uuid, $6::uuid, 'system', 'W08', $7, $8, $9::jsonb)",
  "template_name, template_category, metadata, failed_reason)\nVALUES ($1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, $3, $10, NULLIF($4, ''), $5::uuid, $6::uuid, 'system', 'W08', $7, $8, $9::jsonb, NULLIF($11, ''))");
swap(s8, 'queryReplacement',
  "const d = $('Build message (template or session)').item.json; return [d.brand_id, d.phone, d.template, ($json.messages && $json.messages[0] && $json.messages[0].id) || ('dry:' + d.idempotency_key),",
  "const d = $('Build message (template or session)').item.json; const got = ($json.messages && $json.messages[0] && $json.messages[0].id) || ''; const failed = !got && $json.ok === false; return [d.brand_id, d.phone, d.template, got || (failed ? '' : 'dry:' + d.idempotency_key),");
swap(s8, 'queryReplacement', "JSON.stringify({ touch: d.touch, channel: d.channel })]; })() }}",
  "JSON.stringify({ touch: d.touch, channel: d.channel }), failed ? 'failed' : 'sent', failed ? String($json.error || 'send_failed').slice(0, 300) : '']; })() }}");
save('W08.json', w8);

// ---------------------------------------------------------------- W07
const w7 = load('W07.json');
const s7 = node(w7.wf, 'Store outbound');
swap(s7, 'query', "author, workflow, template_category, intent, llm_model, latency_ms, guardrail_trip, guardrail_rule, handoff, metadata)\nVALUES ($1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, $3, 'sent', $4,",
  "author, workflow, template_category, intent, llm_model, latency_ms, guardrail_trip, guardrail_rule, handoff, metadata, failed_reason)\nVALUES ($1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, $3, $13, NULLIF($4, ''),");
swap(s7, 'query', "$10::boolean, $11, $12::boolean, '{}'::jsonb)", "$10::boolean, $11, $12::boolean, '{}'::jsonb, NULLIF($14, ''))");
swap(s7, 'queryReplacement',
  "const s = $('Anything to send?').item.json; return [s.brand_id, s.msg.from, s.text, ($json.messages && $json.messages[0] && $json.messages[0].id) || ('dry:' + s.msg.wamid),",
  "const s = $('Anything to send?').item.json; const got = ($json.messages && $json.messages[0] && $json.messages[0].id) || ''; const failed = !got && $json.ok === false; return [s.brand_id, s.msg.from, s.text, got || (failed ? '' : 'dry:' + s.msg.wamid),");
swap(s7, 'queryReplacement', "!!s.trip, s.rule || null, !!s.handoff]; })() }}",
  "!!s.trip, s.rule || null, !!s.handoff, failed ? 'failed' : 'sent', failed ? String($json.error || 'send_failed').slice(0, 300) : '']; })() }}");
save('W07.json', w7);
