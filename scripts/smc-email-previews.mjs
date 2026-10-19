#!/usr/bin/env node
/* Previews of every SortMyCover client email, rendered by the real templates, next to the live site, in one contact sheet.
     node scripts/smc-email-previews.mjs [outDir]      (default deliverables/email-previews/<today>)
   Writes <outDir>/<name>.html, <name>-desktop.png (1000px wide), <name>-phone.png (the 390px view, on a 500px transparent
   canvas: headless Chrome has a minimum window width) and contact-sheet.png.
   Synthetic client (Thandi), the real adviser card. Nothing is sent. Needs Node 23.6+ (loads the .ts templates) and Chrome or
   Edge (CHROME_PATH to override). Until sites/sortmycover/public/email/ is uploaded, the wordmark is loaded from the repo. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(repo, "deliverables", "email-previews", new Date().toISOString().slice(0, 10)));
fs.mkdirSync(out, { recursive: true });
const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
  .filter(Boolean).find((b) => fs.existsSync(b));
if (!browser) { console.error("no Chrome/Edge found; set CHROME_PATH"); process.exit(1); }

const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const R = await imp("supabase/functions/smc-client-email/render.ts");
const S = await imp("supabase/functions/_shared/smc_email.ts");
const V = await imp("automation/lib/sub-email-verify.mjs");

const NOW = Date.parse("2026-10-19T08:00:00Z");
const BASE = { to: "thandi@example.com", lead_first_name: "Thandi", slot_start: "2026-10-21T08:00:00Z", method: "teams", adviser_name: "Mark Weston",
  practice_name: "Oracle Private Wealth", fsp_number: "28418", join_url: "https://teams.microsoft.com/l/meetup-join/EXAMPLE", booking_id: "bk_preview" };
const client = (kind, calendar_invite) => {
  const v = R.validate({ ...BASE, kind, calendar_invite });
  if (!v.ok) throw new Error(v.errors.join());
  return R.render(v.input, NOW).html;
};
const EMAILS = [
  ["01-confirmed-adviser-invite", "smc-client-email: booking_confirmed, invite from Mark's calendar (go-live)", client("booking_confirmed", "adviser")],
  ["02-confirmed-attached-ics", "smc-client-email: booking_confirmed, .ics attached (dry run)", client("booking_confirmed", "attached")],
  ["03-updated-adviser-invite", "smc-client-email: booking_updated, adviser invite", client("booking_updated", "adviser")],
  ["04-updated-attached-ics", "smc-client-email: booking_updated, .ics attached", client("booking_updated", "attached")],
  ["05-cancelled-adviser-invite", "smc-client-email: booking_cancelled, adviser invite", client("booking_cancelled", "adviser")],
  ["06-cancelled-attached-ics", "smc-client-email: booking_cancelled, .ics attached", client("booking_cancelled", "attached")],
  ["07-verify-email", "email verification (n8n SUB-email-verify)", V.verifyEmailHtml({ firstName: "Thandi", adviser: "Mark", link: "https://sortmycover.co.za/v/ev1.example" })],
  ["08-verify-confirmed-page", "page the verify link opens", V.page("Your email is confirmed", "Thank you. You can close this page.")],
  ["09-crm-booking-confirmation", "CRM book-appointment client email", S.smcBookingConfirmationEmail({ firstName: "Thandi", brokerName: "Mark Weston", whenText: "Wednesday 21 October at 10:00" }).html],
  ["10-crm-message", "CRM message to a SortMyCover client", S.smcCommunicationEmail({ subject: "Before your call with Mark", content: "Hi Thandi,\n\nMark asked me to share what to have with you on Wednesday: your latest payslip and any policy schedules you already have.\n\nSee you then." }).html],
];

const fonts = pathToFileURL(path.join(repo, "sites/sortmycover/public/fonts")).href + "/";
const wordmark = pathToFileURL(path.join(repo, "sites/sortmycover/public/email/wordmark-white.png")).href;
const chrome = (args, opts = {}) => execFileSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts });
function shoot(file, width, png, scale = 1) {
  const measure = file.replace(/\.html$/, `.measure-${width}.html`);
  fs.writeFileSync(measure, fs.readFileSync(file, "utf8").replace("</body>", "<script>addEventListener('load',()=>document.title='H'+Math.ceil(document.body.getBoundingClientRect().bottom))</script></body>"));
  const h = Number(chrome([`--window-size=${width},900`, "--virtual-time-budget=4000", "--dump-dom", pathToFileURL(measure).href]).match(/<title>H(\d+)<\/title>/)?.[1] ?? 1600);
  fs.rmSync(measure);
  chrome([`--window-size=${width},${h}`, `--force-device-scale-factor=${scale}`, "--virtual-time-budget=4000", `--screenshot=${png}`, pathToFileURL(file).href]);
  return h;
}

/* Headless Chrome will not make a window narrower than about 500px, so the phone view is the email in a 390px iframe (its
   max-width media query then sees 390px) on a transparent page; the contact sheet clips the tile to the 390px frame. */
