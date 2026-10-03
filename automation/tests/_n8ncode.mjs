// Runs an n8n Code node's jsCode from a workflow JSON in plain Node, the way n8n does (async body, $json, $env, $,
// $input, require), so the tests exercise the code the workflow actually runs. Not a test file (leading underscore).
// Shared by W09/W12/W13 tests. `refs` maps a node name to the json that $('<name>') returns (.item / .first() /
// .itemMatching()). REPO_DIR defaults to this repo, as on the VPS.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
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
    return { item: { json: r }, first: () => ({ json: r }), itemMatching: () => ({ json: r }) };
  };
  const all = (items || [json]).map((j) => ({ json: j }));
  return fn(json, { REPO_DIR: REPO, ...env }, $, { all: () => all, first: () => all[0] }, require);
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
export const allWorkflows = () => readdirSync(join(REPO, 'automation')).filter((f) => /^W\d\d\.json$/.test(f)).map((f) => ({ file: f, wf: JSON.parse(readFileSync(join(REPO, 'automation', f), 'utf8')) }));
export const PG_CRED = 'LV Supabase - n8n_app (least privilege)';
