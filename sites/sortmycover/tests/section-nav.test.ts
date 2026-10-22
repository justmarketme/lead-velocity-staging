// @vitest-environment jsdom
/* "On this page" (SectionNav + pageMotion sectionTracker). The wide rail is held open; once the window narrows below 1240px
   (tablet rotation, resize) it must close and drop the rail's leftover shift. On a phone the list closes on a tap outside or
   Escape (phones only: Escape also closes the chat, and the wide rail cannot be reopened by hand). A tap on a section moves
   focus to that heading and keeps React Router's history state. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Motion is not under test (jsdom has no Web Animations or IntersectionObserver)
vi.mock("motion/mini", () => ({ animate: () => ({ finished: Promise.resolve(), stop() {}, cancel() {} }) }));
vi.mock("motion", async (real) => ({ ...(await real<typeof import("motion")>()), scroll: () => () => {}, inView: () => () => {} }));

import { SectionNav, sectionId } from "../src/components/Interactive";
import { sectionTracker } from "../src/lib/pageMotion";

const ITEMS = ["What it is", "Who needs it", "How much"];
let wide = false;
let main: HTMLElement;
let off: () => void;

beforeEach(() => {
  wide = false;
  window.matchMedia = ((q: string) => ({ matches: q.includes("min-width: 1240px") ? wide : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
  main = document.createElement("main");
  main.innerHTML = `<div class="prose-sm">${renderToStaticMarkup(h(SectionNav, { items: ITEMS }))}${ITEMS.map((t) => `<h2 id="${sectionId(t)}">${t}</h2><p>text</p>`).join("")}</div>`;
  document.body.appendChild(main);
});
afterEach(() => { off?.(); main.remove(); });

const box = () => main.querySelector("details") as HTMLDetailsElement;
const nav = () => main.querySelector("[data-toc]") as HTMLElement;
const link = (t: string) => [...nav().querySelectorAll("a")].find((a) => a.textContent === t) as HTMLAnchorElement;
const tap = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("On this page", () => {
  it("the list is valid HTML: only <li> inside the <ol>, the marker hidden from screen readers", () => {
    const ol = nav().querySelector("ol")!;
    expect([...ol.children].every((c) => c.tagName === "LI")).toBe(true);
    expect(ol.querySelector(".toc-ind")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("closes, and drops the rail's shift, when a wide window narrows below 1240px", () => {
    wide = true;
    off = sectionTracker(main);
    expect(box().open).toBe(true);
    box().style.transform = "translateX(-18px)";
    wide = false;
    window.dispatchEvent(new Event("resize"));
    expect(box().open).toBe(false);
    expect(box().style.transform).toBe("");
  });

  it("on a phone: a tap outside closes the list, a tap inside does not", () => {
    off = sectionTracker(main);
    box().open = true;
    tap(nav().querySelector("ol")!);
    expect(box().open).toBe(true);
    tap(document.body);
    expect(box().open).toBe(false);
  });

  it("on a phone: Escape closes the list and returns focus to its summary", () => {
    off = sectionTracker(main);
    box().open = true;
    link("Who needs it").focus();
    escape();
    expect(box().open).toBe(false);
    expect(document.activeElement).toBe(nav().querySelector("summary"));
  });

  it("on a wide screen: Escape and a tap outside leave the rail open", () => {
    wide = true;
    off = sectionTracker(main);
    escape();
    tap(document.body);
    expect(box().open).toBe(true);
  });

  it("a tap on a section focuses that heading and keeps the router's history state", () => {
    history.replaceState({ usr: null, key: "k1", idx: 2 }, "");
    off = sectionTracker(main);
    box().open = true;
    link("How much").click();
    const target = document.getElementById(sectionId("How much"))!;
    expect(box().open).toBe(false);
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute("tabindex")).toBe("-1");
    expect(location.hash).toBe("#" + sectionId("How much"));
    expect(history.state).toEqual({ usr: null, key: "k1", idx: 2 });
  });
});
