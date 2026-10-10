/**
 * 02 Profile (portal/spec/02-profile.md; prototype profile.html). Extends BrokerProfile.tsx (INV-P09) for SMC brokers.
 * Writes own brokers columns only (smc_brokers_guard blocks status/FSP-verification/etc.); FSCA check runs in W20 on `fsp.submitted`.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CLIPS_BASE, MEDIA_BUCKET, errText, noAdviceTrip, portalEvent, smcDb } from "@/lib/smc";
import type { SmcBrokerSelfUpdate } from "@/integrations/supabase/smc-types";

const LANGS = ["English", "Afrikaans", "isiZulu", "isiXhosa", "Sesotho", "Setswana", "Sepedi", "Xitsonga", "Tshivenda", "siSwati", "isiNdebele", "Other"];
const normFsp = (v: string) => v.replace(/\s+/g, "").replace(/^fsp/i, "");
/** ASSUMPTION (spec 02): FSP numbers are 3-6 digits — confirm against Mark's real number (needs_human). */
const fspValid = (v: string) => /^\d{3,6}$/.test(normFsp(v));
function normSaMobile(v: string): string {
  const d = v.replace(/[^\d+]/g, "");
  if (/^0[678]\d{8}$/.test(d)) return "+27" + d.slice(1);
  if (/^27[678]\d{8}$/.test(d)) return "+" + d;
  return d;
}
const mobileValid = (v: string) => /^\+27[678]\d{8}$/.test(normSaMobile(v));

