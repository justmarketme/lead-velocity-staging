// automation/patch-w07-elevenlabs-only.mjs - Lindi on WhatsApp runs ONLY on ElevenLabs (Jono, 19 Oct 2026).
// Lindi on WhatsApp = ElevenLabs agent 'Lindi SortMyCover on WhatsApp' via smc-lindi-chat; there is no Anthropic API in
// this system. Every model call in W07 goes to $env.LINDI_BRAIN_URL (the smc-lindi-chat function URL, no fallback) with
// x-api-key = $env.LINDI_RELAY_TOKEN. No LINDI_BRAIN_URL = no call: the labels request sets brain_ok (lib w07.brainSet,
// patch-w07-lindi-turn.mjs) and "Lindi brain set? (LINDI_BRAIN_URL)" (patch-w07-never-silent.mjs) sends the turn to the
// never-silent guard (holding line + escalation + owner alert). The labels call is the only way into the reply / guardrail
// calls, so that one gate covers all four (automation/tests/no-anthropic.test.mjs proves it on the graph).
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Full W07 patch order (each idempotent): patch-w07-elevenlabs-only.mjs, patch-w07-lindi-turn.mjs, patch-w07-faq-fill.mjs,
//   patch-w07-start-page.mjs, patch-w07-never-silent.mjs, patch-w07-never-silent-alert.mjs (node automation/<name>)
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);

const RENAME = {
  'Build intent-slot request (Haiku)': 'Build labels request (ElevenLabs)',
  'Intent-slot LLM': 'Lindi labels (ElevenLabs)',
  'Build reply request (Haiku)': 'Build Lindi request (ElevenLabs)',
  'Reply LLM': 'Lindi (ElevenLabs)',
  'Guardrail classifier LLM (fails closed)': 'Guardrail check (ElevenLabs, fails closed)',
  'Guardrail re-check LLM (Sonnet, I-39h)': 'Guardrail re-check (ElevenLabs)',
};
const RELAY = ['Lindi labels (ElevenLabs)', 'Lindi (ElevenLabs)', 'Guardrail check (ElevenLabs, fails closed)', 'Guardrail re-check (ElevenLabs)'];

// 1. rename the nodes and every reference to them (connections, $('...') in code and expressions)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [from, to] of Object.entries(RENAME)) {
  for (const n of wf.nodes) if (n.name === from) n.name = to;
  if (wf.connections[from]) { wf.connections[to] = wf.connections[from]; delete wf.connections[from]; }
  for (const src of Object.values(wf.connections)) for (const outs of src.main || []) for (const t of outs || []) if (t.node === from) t.node = to;
  const ref = new RegExp(`\\$\\((['"\`])${esc(from)}\\1\\)`, 'g');
  for (const n of wf.nodes) {
    const p = JSON.stringify(n.parameters);
    const q = p.replace(ref, (_m, quote) => `$(${quote}${to}${quote})`);
    if (q !== p) n.parameters = JSON.parse(q);
  }
}
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

// 2. the four relay calls: one URL, one token, no version header, no fallback
for (const name of RELAY) {
  const p = node(name).parameters;
  p.url = '={{ $env.LINDI_BRAIN_URL }}';
  p.headerParameters = { parameters: [{ name: 'x-api-key', value: '={{ $env.LINDI_RELAY_TOKEN }}' }, { name: 'content-type', value: 'application/json' }] };
  delete p.authentication; delete p.genericAuthType; delete node(name).credentials;
}

// 3. model fields: the relay ignores them; L.LINDI_MODEL labels the logs. No ANTHROPIC_MODEL_* reads.
for (const n of wf.nodes) {
  if (typeof n.parameters.jsCode !== 'string') continue;
  n.parameters.jsCode = n.parameters.jsCode
    .replace(/\$env\.ANTHROPIC_MODEL_(FAST|STRONG) \|\| (?:'claude-[a-z0-9.-]+'|undefined)/g, 'L.LINDI_MODEL')
    .replace("// first (Haiku) verdict", '// first verdict')
    .replace('// I-39h: Sonnet re-check ran on this item; $json is its response (neverError: no text = block)', '// I-39h: the re-check ran on this item; $json is its response (neverError: no text = block)')
    .replace('// I-39h: only a pass with confidence < 0.8 goes to Sonnet (ANTHROPIC_MODEL_STRONG); a block is never appealed', '// I-39h: only a pass with confidence < 0.8 is re-checked (same relay); a block is never appealed');
}

// 4. the read-me sticky: ElevenLabs only
const sticky = node('Sticky: read me');
sticky.parameters.content = sticky.parameters.content
  .replace('-> intent-slot LLM (Haiku, prompts/intent-slot.md) ->', '-> Lindi labels + reply (ElevenLabs via smc-lindi-chat, prompts/lindi-turn.md) ->')
  .replace('-> reply LLM only for actions that need words (prompts/reply.md) ->', '-> Lindi reply call only for actions that need words (prompts/reply.md) ->')
  .replace('Fails closed: classifier error/timeout = block', 'Fails closed: LINDI_BRAIN_URL unset = no model call, the never-silent guard sends a holding line and alerts Jono; guardrail error/timeout = block')
  .replace('ANTHROPIC_API_KEY, ANTHROPIC_MODEL_FAST, ANTHROPIC_MODEL_STRONG,', 'LINDI_BRAIN_URL, LINDI_RELAY_TOKEN,');
if (!sticky.parameters.content.includes('Lindi on WhatsApp = ElevenLabs')) {
  sticky.parameters.content += "\nLindi on WhatsApp = ElevenLabs agent 'Lindi SortMyCover on WhatsApp' via smc-lindi-chat ($env.LINDI_BRAIN_URL, x-api-key $env.LINDI_RELAY_TOKEN, no fallback); there is no Anthropic API in this system.";
}

const out = JSON.stringify(wf, null, /^\{\n( +)"/.exec(raw)?.[1].length || 2) + '\n';
for (const bad of [/api\.anthropic\.com/, /ANTHROPIC_/, /anthropic-version/i, /claude-(haiku|sonnet|opus)/, /Haiku|Sonnet/]) {
  if (bad.test(out)) throw new Error(`W07.json still matches ${bad}`);
}
writeFileSync(FILE, out);
console.log('W07.json: ElevenLabs only (LINDI_BRAIN_URL + LINDI_RELAY_TOKEN, no fallback), nodes renamed, fails closed to never-silent');
