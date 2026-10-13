/**
 * "Your intro card" for the portals brokers actually use (/broker-elite, /broker/profile legacy). The broker uploads a
 * headshot to the PRIVATE broker-media bucket under <brokers.id>/ (storage policy smc_06: own folder only), writes two
 * lines, and enters FSP number, practice name and languages; the preview shows the WhatsApp message a client gets when
 * a call is booked (W06: image header = intro card, body = template broker_intro_booked with the FSP disclosure).
 * Writes only columns smc_brokers_guard lets a broker write: firm_name / fsp_number are editable until routing is on
 * (then frozen), fsp_number only once the broker has a SortMyCover order (brand_id). The intro video is recorded by
 * sending it on WhatsApp (W23); its state is read from broker_media.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, CheckCircle2, Circle, Loader2, Lock, Video } from "lucide-react";
import { INTRO_MEDIA_URL, MEDIA_BUCKET, SUPPORT_EMAIL, errText, fmtDay, noAdviceTrip, portalEvent, smcDb } from "@/lib/smc";
import type { SmcBroker, SmcBrokerSelfUpdate } from "@/integrations/supabase/smc-types";
import { Tone, toneClasses } from "./tone";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { profileErrorText } from "@/lib/brokerProfile";
import HeadshotPicker from "./HeadshotPicker";

export const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" }, { code: "af", label: "Afrikaans" }, { code: "isiZulu", label: "isiZulu" },
  { code: "isiXhosa", label: "isiXhosa" }, { code: "Sesotho", label: "Sesotho" }, { code: "Setswana", label: "Setswana" },
  { code: "Sepedi", label: "Sepedi" }, { code: "Xitsonga", label: "Xitsonga" }, { code: "Tshivenda", label: "Tshivenda" },
  { code: "siSwati", label: "siSwati" }, { code: "isiNdebele", label: "isiNdebele" },
];
export const langLabel = (c: string) => LANGS.find((l) => l.code === c)?.label || c;
export const normFsp = (v: string) => v.replace(/\s+/g, "").replace(/^fsp/i, "");
/** ASSUMPTION (portal spec 02, same as Profile.tsx): FSP numbers are 3 to 6 digits. */
export const fspValid = (v: string) => /^\d{3,6}$/.test(normFsp(v));
const MAX_PHOTO = 8 * 1024 * 1024;

/** headshot_url is stored as "broker-media/<broker id>/headshot-….jpg" (Profile.tsx convention); the object key is after the bucket. */
export const mediaKey = (stored: string | null | undefined): string | null => {
  if (!stored) return null;
  const s = stored.replace(/^\/+/, "");
  return s.startsWith(`${MEDIA_BUCKET}/`) ? s.slice(MEDIA_BUCKET.length + 1) : /^https?:/i.test(s) ? null : s;
};

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "SC";

interface MediaRow { id: string; kind: string; state: string; version: number; created_at: string; approved_at: string | null; ai_check: { reason?: string } | null }

// ------------------------------------------------------------------------------------------------ preview (WhatsApp)
export function IntroCardPreview({ photo, adviser, practice, fsp, bio, languages, method = "Teams" }: {
  photo: string | null; adviser: string; practice: string; fsp: string; bio: string; languages: string[]; method?: string;
}) {
  const name = adviser || "Your name";
  const firm = practice || "Your practice";
  const fspText = fsp || "—";
  return (
    <figure className="rounded-2xl p-3 sm:p-4" style={{ background: "#0b141a" }} aria-label="Preview of the WhatsApp message a client receives">
      <div className="max-w-[340px] rounded-xl overflow-hidden shadow-lg" style={{ background: "#202c33", color: "#e9edef" }}>
        {/* image header = the intro card */}
        <div className="aspect-square w-full flex flex-col items-center justify-center gap-2 p-5 text-center" style={{ background: "linear-gradient(160deg,#0f3d3e 0%,#14532d 55%,#052e16 100%)" }}>
          {photo ? (
            <img src={photo} alt={`Photo of ${name}`} className="h-28 w-28 rounded-full object-cover ring-4 ring-white/20" />
          ) : (
            <div className="h-28 w-28 rounded-full grid place-items-center text-3xl font-black ring-4 ring-white/20" style={{ background: "#e9edef", color: "#14532d" }} aria-hidden="true">{initialsOf(name)}</div>
          )}
          <div className="text-xl font-extrabold leading-tight">{name}</div>
          <div className="text-sm font-semibold opacity-90">{firm}</div>
          <div className="text-xs opacity-80">FSP {fspText} · Authorised financial services provider</div>
          {bio && <div className="text-xs opacity-90 max-w-[260px] leading-snug">{bio}</div>}
          {languages.length > 0 && <div className="text-[11px] opacity-75">Speaks {languages.map(langLabel).join(" · ")}</div>}
          <div className="mt-1 text-[11px] font-bold uppercase tracking-wider rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,.12)" }}>Introduced by SortMyCover</div>
        </div>
        {/* body = template broker_intro_booked (automation/lib/w06.mjs), fictional client and time */}
        <div className="px-3 py-2 text-[13px] leading-snug">
          Hi Lerato, thanks for your insurance and financial planning enquiry. Your details have been passed to <b>{firm} (FSP {fspText})</b>, an authorised financial services provider. <b>{name}</b> will be your adviser for your {method} call on <b>Tue 6 Oct at 10:00</b>. Our WhatsApp assistant uses AI. Reply STOP to opt out.
          <div className="text-right text-[10px] mt-1" style={{ color: "#8696a0" }}>09:41</div>
        </div>
      </div>
      <figcaption className="text-[11px] mt-2" style={{ color: "#8696a0" }}>Example only: fictional client and time. The disclosure wording is fixed by our compliance check and is the same for every client.</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------------------------------------ editor
