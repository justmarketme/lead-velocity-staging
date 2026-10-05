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

const stills = {
  D06: [ // K01 tax season carousel, 5 cards
    ['D06-K01-1-tax-deadline', card('Tax deadline:\n**23 October.**', 'SARS deadline for non-provisional taxpayers. The same pile of papers helps a cover check too.', ['Filing closes', '23 Oct 2026'], ['Set by', 'SARS'])],
    ['D06-K01-2-payslip', card('1. The IRP5\n**and payslip.**', 'The payslip may show a line called group life, death benefit or risk benefit: cover through work.', ['For SARS', 'IRP5'], ['For cover', 'Group life'])],
    ['D06-K01-3-bond', card('2. The bond\n**statement.**', 'It shows what is still owed on the home. An adviser asks about the bond and other debts.', ['Shows', 'Balance owed'], ['Also list', 'Other debts'])],
    ['D06-K01-4-schedules', card('3. Policy\n**schedules.**', 'The pages that list cover already in place, and who the beneficiaries are.', ['Shows', 'Cover in place'], ['Also shows', 'Beneficiaries'])],
    ['D06-K01-5-one-pile', card('One pile.\n**Two jobs done.**', 'Pick a time for a free 30-minute call with a licensed adviser at sortmycover.co.za', ['The call', 'Free, 30 min'], ['Decide', 'Later, or not'])],
  ],
  D08: [ // K02 nomination-form myth carousel, 5 cards
    ['D08-K02-1-myth', card('Myth: the form\n**decides.**', 'For a retirement fund, the beneficiary nomination form is a guide, not the final word.')],
    ['D08-K02-2-trustees', card('Who decides?\n**The trustees.**', 'Section 37C of the Pension Funds Act tells trustees to share a death benefit fairly among dependants.', ['The law', 'Section 37C'], ['Decided by', 'Trustees'])],
    ['D08-K02-3-look-at', card('What they\n**look at.**', 'Who depended on the member, and how much. Many families support more than one household.', ['Factor', 'Dependants'], ['Factor', 'Nomination'])],
    ['D08-K02-4-12-months', card('The\n**12-month rule.**', 'If no dependant is found in 12 months and nobody was nominated, it goes to the estate.', ['Trace window', '12 months'], ['Then', 'The estate'])],
    ['D08-K02-5-outside', card('Policies outside\n**a fund differ.**', 'Life policies held outside a retirement fund follow different rules. A licensed adviser can explain.')],
  ],
  D10: [ // S01 complaints single still
    ['D10-S01-complaint-routes', card('Two free\n**complaint routes.**', 'One for insurers and banks. One for financial advisers. Both free for consumers.', ['Insurers, banks', 'The NFO'], ['Advisers', 'FAIS Ombud'])],
  ],
  D13: [ // K03 stokvel / burial society / life cover carousel, 5 cards
    ['D13-K03-1-three-jobs', card('Three different\n**jobs.**', 'Stokvels, burial societies and life cover often get mixed up. Each one does something different.')],
    ['D13-K03-2-stokvel', card('**Stokvel**', 'A group that saves together and pays out in turns or at year-end.', ['Members', '11 million+'], ['Source', 'NASASA, 2025'])],
    ['D13-K03-3-burial-society', card('**Burial society**', 'A group that pools money to help members with funeral costs. It is a type of stokvel.')],
    ['D13-K03-4-life-cover', card('**Life cover**', 'A policy that pays a lump sum to the people named on it when the insured person dies.')],
    ['D13-K03-5-mix', card('Many families\n**use a mix.**', 'A licensed adviser can look at how they fit, on a free 30-minute call booked for a time that suits.')],
  ],
};

const reels = {
  D07: ['R02-leaving-a-job', [
    [2.5, 'Leaving\n**a job?**'],
    [3.0, 'Cover through\nwork usually\n**ends with it.**'],
    [3.0, 'Some schemes\nlet cover\n**carry on.**'],
    [3.0, 'It is called a\n**continuation**\n**option.**'],
    [3.0, 'Often with only\n**limited health**\n**questions.**'],
    [3.0, 'There can be\n**a time limit.**'],
    [3.0, 'So, for HR:\n**Is there a**\n**continuation**\n**option?**'],
  ]],
  D09: ['R03-31-day-window', [
    [2.5, 'New life\n**policy?**'],
    [3.0, 'There is a\n**31-day window.**'],
    [3.0, 'It is called\n**cooling-off.**'],
    [3.0, 'If cancelled\nin that window,\n**premiums are**\n**refunded.**'],
    [3.0, 'Less the cost\nof **cover already**\n**enjoyed.**'],
    [3.0, 'Only if\n**no claim**\n**has been made.**'],
    [3.0, 'Time to read\n**the contract**\n**calmly.**'],
  ]],
  D14: ['R04-check-an-adviser', [
    [2.5, 'Is that adviser\n**licensed?**'],
    [3.0, 'Step 1:\nask for the\n**FSP number.**'],
    [3.0, 'Step 2:\nsearch it on\n**fsca.co.za**'],
    [3.0, 'Or call the FSCA:\n**0800 110 443**'],
    [3.0, 'Step 3:\ncheck the **name**\n**matches.**'],
    [3.0, 'On every\nSortMyCover call,\n**it comes first.**'],
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
