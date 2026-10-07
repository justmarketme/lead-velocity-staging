#!/usr/bin/env node
// Builds the whole sortmycover.co.za site for Vercel (project `sortmycover`, Root Directory `landing`):
//   holding/ (apex: home, about, privacy, learn/, icons)  +  dist/{slug}/ quiz pages from build.mjs
// into landing/site/. Routing, redirects and headers live in landing/vercel.json (the repo-root
// vercel.json belongs to the CRM app and is not read for this project).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'site');
// Server notes and Hostinger-only files never ship.
const SKIP = new Set(['staging', 'deploy.md', 'README.md', '.htaccess']);

execFileSync(process.execPath, [path.join(here, 'build.mjs')], { stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (from, label) => {
  for (const name of fs.readdirSync(from)) {
    if (SKIP.has(name)) continue;
    const dest = path.join(out, name);
    if (fs.existsSync(dest)) throw new Error(`${label}/${name} collides with a file already in site/`);
    fs.cpSync(path.join(from, name), dest, { recursive: true });
  }
};
copy(path.join(here, 'holding'), 'holding');
copy(path.join(here, 'dist'), 'dist');

const left = [];
const scan = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.html') && /\{\{[A-Za-z_]+\}\}|\[[A-Z][A-Z _]{3,}\]/.test(fs.readFileSync(p, 'utf8'))) left.push(path.relative(out, p));
  }
};
scan(out);
console.log(`site/ ready (${fs.readdirSync(out).length} top-level entries)`);
if (left.length) console.warn(`WARNING: unfilled {{PLACEHOLDERS}} in: ${left.join(', ')}`);

// Quiz-page CSP guard (landing/vercel.json): every inline executable <script> must be hash-allowed, and no inline
// <style> blocks or style="" attributes may ship (style-src 'self'). Fails the build instead of shipping CSP violations.
{
  const { createHash } = await import('node:crypto');
  const vj = JSON.parse(fs.readFileSync(path.join(here, 'vercel.json'), 'utf8'));
  const quiz = vj.headers.find((h) => h.source.startsWith('/:slug('));
  const csp = quiz ? quiz.headers.find((x) => x.key === 'Content-Security-Policy').value : '';
  const bad = [];
  for (const slug of fs.readdirSync(path.join(here, 'dist'))) {
    for (const rel of ['index.html', 'thanks/index.html']) {
      const f = path.join(here, 'dist', slug, rel);
      if (!fs.existsSync(f)) continue;
      const html = fs.readFileSync(f, 'utf8');
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)) {
        const h = `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`;
        if (!csp.includes(h)) bad.push(`${slug}/${rel}: inline script ${h} not in CSP`);
      }
      if (/<style[\s>]|\sstyle="/.test(html)) bad.push(`${slug}/${rel}: inline style`);
    }
  }
  if (bad.length) { console.error('CSP guard failed:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('CSP guard: quiz pages clean');
}
