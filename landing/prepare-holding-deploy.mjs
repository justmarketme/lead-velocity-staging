#!/usr/bin/env node
// Prepares a clean, publishable copy of landing/holding for Vercel (project `sortmycover`, team jonos-projects-8697404e).
//   node landing/prepare-holding-deploy.mjs <deploy-dir>   (files go in <deploy-dir>/landing: the project's Root Directory is `landing`)
//   cd <deploy-dir> && vercel link --yes --project sortmycover --scope jonos-projects-8697404e && vercel deploy --prod --yes --scope jonos-projects-8697404e
// Replaces the Apache .htaccess: HTTPS is automatic on Vercel; www -> apex 301, security headers and cache rules are in vercel.json below.
// Fails closed on unfilled {{placeholders}} and on "Lead Velocity" anywhere except privacy.html and terms.html (decision A, 5 Oct 2026).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'holding');
const deployDir = path.resolve(process.argv[2] || '');
const out = path.join(deployDir, 'landing'); // Vercel project Root Directory = landing; keeps <deploy-dir>/.vercel (the link) intact
if (!process.argv[2]) { console.error('usage: node landing/prepare-holding-deploy.mjs <out-dir>'); process.exit(2); }
const SKIP = new Set(['staging', 'deploy.md', 'README.md', '.htaccess']); // never published
const LEGAL = new Set(['privacy.html', 'terms.html']); // the only pages allowed to name the company (POPIA s18)

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(src)) if (!SKIP.has(name)) fs.cpSync(path.join(src, name), path.join(out, name), { recursive: true });

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null, buildCommand: null, installCommand: null, outputDirectory: '.',
  redirects: [
    // sortmycover.com is not bought yet; this rule is dormant until it is attached to the project
    // `/(.*)` and `$1`, not `/:path*`: the named form does not match "/" or "/learn/" on Vercel
    { source: '/(.*)', has: [{ type: 'host', value: '(www\\.)?sortmycover\\.com' }], destination: 'https://sortmycover.co.za/$1', statusCode: 301 },
    { source: '/(.*)', has: [{ type: 'host', value: 'www.sortmycover.co.za' }], destination: 'https://sortmycover.co.za/$1', statusCode: 301 },
  ],
  headers: [
    { source: '/(.*)', headers: [
      { key: 'Strict-Transport-Security', value: 'max-age=86400' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: CSP },
    ] },
    { source: '/(.*)\\.html', headers: [{ key: 'Cache-Control', value: 'public, max-age=600' }] },
    { source: '/(.*)\\.(css|js|svg)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
    { source: '/(.*)\\.(png|ico)', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }] },
    { source: '/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }, { key: 'Cache-Control', value: 'public, max-age=86400' }] },
    // keep *.vercel.app URLs (previews, the default project URL) out of search
    { source: '/(.*)', has: [{ type: 'host', value: '.*\\.vercel\\.app' }], headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] },
  ],
};
fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');

const problems = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else check(p); } };
function check(p) {
  const rel = path.relative(out, p).replace(/\\/g, '/');
  if (!/\.(html|xml|txt|js|css|svg|webmanifest|json)$/.test(rel)) return;
  const s = fs.readFileSync(p, 'utf8');
  if (/\{\{[A-Za-z_ ]+\}\}/.test(s)) problems.push(`${rel}: unfilled {{placeholder}}`);
  if (/<form[\s>]/i.test(s)) problems.push(`${rel}: contains a <form> (no live backend yet)`);
  if (!LEGAL.has(rel) && /lead ?velocity|leadvelocity|howzit|637858/i.test(s)) problems.push(`${rel}: names Lead Velocity outside privacy/terms`);
}
walk(out);
if (problems.length) { console.error('PRE-FLIGHT FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`holding site ready in ${out} (${fs.readdirSync(out).length} top-level entries, vercel.json written)`);
