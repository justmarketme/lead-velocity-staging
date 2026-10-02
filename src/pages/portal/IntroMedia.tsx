/**
 * 04 Voice note and video (portal/spec/04-voice-note-and-video.md). The recorder is intro-media-producer's static app
 * (portal/intro-media/, served at VITE_SMC_INTRO_MEDIA_URL); this page is the wizard slot: why, current takes, open, skip.
 * Never blocking (0.3 #12). Skip → smc_portal_event('step.skipped','media').
 */
import { useEffect, useState } from "react";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CLIPS_BASE, INTRO_MEDIA_URL, errText, fmtDay, portalEvent, smcDb, stepDone } from "@/lib/smc";
import type { SmcBrokerMedia } from "@/integrations/supabase/smc-types";

const STATE_LABEL: Record<string, string> = { processing: "Processing", ready: "Ready to approve", rejected: "Needs another take", approved: "Approved · leads see this", superseded: "Replaced" };

function Body() {
  const { broker, reload } = usePortal();
  const [takes, setTakes] = useState<SmcBrokerMedia[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await smcDb.from("broker_media").select("*").eq("broker_id", broker.id).in("kind", ["voice", "video"]).order("created_at", { ascending: false }).limit(10);
      if (error) setErr(errText(error));
      setTakes((data as SmcBrokerMedia[]) || []);
    })();
  }, [broker.id]);
  const st = broker.onboarding_progress?.media?.status;
  async function skip() { await portalEvent("step.skipped", "media"); void reload(); }

  return (
    <>
      <section className="card">
        <h2>Record your 25-second intro</h2>
        <p className="muted">People show up for people. A lead who has seen your face and heard your voice for 25 seconds before the call is far less likely to no-show. It takes 10 minutes once.</p>
        <a className="btn" href={INTRO_MEDIA_URL}>{takes.length ? "Record another take" : "Start: 10 minutes"}</a>
        <a className="btn ghost" href={`${INTRO_MEDIA_URL}${INTRO_MEDIA_URL.includes("?") ? "&" : "?"}audio=1`}>Voice note only</a>
        {!stepDone(broker.onboarding_progress, "media") && <button className="btn ghost" type="button" onClick={skip}>Skip for now</button>}
        {st === "skipped" && <p className="small">Skipped. Come back any time.</p>}
        <p className="hint">Your agreement says we use your photo, voice and video only if you agree to clause 11.2. You can record now; sending to leads waits for that tick.</p>
      </section>
      <section className="card">
        <h3>Your takes</h3>
        {err && <p className="err">{err}</p>}
        {!takes.length && <p className="muted">No takes yet.</p>}
        <table className="tbl"><tbody>
          {takes.map((t) => (
            <tr key={t.id}><td>{t.kind === "video" ? "Video" : "Voice note"} · {t.language.toUpperCase()} · v{t.version}<br /><span className="small">{fmtDay(t.created_at)}</span></td>
              <td style={{ textAlign: "right" }}><span className={`st${t.state === "approved" ? " ok" : t.state === "rejected" ? " w" : ""}`}>{STATE_LABEL[t.state] || t.state}</span></td></tr>
          ))}
        </tbody></table>
      </section>
      <StepClip title="record your intro" length="0:40" file={`${CLIPS_BASE}/intro-media.mp4`} />
    </>
  );
}

export default function IntroMedia() {
  return <PortalShell title="Voice note and video"><Body /></PortalShell>;
}
