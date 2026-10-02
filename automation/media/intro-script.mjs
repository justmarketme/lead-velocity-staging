// I-40i: pure helpers for W23 script-generate / script-recheck. The n8n Code nodes import this file from $env.REPO_DIR (same pattern as W07),
// so the tested code is the running code. Contract: conversation/prompts/intro-script.md. One generator prompt (script-generator.md) and one gate
// (scriptCheck + script-gate.md, user turn fenced by classifierInput) - never a second copy.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptCheck, classifierInput } from '../../conversation/guardrail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const promptBlock = (file) => ((readFileSync(join(ROOT, 'conversation', 'prompts', file), 'utf8').split('```prompt')[1] || '').split('```')[0] || '').trim();
export const ANGLES = [
  { id: 'v1', angle: 'who_i_help', label: 'Who I help' },
  { id: 'v2', angle: 'what_happens', label: 'What happens on the call' },
  { id: 'v3', angle: 'personal', label: 'A bit about me' },
];
export const GATE_VERSION = 'intro-script-v1.0.0';
export const EXAMPLE_TEXT = "Hi, I'm Mark from Mark Williams Financial Planning, FSP 00000. I work with families who've got a bond and people depending on them, and want to know whether the cover they have through work actually matches their life. On our call I'll ask a few questions and tell you plainly where you stand, and there's nothing to buy and no pressure. Thirty minutes is usually all it takes. Looking forward to speaking with you.";
// I-42b: brokers.verified_credentials may hold W20's {type:'fsp', number, register_name, verified_at} entry next to
// admin-set strings. The FSP is already its own fact (facts.fsp), so object entries become a claimable label only if
// they carry one (label/name); never "[object Object]" in a prompt or the gate.
export const credLabels = (list) => (Array.isArray(list) ? list : [])
  .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' && c.type !== 'fsp' && typeof (c.label || c.name) === 'string' ? (c.label || c.name) : null))
  .filter((c) => c && String(c).trim());
const lang = (l) => (['en', 'af'].includes(l) ? l : String(l || 'other').slice(0, 8).replace(/[^a-z-]/gi, '') || 'other');

