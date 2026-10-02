// Generates tokens.css and tokens.md from tokens.json (the single source).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8'));
const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).replace(/(\d)/, '-$1').replace(/--/g,'-');

// ---- contrast maths (WCAG 2.x) ----
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const ratio = (a, b) => { const x = L(T.color[a].rgb), y = L(T.color[b].rgb); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// consistency check: rgb must match hex
for (const [k, c] of Object.entries(T.color)) {
  const r = [1, 3, 5].map(i => parseInt(c.hex.slice(i, i + 2), 16));
  if (r.join() !== c.rgb.join()) throw new Error(`rgb mismatch for ${k}`);
}

// ---- tokens.css ----
let css = `/* GENERATED from tokens.json by scripts/build-tokens.mjs. Do not edit by hand.\n   SortMyCover brand tokens v${T.version}. The only file (with tokens.json) that holds hex values. */\n`;
css += `@font-face{font-family:"DM Sans";font-style:normal;font-weight:500;font-display:swap;src:url("fonts/dm-sans-latin-500-normal.woff2") format("woff2"),url("fonts/dm-sans-latin-500-normal.woff") format("woff")}\n`;
css += `@font-face{font-family:"DM Sans";font-style:normal;font-weight:800;font-display:swap;src:url("fonts/dm-sans-latin-800-normal.woff2") format("woff2"),url("fonts/dm-sans-latin-800-normal.woff") format("woff")}\n`;
css += `:root{\n  /* palette */\n`;
for (const [k, c] of Object.entries(T.color)) css += `  --sm-${kebab(k)}: ${c.hex};\n`;
css += `  --sm-scrim: ${T.scrim.value};\n  /* semantic roles */\n`;
for (const [k, v] of Object.entries(T.semantic)) css += `  --sm-${kebab(k)}: var(--sm-${kebab(v)});\n`;
css += `  /* type */\n  --sm-font: ${T.type.family};\n  --sm-weight-headline: ${T.type.weights.headline};\n  --sm-weight-body: ${T.type.weights.body};\n`;
for (const [k, v] of Object.entries(T.type.scalePx)) css += `  --sm-text-${k}: ${v}px;\n`;
for (const [k, v] of Object.entries(T.type.scalePx)) css += `  --sm-canvas-${k}: ${v * T.type.canvasMultiplier}px;\n`;
css += `  --sm-lh-headline: ${T.type.lineHeight.headline};\n  --sm-lh-body: ${T.type.lineHeight.body};\n  --sm-ls-headline: ${T.type.letterSpacingEm.headline}em;\n`;
css += `  /* space, radius, safe zones */\n`;
for (const [k, v] of Object.entries(T.space)) css += `  --sm-space-${k}: ${v}px;\n`;
for (const [k, v] of Object.entries(T.radius)) css += `  --sm-radius-${k}: ${v}px;\n`;
css += `  --sm-safe-top: ${T.safeZones.reelsTopPx}px;\n  --sm-safe-bottom: ${T.safeZones.reelsBottomPx}px;\n}\n`;
css += `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--sm-bg:var(--sm-dark-bg);--sm-text:var(--sm-dark-text);--sm-surface:var(--sm-dark-card);--sm-surface-raised:var(--sm-dark-card)}}\n:root[data-theme="dark"]{--sm-bg:var(--sm-dark-bg);--sm-text:var(--sm-dark-text);--sm-surface:var(--sm-dark-card);--sm-surface-raised:var(--sm-dark-card)}\n`;
css += `.sm-font{font-family:var(--sm-font);font-weight:var(--sm-weight-body);font-variant-numeric:tabular-nums}\n`;
fs.writeFileSync(path.join(root, 'tokens.css'), css);

// ---- tokens.md ----
const pairs = [
  ['charcoal', 'offWhite', 'Body text on off-white (default)'],
  ['offWhite', 'charcoal', 'Body text on charcoal (default)'],
  ['accentText', 'amber', 'CTA text and tick ink on amber'],
  ['charcoal', 'amber', 'Charcoal on amber'],
  ['amber', 'charcoal', 'Amber on charcoal: highlights and headline emphasis'],
  ['amber', 'offWhite', 'Amber on off-white'],
  ['amberDark', 'offWhite', 'Dark amber on off-white'],
  ['muted', 'offWhite', 'Muted text on off-white'],
  ['offWhite', 'amber', 'Off-white on amber'],
  ['darkText', 'darkBg', 'Dark-mode text on dark background'],
  ['amber', 'darkBg', 'Amber on dark-mode background'],
  ['offWhite', 'charcoal2', 'Off-white on raised charcoal'],
];
const verdict = (r, label) => {
  const big = label.includes('highlights') ? 'large' : null;
  return { aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7 };
};
const rule = {
  'Amber on charcoal: highlights and headline emphasis': 'Passes AA for all text (7.28:1). Brand policy, not a WCAG limit: large text and device only, never body copy.',
  'Amber on off-white': 'DO NOT USE for text. Device and fills only.',
  'Dark amber on off-white': 'Large text only (18.66 px bold / 24 px).',
  'Amber on dark-mode background': 'Passes AA. Same brand policy: large text and device only.',
  'Off-white on amber': 'DO NOT USE.',
};
let md = `# SortMyCover tokens v${T.version}\n\nGenerated from \`tokens.json\` by \`npm run tokens\`. Edit the JSON, never this file.\n\n## Palette\n\n| Token | Hex | RGB | CMYK (naive) | Role |\n|---|---|---|---|---|\n`;
for (const [k, c] of Object.entries(T.color)) md += `| \`${k}\` | ${c.hex} | ${c.rgb.join(', ')} | ${c.cmyk.join(', ')} | ${c.role} |\n`;
md += `\nNotes: \`accentText\` ${T.color.accentText.hex} is the ink on amber for text and for the tick (the approved ad mock-up and landing page draw the tick in this near-black brown, not in charcoal). Mono logos use \`black\`/\`white\` only. Semantic colours for the console (success, warn, danger) are separate and never used in brand; the one status green that appears in the approved landing reference belongs to the web app, not to this palette.\n\n## Semantic roles\n\n| Role | Maps to |\n|---|---|\n`;
for (const [k, v] of Object.entries(T.semantic)) md += `| \`${k}\` | \`${v}\` |\n`;
md += `\n## WCAG 2.x contrast (computed from the hex values)\n\n| Foreground on background | Ratio | AA body (4.5) | AA large (3.0) | Rule |\n|---|---|---|---|---|\n`;
for (const [f, b, label] of pairs) {
  const r = ratio(f, b);
  const note = rule[label] || (r >= 4.5 ? 'OK for all text' : r >= 3 ? 'Large text only' : 'Fails');
  md += `| ${label} (${T.color[f].hex} on ${T.color[b].hex}) | ${r.toFixed(2)}:1 | ${r >= 4.5 ? 'pass' : 'fail'} | ${r >= 3 ? 'pass' : 'fail'} | ${note} |\n`;
}
md += `\n**Rules that follow:** body text is always off-white (on charcoal) or charcoal (on off-white). Amber is for the device, highlights and CTA fills; text on amber is \`accentText\` (or charcoal). Amber text on charcoal is a brand policy limit (24 px and up, or 18.66 px bold and up): the computed ratio is 7.28:1, which passes WCAG AA at every size, so the master prompt's wording "passes AA for large text only" (4D.4b.4) is stricter than the arithmetic; we keep the stricter rule as house style and flag the wording for correction. Amber never carries text on off-white.\n\n## Type\n\n- Family: ${T.type.family}\n- ${T.type.licence}\n- Weights: ${T.type.weights.headline} headlines, ${T.type.weights.body} body. Tabular numerals for every figure.\n- UI scale (px): ${Object.values(T.type.scalePx).join(' / ')} (CSS vars \`--sm-text-xl\` to \`--sm-text-sm\`).\n- Canvas scale for 1080-wide creative (UI x ${T.type.canvasMultiplier}): ${Object.values(T.type.scalePx).map(v => v * T.type.canvasMultiplier).join(' / ')} px (\`--sm-canvas-*\`). No creative text below ${T.type.minCanvasTextPx} px on a 1080 canvas (11 CSS px on a phone).\n- Line height ${T.type.lineHeight.headline} headlines, ${T.type.lineHeight.body} body; headline letter-spacing ${T.type.letterSpacingEm.headline}em.\n\n## Space and radius\n\nSpace (px): ${Object.entries(T.space).map(([k, v]) => `${k}=${v}`).join(', ')}. Radius (px): ${Object.entries(T.radius).map(([k, v]) => `${k}=${v}`).join(', ')}.\n\n## Logo\n\nClear space: ${T.logo.clearSpace}. Minimum width: wordmark ${T.logo.minWidthPx.wordmark} px, tick ${T.logo.minWidthPx.tick} px. Paths are listed under \`logo.paths\` in tokens.json.\n`;
fs.writeFileSync(path.join(root, 'tokens.md'), md);
console.log('tokens.css + tokens.md written');
