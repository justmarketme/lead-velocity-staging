// Shared helpers: locate Playwright + Chromium, render HTML/SVG to PNG, read PNG size.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const T = JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8'));
export const fileUrl = p => pathToFileURL(path.isAbsolute(p) ? p : path.join(root, p)).href;

export async function launch() {
  let pw;
  try { pw = (await import('playwright')).default ?? (await import('playwright')); }
  catch { pw = createRequire('/opt/node-tools/node_modules/')('playwright'); }
  const chromium = pw.chromium;
  let executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    const base = '/opt/pw-browsers';
    if (fs.existsSync(base)) {
      const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort();
      for (const d of dirs.reverse()) { const c = path.join(base, d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) { executablePath = c; break; } }
    }
  }
  return chromium.launch({ executablePath, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
}

// Render an HTML page (file URL + optional JSON data) to PNG at an exact CSS size. scale = deviceScaleFactor.
export async function shot(browser, { url, data, w, h, out, transparent = false, scale = 1 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const u = data ? `${url}${url.includes('?') ? '&' : '?'}d=${encodeURIComponent(JSON.stringify(data))}` : url;
  await page.goto(u, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await ctx.close();
}

// SVG file -> PNG of exact w x h on a transparent (or given) background.
export async function svgToPng(browser, svgPath, w, h, out, { bg = null, scale = 1, pad = 0 } = {}) {
  const html = `<!doctype html><meta charset=utf8><body style="margin:0;background:${bg || 'transparent'};width:${w}px;height:${h}px;display:grid;place-items:center"><img src="${fileUrl(svgPath)}" style="width:${w - 2 * pad}px;height:${h - 2 * pad}px;object-fit:contain">`;
  const ctx = await browser.newContext({ viewport: { width: Math.max(w, 300), height: Math.max(h, 300) }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const tmp = path.join(os.tmpdir(), `smc-${process.pid}-${Math.random().toString(36).slice(2)}.html`); fs.writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  await ctx.close(); fs.rmSync(tmp, { force: true });
}

export function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}
export const rgbOf = k => `rgb(${T.color[k].rgb.join(',')})`;
