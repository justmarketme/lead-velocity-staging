// I-33h: broker weekly email + print HTML. Offline, zero dependencies: node --test scripts/build-broker-report-email.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brokerLine } from '../conversation/pulse.mjs';
import { renderEmail, pulseText, renderPrint, subjectFor, pdfName, visibleText, loadTokens, initials, BANNED, ROI_TEXT, assertClean } from './build-broker-report-email.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, '..', 'automation', 'tests', 'fixtures', 'w14-payloads.json'), 'utf8'));
const W14 = JSON.parse(readFileSync(join(here, '..', 'automation', 'W14.json'), 'utf8'));
const SRC = readFileSync(join(here, 'build-broker-report-email.mjs'), 'utf8');
const KEYS = Object.keys(FX).filter((k) => FX[k] && FX[k].schema === 'broker_report/1');
const opts = { portalUrl: 'https://portal.example.invalid', reportId: 'r-1' };
const people = (p) => { const m = p.s3_meetings || {}; const t = m.todos || {};
  return [...(m.last_week || []), ...(m.next_week || []), ...(t.unmarked || []), ...(t.followups_due || []), ...(t.not_reached || [])]; };

// Distinct, realistic names so "no names" is a real test (the fixture's lead first name also appears in the synthetic practice name).
function named(p) {
  const q = structuredClone(p); const names = [['Lerato', 'Mokoena'], ['Pieter', 'Botha'], ['Sipho', 'Dlamini'], ['Anele', 'Zulu'], ['Johan', 'Venter']];
  people(q).forEach((x, i) => { const [f, l] = names[i % names.length]; x.first_name = f; x.initial = l[0]; if ('full_name' in x || x.lead_ref) x.full_name = `${f} ${l}`; });
  q.broker.first_name = 'Zebedee';
  return q;
}

test('fixture has the four broker editions', () => assert.deepEqual(KEYS.sort(), ['cycle_end', 'midcycle', 'weekly_close_rate', 'weekly_no_close_rate']));

for (const k of KEYS) {
  test(`${k}: no lead full name or first name from the fixture, initials only, broker name not printed`, () => {
    for (const p of [FX[k], named(FX[k])]) {
      for (const html of [renderEmail(p, opts), renderPrint(p, opts)]) {
        const text = visibleText(html);
        for (const x of people(p)) {
          if (x.full_name) assert.ok(!html.includes(x.full_name), `full name "${x.full_name}" leaked`);
          if (p !== FX[k] && x.first_name) assert.ok(!html.includes(x.first_name), `first name "${x.first_name}" leaked`);
          assert.ok(text.includes(initials(x)), `initials ${initials(x)} shown`);
        }
        if (p !== FX[k]) assert.ok(!html.includes('Zebedee'), 'broker first name not printed');
        assert.doesNotMatch(html, /lead_ref|0000000a00\d\d/, 'no lead ids');
      }
    }
  });

  test(`${k}: no banned words (R03/R11), says "No lock-in.", never "no contract" or "guarantee"`, () => {
    for (const html of [renderEmail(FX[k], opts), renderPrint(FX[k], opts)]) {
      const text = visibleText(html);
      assert.doesNotMatch(text, BANNED);
      assert.doesNotMatch(text, /(spen[dt]|\bcpl\b|\bcpc\b|\bctr\b|cost per|margin|creative|campaign|adset|\bemq\b|\bcapi\b|attribution|\broas\b|cheapest|\bbest\b|guarantee|no contract|appointments)/i);
      assert.match(text, /No lock-in\./);
    }
    assert.doesNotMatch(subjectFor(FX[k]), BANNED);
  });

  test(`${k}: email has sections 1, 2, 3, 4, ask, cycle (no ROI); print adds notice, never ROI`, () => {
    const p = FX[k]; const e = visibleText(renderEmail(p, opts)); const pr = visibleText(renderPrint(p, opts));
    const order = ['This week', 'Progress', 'Your meetings', 'Quality, in your words', 'One thing to do', 'Your cycle'];
    let at = -1; for (const s of order) { const i = e.indexOf(s.toUpperCase() === s ? s : s); assert.ok(i > at, `email section "${s}" in order`); at = i; }
    assert.ok(!e.includes('Your view (your numbers only)'), 'ROI is portal/PDF only');
    assert.ok(pr.includes("What you'll notice this week"));
    assert.ok(!pr.includes('Your view (your numbers only)'), 'ROI is portal only, never in the emailed PDF');
    assert.doesNotMatch(pr, ROI_TEXT); assert.doesNotMatch(e, ROI_TEXT);
    assert.ok(e.includes(p.s1_one_line)); assert.ok(e.includes(p.s8_cycle.line));
    // same numbers as the payload (R02)
    const d = p.s2_progress.delivered; assert.ok(e.includes(`${d.v} of ${d.committed}`)); assert.ok(pr.includes(`${d.v} of ${d.committed}`));
  });
}

