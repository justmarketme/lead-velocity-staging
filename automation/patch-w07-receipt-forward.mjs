// automation/patch-w07-receipt-forward.mjs - W07 "Status receipt": a delivery receipt only moves communications.status
// forward (smoke test 21 Oct 2026, #18: out-of-order Twilio receipts overwrote 'failed' with 'sent' and 'read' with
// 'delivered'). The guard is generated from lib/w07.mjs RECEIPT_FROM (receiptGuardSql), so the SQL and the tested rule are
// one table. A receipt that would move a row backwards updates nothing, so it stamps no lead and reaches W06 as no card.
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run: node automation/patch-w07-receipt-forward.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { receiptGuardSql } from './lib/w07.mjs';

const F = new URL('./W07.json', import.meta.url);
const raw = readFileSync(F, 'utf8');
const w = JSON.parse(raw);
const NAME = 'Status receipt -> communications + disclosure evidence';
const n = w.nodes.find((x) => x.name === NAME);
if (!n) throw new Error(`W07 has no node "${NAME}"`);
const WHERE = "   WHERE channel = 'whatsapp' AND external_id = $1 AND brand_id IS NOT NULL";
const q0 = n.parameters.query;
if (!q0.includes(WHERE)) throw new Error('Status receipt: WHERE line not found');
// drop a guard written by an earlier run, then write the current one on its own line under the WHERE
const lines = q0.split('\n').filter((l) => !/^\s+AND CASE \$2 WHEN 'sent' THEN coalesce\(status, 'pending'\)/.test(l));
const i = lines.indexOf(WHERE);
lines.splice(i + 1, 0, `     ${receiptGuardSql('$2')} -- forward only (#18)`);
const q1 = lines.join('\n');
const changed = q1 !== q0;
if (changed) { n.parameters.query = q1; writeFileSync(F, JSON.stringify(w, null, 2) + (raw.endsWith('\n') ? '\n' : '')); }
console.log('patch-w07-receipt-forward:', changed ? 'changed' : 'already');
