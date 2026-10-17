// S7-03: the lead's post-booking contact taps (confirm number / other number / alternative number / best time) land in
// the broker's pre-call brief. Walks the REAL node code end to end, offline:
//   W07 "Contact step" Code nodes -> W07 "Save contact data" queryReplacement (the exact $1..$7 n8n binds)
//   -> the UPDATE's COALESCE semantics applied to a synthetic lead + live booking row
//   -> W11 "Meetings starting within 15 min" SELECT aliases -> W11 "Brief input (w11.briefInput)" Code node
//   -> fallback brief template vars (what the broker receives when the model brief fails its check) + model input.
// No network, no DB, no WhatsApp. Synthetic numbers only (+27 60 000 0xxx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCode, evalParam } from './_n8ncode.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W07 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W07.json'), 'utf8'));
const W11 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W11.json'), 'utf8'));
const node = (wf, name) => wf.nodes.find((n) => n.name === name);
const STEP = 'Contact step (call number / alt / best time)';
const STEP_LOOKUP = 'Contact step with Lookup result';
const SAVE = 'Save contact data (leads + live booking)';
const MEET = 'Meetings starting within 15 min, not yet briefed';
const BRIEF = 'Brief input (w11.briefInput)';

// Synthetic DB rows (leads + appointments). Only the columns these nodes touch.
function seed(method) {
  return {
    lead: { id: '00000000-0000-4000-8000-0000000a0301', first_name: 'Synthetic', last_name: 'Lead-S703', phone: '+27600000301', line_type: 'mobile',
      age_band: '45_50', budget_band: '1250plus', bond: true, dependants: true, work_cover: null, language: 'en',
      call_number: null, call_number_line_type: null, alt_number: null, alt_purpose: null, best_time: null, conv_state: {} },
    appt: { id: '00000000-0000-4000-8000-0000000d0301', client_id: '00000000-0000-4000-8000-0000000a0301', brand_id: 'smc', status: 'booked', method,
      appointment_date: '2026-10-07T10:00:00+02:00', call_number: null, join_url: method === 'teams' ? 'https://teams.example.invalid/l/meetup-join/x' : null,
      reschedule_count: 0, confirmed_at: null, intro_played_at: null }
  };
}

// The UPDATE in W07 "Save contact data": leads columns COALESCE($n, col); conv_state merged; the live booking's call_number
// set to $2 only when $2 is not null. The test asserts the SQL text still says exactly that before relying on it.
function applySave(db, p) {
  const [id, callNumber, lineType, alt, altPurpose, best, conv] = p;
  assert.equal(id, db.lead.id);
  const co = (v, cur) => (v === null || v === undefined ? cur : v);
  db.lead = { ...db.lead, call_number: co(callNumber, db.lead.call_number), call_number_line_type: co(lineType, db.lead.call_number_line_type),
    alt_number: co(alt, db.lead.alt_number), alt_purpose: co(altPurpose, db.lead.alt_purpose), best_time: co(best, db.lead.best_time),
    conv_state: { ...db.lead.conv_state, ...JSON.parse(conv) } };
  if (callNumber !== null && ['booked', 'confirmed'].includes(db.appt.status) && db.appt.brand_id) db.appt.call_number = callNumber;
}

// One inbound tap/text through the real W07 nodes (+ the Lookup branch when the step asks for one), then the save.
async function turn(db, msg, lookupType = null) {
  const lead = { id: db.lead.id, first_name: db.lead.first_name, last_name: db.lead.last_name, phone: db.lead.phone, line_type: db.lead.line_type,
    conv_state: db.lead.conv_state, language: db.lead.language, call_number: db.lead.call_number, best_time: db.lead.best_time };
  let j = (await runCode(W07, STEP, { json: { lead, msg } })).json;
  if (j.step.lookup_needed) {
    assert.ok(lookupType, `a typed number asks for a Twilio Lookup (${j.step.lookup_needed})`);
    j = (await runCode(W07, STEP_LOOKUP, { json: { line_type_intelligence: { type: lookupType } }, refs: { [STEP]: j } })).json;
  }
  applySave(db, evalParam(W07, SAVE, 'options.queryReplacement', { json: j }));
  return j.step;
}

// The W11 query row for this booking, built from the SELECT's own aliases.
function meetingRow(db) {
  const { lead: l, appt: a } = db;
  return { id: a.id, client_id: a.client_id, broker_id: 'b', brand_id: a.brand_id, cycle_id: 'c', appointment_date: a.appointment_date, ends_at: null,
    method: a.method, status: a.status, call_number: a.call_number, join_url: a.join_url, reschedule_count: a.reschedule_count,
    confirmed_at: a.confirmed_at, intro_played_at: a.intro_played_at, first_name: l.first_name, last_name: l.last_name, phone: l.phone,
    age_band: l.age_band, budget_band: l.budget_band, bond: l.bond, dependants: l.dependants, work_cover: l.work_cover,
    lead_call_number: l.call_number, alt_number: l.alt_number, best_time: l.best_time, language: l.language,
    contact_person: 'Mark Smith', whatsapp_number: '+27600000099', themes: [], corpus: [] };
}
const brief = async (db) => (await runCode(W11, BRIEF, { json: meetingRow(db) })).json;

