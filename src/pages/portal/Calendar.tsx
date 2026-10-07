/**
 * 05 Calendar and availability (portal/spec/05-calendar-and-availability.md; prototype calendar.html). Extends BrokerCalendar.tsx (INV-P06).
 * Part A: one-tap Microsoft sign-in via the ms-oauth edge function (authorization code + PKCE, one Lead Velocity Entra app).
 *         The button asks ms-oauth {action:'start'} (broker JWT) for the authorize_url and navigates to it; the function's callback
 *         stores the refresh token in Supabase Vault (never in the browser or a row) and redirects back here with ?calendar=connected.
 *         "Disconnect" calls {action:'disconnect'}. Admin-consent link prefers brokers.calendar_status_detail.admin_consent_url
 *         (the callback writes it), then the one returned by start, then VITE_MS_ADMIN_CONSENT_URL.
 *         then the "next free slot" proof from W04 GET {base}/slots?limit=1 (broker JWT; see needs_human), cached brokers.next_free_slot_at.
 * Part B: hours, methods, capacity → own brokers columns; events availability.saved + step.completed(availability).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { supabase } from "@/integrations/supabase/client";
import { CLIPS_BASE, MS_ADMIN_CONSENT_URL, SUPPORT_EMAIL, errText, fmtDayTime, methodLabel, portalEvent, postWebhook, smcDb } from "@/lib/smc";
import { adminConsentNote, callbackNotice, calendarStepView, msUrl } from "@/lib/smcMsConnect";
import type { SmcMeetingHours, SmcMethod } from "@/integrations/supabase/smc-types";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const TIMES = Array.from({ length: 29 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`; });
const METHODS: SmcMethod[] = ["teams", "phone", "whatsapp_call", "zoom", "meet"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

interface SlotResp { slots?: { start: string }[]; more_this_week?: number; count_week?: number }
interface MsResp { ok?: boolean; authorize_url?: string; admin_consent_url?: string; calendar_status?: string; error?: string }

/** ms-oauth edge function (supabase/functions/ms-oauth): start returns the Microsoft sign-in URL (PKCE), disconnect forgets the token. */
async function msCall(action: "start" | "disconnect"): Promise<{ ok: boolean; status: number; data: MsResp | null }> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session?.access_token) return { ok: false, status: 401, data: { error: "Please sign in again." } };
  try {
    const { data, error } = await supabase.functions.invoke<MsResp>("ms-oauth", { body: { action } });
    if (error) {
      const status = (error as { context?: Response }).context?.status ?? 0;
      let body: MsResp | null = null;
      try { body = (await (error as { context?: Response }).context?.json()) as MsResp; } catch { body = null; }
      return { ok: false, status, data: body ?? { error: errText(error) } };
    }
    return { ok: !!data?.ok, status: 200, data: data ?? null };
  } catch (e) {
    return { ok: false, status: 0, data: { error: errText(e) } };
  }
}

/** ?day=YYYY-MM-DD (WhatsApp template button, I-37c) → that date's weekday key, or null if absent/invalid. */
function dayParam(v: string | null): { key: (typeof DAYS)[number]; label: string } | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const key = DAYS[(d.getUTCDay() + 6) % 7];
  const label = d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return { key, label };
}

