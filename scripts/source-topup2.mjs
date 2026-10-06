import fs from 'fs';

// --- load SERPER key from .env ---
const env = fs.readFileSync('.env', 'utf8');
const SERPER = (env.match(/^SERPER_API_KEY="?([^"\n]+)"?/m) || [])[1];
if (!SERPER) { console.error('FATAL no SERPER_API_KEY'); process.exit(1); }

const CATS = [
  'bakeries', 'printing companies', 'fuel stations', 'gyms and fitness centres', 'hair and beauty salons',
  'laundry and dry cleaning', 'car wash', 'plant nurseries', 'furniture stores', 'opticians', 'dental practices',
  'veterinary clinics', 'real estate agencies', 'insurance brokers', 'travel agencies', 'event venues',
  'funeral parlours', 'driving schools', 'tyre fitment centres', 'glass and aluminium', 'roofing contractors',
  'painting contractors', 'landscaping companies', 'security and alarm companies', 'butcheries', 'liquor stores',
  'pharmacies', 'guest houses', 'catering companies', 'signage companies', 'IT and computer companies',
  'welding and steel works', 'refrigeration and air conditioning', 'pest control', 'cleaning services',
];
const AREAS = [
  'Somerset West', 'Somerset West', 'Wellington', 'Wellington', 'Paarl', 'Paarl', 'Stellenbosch', 'Stellenbosch',
  'Strand, Cape Town', 'Gordons Bay, Cape Town', 'Kuils River, Cape Town', 'Brackenfell, Cape Town',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const regionOf = a => a.replace(/, Cape Town/, '').match(/Strand|Gordons Bay|Kuils River|Brackenfell/) ? 'Northern Suburbs' : a;

async function places(q) {
  try {
    const r = await fetch('https://google.serper.dev/places', {
      method: 'POST', headers: { 'X-API-KEY': SERPER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'za', hl: 'en' }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return j.places || [];
  } catch { return []; }
}

function regDomain(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
async function findEmail(site) {
  if (!site) return { email: '', matched: false };
  const dom = regDomain(site);
  const urls = [site, site.replace(/\/$/, '') + '/contact', site.replace(/\/$/, '') + '/contact-us'];
  for (const u of urls) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      const emails = [...html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase())
        .filter(e => !/\.(png|jpg|jpeg|gif|webp|svg)$/.test(e) && !/sentry|example\.com|wixpress|@2x/.test(e));
      if (!emails.length) continue;
      const match = emails.find(e => dom && e.split('@')[1] === dom);
      if (match) return { email: match, matched: true };
      const free = emails.find(e => /gmail|outlook|yahoo|webmail|mweb|telkomsa|icloud/.test(e.split('@')[1]));
      if (free) return { email: free, matched: false };
    } catch { /* ignore */ }
  }
  return { email: '', matched: false };
}

const seen = new Set();
const out = [];
const log = m => { fs.appendFileSync('scripts/out/run-topup2.log', m + '\n'); process.stdout.write(m + '\n'); };
let credits = 0;

(async () => {
  fs.writeFileSync('scripts/out/run-topup2.log', `topup2 start ${new Date().toISOString()}\n`);
  outer:
  for (const area of AREAS) {
    for (const cat of CATS) {
      const ps = await places(`${cat} in ${area}`); credits++;
      let added = 0;
      for (const p of ps) {
        const name = (p.title || '').trim(); if (!name) continue;
        const phone = (p.phoneNumber || '').replace(/\s+/g, '');
        const k = name.toLowerCase() + '|' + phone.replace(/\D/g, '').slice(-9);
        if (seen.has(k)) continue; seen.add(k);
        out.push({ business_name: name, category: p.category || cat, search_category: cat, region: regionOf(area),
          address: p.address || '', phone: p.phoneNumber || '', website: p.website || '', rating: p.rating ?? '',
          ratingCount: p.ratingCount ?? 0, employee_band: (p.ratingCount > 60 ? 'Small (11-50)' : 'Micro (1-10)') });
        added++;
      }
      log(`[${credits}] ${cat} @ ${area} -> ${ps.length} places, +${added} (total ${out.length})`);
      await sleep(200);
      if (out.length >= 500) break outer;
    }
  }
  // enrich emails (domain-guarded)
  const withSite = out.filter(x => x.website);
  log(`enriching ${withSite.length} sites...`);
  let done = 0;
  for (const x of withSite) {
    const e = await findEmail(x.website);
    x.email = e.email; x.matchedDomain = e.matched;
    if (++done % 50 === 0) log(`  enriched ${done}/${withSite.length}`);
  }
  fs.writeFileSync('scripts/out/topup2.json', JSON.stringify(out, null, 2));
  const contactable = out.filter(x => (x.phone || '').trim() || (x.email || '').trim());
  log(`DONE. raw ${out.length}, contactable ${contactable.length}, Serper credits used ${credits}`);
})();
