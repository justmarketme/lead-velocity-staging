#!/usr/bin/env node
// Renders the "SortMyCover Build Progress" page from build/tasks.json + git.
// Usage: node build/progress-page.mjs <out.html>   (orchestrator republishes the artifact from it)
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const out = process.argv[2] || 'build/progress.html';
const t = JSON.parse(fs.readFileSync('build/tasks.json', 'utf8'));
const nodes = t.nodes;
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- numbers -------------------------------------------------------------
const total = nodes.length;
const by = (st) => nodes.filter((n) => n.status === st);
const green = by('green').length, running = by('in_progress'), nh = by('needs_human'), pending = by('pending').length;
const gates = nodes.filter((n) => n.human_gate);
const nonGate = nodes.filter((n) => !n.human_gate);
const nonGateGreen = nonGate.filter((n) => n.status === 'green').length;
const pct = Math.round((green / total) * 100);
const pctSelf = Math.round((nonGateGreen / nonGate.length) * 100);
const decisions = nh.filter((n) => /^NH-/.test(n.id));
const openGates = gates.filter((n) => !/^NH-/.test(n.id) && n.status !== 'green');

const PH = { '0': 'Phase 0 · Lock & long poles', '1': 'Phase 1 · Confirm & brand', '2': 'Phase 2 · Build', '3': 'Phase 3 · Creative decisions', '4': 'Phase 4 · Review decisions', '4b': 'Phase 4b · Platform', '5': 'Phase 5 · Pre-live (Section 7)', '5b': 'Phase 5b · Go live' };
const ORDER = ['0', '1', '2', '4b', '3', '4', '5', '5b'];
const phases = ORDER.map((p) => {
  const xs = nodes.filter((n) => String(n.phase) === p);
  const c = {};
  for (const x of xs) c[x.status] = (c[x.status] || 0) + 1;
  return { p, label: PH[p] || 'Phase ' + p, n: xs.length, c };
}).filter((x) => x.n);
const LBL = { green: 'Done', in_progress: 'In progress', needs_human: 'Needs you', pending: 'Not started' };

// ---- git ------------------------------------------------------------------
const base = 'f940a94';
const commits = sh(`git log --format='%ad|%h|%s' --date=format:'%Y-%m-%d %H:%M' -18`).split('\n').map((l) => l.split('|'));
const stat = sh(`git diff --shortstat ${base} HEAD`);
const nCommits = sh(`git rev-list --count ${base}..HEAD`);
const now = new Date().toUTCString().replace(/:\d\d GMT$/, ' UTC');

// ---- hand-kept: what is built (edit each tick) ---------------------------------
const BUILT = [
  ['Database schema', 'done', '13 migrations drafted and validated twice on a local Postgres stub. <b>Not applied to the live project</b> until you answer NH-15 (security fixes) and NH-11 (schema dump).'],
  ['Automation (n8n)', 'run', 'All 35 workflows plus the four shared sub-workflows exist as drafts and run through their tests against the real workflow code. The 8 core-path flows (W01, W04–W06, W09, W12, W13, W15) wait for your approval of their acceptance tests. n8n runs for real in the sandbox: all files import and a synthetic WhatsApp conversation runs end to end in dry-run.'],
  ['WhatsApp templates', 'wait', '56 templates drafted with samples (fictional adviser, FSP 00000). Nothing submitted to Meta; submission is your click (GATE-TEMPLATES).'],
  ['Broker portal + admin console', 'done', 'Built in the existing CRM behind a feature flag (off by default): onboarding wizard, calendar connect, billing, weekly report, intro recorder, pulse screen, console on admin-only RPCs.'],
  ['Landing pages + holding site', 'done', 'Quiz template, 10 angle pages, holding site with the full privacy page and first-party opt-out. Staging only; nothing public.'],
  ['Creative', 'done', '15 concepts, 111 code-rendered assets (stills, Reels, stories, end cards, intro cards), palette B test arm, first batch of 16 ads. Review-5 re-renders done.'],
  ['Conversation AI (Thandi)', 'done', 'Persona, state machine, guardrail classifier, golden set + 126 red-team turns, EN/AF lines, FAQ v1.0.3. Eval gate passes at 100%.'],
  ['Contracts + compliance pack', 'wait', 'Broker agreement (incl. Schedule C1A), privacy notice v1.1, consent, PAIA, NCC pack, practitioner brief Q1–Q24. All DRAFT: they need your company details (NH-20) and the practitioner opinion.'],
  ['Billing', 'done', 'Paystack checkout, Instant EFT, manual EFT with inContact parsing, renewals and reminders (W16–W19, W25). Live only after Paystack KYC (your login).'],
  ['Compliance QA', 'done', '5 reviews done; fix waves 1–5 applied (every review-4 blocking item is closed in code; review 6 runs after the next build wave).'],
  ['Infrastructure', 'wait', 'Docker + tunnel for local staging, VPS runbook, backups, CORS, secrets guard, edge function skeleton. VPS is bought only after first payment (GATE-VPS).'],
  ['Tests', 'done', '781 offline tests green across every suite, including a repo-wide check that no workflow can send WhatsApp, SMS or email while dry-run is on. Rehearsal round 4: all 8 stages (lead in, first touch, slots, booking, reminders, outcome, no-show + replacement, STOP) pass end to end on the local n8n from a real page submission, with zero messages reaching the outside world.'],
];
const PILL = { done: ['Drafted & tested', 'p-ok'], run: ['In progress', 'p-run'], wait: ['Waiting on you', 'p-wait'] };