function Body() {
  const { broker, reload } = usePortal();
  const [a, setA] = useState({ practice: broker.firm_name || "", fsp: broker.fsp_number || "", adviser: broker.contact_person || "", wa: broker.whatsapp_number || "", email: broker.email || "" });
  const [b, setB] = useState({ bio: broker.bio_short || "", langs: broker.languages?.length ? broker.languages : ["en"], years: broker.years_advising?.toString() || "" });
  const [errA, setErrA] = useState<string | null>(null);
  const [errB, setErrB] = useState<string | null>(null);
  const [savedB, setSavedB] = useState(false);
  const [checking, setChecking] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const polls = useRef(0);
  const check = broker.fsp_check;
  const verified = !!broker.fsp_verified_at || check?.status === "verified";

  // Poll the row while W20 runs the FSCA check (target under 10 s; the broker can carry on).
  useEffect(() => {
    if (!checking) return;
    const t = window.setInterval(async () => {
      polls.current += 1;
      const row = await reload();
      const st = row?.fsp_check?.status;
      if (polls.current > 15 || st === "verified" || st === "blocked" || st === "pending_manual") { setChecking(false); window.clearInterval(t); }
    }, 4000);
    return () => window.clearInterval(t);
  }, [checking, reload]);

  // language chips store codes for English/Afrikaans (routing), names for the rest
  const code = (l: string) => (l === "English" ? "en" : l === "Afrikaans" ? "af" : l);
  const toggleLang = (l: string) => { const c = code(l); setB((x) => ({ ...x, langs: x.langs.includes(c) ? x.langs.filter((y) => y !== c) : [...x.langs, c] })); };

  async function saveA(extra: SmcBrokerSelfUpdate = {}) {
    setErrA(null);
    if (a.practice.trim().length < 2 || a.practice.trim().length > 120) return setErrA("Practice name: 2 to 120 characters.");
    if (!verified && !fspValid(a.fsp)) return setErrA("FSP number: digits only, 3 to 6 of them.");
    if (a.adviser.trim().length < 2 || a.adviser.trim().length > 80) return setErrA("Adviser name: 2 to 80 characters.");
    if (!mobileValid(a.wa)) return setErrA("That looks like a landline or an incomplete number. We need your mobile so leads and your daily list reach you.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email.trim())) return setErrA("Please check your email address.");
    const patch: SmcBrokerSelfUpdate = { firm_name: a.practice.trim(), contact_person: a.adviser.trim(), whatsapp_number: normSaMobile(a.wa), email: a.email.trim(), ...extra };
    if (!verified) patch.fsp_number = normFsp(a.fsp);
    const { error } = await smcDb.from("brokers").update(patch).eq("id", broker.id);
    if (error) return setErrA(errText(error));
    await portalEvent("profile.saved", "profile");
    if (!verified) { await portalEvent("fsp.submitted", "profile", { fsp_number: patch.fsp_number }); polls.current = 0; setChecking(true); }
    void reload();
  }

  async function saveB() {
    setErrB(null); setSavedB(false);
    const bio = b.bio.trim();
    if (bio.length < 40 || bio.length > 220) return setErrB("Two lines: 40 to 220 characters.");
    const trip = noAdviceTrip(bio);
    if (trip) return setErrB(`Please take out '${trip}'. We can't say that in a message to someone who hasn't met you yet.`);
    if (!b.langs.length) return setErrB("Pick at least one language.");
    const yrs = Number(b.years);
    if (!Number.isInteger(yrs) || yrs < 0 || yrs > 60) return setErrB("Years advising: a whole number from 0 to 60.");
    const patch: SmcBrokerSelfUpdate = { bio_short: bio, languages: b.langs, years_advising: yrs };
    if (file) {
      if (file.size > 8 * 1024 * 1024) return setErrB("That photo is over 8 MB. Try a smaller one.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${broker.id}/headshot-${Date.now()}.${ext}`;
      const up = await smcDb.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (up.error) return setErrB(`Photo upload failed: ${errText(up.error)}`);
      patch.headshot_url = `${MEDIA_BUCKET}/${path}`; // private bucket path; W20/visual-producer signs it when rendering the card
    }
    const { error } = await smcDb.from("brokers").update(patch).eq("id", broker.id);
    if (error) return setErrB(errText(error));
    await portalEvent("profile.saved", "profile", { screen: "photo_and_lines" });
    setSavedB(true); setFile(null);
    void reload();
  }

  const mismatch = check?.status === "blocked" && check.register_name && check.register_name !== broker.practice_legal_name;

  return (
    <>
      <section className="card">
        <h2>Tell us who you are</h2>
        <p className="muted">Three questions. We check your FSP number on the public FSCA register. It also shows leads you are the real thing.</p>
        <form onSubmit={(e) => { e.preventDefault(); void saveA(); }}>
          <label htmlFor="pn">Practice name</label>
          <input id="pn" type="text" value={a.practice} autoComplete="organization" onChange={(e) => setA({ ...a, practice: e.target.value })} />
          <p className="hint">As it appears on your FSP licence. Saved to your profile; never asked again.</p>
          <label htmlFor="fsp">FSP number</label>
          <input id="fsp" type="text" inputMode="numeric" value={a.fsp} maxLength={10} autoComplete="off" disabled={verified} onChange={(e) => setA({ ...a, fsp: e.target.value })} />
          <p className="hint">{verified ? "Checked. To change it, message us and Jonathan will update it." : "Digits only. We check it when you tap Save."}</p>
          {checking && <p className="pill info" role="status">Checking the FSCA register. This takes a few seconds.</p>}
          {verified && (
            <div className="next-slot" role="status"><span>✓</span><div><b>Found on the FSCA register{check?.register_name ? `: ${check.register_name}` : ""}</b>Authorised financial services provider{check?.checked_at ? " · checked" : ""}</div></div>
          )}
          {!checking && check?.status === "blocked" && !mismatch && (
            <div className="alert" role="alert">We could not match that number to your practice name. Check the number and try again. Nothing is wrong yet; this takes one more try. After three tries we check it by hand and tell you on WhatsApp.</div>
          )}
          {!checking && mismatch && (
            <div className="alert" role="alert">
              The register lists this FSP as <b>{check?.register_name}</b>. Is that your practice?
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="tap" onClick={() => saveA({ practice_legal_name: check?.register_name || null })}>Yes, that's us</button>
                <button type="button" className="tap g" onClick={() => document.getElementById("fsp")?.focus()}>No, change my number</button>
              </div>
            </div>
          )}
          {check?.status === "pending_manual" && <p className="pill warn">We're checking your FSP by hand. We'll tell you on WhatsApp.</p>}
          <label htmlFor="an">Adviser name</label>
          <input id="an" type="text" value={a.adviser} autoComplete="name" onChange={(e) => setA({ ...a, adviser: e.target.value })} />
          <div className="row2">
            <div><label htmlFor="wa">Your WhatsApp number</label><input id="wa" type="tel" inputMode="tel" value={a.wa} onChange={(e) => setA({ ...a, wa: e.target.value })} /></div>
            <div><label htmlFor="em">Email</label><input id="em" type="email" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} /></div>
          </div>
          <p className="hint">Leads' reminders and your daily list come here. Your email is used for the calendar and our copies.</p>
          {errA && <p className="err" role="alert">{errA}</p>}
          <div style={{ height: 12 }} />
          <button className="btn" type="submit">{verified ? "Save my details" : "Save and check my FSP"}</button>
        </form>
      </section>

      <section className="card">
        <h2>Your photo and two lines</h2>
        <p className="muted">Leads see these before they meet you.</p>
        <label htmlFor="ph">Headshot</label>
        <input id="ph" type="file" accept="image/*" capture="user" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <p className="hint">{broker.headshot_url ? "We have your photo. Pick a new one to replace it." : "Plain background, you looking at the camera. We crop it square. No photo yet? Your card uses your initials for now."}</p>
        <label htmlFor="bio">Two lines about you, in your own words</label>
        <textarea id="bio" maxLength={220} value={b.bio} onChange={(e) => setB({ ...b, bio: e.target.value })} />
        <p className="hint">Who you help and how you work. No product names, no "best", no promises. {b.bio.trim().length}/220</p>
        <label>Languages you speak</label>
        <div className="chips">
          {LANGS.map((l) => (
            <label key={l} className={`chip${b.langs.includes(code(l)) ? " on" : ""}`}>
              <input type="checkbox" checked={b.langs.includes(code(l))} onChange={() => toggleLang(l)} /> {l}
            </label>
          ))}
        </div>
        <label htmlFor="yrs">Years advising</label>
        <input id="yrs" type="number" inputMode="numeric" min={0} max={60} value={b.years} style={{ maxWidth: 120 }} onChange={(e) => setB({ ...b, years: e.target.value })} />
        {errB && <p className="err" role="alert">{errB}</p>}
        {savedB && <p className="pill ok" role="status">Saved.</p>}
        <div style={{ height: 12 }} />
        <button className="btn" type="button" onClick={saveB}>Save my photo and lines</button>
      </section>
      <Link className="btn ghost" to="/broker/intro-card">Next: approve your intro card</Link>
      <StepClip title="your details and FSP check" length="0:35" file={`${CLIPS_BASE}/profile.mp4`} />
    </>
  );
}

export default function Profile() {
  return <PortalShell title="Your details"><Body /></PortalShell>;
}
