// gen-insert.mjs <input.json> <tag> — emit batched INSERT SQL files for the leads table.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out', 'sql');
fs.mkdirSync(OUT, { recursive: true });

const input = process.argv[2];
const tag = process.argv[3] || 'a';
const BATCH = 150;
const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
const q = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

const cols = '(email, phone, first_name, last_name, source, current_status, notes, date_uploaded, company, role, address, vibe, broker_id)';
let files = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const values = chunk.map(l => {
    const email = l.email || '';
    const phone = l.phone || '';
    return `(${q(email)}, ${q(phone)}, '', '', 'Search Lead', 'New', ${q(l.notes)}, now(), ${q(l.business_name)}, '', ${q(l.address)}, ${Number.isFinite(+l.vibe) ? Math.max(0, Math.min(99, Math.round(+l.vibe))) : 0}, NULL)`;
  }).join(',\n');
  const sql = `insert into leads ${cols} values\n${values};`;
  const fp = path.join(OUT, `batch-${tag}-${String(i / BATCH).padStart(2, '0')}.sql`);
  fs.writeFileSync(fp, sql);
  files.push(fp);
}
console.log(`rows=${rows.length} batches=${files.length}`);
files.forEach(f => console.log(f));
