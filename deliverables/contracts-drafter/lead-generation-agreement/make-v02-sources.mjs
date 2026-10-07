// Builds the two v0.2 texts from the working draft lead-velocity-services-agreement-v2.md:
//   1. lead-velocity-services-agreement.md            canonical template (clean: no change markers,
//                                                       no change log) used by the CRM generator + portal
//   2. lead-velocity-services-agreement-v0.2-marked.md  client copy for an existing client (Mark): every
//                                                       change highlighted as "Changed/New in v0.2", plus a
//                                                       plain summary of changes. No internal decision codes.
// v0.1 is kept as lead-velocity-services-agreement-v0.1.md.
// Usage: node make-v02-sources.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, 'lead-velocity-services-agreement-v2.md');
const CANON = join(HERE, 'lead-velocity-services-agreement.md');
const V01 = join(HERE, 'lead-velocity-services-agreement-v0.1.md');
const MARKED = join(HERE, 'lead-velocity-services-agreement-v0.2-marked.md');

if (!existsSync(V01)) copyFileSync(CANON, V01); // keep v0.1 once, never overwrite it

let md = readFileSync(DRAFT, 'utf8').replace(/\r\n/g, '\n');

// Header: the working note about decision codes is internal.
md = md.replace(/\n> \*\*How changes are marked\.\*\*[\s\S]*?\n(?=\n## )/, '\n');

// Change log -> plain client summary (no decision codes, no internal column header).
const logStart = md.indexOf('\n## Change log');
if (logStart < 0) throw new Error('change log not found');
const log = md.slice(logStart);
md = md.slice(0, logStart).trimEnd() + '\n';
const rows = log.split('\n').filter((l) => /^\| (D\d|C\d) \|/.test(l)).map((l) => {
  const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
  return `| ${cells[1]} | ${cells[2]} |`;
});
if (rows.length < 8) throw new Error('change log rows not parsed: ' + rows.length);
const summary = ['', '## Summary of changes in version 0.2', '', 'Changes from version 0.1 (5 October 2026) are marked in the text as Changed in v0.2 or New in v0.2. Everything else is word for word as before.', '', '| What changed | Clauses |', '|---|---|', ...rows, '', 'Not changed: the Bronze, Silver and Gold fees, top-ups, payment, termination, liability, intellectual property and the signature method.', ''].join('\n');

// Marker forms: **[CHANGED v0.2 — D4: ...]**, [NEW v0.2 — D3], etc.
const MARK_RE = /\s*\*{0,2}\[(CHANGED|NEW) v0\.2(?: —[^\]]*)?\]\*{0,2}/g;
const canonical = md.replace(MARK_RE, '').replace(/[ \t]+\n/g, '\n');
// the summary goes up front, before the Parties, so the client reads what changed first
const markedBody = md.replace(MARK_RE, (_m, kind) => ` [${kind} v0.2]`);
if (!markedBody.includes('\n## Parties')) throw new Error('Parties heading not found');
const marked = markedBody.replace('\n## Parties', summary + '\n## Parties');

for (const [name, text] of [['canonical', canonical], ['marked', marked]]) {
  const leftover = text.match(/\[(?:CHANGED|NEW)[^\]]*—[^\]]*\]|\bD[1-9]\b(?= |,|;|\])/g);
  if (name === 'canonical' && /\[(CHANGED|NEW) v0\.2/.test(text)) throw new Error('canonical still has markers');
  if (leftover && name === 'marked' && leftover.some((x) => x.startsWith('['))) throw new Error('marked has coded markers: ' + leftover.slice(0, 3));
}
if (/Jonathan West's final decisions|coordinator message/.test(canonical + marked)) throw new Error('internal wording leaked');

writeFileSync(CANON, canonical);
writeFileSync(MARKED, marked);
console.log('canonical', canonical.length, 'chars; marked', marked.length, 'chars;', (marked.match(/\[(CHANGED|NEW) v0\.2\]/g) || []).length, 'markers');
