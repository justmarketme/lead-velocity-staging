/**
 * 08 Reports (portal/spec/08-reports.md; prototype reports.html, templatised from docs/design/broker-weekly-report.html).
 * One `reports` row (view over report_history, INV-T21) feeds WhatsApp, email and this page: payload_json (broker_report/1,
 * automation/W14-broker.md) is the source of the weekly numbers. Opens → smc_mark_report_opened();
 * one-ask → smc_report_ask_done() + deep link.
 * ux-sprint-1 (agreement clause 8.4, feedback firewall): no ratings, no outcome mix, no ROI / close rate / policies.
 * Section 2 is the shared CycleCard; section 4 is attendance and contactability, counted from the broker's own
 * four-way marks (outcomes.outcome) until W14 carries them in the payload.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import CycleCard from "./CycleCard";
import { CLIPS_BASE, fmtDay, fmtPct, fmtTime, methodLabel, smcDb } from "@/lib/smc";
import { MARKS, markLabel, weekStartSast, type MarkKind } from "@/lib/smcRules";
import { endOf, useMeetings } from "@/lib/smcPortal";
import type { SmcFig, SmcReport } from "@/integrations/supabase/smc-types";

const ASK_ROUTE: Record<string, string> = {
  mark_outcomes: "/broker/today#needs", reconnect_calendar: "/broker/calendar", check_hours: "/broker/calendar#hours",
  record_intro: "/broker/intro-media", rerecord_intro: "/broker/intro-media", approve_card: "/broker/intro-card",
  call_not_reached: "/broker/today#needs", not_reached: "/broker/today#needs", open_capacity: "/broker/calendar#hours",
  sign_agreement: "/broker/agreement", renew: "/broker/agreement#billing",
};
/** Asks the W14 SQL can still emit but the portal never shows: they collect outcome data (agreement clause 8.4). */
const RETIRED_ASKS = new Set(["add_close_rate", "followup_due"]);
const light = (l?: string) => (l === "green" ? "tl-g" : l === "amber" ? "tl-a" : l === "red" ? "tl-r" : "");
/** Copy rule: never "no contract" in broker-facing words; the agreed phrase is "no lock-in". */
const clean = (s?: string) => (s || "").replace(/no contract\.?/gi, "No lock-in.");
const tg = (f?: SmcFig, asPct = false) => {
  if (!f) return "";
  const fmt = (v: number | null | undefined) => (asPct ? fmtPct(v ?? null) : v ?? "n/a");
  return [f.target !== null && f.target !== undefined ? `target ${fmt(f.target)}` : null, f.last !== null && f.last !== undefined ? `last week ${fmt(f.last)}` : null].filter(Boolean).join(" · ");
};
const MARKED_IN_24H_TARGET = 0.9; // optimisation/slos.json broker faculty: ≥ 90% of meetings marked

/** Attendance and contactability, this Calendar Week vs last (clause 8.4: the only feedback we take). */
function Attendance({ showTarget }: { showTarget?: number | null }) {
  const { broker } = usePortal();
  const { data } = useMeetings(broker.id);
  const rows = useMemo(() => {
    const wk = weekStartSast(Date.now()), prev = wk - 7 * 86400e3;
    const empty = () => ({ attended: 0, no_show: 0, unreachable: 0, rescheduled: 0, marked: 0, in24: 0, total: 0 });
    const cur = empty(), last = empty();
    for (const b of data?.bookings || []) {
      const t = Date.parse(b.starts_at);
      if (endOf(b) > Date.now()) continue;
      const bucket = t >= wk ? cur : t >= prev ? last : null;
      if (!bucket) continue;
      bucket.total++;
      const o = data?.outcomes[b.id];
      if (!o) continue;
      if (o.outcome in bucket) bucket[o.outcome as MarkKind]++;
      if (!o.auto_marked) { bucket.marked++; if (Date.parse(o.marked_at) - endOf(b) <= 24 * 3600e3) bucket.in24++; }
    }
    return { cur, last };
  }, [data]);
  const show = (x: typeof rows.cur) => (x.attended + x.no_show ? x.attended / (x.attended + x.no_show) : null);
  const in24 = (x: typeof rows.cur) => (x.total ? x.in24 / x.total : null);
  return (
    <section className="card" id="s4">
      <h3>4 · Attendance (this week · last week)</h3>
      <div className="kpis">
        {MARKS.map((m) => <div key={m.kind} className="kpi"><b>{rows.cur[m.kind]}</b><span>{m.done.toLowerCase()}</span><div className="tg">last week {rows.last[m.kind]}</div></div>)}
      </div>
      <p className="small" style={{ margin: "8px 0 0" }}>Show rate {fmtPct(show(rows.cur))}{showTarget ? ` · target ${fmtPct(showTarget)}` : ""} · last week {fmtPct(show(rows.last))}. Marked within 24 hours: {fmtPct(in24(rows.cur))} · target {fmtPct(MARKED_IN_24H_TARGET)} · last week {fmtPct(in24(rows.last))}.</p>
      <p className="small" style={{ margin: "4px 0 0" }}>You only tell us whether you met them or could reach them. We never ask what was discussed or decided.</p>
    </section>
  );
}

