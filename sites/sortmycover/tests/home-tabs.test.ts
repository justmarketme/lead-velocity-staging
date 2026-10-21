// @vitest-environment jsdom
/* Home "What changed?" tabs: on a phone the strip is wider than the screen (about 541px against 328px at 360px), so choosing
   a tab must scroll the strip (never the page) to it, nothing may scroll on first load (the tabs sit below the fold), and
   the fade that hints at more tabs shows only while some are still hidden. jsdom has no layout, so widths are stubbed. */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentPicker } from "../src/components/HomeMotion";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TAB_W = 104, STRIP_W = 540, VIEW_W = 328;
let root: Root;
let host: HTMLDivElement;
let stripScroll: ReturnType<typeof vi.fn>;
let pageScroll: ReturnType<typeof vi.fn>;
let restore: (() => void)[] = [];

function stub<T extends object>(proto: T, key: string, get: (this: HTMLElement) => unknown) {
  const was = Object.getOwnPropertyDescriptor(proto, key);
  Object.defineProperty(proto, key, { configurable: true, get });
  restore.push(() => (was ? Object.defineProperty(proto, key, was) : delete (proto as any)[key]));
}
const isStrip = (el: HTMLElement) => el.classList.contains("hx-tabs");
const tabIndex = (el: HTMLElement) => [...(el.parentElement?.querySelectorAll("[role=tab]") ?? [])].indexOf(el);

beforeEach(() => {
  // reduced motion: keeps Motion's animate() out of jsdom; the strip must still scroll (instantly) for these readers
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  stub(HTMLElement.prototype, "scrollWidth", function () { return isStrip(this) ? STRIP_W : 0; });
  stub(HTMLElement.prototype, "clientWidth", function () { return isStrip(this) ? VIEW_W : 0; });
  stub(HTMLElement.prototype, "offsetWidth", function () { return this.getAttribute("role") === "tab" ? TAB_W : 0; });
  stub(HTMLElement.prototype, "offsetLeft", function () { return this.getAttribute("role") === "tab" ? 6 + tabIndex(this) * (TAB_W + 4) : 0; });
  stripScroll = vi.fn();
  pageScroll = vi.fn();
  (HTMLElement.prototype as any).scrollTo = function (this: HTMLElement, o: unknown) { if (isStrip(this)) stripScroll(o); };
  (HTMLElement.prototype as any).scrollIntoView = pageScroll;
  window.scrollTo = pageScroll as any;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, null, h(MomentPicker))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  restore.reverse().forEach((r) => r());
  restore = [];
  delete (HTMLElement.prototype as any).scrollTo;
  delete (HTMLElement.prototype as any).scrollIntoView;
});

const strip = () => host.querySelector(".hx-tabs") as HTMLElement;
const tab = (label: string) => [...host.querySelectorAll<HTMLElement>("[role=tab]")].find((b) => b.textContent === label)!;

describe("What changed? tabs on a narrow screen", () => {
  it("nothing scrolls on first load", () => {
    expect(stripScroll).not.toHaveBeenCalled();
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("choosing a tab centres it in the strip and never scrolls the page", () => {
    act(() => tab("A will").click());
    expect(tab("A will").getAttribute("aria-selected")).toBe("true");
    const left = 6 + 4 * (TAB_W + 4) - (VIEW_W - TAB_W) / 2;
    expect(stripScroll).toHaveBeenCalledWith({ left, behavior: "auto" });
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("the arrow keys bring the new tab into view as well", () => {
    act(() => { strip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(tab("A will").getAttribute("aria-selected")).toBe("true");
    expect(stripScroll).toHaveBeenCalledTimes(1);
  });

  it("the more-tabs fade shows only while tabs are hidden", () => {
    expect(strip().dataset.more).toBe("true");
    Object.defineProperty(strip(), "scrollLeft", { configurable: true, value: STRIP_W - VIEW_W });
    act(() => { strip().dispatchEvent(new Event("scroll")); });
    expect(strip().dataset.more).toBe("false");
  });
});

describe("What changed? tabs on a wide screen", () => {
  it("no scroll and no fade when every tab fits", () => {
    stub(HTMLElement.prototype, "clientWidth", function () { return isStrip(this) ? STRIP_W : 0; });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(strip().dataset.more).toBe("false");
    act(() => tab("New baby").click());
    expect(stripScroll).not.toHaveBeenCalled();
  });
});
