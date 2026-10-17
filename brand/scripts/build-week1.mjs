// Week-1 organic posts (deliverables/meta-operator/week1-posts). Data only: existing templates via lib.mjs shot(); no template changes.
// Run from brand/: node scripts/build-week1.mjs
//   Same Playwright setup as build-warmup.mjs (PLAYWRIGHT_PATH + CHROMIUM_PATH if `playwright` is not installed).
//   Reel MP4 needs ffmpeg on PATH (or FFMPEG_PATH). Without it, frames + concat list are written and the command is printed.
// Copy rules: third person, educational, no product/insurer/premium/cover amount/broker, no rand figures, no "2-4x" (NH-PCD-01).
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { launch, root, shot, pngSize, fileUrl } from './lib.mjs';

const OUT = 'exports/feed/week1';
// 5 Oct (Jonathan): no "Lead Velocity" on any social image; closing line + CTA to the landing page (scheduled-call wording).
const DISC = 'SortMyCover gives no financial advice,\nproduct comparisons or premium quotes.';
const CTA = 'sortmycover.co.za'; // pill is 60 px / max ~26 chars at 1080 wide; the full scheduled-call CTA is in the caption

// feed.html 4:5. Empty prop arrays hide the paper notes (data-if).
const card = (hook, sub, p1 = ['', ''], p2 = ['', '']) => ({ layout: 'r4x5', hook, sub, prop1_label: p1[0], prop1: p1[1], prop2_label: p2[0], prop2: p2[1], prop1_what: '', prop2_what: '' });

// D5 FAQ carousel: 5 cards, 1080x1350.
const stills = [
  { out: 'W1D5-faq-1-cover-1080x1350.png', data: card('Four straight\n**answers.**', 'About SortMyCover and the free 30-minute call with a licensed adviser.') },
  { out: 'W1D5-faq-2-free-1080x1350.png', data: card('Is the call\n**free?**', 'Yes. The 30-minute call is free. There is no obligation to buy anything.', ['The call', 'Free'], ['Afterwards', 'No obligation']) },
  { out: 'W1D5-faq-3-advice-1080x1350.png', data: card('Does SortMyCover\n**give advice?**', 'No. A licensed adviser gives the advice. SortMyCover books the call, then steps back.', ['SortMyCover', 'Books the call'], ['Licensed adviser', 'Gives advice']) },
  { out: 'W1D5-faq-4-who-pays-1080x1350.png', data: card('Who pays\n**SortMyCover?**', 'Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys.', ['Paid by', 'Advisers'], ['Commission', 'Never']) },
  { out: 'W1D5-faq-5-advisers-1080x1350.png', data: card('Who are\n**the advisers?**', 'Each one is an authorised financial services provider. The adviser shares a name and FSP number first.', ['Licence', 'Authorised FSP'], ['Check it', 'FSCA register']) },
];

// D3 Reel R01: typographic frames on reels-endcard.html (1080x1920, tick + wordmark + big line; empty cta/fine are hidden).
// [seconds, line, cta, fine]. Every cut <= 3.0 s except the 4 s end card (PCD cut rule).
// Keep each line <= ~17 chars (96 px DM Sans 800 in a 936 px column) and never let **bold** span a \n (_t.js regex is single-line).
const reel = [
  [2.5, 'Who gives\n**the advice?**', '', ''],
  [2.5, '**Not**\nSortMyCover.', '', ''],
  [3.0, 'SortMyCover\nbooks a **free**\n**30-minute call.**', '', ''],
  [3.0, 'A **licensed**\n**adviser** gives\nthe advice.', '', ''],
  [3.0, 'Video, WhatsApp\nor phone.\n**No sales visit.**', '', ''],
  [3.0, 'No obligation.\n**Decide later,**\n**or not.**', '', ''],
  [4.0, 'Sort your cover.\n30 minutes.\n**A real adviser.**', CTA, DISC],
];

async function browser() {
  try { return await launch(); } catch (e) {
    if (!process.env.PLAYWRIGHT_PATH) throw e;
    const pw = createRequire(path.join(process.env.PLAYWRIGHT_PATH, 'x.js'))(process.env.PLAYWRIGHT_PATH);
    return pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  }
}

const b = await browser();
for (const j of stills) {
  const out = path.join(root, OUT, j.out);
  await shot(b, { url: fileUrl('templates/feed.html'), data: j.data, w: 1080, h: 1350, out });
  const s = pngSize(out);
  console.log(`${j.out}  ${s.w}x${s.h}  ${(s.bytes / 1024).toFixed(0)} KB`);
}

const fdir = path.join(root, OUT, 'R01-frames');
const list = [];
for (const [i, [sec, line, cta, fine]] of reel.entries()) {
  const name = `R01-f${i + 1}-1080x1920.png`;
  const out = path.join(fdir, name);
  await shot(b, { url: fileUrl('templates/reels-endcard.html'), data: { line, cta, fine, layout: fine ? 'disc' : '' }, w: 1080, h: 1920, out });
  const s = pngSize(out);
  console.log(`R01-frames/${name}  ${s.w}x${s.h}  ${sec}s`);
  list.push(`file '${name}'`, `duration ${sec}`);
}
list.push(`file 'R01-f${reel.length}-1080x1920.png'`); // concat demuxer: repeat last file so its duration is honoured
fs.writeFileSync(path.join(fdir, 'concat.txt'), list.join('\n') + '\n');
await b.close();

const mp4 = path.join(root, OUT, 'W1D3-reel-R01-who-gives-advice-1080x1920.mp4');
const ff = process.env.FFMPEG_PATH || 'ffmpeg';
const args = ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(fdir, 'concat.txt'), '-vf', 'fps=30,format=yuv420p', '-t', String(reel.reduce((t, f) => t + f[0], 0)), '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', '-an', mp4];
const r = spawnSync(ff, args, { stdio: 'inherit' });
if (r.error || r.status !== 0) console.log(`\nffmpeg not run (${r.error ? r.error.code : 'exit ' + r.status}). Frames are ready. Run:\n${ff} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
else console.log(`${path.relative(root, mp4)}  ${(fs.statSync(mp4).size / 1024).toFixed(0)} KB  (${reel.reduce((t, f) => t + f[0], 0)} s, silent, captions are the frames)`);
