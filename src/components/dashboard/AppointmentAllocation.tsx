/**
 * Appointments awaiting allocation (admin).
 * Clients whose broker has no connected calendar submit an appointment REQUEST (appointments.status = 'requested',
 * no broker/date yet). An admin allocates it to a broker with a date/time; the `appointment-allocation` edge function
 * then puts it on the broker's calendar (Outlook via Graph if connected, else an emailed .ics invite) and confirms
 * with the client. All times are South African (Africa/Johannesburg, UTC+2, no DST).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CalendarCheck, Phone, Mail, Clock, Video, AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { AGE_LABEL, BUDGET_LABEL, addDays, errText, fmtDay, fmtDayTime, fmtTime, methodLabel, saDate, smcDb } from "@/lib/smc";
import { safeJoinUrl } from "@/lib/smcMsConnect";

// ---------------------------------------------------------------- types
interface RequestedWindow { date?: string | null; part?: string | null; label?: string | null }

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  age_band: string | null;
  budget_band: string | null;
  reasons: unknown;
  product_interest: unknown;
  lead_tier: string | null;
  broker_id: string | null;
  stage: string | null;
  is_synthetic: boolean | null;
  best_time: string | null;
}

interface Appt {
  id: string;
  client_id: string | null;
  broker_id: string | null;
  status: string;
  appointment_date: string | null;
  ends_at: string | null;
  method: string | null;
  requested_windows: RequestedWindow[] | null;
  request_source: string | null;
  consent_ref: string | null;
  requested_at: string | null;
  allocated_at: string | null;
  calendar_email: string | null;
  calendar_provider: string | null;
  invite_email_status: string | null;
  join_url: string | null;
  client: Client | null;
  broker: { id: string; contact_person: string | null; firm_name: string | null } | null;
}

interface Broker {
  id: string;
  contact_person: string | null;
  firm_name: string | null;
  email: string | null;
  calendar_email: string | null;
  calendar_status: string | null;
  brand_id: string | null;
  status: string | null;
}

interface AllocateResponse {
  ok: true;
  reallocated?: boolean;
  delivery?: { calendar: "graph" | "ics_email" | "failed"; to?: string; join_url?: string | null; error?: string };
  client_confirmation?: { channel: "whatsapp" | "email" | "none"; status: "sent" | "dry_run" | "failed" | "skipped"; detail?: string };
}

// ---------------------------------------------------------------- constants + helpers
const MARK_WESTON_ID = "306062a1-c271-4ae1-8b1e-bb9aed10a5f6";
const SELECT_APPT = [
  "id, client_id, broker_id, status, appointment_date, ends_at, method, requested_windows, request_source, consent_ref,",
  "requested_at, allocated_at, calendar_email, calendar_provider, invite_email_status, join_url,",
  "client:leads!client_id(id, first_name, last_name, phone, email, age_band, budget_band, reasons, product_interest, lead_tier, broker_id, stage, is_synthetic, best_time),",
  "broker:brokers!broker_id(id, contact_person, firm_name)",
].join(" ");

const SOURCE_LABEL: Record<string, string> = {
  page: "Website", whatsapp: "WhatsApp", voice: "Voice call", console: "CRM", flow: "WhatsApp Flow",
};
const PART_LABEL: Record<string, string> = {
  morning: "morning", mornings: "morning", lunchtime: "lunchtime", afternoon: "afternoon", afternoons: "afternoon",
  evening: "evening", evenings: "evening", any: "any time",
};
const PART_TIME: Record<string, string> = {
  morning: "10:00", mornings: "10:00", lunchtime: "12:30", afternoon: "14:00", afternoons: "14:00", evening: "17:30", evenings: "17:30",
};
const METHODS = [
  { value: "teams", label: "Teams" },
  { value: "phone", label: "Phone call" },
  { value: "whatsapp_call", label: "WhatsApp call" },
];
const DURATIONS = ["15", "30", "45", "60"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clientName = (a: Appt) => [a.client?.first_name, a.client?.last_name].filter(Boolean).join(" ") || "Unnamed client";
const brokerName = (b: { contact_person: string | null; firm_name: string | null } | null | undefined) =>
  b?.contact_person || b?.firm_name || "Unnamed broker";
const isOutlook = (b: Broker | undefined) => b?.calendar_status === "ok";
const windows = (a: Appt): RequestedWindow[] => (Array.isArray(a.requested_windows) ? a.requested_windows : []);

/** "Wed, 15 Oct · morning" / "Any weekday · afternoon". Dates are SA calendar dates, so pin them to SAST noon. */
function windowLabel(w: RequestedWindow): string {
  if (w.label) return w.label;
  const day = w.date ? fmtDay(`${w.date}T12:00:00+02:00`) : "Any weekday";
  const part = w.part ? PART_LABEL[w.part] || w.part : "any time";
  return `${day} · ${part}`;
}

