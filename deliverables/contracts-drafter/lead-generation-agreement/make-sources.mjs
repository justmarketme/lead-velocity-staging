// Builds the two current texts (LGSA-v0.3) from the working draft lead-velocity-services-agreement-v2.md:
//   1. lead-velocity-services-agreement.md            canonical template (clean: no change markers,
//                                                       no change log) used by the CRM generator + portal
//   2. lead-velocity-services-agreement-v0.3-marked.md  client copy for an existing client (Mark): every
//                                                       change from v0.1 highlighted as "Changed/New in v0.3", plus
//                                                       a plain summary of changes. No internal decision codes.
// v0.1 is kept as lead-velocity-services-agreement-v0.1.md. v0.2 (7 Oct) was never issued to a client; its
// markers ([CHANGED v0.2], [NEW v0.2]) stay in the draft and are shown to the client as v0.3 changes from v0.1.
// Edit the draft, never the two outputs. Usage: node make-sources.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, 'lead-velocity-services-agreement-v2.md');
const CANON = join(HERE, 'lead-velocity-services-agreement.md');
const V01 = join(HERE, 'lead-velocity-services-agreement-v0.1.md');
const MARKED = join(HERE, 'lead-velocity-services-agreement-v0.3-marked.md');

if (!existsSync(V01)) copyFileSync(CANON, V01); // keep v0.1 once, never overwrite it

let md = readFileSync(DRAFT, 'utf8').replace(/\r\n/g, '\n');

// Header: the working note about decision codes is internal.
md = md.replace(/\n> \*\*How changes are marked\.\*\*[\s\S]*?\n(?=\n## )/, '\n');

// Change log -> plain client summary (no decision codes, no internal column header).
const logStart = md.indexOf('\n## Change log');
if (logStart < 0) throw new Error('change log not found');
const log = md.slice(logStart);
md = md.slice(0, logStart).trimEnd() + '\n';
const rows = log.split('\n').filter((l) => /^\| (D\d+|C\d+) \|/.test(l)).map((l) => {
  const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
  return `| ${cells[1]} | ${cells[2]} |`;
});
if (rows.length < 8) throw new Error('change log rows not parsed: ' + rows.length);
const summary = ['', '## Summary of changes in version 0.3', '', 'Changes from version 0.1 (5 October 2026) are marked in the text as Changed in v0.3 or New in v0.3. Everything else is word for word as before.', '', '| What changed | Clauses |', '|---|---|', ...rows, '', 'Not changed: the Bronze, Silver and Gold fees, top-ups, payment, termination (cancellation notice stays 7 days), liability, intellectual property and the signature method.', ''].join('\n');

// Marker forms: **[CHANGED v0.2 — D4: ...]**, [NEW v0.3 — D11], etc.
const MARK_RE = /\s*\*{0,2}\[(CHANGED|NEW) v0\.[23](?: —[^\]]*)?\]\*{0,2}/g;
const canonical = md.replace(MARK_RE, '').replace(/[ \t]+\n/g, '\n');
// the summary goes up front, before the Parties, so the client reads what changed first;
// the internal change note under the version line is replaced, for the client, by that summary
const markedBody = md.replace(/\n> \*\*Change note[^\n]*\n/, '\n').replace(MARK_RE, (_m, kind) => ` [${kind} v0.3]`);
if (!markedBody.includes('\n## Parties')) throw new Error('Parties heading not found');
const marked = markedBody.replace('\n## Parties', summary + '\n## Parties');

for (const [name, text] of [['canonical', canonical], ['marked', marked]]) {
  const leftover = text.match(/\[(?:CHANGED|NEW)[^\]]*—[^\]]*\]|\bD\d{1,2}\b(?= |,|;|\])/g);
  if (name === 'canonical' && /\[(CHANGED|NEW) v0\.[23]/.test(text)) throw new Error('canonical still has markers');
  if (leftover && name === 'marked' && leftover.some((x) => x.startsWith('['))) throw new Error('marked has coded markers: ' + leftover.slice(0, 3));
}
if (/Jonathan West's final decisions|coordinator message/.test(canonical + marked)) throw new Error('internal wording leaked');

// Terms Jonathan has decided must not drop out silently when the draft is edited.
const must = [
  ['version line', /^Version: LGSA-v0\.3 \(10 October 2026\)/m],
  ['Plan definition names the Pilot', /"\*\*Plan\*\*" means the plan the Client has chosen \(Pilot, Bronze, Silver or Gold\)/],
  ['9.7 Pilot Plan terms', /9\.7 \*\*Pilot Plan\.\*\* The Pilot Plan is available once only, to a Client that has not bought Services/],
  ['Schedule 1 Pilot row', /\| Pilot \(first-time clients only; one introductory Billing Cycle\) \| R8,500 excl\. VAT, once-off \| 10 Qualified Leads \(R850 each\) \|/],
  ['7.2 cap of 3 per Calendar Week for every Plan', /no more than 3 replacement requests per Calendar Week, whichever Plan the Client is on/],
  ['Uncontactable Lead defined', /"\*\*Uncontactable Lead\*\*" means a Qualified Lead/],
  ['6.3 refund at the Plan\'s Effective Lead Price', /refund, for each of those leads, the Effective Lead Price of the Client's Plan/],
  ['8.3 no success-based payment', /8\.3 \*\*No success-based payment\.\*\*/],
  ['8.4 attendance and contactability feedback only', /whether each Consumer attended and could be contacted \(clause 14\.3\(c\)\)/],
  ['11.1 notice stays 7 days', /11\.1 \*\*Cancellation on notice\.\*\* .*?at least 7 days'/],
  ['9.7 move on from the Pilot is by paying in advance, not by 9.5 notice', /no notice under clause 9\.5 is needed/],
  ['6.3 total refund capped at what was paid (rounding)', /the total refunded for a Billing Cycle \(or for a Top-Up\) is never more than the Client paid for it/],
  ['11.6 total refund capped at what was paid', /never more in total than the Client paid for those leads/],
  ['1.1.35 Uncontactable Lead uses the same two calls as S3.4(a)', /answered neither of the Client's calls \(made at the booked start time and again at least 10 minutes later, on every phone number in the Lead Data\)/],
  ['1.1.28 states the weekly maximum', /within the maximum of 3 replacement requests per Calendar Week in clause 7\.2/],
  ['Schedule 1 states the weekly maximum', /Replacements \(clause 7\)[^|]*\| Goodwill, not a right: no more than 3 replacement requests per Calendar Week, whichever Plan/],
];
for (const [label, re] of must) if (!re.test(canonical)) throw new Error('canonical lost: ' + label);
if (/no longer offers a Pilot|minimum Plan is Bronze|per cycle \(Pilot 2/.test(canonical + marked)) throw new Error('withdrawn Pilot wording is back');
// Schedule 1 is binding text: the Silver and Gold Fees that 1.1.14 and 6.3 quote must be stated there, not left as bracketed placeholders.
if (/\[PER PRICING PAGE\]|\[CURRENT:/.test(canonical)) throw new Error('Schedule 1 still has bracketed Plan placeholders');

writeFileSync(CANON, canonical);
writeFileSync(MARKED, marked);
console.log('canonical', canonical.length, 'chars; marked', marked.length, 'chars;', (marked.match(/\[(CHANGED|NEW) v0\.3\]/g) || []).length, 'markers');
