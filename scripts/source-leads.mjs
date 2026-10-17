// source-leads.mjs — real lead-sourcing pipeline for Lead Velocity CRM
// Discovery (Serper Places) -> free enrichment (homepage/contact/about email,
// domain-matched) -> qualify/infer -> validate/global-dedupe -> write JSON+CSV.
// DB insert is done separately via the Supabase MCP (service role), batched.
// Run: node scripts/source-leads.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');

// ---------- env loading (no deps) ----------
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
const mask = (k) => (k ? k.slice(0, 4) + '…' + k.slice(-2) + ` (len ${k.length})` : 'MISSING');

const BATCH_MARKER = 'DISCOVERY-OPULENT-2026-09-18';

// ---------- AREAS ----------
// Client's 5 regions; "Northern Suburbs" is a Cape Town region -> expand to suburbs.
const AREAS = [
  { region: 'Northern Suburbs', q: 'Bellville, Cape Town' },
  { region: 'Northern Suburbs', q: 'Durbanville, Cape Town' },
  { region: 'Northern Suburbs', q: 'Brackenfell, Cape Town' },
  { region: 'Northern Suburbs', q: 'Kraaifontein, Cape Town' },
  { region: 'Northern Suburbs', q: 'Goodwood, Cape Town' },
  { region: 'Northern Suburbs', q: 'Parow, Cape Town' },
  { region: 'Northern Suburbs', q: 'Kuils River, Cape Town' },
  { region: 'Stellenbosch', q: 'Stellenbosch' },
  { region: 'Paarl', q: 'Paarl' },
  { region: 'Wellington', q: 'Wellington, Western Cape' },
  { region: 'Somerset West', q: 'Somerset West' },
];

// ---------- CATEGORIES (weighted toward commercial-insurance relevance) ----------
// weight: higher = keep more per query; commercial/industrial prioritised.
const CATEGORIES = [
  { q: 'construction companies', w: 3 },
  { q: 'building contractors', w: 3 },
  { q: 'manufacturing companies', w: 3 },
  { q: 'engineering firms', w: 3 },
  { q: 'logistics and transport companies', w: 3 },
  { q: 'trucking companies', w: 2 },
  { q: 'motor dealerships', w: 2 },
  { q: 'auto repair and panel beaters', w: 2 },
  { q: 'plumbers', w: 2 },
  { q: 'electricians', w: 2 },
  { q: 'wholesalers and distributors', w: 3 },
  { q: 'warehousing and storage', w: 2 },
  { q: 'medical practices', w: 2 },
  { q: 'dental practices', w: 2 },
  { q: 'guest houses and lodges', w: 2 },
  { q: 'security companies', w: 2 },
  { q: 'accounting firms', w: 2 },
  { q: 'legal firms and attorneys', w: 2 },
];
// low-value cats we allow ONLY if they return a phone or email (see qualify step)
const LOW_VALUE = /restaurant|cafe|takeaway|clothing|boutique|retail shop/i;

// TOP-UP MODE: extra categories used only when SEED_JSON is set (extend an
// existing batch cheaply without re-discovering what we already have).
const EXTRA_CATEGORIES = [
  { q: 'panel beaters', w: 2 },
  { q: 'freight forwarding companies', w: 3 },
  { q: 'steel fabricators', w: 3 },
  { q: 'printing companies', w: 2 },
  { q: 'furniture manufacturers', w: 3 },
  { q: 'food manufacturers', w: 3 },
  { q: 'packaging companies', w: 3 },
  { q: 'civil engineering contractors', w: 3 },
  { q: 'refrigeration companies', w: 2 },
  { q: 'car dealerships', w: 2 },
  { q: 'pharmacies', w: 2 },
  { q: 'veterinary clinics', w: 2 },
  { q: 'physiotherapy practices', w: 2 },
  { q: 'guest houses', w: 2 },
  { q: 'hotels', w: 2 },
  { q: 'cleaning companies', w: 2 },
  { q: 'IT companies', w: 2 },
  { q: 'signage companies', w: 2 },
  { q: 'agricultural suppliers', w: 3 },
  { q: 'hardware stores', w: 2 },
];
const SEED_JSON = env.SEED_JSON || process.env.SEED_JSON || '';

const TARGET = 2000;
const MAX_SEARCHES = 620;                  // hard budget cap on Serper credits
const PER_CAT_KEEP = { hi: 14, lo: 8 };    // keep more from heavy-weight cats
const ENRICH_CONCURRENCY = 24;

const stats = { searches: 0, discovered: 0, afterDedupe: 0, withPhone: 0, withWebsite: 0, withEmail: 0, matchedDomainEmail: 0, enrichAttempts: 0, droppedLowValue: 0, serperErrors: 0 };

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
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
function hostOf(url) {
  try {
    const u = url.startsWith('http') ? url : 'https://' + url;
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return ''; }
}
// registrable domain (eTLD+1), handling common SA second-level TLDs
const SA_SLD = new Set(['co.za', 'org.za', 'net.za', 'web.za', 'gov.za', 'ac.za', 'edu.za', 'com.za']);
function registrable(host) {
  if (!host) return '';
  const p = host.split('.');
  if (p.length < 2) return host;
  const last2 = p.slice(-2).join('.');
  if (SA_SLD.has(last2) && p.length >= 3) return p.slice(-3).join('.');
  return last2;
}
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'webmail.co.za', 'mweb.co.za', 'telkomsa.net', 'vodamail.co.za']);
function emailDomain(e) { return (e.split('@')[1] || '').toLowerCase(); }

