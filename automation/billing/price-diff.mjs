#!/usr/bin/env node
// W25 diff check (3.6, Section 7 "pricing table is the only price source - repo diff clean").
// Scans the repo for typed prices. FAILS (exit 1) when a SortMyCover tier price (from
// pricing.seed.json, so this file types none), a value derived from one (price per committed lead),
// or a legacy B2B tier price appears outside the allowed places. Other rand amounts (budget bands,
// CPL, fees) are listed for review but do not fail.
//   node automation/billing/price-diff.mjs            human report
//   node automation/billing/price-diff.mjs --json     machine report (W25 reads this)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PRICE_DIFF_ROOT || join(here, '..', '..');

const seed = JSON.parse(readFileSync(join(here, 'pricing.seed.json'), 'utf8')).rows;
const TIER_PRICES = new Set(seed.map((r) => Number(r.price_zar)));
const PER_LEAD = new Set(seed.map((r) => Math.round(Number(r.price_zar) / Number(r.committed_leads))));
// Legacy B2B tiers hard-coded in the CRM (crm-gap NH-14). Typed as bare numbers so this file never matches itself.
const LEGACY_PRICES = new Set([6000, 8500, 10500, 16500]);

// Excluded paths, each with the reason printed in the report.
const EXCLUDE = [
  ['.git/', 'version control'],
  ['node_modules/', 'third-party code'],
  ['dist/', 'build output (regenerated from source)'],
  ['docs/', 'master prompt and design references: the source of the decision, not a surface (task brief)'],
  ['build/', 'build state and planning notes (tasks.json, crm-gap, gates), not a surface'],
  ['.claude/', 'agent files copy the master prompt verbatim'],
  ['CLAUDE.md', 'copies master prompt 0.1/0.3 verbatim'],
  ['deliverables/contracts-drafter/term-sheet-mark.md', 'signed one-off document (NH-18 d / NH-CD-16)'],
  ['deliverables/', 'agent working papers (research, memos, wording specs); surfaces inside deliverables are re-included below'],
  ['automation/billing/pricing.seed.json', 'THE pricing seed: the one allowed place'],
  ['automation/billing/price-diff.mjs', 'this checker (its legacy-value list)'],
  ['automation/billing/fixtures/', 'synthetic bank alerts/statements: amounts are test data, not price claims'],
  ['landing/reports/', 'Lighthouse report snapshots of the rendered pages (machine output; the page sources are checked)'],
  ['evals/', 'golden sets and judge rubrics quote amounts as test inputs'],
  ['brand/node_modules/', 'third-party code'],
  // Legacy B2B Lead Velocity tiers: Jonathan's money decision, not changed or removed here.
  ['src/components/dashboard/ProposalGenerator.tsx', 'legacy B2B tiers: NH-14 pending'],
  ['src/components/dashboard/InvoiceGenerator.tsx', 'legacy B2B tiers: NH-14 pending'],
  ['src/components/dashboard/ContractGenerator.tsx', 'legacy B2B tiers: NH-14 pending'],
  ['supabase/functions/_shared/knowledge.ts', 'legacy B2B tiers: NH-14 pending'],
];
// Surfaces that live under an excluded folder but must be clean.
const REINCLUDE = ['deliverables/contracts-drafter/broker-services-agreement.md'];

const LEGACY_LOCATIONS = [
  'src/components/dashboard/ProposalGenerator.tsx',
  'src/components/dashboard/InvoiceGenerator.tsx',
  'src/components/dashboard/ContractGenerator.tsx',
  'supabase/functions/_shared/knowledge.ts',
];

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json', '.md', '.html', '.htm', '.css', '.sql', '.txt', '.py', '.sh', '.ps1', '.yml', '.yaml', '.svg', '.csv', '.xml', '.toml', '.env', '.example']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json', '.sql', '.py', '.html', '.htm']);
const MAX_BYTES = 2_000_000;

const PRICE_RE = /R\s?\d{1,3}[ ,\u00a0]?\d{3}(?:[.,]\d{2})?(?!\d)/g; // the task's R\s?\d{1,3}[ ,]?\d{3} shape
const SHORT_RE = /R\s?(\d{3})(?![\d,.]\d)/g; // derived per-lead values (3 digits)
const BARE_RE = /(?<![\w.$-])(\d{1,3}(?:[_,]?\d{3})+|\d{4,7})(?![\w.])/g; // bare numbers in code

function excludedReason(rel) {
  if (REINCLUDE.includes(rel)) return null;
  for (const [p, why] of EXCLUDE) if (rel === p || rel.startsWith(p) || rel.includes('/' + p)) return why;
  return null;
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(ROOT, full).split('\\').join('/') + (e.isDirectory() ? '/' : '');
    if (e.isDirectory()) {
      if (excludedReason(rel) && !REINCLUDE.some((r) => r.startsWith(rel))) continue;
      yield* walk(full);
    } else if (e.isFile() && !excludedReason(rel)) yield rel;
  }
}