function shootPhone(file, png) {
  const wrap = file.replace(/\.html$/, ".phone.html");
  const frame = (h) => `<!doctype html><html><body style="margin:0;background:transparent"><iframe id="f" src="${path.basename(file)}" width="390" height="${h}" style="display:block;border:0"></iframe>`;
  fs.writeFileSync(wrap, frame(900) + `<script>f.onload=()=>{document.title='H'+Math.ceil(f.contentDocument.body.getBoundingClientRect().bottom)}</script></body></html>`);
  const h = Number(chrome(["--allow-file-access-from-files", "--window-size=500,900", "--virtual-time-budget=4000", "--dump-dom", pathToFileURL(wrap).href]).match(/<title>H(\d+)<\/title>/)?.[1] ?? 1600);
  fs.writeFileSync(wrap, frame(h) + "</body></html>");
  chrome(["--window-size=500," + h, "--default-background-color=00000000", "--virtual-time-budget=4000", `--screenshot=${png}`, pathToFileURL(wrap).href]);
  fs.rmSync(wrap);
  return h;
}

const rows = [];
for (const [name, label, html] of EMAILS) {
  const f = path.join(out, `${name}.html`);
  // until the site upload carries public/email/ and the font CORS header, load both from the repo
  fs.writeFileSync(f, html.split("https://sortmycover.co.za/email/wordmark-white.png").join(wordmark).split("https://sortmycover.co.za/fonts/").join(fonts));
  const dh = shoot(f, 1000, path.join(out, `${name}-desktop.png`));
  const ph = shootPhone(f, path.join(out, `${name}-phone.png`));
  rows.push({ name, label, dh, ph });
  console.log(`${name}  desktop 1000x${dh}  phone 390x${ph}`);
}
// the live site, for comparison: home (desktop, top of the page) and /start/ (phone)
// a normal browser user agent: Hostinger shows headless Chrome a "Checking your browser" page instead of the site
const UA = "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
chrome([UA, "--window-size=1000,900", "--virtual-time-budget=8000", `--screenshot=${path.join(out, "site-home-desktop.png")}`, "https://sortmycover.co.za/"]);
chrome([UA, "--window-size=500,844", "--virtual-time-budget=8000", `--screenshot=${path.join(out, "site-start-phone.png")}`, "https://sortmycover.co.za/start/?ref=w-home"]);

// contact sheet: one page of tiles, screenshotted
const D = 0.6, P = 0.77; // display scale of desktop / phone tiles
const tile = (src, w, h, cap, clipW) => clipW
  ? `<figure><div style="width:${Math.round(clipW)}px;height:${Math.round(h)}px;overflow:hidden;border-radius:10px;box-shadow:0 6px 20px rgba(31,41,51,.18);background:#fff"><img src="${src}" width="${Math.round(w)}" height="${Math.round(h)}" style="box-shadow:none;border-radius:0;background:none"></div><figcaption>${cap}</figcaption></figure>`
  : `<figure><img src="${src}" width="${Math.round(w)}" height="${Math.round(h)}"><figcaption>${cap}</figcaption></figure>`;
const row = (label, tiles) => `<section><h2>${label}</h2><div class="r">${tiles}</div></section>`;
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:32px;background:#E4E5E7;font:500 15px/1.4 'DM Sans',Arial,sans-serif;color:#1F2933}
h1{margin:0 0 6px;font-size:28px}p.s{margin:0 0 24px;color:#5C6672}
section{margin:0 0 28px}h2{margin:0 0 10px;font-size:16px}.r{display:flex;gap:24px;align-items:flex-start}
figure{margin:0}figure img{display:block;border-radius:10px;box-shadow:0 6px 20px rgba(31,41,51,.18);background:#fff}figcaption{margin-top:6px;font-size:12px;color:#5C6672}
</style></head><body><h1>SortMyCover client emails, restyled to the site</h1><p class="s">Rendered from the real templates on release/all-2026-10-18, ${new Date().toISOString().slice(0, 10)}. Desktop 1000px (shown at 60%), phone 390px (shown at 77%). Synthetic client; nothing sent.</p>
${row("The live site (reference)", tile("site-home-desktop.png", 1000 * D, 900 * D, "sortmycover.co.za, desktop") + tile("site-start-phone.png", 500 * P, 844 * P, "/start/, narrow window (500px)"))}
${rows.map((r) => row(r.label, tile(`${r.name}-desktop.png`, 1000 * D, r.dh * D, "desktop") + tile(`${r.name}-phone.png`, 500 * P, r.ph * P, "390px phone", 390 * P))).join("\n")}
</body></html>`;
const sheetFile = path.join(out, "contact-sheet.html");
fs.writeFileSync(sheetFile, sheet);
const sh = shoot(sheetFile, 1040, path.join(out, "contact-sheet.png"));
console.log(`contact-sheet.png  1040x${sh}\n${out}`);
