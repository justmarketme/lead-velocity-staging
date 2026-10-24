/* The wills and estate section (/wills/) and the cover types section (/cover/), added 11 Oct 2026, plus the quiz's first question.
   Content rules: every fact is tied to an evidence entry whose URL is listed under Sources; wills facts come only from the will
   provider's verified statements (cl-*); the provider is never named in content source files (config/site.json names it once);
   no funeral cover content; no banned wording. */
import WP from "../config/will-provider.internal.json";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { articleLoaders, articleMetas, articlePath, COVER_HUB, hubPath, hubs, WILLS_HUB } from "../src/content";
import { sourcesFrom } from "../src/content/evidence";
import { BEFORE_SIGNING, WHERE_SORTMYCOVER_FITS } from "../src/content/cover-shared";
import { plainText } from "../src/lib/inline";
import { BANNED } from "../src/build/wording";
import { apexRoutes } from "../src/routes";
import { HOME_FAQ, SITE_FAQ } from "../src/content/shared";
import { PROVIDER_SERVICE_LINE } from "../src/lib/site";
import evidence from "../config/evidence.json";
import site from "../config/site.json";
import type { Block } from "../src/content/types";

const ev = evidence as { id: string; claim: string; status: string; url: string; checked?: string }[];
const text = (b: Block[]) => b.flatMap((x) => (x.type === "ul" || x.type === "ol" ? x.items : [x.text])).join(" ");
const wills = articleMetas.filter((m) => m.hub === WILLS_HUB);
const cover = articleMetas.filter((m) => m.hub === COVER_HUB);
const src = (dir: string, slug: string) => fs.readFileSync(path.resolve(__dirname, `../src/content/${dir}/${slug}.ts`), "utf8");

describe("sections and routes", () => {
  it("has eleven wills and estate guides (five added 18 Oct 2026) and four cover type pages", () => {
    expect(wills.map((m) => m.slug).sort()).toEqual(["estate-administration", "estate-costs-and-a-will", "guardians-and-childrens-trusts", "guardians-fund", "intestate-succession", "reporting-a-deceased-estate", "small-estates-letters-of-authority", "the-will-appointment", "what-a-will-does", "what-makes-a-will-valid", "where-to-keep-a-will"]);
    expect(cover.map((m) => m.slug).sort()).toEqual(["disability-cover", "income-protection", "life-cover", "severe-illness-cover"]);
  });
  it("wills guides live under /wills/, cover pages under /cover/, both hubs are indexable routes", () => {
    for (const m of wills) expect(articlePath(m.slug)).toBe(`/wills/${m.slug}/`);
    for (const m of cover) expect(articlePath(m.slug)).toBe(`/cover/${m.slug}/`);
    expect(hubPath(hubs.find((h) => h.n === WILLS_HUB)!)).toBe("/wills/");
    expect(hubPath(hubs.find((h) => h.n === COVER_HUB)!)).toBe("/cover/");
    const paths = new Map(apexRoutes.map((r) => [r.path, r]));
    for (const p of ["/wills/", "/cover/", ...[...wills, ...cover].map((m) => articlePath(m.slug))]) {
      expect(paths.get(p), p).toBeTruthy();
      expect(paths.get(p)!.indexable, p).toBe(true);
    }
    // no stray /learn/ hub page for the two own sections
    expect(paths.has("/learn/wills/")).toBe(false);
    expect(paths.has("/learn/cover/")).toBe(false);
  });
});

