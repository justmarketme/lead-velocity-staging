#!/usr/bin/env node
// Broker weekly report: email HTML + print-ready HTML (for the emailed PDF), from one W14 `broker_report/1` payload.
// Spec: automation/W14-broker.md ("Email and PDF"), design docs/design/broker-weekly-report.html (templatised, not redesigned).
// Zero dependencies, Node 18+. Brand colours and type come from brand/tokens.css at build time (no colour literals here).
// POPIA: every person (lead) is shown by initials only, in both outputs; the broker's own name is not printed either.
//
// Usage:
//   node scripts/build-broker-report-email.mjs <payload.json> [--key weekly_close_rate] [--out <dir>]
//        [--report-id <uuid>] [--portal-url <base>] [--pdf]
//   <payload.json> is either one payload or the W14 fixture (pick one with --key).
//   Writes <out>/<stem>.email.html, <out>/<stem>.print.html (and <stem>.pdf with --pdf, headless Chromium),
//   and prints {subject, files, pdf_name} as JSON. W14 queues an ops.notifications email row naming this script;
//   the sender (Graph sendMail from howzit@, bcc howzit@) attaches the PDF.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TZ = 'Africa/Johannesburg';

// ---------------------------------------------------------------- tokens
export function loadTokens(file = join(REPO, 'brand', 'tokens.css')) {
  const css = readFileSync(file, 'utf8');
  const raw = {};
  for (const m of css.matchAll(/--(sm-[\w-]+)\s*:\s*([^;]+);/g)) if (!(m[1] in raw)) raw[m[1]] = m[2].trim();
  const resolveVar = (v, depth = 0) => v.replace(/var\(--(sm-[\w-]+)\)/g, (_, k) => {
    if (depth > 5 || !(k in raw)) throw new Error(`tokens.css: unresolved var(--${k})`);
    return resolveVar(raw[k], depth + 1);
  });
  const t = {};
  for (const [k, v] of Object.entries(raw)) t[k.replace(/^sm-/, '')] = resolveVar(v);
  if (t.font) t.font = t.font.replace(/"/g, "'");          // used inside style="..." attributes
  for (const need of ['bg', 'text', 'accent', 'accent-text', 'surface', 'surface-raised', 'text-muted', 'border', 'bg-inverse', 'text-inverse',
    'bg-dark', 'surface-dark', 'text-dark', 'amber-dark', 'white', 'font', 'radius-sm', 'radius-md'])
    if (!t[need]) throw new Error(`tokens.css: --sm-${need} missing`);
  return t;
}

// ---------------------------------------------------------------- words
export const BANNED = /(spen[dt]|\bcpl\b|\bcpc\b|\bctr\b|cost per|\bmargin\b|creative|campaign|adset|\bemq\b|\bcapi\b|attribution|\broas\b|cheapest|\bbest\b|guarantee|our funnel|\bappointments?\b|no contract)/i;
const METHOD = { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', google_meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone call' };
const OUTCOME = { attended: 'Attended', no_show: 'No-show', rescheduled: 'Rescheduled', cancelled: 'Cancelled' };
const DISPO = {
  fit_proceeding: 'Good fit, proceeding', fit_followup: 'Good fit, needs follow-up', nofit_budget: 'Not a fit, budget',
  nofit_covered: 'Not a fit, already well covered', nofit_criteria: 'Not a fit, outside criteria', unreachable: 'Unreachable or wrong number',
};
const LIGHT = { green: 'On track', amber: 'Watch', red: 'Behind' };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pct = (x) => (x == null || Number.isNaN(Number(x)) ? 'n/a' : `${Math.round(Number(x) * 100)}%`);
const num = (x) => (x == null || Number.isNaN(Number(x)) ? 'n/a' : String(Math.round(Number(x) * 10) / 10));
/**
 * I-43c: the broker-facing lead pulse. Per cycle only, no target, no last week, no change. The payload's figure is already held until 5 new
 * answers arrive (facts.broker_pulse), so a broker cannot difference two reports down to one lead's answer (W35-pulse-visibility.md);
 * this renderer prints only what the payload carries and refuses a figure from under 5 answers.
 */
export function pulseText(lp) {
  if (!lp || lp.shown !== true) return 'Fewer than 5 answers yet';
  const n = Number(lp.n), up = Number(lp.up);
  if (!Number.isInteger(n) || !Number.isInteger(up) || n < 5 || up < 0 || up > n) throw new Error(`lead pulse must be a per-cycle figure from 5 or more answers (got ${lp.up} of ${lp.n})`);
  return `${up} of ${n} people (answers so far this cycle)`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Initials only for any person: "S. L." from {first_name, initial}. Never returns a name. */
export function initials(p) {
  const a = String((p && p.first_name) || '').trim().charAt(0).toUpperCase();
  const b = String((p && p.initial) || '').trim().charAt(0).toUpperCase();
  return [a, b].filter(Boolean).map((c) => `${c}.`).join(' ') || 'n/a';
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
const dayMonth = (ymd) => { const d = new Date(`${ymd}T12:00:00Z`); return Number.isNaN(d.getTime()) ? 'n/a' : new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d); };

const todoCount = (p) => { const t = (p.s3_meetings && p.s3_meetings.todos) || {}; return (t.unmarked || []).length + (t.followups_due || []).length; };

export function subjectFor(p) {
  const s = p.s2_progress || {}; const d = s.delivered || {};
  const n = todoCount(p);
  if (p.edition === 'midcycle') return `Day 15 of your cycle · ${d.v}/${d.committed} delivered · ${n ? plural(n, 'thing', 'things') + ' to do' : 'all caught up'}`;
  if (p.edition === 'cycle_end') return `Your ${p.cycle && p.cycle.label} cycle summary`;
  return `Your SortMyCover week · ${d.v}/${d.committed} delivered · ${n ? plural(n, 'thing', 'things') + ' to do' : 'all caught up'}`;
}

export function pdfName(p) {
  const wk = p.week_of_cycle == null ? 'x' : p.week_of_cycle;
  const ref = (p.cycle && (p.cycle.ends || p.cycle.starts)) || '';
  const d = new Date(`${ref}T12:00:00Z`);
  const mon = Number.isNaN(d.getTime()) ? 'cycle' : new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: TZ }).format(d);
  const yr = Number.isNaN(d.getTime()) ? '' : `-${d.getUTCFullYear()}`;
  const kind = p.edition === 'cycle_end' ? 'cycle-summary' : p.edition === 'midcycle' ? 'day-15' : `week-${wk}`;
  return `SortMyCover-${kind}-${mon}${yr}.pdf`;
}

