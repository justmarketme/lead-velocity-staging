/* The booking quiz: two taps (age band, budget band), then first name, mobile and consent, then the in-page booking widget.
   Used on /book/ (angle "generic") and on every campaign page. Contracts: /lead /slots /book /lead/skip /beacon on n8n.
   Out-of-band answers exit at once and NOTHING is sent or stored (rule S21). No output is computed from answers (rule S19).
   Meta Pixel loads only after the separate optional consent (src/lib/pixel.ts). */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAnimate } from "motion/react-mini";
import Booking, { type BookedInfo } from "./Booking";
import { postLead, beacon, type LeadBody } from "@/lib/api";
import { AGE_OPTIONS, BUDGET_OPTIONS, ageInBand, consentText, dayLabel, prettyMobile, qualifies, toE164 } from "@/lib/quiz";
import { BOOK_LABEL, COST_LINE, API_BASE, FOOTER_LINE, apex, company, consentCfg, site, strs } from "@/lib/site";
import { beaconOff, fire, grantAds, prepare, track, uuid, type TrackContext } from "@/lib/pixel";
import { leave, prefersReducedMotion, pulse, shake } from "@/lib/motion";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const PROGRESS: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1, 5: 1, 6: 1, 7: 1 };

interface Props {
  /** n8n `angle` and beacon key: the campaign slug, or "generic" on /book/. */
  angle: string;
  /** Neutral code sent to Meta as content_name (never the human-readable angle). */
  metaCode: string;
  lang?: string;
  /** Angle-aware wording of the budget question: what the monthly amount is for. Default "life cover". The answer bands are unchanged. */
  budgetTopic?: string;
  /** Where the no-JS fallback form redirects after the lead is accepted (informational; n8n builds it from the validated angle). */
  idPrefix?: string;
}

const Check = () => (
  <span className="dot"><svg viewBox="0 0 24 24" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 13l4 4L19 7" /></svg></span>
);

const fmt = (s: string, vars: Record<string, string>) => Object.keys(vars).reduce((a, k) => a.replace("{" + k + "}", vars[k]), s);