export function genRequest(broker, answers, angle, language, { model = 'claude-sonnet-5-5' } = {}) {
  const a = (answers && answers.answers) || {};
  const g = (k) => String(a[k] || '').slice(0, 600);
  const creds = credLabels(broker.verified_credentials).length ? credLabels(broker.verified_credentials).join(', ') : 'none';
  const user = [`ADVISER: ${broker.adviser_name}`, `PRACTICE: ${broker.practice_name}`, `FSP: ${broker.fsp_number}`, `BASED IN: ${g('where')}`,
    `LANGUAGE OF THIS TAKE: ${lang(language)}`, `ANGLE: ${angle}`, `VERIFIED CREDENTIALS: ${creds}`, 'INTERVIEW ANSWERS:',
    `1. Who do you help most, and what do they usually come to you worried about? ${g('who')}`,
    `2. What happens in the first 10 minutes of a call with you? ${g('first10')}`,
    `3. What do people say they liked after meeting you? ${g('liked')}`,
    `4. What's a misconception about life cover you keep correcting? ${g('myth')}`,
    `5. What do you not do? ${g('not')}`, `6. Where are you from / where are you based? ${g('where')}`,
    `7. Languages? ${String((answers && answers.languages_spoken) || '').slice(0, 200)}`,
    `8. Years in the industry and why you got into it? ${g('why')}`, '9. One personal detail you are happy to share? (see answer 8)',
    `10. How should someone prepare, or not? ${g('prepare')}`].join('\n');
  return { model, max_tokens: 400, temperature: 0.7, system: promptBlock('script-generator.md'), messages: [{ role: 'user', content: user }] };
}
const textOf = (raw) => { try { const r = typeof raw === 'string' ? JSON.parse(raw) : raw; return String((r && r.content && r.content[0] && r.content[0].text) || ''); } catch { return ''; } };
export function parseGenerated(raw, angle) {
  try {
    const m = /\{[\s\S]*\}/.exec(textOf(raw)); const o = JSON.parse(m[0]);
    const s = (o.scripts || []).find((x) => x.angle === angle) || (o.scripts || [])[0];
    return s && typeof s.text === 'string' ? s.text.trim().slice(0, 1500) : '';
  } catch { return ''; }
}
export function ruleOf(issue) {
  const s = String(issue || ''); let m;
  if ((m = /^FAIS: (\w+)/.exec(s))) return 'FAIS:' + m[1];
  if ((m = /^(I-\d)\b/.exec(s))) return m[1];
  if ((m = /^(rule \d+)\b/i.exec(s))) return m[1].toLowerCase();
  if (/words \(must be/.test(s)) return 'length';
  if (/practice name appears/.test(s)) return 'practice_once';
  if (/FSP number|wrong or missing FSP/.test(s)) return 'fsp_once';
  if (/first person/.test(s)) return 'first_person';
  if (/what the call is not/.test(s)) return 'call_is_not';
  if (/30 minutes/.test(s)) return '30_minutes';
  if (/last sentence|names a day/.test(s)) return 'close';
  if (/^language /.test(s)) return 'review';
  if (/Afrikaans word list/.test(s)) return 'FAIS:af_word_list';
  return 'format';
}
export function detCheck(text, facts, language) {
  if (!String(text || '').trim()) return { pass: false, verdict: 'block', issues: ['no usable output'], rule: 'invalid_output' };
  const r = scriptCheck(text, { practice: facts.practice, fsp: facts.fsp, verified_credentials: credLabels(facts.verified_credentials) }, { lang: lang(language) });
  return { pass: r.pass, verdict: r.verdict, issues: r.issues, rule: r.issues.length ? ruleOf(r.issues[0]) : null };
}
export function gateRequest(text, facts, language, { model = 'claude-haiku-4-5-20251001' } = {}) {
  // user turn fenced by classifierInput() (redactForLLM, triple quotes collapsed, 1,200 chars); only the system prompt differs (script-gate.md)
  const fenced = classifierInput({ draft: text, question: '', lang: lang(language), surface: 'whatsapp' });
  const draft = /DRAFT: """([\s\S]*?)"""\nLANGUAGE:/.exec(fenced);
  const user = `PRACTICE: ${facts.practice}\nFSP: ${facts.fsp}\nVERIFIED CREDENTIALS: ${credLabels(facts.verified_credentials).join(', ') || 'none'}\nLANGUAGE: ${lang(language)}\nSCRIPT: """${draft ? draft[1] : ''}"""`;
  return { model, max_tokens: 250, temperature: 0, system: promptBlock('script-gate.md'), messages: [{ role: 'user', content: user }] };
}
/** Fails closed: anything that is not a clean {verdict:'pass'|'block'} is a block. */
export function parseGate(raw) {
  try {
    const o = JSON.parse((/\{[\s\S]*\}/.exec(textOf(raw)) || [''])[0]);
    if (o.verdict !== 'pass' && o.verdict !== 'block') throw new Error('verdict');
    const confidence = typeof o.confidence === 'number' ? o.confidence : 0;
    const p = (o.problems || [])[0];
    return { valid: true, pass: o.verdict === 'pass' && o.needs_human !== true, confidence, needs_sonnet: o.verdict === 'pass' && confidence < 0.8, rule: p ? 'llm:' + p.rule : null, issues: (o.problems || []).map((x) => `llm rule ${x.rule}: ${String(x.phrase || '').slice(0, 80)}`) };
  } catch { return { valid: false, pass: false, confidence: 0, needs_sonnet: false, rule: 'gate_unavailable', issues: ['gate unavailable'] }; }
}
/** gate = parseGate(haiku); recheck = parseGate(sonnet) when haiku passed below 0.8. A block is final; a Sonnet pass must be >= 0.8 itself. */
export function finalGate(gate, recheck) {
  if (!gate || !gate.valid || !gate.pass) return gate || parseGate('');
  if (gate.needs_sonnet) return recheck && recheck.valid && recheck.pass && !recheck.needs_sonnet ? recheck : (recheck && recheck.valid && !recheck.pass ? recheck : { valid: true, pass: false, rule: 'gate_unavailable', issues: ['low-confidence pass not confirmed'] });
  return gate;
}
export function variant(meta, text, det, gate) {
  const pass = !!(det && det.pass && gate && gate.pass);
  const rule = pass ? null : (det && !det.pass ? det.rule : (gate && gate.rule) || 'gate_unavailable');
  const issues = pass ? [] : (det && !det.pass ? det.issues : (gate && gate.issues) || ['gate unavailable']);
  return { id: meta.id, label: meta.label, angle: meta.angle, text: det && det.rule === 'invalid_output' ? '' : text, gate_pass: pass, rule, issues };
}
export function collectThree(list) {
  const out = ANGLES.map((m) => list.find((v) => v.id === m.id) || { id: m.id, label: m.label, angle: m.angle, text: '', gate_pass: false, rule: 'invalid_output', issues: ['no output'] });
  if (!out.some((v) => v.gate_pass)) out.push({ id: 'example', label: 'Example to adapt', angle: 'example', text: EXAMPLE_TEXT, gate_pass: true, rule: null, issues: [] });
  return out;
}
export function recheckResult(text, facts, language, det, gate) {
  const t = String(text || '');
  if (!t.trim() || t.length > 1500) return { pass: false, rule: 'invalid_input', issues: ['empty or over 1,500 characters'], warnings: [], verdict: 'block' };
  if (det.verdict === 'review') return { pass: false, rule: 'review', issues: det.issues, warnings: [], verdict: 'review' };
  if (!det.pass) return { pass: false, rule: det.rule, issues: det.issues, warnings: [], verdict: 'block' };
  if (!gate || !gate.valid) return { pass: false, rule: 'gate_unavailable', issues: [], warnings: [], verdict: 'block' };
  return gate.pass ? { pass: true, rule: null, issues: [], warnings: [], verdict: 'pass' } : { pass: false, rule: gate.rule || 'llm', issues: gate.issues || [], warnings: [], verdict: 'block' };
}

/** Reference orchestration (same functions as the n8n nodes, used by the tests). llm(kind, body) -> raw Anthropic response (object/string) or null. */
export async function generateAll(broker, answers, language, llm) {
  const facts = { practice: broker.practice_name, fsp: broker.fsp_number, verified_credentials: broker.verified_credentials || [] };
  const gateOf = async (text) => {
    const g = parseGate(await llm('gate', gateRequest(text, facts, language)));
    return g.needs_sonnet ? finalGate(g, parseGate(await llm('gate_sonnet', gateRequest(text, facts, language, { model: 'claude-sonnet-5-5' })))) : g;
  };
  const one = async (meta) => {
    let last;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const text = parseGenerated(await llm('generate', genRequest(broker, answers, meta.angle, language)), meta.angle);
      const det = detCheck(text, facts, language);
      last = variant(meta, text, det, det.pass ? await gateOf(text) : null);
      if (last.gate_pass) break;
    }
    return last;
  };
  return collectThree(await Promise.all(ANGLES.map(one)));
}
export async function recheck(text, broker, language, llm) {
  const facts = { practice: broker.practice_name, fsp: broker.fsp_number, verified_credentials: broker.verified_credentials || [] };
  const det = detCheck(text, facts, language);
  if (!det.pass) return recheckResult(text, facts, language, det, null);
  let g = parseGate(await llm('gate', gateRequest(text, facts, language)));
  if (g.needs_sonnet) g = finalGate(g, parseGate(await llm('gate_sonnet', gateRequest(text, facts, language, { model: 'claude-sonnet-5-5' }))));
  return recheckResult(text, facts, language, det, g);
}