function Body() {
  const { broker, reload } = usePortal();
  const [params] = useSearchParams();
  const focus = dayParam(params.get("day"));
  useEffect(() => {
    if (focus) document.getElementById("hours")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstWin = Object.values(broker.meeting_hours || {}).find((w) => w && w.length)?.[0] || ["09:00", "17:00"];
  const [days, setDays] = useState<string[]>(DAYS.filter((d) => (broker.meeting_hours?.[d] || []).length));
  const [from, setFrom] = useState(firstWin[0]);
  const [until, setUntil] = useState(firstWin[1]);
  const [methods, setMethods] = useState<SmcMethod[]>(broker.methods_supported?.length ? broker.methods_supported : ["teams", "phone"]);
  const [perDay, setPerDay] = useState(String(broker.max_meetings_per_day ?? 3));
  const [perWeek, setPerWeek] = useState(String(broker.max_meetings_per_week ?? 12));
  const [slot, setSlot] = useState(String(broker.slot_minutes ?? 30));
  const [buffer, setBuffer] = useState(String(broker.buffer_minutes ?? 15));
  const [notice, setNotice] = useState(String(broker.min_notice_hours ?? 2));
  const [horizon, setHorizon] = useState(String(broker.horizon_days ?? 14));
  const [paused, setPaused] = useState(!!broker.bookings_paused);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [next, setNext] = useState<{ state: "idle" | "checking" | "slow" | "ok" | "none" | "error"; at?: string; more?: number }>({ state: "idle" });
  const [copied, setCopied] = useState(false);

  const connected = broker.calendar_status === "ok" || broker.calendar_mode === "shared_fallback";
  const blockedAdmin = broker.calendar_status === "blocked_admin_consent" || new URLSearchParams(window.location.search).get("error") === "admin_consent";
  const inApp = /FBAN|FBAV|Instagram|WhatsApp/i.test(navigator.userAgent);
  const detailConsent = msUrl(broker.calendar_status_detail?.admin_consent_url);
  const [startedConsent, setStartedConsent] = useState("");
  const view = calendarStepView(broker);
  const cbNotice = callbackNotice(window.location.search);
  const consentUrl = detailConsent || startedConsent
    || (MS_ADMIN_CONSENT_URL ? `${MS_ADMIN_CONSENT_URL}${broker.ms_tenant_id ? `${MS_ADMIN_CONSENT_URL.includes("?") ? "&" : "?"}tenant=${encodeURIComponent(broker.ms_tenant_id)}` : ""}` : "");
  const [msBusy, setMsBusy] = useState<"" | "connect" | "disconnect">("");
  const [msErr, setMsErr] = useState<string | null>(null);

  async function connectOutlook() {
    setMsErr(null); setMsBusy("connect");
    const r = await msCall("start");
    const go = msUrl(r.data?.authorize_url);
    if (r.ok && go) { window.location.assign(go); return; }
    setMsBusy("");
    setMsErr(r.status === 401 ? "Your sign-in has expired. Sign in to the portal again, then tap Sign in with Microsoft."
      : r.status === 503 || r.status === 0 ? "Microsoft sign-in isn't switched on yet. We'll let you know on WhatsApp."
      : `We couldn't start Microsoft sign-in (${r.data?.error || `HTTP ${r.status}`}). Try again.`);
  }

  // The admin-approval panel needs a link even before the broker has ever tapped Connect.
  useEffect(() => {
    if (!blockedAdmin || detailConsent || startedConsent) return;
    void msCall("start").then((r) => setStartedConsent(msUrl(r.data?.admin_consent_url)));
  }, [blockedAdmin, detailConsent, startedConsent]);

  async function disconnectOutlook() {
    if (!window.confirm("Disconnect your Outlook calendar? Leads can't book new times with you until you reconnect.")) return;
    setMsErr(null); setMsBusy("disconnect");
    const r = await msCall("disconnect");
    setMsBusy("");
    if (!r.ok) { setMsErr(`We couldn't disconnect (${r.data?.error || `HTTP ${r.status}`}). Try again.`); return; }
    void reload();
  }

  const checkSlot = useCallback(async () => {
    setNext({ state: "checking" });
    const slow = window.setTimeout(() => setNext((n) => (n.state === "checking" ? { state: "slow" } : n)), 5000);
    const r = await postWebhook<SlotResp>("slots?limit=1", null, "GET");
    window.clearTimeout(slow);
    if (!r.ok) {
      setNext(broker.next_free_slot_at ? { state: "ok", at: broker.next_free_slot_at } : { state: "error" });
      return;
    }
    const s = r.data?.slots?.[0]?.start;
    setNext(s ? { state: "ok", at: s, more: r.data?.more_this_week ?? r.data?.count_week } : { state: "none" });
  }, [broker.next_free_slot_at]);

  useEffect(() => { if (connected) void checkSlot(); }, [connected, checkSlot]);

  async function save() {
    setErr(null); setSaved(false);
    if (!days.length) return setErr("Pick at least one day.");
    if (toMin(until) - toMin(from) < 120) return setErr("Leave at least a 2-hour window between From and Until.");
    if (!methods.length) return setErr("Pick at least one way to meet.");
    const d = Number(perDay), w = Number(perWeek);
    if (!(d >= 1 && d <= 10)) return setErr("Most meetings a day: 1 to 10.");
    if (!(w >= 1 && w <= 50 && w >= d)) return setErr("Most a week: 1 to 50, and at least your daily number.");
    const hours: SmcMeetingHours = {};
    days.forEach((k) => { hours[k as keyof SmcMeetingHours] = [[from, until]]; });
    const patch = { meeting_hours: hours, methods_supported: methods, max_meetings_per_day: d, max_meetings_per_week: w,
      slot_minutes: Number(slot), buffer_minutes: Number(buffer), min_notice_hours: Number(notice), horizon_days: Number(horizon), bookings_paused: paused };
    const { error } = await smcDb.from("brokers").update(patch).eq("id", broker.id);
    if (error) return setErr(errText(error));
    await portalEvent("availability.saved", "availability", { days, from, until, methods, per_day: d, per_week: w, paused });
    await portalEvent("step.completed", "availability");
    setSaved(true);
    void reload();
    if (connected) void checkSlot();
  }

  async function useShared() { await portalEvent("calendar.fallback_chosen", "calendar"); void reload(); }
  const mailIt = `mailto:?cc=${SUPPORT_EMAIL}&subject=${encodeURIComponent("Please approve the SortMyCover calendar app")}&body=${encodeURIComponent(adminConsentNote({ brokerName: broker.contact_person, consentUrl }))}`;

  return (
    <>
      <section className="card">
        <h2>Connect your Outlook calendar</h2>
        {cbNotice && <p className={cbNotice.tone === "error" ? "err" : "pill ok"} role={cbNotice.tone === "error" ? "alert" : "status"}>{cbNotice.text}</p>}
        {view.state === "needs_reconnect" && <div className="alert" role="alert">Reconnect your calendar so leads can keep booking.</div>}
        {(view.state === "done" || view.state === "verifying") && view.account && <p className="pill ok" role="status">Connected as <b>{view.account}</b></p>}
        {connected && next.state === "ok" && next.at && (
          <div className="next-slot" role="status"><span style={{ fontSize: 22 }}>✓</span><div><b>Calendar connected. Your next free slot: {fmtDayTime(next.at)}.</b>{next.more ? `and ${next.more} more this week. ` : ""}Found from your real calendar just now.</div></div>
        )}
        {connected && (next.state === "checking" || next.state === "slow") && <p className="pill info" role="status">{next.state === "slow" ? "Still checking your calendar. You can carry on." : "Checking your calendar…"}</p>}
        {connected && next.state === "none" && <div className="alert">We're connected, but we can't see any free time in the next {broker.horizon_days} days. Check your hours below, or your Outlook working hours.</div>}
        {connected && next.state === "error" && <p className="small">Connected{broker.calendar_mode === "shared_fallback" ? " (shared calendar)" : ""}. We'll confirm your next free slot on WhatsApp.</p>}
        {broker.calendar_mode === "shared_fallback" && <p className="small">You're using the shared calendar "SortMyCover - {broker.contact_person}". Subscribe to it in Outlook from the invite we emailed.</p>}
        {broker.calendar_status === "ok" && broker.calendar_mode !== "shared_fallback" && (
          <>
            <button className="btn ghost" type="button" onClick={disconnectOutlook} disabled={msBusy !== ""} aria-busy={msBusy === "disconnect"}>{msBusy === "disconnect" ? "Disconnecting…" : "Disconnect Outlook"}</button>
            {msErr && <p className="err" role="alert">{msErr}</p>}
          </>
        )}
        {(!connected || broker.calendar_status === "needs_reconnect") && (
          <>
            <p className="muted">One tap. We only look at when you are free, and we add your meetings. We never read your emails.</p>
            {inApp && <p className="alert">Open this page in Safari or Chrome to sign in.</p>}
            <button className="btn ms" type="button" onClick={connectOutlook} disabled={msBusy !== ""} aria-busy={msBusy === "connect"}>
              <span className="ms-logo" aria-hidden="true"><i /><i /><i /><i /></span>{msBusy === "connect" ? "Opening Microsoft…" : "Sign in with Microsoft"}
            </button>
            {msErr && <p className="err" role="alert">{msErr}</p>}
            <details open={blockedAdmin} style={{ marginTop: 12 }}>
              <summary>Microsoft says "Need admin approval"?</summary>
              <p className="muted">Your IT admin has switched off new apps. Two easy ways forward.</p>
              <p className="small">{adminConsentNote({ brokerName: broker.contact_person, consentUrl: consentUrl || "(link loading)" })}</p>
              <p><b>1. Ask your admin to approve us (2 minutes for them).</b> Send them this link. They sign in, tap "Accept", and you try again.</p>
              <div className="row">
                <button className="tap" type="button" disabled={!consentUrl} onClick={async () => { await navigator.clipboard.writeText(consentUrl); setCopied(true); }}>{copied ? "Copied" : "Copy the admin approval link"}</button>
                <a className="tap g" href={mailIt}>Email this to my IT admin</a>
              </div>
              <p style={{ marginTop: 10 }}><b>2. Or skip it.</b> We create each meeting in a shared calendar called "SortMyCover - {broker.contact_person}". You subscribe to it in Outlook. The Teams link comes from our side.</p>
              <button className="btn ghost" type="button" onClick={useShared}>Use the shared calendar instead</button>
              <p className="hint">Heads-up for option 2: we can only see the meetings we book. If you have other meetings, block the time in your hours or tell us.</p>
            </details>
          </>
        )}
      </section>

      <section className="card" id="hours">
        <h2>Your hours and how you meet</h2>
        <p className="muted">We started you on a normal week. Change anything, or just tap Looks right.</p>
        {focus && <p className="pill info" role="status">You asked about {focus.label}. Your {DAY_LABEL[focus.key]} hours are highlighted below.</p>}
        <label>Days</label>
        <div className="days">
          {DAYS.map((d) => <button key={d} type="button" className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)} aria-current={focus?.key === d ? "date" : undefined} style={focus?.key === d ? { outline: "3px solid currentColor", outlineOffset: 2 } : undefined} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{DAY_LABEL[d]}</button>)}
        </div>
        <div className="row2">
          <div><label htmlFor="from">From</label><select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label htmlFor="until">Until</label><select id="until" value={until} onChange={(e) => setUntil(e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <label>How you can meet</label>
        <div className="chips">
          {METHODS.map((m) => (
            <label key={m} className={`chip${methods.includes(m) ? " on" : ""}`}><input type="checkbox" checked={methods.includes(m)} onChange={() => setMethods(methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m])} /> {methodLabel(m)}</label>
          ))}
        </div>
        <p className="hint">Teams needs your Microsoft calendar; Google Meet needs Google. We ask a lead for an email only when the way you meet needs an invite.</p>
        <div className="row2">
          <div><label htmlFor="pd">Most meetings a day</label><input id="pd" type="number" min={1} max={10} value={perDay} onChange={(e) => setPerDay(e.target.value)} /></div>
          <div><label htmlFor="pw">Most a week</label><input id="pw" type="number" min={1} max={50} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} /></div>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>More settings</summary>
          <div className="row2">
            <div><label htmlFor="sl">Meeting length</label><select id="sl" value={slot} onChange={(e) => setSlot(e.target.value)}><option value="30">30 min</option><option value="45">45 min</option></select></div>
            <div><label htmlFor="bf">Gap between meetings</label><select id="bf" value={buffer} onChange={(e) => setBuffer(e.target.value)}>{["0", "15", "30"].map((v) => <option key={v} value={v}>{v} min</option>)}</select></div>
            <div><label htmlFor="nt">Notice before a booking</label><select id="nt" value={notice} onChange={(e) => setNotice(e.target.value)}>{[1, 2, 4, 8, 12, 24, 48].map((v) => <option key={v} value={v}>{v} h</option>)}</select></div>
            <div><label htmlFor="hz">How far ahead leads can book</label><select id="hz" value={horizon} onChange={(e) => setHorizon(e.target.value)}>{[7, 14, 21].map((v) => <option key={v} value={v}>{v} days</option>)}</select></div>
          </div>
        </details>
        <label className={`chip${paused ? " on" : ""}`} style={{ display: "flex", marginTop: 12 }}>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Pause new bookings. <span className="small">Meetings already booked stay booked. While paused, no new times with you are offered.</span>
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        {saved && <p className="pill ok" role="status">Saved. Your next free slot updates above.</p>}
        <div style={{ height: 12 }} />
        <button className="btn" type="button" onClick={save}>Looks right</button>
      </section>
      <StepClip title="connecting your calendar" length="0:40" file={`${CLIPS_BASE}/calendar.mp4`} />
      <StepClip title="hours, methods and how many" length="0:35" file={`${CLIPS_BASE}/availability.mp4`} />
    </>
  );
}

export default function CalendarPage() {
  return <PortalShell title="Calendar and availability"><Body /></PortalShell>;
}
