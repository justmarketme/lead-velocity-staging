/* WhatsApp-only booking (Jono, 17 Oct 2026): the opener contract with Lindi (docs/WHATSAPP-OPENERS.md) and the source tag that
   tells the CRM where every opt-in came from. */
import { describe, expect, it } from "vitest";
import { campaignContext, contextFor, opener, sourceTag, waHref, WA_DIGITS } from "../src/lib/whatsapp";
import { ANGLES } from "../src/campaigns";
import { BANNED } from "../src/build/wording";

const RE = /^Hi Lindi, I'd like to chat about (.+?)\. I agree that SortMyCover may message me on WhatsApp about this and share my details with (.+?)\. Ref ([a-z0-9-]+)(?: via ([a-z0-9_\/-]+))?\s*$/i;

describe("WhatsApp opener", () => {
  it("goes to the SortMyCover number", () => expect(WA_DIGITS).toBe("27600156480"));
  it("every page and every campaign opener matches the documented pattern and passes the wording scan", () => {
    const ctxs = ["/", "/cover/life-cover/", "/wills/", "/learn/life-cover-and-a-home-loan/", "/book/", "/about/"].map(contextFor).concat(ANGLES.map(campaignContext));
    for (const c of ctxs) {
      const o = opener(c);
      expect(o, c.ref).toMatch(RE);
      for (const [re, label] of BANNED) expect(o, `${c.ref}: ${label}`).not.toMatch(re);
      expect(RE.exec(o)![2], c.ref).toBe(c.wills ? "a will consultant" : "an authorised adviser");
    }
  });
  it("campaign openers carry the angle's neutral meta code", () => {
    for (const a of ANGLES) expect(RE.exec(opener(campaignContext(a)))![3]).toBe(a.meta_code);
  });
  it("the source tag is parsed back out of the opener", () => {
    const m = RE.exec(opener(contextFor("/learn/life-cover-and-a-home-loan/"), "ig/cycle1/new-bond-reel"))!;
    expect(m[3]).toBe("w-learn-bond");
    expect(m[4]).toBe("ig/cycle1/new-bond-reel");
    expect(decodeURIComponent(waHref(campaignContext(ANGLES[1]), "fb").split("text=")[1])).toMatch(/Ref a02 via fb$/);
  });
});

describe("source tag (where an opt-in came from)", () => {
  it("paid: utm_source from Meta's {{site_source_name}}, with campaign and ad", () => {
    expect(sourceTag({ utm: { utm_source: "ig", utm_campaign: "Cycle 1", utm_content: "New bond reel" } }, "")).toBe("ig/cycle-1/new-bond-reel");
    expect(sourceTag({ utm: { utm_source: "facebook" } }, "")).toBe("fb");
    expect(sourceTag({ fbclid: "abc" }, "")).toBe("fb");
  });
  it("organic: the first external referrer (Instagram post or bio link, Facebook post, Google search)", () => {
    expect(sourceTag({}, "https://l.instagram.com/?u=x")).toBe("ig");
    expect(sourceTag({ ref: "lm.facebook.com" }, "https://sortmycover.co.za/")).toBe("fb");
    expect(sourceTag({}, "https://www.google.co.za/")).toBe("google");
    expect(sourceTag({}, "https://www.news24.com/x")).toBe("news24-com");
  });
  it("direct visits and our own pages carry no tag", () => {
    expect(sourceTag({}, "")).toBe("");
    expect(sourceTag({}, "https://sortmycover.co.za/cover/")).toBe("");
    expect(sourceTag({}, "https://new-bond.sortmycover.co.za/")).toBe("");
  });
});

describe("desktop calendar (Cal.com)", () => {
  it("is inert until config/site.json calcom_link is set", async () => {
    const site = (await import("../config/site.json")).default as { calcom_link?: string };
    const cal = await import("../src/lib/calendar");
    expect(cal.CAL_ENABLED).toBe(!!site.calcom_link);
  });
  it("embeds Cal.com's own page with the ref and allowed utm fields only", async () => {
    const { calSrc, CAL_ORIGIN } = await import("../src/lib/calendar");
    const u = new URL(calSrc("w-cover via ig/cycle1", { utm_source: "ig", utm_campaign: "cycle1", fbclid: "x", other: "y" }));
    expect(u.origin).toBe(CAL_ORIGIN);
    expect(u.pathname.endsWith("/embed")).toBe(false); // the plain booking page renders in an iframe; /embed needs Cal.com's script
    expect(u.searchParams.get("ref")).toBe("w-cover via ig/cycle1");
    expect(u.searchParams.get("utm_source")).toBe("ig");
    expect(u.searchParams.get("fbclid")).toBeNull();
    expect(u.searchParams.get("other")).toBeNull();
  });
  it("the CSP allows Cal.com only as a frame, never as a script", async () => {
    const { csp } = await import("../src/build/hosts");
    const c = csp();
    expect(c).toMatch(/frame-src [^;]*https:\/\/app\.cal\.com/);
    expect(c).not.toMatch(/script-src [^;]*cal\.com/);
  });
});
