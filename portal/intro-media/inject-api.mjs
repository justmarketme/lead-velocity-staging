#!/usr/bin/env node
// I-32a: bake the n8n API base into the five static pages (static hosting cannot proxy /intro/*; deliverables/devops-security/static-hosting.md).
//   VITE_N8N_WEBHOOK_BASE=https://<tunnel-or-api>/webhook [VITE_SUPABASE_PROJECT_ID=<ref>] node portal/intro-media/inject-api.mjs [outDir]
// Sets <html data-api="<base>/intro"> and, if given, data-sb-key="sb-<ref>-auth-token". Idempotent. Names only; no secret is involved.
// Without outDir the files in this folder are rewritten in place (build step, do not commit the baked tunnel URL).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inject(html, base, ref) {
  const clean = String(base || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s"'<>]+$/.test(clean)) throw new Error('VITE_N8N_WEBHOOK_BASE must be an https URL');
  let out = html.replace(/(<html\b[^>]*?)\sdata-api="[^"]*"/, `$1 data-api="${clean}/intro"`);
  out = out.replace(/\sdata-sb-key="[^"]*"/, '');
  if (ref) {
    if (!/^[a-z0-9]{8,32}$/.test(ref)) throw new Error('VITE_SUPABASE_PROJECT_ID looks wrong');
    out = out.replace(/(<html\b[^>]*?)\sdata-api=/, `$1 data-sb-key="sb-${ref}-auth-token" data-api=`);
  }
  return out;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dest = process.argv[2] ? process.argv[2] : here;
  if (process.argv[2]) mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(here)) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    if (f.endsWith('.html')) writeFileSync(join(dest, f), inject(readFileSync(join(here, f), 'utf8'), process.env.VITE_N8N_WEBHOOK_BASE, process.env.VITE_SUPABASE_PROJECT_ID));
    else if (dest !== here) copyFileSync(join(here, f), join(dest, f));
  }
}
