#!/usr/bin/env node
/* WCAG 2.1 A + AA automated pass (axe-core) for the built landing pages and the holding-site privacy page.
   Run:  node landing/build.mjs && node landing/tests/a11y.mjs
         node landing/tests/a11y.mjs --portal dist /broker/calendar /broker/billing ...   (report-only scan of a built SPA)
   Uses the global `playwright` library + the preinstalled Chromium (/opt/pw-browsers), axe-core from node_modules.
   Landing mode: exit 1 on any serious/critical violation; moderate/minor are listed. Portal mode: lists everything, exit 0
   (React pages are owned by platform-architect / broker-success; findings go to landing/tests/a11y.md).
   Offline: every request that is not to the local server is answered by a mock (/lead, /slots, /book) or aborted. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [repo] }), 'utf8');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serve(root, { spa = false } = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let f = path.join(root, p);
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      if (spa && !path.extname(p)) f = path.join(root, 'index.html');
      else { res.writeHead(404); res.end('nf'); return; }
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const slots = [];
for (let d = 0; d < 5; d++) for (const t of ['09:30', '11:00', '14:00']) slots.push({ start: `2026-10-${String(5 + d).padStart(2, '0')}T${t}:00+02:00` });

async function newPage(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.addInitScript('window.SMC_PIXEL_ID="TEST";window.fbq=function(){};');
  await page.route('**/*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (req.url().startsWith(base)) return route.continue();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST' } });
    if (u.pathname.endsWith('/lead')) return json({ ok: true, lead_id: 'ld_a11y', lead_token: 'lt.a11y', methods_supported: ['teams', 'phone', 'whatsapp'] });
    if (u.pathname.endsWith('/slots')) return json({ slots, tz: 'Africa/Johannesburg' });
    return route.abort();
  });
  return { ctx, page };
}

async function axe(page) {
  await page.addScriptTag({ content: AXE_SRC });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: [...tags, 'best-practice'] }, resultTypes: ['violations', 'incomplete'] });
    const wcag = (v) => v.tags.some((t) => tags.includes(t));
    const map = (kind) => (v) => ({ kind, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || ((n.any[0] || n.all[0] || n.none[0] || {}).message) || '').split('\n').filter((l) => !/^Fix (any|all)/.test(l)).slice(0, 2).join(' ').trim() })) });
    return [...r.violations.filter(wcag).map(map('wcag')), ...r.violations.filter((v) => !wcag(v)).map(map('best-practice')), ...r.incomplete.filter(wcag).map(map('needs-review'))];
  }, TAGS);
}

const tap = (page, name, value) => page.locator(`input[name="${name}"][value="${value}"]`).click();
async function toDetails(page) {
  await tap(page, 'age_band', '35_44'); await page.locator('.q.on[data-step="2"]').waitFor();
  await tap(page, 'bond', 'yes'); await page.locator('.q.on[data-step="3"]').waitFor();
  await tap(page, 'dependants', 'kids'); await page.locator('.q.on[data-step="4"]').waitFor();
  await tap(page, 'work_cover', 'yes'); await page.locator('.q.on[data-step="5"]').waitFor();
  await tap(page, 'budget_band', '1250plus'); await page.locator('.q.on[data-step="6"]').waitFor();
}

const results = [];
function record(label, violations) { results.push({ label, violations }); }

function report({ blocking }) {
  let serious = 0, moderate = 0, minor = 0, bp = 0, review = 0;
  const showReview = process.argv.includes('--review');
  for (const { label, violations } of results) {
    const lines = [];
    for (const v of violations) {
      if (v.kind === 'wcag') { if (BLOCKING.has(v.impact)) serious += v.nodes.length; else if (v.impact === 'moderate') moderate += v.nodes.length; else minor += v.nodes.length; }
      else if (v.kind === 'best-practice') bp += v.nodes.length; else { review += v.nodes.length; if (!showReview) continue; }
      lines.push(`    [${v.kind === 'wcag' ? v.impact : v.kind + '/' + v.impact}] ${v.id} (${v.nodes.length}): ${v.help}\n` + v.nodes.slice(0, 4).map((n) => `        ${n.target}${n.summary ? ' :: ' + n.summary : ''}`).join('\n'));
    }
    const bad = violations.some((v) => v.kind !== 'needs-review');
    console.log(`${bad ? 'x' : 'ok'} ${label}${lines.length ? '\n' + lines.join('\n') : ''}`);
  }
  console.log(`\naxe ${TAGS.join(',')}: ${results.length} page states | WCAG serious/critical nodes ${serious} | moderate ${moderate} | minor ${minor} | best-practice ${bp} | needs-review (axe 'incomplete', --review to list) ${review}`);
  if (blocking) { console.log(serious ? 'FAIL' : 'PASS'); process.exitCode = serious ? 1 : 0; }
}

