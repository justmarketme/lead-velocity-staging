// @vitest-environment jsdom
/* Spring timing bug (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 6, "Fix to an existing bug").
   The old springEase() sampled a spring into a CSS `linear(...)` string and passed it to mini animate as `ease`. Mini animate maps
   easing strings through motion-dom's supportedWaapiEasing table, which has no entry for a linear() string, so the browser got no
   easing at all and every "spring" played at constant speed. The fix passes `type: spring` (documented for motion/mini 14.1.0),
   which motion turns into a native linear() easing itself (or a 300 ms ease-out where linear() is unsupported). */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapEasingToNativeEasing } from "motion-dom";

const calls: { el: unknown; kf: unknown; opts: any }[] = [];
vi.mock("motion/mini", () => ({ animate: (el: unknown, kf: unknown, opts: any) => { calls.push({ el, kf, opts }); return { finished: Promise.resolve(), cancel() {} }; } }));
vi.mock("motion", async (orig) => {
  const real: any = await orig();
  // hover/press fire their start callback at once and call the returned end callback straight after, so both legs animate
  const gesture = (el: Element, fn: (e: Element) => void | (() => void)) => { const end = fn(el); if (typeof end === "function") end(); return () => {}; };
  return { ...real, hover: gesture, press: gesture, inView: () => () => {}, scroll: () => () => {} };
});

import { spring } from "motion";
import * as m from "../src/lib/motion";

beforeEach(() => {
  calls.length = 0;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  document.body.innerHTML = `<button class="btn">a</button><div id="p"></div>`;
});
afterEach(() => { document.body.innerHTML = ""; });

describe("root cause: mini animate drops a linear() easing string", () => {
  it("motion-dom maps a sampled linear(...) string to undefined, so WAAPI falls back to linear timing", () => {
    expect(mapEasingToNativeEasing("linear(0, 0.5, 1)" as any, 300)).toBeUndefined();
    // named easings and bezier arrays are mapped; that is why ease: "easeOut" and [0.22, 1, 0.36, 1] were never affected
    expect(mapEasingToNativeEasing("easeOut" as any, 300)).toBe("ease-out");
    expect(mapEasingToNativeEasing([0.22, 1, 0.36, 1] as any, 300)).toMatch(/^cubic-bezier\(/);
  });
});

describe("spring call sites pass type: spring, never a linear() string", () => {
  const noLinear = () => { for (const c of calls) expect(String(c.opts?.ease ?? "")).not.toMatch(/^linear\(/); };

  it("springGestures (hover and press, in and out)", () => {
    m.springGestures(document, ".btn");
    expect(calls.length).toBe(4);
    noLinear();
    for (const c of calls) expect(c.opts.type).toBe(spring);
  });
  it("slideIn and popIn", () => {
    m.slideIn(document.getElementById("p")!);
    m.popIn(document.getElementById("p")!);
    expect(calls.length).toBe(2);
    noLinear();
    for (const c of calls) expect(c.opts.type).toBe(spring);
  });
  it("pulse stays a short ease-out tween (no dead springEase sample)", () => {
    m.pulse(document.getElementById("p")!);
    expect(calls.length).toBe(1);
    noLinear();
  });
});

describe("source guard: no hand-sampled spring easing anywhere in src", () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const files = walk(resolve(__dirname, "../src")).filter((f) => /\.tsx?$/.test(f));
  it("springEase / springDuration are gone and no ease is cast through `as any`", () => {
    const offenders = files.filter((f) => /springEase|springDuration|ease:\s*ease\s+as\s+any/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
