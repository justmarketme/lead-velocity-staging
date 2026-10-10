import { describe, expect, it } from "vitest";
import { articleMetas, articleLoaders, metaFor } from "../src/content";
import { glossary } from "../src/content/glossary";
import { parseInline, plainText } from "../src/lib/inline";
import evidence from "../config/evidence.json";
import { ANGLES, HOST_LABEL, LABEL_BANNED, RESERVED_LABELS, h1Plain, hostLabel, isAttached } from "../src/campaigns";
import { SITE_FAQ, CAMPAIGN_FAQ } from "../src/content/shared";
import { BANNED } from "../src/build/wording";
import type { Block } from "../src/content/types";

const words = (s: string) => plainText(s).split(/\s+/).filter(Boolean).length;
const text = (b: Block[]) => b.flatMap((x) => (x.type === "ul" || x.type === "ol" ? x.items : [x.text])).join(" ");
const SCOPE = "This is information, not advice.";
describe("articles", () => {
  it("has the 9 Wave-1 pieces (8 articles + the Hub 1 introduction)", () => {
    expect(articleMetas.map((a) => a.slug).sort()).toEqual([
      "how-sortmycover-works", "how-to-check-an-adviser", "how-to-complain", "how-to-read-your-payslips-cover-line", "life-events",
      "what-happens-on-a-30-minute-call", "what-happens-to-your-details", "what-is-a-life-cover-gap", "what-to-bring-to-your-call",
    ]);
  });
  for (const m of articleMetas) {
    describe(m.slug, () => {
      it("front matter is complete", () => {
        expect(m.title.length).toBeGreaterThan(5);
        expect(m.description.length).toBeGreaterThanOrEqual(110);
        expect(m.description.length).toBeLessThanOrEqual(165);
        expect([1, 2, 3, 4]).toContain(m.hub);
        expect(m.lastReviewed).toMatch(/^\d{4}-\d\d-\d\d$/);
        expect(m.datePublished <= m.lastReviewed).toBe(true);
        expect(m.fact_checked_by.length).toBeGreaterThan(2);
        expect(m.fact_checked_on).toMatch(/^\d{4}-\d\d-\d\d$/);
        expect(m.sources.length).toBeGreaterThan(0);
        for (const s of m.sources) { expect(s.url).toMatch(/^https:\/\//); expect(s.accessed).toMatch(/^\d{4}-\d\d$/); expect(s.publisher.length).toBeGreaterThan(1); }
        expect(m.related.length).toBeLessThanOrEqual(2);
        for (const r of m.related) expect(metaFor(r), `related ${r} exists`).toBeTruthy();
      });
      it("answer block is 40 to 60 words and ends with the scope sentence", () => {
        const n = words(m.answer);
        expect(n).toBeGreaterThanOrEqual(40);
        expect(n).toBeLessThanOrEqual(60);
        expect(m.answer.trim().endsWith(SCOPE)).toBe(true);
      });
      it("has no reviewer block unless a verified reviewer with an FSCA link is present", () => {
        if (m.reviewer) { expect(m.reviewer.verified_on).toMatch(/^\d{4}-\d\d-\d\d$/); expect(m.reviewer.fsca_url).toMatch(/fsca\.co\.za/); }
        else expect(m).not.toHaveProperty("reviewer");
      });
      it("uses an organisation byline unless a person consented", () => expect(["organization", "person"]).toContain(m.author.kind));
      it("body passes the compliance wording scan and ties every figure to evidence", async () => {
        const a = await articleLoaders[m.slug]();
        const all = m.answer + " " + text(a.body);
        for (const [re, label] of BANNED) expect(all, `${m.slug}: ${label}`).not.toMatch(re);
        const hasFigure = /\d\s?%|\d(\.\d+)?\s?[x×]\s?(salary|earnings)|\bR\s?\d/.test(all);
        if (hasFigure) {
          expect(m.evidence?.length, `${m.slug} has a figure but no evidence ids`).toBeGreaterThan(0);
          for (const id of m.evidence!) { const e = (evidence as { id: string; status: string }[]).find((x) => x.id === id); expect(e, id).toBeTruthy(); expect(e!.status).toBe("usable"); }
        }
        expect(a.body.filter((b) => b.type === "h2").length).toBeGreaterThanOrEqual(3);
        expect(words(text(a.body))).toBeGreaterThan(350);
      });
      it("body links are well-formed and internal links end with a slash", async () => {
        const a = await articleLoaders[m.slug]();
        for (const b of a.body) for (const t of b.type === "h2" || b.type === "p" ? [b.text] : b.items)
          for (const p of parseInline(t)) if (p.kind === "link") { expect(p.href).toMatch(/^(https:\/\/|\/)/); if (p.href!.startsWith("/")) expect(p.href!.replace(/#.*/, "").endsWith("/")).toBe(true); }
      });
    });
  }
});

describe("evidence ledger", () => {
  it("every entry has the audit fields", () => {
    for (const e of evidence as Record<string, string>[]) for (const k of ["id", "claim", "publisher", "month", "status"]) expect(e[k], `${e.id}.${k}`).toBeTruthy();
    for (const e of (evidence as Record<string, string>[]).filter((x) => x.status === "usable")) expect(e.url, `${e.id}.url`).toMatch(/^https:\/\//);
  });
  it("unique ids", () => { const ids = (evidence as { id: string }[]).map((e) => e.id); expect(new Set(ids).size).toBe(ids.length); });
});

describe("glossary", () => {
  it("has the 36 terms of spec B.5, alphabetical, 1-3 sentences, no brand names", () => {
    expect(glossary).toHaveLength(36);
    const names = glossary.map((g) => g.term.toLowerCase());
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    for (const g of glossary) {
      const sentences = g.definition.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      expect(sentences, g.term).toBeGreaterThanOrEqual(1);
      expect(sentences, g.term).toBeLessThanOrEqual(3);
      for (const [re, label] of BANNED) expect(g.definition, `${g.term}: ${label}`).not.toMatch(re);
      expect(g.definition).not.toMatch(/\bR\s?\d/);
      if (g.see) expect(metaFor(g.see), `see ${g.see}`).toBeTruthy();
    }
  });
});

describe("campaign angles", () => {
  /* Final set of 10 (deliverables/website/angles-final.md, 11 Oct 2026): 6 long-term insurance angles (theme A, non-funeral) and 4 wills and
     estate angles (theme B, all HELD). Expectation changed from the earlier ten (bond-paperwork, c13-check-not-buy, employer-gap, myth-bust,
     self-employed, turned-40, virtual, what-the-call retired or merged; extended-family dropped before that). */
  const FINAL = ["adviser-conversation", "cover-gap", "new-baby", "new-bond", "owners-directors", "salary-stops", "children-guardian", "will-and-cover", "will-myth", "where-is-the-will"];
  it("are the 10 final campaign angles with valid host labels and unique codes", () => {
    expect(ANGLES.map((a) => a.slug).sort()).toEqual([...FINAL].sort());
    expect(new Set(ANGLES.map((a) => a.meta_code)).size).toBe(ANGLES.length);
    expect(ANGLES.filter((a) => a.theme === "A")).toHaveLength(6);
    expect(ANGLES.filter((a) => a.theme === "B")).toHaveLength(4);
    expect(ANGLES.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const a of ANGLES) expect(a.slug).toMatch(HOST_LABEL);
  });
  it("retired angles are gone (never live, so no redirects are kept)", () => {
    for (const gone of ["bond-paperwork", "c13-check-not-buy", "employer-gap", "myth-bust", "self-employed", "turned-40", "virtual", "what-the-call", "extended-family"]) expect(ANGLES.map((a) => a.slug)).not.toContain(gone);
  });
  it("copy is scrubbed: short H1, short sub, banned and blocker words absent, no salary multiple, CTA wording", () => {
    for (const a of ANGLES) {
      const all = [h1Plain(a.h1), a.sub, a.title, a.description, a.ad_hook, a.note ?? "", a.proof?.text ?? ""].join(" ");
      expect(h1Plain(a.h1).split(/\s+/).length, a.slug).toBeLessThanOrEqual(12);
      expect(a.sub.split(/\s+/).length, a.slug + " sub").toBeLessThanOrEqual(25);
      expect(a.title.length, a.slug + " title").toBeLessThanOrEqual(60);
      for (const [re, label] of BANNED) expect(all, `${a.slug}: ${label}`).not.toMatch(re);
      expect(all, a.slug).not.toMatch(/\blicensed\b/i);
      // site-spec I.2 word scan (SortMyCover never checks, reviews, sorts, arranges or matches cover; no comparison; no guarantee)
      expect(all, a.slug).not.toMatch(/\b(check|checks|checked|review|reviews|sort|sorted|arrange|arranged|match|matched|compare|cheapest|cheap|affordable|discount|premium|premiums|guaranteed|regulated|funeral)\b/i);
      expect(a.sub + a.description, a.slug).toMatch(/authorised adviser/);
      expect(a.sub, a.slug).toMatch(/The call costs you nothing\./);
    }
  });
  it("any rand or percentage figure in angle copy is a sourced fact: proof object with a usable evidence file, month shown (S12, S15, S17)", () => {
    const ev = evidence as { id: string; status: string; month: string }[];
    for (const a of ANGLES) {
      const copy = [h1Plain(a.h1), a.sub, a.title, a.description, a.ad_hook].join(" ");
      if (/\bR\s?\d|\d\s?%|trillion|billion/.test(copy)) expect(a.proof, `${a.slug} has a figure but no proof`).toBeTruthy();
      if (a.proof) {
        const e = ev.find((x) => x.id === a.proof!.evidence);
        expect(e, a.slug + " evidence id").toBeTruthy();
        expect(a.proof.month, a.slug).toMatch(/^\d{4}-\d\d$/);
        expect(e!.month, a.slug + " proof month matches the evidence file").toBe(a.proof.month);
        expect(a.proof.text, a.slug).toMatch(/General information, not advice\./);
        // a hosted page may rest only on a usable evidence entry; a held page may still wait on a HOLD entry
        if (isAttached(a)) expect(e!.status, a.slug).toBe("usable");
      }
    }
  });
  it("every theme B (wills and estate) page carries the scope note and is held", () => {
    for (const a of ANGLES.filter((x) => x.theme === "B")) {
      expect(a.hold, a.slug).toBe(true);
      expect(a.note, a.slug).toMatch(/does not itself draft a will/);
      expect(a.budget_topic, a.slug).toBe("cover and planning");
      expect(a.status, a.slug).toMatch(/^HOLD/);
    }
  });
});

describe("campaign hosts (spec C.3)", () => {
  it("labels follow the regex, avoid the S28 word list and the reserved labels", () => {
    for (const a of ANGLES) { const l = hostLabel(a); expect(l, a.slug).toMatch(HOST_LABEL); expect(l).not.toMatch(LABEL_BANNED); expect(RESERVED_LABELS).not.toContain(l); expect(l).not.toMatch(/--/); }
    expect(new Set(ANGLES.map(hostLabel)).size).toBe(ANGLES.length);
  });
  it("the host-label override mechanism still works (no angle uses it today)", () => {
    expect(hostLabel({ slug: "x-check", host_label: "x-looking" })).toBe("x-looking");
    expect(ANGLES.filter((a) => a.host_label)).toHaveLength(0);
  });
  it("the four wills and estate angles are held: built, but never attached to a host", () => {
    const held = ["children-guardian", "will-and-cover", "will-myth", "where-is-the-will"];
    for (const slug of held) expect(ANGLES.find((a) => a.slug === slug)!.hold, slug).toBe(true);
    expect(ANGLES.filter(isAttached).map((a) => a.slug).sort()).toEqual(["adviser-conversation", "cover-gap", "new-baby", "new-bond", "owners-directors", "salary-stops"]);
  });
});

describe("angle-aware quiz copy", () => {
  it("budget topics are short plain phrases with no banned wording", () => {
    for (const a of ANGLES.filter((x) => x.budget_topic)) { expect(a.budget_topic!.split(/\s+/).length).toBeLessThanOrEqual(6); for (const [re, label] of BANNED) expect(a.budget_topic!, `${a.slug}: ${label}`).not.toMatch(re); }
  });
});

describe("FAQ", () => {
  it("scoped commission wording and no unscoped 'free'", () => {
    for (const f of [...SITE_FAQ, ...CAMPAIGN_FAQ]) for (const [re, label] of BANNED) expect(f.a + f.q, `${f.id}: ${label}`).not.toMatch(re);
    expect(CAMPAIGN_FAQ.find((f) => f.id === "who-pays")!.a).toMatch(/SortMyCover takes no commission/);
  });
});
