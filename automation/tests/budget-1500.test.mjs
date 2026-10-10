// Budget split R1,250+ -> R1,250-R1,499 / R1,500+. Run: node --test automation/tests/budget-1500.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BUDGET_TO_DB, QUAL_BUDGET, isPriority1500 } from '../lib/w01.mjs';
import { BUDGET_WORDS } from '../lib/w11.mjs';
const W3 = createRequire(import.meta.url)('../ctwa/w03.js');

test('(a) every band from R750 up qualifies, below R750 does not', () => {
  for (const v of ['750_1250', '1250_1499', '1500_plus']) assert.ok(QUAL_BUDGET.has(v), v);
  assert.ok(!QUAL_BUDGET.has('lt750'));
  assert.equal(BUDGET_TO_DB['1250-1499'], '1250_1499'); assert.equal(BUDGET_TO_DB['1500+'], '1500_plus');
});
test('(b) only 1500_plus is the priority tag; it is a tag, never a disqualifier', () => {
  assert.equal(isPriority1500('1500_plus'), true);
  for (const v of ['1250_1499', '1250plus', '750_1250', 'lt750', null]) assert.equal(isPriority1500(v), false, String(v));
  assert.ok(QUAL_BUDGET.has('1500_plus'));
  assert.match(BUDGET_WORDS['1500_plus'], /R1,500\+/);
});
test('(c) legacy 1250plus still qualifies and is labelled before-split', () => {
  assert.ok(QUAL_BUDGET.has('1250plus')); assert.equal(BUDGET_TO_DB['1250_plus'], '1250plus');
  assert.match(BUDGET_WORDS['1250plus'], /before split/);
});
test('CTWA list offers both new answers; W03 qualifies them', () => {
  const rows = JSON.stringify(W3.question('q_budget', { practice_name: 'X', fsp_number: '1', adviser_name: 'A' }));
  assert.match(rows, /budget_1250_1499/); assert.match(rows, /budget_1500_plus/);
});
test('migration is file-only, keeps old value and adds the tag column', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261005150000_smc_15_budget_1500.sql', import.meta.url), 'utf8');
  assert.match(sql, /'1250plus','1250_1499','1500_plus'/); assert.match(sql, /premium_1500/);
});
