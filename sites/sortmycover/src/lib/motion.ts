/* Motion helpers (free MIT `motion` 14.1.0; no Motion+ code). Guardrails (spec DEC-7, compliance S34/S35, Jonathan's rules):
 *  - every effect is a no-op under prefers-reduced-motion, and content is fully visible at rest (nothing is left at opacity 0);
 *  - only opacity and transform are animated (no layout shift); the H1, hero text and primary CTA are never faded in;
 *  - nothing hides a required disclosure; nothing auto-loops (every animation runs once or follows the user's scroll/tap);
 *  - exit animations are under 100 ms so they never block the next tap (INP);
 *  - animateView, animateLayout and every Motion+ API are NOT used (animateView injects inline style; layout is 28 KB).
 *  Motion APIs used: animate (motion/mini), spring (to build a CSS linear() spring easing for WAAPI), stagger, inView, scroll, hover, press. */
import { animate } from "motion/mini";
import { hover, inView, press, scroll, spring, stagger } from "motion";

export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---- spring physics: sample Motion's spring generator into a CSS linear() easing so the (small) mini animate can play it natively ---- */
const cache: Record<string, string> = {};
export function springEase(stiffness = 520, damping = 22, mass = 1): string {
  const key = `${stiffness}/${damping}/${mass}`;
  if (cache[key]) return cache[key];
  const gen = spring({ keyframes: [0, 1], stiffness, damping, mass, restDelta: 0.001, restSpeed: 0.01 } as any);
  const pts: number[] = [];
  let t = 0, done = false;
  while (!done && t < 1500) { const s = gen.next(t); pts.push(+(s.value as number).toFixed(4)); done = s.done; t += 16; }
  pts.push(1);
  return (cache[key] = `linear(${pts.join(", ")})`);
}
/** Duration (seconds) that matches the sampled spring. */
export const springDuration = (easing: string) => Math.min(1.2, ((easing.split(",").length - 1) * 16) / 1000);

/* ---- (a) staggered scroll reveal ---- */
/** Staggered reveal of child elements the first time `container` scrolls into view. Elements already in view at load are left alone. */
export function revealChildren(container: HTMLElement, selector: string): () => void {
  if (prefersReducedMotion()) return () => {};
  const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
  if (!items.length) return () => {};
  const rect = container.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.85) return () => {}; // already visible: no flash, no motion
  items.forEach((el) => { el.style.opacity = "0"; });
  let restored = false;
  const restore = () => { if (restored) return; restored = true; items.forEach((el) => { el.style.opacity = ""; el.style.transform = ""; }); };
  const failsafe = window.setTimeout(restore, 4000); // never leave content hidden if the observer does not fire
  const stop = inView(container, () => {
    window.clearTimeout(failsafe);
    const a = animate(items, { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0px)"] }, { duration: 0.45, delay: stagger(0.12), ease: "easeOut" });
    a.finished.then(restore, restore);
    return undefined;
  }, { amount: 0.25 });
  return () => { window.clearTimeout(failsafe); stop(); restore(); };
}

/* ---- (b) scroll-linked storytelling ---- */
/** Scroll-linked reading progress: drives scaleX(0..1) of `bar` from the page scroll position. */
export function linkReadProgress(bar: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const stop = scroll((p: number) => { bar.style.transform = `scaleX(${p})`; });
  return () => { stop(); bar.style.transform = ""; };
}
/** A line that draws itself as `track` scrolls through the viewport (fully drawn at rest and for reduced motion). */
export function drawLineOnScroll(track: HTMLElement, line: HTMLElement, axis: "x" | "y"): () => void {
  if (prefersReducedMotion()) return () => {};
  const set = (p: number) => { line.style.transform = axis === "x" ? `scaleX(${p})` : `scaleY(${p})`; };
  set(0);
  const stop = scroll((p: number) => set(Math.min(1, p * 1.15)), { target: track, offset: ["start 0.85", "end 0.6"] });
  return () => { stop(); line.style.transform = ""; };
}
/** Subtle parallax: translateY from 0 to -`px` while the element scrolls through the viewport. Transform only. */
export function parallax(el: HTMLElement | SVGElement, px = 18): () => void {
  if (prefersReducedMotion()) return () => {};
  const stop = scroll((p: number) => { el.style.transform = `translate3d(0, ${(-px * p).toFixed(1)}px, 0)`; }, { target: el, offset: ["start end", "end start"] });
  return () => { stop(); el.style.transform = ""; };
}