export default function Quiz({ angle, metaCode, lang = "en-ZA", budgetTopic = "life cover" }: Props) {
  const budgetLegend = `Roughly what monthly budget could you set aside for ${budgetTopic}? This is not a quote.`;
  const uid = useId();
  const [step, setStep] = useState<Step>(1);
  const [answers, setAnswers] = useState<{ age_band?: string; budget_band?: string }>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [adsChoice, setAdsChoice] = useState<"give" | "decline" | null>(null); // neither is preselected
  const consentAds = adsChoice === "give";
  const [bad, setBad] = useState<{ name?: boolean; phone?: boolean; consent?: boolean }>({});
  const [formErr, setFormErr] = useState("");
  const [sending, setSending] = useState(false);
  const [lead, setLead] = useState<{ id: string; methods: string[] } | null>(null);
  const [done, setDone] = useState<{ booked: boolean; info?: BookedInfo } | null>(null);
  const [showNext, setShowNext] = useState(false);
  const token = useRef("");
  const viaPointer = useRef(false);
  const started = useRef(false);
  const leadCtx = useRef<TrackContext | null>(null);
  const startedAt = useRef("");
  const leadReq = useRef("");
  const hp = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [panelScope, animatePanel] = useAnimate();
  const [barScope, animateBar] = useAnimate();
  const prevStep = useRef<Step>(1);
  const firstRun = useRef(true);
  const ts = useRef({ token: "", loaded: false, ready: false, widgets: {} as Record<string, any>, waiters: {} as Record<string, ((t: string) => void) | null> });

  const consentInfo = consentText(consentCfg, site.consent_mode, site.practice_name, site.fsp_number);
  const idBase = "q" + uid.replace(/:/g, "");

  useEffect(() => {
    startedAt.current = new Date().toISOString();
    leadReq.current = uuid();
    try { token.current = sessionStorage.getItem("smc_lt") || ""; } catch { /* ignore */ }
    beacon(angle, "view", undefined, beaconOff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- step change: focus, scroll, and the Motion transitions (step slide-fade + progress bar) ---------- */
  useEffect(() => {
    if (step >= 2 && step <= 7) beacon(angle, "step", step, beaconOff);
    if (firstRun.current) { firstRun.current = false; prevStep.current = step; return; }
    const panel = panelScope.current as HTMLElement | null;
    const reduce = prefersReducedMotion();
    if (panel) {
      const h = panel.querySelector<HTMLElement>("[data-focus]");
      cardRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      try { h?.focus({ preventScroll: true }); } catch { h?.focus(); }
      if (!reduce) animatePanel(panel, { opacity: [0, 1], transform: ["translateX(18px)", "translateX(0px)"] }, { duration: 0.24, ease: "easeOut" });
    }
    const bar = barScope.current as HTMLElement | null;
    if (bar && !reduce && PROGRESS[prevStep.current] !== PROGRESS[step]) {
      animateBar(bar, { transform: [`scaleX(${PROGRESS[prevStep.current]})`, `scaleX(${PROGRESS[step]})`] }, { duration: 0.38, ease: "easeOut" });
    }
    prevStep.current = step;
    setShowNext(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ---------- Turnstile (inert until a site key is configured; loads on the first quiz tap) ---------- */
  const renderTs = useCallback((action: "lead" | "book") => {
    const t = ts.current;
    const slot = document.getElementById(action === "book" ? idBase + "-ts-book" : idBase + "-ts");
    if (!slot || t.widgets[action] != null) return;
    try {
      t.widgets[action] = (window as any).turnstile.render(slot, {
        sitekey: site.turnstile_sitekey, size: "invisible", action, execution: action === "book" ? "execute" : "render",
        callback: (tok: string) => { if (action === "lead") t.token = tok; if (t.waiters[action]) { t.waiters[action]!(tok); t.waiters[action] = null; } },
      });
    } catch { /* ignore */ }
  }, [idBase]);
  const loadTurnstile = useCallback(() => {
    const t = ts.current;
    if (!site.turnstile_sitekey || t.loaded) return;
    t.loaded = true;
    (window as any).__smcTs = () => { t.ready = true; renderTs("lead"); };
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__smcTs";
    s.async = true; document.head.appendChild(s);
  }, [renderTs]);
  /** Fresh single-use token for /book. Empty site key (stub) or any failure resolves "" after at most 8 s: the server decides. */
  const bookToken = useCallback((): Promise<string> => {
    if (!site.turnstile_sitekey) return Promise.resolve("");
    loadTurnstile();
    const t = ts.current;
    return new Promise((resolve) => {
      let finished = false;
      const to = setTimeout(() => { if (!finished) { finished = true; resolve(""); } }, 8000);
      t.waiters.book = (tok) => { if (!finished) { finished = true; clearTimeout(to); resolve(tok || ""); } };
      const go = (n: number) => {
        if (!t.ready) { if (n < 40) setTimeout(() => go(n + 1), 200); return; }
        renderTs("book");
        try { if (t.widgets.book != null) { (window as any).turnstile.reset(t.widgets.book); (window as any).turnstile.execute(t.widgets.book); } } catch { /* ignore */ }
      };
      go(0);
    });
  }, [loadTurnstile, renderTs]);

  function startQuiz() {
    if (started.current) return;
    started.current = true;
    beacon(angle, "step", 1, beaconOff);
    track("ViewContent", { content_name: "quiz_start" }); // browser event fires only if consent was given on an earlier visit
    loadTurnstile();
  }

  function advanceFrom(s: Step, a: typeof answers) {
    if (s === 1) {
      if (!a.age_band) return;
      if (!ageInBand(a.age_band)) setStep(7); // out of band at once: neutral exit, no budget question, nothing sent
      else setStep(2);
      return;
    }
    if (s === 2) {
      if (!a.budget_band) return;
      if (qualifies(a)) setStep(3);
      else setStep(7); // out of band: neutral exit, nothing is sent or stored
    }
  }

  function pick(field: "age_band" | "budget_band", value: string) {
    startQuiz();
    const next = { ...answers, [field]: value };
    setAnswers(next);
    const picked = document.querySelector<HTMLElement>(`[data-quiz] input[name="${field}"][value="${value}"]`)?.closest(".opt");
    if (picked) pulse(picked);
    if (viaPointer.current) { const s = step; setTimeout(() => { const panel = panelScope.current as HTMLElement | null; if (panel) leave(panel, () => advanceFrom(s, next)); else advanceFrom(s, next); }, 180); setShowNext(false); }
    else setShowNext(true);
  }

  function validName() { return name.trim().length >= 2; }

  /** Step 3 -> 4: first name and mobile are valid. */
  function detailsNext(e: React.FormEvent) {
    e.preventDefault();
    const nameOk = validName(), ok = !!toE164(phone);
    setBad((b) => ({ ...b, name: !nameOk, phone: !ok }));
    if (!(nameOk && ok)) {
      requestAnimationFrame(() => document.querySelectorAll("[data-quiz] .field.bad").forEach(shake));
      document.getElementById(!nameOk ? idBase + "-name" : idBase + "-phone")?.focus();
      return;
    }
    setStep(4);
  }

  /** Step 4: consent, then POST /lead. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4 || sending) return;
    const e164 = toE164(phone);
    setBad((b) => ({ ...b, consent: !consent }));
    if (!consent) {
      requestAnimationFrame(() => document.querySelectorAll("[data-quiz] .consent-wrap.bad").forEach(shake));
      document.getElementById(idBase + "-consent")?.focus();
      return;
    }
    if (!e164 || !validName()) { setStep(3); return; }
    if (hp.current && hp.current.value) { finish(false); return; } // honeypot: pretend success, send nothing
    setSending(true); setFormErr("");
    if (consentAds) grantAds(); // separate optional consent: only now may the Pixel load
    leadCtx.current = leadCtx.current || prepare("Lead"); // fired in the browser only after the server accepted the lead
    const body: LeadBody = {
      first_name: name.trim(), mobile: e164, consent: true,
      consent_text: consentInfo.text, consent_version: consentInfo.version, consent_mode: consentInfo.mode,
      consent_ads: consentAds, consent_ads_text: consentCfg.ads.text, consent_ads_version: consentCfg.ads.version,
      age_band: answers.age_band!, budget_band: answers.budget_band!,
      angle, lang, started_at: startedAt.current, request_id: leadReq.current, page_url: location.origin + location.pathname,
      company_website: "", turnstile_token: ts.current.token || (document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? ""),
      context: leadCtx.current,
    };
    postLead(body).then(
      (r) => {
        setSending(false);
        if (r.ok) {
          const j = r.json;
          if (j.out_of_band || j.status === "not_qualified") { setStep(7); return; }
          if (leadCtx.current) fire(leadCtx.current, { content_name: metaCode });
          token.current = j.lead_token || "";
          try { sessionStorage.setItem("smc_lt", token.current); } catch { /* ignore */ }
          const l = { id: j.lead_id as string, methods: (j.methods_supported && j.methods_supported.length ? j.methods_supported : ["whatsapp_call", "phone"]) as string[] };
          setLead(l);
          if (site.booking && token.current) setStep(5); else finish(false);
        } else if (r.status === 429) setFormErr(strs.err_rate);
        else if (r.status === 422 && r.json.error === "out_of_band") setStep(7);
        else if (r.status === 422 && /mobile/.test(r.json.error || "")) { setBad((b) => ({ ...b, phone: true })); setStep(3); setFormErr(strs.err_mobile_server); }
        else setFormErr(strs.err_send);
      },
      () => { setSending(false); setFormErr(strs.err_send); },
    );
  }

  function finish(booked: boolean, info?: BookedInfo) {
    setDone({ booked, info });
    setStep(6);
  }

  const e164 = toE164(phone);
  const hearOpt = (field: "age_band" | "budget_band", opts: { value: string; label: string }[], legend: string, hint: string, headId: string) => (
    <fieldset aria-labelledby={headId}>
      <legend><h3 id={headId} tabIndex={-1} data-focus>{legend}</h3></legend>
      <p className="hint">{hint}</p>
      <div className="opts">
        {opts.map((o, i) => (
          <label key={o.value} className="opt" onPointerDown={() => { viaPointer.current = true; }}>
            <input type="radio" name={field} value={o.value} required={i === 0} checked={answers[field] === o.value} onChange={() => pick(field, o.value)} onKeyDown={() => { viaPointer.current = false; }} />
            <span>{o.label}</span><Check />
          </label>
        ))}
      </div>
      <div className="qnav">
        {step > 1 ? <button type="button" className="link-btn" onClick={() => setStep((step - 1) as Step)}>Back</button> : <span />}
        {showNext && answers[field] && <button type="button" className="btn btn-secondary" onClick={() => advanceFrom(step, answers)}>Next</button>}
      </div>
    </fieldset>
  );

  return (
    <div className="quiz-card" id="card" ref={cardRef} data-quiz>
      {step <= 4 && (
        <>
          <p className="step-label" aria-hidden="true">Step {step} of 4</p>
          <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} data-step={step}>
            <div className="fill" ref={barScope} />
          </div>
        </>
      )}
      <p className="sr" role="status" aria-live="polite">{step <= 4 ? `Step ${step} of 4` : ""}</p>

      <div className="q" ref={panelScope}>
        {step === 1 && hearOpt("age_band", AGE_OPTIONS, "How old are you?", "You must be 18 or older. This only decides if we can book a call.", idBase + "-h1")}
        {step === 2 && hearOpt("budget_band", BUDGET_OPTIONS, budgetLegend, "It is never shown back to you.", idBase + "-h2")}
        {step === 3 && (
          <form onSubmit={detailsNext} noValidate autoComplete="on" aria-labelledby={idBase + "-h3"}>
            <h3 id={idBase + "-h3"} tabIndex={-1} data-focus>Where should we send your adviser’s details?</h3>
            <p className="hint">One call of about 30 minutes with an adviser, at a time you pick. {COST_LINE}</p>
            <div className={"field" + (bad.name ? " bad" : "")}>
              <label htmlFor={idBase + "-name"}>First name</label>
              <input id={idBase + "-name"} name="first_name" autoComplete="given-name" autoCapitalize="words" maxLength={40} required placeholder="e.g. Thabo" value={name} aria-invalid={bad.name || undefined}
                onChange={(e) => { setName(e.target.value); if (bad.name) setBad((b) => ({ ...b, name: e.target.value.trim().length < 2 })); }} />
              <span className="err">{strs.err_name}</span>
            </div>
            <div className={"field" + (bad.phone ? " bad" : e164 ? " good" : "")}>
              <label htmlFor={idBase + "-phone"}>Mobile number (WhatsApp)</label>
              <input id={idBase + "-phone"} name="mobile" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} required placeholder="e.g. 082 123 4567" value={phone} aria-invalid={bad.phone || undefined} aria-describedby={idBase + "-why"}
                onChange={(e) => { setPhone(e.target.value); if (bad.phone && toE164(e.target.value)) setBad((b) => ({ ...b, phone: false })); }}
                onBlur={() => { if (phone && !e164) setBad((b) => ({ ...b, phone: true })); }} />
              <span className="tip" id={idBase + "-why"}>SortMyCover (a service of Lead Velocity) will message this number on WhatsApp about your call. The adviser you are booked with will also have it. Reply STOP to end it.</span>
              <span className="err">{strs.err_mobile}</span>
              <span className="ok" aria-live="polite">{e164 ? strs.ok_mobile + " " + prettyMobile(e164) : ""}</span>
            </div>
            {formErr && <p className="form-err" role="alert">{formErr}</p>}
            <div className="qnav">
              <button type="button" className="link-btn" onClick={() => setStep(2)}>Back</button>
              <button type="submit" className="btn">Next <span aria-hidden="true">→</span></button>
            </div>
          </form>
        )}
        {step === 4 && (
          <form onSubmit={submit} noValidate aria-labelledby={idBase + "-h4"}>
            <h3 id={idBase + "-h4"} tabIndex={-1} data-focus>One last step: your consent</h3>
            <p className="hint">Two separate choices. Only the first is needed to book.</p>
            <div className={"consent-wrap" + (bad.consent ? " bad" : "")} data-disclosure>
              <label className="consent">
                <input id={idBase + "-consent"} type="checkbox" name="consent" value="yes" required checked={consent} aria-describedby={idBase + "-econsent"} onChange={(e) => { setConsent(e.target.checked); setBad((b) => ({ ...b, consent: !e.target.checked })); }} />
                <span>
                  {consentInfo.text}{" "}
                  <a href={apex("/privacy/")} target="_blank" rel="noopener">{consentCfg.link_text}<span className="sr"> (opens in a new tab)</span></a>
                </span>
              </label>
              <span className="err" id={idBase + "-econsent"}>{strs.err_consent}</span>
            </div>
            <fieldset className="ads-choice" data-disclosure>
              <legend><span className="optional-tag">Optional</span> Ad measurement</legend>
              <p className="hint">{consentCfg.ads.text}</p>
              <div className="ads-pair">
                <label><input type="radio" name="consent_ads" value="give" checked={adsChoice === "give"} onChange={() => setAdsChoice("give")} /> {consentCfg.ads.label}</label>
                <label><input type="radio" name="consent_ads" value="decline" checked={adsChoice === "decline"} onChange={() => setAdsChoice("decline")} /> {consentCfg.ads.decline}</label>
              </div>
            </fieldset>
            <div className="hp" aria-hidden="true"><label>Website<input type="text" name="company_website" tabIndex={-1} autoComplete="off" ref={hp} /></label></div>
            <div id={idBase + "-ts"} />
            {formErr && <p className="form-err" role="alert">{formErr}</p>}
            <div className="qnav">
              <button type="button" className="link-btn" onClick={() => setStep(3)}>Back</button>
              <button type="submit" className="btn" disabled={sending}>{sending ? strs.sending : BOOK_LABEL} <span aria-hidden="true">→</span></button>
            </div>
            <p className="fine" data-disclosure>{FOOTER_LINE}</p>
            <div className="beside">
              <b>What happens next</b>
              <span>You get a WhatsApp with your adviser’s name, practice and FSP number.</span>
              <span>You pick a time that suits you, and get reminders before the call.</span>
              <span>The call is about 30 minutes, by video, WhatsApp or phone. {COST_LINE} You decide afterwards.</span>
            </div>
          </form>
        )}
        {step === 5 && lead && (
          <>
            <Booking leadId={lead.id} token={token.current} methods={lead.methods} angle={angle} startedAt={startedAt.current} requestId={uuid} getBookToken={bookToken} onDone={finish} />
            <div id={idBase + "-ts-book"} />
          </>
        )}
        {step === 6 && done && <Done name={name.trim()} booked={done.booked} info={done.info} leadId={lead?.id} />}
        {step === 7 && (
          <div className="done">
            <h3 id={idBase + "-h7"} tabIndex={-1} data-focus>We can’t arrange a call from these answers.</h3>
            <p>Nothing you entered has been saved or sent. You are welcome to read our plain-language guides.</p>
            <p><a className="btn btn-secondary" href={apex("/learn/")}>Read our guides</a></p>
          </div>
        )}
      </div>

      {/* No-JS fallback: a plain form post to the same /lead endpoint (n8n answers with a 303 to the thank-you page). */}
      <noscript>
        <form method="post" action={API_BASE + "/lead"}>
          <p><strong>Book my adviser call</strong></p>
          <fieldset><legend>How old are you?</legend>{AGE_OPTIONS.map((o) => (<label key={o.value}><input type="radio" name="age_band" value={o.value} required /> {o.label}</label>))}</fieldset>
          <fieldset><legend>{budgetLegend}</legend>{BUDGET_OPTIONS.map((o) => (<label key={o.value}><input type="radio" name="budget_band" value={o.value} required /> {o.label}</label>))}</fieldset>
          <p><label>First name <input name="first_name" required /></label></p>
          <p><label>Mobile number (WhatsApp) <input name="mobile" type="tel" required /></label></p>
          <p><label><input type="checkbox" name="consent" value="yes" required /> {consentInfo.text}</label></p>
          <fieldset><legend>Optional: ad measurement</legend><p>{consentCfg.ads.text}</p><label><input type="radio" name="consent_ads" value="give" /> {consentCfg.ads.label}</label> <label><input type="radio" name="consent_ads" value="decline" /> {consentCfg.ads.decline}</label></fieldset>
          <input type="hidden" name="consent_text" value={consentInfo.text} />
          <input type="hidden" name="consent_version" value={consentInfo.version} />
          <input type="hidden" name="consent_mode" value={consentInfo.mode} />
          <input type="hidden" name="consent_ads_version" value={consentCfg.ads.version} />
          <input type="hidden" name="angle" value={angle} />
          <input type="hidden" name="lang" value={lang} />
          <input className="hp" type="text" name="company_website" tabIndex={-1} autoComplete="off" />
          <button type="submit" className="btn">Send my details</button>
        </form>
      </noscript>
    </div>
  );
}

