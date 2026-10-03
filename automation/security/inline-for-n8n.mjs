#!/usr/bin/env node
// Prints a self-contained block to paste at the top of an n8n Code node.
// n8n's Code node (task runner) cannot require repo files, so the module is inlined verbatim;
// regenerate after any change to verify-webhooks.js / redact.js. Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto.
//   node automation/security/inline-for-n8n.mjs            -> VW (verify-webhooks) + RD (redact)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export function inlineModule(name, file) {
  const src = readFileSync(join(here, file), 'utf8');
  const sha = createHash('sha256').update(src).digest('hex').slice(0, 12);
  return `// --- inlined ${file} sha256:${sha} (regenerate: node automation/security/inline-for-n8n.mjs) ---\n` +
    `const ${name} = (function () { const module = { exports: {} }; const exports = module.exports;\n${src}\nreturn module.exports; })();\n`;
}
export function inlineAll() {
  return inlineModule('VW', 'verify-webhooks.js') + inlineModule('RD', 'redact.js');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write(inlineAll());