test('one ask is a bulletproof button to the portal deep link; no ask says all caught up', () => {
  const p = FX.weekly_close_rate; const html = renderEmail(p, opts);
  assert.match(html, new RegExp(`href="https://portal\\.example\\.invalid/${p.s7_ask.deep_link}"`));
  assert.match(html, /<td align="center" bgcolor="[^"]+"/, 'table-cell button with bgcolor fallback');
  const none = structuredClone(p); none.s7_ask = null;
  assert.match(visibleText(renderEmail(none, opts)), /Nothing this week\. You are all caught up\./);
  assert.match(subjectFor(none), /16\/20 delivered · 2 things to do/, 'to-dos are unmarked + follow-ups, as WhatsApp v5');
  none.s3_meetings.todos = { unmarked: [], followups_due: [], not_reached: [] };
  assert.match(subjectFor(none), /all caught up$/);
});

test('subjects and PDF file names per edition (W14-broker.md)', () => {
  assert.equal(subjectFor(FX.weekly_close_rate), 'Your SortMyCover week · 16/20 delivered · 2 things to do');
  assert.match(subjectFor(FX.midcycle), /^Day 15 of your cycle · /);
  assert.equal(subjectFor(FX.cycle_end), `Your ${FX.cycle_end.cycle.label} cycle summary`);
  assert.equal(pdfName(FX.weekly_close_rate), 'SortMyCover-week-2-Oct-2026.pdf');
});

