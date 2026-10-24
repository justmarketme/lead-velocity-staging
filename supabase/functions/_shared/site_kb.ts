// Pure helpers for turning leadvelocity.co.za into Einstein's knowledge base.
// No Deno/Node APIs except Web Crypto, so the unit test runs under plain Node.

export const SITE = "https://www.leadvelocity.co.za";
export const KB_PREFIX = "leadvelocity.co.za"; // every Einstein KB doc name starts with this

// Never crawl the portal, admin, auth or token routes — only the public website.
const EXCLUDED = [
  /^\/broker(\/|$|-)/, /^\/admin(\/|$)/, /^\/dashboard(\/|$)/, /^\/console(\/|$)/, /^\/login(\/|$)/,
  /^\/invite(\/|$)/, /^\/reset-password(\/|$)/, /^\/setup(\/|$)/, /^\/notifications(\/|$)/,
  /^\/s\//, /^\/r\//, /^\/ask\//, /^\/portal(\/|$)/, /^\/auth(\/|$)/, /^\/api(\/|$)/,
];
const ASSET = /\.(webp|png|jpe?g|gif|svg|ico|css|js|json|xml|txt|pdf|mp4|mp3|zip)$/i;

/** Canonical path for an internal page URL, or null if it is external / excluded / an asset. */
export function publicPath(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, SITE);
  } catch {
    return null;
  }
  if (!/^(www\.)?leadvelocity\.co\.za$/i.test(u.hostname)) return null;
  let p = decodeURIComponent(u.pathname).replace(/\/+$/, "") || "/";
  p = p.toLowerCase();
  if (ASSET.test(p) || EXCLUDED.some((re) => re.test(p))) return null;
  return p;
}

/** <loc> entries of a sitemap. */
export function sitemapPaths(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => publicPath(m[1])).filter((p): p is string => !!p);
}

/** Internal links found in rendered markdown. */
export function markdownLinks(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    const p = publicPath(m[1].split("#")[0]);
    if (p) out.add(p);
  }
  return [...out];
}

/**
 * Reader output (r.jina.ai markdown) → the stable page text we store and hash.
 * Drops the reader's header (its timestamp changes on every request), images
 * (hashed asset filenames change on every deploy) and link targets (keeps the
 * link text), so the hash only moves when the words on the page move.
 */
export function pageText(readerOutput: string): { title: string; text: string } {
  const title = (readerOutput.match(/^Title:\s*(.+)$/m)?.[1] ?? "").trim();
  const body = readerOutput.includes("Markdown Content:")
    ? readerOutput.slice(readerOutput.indexOf("Markdown Content:") + "Markdown Content:".length)
    : readerOutput;
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .filter((l, i, a) => !(l.trim() === "" && (a[i - 1] ?? "").trim() === "")) // collapse blank runs
    .join("\n")
    .trim();
  return { title, text };
}

/** A rendered SPA 404 / empty shell — never store it. */
export function looksEmpty(text: string): boolean {
  return text.length < 200 || /\b(404|page not found|oops!)\b/i.test(text.slice(0, 400));
}

export async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** KB doc name carries the page and its content hash: "leadvelocity.co.za/pricing #a1b2c3d4e5f6". */
export function docName(path: string, hash: string): string {
  return `${KB_PREFIX}${path === "/" ? "/" : path} #${hash}`;
}

export function parseDocName(name: string): { path: string; hash: string } | null {
  const m = name.match(/^leadvelocity\.co\.za(\/[^\s#]*)\s#([0-9a-f]{6,64})$/);
  return m ? { path: m[1], hash: m[2] } : null;
}

/**
 * Two paths with identical text are one page (an SPA client-side redirect like /promotions →
 * /pricing renders the target's content under the old URL). Keep the path the site links to most
 * (the real nav target), then the shorter, then the alphabetically first — never crawl order,
 * which is nondeterministic.
 */
export function dedupePages<T extends { path: string; hash: string }>(pages: T[], inlinks: Map<string, number>): T[] {
  const best = new Map<string, T>();
  const score = (p: T) => [-(inlinks.get(p.path) ?? 0), p.path.length, p.path] as const;
  for (const p of pages) {
    const cur = best.get(p.hash);
    if (!cur) { best.set(p.hash, p); continue; }
    const [a, b] = [score(p), score(cur)];
    if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) best.set(p.hash, p);
  }
  return [...best.values()].sort((x, y) => x.path.localeCompare(y.path));
}

export type KbRef = { type: string; id: string; name: string; usage_mode?: string };
export type Page = { path: string; title: string; text: string; hash: string };

/**
 * Decide what to change. `current` = KB docs on the agent; `pages` = freshly crawled pages.
 * Unchanged pages keep their doc; changed and new pages need a new doc; site docs for
 * pages that disappeared are dropped. Docs that are not site docs are left untouched.
 */
export function planKb(current: KbRef[], pages: Page[], failed: string[] = []) {
  const byPath = new Map<string, KbRef & { hash: string }>();
  const foreign: KbRef[] = [];
  for (const d of current) {
    const parsed = parseDocName(d.name);
    if (parsed) byPath.set(parsed.path, { ...d, hash: parsed.hash });
    else foreign.push(d);
  }
  const keep: KbRef[] = [];
  const upsert: Page[] = [];
  const replaced: KbRef[] = [];
  for (const p of pages) {
    const d = byPath.get(p.path);
    if (d && d.hash === p.hash) keep.push(d);
    else {
      upsert.push(p);
      if (d) replaced.push(d);
    }
    byPath.delete(p.path);
  }
  // A page we could not fetch this run keeps its old doc — a reader outage must never empty the KB.
  for (const path of failed) {
    const d = byPath.get(path);
    if (d) keep.push(d);
    byPath.delete(path);
  }
  const removed = [...byPath.values()];
  return { keep, upsert, replaced, removed, foreign };
}
