// 10 s 9:16 code-rendered clip: Playwright frame capture -> ffmpeg H.264 (<= 16 MB, faststart). Output: automation/templates/samples/intro_video_sample.mp4
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
import { launch, root, fileUrl } from './lib.mjs';
const out = path.resolve(root, '..', 'automation/templates/samples/intro_video_sample.mp4');
const FPS = 30, DUR = 10, N = FPS * DUR;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smc-vid-'));
const b = await launch();
const page = await (await b.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
await page.goto(fileUrl('templates/intro-video.html')); await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
for (let i = 0; i < N; i++) { await page.evaluate(t => window.__setT(t), i / FPS); await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); }
await b.close();
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', out]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
