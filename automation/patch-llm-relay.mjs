// automation/patch-llm-relay.mjs - the non-Lindi LLM jobs leave the Anthropic API for ONE relay (Jono, 19 Oct 2026).
// There is no Anthropic API in this system. W11 (pre-call brief), W23 (intro scripts + picture check), W29 (voice-note
// summary), W30/W31 (FB/IG comment + DM drafts) call $env.LLM_RELAY_URL with x-api-key = $env.LLM_RELAY_TOKEN, no fallback,
// model 'relay-default'. LLM_RELAY_URL unset -> "LLM relay set? (<call>)" skips the call and the item takes the workflow's
// existing failure path (lib/llm-relay.cjs). Lindi (W07) is not on this relay: see patch-w07-elevenlabs-only.mjs.
// W32/W33 get the same from their generator (optimisation/build-workflows.cjs).
// These workflows are maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-llm-relay.mjs   (then node automation/gate-egress.mjs --check)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const R = createRequire(import.meta.url)('./lib/llm-relay.cjs');

const RENAME = {
  W11: { 'Pre-call brief LLM (Sonnet)': 'Pre-call brief LLM (relay)' },
  W23: {
    'AI picture check (Haiku, thumbnail only)': 'AI picture check (relay, thumbnail only)',
    'Generate variant (Sonnet) (1)': 'Generate variant (relay) (1)', 'Generate variant (Sonnet) (2)': 'Generate variant (relay) (2)',
    'Script gate LLM (Haiku, fails closed) (1)': 'Script gate LLM (relay, fails closed) (1)', 'Script gate LLM (Haiku, fails closed) (2)': 'Script gate LLM (relay, fails closed) (2)',
    'Script gate LLM (Haiku, fails closed) (recheck)': 'Script gate LLM (relay, fails closed) (recheck)',
    'Script gate re-check (Sonnet) (1)': 'Script gate re-check (relay) (1)', 'Script gate re-check (Sonnet) (2)': 'Script gate re-check (relay) (2)',
    'Script gate re-check (Sonnet) (recheck)': 'Script gate re-check (relay) (recheck)',
  },
  W29: { 'Summarise voice note (2 lines, Haiku)': 'Summarise voice note (2 lines, relay)' },
  W30: {
    'Classify (Haiku)': 'Classify (relay)', 'Needs Sonnet retry?': 'Needs classify retry?', 'Classify (Sonnet)': 'Classify retry (relay)',
    'Draft (Haiku)': 'Draft (relay)', 'Guardrail gate (Haiku)': 'Guardrail gate (relay)', 'Sonnet redraft?': 'Objection redraft?',
    'Draft (Sonnet)': 'Redraft (relay)', 'Summarise (Haiku)': 'Summarise (relay)',
  },
  W31: { 'Classify (Haiku)': 'Classify (relay)', 'Draft (Haiku)': 'Draft (relay)', 'Guardrail gate (Haiku)': 'Guardrail gate (relay)' },
};
// field names and prose that named a model family
const TEXT = [
  ['needs_sonnet', 'needs_recheck'], ['sonnet_body', 'recheck_body'], ['sonnet_tried', 'retry_tried'], ['retry_sonnet', 'retry_redraft'],
  ['Sonnet writes it;', 'The LLM relay writes it;'],
  ['Haiku classify (Sonnet retry on invalid JSON, then fail closed)', 'relay classify (one retry on invalid JSON, then fail closed)'],
  ['optional Haiku draft + FAIS lint + shared guardrail (Sonnet redraft for objections only)', 'optional relay draft + FAIS lint + shared guardrail (one redraft for objections only)'],
  ['Haiku classify (strict JSON, fail closed to human)', 'relay classify (strict JSON, fail closed to human)'],
  ['FAQ answer (Haiku draft, FAIS lint, shared guardrail)', 'FAQ answer (relay draft, FAIS lint, shared guardrail)'],
  ["`Anthropic API` (httpHeaderAuth, header x-api-key)", '$env.LLM_RELAY_URL + $env.LLM_RELAY_TOKEN (env, no credential)'],
  ["`Anthropic API`", '$env.LLM_RELAY_URL + $env.LLM_RELAY_TOKEN (env, no credential)'],
];
const isRelayCall = (n) => n.type === 'n8n-nodes-base.httpRequest' && /ANTHROPIC_BASE_URL|api\.anthropic\.com|LLM_RELAY_URL/.test(String(n.parameters.url || ''));
const MODEL_EXPR = [
  [/\$env\.ANTHROPIC_MODEL_[A-Z]+ \|\| (?:'claude-[a-z0-9.-]+'|undefined)/g, `'${R.RELAY_MODEL}'`],
  [/\$env\.ANTHROPIC_MODEL_[A-Z]+/g, `'${R.RELAY_MODEL}'`],
  [/'claude-(?:haiku|sonnet|opus)[a-z0-9.-]*'/g, `'${R.RELAY_MODEL}'`],
];

