// Engine proofs (no concept copy re-render). Run: node engine/render-proofs.mjs
// Writes assets/proofs/endcard_4x5_proof.png, motion_4x5_proof.mp4 (6 s, generic), C14_mock_proof_9x16.png
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { spawn, execFileSync } from 'child_process';
import { launch } from '../../../brand/scripts/lib.mjs';
import { ART } from './art.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, '../assets/proofs'); fs.mkdirSync(OUT, { recursive: true });
const SCENE = pathToFileURL(path.join(HERE, 'scene.html')).href;
const b = await launch(); const pg = async (w, h) => { const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); await p.goto(SCENE); return p; };
const base = (ratio, mode, extra) => ({ vid: 'C01', ratio, mode, variant: 'amber', headline: '', tag: '', disclosure: '', ...extra });
// generic 6 s timeline: 3 s hook rows, 3 s end card
const rows = [{ t0: 0, t1: 1.5, on: ['One idea.', '**Per frame.**'] }, { t0: 1.5, t1: 3, on: ['30 minutes.'] }, { t0: 3, t1: 6, on: [] }];
// 1) 4:5 end card (still: draw 3 s into the end card)
let p = await pg(1080, 1350); await p.evaluate(s => SC.init(s), base('4x5', 'video', { rows, E: 3, dur: 6 })); await p.evaluate(() => SC.draw(3 + 2.2));
await p.screenshot({ path: path.join(OUT, 'endcard_4x5_proof.png'), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
// 2) 4:5 motion
const f = path.join(OUT, 'motion_4x5_proof.mp4'); const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-r', '30', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', f], { stdio: ['pipe', 'inherit', 'inherit'] }); const done = new Promise(r => ff.on('close', r));
await p.evaluate(s => SC.init(s), base('4x5', 'video', { rows, E: 3, dur: 6 })); let b6, b15;
for (let k = 0; k < 180; k++) { await p.evaluate(t => SC.draw(t), k / 30); const buf = await p.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1080, height: 1350 } }); if (k === 6) b6 = buf; if (k === 15) b15 = buf; if (k === 0) fs.writeFileSync(path.join(OUT, '_f0.jpg'), buf); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); }
ff.stdin.end(); await done;
const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_name', '-of', 'json', f]));
console.log('motion QA', { w: pr.streams[0].width, h: pr.streams[0].height, fps: pr.streams[0].r_frame_rate, codec: pr.streams[0].codec_name, dur: pr.format.duration, hook_text_at_frame_0: rows[0].on.length > 0, motion_between_0_2_and_0_5_s: !b6.equals(b15), payoff_by_6s: rows[1].t0 <= 6, longest_row_s: 1.5, end_card_last_3s: 6 - 3 === 3, bytes: fs.statSync(f).size });
// 3) C14 mock proof: 9:16 video-mode frame (400 px visual zone), phone step 3
const c14 = ART.C14[0]; p = await pg(1080, 1920); await p.evaluate(s => SC.init(s), { vid: c14.vid, ratio: '9x16', mode: 'video', variant: 'amber', rows: c14.rows.map((r, i) => ({ ...r, t0: i * 1.5, t1: i * 1.5 + 1.5 })), E: 99, dur: 100, headline: 'Check your cover', tag: '', disclosure: '' }); await p.evaluate(() => SC.draw(3 * 1.5 + 1));
await p.screenshot({ path: path.join(OUT, 'C14_mock_proof_9x16.png'), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
await b.close();
