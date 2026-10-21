/* Inner-page motion system (Jono, 18 Oct 2026: "immersive, premium, interactive" on desktop and on mobile). Motion APIs checked
   against motion.dev docs via Context7: animate, scroll({ target, offset }), inView({ amount }), hover, press.
   Same guardrails as src/lib/motion.ts: nothing is ever hidden (only transforms move content; decoration may draw in), the H1 and
   the primary CTA are never faded in, every effect cleans up, and the whole system is off only when the visitor's OS asks for
   reduced motion. Phones get the full scroll choreography; pointer effects (tilt, spotlight, magnetic, pan) need a fine pointer. */
import { animate } from "motion/mini";
import { hover, inView, press, scroll, spring, stagger } from "motion";
import { drawLineOnScroll, drawPath, prefersReducedMotion, springTo } from "./motion";

type Off = () => void;
const fine = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
let launcherDone = false;
/** The footer persists across routes: its arrival plays once per visit. */
let footerShown = false;
/** Test hook: a fresh visit. */
export const resetFooterMotion = () => { footerShown = false; };

/** Offsets a below-the-fold element now and springs it home when it scrolls in. The element stays fully visible throughout
    (transform only); a failsafe puts it home after 2.5 s whatever the observer does. `to` is the element's CSS rest transform
    (default none): an element centred with translate(-50%,-50%) must spring to that, not to none, or it drifts off centre and
    snaps back when the inline style is cleared. */
export function settleOnEnter(el: HTMLElement, from: string, opts: { amount?: number; delay?: number; stiffness?: number; damping?: number; to?: string } = {}): Off {
  if (el.getBoundingClientRect().top < (window.innerHeight || 800)) return () => {};
  el.style.transform = from;
  let done = false;
  const home = () => { if (done) return; done = true; stop(); window.clearTimeout(t); animate(el, { transform: [from, opts.to ?? "none"] }, springTo(opts.stiffness ?? 260, opts.damping ?? 24, { delay: opts.delay ?? 0 })).finished.then(clear, clear); };
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
  const els = Array.from(root.querySelectorAll<HTMLElement>(".card-link, .viz-card, .co-card, .wa-phone"));
  if (!els.length) return () => {};
  const sp = springTo(320, 22);
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
      offs.push(hover(c, () => () => { animate(c, { transform: "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)" }, sp); }));
      offs.push(() => { c.removeEventListener("pointermove", move); c.style.transform = ""; });
    }
  } else {
    offs.push(press(els, (c) => { animate(c, { transform: "scale(0.97)" }, sp); return () => { animate(c, { transform: "scale(1)" }, sp); }; }));
  }
  return () => offs.forEach((o) => o());
}