function textList(v: unknown): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.filter(Boolean).map((x) => String(x).replace(/_/g, " ")).join(", ");
  return String(v).replace(/_/g, " ");
}

function leadSummary(c: Client | null): string {
  if (!c) return "";
  return [
    c.age_band ? `Age ${AGE_LABEL[c.age_band] || c.age_band}` : "",
    c.budget_band ? `Budget ${BUDGET_LABEL[c.budget_band] || c.budget_band}` : "",
    textList(c.reasons),
    textList(c.product_interest),
    c.lead_tier ? `Tier ${c.lead_tier}` : "",
  ].filter(Boolean).join(" · ");
}

/** Next Monday-to-Friday date after today (SA). */
function nextWeekday(): string {
  let d = addDays(saDate(), 1);
  for (;;) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
}

const timeAgo = (ts: string | null) => {
  if (!ts) return "";
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return ""; }
};

/** Invoke the edge function; normalise both `{ ok:false }` bodies and non-2xx errors into a thrown Error. */
async function callAllocation<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("appointment-allocation", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ message?: string; error?: string }> } }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        msg = j?.message || j?.error || msg;
      }
    } catch { /* body not JSON: keep the generic message */ }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.message || data?.error || "The request failed.");
  return data as T;
}

const announceChange = () => window.dispatchEvent(new Event("appointments:changed"));

