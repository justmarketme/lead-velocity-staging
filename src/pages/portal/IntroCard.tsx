/**
 * 03 Intro card (portal/spec/03-intro-card.md). visual-producer renders the 1080x1080 PNG into broker_media(kind=card);
 * this page previews it (greyed, with a diagonal "Waiting for your approval" band) and approves it through
 * broker_approve_intro_card() (migration 20261013160000). Once approved the card is locked: changes go through
 * "Request a change" (broker_request_change, migration 20261013200000).
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CLIPS_BASE, errText, fmtDayTime, methodLabel, portalEvent, smcDb, stepDone } from "@/lib/smc";
import type { SmcBrokerMedia } from "@/integrations/supabase/smc-types";
import { BioReviewCard, FspVerifiedBadge } from "@/components/broker/smc/LvReview";
import { bioBlocked, cardApprovable, focusWhenReady, readBioReview } from "@/lib/brokerReview";
import { supabase } from "@/integrations/supabase/client";
import { profileErrorText } from "@/lib/brokerProfile";
import ApprovalBand from "@/components/broker/smc/ApprovalBand";
import RequestChange from "@/components/broker/smc/RequestChange";
import ApprovalSwitch from "@/components/broker/smc/ApprovalSwitch";

function Body() {
  const { broker, reload } = usePortal();
  const navigate = useNavigate();
  const [cards, setCards] = useState<SmcBrokerMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [initials, setInitials] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await smcDb.from("broker_media").select("*").eq("broker_id", broker.id).eq("kind", "card").order("version", { ascending: false }).limit(5);
      if (error) setErr(errText(error));
      setCards((data as SmcBrokerMedia[]) || []);
    })();
  }, [broker.id, nonce]);

  const latest = cards[0];
  const approved = cards.find((c) => c.state === "approved");
  const verified = !!broker.fsp_verified_at || broker.fsp_check?.status === "verified";
  const adviser = broker.contact_person || "";
  const practice = broker.firm_name || "";
  const fsp = broker.fsp_number || "";
  const methods = (broker.methods_supported || []).map(methodLabel).join(", ");
  const initialsText = adviser.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const missing: string[] = [];
  if (!verified) missing.push("your FSP number checked on the FSCA register");
  if (!adviser) missing.push("your adviser name");
  if (!practice) missing.push("your practice name");
  if (!broker.bio_short) missing.push("your two lines");
  else if (bioBlocked(readBioReview(broker.onboarding_progress), broker.bio_short)) missing.push("a small change to your two lines (see above)");
  if (!broker.languages?.length) missing.push("at least one language");
  if (!broker.headshot_url && !initials) missing.push("a photo, or tick 'Use my initials for now'");
  if (!cardApprovable(readBioReview(broker.onboarding_progress))) missing.push("your bio approved (see 'Your bio needs a small change')");
  if (!latest || latest.state === "processing") missing.push("the card Lead Velocity is preparing for you");
  const ready = missing.length === 0;
  const alreadyDone = stepDone(broker.onboarding_progress, "card") && approved && latest && approved.id === latest.id;

  async function approve() {
    setErr(null);
    if (!latest) return;
    setBusy(true);
    // One call: broker_media approved/current, brokers.intro_card_url, onboarding_progress.card, audit row (migration 20261013160000).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("broker_approve_intro_card", { p_media_id: latest.id });
    setBusy(false);
    if (error) return setErr(profileErrorText(error));
    setMsg("Approved. Leads will see this card.");
    setNonce((n) => n + 1); // re-read the card so the band lifts and it shows in colour
    void reload();
  }

  return (
    <>
      <section className="card" id="card">
        <h2>Your intro card</h2>
        <p className="muted">This is the picture leads get on WhatsApp the moment they book. Check it is right, then approve.</p>
        {latest?.url && latest.state !== "processing" ? (
          <div className="group/card" tabIndex={!alreadyDone ? 0 : undefined}
            aria-label={!alreadyDone ? "Preview your intro card in colour. Approval is still required." : undefined}
            style={{ position: "relative", overflow: "hidden", borderRadius: "var(--sm-radius-lg)" }}>
            <img src={latest.url} alt={`Intro card for ${adviser}`}
              className={`block w-full transition-[filter,opacity] duration-500 motion-reduce:transition-none ${alreadyDone ? "" : "grayscale opacity-50 group-hover/card:grayscale-0 group-hover/card:opacity-100 group-focus/card:grayscale-0 group-focus/card:opacity-100"}`} />
            <ApprovalBand show={!alreadyDone} />
          </div>
        ) : (
          <div className="intro-card" aria-label="Intro card preview">
            <div className="av">{initialsText}</div>
            <b style={{ fontSize: 22, fontWeight: 800 }}>{adviser || "Your name"}</b>
            <span>{practice || "Your practice"}</span>
            {verified && <span style={{ fontSize: 13, opacity: 0.85 }}>Authorised financial services provider · FSP {fsp}</span>}
            <span style={{ fontSize: 14 }}>{broker.bio_short || "Your two lines appear here."}</span>
            <span style={{ fontSize: 13, opacity: 0.85 }}>{(broker.languages || []).map((l) => (l === "en" ? "English" : l === "af" ? "Afrikaans" : l)).join(" · ")}{broker.years_advising ? ` · ${broker.years_advising} years advising` : ""}</span>
            <span style={{ fontSize: 13, color: "var(--sm-accent)", fontWeight: 800 }}>30-min {methods || "Teams or phone"} call · No obligation</span>
          </div>
        )}
        {latest?.url && latest.state !== "processing" && !alreadyDone && <p className="hint">Hover over the card or focus it with the keyboard to preview the colour. It stays unapproved until you switch on approval below.</p>}
        {latest?.state === "processing" && <p className="small">Updating your card…</p>}
        <FspVerifiedBadge check={broker.fsp_check} verifiedAt={broker.fsp_verified_at} skin="portal" />
        <BioReviewCard broker={broker} skin="portal" onDecided={() => { void reload(); }} onRewrite={() => { navigate("/broker/profile#bio"); focusWhenReady("bio"); }} />
        {!latest && <p className="small">Preview. The final card is made from these details within seconds of a change.</p>}

        <h3 style={{ marginTop: 14 }}>What the lead reads with it</h3>
        <div className="brief">
          Hi Lerato, thanks for your insurance and financial planning enquiry. Your details have been passed to {practice || "{practice}"} (FSP {fsp || "{fsp}"}), an authorised financial services provider. {adviser || "{adviser}"} will be your adviser for your {methodLabel(broker.methods_supported?.[0]) || "Teams"} call on Tuesday 6 Oct at 10:00. Reply STOP to opt out.
        </div>
        <p className="hint">Example only (fictional lead and time). The wording is set by our compliance check and is the same for every lead.</p>

        {!broker.headshot_url && (
          <label className="chip" style={{ display: "flex", marginTop: 10 }}><input type="checkbox" checked={initials} onChange={(e) => setInitials(e.target.checked)} /> Use my initials for now. <span className="small">Add a photo any time; leads trust a real face.</span></label>
        )}
        {alreadyDone && <div className="next-slot" role="status" style={{ marginTop: 12 }}><span>✓</span><div><b>Approved{approved?.approved_at ? ` ${fmtDayTime(approved.approved_at)}` : ""}.</b>Leads see this card.</div></div>}
        {!alreadyDone && !ready && <p className="alert" style={{ marginTop: 12 }}>Before you approve, we need {missing.join(", ")}. <Link to="/broker/profile">Fix it on your Profile</Link>.</p>}
        {!alreadyDone && <p className="hint">Your approval is saved with the date and time and copied to howzit@leadvelocity.co.za.</p>}
        <div style={{ marginTop: 10 }}>
          <ApprovalSwitch skin="portal" label="Approve my intro card" approved={!!alreadyDone} approvedAt={approved?.approved_at} blocked={!ready}
            blockedNote="Finish the steps above, then you can switch this on." busy={busy} error={err} onConfirm={approve}>
            <RequestChange broker={broker} item="intro_card" skin="portal" onRequested={() => { void reload(); }} />
          </ApprovalSwitch>
        </div>
        {msg && <div className="next-slot" role="status" style={{ marginTop: 10 }}><span>✓</span><div>{msg}</div></div>}
        {!alreadyDone && <Link className="btn ghost" style={{ marginTop: 8 }} to="/broker/profile">Something is wrong: fix it</Link>}
      </section>
      <StepClip title="your intro card" length="0:30" file={`${CLIPS_BASE}/intro-card.mp4`} />
    </>
  );
}

export default function IntroCard() {
  return <PortalShell title="Your intro card"><Body /></PortalShell>;
}
