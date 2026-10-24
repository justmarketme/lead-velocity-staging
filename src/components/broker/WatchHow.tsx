/**
 * "Watch how (0:31)": a compact text button that opens a short portrait how-to clip in a dialog, played with
 * BrokerVideo. The clip's width follows the screen height, so the whole dialog fits on a phone. Renders nothing while
 * the clip URL is empty. z-[120] keeps the dialog above the floating assistant button (z-[100]), as HeadshotPicker does.
 */
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import BrokerVideo from "./BrokerVideo";

export interface Clip { src: string; poster: string; title: string; duration: string }

export default function WatchHow({ src, poster, title, duration, className = "" }: Clip & { className?: string }) {
  if (!src) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Watch how: ${title} (${duration})`}
          className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-semibold text-pink-300 hover:text-pink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/60 ${className}`}>
          <PlayCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Watch how <span className="font-normal text-slate-400">({duration})</span>
        </button>
      </DialogTrigger>
      <DialogContent className="z-[120] w-[calc(100vw-32px)] max-w-[360px] max-h-[calc(100dvh-32px)] overflow-y-auto gap-3 rounded-[28px] sm:rounded-[28px] border-white/10 bg-[#0b1020] p-4 sm:p-5 text-white shadow-[0_0_80px_rgba(236,72,153,0.12)]">
        <div className="pr-8">
          <DialogTitle className="text-base font-semibold leading-snug text-white">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-slate-400">{duration} · captions on screen</DialogDescription>
        </div>
        {/* 9:16 clip: never taller than the screen minus the dialog's title and padding */}
        <div className="mx-auto w-full" style={{ maxWidth: "min(320px, calc((100dvh - 10rem) * 9 / 16))" }}>
          <BrokerVideo src={src} poster={poster} title={title} duration={duration} portrait />
        </div>
      </DialogContent>
    </Dialog>
  );
}
