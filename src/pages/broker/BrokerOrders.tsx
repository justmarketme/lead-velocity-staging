import { useState, useEffect, useMemo, type ElementType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Lock, Download, ArrowLeft, Star, ShoppingBag, CreditCard, CheckCircle2, ExternalLink, FileSignature, MessageSquarePlus, Info, PlayCircle, X, StickyNote, Phone, Mail, MapPin, Building2, User as UserIcon, Send, Trash2, FileSpreadsheet } from "lucide-react";

// Explains the per-lead quality/contactability score shown in the portal.
const SCORE_HELP =
  "Data Quality (0–99): how complete and verified this lead's contact info is — a working phone, a matching-domain email, a website, an established business (Google reviews) and a relevant commercial sector all raise it. Higher = a cleaner, more actionable record. It reflects contactability, not buying intent.";
import { useToast } from "@/hooks/use-toast";
import OrderAgreements from "@/components/broker/OrderAgreements";
import PipelineBoard from "@/components/broker/PipelineBoard";
import { LayoutGrid, List as ListIcon } from "lucide-react";

// ── Types matching the data contract ───────────────────────────────────────
interface LeadOrder {
  id: string;
  broker_id: string;
  title: string | null;
  lead_count: number | null;
  amount_zar: number | null; // cents
  currency: string | null;
  status: "pending" | "contract_signed" | "paid" | "delivered" | "cancelled";
  contract_signed_at: string | null;
  contract_signature: string | null;
  criteria: Record<string, unknown> | null;
  created_at: string | null;
}

interface OrderLead {
  lead_id: string;
  company: string | null;
  role: string | null;
  area: string | null;
  website: string | null;
  rating: number | null;
  vibe: string | null;
  // sensitive — NULL until paid/delivered
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  current_status: string | null;
}

interface OrderSummary {
  total_leads: number;
  unlocked: boolean;
  status: string;
  contract_signed: boolean;
  amount_zar: number;
  lead_count: number;
}

// DB-enforced lead status values (leads_current_status_check). The broker's
// dropdown must stay inside this set or the write is rejected by the constraint.
const LEAD_STATUS_OPTIONS = ["New", "Contacted", "Appointment Booked", "Will Done", "Rejected"] as const;

interface LeadNote {
  id: string | null;
  content: string;
  created_at: string | null;
}

