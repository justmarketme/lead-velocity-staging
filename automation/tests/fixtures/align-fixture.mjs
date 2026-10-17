// Aligns fixtures/synthetic-leads.json with the seeded broker (supabase/seed/smc_synthetic.sql) and the consent
// registry (landing/config/consent.json), so a real POST /lead with a fixture submission passes W01's registry check
// and routes to the seeded broker (rehearsal F3, I-52b). Nothing here is hand-typed: the practice name and FSP come
// from the seed, the consent version and text from consent.json rendered by W01's own consentRegistry().
//
//   node automation/tests/fixtures/align-fixture.mjs           rewrite the fixture (second run: no change)
//   node automation/tests/fixtures/align-fixture.mjs --check   exit 1 if the fixture is not aligned
//
// Text-level edits only, so the fixture's hand formatting is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { consentRegistry } from '../../lib/w01.mjs';

const ROOT = new URL('../../../', import.meta.url);
const FIXTURE = new URL('automation/tests/fixtures/synthetic-leads.json', ROOT);
const SEED = new URL('supabase/seed/smc_synthetic.sql', ROOT);
const CONSENT = JSON.parse(readFileSync(new URL('landing/config/consent.json', ROOT), 'utf8'));

/** The seeded broker's practice (brokers.firm_name), FSP number and WhatsApp number, read from the seed SQL. */
export function seedBroker(sql = readFileSync(SEED, 'utf8')) {
  const firm = sql.match(/'00000000-0000-4000-8000-0000000b0001',\s*'[^']+',\s*'([^']+)',\s*'([^']+)',\s*'[^']+',\s*'(\+27\d{9})'/);
  const fsp = sql.match(/'SMC_BRONZE',\s*'[^']+',\s*'([^']+)',\s*now\(\)/);
  if (!firm || !fsp) throw new Error('align-fixture: could not read the seeded broker from supabase/seed/smc_synthetic.sql');
  return { practice_name: firm[1], adviser_name: firm[2], whatsapp: firm[3], fsp_number: fsp[1] };
}

/** Seeded lead numbers (+27600000001..10) that a fixture lead must never reuse (else W01 takes the 90-day merge). */
export function seedLeadNumbers(sql = readFileSync(SEED, 'utf8')) {
  const block = sql.slice(sql.indexOf('INSERT INTO public.leads'));
  return [...new Set([...block.matchAll(/'Lead-\d+','(\+27\d{9})'/g)].map((m) => m[1]))];
}

export const NAMED_VERSION = CONSENT.named.version;
export const namedText = (b = seedBroker()) => consentRegistry(b)[NAMED_VERSION];

const jstr = (s) => JSON.stringify(s);

/** Old fixture numbers +27 60 000 0001..0010 (any written form) -> +27 60 000 0101..0110, separators kept. */
const NUM = /(\+?27|0027|\b0)([ -]?)60([ -]?)000([ -]?)00(0[1-9]|10)\b/g;
export const shiftNumbers = (text) => text.replace(NUM, (_m, cc, a, b, c, nn) => `${cc}${a}60${b}000${c}01${nn}`);

export function align(text, b = seedBroker()) {
  const named = namedText(b);
  let t = text;
  // 1. consent registry: version key + every page/lead-ad version reference -> the registry's current named version
  t = t.replace(/"named-v1-DRAFT"/g, jstr(NAMED_VERSION));
  // 2. every named consent text (registry map + page submissions) -> the registry text rendered for the seeded broker
  t = t.replace(/"I agree that Lead Velocity may share my details with (?:[^"\\]|\\.)*"/g, jstr(named));
  // 3. the fixture broker carries the seeded practice + FSP (W06 disclosure variables follow)
  t = t.replace(/("practice_name":\s*)"[^"]*"/g, `$1${jstr(b.practice_name)}`);
  t = t.replace(/("fsp_number":\s*)"[^"]*"/g, `$1${jstr(b.fsp_number)}`);
  t = t.replace(/("variables":\s*\[\s*"[^"]*",\s*)"Mark Smith Financial Services",\s*"00000"/g, `$1${jstr(b.practice_name)}, ${jstr(b.fsp_number)}`);
  // 4. synthetic numbers clear of the seed's leads (+27600000001..10) and broker (+27600000099)
  t = shiftNumbers(t);
  t = t.replace(/("_note":\s*)"named-v1-DRAFT = [^"]*"/, `$1${jstr(`${NAMED_VERSION} = landing/config/consent.json named text rendered for the seeded broker (supabase/seed/smc_synthetic.sql) by automation/tests/fixtures/align-fixture.mjs; never hand-edit. ctwa-v1 = the 4.6 CTWA consent text verbatim (NH-40).`)}`);
  return t;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const before = readFileSync(FIXTURE, 'utf8');
  const after = align(before);
  JSON.parse(after);
  if (process.argv.includes('--check')) {
    if (after !== before) { console.error('synthetic-leads.json is not aligned: run node automation/tests/fixtures/align-fixture.mjs'); process.exit(1); }
    console.log('synthetic-leads.json aligned');
  } else if (after === before) console.log('no change');
  else { writeFileSync(FIXTURE, after); console.log('synthetic-leads.json rewritten'); }
}
