// S7-06 local staging proof: the W20 24 h / 72 h onboarding nudges, run as n8n runs them, against the REAL repo
// migration chain in a throwaway Postgres (automation/tests/_localpg.mjs: native binaries, else a `--network none`
// Docker container; never the live project). Real node code and real SQL from automation/W20.json:
//   "Every 30 min sweep" -> "Within send hours (08:00-19:00 SAST)?" (Code) -> "Find due nudges" (SQL)
//   -> "Build nudge" (Code) -> "Item carries a nudge mark?" -> "Mark nudge sent (at-most-once)" (SQL)
//   and the WhatsApp branch "Compose WhatsApp payload" (Code) under DRY_RUN_SENDS=true (nothing is sent).
// Timestamps cross the SQL -> Code boundary the way n8n's Postgres node returns them (JS Date -> ISO, millisecond
// precision), which is what exposed the microsecond "since" mismatch fixed in W20 "Find due nudges".
// Synthetic brokers only (+27 60 000 05xx, @example.com).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import { nodeRequire, templateCounts } from './_n8ncode.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W20 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W20.json'), 'utf8'));
const nd = (name) => { const n = W20.nodes.find((x) => x.name === name); assert.ok(n, `W20 node ${name}`); return n; };
const PG = localPgBackend();
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const ENV = { PORTAL_URL: 'https://app.leadvelocity.co.za', DRY_RUN_SENDS: 'true', WHATSAPP_TEST_RECIPIENTS: '' };

// Runs a Code node (all-items mode) with a fixed SAST hour for luxon's DateTime.now().setZone(...).hour.
async function code(name, items, { sastHour = 10, env = ENV } = {}) {
  const DateTime = { now: () => ({ setZone: () => ({ hour: sastHour }) }) };
  const all = items.map((j) => ({ json: j }));
  const fn = new AsyncFunction('$json', '$env', '$', '$input', 'require', 'DateTime', nd(name).parameters.jsCode);
  const out = await fn(items[0] || {}, env, () => { throw new Error('no $() refs here'); }, { all: () => all, first: () => all[0] }, nodeRequire, DateTime);
  return (Array.isArray(out) ? out : [out]).map((i) => i.json);
}
// n8n's IF node v2 for "Item carries a nudge mark?" ({{ !!$json.mark }} is true)
const carriesMark = (j) => {
  const c = nd('Item carries a nudge mark?').parameters.conditions.conditions[0];
  return new Function('$json', `return (${/^=\{\{([\s\S]*)\}\}$/.exec(c.leftValue)[1]});`)(j) === true;
};
// The connection the sweep relies on: quiet-hours gate -> Find -> Build -> (IF -> Mark) + Channel router
test('S7-06 wiring: the 30-min sweep goes through the quiet-hours gate to Find -> Build -> Mark and the channel router', () => {
  const to = (n) => (W20.connections[n]?.main || []).flat().map((c) => c.node);
  assert.ok(to('Every 30 min sweep').includes('Within send hours (08:00-19:00 SAST)?'));
  assert.deepEqual(to('Within send hours (08:00-19:00 SAST)?'), ['Find due nudges']);
  assert.deepEqual(to('Find due nudges'), ['Build nudge']);
  assert.deepEqual(to('Build nudge').sort(), ['Channel router', 'Item carries a nudge mark?']);
  assert.deepEqual(to('Item carries a nudge mark?'), ['Mark nudge sent (at-most-once)']);
  assert.equal(nd('Every 30 min sweep').parameters.rule.interval[0].minutesInterval, 30);
});

