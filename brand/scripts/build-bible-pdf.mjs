// brand-bible.md + tokens.json -> brand-bible.pdf (A4, Chromium print-to-PDF). Fills {{tokens.color.<key>.<name|hex|rgb|cmyk>}} at render time.
// Run: node scripts/build-bible-pdf.mjs   (npm run bible)
import fs from 'fs'; import path from 'path'; import os from 'os';
import { marked } from 'marked';
import { launch, root, T, fileUrl } from './lib.mjs';
const alias = { offwhite: 'offWhite', amberink: 'accentText' };
const key = k => alias[k.toLowerCase()] || Object.keys(T.color).find(x => x.toLowerCase() === k.toLowerCase());
const fmt = { name: c => c.name, hex: c => c.hex, rgb: c => c.rgb.join(', '), cmyk: c => `C${c.cmyk[0]} M${c.cmyk[1]} Y${c.cmyk[2]} K${c.cmyk[3]}` };
let md = fs.readFileSync(path.join(root, 'brand-bible.md'), 'utf8'); const missing = [];
md = md.replace(/\{\{tokens\.color\.(\w+)\.(\w+)\}\}/g, (m, k, f) => { const kk = key(k), c = T.color[kk]; if (!c || !fmt[f] || (f === 'name' && !c.name)) { missing.push(m); return m; } return fmt[f](c); });
if (missing.length) { console.error('Unresolved placeholders:', missing.join(' ')); process.exit(1); }
const sw = ['amber', 'charcoal', 'offWhite', 'accentText'].map(k => `<div class="sw"><i style="background:${T.color[k].hex}"></i><b>${T.color[k].name}</b><span>${T.color[k].hex} · rgb ${T.color[k].rgb.join(',')}</span></div>`).join('');
const html = `<!doctype html><html lang="en-ZA"><meta charset="utf8"><title>SortMyCover Brand Bible ${T.version}</title><link rel="stylesheet" href="${fileUrl('tokens.css')}">
<style>
@page{size:A4;margin:18mm 16mm 20mm}
body{font-family:var(--sm-font);font-weight:500;font-size:10pt;line-height:1.45;color:var(--sm-charcoal);background:var(--sm-off-white);-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-weight:800;letter-spacing:-.015em;line-height:1.1;color:var(--sm-charcoal)} h1{font-size:24pt;margin:0 0 6pt} h2{font-size:15pt;margin:20pt 0 6pt;break-after:avoid;border-top:3px solid var(--sm-amber);padding-top:8pt} h3{font-size:11.5pt;margin:12pt 0 4pt;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:8.6pt;break-inside:auto} tr{break-inside:avoid} th{background:var(--sm-charcoal);color:var(--sm-off-white);text-align:left;font-weight:800} th,td{padding:4pt 6pt;border-bottom:1px solid var(--sm-rule);vertical-align:top}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:var(--sm-off-white-2);padding:0 3pt;border-radius:3pt} hr{border:0;border-top:1px solid var(--sm-rule);margin:14pt 0} blockquote{border-left:4px solid var(--sm-amber);margin:8pt 0;padding:2pt 10pt;background:var(--sm-off-white-2)}
.cover{height:240mm;display:flex;flex-direction:column;justify-content:center;gap:14pt;break-after:page}.cover h1{font-size:44pt}.cover img{height:56pt;align-self:flex-start}.cover p{font-size:12pt;max-width:120mm}
.sws{display:flex;gap:10pt;margin-top:18pt}.sw{flex:1;font-size:8pt}.sw i{display:block;height:46pt;border-radius:8pt;border:1px solid var(--sm-rule);margin-bottom:5pt}.sw b{display:block;font-size:9pt}.sw span{color:var(--sm-muted)}
</style>
<body><section class="cover"><img src="${fileUrl('logo/wordmark-charcoal.svg')}" alt="SortMyCover"><h1>Brand Bible</h1><p>Version ${T.version} · ${T.updated || ''}<br>${T.brand.line}</p><div class="sws">${sw}</div><p style="font-size:8.5pt;color:var(--sm-muted)">Colour values on this page and in section 6 are filled from brand/tokens.json at render time. Source text: brand/brand-bible.md.</p></section>
${marked.parse(md)}</body></html>`;
const out = path.join(os.tmpdir(), 'smc-brand-bible.html'); fs.writeFileSync(out, html); // temp file: it carries the filled hex values, which must not live in the repo outside tokens
const b = await launch(); const p = await (await b.newContext()).newPage(); await p.goto(fileUrl(out)); await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: path.join(root, 'brand-bible.pdf'), format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' }, headerTemplate: '<span></span>', footerTemplate: `<div style="font:8px sans-serif;width:100%;padding:0 16mm;display:flex;justify-content:space-between;color:gray"><span>SortMyCover brand bible v${T.version}</span><span>SortMyCover is a service of Lead Velocity (Pty) Ltd · <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>` });
await b.close(); console.log('brand-bible.pdf', (fs.statSync(path.join(root, 'brand-bible.pdf')).size / 1024).toFixed(0), 'KB');
