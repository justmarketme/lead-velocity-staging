// Builds the favicon + app-icon set from the tick geometry. Run after build-logos.mjs.
import fs from 'fs';
import path from 'path';
import { launch, root, T, svgToPng, pngSize, rgbOf } from './lib.mjs';

const dir = path.join(root, 'favicon'); fs.mkdirSync(dir, { recursive: true });
const G = JSON.parse(fs.readFileSync(path.join(root, 'logo', 'geometry.json'), 'utf8'));
const r2 = n => Math.round(n * 100) / 100;
const circle = (cx, cy, r) => `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;

// Re-use the outline builder from build-logos by extracting the tick path from tick-mark.svg (64 box, disc D=64).
const tickMark = fs.readFileSync(path.join(root, 'logo', 'tick-mark.svg'), 'utf8');
const tickD64 = [...tickMark.matchAll(/<path[^>]*d="([^"]+)"/g)][1][1];     // second path = tick outline in a 64 box
const glyph = fs.readFileSync(path.join(root, 'logo', 'favicon-glyph.svg'), 'utf8').match(/fill-rule="evenodd" d="([^"]+)"/)[1];

const amber = rgbOf('amber'), ink = rgbOf('accentText'), off = rgbOf('offWhite');
const wrap = (inner, vb = '0 0 64 64', extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="64" height="64"${extra}>${inner}</svg>\n`;

// favicon.svg: theme-aware. Disc inset 2 units so the dark-mode ring is not clipped.
const fav = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- favicon.svg | SortMyCover. Theme-aware via prefers-color-scheme: dark adds an off-white ring so the amber disc keeps its edge on dark tabs. Minimum 16 px. -->\n` +
  wrap(`<style>.r{fill:none}@media (prefers-color-scheme:dark){.r{stroke:${off};stroke-width:3}}</style><g transform="translate(32 32) scale(0.9375) translate(-32 -32)"><path fill="${amber}" d="${circle(32, 32, 32)}"/><path fill="${ink}" d="${tickD64}"/></g><circle class="r" cx="32" cy="32" r="30.4"/>`, '0 0 64 64', ' role="img" aria-label="SortMyCover tick"');
fs.writeFileSync(path.join(dir, 'favicon.svg'), fav);
// mask-icon: one solid shape, Safari applies the colour
fs.writeFileSync(path.join(dir, 'mask-icon.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n<!-- mask-icon.svg | Safari pinned tab. Single solid black shape; Safari recolours it (use color="amber" token in the <link>). -->\n` + wrap(`<path fill="${rgbOf('black')}" fill-rule="evenodd" d="${glyph}"/>`));

// masters for raster icons
const SRC = path.join(root, 'favicon', '_src'); fs.mkdirSync(SRC, { recursive: true });
const tickIn = (D, cx, cy) => { // scale the 64-box tick outline to a disc of diameter D centred at (cx,cy)
  const s = D / 64; return `<path fill="${ink}" transform="translate(${r2(cx - 32 * s)} ${r2(cy - 32 * s)}) scale(${r2(s * 1000) / 1000})" d="${tickD64}"/>`; };
