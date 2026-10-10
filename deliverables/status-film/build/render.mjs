// Deterministic renderer: drives each scenes/sNN.html with window.seek(t) at 30 fps in headless
// Chrome, pipes JPEG frames straight into ffmpeg (no frame dumps), then joins the scene clips
// with crossfades and lays the per-scene narration MP3s at their exact offsets.
//
//   node render.mjs                 full build (clips + final MP4s + poster)
//   node render.mjs --only s03 s05  re-render just those clips, then re-join
//   node render.mjs --join          skip rendering, only re-join existing clips
//   node render.mjs --stills [t..]  PNG stills per scene (default: midpoint) into stills/
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SCENES = path.join(ROOT, 'scenes');
const CLIPS = path.join(HERE, 'clips');
const CHROME = process.env.CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const FPS = 30, XFADE = 1.0, CONCURRENCY = 4;
const OUT = 'where-we-are';

const TM = JSON.parse(fs.readFileSync(path.join(HERE, 'timings.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const listAfter = f => { const i = args.indexOf(f); if (i < 0) return []; const r = []; for (const a of args.slice(i + 1)) { if (a.startsWith('--')) break; r.push(a); } return r; };

const frames = s => Math.round(s.clip * FPS);
const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] });

async function openScene(browser, s) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(pathToFileURL(path.join(SCENES, `${s.id}.html`)).href + '?render', { waitUntil: 'load' });
  await page.evaluate(() => window.READY);
  if (errs.length) throw new Error(`${s.id}: ${errs.join(' | ')}`);
  return { page, errs };
}

async function renderClip(browser, s) {
  const { page, errs } = await openScene(browser, s);
  fs.mkdirSync(CLIPS, { recursive: true });
  const out = path.join(CLIPS, `${s.id}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg ${s.id} exit ${c}`))));
  const n = frames(s), t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate(t => window.seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) process.stdout.write(`  ${s.id} ${f}/${n}\n`);
  }
  ff.stdin.end();
  await done;
  if (errs.length) throw new Error(`${s.id}: ${errs.join(' | ')}`);
  await page.close();
  console.log(`  ${s.id} done: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

async function stills(browser, times) {
  const dir = path.join(HERE, 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const s of TM.scenes) {
    const { page } = await openScene(browser, s);
    const ts = times.length ? times.map(Number) : [+(s.clip / 2).toFixed(2), +(s.clip - .05).toFixed(2)];
    for (const t of ts) {
      if (t > s.clip) continue;
      await page.evaluate(x => window.seek(x), t);
      await page.screenshot({ path: path.join(dir, `${s.id}-${t.toFixed(2)}.png`) });
    }
    await page.close();
  }
  console.log('stills ->', dir);
}

function join() {
  const sc = TM.scenes, L = sc.map(s => frames(s) / FPS);
  const starts = []; let acc = 0;
  sc.forEach((s, i) => { starts.push(acc); acc += L[i] - (i < sc.length - 1 ? XFADE : 0); });
  const total = acc;
  const inputs = [];
  sc.forEach(s => inputs.push('-i', path.join(CLIPS, `${s.id}.mp4`)));
  sc.forEach(s => inputs.push('-i', path.join(HERE, 'audio', `${s.id}.mp3`)));
  const f = [];
  let prev = '[0:v]';
  for (let i = 1; i < sc.length; i++) {
    const lab = i === sc.length - 1 ? '[v]' : `[x${i}]`;
    f.push(`${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${(starts[i]).toFixed(4)}${lab}`);
    prev = lab;
  }
  sc.forEach((s, i) => {
    const ms = Math.round((starts[i] + TM.lead) * 1000);
    f.push(`[${sc.length + i}:a]aresample=48000,adelay=${ms}:all=1[a${i}]`);
  });
  f.push(`${sc.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sc.length}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`);
  const graph = path.join(HERE, 'clips', 'graph.txt');
  fs.writeFileSync(graph, f.join(';\n'));
  const master = path.join(CLIPS, 'master.mkv');
  console.log(`join: ${sc.length} scenes, ${total.toFixed(2)}s`);
  run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', master]);
  const enc = (scale, crf, file) => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', master,
    ...(scale ? ['-vf', `scale=${scale}:flags=lanczos`] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-g', String(FPS * 4), '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', path.join(ROOT, file)]);
  enc(null, Number(process.env.CRF1080 || 22), `${OUT}-1080p.mp4`);
  enc('1280:720', Number(process.env.CRF720 || 24), `${OUT}-720p.mp4`);
  // poster: end of scene 1 (logo, title and all three chips settled)
  run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (L[0] - XFADE - .3).toFixed(2), '-i', master, '-frames:v', '1', '-q:v', '3', path.join(ROOT, 'poster.jpg')]);
  fs.writeFileSync(path.join(CLIPS, 'offsets.json'), JSON.stringify(sc.map((s, i) => ({ id: s.id, start: +starts[i].toFixed(3), clip: L[i], speech: +(starts[i] + TM.lead).toFixed(3) })), null, 1));
  console.log('done ->', ROOT);
}

(async () => {
  if (flag('--join')) return join();
  // One browser per worker: pages sharing a browser get backgrounded and stop painting.
  const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--allow-file-access-from-files',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  if (flag('--stills')) { const b = await launch(); try { await stills(b, listAfter('--stills')); } finally { await b.close(); } return; }
  const only = listAfter('--only');
  const queue = TM.scenes.filter(s => !only.length || only.includes(s.id));
  // longest clips first so the workers finish together
  queue.sort((a, b) => b.clip - a.clip);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    const b = await launch();
    try { while (queue.length) await renderClip(b, queue.shift()); } finally { await b.close(); }
  }));
  join();
})().catch(e => { console.error(e); process.exit(1); });