const formatZar = (cents: number | null | undefined) => {
  const value = (cents ?? 0) / 100;
  return `R${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-yellow-500",
    contract_signed: "bg-blue-500",
    paid: "bg-green-500",
    delivered: "bg-emerald-500",
    cancelled: "bg-red-500",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge className={map[status] || "bg-gray-500"}>{label}</Badge>;
};

// Blurred/locked cell
const LockedCell = () => (
  <div className="flex items-center gap-1.5 select-none" title="Unlock to reveal">
    <span className="blur-sm text-muted-foreground">••• •••••</span>
    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  </div>
);

const BrokerOrders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<LeadOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<LeadOrder | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [leads, setLeads] = useState<OrderLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [broker, setBroker] = useState<{ contact_person: string | null; firm_name: string | null; email: string | null }>({ contact_person: null, firm_name: null, email: null });
  const [activeTab, setActiveTab] = useState<string>("leads");
  const [leadsView, setLeadsView] = useState<"list" | "pipeline">("list");
  // latest note per lead (only loaded / meaningful for unlocked orders)
  const [notesByLead, setNotesByLead] = useState<Record<string, LeadNote>>({});
  // full note history per lead (newest-first) — shown in the lead detail drawer
  const [notesHistory, setNotesHistory] = useState<Record<string, LeadNote[]>>({});
  // lead currently open in the detail slide-over
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  // true while the Excel library is being lazy-loaded / the file generated
  const [xlsxBusy, setXlsxBusy] = useState(false);
  // One-time walkthrough banner (dismissal persisted in localStorage).
  const [showWalkthroughBanner, setShowWalkthroughBanner] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("lv_explainer_dismissed") !== "1") setShowWalkthroughBanner(true);
    } catch {
      /* localStorage unavailable — just skip the banner */
    }
  }, []);
  const dismissWalkthroughBanner = () => {
    setShowWalkthroughBanner(false);
    try {
      localStorage.setItem("lv_explainer_dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const unlocked = summary?.unlocked ?? false;

  // ── Auth + load broker's orders ───────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data: broker, error: brokerError } = await supabase
        .from("brokers")
        .select("id, contact_person, firm_name, email")
        .eq("user_id", session.user.id)
        .single();

      if (brokerError || !broker) {
        toast({ title: "Profile Error", description: "Broker profile not found.", variant: "destructive" });
        setLoading(false);
        return;
      }

      setBroker({
        contact_person: (broker as any).contact_person ?? null,
        firm_name: (broker as any).firm_name ?? null,
        email: (broker as any).email ?? null,
      });

      const { data: orderRows, error: ordersError } = await (supabase as any)
        .from("lead_orders")
        .select("*")
        .eq("broker_id", broker.id)
        .order("created_at", { ascending: false });

      if (ordersError) {
        toast({ title: "Error", description: "Failed to load your orders.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const rows = (orderRows || []) as unknown as LeadOrder[];
      setOrders(rows);
      setLoading(false);

      // If exactly one order, open it directly
      if (rows.length === 1) {
        openOrder(rows[0]);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const openOrder = async (order: LeadOrder) => {
    setSelectedOrder(order);
    setLeadsLoading(true);
    setLeads([]);
    setSummary(null);
    setNotesByLead({});
    setNotesHistory({});

    const [summaryRes, leadsRes, notesRes] = await Promise.all([
      (supabase as any).rpc("get_order_summary", { p_order_id: order.id }),
      (supabase as any).rpc("get_order_leads", { p_order_id: order.id }),
      (supabase as any).rpc("broker_get_order_notes", { p_order_id: order.id }),
    ]);

    if (notesRes.error) {
      console.error("broker_get_order_notes error:", notesRes.error);
    } else {
      // RPC returns notes newest-first; keep the first (latest) seen per lead
      // and the full history grouped by lead for the detail drawer.
      const map: Record<string, LeadNote> = {};
      const history: Record<string, LeadNote[]> = {};
      for (const n of ((notesRes.data || []) as Array<{ id: string | null; lead_id: string; content: string; created_at: string | null }>)) {
        const note: LeadNote = { id: n.id, content: n.content, created_at: n.created_at };
        if (!map[n.lead_id]) map[n.lead_id] = note;
        (history[n.lead_id] ||= []).push(note);
      }
      setNotesByLead(map);
      setNotesHistory(history);
    }

    if (summaryRes.error) {
      console.error("get_order_summary error:", summaryRes.error);
    } else {
      // RPC may return a single row object or an array
      const s = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
      if (s) setSummary(s as unknown as OrderSummary);
    }

    if (leadsRes.error) {
      console.error("get_order_leads error:", leadsRes.error);
      toast({ title: "Error", description: "Failed to load leads for this order.", variant: "destructive" });
    } else {
      setLeads(((leadsRes.data || []) as unknown as OrderLead[]));
    }

    setLeadsLoading(false);
  };

  const closeOrder = () => {
    setSelectedOrder(null);
    setSummary(null);
    setLeads([]);
    setNotesByLead({});
    setNotesHistory({});
    setDetailLeadId(null);
  };

  // ── Broker edits on unlocked-order leads (gated server-side by RPC) ─────────
  const updateLeadStatus = async (leadId: string, status: string): Promise<boolean> => {
    if (!selectedOrder) return false;
    const { error } = await (supabase as any).rpc("broker_update_lead_status", {
      p_order_id: selectedOrder.id,
      p_lead_id: leadId,
      p_status: status,
    });
    if (error) {
      console.error("broker_update_lead_status error:", error);
      toast({ title: "Couldn't update status", description: error.message || "Please try again.", variant: "destructive" });
      return false;
    }
    setLeads((prev) => prev.map((l) => (l.lead_id === leadId ? { ...l, current_status: status } : l)));
    return true;
  };

  const addLeadNote = async (leadId: string, note: string): Promise<boolean> => {
    if (!selectedOrder) return false;
    const trimmed = note.trim();
    if (!trimmed) return false;
    const { data, error } = await (supabase as any).rpc("broker_add_lead_note", {
      p_order_id: selectedOrder.id,
      p_lead_id: leadId,
      p_note: trimmed,
    });
    if (error) {
      console.error("broker_add_lead_note error:", error);
      toast({ title: "Couldn't save note", description: error.message || "Please try again.", variant: "destructive" });
      return false;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const saved: LeadNote = { id: row?.id ?? null, content: trimmed, created_at: row?.created_at ?? new Date().toISOString() };
    setNotesByLead((prev) => ({ ...prev, [leadId]: saved }));
    setNotesHistory((prev) => ({ ...prev, [leadId]: [saved, ...(prev[leadId] || [])] }));
    toast({ title: "Note saved" });
    return true;
  };

  // Delete one of the broker's own notes (server enforces authorship).
  const deleteLeadNote = async (leadId: string, noteId: string): Promise<boolean> => {
    const { data, error } = await (supabase as any).rpc("broker_delete_lead_note", { p_note_id: noteId });
    if (error || data === false) {
      console.error("broker_delete_lead_note error:", error);
      toast({ title: "Couldn't delete note", description: error?.message || "Please try again.", variant: "destructive" });
      return false;
    }
    setNotesHistory((prev) => {
      const remaining = (prev[leadId] || []).filter((n) => n.id !== noteId);
      const next = { ...prev, [leadId]: remaining };
      // keep the "latest note" indicator in sync
      setNotesByLead((m) => {
        const copy = { ...m };
        if (remaining.length) copy[leadId] = remaining[0];
        else delete copy[leadId];
        return copy;
      });
      return next;
    });
    toast({ title: "Note deleted" });
    return true;
  };

  // Send a message to Lead Velocity about a specific lead.
  const sendLeadFeedback = async (leadId: string, message: string): Promise<boolean> => {
    if (!selectedOrder) return false;
    const trimmed = message.trim();
    if (!trimmed) return false;
    const { error } = await (supabase as any).rpc("broker_send_feedback", {
      p_order_id: selectedOrder.id,
      p_message: trimmed,
      p_lead_id: leadId,
    });
    if (error) {
      console.error("broker_send_feedback error:", error);
      toast({ title: "Couldn't send message", description: error.message || "Please try again.", variant: "destructive" });
      return false;
    }
    toast({ title: "Message sent to Lead Velocity" });
    return true;
  };

  // Called by the Agreements tab once the contract is e-signed.
  const handleSigned = (result: { signedAt: string | null; signature: string | null; status: string }) => {
    setSelectedOrder((prev) =>
      prev
        ? {
            ...prev,
            contract_signed_at: result.signedAt,
            contract_signature: result.signature,
            status: (result.status as LeadOrder["status"]) || "contract_signed",
          }
        : prev,
    );
    setSummary((prev) => (prev ? { ...prev, contract_signed: true, status: result.status || prev.status } : prev));
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder?.id
          ? { ...o, contract_signed_at: result.signedAt, contract_signature: result.signature, status: (result.status as LeadOrder["status"]) || "contract_signed" }
          : o,
      ),
    );
  };

  const contractSigned = !!(selectedOrder?.contract_signed_at || summary?.contract_signed);

  // ── Criteria rendering ────────────────────────────────────────────────────
  const criteriaEntries = useMemo(() => {
    const c = selectedOrder?.criteria;
    if (!c || typeof c !== "object") return [];
    const preferredOrder = ["areas", "area", "segment", "qualifier", "product"];
    const keys = Object.keys(c);
    keys.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map((k) => {
      const raw = (c as Record<string, unknown>)[k];
      const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "—");
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
      return { label, value };
    });
  }, [selectedOrder]);

  // ── Export (CSV + Excel) ──────────────────────────────────────────────────
  // Both formats share one row builder. When the order is locked, only preview
  // fields are exported; contact details are omitted entirely (not blanked).
  const buildExportRows = (): { headers: string[]; rows: (string | number)[][] } => {
    const previewHeaders = ["Business", "Category", "Area", "Website", "Data Quality"];
    const sensitiveHeaders = ["Contact Name", "Email", "Phone", "Address", "Status"];
    const headers = unlocked ? [...previewHeaders, ...sensitiveHeaders] : previewHeaders;
    const rows = leads.map((l) => {
      const preview: (string | number)[] = [l.company ?? "", l.role ?? "", l.area ?? "", l.website ?? "", l.vibe ?? ""];
      if (!unlocked) return preview;
      return [
        ...preview,
        `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
        l.email ?? "",
        l.phone ?? "",
        l.address ?? "",
        l.current_status ?? "",
      ];
    });
    return { headers, rows };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportFileBase = () =>
    `leads-${selectedOrder?.id?.slice(0, 8) || "order"}-${unlocked ? "full" : "preview-only"}-${new Date().toISOString().slice(0, 10)}`;

  const exportCSV = () => {
    try {
      const { headers, rows } = buildExportRows();
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };
      // Prefix with BOM so Excel opens UTF-8 (accented names, ± etc.) correctly.
      let csv = "﻿" + headers.map(esc).join(",") + "\r\n";
      rows.forEach((r) => { csv += r.map(esc).join(",") + "\r\n"; });
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${exportFileBase()}.csv`);
      toast({
        title: "CSV download started",
        description: unlocked ? "Full lead details exported." : "Preview fields exported (contact details are locked).",
      });
    } catch (e) {
      console.error("CSV export error:", e);
      toast({ title: "Export failed", description: "Could not generate the CSV.", variant: "destructive" });
    }
  };

  const exportXLSX = async () => {
    setXlsxBusy(true);
    try {
      // Lazily load SheetJS only when a broker actually exports Excel, so the
      // ~400KB library stays out of the initial page bundle for everyone else.
      const XLSX = await import("xlsx");
      const { headers, rows } = buildExportRows();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // Reasonable column widths for readability.
      ws["!cols"] = headers.map((h, i) => {
        const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
        return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, `${exportFileBase()}.xlsx`);
      toast({
        title: "Excel download started",
        description: unlocked ? "Full lead details exported to .xlsx." : "Preview fields exported (contact details are locked).",
      });
    } catch (e) {
      console.error("XLSX export error:", e);
      toast({ title: "Export failed", description: "Could not generate the Excel file.", variant: "destructive" });
    } finally {
      setXlsxBusy(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <BrokerLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </BrokerLayout>
    );
  }

  // ── Order list (multiple orders, none selected) ──────────────────────────
  if (!selectedOrder) {
    return (
      <BrokerLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold gradient-text">My Purchased Leads</h1>
              <p className="text-muted-foreground mt-2">Your paid lead orders and their delivery status</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/broker/explainer")}>
              <PlayCircle className="mr-2 h-4 w-4" /> How your portal works
            </Button>
          </div>

          {orders.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="py-16 text-center">
                <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">You have no lead orders yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {orders.map((order) => (
                <Card
                  key={order.id}
                  className="border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => openOrder(order)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <CardTitle className="text-lg">{order.title || "Lead Order"}</CardTitle>
                    {statusBadge(order.status)}
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-2xl font-bold">{order.lead_count ?? 0} leads</p>
                    <p className="text-muted-foreground">{formatZar(order.amount_zar)}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </BrokerLayout>
    );
  }

  // ── Single order view ────────────────────────────────────────────────────
  return (
    <BrokerLayout>
      <div className="space-y-6">
        {showWalkthroughBanner && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
            <button
              onClick={() => navigate("/broker/explainer")}
              className="flex items-center gap-2 text-left text-sm text-foreground"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-primary" />
              <span>New here? Watch the 1-minute walkthrough</span>
            </button>
            <button onClick={dismissWalkthroughBanner} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {orders.length > 1 ? (
            <Button variant="ghost" size="sm" onClick={closeOrder} className="mb-0">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to all orders
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/broker/explainer")}>
            <PlayCircle className="mr-2 h-4 w-4" /> How your portal works
          </Button>
        </div>

        {/* Purchase summary */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-2xl gradient-text">{selectedOrder.title || "Lead Order"}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Purchased {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
            {statusBadge(summary?.status || selectedOrder.status)}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Leads</p>
                <p className="text-xl font-bold">{summary?.lead_count ?? selectedOrder.lead_count ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-xl font-bold">{formatZar(summary?.amount_zar ?? selectedOrder.amount_zar)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contract</p>
                <p className="text-xl font-bold">{summary?.contract_signed ? "Signed" : "Pending"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Access</p>
                <p className="text-xl font-bold">{unlocked ? "Unlocked" : "Locked"}</p>
              </div>
            </div>

            {criteriaEntries.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Order criteria</p>
                <div className="flex flex-wrap gap-2">
                  {criteriaEntries.map((c) => (
                    <Badge key={c.label} variant="outline" className="text-xs">
                      <span className="text-muted-foreground mr-1">{c.label}:</span> {c.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unlock panel */}
        {!unlocked && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-primary" /> Unlock full contact details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  {contractSigned ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <span className="font-bold text-primary">1.</span>
                  )}
                  <span className={contractSigned ? "text-green-600" : ""}>
                    Sign your agreement
                    {contractSigned && selectedOrder?.contract_signed_at
                      ? ` — signed ${new Date(selectedOrder.contract_signed_at).toLocaleDateString()}`
                      : ""}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-primary">2.</span>
                  Pay by EFT to our bank account (details on "Make payment").
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-primary">3.</span>
                  Email proof of payment (brokerage name as reference) to howzit@leadvelocity.co.za.
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-primary">4.</span>
                  Once we confirm payment, all contact details unlock.
                </li>
              </ol>
              <div className="flex flex-wrap gap-2">
                {!contractSigned && (
                  <Button variant="outline" onClick={() => navigate("/broker/documents")}>
                    <FileSignature className="mr-2 h-4 w-4" /> Sign agreement
                  </Button>
                )}
                <Button onClick={() => setPayDialogOpen(true)}>
                  <CreditCard className="mr-2 h-4 w-4" /> {contractSigned ? "Make payment" : "Unlock leads / Make payment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {unlocked && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4" />
            Payment confirmed — all contact details are unlocked below.
          </div>
        )}

        {unlocked && <ChangePasswordCard />}

        {/* Purchased leads */}
        <div className="mt-2">
        {/* Leads table + export */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
            <CardTitle className="text-lg">
              Leads ({leads.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* List | Pipeline toggle */}
              <div className="inline-flex rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setLeadsView("list")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    leadsView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListIcon className="h-3.5 w-3.5" /> List
                </button>
                <button
                  onClick={() => setLeadsView("pipeline")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    leadsView === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Pipeline
                </button>
              </div>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={exportCSV} disabled={leads.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      CSV{!unlocked && " (preview)"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {unlocked ? "Export the full lead list as CSV" : "Export preview fields (contact details locked)"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={exportXLSX} disabled={leads.length === 0 || xlsxBusy}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      {xlsxBusy ? "Preparing…" : `Excel${!unlocked ? " (preview)" : ""}`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {unlocked ? "Export the full lead list as an .xlsx Excel file" : "Export preview fields (contact details locked)"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {leadsView === "pipeline" ? (
              !unlocked ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Unlock your leads to start working your pipeline — sign the agreement and pay to reveal contacts and
                    manage your board.
                  </p>
                </div>
              ) : selectedOrder ? (
                <PipelineBoard orderId={selectedOrder.id} />
              ) : null
            ) : leadsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : leads.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No leads found for this order.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Tap a lead to see full details and add your own notes.
                </p>
                {/* Desktop table — sized to fit without horizontal scroll.
                    Website + Address live in the row detail drawer (click a row). */}
                <div className="hidden md:block">
                  <Table className="w-full table-fixed text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[28%] px-3">Business</TableHead>
                        <TableHead className="w-[15%] px-3">Category</TableHead>
                        <TableHead className="w-[14%] px-3">Area</TableHead>
                        <TableHead className="w-[10%] px-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-muted-foreground/60">
                                  Quality <Info className="h-3 w-3 opacity-70" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs leading-relaxed">{SCORE_HELP}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="w-[15%] px-3">Contact</TableHead>
                        <TableHead className="w-[18%] px-3">Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l) => {
                        const contact = `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim();
                        return (
                        <TableRow
                          key={l.lead_id}
                          onClick={() => setDetailLeadId(l.lead_id)}
                          className="cursor-pointer hover:bg-accent/50"
                        >
                          <TableCell className="font-medium px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate" title={unlocked ? (l.company || "") : undefined}>
                                {unlocked ? (l.company || "—") : <LockedCell />}
                              </span>
                              {notesByLead[l.lead_id] && (
                                <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Has notes" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 truncate" title={l.role || undefined}>{l.role || "—"}</TableCell>
                          <TableCell className="px-3 truncate" title={l.area || undefined}>{l.area || "—"}</TableCell>
                          <TableCell className="px-3">
                            {l.vibe ? (
                              <span title={SCORE_HELP} className="inline-flex items-center gap-1 cursor-help"><Star className="h-3 w-3 text-yellow-500 shrink-0" />{l.vibe}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="px-3 truncate" title={unlocked ? contact : undefined}>
                            {unlocked ? (contact || "—") : <LockedCell />}
                          </TableCell>
                          <TableCell className="px-3 whitespace-nowrap">
                            {unlocked ? (l.phone || "—") : <LockedCell />}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile stacked cards */}
                <div className="md:hidden space-y-3">
                  {leads.map((l) => (
                    <div
                      key={l.lead_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailLeadId(l.lead_id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailLeadId(l.lead_id); } }}
                      className="w-full text-left border border-border rounded-lg p-4 space-y-2 cursor-pointer active:bg-accent/50 hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold flex items-center gap-1.5">
                          {unlocked ? (l.company || "—") : <LockedCell />}
                          {notesByLead[l.lead_id] && <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </p>
                        {l.vibe && (
                          <span title={SCORE_HELP} className="inline-flex items-center gap-1 text-xs shrink-0"><Star className="h-3 w-3 text-yellow-500" />{l.vibe}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <p>{l.role || "—"}{l.area ? ` · ${l.area}` : ""}</p>
                        {!unlocked ? (
                          <LockedCell />
                        ) : l.website ? (
                          <a href={l.website.startsWith("http") ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary inline-flex items-center gap-1 hover:underline">
                            {l.website} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                      <div className="pt-2 border-t border-border grid grid-cols-1 gap-1.5 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Contact</span>
                          <span>{unlocked ? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "—" : <LockedCell />}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Email</span>
                          <span className="truncate">{unlocked ? l.email || "—" : <LockedCell />}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Phone</span>
                          <span>{unlocked ? l.phone || "—" : <LockedCell />}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Address</span>
                          <span className="text-right">{unlocked ? l.address || "—" : <LockedCell />}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Lead detail slide-over — full record + private notes */}
      <LeadDetailSheet
        lead={detailLeadId ? leads.find((l) => l.lead_id === detailLeadId) ?? null : null}
        notes={detailLeadId ? notesHistory[detailLeadId] || [] : []}
        unlocked={unlocked}
        latestNoteCount={detailLeadId ? (notesHistory[detailLeadId]?.length ?? 0) : 0}
        onClose={() => setDetailLeadId(null)}
        onAddNote={addLeadNote}
        onDeleteNote={deleteLeadNote}
        onSendFeedback={sendLeadFeedback}
        onStatusChange={updateLeadStatus}
      />

      {/* Payment (EFT) instructions dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make payment by EFT</DialogTitle>
            <DialogDescription>
              Please pay the invoice total by EFT to the account below, then email your proof of payment.
              Once we confirm receipt, all contact details unlock and you can export the full list.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">R{((selectedOrder?.amount_zar || 0) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Account name</span><span className="font-medium">Lead Velocity Pty Ltd</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">First National Bank (FNB)</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Account number</span><span className="font-medium">63174286724</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Branch code</span><span className="font-medium">250655</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-medium">{broker.firm_name || "Your brokerage name"}</span></div>
          </div>
          <p className="text-sm text-muted-foreground">
            Use <span className="font-medium text-foreground">your brokerage name</span> as the payment reference and
            email your proof of payment to{" "}
            <a href="mailto:howzit@leadvelocity.co.za" className="font-medium text-primary underline">howzit@leadvelocity.co.za</a>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BrokerLayout>
  );
};

// Change-password card — only rendered after the order is unlocked (paid).
const ChangePasswordCard = () => {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async () => {
    if (pw.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_reset_password: false } });
    setSaving(false);
    setMsg(error ? `Error: ${error.message}` : "Password updated — use it next time you log in.");
    if (!error) setPw("");
  };
  return (
    <Card className="border-border/50">
      <CardHeader><CardTitle className="text-base">Set your own password</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your leads are unlocked — you can now replace the temporary password with your own.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button onClick={save} disabled={saving || !pw}>{saving ? "Saving…" : "Update password"}</Button>
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
};

// ── Lead detail slide-over ──────────────────────────────────────────────────
// The full record for one lead plus its private note history. Opens from a row
// tap in the List view. Right-side sheet on desktop, full-width on mobile.
const fmtNoteTime = (iso: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const LeadDetailSheet = ({
  lead,
  notes,
  unlocked,
  onClose,
  onAddNote,
  onDeleteNote,
  onSendFeedback,
  onStatusChange,
}: {
  lead: OrderLead | null;
  notes: LeadNote[];
  unlocked: boolean;
  latestNoteCount: number;
  onClose: () => void;
  onAddNote: (leadId: string, note: string) => Promise<boolean>;
  onDeleteNote: (leadId: string, noteId: string) => Promise<boolean>;
  onSendFeedback: (leadId: string, message: string) => Promise<boolean>;
  onStatusChange: (leadId: string, status: string) => Promise<boolean>;
}) => {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Reset transient state whenever a different lead is opened.
  useEffect(() => {
    setDraft("");
    setFeedbackOpen(false);
    setFeedbackText("");
  }, [lead?.lead_id]);

  const removeNote = async (noteId: string | null) => {
    if (!lead || !noteId) return;
    setDeletingId(noteId);
    await onDeleteNote(lead.lead_id, noteId);
    setDeletingId(null);
  };

  const sendFeedback = async () => {
    if (!lead || !feedbackText.trim()) return;
    setSendingFeedback(true);
    const ok = await onSendFeedback(lead.lead_id, feedbackText);
    setSendingFeedback(false);
    if (ok) { setFeedbackText(""); setFeedbackOpen(false); }
  };

  const contactName = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : "";

  const saveNote = async () => {
    if (!lead || !draft.trim()) return;
    setSaving(true);
    const ok = await onAddNote(lead.lead_id, draft);
    setSaving(false);
    if (ok) setDraft("");
  };

  const changeStatus = async (status: string) => {
    if (!lead) return;
    setSavingStatus(true);
    await onStatusChange(lead.lead_id, status);
    setSavingStatus(false);
  };

  // A locked/redacted field placeholder inside the drawer.
  const Locked = () => (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm"><Lock className="h-3.5 w-3.5" /> Locked</span>
  );

  const DetailRow = ({ icon: Icon, label, children }: { icon: ElementType; label: string; children: ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm break-words">{children}</div>
      </div>
    </div>
  );

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0 z-[120]">
        {lead && (
          <>
            <SheetHeader className="p-6 pb-4 space-y-2 text-left">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="text-xl leading-tight">
                  {unlocked ? (lead.company || "Lead") : "Lead (locked)"}
                </SheetTitle>
                {lead.vibe && (
                  <span title={SCORE_HELP} className="inline-flex items-center gap-1 text-sm shrink-0 cursor-help">
                    <Star className="h-4 w-4 text-yellow-500" />{lead.vibe}
                  </span>
                )}
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                {lead.role && <Badge variant="outline" className="text-xs">{lead.role}</Badge>}
                {lead.area && <Badge variant="outline" className="text-xs">{lead.area}</Badge>}
              </SheetDescription>
            </SheetHeader>

            <Separator />

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Contact details */}
                <div>
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Contact details</h3>
                  {!unlocked && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Contact details unlock once your order is paid. You can still add notes now.
                    </p>
                  )}
                  <div className="divide-y divide-border">
                    <DetailRow icon={UserIcon} label="Contact name">
                      {unlocked ? (contactName || "—") : <Locked />}
                    </DetailRow>
                    <DetailRow icon={Phone} label="Phone">
                      {unlocked ? (
                        lead.phone ? <a href={`tel:${lead.phone}`} className="text-primary hover:underline">{lead.phone}</a> : "—"
                      ) : <Locked />}
                    </DetailRow>
                    <DetailRow icon={Mail} label="Email">
                      {unlocked ? (
                        lead.email ? <a href={`mailto:${lead.email}`} className="text-primary hover:underline break-all">{lead.email}</a> : "—"
                      ) : <Locked />}
                    </DetailRow>
                    <DetailRow icon={ExternalLink} label="Website">
                      {unlocked ? (
                        lead.website ? (
                          <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline break-all">
                            {lead.website} <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : "—"
                      ) : <Locked />}
                    </DetailRow>
                    <DetailRow icon={MapPin} label="Address">
                      {unlocked ? (lead.address || "—") : <Locked />}
                    </DetailRow>
                  </div>
                </div>

                {/* Status (only meaningful once unlocked) */}
                {unlocked && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Status</h3>
                    <Select value={lead.current_status || "New"} onValueChange={changeStatus} disabled={savingStatus}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Set status" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><StickyNote className="h-4 w-4 text-primary" /> My notes</h3>
                  <p className="text-xs text-muted-foreground mb-3">Private to you — call outcomes, next steps, reminders.</p>
                  <div className="space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Add a note…"
                      rows={3}
                    />
                    <Button onClick={saveNote} disabled={saving || !draft.trim()} className="w-full sm:w-auto">
                      <Send className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Add note"}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No notes yet.</p>
                    ) : (
                      notes.map((n, i) => (
                        <div key={n.id ?? i} className="rounded-lg border bg-muted/40 p-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
                            {n.created_at && <p className="text-[11px] text-muted-foreground mt-1.5">{fmtNoteTime(n.created_at)}</p>}
                          </div>
                          {n.id && (
                            <button
                              onClick={() => removeNote(n.id)}
                              disabled={deletingId === n.id}
                              aria-label="Delete note"
                              className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Message Lead Velocity about this lead */}
                <div>
                  <Separator className="mb-4" />
                  {!feedbackOpen ? (
                    <Button variant="outline" className="w-full sm:w-auto" onClick={() => setFeedbackOpen(true)}>
                      <MessageSquarePlus className="mr-2 h-4 w-4" /> Message Lead Velocity about this lead
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-primary" /> Message Lead Velocity</h3>
                      <p className="text-xs text-muted-foreground">Wrong number, bad data, a request? Send it to our team — we'll see which lead it's about.</p>
                      <Textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Your message to Lead Velocity…"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button onClick={sendFeedback} disabled={sendingFeedback || !feedbackText.trim()}>
                          <Send className="mr-2 h-4 w-4" /> {sendingFeedback ? "Sending…" : "Send"}
                        </Button>
                        <Button variant="ghost" onClick={() => { setFeedbackOpen(false); setFeedbackText(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BrokerOrders;
