#!/usr/bin/env node
// pubcheck.mjs (I-53h / I-52c): before ANY run, prove the workflow n8n will execute equals the repo.
// Offline and read-only: it never talks to n8n. It compares a stable hash of nodes + connections of every
// automation/W*.json and SUB-*.json against an export of what n8n has published, and lists the Execute Workflow
// targets that must be published (n8n 2.x refuses to call an unpublished sub-workflow).
//
//   node automation/local/pubcheck.mjs --targets            # publish list + which cron triggers that starts (TSV)
//   node automation/local/pubcheck.mjs --plan               # the import + publish commands, in order (prints only)
//   node automation/local/pubcheck.mjs --hashes             # id<TAB>hash for every repo workflow
//   node automation/local/pubcheck.mjs --check published.json [--only-published]
//       published.json = JSON array of {id, nodes, connections} (nodes/connections may be JSON strings), or the
//       same wrapped as {activeVersion:{nodes,connections}}. Produce it from the n8n DB (names only, no credentials):
//         select w.id, h.nodes, h.connections from workflow_entity w
//           join workflow_history h on h."versionId" = w."activeVersionId"     -- ASSUMPTION: n8n 2.41.6 schema;
//         (sqlite: same query, quote-free)                                      -- verify once, then it is stable
//       Exit 0 = every target (and every published workflow) equals the repo; 1 = missing / drift (one line each).
// The hash ignores what n8n rewrites on import (ids on nodes, positions, webhookId, credential ids) and keeps
// everything that changes behaviour (parameters, types, versions, disabled flag, credential name+type, connections).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRON_TYPES = /^n8n-nodes-base\.(scheduleTrigger|cron)$/;

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Stable hash of nodes + connections (sha256 hex, first 16 chars). */
export function stableHash(wf) {
  const src = wf && wf.activeVersion ? wf.activeVersion : wf;
  const nodes = (asObj(src.nodes) || []).map((n) => ({
    name: n.name, type: n.type, typeVersion: n.typeVersion, parameters: n.parameters || {},
    disabled: !!n.disabled, onError: n.onError || null, retryOnFail: !!n.retryOnFail,
    credentials: Object.fromEntries(Object.entries(n.credentials || {}).map(([t, c]) => [t, c && c.name ? c.name : null])),
  })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const body = JSON.stringify(sortKeys({ nodes, connections: asObj(src.connections) || {} }));
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/** Load every repo workflow: Map id -> {file, wf}. */
export function loadRepo(dir = AUTOMATION) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => /^(W\d\d|SUB-[a-z0-9-]+)\.json$/.test(x)).sort()) {
    const wf = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (wf.id) out.set(wf.id, { file: f, wf });
  }
  return out;
}

/** Ids called by any Execute Workflow node (the set n8n 2.x requires to be published). */
export function execTargets(repo) {
  const t = new Set();
  for (const { wf } of repo.values()) for (const n of wf.nodes || []) {
    if (n.type !== 'n8n-nodes-base.executeWorkflow') continue;
    const v = n.parameters && n.parameters.workflowId && n.parameters.workflowId.value;
    if (typeof v === 'string' && repo.has(v)) t.add(v); // expressions (={{ $workflow.id }}) are not static targets
  }
  return [...t].sort();
}

/** Cron triggers that start when a workflow is published: [{id, node, type}]. */
export function cronsStarted(repo, ids) {
  const out = [];
  for (const id of ids) for (const n of repo.get(id).wf.nodes || []) if (CRON_TYPES.test(n.type)) out.push({ id, node: n.name, type: n.type });
  return out;
}

/** Compare repo vs published export. Returns {problems[], ok[]}. */
export function compare(repo, published, { onlyPublished = false } = {}) {
  const pub = new Map((Array.isArray(published) ? published : []).map((p) => [p.id, p]));
  const must = onlyPublished ? [...pub.keys()].filter((id) => repo.has(id)) : execTargets(repo);
  const problems = []; const ok = [];
  for (const id of must) {
    if (!pub.has(id)) { problems.push(`MISSING (not published): ${id} (${repo.get(id).file})`); continue; }
    const a = stableHash(repo.get(id).wf); const b = stableHash(pub.get(id));
    (a === b ? ok : problems).push(a === b ? id : `DRIFT: ${id} (${repo.get(id).file}) repo ${a} != published ${b}: re-import and publish`);
  }
  if (!onlyPublished) for (const id of pub.keys()) {
    if (!repo.has(id) || must.includes(id)) continue;
    const a = stableHash(repo.get(id).wf); const b = stableHash(pub.get(id));
    if (a !== b) problems.push(`DRIFT: ${id} (${repo.get(id).file}) repo ${a} != published ${b}: re-import and publish`);
  }
  return { problems, ok };
}

function main(argv) {
  const repo = loadRepo();
  const targets = execTargets(repo);
  if (argv.includes('--hashes')) { for (const [id, { wf }] of repo) console.log(`${id}\t${stableHash(wf)}`); return 0; }
  if (argv.includes('--targets')) {
    console.log('# publish (Execute Workflow targets), then these cron triggers start with them (keep DRY_RUN_SENDS=true and the fail-closed env on staging):');
    for (const id of targets) console.log(`target\t${id}\t${repo.get(id).file}`);
    for (const c of cronsStarted(repo, targets)) console.log(`cron\t${c.id}\t${c.node}`);
    return 0;
  }
  if (argv.includes('--plan')) {
    console.log('# n8n stopped. Re-import EVERY repo workflow (overwrites older versions), then publish targets, then start n8n, then --check.');
    for (const [id, { file }] of repo) console.log(`n8n import:workflow --input=automation/${file}   # ${id}`);
    for (const id of targets) console.log(`n8n publish:workflow --id=${id}`);
    console.log('n8n start   # CLI changes only take effect after a restart');
    return 0;
  }
  const i = argv.indexOf('--check');
  if (i < 0) { console.error('usage: pubcheck.mjs --targets | --plan | --hashes | --check published.json [--only-published]'); return 2; }
  const { problems, ok } = compare(repo, JSON.parse(readFileSync(argv[i + 1], 'utf8')), { onlyPublished: argv.includes('--only-published') });
  for (const p of problems) console.log(p);
  console.log(`pubcheck: ${ok.length} equal, ${problems.length} problem(s)`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
