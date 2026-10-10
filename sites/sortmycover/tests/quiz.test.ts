import { describe, expect, it } from "vitest";
import { ageInBand, budgetInBand, consentText, dayLabel, groupSlots, normaliseSlots, prettyMobile, qualifies, suggestEmail, toE164, AGE_OPTIONS, BUDGET_OPTIONS } from "../src/lib/quiz";
import consent from "../config/consent.json";

describe("quiz bands", () => {
  it("accepts age 35 to 50 only", () => {
    expect(ageInBand("lt35")).toBe(false);
    expect(ageInBand("35_44")).toBe(true);
    expect(ageInBand("45_50")).toBe(true);
    expect(ageInBand("51plus")).toBe(false);
    expect(ageInBand(undefined)).toBe(false);
  });
  it("accepts budget from R750", () => {
    expect(budgetInBand("lt750")).toBe(false);
    expect(budgetInBand("750_1499")).toBe(true);
    expect(budgetInBand("1500_plus")).toBe(true);
  });
  it("qualifies needs both", () => {
    expect(qualifies({ age_band: "35_44", budget_band: "750_1499" })).toBe(true);
    expect(qualifies({ age_band: "35_44", budget_band: "lt750" })).toBe(false);
    expect(qualifies({ age_band: "lt35", budget_band: "1500_plus" })).toBe(false);
    expect(qualifies({})).toBe(false);
  });
  it("options are the three budget bands and four age bands, first age band is 18+", () => {
    expect(BUDGET_OPTIONS.map((o) => o.label)).toEqual(["Under R750", "R750 to R1,499", "R1,500 or more"]);
    expect(AGE_OPTIONS[0].label).toBe("18 to 34");
    expect(AGE_OPTIONS).toHaveLength(4);
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
    expect(c.text.startsWith("I am 18 or older.")).toBe(true);
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
