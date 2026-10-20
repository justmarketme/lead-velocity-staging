/* /start/: the private per-lead page Lindi sends on WhatsApp (sortmycover.co.za/start/#lt=<token>). v4 flow (Jono, 19 Oct 2026,
   mockup v4.2): book first, then three quick things for the adviser, then back to WhatsApp.
     1. Pick a time: the adviser card (photo or initials, name, firm, FSP, the adviser's own bio) and the required small print under
        "Book this time". POST /start/adviser names the adviser without routing; the "See {name}'s times" tap confirms (routes), and
        only then are open times fetched.
     2. Teams: the email for the invite. Phone: which number to call, an optional other number, and the email (POST /start/contact,
        then POST /book).
     Booked → "Carry on" → age → income → topics (POST /start/answers) → All set → back to WhatsApp. Leaving after the booking keeps it.
   noindex,nofollow, no referrer, not in the sitemap or any menu, no site chrome, no chat widget, no Meta Pixel. The token lives in the
   URL fragment, then sessionStorage, and is sent only as X-Lead-Token.
   No token (a desktop visit from a site CTA, /start/?ref=<page>&via=<source>): step 0 takes the first name, WhatsApp number and the
   generic consent (no adviser named before booking), POSTs /lead, and continues with the token it returns; everything after that is the same as Lindi's link.
   Pure logic: src/lib/start.ts. API: src/lib/start-api.ts. Styles: src/styles/start.css. */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion/mini";
import { Seo } from "@/lib/head";
import { APEX, consentCfg, site, strs } from "@/lib/site";
import { sourceTag, waHref } from "@/lib/whatsapp";
import { attribution } from "@/lib/pixel";
import { Wordmark } from "@/components/Brand";
import { CampaignFooter } from "@/components/Footer";
import { createStartApi, postLead, runBooking, runMove, type Adviser, type Booking, type LeadPoster, type StartApi, type StartData } from "@/lib/start-api";
import {
  AGE_BANDS, INCOME_BANDS, INTRO_DISCLOSURE, TOKEN_KEY, TOPICS, WHY_WHATSAPP, afterAdviser, answersPayload, availableMethods, canFinishTopics,
  bookBody, contactPayload, countRows, defaultMethod, firstScreen, formatDay, formatTime, formatWhen, fspLine, groupSlots, initials, leadBody, limitGroups, methodLabel,
  genericConsent, nextStep, onLoadFailure, prettyLocal, rateMessage, webNextWhatsApp, webSaveNumber, WEB_CHAT_NEXT, prettyMobile, prevStep, progress, readTokenFromHash, requestId, resumeAt,
  guestEmail, inviteLine, isLiveBooking, moveBody, moveNeedsNumber, moveWindowLine, readMoveFromHash, suggestEmail, toE164, withinDays, toggleTopic, validEmail, validFirstName, waLink,
  type AdviserInfo, type Answers, type Method, type Slot, type StepId,
} from "@/lib/start";

type Screen =
  | { k: "loading" }
  | { k: "expired" }
  | { k: "loadError" }
  | { k: "chat"; noSlots?: boolean; wills?: boolean }
  | { k: "neutral" }
  | { k: "step"; step: StepId }
  | { k: "booked" }
  | { k: "allset" }
  | { k: "moved" };

const SHOW_ROWS = 8;
const EMAIL_ERR = "That address doesn't look complete. Could you check it and send it again?";
const NUMBER_ERR = "Please enter a South African number, like 082 123 4567.";
const WA = waLink(site.whatsapp_number);
const CONSENT = genericConsent(consentCfg);
/** ?for=wills on the desktop link: the wills opener (with its consent statement) to the SortMyCover number; the source tag is read
    only on tap. */
