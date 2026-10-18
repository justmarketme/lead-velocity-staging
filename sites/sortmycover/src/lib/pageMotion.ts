/* Inner-page motion system (Jono, 18 Oct 2026: "immersive, premium, interactive" on desktop and on mobile). Motion APIs checked
   against motion.dev docs via Context7: animate, scroll({ target, offset }), inView({ amount }), hover, press.
   Same guardrails as src/lib/motion.ts: nothing is ever hidden (only transforms move content; decoration may draw in), the H1 and
   the primary CTA are never faded in, every effect cleans up, and the whole system is off only when the visitor's OS asks for
   reduced motion. Phones get the full scroll choreography; pointer effects (tilt, spotlight, magnetic, pan) need a fine pointer. */
import { animate } from "motion/mini";
import { hover, inView, press, scroll } from "motion";
import { prefersReducedMotion, springDuration, springEase } from "./motion";

type Off = () => void;
const fine = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
let launcherDone = false;

/** Offsets a below-the-fold element now and springs it home when it scrolls in. The element stays fully visible throughout
    (transform only); a failsafe puts it home after 2.5 s whatever the observer does. */
function settleOnEnter(el: HTMLElement, from: string, opts: { amount?: number; delay?: number; stiffness?: number; damping?: number } = {}): Off {
  if (el.getBoundingClientRect().top < (window.innerHeight || 800)) return () => {};
  const ease = springEase(opts.stiffness ?? 260, opts.damping ?? 24);
  el.style.transform = from;
  let done = false;
  const home = () => { if (done) return; done = true; stop(); window.clearTimeout(t); animate(el, { transform: [from, "none"] }, { duration: springDuration(ease), delay: opts.delay ?? 0, ease: ease as any }).finished.then(clear, clear); };
  const clear = () => { el.style.transform = ""; };
  const stop = inView(el, () => { home(); return undefined; }, { amount: opts.amount ?? 0.35 });
  const t = window.setTimeout(home, 2500);
  return () => { done = true; stop(); window.clearTimeout(t); clear(); };
}

/** Decoration (rules, bars) that draws itself in. Purely decorative elements only. */
function drawOnEnter(el: HTMLElement, axis: "x" | "y", delay = 0): Off {
  const from = axis === "x" ? "scaleX(0)" : "scaleY(0)";
  el.style.transform = from;
  const stop = inView(el, () => { animate(el, { transform: [from, axis === "x" ? "scaleX(1)" : "scaleY(1)"] }, { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }); return undefined; }, { amount: 0.5 });
  const t = window.setTimeout(() => { el.style.transform = ""; }, 3000);
  return () => { stop(); window.clearTimeout(t); el.style.transform = ""; };
}

/** Photos: a slow scroll-linked zoom that settles as the frame crosses the viewport, with parallax inside the rounded frame. */
function photoScroll(img: HTMLElement): Off {
  const frame = img.parentElement as HTMLElement;
  let pan = { x: 0, y: 0 };
  let p = 0;
  const paint = () => { img.style.transform = `translate3d(${pan.x.toFixed(1)}px, ${((0.5 - p) * 44 + pan.y).toFixed(1)}px, 0) scale(${(1.16 - 0.1 * p).toFixed(3)})`; };
  const stop = scroll((v: number) => { p = v; paint(); }, { target: frame, offset: ["start end", "end start"] });
  const offs: Off[] = [stop];
  if (fine()) {
    const move = (e: PointerEvent) => { const r = frame.getBoundingClientRect(); pan = { x: ((e.clientX - r.left) / r.width - 0.5) * -18, y: ((e.clientY - r.top) / r.height - 0.5) * -12 }; paint(); };
    const leave = () => { pan = { x: 0, y: 0 }; paint(); };
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerleave", leave);
    offs.push(() => { frame.removeEventListener("pointermove", move); frame.removeEventListener("pointerleave", leave); });
  }
  return () => { offs.forEach((o) => o()); img.style.transform = ""; };
}

/** A soft glow that follows the pointer inside `area` (CSS custom properties read by the stylesheet). */
function pointerGlow(area: HTMLElement): Off {
  if (!fine()) return () => {};
  const move = (e: PointerEvent) => { const r = area.getBoundingClientRect(); area.style.setProperty("--gx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`); area.style.setProperty("--gy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`); };
  area.addEventListener("pointermove", move);
  return () => { area.removeEventListener("pointermove", move); area.style.removeProperty("--gx"); area.style.removeProperty("--gy"); };
}

/** Cards: on a mouse they tilt toward the cursor in 3D with a spotlight; on touch they spring when pressed. */
function cards(root: ParentNode): Off {
  const els = Array.from(root.querySelectorAll<HTMLElement>(".card-link"));
  if (!els.length) return () => {};
  const ease = springEase(320, 22);
  const dur = springDuration(ease);
  const offs: Off[] = [];
  if (fine()) {
    for (const c of els) {
      const move = (e: PointerEvent) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
        c.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
        c.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 6).toFixed(2)}deg) rotateY(${((x - 0.5) * 8).toFixed(2)}deg) translateY(-3px)`;
      };
      c.addEventListener("pointermove", move);
      offs.push(hover(c, () => () => { animate(c, { transform: "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)" }, { duration: dur, ease: ease as any }); }));
      offs.push(() => { c.removeEventListener("pointermove", move); c.style.transform = ""; });
    }
  } else {
    offs.push(press(els, (c) => { animate(c, { transform: "scale(0.97)" }, { duration: dur, ease: ease as any }); return () => { animate(c, { transform: "scale(1)" }, { duration: dur, ease: ease as any }); }; }));
  }
  return () => offs.forEach((o) => o());
}

