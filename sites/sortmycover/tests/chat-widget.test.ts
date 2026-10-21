// @vitest-environment jsdom
/* The chat panel (ChatWidget, rendered once in the persistent Layout) must close on any page change, return focus to what opened
   it when closed, and on phones make the page behind it inert. Before the fix it stayed open (with its dark overlay) across a
   change between two pages with the same chat context, and closing always sent focus to the launcher. */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import Layout from "../src/components/Layout";
import { WhatsAppCta } from "../src/components/ChatWidget";
import { openChat } from "../src/lib/whatsapp";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let go: (to: string) => void = () => {};

function Nav() { go = useNavigate(); return null; }

/** Reduced motion keeps the Motion chunks out of jsdom; `phone` answers the panel's 640px query. */
function mount(path: string, phone = false) {
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce") || (phone && q.includes("max-width: 640px")), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  window.scrollTo = (() => {}) as any; // jsdom has no layout; the Layout scrolls to the top on a page change
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Nav), h(Layout, null, h("p", null, h(WhatsAppCta, { ctx: { topic: "cover for my family", ref: "w-test" } }, "Talk to us"))))));
}
afterEach(() => { act(() => root.unmount()); host.remove(); });

const panel = () => host.querySelector("#chat-panel");
const launcher = () => host.querySelector(".chat-launch") as HTMLButtonElement;
const cta = () => [...host.querySelectorAll("main a")].find((a) => a.textContent === "Talk to us") as HTMLAnchorElement;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); });
const closeX = () => host.querySelector(".chat-x") as HTMLButtonElement;

describe("chat panel", () => {
  it("closes on a page change, also between two pages with the same chat context", () => {
    mount("/about/");
    click(launcher());
    expect(panel()).toBeTruthy();
    act(() => go("/contact/")); // both use the site-wide chat context
    expect(panel()).toBeNull();
    expect(host.querySelector(".chat-backdrop")).toBeNull();
    click(cta());
    expect(panel()).toBeTruthy();
    act(() => go("/learn/"));
    expect(panel()).toBeNull();
  });

  it("stays open on an in-page jump (same path, new hash)", () => {
    mount("/about/");
    click(launcher());
    act(() => go("/about/#team"));
    expect(panel()).toBeTruthy();
  });

  it("returns focus to the CTA that opened it", () => {
    mount("/about/");
    cta().focus();
    click(cta());
    expect(document.activeElement).toBe(closeX());
    click(closeX());
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(cta());
  });

  it("on Escape too, and falls back to the launcher when the browser did not focus the CTA (Safari, iOS)", () => {
    mount("/about/");
    click(cta()); // nothing focused: Safari does not focus a tapped link
    expect(panel()).toBeTruthy();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it("phones: header, main and footer are inert while it is open, and not after", () => {
    mount("/about/", true);
    const page = () => [host.querySelector(".site-header")!, host.querySelector("#main")!, host.querySelector(".site-footer")!];
    expect(page().every(Boolean)).toBe(true);
    cta().focus();
    click(cta());
    for (const el of page()) expect(el.hasAttribute("inert"), el.tagName).toBe(true);
    expect(launcher().closest("[inert]")).toBeNull();
    click(closeX());
    for (const el of page()) expect(el.hasAttribute("inert"), el.tagName).toBe(false);
    expect(document.activeElement).toBe(cta());
  });

  it("phones: Back while it is open closes it and focus still reaches the new page's <main> (not stuck on the inert page)", () => {
    // browsers refuse focus inside an inert subtree; jsdom does not, so the rule is applied here for this test
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, o?: FocusOptions) { if (!this.closest("[inert]")) focus.call(this, o); };
    try {
      mount("/about/", true);
      act(() => go("/contact/"));
      click(launcher());
      expect(host.querySelector("#main")!.hasAttribute("inert")).toBe(true);
      act(() => (go as unknown as (n: number) => void)(-1)); // the phone's Back
      expect(panel()).toBeNull();
      expect(host.querySelector("[inert]")).toBeNull();
      expect(document.activeElement).toBe(host.querySelector("#main"));
    } finally { HTMLElement.prototype.focus = focus; }
  });

  it("wider screens: the page stays usable (the panel is not modal there)", () => {
    mount("/about/");
    click(launcher());
    expect(host.querySelector("[inert]")).toBeNull();
  });

  it("the privacy link opens the apex privacy notice in a new tab, so the panel is not lost mid-consent", () => {
    mount("/about/");
    click(launcher());
    const a = [...panel()!.querySelectorAll("a")].find((x) => x.textContent === "Privacy notice")!;
    expect(a.getAttribute("href")).toBe("https://sortmycover.co.za/privacy/");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("after a page change (focus on <main>) or an 'On this page' tap (focus on a heading), closing goes to the launcher", () => {
    mount("/about/");
    act(() => go("/contact/"));
    expect(document.activeElement).toBe(host.querySelector("#main")); // the Layout moves focus to the new page's content
    click(cta()); // a tap: Safari does not focus the link, so focus is still on <main>
    click(closeX());
    expect(document.activeElement).toBe(launcher());
    const h2 = document.createElement("h2");
    h2.tabIndex = -1;
    host.querySelector("#main")!.appendChild(h2);
    h2.focus();
    click(cta());
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.activeElement).toBe(launcher());
  });

  it("phones: the skip link is inert too, so the keyboard cannot leave the panel through it", () => {
    mount("/about/", true);
    const skip = host.querySelector("a.skip")!;
    click(launcher());
    expect(skip.hasAttribute("inert")).toBe(true);
    click(closeX());
    expect(skip.hasAttribute("inert")).toBe(false);
  });

  it("a tick for an adviser does not carry over to a will consultant (or back)", () => {
    mount("/about/");
    const box = () => panel()!.querySelector("input[type=checkbox]") as HTMLInputElement;
    click(cta()); // cover: one authorised adviser
    expect(panel()!.textContent).toContain("one authorised adviser");
    click(box());
    expect(box().checked).toBe(true);
    click(closeX());
    act(() => openChat({ topic: "a will", ref: "w-test-wills", wills: true }));
    expect(panel()!.textContent).toContain("a will consultant");
    expect(box().checked).toBe(false);
    click(panel()!.querySelector(".chat-go")!);
    expect(panel()!.querySelector("[role=alert]")).toBeTruthy(); // Open WhatsApp asks for the tick first
    click(box());
    click(closeX());
    click(cta());
    expect(box().checked).toBe(false);
  });
});
