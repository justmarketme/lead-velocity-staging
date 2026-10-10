/**
 * Console · Ads (6.2/6.3). Reads ad_metrics (W21 hourly) + ad_objects (status/budget cache) + the SortMyCover `brands` row (Page,
 * ad account, pixel IDs) + ads_launch_plan + active cycles. Never calls Meta from the browser.
 * Writes are confirm-to-apply through n8n (automation/ads/CONSOLE-ADS-API.md): POST {base}/ads-confirm → preview → Confirm →
 * POST {base}/ads-budget | ads-ad-status | ads-campaign-status with confirm_token + confirmed_by. Caps are loaded server-side, never sent from here.
 * Headline columns: cost per qualified lead and cost per attended meeting; raw CPL is secondary.
 * Kill/scale rules and the go-live budget raise only PROPOSE here: the human taps Review, sees the preview with caps, then Confirms.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ConsoleLayout from "./ConsoleLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { N8N_BASE, addDays, errText, fmtDayTime, fmtNum, fmtZar, postWebhook, saDate, smcDb, useIsAdmin } from "@/lib/smc";
import type { AdsConfirmResponse, SmcAdMetric, SmcAdObject } from "@/integrations/supabase/smc-types";
import {
  DEFAULT_LAUNCH_PLAN, capsFor, dailyFromShare, incVat, killScaleProposals, mergePlan,
  type AdFacts, type CampaignFacts, type LaunchPlan,
} from "@/lib/smcAdsPlan";
import { AssetsPanel, BudgetSyncPanel, GuardrailsPanel, LaunchPlanPanel, ProposalsPanel } from "./AdsPanels";
import type { BudgetSync, PlanCampaignLive, ProposalRow, SmcBrandAssets } from "./AdsPanels";

interface Sums { spend: number; impressions: number; leads: number; qualified: number; booked: number; attended: number; goodFit: number; qSum: number; qN: number; freqW: number }
const zero = (): Sums => ({ spend: 0, impressions: 0, leads: 0, qualified: 0, booked: 0, attended: 0, goodFit: 0, qSum: 0, qN: 0, freqW: 0 });
function add(s: Sums, m: SmcAdMetric) {
  s.spend += Number(m.spend_zar) || 0; s.impressions += Number(m.impressions) || 0; s.leads += m.leads_raw || 0;
  s.qualified += m.qualified || 0; s.booked += m.booked || 0; s.attended += m.attended || 0; s.goodFit += m.good_fit || 0;
  if (m.quality_index !== null && m.quality_n) { s.qSum += Number(m.quality_index) * m.quality_n; s.qN += m.quality_n; }
  if (m.frequency !== null) s.freqW += Number(m.frequency) * (Number(m.impressions) || 0);
}
const per = (a: number, b: number) => (b > 0 ? a / b : null);

interface AdRow { id: string; name: string; sums: Sums; obj?: SmcAdObject }
interface SetRow { id: string; name: string; sums: Sums; ads: AdRow[] }
interface CampRow { id: string; name: string; sums: Sums; sets: SetRow[]; obj?: SmcAdObject }

type Action =
  | { kind: "pause_ad" | "resume_ad" | "pause_campaign" | "resume_campaign"; target: string; label: string }
  | { kind: "set_campaign_budget"; target: string; label: string; current: number | null; preset?: number; goLiveShareZar?: number; reasonPreset?: string };

const CODE_TEXT: Record<string, string> = {
  RATE_LIMIT_BACKOFF: "Meta is busy. Try again later.", DAILY_CAP: "That is above the daily cap.", MONTHLY_CAP: "That would go over the monthly cap.",
  STEP_LIMIT: "Budget increases are limited to 20% per step.", STEP_COOLDOWN: "Wait 48 h between budget increases.",
  BUDGET_BELOW_MIN: "Below Meta's minimum daily budget.", CONFIRM_EXPIRED: "The confirmation expired (15 min). Start again.",
  CONFIRM_MISMATCH: "The numbers changed after preview. Start again.", CAP_MISSING: "No cap is set for this campaign.",
  NOT_SMC_PAGE: "That is not the SortMyCover Page. Ads never use a broker's Page.", ASSET_MISSING: "The SortMyCover Page or ad account ID is missing in Settings, Brands.",
  BRAND_REQUIRED: "The SortMyCover brand row is not set up.", GO_LIVE_EXCEEDS_SHARE: "The go-live raise is bigger than that broker's media share.",
  GO_LIVE_SHARE_MISSING: "The go-live raise needs the broker's media share.",
};

const planCode = (name: string) => (/^SMC_([A-Z])_/.exec(name) || [])[1] || null;

export default function Ads() {
  const { userId } = useIsAdmin();
  const { toast } = useToast();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<SmcAdMetric[]>([]);
  const [objs, setObjs] = useState<SmcAdObject[]>([]);
  const [brand, setBrand] = useState<SmcBrandAssets | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [plan, setPlan] = useState<LaunchPlan>(DEFAULT_LAUNCH_PLAN);
  const [planSaved, setPlanSaved] = useState(false);
  const [shares, setShares] = useState<{ broker_id: string; media_share_zar: number; starts_at: string | null; ends_at?: string | null; extended_until?: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [budget, setBudget] = useState("");
  const [confirm, setConfirm] = useState<AdsConfirmResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // 60 days of metrics: the kill/scale rules need spend since the last change and the day count; the table shows the chosen window.
    const from = addDays(saDate(), -59);
    const [m, o, b, cy] = await Promise.all([
      smcDb.from("ad_metrics").select("*").gte("date", from).order("date", { ascending: false }).limit(20000),
      smcDb.from("ad_objects").select("*").limit(2000),
      smcDb.from("brands").select("id,code,name,business_id,page_id,ig_user_id,ad_account_id,pixel_id,dataset_id,page_status,ig_status,ad_account_status,emq,health_checked_at").eq("code", "SMC").maybeSingle(),
      smcDb.from("cycles").select("broker_id,media_share_zar,starts_at,ends_at,extended_until,status").in("status", ["active", "extended"]),
    ]);
    setError(m.error ? errText(m.error) : null);
    setRows((m.data as SmcAdMetric[]) || []);
    setObjs((o.data as SmcAdObject[]) || []);
    setBrand((b.data as SmcBrandAssets | null) || null);
    setBrandError(b.error ? errText(b.error) : null);
    setShares(((cy.data as { broker_id: string; media_share_zar: number; starts_at: string | null }[]) || []).map((c) => ({ ...c, media_share_zar: Number(c.media_share_zar) || 0 })));
    if (b.data) {
      const p = await smcDb.from("ads_launch_plan").select("plan").eq("brand_id", (b.data as SmcBrandAssets).id).maybeSingle();
      if (!p.error && p.data?.plan) { setPlan(mergePlan(p.data.plan as Partial<LaunchPlan>)); setPlanSaved(true); } else { setPlan(DEFAULT_LAUNCH_PLAN); setPlanSaved(false); }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const windowRows = useMemo(() => { const from = addDays(saDate(), -(days - 1)); return rows.filter((r) => r.date >= from); }, [rows, days]);

  const tree = useMemo(() => {
    const byId = new Map(objs.map((o) => [o.id, o]));
    const camps = new Map<string, CampRow>();
    for (const m of windowRows) {
      const cid = m.campaign_id || "unknown";
      const c = camps.get(cid) || { id: cid, name: m.campaign_name || byId.get(cid)?.name || cid, sums: zero(), sets: [], obj: byId.get(cid) };
      camps.set(cid, c); add(c.sums, m);
      const sid = m.adset_id || "unknown";
      let s = c.sets.find((x) => x.id === sid);
      if (!s) { s = { id: sid, name: m.adset_name || byId.get(sid)?.name || sid, sums: zero(), ads: [] }; c.sets.push(s); }
      add(s.sums, m);
      let a = s.ads.find((x) => x.id === m.ad_id);
      if (!a) { a = { id: m.ad_id, name: m.ad_name || byId.get(m.ad_id)?.name || m.ad_id, sums: zero(), obj: byId.get(m.ad_id) }; s.ads.push(a); }
      add(a.sums, m);
    }
    // campaigns that exist at Meta but have no spend yet (built paused) still appear, so they can be budgeted and resumed
    for (const o of objs) if (o.level === "campaign" && !camps.has(o.id)) camps.set(o.id, { id: o.id, name: o.name, sums: zero(), sets: [], obj: o });
    return [...camps.values()].sort((a, b) => b.sums.spend - a.sums.spend);
  }, [windowRows, objs]);
  const fetchedAt = useMemo(() => rows.reduce<string | null>((mx, r) => (!mx || r.synced_at > mx ? r.synced_at : mx), null), [rows]);

  // ---- launch plan vs what Meta shows (matched on the campaign name SMC_{key}_...)
  const campaignObjs = useMemo(() => objs.filter((o) => o.level === "campaign"), [objs]);
  const live: PlanCampaignLive[] = useMemo(() => {
    // Caps are per 30-day broker cycle: spend counts from the earliest active cycle start and the days left run to that cycle's end.
    // With no active cycle (warm-up Reach) spend counts from the campaign's first spend and the days left come from the plan duration.
    const today = saDate();
    const starts = shares.map((s) => s.starts_at).filter(Boolean).map((t) => saDate(new Date(t as string))).sort();
    const ends = shares.map((s) => s.extended_until || s.ends_at).filter(Boolean).map((t) => new Date(t as string).getTime()).sort((a, b) => a - b);
    const cycleStart = starts[0] || null;
    const cycleDays = ends.length ? Math.max(1, Math.ceil((ends[0] - Date.now()) / 86400000)) : null;
    return plan.campaigns.map((pc) => {
      const o = campaignObjs.find((x) => x.name === pc.name) || campaignObjs.find((x) => planCode(x.name) === pc.key);
      const mine = o ? rows.filter((r) => r.campaign_id === o.id) : [];
      const first = mine.filter((r) => Number(r.spend_zar) > 0).map((r) => r.date).sort()[0] || null;
      const from = pc.key !== "W" && cycleStart ? cycleStart : first || today;
      const daysLeft = pc.key !== "W" && cycleDays != null ? cycleDays : pc.key === "W" ? Math.max(1, (pc.duration_days || 7) - Math.floor((Date.parse(today) - Date.parse(from)) / 86400000)) : 30;
      return { key: pc.key, campaignId: o?.id || null, daysRemaining: daysLeft, status: o?.effective_status || o?.status || null, dailyBudgetZar: o?.daily_budget_zar ?? null,
        monthSpendZar: mine.filter((r) => r.date >= from).reduce((s, r) => s + (Number(r.spend_zar) || 0), 0),
        todaySpendZar: mine.filter((r) => r.date === today).reduce((s, r) => s + (Number(r.spend_zar) || 0), 0), lastChangeAt: o?.last_budget_change_at || null };
    });
  }, [plan, campaignObjs, rows, shares]);

  const activeShares = useMemo(() => shares.map((s) => s.media_share_zar), [shares]);
  const monthlyCapA = useMemo(() => capsFor(plan, "A", activeShares).monthlyCapZar || null, [plan, activeShares]);

  const sync: BudgetSync = useMemo(() => {
    const a = live.find((l) => l.key === "A");
    const sum = activeShares.reduce((s, x) => s + x, 0);
    const target = dailyFromShare(sum);
    const cur = a?.dailyBudgetZar ?? null;
    const base = { targetDailyZar: target, currentZar: cur, campaignId: a?.campaignId || null, brokers: shares.length, sumSharesZar: sum };
    if (!a?.campaignId) return { ...base, goLiveShareZar: null, kind: "unknown", note: "Campaign A is not at Meta yet (or the hourly sync has not run). Build it paused first." };
    if (!shares.length) return { ...base, goLiveShareZar: null, kind: cur != null && (a.status || "").toUpperCase() === "ACTIVE" ? "pause" : "ok", note: "No active broker, so no media share: routing is off and the campaign should be paused (a budget cannot be R0)." };
    if (cur == null) return { ...base, goLiveShareZar: null, kind: "unknown", note: "Meta's current budget is not in the cache yet." };
    if (Math.abs(cur - target) < 0.05) return { ...base, goLiveShareZar: null, kind: "ok", note: "Matches the active brokers' media shares." };
    if (target < cur) return { ...base, goLiveShareZar: null, kind: "lower", note: "A cycle ended without renewal. Decreases are not step-limited; the spending limit is lowered in the same step." };
    // raise: bound to the newest active broker's own share (go-live, 6.1 step 5)
    const newest = [...shares].sort((x, y) => String(y.starts_at || "").localeCompare(String(x.starts_at || "")))[0];
    const room = dailyFromShare(newest.media_share_zar) + 0.05;
    if (target - cur <= room) return { ...base, goLiveShareZar: newest.media_share_zar, kind: "raise", note: `Go-live raise for the newest broker (share ${fmtZar(newest.media_share_zar)} incl. VAT). It lifts the 20% step only for this raise; the daily and monthly caps still apply at confirm.` };
    return { ...base, goLiveShareZar: null, kind: "unknown", note: "The gap is more than one broker's share. Raise in steps with Budget… (20% each, 48 h apart) or check the cycles." };
  }, [live, activeShares, shares]);

  // ---- kill / scale proposals (11.1, 11.1b): proposals only
  const proposals: ProposalRow[] = useMemo(() => {
    const out: ProposalRow[] = [];
    const today = saDate();
    const byId = new Map(objs.map((o) => [o.id, o]));
    for (const c of campaignObjs) {
      const code = planCode(c.name);
      if (!code || !["A", "B", "C"].includes(code)) continue; // the warm-up Reach ad has no lead rules
      const all = rows.filter((r) => r.campaign_id === c.id);
      const withSpend = all.filter((r) => Number(r.spend_zar) > 0).map((r) => r.date).sort();
      const since = c.last_budget_change_at ? c.last_budget_change_at.slice(0, 10) : null;
      const mine = since ? all.filter((r) => r.date >= since) : all;
      const adMap = new Map<string, AdFacts & { hookW: number; holdW: number }>();
      for (const r of mine) {
        const o = byId.get(r.ad_id);
        const f = adMap.get(r.ad_id) || { adId: r.ad_id, name: r.ad_name || o?.name || r.ad_id, status: o?.status || null, effectiveStatus: o?.effective_status || null, spend: 0, leads: 0, qualified: 0, goodFit: 0, impressions: 0,
          qualityIndex: null, qualityN: 0, hookRatePct: null, holdRatePct: null, isReels: /_vid/.test(r.ad_name || "") || (r.format || "").startsWith("vid"), hookW: 0, holdW: 0 };
        const imps = Number(r.impressions) || 0;
        f.spend += Number(r.spend_zar) || 0; f.leads += r.leads_raw || 0; f.qualified += r.qualified || 0; f.goodFit += r.good_fit || 0; f.impressions += imps;
        if (r.quality_index !== null && r.quality_n) { f.qualityIndex = ((f.qualityIndex ?? 0) * f.qualityN + Number(r.quality_index) * r.quality_n) / (f.qualityN + r.quality_n); f.qualityN += r.quality_n; }
        if (r.hook_rate !== null) f.hookW += Number(r.hook_rate) * imps; if (r.hold_rate !== null) f.holdW += Number(r.hold_rate) * imps;
        adMap.set(r.ad_id, f);
      }
      const ads: AdFacts[] = [...adMap.values()].map(({ hookW, holdW, ...f }) => ({ ...f, hookRatePct: f.impressions && hookW ? (hookW / f.impressions) * 100 : null, holdRatePct: f.impressions && holdW ? (holdW / f.impressions) * 100 : null }));
      // ads with no spend yet still matter for policy disapprovals
      for (const o of objs) if (o.level === "ad" && o.campaign_id === c.id && !adMap.has(o.id)) ads.push({ adId: o.id, name: o.name, status: o.status, effectiveStatus: o.effective_status, spend: 0, leads: 0, qualified: 0, goodFit: 0, impressions: 0, qualityIndex: null, qualityN: 0, hookRatePct: null, holdRatePct: null, isReels: false });
      const facts: CampaignFacts = {
        campaignId: c.id, name: c.name, status: c.status, dailyBudgetZar: c.daily_budget_zar, lastBudgetChangeAt: c.last_budget_change_at,
        spendSinceChange: ads.reduce((s, a) => s + a.spend, 0), day: withSpend.length ? Math.max(1, Math.round((Date.parse(today) - Date.parse(withSpend[0])) / 86400000) + 1) : 0,
        leads: ads.reduce((s, a) => s + a.leads, 0), qualified: ads.reduce((s, a) => s + a.qualified, 0), goodFit: ads.reduce((s, a) => s + a.goodFit, 0),
        ratedMeetings: ads.reduce((s, a) => s + a.qualityN, 0), ads,
      };
      for (const p of killScaleProposals(plan, facts)) out.push({ ...p, campaignName: c.name });
    }
    const rank = { act: 0, watch: 1, info: 2 } as const;
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [campaignObjs, objs, rows, plan]);

  function start(a: Action) {
    setAction(a); setConfirm(null);
    setReason(a.kind === "set_campaign_budget" && a.reasonPreset ? a.reasonPreset : "");
    setBudget(a.kind === "set_campaign_budget" ? (a.preset !== undefined ? String(a.preset) : a.current !== null ? String(a.current) : "") : "");
  }
  function params(a: Action): Record<string, unknown> {
    if (a.kind !== "set_campaign_budget") return { status: a.kind.startsWith("pause") ? "PAUSED" : "ACTIVE" };
    return { dailyBudgetZar: Number(budget), setSpendCap: true, ...(a.goLiveShareZar ? { goLive: true, goLiveShareZar: a.goLiveShareZar } : {}) };
  }
  async function preview() {
    if (!action) return;
    setBusy(true);
    const r = await postWebhook<AdsConfirmResponse>("ads-confirm", { action: action.kind, target: action.target, params: params(action), requested_by: userId, reason: reason.trim() });
    setBusy(false);
    if (!r.ok || !r.data?.confirm_token) {
      const code = r.data?.code || "";
      toast({ title: "Not confirmed", description: CODE_TEXT[code] || r.data?.message || r.error || "No confirm token returned", variant: "destructive" });
      return;
    }
    setConfirm(r.data);
  }
  async function apply() {
    if (!action || !confirm?.confirm_token) return;
    setBusy(true);
    type Res = { ok: boolean; code?: string; message?: string };
    const tok = { confirm_token: confirm.confirm_token, confirmed_by: userId };
    const r = action.kind === "set_campaign_budget"
      ? await postWebhook<Res>("ads-budget", { campaign_id: action.target, daily_budget_zar: Number(budget), set_spend_cap: true, ...tok, go_live: !!action.goLiveShareZar, go_live_share_zar: action.goLiveShareZar ?? null })
      : action.kind === "pause_campaign" || action.kind === "resume_campaign"
        ? await postWebhook<Res>("ads-campaign-status", { campaign_id: action.target, status: action.kind === "pause_campaign" ? "PAUSED" : "ACTIVE", ...tok })
        : await postWebhook<Res>("ads-ad-status", { ad_id: action.target, status: action.kind === "pause_ad" ? "PAUSED" : "ACTIVE", ...tok });
    setBusy(false);
    if (!r.ok || r.data?.ok === false) {
      toast({ title: "Not applied", description: CODE_TEXT[r.data?.code || ""] || r.data?.message || r.error, variant: "destructive" });
      return;
    }
    toast({ title: "Applied", description: `${action.label}. Logged to the audit trail.` });
    setAction(null); setConfirm(null);
    void load();
  }

  async function savePlan(next: LaunchPlan, why: string): Promise<string | null> {
    if (!brand) return "No SortMyCover brand row.";
    const { error: e } = await smcDb.from("ads_launch_plan").upsert({ brand_id: brand.id, plan: next, reason: why, updated_by: userId }, { onConflict: "brand_id" });
    if (e) return /ads_launch_plan/.test(errText(e)) ? "The ads_launch_plan table does not exist yet (migration smc_16 is not applied)." : errText(e);
    setPlan(next); setPlanSaved(true);
    toast({ title: "Plan saved", description: "Nothing changed at Meta." });
    return null;
  }

  function startBudget(campaignId: string, name: string, current: number | null, target: number, extra: Partial<Extract<Action, { kind: "set_campaign_budget" }>> = {}) {
    start({ kind: "set_campaign_budget", target: campaignId, label: `Budget for ${name}`, current, preset: target, ...extra });
  }
  function startProposal(p: ProposalRow) {
    const a = p.action;
    if (a.kind === "pause_ad") start({ kind: "pause_ad", target: a.target, label: p.title, });
    else if (a.kind === "pause_campaign") start({ kind: "pause_campaign", target: a.target, label: p.title });
    else if (a.kind === "set_campaign_budget") {
      const cur = objs.find((o) => o.id === a.target)?.daily_budget_zar ?? null;
      startBudget(a.target, p.campaignName, cur, a.dailyBudgetZar, { reasonPreset: `${p.rule}: ${p.why}`.slice(0, 280) });
    }
    if (a.kind === "pause_ad" || a.kind === "pause_campaign") setReason(`${p.rule}: ${p.why}`.slice(0, 280));
  }


  const Cells = ({ s }: { s: Sums }) => (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{fmtZar(s.spend)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{s.leads}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{s.qualified}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtZar(per(s.spend, s.qualified))}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{s.booked}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{s.attended}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtZar(per(s.spend, s.attended))}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmtZar(per(s.spend, s.leads))}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{s.impressions ? fmtNum(s.freqW / s.impressions, 2) : "n/a"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{s.qN >= 5 ? `${fmtNum(s.qSum / s.qN, 1)} (n=${s.qN})` : s.qN ? `n=${s.qN}` : "n/a"}</td>
    </>
  );

  const budgetNum = Number(budget);
  const cur = action?.kind === "set_campaign_budget" ? action.current : null;
  const stepPct = cur && cur > 0 && budgetNum > 0 ? ((budgetNum - cur) / cur) * 100 : null;

  return (
    <ConsoleLayout>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">Ads</h1>
        <div className="flex gap-1">
          {[1, 7, 14, 28].map((d) => (
            <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>{d === 1 ? "Today" : `${d} d`}</Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">Data as of {fetchedAt ? fmtDayTime(fetchedAt) : "n/a"} (W21, hourly){!N8N_BASE && " · actions not connected yet"}</span>
      </div>
      {error && <p className="mb-2 text-sm text-destructive">ad_metrics unavailable: {error}</p>}

      <AssetsPanel brand={brand} error={brandError} />
      <ProposalsPanel rows={proposals} onStart={startProposal} />
      <BudgetSyncPanel sync={sync}
        onRaise={() => sync.campaignId && startBudget(sync.campaignId, "Campaign A", sync.currentZar, sync.targetDailyZar, { goLiveShareZar: sync.goLiveShareZar ?? undefined, reasonPreset: "go-live: raise by the new broker's media share" })}
        onLower={() => sync.campaignId && startBudget(sync.campaignId, "Campaign A", sync.currentZar, sync.targetDailyZar, { reasonPreset: "cycle ended, broker not renewed" })}
        onPause={() => sync.campaignId && start({ kind: "pause_campaign", target: sync.campaignId, label: "Pause Campaign A (no active broker)" })} />
      <GuardrailsPanel plan={plan} live={live} monthlyCapA={monthlyCapA} />
      <LaunchPlanPanel plan={plan} saved={planSaved} usingDefaults={!planSaved} live={live} onSave={savePlan}
        onApply={(id, name, current, target) => startBudget(id, name, current, target)} />

      <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Campaigns table">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2">Campaign / ad set / ad</th><th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-right">Spend</th><th className="px-2 py-2 text-right">Leads</th><th className="px-2 py-2 text-right">Qualified</th>
              <th className="px-2 py-2 text-right">Cost / qualified</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Attended</th>
              <th className="px-2 py-2 text-right">Cost / attended</th><th className="px-2 py-2 text-right">CPL (raw)</th><th className="px-2 py-2 text-right">Freq.</th>
              <th className="px-2 py-2 text-right">Quality</th><th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!tree.length && <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">No ad metrics in this window.</td></tr>}
            {tree.map((c) => {
              const cPaused = (c.obj?.status || "").toUpperCase() === "PAUSED";
              return (
              <Fragment key={c.id}>
                <tr className="border-b border-border bg-muted/30 font-semibold">
                  <td className="px-2 py-1.5"><button className="text-left hover:underline" onClick={() => setOpen({ ...open, [c.id]: !open[c.id] })}>{open[c.id] ? "▾" : "▸"} {c.name}</button></td>
                  <td className="px-2 py-1.5 text-xs">{c.obj?.effective_status || c.obj?.status || "n/a"}{c.obj?.daily_budget_zar ? ` · ${fmtZar(c.obj.daily_budget_zar)}/d` : ""}</td>
                  <Cells s={c.sums} />
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <Button size="sm" variant="outline" onClick={() => start({ kind: "set_campaign_budget", target: c.id, label: `Budget for ${c.name}`, current: c.obj?.daily_budget_zar ?? null })}>Budget…</Button>{" "}
                    {cPaused
                      ? <Button size="sm" variant="outline" onClick={() => start({ kind: "resume_campaign", target: c.id, label: `Resume ${c.name}` })}>Resume…</Button>
                      : <Button size="sm" variant="outline" onClick={() => start({ kind: "pause_campaign", target: c.id, label: `Pause ${c.name}` })}>Pause…</Button>}
                  </td>
                </tr>
                {open[c.id] && c.sets.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-border">
                      <td className="px-2 py-1.5 pl-6">{s.name}</td><td />
                      <Cells s={s.sums} /><td />
                    </tr>
                    {s.ads.map((a) => {
                      const paused = (a.obj?.status || "").toUpperCase() === "PAUSED";
                      return (
                        <tr key={a.id} className="border-b border-border text-[13px]">
                          <td className="px-2 py-1.5 pl-10 font-mono text-xs">{a.name}</td>
                          <td className="px-2 py-1.5 text-xs">{a.obj?.effective_status || a.obj?.status || "n/a"}</td>
                          <Cells s={a.sums} />
                          <td className="px-2 py-1.5">
                            {paused
                              ? <Button size="sm" variant="outline" onClick={() => start({ kind: "resume_ad", target: a.id, label: `Resume ${a.name}` })}>Resume…</Button>
                              : <Button size="sm" variant="outline" onClick={() => start({ kind: "pause_ad", target: a.id, label: `Pause ${a.name}` })}>Pause…</Button>}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Quality = mean adviser rating (1–5), shown from 5 ratings. Kill/scale rules only propose; nothing here runs by itself. Amounts are excl. VAT (as typed into Meta).</p>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setConfirm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.label}</DialogTitle>
            <DialogDescription>Two steps: preview with caps, then confirm. Nothing changes at Meta until you tap Confirm.</DialogDescription>
          </DialogHeader>
          {!confirm ? (
            <div className="flex flex-col gap-2">
              {action?.kind === "set_campaign_budget" && (
                <>
                  <label className="text-sm">New daily budget (R, excl. VAT)
                    <Input type="number" inputMode="decimal" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
                  </label>
                  {budgetNum > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Meta bills about {fmtZar(incVat(budgetNum), 2)}/day incl. VAT{cur != null ? `; now ${fmtZar(cur, 2)}` : ""}{stepPct !== null ? ` (${stepPct >= 0 ? "+" : ""}${stepPct.toFixed(0)}%)` : ""}.
                      {stepPct !== null && stepPct > plan.guardrails.max_step_pct && !action.goLiveShareZar ? ` Increases above ${plan.guardrails.max_step_pct}% are refused at confirm.` : ""}
                      {action.goLiveShareZar ? " Go-live raise for one broker's share: the step limit is lifted for this raise only." : ""}
                    </p>
                  )}
                </>
              )}
              <label className="text-sm">Why? (required, goes in the audit log)
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <b className="mb-1 block">Preview</b>
              {Object.entries(confirm.preview || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><span className="text-muted-foreground">{k.replace(/_/g, " ")}</span><span className="tabular-nums">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></div>
              ))}
              {confirm.expires_at && <p className="mt-2 text-xs text-muted-foreground">Confirm before {fmtDayTime(confirm.expires_at)}.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setConfirm(null); }}>Cancel</Button>
            {!confirm
              ? <Button disabled={busy || reason.trim().length < 3 || (action?.kind === "set_campaign_budget" && !(budgetNum > 0))} onClick={preview}>Preview</Button>
              : <Button disabled={busy} onClick={apply}>Confirm</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsoleLayout>
  );
}