async function landing(browser) {
  const dist = path.join(repo, 'landing/dist');
  if (!fs.existsSync(dist)) { console.error('landing/dist missing: run node landing/build.mjs first'); process.exit(1); }
  const skip = new Set(['assets', 'fonts', 'shared']);
  const slugs = fs.readdirSync(dist).filter((d) => !skip.has(d) && fs.existsSync(path.join(dist, d, 'index.html'))).sort();
  const { server, base } = await serve(dist);
  try {
    for (const slug of slugs) {
      const { ctx, page } = await newPage(browser, base);
      await page.goto(`${base}/${slug}/`);
      record(`${slug} / quiz start`, await axe(page));
      await page.reload();
      await toDetails(page);
      record(`${slug} / details (step 6)`, await axe(page));
      await page.fill('#name', 'Thabo'); await page.fill('#phone', '082 123 4567'); await page.check('#consent');
      await page.click('#send'); await page.locator('.q.on[data-step="7"]').waitFor();
      await page.locator('#slots button, #slots input, .slot').first().waitFor({ timeout: 5000 }).catch(() => {});
      record(`${slug} / booking (step 7)`, await axe(page));
      await page.goto(`${base}/${slug}/`);
      await tap(page, 'age_band', 'lt35'); await page.locator('.q.on[data-step="2"]').waitFor();
      await tap(page, 'bond', 'no'); await page.locator('.q.on[data-step="3"]').waitFor();
      await tap(page, 'dependants', 'none'); await page.locator('.q.on[data-step="4"]').waitFor();
      await tap(page, 'work_cover', 'no'); await page.locator('.q.on[data-step="5"]').waitFor();
      await tap(page, 'budget_band', 'lt750'); await page.locator('.q.on[data-step="9"]').waitFor();
      record(`${slug} / not-a-fit (step 9)`, await axe(page));
      if (fs.existsSync(path.join(dist, slug, 'thanks/index.html'))) { await page.goto(`${base}/${slug}/thanks/`); record(`${slug} / thanks`, await axe(page)); }
      await ctx.close();
    }
  } finally { server.close(); }
  const holding = await serve(path.join(repo, 'landing/holding'));
  try {
    const { ctx, page } = await newPage(browser, holding.base);
    await page.goto(`${holding.base}/privacy.html`);
    record('holding / privacy.html', await axe(page));
    await ctx.close();
  } finally { holding.server.close(); }
  report({ blocking: true });
}

/* Portal mode signs in a synthetic broker/admin against a mocked Supabase (build with VITE_SUPABASE_URL=https://a11y-mock.supabase.co
   and any dummy publishable key): no live project is contacted; every other external request is aborted. */
const MOCK_SB = 'a11y-mock.supabase.co';
const UID = '00000000-0000-4000-8000-0000000a11e1';
const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'a11y.broker@example.test', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'A11y Broker' }, created_at: '2026-09-01T00:00:00Z' };
const BROKER = { id: 'brk_a11y', user_id: UID, brand_id: 'sortmycover', status: 'live', practice_name: 'Example Practice', fsp_number: '00000', adviser_name: 'A11y Broker', adviser_whatsapp: '+27820000000', email: 'a11y.broker@example.test', calendar_provider: 'outlook', methods_supported: ['teams', 'phone'], meeting_hours: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'] }, slot_minutes: 30, buffer_minutes: 15, min_notice_hours: 2, horizon_days: 14, max_meetings_per_day: 3, max_meetings_per_week: 12, bookings_paused: false, active: true, consent_mode: 'named' };
async function mockSupabase(page) {
  const session = { access_token: 'a11y.mock.token', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, refresh_token: 'a11y-refresh', user: USER };
  await page.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [`sb-${MOCK_SB.split('.')[0]}-auth-token`, JSON.stringify(session)]);
  await page.route(`https://${MOCK_SB}/**`, (route) => {
    const req = route.request(); const u = new URL(req.url());
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-range': '0-0/0' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.startsWith('/auth/v1/user')) return json(USER);
    if (u.pathname.startsWith('/auth/v1/token')) return json(session);
    if (u.pathname.startsWith('/rest/v1/rpc/has_role')) return json(true);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/rest/v1/brokers')) return json(one ? BROKER : [BROKER]);
    if (u.pathname.startsWith('/rest/v1/')) return one ? json({ code: 'PGRST116', message: 'no rows' }, 406) : json([]);
    return json({});
  });
}

async function portal(browser, dir, routes) {
  const { server, base } = await serve(path.resolve(dir), { spa: true });
  try {
    for (const r of routes) {
      const { ctx, page } = await newPage(browser, base);
      await mockSupabase(page);
      await page.goto(base + r, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const finalPath = new URL(page.url()).pathname;
      const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
      console.log(`-- ${r}: rendered ${finalPath}, ${text.length} chars: "${text.slice(0, 90)}"`);
      record(`${r}${finalPath !== r ? ` (rendered ${finalPath})` : ''}`, await axe(page));
      await ctx.close();
    }
  } finally { server.close(); }
  report({ blocking: false });
}

const argv = process.argv.slice(2);
const browser = await pw.chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-sandbox'] });
try {
  if (argv[0] === '--portal') await portal(browser, argv[1] || 'dist', argv.slice(2).length ? argv.slice(2) : ['/']);
  else await landing(browser);
} finally { await browser.close(); }