function icsUtc(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z";
}
function makeIcs(start: string, method: string, leadId?: string) {
  const end = new Date(new Date(start).getTime() + 30 * 60000).toISOString();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SortMyCover//Site//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    "UID:" + (leadId || "smc") + "-" + icsUtc(start) + "@sortmycover.co.za", "DTSTAMP:" + icsUtc(new Date().toISOString()),
    "DTSTART:" + icsUtc(start), "DTEND:" + icsUtc(end), "SUMMARY:" + strs.cal_title,
    "DESCRIPTION:" + strs.cal_desc + " (" + ((strs.methods as Record<string, string>)[method] || method) + ")", "END:VEVENT", "END:VCALENDAR"];
  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

function Done({ name, booked, info, leadId }: { name: string; booked: boolean; info?: BookedInfo; leadId?: string }) {
  const [calHref, setCalHref] = useState<string>("");
  useEffect(() => {
    if (booked && info) {
      try { setCalHref(info.ics_url || URL.createObjectURL(makeIcs(info.start, info.method, leadId))); } catch { /* ignore */ }
    }
  }, [booked, info, leadId]);
  const m = info ? (strs.methods as Record<string, string>)[info.method] || info.method : "";
  return (
    <div className="done">
      <div className="big" aria-hidden="true">✓</div>
      <h3 tabIndex={-1} data-focus>{fmt(booked ? strs.done_booked_h : strs.done_not_h, { name })}</h3>
      <p>{booked ? strs.done_booked_p : strs.done_not_p}</p>
      <div className="summary">
        {booked && info ? (
          <>
            <span><b>{strs.sum_when}</b> {dayLabel(info.start) + ", " + info.start.slice(11, 16)}</span>
            <span><b>{strs.sum_how}</b> {m}</span>
            <span><b>{strs.sum_adviser}</b> {strs.sum_adviser_v}</span>
          </>
        ) : (
          <span><b>{strs.sum_next}</b> {strs.sum_next_v}</span>
        )}
      </div>
      <p className="tip">If the WhatsApp message does not arrive, email <a href={"mailto:" + company.email}>{company.email}</a>.</p>
      {booked && calHref && <div><a className="btn btn-secondary" href={calHref} download="sortmycover-call.ics">{strs.add_cal}</a></div>}
    </div>
  );
}
