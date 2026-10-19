// automation/patch-w10-guest.mjs - W10: the optional Teams guest gets the cancel / move emails; a W39 page move sends no
// "slot taken" WhatsApp (Jono, 19 Oct 2026).
//   1. "Load booking, lead, broker, brand" reads the guest W05 stored with the booking (lead_activities 'w05:guest:<id>');
//      "Merge context" carries it as bk.guest_email, so lib/w10.mjs smcClientChangeEmail passes it to smc-client-email,
//      which sends the guest the same booking_cancelled / booking_updated email (own Resend key, ':guest').
//   2. "Slot taken: next 3": source 'W39' (POST /start/move) -> wa null (lib/w10.mjs pageOwnsSlotTaken): the page re-fetches
//      /slots, the lead gets no chat message for a lost slot. The move itself is unchanged.
// W10.json is maintained as JSON (see patch-w10-w04-requests.mjs), so this script is the reproducible record. Idempotent.
// Run: node automation/patch-w10-guest.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const swap = (n, key, from, to) => {
  const v = n.parameters[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W10 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  n.parameters[key] = v.replace(from, to);
  return true;
};

swap(node('Load booking, lead, broker, brand'), 'query',
  'a.reschedule_count, a.call_number, a.booked_at, a.verify_by,\n',
  "a.reschedule_count, a.call_number, a.booked_at, a.verify_by,\n       (SELECT g.payload->>'guest_email' FROM public.lead_activities g WHERE g.idempotency_key = 'w05:guest:' || a.id::text LIMIT 1) AS guest_email,\n");
swap(node('Merge context'), 'jsCode', 'booked_at: r.booked_at, verify_by: r.verify_by }', 'booked_at: r.booked_at, verify_by: r.verify_by, guest_email: r.guest_email || null }');
swap(node('Slot taken: next 3'), 'jsCode',
  "return { json: { to: 'lead', wa: L.slotTakenWa(",
  "// W39 /start/move: the page shows the lost slot and re-fetches /slots (lib/w10.mjs pageOwnsSlotTaken)\nreturn { json: { to: 'lead', wa: L.pageOwnsSlotTaken(j.source) ? null : L.slotTakenWa(");

const out = JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { writeFileSync(FILE, out); console.log('patched W10.json'); } else console.log('W10.json already patched');
