// Shared by no-anthropic.test.mjs and client-copy.test.mjs: a string-aware comment stripper and a repo walker.
// Not a test file (leading underscore).
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Strips // and /* *\/ comments outside strings, template literals and regex-looking spans (best effort, never inside a string). */
export function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length;) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; else if (c !== '`' && src[j] === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/') { // a regex literal after an operator / bracket: copy it whole so "//" or quotes inside it are not misread
      const prev = out.replace(/\s+$/, '').slice(-1);
      if (!prev || '(,=:[!&|?{};+-*%<>~^'.includes(prev)) {
        let j = i + 1, cls = false;
        while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
        if (src[j] === '/') { out += src.slice(i, j + 1); i = j + 1; continue; }
      }
    }
    out += c; i++;
  }
  return out;
}

/** Repo-relative path with forward slashes. */
export const relPath = (root, p) => relative(root, p).split(sep).join('/');

/** Every file under dir (skipping node_modules / .git) whose repo-relative path passes keep(). */
export const walk = (root, dir, keep, acc = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(root, p, keep, acc); else if (keep(relPath(root, p))) acc.push(p);
  }
  return acc;
};

/** Test files and test folders (never scanned as production code). */
export const isTest = (r) => r.startsWith('automation/tests/') || /\.test\.[a-z]+$/.test(r) || /(^|\/)tests?\//.test(r);
