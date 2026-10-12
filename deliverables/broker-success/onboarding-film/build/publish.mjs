// Upload the web film + poster to the public `marketing-media` bucket (Lead Velocity Supabase), then check they play.
//   node publish.mjs [--env path/to/.env]
// Reads SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from the environment, or from --env.
// The key is only sent in request headers; it is never printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUCKET = 'marketing-media', PREFIX = 'broker-onboarding';
const FILES = [
  ['what-happens-next-720p.mp4', 'video/mp4'],
  ['poster.jpg', 'image/jpeg'],
];

const args = process.argv.slice(2), envAt = args.indexOf('--env');
if (envAt >= 0) {
  for (const line of fs.readFileSync(args[envAt + 1], 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*?)"?\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const URL_ = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or --env file).'); process.exit(1); }

const ok = (c, msg) => { if (!c) throw new Error(msg); };
for (const [name, type] of FILES) {
  const body = fs.readFileSync(path.join(ROOT, name));
  const obj = `${PREFIX}/${name}`;
  const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${obj}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' },
    body,
  });
  ok(up.ok, `upload ${obj}: HTTP ${up.status} ${await up.text()}`);
  const pub = `${URL_}/storage/v1/object/public/${BUCKET}/${obj}`;
  const head = await fetch(pub, { method: 'HEAD' });
  ok(head.status === 200, `${obj}: GET status ${head.status}`);
  ok(head.headers.get('content-type') === type, `${obj}: content-type ${head.headers.get('content-type')}`);
  ok(Number(head.headers.get('content-length')) === body.length, `${obj}: size ${head.headers.get('content-length')} != ${body.length}`);
  let range = '';
  if (type === 'video/mp4') {
    const r = await fetch(pub, { headers: { Range: 'bytes=0-1023' } });
    ok(r.status === 206, `${obj}: range request status ${r.status}`);
    range = `, range 206 ${r.headers.get('content-range')}`;
    await r.arrayBuffer();
  }
  console.log(`${pub}\n  200 ${type}, ${body.length} bytes${range}`);
}