function inferBand(catQ, ratingCount) {
  const rc = Number(ratingCount) || 0;
  const heavy = /(construction|manufactur|logistic|transport|trucking|dealership|warehous|wholesale|engineering)/i.test(catQ || '');
  if (rc >= 80 || (heavy && rc >= 25)) return 'Small (11-50)';
  if (rc >= 5 || heavy) return 'Micro (1-10)';
  return 'Unknown';
}

async function serperPlaces(q) {
  stats.searches++;
  const res = await fetch('https://google.serper.dev/places', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'za', hl: 'en' }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text().catch(() => '')}`);
  const j = await res.json();
  return j.places || [];
}

const BAD_EMAIL = /(sentry|example\.com|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|wixpress|godaddy|placeholder|your-?email|@2x|domain\.com|email\.com|sentry\.io|wordpress|@sentry)/i;
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

async function fetchText(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadVelocityBot/1.0)' },
    });
    if (!r.ok) return '';
    const ct = r.headers.get('content-type') || '';
    if (ct && !/text|html|xml|json/i.test(ct)) return '';
    return await r.text();
  } catch { return ''; } finally { clearTimeout(t); }
}

// Enrich: homepage + /contact + /contact-us + /about. Domain-match guard applied.
async function enrich(website) {
  stats.enrichAttempts++;
  const base = website.startsWith('http') ? website : 'https://' + website;
  let origin = base;
  try { origin = new URL(base).origin; } catch {}
  const siteReg = registrable(hostOf(website));
  const urls = [base, origin + '/contact', origin + '/contact-us', origin + '/about', origin + '/about-us'];
  const emails = new Set();
  let extraPhone = '';
  for (const u of urls) {
    const html = await fetchText(u);
    if (!html) continue;
    for (const e of extractEmails(html)) emails.add(e);
    if (!extraPhone) {
      const pm = html.match(/(?:\+27|0)\s*\d{2}[\s-]*\d{3}[\s-]*\d{4}/);
      if (pm) extraPhone = pm[0];
    }
    // keep scanning a couple of pages even after first email, to prefer domain-match
    if (emails.size >= 3) break;
  }
  // pick best email: prefer exact registrable-domain match, then freemail seen on site
  let chosen = '', matched = false;
  const list = [...emails];
  const domMatch = list.find(e => registrable(emailDomain(e)) === siteReg && siteReg);
  if (domMatch) { chosen = domMatch; matched = true; }
  else {
    const free = list.find(e => FREEMAIL.has(emailDomain(e)));
    if (free) { chosen = free; matched = false; } // plausible free-mail on own site
  }
  // reject a mismatched corporate email (e.g. transport co returning info@juiceito.com)
  return { email: chosen, matchedDomain: matched, extraPhone };
}

// simple concurrency pool
async function pool(items, n, worker) {
  let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// ---------- pipeline ----------
async function main() {
  console.log('Keys: SERPER=%s', mask(SERPER_API_KEY));
  console.log(`Areas: ${AREAS.length}  Categories: ${CATEGORIES.length}  Planned searches: ${AREAS.length * CATEGORIES.length}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byKey = new Map();     // global dedupe: name|phone|domain
  // TOP-UP: seed dedupe set from a prior run so we never re-add its businesses
  let seeded = [];
  const activeCats = SEED_JSON ? EXTRA_CATEGORIES : CATEGORIES;
  if (SEED_JSON) {
    try {
      seeded = JSON.parse(fs.readFileSync(path.resolve(ROOT, SEED_JSON), 'utf8'));
      for (const l of seeded) {
        const domain = registrable(hostOf(l.website || ''));
        const key = [(l.business_name || '').toLowerCase().replace(/\s+/g, ' '), normPhone(l.phone || l.raw_phone), domain].join('|');
        byKey.set(key, true);
        if (domain) byKey.set('DOM:' + domain, true);
      }
      console.log(`Seeded ${seeded.length} existing businesses from ${SEED_JSON}; using EXTRA_CATEGORIES.`);
    } catch (e) { console.error('SEED load failed:', e.message); }
  }
  // 1. DISCOVERY — loop categories x areas
  let newLeads = 0;                         // real leads added THIS run (excludes seeds/DOM markers)
  const remaining = () => TARGET - seeded.length - newLeads;
  outer:
  for (const area of AREAS) {
    for (const cat of activeCats) {
      if (remaining() <= 0 || stats.searches >= MAX_SEARCHES) break outer;
      let places = [];
      try { places = await serperPlaces(`${cat.q} in ${area.q}`); }
      catch (e) { stats.serperErrors++; console.error(`  ! ${cat.q} @ ${area.q}: ${e.message}`); continue; }
      const keep = cat.w >= 3 ? PER_CAT_KEEP.hi : PER_CAT_KEEP.lo;
      let added = 0;
      for (const p of places) {
        if (added >= keep) break;
        const name = (p.title || '').trim();
        if (!name) continue;
        const domain = registrable(hostOf(p.website || ''));
        const phone = normPhone(p.phoneNumber);
        const key = [name.toLowerCase().replace(/\s+/g, ' '), phone, domain].join('|');
        if (byKey.has(key)) continue;
        // also dedupe purely by domain when present (same company across suburbs)
        if (domain && [...byKey.values()].length && byKey.has('DOM:' + domain)) continue;
        byKey.set(key, {
          business_name: name,
          category: p.category || cat.q,
          search_category: cat.q,
          cat_weight: cat.w,
          address: p.address || '',
          region: area.region,
          area_q: area.q,
          phone,
          raw_phone: p.phoneNumber || '',
          website: p.website || '',
          email: '',
          matchedDomain: false,
          rating: p.rating ?? null,
          ratingCount: p.ratingCount ?? null,
          cid: p.cid || '',
        });
        if (domain) byKey.set('DOM:' + domain, true);
        added++; newLeads++;
        if (remaining() <= 0) break;
      }
      if (stats.searches % 20 === 0 || added > 0)
        console.log(`  [${stats.searches}] "${cat.q}" @ ${area.q} -> ${places.length} places, +${added} (total ${[...byKey.values()].filter(v => v !== true).length})`);
    }
  }
  let leads = [...byKey.values()].filter(v => v !== true);
  stats.discovered = leads.length;
  console.log(`\nDiscovered ${leads.length} unique businesses in ${stats.searches} searches.`);

  // 2. ENRICHMENT (concurrent)
  const withSite = leads.filter(l => l.website);
  console.log(`Enriching ${withSite.length} businesses with websites (concurrency ${ENRICH_CONCURRENCY})...`);
  let done = 0;
  await pool(withSite, ENRICH_CONCURRENCY, async (l) => {
    try {
      const { email, matchedDomain, extraPhone } = await enrich(l.website);
      if (email) { l.email = email; l.matchedDomain = matchedDomain; }
      if (!l.phone && extraPhone) l.phone = normPhone(extraPhone);
    } catch {}
    if (++done % 100 === 0) console.log(`   ...enriched ${done}/${withSite.length}`);
  });

  // 3+4. QUALIFY + VALIDATE + drop low-value junk
  const kept = [];
  for (const l of leads) {
    l.employee_band = inferBand(l.search_category, l.ratingCount);
    if (l.email && !validEmail(l.email)) { l.email = ''; l.matchedDomain = false; }
    // drop pure restaurants / small retail with NO phone AND NO email
    if (LOW_VALUE.test(l.category) && !l.phone && !l.email) { stats.droppedLowValue++; continue; }
    // confidence / vibe 0-99
    let v = 15;
    if (l.phone) v += 25;
    if (l.website) v += 15;
    if (l.email) v += (l.matchedDomain ? 30 : 18);
    if ((Number(l.ratingCount) || 0) >= 10) v += 8;
    if (l.cat_weight >= 3) v += 4;
    l.vibe = Math.min(99, v);
    l.db_source = 'Search Lead';
    l.notes = `[Batch: ${BATCH_MARKER} | ${l.region}] ${l.search_category}; ${l.category}` +
      `; via Serper Places @ ${l.area_q}` +
      (l.website ? `; site ${hostOf(l.website)}` : '') +
      (l.rating != null ? `; rating ${l.rating} (${l.ratingCount || 0})` : '') +
      `; band ${l.employee_band}` +
      `; email ${l.email ? (l.matchedDomain ? 'domain-matched' : 'freemail-on-site') : 'none'}`;
    if (l.phone) stats.withPhone++;
    if (l.website) stats.withWebsite++;
    if (l.email) stats.withEmail++;
    if (l.matchedDomain) stats.matchedDomainEmail++;
    kept.push(l);
  }
  leads = kept;
  stats.afterDedupe = leads.length;

  // 5. OUTPUT
  const jsonPath = path.join(OUT_DIR, SEED_JSON ? 'ct-commercial-2026-09-18-topup.json' : 'ct-commercial-2026-09-18.json');
  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2));
  const cols = ['business_name', 'category', 'address', 'region', 'phone', 'website', 'email', 'matchedDomain', 'employee_band', 'rating', 'vibe'];
  const csvEsc = (s) => { const t = s == null ? '' : String(s); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = [cols.join(',')].concat(leads.map(l => cols.map(c => csvEsc(l[c])).join(','))).join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'ct-commercial-2026-09-18.csv'), csv);

  console.log('\n===== STATS =====');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nSerper credits used: ${stats.searches}`);
  console.log(`Wrote ${jsonPath}`);
  const byRegion = {};
  for (const l of leads) byRegion[l.region] = (byRegion[l.region] || 0) + 1;
  console.log('Per-region:', JSON.stringify(byRegion));
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
