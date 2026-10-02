/**
 * 08 Reports (portal/spec/08-reports.md; prototype reports.html, templatised from docs/design/broker-weekly-report.html).
 * One `reports` row (view over report_history, INV-T21) feeds WhatsApp, email and this page: payload_json (broker_report/1,
 * automation/W14-broker.md) is the only source of numbers — this page computes nothing. Opens → smc_mark_report_opened();
 * one-ask → smc_report_ask_done() + deep link; ROI inputs → own brokers.close_rate / avg_commission_zar and
 * smc_report_policies_written(p_count) → own cycle's policies_written_reported (FAIS: his view only, never in any fee).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PortalShell, { StepClip, usePortal } from "./PortalShell";
import { CLIPS_BASE, DISPOSITIONS, dispositionLabel, errText, fmtDay, fmtPct, fmtTime, methodLabel, smcDb } from "@/lib/smc";
import type { SmcFig, SmcReport, SmcReportPoliciesWrittenArgs } from "@/integrations/supabase/smc-types";

const ASK_ROUTE: Record<string, string> = {
  mark_outcomes: "/broker/leads#mark", reconnect_calendar: "/broker/calendar", check_hours: "/broker/calendar#hours",
  record_intro: "/broker/intro-media", rerecord_intro: "/broker/intro-media", approve_card: "/broker/intro-card",
  call_not_reached: "/broker/leads", sign_agreement: "/broker/agreement", renew: "/broker/agreement#billing",
};
const light = (l?: string) => (l === "green" ? "tl-g" : l === "amber" ? "tl-a" : l === "red" ? "tl-r" : "");
const pctOrNum = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : v > 0 && v <= 1 ? fmtPct(v) : String(v));
/** Copy rule: never "no contract" in broker-facing words; the agreed phrase is "no lock-in". */
const clean = (s?: string) => (s || "").replace(/no contract\.?/gi, "No lock-in.");
const tg = (f?: SmcFig, asPct = false) => {
  if (!f) return "";
  const fmt = (v: number | null | undefined) => (asPct ? fmtPct(v ?? null) : v ?? "n/a");
  return [f.target !== null && f.target !== undefined ? `target ${fmt(f.target)}` : null, f.last !== null && f.last !== undefined ? `last week ${fmt(f.last)}` : null].filter(Boolean).join(" · ");
};

