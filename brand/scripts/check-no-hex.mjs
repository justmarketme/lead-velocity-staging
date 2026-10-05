// Acceptance: no hex colour outside tokens.json / tokens.css (generated docs and two platform-format files are the documented exceptions).
import fs from 'fs'; import path from 'path'; import { root } from './lib.mjs';
const allow = new Set(['tokens.json', 'tokens.css', 'tokens.md', 'favicon/manifest.webmanifest', 'favicon/browserconfig.xml']);
const hits = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (['node_modules', '.git'].includes(e.name)) continue;
  const p = path.join(d, e.name), rel = path.relative(root, p).split(path.sep).join('/');
  if (e.isDirectory()) walk(p);
  else if (/\.(css|html|js|mjs|json|svg|md|xml|webmanifest)$/.test(e.name) && !allow.has(rel) && e.name !== 'package-lock.json') {
    const m = fs.readFileSync(p, 'utf8').match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/g); if (m) hits.push(`${rel}: ${[...new Set(m)].join(' ')}`); } } })(root);
console.log(hits.length ? 'HEX FOUND:\n' + hits.join('\n') : 'OK: no hex outside the allowed files');
process.exit(hits.length ? 1 : 0);