test('S7-06 local staging: W20 24 h / 72 h nudges on the real schema (quiet hours, once per stall, never a third, progress resets)', { skip: !PG && 'no local Postgres (no binaries, no Docker postgres:16-alpine image)', timeout: 600000 }, async (t) => {
  const pg = startLocalPg(PG);
  t.after(() => pg.stop());
  const q = makeQuery(pg);
  applyRepoMigrations(pg);

  const [[brand]] = [q("SELECT id FROM public.brands WHERE code = 'SMC'")];
  assert.ok(brand && brand[0], 'SMC brand row from the migrations');
  const BRAND = brand[0];
  const bid = (k) => `00000000-0000-4000-8000-0000000b05${(k.charCodeAt(0) - 64).toString(16).padStart(2, '0')}`; // A -> ...b0501
  const uid = (k) => bid(k).replace('-0000000b', '-0000000c');
  // A: stalled 25 h at "calendar"; B: stalled 73 h at "agreement" (no nudge yet); C: progressed 2 h ago;
  // D: stalled 30 h but in the portal 5 min ago; E: active (live); F: onboarded with media done; G: broker #1 suppressed
  const P = (doneUpTo) => JSON.stringify(Object.fromEntries(['profile', 'calendar', 'availability', 'agreement', 'card'].slice(0, doneUpTo).map((s) => [s, { status: 'done' }])));
  const rows = {
    A: { status: 'onboarding', ago: '25 hours', prog: P(1) },
    B: { status: 'onboarding', ago: '73 hours', prog: P(3) },
    C: { status: 'onboarding', ago: '2 hours', prog: P(1) },
    D: { status: 'onboarding', ago: '30 hours', prog: P(1), seen: "now() - interval '5 minutes'" },
    E: { status: 'active', ago: '100 hours', prog: P(5) },
    F: { status: 'onboarded', ago: '100 hours', prog: JSON.stringify({ ...JSON.parse(P(5)), media: { status: 'done' } }) },
    G: { status: 'onboarding', ago: '30 hours', prog: P(1), nudges: `jsonb_build_object('suppress_until', now() + interval '3 days')` },
  };
  let i = 0;
  for (const [k, r] of Object.entries(rows)) {
    i += 1;
    q(`INSERT INTO auth.users (id, email) VALUES ('${uid(k)}', 'synthetic.onb${k.toLowerCase()}@example.com')`);
    q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, whatsapp_number, phone_number, status, brand_id,
         onboarding_progress, onboarding_last_progress_at, last_seen_at, onboarding_nudges)
       VALUES ('${bid(k)}', '${uid(k)}', 'Synthetic Practice ${k} (TEST ONLY)', 'Synth${k} Adviser', 'synthetic.onb${k.toLowerCase()}@example.com',
         '+2760000050${i}', '+2760000050${i}', '${r.status}', '${BRAND}', '${r.prog}'::jsonb, now() - interval '${r.ago}', ${r.seen || 'NULL'}, ${r.nudges || "'{}'::jsonb"})`);
  }

  // n8n's Postgres node returns timestamptz as JS Date -> ISO with milliseconds (microseconds are dropped)
  const find = () => {
    const sql = nd('Find due nudges').parameters.query.trim().replace(/;\s*$/, '');
    const [[json]] = [q(`SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (\n${sql}\n) x`, [BRAND])];
    return JSON.parse(json[0]).map((r) => ({ ...r, onboarding_last_progress_at: new Date(r.onboarding_last_progress_at).toISOString() }));
  };
  const nudges = (k) => JSON.parse(q(`SELECT onboarding_nudges FROM public.brokers WHERE id = '${bid(k)}'`)[0][0]);
  // One sweep tick, exactly the node chain; returns what Build nudge emitted (and marks, as the IF -> Mark branch does).
  const sweep = async (sastHour = 10) => {
    const gate = await code('Within send hours (08:00-19:00 SAST)?', [{}], { sastHour });
    if (!gate.length) return { gated: true, items: [] };
    const due = find();
    const items = due.length ? await code('Build nudge', due) : [];
    for (const it of items.filter(carriesMark)) {
      const r = q(nd('Mark nudge sent (at-most-once)').parameters.query, [it.broker_id, it.mark.since, it.mark.due]);
      assert.equal(r.length, 1, 'mark updates exactly the nudged broker');
    }
    return { gated: false, due, items };
  };
  const ofBroker = (items, k) => items.filter((x) => x.broker_id === bid(k) || x.scope === `broker:${bid(k)}`);
  // Moves a broker's clock back by h hours (stall start and its stored "since" together, as real time passing does).
  const age = (k, h) => q(`UPDATE public.brokers SET onboarding_last_progress_at = onboarding_last_progress_at - interval '${h} hours',
      onboarding_nudges = CASE WHEN onboarding_nudges ? 'since' THEN jsonb_set(onboarding_nudges, '{since}', to_jsonb(((onboarding_nudges->>'since')::timestamptz - interval '${h} hours'))) ELSE onboarding_nudges END
    WHERE id = '${bid(k)}'`);

  // (1) Quiet hours: at 21:00 SAST the sweep stops before any SQL; nothing is marked
  const night = await sweep(21);
  assert.equal(night.gated, true);
  assert.deepEqual(nudges('A'), {}); assert.deepEqual(nudges('B'), {});
  assert.equal((await code('Within send hours (08:00-19:00 SAST)?', [{}], { sastHour: 7 })).length, 0, '07:00 still quiet');
  assert.equal((await code('Within send hours (08:00-19:00 SAST)?', [{}], { sastHour: 8 })).length, 1, '08:00 sends');
  assert.equal((await code('Within send hours (08:00-19:00 SAST)?', [{}], { sastHour: 19 })).length, 0, '19:00 quiet');

  // (2) 08:00 tick: A gets the 24 h nudge naming "Connect your Outlook calendar"; B (73 h, nothing sent) gets the 72 h set
  const s1 = await sweep(8);
  assert.deepEqual(s1.due.map((r) => r.broker_id).sort(), [bid('A'), bid('B')].sort(), 'only A and B are due (C fresh, D in portal, E live, F media done, G suppressed)');
  const [a24] = ofBroker(s1.items, 'A');
  assert.equal(ofBroker(s1.items, 'A').length, 1);
  assert.deepEqual([a24.channel, a24.template, a24.to, a24.log_type], ['wa', 'broker_onb_nudge_24h', '+27600000501', 'nudge_24h']);
  assert.deepEqual(a24.params.slice(0, 3), ['SynthA', 'Connect your Outlook calendar', '1 minute']);
  assert.equal(a24.params.length, templateCounts('broker_onb_nudge_24h').body, '24 h params match the submitted template');
  assert.deepEqual(a24.buttons, [{ index: 0, suffix: 'calendar' }]);
  const b = ofBroker(s1.items, 'B');
  assert.deepEqual(b.map((x) => x.channel), ['wa', 'email', 'w22'], '72 h = WhatsApp + email + console to-do (W22 amber)');
  assert.equal(b[0].template, 'broker_onb_nudge_72h'); assert.equal(b[0].params[1], 'Sign your agreement');
  assert.equal(b[0].params.length, templateCounts('broker_onb_nudge_72h').body, '72 h params match the submitted template');
  assert.equal(b[1].cta.url, 'https://app.leadvelocity.co.za/s/agreement');
  assert.deepEqual([b[2].signal_key, b[2].severity, b[2].scope], ['broker_onboarding_stalled', 'amber', `broker:${bid('B')}`]);
  assert.ok(nudges('A')['24h'] && !nudges('A')['72h']);
  assert.ok(nudges('B')['72h'] && nudges('B')['24h'], 'a 72 h mark also closes the 24 h slot');
  // the WhatsApp branch under DRY_RUN_SENDS=true: composed, never sent
  const wa = await code('Compose WhatsApp payload', s1.items.filter((x) => x.channel === 'wa'));
  assert.ok(wa.every((x) => x.send === false && x.skip_reason === 'dry_run_not_allow_listed'));
  assert.equal(wa[0].payload.template.name, 'broker_onb_nudge_24h');
  assert.equal(wa[0].payload.template.components[0].parameters.length, a24.params.length);

  // (3) The next ticks (30 min later, and again): nobody is nudged twice for the same stall
  assert.deepEqual((await sweep(8)).items, [], 'second tick: nothing');
  assert.deepEqual((await sweep(12)).items, [], 'third tick: nothing');

  // (4) 48 h later A crosses 72 h: second nudge (72 h wording) + email + to-do; then never a third
  age('A', 48);
  const s2 = await sweep(10);
  assert.deepEqual(ofBroker(s2.items, 'A').map((x) => [x.channel, x.template || null]), [['wa', 'broker_onb_nudge_72h'], ['email', null], ['w22', null]]);
  assert.equal(ofBroker(s2.items, 'B').length, 0, 'B already had its 72 h');
  age('A', 200); age('B', 200);
  assert.deepEqual((await sweep(10)).items, [], 'never a third nudge, however long the stall');

  // (5) Progress resets the clock: A finishes "calendar" -> no nudge now; the new stall nudges again after 24 h
  q(`UPDATE public.brokers SET onboarding_progress = onboarding_progress || '{"calendar":{"status":"done"}}'::jsonb, onboarding_last_progress_at = now() WHERE id = '${bid('A')}'`);
  assert.deepEqual((await sweep(10)).items, [], 'right after progress: nothing');
  q(`UPDATE public.brokers SET onboarding_last_progress_at = onboarding_last_progress_at - interval '25 hours' WHERE id = '${bid('A')}'`);
  const s3 = await sweep(10);
  const [a2] = ofBroker(s3.items, 'A');
  assert.deepEqual([a2.template, a2.params[1]], ['broker_onb_nudge_24h', 'Check your hours'], 'new stall, next step, 24 h wording');
  assert.deepEqual((await sweep(10)).items, [], 'and only once');
});
