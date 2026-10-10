// Step explainer (4.10b): code-rendered from brand tokens. Usage: node build.mjs   (needs ffmpeg + Chromium via brand/scripts/lib.mjs)
// Frames are rendered once per distinct state (scene + headline + caption), then assembled with the ffmpeg concat demuxer at 30 fps.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url';
import { launch } from '../../../../../brand/scripts/lib.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), outDir = path.resolve(here, '..');
const SCRATCH = process.env.EXPLAINER_SCRATCH || fs.mkdtempSync(path.join(os.tmpdir(), 'smc-expl-'));

// Storyboard rows -> windows. Row 1 is held to 11.5 s (storyboard 9 s) because its 37 spoken words do not fit 9 s; total stays under 45 s.
const BEATS = [
  { row: 1, t0: 0, t1: 11.5, head: "This is the step we're testing to help people turn up", hl: 'turn up',
    vo: ["This is the step we're testing to help people turn up.", 'People show up for people.', 'If a lead has seen your face before the call,', "we expect they're more likely to come, and we measure it."] },
  { row: 2, t0: 11.5, t1: 22.5, head: 'Answer eight quick questions. We write three scripts in your words.', hl: 'three scripts',
    vo: ['Answer eight quick questions, typed or spoken.', 'We write three short scripts in your own words.', 'You pick one and change anything you like.'] },
  { row: 3, t0: 22.5, t1: 35.5, head: 'Face a window, phone at eye level, read the teleprompter. 25 seconds.', hl: '25 seconds',
    vo: ['Face a window. Hold the phone at eye level and look at the lens.', 'Read the teleprompter.', 'It takes about twenty-five seconds, and one take is fine.'] },
  { row: 4, t0: 35.5, t1: 44, head: 'We add captions and your FSP. You approve. Done.', hl: 'Done.',
    vo: ['We add captions and your details.', "You approve it. That's it.", 'Ten minutes, once.'] },
];
// scene changes (screen-recording column of the storyboard, drawn from the brand system)
const SCENES = [[0, 'title'], [3.5, 'why'], [11.5, 'interview'], [16.5, 'scripts'], [22.5, 'checklist'], [27, 'count'], [28.5, 'prompt'], [33, 'verdict'], [35.5, 'approve'], [39.5, 'end']];

// VO cues: word-proportional timing inside each beat window (0.3 s tail pad), used for the .srt and the burned-in lane
const cues = [];
for (const b of BEATS) {
  const words = b.vo.map(s => s.split(/\s+/).length), total = words.reduce((a, c) => a + c, 0), span = (b.t1 - b.t0) - 0.3;
  let t = b.t0;
  b.vo.forEach((txt, i) => { const d = span * words[i] / total; cues.push({ row: b.row, start: t, end: t + d, text: txt }); t += d; });
}
const headOf = t => BEATS.find(b => t >= b.t0 && t < b.t1) ?? BEATS.at(-1);
const sceneOf = t => SCENES.filter(s => s[0] <= t).at(-1)[1];
const cueOf = t => cues.find(c => t >= c.start && t < c.end);
// burned-in lane: VO cue text, except row 1 cue 1 which is identical to the on-screen headline (no duplicate)
const capOf = t => { const c = cueOf(t); if (!c) return ''; return (c.row === 1 && c.start === 0) ? '' : c.text; };
const hd = b => b.head.replace(b.hl, '<em>' + b.hl + '</em>');

const bps = [...new Set([0, 44, ...BEATS.flatMap(b => [b.t0, b.t1]), ...SCENES.map(s => s[0]), ...cues.flatMap(c => [c.start, c.end])].map(x => +x.toFixed(3)))].sort((a, b) => a - b);
const segs = [];
for (let i = 0; i < bps.length - 1; i++) { const t0 = bps[i], t1 = bps[i + 1], m = (t0 + t1) / 2, b = headOf(m); segs.push({ t0, t1, row: b.row, scene: sceneOf(m), head: hd(b), cap: capOf(m) }); }