describe("evidence linkage", () => {
  for (const m of [...wills, ...cover]) {
    it(`${m.slug}: evidence ids exist, are verified or usable, and each one's URL is listed under Sources`, () => {
      expect(m.evidence?.length, m.slug).toBeGreaterThan(0);
      const urls = new Set(m.sources.map((s) => s.url));
      for (const id of m.evidence!) {
        const e = ev.find((x) => x.id === id);
        expect(e, id).toBeTruthy();
        expect(["verified", "usable"], id).toContain(e!.status);
        if (e!.status === "verified") expect(e!.checked, id).toMatch(/^\d{4}-\d\d-\d\d$/);
        expect(urls.has(e!.url), `${m.slug}: ${id} (${e!.url}) not in Sources`).toBe(true);
      }
      // and no source without an evidence entry behind it
      for (const s of m.sources) expect(m.evidence!.some((id) => ev.find((x) => x.id === id)!.url === s.url), `${m.slug}: source ${s.url} has no evidence id`).toBe(true);
    });
  }
  /* Jono, 16 Oct 2026: wills guides may cite other trustworthy players, not only the will provider. Allowed: the provider's own
     statements (cl-*) and VERIFIED entries from regulators, government and industry bodies (SARS, the Master/Justice, FSCA, NCR,
     SAnews, ASISA, the FPI, the Policyholder Protection Rules). Nothing unverified, nothing from a competing will provider. */
  /* Jono, 18 Oct 2026: wills guides no longer rest on the will provider at all (no cl-* evidence). They cite VERIFIED government,
     statutory and regulator sources: the Master of the High Court, SARS, gov.za notices and Acts, the consolidated Wills Act, the FSCA. */
  const TRUSTED = /^(sars|master|justice|gov|act|fsca|ncr|sanews|asisa|sam|fpi|ppr)-/;
  it("wills guides rest only on verified government, statutory or regulator sources, never on the will provider", () => {
    for (const m of wills) for (const id of m.evidence!) {
      expect(id, m.slug).toMatch(TRUSTED);
      expect(id, m.slug).not.toMatch(/^cl-/);
      expect(ev.find((x) => x.id === id)!.status, `${m.slug}: ${id}`).toBe("verified");
    }
  });
  it("cover pages never rest on a will provider statement or a HOLD entry", () => {
    for (const m of cover) for (const id of m.evidence!) { expect(id, m.slug).not.toMatch(/^cl-/); expect(ev.find((x) => x.id === id)!.status).not.toBe("hold"); }
  });
  it("sourcesFrom merges entries that share a URL and takes the month the page was seen", () => {
    const s = sourcesFrom([["master-faq", "a"], ["master-faq", "b"]]);
    expect(s).toHaveLength(1);
    expect(s[0].used_for).toBe("a; b");
    expect(s[0].accessed).toBe("2026-10");
    expect(() => sourcesFrom([["no-such-id", "x"]])).toThrow();
  });
});

describe("wording", () => {
  for (const m of [...wills, ...cover]) {
    it(`${m.slug}: no banned wording, no funeral cover, no unsourced rand amounts, no "should"`, async () => {
      const a = await articleLoaders[m.slug]();
      const all = plainText(m.title + " " + m.description + " " + m.answer + " " + text(a.body));
      for (const [re, label] of BANNED) expect(all, `${m.slug}: ${label}`).not.toMatch(re);
      expect(all, m.slug).not.toMatch(/funeral/i);
      // a rand amount is allowed only where one of the guide's own verified sources states it (e.g. the Master's R250 000)
      const claims = (m.evidence ?? []).map((id) => ev.find((x) => x.id === id)?.claim ?? "").join(" ");
      for (const r of all.match(/\bR\s?\d[\d ]*\d|\bR\s?\d/g) ?? []) expect(claims, `${m.slug}: ${r.trim()} has no source`).toContain(r.trim());
      expect(all, m.slug).not.toMatch(/\bshould\b/i); // rule S12: never what a person should do
      expect(all, m.slug).not.toMatch(/\b(cheap|cheaper|affordable|save money|best|top-rated)\b/i);
    });
  }
  it("the provider is never typed in wills content source files: it comes from config/site.json", () => {
    for (const m of wills) {
      expect(src("meta", m.slug), m.slug).not.toContain(WP.name);
      expect(src("articles", m.slug), m.slug).not.toContain(WP.name);
    }
  });
  it("the shared cover blocks pass the wording scan and cite the 31-day cooling-off period", () => {
    const all = text([...BEFORE_SIGNING, ...WHERE_SORTMYCOVER_FITS]);
    for (const [re, label] of BANNED) expect(all, label).not.toMatch(re);
    expect(all).toContain("31 days");
    expect(ev.find((x) => x.id === "ppr-ltia-cooling-off")!.claim).toContain("31 days");
  });
  it("the home FAQ answers who drafts a will without naming the provider (named on WhatsApp, Jono 18 Oct 2026)", () => {
    const f = HOME_FAQ.find((x) => x.id === "wills")!;
    expect(f.a).toMatch(/will consultant/);
    expect(f.a).not.toContain(WP.name);
    expect(f.a).not.toContain(WP.fsp_number);
    for (const x of SITE_FAQ) for (const [re, label] of BANNED) expect(x.q + x.a, `${x.id}: ${label}`).not.toMatch(re);
  });
  it("the provider disclosure is generic: the firm and its FSP number are sent on WhatsApp, never shown on the site", () => {
    expect(PROVIDER_SERVICE_LINE).toMatch(/on WhatsApp before the call/);
    expect(PROVIDER_SERVICE_LINE).not.toContain(WP.name);
    expect(PROVIDER_SERVICE_LINE).not.toContain(WP.fsp_number);
  });
});

