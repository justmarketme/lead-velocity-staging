// No Anthropic API anywhere (Jono, 19 Oct 2026): Lindi on WhatsApp = ElevenLabs agent 'Lindi SortMyCover on WhatsApp' via
// smc-lindi-chat; there is no Anthropic API in this system, so nothing can ever fall back to it.
//  1. No workflow JSON, automation / optimisation / conversation / evals / scripts code (comments stripped, tests excluded)
//     or Supabase edge function carries an Anthropic host, key, base URL, model variable, version header or model id.
//     Markdown is not scanned (docs may tell the history).
//  2. W07's Lindi calls use exactly $env.LINDI_BRAIN_URL + $env.LINDI_RELAY_TOKEN; with LINDI_BRAIN_URL unset the real Code
//     and IF nodes send the turn to the never-silent guard (holding line + owner alert) and no relay node can run.
//  3. Every other LLM call uses exactly $env.LLM_RELAY_URL + $env.LLM_RELAY_TOKEN and is reachable only through its
//     "LLM relay set?" guard; unset = the failed-call path.
// Run: node --test automation/tests/no-anthropic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCode, ifBranch } from './_n8ncode.mjs';
import { stripComments, walk, isTest, relPath } from './_scan.mjs';
import * as W7 from '../lib/w07.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => relPath(ROOT, p);

const BANNED = [
  [/api\.anthropic\.com/i, 'api.anthropic.com'],
  [/ANTHROPIC_API_KEY/, 'ANTHROPIC_API_KEY'],
  [/ANTHROPIC_BASE_URL/, 'ANTHROPIC_BASE_URL'],
  [/ANTHROPIC_MODEL/, 'ANTHROPIC_MODEL'],
  [/anthropic-version/i, 'anthropic-version'],
  [/claude-(haiku|sonnet|opus)/i, 'claude model id'],
];
// Exempt on purpose, with the reason. Nothing else.
const EXEMPT = new Map([
  // the 19 Oct 2026 migration patches match the old strings in order to REMOVE them; they make no call and assert none is left
  ['automation/patch-w07-elevenlabs-only.mjs', 'migration: matches the old strings to remove them'],
  ['automation/patch-llm-relay.mjs', 'migration: matches the old strings to remove them'],
  // Lead Velocity (non-SortMyCover) functions that call Anthropic directly would be listed here; none does today.
]);

const JSON_FILES = walk(ROOT, join(ROOT, 'automation'), (r) => r.endsWith('.json') && !isTest(r) && !r.endsWith('package.json') && !r.endsWith('package-lock.json'));
const CODE_FILES = ['automation', 'optimisation', 'conversation', 'evals', 'scripts', 'community']
  .flatMap((d) => walk(ROOT, join(ROOT, d), (r) => /\.(mjs|js|cjs)$/.test(r) && !isTest(r)));
const FN_FILES = walk(ROOT, join(ROOT, 'supabase', 'functions'), (r) => r.endsWith('.ts') && !isTest(r));

test('the comment stripper keeps strings and regexes and drops comments', () => {
  assert.equal(stripComments("const u = 'https://x.y/z'; // gone\n/* gone */ const r = /a\\/\\/b/; const t = `//kept`;"), "const u = 'https://x.y/z'; \n const r = /a\\/\\/b/; const t = `//kept`;");
});

test('no Anthropic host, key, base URL, model variable, version header or model id in any workflow, lib or edge function', () => {
  assert.ok(JSON_FILES.length > 40 && CODE_FILES.length > 40 && FN_FILES.length > 20, 'scan found the trees');
  const hits = [];
  const scan = (p, text) => { for (const [re, what] of BANNED) { const m = re.exec(text); if (m) hits.push(`${rel(p)}: ${what} ("${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}")`); } };
  for (const p of JSON_FILES) scan(p, readFileSync(p, 'utf8'));
  for (const p of [...CODE_FILES, ...FN_FILES]) if (!EXEMPT.has(rel(p))) scan(p, stripComments(readFileSync(p, 'utf8')));
  assert.deepEqual(hits, []);
});

test('the exemptions are only the two migration patches, and they make no HTTP call', () => {
  for (const f of EXEMPT.keys()) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    assert.doesNotMatch(src, /\bfetch\(|https?\.request\(|axios|node:https|node:http\b/, f);
  }
});

const WF = (f) => JSON.parse(readFileSync(join(ROOT, 'automation', `${f}.json`), 'utf8'));
const W07 = WF('W07');
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n; };
const LINDI = ['Lindi labels (ElevenLabs)', 'Lindi (ElevenLabs)', 'Guardrail check (ElevenLabs, fails closed)', 'Guardrail re-check (ElevenLabs)'];
const BUILD = 'Build labels request (ElevenLabs)', GUARD = 'Lindi brain set? (LINDI_BRAIN_URL)', WAIT = 'Never silent: wait 25 s';
const header = (n, k) => (n.parameters.headerParameters.parameters.find((h) => h.name === k) || {}).value;

