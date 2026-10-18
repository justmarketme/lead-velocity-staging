// Deterministic renderer: drives index.html?render with window.seek(t) at 30 fps in headless Chrome,
// pipes JPEG frames into ffmpeg, lays each scene's narration at its exact offset, writes a
// 720x1280 H.264/AAC MP4 with faststart, plus a poster.
//
//   node render.mjs                 full build -> out/intro-card-720p.mp4 + out/poster.jpg (designed title card)
//   node render.mjs --stills 3 40   PNG stills at those seconds (global time) -> out/still-<t>.png
//   node render.mjs --poster        only out/poster.jpg
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const CHROME = process.env.CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const FPS = 30, W = 720, H = 1280, NAME = 'intro-card-720p';
const POSTER_T = Number(process.env.POSTER_T || 0); // global seconds behind the title card; 0 = just after the photo is taken
const TM = JSON.parse(fs.readFileSync(path.join(HERE, 'timings.json'), 'utf8'));
const args = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

let acc = 0; const starts = TM.scenes.map(s => { const a = acc; acc += s.clip; return a; }); const TOTAL = acc;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto(pathToFileURL(path.join(HERE, 'index.html')).href + '?render', { waitUntil: 'networkidle0' });
await page.evaluate(() => window.READY);
if (errs.length) throw new Error(errs.join(' | '));
const shot = async (t, opts) => { await page.evaluate(x => window.seek(x), t); return page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, ...opts }); };

// Poster: the title card (index.html .poster) over the intro card with the new photo, no captions or finger.
const posterT = POSTER_T || await page.evaluate(() => window.posterTime);
const poster = async () => {
  await page.evaluate(() => window.setPoster(true));
  fs.writeFileSync(path.join(OUT, 'poster.jpg'), await shot(posterT, { type: 'jpeg', quality: 90 }));
  await page.evaluate(() => window.setPoster(false));
};
if (args[0] === '--poster') { await poster(); await browser.close(); process.exit(0); }
if (args[0] === '--stills') {
  for (const t of args.slice(1)) fs.writeFileSync(path.join(OUT, `still-${t}.png`), await shot(Number(t), { type: 'png' }));
  await browser.close(); process.exit(0);
}

// 1. video
const silent = path.join(OUT, 'video-silent.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`))));
const n = Math.round(TOTAL * FPS);
for (let f = 0; f < n; f++) {
  const buf = await shot(f / FPS, { type: 'jpeg', quality: 92, optimizeForSpeed: true });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`frame ${f}/${n}`);
}
ff.stdin.end(); await done;
await poster();
await browser.close();
if (errs.length) throw new Error(errs.join(' | '));

// 2. narration at exact offsets, 3. mux with faststart
const ins = [], filt = [];
TM.scenes.forEach((s, i) => {
  ins.push('-i', path.join(HERE, 'audio', `${s.id}.mp3`));
  const ms = Math.round((starts[i] + TM.lead) * 1000);
  filt.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
filt.push(`${TM.scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${TM.scenes.length}:normalize=0,apad,atrim=0:${TOTAL.toFixed(3)}[a]`);
const final = path.join(OUT, `${NAME}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...ins, '-filter_complex', filt.join(';'), '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-shortest', final], { stdio: 'inherit' });
fs.rmSync(silent);
const mb = fs.statSync(final).size / 1e6;
console.log(`${final}  ${TOTAL.toFixed(1)} s  ${mb.toFixed(1)} MB`);