/** Magnetic buttons on a mouse (the button leans toward the cursor and springs back). */
export function magnetic(root: ParentNode, selector = ".page-body .btn, .page-head .btn, .smc-campaign .hx-actions .btn"): Off {
  if (!fine()) return () => {};
  const offs: Off[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((b) => {
    const move = (e: PointerEvent) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(1)}px, ${(((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1)}px)`; };
    const leave = () => { animate(b, { transform: "translate(0px, 0px)" }, springTo(300, 18)); };
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
  animate(el, { transform: ["translateY(28px) scale(0.7)", "none"] }, springTo(380, 20, { delay: 0.5 })).finished.then(() => { el.style.transform = ""; }, () => { el.style.transform = ""; });
  const t = window.setTimeout(() => {
    if (el.getAttribute("aria-expanded") === "true") return;
    animate(el, { transform: ["rotate(0deg) scale(1)", "rotate(-10deg) scale(1.08)", "rotate(8deg) scale(1.08)", "rotate(-4deg) scale(1.04)", "rotate(0deg) scale(1)"] }, { duration: 0.8, ease: "easeInOut" }).finished.then(() => { el.style.transform = ""; }, () => { el.style.transform = ""; });
  }, 9000);
  return () => window.clearTimeout(t);
}

/** Code-drawn visuals (src/components/Visuals.tsx). Transforms and decoration only; every word stays on screen. */
function vizMotion(main: HTMLElement): Off {
  const offs: Off[] = [];
  const narrow = () => !!window.matchMedia && window.matchMedia("(max-width: 640px)").matches;

  // tokens travel along their link while the visual is on screen (paused off screen)
  main.querySelectorAll<HTMLElement>(".viz-token").forEach((t) => {
    let run: { cancel(): void } | null = null;
    const delay = t.classList.contains("viz-token-2") ? 1.1 : 0;
    offs.push(inView(t.parentElement as HTMLElement, () => {
      run = animate(t, { "--t": [0, 1] } as any, { duration: 2.2, delay, repeat: Infinity, ease: "easeInOut" });
      return () => { run?.cancel(); run = null; };
    }, { amount: 0.4 }));
    offs.push(() => run?.cancel());
  });

  // links and the money line draw in; the who-does-what join runs vertically on a phone
  main.querySelectorAll<HTMLElement>(".mf-line").forEach((l, i) => offs.push(drawOnEnter(l, "x", 0.1 + i * 0.12)));
  main.querySelectorAll<HTMLElement>(".viz-join-line").forEach((l) => offs.push(drawOnEnter(l, narrow() ? "y" : "x", 0.15)));
  main.querySelectorAll<HTMLElement>(".mf-x").forEach((x, i) => offs.push(settleOnEnter(x, "translate(-50%,-50%) scale(1.6) rotate(-45deg)", { amount: 0.6, delay: 0.25 + i * 0.12, stiffness: 420, damping: 18, to: "translate(-50%,-50%)" })));
  main.querySelectorAll<HTMLElement>(".viz-split .viz-card").forEach((c, i) => offs.push(settleOnEnter(c, narrow() ? "translateY(26px)" : `translateX(${i ? 28 : -28}px)`, { amount: 0.3, delay: i * 0.08 })));

  // checking an adviser: the progress line follows the scroll, the cards step in, the tick draws itself
  main.querySelectorAll<HTMLElement>(".viz-check").forEach((v) => {
    const line = v.querySelector<HTMLElement>(".ck-line");
    const vertical = v.classList.contains("viz-flow") ? !!window.matchMedia && window.matchMedia("(max-width: 899px)").matches : narrow();
    if (line) offs.push(drawLineOnScroll(v, line, vertical ? "y" : "x"));
    v.querySelectorAll<HTMLElement>(".ck-step").forEach((s, i) => offs.push(settleOnEnter(s, "translateY(30px) scale(0.96)", { amount: 0.3, delay: i * 0.12, stiffness: 240, damping: 22 })));
    const tick = v.querySelector<SVGGeometryElement>(".ck-tick");
    if (tick) offs.push(inView(tick as unknown as Element, () => { const off = drawPath(tick, 0.5, 0.6); offs.push(off); return undefined; }, { amount: 1 }));
  });

  // the company card lifts in, and its sheen follows the pointer
  main.querySelectorAll<HTMLElement>(".co-card").forEach((c) => { offs.push(settleOnEnter(c, "translateY(34px) rotateX(10deg)", { amount: 0.3, stiffness: 200, damping: 20 })); offs.push(pointerGlow(c)); });

  // the chat plays: bubbles settle in turn when the phone comes into view, the dots type, and a tap replays it
  main.querySelectorAll<HTMLElement>(".wa-phone").forEach((ph) => {
    const msgs = Array.from(ph.querySelectorAll<HTMLElement>(".wa-msg"));
    const play = () => msgs.forEach((m, i) => {
      const from = m.classList.contains("wa-me") ? "translate(18px, 14px) scale(0.86)" : "translate(-18px, 14px) scale(0.86)";
      m.style.transform = from;
      animate(m, { transform: [from, "none"] }, springTo(360, 24, { delay: 0.15 + i * 0.55 })).finished.then(() => { m.style.transform = ""; }, () => { m.style.transform = ""; });
    });
    offs.push(inView(ph, () => { play(); return undefined; }, { amount: 0.45 }));
    const replay = () => play();
    ph.addEventListener("click", replay);
    offs.push(() => { ph.removeEventListener("click", replay); msgs.forEach((m) => { m.style.transform = ""; }); });
    ph.querySelectorAll<HTMLElement>(".wa-typing i").forEach((d, i) => {
      const a = animate(d, { transform: ["translateY(0px)", "translateY(-4px)", "translateY(0px)"] }, { duration: 0.9, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" });
      offs.push(() => a.cancel());
    });
  });
  return () => offs.forEach((o) => o());
}

/** Reading rhythm: below the fold, paragraphs, lists and boxes rise gently into place as they scroll in. Transform only;
    disclosures are left exactly where they are. */
function readingRhythm(main: HTMLElement): Off {
  const offs: Off[] = [];
  const sel = ".page-body .prose-sm > p, .page-body .prose-sm > ul, .page-body .prose-sm > ol, .page-body .prose-sm > dl, .page-body .prose-sm > details, .page-body .prose-sm > figure:not(.viz), .page-body .answer-block";
  main.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    if (el.matches("[data-disclosure]") || el.querySelector("[data-disclosure]")) return;
    offs.push(settleOnEnter(el, "translateY(22px)", { amount: 0.15, stiffness: 210, damping: 26 }));
  });
  return () => offs.forEach((o) => o());
}

/** "On this page": names the section being read, springs the marker to it, pins under the header on a phone and sits in the
    left margin as a rail on a wide screen. Shown only while the reader is inside the guide's sections. */
export function sectionTracker(main: HTMLElement): Off {
  const nav = main.querySelector<HTMLElement>("[data-toc]");
  if (!nav) return () => {};
  const box = nav.querySelector<HTMLDetailsElement>("details")!;
  const now = nav.querySelector<HTMLElement>("[data-toc-now]")!;
  const ind = nav.querySelector<HTMLElement>(".toc-ind")!;
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>(".toc-list a"));
  const heads = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean) as HTMLElement[];
  const end = main.querySelector<HTMLElement>(".cta-quiet") ?? main.querySelector<HTMLElement>(".page-body");
  const wide = () => !!window.matchMedia && window.matchMedia("(min-width: 1240px)").matches;
  const header = document.querySelector<HTMLElement>(".site-header");
  const offs: Off[] = [];
  nav.classList.add("toc-live");
  // the rail is held open on a wide screen; once the window narrows (rotation, resize) it closes and drops the rail's shift
  let forced = false;
  const place = () => {
    nav.style.setProperty("--toc-top", `${(header?.offsetHeight ?? 64) + (wide() ? 28 : 0)}px`);
    if (wide()) { box.open = true; forced = true; } else if (forced) { box.open = false; box.style.transform = ""; forced = false; }
  };
  place();
  let active = -1;
  let on = false;
  const moveTo = (i: number) => {
    if (i === active) return;
    active = i;
    links.forEach((a, j) => a.toggleAttribute("aria-current", j === i));
    const a = links[Math.max(0, i)];
    now.textContent = a.textContent;
    animate(ind, { transform: `translateY(${a.parentElement!.offsetTop}px)`, height: `${a.parentElement!.offsetHeight}px` } as any, springTo(380, 30));
    if (!wide()) animate(now, { transform: ["translateY(8px)", "none"] }, { duration: 0.35, ease: [0.22, 1, 0.36, 1] });
  };
  const update = () => {
    const line = (header?.offsetHeight ?? 64) + 90;
    let i = 0;
    heads.forEach((h, j) => { if (h.getBoundingClientRect().top < line) i = j; });
    moveTo(i);
    const first = heads[0]?.getBoundingClientRect().top ?? 0;
    const last = end ? end.getBoundingClientRect().top : Infinity;
    const show = first < window.innerHeight * 0.85 && last > line;
    if (show !== on) {
      on = show;
      nav.classList.toggle("toc-on", show);
      if (wide()) animate(box, { transform: show ? ["translateX(-18px)", "none"] : ["none", "translateX(-18px)"] }, { duration: 0.45, ease: [0.22, 1, 0.36, 1] });
    }
  };
  offs.push(scroll(() => update()));
  const resize = () => { place(); update(); };
  window.addEventListener("resize", resize);
  offs.push(() => window.removeEventListener("resize", resize));
  // a tap on a section closes the phone list and glides to it
  const click = (e: Event) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const h = document.getElementById(a.hash.slice(1));
    if (!h) return;
    e.preventDefault();
    if (!wide()) box.open = false;
    window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight ?? 64) - 70, behavior: "smooth" });
    // focus follows the reader (the tapped link is now hidden in the closed list); keep React Router's history state
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
    history.replaceState(history.state, "", a.hash);
  };
  nav.addEventListener("click", click);
  offs.push(() => nav.removeEventListener("click", click));
  // the phone list springs open
  const toggle = () => { if (box.open && !wide()) { const ol = box.querySelector<HTMLElement>(".toc-list"); if (ol) animate(ol, { transform: ["translateY(-10px) scale(0.98)", "none"] }, { duration: 0.4, ease: [0.22, 1, 0.36, 1] }); } };
  box.addEventListener("toggle", toggle);
  offs.push(() => box.removeEventListener("toggle", toggle));
  // phone list: a tap outside or Escape closes it. Phones only: the wide rail cannot be reopened by hand, and Escape also
  // closes the chat panel
  const down = (e: PointerEvent) => { if (box.open && !wide() && !nav.contains(e.target as Node)) box.open = false; };
  const esc = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !box.open || wide()) return;
    const inside = nav.contains(document.activeElement);
    box.open = false;
    if (inside) nav.querySelector<HTMLElement>("summary")?.focus();
  };
  document.addEventListener("pointerdown", down, { passive: true });
  document.addEventListener("keydown", esc);
  offs.push(() => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", esc); });
  update();
  return () => { offs.forEach((o) => o()); nav.classList.remove("toc-live", "toc-on"); box.style.transform = ""; };
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
  offs.push(vizMotion(main), readingRhythm(main), sectionTracker(main), cards(main), magnetic(main));
  return () => offs.forEach((o) => o());
}

/** Footer arrival (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 6): a yellow hairline draws left to right and the brand column and
    the three link groups settle up 18px with a soft spring, once per visit, and only when the footer starts below the fold. Two
    observers: one arms (offsets) the footer while it is within 320px below the viewport and disarms it if the visitor scrolls back
    away; one plays it at 12% visible. Play before arming does nothing, so a visitor who jumps straight to the footer never sees a
    snap-down. A 4 s failsafe from arming guards a visible footer: it plays the arrival if the footer is on screen, and otherwise
    only checks again (offsets on an off-screen footer harm nobody), so a slow reader still sees the arrival when it scrolls in.
    Touches only [data-f-settle] and .f-rule (never .f-base or a [data-disclosure]); transform only; the footer's WhatsApp button
    is magnetic on a mouse. */
export const FOOTER_FAILSAFE_MS = 4000;
export function footerMotion(footer: HTMLElement): Off {
  if (prefersReducedMotion() || !footer) return () => {};
  const offs: Off[] = [magnetic(footer, ".site-footer .f-cta")];
  const items = Array.from(footer.querySelectorAll<HTMLElement>("[data-f-settle]")).filter((i) => !i.closest("[data-disclosure]") && !i.querySelector("[data-disclosure]"));
  const rule = footer.querySelector<HTMLElement>(".f-rule");
  if (!footerShown && items.length && rule) {
    let armed = false;
    let fail = 0;
    const clearItems = () => items.forEach((i) => { i.style.transform = ""; });
    const clearRule = () => { rule.style.transform = ""; };
    const onScreen = () => footer.getBoundingClientRect().top < window.innerHeight;
    const disarm = () => { armed = false; window.clearTimeout(fail); clearItems(); clearRule(); };
    const play = () => {
      if (!armed || footerShown) return;
      footerShown = true;
      window.clearTimeout(fail);
      try {
        animate(rule, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }).finished.then(clearRule, clearRule);
        animate(items, { transform: ["translateY(18px)", "none"] }, { type: spring, visualDuration: 0.55, bounce: 0.12, delay: stagger(0.07, { startDelay: 0.08 }) }).finished.then(clearItems, clearItems);
      } catch { clearItems(); clearRule(); }
    };
    const failsafe = () => { if (footerShown) return; if (onScreen()) { play(); clearItems(); clearRule(); } else fail = window.setTimeout(failsafe, FOOTER_FAILSAFE_MS); };
    offs.push(inView(footer, () => {
      if (footerShown) return undefined; // one-shot from here: unobserve
      // already on screen when it (re)arms, e.g. a jump straight to the footer: never offset what the visitor can see
      if (!armed && onScreen()) { footerShown = true; return undefined; }
      if (!armed) {
        armed = true;
        items.forEach((i) => { i.style.transform = "translateY(18px)"; });
        rule.style.transform = "scaleX(0)";
        window.clearTimeout(fail);
        fail = window.setTimeout(failsafe, FOOTER_FAILSAFE_MS);
      }
      // returning a function keeps observing: the visitor scrolled back away before it played, so put the footer home and re-arm later
      return () => { if (!footerShown) disarm(); };
    }, { margin: "0px 0px 320px 0px" }));
    // keeps observing until it has played (a play before arming is ignored, not used up)
    offs.push(inView(footer, () => { play(); return footerShown ? undefined : () => {}; }, { amount: 0.12 }));
    offs.push(() => { window.clearTimeout(fail); if (!footerShown || armed) { clearItems(); clearRule(); } });
  }
  return () => offs.forEach((o) => o());
}