export default function IntroCardEditor({ broker, reload, tone = "theme" }: { broker: SmcBroker; reload: () => unknown; tone?: Tone }) {
  const c = toneClasses(tone);
  const preview = !!useBrokerPreview();
  const smc = !!broker.brand_id;
  const frozen = !!broker.routing_on;
  const [practice, setPractice] = useState(broker.firm_name || "");
  const [fsp, setFsp] = useState(broker.fsp_number || "");
  const [bio, setBio] = useState(broker.bio_short || "");
  const [langs, setLangs] = useState<string[]>(broker.languages?.length ? broker.languages : ["en"]);
  const [file, setFile] = useState<File | null>(null);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [storedPhoto, setStoredPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [video, setVideo] = useState<MediaRow | null>(null);
  const [mediaUnavailable, setMediaUnavailable] = useState(false);

  // Signed URL for the stored headshot (private bucket, short-lived, re-signed on every load).
  useEffect(() => {
    const key = mediaKey(broker.headshot_url);
    if (!key) { setStoredPhoto(null); return; }
    let alive = true;
    void smcDb.storage.from(MEDIA_BUCKET).createSignedUrl(key, 600).then(({ data }) => { if (alive) setStoredPhoto(data?.signedUrl || null); });
    return () => { alive = false; };
  }, [broker.headshot_url]);

  useEffect(() => {
    if (!file) { setLocalPhoto(null); return; }
    const u = URL.createObjectURL(file);
    setLocalPhoto(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    let alive = true;
    void smcDb.from("broker_media").select("id, kind, state, version, created_at, approved_at, ai_check")
      .eq("broker_id", broker.id).eq("kind", "video").order("created_at", { ascending: false }).limit(1)
      .then(({ data, error }) => { if (!alive) return; setMediaUnavailable(!!error); setVideo(((data as MediaRow[] | null) || [])[0] || null); });
    return () => { alive = false; };
  }, [broker.id]);

  const photo = localPhoto || storedPhoto;
  const fspOk = fspValid(fsp);
  const checklist = useMemo(() => [
    { key: "photo", label: "A headshot", done: !!(file || broker.headshot_url) },
    { key: "bio", label: "Two lines about you", done: bio.trim().length >= 40 },
    { key: "practice", label: "Practice name", done: practice.trim().length >= 2 },
    { key: "fsp", label: "FSP number (required before you go live)", done: !!broker.fsp_number && fspValid(broker.fsp_number) },
    { key: "langs", label: "At least one language", done: langs.length > 0 },
  ], [file, broker.headshot_url, broker.fsp_number, bio, practice, langs]);
  const allDone = checklist.every((x) => x.done);

  const toggleLang = (code: string) => setLangs((x) => (x.includes(code) ? x.filter((y) => y !== code) : [...x, code]));

  async function save() {
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setErr(null); setSaved(false);
    const b = bio.trim();
    if (b.length < 40 || b.length > 220) return setErr("Two lines: 40 to 220 characters.");
    const trip = noAdviceTrip(b);
    if (trip) return setErr(`Please take out '${trip}'. We can't say that to someone who hasn't met you yet.`);
    if (!langs.length) return setErr("Pick at least one language.");
    const patch: SmcBrokerSelfUpdate = { bio_short: b, languages: langs };
    const p = practice.trim();
    const firmChanged = !frozen && p !== (broker.firm_name || "");
    if (firmChanged && (p.length < 2 || p.length > 120)) return setErr("Practice name: 2 to 120 characters, as on your FSP licence.");
    const f = normFsp(fsp);
    const fspChanged = !frozen && f !== "" && f !== (broker.fsp_number || "");
    if (fspChanged && !fspOk) return setErr("FSP number: digits only, 3 to 6 of them.");
    setBusy(true);
    if (firmChanged || fspChanged) {
      const r = await smcDb.rpc("broker_update_profile", { p_firm_name: firmChanged ? p : null, p_fsp_number: fspChanged ? f : null, p_whatsapp_number: null });
      if (r.error) { setBusy(false); return setErr(profileErrorText(r.error)); }
    }
    if (file) {
      // HeadshotPicker already turned it into a JPEG ≤ 1600 px (src/lib/imagePrep.ts), so the type always fits broker-media.
      if (file.size > MAX_PHOTO) { setBusy(false); return setErr("That photo is over 8 MB. Try a smaller one."); }
      const path = `${broker.id}/headshot-${Date.now()}.jpg`;
      const up = await smcDb.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: "image/jpeg" });
      if (up.error) { setBusy(false); return setErr(`Photo upload failed: ${errText(up.error)}`); }
      patch.headshot_url = `${MEDIA_BUCKET}/${path}`;
    }
    const { error } = await smcDb.from("brokers").update(patch).eq("id", broker.id);
    setBusy(false);
    if (error) {
      const code = (error as { code?: string }).code;
      return setErr(code === "PGRST204" || code === "42703"
        ? "Intro cards switch on with SortMyCover. Your details weren't saved yet; ask Lead Velocity."
        : errText(error));
    }
    if (smc) {
      void portalEvent("profile.saved", "profile", { screen: "intro_card" });
      if (fspChanged) void portalEvent("fsp.submitted", "profile", { fsp_number: f });
    }
    setSaved(true); setFile(null);
    void reload();
  }

  const approveUrl = INTRO_MEDIA_URL.replace(/[^/]*$/, "approve.html");
  const videoState = mediaUnavailable ? null : video?.state || "none";
  const VIDEO_LABEL: Record<string, { text: string; cls: string }> = {
    none: { text: "Not recorded yet", cls: c.info },
    processing: { text: "Processing your take", cls: c.info },
    ready: { text: "Ready: approve it", cls: c.warn },
    rejected: { text: "Needs another take", cls: c.bad },
    approved: { text: "Approved: clients see it", cls: c.ok },
    superseded: { text: "Replaced by a newer take", cls: c.info },
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className={c.card}>
        <CardHeader className={tone === "elite" ? "p-6 pb-3" : undefined}>
          <CardTitle className={`text-lg ${c.title}`}>Your intro card</CardTitle>
          <CardDescription className={c.muted}>What a SortMyCover client sees on WhatsApp the moment they book a call with you.</CardDescription>
        </CardHeader>
        <CardContent className={`space-y-5 ${tone === "elite" ? "p-6 pt-0" : ""}`}>
          <div className={`p-3 text-sm rounded-lg ${frozen ? c.ok : allDone ? c.info : c.warn}`} role="status">
            {frozen ? "You're live. Clients receive this card when they book."
              : !broker.fsp_number ? "Not live yet. Your FSP number is required before Lead Velocity can switch your card on."
              : allDone ? (smc ? "Card complete. Lead Velocity switches you on after the final checks." : "Card complete. It goes live with your SortMyCover order.")
              : "Almost there. Finish the items below."}
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {checklist.map((x) => (
              <li key={x.key} className="flex items-center gap-2">{x.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-label="done" /> : <Circle className={`h-4 w-4 shrink-0 ${c.muted}`} aria-label="to do" />}{x.label}</li>
            ))}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="ic-photo">Headshot</Label>
            <div className="flex items-center gap-4">
              {photo ? <img src={photo} alt="Your headshot" className="h-16 w-16 rounded-full object-cover" /> : <div className={`h-16 w-16 rounded-full grid place-items-center ${c.box}`}><Camera className={`h-6 w-6 ${c.muted}`} aria-hidden="true" /></div>}
              <HeadshotPicker disabled={preview} onPicked={(f) => { setFile(f); setSaved(false); }} onError={setErr}
                primaryClass={c.primary} secondaryClass="border border-current/20 hover:bg-white/10" />
            </div>
            <p className={`text-xs ${c.muted}`}>{file ? "New photo ready. Tap Save my intro card to keep it." : "Plain background, looking at the camera. Any photo works; we resize it. Stored privately; only you and Lead Velocity can open it."}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ic-bio">Two lines about you</Label>
            <Textarea id="ic-bio" maxLength={220} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} className={c.input} placeholder="I help young families in Cape Town make sure their cover fits their life. Calm, plain-language calls." />
            <p className={`text-xs ${c.muted}`}>Who you help and how you work. No product names, prices, "best" or promises. {bio.trim().length}/220</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ic-practice" className="flex items-center gap-1.5">Practice name{frozen && <Lock className="h-3.5 w-3.5" aria-label="locked" />}</Label>
              <Input id="ic-practice" value={practice} disabled={frozen} maxLength={120} autoComplete="organization" onChange={(e) => setPractice(e.target.value)} className={c.input} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ic-fsp" className="flex items-center gap-1.5">FSP number{frozen && <Lock className="h-3.5 w-3.5" aria-label="locked" />}</Label>
              <Input id="ic-fsp" inputMode="numeric" value={fsp} maxLength={10} autoComplete="off" disabled={frozen} onChange={(e) => setFsp(e.target.value)} className={c.input} aria-invalid={!frozen && fsp !== "" && !fspOk} />
            </div>
          </div>
          <p className={`text-xs -mt-3 ${c.muted}`}>
            {frozen ? "Locked while you receive clients (it is in the disclosure). To change it, email " + SUPPORT_EMAIL + "."
              : "As on your FSP licence. We check it on the FSCA register."}
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Languages you advise in</legend>
            <div className="flex flex-wrap gap-2">
              {LANGS.map((l) => {
                const on = langs.includes(l.code);
                return (
                  <button key={l.code} type="button" aria-pressed={on} onClick={() => toggleLang(l.code)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${on ? (tone === "elite" ? "bg-pink-600 border-pink-600 text-white" : "bg-primary border-primary text-primary-foreground") : (tone === "elite" ? "border-white/10 text-slate-300 hover:border-white/30" : "border-border text-muted-foreground hover:text-foreground")}`}>
                    {l.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {err && <p className={`rounded-lg px-3 py-2 text-sm ${c.bad}`} role="alert">{err}</p>}
          {saved && <p className={`rounded-lg px-3 py-2 text-sm ${c.ok}`} role="status">Saved. Your card updates in a minute.</p>}
          <Button type="button" onClick={save} disabled={preview || busy} className={`w-full sm:w-auto ${c.primary}`}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Saving…" : "Save my intro card"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6 min-w-0">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${c.muted}`}>Preview: what the client sees</p>
          <IntroCardPreview photo={photo} adviser={broker.contact_person || ""} practice={practice.trim()} fsp={normFsp(fsp)} bio={bio.trim()} languages={langs}
            method={broker.methods_supported?.includes("teams") || !broker.methods_supported?.length ? "Teams" : "phone"} />
        </div>

        <Card className={c.card}>
          <CardHeader className={tone === "elite" ? "p-6 pb-3" : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className={`text-base flex items-center gap-2 ${c.title}`}><Video className="h-4 w-4" />Intro video (optional)</CardTitle>
              {videoState && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VIDEO_LABEL[videoState]?.cls || c.info}`}>{VIDEO_LABEL[videoState]?.text || videoState}</span>}
            </div>
            <CardDescription className={c.muted}>A 25-second hello that clients get before the call. Not needed to go live.</CardDescription>
          </CardHeader>
          <CardContent className={`space-y-3 text-sm ${tone === "elite" ? "p-6 pt-0" : ""}`}>
            {video?.state === "rejected" && video.ai_check?.reason && <p className={`rounded-lg px-3 py-2 text-xs ${c.bad}`}>{video.ai_check.reason}</p>}
            {video?.state === "ready" && <a className={`text-sm font-semibold ${c.link}`} href={approveUrl}>Watch and approve your video</a>}
            {video && <p className={`text-xs ${c.muted}`}>Latest take v{video.version}, {fmtDay(video.created_at)}.</p>}
            {/* Video intake (W07/W23) isn't switched on yet: don't ask brokers to send a video that nothing would process. */}
            <p className={c.muted}>Video intros are coming soon. We'll let you know when you can record yours. You don't need one to go live.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
