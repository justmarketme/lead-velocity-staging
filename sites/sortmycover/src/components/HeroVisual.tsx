import { useEffect, useRef } from "react";
import { animate } from "motion/mini";
import { stagger } from "motion";
import { drawPath, parallax, prefersReducedMotion } from "@/lib/motion";

/* Decorative only (aria-hidden): a diary page filling in. Fully drawn at rest; Motion adds a one-time gentle fill-in after hydration,
   skipped under prefers-reduced-motion. Transform and opacity only; the box size is fixed by CSS so nothing shifts. */
const SLOTS = [[0, 1], [1, 3], [2, 0], [3, 2], [4, 1]];

export default function HeroVisual() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg || prefersReducedMotion()) return;
    const cells = Array.from(svg.querySelectorAll<SVGElement>("[data-cell]"));
    const check = svg.querySelector<SVGElement>("[data-check]");
    const tickPath = svg.querySelector<SVGGeometryElement>("[data-tick]");
    const a = animate(cells, { opacity: [0, 1], transform: ["scale(0.8)", "scale(1)"] }, { duration: 0.35, delay: stagger(0.09, { startDelay: 0.3 }), ease: "easeOut" });
    const b = check ? animate(check, { opacity: [0, 1] }, { duration: 0.4, delay: 1.1 }) : null;
    const c = tickPath ? drawPath(tickPath, 1.2, 0.5) : () => {};
    const d = parallax(svg, 16); // (b) transform-only parallax
    return () => { a.cancel(); b?.cancel(); c(); d(); };
  }, []);
  return (
    <svg ref={ref} className="w-full max-w-[420px] justify-self-center hidden sm:block" viewBox="0 0 320 260" role="img" aria-label="" aria-hidden="true" focusable="false">
      <rect x="10" y="10" width="300" height="240" rx="18" fill="#2B3845" stroke="rgba(255,255,255,.18)" />
      <rect x="10" y="10" width="300" height="52" rx="18" fill="#F5A623" />
      <rect x="10" y="40" width="300" height="22" fill="#F5A623" />
      <text x="28" y="44" fontSize="20" fontWeight="800" fill="#2A1B02">Your call</text>
      {[0, 1, 2, 3, 4].map((c) => <rect key={"h" + c} x={28 + c * 54} y="78" width="46" height="10" rx="5" fill="rgba(255,255,255,.22)" />)}
      {[1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => <rect key={r + "-" + c} x={28 + c * 54} y={78 + r * 40} width="46" height="30" rx="8" fill="rgba(255,255,255,.08)" />))}
      {SLOTS.map(([c, r], i) => <rect key={i} data-cell x={28 + c * 54} y={78 + (r === 0 ? 1 : r) * 40} width="46" height="30" rx="8" fill="rgba(245,166,35,.55)" />)}
      <g data-check>
        <circle cx="266" cy="200" r="22" fill="#F5A623" />
        <path data-tick d="M255 200l8 8 15-17" fill="none" stroke="#2A1B02" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
