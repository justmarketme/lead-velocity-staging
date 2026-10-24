// automation/patch-w07-start-page.mjs - an age the /start/ page accepted is never closed later in chat (18 Oct 2026).
// Jono (18 Oct): under-35 and over-50 leads may book with Mark from the /start/ page (lib/w39.mjs OUT_OF_BAND_AGE_BOOKS).
// W39 records conv_state.age_accepted = true for them. Without this, a typed "I'm 30" later in chat would make
// conversation/logic.mjs decide() close the lead as out of band (close_oob, the "band conflict typed later" rule), so W07
// passes the flag into decide() and logic.mjs skips that close (a booked lead still gets flag_band_conflict).
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run after the other W07 patches: node automation/patch-w07-start-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };
const swap = (n, key, from, to) => {
  const v = n.parameters[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W07 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  n.parameters[key] = v.replace(from, to);
  return true;
};

const changed = [
  swap(node('Parse NLU -> decide() -> plan'), 'jsCode',
    '{ booking: j.booking, unanswered: cs.unanswered || 0 })', '{ booking: j.booking, unanswered: cs.unanswered || 0, age_accepted: cs.age_accepted === true })'),
];

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-start-page:', changed.map((c) => (c ? 'changed' : 'already')).join(' '));