test("W07's Lindi nodes use exactly $env.LINDI_BRAIN_URL and $env.LINDI_RELAY_TOKEN, no credential, no version header", () => {
  const http = W07.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && /LINDI_BRAIN_URL|\/messages|llm/i.test(n.parameters.url || ''));
  assert.deepEqual(http.map((n) => n.name).sort(), [...LINDI].sort());
  for (const name of LINDI) {
    const n = node(W07, name);
    assert.equal(n.parameters.url, '={{ $env.LINDI_BRAIN_URL }}', name);
    assert.equal(header(n, 'x-api-key'), '={{ $env.LINDI_RELAY_TOKEN }}', name);
    assert.deepEqual(n.parameters.headerParameters.parameters.map((h) => h.name), ['x-api-key', 'content-type'], name);
    assert.equal(n.credentials, undefined, name);
    assert.equal(n.parameters.authentication, undefined, name);
  }
  assert.ok(!W07.nodes.some((n) => /Haiku|Sonnet|Anthropic/.test(n.name)), 'no model-family node names');
});

// parents map + reachability: with the guard's true output cut, nothing can reach a relay node
const reach = (wf, cut) => {
  const seen = new Set(), incoming = new Set();
  for (const c of Object.values(wf.connections)) for (const o of c.main || []) for (const t of o || []) incoming.add(t.node);
  const q = wf.nodes.filter((n) => !incoming.has(n.name)).map((n) => n.name);
  while (q.length) {
    const a = q.shift(); if (seen.has(a)) continue; seen.add(a);
    ((wf.connections[a] || {}).main || []).forEach((o, i) => { if (cut(a, i)) return; for (const t of o || []) q.push(t.node); });
  }
  return seen;
};

test('W07 with LINDI_BRAIN_URL unset: no model call; the never-silent guard sends the holding line and alerts Jono', async () => {
  assert.deepEqual(W07.connections[BUILD].main[0].map((t) => t.node), [GUARD]);
  assert.deepEqual(W07.connections[GUARD].main[0].map((t) => t.node), ['Lindi labels (ElevenLabs)']);
  assert.deepEqual(W07.connections[GUARD].main[1].map((t) => t.node), [WAIT]);
  const seen = reach(W07, (a, i) => a === GUARD && i === 0);
  for (const n of LINDI) assert.ok(!seen.has(n), `${n} is reachable without the guard`);
  assert.ok(seen.has(WAIT));

  const j = { msg: { from: '+27600000123', wamid: 'wamid.T1', text: 'what does the call cost?', at_ms: Date.now() }, lead: { id: '00000000-0000-4000-8000-000000000001', first_name: 'Thandi', language: 'en', conv_state: { state: 'unbooked' } },
    broker: { contact_person: 'Mark Smith' }, adviser_first: 'Mark', pre: { lead_used_emoji: false }, text_llm: 'what does the call cost?', route: 'chat', brand_id: '' };
  const refs = { 'Media only? (never sent to a model)': j };
  const off = await runCode(W07, BUILD, { json: { turns: [] }, env: {}, refs });
  assert.equal(off.json.brain_ok, false);
  assert.equal(off.json.route, W7.BRAIN_UNSET_ROUTE);
  assert.equal(ifBranch(W07, GUARD, { json: off.json }), false, 'unset -> false branch -> never silent');
  const send = W7.neverSilentSend(off.json);
  assert.match(send.wa.text.body, /^Thanks, Thandi! I'm Lindi from SortMyCover\. I've got your message, and a person from our team will message you here shortly\.$/);
  assert.equal(send.to, j.msg.from);
  const alert = W7.neverSilentAlert(off.json);
  assert.match(alert.message, /LINDI_BRAIN_URL is not set/);
  assert.doesNotMatch(alert.message, /\+27|what does the call cost/, 'never the number or the message');
  const blank = await runCode(W07, BUILD, { json: { turns: [] }, env: { LINDI_BRAIN_URL: '   ' }, refs });
  assert.equal(ifBranch(W07, GUARD, { json: blank.json }), false, 'blank counts as unset');

  const on = await runCode(W07, BUILD, { json: { turns: [] }, env: { LINDI_BRAIN_URL: 'https://example.test/functions/v1/smc-lindi-chat' }, refs });
  assert.equal(on.json.brain_ok, true);
  assert.equal(on.json.route, 'chat', 'route untouched when the brain is set');
  assert.equal(on.json.intent_body.model, W7.LINDI_MODEL);
  assert.equal(ifBranch(W07, GUARD, { json: on.json }), true);
});