function willsHref(withVia = false): string {
  const q = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const ctx = { topic: "a will", ref: (q.get("ref") || "w-start-will").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "w-start-will", wills: true };
  let via = "";
  if (withVia) { try { via = sourceTag(attribution(), document.referrer) || (q.get("via") || "").replace(/[^a-z0-9_/-]/gi, "").slice(0, 60); } catch { /* none */ } }
  return waHref(ctx, via || undefined);
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const keyOf = (s: Screen) => (s.k === "step" ? "step:" + s.step : s.k);

/** The adviser card on the time step: approved photo (else initials), name, firm, "Authorised FSP n" and the adviser's own bio in
    quotes (no bio line when it is null). Exported for tests/start.test.ts. */
export function AdviserCard({ adviser }: { adviser: Pick<Adviser, "name" | "firm" | "fsp" | "bio" | "photo_url"> }) {
  const [broken, setBroken] = useState(false);
  const pic = adviser.photo_url && !broken ? adviser.photo_url : null;
  return (
    <div className="st-adv-wrap">
      <div className="st-adv">
        {pic
          ? <img className="st-av st-av-img" src={pic} alt="" width={52} height={52} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          : <span className="st-av" aria-hidden="true">{initials(adviser.name)}</span>}
        <div className="st-adv-t"><strong>{adviser.name}</strong><span>{adviser.firm}</span><span>{fspLine(adviser.fsp)}</span></div>
      </div>
      {adviser.bio && <p className="st-bio">“{adviser.bio}”</p>}
    </div>
  );
}

function TickSvg({ size = 12, width = 4 }: { size?: number; width?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>;
}

/** The screen's one heading: focus lands here on every step change (tabIndex -1, so it is not in the tab order). */
const Q = forwardRef<HTMLHeadingElement, { children: ReactNode; className?: string }>(({ children, className }, ref) => (
  <h1 ref={ref} tabIndex={-1} className={"st-q" + (className ? " " + className : "")} id="st-q">{children}</h1>
));

export default function Start() {
  return (
    <>
      <Seo title="Pick a time for your call | SortMyCover" description="Pick a time for your call, then a few quick questions." canonical={APEX + "/start/"} robots="noindex,nofollow" referrer="no-referrer" />
      <StartFlow />
      <CampaignFooter />
    </>
  );
}

function StartFlow() {
  const api = useRef<StartApi | null>(null);
  const [screen, setScreen] = useState<Screen>({ k: "loading" });
  const [data, setData] = useState<StartData | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ retry: () => void } | null>(null);
  // time step
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsState, setSlotsState] = useState<"idle" | "loading" | "error">("idle");
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [taken, setTaken] = useState(false);
  // invite steps
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [use, setUse] = useState<"whatsapp" | "other">("whatsapp");
  const [other, setOther] = useState("");
  const [alt, setAlt] = useState("");
  const [numErr, setNumErr] = useState<{ call_number?: boolean; alt_number?: boolean }>({});
  const [guestOn, setGuestOn] = useState(false);
  const [guest, setGuest] = useState("");
  const [guestErr, setGuestErr] = useState<string | null>(null);
  /** The guest the invite went to (Booked and All set say so). */
  const [guestSent, setGuestSent] = useState<string | null>(null);
  /** Phone: the number the adviser will call, shown on the Booked screen. */
  const [callOn, setCallOn] = useState<string | null>(null);
  // after booking
  const [booking, setBooking] = useState<Booking | null>(null);
  /** #lt=...&move=1: the "Move your call" screen when GET /start has a live booking (the number step then moves instead of booking). */
  const moveAsked = useRef(false);
  const [moving, setMoving] = useState(false);
  const rid = useRef<{ key: string; id: string } | null>(null);
  const idFor = (key: string) => { if (rid.current?.key !== key) rid.current = { key, id: requestId() }; return rid.current.id; };

  /** The adviser on the card (from POST /start/adviser). */
  const [adviser, setAdviser] = useState<AdviserInfo | null>(null);
  /** The adviser id a 'slots' reply confirmed. Nothing asks for open times until this is set. */
  const confirmed = useRef<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const shown: Adviser | null = adviser ?? data?.adviser ?? null;
  const adviserFirst = shown?.first_name || null;

  /* ---------- step 0 (no token) ---------- */
  const [withDetails, setWithDetails] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [ads, setAds] = useState<"give" | "decline" | null>(null); // neither preselected (rule S22)
  const [bad, setBad] = useState<{ name?: boolean; phone?: boolean; consent?: boolean }>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const hp = useRef<HTMLInputElement>(null);
  const startedAt = useRef("");
  const leadPoster = useRef<LeadPoster>(postLead);
  const typedName = useRef<string | null>(null);
  const typedPhone = useRef<string | null>(null);
  const storedOnly = useRef(false); // the token came from sessionStorage, not from this link
  const e164 = toE164(phone);

  /* ---------- boot: token from the fragment, then strip it from the address bar ---------- */
  const load = useCallback(async () => {
    const a = api.current!;
    setScreen({ k: "loading" });
    const r = await a.getStart();
    if (r.kind === "expired" || r.kind === "error") {
      const to = onLoadFailure(r.kind, storedOnly.current, location.search);
      if (to === "expired" || to === "loadError") return setScreen({ k: to });
      try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* none */ }
      storedOnly.current = false;
      if (to === "wills") return setScreen({ k: "chat", wills: true });
      startedAt.current = new Date().toISOString();
      setWithDetails(true);
      return setScreen({ k: "step", step: "details" });
    }
    const d = r.data;
    setData(d);
    setAnswers(d.answers);
    const av = availableMethods(d.methods);
    setMethods(av);
    setMethod(defaultMethod(d.methods));
    if (moveAsked.current && isLiveBooking(d.booking, new Date())) {
      const bm = availableMethods([d.booking.method])[0];
      if (bm && av.includes(bm)) setMethod(bm);
      setBooking(d.booking); setMoving(true);
      setScreen({ k: "step", step: "move" });
      return fetchMoveSlots();
    }
    setMoving(false); // no live booking: the normal flow
    const at = resumeAt(d.booking, d.answers);
    if (at !== "time") { setBooking(d.booking); return setScreen(at === "allset" ? { k: "allset" } : { k: "step", step: "age" }); }
    return requestAdviser(null, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      let tok = readTokenFromHash(location.hash);
      moveAsked.current = readMoveFromHash(location.hash);
      if (tok) { try { sessionStorage.setItem(TOKEN_KEY, tok); } catch { /* storage blocked: the token still works for this page view */ } }
      if (/(^#|&)lt=/.test(location.hash)) history.replaceState(history.state, "", location.pathname + location.search);
      if (!tok) { try { tok = sessionStorage.getItem(TOKEN_KEY); storedOnly.current = !!tok; } catch { /* none */ } }
      const first0 = firstScreen(tok, location.search);
      if (first0 === "wills") return setScreen({ k: "chat", wills: true });
      if (first0 === "details") {
        if (import.meta.env.DEV) {
          if (new URLSearchParams(location.search).get("ref") === "demo") leadPoster.current = (await import("@/lib/start-mock")).mockPostLead;
        }
        startedAt.current = new Date().toISOString();
        setWithDetails(true);
        return setScreen({ k: "step", step: "details" });
      }
      await connect(tok!);
      load();
    })();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(tok: string) {
    let a: StartApi | null = null;
    if (import.meta.env.DEV) {
      if (tok === "demo" || tok === "demo-booked") a = (await import("@/lib/start-mock")).createMockApi({ booked: tok === "demo-booked" });
    }
    api.current = a ?? createStartApi(tok);
  }

  /** Step 0: POST /lead. Only a reply carrying lead_token continues; nothing else is sent before that token exists. */
  async function sendDetails() {
    const nameOk = validFirstName(name);
    const b = { name: !nameOk, phone: !e164, consent: !consent };
    setBad(b); setFormErr(null);
    if (b.name || b.phone || b.consent) {
      document.getElementById(b.name ? "st-name" : b.phone ? "st-phone" : "st-consent")?.focus();
      return;
    }
    if (hp.current && hp.current.value) return setScreen({ k: "neutral" }); // honeypot: thank them, send nothing
    setBusy(true);
    const key = `lead:${name.trim()}|${e164}|${ads}`;
    const body = leadBody({ first_name: name, mobile: e164!, ads, honeypot: "", origin: location.origin, search: location.search, started_at: startedAt.current, request_id: idFor(key), user_agent: navigator.userAgent, now: Date.now() }, consentCfg);
    const r = await leadPoster.current(body);
    setBusy(false);
    switch (r.kind) {
      case "accepted":
        try { sessionStorage.setItem(TOKEN_KEY, r.token); } catch { /* storage blocked: the token still works for this page view */ }
        typedName.current = name.trim();
        typedPhone.current = prettyMobile(e164!);
        await connect(r.token);
        return load();
      case "neutral": return setScreen({ k: "neutral" });
      case "rate": return setFormErr(rateMessage(r.retry_after_s, site.whatsapp_number));
      case "mobile": setBad({ phone: true }); return setFormErr(strs.err_mobile_server);
      default: return setFormErr(strs.err_send);
    }
  }

  /* ---------- focus and transition on every screen change ---------- */
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const prevKey = useRef("loading");
  const key = keyOf(screen);
  useLayoutEffect(() => {
    const was = prevKey.current;
    prevKey.current = key;
    if (was === key) return;
    if (was !== "loading") headRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (bodyRef.current && !reducedMotion()) animate(bodyRef.current, { opacity: [0, 1], transform: ["translateX(14px)", "translateX(0)"] }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
  }, [key]);

  /* ---------- steps ---------- */
  const go = (step: StepId) => { setErr(null); setScreen({ k: "step", step }); };

  /** POST /start/adviser. Without confirm it names the adviser (no routing); with confirm it routes. Only a confirmed 'slots' reply
      opens the times (afterAdviser in src/lib/start.ts); a different adviser re-shows the card, to be confirmed again. */
  async function requestAdviser(confirm: string | null, fromLoad = false) {
    setBusy(true); setErr(null);
    const body = confirm ? { confirm_adviser: confirm } : {};
    const r = await api.current!.postAdviser({ ...body, request_id: idFor("adviser:" + (confirm || "")) });
    setBusy(false);
    const fail = () => (fromLoad ? setScreen({ k: "loadError" }) : setErr({ retry: () => requestAdviser(confirm) }));
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return fail();
    const o = afterAdviser(r, confirm);
    if (o.k === "chat") return setScreen({ k: "chat" });
    if (o.k === "error") return fail();
    if (o.k === "adviser") {
      confirmed.current = null; setIsConfirmed(false);
      setAdviser(o.adviser); setSlots(null); setPicked(null);
      return go("time");
    }
    confirmed.current = confirm; setIsConfirmed(true);
    setSlots(null); setPicked(null); setShowAll(false);
    fetchSlots();
  }

  /* ---------- time ---------- */
  async function fetchSlots() {
    if (!confirmed.current) return; // never ask for times before the adviser is confirmed
    setSlotsState("loading");
    const r = await api.current!.getSlots(7);
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return setSlotsState("error");
    setSlotsState("idle");
    if (!r.data.slots.length || r.data.fallback === "whatsapp") return setScreen({ k: "chat", noSlots: true });
    setSlots(r.data.slots);
    if (r.data.methods?.length) {
      const av = availableMethods(r.data.methods);
      if (av.length) {
        setMethods(av);
        setMethod((m) => (m && av.includes(m) ? m : defaultMethod(r.data.methods!)));
      }
    }
  }

  /* ---------- book (phone: POST /start/contact first) ---------- */
  async function book() {
    const e = email.trim();
    if (!picked || !method) return go("time");
    let contact: { call_number: string | null; alt_number?: string } | null = null;
    if (method === "phone") {
      const c = contactPayload({ use: data?.phone_pretty || typedPhone.current ? use : "other", other, alt });
      if (!c.ok) { setNumErr({ [c.field]: true }); document.getElementById(c.field === "call_number" ? "st-other" : "st-alt")?.focus(); return; }
      setNumErr({});
      contact = c.body;
    }
    if (method === "teams" && !validEmail(e)) { setEmailErr(EMAIL_ERR); document.getElementById("st-email")?.focus(); return; }
    setEmailErr(null);
    const g = guestEmail(method, guestOn, guest);
    if (!g.ok) { setGuestErr(EMAIL_ERR); document.getElementById("st-guest")?.focus(); return; }
    setGuestErr(null); setErr(null); setBusy(true);
    const r = await runBooking(api.current!, {
      method, contact, contactId: idFor("contact:" + JSON.stringify(contact)),
      book: bookBody({ slot_start: picked, method, email: e, guest_email: g.guest_email, request_id: idFor(`book:${picked}|${method}|${e}|${g.guest_email || ""}|${JSON.stringify(contact)}`) }),
    });
    setBusy(false);
    switch (r.kind) {
      case "booked": case "held":
        setBooking({ start: r.info.start, end: r.info.end, method: r.info.method || method, held: r.kind === "held" });
        setGuestSent(g.guest_email || null);
        setCallOn(method === "phone" ? (contact?.call_number ? prettyLocal(contact.call_number) : waNumber) : null);
        return setScreen({ k: "booked" });
      case "contact": setNumErr({ [r.field]: true }); return;
      case "taken":
        setPicked(null); setShowAll(false); setTaken(true);
        if (r.slots && r.slots.length) { setSlots(r.slots); go("time"); } else { setSlots(null); go("time"); fetchSlots(); }
        return;
      case "email": return setEmailErr(EMAIL_ERR);
      case "expired": return setScreen({ k: "expired" });
      default: return setErr({ retry: book });
    }
  }

  /* ---------- reschedule: Move your call ---------- */
  /** Open times for the move: /slots?days=14, then only those up to 14 days from now (the lead is already routed). */
  async function fetchMoveSlots() {
    setSlotsState("loading");
    const r = await api.current!.getSlots(14);
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return setSlotsState("error");
    setSlotsState("idle");
    const list = withinDays(r.data.slots, new Date());
    if (!list.length || r.data.fallback === "whatsapp") return setScreen({ k: "chat", noSlots: true });
    setSlots(list);
  }

  /** "Move my call": a switch to a phone call with no confirmed number goes through the number step first, then POST /start/contact
      and POST /start/move; otherwise POST /start/move straight away. */
  async function move(fromNumber = false) {
    if (!picked || !method || !booking) return;
    let contact: { call_number: string | null; alt_number?: string } | null = null;
    if (moveNeedsNumber(method, booking, data?.contact)) {
      if (!fromNumber) return go("number");
      const c = contactPayload({ use: data?.phone_pretty ? use : "other", other, alt });
      if (!c.ok) { setNumErr({ [c.field]: true }); document.getElementById(c.field === "call_number" ? "st-other" : "st-alt")?.focus(); return; }
      setNumErr({});
      contact = c.body;
    }
    setErr(null); setBusy(true);
    const r = await runMove(api.current!, {
      contact, contactId: idFor("contact:" + JSON.stringify(contact)),
      move: moveBody(picked, method, idFor(`move:${picked}|${method}|${JSON.stringify(contact)}`)),
    });
    setBusy(false);
    switch (r.kind) {
      case "moved":
        setBooking({ start: r.booking.start, end: r.booking.end, method: r.booking.method || method, held: r.booking.held ?? booking.held });
        return setScreen({ k: "moved" });
      case "contact": setNumErr({ [r.field]: true }); return;
      case "no_booking": // the booking went in the meantime: book a time the normal way
        setMoving(false); setBooking(null); setPicked(null); setSlots(null);
        return requestAdviser(null);
      case "taken": case "invalid":
        setPicked(null); setShowAll(false); setTaken(true);
        if (r.kind === "taken" && r.slots && r.slots.length) { setSlots(withinDays(r.slots, new Date())); go("move"); } else { setSlots(null); go("move"); fetchMoveSlots(); }
        return;
      case "expired": return setScreen({ k: "expired" });
      default: return setErr({ retry: () => move(fromNumber) });
    }
  }

  /* ---------- after booking: age, income, topics ---------- */
  function choose<K extends "age_band" | "income_band">(step: StepId, k: K, v: NonNullable<Answers[K]>) {
    if (busy) return;
    setAnswers((a) => ({ ...a, [k]: v }));
    // a short beat so the tick is seen before the next question slides in
    window.setTimeout(() => { const n = nextStep(step, method); if (n === "income" || n === "topics") go(n); }, reducedMotion() ? 60 : 180);
  }

  async function sendAnswers() {
    const body = answersPayload(answers, "");
    if (!body) return;
    setBusy(true); setErr(null);
    const r = await api.current!.postAnswers({ ...body, request_id: idFor("answers:" + JSON.stringify(body)) });
    setBusy(false);
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return setErr({ retry: sendAnswers });
    setScreen({ k: "allset" });
  }

  function back(step: StepId) {
    const p = step === "number" && moving ? "move" : prevStep(step);
    if (p) go(p);
  }

  /* ---------- render ---------- */
  const step = screen.k === "step" ? screen.step : null;
  const prog = step && !(moving && step === "number") ? progress(step, withDetails) : null;
  const n = prog?.n ?? null;
  const total = prog?.total ?? 0;
  const first = data?.first_name || typedName.current || null;
  const waNumber = data?.phone_pretty || typedPhone.current || null;
  const who = adviserFirst || "your adviser";
  const Who = adviserFirst || "Your adviser";

  let body: ReactNode;
  const backTo = step === "number" && moving ? "move" : step ? prevStep(step) : null;
  const backLink = step && backTo ? <button type="button" className="st-back" onClick={() => back(step)} disabled={busy}>‹ Back</button> : null;
  const errorBox = (
    <div className="st-live" aria-live="polite">
      {err && <div className="st-error"><p>Something went wrong.</p><button type="button" className="st-retry" onClick={err.retry} disabled={busy}>Try again</button></div>}
    </div>
  );
  const options = <V extends string>(opts: { v: V; t: string }[], value: V | undefined, pick: (v: V) => void) => (
    <div className="st-opts st-grid2" role="group" aria-labelledby="st-q">
      {opts.map((o) => (
        <button key={o.v} type="button" className="st-opt" aria-pressed={value === o.v} disabled={busy} onClick={() => pick(o.v)}>
          <span className="st-opt-t"><strong>{o.t}</strong></span>
        </button>
      ))}
    </div>
  );
  const optionFoot = (backLink || err || busy) && (
    <div className="st-foot">{errorBox}{busy && !err && <p className="st-saving" role="status">Saving…</p>}{backLink}</div>
  );
  const emailField = (label: string) => {
    const sug = suggestEmail(email);
    return (
      <div className="st-field">
        <label htmlFor="st-email">{label}</label>
        <input id="st-email" className="st-input" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          value={email} onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }} aria-invalid={!!emailErr} aria-describedby="st-email-err st-email-hint" />
        {sug && <button type="button" className="st-suggest" onClick={() => { setEmail(sug); setEmailErr(null); }}>Did you mean <strong>{sug}</strong>?</button>}
        <p id="st-email-err" className="st-field-err" aria-live="polite">{emailErr}</p>
      </div>
    );
  };
  const emailHint = (
    <div className="st-hint" id="st-email-hint">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
      <span>We'll email a link to this address. Tap it to confirm, and your calendar invite follows.</span>
    </div>
  );
  /** "Someone else joining?": an optional tick that opens the guest's email (same check and did-you-mean as the main email). */
  const guestField = (line: string) => {
    const sug = guestOn ? suggestEmail(guest) : null;
    return (
      <div className="st-guest">
        <label className="st-tick">
          <input type="checkbox" checked={guestOn} aria-controls="st-guest-box" aria-expanded={guestOn} onChange={(e) => { setGuestOn(e.target.checked); setGuestErr(null); }} />
          <span><strong>Someone else joining?</strong> <span className="st-opt-tag">(optional)</span><small>{line}</small></span>
        </label>
        {guestOn && (
          <div className="st-field" id="st-guest-box">
            <label htmlFor="st-guest">Their email</label>
            <input id="st-guest" className="st-input" type="email" autoComplete="off" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              value={guest} onChange={(e) => { setGuest(e.target.value); if (guestErr) setGuestErr(null); }} aria-invalid={!!guestErr} aria-describedby="st-guest-err" />
            {sug && <button type="button" className="st-suggest" onClick={() => { setGuest(sug); setGuestErr(null); }}>Did you mean <strong>{sug}</strong>?</button>}
            <p id="st-guest-err" className="st-field-err" aria-live="polite">{guestErr}</p>
          </div>
        )}
      </div>
    );
  };
  /** Teams only: what happens with the invite (held = waiting on the email link, so nothing is sent yet). */
  const inviteNote = (b: Booking | null) => { const t = b && b.method !== "phone" ? inviteLine(b.held, guestSent) : null; return t ? <p className="st-done-p" data-invite>{t}</p> : null; };
  /** Switching to a phone call clears any guest (the guest field is on the Teams step only). */
  const pickMethod = (m: Method) => { setMethod(m); if (m !== "teams") { setGuestOn(false); setGuest(""); setGuestErr(null); } };
  const slotList = (retry: () => void) => {
    const groups = slots ? groupSlots(slots, new Date()) : [];
    const visibleGroups = showAll ? groups : limitGroups(groups, SHOW_ROWS);
    const more = countRows(groups) > countRows(visibleGroups);
    return (
      <>
        {slotsState === "loading" && <div className="st-skel" role="status"><span className="sr">Finding open times</span><i /><i /><i /></div>}
        {slotsState === "error" && <div className="st-error" aria-live="polite"><p>Something went wrong.</p><button type="button" className="st-retry" onClick={retry}>Try again</button></div>}
        {slotsState === "idle" && slots && (
          <div className="st-slots" role="group" aria-label="Open times">
            {visibleGroups.map((g) => (
              <div key={g.label} className="st-slot-g">
                <p className="st-slot-h">{g.label}</p>
                {g.rows.map((s) => (
                  <button key={s.start} type="button" className="st-slot" aria-pressed={picked === s.start} onClick={() => setPicked(s.start)}>
                    <span>{s.day}</span><b>{s.time}</b>
                  </button>
                ))}
              </div>
            ))}
            {more && <button type="button" className="st-more" onClick={() => setShowAll(true)}>More times</button>}
          </div>
        )}
      </>
    );
  };
  const moveFoot = (
    <div className="st-foot st-sticky">
      {errorBox}
      <button type="submit" className="btn st-btn" disabled={busy || !picked}>{busy ? "Moving…" : "Move my call"}</button>
      {backLink}
    </div>
  );
  const bookFoot = (
    <div className="st-foot st-sticky">
      {errorBox}
      <button type="submit" className="btn st-btn" disabled={busy}>{busy ? "Booking…" : "Book my call"}</button>
      <p className="st-fine">Your details go to {who} only, to prepare for the call. <a href="/privacy/">Privacy notice</a></p>
      {backLink}
    </div>
  );

  switch (screen.k) {
    case "loading":
      body = (<><h1 ref={headRef} tabIndex={-1} className="sr">Loading</h1><div className="st-skel" aria-hidden="true"><i /><i /><i /><i /></div></>);
      break;
    case "expired":
      body = (<><Q ref={headRef}>This link has <em>expired.</em></Q><p className="st-sub">Ask Lindi for a new one on WhatsApp.</p><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "neutral":
      body = (<><Q ref={headRef}>Thanks. Lindi will message you <em>on WhatsApp.</em></Q></>);
      break;
    case "loadError":
      body = (<><Q ref={headRef}>Something went <em>wrong.</em></Q><p className="st-sub">Please try again.</p><div className="st-foot"><button type="button" className="btn st-btn" onClick={load}>Try again</button><a className="st-back" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "chat":
      // A step-0 visitor (desktop, no Lindi link) has not been on WhatsApp yet: invite them there, never "back".
      if (withDetails && !screen.wills) {
        body = (<><Q ref={headRef}>{screen.noSlots ? <>No open times <em>right now.</em></> : <>Let's find you a time <em>on WhatsApp.</em></>}</Q><p className="st-sub">{WEB_CHAT_NEXT}</p><div className="st-foot"><a className="btn st-btn" href={WA}>Open WhatsApp</a><p className="st-fine">{webSaveNumber(site.whatsapp_number)}</p></div></>);
        break;
      }
      body = screen.noSlots
        ? (<><Q ref={headRef}>No open times <em>right now.</em></Q><p className="st-sub">Lindi will find you a time on WhatsApp.</p><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>)
        : screen.wills
          ? (<><Q ref={headRef}>Lindi will carry on with you <em>on WhatsApp.</em></Q><p className="st-sub">Lindi books calls about a will on WhatsApp, with a will consultant.</p><div className="st-foot"><a className="btn st-btn" href={willsHref()} onClick={(e) => { e.currentTarget.href = willsHref(true); }}>Chat on WhatsApp</a></div></>)
          : (<><Q ref={headRef}>Lindi will carry on with you <em>on WhatsApp.</em></Q><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "booked": {
      const b = booking!;
      body = (
        <div className="st-done">
          <span className="st-bigtick" aria-hidden="true"><TickSvg size={34} width={3.4} /></span>
          <Q ref={headRef} className="st-done-h">You're booked{first ? <>, <em>{first}.</em></> : "."}</Q>
          <div className="st-card">
            <strong>{formatWhen(b.start)}</strong>
            <span>{methodLabel(b.method)}{shown ? ` with ${shown.name}` : ""}, about 30 min</span>
          </div>
          {b.method === "phone"
            ? <p className="st-done-p">{Who} will call you{callOn ? ` on ${callOn}` : ""} at {formatTime(b.start)} on {formatDay(b.start)}. Your confirmation and reminders come on WhatsApp.</p>
            : <p className="st-done-p">{b.held ? "Check your email and tap the link to confirm." : "Your calendar invite is on its way."}</p>}
          {inviteNote(b)}
          <p className="st-done-p"><strong>Just a few quick things so {who} is well prepared.</strong> It takes about 30 seconds.</p>
          <div className="st-foot">
            <button type="button" className="btn st-btn" onClick={() => go("age")}>Carry on</button>
          </div>
        </div>
      );
      break;
    }
    case "moved": {
      const b = booking!;
      body = (
        <div className="st-done">
          <span className="st-bigtick" aria-hidden="true"><TickSvg size={34} width={3.4} /></span>
          <Q ref={headRef} className="st-done-h">Done, your call is moved to <em>{formatWhen(b.start)}.</em></Q>
          <p className="st-done-p">{methodLabel(b.method)}{shown ? ` with ${shown.name}` : ""}, about 30 min. Your updated booking comes on WhatsApp too.</p>
          <div className="st-foot">
            <a className="btn st-btn" href={WA}>Back to WhatsApp</a>
          </div>
        </div>
      );
      break;
    }
    case "allset": {
      const b = booking;
      body = (
        <div className="st-done">
          <span className="st-bigtick" aria-hidden="true"><TickSvg size={34} width={3.4} /></span>
          <Q ref={headRef} className="st-done-h">Great, that's <em>all set.</em></Q>
          {withDetails
            ? <><p className="st-done-p">{Who} has what they need{b ? ` for ${formatWhen(b.start)}` : " for your call"}.</p><p className="st-done-p">{webNextWhatsApp(e164 ? prettyLocal(e164) : null)}</p></>
            : <p className="st-done-p">{Who} has what they need{b ? ` for ${formatWhen(b.start)}` : " for your call"}. We'll be in touch on WhatsApp to remind you along the way.</p>}
          {inviteNote(b)}
          <div className="st-foot">
            {withDetails
              ? <><a className="btn st-btn" href={WA}>Open WhatsApp</a><p className="st-fine">{webSaveNumber(site.whatsapp_number)}</p></>
              : <a className="btn st-btn" href={WA}>Back to WhatsApp</a>}
            <p className="st-fine">Nothing is bought on the call. Any next step is your choice.</p>
          </div>
        </div>
      );
      break;
    }
    case "step":
      switch (screen.step) {
        case "details":
          body = (
            <form className="st-form st-details" noValidate onSubmit={(ev) => { ev.preventDefault(); sendDetails(); }}>
              <Q ref={headRef}>Let's get you <em>booked</em></Q>
              <div className={"field" + (bad.name ? " bad" : "")}>
                <label htmlFor="st-name">First name</label>
                <input id="st-name" type="text" autoComplete="given-name" autoCapitalize="words" maxLength={60} value={name} aria-invalid={bad.name || undefined} aria-describedby="st-name-err"
                  onChange={(e) => { setName(e.target.value); if (bad.name) setBad((x) => ({ ...x, name: !validFirstName(e.target.value) })); }} />
                <span className="err" id="st-name-err">{strs.err_name}</span>
              </div>
              <div className={"field" + (bad.phone ? " bad" : "") + (e164 ? " good" : "")}>
                <label htmlFor="st-phone">WhatsApp number</label>
                <input id="st-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="082 123 4567" value={phone} aria-invalid={bad.phone || undefined} aria-describedby="st-phone-why st-phone-err"
                  onChange={(e) => { setPhone(e.target.value); if (bad.phone) setBad((x) => ({ ...x, phone: !toE164(e.target.value) })); }} />
                <span className="st-why" id="st-phone-why">{WHY_WHATSAPP}</span>
                <span className="err" id="st-phone-err">{strs.err_mobile}</span>
                <span className="ok" aria-live="polite">{e164 ? strs.ok_mobile + " " + prettyMobile(e164) : ""}</span>
              </div>
              <div className={"consent-wrap" + (bad.consent ? " bad" : "")} data-disclosure>
                <label className="consent">
                  <input id="st-consent" type="checkbox" checked={consent} aria-describedby="st-consent-err" onChange={(e) => { setConsent(e.target.checked); setBad((x) => ({ ...x, consent: !e.target.checked })); }} />
                  <span>{CONSENT.text} <a href="/privacy/" target="_blank" rel="noopener">{consentCfg.link_text}<span className="sr"> (opens in a new tab)</span></a></span>
                </label>
                <span className="err" id="st-consent-err">{strs.err_consent}</span>
              </div>
              <fieldset className="ads-choice" data-disclosure>
                <legend><span className="optional-tag">Optional</span> Ad measurement</legend>
                <p className="st-ads-text">{consentCfg.ads.text}</p>
                <div className="ads-pair">
                  <label><input type="radio" name="st_consent_ads" value="give" checked={ads === "give"} onChange={() => setAds("give")} /> {consentCfg.ads.label}</label>
                  <label><input type="radio" name="st_consent_ads" value="decline" checked={ads === "decline"} onChange={() => setAds("decline")} /> {consentCfg.ads.decline}</label>
                </div>
              </fieldset>
              <div className="hp" aria-hidden="true"><label>Website<input type="text" tabIndex={-1} autoComplete="off" ref={hp} /></label></div>
              <div className="st-foot">
                <p className="st-field-err" aria-live="polite">{formErr}</p>
                <button type="submit" className="btn st-btn" disabled={busy}>{busy ? "One moment…" : "Continue"}</button>
                <p className="st-fine">Lindi, SortMyCover's automated assistant, will message you on WhatsApp to confirm and remind you.</p>
              </div>
            </form>
          );
          break;
        case "move": {
          const b = booking!;
          body = (
            <form className="st-form" noValidate onSubmit={(ev) => { ev.preventDefault(); move(); }}>
              <Q ref={headRef}>Pick a <em>new time</em></Q>
              <dl className="st-summary st-now" data-move-now>
                <div><dt>Your call now</dt><dd>{formatWhen(b.start, ", ")}</dd></div>
                {shown && <div><dt>With</dt><dd>{shown.name}</dd></div>}
                <div><dt>How</dt><dd>{methodLabel(b.method)}</dd></div>
              </dl>
              {methods.length > 1 && (
                <div className="st-seg" role="group" aria-label="Meeting type">
                  {methods.map((m) => <button key={m} type="button" aria-pressed={method === m} onClick={() => pickMethod(m)}>{methodLabel(m)}</button>)}
                </div>
              )}
              {taken && <p className="st-note" role="status">Sorry, that time was just taken. Here are the next open times.</p>}
              {slotList(fetchMoveSlots)}
              <p className="st-tz">{moveWindowLine(new Date())}</p>
              {moveFoot}
            </form>
          );
          break;
        }
        case "time": {
          const adv = shown;
          body = (
            <>
              <Q ref={headRef}>Pick a time for your <em>30-minute call</em></Q>
              {adv && <AdviserCard adviser={adv} />}
              {methods.length > 1 && (
                <div className="st-seg" role="group" aria-label="Meeting type">
                  {methods.map((m) => <button key={m} type="button" aria-pressed={method === m} onClick={() => pickMethod(m)}>{methodLabel(m)}</button>)}
                </div>
              )}
              <p className="st-tz">30 minutes, South African time.</p>
              {taken && <p className="st-note" role="status">Sorry, that time was just taken. Here are the next open times.</p>}
              {!isConfirmed && adviser && (
                <div className="st-see">
                  <button type="button" className="st-see-btn" onClick={() => requestAdviser(adviser.id)} disabled={busy}>{busy ? "One moment…" : `See ${adviser.first_name}'s times`}</button>
                </div>
              )}
              {isConfirmed && slotList(fetchSlots)}
              <div className="st-foot st-sticky">
                {errorBox}
                <button type="button" className="btn st-btn" disabled={!picked || !method} onClick={() => { setTaken(false); const nx = nextStep("time", method); if (nx === "email" || nx === "number") go(nx); }}>Book this time</button>
                <p className="st-fine st-disclose" data-disclosure>{INTRO_DISCLOSURE}</p>
              </div>
            </>
          );
          break;
        }
        case "email": {
          const adv = shown;
          body = (
            <form className="st-form" noValidate onSubmit={(ev) => { ev.preventDefault(); book(); }}>
              <Q ref={headRef}>Just one more thing: where should the <em>invite</em> go?</Q>
              {emailField("Email address")}
              {emailHint}
              {guestField("Add a partner or family member to the invite")}
              <dl className="st-summary">
                {picked && <div><dt>Call</dt><dd>{formatWhen(picked, ", ")}</dd></div>}
                {adv && <div><dt>With</dt><dd>{adv.name}</dd></div>}
                {method && <div><dt>How</dt><dd>{methodLabel(method)}</dd></div>}
              </dl>
              {bookFoot}
            </form>
          );
          break;
        }
        case "number": {
          const hasWa = !!waNumber;
          const sel = hasWa ? use : "other";
          const radio = (v: "whatsapp" | "other", label: ReactNode) => (
            <button type="button" role="radio" aria-checked={sel === v} className="st-opt" onClick={() => { setUse(v); setNumErr((x) => ({ ...x, call_number: false })); }}>
              <span className="st-opt-t">{label}</span>
              <span className="st-dot" aria-hidden="true">{sel === v && <TickSvg />}</span>
            </button>
          );
          body = (
            <form className="st-form" noValidate onSubmit={(ev) => { ev.preventDefault(); if (moving) move(true); else book(); }}>
              <Q ref={headRef}>Which number should <em>{adviserFirst || "your adviser"} call?</em></Q>
              <div className="st-opts" role="radiogroup" aria-labelledby="st-q">
                {hasWa && radio("whatsapp", <><strong>Call my WhatsApp number</strong><small>{waNumber}</small></>)}
                {radio("other", <strong>Use a different number</strong>)}
              </div>
              {sel === "other" && (
                <div className="st-field">
                  <label htmlFor="st-other">Number to call</label>
                  <input id="st-other" className="st-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="082 123 4567" value={other}
                    onChange={(e) => { setOther(e.target.value); setNumErr((x) => ({ ...x, call_number: false })); }} aria-invalid={!!numErr.call_number} aria-describedby="st-other-err" />
                  <p id="st-other-err" className="st-field-err" aria-live="polite">{numErr.call_number ? NUMBER_ERR : ""}</p>
                </div>
              )}
              <div className="st-field">
                <label htmlFor="st-alt">Another number, in case we can't reach you <span className="st-opt-tag">(optional)</span></label>
                <input id="st-alt" className="st-input" type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="e.g. 011 234 5678" value={alt}
                  onChange={(e) => { setAlt(e.target.value); setNumErr((x) => ({ ...x, alt_number: false })); }} aria-invalid={!!numErr.alt_number} aria-describedby="st-alt-err" />
                <p id="st-alt-err" className="st-field-err" aria-live="polite">{numErr.alt_number ? NUMBER_ERR : ""}</p>
              </div>
              {moving ? moveFoot : bookFoot}
            </form>
          );
          break;
        }
        case "age":
          body = (<><Q ref={headRef}>Which age band <em>are you in?</em></Q><p className="st-sub">So {who} can prepare properly.</p>{options(AGE_BANDS, answers.age_band, (v) => choose("age", "age_band", v))}{optionFoot}</>);
          break;
        case "income":
          body = (<><Q ref={headRef}>Roughly what's your <em>monthly income?</em></Q><p className="st-sub">Before tax. A band is enough.</p>{options(INCOME_BANDS, answers.income_band, (v) => choose("income", "income_band", v))}{optionFoot}</>);
          break;
        case "topics": {
          const ready = canFinishTopics(answers.topics);
          body = (
            <>
              <Q ref={headRef}>What would you like {who} <em>to go through?</em></Q>
              <p className="st-sub" id="st-topics-sub">Pick as many as you like.</p>
              <div className="st-opts" role="group" aria-labelledby="st-q" aria-describedby="st-topics-sub">
                {TOPICS.map((o) => {
                  const on = !!answers.topics?.includes(o.v);
                  return (
                    <button key={o.v} type="button" role="checkbox" aria-checked={on} className="st-opt st-check" disabled={busy} onClick={() => setAnswers((a) => ({ ...a, topics: toggleTopic(a.topics, o.v) }))}>
                      <span className="st-opt-t"><strong>{o.t}</strong></span>
                      <span className="st-box" aria-hidden="true">{on && <TickSvg />}</span>
                    </button>
                  );
                })}
              </div>
              <div className="st-foot st-sticky">
                {errorBox}
                <button type="button" className="btn st-btn" disabled={!ready || busy} onClick={sendAnswers}>{busy ? "Saving…" : "Done"}</button>
                {backLink}
              </div>
            </>
          );
          break;
        }
      }
  }

  return (
    <div className="st">
      <header className="st-top">
        <div className="st-wrap st-top-in">
          <div className="st-top-row">
            <Wordmark plain />
            {n && <span className="st-pill"><span className="sr">Step </span>{n} of {total}</span>}
            {!n && moving && step && <span className="st-pill">Move your call</span>}
          </div>
          {n && <div className="st-bars" style={{ ["--n" as string]: total }} aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={i < n ? "on" : undefined} />)}</div>}
        </div>
      </header>
      <main id="main" className="st-wrap st-main">
        <div ref={bodyRef} className={"st-body" + (screen.k === "booked" || screen.k === "allset" || screen.k === "moved" ? " st-body-done" : "")}>{body}</div>
      </main>
    </div>
  );
}
