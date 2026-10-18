/* Capital Legacy change watcher: the shared logic.
   Used by scripts/check-capital-legacy.mjs (local CLI, prints a diff) and by the n8n workflow automation/W36.json
   (weekly, emails Jonathan) through require('lv-automation').clWatch (automation/index.cjs). No dependencies, no
   network calls here: callers fetch, this module plans the requests, normalises, hashes, compares and words the report.

   Sources and their committed baseline hashes: config/capital-legacy-watch.json. Only hashes are committed: this repo
   is public and Capital Legacy's text is not ours to republish. Previous text (for a line diff) lives where the caller
   keeps state: .cache/capital-legacy/ for the CLI (git-ignored), workflow static data for n8n. */
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = (rel) => JSON.parse(fs.readFileSync(here(rel), "utf8"));

export const WATCH_FILE = here("../config/capital-legacy-watch.json");
export const loadWatch = () => readJson("../config/capital-legacy-watch.json");
export const loadAngles = () => readJson("../config/angles.json");
export const loadEvidence = () => [...readJson("../config/evidence.json"), ...readJson("../config/evidence-archive-capital-legacy.json")];
/* RETIRED 18 Oct 2026: no public page rests on the will provider any more, so nothing this watcher finds affects the site. */
export const loadProvider = () => readJson("../config/will-provider.internal.json");
export const CAMPAIGN_HOST_SUFFIX = ".sortmycover.co.za";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", reg: "®", trade: "™" };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

/** HTML -> visible text, one block per line, whitespace collapsed. Scripts, styles, SVG and comments are dropped. */
export function htmlToText(html) {
  const s = String(html)
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|button|a|span|label|option|dt|dd|blockquote|figcaption)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decode(s).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** A Capital Legacy page: the text of <main> (navigation, cookie banner and footer links excluded, so they cannot
    raise false alarms) plus the footer's regulatory lines (FSP status, underwriter), which our pages rely on. */
export function normalisePage(html) {
  const s = String(html);
  const a = s.search(/<main\b/i);
  const b = s.search(/<\/main>/i);
  const main = a >= 0 && b > a ? s.slice(a, b) : s;
  const reg = htmlToText(s).split("\n").filter((l) => /financial services provider|underwritten by|licensed life insurer/i.test(l));
  const lines = htmlToText(main).split("\n");
  for (const r of reg) if (!lines.includes(r)) lines.push(r);
  return lines.join("\n");
}

const richText = (v) => (Array.isArray(v) ? v.filter((b) => b && typeof b.text === "string").map((b) => b.text.replace(/\s+/g, " ").trim()).filter(Boolean) : []);

/** One FAQ document from Capital Legacy's public content API (Prismic documents/search JSON): title, then the answer. */
export function normaliseFaq(body) {
  const j = typeof body === "string" ? JSON.parse(body) : body;
  const doc = (j && j.results && j.results[0]) || null;
  if (!doc) throw new Error("faq_not_found");
  const data = doc.data || {};
  const lines = [...richText(data.title), ...Object.entries(data).filter(([k]) => k !== "title").flatMap(([, v]) => richText(v))];
  return lines.join("\n");
}

export function normalise(source, body) {
  return source.kind === "faq" ? normaliseFaq(body) : normalisePage(body);
}

export const sha256 = (text) => crypto.createHash("sha256").update(String(text), "utf8").digest("hex");

/** The master ref from the content API root (GET watch.content_api). */
export function masterRef(body) {
  const j = typeof body === "string" ? JSON.parse(body) : body;
  const r = ((j && j.refs) || []).find((x) => x.isMasterRef) || ((j && j.refs) || [])[0];
  if (!r) throw new Error("no_master_ref");
  return r.ref;
}

/** The GET requests to make, in source order. FAQ entries are read by uid (the FAQ page paginates and reorders). */
export function requestPlan(watch, ref) {
  return watch.sources.map((s) => ({
    id: s.id,
    kind: s.kind,
    url: s.kind === "faq"
      ? `${watch.content_api}/documents/search?ref=${encodeURIComponent(ref)}&q=${encodeURIComponent(`[[at(my.faq.uid,"${s.uid}")]]`)}`
      : s.url,
    page_url: s.url,
  }));
}

/** Our campaign pages that rest on the given evidence ids: angle sources and proof, plus every theme B page when the id
    backs the provider lines shown on all of them (config/site.json -> will_provider.evidence). */
export function affectedAngles(evidenceIds, angles = loadAngles(), provider = loadProvider()) {
  const ids = new Set(evidenceIds);
  const all = provider && (provider.evidence || []).some((e) => ids.has(e));
  return angles
    .filter((a) => (all && a.theme === "B") || [...(a.sources || []), ...(a.proof ? [a.proof.evidence] : [])].some((e) => ids.has(e)))
    .map((a) => a.slug);
}

