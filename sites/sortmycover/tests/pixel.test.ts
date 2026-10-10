import { describe, expect, it } from "vitest";
import { buildFbc, consentDecision, cookieDomainFor, cookieString, expireString, stripPii } from "../src/lib/pixel";

describe("pixel module (pure parts)", () => {
  it("scopes cookies to the root domain on apex and campaign hosts", () => {
    expect(cookieDomainFor("sortmycover.co.za", "sortmycover.co.za")).toBe("sortmycover.co.za");
    expect(cookieDomainFor("new-bond.sortmycover.co.za", "sortmycover.co.za")).toBe("sortmycover.co.za");
    expect(cookieDomainFor("localhost", "sortmycover.co.za")).toBeNull();
    expect(cookieDomainFor("evilsortmycover.co.za", "sortmycover.co.za")).toBeNull();
  });
  it("writes a Secure, SameSite=Lax cookie with a Domain", () => {
    const c = cookieString("smc_ads", "1", { host: "new-bond.sortmycover.co.za", days: 365, secure: true });
    expect(c).toContain("Domain=sortmycover.co.za");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain(`Max-Age=${365 * 86400}`);
  });
  it("expires with Max-Age=0", () => expect(expireString("x", { host: "sortmycover.co.za", secure: true })).toMatch(/Max-Age=0.*Expires=Thu, 01 Jan 1970/));
  it("consent needs opt-in and loses to opt-out and Global Privacy Control", () => {
    expect(consentDecision({ ads: null, gpc: false })).toBe(false);
    expect(consentDecision({ ads: "1", gpc: false })).toBe(true);
    expect(consentDecision({ ads: "0", gpc: false })).toBe(false);
    expect(consentDecision({ ads: "1", gpc: true })).toBe(false);
  });
  it("never lets personal fields reach the Pixel", () => {
    expect(stripPii({ content_name: "c01", email: "a@b.c", phone: "1", first_name: "A", mobile: "2", fn: "x", value: 1 })).toEqual({ content_name: "c01", value: 1 });
  });
  it("builds fbc in Meta format with the .co.za subdomain index 2 (spec H.3)", () => expect(buildFbc("ABC", 1700000000000)).toBe("fb.2.1700000000000.ABC"));
});
