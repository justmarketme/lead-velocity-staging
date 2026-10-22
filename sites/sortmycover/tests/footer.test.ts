// @vitest-environment jsdom
/* Footer behaviour lock (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 4, with Jono's 21 Oct 2026 override: no "Lead Velocity" in the
   footer line while company.footer_identity is off). Groups are pre-rendered open; under 640px they fold only when the footer starts
   below the fold; from 640px they are held open and cannot be collapsed. */
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anim = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }));
vi.mock("motion/mini", () => ({ animate: (...a: unknown[]) => (anim as any)(...a) }));

import { CampaignFooter, Footer } from "../src/components/Footer";
import { FOOTER_LINE, site } from "../src/lib/site";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let footerTop = 2000;
const realRect = HTMLElement.prototype.getBoundingClientRect;

function media({ phone = false, reduce = false } = {}) {
  window.matchMedia = ((q: string) => ({ matches: (phone && q.includes("max-width: 639px")) || (reduce && q.includes("reduce")), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
}
function mount(el: ReturnType<typeof h>, path = "/about/") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: [path] }, el)));
}
const groups = () => [...host.querySelectorAll<HTMLDetailsElement>("details.f-group")];
const click = (el: Element) => { const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }); act(() => { el.dispatchEvent(e); }); return e; };

beforeEach(() => {
  anim.mockClear();
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const top = this.matches("footer") ? footerTop : 0;
    return { top, bottom: top + 600, left: 0, right: 390, width: 390, height: 600, x: 0, y: top, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); HTMLElement.prototype.getBoundingClientRect = realRect; footerTop = 2000; });

describe("pre-render (no JavaScript, crawlers, dist tests)", () => {
  const html = renderToString(h(MemoryRouter, { initialEntries: ["/"] }, h(Footer)));
  it("every group is open and every link is in the HTML", () => {
    expect((html.match(/<details class="f-group" open=""/g) || []).length).toBe(3);
    for (const href of ["/cover/", "/wills/", "/learn/", "/faq/", "/learn/sources/", "/how-we-make-money/", "/editorial-policy/", "/legal/", "/privacy/#opt-out"]) expect(html, href).toContain(`href="${href}"`);
  });
  it("one Footer nav and one Legal nav; the CTA is a .btn; the disclosure line is FOOTER-v3 and is never a settle target", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll('nav[aria-label="Footer"]')).toHaveLength(1);
    expect(doc.querySelectorAll('nav[aria-label="Legal"]')).toHaveLength(1);
    const cta = doc.querySelector(".f-cta")!;
    expect(cta.classList.contains("btn")).toBe(true);
    expect(cta.textContent).toContain("Chat on WhatsApp");
    const line = doc.querySelector(".f-line[data-disclosure]")!;
    expect(line.textContent).toBe(FOOTER_LINE);
    expect(line.closest("[data-f-settle]")).toBeNull();
    expect(doc.querySelector(".f-base [data-f-settle]")).toBeNull();
    expect(doc.querySelector(".f-legal a")!.textContent).toBe("Legal & disclosures");
  });
  // Follows the switch (reviewer finding, 21 Oct 2026): turning company.footer_identity on in config/site.json must stay a one-line
  // change, so these assertions branch on it like dist.test does instead of pinning it off. The "on" state is rendered below.
  it("Jono's override: Lead Velocity appears in the footer only while company.footer_identity is on (off by his decision)", () => {
    const NO_ADVICE = "SortMyCover is not a financial services provider and gives no financial advice.";
    expect(FOOTER_LINE).toBe(site.company.footer_identity ? `${NO_ADVICE} It is a trading name of Lead Velocity (Pty) Ltd.` : NO_ADVICE);
    expect((html.match(/Lead Velocity/g) || []).length).toBe(site.company.footer_identity ? 1 : 0);
    expect(html).not.toContain("2025/637858/07");
  });
});

describe("phone (under 640px)", () => {
  it("footer below the fold: the groups fold after mount and summaries stay in the tab order", () => {
    media({ phone: true });
    footerTop = 2000;
    mount(h(Footer));
    expect(groups().map((d) => d.open)).toEqual([false, false, false]);
    for (const d of groups()) {
      expect(d.querySelector("summary")!.tabIndex).toBe(0);
      expect(d.querySelector("summary")!.hasAttribute("aria-disabled")).toBe(false);
    }
  });
  it("footer already in view (short pages: 404, thanks): the groups stay open, no shift in view", () => {
    media({ phone: true });
    footerTop = 300;
    mount(h(Footer));
    expect(groups().map((d) => d.open)).toEqual([true, true, true]);
  });
  it("a tap glides a group open (motion path: the click is taken over, the chevron springs)", () => {
    media({ phone: true });
    mount(h(Footer));
    const d = groups()[0];
    const e = click(d.querySelector("summary")!);
    expect(e.defaultPrevented).toBe(true);
    expect(d.open).toBe(true);
    expect(anim).toHaveBeenCalled();
  });
  it("reduced motion: the native instant toggle runs (the click is not taken over, nothing animates)", () => {
    media({ phone: true, reduce: true });
    mount(h(Footer));
    const e = click(groups()[1].querySelector("summary")!);
    expect(e.defaultPrevented).toBe(false);
    expect(anim).not.toHaveBeenCalled();
  });
  it("on a NO_MOTION page (/privacy/) the native toggle runs too", () => {
    media({ phone: true });
    mount(h(Footer), "/privacy/");
    const e = click(groups()[2].querySelector("summary")!);
    expect(e.defaultPrevented).toBe(false);
    expect(anim).not.toHaveBeenCalled();
  });
});

