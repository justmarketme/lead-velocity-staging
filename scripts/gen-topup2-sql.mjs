import fs from 'fs';
import path from 'path';
const OUT = 'scripts/out', SQL = path.join(OUT, 'sql');

// existing loaded businesses (already in DB) = main + topup1
const existing = new Set();
for (const f of ['ct-commercial-2026-09-18.json', 'ct-commercial-2026-09-18-topup.json']) {
  try { JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).forEach(x => existing.add(String(x.business_name || '').toLowerCase().trim())); } catch {}
}
const topup2 = JSON.parse(fs.readFileSync(path.join(OUT, 'topup2.json'), 'utf8'));

const NEED = 191;
const seen = new Set();
const picked = [];
for (const x of topup2) {
  const phone = (x.phone || '').trim();
  if (!phone) continue;                                   // must have phone
  const nm = String(x.business_name || '').toLowerCase().trim();
  if (!nm || existing.has(nm) || seen.has(nm)) continue;  // dedup vs DB + self
  seen.add(nm);
  picked.push(x);
  if (picked.length >= NEED) break;
}

const q = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const emailStatus = x => x.email ? (x.matchedDomain ? 'domain-matched' : 'freemail-on-site') : 'none';
const notes = x => [
  `Area: ${x.region || ''}`, `[Batch: DISCOVERY-OPULENT-2026-09-18 | ${x.region || ''}]`,
  x.search_category || x.category || '', x.website ? `site:${x.website}` : 'site:none',
  `rating ${x.rating ?? ''}(${x.ratingCount ?? 0})`, `band ${x.employee_band || 'Unknown'}`, `email ${emailStatus(x)}`,
].join(' | ');
const vibe = x => { const p = !!(x.phone || '').trim(), e = !!(x.email || '').trim(), w = !!x.website; return 40 + (p ? 25 : 0) + (e ? 20 : 0) + (w ? 10 : 0); };
const row = x => `(${q(x.email || '')}, ${q(x.phone)}, '', '', 'Search Lead', 'New', ${q(notes(x))}, now(), ${q(x.business_name)}, ${q(x.category || '')}, ${q(x.address || '')}, ${Math.min(99, vibe(x))}, NULL)`;
const cols = "(email, phone, first_name, last_name, source, current_status, notes, date_uploaded, company, role, address, vibe, broker_id)";

const SIZE = 150; let n = 0;
for (let i = 0; i < picked.length; i += SIZE) {
  const sql = `insert into leads ${cols} values\n` + picked.slice(i, i + SIZE).map(row).join(',\n') + ';\n';
  fs.writeFileSync(path.join(SQL, `topup2-${String(n).padStart(2, '0')}.sql`), sql);
  n++;
}
console.log(JSON.stringify({ candidates: topup2.length, existing_known: existing.size, picked: picked.length, files: n }));
