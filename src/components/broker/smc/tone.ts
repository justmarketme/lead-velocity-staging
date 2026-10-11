/**
 * Two skins for the SortMyCover broker cards: "elite" (the /broker-elite dark glass page) and "theme" (the legacy
 * /broker/* pages, which use the app's theme tokens). Only class names differ; content and logic are shared.
 */
export type Tone = "elite" | "theme";

export const toneClasses = (t: Tone) =>
  t === "elite"
    ? {
        card: "bg-slate-900/40 backdrop-blur-3xl border-white/5 rounded-3xl text-slate-200",
        title: "text-white font-black tracking-tight",
        muted: "text-slate-400",
        box: "bg-white/[0.03] border border-white/5 rounded-2xl",
        input: "bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500",
        ok: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        warn: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
        bad: "bg-rose-500/10 text-rose-300 border border-rose-500/20",
        info: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
        primary: "bg-gradient-to-r from-pink-600 to-rose-600 text-white hover:opacity-90",
        link: "text-pink-400 hover:text-pink-300",
      }
    : {
        card: "border-border/50",
        title: "",
        muted: "text-muted-foreground",
        box: "bg-muted/40 border border-border rounded-lg",
        input: "",
        // the app theme (:root in index.css) is dark without a .dark class, so the light tints are the readable ones
        ok: "bg-green-500/10 text-green-400 border border-green-500/20",
        warn: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
        bad: "bg-red-500/10 text-red-300 border border-red-500/20",
        info: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
        primary: "",
        link: "text-primary hover:underline",
      };
