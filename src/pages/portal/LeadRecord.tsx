/**
 * Lead record (ux-sprint-1 R11; Attio highlights + timeline, HubSpot Activities tab). /broker/leads/:id
 * Header: name, self-declared bands, language, method, next or last meeting, Call/Join. Then the dated history,
 * newest first, with the delivery moment (clause 5.2) marked. Never health detail, ID numbers or meeting outcomes
 * beyond the broker's own four-way mark (clause 8.4). RLS returns nothing for another broker's lead.
 * Deep links: ?do=brief|mark|proof opens that action on the relevant meeting (WhatsApp buttons, R10).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import PortalShell, { usePortal } from "./PortalShell";
import { Brief, JoinCall, MarkButtons, Sheet, useNow } from "./MeetingParts";
import { AGE_LABEL, BUDGET_LABEL, fmtDayTime, methodLabel } from "@/lib/smc";
import { buildTimeline, fullName, useCycle, useLeadRecord } from "@/lib/smcPortal";
import { markLabel } from "@/lib/smcRules";

function Body() {
  const { id = "" } = useParams();
  const { broker } = usePortal();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow(30_000);
  const { data, isLoading } = useLeadRecord(broker.id, id);
  const { data: cyc } = useCycle(broker.id);
  const [brief, setBrief] = useState(false);
  const [doAct] = useState<string | null>(params.get("do"));
  const applied = useRef(false);
  const l = data?.lead || null;
  const live = (data?.bookings || []).filter((b) => b.status !== "cancelled");
  const outcomeOf = (bid: string) => data?.outcomes.find((o) => o.booking_id === bid);
  const toMark = live.filter((b) => Date.parse(b.starts_at) <= now && (!outcomeOf(b.id) || outcomeOf(b.id)?.unconfirmed)).pop();
  const next = live.find((b) => ["booked", "confirmed"].includes(b.status) && Date.parse(b.ends_at || b.starts_at) >= now);
  const last = [...live].reverse().find((b) => Date.parse(b.starts_at) < now);
  const focus = toMark || next || last;
  const timeline = useMemo(() => (data ? buildTimeline(data, fmtDayTime, methodLabel, cyc?.committed || null) : []), [data, cyc?.committed]);

  useEffect(() => { // apply ?do= once, then drop it so a refresh does not re-open the sheet
    if (!doAct || !data || applied.current) return;
    applied.current = true;
    if (doAct === "brief") setBrief(true);
    if (doAct === "mark" || doAct === "proof") window.setTimeout(() => document.getElementById("mark")?.scrollIntoView({ block: "center" }), 50);
    const next = new URLSearchParams(params); next.delete("do"); setParams(next, { replace: true });
  }, [doAct, data, params, setParams]);

  if (isLoading) return <><section className="card sk-card" style={{ height: 180 }} /><section className="card sk-card" style={{ height: 220 }} /></>;
  if (!l) return <section className="card"><h2>We couldn't find that lead</h2><p className="muted">It may belong to an earlier cycle or no longer be in your list.</p><Link className="btn ghost" to="/broker/leads">Back to my leads</Link></section>;
  const fo = focus ? outcomeOf(focus.id) : undefined;
  return (
    <>
      <section className="card hero" aria-labelledby="lr-h">
        <h2 id="lr-h" className="who-big" style={{ marginBottom: 4 }}>{fullName(l)}</h2>
        <div className="chips-row">
          {l.age_band && <span className="pill info">Age {AGE_LABEL[l.age_band]}</span>}
          {l.budget_band && <span className="pill info">Budget {BUDGET_LABEL[l.budget_band]}</span>}
          {l.language && <span className="pill info">{l.language}</span>}
          {(focus?.method || l.method_pref) && <span className="pill info">{methodLabel(focus?.method || l.method_pref)}</span>}
        </div>
        <p className="small" style={{ margin: "8px 0 10px" }}>Age and budget are what they told us (self-declared).</p>
        {focus && (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 15 }}>{focus === next ? "Next meeting" : "Meeting"}: <b>{fmtDayTime(focus.starts_at)}</b>{fo ? <> · <span className={`st${fo.outcome === "attended" ? " ok" : " w"}`}>{fo.unconfirmed ? "Counted as met (not confirmed)" : markLabel(fo.outcome)}</span></> : null}</p>
            {focus === next && <JoinCall b={focus} l={l} />}
            {focus === next && <div style={{ marginTop: 8 }}><button className="btn ghost" type="button" onClick={() => setBrief(true)}>Brief</button></div>}
          </>
        )}
      </section>

      {toMark && (
        <section className="card" id="mark" aria-labelledby="mk-h">
          <h3 id="mk-h">What happened?</h3>
          <MarkButtons b={toMark} l={l} existing={outcomeOf(toMark.id)} autoProof={doAct === "proof"} />
        </section>
      )}

      <section className="card" aria-labelledby="tl-h">
        <h3 id="tl-h">History</h3>
        <ol className="timeline">
          {timeline.map((e, i) => (
            <li key={i} className={`${e.strong ? "strong" : ""}${e.tone ? ` t-${e.tone}` : ""}`}><time dateTime={e.at}>{fmtDayTime(e.at)}</time><span>{e.text}</span></li>
          ))}
        </ol>
        {!timeline.length && <p className="muted">Nothing yet.</p>}
      </section>
      <button className="btn ghost" type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav("/broker/leads"))}>Back</button>
      <Sheet open={brief} onClose={() => setBrief(false)} title="Pre-call brief">
        {focus && <><Brief b={focus} l={l} /><div style={{ height: 10 }} /><JoinCall b={focus} l={l} /></>}
      </Sheet>
    </>
  );
}

export default function LeadRecord() {
  return <PortalShell title="Lead" back={{ to: "/broker/leads", label: "My leads" }}><Body /></PortalShell>;
}
