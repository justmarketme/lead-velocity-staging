/**
 * Motion kit for the broker portal (motion.dev, "motion/react").
 * - BrokerMotion: LazyMotion (features loaded async, so the first paint carries no animation code) + MotionConfig
 *   reducedMotion="user" (OS "reduce motion" turns transform/layout animation off; opacity stays).
 * - Only transform and opacity are animated (60 fps, no layout shift).
 */
import { ReactNode, useEffect, useRef } from "react";
import { LazyMotion, MotionConfig, animate, useInView, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

const loadFeatures = () => import("./motionFeatures").then((r) => r.default);

export const EASE = [0.22, 1, 0.36, 1] as const;

export function BrokerMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Parent of a staggered list; children use `item`. */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Section that fades/slides in once, children staggered. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={stagger} initial="hidden" animate="show">
      {children}
    </m.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <m.div className={className} variants={item}>{children}</m.div>;
}

/** Counts up to a real number when it scrolls into view (instant when reduced motion is on). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || !inView || value === 0) { el.textContent = String(value); return; }
    const controls = animate(0, value, { duration: 0.9, ease: EASE, onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => controls.stop();
  }, [value, inView, reduce]);
  return <span ref={ref} className={`tabular-nums ${className || ""}`}>{value}</span>;
}

/** Placeholder block shown while data loads; fades out into the content (wrap both in AnimatePresence mode="wait"). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <m.div
      aria-hidden="true"
      className={`rounded-2xl bg-white/[0.04] ${className}`}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.9, 0.5] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** Content that replaces a skeleton. */
export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      {children}
    </m.div>
  );
}

/** Press feedback for buttons and tappable cards. */
export const tap = { whileTap: { scale: 0.97 }, whileHover: { y: -1 } } as const;

export { m };
