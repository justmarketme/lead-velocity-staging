/**
 * A broker-portal video that never shows a blank player: a branded thumbnail (title, what it covers, length) that
 * swaps to the real player, already playing, when tapped.
 */
import { useState } from "react";
import { Play } from "lucide-react";

export interface BrokerVideoProps {
  src: string;
  poster: string;
  title: string;
  duration: string;
  portrait?: boolean;
  captionsUrl?: string;
  className?: string;
}

export default function BrokerVideo({ src, poster, title, duration, portrait = false, captionsUrl, className = "" }: BrokerVideoProps) {
  const [playing, setPlaying] = useState(false);
  const frame = `${portrait ? "aspect-[9/16]" : "aspect-video"} w-full rounded-2xl overflow-hidden border border-white/10 bg-[#030712]`;

  if (playing) {
    return (
      <div className={`${frame} ${className}`}>
        <video className="h-full w-full bg-black" controls autoPlay playsInline preload="auto" poster={poster} aria-label={title}>
          <source src={src} type="video/mp4" />
          {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="English" default />}
        </video>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play: ${title} (${duration})`}
      className={`group relative block ${frame} ${className} transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      <span className="sr-only">{title}, {duration}</span>
      <span aria-hidden="true" className="absolute right-3 top-3 hidden items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur group-hover:flex">
        <Play className="h-3 w-3 fill-current" /> Play
      </span>
    </button>
  );
}
