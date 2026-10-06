import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase, Phone, Mail, Building2, Clock, CalendarClock, CheckCircle2, PlusCircle,
  AlertTriangle, ShoppingBag, Pencil, Save, X, PhoneCall, MessageSquare, StickyNote, Users, CircleDot,
  Sparkles, RefreshCw, Copy, History as HistoryIcon,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface Broker {
  id: string;
  firm_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone_number: string | null;
  status: string | null;
  tier: string | null;
  mgmt_stage: string | null;
  next_follow_up_at: string | null;
  created_at: string | null;
}
interface Activity {
  id: string;
  broker_id: string;
  activity_type: string;
  outcome: string | null;
  body: string | null;
  created_at: string | null;
}
interface Followup {
  id: string;
  broker_id: string;
  due_at: string;
  title: string;
  notes: string | null;
  status: string;
  completed_at: string | null;
}
interface OrderLite {
  id: string;
  title: string | null;
  lead_count: number | null;
  amount_zar: number | null;
  status: string | null;
}

// Broker lifecycle pipeline
const STAGES = ["New", "Contacted", "Proposal Sent", "Negotiating", "Active", "Lost"] as const;
const STAGE_COLOR: Record<string, string> = {
  New: "bg-blue-500",
  Contacted: "bg-indigo-500",
  "Proposal Sent": "bg-amber-500",
  Negotiating: "bg-purple-500",
  Active: "bg-green-500",
  Lost: "bg-red-500",
};
const ACTIVITY_TYPES = ["call", "email", "whatsapp", "meeting", "note", "other"] as const;
const OUTCOMES = ["reached", "no_answer", "voicemail", "callback_requested", "interested", "not_interested", "meeting_booked", "n/a"] as const;
const activityIcon = (t: string) =>
  t === "call" ? PhoneCall : t === "email" ? Mail : t === "whatsapp" || t === "meeting" ? MessageSquare : StickyNote;

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
};
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const isOverdue = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();
const formatZar = (cents: number | null) => `R${((cents ?? 0) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;

const BrokerManagement = () => {
  const { toast } = useToast();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFollowups, setOpenFollowups] = useState<Followup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Archived (Inactive) brokers are hidden from the working board by default.
  const [showArchived, setShowArchived] = useState(false);

  const loadBrokers = useCallback(async () => {
    const [{ data: bRows, error: bErr }, { data: fRows }] = await Promise.all([
      supabase.from("brokers").select("id, firm_name, contact_person, email, phone_number, status, tier, mgmt_stage, next_follow_up_at, created_at").order("created_at", { ascending: false }),
      (supabase as any).from("broker_followups").select("*").eq("status", "open"),
    ]);
    if (bErr) {
      toast({ title: "Error", description: "Couldn't load brokers.", variant: "destructive" });
    }
    setBrokers((bRows || []) as unknown as Broker[]);
    setOpenFollowups((fRows || []) as unknown as Followup[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadBrokers(); }, [loadBrokers]);

  const openCountByBroker = useMemo(() => {
    const m: Record<string, { total: number; overdue: number }> = {};
    for (const f of openFollowups) {
      const e = (m[f.broker_id] ||= { total: 0, overdue: 0 });
      e.total += 1;
      if (isOverdue(f.due_at)) e.overdue += 1;
    }
    return m;
  }, [openFollowups]);

  const activeBrokers = useMemo(
    () => (showArchived ? brokers : brokers.filter(b => b.status !== "Inactive")),
    [brokers, showArchived],
  );
  const archivedCount = useMemo(() => brokers.filter(b => b.status === "Inactive").length, [brokers]);

  const byStage = useMemo(() => {
    const g: Record<string, Broker[]> = {};
    for (const s of STAGES) g[s] = [];
    for (const b of activeBrokers) (g[b.mgmt_stage || "New"] ||= []).push(b);
    return g;
  }, [activeBrokers]);

  const overdueTotal = useMemo(() => openFollowups.filter((f) => isOverdue(f.due_at)).length, [openFollowups]);

  const brokerName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of brokers) m[b.id] = b.firm_name || "Unnamed firm";
    return m;
  }, [brokers]);

  const agenda = useMemo(
    () => [...openFollowups].sort((a, b) => a.due_at.localeCompare(b.due_at)),
    [openFollowups],
  );

  const completeFollowupInline = async (id: string) => {
    const { error } = await (supabase as any).from("broker_followups")
      .update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); return; }
    setOpenFollowups((prev) => prev.filter((f) => f.id !== id));
    toast({ title: "Follow-up done" });
  };

  const patchBroker = (id: string, patch: Partial<Broker>) =>
    setBrokers((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const selected = selectedId ? brokers.find((b) => b.id === selectedId) ?? null : null;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Broker Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage each broker through the pipeline — calls, notes, follow-ups and the leads attached to them.</p>
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
            >
              {showArchived ? `Hide ${archivedCount} archived` : `Show ${archivedCount} archived`}
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <div className="rounded-lg border border-white/10 bg-slate-900/50 px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">Brokers</p>
            <p className="text-xl font-bold text-white">{activeBrokers.length}</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">Prospects</p>
            <p className="text-xl font-bold text-amber-400">{activeBrokers.filter(b => b.status === "Prospect").length}</p>
          </div>
          <div className={`rounded-lg border px-4 py-2 text-center ${overdueTotal ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-slate-900/50"}`}>
            <p className="text-xs text-muted-foreground">Overdue follow-ups</p>
            <p className={`text-xl font-bold ${overdueTotal ? "text-red-400" : "text-white"}`}>{overdueTotal}</p>
          </div>
        </div>
      </div>

      {/* Follow-ups agenda */}
      <Card className="border-white/10 bg-slate-900/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Follow-ups {agenda.length > 0 && <span className="text-muted-foreground">({agenda.length})</span>}</h2>
            {overdueTotal > 0 && <Badge className="bg-red-500 text-[10px]">{overdueTotal} overdue</Badge>}
          </div>
          {agenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No follow-ups scheduled yet. Open a broker below and use <span className="text-foreground font-medium">Follow-ups → Add</span> to schedule your first callback or check-in.
            </p>
          ) : (
            <div className="space-y-2">
              {agenda.map((f) => {
                const over = isOverdue(f.due_at);
                return (
                  <div key={f.id} className={`rounded-lg border p-3 flex items-center justify-between gap-2 ${over ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-slate-900/60"}`}>
                    <button onClick={() => setSelectedId(f.broker_id)} className="min-w-0 text-left flex-1">
                      <p className="text-sm font-medium truncate">{f.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{brokerName[f.broker_id] || "Broker"}</p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs inline-flex items-center gap-1 ${over ? "text-red-400" : "text-muted-foreground"}`}>
                        {over ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {fmtDateTime(f.due_at)}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => completeFollowupInline(f.id)}><CheckCircle2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAGES.map((stage) => (
          <div key={stage} className="min-w-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STAGE_COLOR[stage]}`} /> {stage}
              </span>
              <span className="text-xs text-muted-foreground">{byStage[stage].length}</span>
            </div>
            <div className="space-y-2">
              {byStage[stage].length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 py-6 text-center text-[11px] text-muted-foreground/60">Empty</div>
              ) : (
                byStage[stage].map((b) => {
                  const fu = openCountByBroker[b.id];
                  const overdueNext = isOverdue(b.next_follow_up_at);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      className="w-full text-left rounded-lg border border-white/10 bg-slate-900/60 p-3 hover:border-primary/50 transition-colors"
                    >
                      <p className="font-semibold text-sm text-white truncate">{b.firm_name || "Unnamed firm"}</p>
                      {b.contact_person && <p className="text-xs text-muted-foreground truncate">{b.contact_person}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {b.status === "Inactive" ? (
                          <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px]">Archived</Badge>
                        ) : b.status === "Prospect" ? (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Prospect</Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Client</Badge>
                        )}
                        {b.tier && <Badge variant="outline" className="text-[10px]">{b.tier}</Badge>}
                        {fu?.total ? (
                          <span className={`text-[10px] inline-flex items-center gap-1 ${fu.overdue ? "text-red-400" : "text-muted-foreground"}`}>
                            <CalendarClock className="h-3 w-3" />{fu.total} follow-up{fu.total > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </div>
                      {b.next_follow_up_at && (
                        <p className={`text-[10px] mt-1.5 inline-flex items-center gap-1 ${overdueNext ? "text-red-400" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" /> Next: {fmtDateTime(b.next_follow_up_at)}{overdueNext ? " (overdue)" : ""}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      <BrokerDrawer
        broker={selected}
        onClose={() => setSelectedId(null)}
        onBrokerPatched={patchBroker}
        onFollowupsChanged={loadBrokers}
      />
    </div>
  );
};

// ── Detail drawer ───────────────────────────────────────────────────────────
const BrokerDrawer = ({
  broker,
  onClose,
  onBrokerPatched,
  onFollowupsChanged,
}: {
  broker: Broker | null;
  onClose: () => void;
  onBrokerPatched: (id: string, patch: Partial<Broker>) => void;
  onFollowupsChanged: () => void;
}) => {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // edit firm details
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firm_name: "", contact_person: "", email: "", phone_number: "" });

  // add activity
  const [actType, setActType] = useState<string>("call");
  const [actOutcome, setActOutcome] = useState<string>("reached");
  const [actBody, setActBody] = useState("");
  const [savingAct, setSavingAct] = useState(false);

  // add follow-up
  const [fuTitle, setFuTitle] = useState("");
  const [fuWhen, setFuWhen] = useState("");
  const [savingFu, setSavingFu] = useState(false);

  // Einstein coach + change history
  const [coach, setCoach] = useState<{ headline?: string; suggestions?: { action: string; why: string }[]; script?: string } | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!broker) return;
    setEditing(false);
    setForm({
      firm_name: broker.firm_name || "",
      contact_person: broker.contact_person || "",
      email: broker.email || "",
      phone_number: broker.phone_number || "",
    });
    setActType("call"); setActOutcome("reached"); setActBody("");
    setFuTitle(""); setFuWhen("");
    (async () => {
      setLoadingDetail(true);
      const [a, f, o] = await Promise.all([
        (supabase as any).from("broker_activities").select("*").eq("broker_id", broker.id).order("created_at", { ascending: false }),
        (supabase as any).from("broker_followups").select("*").eq("broker_id", broker.id).order("due_at", { ascending: true }),
        (supabase as any).from("lead_orders").select("id, title, lead_count, amount_zar, status").eq("broker_id", broker.id).order("created_at", { ascending: false }),
      ]);
      const acts = (a.data || []) as Activity[];
      const fups = (f.data || []) as Followup[];
      const ords = (o.data || []) as OrderLite[];
      setActivities(acts);
      setFollowups(fups);
      setOrders(ords);
      setLoadingDetail(false);

      // change history (paper trail) for this broker record
      const hist = await (supabase as any).from("audit_log").select("*").eq("record_id", broker.id).order("changed_at", { ascending: false }).limit(25);
      setHistory((hist.data || []) as any[]);

      // Einstein auto-surfaces its read on this broker as soon as you open them
      runCoach(broker, acts, fups, ords);
    })();
  }, [broker?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCoach = async (b: Broker, acts: Activity[], fups: Followup[], ords: OrderLite[]) => {
    setCoachLoading(true); setCoachError(null); setCoach(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-coach", {
        body: {
          context: {
            firm_name: b.firm_name, contact_person: b.contact_person, mgmt_stage: b.mgmt_stage,
            tier: b.tier, next_follow_up_at: b.next_follow_up_at,
            orders: ords,
            activities: acts.map(a => ({ activity_type: a.activity_type, outcome: a.outcome, body: a.body })),
            followups: fups.filter(f => f.status === "open").map(f => ({ title: f.title, due_at: f.due_at, overdue: isOverdue(f.due_at) })),
          },
        },
        headers: {
          "x-openrouter-key": (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "",
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.success === false) throw new Error((data as any).error || "Coach unavailable");
      setCoach(data as any);
    } catch (e: any) {
      setCoachError(e.message || "Couldn't reach Einstein");
    } finally {
      setCoachLoading(false);
    }
  };

  if (!broker) return <Sheet open={false} onOpenChange={(o) => !o && onClose()}><SheetContent /></Sheet>;

  // Tell the team (email to howzit@) what changed in the CRM.
  const notifyCrmChange = (table: string, recordId: string, label: string) => {
    supabase.functions.invoke("notify-crm-change", { body: { table, recordId, label } })
      .then(({ error }) => { if (error) console.error("notify-crm-change:", error); })
      .catch((e) => console.error("notify-crm-change failed:", e));
  };

  const updateBroker = async (patch: Partial<Broker>, label = "Broker record updated") => {
    const { error } = await supabase.from("brokers").update(patch as any).eq("id", broker.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return false; }
    onBrokerPatched(broker.id, patch);
    notifyCrmChange("brokers", broker.id, `${label} — ${broker.firm_name || "broker"}`);
    return true;
  };

  const saveDetails = async () => {
    const ok = await updateBroker({
      firm_name: form.firm_name.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone_number: form.phone_number.trim() || null,
    }, "Broker details edited");
    if (ok) { setEditing(false); toast({ title: "Details saved" }); }
  };

  const changeStage = async (stage: string) => {
    if (await updateBroker({ mgmt_stage: stage }, `Pipeline stage → ${stage}`)) toast({ title: `Moved to ${stage}` });
  };

  const setNextFollowUp = async (val: string) => {
    const iso = val ? new Date(val).toISOString() : null;
    await updateBroker({ next_follow_up_at: iso });
  };

  const addActivity = async () => {
    if (!actBody.trim() && actType === "note") return;
    setSavingAct(true);
    const { data, error } = await (supabase as any).from("broker_activities")
      .insert({ broker_id: broker.id, activity_type: actType, outcome: actType === "note" ? null : actOutcome, body: actBody.trim() || null })
      .select().single();
    setSavingAct(false);
    if (error) { toast({ title: "Couldn't log activity", description: error.message, variant: "destructive" }); return; }
    setActivities((prev) => [data as Activity, ...prev]);
    setActBody("");
    toast({ title: "Activity logged" });
  };

  const addFollowup = async () => {
    if (!fuTitle.trim() || !fuWhen) { toast({ title: "Add a title and a date", variant: "destructive" }); return; }
    setSavingFu(true);
    const dueIso = new Date(fuWhen).toISOString();
    const { data, error } = await (supabase as any).from("broker_followups")
      .insert({ broker_id: broker.id, title: fuTitle.trim(), due_at: dueIso, status: "open" })
      .select().single();
    setSavingFu(false);
    if (error) { toast({ title: "Couldn't schedule follow-up", description: error.message, variant: "destructive" }); return; }
    setFollowups((prev) => [...prev, data as Followup].sort((x, y) => x.due_at.localeCompare(y.due_at)));
    setFuTitle(""); setFuWhen("");
    // reflect on the card + keep the broker's "next follow-up" pointer fresh if sooner
    if (!broker.next_follow_up_at || dueIso < broker.next_follow_up_at) await updateBroker({ next_follow_up_at: dueIso });
    onFollowupsChanged();
    toast({ title: "Follow-up scheduled" });
  };

  const completeFollowup = async (id: string) => {
    const { error } = await (supabase as any).from("broker_followups").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); return; }
    setFollowups((prev) => prev.map((f) => (f.id === id ? { ...f, status: "done", completed_at: new Date().toISOString() } : f)));
    onFollowupsChanged();
  };

  const openFollowups = followups.filter((f) => f.status === "open");
  const doneFollowups = followups.filter((f) => f.status !== "open");

  return (
    <Sheet open={!!broker} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0 z-[120]">
        <SheetHeader className="p-6 pb-4 text-left space-y-2">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-xl leading-tight">{broker.firm_name || "Unnamed firm"}</SheetTitle>
            <Badge className={STAGE_COLOR[broker.mgmt_stage || "New"]}>{broker.mgmt_stage || "New"}</Badge>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {broker.status === "Inactive" ? (
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-xs">Archived</Badge>
            ) : broker.status === "Prospect" ? (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Prospect — no portal yet</Badge>
            ) : (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Client</Badge>
            )}
            {broker.tier && <Badge variant="outline" className="text-xs">{broker.tier}</Badge>}
            <button
              onClick={() => updateBroker(
                { status: broker.status === "Inactive" ? "Prospect" : "Inactive" } as Partial<Broker>,
                broker.status === "Inactive" ? "Broker restored" : "Broker archived",
              )}
              className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted"
            >
              {broker.status === "Inactive" ? "Restore" : "Archive"}
            </button>
          </SheetDescription>
        </SheetHeader>
        <Separator />

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Einstein coach — auto-surfaced the moment you open a broker */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Einstein — next move</h3>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={coachLoading}
                  onClick={() => runCoach(broker, activities, followups, orders)}>
                  <RefreshCw className={`h-3.5 w-3.5 ${coachLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {coachLoading ? (
                <p className="text-sm text-muted-foreground">Reading the relationship…</p>
              ) : coachError ? (
                <p className="text-sm text-muted-foreground">Einstein unavailable — {coachError}</p>
              ) : coach ? (
                <div className="space-y-3">
                  {coach.headline && <p className="text-sm font-medium">{coach.headline}</p>}
                  {(coach.suggestions || []).map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-primary font-bold text-xs mt-0.5">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-medium">{s.action}</p>
                        <p className="text-xs text-muted-foreground">{s.why}</p>
                      </div>
                    </div>
                  ))}
                  {coach.script && (
                    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ready to send</p>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                          onClick={() => { navigator.clipboard?.writeText(coach.script || ""); toast({ title: "Copied" }); }}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{coach.script}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No read yet.</p>
              )}
            </div>

            {/* Pipeline controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Pipeline stage</Label>
                <Select value={broker.mgmt_stage || "New"} onValueChange={changeStage}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Next follow-up</Label>
                <Input type="datetime-local" className="mt-1" defaultValue={toLocalInput(broker.next_follow_up_at)} onBlur={(e) => setNextFollowUp(e.target.value)} />
              </div>
            </div>

            {/* Firm details */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Details</h3>
                {editing ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                    <Button size="sm" onClick={saveDetails}><Save className="mr-1 h-4 w-4" /> Save</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <div><Label className="text-xs">Firm name</Label><Input value={form.firm_name} onChange={(e) => setForm({ ...form, firm_name: e.target.value })} /></div>
                  <div><Label className="text-xs">Contact person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                  <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></div>
                </div>
              ) : (
                <div className="text-sm space-y-1.5">
                  <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{broker.contact_person || "—"}</p>
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{broker.phone_number ? <a href={`tel:${broker.phone_number}`} className="text-primary hover:underline">{broker.phone_number}</a> : "—"}</p>
                  <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{broker.email ? <a href={`mailto:${broker.email}`} className="text-primary hover:underline break-all">{broker.email}</a> : "—"}</p>
                </div>
              )}
            </div>

            {/* Attached leads / orders */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><ShoppingBag className="h-4 w-4 text-primary" /> Attached leads</h3>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lead orders attached yet.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    <div key={o.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{o.title || "Lead order"}</p>
                        <p className="text-xs text-muted-foreground">{o.lead_count ?? 0} leads · {formatZar(o.amount_zar)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{o.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Follow-ups */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><CalendarClock className="h-4 w-4 text-primary" /> Follow-ups</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Input placeholder="What's the follow-up?" value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} className="flex-1" />
                <Input type="datetime-local" value={fuWhen} onChange={(e) => setFuWhen(e.target.value)} className="sm:w-52" />
                <Button onClick={addFollowup} disabled={savingFu}><PlusCircle className="mr-1 h-4 w-4" /> Add</Button>
              </div>
              {openFollowups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open follow-ups.</p>
              ) : (
                <div className="space-y-2">
                  {openFollowups.map((f) => {
                    const over = isOverdue(f.due_at);
                    return (
                      <div key={f.id} className={`rounded-lg border p-3 flex items-start justify-between gap-2 ${over ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-slate-900/40"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{f.title}</p>
                          <p className={`text-xs inline-flex items-center gap-1 ${over ? "text-red-400" : "text-muted-foreground"}`}>
                            {over ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {fmtDateTime(f.due_at)}{over ? " · overdue" : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => completeFollowup(f.id)}><CheckCircle2 className="mr-1 h-4 w-4" /> Done</Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {doneFollowups.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {doneFollowups.length} completed</p>
              )}
            </div>

            {/* Activity log */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><CircleDot className="h-4 w-4 text-primary" /> Activity & call log</h3>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-2 mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={actType} onValueChange={setActType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {actType !== "note" && (
                    <Select value={actOutcome} onValueChange={setActOutcome}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                <Textarea placeholder="What happened? What did they say? What's next?" value={actBody} onChange={(e) => setActBody(e.target.value)} rows={2} />
                <Button size="sm" onClick={addActivity} disabled={savingAct}><PlusCircle className="mr-1 h-4 w-4" /> {savingAct ? "Logging…" : "Log activity"}</Button>
              </div>
              {loadingDetail ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {activities.map((a) => {
                    const Icon = activityIcon(a.activity_type);
                    return (
                      <div key={a.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                          <span className="capitalize font-medium text-foreground">{a.activity_type}</span>
                          {a.outcome && <Badge variant="outline" className="text-[10px]">{a.outcome.replace(/_/g, " ")}</Badge>}
                          <span className="ml-auto">{fmtDateTime(a.created_at)}</span>
                        </div>
                        {a.body && <p className="text-sm whitespace-pre-wrap break-words">{a.body}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Change history — the paper trail */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><HistoryIcon className="h-4 w-4 text-primary" /> Change history</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] uppercase">{h.action}</Badge>
                        <span className="text-[11px] text-muted-foreground">{fmtDateTime(h.changed_at)}</span>
                      </div>
                      {h.changed_by_email && <p className="text-[11px] text-muted-foreground mb-1">by {h.changed_by_email}</p>}
                      {h.action === "UPDATE" && Array.isArray(h.changed_fields) ? (
                        <div className="space-y-0.5">
                          {h.changed_fields.filter((f: string) => f !== "updated_at").map((f: string) => (
                            <div key={f} className="text-xs">
                              <span className="font-semibold capitalize">{f.replace(/_/g, " ")}:</span>{" "}
                              <span className="text-red-400 line-through">{String(h.old_data?.[f] ?? "—")}</span>{" "}
                              <span className="text-muted-foreground">→</span>{" "}
                              <span className="text-green-400">{String(h.new_data?.[f] ?? "—")}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{h.action === "INSERT" ? "Broker record created." : "Record removed."}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default BrokerManagement;