const FPS = 30, snap = t => Math.round(t * FPS) / FPS;
const b = await launch();
const manifestFiles = [];
const RATIOS = { '9x16': [1080, 1920], '1x1': [1080, 1080] };
for (const [ratio, [w, h]] of Object.entries(RATIOS)) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(pathToFileURL(path.join(here, 'explainer.html')).href);
  const dir = path.join(SCRATCH, ratio); fs.mkdirSync(dir, { recursive: true });
  const list = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    await page.evaluate(o => window.__render(o), { ratio, scene: s.scene, head: s.head, cap: s.cap });
    const f = path.join(dir, `s${String(i).padStart(3, '0')}.png`); await page.screenshot({ path: f });
    list.push(`file '${f}'`, `duration ${(snap(s.t1) - snap(s.t0)).toFixed(4)}`);
  }
  list.push(`file '${path.join(dir, `s${String(segs.length - 1).padStart(3, '0')}.png`)}'`); // concat demuxer needs the last file repeated
  const lf = path.join(dir, 'list.txt'); fs.writeFileSync(lf, list.join('\n'));
  const out = path.join(outDir, `explainer_${ratio}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high', '-movflags', '+faststart', '-an', out]);
  manifestFiles.push({ file: path.basename(out), ratio, w, h, bytes: fs.statSync(out).size });
  if (ratio === '1x1') { // poster for the portal web view: a frame from the title card with headline (t = 1 s)
    await page.evaluate(o => window.__render(o), { ratio, scene: 'title', head: hd(BEATS[0]), cap: '' });
    await page.screenshot({ path: path.join(SCRATCH, 'poster.png') });
  }
}
await b.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(SCRATCH, 'poster.png'), '-vf', 'scale=1080:-2', '-q:v', '4', path.join(outDir, 'explainer-poster.jpg')]);

const ts = t => { const ms = Math.round(t * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
fs.writeFileSync(path.join(outDir, 'explainer.srt'), cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(outDir, 'explainer-vo-script.txt'),
  '# Step explainer: voice-over script (plain text, one block per storyboard row). Voice: Jonathan own voice preferred; stock TTS allowed; never a cloned voice.\n# Source: deliverables/intro-media/explainer-storyboard.md. Timings are the windows in manifest.json; read at a steady pace.\n\n' +
  BEATS.map(x => `[Row ${x.row}  ${x.t0.toFixed(1)}s to ${x.t1.toFixed(1)}s]\n${x.vo.join(' ')}\n`).join('\n'));

const probe = f => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', f])).format.duration;
for (const f of manifestFiles) f.duration_s = +(+probe(path.join(outDir, f.file))).toFixed(2);
const rowMap = BEATS.map(x => ({ storyboard_row: x.row, storyboard_time: ['0:00 to 0:09', '0:09 to 0:21', '0:21 to 0:35', '0:35 to 0:43'][x.row - 1], start_s: x.t0, end_s: x.t1, caption_burned_headline: x.head, scenes: SCENES.filter(s => s[0] >= x.t0 && s[0] < x.t1).map(s => ({ at_s: s[0], scene: s[1] })) }));
const extra = ['explainer.srt', 'explainer-vo-script.txt', 'explainer-poster.jpg'].map(f => ({ file: f, bytes: fs.statSync(path.join(outDir, f)).size }));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  asset: 'step explainer (S7-06, 4.10b)', source: 'deliverables/intro-media/explainer-storyboard.md', rendered: new Date().toISOString().slice(0, 10),
  pipeline: 'src/explainer.html + src/build.mjs (Chromium frames from brand tokens/logo SVG, ffmpeg H.264 30 fps, silent)',
  audio: 'none; voice-over is a separate asset (explainer-vo-script.txt, explainer.srt)', limits: { max_seconds: 60, max_bytes: 8000000 },
  files: [...manifestFiles, ...extra], row_to_timestamp: rowMap,
  notes: ['Row 1 window is 0 to 11.5 s, not 0 to 9: its 37 spoken words do not fit 9 s. Rows 2 to 4 shift to match; total 44 s (storyboard cap 45 s).', 'Burned-in captions: headline = storyboard on-screen caption for the row; lower lane = VO transcript cues (row 1 first cue omitted, identical to the headline).', 'Optional line "or skip for now. Nothing is held up while you wait." not added (would exceed 45 s).', 'Screens are drawn from the brand system, labelled SAMPLE; adviser is the fictional Sam Example, FSP 00000 (SAMPLE). Not a recording of the live portal.', 'Storyboard says 16:9 1280x720; this build follows the task (1080x1920 phone, 1080x1080 web view). The portal slot is 16:9 with object-fit:cover, so 1x1 is cropped top and bottom: see needs_human.']
}, null, 2));
console.log(JSON.stringify(manifestFiles));