const toRands = (s) => {
  const digits = s.replace(/^R\s?/, '').replace(/[.,]\d{2}$/, '').replace(/[ ,\u00a0_]/g, '');
  return Number(digits);
};

function scanFile(rel) {
  const ext = extname(rel).toLowerCase();
  if (!TEXT_EXT.has(ext) && !/(^|\/)[^.]+$/.test(rel)) return [];
  const full = join(ROOT, rel);
  if (statSync(full).size > MAX_BYTES) return [];
  const text = readFileSync(full, 'utf8');
  if (text.includes('\u0000')) return [];
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('price-diff:allow')) return;
    for (const m of line.matchAll(PRICE_RE)) {
      const v = toRands(m[0]);
      const kind = TIER_PRICES.has(v) ? 'tier-price' : LEGACY_PRICES.has(v) ? 'legacy-price' : 'amount';
      out.push({ file: rel, line: i + 1, match: m[0].trim(), value: v, kind });
    }
    for (const m of line.matchAll(SHORT_RE)) {
      if (PER_LEAD.has(Number(m[1]))) out.push({ file: rel, line: i + 1, match: m[0].trim(), value: Number(m[1]), kind: 'tier-price-derived' });
    }
    if (CODE_EXT.has(ext)) {
      for (const m of line.matchAll(BARE_RE)) {
        const n = Number(m[1].replace(/[_,]/g, ''));
        const rands = TIER_PRICES.has(n) ? n : TIER_PRICES.has(n / 100) ? n / 100 : null;
        if (rands !== null && !out.some((f) => f.line === i + 1 && f.value === rands)) out.push({ file: rel, line: i + 1, match: m[1], value: rands, kind: 'tier-price' });
        else if (LEGACY_PRICES.has(n) && !out.some((f) => f.line === i + 1 && f.value === n) && /price|tier|package/i.test(line.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40))) out.push({ file: rel, line: i + 1, match: m[1], value: n, kind: 'legacy-price' });
      }
    }
  });
  return out;
}

const FAILING = new Set(['tier-price', 'tier-price-derived', 'legacy-price']);
const findings = [];
let files = 0;
for (const rel of walk(ROOT)) { files++; findings.push(...scanFile(rel)); }
const failing = findings.filter((f) => FAILING.has(f.kind));
const review = findings.filter((f) => !FAILING.has(f.kind));
const byFile = (arr) => arr.reduce((m, f) => ((m[f.file] = (m[f.file] || 0) + 1), m), {});
const failingByFile = byFile(failing);
const legacy = LEGACY_LOCATIONS.map((f) => ({ file: f, failing: failingByFile[f] || 0, status: excludedReason(f) ? 'excluded: NH-14 pending' : failingByFile[f] ? 'still hard-coded' : 'clean' }));

const report = {
  root: ROOT, files_scanned: files, ok: failing.length === 0,
  failing_count: failing.length, failing_files: failingByFile,
  legacy_locations: legacy,
  review_count: review.length, review_files: byFile(review),
  failing, excluded: EXCLUDE.map(([p, why]) => ({ path: p, why })), reincluded: REINCLUDE,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const L = [];
  L.push(`price-diff: scanned ${files} files under ${relative(process.cwd(), ROOT) || '.'}`);
  L.push(report.ok ? 'RESULT: CLEAN - no hard-coded tier price outside the pricing table.' : `RESULT: FAIL - ${failing.length} hard-coded price(s) in ${Object.keys(failingByFile).length} file(s).`);
  L.push('', 'The 7 legacy locations (crm-gap row `pricing`):');
  for (const l of legacy) L.push(`  ${l.status}  ${l.file}${l.failing ? `  (${l.failing})` : ''}`);
  const other = Object.entries(failingByFile).filter(([f]) => !LEGACY_LOCATIONS.includes(f));
  L.push('', `Other files with hard-coded prices (${other.length}):`);
  for (const [f, n] of other) L.push(`  ${f}  (${n})`);
  L.push('', 'Failing lines:');
  for (const f of failing) L.push(`  ${f.file}:${f.line}  ${f.kind}  ${f.match}`);
  L.push('', `Review only (other rand amounts, not failing): ${review.length} in ${Object.keys(report.review_files).length} file(s).`);
  for (const [f, n] of Object.entries(report.review_files)) L.push(`  ${f}  (${n})`);
  L.push('', 'Excluded:');
  for (const [p, why] of EXCLUDE) L.push(`  ${p}  - ${why}`);
  L.push(`Re-included surfaces: ${REINCLUDE.join(', ')}`);
  process.stdout.write(L.join('\n') + '\n');
}
process.exit(report.ok ? 0 : 1);