function Body() {
  const { broker } = usePortal();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [reports, setReports] = useState<SmcReport[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await smcDb.from("reports").select("*").eq("broker_id", broker.id).in("status", ["sent", "generated", "partial"]).order("week", { ascending: false }).limit(26);
      setReports((data as SmcReport[]) || []);
      setLoaded(true);
    })();
  }, [broker.id]);

  // WhatsApp / email buttons carry the week key (r/rp_2026w41, ask/rp_2026w41); the portal id (uuid) still works too.
  const wk = (params.get("wk") || "").replace(/^rp_/, "");
  const rep = useMemo(() => reports.find((r) => r.id === params.get("id")) || (wk && reports.find((r) => String(r.payload_json?.week || "").toLowerCase().replace("-", "") === wk)) || reports[0] || null, [reports, params, wk]);
  // "Do it now" (ask/<key>) lands on the exact screen for the ask.
  useEffect(() => { const c = rep?.payload_json?.s7_ask?.code; if (params.get("ask") === "1" && c && !rep?.ask_done_at) nav(ASK_ROUTE[c] || "/broker/today", { replace: true }); }, [rep, params, nav]);
  useEffect(() => { if (rep && !rep.opened_portal_at) void smcDb.rpc("smc_mark_report_opened", { p_report_id: rep.id }); }, [rep]);

  async function doAsk() {
    if (!rep?.payload_json?.s7_ask) return;
    const code = rep.payload_json.s7_ask.code;
    await smcDb.rpc("smc_report_ask_done", { p_report_id: rep.id });
    nav(ASK_ROUTE[code] || "/broker/today");
  }

  if (!loaded) return <><CycleCard /><section className="card sk-card" style={{ height: 160 }} /></>;
  if (!rep || !rep.payload_json) return <><CycleCard /><Attendance /><section className="card"><h2>Weekly report</h2><p className="muted">Your first report arrives on Monday at 07:00.</p></section></>;
  const p = rep.payload_json;
  const s2 = p.s2_progress, s3 = p.s3_meetings, s4 = p.s4_quality;

  return (
    <>
      <div className="one" id="s1">{p.s1_one_line}
        <small>{p.week_of_cycle && p.weeks_in_cycle ? `Week ${p.week_of_cycle} of ${p.weeks_in_cycle} · ` : ""}{p.cycle ? <a href="#s8" style={{ color: "inherit" }}>cycle ends {fmtDay(p.cycle.ends + "T12:00:00Z")}, renewal offer {fmtDay(p.cycle.renewal_offer_on + "T12:00:00Z")}, {p.cycle.tier}</a> : null}</small>
      </div>

      <div id="s2"><CycleCard /></div>
      {s2 && (
        <section className="card">
          <h3>2 · This week (value · target · last week)</h3>
          <div className="kpis">
            <div className="kpi"><b>{s2.booked.v}</b><span>booked</span><div className="tg">{s2.booked.rate !== undefined ? `${fmtPct(Number(s2.booked.rate))} of delivered · ` : ""}{tg(s2.booked, true)}</div></div>
            <div className="kpi"><b>{s2.attended.v}</b><span>met</span><div className="tg">show rate <i className={light(s2.show_rate.light)}>{fmtPct(s2.show_rate.v)}</i> · {tg(s2.show_rate, true)}</div></div>
          </div>
          <p className="small" style={{ margin: "8px 0 0" }}>Cycle extension: {p.cycle?.extension?.active ? `extended to ${fmtDay(p.cycle.extension.until + "T12:00:00Z")} to deliver your committed leads` : "none needed"}. Days left: {s2.days_left}.</p>
        </section>
      )}

      {s3 && (
        <section className="card" id="s3">
          <h3>3 · Your meetings</h3>
          <ul className="plain-list">
            {s3.last_week.map((m, i) => (
              <li key={i}><span>{m.full_name || `${m.first_name} ${m.initial}.`} · {fmtDay(m.when)} {fmtTime(m.when)} · {methodLabel(m.method)}</span>
                {m.unconfirmed || !m.outcome ? <Link className="tap" to="/broker/today#needs">Mark now</Link> : <span className={`st${m.outcome === "attended" ? " ok" : " w"}`}>{markLabel(m.outcome) || m.outcome}</span>}</li>
            ))}
          </ul>
          <p className="small">"Mark now" means we counted it as met after 24 hours. Tap to confirm what really happened.</p>
          <div className="two" style={{ marginTop: 12 }}>
            <div><b style={{ fontSize: 13 }}>This week: {s3.next_week.length} booked call{s3.next_week.length === 1 ? "" : "s"}</b>
              <ul className="plain-list">{s3.next_week.map((m, i) => <li key={i}><span>{fmtDay(m.when)} {fmtTime(m.when)} · {m.first_name} {m.initial}.</span><span>{methodLabel(m.method)}</span></li>)}</ul></div>
            <div><b style={{ fontSize: 13 }}>Your to-dos</b>
              <ul className="plain-list">
                {s3.todos.unmarked.length > 0 && <li><span>Mark {s3.todos.unmarked.length} meeting{s3.todos.unmarked.length === 1 ? "" : "s"} ({s3.todos.unmarked.map((u) => u.first_name).join(", ")})</span><Link className="tap" to="/broker/today#needs">Do</Link></li>}
                {s3.todos.not_reached.map((f, i) => <li key={`n${i}`}><span>{f.first_name} {f.initial}. says you have not reached them yet</span><Link className="tap" to="/broker/today#needs">Call</Link></li>)}
              </ul>
              {!s3.todos.not_reached.length && <p className="small" style={{ margin: "6px 0 0" }}>Anyone who said you did not reach them would show here. None this week.</p>}</div>
          </div>
        </section>
      )}

      <div className="two">
        <Attendance showTarget={s2?.show_rate.target ?? null} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(s4?.themes?.length || s4?.lead_pulse) ? (
            <section className="card" id="s4b"><h3>What leads asked before the call</h3>
              {s4?.lead_pulse && <p className="small" style={{ margin: "6px 0" }}>Leads who said the call was worth their time: {s4.lead_pulse.shown ? `${s4.lead_pulse.up} of ${s4.lead_pulse.n} (answers so far this cycle)` : "fewer than 5 answers yet"}</p>}
              {s4?.themes && s4.themes.length > 0 && <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>{s4.themes.slice(0, 3).map((t, i) => <li key={i}>"{t.text}" ({t.count} of {t.of})</li>)}</ol>}
            </section>
          ) : null}
          {p.s5_notice && p.s5_notice.length > 0 && (
            <section className="card" id="s5"><h3>5 · What you will notice this week</h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>{p.s5_notice.map((n, i) => <li key={i}>{n}</li>)}</ul></section>
          )}
        </div>
      </div>

      {p.s7_ask && !RETIRED_ASKS.has(p.s7_ask.code) && ASK_ROUTE[p.s7_ask.code] && (
        <section className="ask" id="s7">
          <div><b>One thing to do this week</b><br /><span style={{ fontSize: 14 }}>{p.s7_ask.text}</span></div>
          {rep.ask_done_at ? <span className="go">Done ✓</span> : <button className="go" type="button" onClick={doAsk} style={{ border: 0, cursor: "pointer", font: "inherit", fontWeight: 800 }}>{p.s7_ask.button}</button>}
        </section>
      )}

      {p.s8_cycle && (
        <section className="card" id="s8"><h3>Your cycle</h3><p style={{ margin: "4px 0 0", fontSize: 14 }}>{clean(p.s8_cycle.line)} You pick again each cycle.</p></section>
      )}

      <div className="hist no-print">
        <span>History: {reports.map((r, i) => (
          <span key={r.id}>{i ? " · " : ""}{r.id === rep.id ? <b>{r.payload_json?.week || r.week}</b> : <button type="button" className="tap g" onClick={() => setParams({ id: r.id })}>{r.payload_json?.week || r.week}{r.edition && r.edition !== "weekly" ? ` (${r.edition.replace("_", " ")})` : ""}</button>}</span>
        ))}</span>
        {rep.pdf_url && <><span>·</span><a href={rep.pdf_url} target="_blank" rel="noreferrer">Download PDF</a></>}
        <span>·</span>
        <span>{rep.sent_wa_at ? `Sent on WhatsApp ${fmtTime(rep.sent_wa_at)}` : ""}{rep.sent_email_at ? ` · email ${fmtTime(rep.sent_email_at)}` : ""}{rep.opened_portal_at ? ` · opened here ${fmtTime(rep.opened_portal_at)}` : ""}</span>
      </div>
      <StepClip title="your weekly report" length="0:30" file={`${CLIPS_BASE}/reports.mp4`} />
    </>
  );
}

export default function Reports() {
  return <PortalShell wide title={() => "Reports"}><Body /></PortalShell>;
}