const TODAY = [
  'Microsoft 365 calendar connect for the broker (sign-in, callback, disconnect; token stored only in the vault).',
  'Intro-script generator: three FAIS-checked script options from the interview, plus a live re-check for edits.',
  'POPIA operations (W34): subject requests, retention, media erase via a signed edge-function call.',
  'Compliance review 5: all review-4 blocking items closed; five tidy-ups applied; "No thanks" now suppresses the number on every path.',
  'Guard that fails the build if any generated workflow drifts from its generator.',
  'Lighthouse mobile run on all 10 landing pages in the sandbox (performance 99–100, LCP under 1.5 s): the 13 landing-page nodes are now green.',
  'The eight core-path workflows (lead intake, first touch, slots, book, reminders, outcome and broker feedback, no-show and replacement counter, opt-out) exist as inactive drafts against their drafted tests; they turn green when you approve the tests.',
  'n8n runs for real in the sandbox: all committed workflows import, and a synthetic WhatsApp message now runs end to end through the assistant in dry-run (rows in the database, reply drafted, nothing sent), and the run caught a real loop that would have made 55 paid AI calls per message in production. Fixed.',
  'Section 7 readiness checker, make check, WCAG AA pass, portal explainer clip, consumer terms page.',
  'Session 2: round 3 findings fixed - the test clock now reaches the slot check, STOP leaves an evidence trail, and the 12 WhatsApp sends that slipped past dry-run were traced to the ops-alert sender and closed in 10 workflows. Wave 2: the last ungated sender (the meeting-invite email) is gated, and Meta now only hears a meeting was attended once the lead has confirmed or KG has decided. Rehearsal round 4 passed all 8 stages, from a real form submission through booking, reminders, the broker feedback tap, a no-show replacement and STOP cancelling a live booking; zero messages left the dry-run.',
  'Session 2 waves 3-4: a cancelled or moved meeting now comes off the calendar it was actually booked in (shared howzit@ or the broker\'s own); the broker gets a WhatsApp notice when a lead opts out after hours; the "add to calendar" link in confirmations now works (signed, no lead details exposed).',
  'Session 2 wave 5 (go-live checklist work that needs no logins): the booking endpoint now has bot protection and rate limits (the page retries once with a fresh check); the draft comment hide-word list is ready for your approval; all 10 landing pages score 99-100 on mobile Lighthouse locally; every SortMyCover price now comes from the pricing table (old B2B prices left alone pending NH-14).',
  'Your decisions applied (session 2): cycle 1 is paid by EFT and marked paid with one tap in the console (Paystack and FNB alerts built but off, no bank details anywhere); the old B2B tiers are off the public site; 6 ads in the cycle-1 set with the budget VAT-correct (R246/day entered); a KG "not attended" ruling counts as a no-show with a replacement. Also: accessibility clean on every static page, breach-report emails raise an alert, two new high-intent ads drafted and rendered, 113 old integration items verified closed and 18 more built.',
  'Owner items closed alongside round 4: the landing "I\'ll pick a time on WhatsApp" button now tells the system so the slots card goes out at once; the ads-budget "lower" call at cycle end now means "pause this broker\'s spend" instead of being dropped; a machine-checked secret-rotation runbook (34 credential copies, 16 secrets); the broker-video storage decision (Supabase Storage, your S3 key pair needed); a new broker "lead opted out" WhatsApp template (56 now); community escalations no longer promise a human within 30 minutes.',
  'Compliance review 6 (33 pass, 4 medium items being fixed) and a real security bug caught before it mattered: inbound WhatsApp signatures were not actually being checked. Fixed and tested.',
  'Microsoft connect hardening: refresh token never lands in an error log; expired app secret raises a red alert; FSCA check records the verified FSP on the broker row.',
  'Template review samples signed off (FSP 00000, SAMPLE tag from frame 0).',
  'Creative: the full disclosure line now sits on every video end card (31 re-rendered); wide intro card layout fixed; brokers can no longer read any lead-pulse row.',
];

