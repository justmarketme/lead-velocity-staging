/* Home page Motion set pieces (free MIT `motion`). Same guardrails as src/lib/motion.ts: complete, visible HTML from the server;
   effects only after hydration; transform/opacity only; every effect is a no-op under prefers-reduced-motion; nothing auto-loops;
   the H1, hero copy and primary CTA are never animated in. Reveal targets here use [data-rise], never [data-reveal]
   (the home reveal count is pinned by tests/sections-dist.test.ts). */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animate } from "motion/mini";
import { inView, scroll, stagger } from "motion";
import { parallax, prefersReducedMotion, revealChildren, springDuration, springEase, springGestures } from "@/lib/motion";
import { HERO_MOSAIC, SCENES, type SceneImage } from "@/content/imagery";
import { articlePath } from "@/content";
import { BOOK_COVER, BOOK_WILLS } from "@/lib/site";
import { WhatsAppCta } from "./ChatWidget";

const Img = ({ s, eager, className }: { s: SceneImage; eager?: boolean; className?: string }) => (
  <img className={className} src={s.src} alt={s.alt} width={s.w} height={s.h} loading={eager ? "eager" : "lazy"} {...(eager ? { fetchPriority: "high" as const } : {})} />
);

/* ---------- 1. Hero mosaic: four households, layered depth on scroll, a booking chip that springs in ---------- */
export function HeroMosaic() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const tiles = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    const offs = tiles.map((t) => parallax(t, Number(t.dataset.depth)));
    const chip = el.querySelector<HTMLElement>("[data-chip]");
    const ease = springEase(380, 20);
    const a = chip ? animate(chip, { opacity: [0, 1], transform: ["translateY(18px) scale(.94)", "translateY(0px) scale(1)"] }, { duration: springDuration(ease), delay: 0.6, ease: ease as any }) : null;
    return () => { offs.forEach((o) => o()); a?.cancel(); };
  }, []);
  const [a, b, c, d] = HERO_MOSAIC;
  return (
    <div ref={ref} className="hx-mosaic" aria-hidden="false">
      <figure className="hx-tile hx-t1" data-depth="10"><Img s={a} eager /></figure>
      <figure className="hx-tile hx-t2" data-depth="34"><Img s={b} /></figure>
      <figure className="hx-tile hx-t3" data-depth="22"><Img s={c} /></figure>
      <figure className="hx-tile hx-t4" data-depth="40"><Img s={d} /></figure>
      <div className="hx-chip" data-chip aria-hidden="true">
        <span className="hx-chip-dot" />
        <span><b>Call booked</b><small>Thu · 18:30 · 30 minutes</small></span>
        <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#F5A623" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#2A1B02" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
  );
}

/* ---------- 2. Trust strip: the four things a visitor wants to know before booking ---------- */
export function ValueStack({ items }: { items: { k: string; v: string; d: string }[] }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => (ref.current ? revealChildren(ref.current, "[data-rise]") : undefined), []);
  return (
    <ul ref={ref} className="hx-values" aria-label="What to expect">
      {items.map((i) => <li key={i.k} data-rise><small>{i.k}</small><b>{i.v}</b><span>{i.d}</span></li>)}
    </ul>
  );
}

/* ---------- 3. "What changed?" life-moment picker (tabs; every panel is in the HTML) ---------- */
type Moment = { id: string; topic: string; tab: string; head: string; em: string; body: string; img: SceneImage; links: { to: string; label: string }[]; book: "cover" | "wills" };
export const MOMENTS: Moment[] = [
  { id: "bond", topic: "cover and my new bond", tab: "New bond", head: "Bond approved.", em: "One more item for the list.", body: "What keeps the bond paid if an income stops is a common question to take to an authorised adviser.", img: SCENES.momentBond, links: [{ to: articlePath("life-cover"), label: "Life cover, in plain words" }, { to: articlePath("income-protection"), label: "Income protection" }], book: "cover" },
  { id: "baby", topic: "cover for my family", tab: "New baby", head: "New baby.", em: "New questions about cover.", body: "A new dependant often changes what cover is for, and who it is meant to look after.", img: SCENES.momentBaby, links: [{ to: articlePath("life-cover"), label: "What life cover does" }, { to: articlePath("guardians-and-childrens-trusts"), label: "Guardians and trusts" }], book: "cover" },
  { id: "income", topic: "income protection", tab: "The salary", head: "Some people insure the car", em: "before the salary.", body: "Disability and income protection are about the monthly income a household runs on. An adviser explains both in 30 minutes.", img: SCENES.momentIncome, links: [{ to: articlePath("disability-cover"), label: "Disability cover" }, { to: articlePath("income-protection"), label: "Income protection" }], book: "cover" },
  { id: "business", topic: "cover as a business owner", tab: "Own a business", head: "When the business depends", em: "on one person.", body: "Owners and directors often ask an adviser how cover fits around a business and the family behind it.", img: SCENES.momentBusiness, links: [{ to: articlePath("severe-illness-cover"), label: "Severe illness cover" }, { to: articlePath("disability-cover"), label: "Disability cover" }], book: "cover" },
  { id: "will", topic: "a will", tab: "A will", head: "Who looks after", em: "the children?", body: "A will names a guardian and says who inherits. A will consultant takes the details in one appointment.", img: SCENES.momentWill, links: [{ to: articlePath("what-a-will-does"), label: "What a will does" }, { to: articlePath("where-to-keep-a-will"), label: "Where a will is kept" }], book: "wills" },
];

