import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ageInBand, NEEDS_EMAIL, consentText, dayLabel, groupSlots, helpOptionsFor, normaliseSlots, prettyMobile, productOfHelp, suggestEmail, toE164, AGE_OPTIONS, HELP_OPTIONS } from "../src/lib/quiz";
import * as quizLib from "../src/lib/quiz";
import consent from "../config/consent.json";

describe("quiz bands", () => {
  it("accepts age 35 to 50 only", () => {
    expect(ageInBand("lt35")).toBe(false);
    expect(ageInBand("35_44")).toBe(true);
    expect(ageInBand("45_50")).toBe(true);
    expect(ageInBand("51plus")).toBe(false);
    expect(ageInBand(undefined)).toBe(false);
  });
  it("every booking method asks for the email (verify gate, 2026-10-11)", () => {
    for (const m of ["teams", "zoom", "google_meet", "whatsapp_call", "phone"]) expect(NEEDS_EMAIL[m]).toBe(true);
  });
  it("four age bands, first age band is 18+", () => {
    expect(AGE_OPTIONS[0].label).toBe("18 to 34");
    expect(AGE_OPTIONS).toHaveLength(4);
  });
});

describe("quiz v2: no budget on the page (Jono, 2026-10-13)", () => {
  const quiz = fs.readFileSync(path.resolve(__dirname, "../src/components/Quiz.tsx"), "utf8");
  const api = fs.readFileSync(path.resolve(__dirname, "../src/lib/api.ts"), "utf8");
  it("the quiz has no budget question, no budget field and no rand amount", () => {
    expect(quiz).not.toMatch(/budget_band|BUDGET_OPTIONS|monthly budget|R750|R1,500/);
    expect(quiz).not.toMatch(/name="budget_band"/);
    expect(api).not.toMatch(/budget_band/);
    expect("BUDGET_OPTIONS" in quizLib).toBe(false);
    expect("qualifies" in quizLib).toBe(false);
  });
  it("the /lead body flags the budget as pending (asked on WhatsApp) and sends help_with", () => {
    expect(quiz).toMatch(/budget_pending: true, help_with: help \?\? "life"/);
    expect(api).toMatch(/budget_pending: true;/);
    expect(quiz).toMatch(/name="budget_pending" value="true"/); // no-JS form too
  });
  it("email is asked only in the booking step, never in the quiz", () => {
    expect(quiz).not.toMatch(/type="email"|name="email"/);
  });
  it("first question: five options, review first; a cover page shows four; a wills page asks nothing", () => {
    expect(HELP_OPTIONS.map((o) => o.value)).toEqual(["review", "life", "disability_income", "severe_illness", "wills"]);
    expect(HELP_OPTIONS[0].label).toBe("Review my existing cover");
    expect(helpOptionsFor(null)).toHaveLength(5);
    expect(helpOptionsFor("life_cover").map((o) => o.value)).not.toContain("wills");
    expect(helpOptionsFor("life_cover")).toHaveLength(4);
    expect(helpOptionsFor("wills")).toHaveLength(0);
  });
  it("product_interest stays life_cover or wills (what W01 accepts), derived from help_with", () => {
    expect(productOfHelp("wills")).toBe("wills");
    for (const h of ["review", "life", "disability_income", "severe_illness"] as const) expect(productOfHelp(h)).toBe("life_cover");
  });
});

describe("mobile numbers", () => {
  it("normalises SA mobiles to E.164", () => {
    expect(toE164("082 123 4567")).toBe("+27821234567");
    expect(toE164("+27 82 123 4567")).toBe("+27821234567");
    expect(toE164("0027821234567")).toBe("+27821234567");
    expect(toE164("27821234567")).toBe("+27821234567");
  });
  it("rejects landlines and junk", () => {
    expect(toE164("011 123 4567")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("08212345678")).toBeNull();
  });
  it("formats for display", () => expect(prettyMobile("+27821234567")).toBe("+27 82 123 4567"));
});

describe("email typo suggestion", () => {
  it("suggests the close domain", () => expect(suggestEmail("a@gmial.com")).toBe("a@gmail.com"));
  it("stays quiet for a known or distant domain", () => {
    expect(suggestEmail("a@gmail.com")).toBeNull();
    expect(suggestEmail("a@mycompany.example")).toBeNull();
  });
});

describe("slots", () => {
  const raw = ["2026-10-12T10:00:00+02:00", { start: "2026-10-12T09:00:00+02:00" }, "bad", "2026-10-13T08:00:00+02:00", "2026-10-12T10:00:00+02:00"];
  it("normalises, dedupes and sorts", () => expect(normaliseSlots(raw)).toEqual(["2026-10-12T09:00:00+02:00", "2026-10-12T10:00:00+02:00", "2026-10-13T08:00:00+02:00"]));
  it("groups by day with limits", () => {
    const g = groupSlots(normaliseSlots(raw), 5, 1);
    expect(g.map((d) => d.slots.length)).toEqual([1, 1]);
  });
  it("labels the day straight from the string", () => expect(dayLabel("2026-10-12T09:00:00+02:00")).toBe("Mon 12 Oct"));
});

describe("consent text", () => {
  it("generic mode starts with the 18+ statement and names no practice", () => {
    const c = consentText(consent, "generic", "", "");
    expect(c.text).toContain("I am 18 or older.");
    expect(c.text.startsWith("I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp")).toBe(true);
    expect(c.mode).toBe("generic");
    expect(c.text).not.toMatch(/\{/);
  });
  it("named mode fails closed to generic without practice and FSP number", () => {
    expect(consentText(consent, "named", "", "").mode).toBe("generic");
    const n = consentText(consent, "named", "Acme Cover", "12345");
    expect(n.mode).toBe("named");
    expect(n.text).toContain("Acme Cover (FSP 12345)");
  });
  it("ad measurement consent is separate: not part of the introduction consent", () => {
    expect(consentText(consent, "generic", "", "").text).not.toMatch(/Facebook|Instagram|hashed/i);
    expect(consent.ads.text).toMatch(/optional/i);
  });
});