for (const W of Object.keys(RENAME)) {
  const FILE = new URL(`./${W}.json`, import.meta.url);
  const raw = readFileSync(FILE, 'utf8');
  let text = raw;
  // 1. names (whole file: connections, $('...'), cost-node lists, notes) longest first, then field names / prose
  for (const [a, b] of Object.entries(RENAME[W]).sort((x, y) => y[0].length - x[0].length)) text = text.split(a).join(b);
  for (const [a, b] of TEXT) text = text.split(a).join(b);
  const wf = JSON.parse(text);
  // 2. W30: the classify retry runs once, told by "Needs classify retry?" having run (the old check read the model name)
  for (const n of wf.nodes) if (typeof n.parameters.jsCode === 'string') {
    n.parameters.jsCode = n.parameters.jsCode.replace(
      "let sonnet = String(r.model || '').indexOf('sonnet') >= 0;\ntry { if ($('Classify retry (relay)').isExecuted) sonnet = true; } catch (e) {}\nreturn { json: Object.assign({}, pre, { classification: cls, invalid: !cls, retry_tried: sonnet }) };",
      "// one retry: on the second pass \"Needs classify retry?\" has already run (also when LLM_RELAY_URL is unset and no call ran)\nlet retried = false;\ntry { if ($('Needs classify retry?').isExecuted) retried = true; } catch (e) {}\nreturn { json: Object.assign({}, pre, { classification: cls, invalid: !cls, retry_tried: retried }) };");
  }
  // 3. model fields -> 'relay-default' (code, request bodies, expressions)
  const walk = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string') { let s = v; for (const [re, to] of MODEL_EXPR) s = s.replace(re, to); o[k] = s; } else if (v && typeof v === 'object') walk(v); } };
  for (const n of wf.nodes) walk(n.parameters);
  // 4. every relay call: URL + token, no credential, failures continue into the existing path; guard in front
  const calls = wf.nodes.filter(isRelayCall);
  if (!calls.length) throw new Error(`${W}: no LLM call found`);
  for (const n of calls) {
    R.toRelay(n);
    n.onError = 'continueRegularOutput';
    n.parameters.options = { ...(n.parameters.options || {}), response: { response: { neverError: true } } };
    R.guardCall(wf, n.name, `relay-guard-${W.toLowerCase()}-${calls.indexOf(n)}`);
  }
  const out = JSON.stringify(wf, null, /^\{\n( +)"/.exec(raw)?.[1].length || 2) + '\n';
  for (const bad of [/api\.anthropic\.com/, /ANTHROPIC_/, /anthropic-version/i, /claude-(haiku|sonnet|opus)/, /\b(Haiku|Sonnet)\b/]) {
    const m = bad.exec(out);
    if (m) throw new Error(`${W}.json still matches ${bad}: ...${out.slice(Math.max(0, m.index - 80), m.index + 40)}...`);
  }
  writeFileSync(FILE, out);
  console.log(`${W}.json: ${calls.length} LLM call(s) on $env.LLM_RELAY_URL (no fallback), each behind "LLM relay set?"`);
}
