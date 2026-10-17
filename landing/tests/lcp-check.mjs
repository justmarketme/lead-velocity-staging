/* Indicative LCP/CLS under emulated 4G (1.6 Mbps down, 150 ms RTT) + 4x CPU slowdown. Not a Lighthouse replacement: run lighthouse.sh for the official number.
   node landing/tests/lcp-check.mjs [slug]   (needs landing/dist built; uses the preinstalled Chromium) */
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist'); const slug = process.argv[2] || 'employer-gap';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p.endsWith('/')) p += 'index.html'; const f = path.join(dist, p); if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' }); r.end(zlib.gzipSync(fs.readFileSync(f))); });
await new Promise((r) => srv.listen(0, r));
const b = await pw.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
const res = [];
for (let i = 0; i < 3; i++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { window.__m = { lcp: 0, cls: 0 }; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/${slug}/`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  res.push(await page.evaluate(() => window.__m)); await ctx.close();
}
await b.close(); srv.close();
console.log(JSON.stringify(res)); const lcp = res.map((r) => r.lcp).sort((a, c) => a - c)[1]; const cls = Math.max(...res.map((r) => r.cls));
console.log(`median LCP ${Math.round(lcp)} ms, max CLS ${cls.toFixed(3)} -> ${lcp < 2500 && cls < 0.1 ? 'PASS' : 'FAIL'} (targets: LCP < 2500 ms, CLS < 0.1)`);
process.exit(lcp < 2500 && cls < 0.1 ? 0 : 1);
