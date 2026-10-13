// Run: node supabase/functions/_shared/site_kb.test.ts  (Node >= 23 strips types natively)
import { dedupePages, docName, looksEmpty, markdownLinks, pageText, parseDocName, planKb, publicPath, sha, sitemapPaths } from "./site_kb.ts";

const cases: Array<[string, unknown, unknown]> = [];
const eq = (name: string, got: unknown, want: unknown) => cases.push([name, JSON.stringify(got), JSON.stringify(want)]);

// Path filtering: public pages in, portal/admin/auth/assets out.
eq("home", publicPath("https://www.leadvelocity.co.za/"), "/");
eq("apex host + trailing slash", publicPath("https://leadvelocity.co.za/Pricing/"), "/pricing");
eq("relative", publicPath("/about#team"), "/about");
eq("broker portal excluded", publicPath("https://www.leadvelocity.co.za/broker"), null);
eq("broker sub excluded", publicPath("/broker/leads"), null);
eq("broker-elite excluded", publicPath("/broker-elite"), null);
eq("broker-setup excluded", publicPath("/broker-setup/abc"), null);
eq("admin excluded", publicPath("/admin/preview/broker/1"), null);
eq("dashboard excluded", publicPath("/dashboard"), null);
eq("login excluded", publicPath("/login"), null);
eq("reset excluded", publicPath("/reset-password"), null);
eq("invite excluded", publicPath("/invite/tok"), null);
eq("short link excluded", publicPath("/s/calendar"), null);
eq("asset excluded", publicPath("/assets/einstein-DCFUjXrz.webp"), null);
eq("external excluded", publicPath("https://wa.me/27737651664"), null);
eq("lookalike host excluded", publicPath("https://leadvelocity.co.za.evil.com/"), null);
eq("onboarding kept", publicPath("/onboarding"), "/onboarding");

eq("sitemap", sitemapPaths("<urlset><url><loc>https://www.leadvelocity.co.za/</loc></url><url><loc> https://www.leadvelocity.co.za/pricing </loc></url><url><loc>https://www.leadvelocity.co.za/broker/dashboard</loc></url></urlset>"), ["/", "/pricing"]);
eq("markdown links", markdownLinks("[About](https://www.leadvelocity.co.za/about) [Login](https://www.leadvelocity.co.za/broker) ![x](https://www.leadvelocity.co.za/a.webp) [WA](https://wa.me/1) [Q](https://www.leadvelocity.co.za/pricing#what-qualified-means)"), ["/about", "/pricing"]);

// Stable text: reader timestamp, images and hashed asset URLs must not change the hash.
const v1 = "Title: Pricing\n\nURL Source: x\n\nPublished Time: Tue, 13 Oct 2026 18:53:37 GMT\n\nMarkdown Content:\n![Einstein](https://www.leadvelocity.co.za/assets/einstein-AAAA.webp)\n# Plans\n\n\n\nBronze [Start](https://www.leadvelocity.co.za/contact) R16,500";
const v2 = v1.replace("18:53:37", "21:00:00").replace("einstein-AAAA", "einstein-BBBB");
const v3 = v1.replace("R16,500", "R17,000");
const t1 = pageText(v1);
eq("title", t1.title, "Pricing");
eq("text cleaned", t1.text, "# Plans\n\nBronze Start R16,500");

const [h1, h2, h3] = await Promise.all([sha(t1.text), sha(pageText(v2).text), sha(pageText(v3).text)]);
eq("hash ignores timestamp + asset hash", h1 === h2, true);
eq("hash changes when words change", h1 === h3, false);
eq("empty shell", looksEmpty("Lead Velocity"), true);
eq("404 page", looksEmpty("# 404\nPage not found " + "x".repeat(300)), true);
eq("real page", looksEmpty("x".repeat(500)), false);

eq("doc name", docName("/pricing", "abc123abc123"), "leadvelocity.co.za/pricing #abc123abc123");
eq("doc name home", docName("/", "abc123abc123"), "leadvelocity.co.za/ #abc123abc123");
eq("parse doc name", parseDocName("leadvelocity.co.za/pricing #abc123abc123"), { path: "/pricing", hash: "abc123abc123" });
eq("parse foreign", parseDocName("Lead Velocity FAQ.pdf"), null);

// Change detection.
const cur = [
  { type: "text", id: "d-home", name: docName("/", "111111111111") },
  { type: "text", id: "d-pricing", name: docName("/pricing", "222222222222") },
  { type: "text", id: "d-old", name: docName("/promotions", "333333333333") },
  { type: "text", id: "d-contact", name: docName("/contact", "444444444444") },
  { type: "file", id: "d-pdf", name: "Broker pack.pdf" },
];
const pages = [
  { path: "/", title: "", text: "", hash: "111111111111" }, // unchanged
  { path: "/pricing", title: "", text: "", hash: "999999999999" }, // hash mismatch → replace
  { path: "/about", title: "", text: "", hash: "555555555555" }, // new page
];
const plan = planKb(cur, pages, ["/contact"]); // /contact failed to fetch this run
eq("keep unchanged + failed", plan.keep.map((d) => d.id), ["d-home", "d-contact"]);
eq("upsert changed + new", plan.upsert.map((p) => p.path), ["/pricing", "/about"]);
eq("replaced old version", plan.replaced.map((d) => d.id), ["d-pricing"]);
eq("removed vanished page", plan.removed.map((d) => d.id), ["d-old"]);
eq("foreign docs untouched", plan.foreign.map((d) => d.id), ["d-pdf"]);
const noop = planKb(cur.slice(0, 1), pages.slice(0, 1));
eq("no change → nothing to do", [noop.upsert.length, noop.removed.length], [0, 0]);

// Redirect duplicates: keep the nav target regardless of crawl order.
const dupA = [{ path: "/promotions", hash: "h1" }, { path: "/pricing", hash: "h1" }, { path: "/about", hash: "h2" }];
const links = new Map([["/pricing", 7], ["/about", 7]]);
eq("dedupe keeps linked path (order A)", dedupePages(dupA, links).map((p) => p.path), ["/about", "/pricing"]);
eq("dedupe keeps linked path (order B)", dedupePages([...dupA].reverse(), links).map((p) => p.path), ["/about", "/pricing"]);
eq("dedupe tie → shorter path", dedupePages([{ path: "/a-long", hash: "x" }, { path: "/ab", hash: "x" }], new Map()).map((p) => p.path), ["/ab"]);

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(failed ? `${failed} failed` : "all passed");
if (failed) process.exit(1);
