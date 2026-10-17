// source-batch2.mjs — SECOND batch of Cape Town commercial leads for Sanette
// (Opulent Wealth), same 5 regions as De Villiers Swart but GUARANTEED not to
// overlap with the leads already delivered to him.
//
// Exclusion: every business already sourced in batch 1 (the three prior JSON
// exports, which are exactly what was inserted into the DB) is excluded on
// ANY of phone / normalised name / registrable domain — not a combined key,
// so near-miss duplicates can't slip through.
//
// Run: node scripts/source-batch2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');

function loadEnv(file) {
  const out = {};
  try {
    const txt = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch {}
  return out;
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const SERPER_API_KEY = env.SERPER_API_KEY;
if (!SERPER_API_KEY) { console.error('FATAL: SERPER_API_KEY missing'); process.exit(1); }

const BATCH_MARKER = 'DISCOVERY-OPULENT-SANETTE-2026-09-25';
const TARGET = 2000;
const COLLECT_MARGIN = 2200;   // collect extra so SQL-level guard can drop a few
const MAX_SEARCHES = 1100;     // Serper credit cap
const ENRICH_CONCURRENCY = 24;

// ---------- helpers ----------
function normPhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  d = d.replace(/\D/g, '');
  if (d.startsWith('27')) return '+' + d;
  if (d.startsWith('0')) return '+27' + d.slice(1);
  if (d.length === 9) return '+27' + d;
  return d ? '+' + d : '';
}
// normalised business name: lowercase, strip legal suffixes & punctuation
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(pty|ltd|limited|inc|incorporated|cc|the|and|t\/a|ta)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
function hostOf(url) {
  try { const u = url.startsWith('http') ? url : 'https://' + url; return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}
const SA_SLD = new Set(['co.za','org.za','net.za','web.za','gov.za','ac.za','edu.za','com.za']);
function registrable(host) {
  if (!host) return '';
  const p = host.split('.');
  if (p.length < 2) return host;
  const last2 = p.slice(-2).join('.');
  if (SA_SLD.has(last2) && p.length >= 3) return p.slice(-3).join('.');
  return last2;
}
const FREEMAIL = new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.uk','icloud.com','webmail.co.za','mweb.co.za','telkomsa.net','vodamail.co.za']);
const emailDomain = (e) => (e.split('@')[1] || '').toLowerCase();

// ---------- exclusion set from batch 1 ----------
const EXCL_FILES = [
  'scripts/out/ct-commercial-2026-09-18.json',
  'scripts/out/ct-commercial-2026-09-18-topup.json',
  'scripts/out/topup2.json',
];
const exPhones = new Set(), exNames = new Set(), exDomains = new Set();
let exCount = 0;
for (const f of EXCL_FILES) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));
    for (const l of (Array.isArray(arr) ? arr : [])) {
      exCount++;
      const p = normPhone(l.phone || l.raw_phone); if (p) exPhones.add(p);
      const n = normName(l.business_name); if (n) exNames.add(n);
      const d = registrable(hostOf(l.website || '')); if (d) exDomains.add(d);
    }
  } catch (e) { console.warn('exclusion file skipped:', f, e.message); }
}
console.log(`Exclusion set loaded: ${exCount} prior leads -> ${exPhones.size} phones, ${exNames.size} names, ${exDomains.size} domains`);
if (exCount < 1500) { console.error('FATAL: exclusion set looks too small — refusing to risk duplicate delivery.'); process.exit(1); }

const isExcluded = (name, phone, website) => {
  const p = normPhone(phone); if (p && exPhones.has(p)) return 'phone';
  const n = normName(name);   if (n && exNames.has(n)) return 'name';
  const d = registrable(hostOf(website || '')); if (d && exDomains.has(d)) return 'domain';
  return '';
};