// ---- I-41h: one ops.costs row per LLM-using step (spec step 14 of deliverables/conversation-designer/intro-script-generator.md)
// ASSUMPTION: USD per million tokens (in/out) from docs/MASTER-PROMPT.md section 4A (Anthropic platform docs, 1 Oct 2026) and a fixed
// USD->ZAR rate of 18.00. Neither is read from the API response; replace USD_ZAR with the finance rate when billing-automation publishes one.
// W07 has no cost logger to copy, so this is the single constant for W23.
export const LLM_RATES = { usd_zar: 18.0, usd_per_mtok: { sonnet: { in: 2, out: 10 }, haiku: { in: 1, out: 5 } } };
export function llmCostZar(model, usage) {
  const tier = /haiku/i.test(String(model || '')) ? 'haiku' : 'sonnet'; // unknown model -> the dearer (Sonnet) rate
  const r = LLM_RATES.usd_per_mtok[tier];
  const inT = Math.max(0, Number(usage && usage.input_tokens) || 0), outT = Math.max(0, Number(usage && usage.output_tokens) || 0);
  return Math.round(((inT * r.in + outT * r.out) / 1e6) * LLM_RATES.usd_zar * 100) / 100;
}
/** calls: [{ model, usage }] (null/undefined entries skipped). Returns the ops.costs values for one source_ref. */
export function llmCostRow(calls) {
  const used = (calls || []).filter((c) => c && c.usage);
  return {
    amount_zar: Math.round(used.reduce((s, c) => s + llmCostZar(c.model, c.usage), 0) * 100) / 100,
    note: used.map((c) => `${c.model || 'unknown'} in=${Number(c.usage.input_tokens) || 0} out=${Number(c.usage.output_tokens) || 0}`).join('; ') || 'no usage returned',
  };
}
export const costRef = {
  generate: (broker, req, angle, attempt) => `w23:script-generate:${broker}:${req}:${angle}:${attempt}`,
  recheck: (broker, req) => `w23:script-recheck:${broker}:${req}`,
};