test('S7-03 wiring: the SQL the test relies on is the SQL in the workflows', () => {
  const save = node(W07, SAVE).parameters.query.replace(/\s+/g, ' ');
  for (const col of ['call_number = COALESCE($2, call_number)', 'call_number_line_type = COALESCE($3, call_number_line_type)', 'alt_number = COALESCE($4, alt_number)',
    'alt_purpose = COALESCE($5, alt_purpose)', 'best_time = COALESCE($6, best_time)', "conv_state = COALESCE(conv_state, '{}'::jsonb) || $7::jsonb"]) assert.ok(save.includes(col), col);
  assert.match(save, /UPDATE public\.appointments a SET call_number = \$2,.* a\.status IN \('booked','confirmed'\) AND \$2 IS NOT NULL/);
  const meet = node(W11, MEET).parameters.query.replace(/\s+/g, ' ');
  assert.ok(meet.includes('a.call_number') && meet.includes('l.call_number AS lead_call_number, l.alt_number, l.best_time'), 'W11 reads all three taps');
  // W07 routes the contact step's two Code nodes into the save (directly or via the Lookup branch)
  const into = (to) => Object.entries(W07.connections).filter(([, v]) => (v.main || []).some((o) => (o || []).some((c) => c.node === to))).map(([k]) => k);
  assert.ok(into(SAVE).length >= 1, 'something feeds Save contact data');
});

test('S7-03 phone call: other number (Lookup mobile) + alternative number + best time -> all three in the pre-call brief', async () => {
  const db = seed('phone');
  let s = await turn(db, { payload: 'call_number_other' });
  assert.equal(s.conv_state.contact_step, 'typed_number');
  s = await turn(db, { text: '060 000 0302' }, 'mobile');
  assert.equal(db.lead.call_number, '+27600000302'); assert.equal(db.appt.call_number, '+27600000302', 'live booking carries the call number');
  s = await turn(db, { payload: 'alt_add' });
  s = await turn(db, { text: '+27 60 000 0303' }, 'mobile');
  assert.equal(db.lead.alt_number, '+27600000303'); assert.equal(db.lead.alt_purpose, 'reach_fallback');
  s = await turn(db, { list_id: 'best_afternoons' });
  assert.equal(db.lead.best_time, 'afternoons'); assert.equal(db.lead.conv_state.contact_step, 'done');
  assert.equal(db.lead.call_number, '+27600000302', 'a later tap never wipes an earlier one (COALESCE)');

  const b = await brief(db);
  assert.equal(b.skip, false);
  assert.deepEqual({ ...b.input.contact, language: undefined }, { call_number: '+27600000302', call_number_differs: true, alt_number: '+27600000303', best_time: 'afternoons', language: undefined }, 'model input');
  assert.equal(b.fallback.template_vars[4], '+27600000302 (not the WhatsApp number) (if no answer: +27600000303)');
  assert.equal(b.fallback.template_vars[5], 'afternoons');
  assert.match(b.fallback.portal.practical, /\+27600000302 \(not the WhatsApp number\).*afternoons/);
});

test('S7-03 WhatsApp call: confirm tap ("Yes, this one") + "No thanks" to alt + best time -> brief calls the WhatsApp number, not flagged', async () => {
  const db = seed('whatsapp_call');
  await turn(db, { payload: 'call_number_yes' });
  assert.equal(db.lead.call_number, '+27600000301'); assert.equal(db.lead.call_number_line_type, 'mobile');
  await turn(db, { payload: 'alt_no' });
  await turn(db, { list_id: 'best_mornings' });
  const b = await brief(db);
  assert.equal(b.input.contact.call_number, '+27600000301'); assert.equal(b.input.contact.call_number_differs, false);
  assert.equal(b.input.contact.alt_number, null);
  assert.equal(b.fallback.template_vars[4], '+27600000301');
  assert.equal(b.fallback.template_vars[5], 'mornings');
});

test('S7-03 landline typed twice -> falls back to the WhatsApp number; ignored best time -> "not given" (nothing re-asked)', async () => {
  const db = seed('phone');
  await turn(db, { payload: 'call_number_other' });
  await turn(db, { text: '021 000 0304' }, 'landline');
  assert.equal(db.lead.call_number, null, 'first landline rejected, nothing stored');
  const s = await turn(db, { text: '021 000 0304' }, 'landline');
  assert.equal(db.lead.call_number, '+27600000301', 'second failure -> "we will use this WhatsApp number"');
  assert.equal(s.conv_state.contact_step, 'alt');
  const b = await brief(db);
  assert.equal(b.fallback.template_vars[4], '+27600000301');
  assert.equal(b.fallback.template_vars[5], 'not given');
});

test('S7-03 Teams booking: no call number in the brief (the Teams link is the contact); best time still lands', async () => {
  const db = seed('teams');
  await turn(db, { list_id: 'best_evenings' });
  const b = await brief(db);
  assert.equal(b.input.contact.call_number, null);
  assert.equal(b.input.contact.best_time, 'evenings');
  assert.equal(b.fallback.template_vars[5], 'evenings');
});
