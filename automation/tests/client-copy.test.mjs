// What a SortMyCover client hears or reads from Lindi says "SortMyCover's automated assistant": never "virtual assistant", never
// "AI assistant" (Jono, 17-18 Oct 2026; the synced phone agent's first message said "virtual assistant"). Covers the phone
// persona (first message, callback opener, consent asks, prompt), the WhatsApp fixed lines, W03's greetings and the W07
// fallbacks. Code comments are stripped first: a comment may name the banned words to explain the rule.
// The site has the same rule in sites/sortmycover/tests/dist.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from '../../conversation/lines.mjs';
import * as W7 from '../lib/w07.mjs';

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
