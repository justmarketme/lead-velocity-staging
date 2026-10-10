// @vitest-environment jsdom
/* A reveal wrapper must be visible by default: nothing in the first viewport is ever hidden, anything hidden below the fold is
   restored by scroll, by inView, and unconditionally by a timer, and cleanup always restores. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/mini", () => ({ animate: () => ({ finished: new Promise(() => {}), cancel() {} }) })); // an animation that never settles
vi.mock("motion", () => ({ inView: () => () => {}, scroll: () => () => {}, stagger: () => 0, hover: () => () => {}, press: () => () => {}, spring: () => ({ next: () => ({ value: 1, done: true }) }) }));

import { REVEAL_FAILSAFE_MS, revealChildren } from "../src/lib/motion";

const rect = (top: number) => ({ top, bottom: top + 50, left: 0, right: 100, width: 100, height: 50, x: 0, y: top, toJSON() {} }) as DOMRect;

function setup(tops: number[]) {
  document.body.innerHTML = `<div id="c">${tops.map((_, i) => `<div data-r="${i}">item</div>`).join("")}</div>`;
  const c = document.getElementById("c") as HTMLElement;
  Array.from(c.children).forEach((el, i) => { (el as HTMLElement).getBoundingClientRect = () => rect(tops[i]); });
  return { c, items: Array.from(c.children) as HTMLElement[] };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

describe("revealChildren: visible by default", () => {
  it("never hides anything inside the first viewport", () => {
    const { c, items } = setup([100, 400, 790]);
    revealChildren(c, "[data-r]");
    for (const el of items) expect(el.style.opacity).toBe("");
  });
  it("hides only items below the fold, and restores them with the unconditional timer", () => {
    const { c, items } = setup([300, 900, 1400]);
    revealChildren(c, "[data-r]");
    expect(items.map((e) => e.style.opacity)).toEqual(["", "0", "0"]);
    vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 1600); // even though the animation promise never settles
    expect(items.map((e) => e.style.opacity)).toEqual(["", "", ""]);
  });
  it("the failsafe is about two seconds", () => expect(REVEAL_FAILSAFE_MS).toBeLessThanOrEqual(2500));
  it("restores on a scroll that brings an item near the viewport, even if inView never fires", () => {
    const { c, items } = setup([900, 1400]);
    revealChildren(c, "[data-r]");
    items[0].getBoundingClientRect = () => rect(300); // the user scrolled
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1700);
    expect(items.map((e) => e.style.opacity)).toEqual(["", ""]);
  });
  it("cleanup restores everything immediately", () => {
    const { c, items } = setup([900, 1400]);
    const off = revealChildren(c, "[data-r]");
    off();
    expect(items.map((e) => e.style.opacity)).toEqual(["", ""]);
  });
  it("does nothing at all under prefers-reduced-motion", () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
    const { c, items } = setup([900, 1400]);
    revealChildren(c, "[data-r]");
    for (const el of items) expect(el.style.opacity).toBe("");
  });
  it("survives a missing animation engine (restores instead of leaving content hidden)", async () => {
    vi.resetModules();
    vi.doMock("motion/mini", () => ({ animate: () => { throw new Error("no WAAPI"); } }));
    const m = await import("../src/lib/motion");
    const { c, items } = setup([900]);
    m.revealChildren(c, "[data-r]");
    vi.advanceTimersByTime(m.REVEAL_FAILSAFE_MS + 10);
    expect(items[0].style.opacity).toBe("");
  });
});

describe("source guard: only the reveal helper may set opacity 0", () => {
  it("no other source file hides content", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk(path.resolve(__dirname, "../src")).filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith("motion.ts"))
      // the radio inputs behind .opt labels are visually hidden on purpose
      .filter((f) => fs.readFileSync(f, "utf8").split("\n").some((l) => /style\.opacity\s*=\s*["']0|opacity:\s*0\s*[;}]/.test(l) && !/^\.opt input/.test(l)));
    expect(offenders).toEqual([]);
  });
});
