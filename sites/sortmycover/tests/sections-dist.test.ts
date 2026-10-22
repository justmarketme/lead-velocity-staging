/* Finished-HTML checks for the home page's two calls, the /wills/ and /cover/ sections, navigation, sitemap and the quiz payload
   field on campaign pages (run `npm run build` first). */
import WP from "../config/will-provider.internal.json";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { BANNED } from "../src/build/wording";
import { ANGLES } from "../src/campaigns";
import site from "../config/site.json";

const dist = path.resolve(__dirname, "../dist");
const have = fs.existsSync(path.join(dist, "index.html"));
const read = (rel: string) => fs.readFileSync(path.join(dist, rel), "utf8");
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<noscript[\s\S]*?<\/noscript>/g, " ").replace(/<head[\s\S]*?<\/head>/, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const WILLS = ["what-a-will-does", "guardians-and-childrens-trusts", "estate-costs-and-a-will", "where-to-keep-a-will", "the-will-appointment", "estate-administration", "intestate-succession", "reporting-a-deceased-estate", "what-makes-a-will-valid", "small-estates-letters-of-authority", "guardians-fund"];
const COVER = ["life-cover", "disability-cover", "severe-illness-cover", "income-protection"];
const wp = WP;

describe.skipIf(!have)("home: the two calls", () => {
  const html = have ? read("index.html") : "";
  const doc = new JSDOM(html).window.document;
  it("shows a cover adviser card and a will card, each opening WhatsApp with its own opener", () => {
    const cards = [...doc.querySelectorAll(".svc-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch(/Talk to a cover adviser/);
    for (const t of ["Life cover", "Disability cover", "Severe illness cover", "Income protection"]) expect(cards[0].textContent).toContain(t);
    expect(cards[0].querySelector('a.btn-wa')?.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/27600156480\?text=.*Ref%20w-home-cover$/);
    expect(cards[1].textContent).toMatch(/Get your will drafted/);
    expect(cards[1].textContent).toMatch(/will consultant/);
    expect(cards[1].textContent).not.toContain(wp.name);
    expect(cards[1].querySelector('a.btn-wa')?.getAttribute("href")).toMatch(/a%20will%20consultant.*Ref%20w-home-wills$/);
    // the will card makes no statement about adviser fees; the cover card carries the fee line
    expect(cards[1].textContent).not.toMatch(/Advisers pay SortMyCover/);
    expect(cards[0].textContent).toMatch(/Advisers pay SortMyCover a fee/);
  });
  it("links every cover type page and every wills guide, and the two hubs", () => {
    for (const s of COVER) expect(html, s).toContain(`href="/cover/${s}/"`);
    for (const s of WILLS) expect(html, s).toContain(`href="/wills/${s}/"`);
    expect(html).toContain('href="/cover/"');
    expect(html).toContain('href="/wills/"');
  });
  it("hero cards and their disclosures are never reveal targets; the lower cards are", () => {
    for (const c of doc.querySelectorAll(".svc-card")) { expect(c.closest("[data-reveal]")).toBeNull(); expect(c.querySelector("[data-reveal]")).toBeNull(); }
    expect(doc.querySelectorAll("[data-reveal]").length).toBe(COVER.length + WILLS.length);
  });
});

describe.skipIf(!have)("/wills/ and /cover/ sections", () => {
  it("the wills hub and every guide carry the generic will disclosure, never name the provider, and make no fee statement", () => {
    for (const rel of ["wills/index.html", ...WILLS.map((s) => `wills/${s}/index.html`)]) {
      const html = read(rel);
      const doc = new JSDOM(html).window.document;
      const d = doc.querySelector("[data-provider][data-disclosure]");
      expect(d, rel).toBeTruthy();
      expect(d!.textContent, rel).toMatch(/on WhatsApp before the call/);
      expect(html, rel).not.toMatch(new RegExp(`${wp.name}|capitallegacy|FSP ${wp.fsp_number}`, "i"));
      expect(d!.textContent, rel).toContain("SortMyCover does not draft wills and gives no advice");
      expect(visible(html), rel).not.toMatch(/Advisers pay SortMyCover|commission/);
      expect(html, rel).toMatch(/href="https:\/\/wa\.me\/27600156480\?text=[^"]*a%20will%20consultant[^"]*Ref%20w-wills"/);
    }
  });
  it("cover pages open WhatsApp with the cover opener and never mention funeral cover", () => {
    for (const rel of ["cover/index.html", ...COVER.map((s) => `cover/${s}/index.html`)]) {
      const html = read(rel);
      expect(html, rel).toMatch(/href="https:\/\/wa\.me\/27600156480\?text=[^"]*Ref%20w-cover"/);
      expect(visible(html), rel).not.toMatch(/funeral/i);
    }
  });
  it("articles carry Article + BreadcrumbList JSON-LD and a section breadcrumb (not /learn/)", () => {
    for (const [sec, slugs, name] of [["wills", WILLS, "Wills and estate"], ["cover", COVER, "Cover types"]] as const) {
      for (const s of slugs) {
        const html = read(`${sec}/${s}/index.html`);
        expect(html, s).toContain('"@type":"Article"');
        expect(html, s).toContain('"@type":"BreadcrumbList"');
        expect(html, s).toContain(`"item":"https://sortmycover.co.za/${sec}/"`);
        expect(html, s).not.toContain('"item":"https://sortmycover.co.za/learn/"');
        expect(html, s).toMatch(new RegExp(`<nav aria-label="Breadcrumb"[^>]*>[\\s\\S]*${name}`));
        expect(html, s).toContain(`<meta property="og:url" content="https://sortmycover.co.za/${sec}/${s}/">`);
        expect(html, s).toContain('<meta property="og:type" content="article">');
      }
    }
  });
  it("visible copy on the new pages passes the wording scan", () => {
    for (const rel of ["index.html", "book/index.html", "wills/index.html", "cover/index.html", ...WILLS.map((s) => `wills/${s}/index.html`), ...COVER.map((s) => `cover/${s}/index.html`)]) {
      const v = visible(read(rel));
      for (const [re, label] of BANNED) expect(v, `${rel}: ${label}`).not.toMatch(re);
    }
  });
});

describe.skipIf(!have)("navigation, footer and sitemap", () => {
  it("every apex page's header and footer link Cover types and Wills & estate", () => {
    for (const rel of ["index.html", "about/index.html", "learn/index.html", "wills/index.html", "cover/life-cover/index.html"]) {
      const doc = new JSDOM(read(rel)).window.document;
      const nav = doc.querySelector('nav[aria-label="Main"]')!;
      expect(nav.querySelector('a[href="/cover/"]')?.textContent, rel).toBe("Cover types");
      expect(nav.querySelector('a[href="/wills/"]')?.textContent, rel).toBe("Wills & estate");
      const foot = doc.querySelector("footer")!;
      expect(foot.querySelector('a[href="/wills/"]'), rel).toBeTruthy();
      expect(foot.querySelector('a[href="/cover/income-protection/"]'), rel).toBeTruthy();
    }
  });
  it("orphan guard: every apex footer links the footer-only pages, with at most 30 links (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 4)", () => {
    const want = ["/legal/", "/faq/", "/accessibility/", "/terms/", "/paia/", "/advisers/", "/learn/sources/", "/learn/life-events/", "/learn/glossary/", "/privacy/#opt-out"];
    for (const rel of ["index.html", "about/index.html", "learn/index.html", "wills/index.html", "cover/life-cover/index.html", "legal/index.html", "404.html"]) {
      const foot = new JSDOM(read(rel)).window.document.querySelector("footer.site-footer")!;
      for (const href of want) expect(foot.querySelector(`a[href="${href}"]`), `${rel} ${href}`).toBeTruthy();
      expect(foot.querySelectorAll("a").length, rel).toBeLessThanOrEqual(30);
      expect(foot.querySelectorAll('nav[aria-label="Footer"]').length, rel).toBe(1);
      expect(foot.querySelectorAll('nav[aria-label="Legal"]').length, rel).toBe(1);
    }
  });
  it("link graph: the guides and /book/ that left the footer keep at least 2 inbound links in the built HTML", () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(dist).filter((f) => f.endsWith(".html"));
    for (const target of ["/learn/life-cover-and-a-home-loan/", "/learn/income-protection-vs-disability-cover/", "/learn/cover-for-business-owners-and-directors/", "/book/"]) {
      const self = target.slice(1) + "index.html";
      const from = files.filter((f) => path.relative(dist, f).split(path.sep).join("/") !== self && fs.readFileSync(f, "utf8").includes(`href="${target}"`));
      expect(from.length, target).toBeGreaterThanOrEqual(2);
    }
  });
  // The fee line left the apex footer (spec section 2: it is shown where details are collected, in the chat panel, and on the pages
  // below); campaign landings still carry it in their footer because they collect leads (CPA s41).
  it("the fee statement is on About, Cover, How we make money and /legal/, never on /wills/; no apex footer carries it, campaign cover footers do", () => {
    for (const rel of ["about/index.html", "cover/index.html", "how-we-make-money/index.html", "legal/index.html"]) expect(visible(read(rel)), rel).toMatch(/advisers pay SortMyCover a fee/i);
    expect(visible(read("wills/index.html"))).not.toMatch(/Advisers pay SortMyCover a fee/);
    const footer = (rel: string) => new JSDOM(read(rel)).window.document.querySelector("footer")!.textContent!;
    for (const rel of ["index.html", "about/index.html", "cover/index.html", "faq/index.html"]) expect(footer(rel), rel).not.toMatch(/Advisers pay SortMyCover a fee/);
    for (const a of ANGLES) {
      const f = footer(`_c/${a.slug}/index.html`);
      if (a.theme === "B") expect(f, a.slug).not.toMatch(/Advisers pay SortMyCover a fee/);
      else expect(f, a.slug).toMatch(/Advisers pay SortMyCover a fee/);
    }
  });
  it("the sitemap lists both hubs and all ten new pages", () => {
    const sm = read("sitemap.xml");
    for (const p of ["/wills/", "/cover/", "/legal/", ...WILLS.map((s) => `/wills/${s}/`), ...COVER.map((s) => `/cover/${s}/`)]) expect(sm, p).toContain(`<loc>https://sortmycover.co.za${p}</loc>`);
  });
  it("the learn hub links to both sections", () => {
    const html = read("learn/index.html");
    expect(html).toContain('href="/wills/"');
    expect(html).toContain('href="/cover/"');
  });
});

describe.skipIf(!have)("campaign pages book on WhatsApp only (Jono, 17 Oct 2026)", () => {
  it("each landing page leads with WhatsApp, the opener carries the angle's meta code, and there is no booking form", () => {
    for (const a of ANGLES) {
      const html = read(`_c/${a.slug}/index.html`);
      expect(html, a.slug).toMatch(new RegExp(`href="https://wa\\.me/27600156480\\?text=[^"]*Ref%20${a.meta_code}"`));
      if (a.theme === "B") expect(html, a.slug).toContain("a%20will%20consultant");
      expect(html, a.slug).not.toMatch(/<form|name="mobile"|name="help_with"|id="quiz"/);
    }
  });
});
