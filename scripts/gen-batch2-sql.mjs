// gen-batch2-sql.mjs — build chunked INSERT SQL for Sanette's batch.
// Belt and braces: even though the sourcing run already excluded everything
// delivered to De Villiers, each INSERT is guarded in SQL so a row is skipped
// if its phone (last 9 digits) or company name already exists in `leads`.
import fs from 'fs';
import path from 'path';

const OUT = 'scripts/out';
const SQL = path.join(OUT, 'sql');
fs.mkdirSync(SQL, { recursive: true });

const BATCH = 'DISCOVERY-OPULENT-SANETTE-2026-09-25';
const src = JSON.parse(fs.readFileSync(path.join(OUT, 'batch2-sanette-2026-09-25.json'), 'utf8'));

const seen = new Set();
const all = [];
let droppedNoPhone = 0, droppedDup = 0;
for (const x of src) {
  const phone = (x.phone || x.raw_phone || '').trim();
  if (!phone) { droppedNoPhone++; continue; }                     // client requires a contactable phone
  const k = String(phone).replace(/\D/g, '').slice(-9);
  if (seen.has(k)) { droppedDup++; continue; }
  seen.add(k);
  all.push(x);
}

const q = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const emailStatus = x => x.email ? (x.matchedDomain ? 'domain-matched' : 'freemail-on-site') : 'none';
function notes(x) {
  const region = x.region || '';
  return [
    `Area: ${region}`,
    `[Batch: ${BATCH} | ${region}]`,
    `${x.search_category || x.category || ''}`,
    x.website ? `site:${x.website}` : 'site:none',
    `rating ${x.rating ?? ''}(${x.ratingCount ?? 0})`,
    `band ${x.employee_band || 'Unknown'}`,
    `email ${emailStatus(x)}`,
  ].join(' | ');
}
function tuple(x) {
  const vibe = Number.isFinite(+x.vibe) ? Math.max(0, Math.min(99, Math.round(+x.vibe))) : 50;
  return `(${q(x.email || '')}, ${q(x.phone || x.raw_phone || '')}, ${q(notes(x))}, ${q(x.business_name)}, ${q(x.category || '')}, ${q(x.address || '')}, ${vibe})`;
}

const SIZE = 120;
let n = 0;
const files = [];
for (let i = 0; i < all.length; i += SIZE) {
  const chunk = all.slice(i, i + SIZE);
  const sql =
`insert into leads (email, phone, first_name, last_name, source, current_status, notes, date_uploaded, company, role, address, vibe, broker_id)
select v.email, v.phone, '', '', 'Search Lead', 'New', v.notes, now(), v.company, v.role, v.address, v.vibe::int, NULL
from (values
${chunk.map(tuple).join(',\n')}
) as v(email, phone, notes, company, role, address, vibe)
where not exists (
  select 1 from leads l
  where right(regexp_replace(coalesce(l.phone,''), '[^0-9]', '', 'g'), 9) = right(regexp_replace(v.phone, '[^0-9]', '', 'g'), 9)
     or lower(btrim(coalesce(l.company,''))) = lower(btrim(v.company))
);
`;
  const f = path.join(SQL, `sanette-${String(n).padStart(2, '0')}.sql`);
  fs.writeFileSync(f, sql);
  files.push(f);
  n++;
}

const byRegion = {};
for (const x of all) byRegion[x.region] = (byRegion[x.region] || 0) + 1;
console.log('Batch 2 SQL generated');
console.log('  leads:', all.length, '| dropped no-phone:', droppedNoPhone, '| dropped dup-phone:', droppedDup);
console.log('  with email:', all.filter(x => (x.email || '').trim()).length, '| with website:', all.filter(x => x.website).length);
console.log('  by region:', byRegion);
console.log('  files:', files.length, '->', SQL + '/sanette-NN.sql');