const sq = (size, D, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${bg ? '' : `<path fill="${amber}" d="${circle(size / 2, size / 2, size / 2)}"/>`}${tickIn(D, size / 2, size / 2)}</svg>`;
fs.writeFileSync(path.join(SRC, 'disc.svg'), sq(64, 64, null));
fs.writeFileSync(path.join(SRC, 'apple.svg'), sq(180, 146, amber));         // opaque square, tick 108 px
fs.writeFileSync(path.join(SRC, 'maskable.svg'), sq(512, 360, amber));      // tick inside the 80% safe circle
// 16/32 px small-size masters: same geometry (stroke tuned at 4.6/24 and ratio 0.74 in build-logos)
const b = await launch();
const png = (svg, n, w, o = {}) => svgToPng(b, svg, w, w, path.join(dir, n), o);
for (const w of [16, 32, 48]) await png(path.join(dir, 'favicon.svg'), `_${w}.png`, w);
await png(path.join(dir, 'favicon.svg'), 'favicon-32.png', 32);
await png(path.join(SRC, 'apple.svg'), 'apple-touch-icon.png', 180, { bg: amber });
await png(path.join(SRC, 'disc.svg'), 'icon-192.png', 192);
await png(path.join(SRC, 'disc.svg'), 'icon-512.png', 512);
await png(path.join(SRC, 'maskable.svg'), 'icon-maskable-512.png', 512, { bg: amber });
await png(path.join(SRC, 'disc.svg'), 'mstile-150x150.png', 150);
// 16-px reading proof sheets (light + dark tab) are made in favicon-check.html; also dump nearest-neighbour proofs
await b.close();

// favicon.ico: PNG-embedded 16/32/48
const imgs = [16, 32, 48].map(w => fs.readFileSync(path.join(dir, `_${w}.png`)));
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off2 = 6 + 16 * imgs.length; const ents = []; 
imgs.forEach((im, i) => { const w = [16, 32, 48][i]; const e = Buffer.alloc(16); e[0] = w; e[1] = w; e[2] = 0; e[3] = 0; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(im.length, 8); e.writeUInt32LE(off2, 12); off2 += im.length; ents.push(e); });
fs.writeFileSync(path.join(dir, 'favicon.ico'), Buffer.concat([head, ...ents, ...imgs]));
for (const w of [16, 32, 48]) fs.renameSync(path.join(dir, `_${w}.png`), path.join(SRC, `fav-${w}.png`));

// manifest + browserconfig (platform formats need hex, so these two files are the documented exception to the no-hex rule)
const man = { name: 'SortMyCover', short_name: 'SortMyCover', description: T.brand.line, start_url: '/', display: 'standalone', lang: 'en-ZA',
  theme_color: T.color.amber.hex, background_color: T.color.offWhite.hex,
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify(man, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'browserconfig.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<browserconfig><msapplication><tile><square150x150logo src="/mstile-150x150.png"/><TileColor>${T.color.charcoal.hex}</TileColor></tile></msapplication></browserconfig>\n`);

// favicon-check.html
fs.writeFileSync(path.join(dir, 'favicon-check.html'), `<!doctype html><html lang="en"><meta charset=utf8><title>SortMyCover favicon check</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="icon" href="favicon.ico" sizes="any"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="manifest" href="manifest.webmanifest"><link rel="mask-icon" href="mask-icon.svg" color="${amber}">
<link rel="stylesheet" href="../tokens.css">
<style>body{margin:0;font:var(--sm-text-sm)/1.4 var(--sm-font);background:var(--sm-bg);color:var(--sm-text)}main{padding:24px;max-width:980px;margin:auto}h1{font-size:var(--sm-text-lg);font-weight:800}
.row{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0 28px}.tab{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px 10px 0 0;width:220px;font:13px system-ui}
.light{background:var(--sm-white);color:var(--sm-black);border:1px solid var(--sm-rule)}.dark{background:var(--sm-charcoal-2);color:var(--sm-off-white)}
.tab img{width:16px;height:16px}.zoom img{image-rendering:pixelated;width:128px;height:128px;border:1px solid var(--sm-rule)}.panel{padding:12px;border-radius:12px}
.panel.light{background:var(--sm-white)}.panel.dark{background:var(--sm-dark-bg)}.panel img{margin-right:12px;vertical-align:bottom}</style>
<main><h1>Favicon check</h1><p>Open in Chrome, Safari, Firefox in light and dark OS themes: the tab icon above should read as a tick on an amber disc. Scripted check: Chromium renders favicon.svg at 16 px; the pixel-zoom below is that raster at 8x, nearest-neighbour.</p>
<h1>Tab simulation at 16 px</h1><div class="row"><div class="tab light"><img src="favicon.svg" alt="">SortMyCover</div><div class="tab dark"><img src="favicon.svg" alt="">SortMyCover</div><div class="tab light"><img src="favicon-32.png" width="16" height="16" alt="">PNG fallback, light</div><div class="tab dark"><img src="favicon-32.png" width="16" height="16" alt="">PNG fallback, dark</div></div>
<h1>16 px raster, 8x pixel zoom</h1><div class="row zoom"><img src="_src/fav-16.png" alt=""><img src="_src/fav-32.png" alt=""></div>
<h1>All sizes</h1><div class="row"><div class="panel light"><img src="favicon.svg" width="16" alt=""><img src="favicon.svg" width="32" alt=""><img src="favicon.svg" width="48" alt=""><img src="apple-touch-icon.png" width="90" alt=""><img src="icon-192.png" width="96" alt=""><img src="mstile-150x150.png" width="75" alt=""></div><div class="panel dark"><img src="favicon.svg" width="16" alt=""><img src="favicon.svg" width="32" alt=""><img src="favicon.svg" width="48" alt=""><img src="icon-maskable-512.png" width="90" alt=""><img src="icon-512.png" width="96" alt=""><img src="../logo/favicon-glyph.svg" width="48" alt=""></div></div></main>\n`);
for (const f of ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'mstile-150x150.png']) console.log(f, JSON.stringify(pngSize(path.join(dir, f))));
