/**
 * Admin broker drawer: Campaigns (link to a brand, plan order, proof of payment -> paid), Calendar (Outlook connection) and
 * Go live (checklist from admin_broker_go_live_check, Go live / Pause through admin_broker_go_live / admin_broker_pause).
 * Every rule is evaluated in the database; this component only shows the answer and calls the RPCs
 * (supabase/migrations/20261013090000_broker_go_live.sql).
 */
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarCheck, CheckCircle2, Circle, Copy, Megaphone, Pause, PlusCircle, Rocket, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errText, smcDb } from "@/lib/smc";
import { zar } from "@/lib/pricing";
import { enrolBrokerInBrand } from "@/lib/brokerCampaign";
import { loadBrands, type Brand } from "./orderBrands";
import NewOrderDialog from "./NewOrderDialog";

interface Check { key: string; label: string; ok: boolean; hard: boolean; reason: string }
interface GoLive { ready: boolean; live: boolean; status: string | null; routing_on: boolean; approved_live_at: string | null; checks: Check[] }
interface Row {
  brand_id: string | null; status: string | null; routing_on: boolean | null; calendar_status: string | null; calendar_email: string | null;
  calendar_status_at: string | null; calendar_status_detail: Record<string, unknown> | null; calendar_mode: string | null;
  add_client_as_attendee: boolean | null;
}
interface Cap { lead_order_id: string; title: string | null; status: string; lead_count: number; remaining: number; capacity: number; counted: number; paid_at: string | null }
interface OrderAmt { id: string; amount_zar: number | null }
interface Pop { id: string; name: string | null; created_at: string | null; content_data: { amount_zar?: number; paid_on?: string; reference?: string; order_id?: string | null } | null }

/** The broker portal's calendar page (ms-oauth always lands there). Copied, never sent. */
const CONNECT_PATH = "/broker/calendar";

export function calendarLabel(r: Pick<Row, "calendar_status" | "calendar_email" | "calendar_mode" | "calendar_status_detail">): { text: string; tone: "ok" | "warn" | "off" } {
  const account = r.calendar_email || (typeof r.calendar_status_detail?.account === "string" ? (r.calendar_status_detail.account as string) : null);
  if (r.calendar_mode === "shared_fallback") return { text: "Using the shared Lead Velocity calendar", tone: "warn" };
  switch (r.calendar_status) {
    case "ok": return { text: `Outlook connected${account ? ` as ${account}` : ""}`, tone: "ok" };
    case "needs_reconnect": return { text: "Needs reconnect", tone: "warn" };
    case "blocked_admin_consent": return { text: "Needs his IT admin's approval", tone: "warn" };
    default: return { text: "Not connected", tone: "off" };
  }
}

