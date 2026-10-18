// automation/patch-w07-faq-fill.mjs - approved FAQ answers are filled from the brokers row (17 Oct 2026).
// Live bug: Lindi's model reply was gated out, the fallback sent knowledge/faq.md verbatim and the lead got
// "{adviser} is from {practice}, an authorised financial services provider (FSP {fsp}) based in {city}."
// Fix: W07 loads fsp_number + practice_name, carries them on j.broker, and passes the broker into planActions and the
// fallback; lib/w07.mjs fillFaqText() fills them and drops any sentence that still holds a placeholder.
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Run after the other W07 patches: node automation/patch-w07-faq-fill.mjs
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
  // 1. the context query also reads the FSP number and the practice display name
  swap(node('Load context (lead, broker, live booking, window)'), 'query',
    'b.contact_person, b.firm_name, b.whatsapp_number,', 'b.contact_person, b.firm_name, b.fsp_number, b.practice_name, b.whatsapp_number,'),
  // 2. ... and carries them on j.broker
  swap(node('Route (deterministic) + prefilter'), 'jsCode',
    'broker: { id: c.broker_id || c.from_broker_id, contact_person: c.contact_person, firm_name: c.firm_name }',
    'broker: { id: c.broker_id || c.from_broker_id, contact_person: c.contact_person, firm_name: c.firm_name, fsp_number: c.fsp_number || null, practice_name: c.practice_name || null }'),
  // 3. planActions gets the broker (the one-message FAQ lines are filled from it)
  swap(node('Parse NLU -> decide() -> plan'), 'jsCode', 'adviser_first: j.adviser_first, unanswered:', 'adviser_first: j.adviser_first, broker: j.broker || null, unanswered:'),
  // 4. the gated-out fallback fills the FAQ answer from the broker
  swap(node('Assemble (verdict + toneCheck + fallbacks)'), 'jsCode', 'adviser_first: j.adviser_first, booking: L.bookingView', 'adviser_first: j.adviser_first, broker: j.broker || null, booking: L.bookingView'),
];

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-faq-fill:', changed.map((c) => (c ? 'changed' : 'already')).join(' '));