function heading(p) {
  const c = p.cycle || {};
  if (p.edition === 'midcycle') return `Day 15 of your ${c.label || ''} cycle`;
  if (p.edition === 'cycle_end') return `Your ${c.label || ''} cycle summary`;
  const wk = p.week_of_cycle > (p.weeks_in_cycle || 4) ? `Week ${p.week_of_cycle} (extension)` : `Week ${p.week_of_cycle}`;
  return `${wk} of your ${c.label || ''} cycle`;
}

// ---------------------------------------------------------------- sections (shared by email and print)
function sections(p, t, o) {
  const S = {};
  const sp = p.s2_progress || {}; const d = sp.delivered || {}; const b = sp.booked || {}; const sr = sp.show_rate || {}; const rp = sp.replacements || {};
  const pill = (light) => {
    const bg = light === 'amber' ? t.accent : light === 'red' ? t['amber-dark'] : t['surface-raised'];
    const fg = light === 'amber' ? t['accent-text'] : light === 'red' ? t.white : t.text;
    return light ? ` <span style="display:inline-block;padding:1px 8px;border-radius:${t['radius-sm']};background:${bg};color:${fg};font-size:12px;font-weight:700">${esc(LIGHT[light] || light)}</span>` : '';
  };
  const row = (label, value, note) => `<tr><td class="smc-text" style="padding:8px 0;border-bottom:1px solid ${t.border};color:${t.text};font-size:15px">${esc(label)}</td>`
    + `<td class="smc-text" style="padding:8px 0;border-bottom:1px solid ${t.border};color:${t.text};font-size:15px;font-weight:700;text-align:right">${value}</td></tr>`
    + (note ? `<tr><td colspan="2" class="smc-muted" style="padding:0 0 8px;color:${t['text-muted']};font-size:13px">${esc(note)}</td></tr>` : '');
  const tl = (f, fmt = num) => [f && f.target != null ? `target ${fmt(f.target)}` : 'target n/a', f && f.last != null ? `last week ${fmt(f.last)}` : 'last week n/a'].join(' · ');

  S.s1 = `<p class="smc-text" style="margin:0;font-size:17px;line-height:1.4;color:${t.text};font-weight:700">${esc(p.s1_one_line)}</p>`;

  S.s2 = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + row('Leads delivered', `${esc(d.v)} of ${esc(d.committed)}`, tl(d))
    + row('Verified on WhatsApp', esc(num((sp.verified || {}).v)), tl(sp.verified))
    + row('Booked', `${esc(num(b.v))}${b.rate != null ? ` (${esc(pct(b.rate))} of verified)` : ''}`, [b.target != null ? `target ${pct(b.target)} booked` : 'target n/a', b.last != null ? `last week ${num(b.last)}` : 'last week n/a'].join(' · '))
    + row('Showed up', esc(num((sp.attended || {}).v)), tl(sp.attended))
    + row('Show rate', esc(pct(sr.v)) + pill(sr.light), tl(sr, pct))
    + row('Replacements used', esc(rp.used), `last week ${rp.last_used == null ? 'n/a' : rp.last_used}`)
    + row('Days left in this cycle', esc(sp.days_left), null)
    + `</table>`;

  const m = p.s3_meetings || {}; const todos = m.todos || {};
  const li = (s) => `<li class="smc-text" style="margin:0 0 6px;color:${t.text};font-size:15px;line-height:1.4">${s}</li>`;
  const ul = (items, empty) => (items.length ? `<ul style="margin:0 0 12px;padding-left:20px">${items.join('')}</ul>` : `<p class="smc-muted" style="margin:0 0 12px;color:${t['text-muted']};font-size:14px">${esc(empty)}</p>`);
  const sub = (s) => `<p class="smc-text" style="margin:12px 0 6px;font-size:14px;font-weight:700;color:${t.text}">${esc(s)}</p>`;
  const last = (m.last_week || []).map((x) => li([esc(when(x.when)), esc(initials(x)), esc(METHOD[x.method] || x.method),
    esc(OUTCOME[x.outcome] || x.outcome) + (x.unconfirmed ? ' (not yet confirmed by you)' : ''),
    x.disposition ? esc(DISPO[x.disposition] || x.disposition) : null, x.quality != null ? `rated ${esc(x.quality)}/5` : null].filter(Boolean).join(' · ')));
  const next = (m.next_week || []).map((x) => li([esc(when(x.when)), esc(initials(x)), esc(METHOD[x.method] || x.method)].join(' · ')));
  const td = [
    ...(todos.unmarked || []).map((x) => li(`Mark the outcome for ${esc(initials(x))}`)),
    ...(todos.followups_due || []).map((x) => li(`Follow up with ${esc(initials(x))}${x.due ? ` by ${esc(dayMonth(x.due))}` : ''}`)),
    ...(todos.not_reached || []).map((x) => li(`${esc(initials(x))} says you have not reached them yet`)),
  ];
  S.s3 = sub('Last week') + ul(last, 'No meetings last week.') + sub('Coming up') + ul(next, 'Nothing booked yet for next week.') + sub('To do') + ul(td, 'Nothing to do. You are all caught up.');

  const q = p.s4_quality || {}; const mix = q.mix || {};
  const mixRows = Object.keys(DISPO).filter((k) => mix[k]).map((k) => li(`${esc(DISPO[k])}: ${esc(mix[k])}`));
  const themes = (q.themes || []).map((x) => li(`"${esc(x.text)}" (asked by ${esc(x.count)} of ${esc(x.of)})`));
  S.s4 = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + row('Your average rating', `${esc(num((q.avg_rating || {}).v))} / 5`, tl(q.avg_rating))
    + row('Meetings you rated', esc(pct((q.ratings_given || {}).v)), tl(q.ratings_given, pct))
    + (q.lead_pulse ? row('Said the call was worth their time', esc(pulseText(q.lead_pulse)), null) : '') + `</table>`
    + sub('How you marked them') + ul(mixRows, 'No outcomes marked yet.') + sub('What leads asked about') + ul(themes, 'Nothing stood out this week.');

  S.s5 = ul((p.s5_notice || []).map((x) => li(esc(x))), 'Nothing new this week.');

  // s6 (close rate / policies) is never rendered here (compliance-qa review 4 §2h): the email and its PDF are copied to
  // howzit@, so a policies-per-lead figure would become a Lead Velocity record (FAIS boundary). Portal-only, logged in.

  const a = p.s7_ask;
  const href = a ? `${o.portalUrl.replace(/\/$/, '')}/${String(a.deep_link || `ask/${o.reportId}`).replace(/^\//, '')}` : null;
  S.s7 = a
    ? `<p class="smc-text" style="margin:0 0 14px;font-size:16px;line-height:1.4;color:${t.text}">${esc(a.text)}</p>`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${t.accent}" style="border-radius:${t['radius-md']};background:${t.accent}">`
      + `<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${t.font};font-size:16px;font-weight:800;color:${t['accent-text']};text-decoration:none;border-radius:${t['radius-md']}">${esc(a.button || 'Do it now')}</a></td></tr></table>`
    : `<p class="smc-text" style="margin:0;font-size:16px;color:${t.text}">Nothing this week. You are all caught up.</p>`;

  S.s8 = `<p class="smc-text" style="margin:0;font-size:15px;color:${t.text}">${esc((p.s8_cycle || {}).line)}</p>`;
  return S;
}

