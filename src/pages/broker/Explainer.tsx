import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  X,
  Star,
  Lock,
  Unlock,
  CreditCard,
  Mail,
  Download,
  FileSignature,
  MessageSquarePlus,
  StickyNote,
  ArrowRight,
} from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";

/**
 * In-browser animated explainer film for the Lead Velocity broker portal.
 *
 * Playback model:
 *  - Starts PAUSED (browsers block autoplay-with-sound). A big "Play" button
 *    performs the user gesture that unlocks audio and starts scene 1.
 *  - Each scene owns one narration mp3 in /public/explainer/audio/sceneN.mp3.
 *  - We DO NOT hardcode durations. A single <audio> element plays the current
 *    scene's clip; its `ended` event advances to the next scene. The visual for
 *    each scene animates purely with CSS/Tailwind + react state (no new deps).
 */

// The narration text (== the on-screen caption) for each of the 8 scenes.
const SCENES: { caption: string }[] = [
  {
    caption:
      "Welcome to Lead Velocity. This is your private lead portal. Let me show you how to get the most from it, in under a minute.",
  },
  {
    caption:
      "Inside, you'll find your purchased commercial leads — real South African businesses, each with a verified phone number, organised by area and by data quality score.",
  },
  {
    caption:
      "At first, the identifying details stay locked… the business name, phone and email are hidden.",
  },
  {
    caption:
      "To unlock them, head to the Documents section. Read your agreement, then simply draw your signature, right there on the screen, to sign it.",
  },
  {
    caption:
      "Next, make your payment by EFT using the banking details shown. Use your brokerage name as the reference, and email your proof of payment to the team.",
  },
  {
    caption:
      "Once we confirm your payment, every contact detail unlocks instantly — business names, phone numbers, and emails. The lot.",
  },
  {
    caption:
      "Now the fun part. Work your leads on your own pipeline board. Just drag each one from New, to Contacted, to Won. Add private notes, or send feedback straight to the Lead Velocity team.",
  },
  {
    caption:
      "Prefer to work offline? Download your whole list to a spreadsheet, any time. That's it — you're ready to start closing. Welcome aboard.",
  },
];

const SCENE_COUNT = SCENES.length;

// Sample leads reused across the "cards" scenes so the animation feels concrete.
const SAMPLE_LEADS = [
  { name: "Atlantic Freight Co", area: "Bellville", category: "Logistics", score: 92, phone: "021 948 2210", email: "info@atlanticfreight.co.za" },
  { name: "Table Bay Dental", area: "Sea Point", category: "Healthcare", score: 88, phone: "021 434 5567", email: "reception@tbdental.co.za" },
  { name: "Cape Steel Works", area: "Epping", category: "Manufacturing", score: 84, phone: "021 534 1180", email: "sales@capesteel.co.za" },
  { name: "Summit Accountants", area: "Century City", category: "Finance", score: 79, phone: "021 555 9042", email: "hello@summitacc.co.za" },
  { name: "Greenpoint Motors", area: "Green Point", category: "Automotive", score: 76, phone: "021 421 7788", email: "service@gpmotors.co.za" },
  { name: "Boland Fresh Produce", area: "Paarl", category: "Agriculture", score: 71, phone: "021 872 3345", email: "orders@bolandfresh.co.za" },
];

