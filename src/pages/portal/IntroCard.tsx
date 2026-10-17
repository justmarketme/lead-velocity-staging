/**
 * 03 Intro card (portal/spec/03-intro-card.md). visual-producer renders the 1080x1080 PNG into broker_media(kind=card);
 * this page previews it and records approval through smc_portal_event('card.approved') — W20 writes approved_at / is_current /
 * brokers.intro_card_url (the broker cannot write those columns directly: smc_brokers_guard) and emails the copy from howzit@.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CLIPS_BASE, errText, fmtDayTime, methodLabel, portalEvent, smcDb, stepDone } from "@/lib/smc";
import type { SmcBrokerMedia } from "@/integrations/supabase/smc-types";

function Body() {
  const { broker, reload } = usePortal();
  const [cards, setCards] = useState<SmcBrokerMedia[]>([]);
  const [tick, setTick] = useState(false);
  const [initials, setInitials] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await smcDb.from("broker_media").select("*").eq("broker_id", broker.id).eq("kind", "card").order("version", { ascending: false }).limit(5);
      if (error) setErr(errText(error));
      setCards((data as SmcBrokerMedia[]) || []);
    })();
  }, [broker.id]);

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
  if (!broker.languages?.length) missing.push("at least one language");
  if (!broker.headshot_url && !initials) missing.push("a photo, or tick 'Use my initials for now'");
  const ready = missing.length === 0;
  const alreadyDone = stepDone(broker.onboarding_progress, "card") && approved && latest && approved.id === latest.id;

  async function approve() {
    setErr(null);
    const { error } = await portalEvent("card.approved", "card", { media_id: latest?.id || null, version: latest?.version || null, use_initials: !broker.headshot_url, wording: "broker_intro_booked" });
    if (error) return setErr(errText(error));
    setMsg("Approved. Leads will see this card. You can change it any time: just edit your details and approve the new one.");
    void reload();
  }

  return (
    <>
      <section className="card" id="card">
        <h2>Your intro card</h2>
        <p className="muted">This is the picture leads get on WhatsApp the moment they book. Check it is right, then approve.</p>
        {latest?.url && latest.state !== "processing" ? (
          <img src={latest.url} alt={`Intro card for ${adviser}`} style={{ width: "100%", borderRadius: "var(--sm-radius-lg)" }} />
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
        {latest?.state === "processing" && <p className="small">Updating your card…</p>}
        {!latest && <p className="small">Preview. The final card is made from these details within seconds of a change.</p>}

        <h3 style={{ marginTop: 14 }}>What the lead reads with it</h3>
        <div className="brief">
          Hi Lerato, thanks for your insurance and financial planning enquiry. Your details have been passed to {practice || "{practice}"} (FSP {fsp || "{fsp}"}), an authorised financial services provider. {adviser || "{adviser}"} will be your adviser for your {methodLabel(broker.methods_supported?.[0]) || "Teams"} call on Tuesday 6 Oct at 10:00. Reply STOP to opt out.
        </div>
        <p className="hint">Example only (fictional lead and time). The wording is set by our compliance check and is the same for every lead.</p>

        {!broker.headshot_url && (
          <label className="chip" style={{ display: "flex", marginTop: 10 }}><input type="checkbox" checked={initials} onChange={(e) => setInitials(e.target.checked)} /> Use my initials for now. <span className="small">Add a photo any time; leads trust a real face.</span></label>
        )}
        {alreadyDone ? (
          <div className="next-slot" role="status" style={{ marginTop: 12 }}><span>✓</span><div><b>Approved{approved?.approved_at ? ` ${fmtDayTime(approved.approved_at)}` : ""}.</b>Leads see this card.</div></div>
        ) : (
          <>
            {!ready && <p className="alert" style={{ marginTop: 12 }}>Before you approve, we need {missing.join(", ")}. <Link to="/broker/profile">Fix it on your Profile</Link>.</p>}
            <label className="chip" style={{ marginTop: 12, display: "flex" }}><input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} /> I have read my card and the disclosure wording. I approve both.</label>
            <p className="hint">Your approval is saved with the date and time and copied to howzit@leadvelocity.co.za.</p>
            <div style={{ height: 10 }} />
            <button className="btn" disabled={!tick || !ready || !!msg} onClick={approve}>Approve my intro card</button>
          </>
        )}
        {msg && <div className="next-slot" role="status" style={{ marginTop: 10 }}><span>✓</span><div>{msg}</div></div>}
        {err && <p className="err" role="alert">{err}</p>}
        <Link className="btn ghost" style={{ marginTop: 8 }} to="/broker/profile">Something is wrong: fix it</Link>
      </section>
      <StepClip title="your intro card" length="0:30" file={`${CLIPS_BASE}/intro-card.mp4`} />
    </>
  );
}

export default function IntroCard() {
  return <PortalShell title="Your intro card"><Body /></PortalShell>;
}
