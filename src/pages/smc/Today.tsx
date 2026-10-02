/**
 * Console · Today (6.8b), built from the approved mock deliverables/console/pulse-mock.html.
 * Reads: ops.pulses, ops.proposals, ops.signals, ops.quality_grades, ops.judge_runs, ops.build_state_latest (admin RLS; NH-22),
 *        public.smc_watchlist_tiles() (admin-only RPC over facts.v_watchlist_1..7 / facts.v_watchlist).
 * Writes: ops.proposals (Approve · Snooze 7 d · Decline(reason); judge "turn into fix") + one ops.notifications outbox row per decision
 *         (W32 picks it up: task creation + confirmation to both partners). Salesforce: smc_audit() logs every write.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import ConsoleLayout from "./ConsoleLayout";
import Sparkline from "./Sparkline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FACULTIES, addDays, errText, fmtDay, fmtNum, fmtPct, fmtTime, fmtZar, opsDb, saDate, smcDb, useIsAdmin } from "@/lib/smc";
import type { OpsBuildStateLatest, OpsJudgeRun, OpsProposal, OpsPulse, OpsQualityGrade, OpsSignal, WatchlistTile } from "@/integrations/supabase/smc-types";

type Section<T> = { data: T; error: string | null };
const PILL: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  grey: "bg-muted text-muted-foreground border-border",
};
const EDGE: Record<string, string> = { green: "border-l-emerald-500", amber: "border-l-amber-500", red: "border-l-red-500", grey: "border-l-border" };

/** ops.pulses.working / not_working are text; W32 writes JSON arrays (strings or {plain_name,value,limit,cause}) or plain lines. */
function asList(v: unknown): string[] {
  if (v === null || v === undefined || v === "") return [];
  let x: unknown = v;
  if (typeof v === "string") { try { x = JSON.parse(v); } catch { x = v; } }
  if (Array.isArray(x)) {
    return x.map((it) => {
      if (typeof it === "string") return it;
      const o = it as Record<string, unknown>;
      const head = String(o.text ?? o.line ?? o.plain_name ?? o.metric ?? "");
      const val = o.value !== undefined && o.value !== null ? ` ${o.value}` : "";
      const lim = o.limit !== undefined && o.limit !== null ? ` (limit ${o.limit})` : "";
      const cause = o.cause ? ` · ${o.cause}` : "";
      return `${head}${val}${lim}${cause}`.trim();
    }).filter(Boolean);
  }
  return String(x).split(/\n+/).map((s) => s.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
}

function tileValue(t: WatchlistTile): string {
  if (t.value_label) return t.value_label;
  if (t.value === null || t.value === undefined) return "n/a";
  const u = (t.unit || "").toLowerCase();
  if (u === "zar" || u === "r") return fmtZar(t.value);
  if (u === "pct" || u === "%" || u === "ratio" || u === "share") return fmtPct(t.value);
  if (u.startsWith("day")) return `${fmtNum(t.value, 1)} d`;
  return fmtNum(t.value, 2);
}
function tileTarget(t: WatchlistTile): string {
  if (t.target === null || t.target === undefined) return "no target yet";
  return "target " + tileValue({ ...t, value: t.target, value_label: null });
}

export default function Today() {
  const { userId } = useIsAdmin();
  const { toast } = useToast();
  const [pulses, setPulses] = useState<Section<OpsPulse[]>>({ data: [], error: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Section<OpsProposal[]>>({ data: [], error: null });
  const [tiles, setTiles] = useState<Section<WatchlistTile[]>>({ data: [], error: null });
  const [signals, setSignals] = useState<Section<OpsSignal[]>>({ data: [], error: null });
  const [grades, setGrades] = useState<Section<OpsQualityGrade[]>>({ data: [], error: null });
  const [runs, setRuns] = useState<OpsJudgeRun[]>([]);
  const [build, setBuild] = useState<Section<OpsBuildStateLatest | null>>({ data: null, error: null });
  const [synthetic, setSynthetic] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [decline, setDecline] = useState<{ p: OpsProposal; reason: string } | null>(null);

  const pulse = useMemo(() => pulses.data.find((p) => p.date === selected) || pulses.data[0] || null, [pulses.data, selected]);

  const loadCore = useCallback(async () => {
    const [p, s, g, r, b] = await Promise.all([
      opsDb().from("pulses").select("*").order("date", { ascending: false }).limit(14),
      opsDb().from("signals").select("*").is("resolved_at", null).order("detected_at", { ascending: false }).limit(200),
      opsDb().from("quality_grades").select("*").gte("graded_at", new Date(Date.now() - 48 * 3600e3).toISOString()).order("passed").order("graded_at", { ascending: false }).limit(30),
      opsDb().from("judge_runs").select("*").order("date", { ascending: false }).limit(10),
      opsDb().from("build_state_latest").select("*").maybeSingle(),
    ]);
    setPulses({ data: (p.data as OpsPulse[]) || [], error: p.error ? errText(p.error) : null });
    setSignals({ data: (s.data as OpsSignal[]) || [], error: s.error ? errText(s.error) : null });
    setGrades({ data: (g.data as OpsQualityGrade[]) || [], error: g.error ? errText(g.error) : null });
    setRuns((r.data as OpsJudgeRun[]) || []);
    setBuild({ data: (b.data as OpsBuildStateLatest) || null, error: b.error ? errText(b.error) : null });
  }, []);

  const loadTiles = useCallback(async () => {
    const { data, error } = await smcDb.rpc("smc_watchlist_tiles", { p_include_synthetic: synthetic });
    setTiles({ data: (data as WatchlistTile[]) || [], error: error ? errText(error) : null });
  }, [synthetic]);

  const loadProposals = useCallback(async (date: string | null) => {
    let q = opsDb().from("proposals").select("*");
    q = date ? q.eq("pulse_date", date) : q.eq("status", "proposed");
    const { data, error } = await q.order("created_at", { ascending: true }).limit(date ? 10 : 3);
    setProposals({ data: (data as OpsProposal[]) || [], error: error ? errText(error) : null });
  }, []);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { void loadTiles(); }, [loadTiles]);
  useEffect(() => { void loadProposals(pulse?.date || null); }, [loadProposals, pulse?.date]);

  async function decide(p: OpsProposal, decision: "approve" | "snooze" | "decline", reason?: string) {
    setBusy(p.id);
    const now = new Date().toISOString();
    const patch: Partial<OpsProposal> & Record<string, unknown> = { decided_by: userId, decided_at: now, decided_by_label: "console" };
    if (decision === "approve") patch.status = "approved";
    if (decision === "snooze") { patch.status = "snoozed"; patch.snooze_until = addDays(saDate(), 7); }
    if (decision === "decline") { patch.status = "declined"; patch.decline_reason = reason; }
    const { error } = await opsDb().from("proposals").update(patch).eq("id", p.id).eq("status", "proposed");
    if (!error) {
      const { error: nErr } = await opsDb().from("notifications").insert({
        kind: "approval", recipient: "jonathan", channel: "console", ref_table: "ops.proposals", ref_id: p.id, proposal_id: p.id,
        dedupe_key: `proposal:${p.id}:${decision}`, status: "queued", source: "console", what: p.title,
        payload: { decision, proposal_id: p.id, decided_by: userId, reason: reason || null, via: "console" },
      });
      if (nErr) toast({ title: "Decision saved, notification not queued", description: errText(nErr), variant: "destructive" });
      else toast({ title: decision === "approve" ? "Approved" : decision === "snooze" ? "Snoozed 7 days" : "Declined", description: p.title });
    } else {
      toast({ title: "Could not save", description: errText(error), variant: "destructive" });
    }
    setBusy(null);
    setDecline(null);
    void loadProposals(pulse?.date || null);
  }

  async function turnIntoFix(g: OpsQualityGrade) {
    setBusy(g.id);
    const faculty = (FACULTIES.find((f) => f.id === g.faculty)?.id || "conversation");
    const { error } = await opsDb().from("proposals").insert({
      source: "judge", faculty, title: `Fix: ${g.rule}`.slice(0, 200), metric: null, owner_agent: g.owner_agent,
      evidence: `${g.sample_ref}${g.exact_text ? ` · "${g.exact_text.slice(0, 200)}"` : ""}`, pulse_date: saDate(),
    });
    setBusy(null);
    toast(error ? { title: "Could not create the fix", description: errText(error), variant: "destructive" } : { title: "Fix proposed", description: "It appears under Do today." });
    void loadProposals(pulse?.date || null);
  }

  // faculty strip: status from open ops.signals (burning → red, any → amber, none → green)
  const facultyState = FACULTIES.map((f) => {
    const open = signals.data.filter((s) => s.faculty === f.id);
    const status = open.some((s) => s.burning) ? "red" : open.length ? "amber" : "green";
    return { ...f, open: open.length, status };
  });

  const comp = (pulse?.compliance || {}) as Record<string, number | boolean | null>;
  const compKnown = ["consent", "disclosure", "stop"].some((k) => comp[k] !== undefined && comp[k] !== null);
  const pct = (v: unknown) => (typeof v === "number" ? fmtPct(v) : "n/a");
  const buildFallback = (pulse?.build || {}) as Record<string, unknown>;

  return (
    <ConsoleLayout>
      <div className="flex flex-col gap-4">
        {/* Pulse card */}
        <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="pulse-h">
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3">
            <h1 id="pulse-h" className="text-base font-bold">Pulse · {pulse ? fmtDay(pulse.date + "T12:00:00Z") : "no pulse yet"}</h1>
            {pulse && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${PILL[pulse.status]}`}>
                {pulse.status}{pulse.quiet ? " · quiet day" : ""} · {signals.data.length} open signal{signals.data.length === 1 ? "" : "s"}
              </span>
            )}
            <small className="ml-auto text-muted-foreground">{pulse ? `Generated ${fmtTime(pulse.created_at)}` : pulses.error ? `Pulses unavailable: ${pulses.error}` : "W32 writes the first pulse at 06:30"}</small>
          </div>
          {pulse?.business_line && <p className="border-b border-border px-4 py-2 text-sm">{pulse.business_line}</p>}
          <div className="grid gap-0 md:grid-cols-3">
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Working</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm">{asList(pulse?.working).map((w, i) => <li key={i}>{w}</li>)}</ul>
              {!asList(pulse?.working).length && <p className="text-sm text-muted-foreground">Nothing called out.</p>}
            </div>
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Not working</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm">{asList(pulse?.not_working).map((w, i) => <li key={i}>{w}</li>)}</ul>
              {!asList(pulse?.not_working).length && <p className="text-sm text-muted-foreground">No adverse signals.</p>}
            </div>
            <div className="p-4">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Do today</h2>
              {proposals.error && <p className="text-sm text-destructive">Proposals unavailable: {proposals.error}</p>}
              {!proposals.error && !proposals.data.length && <p className="text-sm text-muted-foreground">Nothing to decide.</p>}
              <div className="flex flex-col gap-2">
                {proposals.data.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-background p-2.5 text-sm">
                    <b className="block">{p.title}</b>
                    <div className="mb-2 mt-0.5 text-xs text-muted-foreground">
                      {[p.metric, p.forecast && `forecast ${p.forecast}`, p.cost_zar !== null && fmtZar(p.cost_zar), p.grade && `grade ${p.grade}`, p.owner_agent && `owner: ${p.owner_agent}`, p.test, p.kill_rule && `kill: ${p.kill_rule}`].filter(Boolean).join(" · ")}
                    </div>
                    {p.status === "proposed" ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" disabled={busy === p.id} onClick={() => decide(p, "approve")}>Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => decide(p, "snooze")}>Snooze 7 d</Button>
                        <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => setDecline({ p, reason: "" })}>Decline…</Button>
                      </div>
                    ) : (
                      <span className="inline-block rounded-md border border-border px-2 py-0.5 text-xs font-semibold capitalize">
                        {p.status}{p.decided_at ? ` ${fmtTime(p.decided_at)}` : ""}{p.task_id ? ` · task ${p.task_id}` : ""}{p.snooze_until ? ` until ${p.snooze_until}` : ""}{p.decline_reason ? ` · ${p.decline_reason}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* compliance + build lines */}
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5 text-xs">
            <span className={`rounded-full border px-2.5 py-1 font-semibold ${!compKnown ? PILL.grey : comp.green ? PILL.green : PILL.red}`}>
              Compliance · {compKnown
                ? `consent ${pct(comp.consent)} · disclosure ${pct(comp.disclosure)} · STOP ${pct(comp.stop)} · cleanse ${comp.days_since_cleanse ?? "n/a"} d ago · advice statements ${comp.advice_statements ?? "n/a"}${comp.dsr_overdue ? ` · DSR overdue ${comp.dsr_overdue}` : ""}`
                : "no leads yet, nothing to evidence"}
            </span>
            {build.data ? (
              <span className={`rounded-full border px-2.5 py-1 font-semibold ${build.data.gates_waiting ? PILL.amber : PILL.grey}`}>
                Build · {Object.entries(build.data.tasks_by_status || {}).map(([k, v]) => `${v} ${k}`).join(" · ") || `${build.data.tasks_total ?? "?"} tasks`}
                {` · tests failing ${build.data.tests_failing}`}{build.data.gates_waiting ? ` · ${build.data.gates_waiting} gate(s) waiting${build.data.gates_oldest_hours ? ` (oldest ${fmtNum(build.data.gates_oldest_hours)} h)` : ""}` : ""}
                {` · ${build.data.commits_24h} commits 24 h`}
              </span>
            ) : (
              <span className={`rounded-full border px-2.5 py-1 font-semibold ${PILL.grey}`}>
                Build · {Object.keys(buildFallback).length ? Object.entries(buildFallback).map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "not captured yet (orchestrator writes ops.build_state; source of truth build/tasks.json)"}
              </span>
            )}
          </div>
        </section>

        {/* Owner watchlist: 7 tiles */}
        <section aria-labelledby="wl-h">
          <div className="mb-2 flex items-center gap-3">
            <h2 id="wl-h" className="text-sm font-bold">Owner watchlist</h2>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} /> include synthetic rows
            </label>
          </div>
          {tiles.error && <p className="text-sm text-destructive">Watchlist unavailable: {tiles.error}</p>}
          {!tiles.error && !tiles.data.length && <p className="text-sm text-muted-foreground">No watchlist rows yet.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {tiles.data.map((t) => {
              const thin = t.n !== null && t.n < 20;
              const st = thin ? "grey" : (t.status || "grey");
              return (
                <div key={t.metric_no} className={`min-w-0 rounded-lg border border-border border-l-4 ${EDGE[st]} bg-card p-2.5`} title={t.look_out || ""}>
                  <div className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t.metric_no}. {t.plain_name}</div>
                  <div className="text-lg font-bold tabular-nums leading-tight">{tileValue(t)}</div>
                  <div className="text-[11px] text-muted-foreground">{tileTarget(t)}{t.value_prev !== null ? ` · 7 d ago ${tileValue({ ...t, value: t.value_prev, value_label: null })}` : ""}</div>
                  <Sparkline className="mt-1 h-7 w-full" tone={st} target={t.target} points={(t.trend || []).map((p) => (p.v === null ? null : Number(p.v)))} label={`${t.plain_name}, 28 days`} />
                  <div className="text-[11px] text-muted-foreground">{thin ? `not enough data yet (n = ${t.n}, need 20)` : `n = ${t.n ?? "?"}`}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 11-faculty strip */}
        <section aria-labelledby="fac-h">
          <h2 id="fac-h" className="mb-2 text-sm font-bold">Faculties</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
            {facultyState.map((f) => (
              <div key={f.id} className={`min-w-0 rounded-lg border border-border border-l-4 ${EDGE[f.status]} bg-card p-2`}>
                <div className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{f.name}</div>
                <div className="truncate text-xs">{f.headline} <span className="text-muted-foreground">{f.slo}</span></div>
                <div className="text-[11px]">{f.open ? <b className="text-amber-400">{f.open} signal{f.open > 1 ? "s" : ""}</b> : <span className="text-muted-foreground">no signals</span>}</div>
              </div>
            ))}
          </div>
          {signals.error && <p className="mt-1 text-xs text-destructive">Signals unavailable: {signals.error}</p>}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="sig-h">
            <h2 id="sig-h" className="mb-2 text-sm font-bold">Signals <small className="font-normal text-muted-foreground">open · out of control limits or 7-point runs</small></h2>
            {!signals.data.length && <p className="text-sm text-muted-foreground">No open signals.</p>}
            {signals.data.slice(0, 15).map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border py-1.5 text-sm last:border-0">
                <div>
                  {s.metric} {s.value !== null && <b className="tabular-nums">{fmtNum(s.value, 2)}</b>}
                  <span className="text-xs text-muted-foreground">
                    {s.limit_value !== null ? ` · limit ${fmtNum(s.limit_value, 2)}` : ""}{s.run ? ` · ${s.run}` : ""}{s.cause ? ` · cause: ${s.cause}` : ""} · since {fmtDay(s.detected_at)}{s.burning ? " · SLO burning" : ""}
                  </span>
                </div>
                <span className="self-start whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{s.owner || s.faculty}</span>
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="jf-h">
            <h2 id="jf-h" className="mb-2 text-sm font-bold">Judge findings <small className="font-normal text-muted-foreground">W33 · last 48 h{runs[0] ? ` · ${runs.filter((r) => r.date === runs[0].date).map((r) => `${r.rubric} ${r.passed ?? 0}/${r.sampled ?? 0}`).join(" · ")}` : ""}</small></h2>
            {grades.error && <p className="text-sm text-destructive">Findings unavailable: {grades.error}</p>}
            {!grades.error && !grades.data.length && <p className="text-sm text-muted-foreground">No graded samples yet.</p>}
            {grades.data.slice(0, 10).map((g) => (
              <div key={g.id} className="border-b border-border py-1.5 text-sm last:border-0">
                <span className={g.passed ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"}>{g.rule}</span>
                <span className="text-xs text-muted-foreground"> · {g.severity}{g.faculty ? ` · ${g.faculty}` : ""}</span>
                {g.exact_text && <div className="my-1 rounded bg-muted px-2 py-1 text-xs italic">"{g.exact_text}"</div>}
                {g.note && <div className="text-xs text-muted-foreground">{g.note}</div>}
                {!g.passed && <button className="text-xs font-semibold text-primary hover:underline" disabled={busy === g.id} onClick={() => turnIntoFix(g)}>→ turn into fix</button>}
              </div>
            ))}
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="hist-h">
          <h2 id="hist-h" className="mb-2 text-sm font-bold">History <small className="font-normal text-muted-foreground">last 14 pulses · tap to view</small></h2>
          <div className="flex flex-wrap gap-2">
            {pulses.data.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.date)}
                className={`rounded-md border px-2.5 py-1 text-xs ${PILL[p.status]} ${pulse?.date === p.date ? "ring-2 ring-ring" : ""}`}>
                {fmtDay(p.date + "T12:00:00Z")} · {p.status}
              </button>
            ))}
            {!pulses.data.length && <p className="text-sm text-muted-foreground">No history yet.</p>}
          </div>
        </section>
      </div>

      <Dialog open={!!decline} onOpenChange={(o) => !o && setDecline(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this proposal?</DialogTitle>
            <DialogDescription>{decline?.p.title}</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus placeholder="Why? (required, goes in the decision journal)" value={decline?.reason || ""}
            onChange={(e) => decline && setDecline({ ...decline, reason: e.target.value })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecline(null)}>Cancel</Button>
            <Button disabled={!decline || decline.reason.trim().length < 3 || busy === decline.p.id}
              onClick={() => decline && decide(decline.p, "decline", decline.reason.trim())}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsoleLayout>
  );
}
