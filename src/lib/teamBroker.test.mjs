// Admin "Add broker" insert row (src/lib/teamBroker.ts).
// Run: node --test src/lib/teamBroker.test.mjs   (Node 22.18+/25 imports the .ts helpers directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newBrokerRow, quotaPercent } from './teamBroker.ts';

const FORM = {
  firmName: 'Test Practice', contactPerson: 'Test Adviser', email: 'adviser@example.test',
  tier: 'Bronze', portalType: 'Lead Growth', isLeadLoading: true, leadQuota: 20, tempPassword: 'x',
};

// brokers.Insert keys from the generated types (the live table has no lead_quota / leads_used: 42703).
async function brokerInsertColumns() {
  const src = await readFile(new URL('../integrations/supabase/types.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('      brokers: {'));
  const insert = block.slice(block.indexOf('Insert: {') + 9, block.indexOf('}', block.indexOf('Insert: {')));
  return new Set([...insert.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]));
}

test('Add broker row: only real brokers columns, never lead_quota (#50)', async () => {
  const row = newBrokerRow(FORM, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const cols = await brokerInsertColumns();
  assert.ok(cols.has('firm_name') && cols.has('user_id'), 'parsed the generated brokers Insert type');
  assert.equal('lead_quota' in row, false);
  for (const key of Object.keys(row)) assert.ok(cols.has(key), `${key} is not a brokers column`);
  assert.deepEqual(row, {
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firm_name: 'Test Practice', contact_person: 'Test Adviser',
    email: 'adviser@example.test', tier: 'Bronze', portal_type: 'Lead Growth', is_lead_loading: true, status: 'Active',
  });
});

test('Add broker screen sends the helper row, not an inline object with lead_quota', async () => {
  const tsx = await readFile(new URL('../components/dashboard/TeamManagement.tsx', import.meta.url), 'utf8');
  assert.match(tsx, /\.insert\(newBrokerRow\(/);
  assert.doesNotMatch(tsx, /lead_quota:/);
});

test('quota bar: no quota → 0 % (no NaN), capped at 100', () => {
  assert.equal(quotaPercent(3, undefined), 0);
  assert.equal(quotaPercent(3, 0), 0);
  assert.equal(quotaPercent(undefined, 20), 0);
  assert.equal(quotaPercent(5, 20), 25);
  assert.equal(quotaPercent(30, 20), 100);
});