/** Minimal line diff (LCS). Returns the removed and added lines in order. */
export function lineDiff(before, after) {
  const a = String(before || "").split("\n");
  const b = String(after || "").split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]); else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

/**
 * Compare fetched sources with the previous state.
 * @param watch    config/capital-legacy-watch.json (its hashes are the baseline when state has none)
 * @param state    { sources: { [id]: { hash, text, checked } } } from the last run, or {}
 * @param fetched  [{ id, ok, status, body, error }] one per source (any order)
 * @param now      ISO time of this run
 * @returns { results, changed, failed, state } where state is what to keep for next time
 */
export function compare(watch, state, fetched, now = new Date().toISOString(), angles = loadAngles(), provider = loadProvider()) {
  const prev = (state && state.sources) || {};
  const byId = new Map(fetched.map((f) => [f.id, f]));
  const next = {};
  const results = watch.sources.map((s) => {
    const f = byId.get(s.id);
    const old = prev[s.id] || {};
    const baseline = old.hash || s.hash || "";
    const affects = affectedAngles(s.evidence, angles, provider);
    const base = { id: s.id, url: s.url, evidence: s.evidence, affects };
    let text;
    try {
      if (!f || !f.ok) throw new Error(f ? f.error || `http_${f.status}` : "not_fetched");
      text = normalise(s, f.body);
      if (!text) throw new Error("empty_text");
    } catch (e) {
      if (old.hash) next[s.id] = old; // keep the last good state
      return { ...base, status: "failed", error: String(e.message || e) };
    }
    const hash = sha256(text);
    next[s.id] = { hash, text, checked: now };
    if (!baseline) return { ...base, status: "new", hash };
    if (baseline === hash) return { ...base, status: "unchanged", hash };
    const diff = old.text && old.hash === baseline ? lineDiff(old.text, text) : null;
    return { ...base, status: "changed", before: baseline, hash, diff };
  });
  return { results, changed: results.filter((r) => r.status === "changed"), failed: results.filter((r) => r.status === "failed"), state: { sources: next, checked: now } };
}

const cap = (lines, n) => (lines.length > n ? [...lines.slice(0, n), `... and ${lines.length - n} more lines`] : lines);
const clip = (l) => (l.length > 300 ? l.slice(0, 300) + "..." : l);

/** Plain-text email (or console) report. Returns null when nothing changed and nothing failed. */
export function report(cmp, { evidence = loadEvidence(), provider = loadProvider(), now = new Date().toISOString() } = {}) {
  if (!cmp.changed.length && !cmp.failed.length) return null;
  const claim = (id) => (evidence.find((e) => e.id === id) || {}).claim || "(no evidence entry)";
  const name = (provider && provider.name) || "Capital Legacy";
  const out = [];
  out.push(`${name} watcher, ${now.slice(0, 10)}.`);
  if (cmp.changed.length) out.push(`${cmp.changed.length} page(s) changed since our wills and estate pages were last brought in line. Nothing on sortmycover.co.za changes by itself.`);
  for (const r of cmp.changed) {
    out.push("", `CHANGED: ${r.id}  ${r.url}`);
    out.push(`Our pages that rely on it: ${r.affects.length ? r.affects.map((s) => `${s} (${s}${CAMPAIGN_HOST_SUFFIX})`).join(", ") : "none directly"}`);
    out.push("Facts we took from it:");
    for (const id of r.evidence) out.push(`  - ${id}: ${claim(id)}`);
    if (r.diff) {
      out.push("Removed lines:", ...cap(r.diff.removed, 40).map((l) => "  - " + clip(l)));
      out.push("Added lines:", ...cap(r.diff.added, 40).map((l) => "  + " + clip(l)));
    } else out.push("(No earlier text stored for a line diff: compare the live page with the facts above.)");
  }
  if (cmp.failed.length) {
    out.push("", "Could not read (a moved or removed page also shows here):");
    for (const r of cmp.failed) out.push(`  - ${r.id}  ${r.url}: ${r.error}. Relied on by: ${r.affects.join(", ") || "none directly"}`);
  }
  out.push("", "To update: in the lv-site repo run `node sites/sortmycover/scripts/check-capital-legacy.mjs`, bring config/angles.json,",
    "config/site.json (will_provider) and config/evidence.json in line with the live pages, run npm run build and npm test,",
    "then `node sites/sortmycover/scripts/check-capital-legacy.mjs --update` to record the new baseline.");
  const subject = cmp.changed.length
    ? `${name} changed ${cmp.changed.length} page(s): SortMyCover wills pages to re-check`
    : `${name} watcher: ${cmp.failed.length} page(s) could not be read`;
  return { subject, text: out.join("\n") };
}