function ScoreStars({ score }: { score: number }) {
  const stars = Math.max(1, Math.round((score / 100) * 5));
  return (
    <span className="inline-flex items-center gap-0.5" title={`Data Quality ${score}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

function LeadCard({
  lead,
  locked,
  unlocking,
  index,
}: {
  lead: (typeof SAMPLE_LEADS)[number];
  locked?: boolean;
  unlocking?: boolean;
  index: number;
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left shadow-lg backdrop-blur-sm"
      style={{ animation: `lvFadeUp 0.5s ease-out both`, animationDelay: `${index * 90}ms` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {lead.area}
        </span>
        <ScoreStars score={lead.score} />
      </div>

      {/* Business name */}
      {locked ? (
        <div className="mb-1 flex items-center gap-1.5">
          <div className="h-3.5 w-28 rounded bg-white/20 blur-[3px]" />
          <Lock className="h-3 w-3 text-muted-foreground" />
        </div>
      ) : (
        <p
          className={`mb-1 text-sm font-semibold text-white ${unlocking ? "" : ""}`}
          style={unlocking ? { animation: "lvResolve 0.6s ease-out both" } : undefined}
        >
          {lead.name}
        </p>
      )}

      <p className="mb-2 text-[11px] text-muted-foreground">{lead.category}</p>

      {/* Phone */}
      {locked ? (
        <div className="mb-1 flex items-center gap-1.5">
          <div className="h-2.5 w-24 rounded bg-white/15 blur-[3px]" />
          <Lock className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      ) : (
        <p className="mb-1 text-[11px] text-white/80" style={unlocking ? { animation: "lvResolve 0.7s ease-out both" } : undefined}>
          {lead.phone}
        </p>
      )}

      {/* Email */}
      {locked ? (
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-32 rounded bg-white/15 blur-[3px]" />
          <Lock className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      ) : (
        <p className="text-[11px] text-white/60" style={unlocking ? { animation: "lvResolve 0.8s ease-out both" } : undefined}>
          {lead.email}
        </p>
      )}
    </div>
  );
}

// ── Per-scene visuals ────────────────────────────────────────────────────────

function Scene1() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 text-center">
      <img
        src={logo}
        alt="Lead Velocity"
        className="h-20 w-auto sm:h-28"
        style={{ animation: "lvLogoReveal 1s ease-out both", filter: "drop-shadow(0 0 30px hsl(280 90% 60% / 0.5))" }}
      />
      <div style={{ animation: "lvFadeUp 0.7s ease-out 0.4s both" }}>
        <h2 className="text-3xl font-bold gradient-text sm:text-4xl">Lead Velocity</h2>
        <p className="mt-2 text-lg text-muted-foreground">Your Lead Portal</p>
      </div>
    </div>
  );
}

function Scene2() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
      {SAMPLE_LEADS.map((lead, i) => (
        <LeadCard key={lead.name} lead={lead} index={i} />
      ))}
    </div>
  );
}

function Scene3() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
      {SAMPLE_LEADS.map((lead, i) => (
        <LeadCard key={lead.name} lead={lead} index={i} locked />
      ))}
    </div>
  );
}

function Scene4() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2 text-primary">
        <FileSignature className="h-5 w-5" />
        <span className="text-sm font-semibold">Lead Purchase Agreement</span>
      </div>
      <div className="space-y-2">
        <div className="h-2 w-full rounded bg-white/10" />
        <div className="h-2 w-11/12 rounded bg-white/10" />
        <div className="h-2 w-full rounded bg-white/10" />
        <div className="h-2 w-9/12 rounded bg-white/10" />
        <div className="h-2 w-10/12 rounded bg-white/10" />
      </div>

      <p className="mb-1 mt-6 text-[11px] uppercase tracking-wide text-muted-foreground">Sign here</p>
      <div className="relative h-20 rounded-lg border border-dashed border-white/20 bg-black/20">
        <svg viewBox="0 0 300 80" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <path
            d="M15 55 C 40 20, 60 20, 75 45 S 110 70, 130 40 S 165 10, 190 45 C 205 65, 230 55, 250 30 L 285 42"
            fill="none"
            stroke="hsl(330 85% 65%)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: "lvSign 2.2s ease-in-out 0.3s forwards" }}
          />
        </svg>
        <div className="absolute bottom-2 left-4 right-4 border-t border-white/20" />
      </div>
    </div>
  );
}

function Scene5() {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4 sm:flex-row sm:justify-center">
      {/* Bank details */}
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl backdrop-blur-sm">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <CreditCard className="h-5 w-5" />
          <span className="text-sm font-semibold">EFT Banking Details</span>
        </div>
        <dl className="space-y-1.5 text-[12px]">
          <div className="flex justify-between"><dt className="text-muted-foreground">Bank</dt><dd className="text-white">FNB</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Account</dt><dd className="text-white">6284 1120 553</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Branch</dt><dd className="text-white">250655</dd></div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="rounded bg-primary/20 px-1.5 text-primary">Your brokerage name</dd>
          </div>
        </dl>
      </div>

      {/* Animated arrow */}
      <ArrowRight
        className="h-8 w-8 shrink-0 rotate-90 text-primary sm:rotate-0"
        style={{ animation: "lvArrowPulse 1.4s ease-in-out infinite" }}
      />

      {/* Proof of payment envelope */}
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center shadow-xl backdrop-blur-sm">
        <Mail className="mx-auto mb-2 h-8 w-8 text-primary" style={{ animation: "lvFadeUp 0.6s ease-out 0.3s both" }} />
        <p className="text-sm font-semibold text-white">Email proof of payment</p>
        <p className="mt-1 break-all text-[12px] text-primary">howzit@leadvelocity.co.za</p>
      </div>
    </div>
  );
}

function Scene6() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
      {SAMPLE_LEADS.map((lead, i) => (
        <div key={lead.name} className="relative">
          <Unlock
            className="absolute -top-2 -right-2 z-10 h-5 w-5 text-green-400"
            style={{ animation: `lvPop 0.5s ease-out both`, animationDelay: `${i * 90}ms` }}
          />
          <LeadCard lead={lead} index={i} unlocking />
        </div>
      ))}
    </div>
  );
}

function Scene7() {
  const columns = ["New", "Contacted", "Interested", "Meeting Set", "Won"];
  return (
    <div className="w-full max-w-3xl">
      <div className="grid grid-cols-5 gap-2">
        {columns.map((col, ci) => (
          <div key={col} className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
            <p className="mb-2 text-center text-[10px] font-semibold text-muted-foreground">{col}</p>
            <div className="min-h-[70px] space-y-2">
              {/* The travelling card lives visually in the Won column; a ghost sits in New */}
              {ci === 0 && (
                <div className="rounded-md border border-white/10 bg-white/5 p-1.5 opacity-30">
                  <div className="h-1.5 w-10 rounded bg-white/30" />
                </div>
              )}
              {ci === 4 && (
                <div
                  className="rounded-md border border-primary/40 bg-primary/15 p-1.5 shadow-lg"
                  style={{ animation: "lvKanban 3s ease-in-out infinite" }}
                >
                  <div className="mb-1 h-1.5 w-12 rounded bg-primary/70" />
                  <div className="flex items-center gap-1">
                    <StickyNote className="h-2.5 w-2.5 text-yellow-400" />
                    <MessageSquarePlus className="h-2.5 w-2.5 text-primary" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Drag from New → Won · add private notes · message the Lead Velocity team
      </p>
    </div>
  );
}

function Scene8({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative">
        <div className="w-56 rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-1.5 text-green-400">
            <Download className="h-4 w-4" />
            <span className="text-[11px] font-semibold">leads-export.csv</span>
          </div>
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-3 gap-1">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div
                    key={j}
                    className="h-2 rounded bg-white/10"
                    style={{ animation: "lvFadeUp 0.4s ease-out both", animationDelay: `${(i * 3 + j) * 60}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <Download
          className="absolute -bottom-3 left-1/2 h-7 w-7 -translate-x-1/2 text-primary"
          style={{ animation: "lvDownload 1.6s ease-in-out infinite" }}
        />
      </div>

      <div style={{ animation: "lvFadeUp 0.7s ease-out 0.3s both" }}>
        <h2 className="text-3xl font-bold gradient-text sm:text-4xl">Welcome aboard</h2>
        <p className="mt-2 text-muted-foreground">You're ready to start closing.</p>
        <button
          onClick={onGetStarted}
          className="mt-5 rounded-full bg-gradient-to-r from-[hsl(280_90%_60%)] to-[hsl(330_85%_60%)] px-8 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

const SCENE_VISUALS = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6, Scene7];

export default function Explainer() {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [started, setStarted] = useState(false);
  const [scene, setScene] = useState(0); // 0-based
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);

  const close = () => navigate("/broker/orders");

  // Load + play the current scene's audio whenever the scene changes while playing.
  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/explainer/audio/scene${scene + 1}.mp3`;
    audio.load();
    if (playing) {
      audio.play().catch(() => {
        // If the browser blocks playback, drop back to paused so the user can retry.
        setPlaying(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, started]);

  // Reflect play/pause state onto the audio element for the current scene.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !started) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, started]);

  const handleEnded = () => {
    if (scene < SCENE_COUNT - 1) {
      setScene((s) => s + 1);
    } else {
      setPlaying(false);
      setFinished(true);
    }
  };

  const begin = () => {
    setStarted(true);
    setScene(0);
    setFinished(false);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (finished) return;
    setPlaying((p) => !p);
  };

  const skipScene = () => {
    if (scene < SCENE_COUNT - 1) {
      setScene((s) => s + 1);
    } else {
      const audio = audioRef.current;
      if (audio) audio.pause();
      setPlaying(false);
      setFinished(true);
    }
  };

  const replay = () => {
    setFinished(false);
    setScene(0);
    setPlaying(true);
    setStarted(true);
  };

  const goToScene = (i: number) => {
    setFinished(false);
    setStarted(true);
    setScene(i);
    setPlaying(true);
  };

  const Visual = useMemo(() => SCENE_VISUALS[scene] ?? Scene1, [scene]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[hsl(240_10%_4%)] text-white">
      <style>{keyframes}</style>

      {/* Ambient gradient glows */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[hsl(280_90%_60%)] opacity-20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[hsl(330_85%_60%)] opacity-20 blur-[130px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8">
        <img src={logo} alt="Lead Velocity" className="h-8 w-auto" />
        <button
          onClick={close}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
          {started ? "Close" : "Skip intro"}
        </button>
      </header>

      {/* Stage */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
        {!started ? (
          <div className="flex flex-col items-center gap-8 text-center">
            <img
              src={logo}
              alt="Lead Velocity"
              className="h-16 w-auto sm:h-24"
              style={{ filter: "drop-shadow(0 0 30px hsl(280 90% 60% / 0.5))" }}
            />
            <div>
              <h1 className="text-2xl font-bold gradient-text sm:text-4xl">How your portal works</h1>
              <p className="mt-2 text-muted-foreground">A quick, one-minute walkthrough.</p>
            </div>
            <button
              onClick={begin}
              className="flex items-center gap-3 rounded-full bg-gradient-to-r from-[hsl(280_90%_60%)] to-[hsl(330_85%_60%)] px-8 py-4 text-base font-semibold text-white shadow-[0_0_30px_hsl(280_90%_60%/0.5)] transition-transform hover:scale-105"
            >
              <Play className="h-5 w-5 fill-white" />
              Play walkthrough (1 min)
            </button>
          </div>
        ) : (
          <div key={scene} className="w-full" style={{ animation: "lvSceneIn 0.5s ease-out both" }}>
            <div className="flex min-h-[46vh] items-center justify-center">
              {finished || scene === SCENE_COUNT - 1 ? <Scene8 onGetStarted={close} /> : <Visual />}
            </div>
          </div>
        )}
      </main>

      {/* Caption + player chrome */}
      {started && (
        <footer className="relative z-10 px-4 pb-6 sm:px-8">
          {/* Caption */}
          <div className="mx-auto mb-4 max-w-2xl text-center">
            <p className="text-base leading-relaxed text-white/90 sm:text-lg">
              {SCENES[scene].caption}
            </p>
          </div>

          {/* Progress dots */}
          <div className="mb-4 flex items-center justify-center gap-2">
            {SCENES.map((_, i) => (
              <button
                key={i}
                onClick={() => goToScene(i)}
                aria-label={`Go to scene ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === scene && !finished
                    ? "w-6 bg-gradient-to-r from-[hsl(280_90%_60%)] to-[hsl(330_85%_60%)]"
                    : i < scene || finished
                    ? "w-2 bg-white/50"
                    : "w-2 bg-white/20"
                }`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {finished ? (
              <button
                onClick={replay}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" /> Replay
              </button>
            ) : (
              <button
                onClick={togglePlay}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[hsl(280_90%_60%)] to-[hsl(330_85%_60%)] text-white shadow-lg transition-transform hover:scale-105"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
              </button>
            )}

            {!finished && (
              <button
                onClick={skipScene}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10"
                aria-label="Skip to next scene"
              >
                Skip <SkipForward className="h-4 w-4" />
              </button>
            )}
          </div>
        </footer>
      )}

      {/* Single audio element — src swapped per scene, `ended` drives advance */}
      <audio ref={audioRef} onEnded={handleEnded} className="hidden" />
    </div>
  );
}

const keyframes = `
@keyframes lvLogoReveal {
  0% { opacity: 0; transform: scale(0.8) translateY(10px); filter: blur(8px); }
  100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}
@keyframes lvFadeUp {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes lvSceneIn {
  0% { opacity: 0; transform: translateY(18px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes lvSign {
  to { stroke-dashoffset: 0; }
}
@keyframes lvResolve {
  0% { opacity: 0; filter: blur(6px); letter-spacing: 2px; }
  100% { opacity: 1; filter: blur(0); letter-spacing: normal; }
}
@keyframes lvPop {
  0% { opacity: 0; transform: scale(0) rotate(-30deg); }
  60% { transform: scale(1.3) rotate(8deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
@keyframes lvArrowPulse {
  0%, 100% { opacity: 0.4; transform: translateX(0) rotate(var(--tw-rotate, 0)); }
  50% { opacity: 1; }
}
@keyframes lvKanban {
  0% { opacity: 0; transform: translateX(-160%) scale(0.9); }
  15% { opacity: 1; transform: translateX(0) scale(1); }
  85% { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes lvDownload {
  0%, 100% { transform: translate(-50%, 0); opacity: 0.6; }
  50% { transform: translate(-50%, 6px); opacity: 1; }
}
`;
