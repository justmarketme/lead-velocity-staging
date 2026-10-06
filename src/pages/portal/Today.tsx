/**
 * Today (ux-sprint-1 R5; HubSpot action feed "Prep for meetings", Close Inbox, Linear Inbox). The default page for a
 * live SortMyCover broker. Top to bottom: next meeting → needs you → cycle → later. One column, no tables.
 * Deep links: /broker/today?lead=<id>&do=brief|mark|proof (WhatsApp) open the lead record with that action ready.
 */
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import PortalShell, { usePortal } from "./PortalShell";
import CycleCard from "./CycleCard";
import { Brief, JoinCall, MarkButtons, Sheet, useNow } from "./MeetingParts";
import { AGE_LABEL, BUDGET_LABEL, fmtDay, fmtTime, methodLabel, saDate } from "@/lib/smc";
import { callHref, fullName, groupMeetings, shortName, useMeetings } from "@/lib/smcPortal";
import type { SmcBooking } from "@/integrations/supabase/smc-types";

function when(b: SmcBooking, now: number) {
  const start = Date.parse(b.starts_at);
  const mins = Math.round((start - now) / 60e3);
  const day = saDate(new Date(start)) === saDate(new Date(now)) ? "Today" : saDate(new Date(start)) === saDate(new Date(now + 86400e3)) ? "Tomorrow" : fmtDay(b.starts_at);
  const rel = mins > 90 ? "" : mins > 0 ? `in ${mins} min` : mins > -10 ? `started ${-mins} min ago` : "now";
  return { label: `${day} ${fmtTime(b.starts_at)}`, rel };
}

function Body() {
  const { broker } = usePortal();
  const now = useNow(30_000);
  const { data, isLoading, error } = useMeetings(broker.id);
  const g = groupMeetings(data, now);
  const [brief, setBrief] = useState<SmcBooking | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const leads = data?.leads || {};
  const next = g.next;
  const nl = next ? leads[next.lead_id] : undefined;
  const later = g.upcoming.slice(1).filter((b) => Date.parse(b.starts_at) < now + 2 * 86400e3);
  const reconnect = broker.calendar_status === "needs_reconnect" || broker.calendar_status === "blocked_admin_consent";
  const needs = g.needsCount + g.notReached.length + (reconnect ? 1 : 0);

  if (isLoading) return <><section className="card hero sk-card" style={{ height: 210 }} /><section className="card sk-card" style={{ height: 120 }} /></>;
  return (
    <>
      {error && <p className="err" role="alert">Couldn't load your meetings. Refresh the page to try again.</p>}
      <section className="card hero" aria-labelledby="next-h">
        <h3 id="next-h">Next meeting</h3>
        {next ? (
          <>
            <p className="when"><b>{when(next, now).label}</b>{when(next, now).rel && <span className="pill info">{when(next, now).rel}</span>}</p>
            <p className="who-big">{shortName(nl)}</p>
            <p className="small" style={{ margin: "0 0 10px" }}>{fullName(nl)} · {methodLabel(next.method)}{nl?.language ? ` · ${nl.language}` : ""}{nl?.age_band ? ` · ${AGE_LABEL[nl.age_band]}` : ""}{nl?.budget_band ? ` · ${BUDGET_LABEL[nl.budget_band]}` : ""}</p>
            <JoinCall b={next} l={nl} />
            <div className="row2" style={{ marginTop: 8 }}>
              <button className="btn ghost" type="button" onClick={() => setBrief(next)}>Brief</button>
              <Link className="btn ghost" to={`/broker/leads/${next.lead_id}`}>Open lead</Link>
            </div>
          </>
        ) : <p className="muted">No meetings booked yet. We'll WhatsApp you the moment someone books.</p>}
      </section>

      <section className="card" id="needs" aria-labelledby="needs-h">
        <h3 id="needs-h">Needs you{needs ? ` (${needs})` : ""}</h3>
        {flash && <div className="next-slot" role="status"><span aria-hidden="true">✓</span><span>{flash}</span></div>}
        {!needs && <p className="muted">You're all caught up.{next ? ` Next meeting ${when(next, now).label}.` : ""}</p>}
        {reconnect && <div className="need-row"><span>Your calendar needs reconnecting, or new bookings stop.</span><Link className="tap" to="/broker/calendar">Reconnect</Link></div>}
        {g.notReached.map((o) => {
          const l = leads[o.lead_id]; const b = data?.bookings.find((x) => x.id === o.booking_id);
          const href = b ? callHref(b.method === "whatsapp_call" ? "whatsapp_call" : "phone", b.call_number || l?.call_number) : null;
          return <div key={o.id} className="need-row"><span><b>{shortName(l)}</b> says you haven't reached them. Please call today.</span>{href && <a className="tap" href={href}>Call</a>}</div>;
        })}
        {g.toMark.map((b) => {
          const l = leads[b.lead_id];
          return (
            <div key={b.id} className="mark-card" data-lead-id={b.lead_id}>
              <Link className="mc-h" to={`/broker/leads/${b.lead_id}`}><b>{shortName(l)}</b><span>{fmtDay(b.starts_at)} {fmtTime(b.starts_at)} · {methodLabel(b.method)}{data?.outcomes[b.id]?.unconfirmed ? " · counted as met: confirm?" : ""}</span></Link>
              <MarkButtons b={b} l={l} existing={data?.outcomes[b.id]} onLogged={setFlash} />
            </div>
          );
        })}
        {g.toMark.length > 0 && <p className="hint">Not marked within 24 hours? We count it as met and flag it, so please mark in time. You tell us only whether you met them or could reach them.</p>}
      </section>

      <CycleCard />

      {later.length > 0 && (
        <details className="card later">
          <summary>Later today and tomorrow ({later.length})</summary>
          {later.map((b) => { const l = leads[b.lead_id]; return (
            <Link key={b.id} className="lead-row" to={`/broker/leads/${b.lead_id}`}><b>{when(b, now).label}</b><span>{shortName(l)} · {methodLabel(b.method)}</span></Link>); })}
        </details>
      )}
      <Sheet open={!!brief} onClose={() => setBrief(null)} title="Pre-call brief">
        {brief && <><Brief b={brief} l={leads[brief.lead_id]} /><div style={{ height: 10 }} /><JoinCall b={brief} l={leads[brief.lead_id]} /></>}
      </Sheet>
    </>
  );
}

export default function Today() {
  const [params] = useSearchParams();
  const lead = params.get("lead");
  if (lead) return <Navigate to={`/broker/leads/${encodeURIComponent(lead)}${params.get("do") ? `?do=${encodeURIComponent(params.get("do") || "")}` : ""}`} replace />;
  return <PortalShell title={(b) => `Hi ${String(b.contact_person || b.adviser_name || "").split(" ")[0] || "there"}`}><Body /></PortalShell>;
}
