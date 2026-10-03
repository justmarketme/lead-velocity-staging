// Runs an n8n Code node's jsCode from a workflow JSON in plain Node, the way n8n does (async body, $json, $env, $,
// $input, require), so the tests exercise the code the workflow actually runs. Not a test file (leading underscore).
// Shared by W09/W12/W13 tests. `refs` maps a node name to the json that $('<name>') returns (.item / .first() /
// .itemMatching()). REPO_DIR defaults to this repo, as on the VPS.
// require('lv-automation') (the only repo module a Code node may load, I-46c) resolves to automation/index.cjs, the same
// file n8n's runner reaches through the lv-automation link, so offline runs need no package link.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const LV_INDEX = join(REPO, 'automation', 'index.cjs');
/** The require() a Code node sees: exact name 'lv-automation' -> automation/index.cjs; anything else as usual. */
export const nodeRequire = (id) => (id === 'lv-automation' ? require(LV_INDEX) : require(id));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export const codeNode = (wf, name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n || n.type !== 'n8n-nodes-base.code') throw new Error(`no Code node "${name}"`);
  return n;
};

/** Returns what the node returns: one { json } (per-item mode) or an array of { json } (all-items mode). */
export async function runCode(wf, name, { json = {}, items, env = {}, refs = {} } = {}) {
  const n = codeNode(wf, name);
  const fn = new AsyncFunction('$json', '$env', '$', '$input', 'require', n.parameters.jsCode);
  const $ = (k) => {
    if (!(k in refs)) throw new Error(`$('${k}') not provided to the test`);
    const r = refs[k];
    // .all(): every item of that node (refs value is the json of its single item, as for .item / .first()).
    return { item: { json: r }, first: () => ({ json: r }), itemMatching: () => ({ json: r }), all: () => [{ json: r }] };
  };
  const all = (items || [json]).map((j) => ({ json: j }));
  return fn(json, { REPO_DIR: REPO, ...env }, $, { all: () => all, first: () => all[0] }, nodeRequire);
}

/** Parameter counts a submitted template expects (automation/templates/<name>.json), same shape as wa.mjs paramCounts(). */
import { readFileSync } from 'node:fs';
export function templateCounts(name) {
  const t = JSON.parse(readFileSync(join(REPO, 'automation', 'templates', `${name}.json`), 'utf8'));
  const vars = (s) => new Set([...String(s || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
  const h = t.components.find((c) => c.type === 'HEADER');
  const btns = t.components.find((c) => c.type === 'BUTTONS')?.buttons || [];
  return {
    header: !h ? 0 : h.format === 'TEXT' ? vars(h.text) : 1,
    body: vars(t.components.find((c) => c.type === 'BODY').text),
    quick_reply: btns.filter((b) => b.type === 'QUICK_REPLY').length,
    url: btns.filter((b) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || '')).length
  };
}

/** Every workflow JSON in automation/ (for "only one writer" checks). */
import { readdirSync } from 'node:fs';
export const allWorkflows = () => readdirSync(join(REPO, 'automation')).filter((f) => /^(W\d\d|SUB-[a-z0-9-]+)\.json$/.test(f)).map((f) => ({ file: f, wf: JSON.parse(readFileSync(join(REPO, 'automation', f), 'utf8')) }));
export const PG_CRED = 'LV Supabase - n8n_app (least privilege)';

/**
 * I-46c / I-44b structure rules for a generated workflow, as a list of problems (empty = ok):
 * top-level id first and = expectId; errorWorkflow smc-w22; every Code node's require() is the exact name
 * 'lv-automation' (or a Node builtin in `builtins`), never a subpath / REPO_DIR / dynamic import; every Execute
 * Workflow node mode 'id' with smc-wNN (or smc-<slug>) derived from its cachedResultName.
 */
export function lvViolations(wf, expectId, { builtins = [] } = {}) {
  const out = [];
  if (Object.keys(wf)[0] !== 'id' || wf.id !== expectId) out.push(`top-level id ${wf.id} (first key ${Object.keys(wf)[0]})`);
  if (!wf.settings || wf.settings.errorWorkflow !== 'smc-w22') out.push(`errorWorkflow ${wf.settings && wf.settings.errorWorkflow}`);
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    const js = n.parameters.jsCode;
    for (const m of js.matchAll(/require\('([^']+)'\)/g)) if (m[1] !== 'lv-automation' && !builtins.includes(m[1])) out.push(`${n.name}: require('${m[1]}')`);
    if (/REPO_DIR|await import\(|pathToFileURL|lv-automation\//.test(js)) out.push(`${n.name}: REPO_DIR / import() / subpath`);
  }
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
    const r = n.parameters.workflowId || {};
    const m = /^W(\d\d)\b/.exec(r.cachedResultName || '');
    const want = m ? `smc-w${m[1]}` : `smc-${String(r.cachedResultName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (r.mode !== 'id' || r.value !== want) out.push(`${n.name}: workflowId ${r.mode}/${r.value} (want id/${want})`);
  }
  return out;
}
