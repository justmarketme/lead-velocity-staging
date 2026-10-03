/**
 * Console · Ads (6.2/6.3). Reads ad_metrics (W21 hourly) + ad_objects (status/budget cache). Never calls Meta from the browser.
 * Writes are confirm-to-apply through n8n (automation/ads/CONSOLE-ADS-API.md): POST {base}/ads-confirm → preview → Confirm →
 * POST {base}/ads-ad-status | {base}/ads-budget with confirm_token + confirmed_by. Caps are loaded server-side, never sent from here.
 * Headline columns: cost per qualified lead and cost per attended meeting; raw CPL is secondary.
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
  | { kind: "pause_ad" | "resume_ad"; target: string; label: string }
  | { kind: "set_campaign_budget"; target: string; label: string; current: number | null };

const CODE_TEXT: Record<string, string> = {
  RATE_LIMIT_BACKOFF: "Meta is busy. Try again later.", DAILY_CAP: "That is above the daily cap.", MONTHLY_CAP: "That would go over the monthly cap.",
  STEP_LIMIT: "Budget increases are limited to 20% per step.", STEP_COOLDOWN: "Wait 48 h between budget increases.",
  BUDGET_BELOW_MIN: "Below Meta's minimum daily budget.", CONFIRM_EXPIRED: "The confirmation expired (15 min). Start again.",
  CONFIRM_MISMATCH: "The numbers changed after preview. Start again.", CAP_MISSING: "No cap is set for this campaign.",
};

export default function Ads() {
  const { userId } = useIsAdmin();
  const { toast } = useToast();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<SmcAdMetric[]>([]);
  const [objs, setObjs] = useState<SmcAdObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [budget, setBudget] = useState("");
  const [confirm, setConfirm] = useState<AdsConfirmResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const from = addDays(saDate(), -(days - 1));
    const [m, o] = await Promise.all([
      smcDb.from("ad_metrics").select("*").gte("date", from).order("date", { ascending: false }).limit(5000),
      smcDb.from("ad_objects").select("*").limit(2000),
    ]);
    setError(m.error ? errText(m.error) : null);
    setRows((m.data as SmcAdMetric[]) || []);
    setObjs((o.data as SmcAdObject[]) || []);
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const tree = useMemo(() => {
    const byId = new Map(objs.map((o) => [o.id, o]));
    const camps = new Map<string, CampRow>();
    for (const m of rows) {
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
    return [...camps.values()].sort((a, b) => b.sums.spend - a.sums.spend);
  }, [rows, objs]);
  const fetchedAt = useMemo(() => rows.reduce<string | null>((mx, r) => (!mx || r.synced_at > mx ? r.synced_at : mx), null), [rows]);

  function start(a: Action) {
    setAction(a); setReason(""); setConfirm(null);
    setBudget(a.kind === "set_campaign_budget" && a.current !== null ? String(a.current) : "");
  }
  function params(a: Action): Record<string, unknown> {
    if (a.kind === "pause_ad") return { status: "PAUSED" };
    if (a.kind === "resume_ad") return { status: "ACTIVE" };
    return { dailyBudgetZar: Number(budget), setSpendCap: true };
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
    const r = action.kind === "set_campaign_budget"
      ? await postWebhook<{ ok: boolean; code?: string; message?: string }>("ads-budget", { campaign_id: action.target, daily_budget_zar: Number(budget), set_spend_cap: true, confirm_token: confirm.confirm_token, confirmed_by: userId, go_live: false })
      : await postWebhook<{ ok: boolean; code?: string; message?: string }>("ads-ad-status", { ad_id: action.target, status: action.kind === "pause_ad" ? "PAUSED" : "ACTIVE", confirm_token: confirm.confirm_token, confirmed_by: userId });
    setBusy(false);
    if (!r.ok || r.data?.ok === false) {
      toast({ title: "Not applied", description: CODE_TEXT[r.data?.code || ""] || r.data?.message || r.error, variant: "destructive" });
      return;
    }
    toast({ title: "Applied", description: `${action.label}. Logged to the audit trail.` });
    setAction(null); setConfirm(null);
    void load();
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
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
            {tree.map((c) => (
              <Fragment key={c.id}>
                <tr className="border-b border-border bg-muted/30 font-semibold">
                  <td className="px-2 py-1.5"><button className="text-left hover:underline" onClick={() => setOpen({ ...open, [c.id]: !open[c.id] })}>{open[c.id] ? "▾" : "▸"} {c.name}</button></td>
                  <td className="px-2 py-1.5 text-xs">{c.obj?.effective_status || c.obj?.status || "n/a"}{c.obj?.daily_budget_zar ? ` · ${fmtZar(c.obj.daily_budget_zar)}/d` : ""}</td>
                  <Cells s={c.sums} />
                  <td className="px-2 py-1.5"><Button size="sm" variant="outline" onClick={() => start({ kind: "set_campaign_budget", target: c.id, label: `Budget for ${c.name}`, current: c.obj?.daily_budget_zar ?? null })}>Budget…</Button></td>
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
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Quality = mean adviser rating (1–5), shown from 5 ratings. Kill/scale rules only propose (Today → Do today); nothing here runs by itself.</p>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setConfirm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.label}</DialogTitle>
            <DialogDescription>Two steps: preview with caps, then confirm. Nothing changes at Meta until you tap Confirm.</DialogDescription>
          </DialogHeader>
          {!confirm ? (
            <div className="flex flex-col gap-2">
              {action?.kind === "set_campaign_budget" && (
                <label className="text-sm">New daily budget (R)
                  <Input type="number" inputMode="decimal" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
                </label>
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
              ? <Button disabled={busy || reason.trim().length < 3 || (action?.kind === "set_campaign_budget" && !(Number(budget) > 0))} onClick={preview}>Preview</Button>
              : <Button disabled={busy} onClick={apply}>Confirm</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsoleLayout>
  );
}
