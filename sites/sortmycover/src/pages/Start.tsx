/* /start/: the private per-lead page Lindi sends on WhatsApp (sortmycover.co.za/start/#lt=<token>). Six one-tap questions, then who the
   adviser is and what is shared with them (confirmed before any open time is fetched), the open times and the email for the invite. noindex,nofollow, no referrer, not in the sitemap or any menu, no site chrome,
   no chat widget, no Meta Pixel. The token lives in the URL fragment, then sessionStorage, and is sent only as X-Lead-Token.
   Pure logic: src/lib/start.ts. API: src/lib/start-api.ts. Styles: src/styles/start.css. */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion/mini";
import { Seo } from "@/lib/head";
import { APEX, site } from "@/lib/site";
import { Wordmark } from "@/components/Brand";
import { CampaignFooter } from "@/components/Footer";
import { createStartApi, type BookedInfo, type StartApi, type StartData } from "@/lib/start-api";
import {
  TOKEN_KEY, TOTAL_STEPS, adviserDisclosure, afterAnswers, answersPayload, availableMethods, countRows, defaultMethod, formatWhen, groupSlots, initials, limitGroups,
  methodLabel, nextStep, prevStep, readTokenFromHash, requestId, resumeAt, setAnswer, stepNumber, suggestEmail, validEmail, waLink,
  type AdviserInfo, type Answers, type Method, type Slot, type StepId,
} from "@/lib/start";

type Screen =
  | { k: "loading" }
  | { k: "expired" }
  | { k: "loadError" }
  | { k: "chat"; noSlots?: boolean }
  | { k: "step"; step: StepId }
  | { k: "done"; info: BookedInfo; held: boolean };

const SHOW_ROWS = 8;
const EMAIL_ERR = "That address doesn't look complete. Could you check it and send it again?";
const WA = waLink(site.whatsapp_number);

interface Opt<V extends string> { v: V; t: string; d?: string }
const INTENTS: Opt<NonNullable<Answers["intent"]>>[] = [
  { v: "life", t: "Life cover", d: "Pays the people you name if you die" },
  { v: "income", t: "Disability or income", d: "If illness or injury stops your income" },
  { v: "illness", t: "Severe illness cover", d: "A lump sum on diagnosis of a listed illness" },
  { v: "review", t: "Review my cover", d: "Talk through the cover you have" },
  { v: "will", t: "A will", d: "A separate appointment about a will" },
  { v: "other", t: "Something else", d: "Tell Lindi in your own words" },
];
const AGES: Opt<NonNullable<Answers["age_band"]>>[] = [{ v: "lt35", t: "Under 35" }, { v: "35_44", t: "35 to 44" }, { v: "45_50", t: "45 to 50" }, { v: "51plus", t: "Over 50" }];
const COVER: Opt<NonNullable<Answers["has_cover"]>>[] = [{ v: "yes", t: "Yes" }, { v: "no", t: "No" }, { v: "unsure", t: "Not sure" }];
const BANDS: Opt<NonNullable<Answers["budget_band"]>>[] = [{ v: "lt750", t: "Under R750" }, { v: "750_1250", t: "R750 to R1,250" }, { v: "1250_1499", t: "R1,250 to R1,499" }, { v: "1500_plus", t: "R1,500 or more" }];
const WANTS: Opt<NonNullable<Answers["want"]>>[] = [
  { v: "family", t: "Look after my family" }, { v: "bond", t: "Cover the bond or rent" }, { v: "income", t: "Pay me if I can't work" },
  { v: "illness", t: "Help if I get very ill" }, { v: "unsure", t: "Not sure yet" },
];

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const keyOf = (s: Screen, adviserId?: string) => (s.k === "step" ? "step:" + s.step + (s.step === "adviser" ? ":" + (adviserId || "") : "") : s.k);

/** Step 5 part A: who the call is with and what SortMyCover shares with them. The disclosure is required: always rendered in full,
    at body size, from the API values. Exported for tests/start.test.ts. */
