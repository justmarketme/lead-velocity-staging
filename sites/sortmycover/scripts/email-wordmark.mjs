#!/usr/bin/env node
/* Renders the site wordmark "SortMyC(tick)ver" to PNGs for the client emails, from the site's own font files and tick SVG
   (src/components/Brand.tsx, .logo / .tick in src/index.css), so the email logo is the site logo, not a redraw.
     public/email/wordmark-white.png  white letters, for the navy email header (the site header is navy too)
     public/email/wordmark-navy.png   navy letters, for white backgrounds
   Rendered at 4x with headless Chrome or Edge on a transparent background, cropped to the measured wordmark box. Usage: node scripts/email-wordmark.mjs
   Prints each file's display size (CSS px = pixels / 4), which the email templates use as width/height. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(site, "public", "email");
const SCALE = 4, FONT_PX = 24;
const browsers = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) { console.error("no Chrome/Edge found; set CHROME_PATH"); process.exit(1); }
const font = (w) => pathToFileURL(path.join(site, "public", "fonts", `dm-sans-latin-${w}-normal.woff2`)).href;

fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smc-wordmark-"));
for (const [name, color] of [["wordmark-white", "#FFFFFF"], ["wordmark-navy", "#1F2933"]]) {
  // pass 1: measure the wordmark box in CSS px
  const page = (w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"DM Sans";font-weight:800;src:url("${font(800)}") format("woff2")}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
.logo{position:absolute;left:0;top:0;font-family:"DM Sans";font-weight:800;font-size:${FONT_PX}px;line-height:1.2;letter-spacing:-0.01em;color:${color};white-space:nowrap;display:inline-flex;align-items:baseline;padding:2px 1px}
.tick{display:inline-grid;place-items:center;width:.95em;height:.95em;border-radius:50%;background:#F5A623;position:relative;top:.12em;margin:0 1px}
.tick svg{width:62%;height:62%}
</style></head><body><span class="logo" id="l">SortMyC<span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="#2A1B02" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>ver</span>
${w ? "" : `<script>document.fonts.ready.then(()=>{const r=document.getElementById("l").getBoundingClientRect();document.title=Math.ceil(r.width)+"x"+Math.ceil(r.height)})</script>`}</body></html>`;
  const m = path.join(tmp, `${name}-measure.html`);
  fs.writeFileSync(m, page());
  const dom = execFileSync(browser, ["--headless=new", "--disable-gpu", "--virtual-time-budget=3000", "--dump-dom", pathToFileURL(m).href], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const size = dom.match(/<title>(\d+)x(\d+)<\/title>/);
  if (!size) { console.error("could not measure the wordmark"); process.exit(1); }
  const [w, h] = [Number(size[1]), Number(size[2])];
  // pass 2: screenshot exactly that box at 4x on a transparent background
  const s = path.join(tmp, `${name}.html`);
  fs.writeFileSync(s, page(w, h));
  const out = path.join(outDir, `${name}.png`);
  execFileSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--force-device-scale-factor=${SCALE}`, "--default-background-color=00000000",
    `--window-size=${w},${h}`, "--virtual-time-budget=3000", `--screenshot=${out}`, pathToFileURL(s).href], { stdio: "ignore" });
  const png = fs.readFileSync(out);
  const pw = png.readUInt32BE(16), ph = png.readUInt32BE(20);
  console.log(`${path.relative(site, out)}  ${pw}x${ph} px  -> display ${pw / SCALE}x${ph / SCALE}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
