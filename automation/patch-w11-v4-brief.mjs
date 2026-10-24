// automation/patch-w11-v4-brief.mjs - the W11 pre-call brief carries the /start/ v4 answers (20 Oct 2026): income band,
// topics (leads.conv_state.start.topics) and whether a guest joins the Teams call (W05's booking_guest row, key
// w05:guest:<booking_id>; only the fact, never the address: briefCheck blocks email addresses). Logic: lib/w11.mjs
// briefInput / fallbackBrief. W11 is maintained as JSON, so this script is the reproducible record of the change.
// Idempotent; W11 stays inactive. Run: node automation/patch-w11-v4-brief.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const F = new URL('./W11.json', import.meta.url);
const wf = JSON.parse(readFileSync(F, 'utf8'));
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W11: no node ${name}`); return n; };
const swap = (s, from, to, done) => (s.includes(done) ? s : s.includes(from) ? s.replace(from, to) : (() => { throw new Error(`W11: anchor not found: ${from}`); })());

const meet = node('Meetings starting within 15 min, not yet briefed');
meet.parameters.query = swap(meet.parameters.query,
  'l.call_number AS lead_call_number, l.alt_number, l.best_time, l.language,',
  "l.call_number AS lead_call_number, l.alt_number, l.best_time, l.language, l.income_band, l.conv_state,\n" +
  "       -- v4: a Teams guest (W05 booking_guest row; the address is dropped from it when the method changes)\n" +
  "       EXISTS (SELECT 1 FROM public.lead_activities g WHERE g.idempotency_key = 'w05:guest:' || a.id AND g.activity_type = 'booking_guest' AND g.payload ? 'guest_email') AS guest_joining,",
  'AS guest_joining');

const input = node('Brief input (w11.briefInput)');
input.parameters.jsCode = swap(input.parameters.jsCode,
  'best_time: r.best_time, language: r.language };',
  'best_time: r.best_time, language: r.language, income_band: r.income_band, conv_state: r.conv_state };',
  'income_band: r.income_band');
input.parameters.jsCode = swap(input.parameters.jsCode,
  'reschedule_count: r.reschedule_count, status: r.status };',
  'reschedule_count: r.reschedule_count, status: r.status, guest_joining: r.guest_joining === true || r.guest_joining === \'t\' };',
  'guest_joining: r.guest_joining');

wf.active = false;
writeFileSync(F, JSON.stringify(wf, null, 2) + '\n');
console.log('patched automation/W11.json (v4 brief inputs); active:false');
