/* In-page booking widget: GET /slots -> pick a time and a method -> POST /book. Ported 1:1 from landing/template/page.js
   (409 collision shows the next 3, one Turnstile re-run on 400 try_again, "I'll pick a time on WhatsApp" calls /lead/skip). */
import { useEffect, useRef, useState } from "react";
import { getSlots, postBook, postSkip } from "@/lib/api";
import { EMAIL_RE, NEEDS_EMAIL, dayLabel, groupSlots, normaliseSlots, suggestEmail } from "@/lib/quiz";
import { fire, prepare, type TrackContext } from "@/lib/pixel";
import { strs } from "@/lib/site";

export interface BookedInfo { start: string; method: string; ics_url?: string }

interface Props {
  leadId: string;
  token: string;
  methods: string[];
  angle: string;
  startedAt: string;
  requestId: () => string;
  getBookToken: () => Promise<string>;
  onDone: (booked: boolean, info?: BookedInfo) => void;
}

export default function Booking({ leadId, token, methods, angle, startedAt, requestId, getBookToken, onDone }: Props) {
  const [status, setStatus] = useState<{ text: string; warn?: boolean }>({ text: strs.loading_slots });
  const [list, setList] = useState<string[]>([]);
  const [grouped, setGrouped] = useState(true);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<string>(methods[0]);
  const [email, setEmail] = useState("");
  const [emailBad, setEmailBad] = useState(false);
  const [bookErr, setBookErr] = useState("");
  const [busy, setBusy] = useState(false);
  const scheduleCtx = useRef<TrackContext | null>(null);
  const bookReq = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getSlots(token).then(
      (r) => {
        if (!alive.current) return;
        const l = r.ok ? normaliseSlots(r.json.slots) : [];
        if (!l.length) { setStatus({ text: strs.no_slots, warn: true }); setTimeout(() => alive.current && onDone(false), 2500); return; }
        setList(l); setStatus({ text: strs.slots_ready });
      },
      () => { if (!alive.current) return; setStatus({ text: strs.no_slots }); setTimeout(() => alive.current && onDone(false), 2500); },
    );
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsEmail = !!NEEDS_EMAIL[method];
  const sugg = needsEmail && EMAIL_RE.test(email.trim()) ? suggestEmail(email.trim()) : null;
  const days = grouped ? groupSlots(list) : groupSlots(list, 5, 3);

  function book() {
    if (busy) return;
    if (!slot) { setBookErr(strs.err_pick_slot); return; }
    if (!method) { setBookErr(strs.err_pick_method); return; }
    if (needsEmail && !EMAIL_RE.test(email.trim())) { setEmailBad(true); return; }
    setBookErr(""); setBusy(true);
    scheduleCtx.current = scheduleCtx.current || prepare("Schedule"); // own event_id, never the Lead id
    if (!bookReq.current) bookReq.current = requestId(); // same id on a retry of the same attempt (idempotent)
    const slotNow = slot, methodNow = method;
    const send = () => getBookToken().then((tok) => {
      const body: Record<string, unknown> = { lead_id: leadId, slot_start: slotNow, method: methodNow, angle, started_at: startedAt, request_id: bookReq.current, turnstile_token: tok, context: scheduleCtx.current };
      if (needsEmail) body.email = email.trim();
      return postBook(token, body);
    });
    send()
      .then((r) => (r.status === 400 && r.json && r.json.error === "try_again" ? send() : r))
      .then((r) => {
        if (!alive.current) return;
        setBusy(false);
        if (r.status === 409 || r.ok) bookReq.current = null;
        if (r.ok && r.json.booked !== false) {
          if (scheduleCtx.current) fire(scheduleCtx.current); // Schedule fires only on a confirmed booking
          onDone(true, { start: r.json.start || slotNow, method: r.json.method || methodNow, ics_url: r.json.ics_url });
        } else if (r.status === 409) {
          const nxt = normaliseSlots(r.json.slots).slice(0, 3);
          if (nxt.length) { setList(nxt); setGrouped(false); setSlot(null); setStatus({ text: strs.taken, warn: true }); }
          else setBookErr(strs.err_book);
        } else if (r.status === 422 && /email/.test(r.json.error || "")) setEmailBad(true);
        else setBookErr(strs.err_book);
      }, () => { if (!alive.current) return; setBusy(false); setBookErr(strs.err_book); });
  }

  function skip() {
    // I-45o: tell the server the lead skipped booking so the slots card goes to WhatsApp now. Fire-and-forget.
    try { postSkip(token, leadId).catch(() => {}); } catch { /* ignore */ }
    onDone(false);
  }

  return (
    <div role="group" aria-labelledby="h-book">
      <h3 id="h-book" tabIndex={-1} data-focus>Pick a time for your call</h3>
      <p className="hint">Live availability, South African time. You can change it on WhatsApp later.</p>
      <p className={"status" + (status.warn ? " warn" : "")} role="status">{status.text}</p>
      <div>
        {days.map((d) => (
          <div key={d.day}>
            <h4 className="day" id={"d" + d.day}>{dayLabel(d.day)}</h4>
            <div className="slots" role="group" aria-labelledby={"d" + d.day}>
              {d.slots.map((s) => (
                <button key={s} type="button" className="slot" aria-pressed={slot === s} aria-label={dayLabel(s) + " at " + s.slice(11, 16)} onClick={() => { setSlot(s); setBookErr(""); }}>
                  {s.slice(11, 16)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="hint" id="mLab">How should the adviser reach you?</p>
      <div className="methods" role="group" aria-labelledby="mLab">
        {methods.map((m) => (
          <button key={m} type="button" className="method" aria-pressed={method === m} onClick={() => { setMethod(m); if (!NEEDS_EMAIL[m]) { setEmail(""); setEmailBad(false); } }}>
            {(strs.methods as Record<string, string>)[m] || m}
          </button>
        ))}
      </div>
      {needsEmail && (
        <div className={"field" + (emailBad ? " bad" : "")}>
          <label htmlFor="email">Email for the invite</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={120} value={email} aria-invalid={emailBad || undefined} aria-describedby="eEmail tEmail"
            onChange={(e) => { setEmail(e.target.value); if (emailBad) setEmailBad(!EMAIL_RE.test(e.target.value.trim())); }}
            onBlur={() => { if (email) setEmailBad(!EMAIL_RE.test(email.trim())); }} />
          <span className="tip" id="tEmail">Only used to send the meeting invite.</span>
          <span className="err" id="eEmail">{strs.err_email}</span>
          {sugg && <button type="button" className="link-btn" onClick={() => setEmail(sugg)}>{strs.did_you_mean.replace("{x}", sugg)}</button>}
        </div>
      )}
      {bookErr && <p className="form-err" role="alert">{bookErr}</p>}
      <div className="qnav">
        <button type="button" className="link-btn" onClick={skip}>I’ll pick a time on WhatsApp</button>
        <button type="button" className="btn" disabled={busy} onClick={book}>{busy ? strs.booking : strs.book}</button>
      </div>
    </div>
  );
}
