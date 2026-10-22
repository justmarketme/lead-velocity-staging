/* Copy that links to /legal/ promises "directors" only once /legal/ lists them (reviewer finding, 21 Oct 2026; CPA s41): /legal/
   hides its Directors row while config/site.json company.directors is empty, so About, the FAQ "Is this a scam?" answer and the
   /legal/ description must not name directors until the CIPC names are in config. Both states are checked here; the built pages
   are checked in tests/dist.test.ts. */
import { afterEach, describe, expect, it, vi } from "vitest";
import site from "../config/site.json";

async function load(directors: string[]) {
  vi.resetModules();
  const real = ((await vi.importActual<any>("../config/site.json")).default) as typeof site;
  vi.doMock("../config/site.json", () => ({ default: { ...real, company: { ...real.company, directors } } }));
  return { lib: await import("../src/lib/site"), shared: await import("../src/content/shared") };
}
afterEach(() => { vi.doUnmock("../config/site.json"); vi.resetModules(); });

describe("'directors' in copy that points to /legal/", () => {
  it("while company.directors is empty: no promise of directors", async () => {
    const { lib, shared } = await load([]);
    expect(lib.HAS_DIRECTORS).toBe(false);
    expect(lib.LEGAL_PAGE_LISTS).toBe("registration number and addresses");
    const scam = shared.SITE_FAQ.find((f) => f.id === "scam")!.a;
    expect(scam).not.toMatch(/directors/i);
    expect(scam).toContain("The address, phone and email are on our [Legal & disclosures](/legal/) page");
    expect(scam).toContain(`registration ${site.company.registration}`);
  });
  it("once the CIPC names are in config: the copy names directors", async () => {
    const { lib, shared } = await load(["A Director", "B Director"]);
    expect(lib.HAS_DIRECTORS).toBe(true);
    expect(lib.LEGAL_PAGE_LISTS).toBe("registration number, directors and addresses");
    expect(shared.SITE_FAQ.find((f) => f.id === "scam")!.a).toContain("The directors, address, phone and email are on our [Legal & disclosures](/legal/) page");
  });
});