test('brand: colours come from brand/tokens.css; no colour literal in the script; email is 600 px, dark-mode aware; print is A4', () => {
  const t = loadTokens();
  const html = renderEmail(FX.weekly_close_rate, opts);
  for (const k of ['accent', 'text', 'bg', 'surface', 'bg-dark']) assert.ok(html.includes(t[k]), `token ${k} used`);
  assert.doesNotMatch(SRC, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgb\(/i, 'no hex or rgb in the script');
  assert.match(html, /width="600"/); assert.match(html, /prefers-color-scheme: dark/); assert.match(html, /name="color-scheme"/);
  assert.doesNotMatch(html, /style="[^"]*"[^ >]*"DM Sans/, 'font stack does not break the style attribute');
  assert.match(renderPrint(FX.weekly_close_rate, opts), /@page\{size:A4/);
});

test('W14 email outbox row names this script', () => {
  const n = W14.nodes.find((x) => x.name === 'Mark sent and queue email');
  assert.match(n.parameters.query, /'builder', 'scripts\/build-broker-report-email\.mjs'/);
  assert.match(n.parameters.query, /'pdf', 'initials_only'/);
  assert.doesNotMatch(W14.nodes.find((x) => x.name === 'Note').parameters.content, /not written yet/);
});

test('fix wave 4: a close-rate / policies line fails the build of the emailed report', () => {
  assert.throws(() => assertClean('<p>No lock-in.</p><p>Your close rate: 30%. Policies you report are for your view only.</p>'), /portal only/);
  assert.doesNotThrow(() => assertClean('<p>No lock-in.</p><p>16 of 20 delivered.</p>'));
});

// ---- I-43c: the broker-facing lead pulse (W35-pulse-visibility.md residual risk) ----
// The payload is built the way analytics/W14-broker-payload.sql does: facts.broker_pulse == brokerLine(answers oldest first, prevN = n of the last figure he was sent).
const arrive = (...t) => t.map((thumbs, i) => ({ lead_id: `l${i}`, thumbs }));
const mk = (n, upEvery = 3) => arrive(...Array.from({ length: n }, (_, i) => (i % upEvery === 2 ? 'down' : 'up')));
const withPulse = (rows, prevN = null, prevUp = null) => { const p = structuredClone(FX.weekly_close_rate); const b = brokerLine(rows, prevN, prevUp);
  p.s4_quality.lead_pulse = b ? { shown: true, n: b.n, up: b.up, text: b.text } : { shown: false, n: null, up: null, text: 'Fewer than 5 answers yet.' }; return p; };
const pulseRow = (p) => visibleText(renderEmail(p, opts)).match(/Said the call was worth their time\s+([^]*?)\s+(?:How you marked|Your average|Meetings you rated)/)?.[1];

test('I-43c: under 5 answers the broker sees the placeholder, never a number', () => {
  for (const n of [0, 1, 4]) {
    const p = withPulse(mk(n));
    assert.equal(p.s4_quality.lead_pulse.shown, false);
    assert.equal(pulseText(p.s4_quality.lead_pulse), 'Fewer than 5 answers yet');
    assert.match(visibleText(renderEmail(p, opts)), /Said the call was worth their time Fewer than 5 answers yet/);
  }
});

test('I-43c: 9 answers then 10 show the same value; 5 new answers update it', () => {
  // 7 of 9 is what he sees at 9. The 10th answer is a thumbs-down in the same week (7 of 10 live): he must still see 7 of 9.
  const nine = arrive(...Array(7).fill('up'), 'down', 'down');
  const ten = [...nine, { lead_id: 'l9', thumbs: 'down' }];
  const first = withPulse(nine);                                  // first figure ever: 7 of 9
  assert.equal(pulseRow(first), '7 of 9 people (answers so far this cycle)');
  const next = withPulse(ten, first.s4_quality.lead_pulse.n);     // one new answer: held
  assert.equal(pulseRow(next), pulseRow(first));
  assert.deepEqual(next.s4_quality.lead_pulse, first.s4_quality.lead_pulse);
  const fourteen = [...ten, ...arrive('up', 'up', 'up', 'up')];   // 4 new answers (13 total): still held
  assert.equal(pulseRow(withPulse(fourteen.slice(0, 13), 9)), '7 of 9 people (answers so far this cycle)');
  assert.equal(pulseRow(withPulse(fourteen, 9)), '11 of 14 people (answers so far this cycle)');  // 5 new answers (14 total): updates
});

test('I-43c: over a whole cycle no two figures a broker sees have denominators fewer than 5 apart', () => {
  let prev = null; const seen = [];
  for (let n = 0; n <= 40; n++) { const b = brokerLine(mk(n), prev); if (b) { if (b.n !== prev) seen.push(b.n); prev = b.n; } }
  assert.equal(seen[0], 5); for (let i = 1; i < seen.length; i++) assert.ok(seen[i] - seen[i - 1] >= 5, `${seen[i - 1]} -> ${seen[i]}`);
  // a figure is computed on the first answers only: a late thumbs-down cannot move a held figure
  const held = brokerLine([...mk(9), { thumbs: 'down' }], 9); assert.deepEqual([held.n, held.up], [9, brokerLine(mk(9)).up]);
});

test('I-43c: no week-on-week change and no target on the pulse line; the renderer refuses a figure from under 5 answers', () => {
  const p = withPulse(arrive(...Array(8).fill('up'), 'down', 'down'));
  assert.match(visibleText(renderEmail(p, opts) + renderPrint(p, opts)), /8 of 10 people \(answers so far this cycle\)/);
  assert.doesNotMatch(pulseRow(p), /last week|target|up from|down from|change|%/i);
  assert.throws(() => pulseText({ shown: true, n: 4, up: 4 }), /5 or more answers/);
  assert.throws(() => pulseText({ shown: true, n: 10, up: 11 }), /5 or more answers/);
  assert.doesNotMatch(SRC, /pulse_up|pulse_n/, 'the renderer never reads the live internal counts');
});

test('I-43c: the SQL gives the broker only facts.broker_pulse (never cycle_counts.pulse_*), with the hold rule', () => {
  const sql = readFileSync(join(here, '..', 'analytics', 'W14-broker-payload.sql'), 'utf8').replace(/--[^\n]*/g, '');
  const cnt = readFileSync(join(here, '..', 'analytics', 'W14-broker.sql'), 'utf8');
  assert.match(sql, /facts\.broker_pulse\(c\.id, d,/);
  assert.doesNotMatch(sql, /\b[nw]\.pulse_(up|n)\b/);
  assert.match(cnt, /t\.total < 5 then null/); assert.match(cnt, /p_prev_n >= 5 and t\.total - p_prev_n < 5 then p_prev_n/);
  assert.doesNotMatch(cnt.replace(/--[^\n]*/g, ''), /least\(p_prev_n/, 'R6-05: no recount');
  assert.match(sql, /broker_pulse\(c\.id, d, pv_n, pv_up\)/); assert.match(sql, /rh\.week <= d/);
});

test('R6-01: Monday weekly (9 answers) then Wednesday midcycle (10 answers) show the same held 7 of 9; cycle-end after 5 new answers updates it', () => {
  const nine = arrive(...Array(7).fill('up'), 'down', 'down');
  const monday = withPulse(nine);                                              // weekly: 7 of 9, stored in report_history
  const sent = monday.s4_quality.lead_pulse;
  const ten = [...nine, { lead_id: 'l9', thumbs: 'down' }];
  const wed = withPulse(ten, sent.n, sent.up);                                 // midcycle two days later: report_history lookup is rh.week <= d, so Monday counts
  assert.equal(pulseRow(wed), '7 of 9 people (answers so far this cycle)');
  assert.deepEqual(wed.s4_quality.lead_pulse, sent);
  const end = withPulse([...ten, ...arrive('up', 'up', 'up')], wed.s4_quality.lead_pulse.n, wed.s4_quality.lead_pulse.up);   // 13 total, 4 new on 9: held
  assert.equal(pulseRow(end), '7 of 9 people (answers so far this cycle)');
  const fresh = withPulse([...nine, ...arrive('down', 'up', 'up', 'up', 'up')], sent.n, sent.up);      // 5 new answers since 9 (14 total)
  assert.equal(pulseRow(fresh), '11 of 14 people (answers so far this cycle)');
});

test('R6-05: a POPIA erase of an answered row never shifts a held figure; it updates only after 5 new answers', () => {
  const nine = arrive(...Array(7).fill('up'), 'down', 'down');
  const sent = withPulse(nine).s4_quality.lead_pulse;                          // stored {n: 9, up: 7}
  for (const gone of [0, 3, 8]) {                                              // W34 erases one answered row (an up, or a down)
    const rows = nine.filter((_, i) => i !== gone);                            // 8 rows left
    const held = withPulse(rows, sent.n, sent.up);
    assert.deepEqual(held.s4_quality.lead_pulse, sent, `erase #${gone}`);      // still 7 of 9, never 6 of 8 / 7 of 8
    assert.equal(pulseRow(held), '7 of 9 people (answers so far this cycle)');
  }
  const after = nine.filter((_, i) => i !== 3);
  assert.deepEqual(brokerLine([...after, ...arrive('up', 'up', 'up', 'up')], 9, 7), { n: 9, up: 7, rate: 0.778, text: '7 of 9 people said the call was worth their time.' });  // 12 rows: held
  assert.equal(brokerLine([...after, ...arrive('up', 'up', 'up', 'up', 'up', 'up')], 9, 7).n, 14);                                              // 14 rows (5 new on 9): recomputed
  assert.equal(brokerLine(after.slice(0, 4), 9, 7).n, 9);   // even with fewer than 5 rows left the stored figure stands
  assert.equal(brokerLine(after.slice(0, 4)), null);        // but with nothing stored, under 5 is still hidden
});

test('ux-sprint-1 (agreement clause 7): replacements print as a plain count with the goodwill note: no "of cap", no traffic light, even from an old payload that still carries one', () => {
  for (const k of KEYS) {
    const old = structuredClone(FX[k]); old.s2_progress.replacements = { used: 2, cap: 6, last_used: 1, light: 'red' };   // the pre-10-Oct shape
    for (const p of [FX[k], old]) {
      const rp = p.s2_progress.replacements;
      for (const html of [renderEmail(p, opts), renderPrint(p, opts)]) {
        const t = visibleText(html);
        assert.match(t, /Replacement requests this cycle/);
        assert.match(t, /goodwill, up to 3 requests a Calendar Week/);
        assert.doesNotMatch(t, /Replacements used/i);
        assert.doesNotMatch(t, new RegExp(`\\b${rp.used} of ${rp.cap}\\b`), 'no used-of-cap line');
        const row = html.slice(html.indexOf('Replacement requests this cycle'), html.indexOf('Days left in this cycle'));
        assert.ok(row.length > 0 && !row.includes('display:inline-block;padding:1px 8px'), 'no pill on the replacements row');
      }
    }
  }
});

test('ux-sprint-1 (agreement clause 7): the payload SQL prints no used-of-cap line and builds no replacements traffic light (keys kept, light null)', () => {
  const sql = readFileSync(join(here, '..', 'analytics', 'W14-broker-payload.sql'), 'utf8').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /light_rep|Replacements used/);
  assert.match(sql, /'v7', format\('Replacement requests this cycle: %s\.', n\.replacements_used\) \|\| end_note/);
  assert.match(sql, /'replacements', jsonb_build_object\('used', n\.replacements_used, 'cap', c\.replacement_cap, 'last_used', w\.replacements_used, 'light', null::text\)/);
});
