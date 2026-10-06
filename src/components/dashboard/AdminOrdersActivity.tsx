import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, CreditCard, RefreshCw, FileSignature, Activity, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OrderAgreements from "@/components/broker/OrderAgreements";

// Row shape returned by the admin_list_orders_activity() RPC
interface OrderActivityRow {
  order_id: string;
  title: string | null;
  status: string;
  lead_count: number | null;
  amount_zar: number | null; // cents
  contract_signed_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  broker_id: string;
  firm_name: string | null;
  contact_person: string | null;
  email: string | null;
  total_leads: number;
  interacted_leads: number;
  total_notes: number;
  criteria: Record<string, unknown> | null;
  currency: string | null;
  contract_signature: string | null;
  contract_signature_image: string | null;
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

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

const AdminOrdersActivity = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrderActivityRow[]>([]);
  const [payTarget, setPayTarget] = useState<OrderActivityRow | null>(null);
  const [marking, setMarking] = useState(false);
  const [viewTarget, setViewTarget] = useState<OrderActivityRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_list_orders_activity");
    if (error) {
      console.error("admin_list_orders_activity error:", error);
      toast({ title: "Error", description: "Failed to load orders.", variant: "destructive" });
      setRows([]);
    } else {
      setRows(((data || []) as unknown as OrderActivityRow[]));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmMarkPaid = async () => {
    if (!payTarget) return;
    setMarking(true);
    const { error } = await (supabase as any).rpc("admin_mark_order_paid", { p_order_id: payTarget.order_id });
    setMarking(false);
    if (error) {
      console.error("admin_mark_order_paid error:", error);
      toast({ title: "Error", description: "Could not mark the order as paid.", variant: "destructive" });
      return;
    }
    toast({ title: "Order unlocked", description: `${payTarget.firm_name || "Broker"} — marked as paid. Contact details are now unlocked for them.` });
    const id = payTarget.order_id;
    setPayTarget(null);
    // optimistic local update + refresh
    setRows((prev) => prev.map((r) => (r.order_id === id ? { ...r, status: "paid", paid_at: new Date().toISOString() } : r)));
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Orders &amp; Broker Activity</h1>
          <p className="text-muted-foreground mt-2">
            Every lead order, its payment status, and how far each broker has worked their leads.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-4 w-4" /> Lead Orders ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No lead orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Broker</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const alreadyPaid = r.status === "paid" || r.status === "delivered";
                    return (
                      <TableRow key={r.order_id}>
                        <TableCell>
                          <div className="font-medium">{r.firm_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.contact_person || ""}</div>
                          <div className="text-xs text-muted-foreground">{r.email || ""}</div>
                        </TableCell>
                        <TableCell className="max-w-[180px]">{r.title || "Lead Order"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-right">{r.lead_count ?? r.total_leads}</TableCell>
                        <TableCell className="text-right">{formatZar(r.amount_zar)}</TableCell>
                        <TableCell>
                          {r.contract_signed_at ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                              <FileSignature className="h-3.5 w-3.5" /> {fmtDate(r.contract_signed_at)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.paid_at ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {fmtDate(r.paid_at)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <span className="font-medium">{r.interacted_leads}</span>
                            <span className="text-muted-foreground">/{r.total_leads} worked</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{r.total_notes} note{r.total_notes === 1 ? "" : "s"}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewTarget(r)}
                              title="View & download this broker's agreement and invoice"
                            >
                              <FileText className="mr-1.5 h-3.5 w-3.5" />
                              View Agreement
                              {r.contract_signed_at && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </Button>
                            {alreadyPaid ? (
                              <span className="text-xs text-green-600 inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Unlocked
                              </span>
                            ) : (
                              <Button size="sm" onClick={() => setPayTarget(r)}>
                                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Mark Paid
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm mark-paid dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark order as paid?</DialogTitle>
            <DialogDescription>
              Only do this once you have confirmed EFT proof of payment. This unlocks all contact details
              for <span className="font-medium text-foreground">{payTarget?.firm_name || "this broker"}</span> and cannot be silently undone from here.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-medium">{payTarget?.title || "Lead Order"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Leads</span><span className="font-medium">{payTarget?.lead_count ?? payTarget?.total_leads}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatZar(payTarget?.amount_zar)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={marking}>Cancel</Button>
            <Button onClick={confirmMarkPaid} disabled={marking}>
              {marking ? "Marking…" : "Confirm — mark paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View agreement + invoice dialog (read-only for admin) */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Agreement &amp; Invoice
              {viewTarget?.contract_signed_at ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Signed {fmtDate(viewTarget.contract_signed_at)}
                </span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">Not signed yet</span>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewTarget?.firm_name || "Broker"} — view and download this broker's signed contract and invoice.
            </DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="overflow-x-auto">
              <OrderAgreements
                order={{
                  id: viewTarget.order_id,
                  broker_id: viewTarget.broker_id,
                  title: viewTarget.title,
                  lead_count: viewTarget.lead_count,
                  amount_zar: viewTarget.amount_zar,
                  currency: viewTarget.currency,
                  status: viewTarget.status,
                  contract_signed_at: viewTarget.contract_signed_at,
                  contract_signature: viewTarget.contract_signature,
                  contract_signature_image: viewTarget.contract_signature_image,
                  criteria: viewTarget.criteria,
                  created_at: viewTarget.created_at,
                }}
                brokerContactName={viewTarget.contact_person || ""}
                brokerFirmName={viewTarget.firm_name || ""}
                brokerEmail={viewTarget.email || ""}
                readOnly
                onSigned={() => {}}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrdersActivity;
