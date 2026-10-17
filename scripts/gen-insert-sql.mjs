import fs from 'fs';
import path from 'path';

const OUT = 'scripts/out';
const SQL = path.join(OUT, 'sql');
fs.mkdirSync(SQL, { recursive: true });

const main = JSON.parse(fs.readFileSync(path.join(OUT, 'ct-commercial-2026-09-18.json'), 'utf8'));
let topup = [];
try { topup = JSON.parse(fs.readFileSync(path.join(OUT, 'ct-commercial-2026-09-18-topup.json'), 'utf8')); } catch {}

// merge, global dedupe by lower(business_name)+phone domain-ish
const seen = new Set();
const key = x => (String(x.business_name || '').toLowerCase().trim()) + '|' + String(x.phone || x.raw_phone || '').replace(/\D/g, '').slice(-9);
const all = [];
let droppedNoContact = 0;
for (const x of [...main, ...topup]) {
  const phone = (x.phone || x.raw_phone || '').trim();
  const email = (x.email || '').trim();
  if (!phone && !email) { droppedNoContact++; continue; } // must be contactable
  const k = key(x);
  if (seen.has(k)) continue;
  seen.add(k);
  all.push(x);
}

const q = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const emailStatus = x => x.email ? (x.matchedDomain ? 'domain-matched' : 'freemail-on-site') : 'none';
function notes(x) {
  const region = x.region || x.area || '';
  const bits = [
    `Area: ${region}`,
    `[Batch: DISCOVERY-OPULENT-2026-09-18 | ${region}]`,
    `${x.search_category || x.category || ''}`,
    x.website ? `site:${x.website}` : 'site:none',
    `rating ${x.rating ?? ''}(${x.ratingCount ?? 0})`,
    `band ${x.employee_band || 'Unknown'}`,
    `email ${emailStatus(x)}`,
  ];
  return bits.join(' | ');
}
function row(x) {
  const email = x.email || '';
  const phone = x.phone || x.raw_phone || '';
  const vibe = Number.isFinite(+x.vibe) ? Math.max(0, Math.min(99, Math.round(+x.vibe))) : 50;
  return `(${q(email)}, ${q(phone)}, '', '', 'Search Lead', 'New', ${q(notes(x))}, now(), ${q(x.business_name)}, ${q(x.category || '')}, ${q(x.address || '')}, ${vibe}, NULL)`;
}

const cols = "(email, phone, first_name, last_name, source, current_status, notes, date_uploaded, company, role, address, vibe, broker_id)";
const SIZE = 150;
let n = 0, files = [];
for (let i = 0; i < all.length; i += SIZE) {
  const chunk = all.slice(i, i + SIZE);
  const sql = `insert into leads ${cols} values\n` + chunk.map(row).join(',\n') + ';\n';
  const f = path.join(SQL, `final-${String(n).padStart(2, '0')}.sql`);
  fs.writeFileSync(f, sql);
  files.push(f);
  n++;
}
const withEmail = all.filter(x => (x.email || '').trim()).length;
const withPhone = all.filter(x => (x.phone || x.raw_phone || '').trim()).length;
console.log(JSON.stringify({ total: all.length, main: main.length, topup: topup.length, droppedNoContact, withPhone, withEmail, files: files.length, size: SIZE }));
