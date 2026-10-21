// @vitest-environment jsdom
/* Footer motion (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 6), with Motion mocked: the arrival plays once per visit, only when
   armed below the fold, never offsets what is on screen, never touches opacity, .f-base or a disclosure, and always comes home.
   footerGroupToggle reads the open state before toggling, so the chevron goes to 0deg on close. */
/* Reviewer findings, 21 Oct 2026: the failsafe no longer spends the arrival off screen (it plays only on a visible footer and the arm
   observer re-arms); the chevron animates to one target (no snap back to a start keyframe on an interrupting tap); a tap during the
   close glide reopens the group; the list is clipped only while it glides (the clip cut the links' focus rings). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type View = { el: Element; cb: () => unknown; opts: any };
const views: View[] = [];
const calls: { el: any; kf: any; opts: any }[] = [];
let settle: () => void = () => {};
vi.mock("motion/mini", () => ({
  animate: (el: any, kf: any, opts: any) => { calls.push({ el, kf, opts }); return { finished: new Promise<void>((r) => { const prev = settle; settle = () => { prev(); r(); }; }), cancel() {} }; },
}));
vi.mock("motion", () => ({
  inView: (el: Element, cb: () => unknown, opts: any) => { views.push({ el, cb, opts }); return () => {}; },
  scroll: () => () => {}, hover: () => () => {}, press: () => () => {},
  spring: function spring() { return {}; },
  stagger: (n: number, o: { startDelay?: number } = {}) => (i: number) => (o.startDelay ?? 0) + i * n,
}));

import { spring } from "motion";
import { FOOTER_FAILSAFE_MS, footerMotion, resetFooterMotion, settleOnEnter } from "../src/lib/pageMotion";
import { footerGroupToggle } from "../src/lib/motion";

let top = 2000;
function media({ reduce = false, fine = false } = {}) {
  window.matchMedia = ((q: string) => ({ matches: (reduce && q.includes("reduce")) || (fine && q.includes("pointer: fine")), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
}
function footer() {
  document.body.innerHTML = `<footer class="site-footer" data-footer><span class="f-rule"></span><div class="wrap"><div class="f-top">
    <div class="f-brand" data-f-settle><a class="btn f-cta" href="#">Chat on WhatsApp</a></div>
    <nav aria-label="Footer"><details class="f-group" open data-f-settle><summary><h2>A</h2><svg class="f-chev"></svg></summary><ul class="f-links"><li><a href="/a/">a</a></li><li><a href="/b/">b</a></li></ul></details>
    <details class="f-group" open data-f-settle><summary><h2>B</h2></summary><ul class="f-links"><li><a href="/c/">c</a></li></ul></details></nav></div>
    <div class="f-base"><p class="f-line" data-disclosure>line</p><nav aria-label="Legal"><ul class="f-legal"><li><a href="/legal/">Legal</a></li></ul></nav></div></div></footer>`;
  const f = document.querySelector<HTMLElement>("footer")!;
  f.getBoundingClientRect = () => ({ top, bottom: top + 600, left: 0, right: 390, width: 390, height: 600, x: 0, y: top, toJSON() {} }) as DOMRect;
  return f;
}
const arm = () => views.find((v) => v.opts?.margin)!;
const play = () => views.find((v) => v.opts?.amount)!;
const settleItems = (f: HTMLElement) => [...f.querySelectorAll<HTMLElement>("[data-f-settle]")];
const untouched = (f: HTMLElement) => [...f.querySelectorAll<HTMLElement>(".f-base, .f-base *, [data-disclosure]")];

beforeEach(() => {
  vi.useFakeTimers();
  views.length = 0; calls.length = 0; settle = () => {};
  top = 2000;
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  media();
  resetFooterMotion();
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

describe("footerMotion: arrival", () => {
  it("is a no-op under reduced motion: no observers, no animation, no inline styles", () => {
    media({ reduce: true });
    const f = footer();
    footerMotion(f);
    expect(views).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(f.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("arms below the fold (rule scaleX(0), items 18px down), plays on view with a spring and stagger, and comes home", async () => {
    const f = footer();
    footerMotion(f);
    expect(arm().opts.margin).toBe("0px 0px 320px 0px");
    expect(play().opts.amount).toBe(0.12);
    arm().cb();
    expect(f.querySelector<HTMLElement>(".f-rule")!.style.transform).toBe("scaleX(0)");
    for (const i of settleItems(f)) expect(i.style.transform).toBe("translateY(18px)");
    top = 500; // scrolled into view
    play().cb();
    const items = calls.find((c) => Array.isArray(c.el))!;
    expect(items.opts.type).toBe(spring);
    expect(items.opts.visualDuration).toBe(0.55);
    expect(items.opts.bounce).toBe(0.12);
    expect(items.opts.delay(0, 3)).toBeCloseTo(0.08);
    expect(items.opts.delay(2, 3)).toBeCloseTo(0.22);
    expect(items.kf.transform).toEqual(["translateY(18px)", "none"]);
    expect(calls.find((c) => c.el === f.querySelector(".f-rule"))!.kf.transform).toEqual(["scaleX(0)", "scaleX(1)"]);
    settle();
    await vi.runAllTimersAsync();
    for (const i of [...settleItems(f), f.querySelector<HTMLElement>(".f-rule")!]) expect(i.style.transform).toBe("");
  });

  it("never writes opacity and never touches .f-base or a [data-disclosure]", () => {
    const f = footer();
    footerMotion(f);
    arm().cb(); play().cb();
    for (const c of calls) {
      expect(Object.keys(c.kf)).not.toContain("opacity");
      const els: Element[] = Array.isArray(c.el) ? c.el : [c.el];
      for (const e of els) expect(e.closest(".f-base, [data-disclosure]")).toBeNull();
    }
    for (const el of f.querySelectorAll<HTMLElement>("*")) expect(el.style.opacity).toBe("");
    for (const el of untouched(f)) expect(el.getAttribute("style") ?? "").toBe("");
  });

  it("plays once per visit, across two calls (route changes)", () => {
    const f = footer();
    const off = footerMotion(f);
    arm().cb(); play().cb();
    const n = calls.length;
    off();
    views.length = 0;
    footerMotion(f);
    expect(views).toHaveLength(0); // nothing armed again: only the magnetic button remains
    expect(calls).toHaveLength(n);
  });

  it("does nothing (no offset) when the footer is already on screen at arm time, and never plays later", () => {
    top = 400;
    const f = footer();
    footerMotion(f);
    arm().cb();
    for (const i of settleItems(f)) expect(i.style.transform).toBe("");
    expect(f.querySelector<HTMLElement>(".f-rule")!.style.transform).toBe("");
    play().cb();
    expect(calls).toHaveLength(0);
  });

  it("play before arming does nothing (a jump straight to the footer never snaps down)", () => {
    const f = footer();
    footerMotion(f);
    play().cb();
    expect(calls).toHaveLength(0);
    for (const i of settleItems(f)) expect(i.style.transform).toBe("");
  });

  // Changed on purpose (reviewer finding, 21 Oct 2026): the failsafe used to play the arrival 4 s after arming wherever the footer
  // was, so a slow reader of the last half-screen never saw it (it ran off screen, once per visit). It now guards a VISIBLE footer.
  it("the 4 s failsafe plays the arrival and puts everything home when the footer is on screen, even if the play observer never fires", () => {
    const f = footer();
    footerMotion(f);
    arm().cb();
    top = 500; // on screen, but the play observer never reported
    vi.advanceTimersByTime(FOOTER_FAILSAFE_MS);
    expect(calls.some((c) => Array.isArray(c.el))).toBe(true);
    for (const i of [...settleItems(f), f.querySelector<HTMLElement>(".f-rule")!]) expect(i.style.transform).toBe("");
  });
  it("the failsafe does not use the arrival up off screen: a slow reader still sees it when the footer scrolls in", () => {
    const f = footer();
    footerMotion(f);
    arm().cb(); // footer within 320px below the viewport, still off screen
    vi.advanceTimersByTime(FOOTER_FAILSAFE_MS * 3); // a long read of the last half-screen
    expect(calls).toHaveLength(0);
    top = 500;
    play().cb();
    expect(calls.some((c) => Array.isArray(c.el) && c.kf.transform[0] === "translateY(18px)")).toBe(true);
  });
  it("scrolling back away before it plays puts the footer home, and the arrival re-arms on the way back", () => {
    const f = footer();
    footerMotion(f);
    const leave = arm().cb() as () => void;
    expect(typeof leave).toBe("function"); // keeps observing
    leave();
    for (const i of [...settleItems(f), f.querySelector<HTMLElement>(".f-rule")!]) expect(i.style.transform).toBe("");
    vi.advanceTimersByTime(FOOTER_FAILSAFE_MS * 2);
    expect(calls).toHaveLength(0);
    arm().cb(); // back within 320px
    for (const i of settleItems(f)) expect(i.style.transform).toBe("translateY(18px)");
    top = 500;
    play().cb();
    expect(calls.length).toBeGreaterThan(0);
  });
  it("a play report before arming is ignored, not used up: the play observer keeps observing until it has played", () => {
    const f = footer();
    footerMotion(f);
    expect(typeof play().cb()).toBe("function");
    arm().cb();
    top = 500;
    expect(play().cb()).toBeUndefined(); // played: stop observing
    expect(calls.length).toBeGreaterThan(0);
  });

  it("cleanup before it plays restores the rest state", () => {
    const f = footer();
    const off = footerMotion(f);
    arm().cb();
    off();
    for (const i of [...settleItems(f), f.querySelector<HTMLElement>(".f-rule")!]) expect(i.style.transform).toBe("");
  });

  it("the footer WhatsApp button is magnetic on a mouse and springs home on leave", () => {
    media({ fine: true });
    const f = footer();
    footerMotion(f);
    const b = f.querySelector<HTMLElement>(".f-cta")!;
    b.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON() {} }) as DOMRect;
    b.dispatchEvent(Object.assign(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }), {}));
    expect(b.style.transform).toBe("translate(6.0px, 4.0px)");
    b.dispatchEvent(new MouseEvent("pointerleave"));
    const leave = calls.find((c) => c.el === b)!;
    expect(leave.opts).toMatchObject({ type: spring, stiffness: 300, damping: 18 });
  });
});

describe("footerGroupToggle (phone accordion)", () => {
  const group = (open: boolean) => {
    footer();
    const d = document.querySelector<HTMLDetailsElement>("details.f-group")!;
    d.open = open;
    return { d, list: d.querySelector<HTMLElement>(".f-links")!, chev: d.querySelector<HTMLElement>(".f-chev")! };
  };
  it("on close, the chevron springs to 0deg (open state read before toggling) and its inline style is cleared", async () => {
    const { d, list, chev } = group(true);
    const e = { preventDefault: vi.fn() };
    footerGroupToggle(d, list, chev, e);
    expect(e.preventDefault).toHaveBeenCalled();
    const c = calls.find((x) => x.el === chev)!;
    // one target, so mini animate starts from the chevron's current angle (was ["rotate(180deg)", "rotate(0deg)"], which snapped back
    // to 180deg when a second tap interrupted the turn; reviewer finding, 21 Oct 2026)
    expect(c.kf.transform).toBe("rotate(0deg)");
    expect(c.opts).toMatchObject({ type: spring, visualDuration: 0.3, bounce: 0.25 });
    expect(calls.some((x) => Array.isArray(x.el))).toBe(false); // no cascade on close
    chev.style.transform = "rotate(90deg)"; // mid-flight
    settle();
    await vi.runAllTimersAsync();
    expect(chev.style.transform).toBe("");
    expect(d.open).toBe(false);
  });
  it("on open, the chevron goes to 180deg and the links cascade down 6px (transform only)", () => {
    const { d, list, chev } = group(false);
    footerGroupToggle(d, list, chev, { preventDefault() {} });
    expect(d.open).toBe(true);
    expect(calls.find((x) => x.el === chev)!.kf.transform).toBe("rotate(180deg)"); // one target (see the close test)
    const lis = calls.find((x) => Array.isArray(x.el))!;
    expect(lis.el).toHaveLength(2);
    expect(lis.kf).toEqual({ transform: ["translateY(-6px)", "none"] });
  });
  it("a tap during the close glide reopens the group (it does not close it a second time) and the chevron turns back from where it is", async () => {
    const { d, list, chev } = group(true);
    footerGroupToggle(d, list, chev, { preventDefault() {} }); // close: d.open stays true for the glide
    expect(d.open).toBe(true);
    calls.length = 0;
    footerGroupToggle(d, list, chev, { preventDefault() {} }); // second tap ~150ms in
    expect(calls.find((x) => x.el === chev)!.kf.transform).toBe("rotate(180deg)");
    expect(calls.find((x) => x.el === list)!.kf.height).toMatch(/^\d+px$/); // one keyframe: from the current height
    expect(calls.some((x) => Array.isArray(x.el))).toBe(false); // no link cascade on a reopen
    settle(); // the superseded close glide finishes
    await vi.runAllTimersAsync();
    expect(d.open).toBe(true);
  });
  it("the list is clipped only while it glides (the clip cut the links' focus rings at rest)", async () => {
    const { d, list, chev } = group(true);
    expect(list.style.overflow).toBe("");
    footerGroupToggle(d, list, chev, { preventDefault() {} });
    expect(list.style.overflow).toBe("hidden");
    settle();
    await vi.runAllTimersAsync();
    expect(list.style.overflow).toBe("");
    expect(list.style.height).toBe("");
    footerGroupToggle(d, list, chev, { preventDefault() {} }); // open again
    expect(list.style.overflow).toBe("hidden");
    settle();
    await vi.runAllTimersAsync();
    expect(list.style.overflow).toBe("");
  });
  it("reduced motion: the native toggle (no preventDefault, no animation)", () => {
    media({ reduce: true });
    const { d, list, chev } = group(true);
    const e = { preventDefault: vi.fn() };
    footerGroupToggle(d, list, chev, e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

describe("settleOnEnter", () => {
  it("springs a centred element to its CSS rest transform, not to none (the money-flow x-mark no longer drifts 12px off centre)", () => {
    const el = document.createElement("span");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ top: 2000, bottom: 2024, left: 0, right: 24, width: 24, height: 24, x: 0, y: 2000, toJSON() {} }) as DOMRect;
    settleOnEnter(el, "translate(-50%,-50%) scale(1.6) rotate(-45deg)", { to: "translate(-50%,-50%)" });
    views[views.length - 1].cb();
    expect(calls[0].kf.transform).toEqual(["translate(-50%,-50%) scale(1.6) rotate(-45deg)", "translate(-50%,-50%)"]);
    calls.length = 0;
    const other = document.createElement("div");
    other.getBoundingClientRect = el.getBoundingClientRect;
    settleOnEnter(other, "translateY(26px)");
    views[views.length - 1].cb();
    expect(calls[0].kf.transform).toEqual(["translateY(26px)", "none"]); // default unchanged
  });
});
