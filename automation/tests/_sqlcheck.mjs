// Shared by W07/W08/W10/W11/W29 tests: every column a workflow's SQL names must exist in the repo migrations
// (physical names only, deliverables/platform-architect/schema.md). Parses CREATE TABLE / ALTER TABLE ADD COLUMN /
// generated alias columns from supabase/migrations/*.sql. Checks INSERT column lists, UPDATE SET targets,
// ON CONFLICT targets and every alias.column reference whose alias is bound by FROM/JOIN public.<table> <alias>.
// Not a test file (leading underscore). Node 18+, zero dependencies.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = join(REPO, 'supabase', 'migrations');

export function schemaColumns() {
  const cols = {};
  const add = (t, c) => { (cols[t] ||= new Set()).add(c.replace(/"/g, '').toLowerCase()); };
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:(public|ops)\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\s*\);/gi)) {
      const t = `${m[1] || 'public'}.${m[2]}`.toLowerCase();
      cols[t] ||= new Set();
      for (const line of m[3].split('\n')) {
        const w = line.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i);
        if (w && !/^(primary|unique|check|constraint|foreign|exclude)$/i.test(w[1])) add(t, w[1]);
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:(public|ops)\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      const t = `${m[1] || 'public'}.${m[2]}`.toLowerCase();
      for (const c of m[3].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([a-z_][a-z0-9_]*)"?/gi)) add(t, c[1]);
    }
  }
  return cols;
}

/** All SQL strings in an n8n workflow (Postgres node `query`). */
export function workflowSql(wf) {
  return wf.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres').map((n) => ({ node: n.name, sql: n.parameters.query }));
}

const T = (s) => { const [a, b] = s.toLowerCase().split('.'); return b ? `${a}.${b}` : `public.${a}`; };
function splitTop(s) { const out = []; let d = 0; let cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out; }

/** Returns a list of problems: [{ node, table, column, where }] */
export function checkSql(items, cols = schemaColumns()) {
  const bad = [];
  const need = (node, table, column, where) => {
    if (!cols[table]) bad.push({ node, table, column: '(table missing)', where });
    else if (!cols[table].has(column.toLowerCase())) bad.push({ node, table, column, where });
  };
  for (const { node, sql: raw } of items) {
    const sql = raw.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
    for (const m of sql.matchAll(/INSERT INTO ((?:public|ops)\.\w+)\s*\(([^)]*)\)/gi)) for (const c of m[2].split(',')) need(node, T(m[1]), c.trim(), 'insert');
    for (const m of sql.matchAll(/ON CONFLICT \(([^)]*)\)/gi)) {
      const ins = sql.slice(0, m.index).match(/INSERT INTO ((?:public|ops)\.\w+)/gi);
      if (ins) for (const c of m[1].split(',')) need(node, T(ins[ins.length - 1].split(/\s+/).pop()), c.trim(), 'on conflict');
    }
    for (const m of sql.matchAll(/UPDATE ((?:public|ops)\.\w+)(?:\s+(?:AS\s+)?(\w+))?\s+SET\s+([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bRETURNING\b|$)/gi)) {
      for (const part of splitTop(m[3])) { const c = part.split('=')[0].trim().replace(/^\w+\./, ''); if (c) need(node, T(m[1]), c, 'update set'); }
    }
    const alias = {};
    for (const m of sql.matchAll(/(?:FROM|JOIN|UPDATE)\s+((?:public|ops)\.\w+)\s+(?:AS\s+)?([a-z]\w*)/gi)) {
      if (!/^(where|on|set|join|left|inner|order|group|limit|using|cross|returning)$/i.test(m[2])) alias[m[2]] = T(m[1]);
    }
    for (const m of sql.matchAll(/\b([a-z]\w*)\.([a-z_]\w*)\b/gi)) {
      if (alias[m[1]] && !/^(public|ops|extensions)$/i.test(m[1])) need(node, alias[m[1]], m[2], 'alias ref');
    }
  }
  return bad;
}
