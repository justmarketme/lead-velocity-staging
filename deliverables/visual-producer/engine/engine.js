/* SortMyCover concept scene engine v2: timeline-driven from performance-creative-director briefs. Pure function of (spec, t). See scene.html and render-concepts.mjs. */
(() => {
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const pr = (t, a, d) => clamp((t - a) / d);
const eo = x => 1 - Math.pow(1 - x, 3);
const eb = x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const D = (st, inner = '') => `<div style="position:absolute;${st}">${inner}</div>`;
const T = (x, y, w, txt, size, o = {}) => { const wt = o.wt ?? 800; return D(`left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;font-weight:${wt};line-height:${o.lh ?? 1.08};letter-spacing:${wt >= 800 ? '-0.015em' : '0'};color:${o.c || 'var(--fg)'};text-align:${o.al || 'left'};opacity:${o.op ?? 1};${o.x || ''}`, txt); };
const B = (x, y, w, h, st) => D(`left:${x}px;top:${y}px;width:${w}px;height:${h}px;${st}`);
const em = s => s.replace(/\*\*(.+?)\*\*/g, '<span style="color:var(--acc)">$1</span>');
const SVG = (x, y, w, h, vb, inner, st = '') => `<svg style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:visible;${st}" viewBox="${vb}">${inner}</svg>`;
const chk = (x, y, s, p, stroke = 'var(--acc-ink)') => p <= 0 ? '' : SVG(x, y, s, s, '0 0 24 24', `<path d="M5 13l4 4L19 7" fill="none" style="stroke:${stroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`, `transform:scale(${eb(p)});transform-origin:50% 50%`); // checklist ticks POP (never draw: the draw belongs to the brand tick on the end card)
const disc = (x, y, s, op = 1) => SVG(x, y, s, s, '0 0 64 64', `<path d="M0 32a32 32 0 1 0 64 0a32 32 0 1 0 -64 0Z" style="fill:var(--tdisc)"/><path d="M21.4 30.76L26.08 35.45L42.6 18.92A4.54 4.54 0 0 1 49.02 25.34L29.29 45.08A4.54 4.54 0 0 1 22.87 45.08L14.98 37.18A4.54 4.54 0 0 1 21.4 30.76Z" style="fill:var(--tink)"/>`, `opacity:${op}`);
const icon = (x, y, s, p, col, parts, sw = 4) => { const n = parts.length; return SVG(x, y, s, s, '0 0 100 100', parts.map((q, j) => { const pp = clamp(p * n - j); if (pp <= 0) return ''; const a = `pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - pp}" fill="none" style="stroke:${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`; return q.d ? `<path d="${q.d}" ${a}/>` : `<circle cx="${q.c[0]}" cy="${q.c[1]}" r="${q.c[2]}" ${a}/>`; }).join('')); };
const ICONS = { pram: [{ d: 'M18 56H84C84 38 68 28 50 28V56' }, { d: 'M84 56L92 30H98' }, { c: [34, 74, 9] }, { c: [70, 74, 9] }], house: [{ d: 'M12 52L50 18L88 52' }, { d: 'M22 46V84H78V46' }, { d: 'M42 84V62H58V84' }], doc: [{ d: 'M24 12H62L78 28V88H24Z' }, { d: 'M62 12V28H78' }, { d: 'M36 48H66M36 60H66M36 72H56' }] };
const screenCard = 'background:var(--sm-off-white);color:var(--sm-charcoal)';
const greyBar = (x, y, w, h = 18) => B(x, y, w, h, 'background:var(--sm-rule);border-radius:9px');
const fmtLine = (line, lt, strikeAt, still) => { const sp = still ? 1 : eo(pr(lt, strikeAt ?? .3, .25)); return em(line).replace(/~~(.+?)~~/g, (_, w) => `<span style="position:relative;display:inline-block">${w}<i style="position:absolute;left:-2%;top:56%;height:.11em;width:${104 * sp}%;background:var(--acc);border-radius:.06em"></i></span>`); };

// ---------- generic visual-zone pieces ----------
function chipsStack(lt, size) { const names = ['Video', 'WhatsApp', 'Phone'], h = size * 1.2, act = Math.floor(lt / .8) % 3; return D(`left:0;right:0;top:0;display:flex;flex-direction:column;gap:${size * .3}px;align-items:flex-start`, names.map((s, k) => { const p = eo(pr(lt, .1 * k, .22)), on = k === act; return `<div style="height:${h}px;min-width:${size * 6.4}px;padding:0 ${size * .6}px;border-radius:999px;display:flex;align-items:center;font-size:${size}px;font-weight:800;letter-spacing:-.01em;opacity:${p};transform:translateY(${40 * (1 - p)}px);${on ? 'background:var(--acc);color:var(--acc-ink);border:5px solid var(--acc)' : 'border:5px solid var(--fg)'}">${s}</div>`; }).join('')); }
function wedgeV(c, from) { const { t, vw, vh, u } = c, r = Math.min(vh * .40, 170), cx = vw / 2, cy = vh / 2 + 6, p = eo(pr(t, from, 1.5)); let o = B(cx - r, cy - r, 2 * r, 2 * r, 'border:9px solid var(--fg);border-radius:50%');
  const pt = a => [cx + (r - 6) * Math.sin(a), cy - (r - 6) * Math.cos(a)], a1 = Math.PI + Math.PI * p, [x0, y0] = pt(Math.PI), [x1, y1] = pt(a1);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; o += SVG(0, 0, vw, vh, `0 0 ${vw} ${vh}`, `<line x1="${cx + (r - 22) * Math.sin(a)}" y1="${cy - (r - 22) * Math.cos(a)}" x2="${cx + (r - 9) * Math.sin(a)}" y2="${cy - (r - 9) * Math.cos(a)}" style="stroke:var(--fg)" stroke-width="4" stroke-linecap="round"/>`); }
  if (p > 0) o += SVG(0, 0, vw, vh, `0 0 ${vw} ${vh}`, `<path d="M${cx} ${cy}L${x0} ${y0}A${r - 6} ${r - 6} 0 0 1 ${x1} ${y1}Z" style="fill:var(--acc)"/><line x1="${cx}" y1="${cy}" x2="${x1}" y2="${y1}" style="stroke:var(--fg)" stroke-width="7" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="10" style="fill:var(--fg)"/>`);
  return o + T(cx + r + 28, cy - r * .85, 200, '13:00', 38 * Math.max(u, .8), { wt: 500 }) + T(cx + r + 28, cy + r * .6, 200, '12:30', 38 * Math.max(u, .8), { wt: 500 }); }
function pickerV(c, lt, slots) { const w = 860, h = Math.min(c.vh, 330), x = (c.vw - w) / 2, y = (c.vh - h) / 2, p = eo(pr(lt, 0, .25)); const bw = (w - 72 - 40) / 3;
  let o = T(36, 26, w - 72, 'Pick a time', 42, { c: 'var(--sm-charcoal)' }) + slots.map((s, k) => D(`left:${36 + k * (bw + 20)}px;top:104px;width:${bw}px;height:96px;border-radius:20px;display:grid;place-items:center;font-size:36px;font-weight:800;${k === 1 && lt > .6 ? 'background:var(--sm-amber);color:var(--sm-accent-text)' : 'background:var(--sm-off-white-2);color:var(--sm-charcoal)'}`, s)).join('');
  o += T(36, h - 62, w - 72, 'Example screen', 28, { wt: 500, c: 'var(--sm-muted)' }); return D(`left:${x}px;top:${y + 24 * (1 - p)}px;width:${w}px;height:${h}px;border-radius:30px;opacity:${p};${screenCard}`, o); }
function reminderV(c, lt, text) { const w = 820, h = Math.min(c.vh, 320), x = (c.vw - w) / 2, y = (c.vh - h) / 2, p = eb(pr(lt, 0, .3));
  let o = B(32, 30, 52, 52, 'border-radius:50%;background:var(--sm-charcoal)') + disc(38, 36, 40).replace('var(--tdisc)', 'var(--sm-amber)').replace('var(--tink)', 'var(--sm-accent-text)') + T(100, 38, 500, 'SortMyCover', 32, { c: 'var(--sm-charcoal)' }) + T(32, 108, w - 64, text, 38, { c: 'var(--sm-charcoal)', wt: 500 });
  o += D(`left:32px;top:${h - 120}px;width:${w - 64}px;height:72px;border-radius:36px;background:var(--sm-amber);color:var(--sm-accent-text);display:grid;place-items:center;font-size:32px;font-weight:800`, 'Move it');
  o += T(32, h - 40, w - 64, 'Example screen', 24, { wt: 500, c: 'var(--sm-muted)' }); return D(`left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:30px;transform:scale(${.86 + .14 * p});opacity:${clamp(p * 2)};${screenCard}`, o); }
const payslip = (c, rows, w) => { const { vw, vh } = c; const x = (vw - w) / 2; return B(x, 0, w, vh, 'border:6px solid var(--fg);border-radius:22px;background:var(--box)') + greyBar(x + 40, 34, 260, 20) + greyBar(x + 40, 68, 170, 14); };

// ---------- per-concept pictures (visual zone). c: {t, lt, i, R, vw, vh, u, still} ----------
const DEFS = {};
DEFS.C01 = { vis(c) { const { t, R, i, vw, vh, u, still } = c, h = Math.round(80 * u), yA = vh * .16, yB = vh * .60; let o = ''; const dim = (!still && i >= 3) ? .4 : 1;
  const aw = vw * .45 * eo(pr(t, R[0] + .3, .6)); o += B(0, yA, aw, h, 'background:var(--acc);border-radius:16px') + T(0, yA - 46 * u, 400, 'Work cover', 36 * u, { wt: 500, op: pr(t, R[0] + .6, .3) });
  const bw = vw * .60 * eo(pr(t, R[1] + .1, .6)); if (bw > 0) o += B(0, yB, bw, h, 'border:6px solid var(--fg);border-radius:16px') + T(24, yB + (h - 36 * u) / 2, 200, 'Bond', 36 * u, { op: pr(t, R[1] + .5, .2) });
  [['School fees', .60, .20, .9], ['Bills', .80, .30, 1.3]].forEach(([s, x0, w0, at]) => { const p = eo(pr(t, R[1] + at, .3)); if (p > 0) o += B(vw * x0, yB, vw * w0 * p + (x0 > .7 ? 90 * p : 0), h, 'background:var(--box);border:4px solid var(--fg);border-radius:12px') + T(vw * x0 + 18, yB + (h - 30 * u) / 2, vw * w0, s, 30 * u, { wt: 500, op: p }); });
  const gp = eo(pr(t, R[2], .3)) || (still ? 1 : 0); if (gp > 0) { const x0 = vw * .45 + 16, x1 = vw - 4, len = (x1 - x0) * gp, yy = yA + h / 2; o += B(x0, yy - 4, len, 8, 'background:var(--acc);border-radius:4px') + B(x0, yy - 24, 8, 48, 'background:var(--acc);border-radius:4px') + B(x0 + len - 8, yy - 24, 8, 48, 'background:var(--acc);border-radius:4px') + (still ? T(x0, yy - 70 * u, x1 - x0, 'the gap', 44 * u, { al: 'center', c: 'var(--acc)' }) : ''); }
  return D(`inset:0;opacity:${dim}`, o); } };
DEFS.C02A = { vis(c) { const { i, vw, vh, u } = c; if (i !== 2) return ''; return D(`inset:0;opacity:.3`, ['R1.4m bond', '3× salary cover'].map((s, k) => T(0, k * 70 * u, vw, s, 60 * u)).join('') + B(0, 160 * u, vw * .6, 8, 'background:var(--fg)') + T(0, 180 * u, vw, '= a gap', 80 * u, { c: 'var(--acc)' })); } };
DEFS.C02B = { vis(c) { const { t, R, i, vw, vh, u, still } = c, w = 760, x = (vw - w) / 2, d = still ? 1 : eo(pr(t, R[0] + .3, .6)); const labs = ['Gross vs net', 'Retirement fund', 'Group life cover'];
  let o = SVG(0, 0, vw, vh, `0 0 ${vw} ${vh}`, `<rect x="${x}" y="3" width="${w}" height="${vh - 6}" rx="22" fill="none" style="stroke:var(--fg)" stroke-width="6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - d}"/>`) + (d > .9 ? greyBar(x + 40, 30, 260, 18) + greyBar(x + 40, 60, 170, 12) : '');
  labs.forEach((s, k) => { const on = still || (k === 0 ? t >= R[0] + .3 : i >= k), cur = (!still && i === k) || (still && k === 2), y = 100 + k * ((vh - 130) / 3); if (!on) return; o += B(x + 28, y, w - 56, (vh - 130) / 3 - 14, `border-radius:14px;background:${k === 2 ? 'color-mix(in srgb,var(--acc) 30%,transparent)' : 'color-mix(in srgb,var(--fg) 15%,transparent)'}`) + T(x + 52, y + ((vh - 130) / 3 - 14 - 44 * u) / 2, w - 200, s, 44 * u, { c: k === 2 ? 'var(--acc)' : 'var(--fg)' }); if (k === 2) o += T(x + w - 190, y + ((vh - 130) / 3 - 14 - 36 * u) / 2, 150, '× salary', 36 * u, { wt: 500 }); });
  return i >= 5 && !still ? '' : o; } };
DEFS.C03 = { vis() { return ''; } };
DEFS.C04 = { vis() { return ''; } };
DEFS.C05 = { vis(c) { const { t, R, i, vw, vh, u } = c; if (i >= 3 && !c.still) return ''; const S_ = [[.55, .62, R[0] + .0, ''], [.70, .76, R[0] + .3, 'Bond'], [.85, .90, R[0] + 1.0, 'Kids'], [1, 1, R[0] + 1.6, 'School']]; let o = '';
  const stepAt = [[.55, .62], [.70, .76], [.85, .90], [1, 1]]; const times = [0, R[0] + .3, R[0] + 1.0, R[0] + 1.6]; let fw = .55, fh = .62; for (let k = 1; k < 4; k++) { const p = eo(pr(t, times[k], .35)); fw = stepAt[k - 1][0] + (stepAt[k][0] - stepAt[k - 1][0]) * p; fh = stepAt[k - 1][1] + (stepAt[k][1] - stepAt[k - 1][1]) * p; if (p < 1) break; }
  if (c.still || i >= 1) { fw = 1; fh = 1; if (i === 0 && !c.still) { /* keep growing */ } }
  const W = vw * fw, H = vh * fh; o += B(0, vh - H, W, H, 'border:6px solid var(--fg);border-radius:22px') + T(W - 220, vh - H + 12, 200, 'Life at 40', 30 * u, { wt: 500, al: 'right', c: 'var(--mid)' });
  ['Bond', 'Kids', 'School'].forEach((s, k) => { const at = c.still ? -9 : R[1] + k * .5, p = eb(pr(t, at, .25)); if (p > 0) o += D(`left:${24 + k * 210 * u}px;top:${vh - H + 54 * u}px;padding:6px 18px;border-radius:999px;border:4px solid var(--fg);font-size:${34 * u}px;font-weight:800;transform:scale(${p});transform-origin:0 0`, s); });
  o += D(`left:20px;top:${vh - 20 - 140 * u}px;width:${240 * u}px;height:${140 * u}px;border-radius:14px;background:var(--acc);display:grid;place-items:center;text-align:center;color:var(--acc-ink);font-weight:800;font-size:${34 * u}px;line-height:1.05;opacity:${eo(pr(t, .05, .25))}`, 'Cover<br>at 28'); return o; } };
DEFS.C06 = { vis(c) { const { t, R, i, vw, vh, u, still } = c; if (i >= 5 && !still) return ''; const hs = Math.min(vh * .62, 250), gp = (vw - 3 * hs) / 2, hy = vh * .10, cx = k => k * (hs + gp) + hs / 2; let o = '';
  const dimK = (!still && i === 3) ? .3 : 1, third = still ? 1 : eo(pr(t, R[1], .4)), pul = (!still && i === 2) ? 1 + .9 * Math.sin(pr(t, R[2], .5) * Math.PI) : 1;
  [0, 1, 2].forEach(k => { const p = k < 2 ? pr(t, R[0] + .1 + .2 * k, .5) : third; if (p > 0) o += D(`inset:0;opacity:${(k > 0 ? dimK : 1) * (k === 2 ? third : 1)}`, icon(k * (hs + gp), hy, hs, k < 2 ? p : 1, 'var(--fg)', ICONS.house, 3.2)); });
  const ly = hy + hs + 28, lp = i >= 1 || still ? 1 : eo(pr(t, R[0] + .3, .6)), x0 = cx(0), x1 = x0 + (cx(2) - x0) * (third > 0 && (i >= 1 || still) ? 1 : 0) + (cx(1) - x0) * ((i >= 1 || still) ? 0 : 1); const xe = (i >= 1 || still) ? cx(1) + (cx(2) - cx(1)) * third : cx(1);
  o += B(x0, ly - 4 * pul, (xe - x0) * (i === 0 && !still ? lp : 1), 8 * pul, 'background:var(--acc);border-radius:5px') + T(cx(0) - 20, ly + 18, 320, 'one income', 36 * u, { c: 'var(--acc)', op: pr(t, R[0] + .6, .3) });
  if (i >= 1 || still) o += T(cx(1) - 130, ly + 58 * u, 260, "a parent's rent", 32 * u, { al: 'center', wt: 500, op: third }) + T(cx(2) - 130, ly + 58 * u, 260, "a sibling's fees", 32 * u, { al: 'center', wt: 500, op: third });
  return o; } };
DEFS.C07 = { vis(c) { const { t, R, i, vw, vh, u, still } = c; if (i >= 4 && !still) return ''; if (i === 2 && !still) return ''; const w = 760, x = (vw - w) / 2; const sc = still ? 1 : (i === 1 ? 1 + .1 * eo(pr(t, R[1], .3)) : (i === 3 ? 1 + .1 * (1 - eo(pr(t, R[3], .3))) * 0 : 1)); const ret = (!still && i === 3) ? eo(pr(t, R[3], .25)) : 1;
  let o = B(x, 0, w, vh, 'border:6px solid var(--fg);border-radius:22px;background:var(--box)') + greyBar(x + 40, 30, 240, 18) + greyBar(x + 40, 60, 160, 12);
  ['Parents', 'Kids', "Sister's fees"].forEach((s, k) => { const at = [.3, 1.0, 1.7][k], p = still || i >= 1 ? 1 : eo(pr(t, at, .3)); if (p <= 0) return; const y = 100 + k * ((vh - 120) / 3); o += B(x + 40, y + 14 * u, 30 * u, 30 * u, 'border-radius:50%;background:var(--acc)') + T(x + 92, y, w - 200, s, 52 * u, { op: p }) + B(x + 40, y + 70 * u, (w - 80) * .9 * p, 12, 'background:var(--soft);border-radius:6px'); });
  return D(`inset:0;opacity:${ret};transform:scale(${sc});transform-origin:50% 50%`, o); } };
DEFS.C08 = { vis(c) { const { t, R, i, vw, vh, u, still } = c; if (i >= 2 && !still) return ''; const drop = (!still && i === 1) ? eo(pr(t, R[1], .4)) : 0; const rows = ['Sales visit', 'Jargon', 'Front-door knock']; let o = '';
  rows.forEach((s, k) => { const st = still ? 1 : eo(pr(t, [.3, 1.0, 1.7][k], .25)), y = k * 118 * u; o += T(0, y, vw, s, 84 * u) + B(0, y + 84 * u * .52, vw * Math.min(.95, s.length * .047 + .04) * st, 10, 'background:var(--acc);border-radius:5px'); });
  return D(`inset:0;opacity:${1 - drop};transform:translateY(${drop * 260}px)`, o); } };
DEFS.C09 = { vis() { return ''; } };
DEFS.C10 = { vis() { return ''; } };
DEFS.C11 = { vis(c) { const { t, R, i, vw, vh, u, still } = c; if (i === 1 && !still) { const bs = 120 * u, p = 1 + .12 * Math.sin(pr(t, R[1] + .2, .4) * Math.PI); return B((vw - bs) / 2, (vh - bs) / 2, bs, bs, `border:10px solid var(--acc);border-radius:26px;transform:scale(${p})`); }
  if (i === 2 || i === 3 || i === 4) return ''; if (i >= 6 && !still) return ''; const rh = vh / 5.2, bs = 56 * u; let o = '';
  ['Stock', 'Staff', 'Tax', 'Cash flow'].forEach((s, k) => { const p = still || i >= 5 ? 1 : pr(t, [.2, .5, .8, 1.1][k], .12); o += B(0, k * rh, bs, bs, `border:6px solid var(--fg);border-radius:14px;${p > 0 ? 'background:var(--acc);border-color:var(--acc)' : ''}`) + chk(bs * .1, k * rh + bs * .1, bs * .8, p) + T(bs + 24, k * rh + (bs - 46 * u) / 2, vw - bs - 30, s, 46 * u, { lh: 1 }); });
  const ap = (still || i === 0) ? eo(pr(t, 1.5, .25)) : 1, tk = (i === 5 && !still) ? pr(t, R[5] + .3, .15) : 0; o += D(`left:0;top:${4 * rh}px;width:${vw}px;height:${bs}px;opacity:${still ? 1 : ap}`, B(0, 0, bs, bs, `border:6px solid var(--acc);border-radius:14px;${tk > 0 ? 'background:var(--acc)' : ''}`) + chk(bs * .1, bs * .1, bs * .8, tk) + T(bs + 24, (bs - 46 * u) / 2, vw - bs - 30, 'Own cover', 46 * u, { c: 'var(--acc)', lh: 1 })); return o; } };
DEFS.C12A = { vis(c) { const { t, R, i, vw, vh, u, still } = c; if (i >= 2 && !still) return ''; const slide = (!still && i === 1) ? eo(pr(t, R[1], .4)) : 0, w = 520 * Math.max(u, .8), h = vh * .78, x = (vw - w) / 2, y = (vh - h) / 2, sp = still ? 1 : eo(pr(t, .3, .25));
  return D(`inset:0;transform:translateX(${slide * 1100}px);opacity:${1 - slide}`, SVG(x, y, w, h, '0 0 200 300', `<path d="M30 20H170V120L100 280L30 120Z" fill="none" style="stroke:var(--fg)" stroke-width="6" stroke-linejoin="round"/><circle cx="100" cy="62" r="12" fill="none" style="stroke:var(--fg)" stroke-width="6"/>`) + B(x - 40, y + h * .45, (w + 80) * sp, 14, 'background:var(--acc);border-radius:7px;transform:rotate(-8deg)')); } };
DEFS.C13 = { vis(c) { const { t, R, i, vw, vh, u, still, ratio } = c; if (i >= 4 && !still) return ''; const side = ratio !== '9x16'; const pw = side ? (vw - 150) / 2 : vw, ph = side ? vh : vh * .44, by = side ? 0 : vh * .56, bx = side ? pw + 150 : 0; let o = '';
  const items = ['30 minutes', 'real numbers', 'free'], tm = [R[1], R[2], R[2] + .5];
  const panel = (x, y, ttl, col, inner) => D(`left:${x}px;top:${y}px;width:${pw}px;height:${ph}px;border-radius:24px;background:var(--box);border:3px solid var(--soft);padding:${20 * u}px ${30 * u}px`, T(0, 0, pw, ttl, 54 * u, { c: col, lh: 1 }) + inner);
  o += panel(0, 0, 'Checking', 'var(--fg)', items.map((s, k) => { const p = still ? 1 : eo(pr(t, tm[k], .25)); return T(0, (72 + k * 52) * u, pw, s, 44 * u, { wt: 500, op: p, x: `transform:translateX(${-20 * (1 - p)}px)` }); }).join(''));
  o += panel(bx, by, 'Buying', 'var(--sm-muted)', T(0, 72 * u, pw, 'later, if ever', 44 * u, { wt: 500, c: 'var(--sm-muted)', op: still ? 1 : eo(pr(t, R[3], .25)) }));
  const dp = still ? 1 : eb(pr(t, .3, .25)), s = 90 * u, mx = side ? pw + 75 : vw / 2, my = side ? vh / 2 : vh * .50; o += D(`left:${mx - s / 2}px;top:${my - s / 2 - 120 * (1 - dp)}px;width:${s}px;height:${s}px;opacity:${dp > 0 ? 1 : 0};transform:scale(${1 + .2 * (1 - dp)})`, SVG(0, 0, s, s, '0 0 100 100', `<path d="M16 36H84M16 64H84M70 14L30 86" fill="none" style="stroke:var(--acc)" stroke-width="12" stroke-linecap="round"/>`)); return o; } };
DEFS.C14 = { vis(c) { const { t, R, i, vw, vh, u, still } = c; const ii = still ? 2 : i; const step = [1, 1, 2, 3, 4, 4, 5][Math.min(ii, 6)]; const lt = t - R[Math.min(ii, 8)]; const s = Math.min((vh - 4) / 520, 1), pw = 420, ph = 520;
  if (!still && ii >= 6) { let o = ''; const n = ii === 6 ? 5 : 5; for (let k = 1; k <= 5; k++) { const lit = k < 5 || ii >= 6, pp = (k === 5 && ii === 6) ? eb(pr(t, R[6] + .15, .3)) : 1, d = 110 * Math.max(u, .8); o += D(`left:${(vw - 5 * d - 4 * 28) / 2 + (k - 1) * (d + 28)}px;top:${(vh - d) / 2}px;width:${d}px;height:${d}px;border-radius:50%;background:${lit ? 'var(--acc)' : 'var(--soft)'};color:var(--acc-ink);display:grid;place-items:center;font-size:${64 * Math.max(u, .8)}px;font-weight:800;transform:scale(${lit ? pp : 1})`, k); } return o; }
  const slide = still ? 1 : eo(pr(t, R[0] + .3, .4)), p = eo(pr(lt, 0, .25)); const inW = pw - 16, ph2 = ph; let sc = '';
  if (step === 1 && (ii >= 1 || still)) sc = T(26, 30, 320, 'Question 1 of 4', 26, { wt: 500, c: 'var(--sm-muted)' }) + [0, 1, 2, 3].map(k => greyBar(26, 80 + k * 70, inW - 52 - (k % 2) * 60, 34)).join('') + B(26, 352, 38, 38, 'border:4px solid var(--sm-charcoal);border-radius:8px') + greyBar(80, 364, 220, 16) + D(`left:26px;top:${ph2 - 108}px;width:${inW - 52}px;height:64px;border-radius:32px;background:var(--sm-amber);color:var(--sm-accent-text);display:grid;place-items:center;font-size:30px;font-weight:800`, 'Next');
  if (step === 2) sc = B(0, 0, inW, 76, 'background:var(--sm-charcoal)') + disc(20, 16, 44).replace('var(--tdisc)', 'var(--sm-amber)').replace('var(--tink)', 'var(--sm-accent-text)') + greyBar(78, 22, 150, 14) + greyBar(78, 44, 100, 12) + D(`left:22px;top:104px;width:${inW - 44}px;height:${ph2 - 180}px;border-radius:18px;background:var(--sm-off-white-2);padding:20px`, B(0, 0, 110, 110, 'border-radius:16px;background:var(--sm-rule)') + greyBar(130, 14, 200, 20) + greyBar(130, 54, 150, 16) + greyBar(0, 140, 280, 18) + greyBar(0, 180, 220, 18) + greyBar(0, 220, 250, 18));
  if (step === 3) sc = T(26, 30, 300, 'Pick a time', 34, { c: 'var(--sm-charcoal)' }) + ['10:00', '12:30', '15:00'].map((s, k) => D(`left:26px;top:${100 + k * 110}px;width:${inW - 52}px;height:84px;border-radius:18px;display:grid;place-items:center;font-size:36px;font-weight:800;${k === 1 && lt > .6 ? 'background:var(--sm-amber);color:var(--sm-accent-text)' : 'background:var(--sm-off-white-2);color:var(--sm-charcoal)'}`, s)).join('');
  if (step === 4) sc = D(`left:0;top:0;width:${inW}px;height:${ph2 - 16}px;background:var(--sm-charcoal);color:var(--sm-off-white)`, T(0, 130, inW, '30:00', 110, { al: 'center', c: 'var(--sm-off-white)', lh: 1 }) + T(0, 280, inW, 'minutes', 34, { al: 'center', wt: 500, c: 'var(--sm-off-white)' }));
  if (step === 5) sc = '';
  const dim = (!still && ii === 5) ? .35 : 1;
  const phone = D(`left:0;top:0;width:${pw}px;height:${ph}px;border-radius:46px;border:8px solid var(--fg);background:var(--sm-off-white);overflow:hidden;opacity:${(.4 + .6 * slide) * dim}`, D(`left:0;top:${14 * (1 - p)}px;width:${inW}px;height:${ph2 - 16}px;opacity:${.3 + .7 * p}`, sc) + D(`left:${inW / 2 - 60}px;top:0;width:120px;height:20px;border-radius:0 0 14px 14px;background:var(--sm-charcoal)`) + (step >= 1 && step <= 4 ? T(0, ph - 56, inW, 'Example screen', 26, { al: 'center', wt: 500, c: 'var(--sm-muted)' }) : ''));
  const badge = D(`left:${-150}px;top:10px;width:110px;height:110px;border-radius:50%;background:var(--acc);color:var(--acc-ink);display:grid;place-items:center;font-size:66px;font-weight:800;transform:scale(${.7 + .3 * eb(pr(lt, 0, .3))})`, String(step));
  const px = (vw - pw * s) / 2; return D(`left:${px}px;top:${2 + 60 * (1 - slide)}px;width:${pw}px;height:${ph}px;transform:scale(${s});transform-origin:0 0`, phone + badge); } };
DEFS.C15 = { vis() { return ''; } };

DEFS.C12B = DEFS.C12A; // v1.1: the MYTH/FACT card is retired; H8 reserve uses the same blank-tag visual
// ---------- ON block (the hook / kinetic zone) ----------
function onBlock(r, lt, W, size, still, o2 = {}) { const lines = r.on || []; if (!lines.length) return ''; let boxN = -1, html = '';
  lines.forEach((ln, k) => { let txt = ln, ic = null; const b = still ? 0 : (r.beats?.[k] ?? 0), p = still ? 1 : eo(pr(lt, b, .2)), st = still ? 1 : pr(lt, b, .18); const sz = r.size ? (still ? Math.min(r.size, size * 1.25) : r.size) : size;
    if (!still && lt < b) { html += `<div style="height:${sz * 1.05}px"></div>`; return; }
    const trans = r.slide === 'left' ? `translateX(${-140 * (1 - p)}px)` : `scale(${1 + .08 * (1 - eo(st))})`;
    if (ln === '---') { html += `<div style="height:${sz * .25}px;display:flex;align-items:center"><i style="display:block;height:10px;border-radius:5px;background:var(--fg);width:${(still ? 1 : eo(pr(lt, r.ruleAt ?? .4, .4))) * 94}%"></i></div>`; return; }
    if (ln === '@chips') { html += chipsStack(still ? 3 : lt, sz); return; }
    const bm = ln.match(/^\[(x| )\] (.*)$/); let boxHtml = '';
    if (bm) { boxN++; const done = bm[1] === 'x', tk = r.tick?.[boxN], bs = sz * .86, popP = still ? (done ? 1 : 0) : (tk === undefined ? (done ? 1 : 0) : pr(lt, tk, .12)); const amb = /\*\*/.test(bm[2]), pulse = (!still && r.pulse && r.pulse.line === k) ? 1 + .06 * Math.sin(pr(lt, r.pulse.at, .3) * Math.PI) : 1; const slideOff = (r.offLines && r.offLines.includes(k)) ? eo(pr(lt, r.offAt ?? 0, .3)) : 0;
      boxHtml = `<span style="flex:none;position:relative;width:${bs}px;height:${bs}px;margin-right:${sz * .3}px;border:5px solid ${amb ? 'var(--acc)' : 'var(--fg)'};border-radius:${bs * .22}px;${popP > 0 ? 'background:var(--acc);border-color:var(--acc)' : ''};transform:scale(${pulse})"><span style="position:absolute;inset:0">${popP > 0 ? chk(bs * .1, bs * .1, bs * .8, popP) : ''}</span></span>`; txt = bm[2]; if (slideOff) { html += `<div style="height:${sz * 1.05 * (1 - slideOff)}px;overflow:hidden;opacity:${1 - slideOff};transform:translateY(${-60 * slideOff}px);display:flex;align-items:center;font-size:${sz}px;line-height:1.05;font-weight:800">${boxHtml}<span>${fmtLine(txt, lt, r.strikeAt, still)}</span></div>`; return; } }
    const ip = txt.split('|'); if (ip[1]) { txt = ip[0]; const [nm, at] = ip[1].split('@'); ic = { nm, at: +at }; }
    let inner = fmtLine(txt, lt, r.strikeAt, still);
    if (r.ul) { const ul = r.ul, wgrow = still ? (k === (r.ulFinal ?? ul.length - 1) ? 1 : 0) : eo(pr(lt, ul[k], .25)) * (1 - (ul[k + 1] !== undefined ? eo(pr(lt, ul[k + 1], .2)) : 0)); inner = `<span style="position:relative;display:inline-block">${inner}<i style="position:absolute;left:0;bottom:-10px;height:11px;width:${100 * wgrow}%;background:var(--acc);border-radius:6px"></i></span>`; }
    let fl = ''; if (r.flipLine === k && !still) { const f = pr(lt, 0, .15); fl = `transform:scaleY(${Math.max(.02, f)});`; }
    const col = r.color === 'acc' ? 'var(--acc)' : '';
    const icoH = ic ? `<span style="position:absolute;right:0;top:50%;margin-top:${-sz * .7}px">${icon(0, 0, sz * 1.4, still ? 1 : pr(lt, ic.at, .5), 'var(--fg)', ICONS[ic.nm], 3.6).replace('style="position:absolute;', 'style="position:relative;')}</span>` : '';
    html += `<div style="position:relative;display:flex;align-items:center;font-size:${sz}px;line-height:1.05;font-weight:800;letter-spacing:-.015em;transform:${trans};transform-origin:0 50%;${col ? 'color:' + col + ';' : ''}${fl}">${boxHtml}<span>${inner}</span>${icoH}</div>`; });
  return html; }

// ---------- engine ----------
const LAY = {
  '9x16': { W: 1080, H: 1920, hookY: 270, hookS: 96, visY: 700, visH: 560, st: { headY: 1264, headS: 50, lineS: 34, logoY: 1520, logoH: 56 }, tagS: 28 },
  '4x5': { W: 1080, H: 1350, hookY: 72, hookS: 84, visY: 380, visH: 470, st: { headY: 880, headS: 50, lineS: 32, logoY: 1226, logoH: 56 }, tagS: 26 },
  '1x1': { W: 1080, H: 1080, hookY: 64, hookS: 72, visY: 310, visH: 380, st: { headY: 715, headS: 44, lineS: 28, logoY: 950, logoH: 52 }, tagS: 24 },
};
const V45 = { hookY: 150, hookH: 400, visY: 570, visH: 400, capY: 1010, capS: 40, tick: { x: 72, y: 72, s: 56 } };
const V9 = { hookY: 360, hookH: 540, visY: 900, visH: 400, capY: 1330, capS: 44, tick: { x: 72, y: 266, s: 64 } };
let V = V9;
let spec, L, def, tw, wmo;
const EC = { '9x16': { tickY: 420, tickS: 300, wmY: 760, wmH: 84, lineY: 930, lineS: 96, ctaY: 1296, ctaS: 60, ctaPad: '36px 72px', ctaMin: 132, fineY: 1512, fineS: 33, tagY: 1452 },
  '4x5': { tickY: 150, tickS: 240, wmY: 440, wmH: 72, lineY: 570, lineS: 88, ctaY: 940, ctaS: 54, ctaPad: '30px 64px', ctaMin: 120, fineY: 1150, fineS: 30, tagY: 1100 } };
const endCard = (e, W, tagTxt, k = EC['9x16']) => { const tk = pr(e, 0, .4), pop = eb(pr(e, 0, .22)), cx = W / 2;
  const tick = SVG(cx - k.tickS / 2, k.tickY, k.tickS, k.tickS, '0 0 64 64', `<g transform="translate(32 32) scale(${.55 + .45 * pop}) translate(-32 -32)"><path d="M0 32a32 32 0 1 0 64 0a32 32 0 1 0 -64 0Z" style="fill:var(--tdisc)"/><path d="M18.2 34L26.1 41.9L45.8 22.1" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - eo(tk)}" style="stroke:var(--tink)" stroke-width="9.08" stroke-linecap="round" stroke-linejoin="round" ${tk <= 0 ? 'opacity="0"' : ''}/></g>`);
  const line = T(72, k.lineY + 30 * (1 - eo(pr(e, .55, .3))), W - 144, em('Sort your cover.<br>30 minutes.<br>**A real adviser.**'), k.lineS, { al: 'center', lh: 1.05, op: eo(pr(e, .55, .3)) });
  const cp = eb(pr(e, .9, .3)); const cta = D(`left:0;right:0;top:${k.ctaY}px;display:grid;justify-items:center;opacity:${clamp(cp * 2)};transform:scale(${.8 + .2 * cp})`, `<div style="background:var(--acc);color:var(--acc-ink);font-weight:800;font-size:${k.ctaS}px;border-radius:999px;padding:${k.ctaPad};min-height:${k.ctaMin}px;display:flex;align-items:center">Tap to check your cover</div>`);
  return tick + line + cta + T(72, k.fineY, W - 144, 'SortMyCover is a service of Lead Velocity (Pty) Ltd', k.fineS, { al: 'center', wt: 500, op: eo(pr(e, 1.2, .4)) }) + tagTxt; };
async function init(s) {
  spec = s; L = LAY[s.ratio]; V = s.ratio === '4x5' ? V45 : V9; def = DEFS[s.vid]; const st = document.getElementById('stage'); st.style.width = L.W + 'px'; st.style.height = L.H + 'px'; st.className = s.variant === 'teal' ? 'teal' : '';
  tw = document.getElementById('tw'); wmo = document.getElementById('wmo'); const teal = s.variant === 'teal';
  tw.src = `../../../brand/logo/${teal ? 'tick-mark-teal' : 'tick-mark'}.svg`; wmo.src = `../../../brand/logo/${teal ? 'wordmark-charcoal-teal-tick' : 'wordmark-offwhite'}.svg`;
  await Promise.all([document.fonts.load('800 80px "DM Sans"'), document.fonts.load('500 40px "DM Sans"')]); await document.fonts.ready; await Promise.all([tw, wmo].map(i => i.decode().catch(() => {})));
  s.R = s.rows.map(r => r.t0);
}
async function draw(t) {
  const s = spec, still = s.mode === 'still', W = L.W, R = s.R; let h = ''; const stl = s.still || { row: 0, lt: 1 };
  if (still) t = R[stl.row] + stl.lt;
  const end = !still && t >= s.E, i = Math.max(0, R.filter(x => x <= t).length - 1), r = s.rows[i], lt = t - R[i];
  tw.style.display = 'none'; wmo.style.display = 'none';
  const tagEl = (x, y, sz, op = .7) => s.tag ? D(`left:${x}px;top:${y}px;font-size:${sz}px;font-weight:500;color:var(--fg);opacity:${op};white-space:nowrap`, s.tag) : '';
  if (end) { const ek = EC[s.ratio] || EC['9x16']; h += endCard(t - s.E, W, s.tag ? T(72, ek.tagY, W - 144, s.tag, 30, { al: 'center', wt: 500, op: .8 }) : '', ek); wmo.style.display = 'block'; wmo.style.height = ek.wmH + 'px'; wmo.style.width = 'auto'; wmo.style.top = ek.wmY + 'px'; wmo.style.left = '0'; await wmo.decode().catch(() => {}); wmo.style.left = (W - wmo.getBoundingClientRect().width) / 2 + 'px'; wmo.style.opacity = eo(pr(t - s.E, .4, .2)); }
  else if (!still) {
    const vw = W - 144, u = clamp(V.visH / 560, .72, 1), c = { t, lt, i, R, vw, vh: V.visH, u, still: false, ratio: s.ratio || '9x16' };
    h += D(`left:72px;top:${V.hookY}px;width:${vw}px;height:${V.hookH}px;display:flex;flex-direction:column;justify-content:center;${r.on && r.on.includes('@chips') ? 'justify-content:flex-start;padding-top:40px;' : ''}`, onBlock(r, lt, vw, r.size || 96, false));
    let pic = ''; if (r.v === 'wedge') pic = wedgeV(c, R[r.wedgeFrom ?? i] + (r.wedgeDelay ?? 0)); else if (r.v === 'picker') pic = pickerV(c, lt, r.slots); else if (r.v === 'reminder') pic = reminderV(c, lt, r.text); else pic = def.vis(c);
    h += D(`left:72px;top:${V.visY}px;width:${vw}px;height:${V.visH}px`, pic || '');
    if (r.cap) { const p = eo(pr(lt, 0, .1)); h += D(`left:72px;top:${V.capY}px;width:860px;opacity:${p}`, `<span style="display:inline-block;background:var(--box);border-radius:12px;padding:16px 24px;font-size:${V.capS}px;font-weight:500;line-height:1.25;max-width:860px">${r.cap}</span>`); }
    tw.style.display = 'block'; tw.style.left = V.tick.x + 'px'; tw.style.top = V.tick.y + 'px'; tw.style.width = tw.style.height = V.tick.s + 'px';
    h += tagEl(72, V.visY + V.visH - 34, 28);
  } else {
    const vw = W - 144, q = L.st, row = s.rows[stl.row], onRow = stl.on ? { on: stl.on, ul: stl.ul, ulFinal: stl.ulFinal } : s.rows[stl.onRow ?? 0], visNone = !!stl.noVis; const zoneH = q.headY - L.hookY - 30;
    const u = clamp(L.visH / 560, .72, 1), c = { t, lt: stl.lt, i: stl.row, R, vw, vh: L.visH, u, still: true, ratio: s.ratio };
    h += D(`left:72px;top:${L.hookY}px;width:${vw}px;${visNone ? `height:${zoneH}px;display:flex;flex-direction:column;justify-content:center` : ''}`, onBlock(onRow, 99, vw, L.hookS, true));
    if (!visNone) { let pic = ''; if (row.v === 'wedge') pic = wedgeV({ ...c, t: 99 }, 0); else if (row.v === 'picker') pic = pickerV(c, 9, row.slots); else pic = def.vis(c); h += D(`left:72px;top:${L.visY}px;width:${vw}px;height:${L.visH}px`, pic || ''); }
    h += D(`left:72px;top:${q.headY}px;width:${vw}px`, `<div style="font-size:${q.headS}px;font-weight:800;line-height:1.1;letter-spacing:-.015em">${s.headline}</div><div style="margin-top:${q.lineS * .5}px;font-size:${q.lineS}px;font-weight:500;opacity:.85">Sort your cover. 30 minutes. A real adviser.</div>${s.disclosure ? `<div style="margin-top:${q.lineS * .5}px;font-size:${q.lineS * .94}px;font-weight:500">${s.disclosure}</div>` : ''}${s.tag ? `<div style="margin-top:${q.lineS * .45}px;font-size:${L.tagS}px;font-weight:500;opacity:.7">${s.tag}</div>` : ''}`);
    wmo.style.display = 'block'; wmo.style.height = q.logoH + 'px'; wmo.style.width = 'auto'; wmo.style.left = '72px'; wmo.style.top = q.logoY + 'px'; wmo.style.opacity = 1;
  }
  document.getElementById('dyn').innerHTML = h; await Promise.all([tw, wmo].map(i => i.decode().catch(() => {})));
}
window.SC = { init, draw };
})();
