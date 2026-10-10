import { describe, expect, it } from "vitest";
import { ALLOWED_BOTS, buildRobots, buildSitemap } from "../src/build/seo";
import { OLD_URL_MAP, missingTargets } from "../src/build/redirects";
import { allRoutes, apexRoutes } from "../src/routes";
import { pageTitle, renderHead } from "../src/lib/head";

describe("sitemap", () => {
  const entries = allRoutes.map((r) => ({ path: r.path, lastmod: r.lastmod, indexable: r.indexable, campaign: r.kind === "campaign" }));
  const xml = buildSitemap(entries, "https://sortmycover.co.za");
  it("lists only indexable apex pages", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(20);
    for (const l of locs) {
      expect(l.startsWith("https://sortmycover.co.za/")).toBe(true);
      expect(l).not.toMatch(/_c\/|thanks|404|privacy|terms|paia/);
      expect(l.endsWith("/")).toBe(true);
    }
    expect(locs).toContain("https://sortmycover.co.za/");
    expect(locs).toContain("https://sortmycover.co.za/learn/how-to-check-an-adviser/");
  });
  it("has a lastmod date on every url", () => {
    expect((xml.match(/<url>/g) || []).length).toBe((xml.match(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/g) || []).length);
  });
});

describe("robots.txt", () => {
  const robots = buildRobots("https://sortmycover.co.za");
  it("allows everything and every retrieval crawler, blocks nothing", () => {
    expect(robots).not.toMatch(/Disallow:\s*\S/);
    for (const b of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Googlebot", "Bingbot", "GPTBot", "ClaudeBot", "Google-Extended"]) expect(ALLOWED_BOTS).toContain(b);
    for (const b of ALLOWED_BOTS) expect(robots).toContain(`User-agent: ${b}\nAllow: /`);
    expect(robots).toContain("Sitemap: https://sortmycover.co.za/sitemap.xml");
  });
});

describe("old URL map", () => {
  const paths = new Set(apexRoutes.map((r) => r.path));
  it("every old URL redirects permanently to a real route", () => {
    expect(missingTargets(OLD_URL_MAP, paths)).toEqual([]);
    for (const r of OLD_URL_MAP) { expect(r.status).toBe(301); expect(r.from.endsWith(".html")).toBe(true); expect(r.to.endsWith("/")).toBe(true); }
  });
  it("covers the 11 pages of spec B.3", () => {
    const from = OLD_URL_MAP.map((r) => r.from);
    for (const f of ["/about.html", "/book.html", "/how-we-make-money.html", "/complaints.html", "/privacy.html", "/terms.html", "/learn/what-is-a-life-cover-gap.html", "/learn/what-happens-on-a-30-minute-call.html", "/learn/how-to-read-your-payslips-cover-line.html", "/learn/how-sortmycover-works.html", "/learn/life-events-that-change-what-you-need.html"]) expect(from).toContain(f);
    expect(OLD_URL_MAP.find((r) => r.from.includes("life-events-that"))!.to).toBe("/learn/life-events/");
  });
});

describe("head", () => {
  it("keeps titles at 60 characters with the brand last", () => {
    expect(pageTitle("Short")).toBe("Short | SortMyCover");
    const t = pageTitle("A very long article title that certainly runs past the sixty character limit");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith(" | SortMyCover")).toBe(true);
  });
  it("escapes and emits canonical, robots and og tags", () => {
    const h = renderHead({ title: 'A "b" <c>', description: "d", canonical: "https://sortmycover.co.za/x/", robots: "noindex,follow", jsonld: [{ "@type": "Organization" }] });
    expect(h).toContain('<link rel="canonical" href="https://sortmycover.co.za/x/">');
    expect(h).toContain('content="noindex,follow"');
    expect(h).toContain("&lt;c&gt;");
    expect(h).toContain("application/ld+json");
  });
});
