// 14-day daily posts (deliverables/meta-operator/daily). Data only: existing feed.html + reels-endcard.html via lib.mjs shot(); no template changes.
// Run from brand/: node scripts/build-daily.mjs            (all)
//                  node scripts/build-daily.mjs D06 D07    (only those days)
//   Same Playwright setup as build-week1.mjs (PLAYWRIGHT_PATH + CHROMIUM_PATH if `playwright` is not installed).
//   Reels need ffmpeg on PATH (or FFMPEG_PATH); without it the frames + concat list are written and the command is printed.
// Copy rules (Jonathan, 5 Oct 2026): no "Lead Velocity" anywhere; scheduled-call wording; third person; no product/insurer/premium/cover amount/broker.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { launch, root, shot, pngSize, fileUrl } from './lib.mjs';

const OUT = 'exports/feed/daily';
const DISC = 'SortMyCover gives no financial advice,\nproduct comparisons or premium quotes.';
const CTA = 'sortmycover.co.za'; // pill fits ~26 chars at 60 px; the full CTA sentence is in the caption

// feed.html 4:5. Empty prop arrays hide the paper notes (data-if). Paper values are nowrap: keep them <= ~15 chars.
const card = (hook, sub, p1 = ['', ''], p2 = ['', '']) => ({ layout: 'r4x5', hook, sub, prop1_label: p1[0], prop1: p1[1], prop2_label: p2[0], prop2: p2[1], prop1_what: '', prop2_what: '' });
// Reel frames on reels-endcard.html: [seconds, line]. Lines <= ~17 chars (96 px); **bold** never spans a \n. End card added automatically.
const END = [4.0, 'Sort your cover.\n30 minutes.\n**A real adviser.**'];

// End cards (Jonathan, 6 Oct 2026 batch rules): the last card of each carousel carries the exact CTA sentence as its sub;
// a single still that has no room for it swaps the footer line for a URL line (FOOT_URL). Reels end on END + the CTA pill.
const FOOT_URL = 'Free call with a licensed adviser: sortmycover.co.za';
const LAST_SUB = 'Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za';

const stills = {
  D06: [ // K01 tax season carousel, 5 cards
    ['D06-K01-1-tax-deadline', card('Tax deadline:\n**23 October.**', 'SARS deadline for non‑provisional taxpayers. The IRP5 in that pile helps a cover check too.', ['Filing closes', '23 Oct 2026'], ['Set by', 'SARS'])],
    ['D06-K01-2-payslip', card('1. The IRP5\n**certificate.**', 'Code 3801 is used for several fringe benefits. They can include premiums an employer pays an insurer for staff cover.', ['Code 3801', 'Fringe benefits'], ['Can include', 'Staff cover'])],
    ['D06-K01-3-bond', card('2. The bond\n**statement.**', 'The home-loan document. Before any advice, an adviser must ask about the client’s financial situation.', ['Document', 'Home loan'], ['Adviser asks about', 'Finances'])],
    ['D06-K01-4-schedules', card('3. Policy\n**schedules.**', 'The pages that list cover already in place.', ['Shows', 'Cover in place'], ['Document', 'Policy schedule'])],
    ['D06-K01-5-one-pile', card('One sitting.\n**Two jobs.**', LAST_SUB, ['The call', 'Free, 30 min'], ['Decide', 'Later, or not'])],
  ],
  D08: [ // K02 nomination-form myth carousel, 5 cards
    ['D08-K02-1-myth', card('Myth: the form\n**decides.**', 'For a fund under the Pension Funds Act, the beneficiary nomination form is a guide, not the final word.')],
    ['D08-K02-2-trustees', card('Who decides?\n**The trustees.**', 'Section 37C tells trustees to share a death benefit fairly among dependants and any nominees.', ['The law', 'Section 37C'], ['Decided by', 'Trustees'])],
    ['D08-K02-3-look-at', card('What they\n**look at.**', 'Who depended on the member at the date of death, and how much. Claims can come from more than one household.', ['Dependency', 'At death'], ['Also weighed', 'Nomination'])],
    ['D08-K02-4-12-months', card('The\n**12-month rule.**', 'No dependant traced and no nominee: the estate. If no estate is reported: the Guardian’s Fund or an unclaimed benefit fund.', ['Trace window', '12 months'], ['Paid to', 'Estate or fund'])],
    ['D08-K02-5-outside', card('Policies outside\n**a fund differ.**', LAST_SUB)],
  ],
  D10: [ // S01 complaints single still (footer line carries the URL: no room in the sub)
    ['D10-S01-complaint-routes', { ...card('Two free\n**complaint routes.**', 'National Financial Ombud (NFO): insurers, banks and credit providers. FAIS Ombud: financial advisers. Both free.', ['Insurers, banks', 'The NFO'], ['Financial advisers', 'FAIS Ombud']), line: FOOT_URL }],
  ],
  D13: [ // K03 stokvel / burial society / life cover carousel, 5 cards
    ['D13-K03-1-three-jobs', card('Three different\n**jobs.**', 'Stokvels, burial societies and life cover each do something different.')],
    ['D13-K03-2-stokvel', card('**Stokvel**', 'A group that pools money for a shared goal. In some, members take turns to receive the pot.', ['Common types', 'Six'], ['Listed by', 'NASASA'])],
    ['D13-K03-3-burial-society', card('**Burial society**', 'A type of stokvel that helps members with funeral costs and support during bereavement.')],
    ['D13-K03-4-life-cover', card('**Life cover**', 'A policy that pays out when the insured person dies. With a valid nomination, it goes straight to the beneficiary.')],
    ['D13-K03-5-mix', card('Questions about\n**how they differ?**', LAST_SUB)],
  ],
};

