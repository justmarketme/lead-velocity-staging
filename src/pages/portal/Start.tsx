/** 01 Start here (portal/spec/01-start-here.md; prototype start.html). Intercom/Appcues checklist + Loom/Wistia video. */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell, { usePortal } from "./PortalShell";
import { EXPLAINER_URL, EXPLAINER_VTT, STEPS, fmtDay, fmtDayTime, portalEvent, progressSummary, stepDone } from "@/lib/smc";

const CHAPTERS: [string, number][] = [
  ["What we do for you, and what happens next", 0], ["Your details and the FSP check", 75], ["Connect your Outlook calendar", 85],
  ["Your intro card", 99], ["Record your voice note or video", 105], ["Sign the agreement, pay options", 127],
  ["Where your leads and briefs live", 135], ["Marking outcomes, and replacements", 143], ["What you get on WhatsApp, and when", 155],
];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Body() {
  const { broker, reload } = usePortal();
  const video = useRef<HTMLVideoElement>(null);
  const [sent, setSent] = useState(false);
  const p = progressSummary(broker.onboarding_progress);
  const prog = broker.onboarding_progress;
  const watched = stepDone(prog, "video");
  const status = String(broker.status);

  async function onTime() {
    const v = video.current;
    if (!v || sent || !v.duration) return;
    if (v.currentTime / v.duration >= 0.9) { setSent(true); await portalEvent("step.completed", "video"); void reload(); }
  }
  async function later() { await portalEvent("step.skipped", "video"); void reload(); }
  const jump = (t: number) => { if (video.current) { video.current.currentTime = t; void video.current.play(); } };

  const blocked: string | null =
    broker.fsp_check?.status === "blocked" ? "We could not match your FSP number to your practice on the FSCA register. Check it on your Profile, or message us."
    : broker.calendar_status === "blocked_admin_consent" ? "Microsoft needs your IT admin to approve us. Open Calendar for the two easy ways forward."
    : broker.calendar_status === "needs_reconnect" ? "Reconnect your calendar so leads can keep booking."
    : null;

  return (
    <>
      {status === "active" && (
        <div className="next-slot" role="status"><span style={{ fontSize: 24 }}>✓</span><div><b>You're live{broker.approved_live_at ? ` since ${fmtDay(broker.approved_live_at)}` : ""}.</b><Link to="/broker/leads">Go to My leads</Link></div></div>
      )}
      {status === "ready_for_go_live" && (
        <div className="next-slot" role="status"><span style={{ fontSize: 24 }}>✓</span><div><b>Everything is checked.</b>Jonathan will switch you on shortly. We'll message you on WhatsApp.</div></div>
      )}
      {status === "onboarded" && (
        <section className="card"><h2>You're done. Final checks next.</h2><p className="muted">We run a final check, then Jonathan taps "Go live" and leads start. We'll message you on WhatsApp the moment you're live.</p></section>
      )}
      {blocked && <div className="alert" role="alert">{blocked} <Link to="/broker/help">Or message us.</Link></div>}

      <section className="card" aria-labelledby="vh" id="explainer">
        <h2 id="vh">{watched && status !== "onboarding" ? "Watch again" : "Start here: 3 minutes, then you're set"}</h2>
        <p className="muted">Watch this once. It shows every step, with captions. You can watch it on mute.</p>
        <video ref={video} controls preload="metadata" playsInline onTimeUpdate={onTime} aria-label="The 3-minute explainer video">
          <source src={EXPLAINER_URL} type="video/mp4" />
          <track kind="captions" src={EXPLAINER_VTT} srcLang="en" label="English" default />
        </video>
        <ul className="chap" aria-label="Chapters">
          {CHAPTERS.map(([t, s], i) => (
            <li key={t}><button type="button" onClick={() => jump(s)} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>{i + 1} · {t}</button><b>{mmss(s)}</b></li>
          ))}
        </ul>
        {!watched && <button type="button" className="btn ghost" onClick={later}>I'll watch it later</button>}
      </section>

      {broker.next_free_slot_at && (
        <div className="next-slot"><span style={{ fontSize: 22 }}>✓</span><div><b>Your next free slot: {fmtDayTime(broker.next_free_slot_at)}</b>From your real calendar.</div></div>
      )}

      <section className="card" aria-labelledby="ck">
        <h2 id="ck">Your 7 steps</h2>
        <p className="muted">About 12 minutes to be ready to go live. Your video takes 10 more, any time. One thing at a time. Everything you type is saved, so you never type it twice.</p>
        <ol className="steps">
          {STEPS.map((s, i) => {
            const st = prog?.[s.key]?.status;
            const done = stepDone(prog, s.key);
            const now = p.current?.key === s.key;
            const sub = done ? (st === "skipped" ? "Skipped. Come back any time." : st === "defaulted" ? "We used the standard settings. Change them any time." : s.key === "profile" ? "FSP checked on the FSCA register" : "Done")
              : st === "blocked" ? "Needs a fix. Tap to see what." : `${s.reason} · ${s.minutes} min`;
            return (
              <li key={s.key} style={{ listStyle: "none" }}>
                <Link className={`step${done ? " done" : ""}${now ? " now" : ""}`} to={s.path}>
                  <span className="dot">{done ? "✓" : i + 1}</span>
                  <span><span className="t">{i + 1}. {s.title}</span><br /><span className="s">{sub}</span></span>
                  {now && <span className="go">Next ›</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card" aria-labelledby="gl">
        <h3 id="gl">What we need before you go live</h3>
        <p style={{ margin: "4px 0 8px" }}>Three things must be done: <b>FSP checked</b>, <b>calendar connected</b>, <b>agreement signed</b>. We also need your intro card approved. Your video can come later.</p>
        <p className="muted" style={{ margin: 0 }}>After that we run a final check. Then Jonathan taps "Go live" and leads start.</p>
      </section>

      {p.current && status !== "active" && <Link className="btn" to={p.current.path}>Next: {p.current.title.toLowerCase()}</Link>}
      <p className="small" style={{ textAlign: "center" }}>Stuck? <Link to="/broker/help">Help</Link> · or WhatsApp us. No call needed.</p>
    </>
  );
}

export default function Start() {
  return <PortalShell title={(b) => `Welcome, ${(b.contact_person || "").split(" ")[0] || "there"}`}><Body /></PortalShell>;
}
