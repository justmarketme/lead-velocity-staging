#!/usr/bin/env node
// Submit the Twilio Content definitions (automation/templates/twilio/content/*.json) and their WhatsApp approval requests.
//
// HUMAN GATE: template submission is Jonathan's. The default is a DRY RUN that prints exactly what would be sent and
// contacts nothing. Only Jonathan runs --submit, after the Flows are published in Meta and the media base is live.
//
//   node automation/templates/twilio/submit-twilio.mjs                     # dry run, everything (core first)
//   node automation/templates/twilio/submit-twilio.mjs --core              # dry run, the 7 core templates + session types
//   node automation/templates/twilio/submit-twilio.mjs --only booking_confirmed
//   node automation/templates/twilio/submit-twilio.mjs --submit [--core|--only KEY]   # really create + request approval
//
// Env (repo .env or the shell): TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET (or TWILIO_AUTH_TOKEN),
// TWILIO_MEDIA_BASE_URL (static https host the intro card / video paths sit under; default https://media.sortmycover.co.za),
// BOOKING_FLOW_ID / RESCHEDULE_FLOW_ID (the published Meta Flow ids; *_v2 and session Flow templates are skipped without them).
//
// Twilio API (docs 2026-10-11): POST https://content.twilio.com/v1/Content (JSON body = the file's `content`), then
// POST https://content.twilio.com/v1/Content/{sid}/ApprovalRequests/whatsapp { name, category } for every definition
// whose _meta.approval is set (session-only types: list-picker / quick-reply buttons need none). Statuses are read back
// with GET .../ApprovalRequests. The run ends by printing the TWILIO_CONTENT_SIDS JSON to paste into the n8n env.
// Idempotent: a key already in TWILIO_CONTENT_SIDS is skipped (no duplicate Content resources); no retry storms.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'content');
const ROOT = join(HERE, '..', '..', '..');

const args = process.argv.slice(2);
const SUBMIT = args.includes('--submit');
const CORE = args.includes('--core');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// .env (KEY=VALUE lines, no expansion) without a dependency; the shell environment wins.
const envFile = process.env.ENV_FILE || join(ROOT, '.env');
const env = { ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; })) : {}), ...process.env };

const MEDIA_BASE = String(env.TWILIO_MEDIA_BASE_URL || env.INTRO_PUBLIC_BASE || 'https://media.sortmycover.co.za').replace(/\/+$/, '');
const PLACE = { __TWILIO_MEDIA_BASE_URL__: MEDIA_BASE, __BOOKING_FLOW_ID__: env.BOOKING_FLOW_ID || '', __RESCHEDULE_FLOW_ID__: env.RESCHEDULE_FLOW_ID || '' };

/** Placeholders -> env values; null when a needed one is unset (the definition is skipped). */
export function resolve(def) {
  const txt = JSON.stringify(def);
  for (const [k, v] of Object.entries(PLACE)) if (txt.includes(k) && !v) return { skip: `${k.replace(/__/g, '')} not set` };
  let out = txt;
  for (const [k, v] of Object.entries(PLACE)) out = out.split(k).join(v);
  return { def: JSON.parse(out) };
}

const defs = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
const session = (d) => d._meta.session_only === true;
let list = defs.filter((d) => !ONLY || d._meta.key === ONLY || d.content.friendly_name === ONLY);
if (CORE) list = list.filter((d) => d._meta.core || session(d));
list.sort((a, b) => Number(!!b._meta.core) - Number(!!a._meta.core) || Number(session(b)) - Number(session(a)) || a._meta.key.localeCompare(b._meta.key));
if (ONLY && !list.length) { console.error(`no definition named ${ONLY}`); process.exit(2); }

let existing = {};
try { existing = JSON.parse(env.TWILIO_CONTENT_SIDS || '{}'); } catch (_) { existing = {}; }
const auth = () => {
  const u = env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID; const p = env.TWILIO_API_KEY_SID ? env.TWILIO_API_KEY_SECRET : env.TWILIO_AUTH_TOKEN;
  if (!u || !p) throw new Error('TWILIO_API_KEY_SID/SECRET (or TWILIO_ACCOUNT_SID/AUTH_TOKEN) not set');
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
};
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.message || j.code || ''}`.trim());
  return j;
}

const sids = { ...existing };
let failed = 0;
console.log(`${SUBMIT ? 'SUBMIT' : 'DRY RUN (nothing is sent)'}: ${list.length} definition(s), media base ${MEDIA_BASE}`);
for (const d0 of list) {
  const r = resolve(d0);
  const key0 = d0._meta.key;
  if (r.skip) { console.log(`SKIP   ${key0}: ${r.skip}`); continue; }
  const d = r.def; const key = d._meta.key;
  if (sids[key]) { console.log(`HAVE   ${key} = ${sids[key]} (already in TWILIO_CONTENT_SIDS)`); continue; }
  const approval = d._meta.approval;
  if (!SUBMIT) {
    console.log(`WOULD  POST /v1/Content ${key} (${Object.keys(d.content.types).join(', ')})${approval ? ` + ApprovalRequests/whatsapp ${approval.name} ${approval.category}` : ' (session only, no approval)'}`);
    if (ONLY) console.log(JSON.stringify(d.content, null, 2));
    continue;
  }
  try {
    const c = await post('https://content.twilio.com/v1/Content', d.content);
    sids[key] = c.sid;
    console.log(`MADE   ${key} = ${c.sid}`);
    if (approval) {
      const a = await post(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests/whatsapp`, approval);
      console.log(`ASKED  ${key}: ${a.status || 'received'}`);
    }
  } catch (e) { failed++; console.error(`FAIL   ${key}: ${e.message}`); }
}
console.log(`\nTWILIO_CONTENT_SIDS=${JSON.stringify(sids)}`);
process.exit(failed ? 1 : 0);
