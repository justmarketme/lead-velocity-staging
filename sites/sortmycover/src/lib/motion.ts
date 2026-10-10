/* Motion helpers. Rules (spec DEC-7, compliance S34/S35):
 *  - every effect is a no-op under prefers-reduced-motion, and content is fully visible at rest (nothing is left at opacity 0);
 *  - nothing here animates layout (opacity and transform only), so no layout shift;
 *  - nothing hides a required disclosure (identity block, consent text, how-we-make-money link). */
import { animate } from "motion/mini";
import { inView, scroll, stagger } from "motion";

export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

/** Scroll-linked reading progress: drives scaleX(0..1) of `bar` from the page scroll position. */
export function linkReadProgress(bar: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const stop = scroll((p: number) => { bar.style.transform = `scaleX(${p})`; });
  return () => { stop(); bar.style.transform = ""; };
}

/** Smooth open/close for a native <details> (content stays in the HTML for crawlers and no-JS). Returns a click handler for <summary>. */
export function toggleDetails(d: HTMLDetailsElement, body: HTMLElement, e: { preventDefault(): void }) {
  if (prefersReducedMotion()) return; // native instant toggle
  e.preventDefault();
  if (d.open) {
    const h = body.offsetHeight;
    animate(body, { height: [`${h}px`, "0px"] }, { duration: 0.22, ease: "easeOut" }).finished.then(() => { d.open = false; body.style.height = ""; }, () => { d.open = false; body.style.height = ""; });
  } else {
    d.open = true;
    const h = body.scrollHeight;
    animate(body, { height: ["0px", `${h}px`] }, { duration: 0.26, ease: "easeOut" }).finished.then(() => { body.style.height = ""; }, () => { body.style.height = ""; });
  }
}
