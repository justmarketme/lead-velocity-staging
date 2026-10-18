#!/usr/bin/env node
/* SortMyCover production smoke test. READ-ONLY: only GET and OPTIONS requests. It never posts, books, sends or creates a lead.
   Run it after every go-live stage:
     node scripts/smoke-smc.mjs [--expect-index index-XXXX.js] [--site https://sortmycover.co.za] [--env path/to/.env]
   Every check prints PASS, FAIL or SKIP with one line of evidence. Exit code 1 on any FAIL.
   "Lead Velocity" may appear only as the registered name "Lead Velocity (Pty) Ltd" (footer, identity and POPIA lines).
   Wording rules are the site's own (sites/sortmycover/src/build/wording.ts plus the client-wording rules in tests/dist.test.ts).
   The Supabase check uses the anon/publishable key only (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY from the environment or
   --env, default <repo>/.env), and refuses to run with a service-role key. Needs Node 23.6+ (imports wording.ts directly). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(repo, "sites", "sortmycover");
const cfg = JSON.parse(fs.readFileSync(path.join(siteDir, "config", "site.json"), "utf8"));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const SITE = (arg("--site") ?? cfg.site_url).replace(/\/+$/, "");
const N8N = cfg.n8n_base.replace(/\/+$/, "");
const API = (N8N + cfg.api_prefix).replace(/\/+$/, "");
const EXPECT_INDEX = arg("--expect-index");
const ORIGIN = cfg.site_url.replace(/\/+$/, "");
const FOREIGN = "https://smoke-test.invalid";

const results = [];
const report = (status, name, evidence) => { results.push(status); console.log(`${status.padEnd(4)}  ${name.padEnd(38)} ${evidence}`); };
const pass = (n, e) => report("PASS", n, e), fail = (n, e) => report("FAIL", n, e), skip = (n, e) => report("SKIP", n, e);
async function get(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000), ...init, method: init.method ?? "GET" });
  return { res, body: init.method === "OPTIONS" ? "" : await res.text() };
}
async function check(name, fn) { try { await fn(); } catch (e) { fail(name, `error: ${e.cause?.code ?? e.message}`); } }

// the site's rules, mirrored from the build (no copy to drift)
const { BANNED } = await import(pathToFileURL(path.join(siteDir, "src", "build", "wording.ts")).href);
const AI = /\bAI[- ]assistant\b|\buses AI\b|\bAI booking\b|\bour AI\b/i;
const LICENSED = /licensed (financial )?advis[eo]rs?/i;
const PRICE = /\bcosts? (you )?nothing\b|\bfree (call|30|of charge)\b|\bno cost\b|\bat no charge\b|\bpays? nothing\b/i;
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<noscript[\s\S]*?<\/noscript>/g, " ").replace(/<head[\s\S]*?<\/head>/, " ")
  .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const outsideFooter = (html) => html.replace(/<footer[\s\S]*?<\/footer>/g, " ");

console.log(`SortMyCover smoke test  site=${SITE}  n8n=${N8N}  ${new Date().toISOString()}\n`);

/* 1. Site */
const PAGES = ["/", "/start/", "/learn/what-is-a-life-cover-gap/", "/learn/how-to-check-an-adviser/", "/learn/questions-to-ask-a-financial-adviser/", "/wills/", "/privacy/"];
const LEGAL = /^\/(privacy|terms|paia)\//;
const html = {};
for (const p of PAGES) await check(`site 200 ${p}`, async () => {
  const { res, body } = await get(SITE + p);
  html[p] = body;
  (res.status === 200 ? pass : fail)(`site 200 ${p}`, `HTTP ${res.status}, ${body.length} bytes`);
});
let liveIndex;
await check("site live index", async () => {
  if (!html["/"]) return skip("site live index", "home did not load");
  liveIndex = html["/"].match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
  if (!liveIndex) return fail("site live index", "no /assets/index-*.js in the home page");
  if (!EXPECT_INDEX) return pass("site live index", `${liveIndex} (no --expect-index given)`);
  (liveIndex === EXPECT_INDEX.replace(/^.*\//, "") ? pass : fail)("site live index", `live ${liveIndex}, expected ${EXPECT_INDEX}`);
});
await check("site home Pick a time -> /start/", async () => {
  const h = html["/"] ?? "";
  const a = [...h.matchAll(/<a\b[^>]*href="([^"]*\/start\/[^"]*)"[^>]*>/g)].map((m) => m[0]);
  const want = a.find((t) => t.includes(`href="${ORIGIN}/start/?ref=w-home"`));
  if (want) pass("site home Pick a time -> /start/", `${a.length} /start/ link(s); ${want.includes("desk-only") ? "desktop-only" : "NOT marked desk-only"}`);
  else fail("site home Pick a time -> /start/", a.length ? `/start/ links found but none is ?ref=w-home: ${a[0].slice(0, 120)}` : "no /start/ link on the home page");
});
await check("site wording (visible copy)", async () => {
  const hits = [];
  for (const [p, h] of Object.entries(html)) {
    if (!h || LEGAL.test(p)) continue;
    const v = visible(h);
    for (const [re, label] of BANNED) { if (label === "best" && p.includes("/learn/glossary")) continue; const m = v.match(re); if (m) hits.push(`${p} "${label}": ...${v.slice(Math.max(0, m.index - 30), m.index + 30)}...`); }
    for (const [re, label] of [[AI, "AI assistant"], [LICENSED, "licensed adviser"], [PRICE, "price wording"]]) { const m = v.match(re); if (m) hits.push(`${p} "${label}": ${m[0]}`); }
    // legal and identity lines use the registered name "Lead Velocity (Pty) Ltd"; the bare brand in marketing copy is the slip
    const lv = visible(outsideFooter(h));
    const m = lv.match(/Lead Velocity(?! \(Pty\) Ltd)/);
    if (m) hits.push(`${p} "Lead Velocity" in marketing copy: ...${lv.slice(Math.max(0, m.index - 40), m.index + 30)}...`);
  }
  const scanned = Object.keys(html).filter((p) => !LEGAL.test(p)).length;
  hits.length ? fail("site wording (visible copy)", `${hits.length} hit(s): ${hits.slice(0, 3).join(" | ")}`) : pass("site wording (visible copy)", `${scanned} pages clean (legal pages skipped as the build test does; "Lead Velocity (Pty) Ltd" legal lines allowed)`);
});
await check("site wording (live JS)", async () => {
  if (!liveIndex) return skip("site wording (live JS)", "no live index");
  const { res, body } = await get(`${SITE}/assets/${liveIndex}`);
  if (res.status !== 200) return fail("site wording (live JS)", `HTTP ${res.status}`);
  const hits = [[AI, "AI assistant"], [LICENSED, "licensed adviser"], [PRICE, "price wording"]].filter(([re]) => re.test(body)).map(([, l]) => l);
  hits.length ? fail("site wording (live JS)", `${liveIndex}: ${hits.join(", ")}`) : pass("site wording (live JS)", `${liveIndex}: no AI-assistant, licensed or price wording`);
});

/* 2. n8n */
await check("n8n healthz", async () => {
  const { res, body } = await get(`${N8N}/healthz`);
  (res.status === 200 ? pass : fail)("n8n healthz", `HTTP ${res.status} ${body.slice(0, 60).replace(/\s+/g, " ")}`);
});

/* 3. CORS on the browser webhooks (preflight only: OPTIONS never runs a workflow) */
for (const [p, method] of [["/slots", "GET"], ["/start", "GET"], ["/lead", "POST"]]) await check(`cors ${p}`, async () => {
  const pre = (origin) => get(API + p, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type,x-lead-token" } });
  const ok = (await pre(ORIGIN)).res.headers.get("access-control-allow-origin");
  const bad = (await pre(FOREIGN)).res.headers.get("access-control-allow-origin");
  const good = ok === ORIGIN, leak = bad === FOREIGN || bad === "*";
  (good && !leak ? pass : fail)(`cors ${p}`, `own origin -> ${ok ?? "(none)"}; foreign origin -> ${bad ?? "(none)"}`);
});

/* 4. Slots (only if the endpoint answers without a lead token) */
await check("slots public GET", async () => {
  const { res, body } = await get(`${API}/slots?days=7`, { headers: { Origin: ORIGIN } });
  let j; try { j = JSON.parse(body); } catch { /* not JSON */ }
  if (res.status === 401 || res.status === 403 || (j && !Array.isArray(j.slots) && /token/i.test(JSON.stringify(j)))) return skip("slots public GET", `needs a lead token (HTTP ${res.status} ${body.slice(0, 80).replace(/\s+/g, " ")})`);
  if (res.status !== 200 || !j) return fail("slots public GET", `HTTP ${res.status}, ${j ? "JSON" : "not JSON"}: ${body.slice(0, 80)}`);
  const slots = Array.isArray(j) ? j : j.slots;
  Array.isArray(slots) ? pass("slots public GET", `${slots.length} slot(s), JSON well-formed`) : fail("slots public GET", `200 JSON without a slots array: ${body.slice(0, 80)}`);
});

/* 5. Supabase, anon key only */
await check("supabase brands.start_page", async () => {
  const env = { ...process.env };
  const envFile = arg("--env") ?? path.join(repo, ".env");
  if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*(VITE_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY))\s*=\s*"?([^"\s]+)"?/); if (m && !env[m[1]]) env[m[1]] = m[2]; }
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return skip("supabase brands.start_page", `no VITE_SUPABASE_URL / publishable key (env or ${envFile})`);
  let role = key.startsWith("sb_publishable_") ? "anon" : key.startsWith("sb_secret_") ? "service_role" : undefined;
  if (!role) try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { role = "unknown"; }
  if (role !== "anon") return skip("supabase brands.start_page", `refused: the key's role is "${role}", only anon is allowed`);
  const { res, body } = await get(`${url}/rest/v1/brands?select=code,start_page&code=eq.SMC`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  let rows; try { rows = JSON.parse(body); } catch { /* not JSON */ }
  if (res.status !== 200 || !Array.isArray(rows)) return skip("supabase brands.start_page", `not readable with anon (HTTP ${res.status} ${body.slice(0, 80)})`);
  if (!rows.length) return skip("supabase brands.start_page", "anon reads 0 rows (RLS hides brands from anon)");
  pass("supabase brands.start_page", `SMC start_page = ${rows[0].start_page} (anon)`);
});

/* 6. Meta webhook verify must not echo the challenge for a wrong token */
await check("meta webhook verify (wrong token)", async () => {
  const challenge = "smoke" + crypto.randomBytes(6).toString("hex");
  const { res, body } = await get(`${N8N}/webhook/meta-leadgen?hub.mode=subscribe&hub.verify_token=wrong-${challenge}&hub.challenge=${challenge}`);
  body.includes(challenge) ? fail("meta webhook verify (wrong token)", `echoed the challenge (HTTP ${res.status})`) : pass("meta webhook verify (wrong token)", `HTTP ${res.status}, challenge not echoed`);
});

const f = results.filter((s) => s === "FAIL").length, s = results.filter((x) => x === "SKIP").length;
console.log(`\n${results.length - f - s} pass, ${f} fail, ${s} skip`);
process.exit(f ? 1 : 0);
