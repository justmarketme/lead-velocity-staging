/**
 * 07 My leads (portal/spec/07-my-leads.md; prototype leads.html). Extends BrokerLeads.tsx (INV-P03) for SMC brokers.
 * Reads (own rows by RLS): v_cycle_progress, bookings (view), leads, outcomes, replacements.
 * Writes: outcomes(outcome → disposition (4.12a / NH-19 labels) → quality 1-5) on own bookings ("smc broker mark own" / "correct own"),
 *         then smc_portal_event('outcome.marked') → W12/W13/W29. Full names only inside the portal (portal rule 6); health detail never (2.1.7).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { AGE_LABEL, BUDGET_LABEL, CLIPS_BASE, DISPOSITIONS, dispositionLabel, errText, fmtDay, fmtTime, methodLabel, portalEvent, saDate, smcDb } from "@/lib/smc";
import type { SmcBooking, SmcCycleProgress, SmcDispositionCode, SmcLead, SmcOutcome, SmcOutcomeKind, SmcReplacement } from "@/integrations/supabase/smc-types";

const CALL_METHODS = new Set(["phone", "whatsapp_call"]);
const fullName = (l?: SmcLead) => [l?.first_name, l?.last_name].filter(Boolean).join(" ") || "Lead";
const endOf = (b: SmcBooking) => new Date(b.ends_at || new Date(new Date(b.starts_at).getTime() + 30 * 60e3).toISOString()).getTime();

function Brief({ b, l }: { b: SmcBooking; l?: SmcLead }) {
  return (
    <div className="brief">
      <b>Pre-call brief: {l?.first_name} {l?.last_name?.[0] ? `${l.last_name[0]}.` : ""}, {fmtTime(b.starts_at)} on {methodLabel(b.method)}</b>
      <ul>
        {l?.bond !== null && l?.bond !== undefined && <li>{l.bond ? "Has a bond." : "No bond."}{l?.dependants ? " Has people who depend on them." : ""} (their answers on the quiz)</li>}
        <li>Prefers: {methodLabel(l?.method_pref || b.method)}{l?.best_time ? `. Best time: ${l.best_time}` : ""}{l?.language ? `. Language: ${l.language}` : ""}.</li>
        {CALL_METHODS.has(b.method) && (b.call_number || l?.call_number) && <li>Call them on the number they confirmed: {b.call_number || l?.call_number}</li>}
        {l?.health_flag && <li>Has a health question for you. (We never show the detail.)</li>}
      </ul>
      {b.join_url && !CALL_METHODS.has(b.method) && <p className="small" style={{ margin: "8px 0 0" }}>The {methodLabel(b.method)} join link is in your calendar invite. <a href={b.join_url} target="_blank" rel="noreferrer">Join now</a></p>}
      {b.graph_event_id && <p className="small" style={{ margin: "4px 0 0" }}>Outlook event {b.graph_event_id.slice(-10)}</p>}
    </div>
  );
}

function MarkOne({ b, l, existing, onDone }: { b: SmcBooking; l?: SmcLead; existing?: SmcOutcome; onDone: (msg: string) => void }) {
  const { broker, userId } = usePortal();
  const [outcome, setOutcome] = useState<SmcOutcomeKind | null>(null);
  const [dispo, setDispo] = useState<SmcDispositionCode | null>(null);
  const [q, setQ] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = outcome && (outcome !== "attended" || (dispo && q));

  async function save() {
    if (!outcome) return;
    setBusy(true); setErr(null);
    const row = {
      outcome, disposition_code: outcome === "attended" ? dispo : null, quality_score: outcome === "attended" ? q : null,
      marked_by: userId, marked_via: "portal", marked_at: new Date().toISOString(), unconfirmed: false, auto_marked: false,
    };
    const res = existing
      ? await smcDb.from("outcomes").update(row).eq("id", existing.id)
      : await smcDb.from("outcomes").insert({ ...row, booking_id: b.id, lead_id: b.lead_id, broker_id: broker.id, cycle_id: b.cycle_id, brand_id: b.brand_id });
    if (res.error) { setErr(errText(res.error)); setBusy(false); return; }
    await portalEvent("outcome.marked", null, { booking_id: b.id, outcome, disposition_code: row.disposition_code, quality_score: row.quality_score });
    setBusy(false);
    onDone(outcome === "no_show" ? `We'll offer ${l?.first_name || "them"} a new time. If they don't rebook within 48 hours it can become a replacement.` : "Logged.");
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 10 }}>{fullName(l)} · {fmtDay(b.starts_at)} {fmtTime(b.starts_at)} · {methodLabel(b.method)}{existing?.unconfirmed ? " · Unconfirmed" : ""}</h3>
      <p className="small" style={{ margin: "0 0 6px" }}>Step 1: what happened?</p>
      <div className="seg">
        {([["attended", "Attended"], ["no_show", "No-show"], ["rescheduled", "Rescheduled"]] as [SmcOutcomeKind, string][]).map(([k, t]) => (
          <button key={k} type="button" className={outcome === k ? "on" : ""} onClick={() => setOutcome(k)}>{t}</button>
        ))}
      </div>
      {outcome === "attended" && (
        <>
          <p className="small" style={{ margin: "12px 0 6px" }}>Step 2: how was this lead?</p>
          <div className="dispo">
            {DISPOSITIONS.map((d) => <button key={d.code} type="button" className={`${dispo === d.code ? "on" : ""}${d.replacementEligible ? " rep" : ""}`} onClick={() => setDispo(d.code)}>{d.label}</button>)}
          </div>
          <p className="small" style={{ margin: "12px 0 6px" }}>Step 3: quality, 1 (poor) to 5 (great)</p>
          <div className="q5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={q === n ? "on" : ""} onClick={() => setQ(n)}>{n}</button>)}</div>
          <p className="small" style={{ margin: "12px 0 0" }}>Anything we should know? Send a voice note in reply to the WhatsApp outcome message. It is never sent to the lead.</p>
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {outcome && <><div style={{ height: 10 }} /><button className="btn" type="button" disabled={!ready || busy} onClick={save}>Save</button></>}
    </div>
  );
}

function Body() {
  const { broker } = usePortal();
  const [prog, setProg] = useState<SmcCycleProgress | null>(null);
  const [bookings, setBookings] = useState<SmcBooking[]>([]);
  const [leads, setLeads] = useState<Record<string, SmcLead>>({});
  const [outcomes, setOutcomes] = useState<Record<string, SmcOutcome>>({});
  const [reps, setReps] = useState<SmcReplacement[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: p } = await smcDb.from("v_cycle_progress").select("*").eq("broker_id", broker.id).in("status", ["active", "extended"]).order("cycle_no", { ascending: false }).limit(1);
    const cp = ((p as SmcCycleProgress[]) || [])[0] || null;
    setProg(cp);
    const since = cp?.starts_at || new Date(Date.now() - 30 * 86400e3).toISOString();
    const until = new Date(Date.now() + 8 * 86400e3).toISOString();
    const { data: bk, error: be } = await smcDb.from("bookings").select("*").eq("broker_id", broker.id).gte("starts_at", since).lte("starts_at", until).neq("status", "cancelled").order("starts_at");
    if (be) setErr(errText(be));
    const bs = (bk as SmcBooking[]) || [];
    setBookings(bs);
    const leadIds = [...new Set(bs.map((b) => b.lead_id))];
    if (leadIds.length) {
      const [{ data: ls }, { data: os }] = await Promise.all([
        smcDb.from("leads").select("id, first_name, last_name, language, age_band, budget_band, bond, dependants, method_pref, best_time, call_number, health_flag").in("id", leadIds),
        smcDb.from("outcomes").select("*").eq("broker_id", broker.id).in("booking_id", bs.map((b) => b.id)),
      ]);
      setLeads(Object.fromEntries(((ls as SmcLead[]) || []).map((l) => [l.id, l])));
      setOutcomes(Object.fromEntries(((os as SmcOutcome[]) || []).map((o) => [o.booking_id, o])));
    }
    if (cp) {
      const { data: rp } = await smcDb.from("replacements").select("*").eq("broker_id", broker.id).eq("cycle_id", cp.cycle_id).order("claimed_at");
      setReps((rp as SmcReplacement[]) || []);
    }
  }, [broker.id]);
  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  const today = saDate();
  const groups = useMemo(() => {
    const isToday = (b: SmcBooking) => saDate(new Date(b.starts_at)) === today;
    const live = (b: SmcBooking) => ["booked", "confirmed"].includes(b.status);
    const toMark = bookings.filter((b) => endOf(b) < now && ["booked", "confirmed", "attended", "no_show"].includes(b.status) && (!outcomes[b.id] || outcomes[b.id].unconfirmed))
      .sort((a, b) => Number(!!outcomes[b.id]?.unconfirmed) - Number(!!outcomes[a.id]?.unconfirmed));
    return {
      today: bookings.filter((b) => isToday(b) && live(b) && endOf(b) >= now),
      toMark,
      coming: bookings.filter((b) => !isToday(b) && new Date(b.starts_at).getTime() > now && live(b)),
      past: bookings.filter((b) => endOf(b) < now && outcomes[b.id] && !outcomes[b.id].unconfirmed).reverse(),
      notReached: Object.values(outcomes).filter((o) => o.lead_reach_check === "no"),
    };
  }, [bookings, outcomes, now, today]);

  const delivered = prog?.verified ?? 0;
  const showRate = prog && prog.attended + groups.past.filter((b) => outcomes[b.id]?.outcome === "no_show").length > 0
    ? prog.attended / (prog.attended + groups.past.filter((b) => outcomes[b.id]?.outcome === "no_show").length) : null;
  const dayOf = prog?.starts_at ? Math.max(1, Math.ceil((now - new Date(prog.starts_at).getTime()) / 86400e3)) : null;
  const repLeadIds = new Set(reps.map((r) => r.lead_id));

  return (
    <>
      <section className="card">
        <h3>Your cycle</h3>
        {prog ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span><b>{delivered}</b> of {prog.committed} delivered</span><span className="muted">{dayOf ? `day ${dayOf} · ` : ""}{prog.days_left} days left</span></div>
            <div className="prog"><i style={{ width: `${Math.min(100, Math.round((delivered / Math.max(1, prog.committed)) * 100))}%` }} /></div>
            <div className="small">{prog.booked} booked · {prog.attended} attended{showRate !== null ? <> (<i className={showRate >= 0.65 ? "tl-g" : showRate >= 0.5 ? "tl-a" : "tl-r"}>{Math.round(showRate * 100)}%</i>, target 65%)</> : ""} · replacements <i className={prog.replacements_used >= prog.replacement_cap ? "tl-r" : prog.replacements_used >= prog.replacement_cap / 2 ? "tl-a" : "tl-g"}>{prog.replacements_used} of {prog.replacement_cap}</i></div>
          </>
        ) : <p className="muted">Your first lead will land here. We'll WhatsApp you the moment someone books.</p>}
      </section>
      {err && <p className="err">{err}</p>}

      <section className="card">
        <h2>Today: {groups.today.length} meeting{groups.today.length === 1 ? "" : "s"}</h2>
        {!groups.today.length && <p className="muted">No meetings today.{groups.coming[0] ? ` Your next one is ${fmtDay(groups.coming[0].starts_at)} ${fmtTime(groups.coming[0].starts_at)} with ${leads[groups.coming[0].lead_id]?.first_name || "a lead"} ${leads[groups.coming[0].lead_id]?.last_name?.[0] || ""}.` : ""}</p>}
        <table className="tbl"><tbody>
          {groups.today.map((b) => {
            const l = leads[b.lead_id];
            return (
              <tr key={b.id}><td>
                <b>{fmtTime(b.starts_at)}</b><br />{fullName(l)}<br />
                <span className="small">{methodLabel(b.method)}{l?.language ? ` · ${l.language}` : ""}{l?.age_band ? ` · ${AGE_LABEL[l.age_band]}` : ""}{l?.budget_band ? ` · ${BUDGET_LABEL[l.budget_band]}` : ""}</span>
                {open === b.id && <Brief b={b} l={l} />}
              </td><td style={{ textAlign: "right" }}><button className="tap g" type="button" onClick={() => setOpen(open === b.id ? null : b.id)}>Brief</button></td></tr>
            );
          })}
        </tbody></table>
      </section>

      <section className="card" id="mark">
        <h2>{groups.toMark.length ? `${groups.toMark.length} meeting${groups.toMark.length === 1 ? "" : "s"} to mark` : "Nothing to mark"}</h2>
        <p className="muted">Takes about 20 seconds each. Same buttons you get on WhatsApp.</p>
        {flash && <div className="next-slot" role="status"><span style={{ fontSize: 24 }}>✓</span><div><b>{flash}</b>{groups.toMark.length ? `${groups.toMark.length} more to mark.` : ""}</div></div>}
        {groups.toMark.map((b) => <MarkOne key={b.id} b={b} l={leads[b.lead_id]} existing={outcomes[b.id]} onDone={(m) => { setFlash(m); void load(); }} />)}
        <p className="hint">A no-show, "Not a fit – criteria" or "Unreachable/wrong number" can become a replacement after a 48-hour check. Not marked within 24 hours? We record it as attended and flag it, so please mark in time.</p>
      </section>

      {groups.notReached.length > 0 && (
        <section className="card">
          <h3>Leads who said they weren't reached</h3>
          {groups.notReached.map((o) => { const l = leads[o.lead_id]; return <p key={o.id} className="alert" style={{ margin: "6px 0" }}>{l?.first_name} {l?.last_name?.[0] ? `${l.last_name[0]}.` : ""} says they haven't heard from you. Please call today.</p>; })}
        </section>
      )}

      <section className="card">
        <h3>Coming up (next 7 days)</h3>
        {!groups.coming.length && <p className="muted">Nothing booked yet.</p>}
        <table className="tbl"><tbody>
          {groups.coming.map((b) => { const l = leads[b.lead_id]; return (
            <tr key={b.id}><td>{fmtDay(b.starts_at)} {fmtTime(b.starts_at)} · {fullName(l)}{open === b.id && <Brief b={b} l={l} />}</td><td>{methodLabel(b.method)}</td>
              <td style={{ textAlign: "right" }}><button className="tap g" type="button" onClick={() => setOpen(open === b.id ? null : b.id)}>Brief</button></td></tr>); })}
        </tbody></table>
        <h3 style={{ marginTop: 12 }}>Past (this cycle)</h3>
        {!groups.past.length && <p className="muted">No marked meetings yet.</p>}
        <table className="tbl"><tbody>
          {groups.past.map((b) => { const o = outcomes[b.id]; const l = leads[b.lead_id]; return (
            <tr key={b.id}><td>{fmtDay(b.starts_at)} · {fullName(l)}{edit === b.id && <MarkOne b={b} l={l} existing={o} onDone={(m) => { setFlash(m); setEdit(null); void load(); }} />}</td>
              <td><span className={`st${o.outcome === "attended" ? " ok" : " w"}`}>{o.outcome.replace("_", "-")}</span>{o.disposition_code ? <><br /><span className="small">{dispositionLabel(o.disposition_code)}{o.quality_score ? ` · ${o.quality_score} of 5` : ""}</span></> : null}</td>
              <td style={{ textAlign: "right" }}>{!repLeadIds.has(b.lead_id) && edit !== b.id && <button className="tap g" type="button" onClick={() => setEdit(b.id)}>Change</button>}</td></tr>); })}
        </tbody></table>
      </section>

      <section className="card">
        <h3>Replacements</h3>
        <p className="muted" style={{ margin: "4px 0 6px" }}>{prog ? `${prog.replacements_used} of ${prog.replacement_cap} used this cycle. ` : ""}A no-show, a number we cannot reach, or a lead who is outside the age or budget we agreed. Never "didn't buy". <Link to="/broker/help#replacements">Read more</Link></p>
        <table className="tbl"><tbody>
          {reps.map((r) => <tr key={r.id}><td>{leads[r.lead_id]?.first_name || "Lead"} · {r.reason.replace("_", " ")}</td><td>{fmtDay(r.claimed_at)}</td><td><span className={`st${r.status === "fulfilled" || r.status === "approved" ? " ok" : ""}`}>{r.status}</span></td></tr>)}
        </tbody></table>
      </section>
      <StepClip title="marking outcomes" length="0:35" file={`${CLIPS_BASE}/outcomes.mp4`} />
    </>
  );
}

export default function Leads() {
  return <PortalShell title="My leads"><Body /></PortalShell>;
}
