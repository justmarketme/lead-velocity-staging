/**
 * 07 My leads (portal/spec/07-my-leads.md), reworked in ux-sprint-1 (R5, R8, R9, R11): cards, not tables, with
 * filters This cycle · Upcoming · Needs you. Tapping a card opens the lead record (/broker/leads/:id).
 * Reads (own rows by RLS): v_cycle_progress, bookings (view), leads, outcomes, replacements — via src/lib/smcPortal.ts.
 * Writes: outcomes.outcome only (attended / no_show / unreachable / rescheduled), agreement clause 8.4. Full names only
 * inside the portal (portal rule 6); health detail never (2.1.7).
 * Deep link: /broker/leads?lead=<id>[&do=brief|mark|proof] (WhatsApp, I-55c) opens that lead's record.
 */
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import CycleCard from "./CycleCard";
import { MarkButtons, useNow } from "./MeetingParts";
import { AGE_LABEL, BUDGET_LABEL, CLIPS_BASE, fmtDay, fmtTime, methodLabel } from "@/lib/smc";
import { markLabel, replacementKindOf } from "@/lib/smcRules";
import { fullName, groupMeetings, shortName, useCycle, useMeetings } from "@/lib/smcPortal";
import type { SmcBooking } from "@/integrations/supabase/smc-types";

type Filter = "cycle" | "upcoming" | "needs";
const SCROLL_KEY = "smc.leads.scroll";
const REP_STATUS: Record<string, string> = { due: "Being checked", disputed: "Being checked", approved: "Approved (goodwill)", fulfilled: "Replacement booked", rejected: "Declined: counts as delivered" };

function Body() {
  const { broker } = usePortal();
  const now = useNow(30_000);
  const { data, isLoading, error } = useMeetings(broker.id);
  const { data: cyc } = useCycle(broker.id);
  const g = groupMeetings(data, now);
  const [filter, setFilter] = useState<Filter>(() => (g.toMark.length ? "needs" : "cycle"));
  const [flash, setFlash] = useState<string | null>(null);
  const leads = data?.leads || {};
  const outcomes = data?.outcomes || {};

  // Back from a lead record returns to the same place (acceptance S5.1).
  useEffect(() => {
    if (isLoading) return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (y) window.scrollTo(0, y);
    const save = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    return save;
  }, [isLoading]);

  const cycleStart = cyc?.prog?.starts_at ? Date.parse(cyc.prog.starts_at) : now - 30 * 86400e3;
  const list: SmcBooking[] = filter === "needs" ? g.toMark
    : filter === "upcoming" ? g.upcoming
    : (data?.bookings || []).filter((b) => Date.parse(b.starts_at) >= cycleStart).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const reps = (data?.reps || []).filter((r) => replacementKindOf(r) || r.proof_path);

  const status = (b: SmcBooking) => {
    const o = outcomes[b.id];
    if (o?.unconfirmed) return { t: "Counted as met: confirm?", c: "w" };
    if (o) return { t: markLabel(o.outcome), c: o.outcome === "attended" ? "ok" : "w" };
    if (Date.parse(b.starts_at) <= now) return { t: "To mark", c: "w" };
    return { t: b.status === "confirmed" || b.confirmed_at ? "Confirmed" : "Booked", c: b.confirmed_at ? "ok" : "" };
  };

  return (
    <>
      <CycleCard />
      {error && <p className="err" role="alert">Couldn't load your leads. Refresh the page to try again.</p>}
      <div className="seg3" role="tablist" aria-label="Show">
        {([["cycle", "This cycle"], ["upcoming", "Upcoming"], ["needs", `Needs you${g.needsCount ? ` (${g.needsCount})` : ""}`]] as [Filter, string][]).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t}</button>
        ))}
      </div>
      {flash && <div className="next-slot" role="status"><span aria-hidden="true">✓</span><span>{flash}</span></div>}
      {isLoading ? <section className="card sk-card" style={{ height: 160 }} /> : (
        <section className="lead-list" aria-label="Leads">
          {!list.length && <p className="muted card">{filter === "needs" ? "You're all caught up." : filter === "upcoming" ? "Nothing booked yet. We'll WhatsApp you the moment someone books." : "Your first lead will land here."}</p>}
          {list.map((b) => {
            const l = leads[b.lead_id]; const st = status(b);
            return (
              <article key={b.id} className="lead-card" data-lead-id={b.lead_id}>
                <Link to={`/broker/leads/${b.lead_id}`} className="lc-main">
                  <span className="lc-when">{fmtDay(b.starts_at)} {fmtTime(b.starts_at)}</span>
                  <b className="lc-name">{fullName(l)}</b>
                  <span className="small">{methodLabel(b.method)}{l?.language ? ` · ${l.language}` : ""}{l?.age_band ? ` · ${AGE_LABEL[l.age_band]}` : ""}{l?.budget_band ? ` · ${BUDGET_LABEL[l.budget_band]}` : ""}</span>
                  <span className={`st${st.c ? ` ${st.c}` : ""}`}>{st.t}</span>
                </Link>
                {filter === "needs" && <MarkButtons b={b} l={l} existing={outcomes[b.id]} onLogged={setFlash} />}
              </article>
            );
          })}
        </section>
      )}

      <section className="card" id="replacements">
        <h3>Replacements</h3>
        <p className="muted" style={{ margin: "4px 0 6px" }}>Replacements are goodwill, not a right. You can ask after a no-show or a lead you couldn't reach, up to {cyc?.weeklyMax ?? 3} requests a week in total. Wait 10 minutes, then send a screenshot or photo within 30 minutes of the start time. Late or no proof: the lead counts as delivered. <Link to="/broker/help#replacements">Read more</Link></p>
        <p className="small">Requests this week: <b>{cyc?.requestsThisWeek ?? 0} of {cyc?.weeklyMax ?? 3}</b> (no-shows and leads you couldn't reach, together; resets Monday)</p>
        {reps.map((r) => <div key={r.id} className="need-row"><span>{shortName(leads[r.lead_id])} · {replacementKindOf(r) === "unreachable" ? "couldn't reach them" : "no-show"} · {fmtDay(r.missed_start_at || r.claimed_at)}</span><span className={`st${r.status === "approved" || r.status === "fulfilled" ? " ok" : ""}`}>{REP_STATUS[r.status] || r.status}</span></div>)}
      </section>
      <StepClip title="marking meetings" length="0:35" file={`${CLIPS_BASE}/outcomes.mp4`} />
    </>
  );
}

export default function Leads() {
  const [params] = useSearchParams();
  const lead = params.get("lead");
  if (lead) return <Navigate to={`/broker/leads/${encodeURIComponent(lead)}${params.get("do") ? `?do=${encodeURIComponent(params.get("do") || "")}` : ""}`} replace />;
  return <PortalShell title="My leads"><Body /></PortalShell>;
}
