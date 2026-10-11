import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGE_TEXT, ASSIGN_REFUSED_CODE, ASSIGN_REFUSED_TEXT, COUNTS_HELPER, LOW_BUDGET, REASON_TEXT, loadLowBudgetSwitches } from "@/lib/lowBudget";

const db = supabase as any;

export interface HeldLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  area?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  budget_band: string | null;
  age_band: string | null;
  reasons: string[] | null;
  created_at: string;
}

interface BrokerOption { id: string; firm_name: string | null; contact_person: string | null; optedIn: boolean }

/** Held C-tier leads. `available` is false while the backend columns don't exist. */
export const useHeldLowBudgetLeads = () => {
  const [available, setAvailable] = useState(false);
  const [leads, setLeads] = useState<HeldLead[]>([]);

  const reload = useCallback(async () => {
    // portal contract (crm-nurture CONTRACTS.md, "Admin assignment of a held tier-C lead")
    const { data, error } = await db.from("leads").select("*")
      .not("brand_id", "is", null)
      .eq("budget_band", LOW_BUDGET.band)
      .eq("routing_reason", LOW_BUDGET.heldReason)
      .is("broker_id", null)
      .is("opted_out_at", null)
      .order("created_at", { ascending: true });
    if (error) { setAvailable(false); setLeads([]); return; }
    setAvailable(true);
    setLeads((data || []) as HeldLead[]);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { available, leads, reload };
};

const areaOf = (l: HeldLead) => l.area || l.suburb || l.city || l.province || l.address || "—";
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const budgetText = (b: string | null) => (b === LOW_BUDGET.band ? "Under R750" : b || "—");

export const HeldLowBudgetLeads = ({ leads, onChanged }: { leads: HeldLead[]; onChanged: () => void }) => {
  const [assigning, setAssigning] = useState<HeldLead | null>(null);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Held — {LOW_BUDGET.label}</h2>
        <p className="text-xs text-muted-foreground">{COUNTS_HELPER}</p>
      </div>

      <div className="border rounded-xl overflow-hidden bg-slate-900/50 backdrop-blur-xl border-white/5 shadow-2xl">
        <Table>
          <TableHeader className="bg-slate-950/50">
            <TableRow className="hover:bg-transparent border-white/5">
              {["Name", "Area", "Budget", "Age", "Cover interest", "Created", "Days held"].map((h) => (
                <TableHead key={h} className="text-[11px] uppercase font-bold tracking-tight text-slate-500 whitespace-nowrap">{h}</TableHead>
              ))}
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground text-center py-8">No leads held.</TableCell></TableRow>
            ) : leads.map((l) => {
              const days = daysSince(l.created_at);
              return (
                <TableRow key={l.id} className="border-white/5">
                  <TableCell className="font-medium">{`${l.first_name || ""} ${l.last_name || ""}`.trim() || "—"}</TableCell>
                  <TableCell className="text-sm">{areaOf(l)}</TableCell>
                  <TableCell><Badge variant="outline" className="whitespace-nowrap text-[10px]">{budgetText(l.budget_band)}</Badge></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{l.age_band ? AGE_TEXT[l.age_band] || l.age_band : "—"}</TableCell>
                  <TableCell className="text-xs">{(l.reasons || []).map((r) => REASON_TEXT[r] || r).join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs font-mono opacity-70 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString("en-ZA")}</TableCell>
                  <TableCell className={cn("text-sm font-mono", days >= 3 && "text-amber-400")}>{days}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setAssigning(l)}><UserPlus className="h-4 w-4 mr-1" /> Assign to broker</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AssignDialog lead={assigning} onClose={() => setAssigning(null)} onAssigned={() => { setAssigning(null); onChanged(); }} />
    </div>
  );
};

const AssignDialog = ({ lead, onClose, onAssigned }: { lead: HeldLead | null; onClose: () => void; onAssigned: () => void }) => {
  const { toast } = useToast();
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [pick, setPick] = useState<BrokerOption | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setPick(null);
    (async () => {
      const [{ data }, switches] = await Promise.all([
        db.from("brokers").select("id, firm_name, contact_person, status").neq("status", "Inactive").order("firm_name"),
        loadLowBudgetSwitches(),
      ]);
      const rows: BrokerOption[] = (data || []).map((b: any) => ({ ...b, optedIn: !!switches?.[b.id] }));
      rows.sort((a, b) => Number(b.optedIn) - Number(a.optedIn));
      setBrokers(rows);
    })();
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async () => {
    if (!lead || !pick) return;
    setSaving(true);
    const { data, error } = await db.from("leads")
      .update({ broker_id: pick.id, routing_reason: LOW_BUDGET.assignedReason })
      .eq("id", lead.id).eq("routing_reason", LOW_BUDGET.heldReason).is("broker_id", null)
      .select("id, broker_id, routing_reason");
    setSaving(false);
    if (error?.code === ASSIGN_REFUSED_CODE) {
      toast({ title: ASSIGN_REFUSED_TEXT, description: error.message, variant: "destructive" });
      onAssigned();
      return;
    }
    if (error) { toast({ title: "Couldn't assign", description: error.message, variant: "destructive" }); return; }
    const row = (data || [])[0];
    if (!row) { toast({ title: "Not assigned", description: "This lead is no longer held." }); onAssigned(); return; }
    if (!row.broker_id) {
      // the routing trigger held it again: no paid order with room
      toast({ title: "Still held", description: `${pick.firm_name || "This broker"} has no paid order with room.`, variant: "destructive" });
      onAssigned();
      return;
    }
    toast({ title: "Assigned", description: `Sent to ${pick.firm_name || "broker"}. Booking starts now.` });
    onAssigned();
  };

  const needsConfirm = !!pick && !pick.optedIn;

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign to broker</DialogTitle>
          <DialogDescription>
            {lead ? `${`${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Lead"} · ${LOW_BUDGET.label}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {brokers.map((b) => (
            <button
              key={b.id}
              onClick={() => setPick(b)}
              className={cn(
                "w-full text-left rounded-lg border p-3 flex items-center justify-between gap-2 transition-colors",
                pick?.id === b.id ? "border-primary bg-primary/10" : "border-white/10 bg-slate-900/60 hover:border-primary/50",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{b.firm_name || "Unnamed firm"}</p>
                {b.contact_person && <p className="text-xs text-muted-foreground truncate">{b.contact_person}</p>}
              </div>
              {b.optedIn ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />Opted in</Badge>
              ) : (
                <span className="text-[11px] text-muted-foreground shrink-0">hasn't opted in</span>
              )}
            </button>
          ))}
        </div>

        {needsConfirm && (
          <p className="text-xs text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {pick?.firm_name || "This broker"} hasn't agreed to {LOW_BUDGET.label} leads. Only assign if they've said yes.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={assign} disabled={!pick || saving} variant={needsConfirm ? "destructive" : "default"}>
            {saving ? "Assigning…" : needsConfirm ? "Assign anyway" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
