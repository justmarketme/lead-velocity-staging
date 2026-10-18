/**
 * Diagonal "Waiting for your approval" band across a greyed preview (intro card, ad). Put it inside a `relative
 * overflow-hidden` box. It fades out when `show` turns false (instantly under prefers-reduced-motion) and is hidden from
 * screen readers then. Used by both portal skins (Tailwind is global).
 */
export default function ApprovalBand({ show, text = "Waiting for your approval" }: { show: boolean; text?: string }) {
  return (
    <div aria-hidden={!show} role={show ? "status" : undefined}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-500 motion-reduce:transition-none ${show ? "opacity-100" : "opacity-0"}`}>
      <div className="w-[160%] shrink-0 -rotate-[24deg] border-y-2 border-amber-200/80 bg-amber-400/95 py-2 sm:py-2.5 text-center text-[11px] sm:text-base font-extrabold uppercase tracking-[0.1em] sm:tracking-[0.18em] text-slate-950 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
        {text}
      </div>
    </div>
  );
}