/* ---- (c) SVG path drawing (pathLength = 1, dash offset 1 -> 0) ---- */
export function drawPath(path: SVGGeometryElement, delay = 0, duration = 0.5): () => void {
  if (prefersReducedMotion()) return () => {};
  path.setAttribute("pathLength", "1");
  path.style.strokeDasharray = "1";
  const a = animate(path, { strokeDashoffset: [1, 0] }, { duration, delay, ease: "easeOut" });
  a.finished.then(() => { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; }, () => {});
  return () => { a.cancel(); path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; };
}

/* ---- (d) spring hover / press gestures ---- */
export function springGestures(root: ParentNode, selector: string): () => void {
  if (prefersReducedMotion()) return () => {};
  const ease = springEase();
  const dur = springDuration(ease);
  const to = (el: Element, s: number) => animate(el, { transform: `scale(${s})` }, { duration: dur, ease: ease as any });
  const cleanups: (() => void)[] = [];
  root.querySelectorAll(selector).forEach((el) => {
    cleanups.push(hover(el, () => { to(el, 1.03); return () => { to(el, 1); }; }));
    cleanups.push(press(el, () => { to(el, 0.97); return () => { to(el, 1); }; }));
  });
  return () => cleanups.forEach((c) => c());
}
/** One-shot spring pulse (a chosen quiz option, a picked slot). */
export function pulse(el: Element) {
  if (prefersReducedMotion()) return;
  const ease = springEase(600, 16);
  animate(el, { transform: ["scale(1)", "scale(1.04)", "scale(1)"] }, { duration: 0.32, ease: "easeOut" });
  void ease;
}
/** Validation shake. Reduced motion: no movement (the red border and message already carry the meaning). */
export function shake(el: Element) {
  if (prefersReducedMotion()) return;
  animate(el, { transform: ["translateX(0px)", "translateX(-6px)", "translateX(6px)", "translateX(-4px)", "translateX(4px)", "translateX(0px)"] }, { duration: 0.32 });
}

/* ---- (f) sticky bar sentinel ---- */
/** Calls onChange(true) once the sentinel has scrolled out of view (the visitor is past the hero), false when it is back. */
export function watchPastSentinel(sentinel: Element, onChange: (past: boolean) => void): () => void {
  onChange(false);
  return inView(sentinel, () => { onChange(false); return () => onChange(true); }, { amount: 0 });
}

/** Fade/slide a freshly shown element in. Used for the sticky bar. */
export function slideIn(el: Element) {
  if (prefersReducedMotion()) return;
  const ease = springEase(420, 28);
  animate(el, { transform: ["translateY(100%)", "translateY(0%)"], opacity: [0.4, 1] }, { duration: springDuration(ease), ease: ease as any });
}

/* ---- (e) smooth <details> (FAQ) ---- */
/** Smooth open/close for a native <details> (content stays in the HTML for crawlers and no-JS). */
export function toggleDetails(d: HTMLDetailsElement, body: HTMLElement, e: { preventDefault(): void }) {
  if (prefersReducedMotion()) return; // native instant toggle
  e.preventDefault();
  if (d.open) {
    const h = body.offsetHeight;
    animate(body, { height: [`${h}px`, "0px"] }, { duration: 0.2, ease: "easeOut" }).finished.then(() => { d.open = false; body.style.height = ""; }, () => { d.open = false; body.style.height = ""; });
  } else {
    d.open = true;
    const h = body.scrollHeight;
    animate(body, { height: ["0px", `${h}px`] }, { duration: 0.26, ease: "easeOut" }).finished.then(() => { body.style.height = ""; }, () => { body.style.height = ""; });
  }
}

/** Short exit for a panel before it is replaced (under 100 ms so the next tap is never blocked). */
export function leave(el: Element, done: () => void) {
  if (prefersReducedMotion()) { done(); return; }
  animate(el, { opacity: [1, 0], transform: ["translateX(0px)", "translateX(-10px)"] }, { duration: 0.09, ease: "easeIn" }).finished.then(done, done);
}

/** Calls onChange(true) while `el` is in the viewport and onChange(false) otherwise (initially false). */
export function watchInView(el: Element, onChange: (visible: boolean) => void): () => void {
  onChange(false);
  return inView(el, () => { onChange(true); return () => onChange(false); }, { amount: 0 });
}
