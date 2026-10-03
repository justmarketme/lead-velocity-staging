#!/usr/bin/env node
// credential-copies.mjs (I-47h): for every underlying secret, every n8n credential (name + type) that carries a copy of it,
// derived from the committed workflow JSON (the same scan as check-credentials.mjs), so ROTATION.md never drifts.
//   node automation/vps/credential-copies.mjs            # markdown table (pasted into ROTATION.md between the markers)
//   node automation/vps/credential-copies.mjs --check    # exit 1 if a workflow credential is not classified below
// The credential -> secret mapping below is the only hand-kept part. Names and types only, never a value.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredCredentials } from './check-credentials.mjs';

const PG = 'LV Supabase - n8n_app (least privilege)';
// [secret label, .env variable(s) ("-" = none), [[type, credential name], ...]]
export const SECRETS = [
  ['Meta system-user token', 'META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi)', [
    ['httpHeaderAuth', 'Meta system user token (Bearer)'], ['httpHeaderAuth', 'WhatsApp Cloud API (SortMyCover)'],
    ['whatsAppApi', 'WhatsApp Cloud API (SortMyCover)'], ['httpHeaderAuth', 'WhatsApp Cloud API (system user)'],
    ['httpHeaderAuth', 'WhatsApp Cloud API token (SMC ops)'], ['httpHeaderAuth', 'WhatsApp Graph bearer (system user)']]],
  ['Meta Page token', 'PAGE_ACCESS_TOKEN', [['httpHeaderAuth', 'Meta Page Token']]],
  ['Anthropic API key', 'ANTHROPIC_API_KEY', [
    ['httpHeaderAuth', 'Anthropic API'], ['httpHeaderAuth', 'Anthropic API (SMC)'], ['httpHeaderAuth', 'Anthropic API key (x-api-key)']]],
  ['Twilio API key', 'TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET', [
    ['httpBasicAuth', 'Twilio (SMC voice)'], ['httpBasicAuth', 'Twilio API key (Basic)']]],
  ['Microsoft Entra app (howzit@ and broker connect)', 'MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET', [
    ['microsoftOutlookOAuth2Api', 'Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite)'],
    ['microsoftOutlookOAuth2Api', 'Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send)'],
    ['microsoftOutlookOAuth2Api', 'Microsoft Graph (howzit@)'], ['oAuth2Api', 'Microsoft Graph (howzit mailbox, app-only)'],
    ['oAuth2Api', 'MS Graph app-only - howzit@ Mail.Send'], ['httpCustomAuth', 'Microsoft Graph broker-connect client secret (W20)']]],
  ['Supabase service-role key', 'SUPABASE_SERVICE_ROLE_KEY', [
    ['httpHeaderAuth', 'Supabase Storage (service role)'], ['httpHeaderAuth', 'Supabase service role (W16 magic link)'],
    ['httpHeaderAuth', 'Supabase service role (n8n, W20)']]],
  ['Supabase n8n_app database password', 'SUPABASE_DB_URL (host/db/port); password in the password manager', [['postgres', PG]]],
  ['Supabase Storage S3 key pair', 'SUPABASE_S3_ACCESS_KEY, SUPABASE_S3_SECRET_KEY (+ SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION)', [['s3', 'MinIO intro media']]],
  ['Paystack secret key', 'PAYSTACK_SECRET_KEY', [['httpHeaderAuth', 'Paystack secret key (Authorization: Bearer)']]],
  ['Transcription API key', 'TRANSCRIBE_API_KEY (+ TRANSCRIBE_URL)', [['httpHeaderAuth', 'Transcription API (bearer)']]],
  ['NCC registry key', '- (GATE-NCC)', [['httpHeaderAuth', 'NCC registry API']]],
  ['Hostinger SFTP login', '- (password manager)', [['sftp', 'Hostinger SFTP (static sites)']]],
  ['Console to n8n shared secret', '- (password manager; ops.secret_inventory)', [['httpHeaderAuth', 'Console -> n8n shared secret']]],
  ['W22 uptime monitor token', '- (password manager; ops.secret_inventory)', [['httpHeaderAuth', 'W22 uptime monitor header token']]],
  ['W34 DSR webhook token', '- (password manager; ops.secret_inventory)', [['httpHeaderAuth', 'W34 DSR webhook token']]],
  ['n8n webhook secret (SMC)', '- (password manager; ops.secret_inventory)', [['httpHeaderAuth', 'n8n webhook secret (SMC)']]],
];

/** Rows: { secret, env, type, name, workflows[] }; plus unclassified (workflow credentials not in SECRETS) and stale (mapped but unused). */
export function copies(dir) {
  const req = requiredCredentials(dir);
  const seen = new Set(); const rows = [];
  for (const [secret, env, creds] of SECRETS) {
    for (const [type, name] of creds) {
      const k = `${type}\t${name}`; seen.add(k);
      rows.push({ secret, env, type, name, workflows: req.get(k) || null });
    }
  }
  return { rows, unclassified: [...req.keys()].filter((k) => !seen.has(k)), stale: rows.filter((r) => !r.workflows) };
}

export function renderTable(dir) {
  const { rows } = copies(dir);
  const out = ['| Secret | `.env` | n8n credential name | Type | Used by |', '|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.secret} | ${r.env} | ${r.name} | \`${r.type}\` | ${(r.workflows || ['(unused)']).join(', ')} |`);
  return out.join('\n');
}

function main(argv) {
  const { unclassified, stale } = copies();
  for (const u of unclassified) console.error(`UNCLASSIFIED credential (add it to SECRETS): ${u.replace('\t', ' ')}`);
  for (const s of stale) console.error(`STALE mapping (no workflow uses it): ${s.type} "${s.name}"`);
  if (argv.includes('--check')) return unclassified.length || stale.length ? 1 : 0;
  console.log(renderTable());
  return unclassified.length || stale.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  process.exitCode = main(process.argv.slice(2));
}