function shell(p, t, o, body, { print }) {
  const pageCss = print
    ? `@page{size:A4;margin:12mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.smc-wrap{width:100%!important;max-width:100%!important}table.smc-wrap,table.smc-wrap>tbody,table.smc-wrap>tbody>tr,table.smc-wrap>tbody>tr>td,table.smc-outer,table.smc-outer>tbody,table.smc-outer>tbody>tr,table.smc-outer>tbody>tr>td{display:block;width:100%!important;box-sizing:border-box}body{zoom:.8}li,h2{break-inside:avoid;break-after:auto}h2{break-after:avoid}`
    : `@media (prefers-color-scheme: dark){.smc-bg{background:${t['bg-dark']}!important}.smc-card{background:${t['surface-dark']}!important}.smc-text{color:${t['text-dark']}!important}.smc-muted{color:${t['text-dark']}!important;opacity:.8}}`
      + `@media only screen and (max-width:620px){.smc-wrap{width:100%!important}}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
    + `<title>${esc(subjectFor(p))}</title><style>:root{color-scheme:light dark;supported-color-schemes:light dark}${pageCss}</style></head>`
    + `<body class="smc-bg" style="margin:0;padding:0;background:${t.bg};font-family:${t.font}">`
    + `<table role="presentation" class="smc-bg smc-outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg}"><tr><td align="center" style="padding:${print ? '0' : '16px 8px'}">`
    + `<table role="presentation" class="smc-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">`
    + `<tr><td style="background:${t['bg-inverse']};padding:18px 24px;border-radius:${t['radius-md']} ${t['radius-md']} 0 0">`
    + `<span style="font-size:20px;font-weight:800;color:${t.accent};letter-spacing:-0.01em">SortMyCover</span>`
    + `<span style="font-size:13px;color:${t['text-inverse']}"> · ${esc((p.broker || {}).practice)}${(p.broker || {}).fsp ? ` · FSP ${esc(p.broker.fsp)}` : ''}</span></td></tr>`
    + `<tr><td class="smc-card" style="background:${t.surface};padding:20px 24px 4px"><h1 class="smc-text" style="margin:0 0 4px;font-size:24px;line-height:1.1;font-weight:800;color:${t.text}">${esc(heading(p))}</h1>`
    + `<p class="smc-muted" style="margin:0;font-size:13px;color:${t['text-muted']}">${esc(p.week || '')}${o.print ? ' · lead names shown as initials' : ''}</p></td></tr>`
    + body
    + `<tr><td class="smc-card" style="background:${t.surface};padding:16px 24px 22px;border-top:1px solid ${t.border};border-radius:0 0 ${t['radius-md']} ${t['radius-md']}">`
    + `<p class="smc-muted" style="margin:0;font-size:12px;line-height:1.5;color:${t['text-muted']}">Sent by Lead Velocity from howzit@leadvelocity.co.za. Leads are shown by initials in email and PDF; the portal shows the full detail when you are signed in. Reply to this email if anything looks wrong.</p>`
    + `</td></tr></table></td></tr></table></body></html>`;
}

const block = (t, n, title, inner, cls = '') => `<tr><td class="smc-card smc-sec${cls}" style="background:${t.surface};padding:18px 24px 6px">`
  + `<h2 class="smc-muted" style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:${t['text-muted']}">${n} · ${esc(title)}</h2>${inner}</td></tr>`;

const defaults = (o = {}) => ({ portalUrl: o.portalUrl || process.env.PORTAL_URL || 'https://portal.example.invalid', reportId: o.reportId || 'report', tokens: o.tokens || loadTokens() });

/** Email body: payload sections 1, 2, 3, 4, 7, 8 (W14-broker.md). */
export function renderEmail(p, opts) {
  const o = defaults(opts); const t = o.tokens; const S = sections(p, t, o);
  const body = block(t, 1, 'This week', S.s1) + block(t, 2, 'Progress', S.s2) + block(t, 3, 'Your meetings', S.s3)
    + block(t, 4, 'Quality, in your words', S.s4) + block(t, 5, 'One thing to do', S.s7) + block(t, 6, 'Your cycle', S.s8);
  return assertClean(shell(p, t, o, body, { print: false }));
}

/** Print view for the emailed PDF (A4): all sections in the design order, initials only. */
export function renderPrint(p, opts) {
  const o = { ...defaults(opts), print: true }; const t = o.tokens; const S = sections(p, t, o);
  let n = 0; const B = (title, inner, cls) => block(t, ++n, title, inner, cls);
  const body = B('This week', S.s1) + B('Progress', S.s2) + B('Your meetings', S.s3) + B('Quality, in your words', S.s4)
    + B("What you'll notice this week", S.s5) + B('One thing to do', S.s7) + B('Your cycle', S.s8);
  return assertClean(shell(p, t, o, body, { print: true }));
}

export const visibleText = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();

/** Close-rate / policy figures never leave the portal (review 4 §2h). */
export const ROI_TEXT = /close rate|tracking to about|polic(?:y|ies) (?:this cycle|you report)|Your view \(your numbers only\)/i;

/** Fails the build (and so the send) on a banned word or a missing "No lock-in." line. */
export function assertClean(html) {
  const text = visibleText(html);
  const m = text.match(BANNED);
  if (m) throw new Error(`banned word in broker report: "${m[0]}"`);
  if (!/No lock-in\./.test(text)) throw new Error('broker report must say "No lock-in."');
  const roi = text.match(ROI_TEXT);
  if (roi) throw new Error(`close-rate / policies section in emailed broker report: "${roi[0]}" (portal only)`);
  return html;
}

function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).sort().reverse()) {
    for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome']) { const f = join(root, d, rel); if (existsSync(f)) return f; }
  }
  return null;
}