describe("640px and up", () => {
  it("all groups are open, summaries leave the tab order, and a summary click cannot collapse a group", () => {
    media({ phone: false });
    footerTop = 2000;
    mount(h(Footer));
    expect(groups().map((d) => d.open)).toEqual([true, true, true]);
    for (const d of groups()) {
      expect(d.querySelector("summary")!.tabIndex).toBe(-1);
      // announced as unavailable in browse mode, not as an expanded button that does nothing (reviewer finding, 21 Oct 2026)
      expect(d.querySelector("summary")!.getAttribute("aria-disabled")).toBe("true");
      const e = click(d.querySelector("summary")!);
      expect(e.defaultPrevented).toBe(true);
      expect(d.open).toBe(true);
    }
    // a click on the heading inside the summary is held too
    expect(click(groups()[0].querySelector("h2")!).defaultPrevented).toBe(true);
    // ordinary links are not affected
    const link = host.querySelector<HTMLAnchorElement>('.f-legal a[href="/privacy/#opt-out"]')!;
    const seen = (ev: Event) => { ev.preventDefault(); };
    document.addEventListener("click", seen);
    let prevented = true;
    link.addEventListener("click", (ev) => { prevented = ev.defaultPrevented; });
    click(link);
    document.removeEventListener("click", seen);
    expect(prevented).toBe(false);
  });
});

describe("campaign footer", () => {
  it("cover landings: FOOTER-v3, the fee line, phone and email, absolute legal links led by Legal & disclosures; no groups, no CTA", () => {
    media();
    mount(h(CampaignFooter));
    const f = host.querySelector("footer")!;
    const lines = [...f.querySelectorAll("[data-disclosure]")].map((p) => p.textContent);
    expect(lines).toEqual([FOOTER_LINE, "Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything."]);
    const links = [...f.querySelectorAll('nav[aria-label="Legal"] a')].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links[0]).toEqual(["Legal & disclosures", "https://sortmycover.co.za/legal/"]);
    expect(links.map((l) => l[0])).toEqual(["Legal & disclosures", "Privacy", "Terms", "How we make money", "Complaints", "PAIA manual", "Opt out of ad measurement"]);
    for (const [, href] of links) expect(href).toMatch(/^https:\/\/sortmycover\.co\.za\//);
    expect(f.textContent).toContain("+27 10 976 5618");
    expect(f.querySelector("details, .f-cta, [data-f-settle]")).toBeNull();
    expect((f.textContent!.match(/Lead Velocity/g) || []).length).toBe(site.company.footer_identity ? 1 : 0); // follows the switch
  });
  it("wills landings: no fee line and no How we make money link", () => {
    media();
    mount(h(CampaignFooter, { feeLine: false }));
    const f = host.querySelector("footer")!;
    expect(f.querySelectorAll("[data-disclosure]")).toHaveLength(1);
    expect(f.textContent).not.toMatch(/Advisers pay|How we make money/);
  });
});

describe("company.footer_identity switched on (one line in config/site.json)", () => {
  it("FOOTER_LINE ends with the identity sentence and both footers name Lead Velocity exactly once", async () => {
    vi.resetModules();
    const real = ((await vi.importActual<any>("../config/site.json")).default) as typeof site;
    vi.doMock("../config/site.json", () => ({ default: { ...real, company: { ...real.company, footer_identity: true } } }));
    try {
      const React = await import("react");
      const { renderToString: render } = await import("react-dom/server");
      const { MemoryRouter: Router } = await import("react-router-dom");
      const lib = await import("../src/lib/site");
      const F = await import("../src/components/Footer");
      expect(lib.FOOTER_LINE).toBe("SortMyCover is not a financial services provider and gives no financial advice. It is a trading name of Lead Velocity (Pty) Ltd.");
      for (const el of [F.Footer, F.CampaignFooter]) {
        const out = render(React.createElement(Router, { initialEntries: ["/"] }, React.createElement(el)));
        expect((out.match(/Lead Velocity/g) || []).length, el.name).toBe(1);
        expect(out, el.name).toContain(lib.FOOTER_LINE);
        expect(out, el.name).not.toContain("2025/637858/07");
      }
    } finally {
      vi.doUnmock("../config/site.json");
      vi.resetModules();
    }
  });
});