export default function BrokerGoLivePanel({ brokerId, brokerLabel, onChanged }: { brokerId: string; brokerLabel: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [row, setRow] = useState<Row | null>(null);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [pops, setPops] = useState<Pop[]>([]);
  const [gl, setGl] = useState<GoLive | null>(null);
  const [glErr, setGlErr] = useState<string | null>(null);
  const [pickBrand, setPickBrand] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [confirm, setConfirm] = useState<"golive" | "pause" | null>(null);

  const load = useCallback(async () => {
    const [b, br, cp, po, g] = await Promise.all([
      smcDb.from("brokers").select("brand_id, status, routing_on, calendar_status, calendar_email, calendar_status_at, calendar_status_detail, calendar_mode, add_client_as_attendee").eq("id", brokerId).maybeSingle(),
      loadBrands(),
      smcDb.from("smc_order_capacity").select("lead_order_id, title, status, lead_count, remaining, capacity, counted, paid_at").eq("broker_id", brokerId).order("created_at", { ascending: false }),
      smcDb.from("admin_documents").select("id, name, created_at, content_data").eq("broker_id", brokerId).eq("kind", "proof_of_payment").order("created_at", { ascending: false }),
      smcDb.rpc("admin_broker_go_live_check", { p_broker_id: brokerId }),
    ]);
    setRow((b.data as Row) || null);
    setBrands(br);
    const capRows = (cp.data as Cap[]) || [];
    setCaps(capRows);
    if (capRows.length) {
      const { data } = await smcDb.from("lead_orders").select("id, amount_zar").in("id", capRows.map((c) => c.lead_order_id));
      setAmounts(Object.fromEntries(((data as OrderAmt[]) || []).map((o) => [o.id, o.amount_zar])));
    } else setAmounts({});
    setPops((po.data as Pop[]) || []);
    setGl(g.error ? null : (g.data as GoLive));
    setGlErr(g.error ? errText(g.error) : null);
  }, [brokerId]);

  useEffect(() => { setRow(null); setGl(null); setPickBrand(""); setConfirm(null); void load(); }, [load]);

  const refresh = async () => { await load(); onChanged?.(); };
  const brand = brands?.find((x) => x.id === row?.brand_id) || null;
  const activeBrands = (brands || []).filter((x) => x.is_active);

  async function link() {
    if (!pickBrand) return;
    setBusy("link");
    const { error } = await enrolBrokerInBrand(brokerId, pickBrand);
    setBusy(null);
    if (error) return toast({ title: "Could not link the campaign", description: error, variant: "destructive" });
    toast({ title: `Linked to ${activeBrands.find((x) => x.id === pickBrand)?.name || "the campaign"}`, description: "Routing stays off until you press Go live." });
    await refresh();
  }

  async function attach(orderId: string, docId: string) {
    setBusy(`pay-${orderId}`);
    const { error } = await smcDb.rpc("admin_attach_payment_and_mark_paid", { p_order_id: orderId, p_document_id: docId });
    setBusy(null);
    if (error) return toast({ title: "Could not mark the order paid", description: errText(error), variant: "destructive" });
    toast({ title: "Order marked paid", description: "The proof of payment is linked to the order." });
    await refresh();
  }

  async function goLive() {
    setBusy("golive");
    const { data, error } = await smcDb.rpc("admin_broker_go_live", { p_broker_id: brokerId });
    setBusy(null); setConfirm(null);
    if (error) return toast({ title: "Not switched live", description: errText(error), variant: "destructive" });
    setGl(data as GoLive);
    toast({ title: `${brokerLabel} is live`, description: "Routing is on. Leads can now reach him." });
    await refresh();
  }

  async function pause() {
    setBusy("pause");
    const { data, error } = await smcDb.rpc("admin_broker_pause", { p_broker_id: brokerId, p_reason: null });
    setBusy(null); setConfirm(null);
    if (error) return toast({ title: "Could not pause", description: errText(error), variant: "destructive" });
    setGl(data as GoLive);
    toast({ title: `${brokerLabel} paused`, description: "Routing is off. No new leads reach him until you press Go live again." });
    await refresh();
  }

  async function setOutlookInvite(on: boolean) {
    setBusy("invite");
    const { error } = await smcDb.from("brokers").update({ add_client_as_attendee: on }).eq("id", brokerId);
    setBusy(null);
    if (error) return toast({ title: "Not saved", description: errText(error), variant: "destructive" });
    setRow((r) => (r ? { ...r, add_client_as_attendee: on } : r));
    toast({ title: on ? "Invites go from his Outlook" : "Invites go from howzit@", description: on ? "Clients get the meeting request from his own mailbox, with the Teams link." : "Clients get the invite email from howzit@leadvelocity.co.za." });
  }

  async function copyConnect() {
    const url = `${window.location.origin}${CONNECT_PATH}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Connect link copied", description: `${url}: send it to ${brokerLabel} yourself. He signs in to his portal, then taps Connect.` }); }
    catch { toast({ title: "Copy this link", description: url }); }
  }

  if (!row) return null;
  const cal = calendarLabel(row);
  const unlinkedPops = pops.filter((p) => !p.content_data?.order_id);
  const hardFails = (gl?.checks || []).filter((c) => c.hard && !c.ok).length;
  const canPause = !!gl && (gl.routing_on || gl.status === "active");

  return (
    <div className="space-y-6">
      {/* Campaigns */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Megaphone className="h-4 w-4 text-primary" /> Campaigns</h3>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-3 text-sm">
          {brand ? (
            <p className="flex flex-wrap items-center gap-2">Linked to <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{brand.name}</Badge></p>
          ) : brands === null ? (
            <p className="text-muted-foreground">Campaigns are not set up in this database.</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={pickBrand} onValueChange={setPickBrand}>
                <SelectTrigger className="sm:w-56" aria-label="Campaign"><SelectValue placeholder="Pick a campaign" /></SelectTrigger>
                <SelectContent className="z-[130]">{activeBrands.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={link} disabled={!pickBrand || busy === "link"}>{busy === "link" ? "Linking…" : "Link to campaign"}</Button>
            </div>
          )}
          {brand && (
            <>
              {caps.length === 0 ? (
                <p className="text-muted-foreground">No {brand.name} order yet.</p>
              ) : (
                <div className="space-y-2">
                  {caps.map((c) => {
                    const cents = amounts[c.lead_order_id];
                    return (
                      <div key={c.lead_order_id} className="rounded-md border border-white/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium truncate">{c.title || "Order"}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">{c.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.lead_count} leads{cents != null ? ` · ${zar(cents / 100)}` : ""}{c.status === "paid" ? ` · ${c.remaining} of ${c.capacity} still to deliver` : ""}
                          {c.paid_at ? ` · paid ${new Date(c.paid_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                        </p>
                        {c.status !== "paid" && c.status !== "cancelled" && (
                          unlinkedPops.length ? unlinkedPops.map((p) => {
                            const mismatch = cents != null && p.content_data?.amount_zar != null && Math.round(cents / 100) !== Math.round(Number(p.content_data.amount_zar));
                            return (
                              <div key={p.id} className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded bg-white/5 p-2">
                                <span className="text-xs">
                                  Proof of payment: {p.content_data?.amount_zar != null ? zar(Number(p.content_data.amount_zar)) : "amount not entered"}
                                  {p.content_data?.paid_on ? `, paid ${p.content_data.paid_on}` : ""}
                                  {mismatch && <span className="text-amber-300"> (does not match the order amount)</span>}
                                </span>
                                <Button size="sm" className="h-7 text-xs" disabled={busy === `pay-${c.lead_order_id}`} onClick={() => attach(c.lead_order_id, p.id)}>
                                  {busy === `pay-${c.lead_order_id}` ? "Saving…" : "Attach and mark paid"}
                                </Button>
                              </div>
                            );
                          }) : <p className="mt-1 text-xs text-muted-foreground">No proof of payment uploaded yet (Documents, below), or mark it paid in Orders &amp; Activity.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => setOrderOpen(true)}><PlusCircle className="mr-1 h-4 w-4" /> Create plan order</Button>
            </>
          )}
        </div>
        <NewOrderDialog open={orderOpen} onOpenChange={setOrderOpen} brands={brands} initialBrokerId={brokerId} initialBrandId={row.brand_id}
          initialPlan="SMC_BRONZE" onCreated={() => { toast({ title: "Order created", description: "Pending until it is marked paid." }); void refresh(); }} />
      </div>

      {/* Calendar */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><CalendarCheck className="h-4 w-4 text-primary" /> Calendar</h3>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={cal.tone === "ok" ? "text-emerald-400" : cal.tone === "warn" ? "text-amber-300" : "text-muted-foreground"}>{cal.text}</p>
            <p className="text-xs text-muted-foreground">
              {row.calendar_status_at ? `Updated ${formatDistanceToNow(new Date(row.calendar_status_at), { addSuffix: true })}` : "Never connected"}
              {!row.brand_id ? " · He can connect once linked to a campaign." : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={copyConnect}><Copy className="mr-1 h-4 w-4" /> Copy connect link</Button>
        </div>
        <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/40 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="outlook-invite" className="text-sm font-medium">Invite clients from his Outlook</Label>
            <p className="text-xs text-muted-foreground">
              On: the client gets the meeting request (with the Teams link) from {brokerLabel}'s own mailbox. Off, or while his calendar is not connected: the invite email comes from howzit@leadvelocity.co.za.
            </p>
          </div>
          <Switch id="outlook-invite" checked={row.add_client_as_attendee !== false} disabled={busy === "invite"} onCheckedChange={setOutlookInvite} />
        </div>
      </div>

      {/* Go live */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Rocket className="h-4 w-4 text-primary" /> Go live</h3>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-3">
          {glErr ? <p className="text-sm text-destructive">{glErr}</p> : !gl ? <p className="text-sm text-muted-foreground">Checking…</p> : (
            <>
              <p className="text-sm">
                {gl.live ? <span className="text-emerald-400 font-medium">Live: leads are routed to him{gl.approved_live_at ? ` since ${new Date(gl.approved_live_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}` : ""}.</span>
                  : gl.ready ? <span className="text-emerald-400">Ready to go live.</span>
                  : <span className="text-amber-300">{hardFails} thing{hardFails === 1 ? "" : "s"} to finish before he can go live.</span>}
              </p>
              <ul className="space-y-1.5">
                {gl.checks.map((c) => (
                  <li key={c.key} className="flex gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-label="done" />
                      : c.hard ? <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-label="missing" />
                      : <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" aria-label="warning" />}
                    <span className="min-w-0"><b className="font-medium">{c.label}</b>{!c.hard && <span className="text-muted-foreground"> (not required)</span>}<span className="block text-xs text-muted-foreground">{c.reason}</span></span>
                  </li>
                ))}
              </ul>
              {confirm ? (
                <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-sm space-y-2">
                  <p>{confirm === "golive" ? `Switch ${brokerLabel} live? Leads start routing to him straight away.` : `Pause ${brokerLabel}? No new leads reach him until you press Go live again.`}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={confirm === "golive" ? goLive : pause} disabled={!!busy}>{busy ? "Saving…" : confirm === "golive" ? "Yes, go live" : "Yes, pause"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={!!busy}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!gl.ready || gl.live} onClick={() => setConfirm("golive")} title={gl.ready ? "" : "Finish the red items first"}>
                    <Rocket className="mr-1 h-4 w-4" /> Go live
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canPause} onClick={() => setConfirm("pause")}><Pause className="mr-1 h-4 w-4" /> Pause</Button>
                </div>
              )}
              {!gl.ready && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Circle className="h-3 w-3" /> The database re-checks every item when you press Go live.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
