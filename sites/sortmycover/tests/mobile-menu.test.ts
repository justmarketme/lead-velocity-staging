// @vitest-environment jsdom
/* The mobile menu (a native <details> in the persistent header) must close when an item is chosen, on any route change,
   on Escape and on a tap outside it. Before the fix it stayed open after choosing an item on a phone. */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Header } from "../src/components/Layout";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let go: (to: string) => void = () => {};

function Nav() { go = useNavigate(); return null; }

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: ["/"] }, h(Nav), h(Header))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const menu = () => host.querySelector("details.menu") as HTMLDetailsElement;
const open = () => { menu().open = true; expect(menu().open).toBe(true); };
const item = (label: string) => [...menu().querySelectorAll("a")].find((a) => a.textContent === label) as HTMLAnchorElement;

describe("mobile menu closes", () => {
  it("is closed on load", () => expect(menu().open).toBe(false));

  it("when an item is chosen", () => {
    open();
    act(() => item("Cover types").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(menu().open).toBe(false);
  });

  it("when the chosen item is the page already open", () => {
    act(() => go("/learn/"));
    open();
    act(() => item("Learn").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(menu().open).toBe(false);
  });

  it("on any route change (back button, logo)", () => {
    open();
    act(() => go("/about/"));
    expect(menu().open).toBe(false);
  });

  it("on Escape, and focus returns to the menu button", () => {
    open();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(menu().querySelector("summary"));
  });

  it("on a tap outside, but not on a tap inside", () => {
    open();
    act(() => { menu().querySelector("nav")!.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(menu().open).toBe(true);
    act(() => { document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(menu().open).toBe(false);
  });
});

describe("mobile menu marks and keeps focus (21 Oct 2026)", () => {
  const current = () => [...menu().querySelectorAll("a")].filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent);

  it("marks the current section, as the desktop nav does", () => {
    expect(current()).toEqual([]);
    act(() => go("/learn/"));
    expect(current()).toEqual(["Learn"]);
    act(() => go("/learn/how-to-check-an-adviser/"));
    expect(current()).toEqual(["Learn"]);
  });

  it("a tap on the page already open puts focus on the Menu button, not on a link hidden in the closed menu", () => {
    act(() => go("/learn/"));
    open();
    item("Learn").focus();
    act(() => item("Learn").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(menu().querySelector("summary"));
  });
});

describe("mobile menu: first load and keyboard (21 Oct 2026 review)", () => {
  it("a menu opened before the app hydrates (native <details>) stays open; the next route change still closes it", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const tree = () => h(MemoryRouter, { initialEntries: ["/"] }, h(Nav), h(Header));
    const pre = document.createElement("div");
    pre.innerHTML = renderToString(tree());
    document.body.appendChild(pre);
    const d = pre.querySelector("details.menu") as HTMLDetailsElement;
    d.open = true; // tapped while the page was still loading
    let r!: Root;
    act(() => { r = hydrateRoot(pre, tree()); });
    expect(d.open).toBe(true);
    act(() => go("/about/"));
    expect(d.open).toBe(false);
    act(() => r.unmount());
    pre.remove();
  });

  it("closes when keyboard focus tabs out of it, not when focus moves between its own links", () => {
    open();
    const out = document.createElement("button");
    document.body.appendChild(out);
    const focusout = (from: Element, to: Element) => act(() => { from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to })); });
    focusout(item("Cover types"), item("Learn"));
    expect(menu().open).toBe(true);
    focusout(item("Contact"), out);
    expect(menu().open).toBe(false);
    out.remove();
  });
});
