// Builds every SVG master in /brand/logo from tokens.json + DM Sans outlines.
// No <text> elements (except the documented co-brand template): all lettering is outlined paths.
// Geometry replicates the approved ad mock-up / landing wordmark: DM Sans 800, letter-spacing -0.01em,
// tick disc 0.95em wide with 0.05em margins, tick path "M5 13l4 4L19 7" in a 24-unit box at 68% of the disc.
// Colours are emitted as rgb() derived from tokens.json, so hex lives only in tokens.json / tokens.css.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8'));
const rgb = k => `rgb(${T.color[k].rgb.join(',')})`;
const load = f => { const b = fs.readFileSync(path.join(root, 'fonts', f)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const f800 = load('dm-sans-latin-800-normal.woff');
const f500 = load('dm-sans-latin-500-normal.woff');
const r2 = n => Math.round(n * 100) / 100;

// ---------- primitives ----------
const EM = 1000;                 // font size in SVG units
const LS = T.type.letterSpacingEm.logo;   // -0.01
const TICK_PTS = [[5, 13], [9, 17], [19, 7]];  // 24-box, from the approved mock-up
const TICK_SW = 4;

function text(font, str, x, y, size, ls = 0) {
  const p = font.getPath(str, x, y, size, { kerning: true, letterSpacing: ls });
  return { d: p.toPathData(2), bb: p.getBoundingBox(), adv: font.getAdvanceWidth(str, size, { kerning: true, letterSpacing: ls }) };
}

// Outline of a round-capped, round-jointed polyline stroke as one closed path (so the tick can be knocked out with evenodd).
function strokeOutline(pts, w) {
  const h = w / 2, n = pts.length;
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const dirs = []; for (let i = 0; i < n - 1; i++) dirs.push(dir(pts[i], pts[i + 1]));
  const nl = d => [d[1], -d[0]];            // left normal in y-down coords
  const add = (p, v, s = 1) => [p[0] + s * v[0], p[1] + s * v[1]];
  const P = (p) => `${r2(p[0])} ${r2(p[1])}`;
  // Build left side forward, then right side backward.
  const side = (sgn, forward) => {
    const out = []; const idx = [...Array(n).keys()]; if (!forward) idx.reverse();
    for (const i of idx) {
      if (i === 0 || i === n - 1) {
        const d = i === 0 ? dirs[0] : dirs[n - 2];
        out.push({ p: add(pts[i], nl(d), sgn * h), cap: false });
      } else {
        const d1 = dirs[i - 1], d2 = dirs[i], cross = d1[0] * d2[1] - d1[1] * d2[0];
        const a = add(pts[i], nl(d1), sgn * h), b = add(pts[i], nl(d2), sgn * h);
        // inner side when this offset side is on the turning side
        const inner = (cross < 0 && sgn > 0) || (cross > 0 && sgn < 0);
        if (inner) { const m = [nl(d1)[0] + nl(d2)[0], nl(d1)[1] + nl(d2)[1]]; const k = 1 / (1 + (nl(d1)[0] * nl(d2)[0] + nl(d1)[1] * nl(d2)[1])); out.push({ p: add(pts[i], m, sgn * h * k) }); }
        else out.push({ p: forward ? a : b, arcTo: forward ? b : a, sweep: forward ? (cross > 0 ? 1 : 0) : (cross > 0 ? 0 : 1) });
      }
    }
    return out;
  };
  const L = side(1, true), R = side(-1, false);
  let d = `M${P(L[0].p)}`;
  for (let i = 1; i < L.length; i++) { d += `L${P(L[i].p)}`; if (L[i].arcTo) d += `A${r2(h)} ${r2(h)} 0 0 ${L[i].sweep} ${P(L[i].arcTo)}`; }
  d += `A${r2(h)} ${r2(h)} 0 0 1 ${P(R[0].p)}`;
  for (let i = 1; i < R.length; i++) { d += `L${P(R[i].p)}`; if (R[i].arcTo) d += `A${r2(h)} ${r2(h)} 0 0 ${R[i].sweep} ${P(R[i].arcTo)}`; }
  d += `A${r2(h)} ${r2(h)} 0 0 1 ${P(L[0].p)}Z`;
  return d;
}
const circle = (cx, cy, r) => `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
// Tick geometry for a disc: returns outline path
function tickD(cx, cy, D, ratio = 0.68, swUnits = TICK_SW) {
  const size = D * ratio, s = size / 24, ox = cx - size / 2, oy = cy - size / 2;
  return strokeOutline(TICK_PTS.map(([x, y]) => [ox + s * x, oy + s * y]), swUnits * s);
}

// ---------- SVG wrapper ----------
const COMMENT = {
  wordmark: `Clear space: the height of the tick circle on every side. Minimum width 96 px (print: 25 mm). Never stretch, recolour outside the palette, add gradients, shadows or outlines, or place on busy photography without the charcoal scrim. The tick is never animated except the single 400 ms draw on site load and the video end-card.`,
  tick: `Clear space: half the circle diameter on every side. Minimum size 16 px (tuned: tick stroke is 17% of the circle). On amber backgrounds use tick-reversed.svg. Never add a ring, shadow or gradient.`,
  lockup: `Clear space: the height of the tick circle on every side. The line is never set without the wordmark. Minimum wordmark width 96 px.`,
};
function svg({ name, vb, body, comment, title, w = 480 }) {
  const [x, y, bw, bh] = vb;
  const h = Math.round(w * bh / bw);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${name} | SortMyCover brand v${T.version} | GENERATED by scripts/build-logos.mjs from tokens.json -->\n<!-- ${comment} -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(bw)} ${r2(bh)}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}
const bbUnion = bbs => bbs.reduce((a, b) => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }));

// ---------- wordmark pieces ----------
const MARGIN = 50, DISC = 950;
const DISC_CY = -204;   // measured from the approved render: disc centre sits 0.204em above the baseline
function wordmarkParts(ox = 0, oy = 0, lead = 'SortMyC', tail = 'ver') {
  const a = text(f800, lead, ox, oy, EM, LS);
  const discX = ox + a.adv + MARGIN, cx = discX + DISC / 2, cy = oy + DISC_CY;
  const b = text(f800, tail, discX + DISC + MARGIN, oy, EM, LS);
  return { a, b, cx, cy, end: discX + DISC + MARGIN + b.adv, bb: bbUnion([a.bb, b.bb, { x1: cx - DISC / 2, x2: cx + DISC / 2, y1: cy - DISC / 2, y2: cy + DISC / 2 }]) };
}
// colourways: [letters, disc, tick] ; mono => knockout
const WAYS = {
  charcoal: { type: 'charcoal', disc: 'amber', tick: 'accentText', mono: false },
  offwhite: { type: 'offWhite', disc: 'amber', tick: 'accentText', mono: false },
  black: { type: 'black', mono: true },
  white: { type: 'white', mono: true },
};
function discTick(cx, cy, D, way, ratio) {
  const td = tickD(cx, cy, D, ratio);
  if (way.mono) return `<path fill="${rgb(way.type)}" fill-rule="evenodd" d="${circle(cx, cy, D / 2)}${td}"/>`;
  return `<path fill="${rgb(way.disc)}" d="${circle(cx, cy, D / 2)}"/><path fill="${rgb(way.tick)}" d="${td}"/>`;
}
const fillFor = way => rgb(way.type);
const out = (name, s) => fs.writeFileSync(path.join(root, 'logo', name), s);
fs.mkdirSync(path.join(root, 'logo'), { recursive: true });

// 1. primary wordmark x4
for (const [k, way] of Object.entries(WAYS)) {
  const p = wordmarkParts();
  const bb = p.bb;
  out(`wordmark-${k}.svg`, svg({
    name: `wordmark-${k}`, title: 'SortMyCover', comment: COMMENT.wordmark,
    vb: [bb.x1, bb.y1, bb.x2 - bb.x1, bb.y2 - bb.y1],
    body: `<path fill="${fillFor(way)}" d="${p.a.d}"/><path fill="${fillFor(way)}" d="${p.b.d}"/>${discTick(p.cx, p.cy, DISC, way, 0.68)}`,
  }));
}

// 2. stacked wordmark x4  (Sort / My / Cover, tick in Cover)
const PITCH = 920;
for (const [k, way] of Object.entries(WAYS)) {
  const l1 = text(f800, 'Sort', 0, 0, EM, LS), l2 = text(f800, 'My', 0, PITCH, EM, LS);
  const p = wordmarkParts(0, 2 * PITCH, 'C', 'ver');
  const bb = bbUnion([l1.bb, l2.bb, p.bb]);
  out(`stacked-${k}.svg`, svg({
    name: `stacked-${k}`, title: 'SortMyCover', comment: COMMENT.wordmark + ' Stacked version for square placements; left-aligned.', w: 320,
    vb: [bb.x1, bb.y1, bb.x2 - bb.x1, bb.y2 - bb.y1],
    body: `<path fill="${fillFor(way)}" d="${l1.d}${l2.d}${p.a.d}${p.b.d}"/>${discTick(p.cx, p.cy, DISC, way, 0.68)}`,
  }));
}

// 3. tick mark alone (full-bleed disc in a 64 box). Heavier-than-wordmark tick ratio for 16 px legibility.
const TR = 0.74;
const t64 = (disc, tick) => `<path fill="${rgb(disc)}" d="${circle(32, 32, 32)}"/><path fill="${rgb(tick)}" d="${tickD(32, 32, 64, TR, 4.6)}"/>`;
out('tick-mark.svg', svg({ name: 'tick-mark', title: 'SortMyCover tick', comment: COMMENT.tick, vb: [0, 0, 64, 64], w: 256, body: t64('amber', 'accentText') }));
out('tick-reversed.svg', svg({ name: 'tick-reversed', title: 'SortMyCover tick, reversed', comment: COMMENT.tick + ' Reversed: charcoal circle with amber tick, for amber backgrounds.', vb: [0, 0, 64, 64], w: 256, body: t64('charcoal', 'amber') }));

// 4. monochrome favicon glyph (disc with knocked-out tick, theme-aware colour)
const glyphD = `${circle(32, 32, 32)}${tickD(32, 32, 64, TR, 4.6)}`;
out('favicon-glyph.svg', `<?xml version="1.0" encoding="UTF-8"?>\n<!-- favicon-glyph | monochrome for browser tabs (dark/light) and Windows tiles. Minimum 16 px. -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="SortMyCover tick"><title>SortMyCover tick</title><style>path{fill:${rgb('black')}}@media (prefers-color-scheme:dark){path{fill:${rgb('white')}}}</style><path fill-rule="evenodd" d="${glyphD}"/></svg>\n`);

// 5. horizontal lock-up with line (outlined line text)
const LINE = T.brand.line;
for (const k of ['charcoal', 'offwhite']) {
  const way = WAYS[k], p = wordmarkParts();
  const ln = text(f500, LINE, p.end + 420, 0, 400, 0);
  const bb = bbUnion([p.bb, ln.bb]);
  out(`lockup-horizontal-${k}.svg`, svg({
    name: `lockup-horizontal-${k}`, title: `SortMyCover. ${LINE}`, comment: COMMENT.lockup + ' Use for email signature, PDF footer, proposal header.', w: 900,
    vb: [bb.x1, bb.y1, bb.x2 - bb.x1, bb.y2 - bb.y1],
    body: `<path fill="${fillFor(way)}" d="${p.a.d}${p.b.d}${ln.d}"/>${discTick(p.cx, p.cy, DISC, way, 0.68)}`,
  }));
}

// 6. endorsement lock-up
for (const k of ['charcoal', 'offwhite']) {
  const way = WAYS[k], p = wordmarkParts();
  const en = text(f500, `·  ${T.brand.endorsement}`, p.end + 260, 0, 300, 0);
  const bb = bbUnion([p.bb, en.bb]);
  out(`lockup-endorsement-${k}.svg`, svg({
    name: `lockup-endorsement-${k}`, title: `SortMyCover, ${T.brand.endorsement}`, comment: COMMENT.lockup + ' Small, always present where consumers read terms (footer, About, legal docs, invoices).', w: 720,
    vb: [bb.x1, bb.y1, bb.x2 - bb.x1, bb.y2 - bb.y1],
    body: `<path fill="${fillFor(way)}" d="${p.a.d}${p.b.d}${en.d}"/>${discTick(p.cx, p.cy, DISC, way, 0.68)}`,
  }));
}

// 7. co-brand lock-up: tick mark + "{Practice name} · FSP {number}"
{
  const D = 520, size = 300;
  const sample = text(f500, 'Mark Smith Financial Services · FSP 00000 (SAMPLE)', D + 200, D / 2 + size * 0.35, size, 0);
  const bb = bbUnion([sample.bb, { x1: 0, y1: 0, x2: D, y2: D }]);
  const body = `<path fill="${rgb('amber')}" d="${circle(D / 2, D / 2, D / 2)}"/><path fill="${rgb('accentText')}" d="${tickD(D / 2, D / 2, D, TR, 4.6)}"/>`;
  out('lockup-cobrand-sample.svg', svg({
    name: 'lockup-cobrand-sample', title: 'SortMyCover tick, Mark Smith Financial Services, FSP 00000 (SAMPLE) (fictional sample)', w: 720,
    comment: 'FICTIONAL SAMPLE. Co-brand lock-up: the only place a broker identity sits next to ours (intro card, pre-call brief header, booking confirmation). Clear space: tick height all sides. Practice name is outlined here; production renders it live from the brokers row via lockup-cobrand.template.svg or the HTML .sm-cobrand component.',
    vb: [bb.x1, bb.y1, bb.x2 - bb.x1, bb.y2 - bb.y1],
    body: `${body}<path fill="${rgb('charcoal')}" d="${sample.d}"/>`,
  }));
  // Live template: <text> placeholders. Requires the self-hosted DM Sans (tokens.css @font-face) when inlined into HTML; fallback stack documented.
  const ty = D / 2 + size * 0.35;
  out('lockup-cobrand.template.svg', `<?xml version="1.0" encoding="UTF-8"?>\n<!-- lockup-cobrand.template | TEMPLATE, not a master. Replace {{practice}} and {{fsp}}. The only SVG in the system that uses <text>, because the practice name is data.\n     Use inline in an HTML page that loads brand/tokens.css (self-hosted DM Sans 500). Standalone/<img> use falls back to the system sans stack. Clear space: tick height all sides. -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 ${D}" width="900" height="${Math.round(900 * D / 3000)}" role="img" aria-label="SortMyCover, {{practice}}, FSP {{fsp}}"><title>SortMyCover, {{practice}}, FSP {{fsp}}</title><path fill="${rgb('amber')}" d="${circle(D / 2, D / 2, D / 2)}"/><path fill="${rgb('accentText')}" d="${tickD(D / 2, D / 2, D, TR, 4.6)}"/><text x="${D + 200}" y="${r2(ty)}" font-family="DM Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="500" font-size="${size}" fill="${rgb('charcoal')}">{{practice}} · FSP {{fsp}}</text></svg>\n`);
}

// geometry export for other scripts
fs.writeFileSync(path.join(root, 'logo', 'geometry.json'), JSON.stringify({
  note: 'Reference geometry for animation code (tick draw). Tick path in a 24 box: M5 13 L9 17 L19 7, stroke 4, round caps and joins. Wordmark tick ratio 0.68 of the disc; standalone mark 0.74 with stroke 4.6.',
  tickPoints24: TICK_PTS, wordmarkTickRatio: 0.68, standaloneTickRatio: TR, standaloneStroke24: 4.6, discEm: 0.95
}, null, 2) + '\n');
console.log('logo SVGs written:', fs.readdirSync(path.join(root, 'logo')).length);
