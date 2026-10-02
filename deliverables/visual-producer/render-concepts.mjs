// One-command re-render of the cycle-1 creative (4D.5 code-rendered pipeline: HTML/SVG + headless Chromium + ffmpeg).
//   node deliverables/visual-producer/render-concepts.mjs
//   flags: --only=C01,C03  --stills  --video  --first-submit (video only for C01/C03/C14 + C01 teal)  --no-teal  --concurrency=3  --date=YYYYMMDD
// Reads  : performance-creative-director/creative-briefs/C{nn}.md (row times, captions, end-card time = the 9:16 timeline table; polled per concept, falls back to the
//          creative-strategist concepts.md/csv script when a brief is absent), concepts.csv (headline, CTA, status), concepts.md (compliance self-check),
//          engine/art.mjs (hand-authored ON text + picture per row), brand/tokens.css + brand/logo/*.svg (all colours and logos; no hex here).
// Writes : assets/C{nn}_{angle}_[{hid}_][teal_]{1x1|4x5|9x16}_{date}.png|mp4, assets/manifest.json + manifest.csv, assets/first-frames/*, review-sheet.html
import fs from 'fs'; import path from 'path'; import { spawn, execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { launch } from '../../brand/scripts/lib.mjs';
import { ART } from './engine/art.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../..');
const A = path.join(HERE, 'assets'); fs.mkdirSync(path.join(A, 'first-frames'), { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DATE = args.date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const ONLY = args.only ? String(args.only).split(',') : null, CONC = +(args.concurrency || 3), EXTRAS = !!args.extras, doStills = !args.video && !EXTRAS, doVideo = !args.stills && !EXTRAS, FIRST = ['C01', 'C03', 'C14'];
const BRIEFS = path.join(REPO, 'deliverables/performance-creative-director/creative-briefs');

// ---- inputs ----
function csv(text) { const rows = []; let r = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; } if (f || r.length) { r.push(f); rows.push(r); } const h = rows.shift(); return rows.filter(x => x.length > 1).map(x => Object.fromEntries(h.map((k, i) => [k, x[i]]))); }
const csvRows = csv(fs.readFileSync(path.join(REPO, 'deliverables/creative-strategist/concepts.csv'), 'utf8'));
const md = fs.readFileSync(path.join(REPO, 'deliverables/creative-strategist/concepts.md'), 'utf8');
const selfCheck = {}; for (const sec of md.split(/\n## (?=C\d\d )/).slice(1)) { const m = sec.match(/\| Compliance self-check \| (.*) \|/); selfCheck[sec.slice(0, 3)] = m ? m[1].replace(/\*\*/g, '') : ''; }
const base = {}; for (const r of csvRows) base[r.concept_id] ||= { id: r.concept_id, angle: r.angle, csvHook: r.hook, headline: r.headline, cta: r.cta, csvStatus: r.status };
// parse every "t (s) | ON | Visual | CAP" table in a brief: [{t0,t1,cap,end}] per table
function briefTables(id) { const p = path.join(BRIEFS, `${id}.md`); if (!fs.existsSync(p)) return null; const L = fs.readFileSync(p, 'utf8').split('\n'), tabs = []; let cur = null;
  for (const ln of L) { if (/^\|\s*t \(s\)/.test(ln)) { cur = []; tabs.push(cur); continue; } if (!cur) continue; if (!ln.startsWith('|')) { cur = null; continue; } if (/^\|[-| ]+\|$/.test(ln)) continue; const c = ln.split('|').slice(1, -1).map(x => x.trim()); const m = c[0].match(/^(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)$/); if (!m) continue; const capRaw = c[3] || ''; const q = capRaw.match(/"(.*)"/); cur.push({ t0: +m[1], t1: +m[2], cap: q ? q[1].replace(/\*\*/g, '') : '', end: /^(\*\*)?end card/i.test(c[1]) }); }
  return tabs; }
const flags = id => { const p = path.join(BRIEFS, `${id}.md`); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(l => /NH-PCD-\d+/.test(l) && /^\s*[-*]|^\*\*|^- /.test(l)).map(l => l.replace(/\*\*/g, '').slice(0, 330)) : []; };
const hookLib = fs.existsSync(path.join(REPO, 'deliverables/performance-creative-director/hook-library-v2.md'));

// ---- build the work list (one entry per concept variant) ----
const variants = [];
for (const id of Object.keys(ART).sort()) { if (ONLY && !ONLY.includes(id)) continue; const tabs = briefTables(id) || (ART[id].every(a => a.tl) ? [] : null); if (!tabs) { console.warn(`! ${id}: no brief yet; skipped (concepts.md script fallback not implemented for this concept)`); continue; }
  for (const v of ART[id]) { const tab = v.tl ? v.tl.t.map((t0, k) => ({ t0, t1: v.tl.t[k + 1] ?? v.tl.E, cap: v.tl.cap[k] || '', end: false })).concat([{ t0: v.tl.E, t1: v.tl.dur, cap: '', end: true }]) : tabs[v.tabs]; const body = tab.filter(r => !r.end), endRow = tab.find(r => r.end); if (body.length !== v.rows.length) { console.error(`! ${v.vid}: brief has ${body.length} content rows, art.mjs has ${v.rows.length}; fix art.mjs`); process.exitCode = 1; continue; }
    const rows = body.map((b, k) => ({ ...v.rows[k], t0: b.t0, t1: b.t1, cap: b.cap })); const b0 = base[id];
    variants.push({ ...v, id, rows, E: endRow.t0, dur: endRow.t1, angle: b0.angle, headline: v.headline ?? b0.headline, cta: b0.cta, multi: ART[id].length > 1, firstSubmit: FIRST.includes(id), teal: !!v.teal && !args['no-teal'], flags: flags(id), selfCheck: selfCheck[id] || '' }); } }
// ---- text QA (4D rules: no "!", "you/your" only in the allowed phrases) ----
for (const v of variants) { const all = [...v.rows.flatMap(r => [...r.on, r.cap]), v.headline].join(' | '); if (/!/.test(all)) console.error(`QA ${v.vid}: exclamation mark`); const bad = all.replace(/Sort your cover|Tap to check your cover|[Yy]ou decide after|Then you decide|your own time/g, '').match(/\b(you|your)\b/gi); if (bad) console.error(`QA ${v.vid}: stray you/your`, bad); const mx = Math.max(...v.rows.map(r => r.t1 - r.t0)); if (mx > 3.05) console.warn(`QA ${v.vid}: a row is ${mx}s (cut gap > 3 s)`); }

// ---- helpers ----
const sizes = { '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920] }, rl = { '1x1': '1:1', '4x5': '4:5', '9x16': '9:16' };
const SCENE = pathToFileURL(path.join(HERE, 'engine/scene.html')).href;
const mpath = path.join(A, 'manifest.json'); const old = fs.existsSync(mpath) ? JSON.parse(fs.readFileSync(mpath, 'utf8')) : { files: [] };
const entries = new Map(old.files.filter(f => fs.existsSync(path.join(A, f.file)) && f.pipeline_v === 2).map(f => [f.file, f]));
const fname = (v, colour, ratio, ext) => `${v.id}_${v.angle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${v.multi ? v.hid.toLowerCase() + '_' : ''}${colour === 'teal' ? 'teal_' : ''}${ratio}_${DATE}.${ext}`;
const quantise = file => { for (const n of [128, 96, 64, 48, 32, 24]) { execFileSync('convert', [file, '-dither', 'None', '-colors', String(n), '-strip', 'PNG8:' + file]); if (fs.statSync(file).size <= 120000) return n; } return 24; };
const probe = f => { const o = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_name', '-of', 'json', f])); return { duration: +(+o.format.duration).toFixed(2), width: o.streams[0].width, height: o.streams[0].height, fps: o.streams[0].r_frame_rate, codec: o.streams[0].codec_name }; };
const frame1 = v => v.rows[0].on.join(' ').replace(/\*\*|~~|\[x\] |\[ \] |\|\w+(@[\d.]+)?/g, '').replace(/ ---/g, '').trim();
function record(v, file, o) { entries.set(file, { concept: v.id, hook_id: v.hid, angle: v.angle, hook: v.hook, headline: v.headline, cta: v.cta, status: v.status, first_submit: v.firstSubmit, brief_source: 'performance-creative-director/creative-briefs/' + v.id + '.md', frame1_text: frame1(v), end_card_line: 'Sort your cover. 30 minutes. A real adviser.', ai_label: false, ...o, file, pipeline_v: 2, render_date: DATE }); }
const specOf = (v, ratio, mode, colour) => ({ vid: v.vid, ratio, mode, variant: colour, rows: v.rows, E: v.E, dur: v.dur, still: v.still, headline: v.headline, tag: v.tag || '', disclosure: v.still?.disclosure ? 'SortMyCover does not sell cover or give advice.' : '' });

const browser = await launch();
const newPage = async () => { const p = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage(); await p.goto(SCENE); return p; };
async function stills(page, v, colour) { for (const ratio of Object.keys(sizes)) { const [w, h] = sizes[ratio]; await page.setViewportSize({ width: w, height: h }); await page.evaluate(s => SC.init(s), specOf(v, ratio, 'still', colour)); await page.evaluate(() => SC.draw(0)); const f = fname(v, colour, ratio, 'png'), out = path.join(A, f); await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } }); const n = quantise(out); record(v, f, { format: 'static', ratio: rl[ratio], width: w, height: h, bytes: fs.statSync(out).size, duration: null, colour_variant: colour, palette_colours: n }); console.log('still', f, fs.statSync(out).size); } }
async function video(page, v, colour, ratio = '9x16') { const [w, h] = sizes[ratio]; await page.setViewportSize({ width: w, height: h }); await page.evaluate(s => SC.init(s), specOf(v, ratio, 'video', colour));
  const f = fname(v, colour, ratio, 'mp4'), out = path.join(A, f), N = Math.round(v.dur * 30); const t0 = Date.now(); let b6 = null, b15 = null;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-r', '30', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] }); const done = new Promise(r => ff.on('close', r));
  for (let k = 0; k < N; k++) { await page.evaluate(t => SC.draw(t), k / 30); const buf = await page.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: w, height: h } }); if (k === 0) { const f0 = path.join(A, 'first-frames', f.replace('.mp4', '_f0.jpg')); fs.writeFileSync(f0, buf); execFileSync('convert', [f0, '-resize', '420x', '-quality', '82', f0]); } if (k === 6) b6 = buf; if (k === 15) b15 = buf; if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await done; const pr = probe(out);
  record(v, f, { format: 'video', ratio: rl[ratio], width: pr.width, height: pr.height, bytes: fs.statSync(out).size, duration: pr.duration, fps: pr.fps, codec: pr.codec, colour_variant: colour, end_card_at: v.E, captions: 'burned in', render_seconds: Math.round((Date.now() - t0) / 1000),
    qa: { hook_text_at_frame_0: v.rows[0].on.length > 0, motion_between_0_2_and_0_5_s: !b6.equals(b15), payoff_row_starts_at_s: v.rows[1].t0, payoff_by_6s: v.rows[1].t0 <= 6, longest_row_s: Math.max(...v.rows.map(r => +(r.t1 - r.t0).toFixed(2))), end_card_last_3s: +(v.dur - v.E).toFixed(2) === 3 } }); console.log('video', f, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB', pr.duration + 's'); }

const jobs = [];
for (const v of variants) { const cols = v.teal ? ['amber', 'teal'] : ['amber']; if (doStills) cols.forEach(c => jobs.push({ k: 'still', v, c })); }
for (const v of variants) { if (!doVideo || (args['first-submit'] && !v.firstSubmit)) continue; (v.teal ? ['amber', 'teal'] : ['amber']).forEach(c => jobs.push({ k: 'video', v, c })); }

// ---- extras (--extras): 4:5/1:1 motion (--ratios=), 6-s motion stills (--m6), C04 carousel (--carousel), .srt sidecars (--srt) ----
const m6page = async (page, v) => { const [w, h] = sizes['4x5']; await page.setViewportSize({ width: w, height: h }); await page.evaluate(s => SC.init(s), { vid: v.vid, ratio: '4x5', mode: 'm6', variant: 'amber', rows: [], headline: '', tag: '', disclosure: '' });
  const f = fname(v, 'amber', '4x5', 'mp4').replace('_4x5_', '_4x5_6s_'), out = path.join(A, f); const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-r', '30', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] }); const done = new Promise(r => ff.on('close', r)); let b0, b6, b15, b120;
  for (let k = 0; k < 180; k++) { await page.evaluate(t => SC.draw(t), k / 30); const buf = await page.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: w, height: h } }); if (k === 0) { b0 = buf; const f0 = path.join(A, 'first-frames', f.replace('.mp4', '_f0.jpg')); fs.writeFileSync(f0, buf); execFileSync('convert', [f0, '-resize', '420x', '-quality', '82', f0]); } if (k === 6) b6 = buf; if (k === 15) b15 = buf; if (k === 120) b120 = buf; if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await done; const pr = probe(out);
  record(v, f, { format: 'video', kind: '6s', ratio: '4:5', width: pr.width, height: pr.height, bytes: fs.statSync(out).size, duration: pr.duration, fps: pr.fps, codec: pr.codec, colour_variant: 'amber', end_card_at: null, captions: 'n/a (6-s loop, text is the message)', qa: { hook_text_at_frame_0: true, motion_between_0_2_and_0_5_s: !b6.equals(b15), motion_beat_by_0_5_s: !b0.equals(b15), payoff_by_4s: !b15.equals(b120), line_and_wordmark_throughout: true, loops_at_6_s: pr.duration === 6, longest_row_s: 6 } }); console.log('m6', f, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB'); };
async function carousel(page, v) { await page.setViewportSize({ width: 1080, height: 1080 }); for (let n = 1; n <= 4; n++) { await page.evaluate(s => SC.init(s), { vid: v.vid, ratio: '1x1', mode: 'card', card: n, variant: 'amber', rows: [], headline: '', tag: '', disclosure: '' }); await page.evaluate(() => SC.draw(0)); const f = fname(v, 'amber', '1x1', 'png').replace('_1x1_', `_1x1_card${n}_`), out = path.join(A, f); await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1080 } }); const q = quantise(out); record(v, f, { format: 'static', kind: 'carousel', carousel_card: n, ratio: '1:1', width: 1080, height: 1080, bytes: fs.statSync(out).size, duration: null, colour_variant: 'amber', palette_colours: q }); console.log('card', f, fs.statSync(out).size); } }
const plain = on => on.filter(x => x !== '---').map(x => x === '@chips' ? 'Video · WhatsApp · Phone' : x.replace(/\*\*|~~|^\[(x| )\] /g, '').replace(/\|\w+(@[\d.]+)?$/, '')).join(' ').trim();
const ts = x => { const ms = Math.round(x * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
function srt(v, colour) { const f = fname(v, colour, '9x16', 'srt'), cues = []; v.rows.forEach(r => { const a = plain(r.on || []), c = r.cap && r.cap !== a ? r.cap : ''; const txt = [a, c].filter(Boolean).join('\n'); if (txt) cues.push([r.t0, r.t1, txt]); }); cues.push([v.E, v.dur, 'Sort your cover. 30 minutes. A real adviser.\nTap to check your cover']);
  const body = cues.map((c, k) => `${k + 1}\n${ts(c[0])} --> ${ts(c[1] - .05)}\n${c[2]}\n`).join('\n'); fs.writeFileSync(path.join(A, f), body);
  record(v, f, { format: 'srt', kind: 'srt', ratio: '9:16', width: null, height: null, bytes: Buffer.byteLength(body), duration: v.dur, colour_variant: colour, cues: cues.length, sidecar_of: fname(v, colour, '9x16', 'mp4') }); }
const ratios = args.ratios ? String(args.ratios).split(',') : [];
if (EXTRAS) { for (const v of variants) { if (args.srt) (v.teal ? ['amber', 'teal'] : ['amber']).forEach(c => srt(v, c));
    if (args.m6 && ['C01', 'C02B', 'C08', 'C12A'].includes(v.vid)) jobs.push({ k: 'm6', v }); if (args.carousel && v.id === 'C04') jobs.push({ k: 'card', v });
    ratios.forEach(r => jobs.push({ k: 'video', v, c: 'amber', r })); } }
const queue = [...jobs.filter(j => j.k === 'still'), ...jobs.filter(j => j.k !== 'still' && j.k !== 'video'), ...jobs.filter(j => j.k === 'video').sort((a, b) => b.v.dur - a.v.dur)];
await Promise.all(Array.from({ length: CONC }, async () => { const page = await newPage(); while (queue.length) { const j = queue.shift(); try { await (j.k === 'still' ? stills(page, j.v, j.c) : j.k === 'm6' ? m6page(page, j.v) : j.k === 'card' ? carousel(page, j.v) : video(page, j.v, j.c, j.r)); } catch (e) { console.error('FAILED', j.k, j.v.vid, j.c, e.message); process.exitCode = 1; } } }));
await browser.close();

// ---- manifests ----
const files = [...entries.values()].sort((a, b) => a.file.localeCompare(b.file));
const flagMap = Object.fromEntries(variants.map(v => [v.id, v.flags])); const old2 = old.concept_flags || {};
fs.writeFileSync(mpath, JSON.stringify({ generated: new Date().toISOString(), date: DATE, pipeline: '4D.5 code-rendered (HTML/SVG + headless Chromium + ffmpeg). No Google Flow, no people, no AI imagery (ai_label=false everywhere).', source_of_truth_for_timelines: 'performance-creative-director/creative-briefs (hook-library-v2.md present: ' + hookLib + ')', concept_flags: { ...old2, ...flagMap }, count: files.length, files }, null, 2) + '\n');
const cols = 'file,concept,hook_id,angle,fmt,colour,ratio,width,height,duration_s,size_kb,template,timeline_ref,frame1_text,end_card_line,ai_label,status,compliance_qa,meta_review,ad_name,render_date'.split(',');
const q = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(A, 'manifest.csv'), cols.join(',') + '\n' + files.map(f => { const fmt = f.format === 'video' ? (f.kind === '6s' ? 'm6' : 'vid') : f.format === 'srt' ? 'srt' : 'sta', col = f.colour_variant === 'teal' ? 'teal' : 'amb'; return [f.file, f.concept, f.hook_id, f.angle, fmt, col, f.ratio.replace(':', 'x'), f.width, f.height, f.duration ?? '', Math.round(f.bytes / 1024), f.format === 'video' ? `${f.kind === '6s' ? '6s-motion-still' : 'motion'}-${f.ratio.replace(':', 'x')} (code-rendered)` : 'still (code-rendered)', `${f.concept}.md`, f.frame1_text, f.end_card_line, false, /hold/.test(f.status) ? 'hold' : 'rendered', 'pending', 'pending', `${f.concept}_${f.hook_id}_${fmt}-${col}_pending`, f.render_date].map(q).join(','); }).join('\n') + '\n');
console.log(files.length, 'files in manifest');
execFileSync('node', [path.join(HERE, 'build-review-sheet.mjs')], { stdio: 'inherit' });
