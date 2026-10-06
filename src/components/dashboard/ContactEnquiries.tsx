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
  MessageSquare, Mail, Phone, Building2, Clock, Pencil, Save, X,
  History as HistoryIcon, Inbox, UserPlus,
} from "lucide-react";

interface Enquiry {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  source: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-indigo-500",
  qualified: "bg-amber-500",
  converted: "bg-green-500",
  closed: "bg-slate-500",
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};

const ContactEnquiries = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("contact_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Error", description: "Couldn't load enquiries.", variant: "destructive" });
    setRows((data || []) as Enquiry[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter(r => r.status === filter)),
    [rows, filter],
  );
  const newCount = useMemo(() => rows.filter(r => r.status === "new").length, [rows]);

  const patch = (id: string, p: Partial<Enquiry>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)));

  const selected = selectedId ? rows.find(r => r.id === selectedId) ?? null : null;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" /> Enquiries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everyone who asked us to contact them through the website — edit their details, log notes and move them into the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg border px-4 py-2 text-center ${newCount ? "border-blue-500/40 bg-blue-500/10" : "border-white/10 bg-slate-900/50"}`}>
            <p className="text-xs text-muted-foreground">New</p>
            <p className={`text-xl font-bold ${newCount ? "text-blue-400" : "text-white"}`}>{newCount}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/50 px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-white">{rows.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === s ? "bg-primary text-primary-foreground" : "bg-slate-900/60 text-muted-foreground hover:text-foreground border border-white/10"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="border-white/10 bg-slate-900/40">
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {rows.length === 0 ? "No website enquiries yet." : "No enquiries with this status."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className="w-full text-left rounded-lg border border-white/10 bg-slate-900/60 p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-white truncate">
                    {r.name}{r.company ? ` · ${r.company}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{r.message || "No message"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.phone && <span className="text-xs text-muted-foreground hidden md:inline">{r.phone}</span>}
                  <Badge className={`${STATUS_COLOR[r.status] || "bg-gray-500"} text-[10px] capitalize`}>{r.status}</Badge>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <EnquiryDrawer enquiry={selected} onClose={() => setSelectedId(null)} onPatched={patch} />
    </div>
  );
};

const EnquiryDrawer = ({
  enquiry, onClose, onPatched,
}: {
  enquiry: Enquiry | null;
  onClose: () => void;
  onPatched: (id: string, p: Partial<Enquiry>) => void;
}) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!enquiry) return;
    setEditing(false);
    setForm({
      name: enquiry.name || "",
      email: enquiry.email || "",
      phone: enquiry.phone || "",
      company: enquiry.company || "",
    });
    setNotes(enquiry.admin_notes || "");
    (async () => {
      const h = await (supabase as any).from("audit_log").select("*")
        .eq("record_id", enquiry.id).order("changed_at", { ascending: false }).limit(20);
      setHistory((h.data || []) as any[]);
    })();
  }, [enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enquiry) return <Sheet open={false} onOpenChange={(o) => !o && onClose()}><SheetContent /></Sheet>;

  const notifyChange = (label: string) => {
    supabase.functions.invoke("notify-crm-change", { body: { table: "contact_submissions", recordId: enquiry.id, label } })
      .then(({ error }) => { if (error) console.error("notify-crm-change:", error); })
      .catch(() => {});
  };

  const update = async (p: Partial<Enquiry>, label: string) => {
    const { error } = await (supabase as any).from("contact_submissions").update(p).eq("id", enquiry.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return false; }
    onPatched(enquiry.id, p);
    notifyChange(`${label} — ${enquiry.name}`);
    return true;
  };

  const saveDetails = async () => {
    const ok = await update({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
    }, "Enquiry details edited");
    if (ok) { setEditing(false); toast({ title: "Details saved", description: "Change logged in the history." }); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const ok = await update({ admin_notes: notes.trim() || null }, "Enquiry notes updated");
    setSavingNotes(false);
    if (ok) toast({ title: "Notes saved" });
  };

  const changeStatus = async (status: string) => {
    if (await update({ status }, `Enquiry status → ${status}`)) toast({ title: `Marked ${status}` });
  };

  return (
    <Sheet open={!!enquiry} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0 z-[120]">
        <SheetHeader className="p-6 pb-4 text-left space-y-2">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-xl leading-tight">{enquiry.name}</SheetTitle>
            <Badge className={`${STATUS_COLOR[enquiry.status]} capitalize`}>{enquiry.status}</Badge>
          </div>
          <SheetDescription className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" /> {fmtDateTime(enquiry.created_at)}
          </SheetDescription>
        </SheetHeader>
        <Separator />

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={enquiry.status} onValueChange={changeStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Contact details</h3>
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
                  <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                  <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
              ) : (
                <div className="text-sm space-y-1.5">
                  <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{enquiry.company || "—"}</p>
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />
                    {enquiry.phone ? <a href={`tel:${enquiry.phone}`} className="text-primary hover:underline">{enquiry.phone}</a> : "—"}</p>
                  <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />
                    {enquiry.email ? <a href={`mailto:${enquiry.email}`} className="text-primary hover:underline break-all">{enquiry.email}</a> : "—"}</p>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><MessageSquare className="h-4 w-4 text-primary" /> What they asked for</h3>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                <p className="text-sm whitespace-pre-wrap break-words">{enquiry.message || "No message provided."}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Internal notes</h3>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                placeholder="Call outcome, what they said, next step…" />
              <Button size="sm" className="mt-2" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>

            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><HistoryIcon className="h-4 w-4 text-primary" /> Change history</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
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
                        <p className="text-xs text-muted-foreground">{h.action === "INSERT" ? "Enquiry received from the website." : "Record removed."}</p>
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

export default ContactEnquiries;