export function MomentPicker() {
  const [cur, setCur] = useState(0);
  const pill = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const btn = list.current?.querySelectorAll<HTMLElement>("[role=tab]")[cur];
    const p = pill.current;
    if (!btn || !p) return;
    const to = { transform: `translateX(${btn.offsetLeft}px)`, width: `${btn.offsetWidth}px` };
    if (first.current || prefersReducedMotion()) { Object.assign(p.style, to); first.current = false; return; }
    const ease = springEase(500, 32);
    animate(p, { transform: to.transform, width: to.width }, { duration: springDuration(ease), ease: ease as any });
    const panel = panels.current?.querySelector<HTMLElement>(`[data-panel="${cur}"]`);
    if (panel) {
      animate(panel.querySelectorAll<HTMLElement>("[data-in]"), { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] }, { duration: 0.38, delay: stagger(0.05), ease: "easeOut" });
      const im = panel.querySelector("img");
      if (im) animate(im, { transform: ["scale(1.06)", "scale(1)"], opacity: [0.4, 1] }, { duration: 0.6, ease: "easeOut" });
    }
  }, [cur]);
  useEffect(() => {
    const onR = () => { const btn = list.current?.querySelectorAll<HTMLElement>("[role=tab]")[cur]; if (btn && pill.current) Object.assign(pill.current.style, { transform: `translateX(${btn.offsetLeft}px)`, width: `${btn.offsetWidth}px` }); };
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [cur]);
  const onKey = (e: React.KeyboardEvent) => {
    const n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    const next = (cur + n + MOMENTS.length) % MOMENTS.length;
    setCur(next);
    list.current?.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
  };
  return (
    <div className="hx-moments">
      <div ref={list} className="hx-tabs" role="tablist" aria-label="What changed" onKeyDown={onKey}>
        <span ref={pill} className="hx-pill" aria-hidden="true" />
        {MOMENTS.map((m, i) => (
          <button key={m.id} type="button" role="tab" id={`mt-${m.id}`} aria-controls={`mp-${m.id}`} aria-selected={i === cur} tabIndex={i === cur ? 0 : -1} onClick={() => setCur(i)}>{m.tab}</button>
        ))}
      </div>
      <div ref={panels}>
        {MOMENTS.map((m, i) => (
          <div key={m.id} id={`mp-${m.id}`} role="tabpanel" aria-labelledby={`mt-${m.id}`} data-panel={i} hidden={i !== cur} className="hx-panel">
            <figure className="hx-panel-img"><Img s={m.img} /></figure>
            <div className="hx-panel-copy">
              <h3 data-in>{m.head} <em>{m.em}</em></h3>
              <p data-in>{m.body}</p>
              <ul data-in>{m.links.map((l) => <li key={l.to}><Link to={l.to}>{l.label} →</Link></li>)}</ul>
              <p data-in className="cta-row"><WhatsAppCta ctx={{ topic: m.topic, ref: "w-home-" + m.id, wills: m.book === "wills", book: m.book === "wills" ? BOOK_WILLS : BOOK_COVER }} /><Link to={m.book === "wills" ? BOOK_WILLS : BOOK_COVER} className="hx-how-link">Or book a call</Link></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 4. The journey: a phone that follows the scroll (desktop); each step carries its own screen on phones ---------- */
type Step = { n: string; title: string; body: string };
const Screen = ({ i }: { i: number }) => {
  if (i === 0) return (
    <div className="ph-screen ph-quiz"><p className="ph-q">What would you like help with?</p>
      {["Life cover", "Disability cover", "Income protection", "A will"].map((o, k) => <span key={o} className={"ph-opt" + (k === 0 ? " is-on" : "")}>{o}</span>)}
      <span className="ph-bar"><i /></span></div>
  );
  if (i === 1) return (
    <div className="ph-screen ph-wa"><p className="ph-head"><b>SortMyCover</b><small>WhatsApp</small></p>
      <p className="ph-msg">Hi Lerato. Your adviser is <b>[name]</b>, <b>[practice]</b>, FSP <b>[number]</b>. Check them on the FSCA register any time.</p>
      <p className="ph-msg">Which time suits?</p>
      <span className="ph-slots"><i>Tue 12:30</i><i className="is-on">Thu 18:30</i><i>Sat 09:00</i></span></div>
  );
  if (i === 2) return (
    <div className="ph-screen ph-done"><svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#F5A623" /><path d="M14 25l7 7 13-15" fill="none" stroke="#2A1B02" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <b>Call booked</b><small>Thursday · 18:30 · 30 minutes</small><span className="ph-note">Move or cancel from the WhatsApp message.</span></div>
  );
  return (
    <div className="ph-screen ph-call"><span className="ph-avatar" aria-hidden="true">A</span><b>Adviser call</b><small>Video, WhatsApp or phone</small>
      <span className="ph-timer">30:00</span><span className="ph-note">The adviser explains how they are paid. The decision comes afterwards.</span></div>
  );
};

export function JourneyScroll({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(min-width: 900px)").matches) return;
    const fill = el.querySelector<HTMLElement>("[data-fill]");
    return scroll((p: number) => {
      const i = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      setCur((c) => (c === i ? c : i));
      if (fill) fill.style.transform = `scaleY(${Math.min(1, p * 1.05)})`;
    }, { target: el, offset: ["start 0.6", "end 0.75"] });
  }, [steps.length]);
  useEffect(() => {
    const s = ref.current?.querySelector<HTMLElement>(`[data-screen="${cur}"]`);
    if (!s || prefersReducedMotion()) return;
    const ease = springEase(420, 30);
    animate(s, { opacity: [0, 1], transform: ["translateY(14px) scale(.98)", "translateY(0px) scale(1)"] }, { duration: springDuration(ease), ease: ease as any });
  }, [cur]);
  return (
    <div ref={ref} className="hx-journey">
      <ol className="hx-steps">
        <span className="hx-rail" aria-hidden="true"><i data-fill /></span>
        {steps.map((s, i) => (
          <li key={s.n} className={i === cur ? "is-on" : ""}>
            <span className="hx-step-n" aria-hidden="true">{s.n}</span>
            <div><h3>{s.title}</h3><p>{s.body}</p></div>
            <div className="hx-inline-phone" aria-hidden="true"><div className="ph-frame"><Screen i={i} /></div></div>
          </li>
        ))}
      </ol>
      <div className="hx-sticky" aria-hidden="true">
        <div className="ph-frame ph-big">
          <span className="ph-notch" />
          {steps.map((_, i) => <div key={i} data-screen={i} className="ph-layer" hidden={i !== cur}><Screen i={i} /></div>)}
        </div>
        <p className="hx-sticky-cap">Illustration. Names and times are examples.</p>
      </div>
    </div>
  );
}

/* ---------- 5. Split headline: each word rises out of a mask as the heading scrolls into view ---------- */
/** Renders words as spans (complete text in the HTML). `em` words get the accent serif. */
export function Split({ text, em }: { text: string; em?: string }) {
  const words = (s: string, accent: boolean) => s.split(/\s+/).filter(Boolean).flatMap((w, i) => [
    i ? " " : "",
    <span key={(accent ? "e" : "t") + i} className="w"><span className={accent ? "w-in w-em" : "w-in"}>{w}</span></span>,
  ]);
  return <>{words(text, false)}{em ? <>{" "}<span className="w-line">{words(em, true)}</span></> : null}</>;
}

function splitReveal(root: HTMLElement): () => void {
  const vh = window.innerHeight || 800;
  const heads = Array.from(root.querySelectorAll<HTMLElement>("[data-split]")).filter((h) => h.getBoundingClientRect().top > vh * 0.9);
  const stops: (() => void)[] = [];
  heads.forEach((h) => {
    const inner = Array.from(h.querySelectorAll<HTMLElement>(".w-in"));
    inner.forEach((w) => { w.style.transform = "translateY(105%)"; });
    const restore = () => inner.forEach((w) => { w.style.transform = ""; });
    const timer = window.setTimeout(restore, 3000);
    const stop = inView(h, () => {
      window.clearTimeout(timer);
      const ease = springEase(260, 26);
      animate(inner, { transform: ["translateY(105%)", "translateY(0%)"] }, { duration: springDuration(ease), delay: stagger(0.045), ease: ease as any }).finished.then(restore, restore);
      return undefined;
    }, { amount: 0.4 });
    stops.push(() => { window.clearTimeout(timer); stop(); restore(); });
  });
  return () => stops.forEach((s) => s());
}

/* ---------- 6. Magnetic primary buttons (fine pointers only): the button leans toward the cursor and springs back ---------- */
function magnetic(root: HTMLElement): () => void {
  if (!window.matchMedia("(pointer: fine)").matches) return () => {};
  const ease = springEase(300, 18);
  const dur = springDuration(ease);
  const offs: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>(".btn-lg").forEach((b) => {
    const move = (e: PointerEvent) => {
      const r = b.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 14, y = ((e.clientY - r.top) / r.height - 0.5) * 10;
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const leave = () => { animate(b, { transform: "translate(0px, 0px)" }, { duration: dur, ease: ease as any }); };
    b.addEventListener("pointermove", move);
    b.addEventListener("pointerleave", leave);
    offs.push(() => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerleave", leave); b.style.transform = ""; });
  });
  return () => offs.forEach((o) => o());
}

/* ---------- 7. All home gestures in one hook ---------- */
export function useHomeGestures(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const offs = [springGestures(el, ".btn:not(.btn-lg), .hx-tabs [role=tab]"), splitReveal(el), magnetic(el)];
    return () => offs.forEach((o) => o());
  }, [root]);
}