test('W07 existing fail-closed paths: a failed guardrail call blocks, a failed reply call gives the fixed fallback', () => {
  assert.equal(W7.parseVerdict('').verdict, 'block');
  assert.equal(W7.resolveRecheck({ verdict: 'pass', confidence: 0.5 }, '').verdict, 'block');
  const assemble = node(W07, 'Assemble (verdict + toneCheck + fallbacks)').parameters.jsCode;
  assert.match(assemble, /L\.gateAndAssemble\(/);
  assert.match(assemble, /model: out\.used === 'llm' \? \(?L\.LINDI_MODEL\)? : null/);
  for (const n of ['Guardrail check (ElevenLabs, fails closed)', 'Guardrail re-check (ElevenLabs)', 'Lindi (ElevenLabs)', 'Lindi labels (ElevenLabs)']) {
    assert.equal(node(W07, n).parameters.options.response.response.neverError, true, n);
  }
});

const RELAY_WF = ['W11', 'W23', 'W29', 'W30', 'W31', 'W32', 'W33'];
test('W11/W23/W29-W33: every LLM call is $env.LLM_RELAY_URL + $env.LLM_RELAY_TOKEN, reachable only through "LLM relay set?"', () => {
  for (const f of RELAY_WF) {
    const wf = WF(f);
    const calls = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && /LLM_RELAY_URL/.test(n.parameters.url || ''));
    assert.ok(calls.length > 0, f);
    assert.ok(!wf.nodes.some((n) => /LINDI_BRAIN_URL/.test(JSON.stringify(n.parameters))), `${f} never uses Lindi's brain`);
    assert.ok(!wf.nodes.some((n) => /\b(Haiku|Sonnet)\b|^Anthropic /.test(n.name)), `${f}: no model-family node names`);
    for (const n of calls) {
      const g = `LLM relay set? (${n.name})`;
      assert.equal(n.parameters.url, '={{ $env.LLM_RELAY_URL }}', `${f} ${n.name}`);
      assert.equal(header(n, 'x-api-key'), '={{ $env.LLM_RELAY_TOKEN }}', `${f} ${n.name}`);
      assert.equal(n.credentials, undefined, `${f} ${n.name}`);
      assert.equal(n.onError, 'continueRegularOutput', `${f} ${n.name}`);
      const into = Object.entries(wf.connections).filter(([, c]) => (c.main || []).some((o) => (o || []).some((t) => t.node === n.name))).map(([k]) => k);
      assert.deepEqual(into, [g], `${f} ${n.name}: only the guard leads in`);
      assert.deepEqual(wf.connections[g].main[0].map((t) => t.node), [n.name]);
      assert.deepEqual(wf.connections[g].main[1].map((t) => t.node), (wf.connections[n.name].main[0] || []).map((t) => t.node), `${f} ${g}: false = the failed-call path`);
      assert.equal(ifBranch(wf, g, { env: {} }), false, `${f} ${g}: unset`);
      assert.equal(ifBranch(wf, g, { env: { LLM_RELAY_URL: ' ' } }), false, `${f} ${g}: blank`);
      assert.equal(ifBranch(wf, g, { env: { LLM_RELAY_URL: 'https://relay.example.test/v1' } }), true, `${f} ${g}: set`);
    }
  }
});

test('W30 classify retry runs once even when no relay call ran (no loop on an unset LLM_RELAY_URL)', () => {
  const code = node(WF('W30'), 'Parse classification').parameters.jsCode;
  assert.match(code, /\$\('Needs classify retry\?'\)\.isExecuted/);
  assert.match(JSON.stringify(node(WF('W30'), 'Needs classify retry?').parameters), /retry_tried/);
});

test('.env.example: LINDI_BRAIN_URL + LINDI_RELAY_TOKEN + LLM_RELAY_URL/TOKEN, no ANTHROPIC_* line', () => {
  const env = readFileSync(join(ROOT, 'automation', '.env.example'), 'utf8');
  for (const k of ['LINDI_BRAIN_URL', 'LINDI_RELAY_TOKEN', 'LLM_RELAY_URL', 'LLM_RELAY_TOKEN']) assert.match(env, new RegExp(`^${k}=`, 'm'), k);
  assert.doesNotMatch(env, /^ANTHROPIC_/m);
  assert.match(env, /functions\/v1\/smc-lindi-chat/);
});
