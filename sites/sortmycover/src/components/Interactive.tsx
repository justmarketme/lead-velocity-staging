/* The Motion-enhanced interactions. Each renders complete, visible HTML on the server; Motion only adds effects after hydration. */
import { useEffect, useRef, type ReactNode } from "react";
import { linkReadProgress, revealChildren, toggleDetails } from "@/lib/motion";

/** 1. Staggered reveal of the three how-it-works steps. */
export function Steps({ items }: { items: { title: string; body: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => (ref.current ? revealChildren(ref.current, "[data-step-item]") : undefined), []);
  return (
    <ol ref={ref} className="grid gap-5 md:grid-cols-3 list-none p-0 m-0">
      {items.map((s, i) => (
        <li key={s.title} data-step-item className="flex gap-4 md:flex-col">
          <span className="step-n" aria-hidden="true">{i + 1}</span>
          <div><h3 className="text-lg">{s.title}</h3><p className="m-0 text-muted-foreground">{s.body}</p></div>
        </li>
      ))}
    </ol>
  );
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
