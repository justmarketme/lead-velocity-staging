// G8 Page warm-up stills (organic posts WU01-WU05). Data only: renders the existing templates through lib.mjs shot().
// Run from brand/: node scripts/build-warmup.mjs
// Copy rules: third person, educational, no product/insurer/premium/cover amount/broker, no rand figures, no "2-4x" (NH-PCD-01).
// Playwright: uses `playwright` if installed; else set PLAYWRIGHT_PATH to a playwright(-core) folder and CHROMIUM_PATH to a Chromium/Edge exe.
import path from 'path';
import { createRequire } from 'module';
import { launch, root, shot, pngSize, fileUrl } from './lib.mjs';

const OUT = 'exports/feed/warmup';
const feed45 = (hook, sub, p1, p2) => ({ layout: 'r4x5', hook, sub, prop1_label: p1[0], prop1: p1[1], prop2_label: p2[0], prop2: p2[1], prop1_what: '', prop2_what: '' });

const jobs = [
  { t: 'feed.html', w: 1080, h: 1350, out: 'WU01-life-cover-gap-1080x1350.png',
    data: feed45('Work cover is often\n**a few times salary.**', 'A bond, school fees and other debts can add up to more. The difference is called a cover gap.', ['Through work', 'Group life'], ['At home', 'Bond + school']) },
  { t: 'feed.html', w: 1080, h: 1350, out: 'WU02-payslip-cover-line-1080x1350.png',
    data: feed45('That payslip line\n**has a name.**', 'Group life, death benefit or risk benefit. What it usually covers, and what it usually does not.', ['On a payslip', 'Group life'], ['Also shown as', 'Risk benefit']) },
  { t: 'feed.html', w: 1080, h: 1350, out: 'WU03-life-events-1080x1350.png',
    data: feed45('Cover that fitted then\n**may not fit now.**', 'A new bond, a baby or a job change can change what a family needs.', ['Life event', 'New bond'], ['Life event', 'Job change']) },
  { t: 'what-to-expect-card.html', w: 1080, h: 1080, out: 'WU04-30-minute-call-1080x1080.png',
    data: { title: 'What happens on a\n**30-minute call**', s1: 'Hello and licence details', s1m: 'The adviser shares them first', s2: 'The family, in plain words', s2m: 'No trick questions', s3: 'Options explained', s3m: 'No pressure. Decide later, or not.', footer_line: '30 minutes · Free · No obligation', who: 'A service of Lead Velocity (Pty) Ltd' } },
  { t: 'feed.html', w: 1080, h: 1350, out: 'WU05-how-sortmycover-works-1080x1350.png',
    data: feed45('Who gives the advice?\n**Not SortMyCover.**', 'SortMyCover books a free call with a licensed adviser. It never takes commission.', ['SortMyCover', 'Books the call'], ['Licensed adviser', 'Gives advice']) },
];

async function browser() {
  try { return await launch(); } catch (e) {
    if (!process.env.PLAYWRIGHT_PATH) throw e;
    const pw = createRequire(path.join(process.env.PLAYWRIGHT_PATH, 'x.js'))(process.env.PLAYWRIGHT_PATH);
    return pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  }
}

const b = await browser();
for (const j of jobs) {
  const out = path.join(root, OUT, j.out);
  await shot(b, { url: fileUrl(`templates/${j.t}`), data: j.data, w: j.w, h: j.h, out });
  const s = pngSize(out);
  console.log(`${j.out}  ${s.w}x${s.h}  ${(s.bytes / 1024).toFixed(0)} KB${s.bytes > 120000 ? '  (> 120 KB, 4D.2.7: quantise before ad use)' : ''}`);
}
await b.close();
