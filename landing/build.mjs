#!/usr/bin/env node
/* SortMyCover landing build. No dependencies.
   node landing/build.mjs            -> landing/dist/{slug}/index.html (+ thanks/, assets/, shared/, fonts/)
   env in config/site.json: "staging" tolerates empty fields (noindex, visible placeholders); "production" fails closed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const R = (...p) => path.join(here, ...p);
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const errors = [], warnings = [];

const site = json(R('config/site.json'));
const consentCfg = json(R('config/consent.json'));
const faqFallback = json(R('config/faq.json'));
/* knowledge/faq.md is the single FAQ source (6B.9). Entries with a "source" list take their text from it (en), unless it still has unresolved {placeholders}. */
const corpusPath = path.join(root, 'knowledge/faq.md');
const corpus = {};
let faqVersion = 'config/faq.json (knowledge/faq.md absent)';
if (fs.existsSync(corpusPath)) {
  const md = read(corpusPath);
  faqVersion = (md.match(/Version \| `([^`]+)`/) || [])[1] || 'faq.md';
  for (const m of md.matchAll(/^### (FAQ-\d+)[^\n]*\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)) {
    const en = (m[2].match(/^- en: (.+)$/m) || [])[1];
    if (en) corpus[m[1]] = en.trim();
  }
}
const faqDefault = faqFallback.map((q) => {
  if (!q.source) return q;
  const parts = q.source.map((id) => corpus[id]);
  if (parts.some((x) => !x || /\{\w+\}/.test(x))) { warnings.push(`faq ${q.id}: source ${q.source.join('+')} missing or has placeholders; using config/faq.json text`); return q; }
  return { ...q, a: (q.prefix || '') + parts.join(' ') };
});
const strings = json(R('config/strings.json'));
const prod = site.env === 'production';
const mode = site.consent_mode === 'generic' ? 'generic' : 'named';

/* ---------- fail-closed checks ---------- */
if (mode === 'named' && (!site.practice_name || !site.fsp_number)) {
  (prod ? errors : warnings).push('consent_mode=named but practice_name / fsp_number is empty (fail closed in production; staging shows [PLACEHOLDER])');
}
if (prod) {
  for (const k of ['pixel_id', 'domain_verification', 'api_base']) if (!site[k]) errors.push(`production needs site.${k}`);
  if (/REPLACE|invalid/i.test(site.api_base) || !/^https:/.test(site.api_base)) errors.push('production api_base must be a real https URL');
} else {
  if (!site.pixel_id) warnings.push('pixel_id empty: pixel inert (expected before GATE-PIXEL)');
}

/* ---------- brand tokens + fonts ---------- */
const tokensPath = path.join(root, 'brand/tokens.css');
const fontDir = path.join(root, 'brand/fonts');
const FALLBACK_TOKENS = ':root{--sm-amber:#F5A623;--sm-charcoal:#1F2933;--sm-off-white:#FBF8F2;--sm-accent-text:#2A1B02;--sm-charcoal-2:#2B3845;--sm-off-white-2:#F1ECE2;--sm-muted:#5C6672;--sm-rule:#DCD6CB;--sm-white:#FFFFFF;--sm-bg:#FBF8F2;--sm-text:#1F2933;--sm-surface:#FFFFFF;--sm-surface-raised:#F1ECE2;--sm-text-muted:#5C6672;--sm-border:#DCD6CB;--sm-font:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--sm-bg:#15181C;--sm-text:#F1EDE5;--sm-surface:#1C2027;--sm-surface-raised:#1C2027}}';
let tokens = FALLBACK_TOKENS, haveFonts = false;
if (fs.existsSync(tokensPath)) {
  tokens = read(tokensPath).replace(/url\("fonts\//g, 'url("/fonts/');
  haveFonts = fs.existsSync(path.join(fontDir, 'dm-sans-latin-500-normal.woff2'));
} else warnings.push('brand/tokens.css missing: using built-in fallback tokens');
const css = tokens + '\n' + read(R('template/page.css'));
const fontPreload = haveFonts ? '<link rel="preload" href="/fonts/dm-sans-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>' : '';

/* ---------- helpers ---------- */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
const words = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const BANNED = [/!/, /\bguarantee/i, /\bcheapest\b/i, /\bbest (cover|price|rate)/i, /\bhot lead/i, /\bwarm lead/i, /don.t miss/i, /limited time/i, /\bR\s?\d[\d\s,]*(m|k|million)\b/i, /\bappointments?\b/i];

/* ---------- consent ---------- */
const c = consentCfg[mode];
const practice = site.practice_name || '[PRACTICE NAME]', fsp = site.fsp_number || '[FSP NUMBER]';
const consentMain = c.text.replace('{practice_name}', practice).replace('{fsp_number}', fsp);
const consentPlain = `${consentMain} ${consentCfg.ads} ${consentCfg.link_text}`;
const consentHtml = (mode === 'named'
  ? esc(consentMain).replace(esc(`${practice} (FSP ${fsp})`), `<b>${esc(practice)} (FSP ${esc(fsp)})</b>`)
  : esc(consentMain))
  + ` ${esc(consentCfg.ads)} <a href="${esc(site.privacy_url)}" target="_blank" rel="noopener">${esc(consentCfg.link_text)}<span class="sr"> (opens in a new tab)</span></a>`;

/* ---------- templates ---------- */
const tpl = read(R('template/index.html'));
const pageJs = read(R('template/page.js'));
const assetV = crypto.createHash('sha1').update(pageJs).digest('hex').slice(0, 8);
const render = (t, v) => t
  .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => { if (!(k in v)) throw new Error('missing raw slot ' + k); return v[k]; })
  .replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in v)) throw new Error('missing slot ' + k); return esc(v[k]); });

const DEFAULT_CHIPS = ['**Licensed** adviser', 'Video, WhatsApp or phone', '**No** obligation'];
const GAP = { h2: 'Why the gap is so common', p: 'Work cover is usually a few times salary. A bond, school fees and years of income add up to more.' };

const outRoot = R('dist');
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(outRoot, 'assets'), { recursive: true });
fs.mkdirSync(path.join(outRoot, 'shared'), { recursive: true });
fs.writeFileSync(path.join(outRoot, 'assets/page.js'), pageJs);
fs.copyFileSync(path.join(root, 'landing/shared/pixel.js'), path.join(outRoot, 'shared/pixel.js'));
if (haveFonts) {
  fs.mkdirSync(path.join(outRoot, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(fontDir)) if (/\.woff2?$/.test(f)) fs.copyFileSync(path.join(fontDir, f), path.join(outRoot, 'fonts', f));
}

const angleFiles = fs.readdirSync(R('angles')).filter((f) => f.endsWith('.json')).sort();
const report = [];
for (const f of angleFiles) {
  const a = json(R('angles', f));
  const tag = `[${a.slug}]`;
  for (const k of ['slug', 'h1', 'sub', 'og_title', 'og_description', 'title']) if (!a[k]) errors.push(`${tag} missing ${k}`);
  if (!a.slug) continue;
  const h1plain = a.h1.replace(/\*/g, '').replace(/\n/g, ' ');
  const h1w = words(h1plain).length;
  if (h1w > 12) errors.push(`${tag} H1 is ${h1w} words (max 12; spec says <= 10, see RECONCILE.md)`);
  else if (h1w > 10) warnings.push(`${tag} H1 is ${h1w} words (spec <= 10; employer-gap follows the approved reference)`);
  if (a.ad_hook && a.ad_hook.replace(/\s+/g, ' ').trim() !== h1plain.replace(/\s+/g, ' ').trim()) warnings.push(`${tag} H1 differs from ad_hook (message match): needs creative-strategist / human decision`);
  const faq = faqDefault.map((q) => ({ ...q, ...(a.faq_overrides && a.faq_overrides[q.id] ? a.faq_overrides[q.id] : {}) }));
  const faqHtml = faq.map((q) => `  <details><summary>${esc(q.q)}</summary><p>${esc(q.a)}</p></details>`).join('\n');
  const jsonld = '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) }).replace(/</g, '\\u003c') + '</script>';
  const chips = (a.chips && a.chips.length ? a.chips : DEFAULT_CHIPS);
  if (chips.length !== 3) errors.push(`${tag} needs exactly 3 trust chips`);
  const proof = Array.isArray(a.proof) ? a.proof.filter((p) => p && p.quote && p.first_name && p.city) : [];
  const proofHtml = proof.length ? `<section class="proof" aria-labelledby="proofH"><div class="wrap"><h2 id="proofH">What people said</h2>${proof.map((p) => `<blockquote><p>${esc(p.quote)}</p><cite>${esc(p.first_name)}, ${esc(p.city)}</cite></blockquote>`).join('')}</div></section>` : '';
  const base = site.page_base_url.replace(/\/$/, '');
  const lang = a.lang || site.lang;
  const vars = {
    lang, title: a.title, description: a.og_description, robots: site.robots,
    canonical: `${base}/${a.slug}/`, site_url: site.site_url, pixel_id: site.pixel_id, domain_verification: site.domain_verification,
    og_locale: lang.replace('-', '_'), og_title: a.og_title, og_description: a.og_description,
    font_preload: fontPreload, css, asset_v: assetV, jsonld,
    api_base: site.api_base, slug: a.slug, consent_mode: mode, booking: String(site.booking !== false), turnstile_sitekey: site.turnstile_sitekey,
    thanks_url: `${base}/${a.slug}/thanks/`,
    h1_html: inline(a.h1), sub: a.sub, chips_html: chips.map((x) => `    <li class="chip">${inline(x)}</li>`).join('\n'),
    gap_h2: a.gap_h2 || GAP.h2, gap_p: a.gap_p || GAP.p,
    consent_html: consentHtml, consent_text: consentPlain, consent_version: c.version, footer_line: consentCfg.footer_line,
    proof_html: proofHtml, faq_html: faqHtml,
    reg_html: site.company_reg_no ? ` · Company Reg No ${esc(site.company_reg_no)}` : '',
    contact_email: site.contact_email, privacy_url: site.privacy_url, how_we_make_money_url: site.how_we_make_money_url, complaints_url: site.complaints_url, optout_url: site.optout_url,
    strings_json: JSON.stringify(strings).replace(/</g, '\\u003c'),
  };
  const html = render(tpl, vars);

  /* page checks */
  const before = html.split('<!--FIRST-TAP-->')[0].split('<body>')[1] || '';
  const w110 = words(before).length;
  if (w110 > 110) errors.push(`${tag} ${w110} words before the first tap (max 110, NN/g half-read threshold)`);
  const visible = html.split('<body>')[1].replace(/<script[\s\S]*?<\/script>/g, '');
  for (const re of BANNED) if (re.test(visible.replace(/<[^>]+>/g, ' '))) errors.push(`${tag} banned wording matched ${re}`);
  const ct = (html.match(/<span id="consentText">([\s\S]*?)<\/a><\/span>/) || [])[1] || '';
  const ctPlain = ct.replace(/<span class="sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  if (ctPlain !== consentPlain.replace(/\s+/g, ' ').trim()) errors.push(`${tag} consent line not rendered verbatim`);

  const dir = path.join(outRoot, a.slug);
  fs.mkdirSync(path.join(dir, 'thanks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'thanks/index.html'), thanksPage(vars, a));
  report.push(`${a.slug}: H1 ${h1w}w, ${w110} words before first tap`);
}

function thanksPage(v, a) {
  return `<!doctype html><html lang="${esc(v.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you | SortMyCover</title><meta name="robots" content="noindex,nofollow"><meta name="smc-pixel-id" content="${esc(v.pixel_id)}"><style>${v.css}</style><script src="/shared/pixel.js" defer></script></head><body>
<header class="top"><div class="wrap"><span class="logo">SortMyC<span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#2A1B02" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>ver</span></div></header>
<main><section class="quiz"><div class="wrap"><div class="card"><div class="done"><div class="big" aria-hidden="true">✓</div><h1 style="font-size:22px;margin:10px 0 6px">Thanks. Check your WhatsApp.</h1><p>${esc(strings.done_not_p)}</p></div></div></div></section></main>
<footer><div class="wrap"><span>${esc(v.footer_line)}</span><nav aria-label="Footer" class="links"><a href="${esc(v.privacy_url)}">Privacy notice</a><a href="${esc(v.optout_url)}">Opt-out</a></nav></div></footer></body></html>`;
}

for (const w of warnings) console.warn('WARN  ' + w);
for (const e of errors) console.error('ERROR ' + e);
if (errors.length) { console.error(`\nBuild failed: ${errors.length} error(s).`); process.exit(1); }
console.log(`Built ${report.length} pages into landing/dist (env=${site.env}, consent_mode=${mode}, fonts=${haveFonts ? 'self-hosted' : 'system'}, faq=${faqVersion})`);
report.forEach((r) => console.log('  ' + r));
