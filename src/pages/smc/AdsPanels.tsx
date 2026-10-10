/**
 * Console · Ads panels (6.2): SortMyCover assets, guardrails, launch plan, kill/scale proposals, broker budget sync.
 * Presentational. Reads come from the parent (brands row, ads_launch_plan, ad_metrics, ad_objects, cycles); the only write here is
 * the launch-plan save (config only, nothing reaches Meta). Every Meta change is handed back through `onStart` into the parent's
 * two-step confirm dialog (preview with caps, then Confirm). Proposals never apply anything by themselves.
 * All rand figures are EXCL. VAT, the number typed into Meta; "billed" adds 15% for display only.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDayTime, fmtZar } from "@/lib/smc";
import {
  dailyFromShare, guardrailStatus, incVat, monthlyFromShare, validateLaunchPlan,
  type KillScaleProposal, type LaunchPlan,
} from "@/lib/smcAdsPlan";

/** The SortMyCover row of `brands` (code SMC). Page and ad account IDs are read from here, never typed on this screen. */
export interface SmcBrandAssets {
  id: string; code: string; name: string; business_id: string | null; page_id: string | null; ig_user_id: string | null;
  ad_account_id: string | null; pixel_id: string | null; dataset_id: string | null;
  page_status: string | null; ig_status: string | null; ad_account_status: string | null; emq: number | null; health_checked_at: string | null;
}
export interface PlanCampaignLive { daysRemaining: number; key: string; campaignId: string | null; status: string | null; dailyBudgetZar: number | null; monthSpendZar: number; todaySpendZar: number; lastChangeAt: string | null }

const Box = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="mb-3 rounded-xl border border-border bg-card p-3">
    <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-bold">{title}</h2><span className="ml-auto text-xs text-muted-foreground">{right}</span></div>
    {children}
  </section>
);