// ---------------------------------------------------------------- main component
export default function AppointmentAllocation() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<Appt[]>([]);
  const [scheduled, setScheduled] = useState<Appt[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allocating, setAllocating] = useState<Appt | null>(null);
  const [cancelling, setCancelling] = useState<Appt | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [req, sch, brk] = await Promise.all([
      smcDb.from("appointments").select(SELECT_APPT)
        .eq("status", "requested").not("brand_id", "is", null)
        .order("requested_at", { ascending: true, nullsFirst: false }),
      smcDb.from("appointments").select(SELECT_APPT)
        .in("status", ["booked", "confirmed"]).not("brand_id", "is", null)
        .not("allocated_at", "is", null).gte("appointment_date", since)
        .order("appointment_date", { ascending: true }),
      smcDb.from("brokers").select("id, contact_person, firm_name, email, calendar_email, calendar_status, brand_id, status"),
    ]);
    const err = req.error || sch.error || brk.error;
    if (err) setLoadError(errText(err));
    setRequests(req.error ? [] : ((req.data || []) as unknown as Appt[]));
    setScheduled(sch.error ? [] : ((sch.data || []) as unknown as Appt[]));
    const list = (brk.error ? [] : ((brk.data || []) as Broker[])).sort((a, b) => {
      const smc = Number(!!b.brand_id) - Number(!!a.brand_id);
      return smc || brokerName(a).localeCompare(brokerName(b));
    });
    setBrokers(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const afterChange = () => { announceChange(); load(); };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" /> Appointments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Requests from clients whose broker's calendar isn't connected. Allocate one to put it on a broker's calendar and confirm it with the client.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg border px-4 py-2 text-center ${requests.length ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-slate-900/50"}`}>
            <p className="text-xs text-muted-foreground">Awaiting</p>
            <p className={`text-xl font-bold ${requests.length ? "text-amber-400" : "text-white"}`}>{requests.length}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/50 px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">Scheduled</p>
            <p className="text-xl font-bold text-white">{scheduled.length}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => load()} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <p className="text-sm text-red-300 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Couldn't load appointments: {loadError}</p>
            <Button size="sm" variant="outline" onClick={() => load()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ awaiting allocation */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Awaiting allocation ({requests.length})</h2>
        {requests.length === 0 ? (
          <Card className="border-white/10 bg-slate-900/40">
            <CardContent className="py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No appointment requests waiting. New ones appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {requests.map((a) => {
              const summary = leadSummary(a.client);
              const ws = windows(a);
              return (
                <div key={a.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm text-white">{clientName(a)}</p>
                        {a.client?.is_synthetic && <Badge variant="outline" className="text-[10px] border-fuchsia-500/50 text-fuchsia-300">Synthetic</Badge>}
                        {a.request_source && (
                          <Badge className="bg-blue-500 text-[10px]">{SOURCE_LABEL[a.request_source] || a.request_source}</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />requested {timeAgo(a.requested_at)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />
                          {a.client?.phone ? <a href={`tel:${a.client.phone}`} className="text-primary hover:underline">{a.client.phone}</a> : "no phone"}</span>
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />
                          {a.client?.email ? <a href={`mailto:${a.client.email}`} className="text-primary hover:underline break-all">{a.client.email}</a> : "no email"}</span>
                      </div>
                      {summary && <p className="text-xs text-slate-300">{summary}</p>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Wants:</span>
                        {ws.length ? ws.map((w, i) => (
                          <Badge key={i} variant="outline" className="text-[11px] font-normal">{windowLabel(w)}</Badge>
                        )) : <span className="text-xs text-slate-300">{a.client?.best_time || "any time"}</span>}
                        <span className="text-xs text-muted-foreground ml-2">by</span>
                        <span className="text-xs text-slate-300">{methodLabel(a.method) || "no preference"}</span>
                      </div>
                      {a.consent_ref && <p className="text-[10px] text-muted-foreground/70 break-all">Consent: {a.consent_ref}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => setAllocating(a)} disabled={!brokers.length}>Allocate</Button>
                      <Button size="sm" variant="outline" onClick={() => setCancelling(a)}>Cancel request</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ scheduled */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Scheduled (allocated)</h2>
        {scheduled.length === 0 ? (
          <Card className="border-white/10 bg-slate-900/40">
            <CardContent className="py-10 text-center">
              <CalendarCheck className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nothing allocated is coming up.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {scheduled.map((a) => {
              const link = safeJoinUrl(a.join_url);
              return (
                <div key={a.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="w-36 shrink-0">
                      <p className="font-semibold text-sm text-white">{fmtDay(a.appointment_date)}</p>
                      <p className="text-xs text-muted-foreground">{fmtTime(a.appointment_date)}{a.ends_at ? `–${fmtTime(a.ends_at)}` : ""} SAST</p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm text-white">
                        <span className="font-semibold">{clientName(a)}</span>
                        {a.client?.is_synthetic && <Badge variant="outline" className="ml-2 text-[10px] border-fuchsia-500/50 text-fuchsia-300">Synthetic</Badge>}
                        <span className="text-muted-foreground"> with </span>
                        <span>{brokerName(a.broker)}</span>
                        {a.broker?.firm_name && a.broker?.contact_person && <span className="text-muted-foreground"> · {a.broker.firm_name}</span>}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{methodLabel(a.method) || "Teams"}</span>
                        <Badge className={`${a.status === "confirmed" ? "bg-green-500" : "bg-indigo-500"} text-[10px] capitalize`}>{a.status}</Badge>
                        <span>{a.calendar_provider === "outlook" ? "In Outlook" : a.calendar_email ? `Invite emailed to ${a.calendar_email}` : "No calendar delivery recorded"}</span>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            <Video className="h-3 w-3" />Join link
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setAllocating(a)} disabled={!brokers.length}>Re-allocate</Button>
                      <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => setCancelling(a)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AllocateDialog
        appt={allocating}
        brokers={brokers}
        onClose={() => setAllocating(null)}
        onDone={(msg) => { toast(msg); setAllocating(null); afterChange(); }}
      />
      <CancelDialog
        appt={cancelling}
        onClose={() => setCancelling(null)}
        onDone={(msg) => { toast(msg); setCancelling(null); afterChange(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- allocate / re-allocate dialog
type ToastMsg = { title: string; description?: string; variant?: "default" | "destructive" };

function defaultBrokerId(a: Appt, brokers: Broker[]): string {
  const has = (id: string | null | undefined) => !!id && brokers.some((b) => b.id === id);
  if (a.status !== "requested" && has(a.broker_id)) return a.broker_id as string;
  if (has(a.client?.broker_id)) return a.client?.broker_id as string;
  if (has(MARK_WESTON_ID)) return MARK_WESTON_ID;
  return brokers.find((b) => b.brand_id)?.id || brokers[0]?.id || "";
}

const brokerEmail = (b: Broker | undefined) => b?.calendar_email || b?.email || "";

function AllocateDialog({ appt, brokers, onClose, onDone }: {
  appt: Appt | null;
  brokers: Broker[];
  onClose: () => void;
  onDone: (msg: ToastMsg) => void;
}) {
  const [brokerId, setBrokerId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [method, setMethod] = useState("teams");
  const [email, setEmail] = useState("");
  const [inviteClient, setInviteClient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = saDate();

  // Prefill whenever a row is opened.
  useEffect(() => {
    if (!appt) return;
    setFormError(null);
    setBusy(false);
    const bId = defaultBrokerId(appt, brokers);
    setBrokerId(bId);
    const reallocating = appt.status !== "requested" && !!appt.appointment_date;
    if (reallocating && appt.appointment_date) {
      setDate(saDate(new Date(appt.appointment_date)));
      setTime(fmtTime(appt.appointment_date));
      const mins = appt.ends_at ? Math.round((new Date(appt.ends_at).getTime() - new Date(appt.appointment_date).getTime()) / 60000) : 30;
      setDuration(DURATIONS.includes(String(mins)) ? String(mins) : "30");
      setEmail(appt.calendar_email || brokerEmail(brokers.find((b) => b.id === bId)));
    } else {
      const ws = windows(appt);
      const dated = ws.find((w) => w.date && w.date >= today);
      setDate(dated?.date || nextWeekday());
      const part = (dated || ws[0])?.part || "";
      setTime(PART_TIME[part] || "10:00");
      setDuration("30");
      setEmail(brokerEmail(brokers.find((b) => b.id === bId)));
    }
    setMethod(METHODS.some((m) => m.value === appt.method) ? (appt.method as string) : "teams");
    setInviteClient(!!appt.client?.email);
  }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const broker = brokers.find((b) => b.id === brokerId);
  const smcBrokers = useMemo(() => brokers.filter((b) => b.brand_id), [brokers]);
  const otherBrokers = useMemo(() => brokers.filter((b) => !b.brand_id), [brokers]);
  const clientHasEmail = !!appt?.client?.email;
  const routedElsewhere = !!appt?.client?.broker_id && !!brokerId && appt.client.broker_id !== brokerId;
  const reallocating = !!appt && appt.status !== "requested";

  const changeBroker = (id: string) => {
    setBrokerId(id);
    setEmail(brokerEmail(brokers.find((b) => b.id === id)));
  };

  const submit = async () => {
    if (!appt) return;
    if (!brokerId) return setFormError("Choose a broker.");
    if (!date || date < today) return setFormError("Choose a date from today onwards.");
    if (!/^\d{2}:\d{2}$/.test(time)) return setFormError("Choose a time.");
    if (!EMAIL_RE.test(email.trim())) return setFormError("Enter a valid broker email.");
    setFormError(null);
    setBusy(true);
    try {
      const res = await callAllocation<AllocateResponse>({
        action: "allocate",
        appointment_id: appt.id,
        broker_id: brokerId,
        start: `${date}T${time}:00+02:00`,
        duration_minutes: Number(duration),
        method,
        broker_email: email.trim(),
        invite_client: clientHasEmail && inviteClient,
      });
      const d = res.delivery as AllocateResponse["delivery"] & { invite_ics?: string };
      // The email didn't go: hand the admin the same invite to forward by hand (attach it to an email to the broker).
      let downloaded = false;
      if (d?.calendar === "failed" && d.invite_ics) {
        try {
          const url = URL.createObjectURL(new Blob([d.invite_ics], { type: "text/calendar;charset=utf-8;method=REQUEST" }));
          const link = document.createElement("a");
          link.href = url; link.download = `sortmycover-invite-${appt.id.slice(0, 8)}.ics`;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          downloaded = true;
        } catch { /* ignore */ }
      }
      const cal = d?.calendar === "graph" ? "In their Outlook"
        : d?.calendar === "ics_email" ? `Invite emailed to ${d.to || email.trim()}`
        : d?.calendar === "failed" ? `Invite email failed${d.error ? ` (${d.error})` : ""}${downloaded ? " — the .ics was downloaded: email it to the broker" : ""}` : "";
      const cc = res.client_confirmation;
      const channel = cc?.channel === "whatsapp" ? "WhatsApp" : cc?.channel === "email" ? "Email" : "";
      const status = cc?.status === "dry_run" ? "dry run" : cc?.status || "";
      const client = cc ? (cc.channel === "none" || cc.status === "skipped" ? "Client: not notified" : `Client: ${channel} ${status}`.trim()) : "";
      onDone({
        title: `${res.reallocated ? "Re-allocated" : "Allocated"} to ${brokerName(broker)}`,
        description: [cal, client, cc?.status === "failed" && cc.detail ? cc.detail : ""].filter(Boolean).join(" · "),
        variant: d?.calendar === "failed" ? "destructive" : "default",
      });
    } catch (e) {
      setFormError(errText(e));
      setBusy(false);
    }
  };

  const brokerOption = (b: Broker) => (
    <SelectItem key={b.id} value={b.id}>
      {brokerName(b)}{b.firm_name && b.contact_person ? ` · ${b.firm_name}` : ""} — {isOutlook(b) ? "Outlook connected" : "Not connected"}
    </SelectItem>
  );

  return (
    <Dialog open={!!appt} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reallocating ? "Re-allocate" : "Allocate"} appointment</DialogTitle>
          <DialogDescription>
            {appt ? clientName(appt) : ""}
            {appt && windows(appt).length ? ` · wants ${windows(appt).map(windowLabel).join(", ")}` : ""}
            {reallocating && appt?.appointment_date ? ` · now ${fmtDayTime(appt.appointment_date)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Broker</Label>
            <Select value={brokerId} onValueChange={changeBroker}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a broker" /></SelectTrigger>
              <SelectContent>
                {smcBrokers.length > 0 && <SelectGroup><SelectLabel>SortMyCover brokers</SelectLabel>{smcBrokers.map(brokerOption)}</SelectGroup>}
                {otherBrokers.length > 0 && <SelectGroup><SelectLabel>Other brokers</SelectLabel>{otherBrokers.map(brokerOption)}</SelectGroup>}
              </SelectContent>
            </Select>
            {routedElsewhere && (
              <p className="mt-1.5 text-xs text-amber-400 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />This lead is routed to another broker; allocating does not move the lead.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" className="mt-1" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Time (SAST)</Label>
              <Input type="time" className="mt-1" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{DURATIONS.map((d) => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Broker email</Label>
            <Input type="email" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="broker@firm.co.za" />
            <p className="mt-1 text-xs text-muted-foreground">
              {isOutlook(broker)
                ? "Outlook connected: the event goes straight into their calendar (Teams link included); this email is only used if that fails."
                : "Not connected: a calendar invite (.ics) is emailed here."}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="invite-client"
              checked={clientHasEmail && inviteClient}
              disabled={!clientHasEmail}
              onCheckedChange={(v) => setInviteClient(v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="invite-client" className="text-sm font-normal">Also send the client a calendar invite by email</Label>
              {!clientHasEmail && <p className="text-xs text-muted-foreground">The client has no email address on file.</p>}
            </div>
          </div>

          {formError && <p className="text-sm text-red-400">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Allocating…" : reallocating ? "Re-allocate" : "Allocate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- cancel dialog
function CancelDialog({ appt, onClose, onDone }: {
  appt: Appt | null;
  onClose: () => void;
  onDone: (msg: ToastMsg) => void;
}) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isRequest = appt?.status === "requested";

  useEffect(() => {
    if (!appt) return;
    setReason(""); setNotify(true); setBusy(false); setErr(null);
  }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!appt) return;
    setBusy(true); setErr(null);
    try {
      await callAllocation({
        action: "cancel",
        appointment_id: appt.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        notify_client: isRequest ? false : notify,
      });
      onDone({
        title: isRequest ? "Request cancelled" : "Appointment cancelled",
        description: `${clientName(appt)}${!isRequest && notify ? " · client told" : ""}`,
      });
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!appt} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isRequest ? "Cancel this request?" : "Cancel this appointment?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {appt ? clientName(appt) : ""}
            {appt && !isRequest && appt.appointment_date ? ` with ${brokerName(appt.broker)} on ${fmtDayTime(appt.appointment_date)}` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea className="mt-1" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client asked to cancel, duplicate request…" />
          </div>
          {!isRequest && (
            <div className="flex items-center gap-2">
              <Checkbox id="notify-client" checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              <Label htmlFor="notify-client" className="text-sm font-normal">Tell the client</Label>
            </div>
          )}
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
          <Button variant="destructive" onClick={submit} disabled={busy}>{busy ? "Cancelling…" : "Cancel it"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
