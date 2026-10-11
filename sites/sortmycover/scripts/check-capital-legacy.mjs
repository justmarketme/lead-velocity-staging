#!/usr/bin/env node
/* Checks the Capital Legacy pages our wills and estate pages rely on, and prints what changed.
   Usage (from sites/sortmycover):
     node scripts/check-capital-legacy.mjs            compare with the last check; exit 1 when something changed or failed
     node scripts/check-capital-legacy.mjs --update   record the live pages as the new baseline (hashes in
                                                      config/capital-legacy-watch.json, text in .cache/capital-legacy/)
     node scripts/check-capital-legacy.mjs --show <id> print the live normalised text of one source
   The baseline is "what our pages were last brought in line with". After a change: update config/angles.json,
   config/site.json (will_provider) and config/evidence.json to match the live pages, npm run build, npm test, then --update.
   The same logic runs weekly in n8n (automation/W36.json) and emails Jonathan. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WATCH_FILE, compare, loadWatch, masterRef, normalise, report, requestPlan } from "./capital-legacy-watch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(root, ".cache", "capital-legacy");
const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const SHOW = args.includes("--show") ? args[args.indexOf("--show") + 1] : null;
const UA = "SortMyCover content check (+https://sortmycover.co.za)";

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    return { ok: r.ok, status: r.status, body: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

const watch = loadWatch();
const api = await get(watch.content_api);
let ref = "";
try { ref = masterRef(api.body); } catch { /* FAQ sources then fail with not_fetched below */ }
const plan = requestPlan(watch, ref);
const fetched = [];
for (const p of plan) {
  if (p.kind === "faq" && !ref) { fetched.push({ id: p.id, ok: false, status: api.status, error: "content_api_unreachable" }); continue; }
  fetched.push({ id: p.id, ...(await get(p.url)) });
}

if (SHOW) {
  const s = watch.sources.find((x) => x.id === SHOW);
  const f = fetched.find((x) => x.id === SHOW);
  if (!s || !f) { console.error(`unknown source ${SHOW}; ids: ${watch.sources.map((x) => x.id).join(", ")}`); process.exit(2); }
  console.log(f.ok ? normalise(s, f.body) : `failed: ${f.error || f.status}`);
  process.exit(0);
}

// previous state: cached text (git-ignored) + the committed hashes
const state = { sources: {} };
for (const s of watch.sources) {
  const file = path.join(CACHE, s.id + ".txt");
  if (s.hash && fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    state.sources[s.id] = { hash: s.hash, text };
  }
}
const now = new Date().toISOString();
const cmp = compare(watch, state, fetched, now);

for (const r of cmp.results) console.log(`${r.status.padEnd(9)} ${r.id.padEnd(26)} ${r.url}${r.error ? "  (" + r.error + ")" : ""}`);
const rep = report(cmp, { now });
if (rep) console.log("\n" + rep.subject + "\n\n" + rep.text);
else console.log("\nNo changes since the last check.");

if (UPDATE) {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const s of watch.sources) {
    const st = cmp.state.sources[s.id];
    if (!st) continue;
    s.hash = st.hash;
    fs.writeFileSync(path.join(CACHE, s.id + ".txt"), st.text);
  }
  watch.checked = now.slice(0, 10);
  fs.writeFileSync(WATCH_FILE, JSON.stringify(watch, null, 2) + "\n");
  console.log(`\nBaseline updated (${Object.keys(cmp.state.sources).length} of ${watch.sources.length} sources) in config/capital-legacy-watch.json.`);
  if (cmp.failed.length) process.exit(1);
  process.exit(0);
}
process.exit(cmp.changed.length || cmp.failed.length || cmp.results.some((r) => r.status === "new") ? 1 : 0);