// ---------- AREAS: the client's 5 regions, widened to sub-suburbs ----------
const AREAS = [
  ...['Bellville','Durbanville','Brackenfell','Kraaifontein','Goodwood','Parow','Kuils River','Tygervalley Bellville','Plattekloof','Monte Vista','Edgemead','Panorama Cape Town','Welgemoed','Bothasig','Eversdal Durbanville','Stikland Bellville','Oakdale Bellville','Vredekloof Brackenfell','Northpine Brackenfell','Belhar','Elsies River','Epping Industria Cape Town']
    .map(q => ({ region: 'Northern Suburbs', q: `${q}, Cape Town` })),
  ...['Stellenbosch Central','Technopark Stellenbosch','Die Boord Stellenbosch','Idas Valley Stellenbosch','Jamestown Stellenbosch','Klapmuts','Koelenhof','Cloetesville Stellenbosch']
    .map(q => ({ region: 'Stellenbosch', q })),
  ...['Paarl Central','Northern Paarl','Southern Paarl','Huguenot Paarl','Dal Josafat Paarl','Klein Drakenstein','Simondium']
    .map(q => ({ region: 'Paarl', q })),
  ...['Wellington Western Cape','Hermon Western Cape','Windmeul','Groenheuwel Wellington']
    .map(q => ({ region: 'Wellington', q })),
  ...['Somerset West Central','Strand Western Cape','Gordons Bay','Firgrove','Sir Lowry\'s Pass','Croydon Somerset West','Macassar','Helderberg Somerset West']
    .map(q => ({ region: 'Somerset West', q })),
];

// ---------- CATEGORIES (commercial-insurance relevant, wide) ----------
const CATEGORIES = [
  ['construction companies',3],['building contractors',3],['manufacturing companies',3],['engineering firms',3],
  ['logistics and transport companies',3],['trucking companies',2],['motor dealerships',2],['panel beaters',2],
  ['auto repair',2],['plumbers',2],['electricians',2],['wholesalers and distributors',3],['warehousing and storage',2],
  ['medical practices',2],['dental practices',2],['guest houses',2],['security companies',2],['accounting firms',2],
  ['legal firms and attorneys',2],['freight forwarding companies',3],['steel fabricators',3],['printing companies',2],
  ['furniture manufacturers',3],['food manufacturers',3],['packaging companies',3],['civil engineering contractors',3],
  ['refrigeration companies',2],['pharmacies',2],['veterinary clinics',2],['physiotherapy practices',2],
  ['cleaning companies',2],['IT companies',2],['signage companies',2],['agricultural suppliers',3],['hardware stores',2],
  ['tyre fitment centres',2],['scrap metal dealers',2],['nurseries and garden centres',2],['bakeries',2],['butcheries',2],
  ['courier companies',2],['earthmoving contractors',3],['plant hire',3],['roofing contractors',2],['paving contractors',2],
  ['glass and aluminium',2],['shopfitters',2],['joinery and carpentry',2],['welding services',2],['auto electricians',2],
  ['solar installers',2],['air conditioning companies',2],['pest control',2],['landscaping companies',2],
  ['waste management',2],['opticians',2],['funeral parlours',2],['driving schools',2],['private schools',2],
  ['creches and daycare',2],['travel agencies',2],['estate agencies',2],['architects',2],['quantity surveyors',2],
  ['recruitment agencies',2],['marketing agencies',2],['textile manufacturers',3],['plastics manufacturers',3],
  ['chemical suppliers',3],['electrical wholesalers',3],['building suppliers',3],['paint suppliers',2],
  ['irrigation suppliers',2],['farm equipment suppliers',3],['wine farms',2],['cold storage',3],['feed suppliers',2],
  ['gyms and fitness centres',2],['spas and salons',2],['dry cleaners',2],['laboratories',2],['car wash',2],
].map(([q,w]) => ({ q, w }));