function Body() {
  const { broker, reload } = usePortal();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [reports, setReports] = useState<SmcReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cr, setCr] = useState(broker.close_rate !== null ? String(Math.round(Number(broker.close_rate) * 100)) : "");
  const [ac, setAc] = useState(broker.avg_commission_zar?.toString() || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await smcDb.from("reports").select("*").eq("broker_id", broker.id).in("status", ["sent", "generated", "partial"]).order("week", { ascending: false }).limit(26);
      setReports((data as SmcReport[]) || []);
      setLoaded(true);
    })();
  }, [broker.id]);

  const rep = useMemo(() => reports.find((r) => r.id === params.get("id")) || reports[0] || null, [reports, params]);
  useEffect(() => { if (rep && !rep.opened_portal_at) void smcDb.rpc("smc_mark_report_opened", { p_report_id: rep.id }); }, [rep]);

  async function doAsk() {
    if (!rep?.payload_json?.s7_ask) return;
    const code = rep.payload_json.s7_ask.code;
    await smcDb.rpc("smc_report_ask_done", { p_report_id: rep.id });
    nav(ASK_ROUTE[code] || "/broker/start");
  }
  async function saveRoi() {
    setMsg(null);
    const rate = cr.trim() === "" ? null : Number(cr) / 100;
    if (rate !== null && !(rate >= 0 && rate <= 1)) return setMsg("Close rate: 0 to 100.");
    const com = ac.trim() === "" ? null : Number(ac.replace(/[^\d.]/g, ""));
    const pwRaw = pw ?? (rep?.payload_json?.s6_roi?.policies_reported?.toString() || "");
    const count = pwRaw.trim() === "" ? null : Number(pwRaw);
    if (count !== null && !(Number.isInteger(count) && count >= 0 && count <= 1000)) return setMsg("Policies written: a whole number from 0 to 1000.");
    const { error } = await smcDb.from("brokers").update({ close_rate: rate, avg_commission_zar: com }).eq("id", broker.id);
    let e2: unknown = null;
    if (!error && count !== null && pw !== null) {
      const args: SmcReportPoliciesWrittenArgs = { p_count: count, p_cycle_id: rep?.cycle_id || null };
      e2 = (await smcDb.rpc("smc_report_policies_written", args)).error;
    }
    setMsg(error || e2 ? errText(error || e2) : "Saved. Your next report uses it. It is never used in any fee.");
    void reload();
  }

  if (!loaded) return <p className="muted">Loading…</p>;
  if (!rep || !rep.payload_json) return <section className="card"><h2>Reports</h2><p className="muted">Your first report arrives on Monday at 07:00.</p></section>;
  const p = rep.payload_json;
  const s2 = p.s2_progress, s3 = p.s3_meetings, s4 = p.s4_quality, s6 = p.s6_roi;
  const mixMax = Math.max(1, ...Object.values(s4?.mix || {}).map((n) => Number(n) || 0));

  return (
    <>
      <div className="one" id="s1">{p.s1_one_line}
        <small>{p.week_of_cycle && p.weeks_in_cycle ? `Week ${p.week_of_cycle} of ${p.weeks_in_cycle} · ` : ""}{p.cycle ? <a href="#s8" style={{ color: "inherit" }}>cycle ends {fmtDay(p.cycle.ends + "T12:00:00Z")}, renewal offer {fmtDay(p.cycle.renewal_offer_on + "T12:00:00Z")}, {p.cycle.tier}</a> : null}</small>
      </div>

      {s2 && (
        <section className="card" id="s2">
          <h3>2 · Progress (value · target · last week)</h3>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>Delivered <b>{s2.delivered.v}</b> of {s2.delivered.committed} committed</span>{p.cycle && <span className="muted">day {p.cycle.day} of {p.cycle.days_total}</span>}</div>
          <div className="prog"><i style={{ width: `${Math.min(100, Math.round(((s2.delivered.v || 0) / Math.max(1, Number(s2.delivered.committed) || 1)) * 100))}%` }} /></div>
          <div className="kpis">
            <div className="kpi"><b>{s2.delivered.v}</b><span>delivered (verified)</span><div className="tg">{tg(s2.delivered)}</div></div>
            <div className="kpi"><b>{s2.booked.v}</b><span>booked</span><div className="tg">{s2.booked.rate !== undefined ? `${fmtPct(Number(s2.booked.rate))} of delivered · ` : ""}{tg(s2.booked, true)}</div></div>
            <div className="kpi"><b>{s2.attended.v}</b><span>attended</span><div className="tg">show rate <i className={light(s2.show_rate.light)}>{fmtPct(s2.show_rate.v)}</i> · {tg(s2.show_rate, true)}</div></div>
            <div className="kpi"><b>{s2.replacements.used} of {s2.replacements.cap}</b><span>replacements used</span><div className="tg"><i className={light(s2.replacements.light)}>●</i> last week {s2.replacements.last_used ?? 0}</div></div>
          </div>
          <p className="small" style={{ margin: "8px 0 0" }}>Cycle extension: {p.cycle?.extension?.active ? `extended to ${fmtDay(p.cycle.extension.until + "T12:00:00Z")} to deliver your committed leads` : "none needed"}. Days left: {s2.days_left}.</p>
        </section>
      )}

      {s3 && (
        <section className="card" id="s3">
          <h3>3 · Your meetings</h3>
          <table className="tbl"><tbody>
            <tr><th>Last week</th><th>How</th><th>Outcome</th><th>Your rating</th></tr>
            {s3.last_week.map((m, i) => (
              <tr key={i}><td>{m.full_name || `${m.first_name} ${m.initial}.`} · {fmtDay(m.when)} {fmtTime(m.when)}</td><td>{methodLabel(m.method)}</td>
                <td><span className={`st${m.unconfirmed ? " w" : " ok"}`}>{m.unconfirmed ? "Unconfirmed" : (m.outcome || "").replace("_", "-")}</span></td>
                <td>{m.unconfirmed || !m.disposition ? <a className="tap" href="/broker/leads#mark">Mark now</a> : `${dispositionLabel(m.disposition)}${m.quality ? ` · ${m.quality} of 5` : ""}`}</td></tr>
            ))}
          </tbody></table>
          <p className="small">Unconfirmed means we counted it as attended after 24 hours. Tap to confirm what really happened.</p>
          <div className="two" style={{ marginTop: 12 }}>
            <div><b style={{ fontSize: 13 }}>This week: {s3.next_week.length} booked call{s3.next_week.length === 1 ? "" : "s"}</b>
              <table className="tbl"><tbody>{s3.next_week.map((m, i) => <tr key={i}><td>{fmtDay(m.when)} {fmtTime(m.when)} · {m.first_name} {m.initial}.</td><td>{methodLabel(m.method)}</td></tr>)}</tbody></table></div>
            <div><b style={{ fontSize: 13 }}>Your to-dos</b>
              <table className="tbl"><tbody>
                {s3.todos.unmarked.length > 0 && <tr><td>Mark {s3.todos.unmarked.length} outcome{s3.todos.unmarked.length === 1 ? "" : "s"} ({s3.todos.unmarked.map((u) => u.first_name).join(", ")})</td><td><a className="tap" href="/broker/leads#mark">Do</a></td></tr>}
                {s3.todos.followups_due.map((f, i) => <tr key={i}><td>Follow-up due {fmtDay(f.due + "T12:00:00Z")}: {f.first_name} {f.initial}. (you flagged it)</td><td /></tr>)}
                {s3.todos.not_reached.map((f, i) => <tr key={`n${i}`}><td>{f.first_name} {f.initial}. says you have not reached them yet</td><td><a className="tap" href="/broker/leads">Call</a></td></tr>)}
              </tbody></table>
              {!s3.todos.not_reached.length && <p className="small" style={{ margin: "6px 0 0" }}>Anyone who said you did not reach them would show here. None this week.</p>}</div>
          </div>
        </section>
      )}

      <div className="two">
        {s4 && (
          <section className="card" id="s4">
            <h3>4 · Quality, in your words</h3>
            <p style={{ margin: "0 0 6px", fontSize: 14 }}>Your average rating this cycle: <b>{s4.avg_rating.v ?? "n/a"}</b> of 5{tg(s4.avg_rating) ? ` · ${tg(s4.avg_rating)}` : ""}</p>
            <div className="bars">
              {DISPOSITIONS.map((d) => { const n = Number(s4.mix?.[d.code] || 0); return <div key={d.code}><span>{d.label}</span><i><b style={{ width: `${Math.round((n / mixMax) * 100)}%` }} /></i><span>{n}</span></div>; })}
            </div>
            <p className="small" style={{ margin: "6px 0" }}>Ratings given: {fmtPct(s4.ratings_given.v)}{tg(s4.ratings_given, true) ? ` · ${tg(s4.ratings_given, true)}` : ""}</p>
            {s4.themes?.length > 0 && <><b style={{ fontSize: 13 }}>What leads asked before the call</b>
              <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>{s4.themes.slice(0, 3).map((t, i) => <li key={i}>"{t.text}" ({t.count} of {t.of})</li>)}</ol></>}
          </section>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {p.s5_notice && p.s5_notice.length > 0 && (
            <section className="card" id="s5"><h3>5 · What you will notice this week</h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>{p.s5_notice.map((n, i) => <li key={i}>{n}</li>)}</ul></section>
          )}
          <section className="card roi" id="s6">
            <h3>6 · Your ROI view <span className="pill info">optional · stored on your broker record</span></h3>
            <form onSubmit={(e) => { e.preventDefault(); void saveRoi(); }} style={{ fontSize: 14 }}>
              <label htmlFor="cr" style={{ marginTop: 6 }}>Your close rate (% of meetings that become a policy)</label>
              <input id="cr" type="number" inputMode="numeric" min={0} max={100} value={cr} onChange={(e) => setCr(e.target.value)} /> %
              <label htmlFor="pw">Policies written this cycle (your number)</label>
              <input id="pw" type="number" inputMode="numeric" min={0} max={1000} value={pw ?? (s6?.policies_reported ?? "").toString()} onChange={(e) => setPw(e.target.value)} />
              <label htmlFor="ac">Average commission per policy (optional)</label>
              <input id="ac" type="text" inputMode="numeric" placeholder="R" value={ac} onChange={(e) => setAc(e.target.value)} />
              <div style={{ height: 10 }} />
              <button className="tap" type="submit">Save</button>
            </form>
            {msg && <p className="small">{msg}</p>}
            {s6?.shown && s6.tracking_to !== null && (
              <>
                <p style={{ margin: "10px 0 0", fontSize: 14 }}>At {pctOrNum(s6.close_rate)}, with {s6.basis?.attended ?? "n/a"} attended so far, this cycle is tracking to about <b>{s6.tracking_to} polic{s6.tracking_to === 1 ? "y" : "ies"}</b>.</p>
                <p className="small" style={{ margin: "4px 0 0" }}>How we worked it out: your close rate × (meetings attended{s6.basis?.booked_upcoming !== undefined ? ` + ${s6.basis.booked_upcoming} still booked × this cycle's show rate ${pctOrNum(s6.basis.show_rate as number)}` : ""}). Meetings to policies so far: {pctOrNum(s6.meetings_to_policies?.v)}. This is your number only. It is never used in any fee.</p>
              </>
            )}
          </section>
        </div>
      </div>

      {p.s7_ask && (
        <section className="ask" id="s7">
          <div><b>7 · One thing to do this week</b><br /><span style={{ fontSize: 14 }}>{p.s7_ask.text}</span></div>
          {rep.ask_done_at ? <span className="go">Done ✓</span> : <button className="go" type="button" onClick={doAsk} style={{ border: 0, cursor: "pointer", font: "inherit", fontWeight: 800 }}>{p.s7_ask.button}</button>}
        </section>
      )}

      {p.s8_cycle && (
        <section className="card" id="s8"><h3>8 · Your cycle</h3><p style={{ margin: "4px 0 0", fontSize: 14 }}>{clean(p.s8_cycle.line)} You pick again each cycle.</p></section>
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
