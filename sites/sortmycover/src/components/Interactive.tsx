/* The Motion-enhanced interactions. Each renders complete, visible HTML on the server; Motion only adds effects after hydration. */
import { useEffect, useRef, type ReactNode } from "react";
import { drawLineOnScroll, linkReadProgress, revealChildren, toggleDetails } from "@/lib/motion";

/** 1. Staggered reveal of the three how-it-works steps. */
export function Steps({ items }: { items: { title: string; body: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lineY = useRef<HTMLSpanElement>(null);
  const lineX = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offs = [revealChildren(el, "[data-step-item]")];
    // (b) the connector draws as you scroll: vertical on phones, horizontal from 768px (the other one is display:none)
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const line = wide ? lineX.current : lineY.current;
    if (line) offs.push(drawLineOnScroll(el, line, wide ? "x" : "y"));
    return () => offs.forEach((o) => o());
  }, []);
  return (
    <div ref={ref} className="steps">
    <span ref={lineY} className="steps-line" data-axis="y" aria-hidden="true" />
    <span ref={lineX} className="steps-line" data-axis="x" aria-hidden="true" />
    <ol className="grid gap-5 md:grid-cols-3 list-none p-0 m-0">
      {items.map((s, i) => (
        <li key={s.title} data-step-item className="flex gap-4 md:flex-col">
          <span className="step-n" aria-hidden="true">{i + 1}</span>
          <div><h3 className="text-lg">{s.title}</h3><p className="m-0 text-muted-foreground">{s.body}</p></div>
        </li>
      ))}
    </ol>
    </div>
  );
}

/** 2. Staggered reveal of cards ([data-reveal] children). Visible in the HTML and at rest; only below-the-fold items are hidden by JS,
    each restored on view, on scroll and by the failsafe timer (src/lib/motion.ts revealChildren). Never wrap a disclosure in it. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? revealChildren(ref.current, "[data-reveal]") : undefined), []);
  return <div ref={ref} className={className}>{children}</div>;
}

/** 3. FAQ accordion: native <details> (answers always in the HTML), height animated by Motion. */
export function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  const d = useRef<HTMLDetailsElement>(null);
  const b = useRef<HTMLDivElement>(null);
  return (
    <details ref={d} className="faq-item">
      <summary onClick={(e) => { if (d.current && b.current) toggleDetails(d.current, b.current, e); }}>{q}</summary>
      <div ref={b} className="faq-body"><div>{children}</div></div>
    </details>
  );
}

/** 4. Scroll-linked progress on long articles. */
export function ReadProgress() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? linkReadProgress(ref.current) : undefined), []);
  return <div className="read-progress" aria-hidden="true"><i ref={ref as React.RefObject<HTMLElement>} /></div>;
}

/** 5. "On this page" for guides (Jono, 18 Oct 2026: as you scroll and read, it follows you). Static HTML is a native
    <details> list that works with no JavaScript. pageMotion pins it under the header on a phone, sets it as a side rail on a
    wide screen, names the section being read and springs a marker to it. */
export const sectionId = (t: string) => "s-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export function SectionNav({ items }: { items: string[] }) {
  if (items.length < 3) return null;
  return (
    <nav className="toc" aria-label="On this page" data-toc>
      <details className="toc-box">
        <summary className="toc-sum"><span className="toc-k">On this page</span><span className="toc-now" data-toc-now>{items[0]}</span></summary>
        <ol className="toc-list">
          <span className="toc-ind" aria-hidden="true" />
          {items.map((t) => <li key={t}><a href={"#" + sectionId(t)}>{t}</a></li>)}
        </ol>
      </details>
    </nav>
  );
}