export function AdviserIntro({ adviser, busy, onConfirm, heading }: { adviser: AdviserInfo; busy: boolean; onConfirm: () => void; heading?: ReactNode }) {
  const [who, shared, intro] = adviserDisclosure(adviser);
  return (
    <>
      {heading ?? <h1 className="st-q" id="st-q">This is your adviser, <em>{adviser.first_name}.</em></h1>}
      <AdviserCard adviser={adviser} />
      <div className="st-adv-disclose" data-disclosure>
        <p>{who}</p>
        <p>{shared}</p>
        <p>{intro}</p>
      </div>
      <button type="button" className="btn st-btn" onClick={onConfirm} disabled={busy}>{busy ? "One moment…" : `See ${adviser.first_name}'s open times`}</button>
    </>
  );
}

function AdviserCard({ adviser }: { adviser: Pick<AdviserInfo, "name" | "firm" | "fsp"> }) {
  return (
    <div className="st-adv">
      <span className="st-av" aria-hidden="true">{initials(adviser.name)}</span>
      <div className="st-adv-t"><strong>{adviser.name}</strong><span>{adviser.firm} · authorised FSP {adviser.fsp}</span></div>
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
      <Seo title="Pick a time for your call | SortMyCover" description="A few quick questions, then pick a time for your call." canonical={APEX + "/start/"} robots="noindex,nofollow" referrer="no-referrer" />
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
  // email step
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const rid = useRef<{ key: string; id: string } | null>(null);
  const idFor = (key: string) => { if (rid.current?.key !== key) rid.current = { key, id: requestId() }; return rid.current.id; };

  /** The adviser on part A (from POST /start/answers, or GET /start when it already carries an id). */
  const [adviser, setAdviser] = useState<AdviserInfo | null>(null);
  /** The adviser id a 'slots' reply confirmed. Nothing asks for open times until this is set. */
  const confirmed = useRef<string | null>(null);
  const shown: AdviserInfo | null = adviser ?? (data?.adviser ? { ...data.adviser, id: data.adviser.id || "" } : null);
  const adviserFirst = shown?.first_name || null;

  /* ---------- boot: token from the fragment, then strip it from the address bar ---------- */
  const load = useCallback(async () => {
    const a = api.current!;
    setScreen({ k: "loading" });
    const r = await a.getStart();
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return setScreen({ k: "loadError" });
    const d = r.data;
    setData(d);
    setAnswers(d.answers || {});
    const av = availableMethods(d.methods);
    setMethods(av);
    setMethod(defaultMethod(d.methods));
    if (d.booking && !d.booking.held) return setScreen({ k: "done", info: d.booking, held: false });
    const at = resumeAt(d.answers || {});
    if (at === "chat") return setScreen({ k: "chat" });
    if (at === "adviser") {
      // already answered (maybe already routed): show part A and confirm before any open time is fetched
      if (d.adviser?.id) { setAdviser({ ...d.adviser, id: d.adviser.id }); return setScreen({ k: "step", step: "adviser" }); }
      return submitAnswers(d.answers || {}, false, null, true);
    }
    setScreen({ k: "step", step: at });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      let tok = readTokenFromHash(location.hash);
      if (tok) { try { sessionStorage.setItem(TOKEN_KEY, tok); } catch { /* storage blocked: the token still works for this page view */ } }
      if (/(^#|&)lt=/.test(location.hash)) history.replaceState(history.state, "", location.pathname + location.search);
      if (!tok) { try { tok = sessionStorage.getItem(TOKEN_KEY); } catch { /* none */ } }
      if (!tok) return setScreen({ k: "expired" });
      let a: StartApi | null = null;
      if (import.meta.env.DEV) {
        if (tok === "demo") a = (await import("@/lib/start-mock")).createMockApi();
      }
      api.current = a ?? createStartApi(tok);
      load();
    })();
  }, [load]);

  /* ---------- focus and transition on every screen change ---------- */
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const prevKey = useRef("loading");
  const key = keyOf(screen, adviser?.id);
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

  /** POST /start/answers. Phase 1 (confirm null) routes and names the adviser; phase 2 confirms that adviser. Only a confirmed
      'slots' reply opens the times (afterAnswers in src/lib/start.ts); a different adviser re-shows part A. */
  async function submitAnswers(a: Answers, toChat: boolean, confirm: string | null = null, fromLoad = false) {
    setBusy(true); setErr(null);
    const body = answersPayload(a, "", confirm);
    const r = await api.current!.postAnswers({ ...body, request_id: idFor("answers:" + JSON.stringify(body)) });
    setBusy(false);
    const fail = () => (fromLoad ? setScreen({ k: "loadError" }) : setErr({ retry: () => submitAnswers(a, toChat, confirm) }));
    if (r.kind === "expired") return setScreen({ k: "expired" });
    if (r.kind === "error") return fail();
    if (toChat) return setScreen({ k: "chat" });
    const o = afterAnswers(r, confirm);
    if (o.k === "chat") return setScreen({ k: "chat" });
    if (o.k === "error") return fail();
    if (o.k === "adviser") { confirmed.current = null; setAdviser(o.adviser); return go("adviser"); }
    confirmed.current = confirm;
    setSlots(null); setPicked(null); setShowAll(false);
    go("time");
    fetchSlots();
  }

  function choose<K extends "intent" | "age_band" | "has_cover" | "budget_band" | "want">(step: StepId, k: K, v: NonNullable<Answers[K]>) {
    if (busy) return;
    const a = setAnswer(answers, k, v);
    setAnswers(a);
    // a short beat so the tick is seen before the next question slides in
    window.setTimeout(() => {
      const n = nextStep(step, a);
      if (n === "chat") submitAnswers(a, true);
      else if (n === "submit") submitAnswers(a, false);
      else go(n);
    }, reducedMotion() ? 60 : 180);
  }

  function back(step: StepId) {
    const p = prevStep(step, answers);
    if (p) go(p);
  }

  /* ---------- time ---------- */
  async function fetchSlots() {
    if (!confirmed.current) return go("adviser"); // never ask for times before the adviser is confirmed
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

  /* ---------- book ---------- */
  async function book() {
    const e = email.trim();
    if (!validEmail(e)) { setEmailErr(EMAIL_ERR); return; }
    if (!picked || !method) return go("time");
    setEmailErr(null); setErr(null); setBusy(true);
    const r = await api.current!.book({ slot_start: picked, method, email: e, email_confirmed: true, request_id: idFor(`book:${picked}|${method}|${e}`), context: { source: "start_page" } });
    setBusy(false);
    switch (r.kind) {
      case "booked": return setScreen({ k: "done", info: r.info, held: false });
      case "held": return setScreen({ k: "done", info: r.info, held: true });
      case "taken":
        setPicked(null); setShowAll(false); setTaken(true);
        if (r.slots && r.slots.length) { setSlots(r.slots); go("time"); } else { setSlots(null); go("time"); fetchSlots(); }
        return;
      case "email": return setEmailErr(EMAIL_ERR);
      case "expired": return setScreen({ k: "expired" });
      default: return setErr({ retry: book });
    }
  }

  /* ---------- render ---------- */
  const step = screen.k === "step" ? screen.step : null;
  const n = step ? stepNumber(step) : null;
  const first = data?.first_name || null;

  let body: ReactNode;
  const backLink = step && step !== "intent" ? <button type="button" className="st-back" onClick={() => back(step)} disabled={busy}>‹ Back</button> : null;
  const errorBox = (
    <div className="st-live" aria-live="polite">
      {err && <div className="st-error"><p>Something went wrong.</p><button type="button" className="st-retry" onClick={err.retry} disabled={busy}>Try again</button></div>}
    </div>
  );
  const options = <V extends string>(opts: Opt<V>[], value: V | undefined, pick: (v: V) => void, grid = false) => (
    <div className={grid ? "st-opts st-grid2" : "st-opts"} role="group" aria-labelledby="st-q">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" className="st-opt" aria-pressed={on} disabled={busy} onClick={() => pick(o.v)}>
            <span className="st-opt-t"><strong>{o.t}</strong>{o.d && <small>{o.d}</small>}</span>
            {!grid && <span className="st-dot" aria-hidden="true">{on && <TickSvg />}</span>}
          </button>
        );
      })}
    </div>
  );
  const optionFoot = (backLink || err || busy) && (
    <div className="st-foot">{errorBox}{busy && !err && <p className="st-saving" role="status">Saving…</p>}{backLink}</div>
  );

  switch (screen.k) {
    case "loading":
      body = (<><h1 ref={headRef} tabIndex={-1} className="sr">Loading your questions</h1><div className="st-skel" aria-hidden="true"><i /><i /><i /><i /></div></>);
      break;
    case "expired":
      body = (<><Q ref={headRef}>This link has <em>expired.</em></Q><p className="st-sub">Ask Lindi for a new one on WhatsApp.</p><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "loadError":
      body = (<><Q ref={headRef}>Something went <em>wrong.</em></Q><p className="st-sub">Please try again.</p><div className="st-foot"><button type="button" className="btn st-btn" onClick={load}>Try again</button><a className="st-back" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "chat":
      body = screen.noSlots
        ? (<><Q ref={headRef}>No open times <em>right now.</em></Q><p className="st-sub">Lindi will find you a time on WhatsApp.</p><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>)
        : (<><Q ref={headRef}>Lindi will carry on with you <em>on WhatsApp.</em></Q><div className="st-foot"><a className="btn st-btn" href={WA}>Back to WhatsApp</a></div></>);
      break;
    case "done": {
      const { info, held } = screen;
      const adv = shown;
      body = (
        <div className="st-done">
          <span className="st-bigtick" aria-hidden="true"><TickSvg size={34} width={3.4} /></span>
          <Q ref={headRef} className="st-done-h">You're booked{first ? <>, <em>{first}.</em></> : "."}</Q>
          <div className="st-card">
            <strong>{formatWhen(info.start)}</strong>
            {adv && <div className="st-row"><span>With</span><b>{adv.name}, {adv.firm}</b></div>}
            <div className="st-row"><span>How</span><b>{methodLabel(info.method || method || "")}, about 30 min</b></div>
          </div>
          <p className="st-done-p">{held ? "Check your email and tap the link to confirm. Lindi has your booking details on WhatsApp." : "Your calendar invite is on its way. Lindi has your booking details on WhatsApp."}</p>
          <div className="st-foot">
            <a className="btn st-btn" href={WA}>Back to WhatsApp</a>
            <p className="st-fine">Nothing is bought on the call. Any next step is your choice.</p>
          </div>
        </div>
      );
      break;
    }
    case "step":
      switch (screen.step) {
        case "intent":
          body = (<><Q ref={headRef}>What brings you to SortMyCover <em>today?</em></Q><p className="st-sub">Pick the one closest.</p>{options(INTENTS, answers.intent, (v) => choose("intent", "intent", v))}{optionFoot}</>);
          break;
        case "age":
          body = (<><Q ref={headRef}>Which age band <em>are you in?</em></Q><p className="st-sub">So {adviserFirst || "your adviser"} can prepare properly.</p>{options(AGES, answers.age_band, (v) => choose("age", "age_band", v), true)}{optionFoot}</>);
          break;
        case "cover":
          body = (<><Q ref={headRef}>Do you have any life, disability or income cover <em>now?</em></Q><p className="st-sub">Your own or through work.</p>{options(COVER, answers.has_cover, (v) => choose("cover", "has_cover", v))}{optionFoot}</>);
          break;
        case "budget":
          body = answers.has_cover === "yes"
            ? (<><Q ref={headRef}>Roughly what do you pay for it <em>each month?</em></Q><p className="st-sub">All policies together. A band is enough.</p>{options(BANDS, answers.budget_band, (v) => choose("budget", "budget_band", v), true)}{optionFoot}</>)
            : (<><Q ref={headRef}>Roughly what could you put towards cover <em>each month?</em></Q><p className="st-sub">A band is enough.</p>{options(BANDS, answers.budget_band, (v) => choose("budget", "budget_band", v), true)}{optionFoot}</>);
          break;
        case "want":
          body = (<><Q ref={headRef}>What would you most want cover <em>to do for you?</em></Q>{options(WANTS, answers.want, (v) => choose("want", "want", v))}{optionFoot}</>);
          break;
        case "adviser":
          body = shown?.id
            ? (<><AdviserIntro adviser={shown} busy={busy} onConfirm={() => submitAnswers(answers, false, shown.id)} heading={<Q ref={headRef}>This is your adviser, <em>{shown.first_name}.</em></Q>} /><div className="st-foot">{errorBox}{backLink}</div></>)
            : (<><Q ref={headRef}>Something went <em>wrong.</em></Q><p className="st-sub">Please try again.</p><div className="st-foot"><button type="button" className="btn st-btn" onClick={load}>Try again</button></div></>);
          break;
        case "time": {
          const adv = shown;
          const groups = slots ? groupSlots(slots, new Date()) : [];
          const visibleGroups = showAll ? groups : limitGroups(groups, SHOW_ROWS);
          const more = countRows(groups) > countRows(visibleGroups);
          body = (
            <>
              <Q ref={headRef}>Pick a time for your <em>30-minute call</em></Q>
              {adv && <AdviserCard adviser={adv} />}
              {methods.length > 1 && (
                <div className="st-seg" role="group" aria-label="Meeting type">
                  {methods.map((m) => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>{methodLabel(m)}</button>)}
                </div>
              )}
              <p className="st-tz">30 minutes, South African time.</p>
              {taken && <p className="st-note" role="status">Sorry, that time was just taken. Here are the next open times.</p>}
              {slotsState === "loading" && <div className="st-skel" role="status"><span className="sr">Finding open times</span><i /><i /><i /></div>}
              {slotsState === "error" && <div className="st-error" aria-live="polite"><p>Something went wrong.</p><button type="button" className="st-retry" onClick={fetchSlots}>Try again</button></div>}
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
              <div className="st-foot st-sticky">
                <button type="button" className="btn st-btn" disabled={!picked || !method} onClick={() => { setTaken(false); go("email"); }}>Book this time</button>
                {backLink}
              </div>
            </>
          );
          break;
        }
        case "email": {
          const sug = suggestEmail(email);
          const adv = shown;
          body = (
            <form className="st-form" noValidate onSubmit={(ev) => { ev.preventDefault(); book(); }}>
              <Q ref={headRef}>Where should the <em>invite</em> go?</Q>
              <div className="st-field">
                <label htmlFor="st-email">Email address</label>
                <input id="st-email" className="st-input" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  value={email} onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }} aria-invalid={!!emailErr} aria-describedby="st-email-err st-email-hint" />
                {sug && <button type="button" className="st-suggest" onClick={() => { setEmail(sug); setEmailErr(null); }}>Did you mean <strong>{sug}</strong>?</button>}
                <p id="st-email-err" className="st-field-err" aria-live="polite">{emailErr}</p>
              </div>
              <div className="st-hint" id="st-email-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                <span>We'll email a link to this address. Tap it to confirm, and the calendar invite follows.</span>
              </div>
              <dl className="st-summary">
                {picked && <div><dt>Call</dt><dd>{formatWhen(picked, ", ")}</dd></div>}
                {adv && <div><dt>With</dt><dd>{adv.name}</dd></div>}
                {method && <div><dt>How</dt><dd>{methodLabel(method)}</dd></div>}
              </dl>
              <div className="st-foot st-sticky">
                {errorBox}
                <button type="submit" className="btn st-btn" disabled={busy}>{busy ? "Booking…" : "Book my call"}</button>
                <p className="st-fine">Your answers go to {adviserFirst || "your adviser"} only, to prepare for the call. <a href="/privacy/">Privacy notice</a></p>
                {backLink}
              </div>
            </form>
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
            {n && <span className="st-pill"><span className="sr">Step </span>{n} of {TOTAL_STEPS}</span>}
          </div>
          {n && <div className="st-bars" aria-hidden="true">{Array.from({ length: TOTAL_STEPS }, (_, i) => <i key={i} className={i < n ? "on" : undefined} />)}</div>}
          {step === "intent" && <p className="st-hi">{first && <strong>Hi {first}. </strong>}Six quick taps, then pick a time.</p>}
        </div>
      </header>
      <main id="main" className="st-wrap st-main">
        <div ref={bodyRef} className={"st-body" + (screen.k === "done" ? " st-body-done" : "")}>{body}</div>
      </main>
    </div>
  );
}
