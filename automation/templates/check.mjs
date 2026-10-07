#!/usr/bin/env node
// Template checker (no network, no dependencies): node automation/templates/check.mjs
// Re-runs the generator checks over every *.json template in this folder and the submit.sh list.
// Exit code 1 on any error. Limits are Meta's published template limits as recorded in README.md
// (body <= 1024, header text <= 60, footer <= 60, button text <= 25, <= 10 buttons, <= 2 URL buttons,
// quick replies grouped, one header variable max, no variable at the start or end of the body).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE).filter((f) => f.endsWith('.json')).sort();
const errors = [];
const warn = [];
const err = (n, m) => errors.push(`${n}: ${m}`);

// Lead-facing = everything not addressed to a broker or to ops.
const isInternal = (n) => /^(broker_|ops_|precall_brief$)/.test(n);
// 2.1.8 / 4.11 / W14 R03 / 0.1 wording rules. Matched as whole words, case-insensitive.
const BANNED = [
  // "best" only as a claim ("best describes", "best time" to reach are allowed); "free" only as an offer ("free slot/time" is calendar talk).
  /\bguarantee(d|s)?\b/i, /\bbest\b(?! (describes|time))/i, /\bcheapest\b/i, /#1\b/, /\bpremiums?\b/i, /\bcover amount\b/i, /\bsum insured\b/i,
  /\bappointments?\b/i, /\bour adviser\b/i, /\bfree\b(?! (slots?|times?))/i, /\bhurry\b/i, /\blimited time\b/i, /\bAsk a question\b/i,
  /\b(Old Mutual|Sanlam|Discovery|Liberty|Momentum|Hollard|Clientele|OUTsurance|BrightRock|FMI|PPS|Assupol|1Life|AVBOB|Metropolitan|Dis-Chem Life|King Price|MiWay|MiWayLife|Guardrisk|Budget Insurance|Dial Direct|First for Women|Auto & General|Virseker|Santam|Naked Insurance|Capital Legacy|Hippo)\b/i,
];
// Marketing jargon is banned in anything a broker or lead reads (W14 R03, portal rule 3); ops_* templates go to Jonathan/KG only.
const JARGON = [/\bCPL\b/, /\bCPC\b/, /\bCTR\b/, /\bCAPI\b/, /\bEMQ\b/, /\bROAS\b/, /\battribution\b/i, /\bfunnel\b/i, /\bSLA\b/];
const EMOJI = /\p{Extended_Pictographic}/u;
const vars = (s) => [...String(s).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

const names = new Set();
for (const f of files) {
  let t;
  try { t = JSON.parse(readFileSync(join(HERE, f), 'utf8')); } catch (e) { err(f, `invalid JSON: ${e.message}`); continue; }
  const n = t.name;
  names.add(n);
  if (`${n}.json` !== f) err(f, `name "${n}" does not match the file name`);
  if (!/^[a-z0-9_]{1,512}$/.test(n || '')) err(f, 'name must be lower-case a-z 0-9 _');
  if (t.language !== 'en') err(n, 'language must be en');
  if (t.category !== 'UTILITY') err(n, 'category must be UTILITY');
  const comp = (type) => (t.components || []).filter((c) => c.type === type);
  if (Object.keys(t).some((k) => !['name', 'language', 'category', 'components'].includes(k))) err(n, 'unexpected top-level key');
  const body = comp('BODY')[0];
  if (!body) { err(n, 'no BODY'); continue; }
  const text = body.text;
  if (text.length > 1024) err(n, `body ${text.length} > 1024`);
  const bv = vars(text);
  bv.forEach((v, i) => { if (v !== i + 1) err(n, `body variables not sequential: ${bv.join(',')}`); });
  const ex = body.example?.body_text?.[0] || [];
  if (bv.length && ex.length !== bv.length) err(n, `body has ${bv.length} variables but ${ex.length} examples`);
  if (!bv.length && body.example) err(n, 'example present but no variables');
  if (/^\s*\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}[\s.!?*]*$/.test(text)) err(n, 'body starts or ends with a variable');
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text)) err(n, 'two variables side by side');
  for (const e of ex) if (/[\n\t]| {5,}/.test(e)) err(n, 'example value has a newline/tab/5+ spaces');
  const words = text.replace(/\{\{\d+\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
  if (bv.length && words < 2 * bv.length + 1) err(n, `too many variables for the text length (${words} words, ${bv.length} vars)`);
  const header = comp('HEADER')[0];
  if (header?.format === 'TEXT') {
    if (header.text.length > 60) err(n, 'header > 60');
    const hv = vars(header.text);
    if (hv.length > 1) err(n, 'header has > 1 variable');
    if (hv.length && !header.example?.header_text?.length) err(n, 'header variable without example');
  }
  const footer = comp('FOOTER')[0];
  if (footer && (footer.text.length > 60 || vars(footer.text).length)) err(n, 'footer > 60 or has a variable');
  const buttons = comp('BUTTONS')[0]?.buttons || [];
  if (buttons.length > 10) err(n, `${buttons.length} buttons > 10`);
  if (buttons.length > 3) warn.push(`${n}: ${buttons.length} buttons (WhatsApp shows 3 inline, the rest under "See all options")`);
  if (buttons.filter((b) => b.type === 'URL').length > 2) err(n, '> 2 URL buttons');
  const kinds = buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'Q' : 'O')).join('');
  if (/Q+O+Q+/.test(kinds)) err(n, 'quick replies not grouped');
  for (const b of buttons) {
    if (!b.text || b.text.length > 25) err(n, `button "${b.text}" is ${b.text?.length} chars (> 25)`);
    if (EMOJI.test(b.text)) err(n, `button "${b.text}" has an emoji`);
    if (b.type === 'URL') {
      const uv = vars(b.url);
      if (uv.length > 1 || (uv.length && !/\{\{1\}\}$/.test(b.url))) err(n, `URL button "${b.text}": variable must be a single {{1}} at the end`);
      if (uv.length && !b.example?.length) err(n, `URL button "${b.text}" variable without example`);
      if (!/^https:\/\/(leadvelocity\.co\.za|sortmycover\.co\.za)\//.test(b.url)) err(n, `URL button "${b.text}" host not allowed (${b.url})`);
    }
  }
  const all = JSON.stringify(t.components);
  for (const re of BANNED) if (re.test(all)) err(n, `banned word ${re}`);
  if (!n.startsWith('ops_')) for (const re of JARGON) if (re.test(all)) err(n, `jargon ${re} in a broker/lead template`);
  if (EMOJI.test(all)) err(n, 'emoji in template');
  if (!isInternal(n) && !/Reply STOP to opt out\.\s*$/.test(text)) err(n, 'lead-facing body must end with "Reply STOP to opt out."');
  if (isInternal(n)) {
    // POPIA 4.10a: a lead appears outside the portal only as first name + initial. Flag any two capitalised words in examples
    // that look like "Firstname Surname" unless it is the adviser/practice (known fixture names).
    const allowed = /(Mark Smith|Smith Financial|Lead Velocity|SortMyCover|Outlook calendar|Microsoft Teams)/;
    for (const e of [...ex, ...(header?.example?.header_text || [])]) {
      const m = String(e).match(/\b(Lerato|Sipho|Pieter|Thandi|Ayanda|Nomsa|Johan|Zanele) [A-Z][a-z]+/);
      if (m && !allowed.test(e)) err(n, `example "${e}" looks like a lead full name (use "Lerato M.")`);
    }
  }
}

// Text review samples (samples/<name>.txt): must equal the render of the template with its example values.
export function renderSample(t) {
  const comp = (type) => (t.components || []).find((c) => c.type === type);
  const fill = (text, ex) => String(text).replace(/\{\{(\d+)\}\}/g, (_, i) => (ex || [])[Number(i) - 1] ?? `{{${i}}}`);
  const out = [`${t.name} (${t.category}, ${t.language})`, ''];
  const h = comp('HEADER');
  if (h) out.push(h.format === 'TEXT' ? `[header] ${fill(h.text, h.example?.header_text)}` : `[header] ${h.format}`);
  const b = comp('BODY');
  out.push(fill(b.text, b.example?.body_text?.[0]));
  const f = comp('FOOTER');
  if (f) out.push(`[footer] ${f.text}`);
  for (const btn of comp('BUTTONS')?.buttons || []) out.push(btn.type === 'URL' ? `[button] ${btn.text} -> ${btn.example?.[0] || btn.url}` : `[button] ${btn.text}`);
  return out.join('\n') + '\n';
}
const SAMPLES = join(HERE, 'samples');
for (const f of readdirSync(SAMPLES).filter((x) => x.endsWith('.txt'))) {
  const n = f.slice(0, -4);
  if (!names.has(n)) { err(f, 'sample has no template'); continue; }
  const t = JSON.parse(readFileSync(join(HERE, `${n}.json`), 'utf8'));
  if (readFileSync(join(SAMPLES, f), 'utf8') !== renderSample(t)) err(n, `samples/${f} does not match the template (re-render: node automation/templates/check.mjs --write-sample ${n})`);
}
if (process.argv[2] === '--write-sample' && process.argv[3]) {
  const { writeFileSync } = await import('node:fs');
  const n = process.argv[3];
  writeFileSync(join(SAMPLES, `${n}.txt`), renderSample(JSON.parse(readFileSync(join(HERE, `${n}.json`), 'utf8'))));
  console.log(`wrote samples/${n}.txt`);
}

// submit.sh list vs files
const sh = readFileSync(join(HERE, 'submit.sh'), 'utf8');
const listed = new Set((sh.match(/CORE=\(([^)]*)\)/)[1] + ' ' + sh.match(/REST=\(([\s\S]*?)\n\)/)[1] + ' ' + sh.match(/HELD=\(([^)]*)\)/)[1]).split(/\s+/).filter(Boolean));
for (const n of names) if (!listed.has(n)) err(n, 'not in submit.sh CORE/REST');
for (const n of listed) if (!names.has(n)) err(n, 'listed in submit.sh but no file');
const readme = readFileSync(join(HERE, 'README.md'), 'utf8');
for (const n of names) if (!readme.includes('`' + n + '`')) err(n, 'not in README.md index');

for (const w of warn) console.log('note  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(`${names.size} templates checked, ${errors.length} error(s), ${warn.length} note(s)`);
process.exit(errors.length ? 1 : 0);