const reels = {
  D07: ['R02-leaving-a-job', [
    [2.5, 'Leaving a job:\n**one question**\n**for HR first.**'],
    [3.0, 'Group life cover\nthrough work\ntypically\n**ends with it.**'],
    [3.0, 'Some group life\nschemes offer\na way to **convert**\n**it to personal**\n**cover.**'],
    [3.0, 'It is called a\n**continuation or**\n**conversion**\n**option.**'],
    [3.0, 'With only limited\n**medical questions**\n**or tests.**'],
    [3.0, 'There can be\n**a time limit.**'],
    [3.0, 'So, for HR:\n**Is there a**\n**continuation**\n**option on the**\n**group life cover?**'],
  ]],
  D09: ['R03-31-day-window', [
    [3.0, 'A new life policy\n**comes with a**\n**31-day window,**\nwith some\nexceptions.'],
    [3.0, 'It is called\n**cooling-off.**'],
    [3.0, 'If cancelled\nin that window,\n**premiums are**\n**refunded.**'],
    [3.0, 'Less the cost\nof **cover already**\n**enjoyed.**'],
    [3.0, 'For investment\npolicies, also\n**any market loss.**'],
    [3.0, 'Only if no claim,\n**no payout and no**\n**insured event.**'],
    [3.0, 'Time to read\n**the contract**\n**calmly.**'],
  ]],
  D14: ['R04-check-an-adviser', [
    [2.5, 'Is that adviser\n**licensed?**'],
    [3.0, 'Step 1:\nask for the name\n**and FSP number.**'],
    [3.0, 'Step 2:\nsearch it on\n**fsca.co.za.**'],
    [3.0, 'Or call the FSCA:\n**0800 110 443**'],
    [3.0, 'Step 3: check the\n**name and the**\n**status shown.**'],
    [3.0, 'Authorised firms\nmust **show that**\n**status in their**\n**paperwork.**'],
  ]],
};

const only = process.argv.slice(2).map(s => s.toUpperCase());
const want = d => !only.length || only.includes(d);

async function browser() {
  try { return await launch(); } catch (e) {
    if (!process.env.PLAYWRIGHT_PATH) throw e;
    const pw = createRequire(path.join(process.env.PLAYWRIGHT_PATH, 'x.js'))(process.env.PLAYWRIGHT_PATH);
    return pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  }
}

const b = await browser();
for (const [day, jobs] of Object.entries(stills)) {
  if (!want(day)) continue;
  for (const [name, data] of jobs) {
    const out = path.join(root, OUT, `${name}-1080x1350.png`);
    await shot(b, { url: fileUrl('templates/feed.html'), data, w: 1080, h: 1350, out });
    const s = pngSize(out);
    console.log(`${path.basename(out)}  ${s.w}x${s.h}  ${(s.bytes / 1024).toFixed(0)} KB`);
  }
}

const ff = process.env.FFMPEG_PATH || 'ffmpeg';
const pending = [];
for (const [day, [slug, frames]] of Object.entries(reels)) {
  if (!want(day)) continue;
  const all = [...frames.map(([s, l]) => [s, l, '', '']), [END[0], END[1], CTA, DISC]];
  const fdir = path.join(root, OUT, `${day}-${slug}-frames`);
  const list = [];
  for (const [i, [sec, line, cta, fine]] of all.entries()) {
    const name = `f${i + 1}-1080x1920.png`;
    await shot(b, { url: fileUrl('templates/reels-endcard.html'), data: { line, cta, fine, layout: fine ? 'disc' : '' }, w: 1080, h: 1920, out: path.join(fdir, name) });
    list.push(`file '${name}'`, `duration ${sec}`);
  }
  list.push(`file 'f${all.length}-1080x1920.png'`); // concat demuxer: repeat last file so its duration is honoured
  fs.writeFileSync(path.join(fdir, 'concat.txt'), list.join('\n') + '\n');
  const secs = all.reduce((t, f) => t + f[0], 0);
  const mp4 = path.join(root, OUT, `${day}-${slug}-1080x1920.mp4`);
  pending.push([mp4, secs, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(fdir, 'concat.txt'), '-vf', 'fps=30,format=yuv420p', '-t', String(secs), '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', '-an', mp4]]);
  console.log(`${day}-${slug}-frames/  ${all.length} frames  ${secs} s`);
}
await b.close();

for (const [mp4, secs, args] of pending) {
  const r = spawnSync(ff, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) console.log(`\nffmpeg not run (${r.error ? r.error.code : 'exit ' + r.status}). Run:\n${ff} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  else console.log(`${path.relative(root, mp4)}  ${(fs.statSync(mp4).size / 1024).toFixed(0)} KB  (${secs} s, silent, captions are the frames)`);
}