/** Magnetic buttons on a mouse (the button leans toward the cursor and springs back). */
function magnetic(root: ParentNode): Off {
  if (!fine()) return () => {};
  const ease = springEase(300, 18);
  const dur = springDuration(ease);
  const offs: Off[] = [];
  root.querySelectorAll<HTMLElement>(".page-body .btn, .page-head .btn, .smc-campaign .hx-actions .btn").forEach((b) => {
    const move = (e: PointerEvent) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(1)}px, ${(((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1)}px)`; };
    const leave = () => { animate(b, { transform: "translate(0px, 0px)" }, { duration: dur, ease: ease as any }); };
    b.addEventListener("pointermove", move);
    b.addEventListener("pointerleave", leave);
    offs.push(() => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerleave", leave); b.style.transform = ""; });
  });
  return () => offs.forEach((o) => o());
}

/** The WhatsApp launcher springs in once per visit, then nudges once if the visitor has not opened it after a while. */
function launcher(): Off {
  const el = document.querySelector<HTMLElement>(".chat-launch");
  if (!el || launcherDone) return () => {};
  launcherDone = true;
  const ease = springEase(380, 20);
  animate(el, { transform: ["translateY(28px) scale(0.7)", "none"] }, { duration: springDuration(ease), delay: 0.5, ease: ease as any }).finished.then(() => { el.style.transform = ""; }, () => { el.style.transform = ""; });
  const t = window.setTimeout(() => {
    if (el.getAttribute("aria-expanded") === "true") return;
    animate(el, { transform: ["rotate(0deg) scale(1)", "rotate(-10deg) scale(1.08)", "rotate(8deg) scale(1.08)", "rotate(-4deg) scale(1.04)", "rotate(0deg) scale(1)"] }, { duration: 0.8, ease: "easeInOut" }).finished.then(() => { el.style.transform = ""; }, () => { el.style.transform = ""; });
  }, 9000);
  return () => window.clearTimeout(t);
}

/** Everything for the current page. Called on every route change with the <main> element. */
export function pageMotion(main: HTMLElement): Off {
  if (prefersReducedMotion() || !main) return () => {};
  const offs: Off[] = [launcher()];
  const head = main.querySelector<HTMLElement>(".page-head");
  const body = main.querySelector<HTMLElement>(".page-body");

  // page change: the body rises into place (content stays visible)
  if (body) animate(body, { transform: ["translateY(18px)", "none"] }, { duration: 0.6, ease: [0.22, 1, 0.36, 1] }).finished.then(() => { body.style.transform = ""; }, () => { body.style.transform = ""; });

  if (head) {
    const rule = head.querySelector<HTMLElement>(".crumb-rule");
    if (rule) offs.push(drawOnEnter(rule, "x", 0.15));
    const glow = head.querySelector<HTMLElement>(".page-glow");
    if (glow) offs.push(scroll((p: number) => { glow.style.transform = `translate3d(0, ${(p * 120).toFixed(1)}px, 0) scale(${(1 + p * 0.35).toFixed(3)})`; }, { target: head, offset: ["start start", "end start"] }));
    offs.push(pointerGlow(head));
  }

  main.querySelectorAll<HTMLElement>(".hub-photo img").forEach((img) => offs.push(photoScroll(img)));
  main.querySelectorAll<HTMLElement>(".page-body .prose-sm > h2").forEach((h) => offs.push(settleOnEnter(h, "translateX(-22px)", { amount: 0.6 })));
  main.querySelectorAll<HTMLElement>(".ab-bar").forEach((b) => offs.push(drawOnEnter(b, "y", 0.1)));
  main.querySelectorAll<HTMLElement>(".cta-quiet").forEach((c) => { offs.push(settleOnEnter(c, "translateY(36px) scale(0.95)", { amount: 0.25, stiffness: 200, damping: 22 })); offs.push(pointerGlow(c)); });
  offs.push(cards(main), magnetic(main));
  return () => offs.forEach((o) => o());
}
