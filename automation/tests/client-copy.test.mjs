// What a SortMyCover client hears or reads from Lindi says "SortMyCover's automated assistant": never "virtual assistant", never
// "AI assistant" (Jono, 17-18 Oct 2026; the synced phone agent's first message said "virtual assistant"). Covers the phone
// persona (first message, callback opener, consent asks, prompt), the WhatsApp fixed lines, W03's greetings and the W07
// fallbacks. Code comments are stripped first: a comment may name the banned words to explain the rule.
// The site has the same rule in sites/sortmycover/tests/dist.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from '../../conversation/lines.mjs';
import * as W7 from '../lib/w07.mjs';
import { stripComments, walk, isTest, relPath } from './_scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANNED = /\bvirtual assistant\b|\bAI[- ]assistant\b/i;
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

test('client-facing copy never says "virtual assistant" or "AI assistant"', () => {
  for (const f of ['supabase/functions/_shared/smc_receptionist_persona.ts', 'automation/ctwa/w03.js', 'automation/lib/w07.mjs', 'automation/lib/w39.mjs', 'conversation/lines.mjs']) {
    const m = noComments(readFileSync(join(ROOT, f), 'utf8')).match(BANNED);
    assert.equal(m, null, `${f}: "${m && m[0]}"`);
  }
  const all = JSON.stringify(LINES) + W7.NEVER_SILENT_ROUTES.flatMap((r) => ['en', 'af'].map((lang) => W7.neverSilentText(r, { first_name: 'Thandi', lang }))).join(' ');
  assert.doesNotMatch(all, BANNED);
});

test('the phone agent introduces Lindi as SortMyCover\'s automated assistant', () => {
  const src = readFileSync(join(ROOT, 'supabase/functions/_shared/smc_receptionist_persona.ts'), 'utf8');
  const first = /export const SMC_FIRST_MESSAGE =([\s\S]*?);\n/.exec(src)[1];
  assert.match(first, /Lindi, SortMyCover's automated assistant/);
  const cb = /export function smcCallbackFirstMessage[\s\S]*?\n}/.exec(src)[0];
  assert.match(cb, /SortMyCover's automated assistant/);
});

// Price words, "licensed", the assistant labels and any age stop (18 Oct 2026: every age books and counts), in the
// WhatsApp conversation docs (the source the lines and prompts are written from) and in everything sync-voice-agents pushes
// to ElevenLabs (tool descriptions, data-collection outcomes, audio-tag notes, first message, prompt).
const PRICE = /(?<!["'])(?:\bfree\b(?![- ](?:text|form|entry|standing))|\bno cost\b|\bcosts? (?:you )?nothing\b|\bat no charge\b)(?!["'])/i; // a quoted phrase is the rule itself
const LICENSED = /\blicensed\b/i;
const AGE_STOP = /out[_ ]of[_ ]criteria|under 35 or over 50|(?:under 35|over 50|51 or over)[^.\n]{0,60}(?:close|closed_oob|turn(?:ed)? away|not (?:eligible|able)|only age_band)/i;
const scan = (label, text) => {
  for (const [re, what] of [[BANNED, 'assistant label'], [PRICE, 'price word'], [LICENSED, 'licensed'], [AGE_STOP, 'age stop']]) {
    const m = text.match(re);
    assert.equal(m, null, `${label}: ${what} "${m && m[0]}"`);
  }
};

test('the WhatsApp fixed lines and fallbacks: no price word, no "licensed", no age stop', () => {
  const all = JSON.stringify(LINES) + W7.NEVER_SILENT_ROUTES.flatMap((r) => ['en', 'af'].map((lang) => W7.neverSilentText(r, { first_name: 'Thandi', lang }))).join(' ');
  scan('conversation/lines.mjs + W07 fallbacks', all);
  assert.doesNotMatch(all, /gelisensieer/i);
});

test('conversation docs: no price word, no "licensed", no assistant label, no age stop', () => {
  const dir = join(ROOT, 'conversation');
  const files = readdirSync(dir).filter((x) => x.endsWith('.md'));
  assert.ok(files.length >= 4);
  for (const x of files) scan('conversation/' + x, readFileSync(join(dir, x), 'utf8'));
});

test('the ElevenLabs config (sync-voice-agents) and the phone persona: same rules', () => {
  for (const f of ['supabase/functions/sync-voice-agents/index.ts', 'supabase/functions/_shared/smc_receptionist_persona.ts']) {
    scan(f, noComments(readFileSync(join(ROOT, f), 'utf8')));
  }
});

// "an authorised financial adviser", never "licensed" (19 Oct 2026): the adviser-facing prompts (pre-call brief, intro
// scripts and their gate), every workflow JSON (W30/W31 drafts and gates included) and every automation lib, comments stripped.
test('no "licensed" in conversation/prompts, any workflow JSON or automation code: "authorised" instead', () => {
  const prompts = walk(ROOT, join(ROOT, 'conversation', 'prompts'), (r) => r.endsWith('.md'));
  const json = walk(ROOT, join(ROOT, 'automation'), (r) => r.endsWith('.json') && !isTest(r));
  const code = walk(ROOT, join(ROOT, 'automation'), (r) => /\.(mjs|js|cjs)$/.test(r) && !isTest(r));
  assert.ok(prompts.length >= 8 && json.length > 40 && code.length > 40);
  const hits = [];
  for (const p of [...prompts, ...json]) if (LICENSED.test(readFileSync(p, 'utf8'))) hits.push(relPath(ROOT, p));
  for (const p of code) if (LICENSED.test(stripComments(readFileSync(p, 'utf8')))) hits.push(relPath(ROOT, p));
  assert.deepEqual(hits, []);
  for (const f of ['precall-brief.md', 'script-gate.md', 'script-generator.md']) {
    assert.match(readFileSync(join(ROOT, 'conversation', 'prompts', f), 'utf8'), /an authorised financial adviser/, f);
  }
});