// ---- render -------------------------------------------------------------------
const bar = (c) => ['green', 'in_progress', 'needs_human', 'pending'].filter((k) => c[k]).map((k) => `<i class="s-${k}" style="flex:${c[k]}" title="${LBL[k]}: ${c[k]}"></i>`).join('');
const keys = (c) => ['green', 'in_progress', 'needs_human', 'pending'].filter((k) => c[k]).map((k) => `${LBL[k]} ${c[k]}`).join(' · ');
const owners = {};
for (const r of running) owners[r.owner] = (owners[r.owner] || 0) + 1;
const li = (n) => `<li><code>${esc(n.id)}</code> ${esc((n.title || '').slice(0, 150))}${(n.title || '').length > 150 ? '…' : ''}${n.section ? ` <small>§${esc(n.section)}</small>` : ''}</li>`;

const html = `<title>SortMyCover Build Progress</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&display=swap">
<style>
/* Layout: one column; headline number first, then what is built, phase bars, what is running, what waits on Jonathan. Brand kit colours (amber on warm neutral). */
:root{--bg:#FBF8F2;--fg:#1F2933;--muted:#5C6672;--rule:#DCD6CB;--card:#FFFFFF;--amber:#F5A623;--amber-ink:#2A1B02;
  --ok:#2E7D4F;--ok-bg:#DDEFE3;--run:#F5A623;--run-bg:#FBE9C7;--wait:#B4541A;--wait-bg:#F7DFCF;--idle:#C9C3B8;
  --font:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15191F;--fg:#F1ECE2;--muted:#A8B0BA;--rule:#2F3842;--card:#1F2933;--ok:#5CB882;--ok-bg:#1F3A2B;--run:#F5A623;--run-bg:#4A3510;--wait:#E6895A;--wait-bg:#3F2A18;--idle:#3A4450;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15191F;--fg:#F1ECE2;--muted:#A8B0BA;--rule:#2F3842;--card:#1F2933;--ok:#5CB882;--ok-bg:#1F3A2B;--run:#F5A623;--run-bg:#4A3510;--wait:#E6895A;--wait-bg:#3F2A18;--idle:#3A4450;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:15px;line-height:1.45}
.wrap{max-width:760px;margin:0 auto;padding-block:20px 48px;padding-inline:16px;display:grid;gap:22px}
h1{font-size:clamp(22px,4vw,28px);font-weight:800;letter-spacing:-.01em;margin:0;text-wrap:balance}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;font-weight:700}
.sub{color:var(--muted);margin:4px 0 0;font-size:14px}
.hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;background:var(--card);border:1px solid var(--rule);border-radius:16px;padding:18px}
.ring{width:118px;height:118px;border-radius:50%;background:conic-gradient(var(--ok) 0 ${pct}%, var(--run) ${pct}% ${pct + Math.round(running.length / total * 100)}%, var(--idle) 0);display:grid;place-items:center;flex:none}
.ring b{width:88px;height:88px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.hero p{margin:0}
.hero>div{min-width:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
.kpi{border:1px solid var(--rule);border-radius:10px;padding:8px 10px}
.kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums;line-height:1.1}
.kpi span{font-size:12px;color:var(--muted)}
.ph{display:grid;gap:5px;padding:10px 0;border-top:1px solid var(--rule)}
.ph:first-of-type{border-top:0}
.ph-h{display:flex;justify-content:space-between;gap:10px}
.num{font-variant-numeric:tabular-nums;color:var(--muted)}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--idle);gap:2px}
.bar i{display:block;height:100%}
.s-green{background:var(--ok)}.s-in_progress{background:var(--run)}.s-needs_human{background:var(--wait)}.s-pending{background:var(--idle)}
.ph-k{font-size:12px;color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px}
.card{background:var(--card);border:1px solid var(--rule);border-radius:16px;padding:16px 18px}
ul{margin:0;padding-left:18px;display:grid;gap:6px}
li small{color:var(--muted);margin-left:4px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:var(--bg);border:1px solid var(--rule);border-radius:4px;padding:0 4px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--run-bg);color:var(--fg)}
.chip b{font-variant-numeric:tabular-nums}
.todo{background:var(--amber);color:var(--amber-ink);border-radius:12px;padding:12px 14px}
.todo b{display:block;font-size:15px}
.todo p{margin:6px 0 0;font-size:14px}
.built{display:grid;gap:0}
.row{display:grid;grid-template-columns:170px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--rule);align-items:start}
.row:first-child{border-top:0}
.row b{font-size:14px}
.row p{margin:4px 0 0;font-size:13.5px;color:var(--muted)}
.pill{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.03em;padding:2px 8px;border-radius:999px;margin-top:4px}
.p-ok{background:var(--ok-bg);color:var(--ok)}.p-run{background:var(--run-bg);color:var(--amber-ink)}.p-wait{background:var(--wait-bg);color:var(--wait)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .p-run{color:var(--fg)}}
:root[data-theme="dark"] .p-run{color:var(--fg)}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:6px 6px;border-bottom:1px solid var(--rule);vertical-align:top}
td:first-child{white-space:nowrap;color:var(--muted)}
.tw{overflow-x:auto;min-width:0}
.foot{font-size:12.5px;color:var(--muted)}
details{border:0}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px}
summary::-webkit-details-marker{display:none}
summary h2{margin:0}
summary:after{content:"+";color:var(--amber);font-weight:800;font-size:22px;line-height:1}
details[open] summary:after{content:"–"}
details ul{margin-top:10px}
li{overflow-wrap:anywhere}
a{color:inherit}
summary:focus-visible,a:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
@media (max-width:520px){
  .wrap{gap:14px;padding-block:14px 40px}
  .hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:16px}
  .hero .kpis{grid-template-columns:1fr 1fr;width:100%;text-align:left}
  .ring{width:132px;height:132px} .ring b{width:100px;height:100px;font-size:30px}
  .card{padding:14px}
  .row{grid-template-columns:1fr;gap:2px}
  .ph-h{flex-direction:column;gap:2px} .ph-h b{font-size:14px}
  .chip{min-height:36px;display:inline-flex;align-items:center}
  td:first-child{font-size:11px}
}
</style>
<div class="wrap">
  <header>
    <h1>SortMyCover build</h1>
    <p class="sub">Updated ${esc(now)}. Read from <code>build/tasks.json</code> on the build branch (PR #4). Republished at each check-in.</p>
  </header>

  <section class="hero">
    <div class="ring"><b>${pct}%</b></div>
    <div>
      <p><b>${green} of ${total} tasks done.</b> ${running.length} in progress, ${nh.length} waiting on you, ${pending} queued behind those.</p>
      <p class="sub">Counting only tasks the build can do without you: <b>${pctSelf}%</b> done (${nonGateGreen} of ${nonGate.length}).</p>
      <div class="kpis">
        <div class="kpi"><b>${running.length}</b><span>tasks in progress</span></div>
        <div class="kpi"><b>${decisions.length}</b><span>decisions waiting on you</span></div>
        <div class="kpi"><b>${openGates.length}</b><span>logins / money / approvals</span></div>
        <div class="kpi"><b>781</b><span>offline tests green</span></div>
      </div>
    </div>
  </section>

  <section class="todo">
    <b>The three answers that unblock the most</b>
    <p><b>GATE-DOMAINS</b> (register sortmycover.co.za + .com, the only pre-payment spend, ~R250), <b>NH-15</b> (apply the security fixes to the live CRM) and <b>NH-11</b> (a read-only schema dump of the live Supabase project). Until those land, the database stays on the local stub and nothing can be deployed. Then the A2 rows in <code>build/gates-batch.md</code>; each has a recommended default.</p>
  </section>

  <section class="card">
    <h2>What is built</h2>
    <div class="built">${BUILT.map(([k, s, d]) => `<div class="row"><div><b>${k}</b><br><span class="pill ${PILL[s][1]}">${PILL[s][0]}</span></div><p>${d}</p></div>`).join('')}</div>
  </section>

  <section class="card">
    <h2>Landed today (${new Date().toISOString().slice(0, 10)})</h2>
    <ul>${TODAY.map((x) => `<li>${x}</li>`).join('')}</ul>
  </section>

  <section class="card">
    <h2>By phase</h2>
    ${phases.map((x) => `<div class="ph"><div class="ph-h"><b>${esc(x.label)}</b><span class="num">${x.c.green || 0}/${x.n} done</span></div><div class="bar">${bar(x.c)}</div><div class="ph-k">${keys(x.c)}</div></div>`).join('')}
    <div class="legend" style="margin-top:8px"><span><i class="s-green"></i>Done</span><span><i class="s-in_progress"></i>In progress</span><span><i class="s-needs_human"></i>Needs you</span><span><i class="s-pending"></i>Not started</span></div>
    <p class="foot" style="margin:8px 0 0">Phases 3 and 4 hold only decisions for you (creative sign-offs and review items); the build work for them sits in Phase 2 and 4b.</p>
  </section>

  <section class="card">
    <h2>In progress</h2>
    <div class="chips">${Object.entries(owners).sort((a, b) => b[1] - a[1]).map(([o, c]) => `<span class="chip">${esc(o)} <b>${c}</b></span>`).join('')}</div>
    <details><summary><h2 style="margin:10px 0 0">Tasks in flight (${running.length})</h2></summary><ul>${running.map(li).join('')}</ul></details>
    <p class="foot" style="margin:8px 0 0">"In progress" means the draft exists and is tested offline but still has open integration items; it turns green once the last item closes and the acceptance test is approved.</p>
  </section>

  <section class="card"><details open><summary><h2>Waiting on you · decisions (${decisions.length})</h2></summary>
    <p class="sub" style="margin:8px 0">Each has a recommended default in <code>build/gates-batch.md</code>; the build carries on with the default until you say otherwise. Money, legal and publish decisions are never taken without your word.</p>
    <ul>${decisions.map(li).join('')}</ul></details>
  </section>

  <section class="card"><details><summary><h2>Waiting on you · logins, money, approvals (${openGates.length})</h2></summary>
    <p class="sub" style="margin:8px 0">Most need the laptop. None block the drafting work today; all block go-live.</p>
    <ul>${openGates.map(li).join('')}</ul></details>
  </section>

  <section class="card"><details><summary><h2>Latest commits</h2></summary>
    <div class="tw" style="margin-top:8px"><table>${commits.map(([d, h, s]) => `<tr><td class="num">${esc(d)}</td><td><code>${esc(h)}</code></td><td>${esc(s.slice(0, 120))}</td></tr>`).join('')}</table></div>
    <p class="foot">${esc(stat)} across ${esc(nCommits)} commits since the branch started. Nothing bought, published, submitted to Meta/Paystack/NCC, applied to the live database, or sent to a real person.</p></details>
  </section>
</div>
`;
fs.writeFileSync(out, html);
console.log(`wrote ${out}: ${total} nodes, ${green} green (${pct}%), ${running.length} in progress, ${nh.length} needs_human, ${openGates.length} open gates`);
