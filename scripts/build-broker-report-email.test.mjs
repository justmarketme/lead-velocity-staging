// I-33h: broker weekly email + print HTML. Offline, zero dependencies: node --test scripts/build-broker-report-email.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEmail, renderPrint, subjectFor, pdfName, visibleText, loadTokens, initials, BANNED, ROI_TEXT, assertClean } from './build-broker-report-email.mjs';

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
