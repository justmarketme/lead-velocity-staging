// Current-facts organic posts C01-C03 (deliverables/meta-operator/current-posts). Data only: existing feed.html via lib.mjs shot(); no template changes.
// Run from brand/: node scripts/build-current.mjs
//   Same Playwright setup as build-week1.mjs (PLAYWRIGHT_PATH + CHROMIUM_PATH if `playwright` is not installed).
// Copy rules: third person, educational, no product/insurer/premium/cover amount/broker. Every figure is sourced in the matching Cxx.md.
// C02 is time-bound: repo/prime figures are valid until the next SARB MPC decision (Nov 2026).
import path from 'path';
import { createRequire } from 'module';
import { launch, root, shot, pngSize, fileUrl } from './lib.mjs';

const OUT = 'exports/feed/current';

// feed.html 4:5. Empty prop arrays hide the paper notes (data-if).
const card = (hook, sub, p1 = ['', ''], p2 = ['', '']) => ({ layout: 'r4x5', hook, sub, prop1_label: p1[0], prop1: p1[1], prop2_label: p2[0], prop2: p2[1], prop1_what: '', prop2_what: '' });

const stills = [
  { out: 'C01-death-claims-paid-1080x1350.png', data: card('94.1% of death claims\n**were paid.**', 'ASISA figures for 2025. Most of the rest came down to details left out at the start, fraud, waiting periods or exclusions.', ['Death claims paid', '94.1%'], ['Source', 'ASISA, 2025']) },
  { out: 'C02-prime-rate-1080x1350.png', data: card('Prime is now\n**10.75%.**', 'The SARB raised the repo rate on 23 September 2026. What that means for bonds, in plain words.', ['Repo rate', '7.25%'], ['Prime rate', '10.75%']) },
  { out: 'C03-check-an-adviser-1080x1350.png', data: card('How to check\n**an adviser.**', 'Every licensed adviser has an FSP number. The FSCA register shows if it is real.', ['Search', 'fsca.co.za'], ['Toll-free', '0800 110 443']) },
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
await b.close();
