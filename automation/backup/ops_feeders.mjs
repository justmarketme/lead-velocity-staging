#!/usr/bin/env node
// ops_feeders.mjs: page feeders for ops.page_day and ops.page_audits (I-22). Zero dependencies.
// Input: Lighthouse JSON reports (`*.report.json`, written by landing/lighthouse.sh on the laptop/CI and copied to
// OPS_PAGE_REPORT_DIR on the VPS), plus the built page in landing/dist for the public page copy (W33 judges it).
// Output: SQL on stdout, piped into psql as n8n_app by pg_dump_nightly.sh step 5 (or by hand pre-VPS):
//   node automation/backup/ops_feeders.mjs pages landing/reports --dist landing/dist | psql "$OPS_FEEDER_DB_URL"
// Env (names only): OPS_PAGE_BRAND_CODE (default SMC), OPS_BUILD_SHA (default: none).
// Honesty rules: page_day gets lcp_p75_s from a LAB run (source 'lighthouse_ci'); visits/quiz_* are NOT invented: a
// new row gets visits 0 (column is NOT NULL) and an existing row keeps its visits/quiz values (no web-analytics source yet).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Physical column names (deliverables/platform-architect/schema.md, migration 06). The test checks these against the DDL.
export const PAGE_DAY_COLS = ['day', 'brand_id', 'page_path', 'visits', 'quiz_starts', 'quiz_steps', 'lcp_p75_s', 'source'];
export const PAGE_AUDIT_COLS = ['audited_at', 'url', 'build_sha', 'axe', 'lighthouse', 'page_text'];
export const INFRA_DAY_COLS = ['day', 'monitor', 'uptime_pct', 'down_minutes', 'source'];

const SAST_MS = 2 * 3600e3; // Africa/Johannesburg, no DST
export const sastDate = (iso) => new Date(Date.parse(iso) + SAST_MS).toISOString().slice(0, 10);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const score = (c) => (c && typeof c.score === 'number' ? Math.round(c.score * 100) : null);

/** Public page copy from a built HTML file: visible text only, whitespace collapsed, capped. */
export function pageText(html, max = 20000) {
  if (!html) return null;
  const t = String(html)
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Lighthouse accessibility audits are axe-core rules: keep the failing ones as an axe-shaped summary. */
function axeSummary(lhr) {
  const refs = (lhr.categories && lhr.categories.accessibility && lhr.categories.accessibility.auditRefs) || [];
  const violations = [];
  for (const r of refs) {
    const a = lhr.audits && lhr.audits[r.id];
    if (!a || a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual' || a.scoreDisplayMode === 'informative') continue;
    if (typeof a.score === 'number' && a.score < 1) {
      violations.push({ id: r.id, impact: r.weight >= 7 ? 'serious' : 'moderate', nodes: (a.details && a.details.items && a.details.items.length) || 0 });
    }
  }
  return { engine: 'lighthouse-axe', violations };
}

export function pageAuditRow(lhr, { buildSha = null, html = null } = {}) {
  const a = lhr.audits || {}, c = lhr.categories || {};
  return {
    audited_at: new Date(lhr.fetchTime || Date.now()).toISOString(),
    url: String(lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || ''),
    build_sha: buildSha || null,
    axe: axeSummary(lhr),
    lighthouse: {
      version: lhr.lighthouseVersion || null, form_factor: (lhr.configSettings && lhr.configSettings.formFactor) || null,
      performance: score(c.performance), accessibility: score(c.accessibility),
      best_practices: score(c['best-practices']), seo: score(c.seo),
      lcp_ms: num(a['largest-contentful-paint'] && a['largest-contentful-paint'].numericValue),
      cls: num(a['cumulative-layout-shift'] && a['cumulative-layout-shift'].numericValue),
      tbt_ms: num(a['total-blocking-time'] && a['total-blocking-time'].numericValue),
    },
    page_text: pageText(html),
  };
}

export function pageDayRow(lhr, { brandId = null } = {}) {
  const url = String(lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || '');
  let path = '/';
  try { path = new URL(url).pathname || '/'; } catch { /* keep '/' */ }
  const lcp = num(lhr.audits && lhr.audits['largest-contentful-paint'] && lhr.audits['largest-contentful-paint'].numericValue);
  return {
    day: sastDate(lhr.fetchTime || new Date().toISOString()),
    brand_id: brandId, page_path: path, visits: 0, quiz_starts: null, quiz_steps: null,
    lcp_p75_s: lcp === null ? null : Math.round(lcp) / 1000,
    source: 'lighthouse_ci',
  };
}

// ---- SQL rendering (literals only; every string is quoted, jsonb is cast, nothing is concatenated raw)
export const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
};
const BRAND = (code) => `(SELECT id FROM public.brands WHERE code = ${lit(code)})`;

export function pageDaySql(row, brandCode) {
  const vals = PAGE_DAY_COLS.map((k) => (k === 'brand_id' && row.brand_id === null && brandCode ? BRAND(brandCode) : lit(row[k])));
  return `INSERT INTO ops.page_day (${PAGE_DAY_COLS.join(', ')}) VALUES (${vals.join(', ')})\n` +
    `ON CONFLICT (day, brand_id, page_path) DO UPDATE SET lcp_p75_s = EXCLUDED.lcp_p75_s,\n` +
    `  source = CASE WHEN ops.page_day.source IS NULL THEN EXCLUDED.source\n` +
    `                WHEN ops.page_day.source LIKE '%lighthouse_ci%' THEN ops.page_day.source ELSE ops.page_day.source || '+lighthouse_ci' END;`;
}

export function pageAuditSql(row) {
  return `INSERT INTO ops.page_audits (${PAGE_AUDIT_COLS.join(', ')})\nSELECT ${PAGE_AUDIT_COLS.map((k) => lit(row[k]) + (k === 'audited_at' ? '::timestamptz' : '')).join(', ')}\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM ops.page_audits p WHERE p.url = ${lit(row.url)} AND p.audited_at = ${lit(row.audited_at)}::timestamptz);`;
}

/** Read every *.report.json in dir; returns SQL text (one transaction). */
export function pagesSql(dir, { distDir = null, brandCode = 'SMC', buildSha = null } = {}) {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.report.json')).sort() : [];
  const out = ['BEGIN;'];
  for (const f of files) {
    const lhr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (lhr.runtimeError) continue; // failed run: nothing trustworthy to record
    let html = null;
    if (distDir) {
      let p = '/';
      try { p = new URL(lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl).pathname; } catch {}
      const cand = join(distDir, p.replace(/\.\.+/g, ''), p.endsWith('.html') ? '' : 'index.html');
      if (existsSync(cand)) html = readFileSync(cand, 'utf8');
    }
    out.push(pageDaySql(pageDayRow(lhr), brandCode), pageAuditSql(pageAuditRow(lhr, { buildSha, html })));
  }
  out.push('COMMIT;');
  return { files, sql: out.join('\n') + '\n' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, dir] = process.argv.slice(2);
  const di = process.argv.indexOf('--dist');
  if (cmd !== 'pages' || !dir) { console.error('usage: ops_feeders.mjs pages <report-dir> [--dist <landing/dist>]'); process.exit(2); }
  const { files, sql } = pagesSql(dir, { distDir: di > 0 ? process.argv[di + 1] : null,
    brandCode: process.env.OPS_PAGE_BRAND_CODE || 'SMC', buildSha: process.env.OPS_BUILD_SHA || null });
  process.stdout.write(sql);
  console.error(`ops_feeders: ${files.length} report(s)`);
}