export function printPdf(printHtmlFile, pdfFile) {
  const bin = findChromium();
  if (!bin) throw new Error('no headless Chromium found (set CHROMIUM_PATH)');
  execFileSync(bin, ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfFile}`, pathToFileURL(resolve(printHtmlFile)).href], { stdio: 'ignore', timeout: 60000 });
  return pdfFile;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--pdf'));
  if (!file) { console.error('usage: build-broker-report-email.mjs <payload.json> [--key k] [--out dir] [--report-id id] [--portal-url url] [--pdf]'); process.exit(2); }
  let p = JSON.parse(readFileSync(file, 'utf8'));
  const key = flag('key');
  if (key) p = p[key];
  if (!p || p.schema !== 'broker_report/1') { console.error('not a broker_report/1 payload (use --key with the fixture)'); process.exit(2); }
  const out = flag('out') || '.';
  mkdirSync(out, { recursive: true });
  const opts = { portalUrl: flag('portal-url'), reportId: flag('report-id') };
  const stem = pdfName(p).replace(/\.pdf$/, '');
  const files = { email: join(out, `${stem}.email.html`), print: join(out, `${stem}.print.html`) };
  writeFileSync(files.email, renderEmail(p, opts));
  writeFileSync(files.print, renderPrint(p, opts));
  if (args.includes('--pdf')) files.pdf = printPdf(files.print, join(out, pdfName(p)));
  console.log(JSON.stringify({ subject: subjectFor(p), pdf_name: pdfName(p), files }, null, 2));
}
