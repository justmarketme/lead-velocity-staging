// Admin drafting helper (contract / invoice / proposal tools) is hidden while gemini-proxy is not deployed.
// Smoke test 21 Oct 2026 #51: OPTIONS /functions/v1/gemini-proxy → 404, so every prompt ended in an error toast.
// Run: node --test src/utils/legalAI.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('legalAI exposes an off-by-default flag and refuses to call the proxy when off', async () => {
  const src = await read('./legalAI.ts');
  assert.match(src, /export const LEGAL_AI_ENABLED: boolean = env\.VITE_LEGAL_AI_ENABLED === "true";/);
  const fn = src.slice(src.indexOf('export async function callLegalAI'));
  assert.ok(fn.indexOf('if (!LEGAL_AI_ENABLED)') > -1 && fn.indexOf('if (!LEGAL_AI_ENABLED)') < fn.indexOf("functions.invoke('gemini-proxy'"),
    'callLegalAI must bail out before invoking gemini-proxy when the flag is off');
});

for (const name of ['ContractGenerator', 'InvoiceGenerator', 'ProposalGenerator']) {
  test(`${name}: the AI assistant card only renders behind LEGAL_AI_ENABLED`, async () => {
    const tsx = await read(`../components/dashboard/${name}.tsx`);
    assert.match(tsx, /import \{ callLegalAI, LEGAL_AI_ENABLED \} from "@\/utils\/legalAI";/);
    const input = tsx.indexOf('value={aiInput}');
    assert.ok(input > 0, 'assistant input present');
    const gate = tsx.lastIndexOf('{LEGAL_AI_ENABLED && (', input);
    assert.ok(gate > 0, 'assistant card wrapped in {LEGAL_AI_ENABLED && (');
    const card = tsx.indexOf('<Card', gate);
    assert.ok(card > gate && tsx.slice(gate, card).trim().length < 120, 'gate sits directly before the assistant card');
  });
}