const stats = { searches:0, raw:0, excludedPrior:0, dupInternal:0, noPhone:0, kept:0, serperErrors:0, enriched:0, emails:0, matched:0 };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Retry transient network failures — a flaky connection must not kill a long run.
async function serperPlaces(q, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      stats.searches++;
      const res = await fetch('https://google.serper.dev/places', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, gl: 'za', hl: 'en' }),
      });
      if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text().catch(()=> '')).slice(0,120)}`);
      const j = await res.json();
      return j.places || [];
    } catch (e) { lastErr = e; await sleep(800 * (i + 1)); }
  }
  throw lastErr;
}

const BAD_EMAIL = /(sentry|example\.com|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|wixpress|godaddy|placeholder|your-?email|@2x|domain\.com|email\.com|wordpress)/i;
function extractEmails(html) {
  const found = new Set();
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const e = m[0].toLowerCase().replace(/\.$/, '');
    if (!BAD_EMAIL.test(e) && validEmail(e)) found.add(e);
  }
  return [...found];
}
async function fetchText(url, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadVelocityBot/1.0)' } });
    if (!r.ok) return '';
    const ct = r.headers.get('content-type') || '';
    if (ct && !/text|html|xml|json/i.test(ct)) return '';
    return await r.text();
  } catch { return ''; } finally { clearTimeout(t); }
}
async function enrich(website) {
  const base = website.startsWith('http') ? website : 'https://' + website;
  let origin = base; try { origin = new URL(base).origin; } catch {}
  const siteReg = registrable(hostOf(website));
  const urls = [base, origin + '/contact', origin + '/contact-us', origin + '/about'];
  const emails = new Set();
  for (const u of urls) {
    const html = await fetchText(u);
    if (!html) continue;
    for (const e of extractEmails(html)) emails.add(e);
    if (emails.size >= 3) break;
  }
  const list = [...emails];
  const domMatch = list.find(e => siteReg && registrable(emailDomain(e)) === siteReg);
  if (domMatch) return { email: domMatch, matchedDomain: true };
  const free = list.find(e => FREEMAIL.has(emailDomain(e)));
  return { email: free || '', matchedDomain: false };
}
async function pool(items, n, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const idx = i++; await worker(items[idx]); } }));
}
function inferBand(catQ, rc) {
  rc = Number(rc) || 0;
  const heavy = /(construction|manufactur|logistic|transport|trucking|dealership|warehous|wholesale|engineering|fabricat|plant hire|earthmoving|cold storage)/i.test(catQ || '');
  if (rc >= 80 || (heavy && rc >= 25)) return 'Small (11-50)';
  if (rc >= 5 || heavy) return 'Micro (1-10)';
  return 'Unknown';
}
// Same Data-Quality formula as batch 1, for consistency with what the client already has.
function vibeScore(l) {
  let v = 15;
  if (l.phone) v += 25;
  if (l.website) v += 15;
  if (l.email) v += (l.matchedDomain ? 30 : 18);
  if ((Number(l.ratingCount) || 0) >= 10) v += 8;
  if (l.cat_weight >= 3) v += 4;
  return Math.min(99, v);
}

const OUT_JSON = path.join(OUT_DIR, 'batch2-sanette-2026-09-25.json');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const seen = new Map();  // internal dedupe within this run
  const out = [];

  // RESUME: keep everything already collected and carry on through the matrix.
  const START_INDEX = Number(process.env.START_INDEX || 0);
  if (process.env.RESUME === '1' && fs.existsSync(OUT_JSON)) {
    const prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    for (const l of prev) {
      out.push(l);
      const nk = normName(l.business_name);
      const key = normPhone(l.phone) || nk;
      if (key) seen.set(key, 1);
      if (nk) seen.set('n:' + nk, 1);
    }
    console.log(`RESUME: carried ${out.length} leads forward, starting at pair ${START_INDEX}`);
  }

  // Category-major so every region gets breadth early.
  const allPairs = [];
  for (const cat of CATEGORIES) for (const area of AREAS) allPairs.push({ cat, area });
  const pairs = allPairs.slice(START_INDEX);
  console.log(`Matrix: ${allPairs.length} pairs total, processing ${pairs.length} from index ${START_INDEX}`);

  let consecutiveErrors = 0;
  for (const { cat, area } of pairs) {
    if (out.length >= COLLECT_MARGIN || stats.searches >= MAX_SEARCHES) break;
    let places = [];
    try { places = await serperPlaces(`${cat.q} in ${area.q}`); consecutiveErrors = 0; }
    catch (e) {
      stats.serperErrors++; consecutiveErrors++;
      if (consecutiveErrors > 40) { console.error('too many consecutive Serper errors, stopping:', e.message); break; }
      continue;
    }

    const keepN = cat.w >= 3 ? 14 : 9;
    let kept = 0;
    for (const p of places) {
      if (kept >= keepN) break;
      stats.raw++;
      const name = p.title || '';
      const phone = normPhone(p.phoneNumber);
      const website = p.website || '';
      if (!phone) { stats.noPhone++; continue; }               // client requires contactable phone
      const why = isExcluded(name, phone, website);
      if (why) { stats.excludedPrior++; continue; }            // already delivered to De Villiers
      const nk = normName(name);
      const key = phone || nk;
      if (seen.has(key) || (nk && seen.has('n:' + nk))) { stats.dupInternal++; continue; }
      seen.set(key, 1); if (nk) seen.set('n:' + nk, 1);
      out.push({
        business_name: name, category: p.category || cat.q, search_category: cat.q, cat_weight: cat.w,
        address: p.address || '', region: area.region, area_q: area.q,
        phone, raw_phone: p.phoneNumber || '', website, email: '', matchedDomain: false,
        rating: p.rating ?? null, ratingCount: p.ratingCount ?? null, cid: p.cid || '',
        employee_band: inferBand(cat.q, p.ratingCount),
      });
      kept++; stats.kept++;
    }
    if (stats.searches % 25 === 0) console.log(`  ...${stats.searches} searches, ${out.length} new leads`);
  }

  console.log(`Discovery done: ${out.length} new leads from ${stats.searches} searches`);
  console.log(`  excluded (already delivered): ${stats.excludedPrior}, internal dupes: ${stats.dupInternal}, no phone: ${stats.noPhone}`);

  // Email enrichment for those with a website
  const withSite = out.filter(l => l.website && !l.enrich_done);
  console.log(`Enriching ${withSite.length} websites for email...`);
  await pool(withSite, ENRICH_CONCURRENCY, async (l) => {
    const { email, matchedDomain } = await enrich(l.website);
    stats.enriched++;
    l.enrich_done = true;
    if (email) { l.email = email; l.matchedDomain = matchedDomain; stats.emails++; if (matchedDomain) stats.matched++; }
  });

  for (const l of out) {
    l.vibe = vibeScore(l);
    l.db_source = 'Search Lead';
    l.notes = `Area: ${l.region} | [Batch: ${BATCH_MARKER} | ${l.region}]`;
  }

  const final = out.slice(0, COLLECT_MARGIN);
  const jsonPath = OUT_JSON;
  fs.writeFileSync(jsonPath, JSON.stringify(final, null, 2));

  const byRegion = {};
  for (const l of final) byRegion[l.region] = (byRegion[l.region] || 0) + 1;
  console.log('\n=== BATCH 2 SUMMARY ===');
  console.log('Total new leads:', final.length, '(target', TARGET + ')');
  console.log('By region:', byRegion);
  console.log('With phone:', final.filter(l => l.phone).length, '| with website:', final.filter(l => l.website).length, '| with email:', final.filter(l => l.email).length);
  console.log('Searches used:', stats.searches, '| excluded as already-delivered:', stats.excludedPrior);
  console.log('Written:', jsonPath);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
