// Renders every 4D.4b.3 placement from the HTML/SVG templates at exact pixel sizes. Run: node exports/render.mjs  (or npm run render)
// Needs Playwright + Chromium (see README). Also writes exports/manifest.json (name, size, bytes) and verifies every size.
import fs from 'fs';
import path from 'path';
import { launch, root, shot, svgToPng, pngSize, fileUrl } from '../scripts/lib.mjs';

const X = p => path.join(root, 'exports', p);
const tpl = n => fileUrl(`templates/${n}`);
const F = { // fictional sample data: never a real adviser
  adviser: 'Mark Smith', practice: 'Mark Smith Financial Services', fsp: '00000 (SAMPLE)',
  bio: 'I help young families and first-time home owners understand their cover.',
  languages_line: 'Speaks English and Afrikaans', method_line: '30-min Teams or phone call · No obligation', sample: true,
};
const jobs = [
  // profiles
  { t: 'profile.html', w: 1024, h: 1024, out: 'profile/fb-profile-1024.png' },
  { t: 'profile.html', w: 1024, h: 1024, out: 'profile/ig-profile-1024.png' },
  { t: 'profile.html', w: 1024, h: 1024, scale: 0.625, expect: [640, 640], out: 'profile/whatsapp-profile-640.png' },
  { t: 'profile.html', w: 1024, h: 1024, scale: 0.703125, expect: [720, 720], out: 'gbp/gbp-logo-720.png' },
  // covers
  { t: 'cover.html', w: 851, h: 315, out: 'cover/fb-cover-851x315.png' },
  { t: 'cover.html', w: 851, h: 315, scale: 2, expect: [1702, 630], out: 'cover/fb-cover-851x315@2x.png' },
  { t: 'cover.html', w: 1024, h: 576, data: { layout: 'gbp' }, out: 'gbp/gbp-cover-1024x576.png' },
  // link preview
  { t: 'og.html', w: 1200, h: 630, out: 'og/og-image-1200x630.png' },
  // email
  { t: 'email-header.html', w: 600, h: 120, out: 'email/email-header-600x120.png' },
  { t: 'email-header.html', w: 600, h: 120, scale: 2, expect: [1200, 240], out: 'email/email-header-600x120@2x.png' },
  // feed
  { t: 'feed.html', w: 1080, h: 1080, data: { prop1: '2–4× salary', prop2: 'R _ _ _ _ _ _ _' }, out: 'feed/feed-1x1-1080x1080_H1-sample.png' },
  { t: 'feed.html', w: 1080, h: 1350, data: { layout: 'r4x5', prop1: '2–4× salary', prop2: 'R _ _ _ _ _ _ _' }, out: 'feed/feed-4x5-1080x1350_H1-sample.png' },
  // reels / stories
  { t: 'reels-endcard.html', w: 1080, h: 1920, out: 'reels/reels-endcard-1080x1920.png' },
  // WhatsApp headers: 1:1 and 16:9
  { t: 'intro-card.html', w: 1080, h: 1080, data: F, out: 'whatsapp/intro-card-1080x1080_sample.png' },
  { t: 'intro-card.html', w: 1200, h: 628, data: { ...F, layout: 'wide' }, out: 'whatsapp/intro-card-1200x628_sample.png' },
  { t: 'what-to-expect-card.html', w: 1080, h: 1080, out: 'whatsapp/what-to-expect-1080x1080.png' },
  { t: 'what-to-expect-card.html', w: 1200, h: 628, data: { layout: 'wide' }, out: 'whatsapp/what-to-expect-1200x628.png' },
  { t: 'reminder-card.html', w: 1080, h: 1080, out: 'whatsapp/reminder-1080x1080_sample.png' },
  { t: 'reminder-card.html', w: 1200, h: 628, data: { layout: 'wide' }, out: 'whatsapp/reminder-1200x628_sample.png' },
  // video frames
  { t: 'lower-third.html', w: 1920, h: 1080, transparent: true, out: 'video-frames/lower-third-1920x1080_sample.png' },
  { t: 'endcard-16x9.html', w: 1920, h: 1080, out: 'video-frames/endcard-1920x1080.png' },
  // documents (preview raster of the A4 template)
  { t: 'a4-document.html', w: 794, h: 1123, scale: 2, expect: [1588, 2246], out: 'documents/a4-header-footer-preview.png' },
];

const b = await launch();
const made = [];
for (const j of jobs) {
  const out = X(j.out);
  await shot(b, { url: tpl(j.t), data: j.data, w: j.w, h: j.h, out, transparent: !!j.transparent, scale: j.scale || 1 });
  made.push({ out: j.out, expect: j.expect || [j.w, j.h] });
}
// logo PNGs @1x/@2x/@3x (wordmark 480 wide, stacked 320 wide, tick 128)
const ratio = f => { const m = fs.readFileSync(path.join(root, 'logo', f), 'utf8').match(/viewBox="[^"]*? ([\d.]+) ([\d.]+)"/); return m ? +m[1] / +m[2] : 1; };
const logoJobs = [];
for (const k of ['charcoal', 'offwhite', 'black', 'white']) { logoJobs.push([`wordmark-${k}`, 480]); logoJobs.push([`stacked-${k}`, 320]); }
logoJobs.push(['tick-mark', 128], ['tick-reversed', 128], ['lockup-horizontal-charcoal', 900], ['lockup-endorsement-charcoal', 720]);
for (const [n, w] of logoJobs) {
  const r = ratio(`${n}.svg`), h = Math.round(w / r);
  for (const s of [1, 2, 3]) {
    const out = X(`logo/${n}${s === 1 ? '' : '@' + s + 'x'}.png`);
    await svgToPng(b, path.join(root, 'logo', `${n}.svg`), w, h, out, { scale: s });
    made.push({ out: `logo/${n}${s === 1 ? '' : '@' + s + 'x'}.png`, expect: [w * s, h * s] });
  }
}
await b.close();

// Ad stills must stay <= 120 KB (4D.2.7): palette-quantise the few that exceed it (ImageMagick `convert`, flat-colour art so no visible change).
import { execFileSync } from 'child_process';
for (const m of made) { const f = X(m.out); if (!/^(feed|whatsapp)\//.test(m.out) || fs.statSync(f).size <= 120000) continue; try { execFileSync('convert', [f, '-dither', 'None', '-colors', '192', 'PNG8:' + f]); } catch { console.warn('convert unavailable; ' + m.out + ' left > 120 KB'); } }

// verify + manifest
const manifest = []; let bad = 0;
for (const m of made) {
  const s = pngSize(X(m.out));
  const ok = s.w === m.expect[0] && s.h === m.expect[1];
  if (!ok) { bad++; console.error(`SIZE MISMATCH ${m.out}: got ${s.w}x${s.h}, want ${m.expect.join('x')}`); }
  manifest.push({ file: `exports/${m.out}`, width: s.w, height: s.h, bytes: s.bytes, ok });
}
fs.writeFileSync(X('manifest.json'), JSON.stringify({ generated: new Date().toISOString(), brandVersion: JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8')).version, files: manifest }, null, 2) + '\n');
console.log(`${manifest.length} PNGs rendered, ${bad} size mismatches. Largest: ${Math.max(...manifest.map(m => m.bytes))} bytes`);
if (bad) process.exit(1);