// ---------------------------------------------------------------- 1. assets (IDs from the brands row)
export function AssetsPanel({ brand, error }: { brand: SmcBrandAssets | null; error: string | null }) {
  const rows: [string, string | null][] = [
    ["Facebook Page (SortMyCover)", brand?.page_id ?? null], ["Instagram", brand?.ig_user_id ?? null], ["Ad account", brand?.ad_account_id ?? null],
    ["Pixel / dataset", brand?.pixel_id || brand?.dataset_id || null], ["Business portfolio", brand?.business_id ?? null],
  ];
  const missing = rows.filter(([, v], i) => !v && i < 4).map(([k]) => k);
  return (
    <Box title="Meta assets (from Settings, Brands, SortMyCover)" right={brand?.health_checked_at ? `Health checked ${fmtDayTime(brand.health_checked_at)}` : undefined}>
      {error && <p className="mb-2 text-sm text-destructive">Brands unavailable: {error}</p>}
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([k, v]) => (
          <div key={k}><span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span><span className={v ? "font-mono text-xs" : "text-xs text-amber-400"}>{v || "not set"}</span></div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Every campaign, ad and lead form uses the SortMyCover Page and ad account above, never a broker&apos;s Page. Status: Page {brand?.page_status || "n/a"}, Instagram {brand?.ig_status || "n/a"}, ad account {brand?.ad_account_status || "n/a"}, event match quality {brand?.emq ?? "n/a"}.
      </p>
      {brand && missing.length > 0 && (
        <p className="mt-1 text-sm text-amber-400">Ads are not ready: add {missing.join(", ")} in <a className="underline" href="/console/settings/brands">Settings, Brands</a>. Nothing can be created or changed at Meta until they are set.</p>
      )}
      {!brand && !error && <p className="mt-1 text-sm text-amber-400">No SortMyCover row in brands yet.</p>}
    </Box>
  );
}

// ---------------------------------------------------------------- 2. guardrails
export function GuardrailsPanel({ plan, live, monthlyCapA }: { plan: LaunchPlan; live: PlanCampaignLive[]; monthlyCapA: number | null }) {
  return (
    <Box title="Budget guardrails" right={`Daily cap = monthly cap / 30 x ${plan.guardrails.daily_cap_multiplier}. Max step +${plan.guardrails.max_step_pct}%, one raise per ${plan.guardrails.step_cooldown_hours} h. Alert at ${plan.guardrails.alert_pct}%.`}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Budget guardrails table">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Campaign</th><th className="py-1 text-right">Daily budget</th><th className="py-1 text-right">Cycle spend</th><th className="py-1 text-right">Cycle cap</th><th className="py-1 text-right">Used</th><th className="py-1 text-right">Projected</th><th className="py-1">Alert</th></tr></thead>
          <tbody>
            {plan.campaigns.map((c) => {
              const l = live.find((x) => x.key === c.key);
              const cap = c.key === "A" ? monthlyCapA : c.monthly_cap_zar;
              const g = guardrailStatus({ plan, monthSpendZar: l?.monthSpendZar || 0, monthlyCapZar: cap, dailyBudgetZar: l?.dailyBudgetZar ?? null, daysRemaining: l?.daysRemaining ?? 30, todaySpendZar: l?.todaySpendZar || 0 });
              return (
                <tr key={c.key} className="border-t border-border">
                  <td className="py-1 font-mono text-xs">{c.name}</td>
                  <td className="py-1 text-right tabular-nums">{l?.dailyBudgetZar != null ? fmtZar(l.dailyBudgetZar) : "n/a"}</td>
                  <td className="py-1 text-right tabular-nums">{fmtZar(g.monthSpendZar)}</td>
                  <td className="py-1 text-right tabular-nums">{g.monthlyCapZar != null ? fmtZar(g.monthlyCapZar) : c.key === "A" ? "no active broker" : "n/a"}</td>
                  <td className="py-1 text-right tabular-nums">{g.pctOfCap != null ? `${g.pctOfCap.toFixed(0)}%` : "n/a"}</td>
                  <td className="py-1 text-right tabular-nums">{g.projectedZar != null ? fmtZar(g.projectedZar) : "n/a"}</td>
                  <td className="py-1 text-xs">{g.alert ? <b className="text-destructive">{plan.guardrails.alert_pct}% of cap</b> : g.dayOver ? <b className="text-destructive">day over {plan.guardrails.day_over_ratio}x</b> : "ok"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Caps are per 30-day broker cycle. Cycle spend is excl. VAT from the hourly sync, counted from the earliest active cycle start (the warm-up from its first spend). The cycle cap for Campaign A is the sum of active brokers&apos; media shares / 1.15, read from their cycles. Caps are re-checked on the server at confirm; this table is informational.</p>
    </Box>
  );
}

// ---------------------------------------------------------------- 3. launch plan (editable config)
type Field = "daily_budget_zar" | "monthly_cap_zar" | "duration_days" | "share_pct_all_on";
export function LaunchPlanPanel({ plan, saved, usingDefaults, live, onSave, onApply }: {
  plan: LaunchPlan; saved: boolean; usingDefaults: boolean; live: PlanCampaignLive[];
  onSave: (next: LaunchPlan, reason: string) => Promise<string | null>;
  onApply: (campaignId: string, name: string, current: number | null, dailyBudgetZar: number) => void;
}) {
  const [draft, setDraft] = useState<LaunchPlan>(plan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(plan); }, [plan]);
  const errors = useMemo(() => validateLaunchPlan(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);
  const set = (key: string, f: Field, v: string) => setDraft({ ...draft, campaigns: draft.campaigns.map((c) => (c.key === key ? { ...c, [f]: v === "" ? null : Number(v) } : c)) });
  const num = (v: number | null) => (v === null || v === undefined ? "" : String(v));
  async function save() {
    setBusy(true); setErr(null);
    const e = await onSave(draft, reason.trim());
    setBusy(false);
    if (e) setErr(e); else setReason("");
  }
  return (
    <Box title="Launch plan (excl. VAT, ZAR)" right={usingDefaults ? "Showing the campaign-spec defaults (not saved yet)" : saved ? "Saved in ads_launch_plan" : undefined}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Launch plan table">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
            <th className="py-1">Campaign</th><th className="py-1">Starts</th><th className="py-1">Daily budget</th><th className="py-1">Days</th><th className="py-1">Cap</th><th className="py-1">Share when all on</th><th className="py-1 text-right">Billed / day</th><th className="py-1" />
          </tr></thead>
          <tbody>
            {draft.campaigns.map((c) => {
              const l = live.find((x) => x.key === c.key);
              const planned = c.daily_budget_zar;
              return (
                <tr key={c.key} className="border-t border-border align-top">
                  <td className="py-1.5"><span className="block font-mono text-xs">{c.name}</span><span className="block text-xs text-muted-foreground">{c.role}</span></td>
                  <td className="py-1.5 text-xs">{c.starts === "after_first_payment" ? "After first payment" : c.starts === "go_live" ? "Approve & go live" : "Trigger (11.2)"}</td>
                  <td className="py-1.5"><Input className="h-8 w-24" type="number" inputMode="decimal" min={0} value={num(c.daily_budget_zar)} placeholder="from share" onChange={(e) => set(c.key, "daily_budget_zar", e.target.value)} /></td>
                  <td className="py-1.5"><Input className="h-8 w-16" type="number" inputMode="numeric" min={1} value={num(c.duration_days)} placeholder="open" onChange={(e) => set(c.key, "duration_days", e.target.value)} /></td>
                  <td className="py-1.5"><Input className="h-8 w-24" type="number" inputMode="decimal" min={0} value={num(c.monthly_cap_zar)} placeholder="from shares" onChange={(e) => set(c.key, "monthly_cap_zar", e.target.value)} /></td>
                  <td className="py-1.5"><Input className="h-8 w-16" type="number" inputMode="numeric" min={0} max={100} value={num(c.share_pct_all_on)} placeholder="n/a" onChange={(e) => set(c.key, "share_pct_all_on", e.target.value)} /></td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{planned != null ? fmtZar(incVat(planned), 2) : "n/a"}</td>
                  <td className="py-1.5">
                    {l?.campaignId && planned != null && planned > 0 && l.dailyBudgetZar !== planned && !dirty
                      ? <Button size="sm" variant="outline" onClick={() => onApply(l.campaignId!, c.name, l.dailyBudgetZar, planned)}>Apply to Meta…</Button>
                      : <span className="text-xs text-muted-foreground">{l?.campaignId ? (l.dailyBudgetZar === planned ? "matches Meta" : "") : "not at Meta yet"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Campaign A is R0 until Approve &amp; go live, then each broker&apos;s media share / 1.15 / 30 (Bronze R8,492 gives {fmtZar(dailyFromShare(draft.bronze_media_share_zar), 2)}/day and a {fmtZar(monthlyFromShare(draft.bronze_media_share_zar), 2)} cap). The warm-up Reach ad runs only after first payment. B and C get their share of total daily media when the section 11.2 trigger fires. Saving this plan changes nothing at Meta; &quot;Apply to Meta&quot; opens the two-step confirm and the 20% step and cap rules still apply.
      </p>
      {errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {dirty && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-sm">Why? (required, audit log)<Textarea className="h-16" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <Button variant="outline" onClick={() => { setDraft(plan); setReason(""); setErr(null); }}>Discard</Button>
          <Button disabled={busy || errors.length > 0 || reason.trim().length < 3} onClick={save}>Save plan</Button>
        </div>
      )}
      {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
    </Box>
  );
}

// ---------------------------------------------------------------- 4. kill / scale proposals
export interface ProposalRow extends KillScaleProposal { campaignName: string }
export function ProposalsPanel({ rows, onStart }: { rows: ProposalRow[]; onStart: (p: ProposalRow) => void }) {
  const tone = (s: KillScaleProposal["severity"]) => (s === "act" ? "text-destructive" : s === "watch" ? "text-amber-400" : "text-muted-foreground");
  return (
    <Box title="Kill / scale proposals" right="Rules 11.1 and 11.1b. Proposals only: nothing runs until you preview and confirm.">
      {!rows.length && <p className="text-sm text-muted-foreground">Nothing to propose. Before day 14 and R3,000 of spend the rule is no action, except a policy disapproval.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
            <span className={`text-[11px] font-bold uppercase ${tone(p.severity)}`}>{p.severity === "act" ? "Needs you" : p.severity}</span>
            <div className="min-w-[260px] flex-1"><b>{p.title}</b><span className="block text-xs text-muted-foreground">{p.why} <i>({p.rule}, {p.campaignName})</i></span></div>
            {p.action.kind !== "info" && <Button size="sm" variant="outline" onClick={() => onStart(p)}>Review…</Button>}
          </li>
        ))}
      </ul>
    </Box>
  );
}

// ---------------------------------------------------------------- 5. broker share budget sync (6.1 steps 5 and 7)
export interface BudgetSync { targetDailyZar: number; currentZar: number | null; campaignId: string | null; goLiveShareZar: number | null; brokers: number; sumSharesZar: number; kind: "raise" | "lower" | "pause" | "ok" | "unknown"; note: string }
export function BudgetSyncPanel({ sync, onRaise, onLower, onPause }: { sync: BudgetSync; onRaise: () => void; onLower: () => void; onPause: () => void }) {
  return (
    <Box title="Broker budget sync (Campaign A)" right="Go-live raises by the broker's share; a cycle that is not renewed lowers it.">
      <p className="text-sm">
        {sync.brokers} active broker{sync.brokers === 1 ? "" : "s"}, media shares {fmtZar(sync.sumSharesZar)} incl. VAT. Campaign A should run at <b>{fmtZar(sync.targetDailyZar, 2)}/day</b> excl. VAT (share / 1.15 / 30)
        {sync.currentZar != null ? <>; Meta shows <b>{fmtZar(sync.currentZar, 2)}</b></> : null}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sync.note}</p>
      <div className="mt-2 flex gap-2">
        {sync.kind === "raise" && <Button size="sm" onClick={onRaise}>Raise to {fmtZar(sync.targetDailyZar, 2)}/day…</Button>}
        {sync.kind === "lower" && <Button size="sm" variant="outline" onClick={onLower}>Lower to {fmtZar(sync.targetDailyZar, 2)}/day…</Button>}
        {sync.kind === "pause" && <Button size="sm" variant="outline" onClick={onPause}>Pause Campaign A…</Button>}
      </div>
    </Box>
  );
}
