/* Tests on the finished pre-rendered output in dist/ (run `npm run build` first; `npm run verify` does both).
   These prove the SEO / AI-search checklist in docs/SEO-AND-AI-SEARCH-CHECKLIST.md. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED } from "../src/build/wording";
import { JSDOM } from "jsdom";
import { ANGLES, hostLabel } from "../src/campaigns";

const dist = path.resolve(__dirname, "../dist");
const have = fs.existsSync(path.join(dist, "index.html"));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const pages = have ? walk(dist).filter((f) => f.endsWith(".html")).map((f) => ({ file: f, rel: path.relative(dist, f).replace(/\\/g, "/"), html: fs.readFileSync(f, "utf8") })) : [];
const isCampaign = (p: { rel: string }) => p.rel.startsWith("_c/");
const isApex = (p: { rel: string }) => !isCampaign(p);
const meta = (html: string, re: RegExp) => (re.exec(html) || [])[1];
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<noscript[\s\S]*?<\/noscript>/g, " ").replace(/<head[\s\S]*?<\/head>/, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe.skipIf(!have)("pre-rendered output", () => {
  it("renders every route (50 files) with real content", () => {
    expect(pages.length).toBe(50);
    for (const p of pages) expect(visible(p.html).length, p.rel).toBeGreaterThan(300);
    expect(pages.find((p) => p.rel === "learn/how-to-check-an-adviser/index.html")!.html).toContain("FSCA");
  });
  it("each page has a unique <title> of at most 60 characters, a description and exactly one H1", () => {
    const titles = new Map<string, string>();
    for (const p of pages) {
      const title = meta(p.html, /<title>([^<]*)<\/title>/)!;
      expect(title, p.rel).toBeTruthy();
      expect(title.length, `${p.rel}: ${title}`).toBeLessThanOrEqual(60);
      if (!isCampaign(p)) expect(titles.has(title), `duplicate title ${title} (${p.rel} vs ${titles.get(title)})`).toBe(false);
      titles.set(title, p.rel);
      expect(meta(p.html, /<meta name="description" content="([^"]+)"/), p.rel).toBeTruthy();
      expect((p.html.match(/<h1[\s>]/g) || []).length, `${p.rel} h1 count`).toBe(1);
    }
  });
  it("apex pages: self-referencing absolute canonical with trailing slash", () => {
    for (const p of pages.filter(isApex)) {
      const c = meta(p.html, /<link rel="canonical" href="([^"]+)"/)!;
      expect(c, p.rel).toMatch(/^https:\/\/sortmycover\.co\.za\//);
      if (p.rel === "404.html") continue;
      const expected = "https://sortmycover.co.za/" + p.rel.replace(/index\.html$/, "");
      expect(c, p.rel).toBe(expected);
    }
  });
  it("campaign pages: noindex meta, self-canonical on their own host, absent from the sitemap, robots.txt does not block", () => {
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    const robots = fs.readFileSync(path.join(dist, "robots.txt"), "utf8");
    const camp = pages.filter(isCampaign);
    expect(camp.length).toBe(20);
    for (const p of camp) {
      const slug = p.rel.split("/")[1];
      expect(p.html, p.rel).toMatch(/<meta name="robots" content="noindex/);
      const c = meta(p.html, /<link rel="canonical" href="([^"]+)"/)!;
      expect(c, p.rel).toBe(`https://${hostLabel(ANGLES.find((a) => a.slug === slug)!)}.sortmycover.co.za/` + (p.rel.includes("/thanks/") ? "thanks/" : ""));
      expect(sitemap, p.rel).not.toContain(`/${slug}/`); // slash-delimited: the slug "cover-gap" is a suffix of the article slug what-is-a-life-cover-gap
      expect(p.html).toContain(`data-campaign="${slug}"`);
    }
    expect(robots).not.toMatch(/Disallow:\s*\S/);
  });
  it("sitemap lists only indexable apex pages", () => {
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const noindex = new Set(pages.filter((p) => /<meta name="robots" content="noindex/.test(p.html)).map((p) => "https://sortmycover.co.za/" + p.rel.replace(/index\.html$/, "")));
    for (const l of locs) expect(noindex.has(l), `${l} is noindex but in sitemap`).toBe(false);
    const indexable = pages.filter((p) => isApex(p) && !/noindex/.test(meta(p.html, /<meta name="robots" content="([^"]+)"/)!)).map((p) => "https://sortmycover.co.za/" + p.rel.replace(/index\.html$/, ""));
    expect(new Set(locs)).toEqual(new Set(indexable));
  });
  it("JSON-LD uses only Organization, WebSite, Article and BreadcrumbList", () => {
    const allowed = new Set(["Organization", "WebSite", "Article", "BreadcrumbList", "ListItem", "ImageObject", "PostalAddress", "Person"]);
    for (const p of pages) {
      expect(p.html, p.rel).not.toMatch(/FAQPage|HowTo|"Product"|"Offer"|AggregateRating|"Review"/);
      for (const m of p.html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        const types = [...m[1].matchAll(/"@type":"([A-Za-z]+)"/g)].map((x) => x[1]);
        for (const t of types) expect(allowed.has(t), `${p.rel}: ${t}`).toBe(true);
      }
    }
    const art = pages.find((p) => p.rel === "learn/what-is-a-life-cover-gap/index.html")!.html;
    expect(art).toContain('"@type":"Article"');
    expect(art).toContain('"@type":"BreadcrumbList"');
    expect(pages.find((p) => p.rel === "index.html")!.html).toContain('"legalName":"Lead Velocity (Pty) Ltd"');
  });
  it("every article: answer block 40-60 words with the scope sentence, dateModified equals the visible last-reviewed date", () => {
    const arts = pages.filter((p) => p.rel.startsWith("learn/") && /data-answer/.test(p.html));
    expect(arts.length).toBe(9);
    for (const p of arts) {
      const ans = /<div class="answer-block" data-answer[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(p.html)![1].replace(/<[^>]+>/g, "");
      const n = ans.split(/\s+/).filter(Boolean).length;
      expect(n, p.rel).toBeGreaterThanOrEqual(40);
      expect(n, p.rel).toBeLessThanOrEqual(60);
      expect(ans.endsWith("This is information, not advice."), p.rel).toBe(true);
      const mod = /"dateModified":"(\d{4}-\d\d-\d\d)"/.exec(p.html)![1];
      expect(p.html.toLowerCase(), p.rel).toContain(`<time datetime="${mod}">`);
      expect(p.html).toMatch(/Sources<\/h2>/);
      expect(p.html).not.toMatch(/Reviewed by/);
    }
  });
  it("the LCP element is never hidden by animation: no inline opacity, no hidden-until-JS styles in the HTML", () => {
    for (const p of pages) {
      expect(p.html, p.rel).not.toMatch(/style="[^"]*opacity/);
      expect(p.html, p.rel).not.toMatch(/\sstyle="/); // strict CSP: no inline style attributes in the markup
      expect(p.html, p.rel).not.toMatch(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/); // no inline scripts except JSON-LD data
    }
    const css = fs.readFileSync(path.join(dist, "assets", fs.readdirSync(path.join(dist, "assets")).find((f) => f.endsWith(".css"))!), "utf8");
    expect(css).not.toMatch(/\[data-[a-z-]+\]\s*\{[^}]*opacity:\s*0/);
  });
  it("no robots meta blocks snippets on indexable pages", () => {
    for (const p of pages) expect(p.html).not.toMatch(/nosnippet|max-snippet:\s*0/);
  });
  it("footer identity block and 'not a financial services provider' line on every page; opt-out link", () => {
    for (const p of pages) {
      if (p.rel === "404.html") continue;
      const v = visible(p.html);
      expect(v, p.rel).toContain("Lead Velocity (Pty) Ltd");
      expect(v, p.rel).toContain("2025/637858/07");
      expect(v, p.rel).toContain("210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria 0184");
      expect(v, p.rel).toContain("+27 10 976 5618");
      expect(v, p.rel).toContain("hello@sortmycover.co.za");
      expect(v, p.rel).toContain("SortMyCover is not a financial services provider and gives no financial advice");
      expect(p.html, p.rel).toMatch(/href="[^"]*\/privacy\/#opt-out"[^>]*>Opt out of ad measurement/);
    }
  });
  it("campaign pages have no site navigation", () => {
    for (const p of pages.filter(isCampaign)) expect(p.html, p.rel).not.toMatch(/aria-label="Main/);
  });
  it("visible copy passes the compliance wording scan (marketing and article pages)", () => {
    const skip = /^(privacy|terms|paia)\//;
    for (const p of pages) {
      if (skip.test(p.rel)) continue;
      const v = visible(p.html);
      for (const [re, label] of BANNED) {
        if (label === "best" && /learn\/glossary/.test(p.rel)) continue;
        expect(v, `${p.rel}: ${label}`).not.toMatch(re);
      }
      expect(v, p.rel).not.toMatch(/Check my cover|Pick a time for a free/);
    }
  });
  it("the primary CTA is 'Book my adviser call' and the cost line is the approved one", () => {
    const home = visible(pages.find((p) => p.rel === "index.html")!.html);
    expect(home).toContain("Book my adviser call");
    expect(home).toContain("The call costs you nothing.");
  });
  it("no placeholder tokens leak into the HTML", () => {
    for (const p of pages) expect(p.html, p.rel).not.toMatch(/\[PRACTICE NAME\]|\[FSP NUMBER\]|REPLACE-|lorem ipsum|\bundefined\b|\{\{/i);
  });

  it("no reveal target sits on or inside a disclosure element, and every disclosure is present with computed opacity unaffected by inline styles (spec F.3, rule S34)", () => {
    let disclosures = 0;
    for (const p of pages) {
      const doc = new JSDOM(p.html).window.document;
      for (const d of doc.querySelectorAll("[data-disclosure]")) {
        disclosures++;
        expect(d.closest("[data-reveal],[data-step-item]"), p.rel + " disclosure inside a reveal target").toBeNull();
        expect(d.querySelector("[data-reveal],[data-step-item]"), p.rel + " reveal target inside a disclosure").toBeNull();
        expect(d.getAttribute("hidden"), p.rel).toBeNull();
      }
      expect(doc.querySelector("footer [data-disclosure]") || p.rel === "404.html", p.rel + " footer disclosure").toBeTruthy();
    }
    expect(disclosures).toBeGreaterThan(100);
  });
  it("built pages have no <style>, no on*= handlers and no inline scripts (strict CSP)", () => {
    for (const p of pages) {
      expect(p.html, p.rel).not.toMatch(/<style[s>]/);
      expect(p.html, p.rel).not.toMatch(/son[a-z]+="/);
    }
  });
  it("the footer line is FOOTER-v2 exactly as stored in config/site.json, on every page", () => {
    const line = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config/site.json"), "utf8")).footer_line as string;
    expect(line.startsWith("SortMyCover is a service of Lead Velocity (Pty) Ltd. We introduce you to authorised financial services providers.")).toBe(true);
    expect(line.endsWith("You must be 18 or older.")).toBe(true);
    for (const p of pages) { if (p.rel === "404.html") continue; expect(visible(p.html), p.rel).toContain(line); }
  });
  it("no page states the fee as flat, monthly or the same (spec C.1 item 5), and none says 30-day cycle", () => {
    for (const p of pages) expect(visible(p.html), p.rel).not.toMatch(/flat|30-day cycle|the same whether|flat monthly/i);
  });
  it("the home page has no sticky bar markup and the quiz shows two taps then details then consent", () => {
    const home = pages.find((p) => p.rel === "index.html")!.html;
    expect(home).not.toMatch(/sticky-bar/);
    const book = visible(pages.find((p) => p.rel === "book/index.html")!.html);
    expect(book).toContain("How old are you?");
    expect(book).toContain("You must be 18 or older");
  });
  it("legal drafts keep their DRAFT mark and noindex", () => {
    for (const r of ["privacy", "terms", "paia"]) {
      const h = pages.find((p) => p.rel === `${r}/index.html`)!.html;
      expect(h).toMatch(/DRAFT/);
      expect(h).toMatch(/noindex/);
    }
  });
});
