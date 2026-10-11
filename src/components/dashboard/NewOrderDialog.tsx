/**
 * Admin: create a CRM lead order (lead_orders, RLS "Admins full access") with its brand.
 * Lead Velocity raw leads -> brand_id NULL (uploaded / delivered as today). SortMyCover nurtured leads -> brand_id = SMC:
 * once the order is paid, the routing triggers attach each consumer lead the broker receives (lead_order_items) until
 * lead_count is reached (CRM-NURTURE-SCHEMA.md section 2). Contract, invoice and Mark Paid stay the existing flow.
 * A SortMyCover order for a broker not yet enrolled also enrols him (brokers.brand_id = SMC, routing_on stays false),
 * after an explicit tick, through the admin's own RLS path (no RPC needed: smc_brokers_guard returns early for admins).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errText, smcDb } from "@/lib/smc";
import type { Brand } from "./orderBrands";

interface BrokerOpt { id: string; firm_name: string | null; contact_person: string | null; brand_id?: string | null }

export default function NewOrderDialog({ open, onOpenChange, brands, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; brands: Brand[] | null; onCreated: () => void;
}) {
  const smc = useMemo(() => brands?.find((b) => b.code === "SMC") || null, [brands]);
  const [brokers, setBrokers] = useState<BrokerOpt[]>([]);
  const [brokerId, setBrokerId] = useState("");
  const [brand, setBrand] = useState<"lv" | "smc">("lv");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState("50");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    (async () => {
      const withBrand = await smcDb.from("brokers").select("id, firm_name, contact_person, brand_id").order("firm_name");
      const r = withBrand.error // before the migrations brokers.brand_id does not exist
        ? await smcDb.from("brokers").select("id, firm_name, contact_person").order("firm_name")
        : withBrand;
      setBrokers(((r.data as unknown as BrokerOpt[]) || []));
    })();
  }, [open]);

  const broker = brokers.find((b) => b.id === brokerId);
  const notEnrolled = brand === "smc" && !!broker && !broker.brand_id;
  const otherBrand = brand === "smc" && !!broker?.brand_id && !!smc && broker.brand_id !== smc.id;
  const [enrolOk, setEnrolOk] = useState(false);
  useEffect(() => { setEnrolOk(false); }, [brokerId, brand]);

  async function create() {
    setErr(null);
    const n = Number(count);
    const rands = Number(amount.replace(/[\s,]/g, ""));
    if (!brokerId) return setErr("Pick the broker.");
    if (!Number.isInteger(n) || n < 1 || n > 100000) return setErr("Leads: a whole number from 1.");
    if (!Number.isFinite(rands) || rands < 0) return setErr("Amount: rands, e.g. 15000.");
    if (brand === "smc" && !smc) return setErr("The SortMyCover brand is not in this database yet (crm-nurture migrations not applied).");
    const { data: u } = await supabase.auth.getUser();
    const row: Record<string, unknown> = {
      broker_id: brokerId,
      title: title.trim() || (brand === "smc" ? `SortMyCover nurtured leads (${n})` : `Lead Velocity leads (${n})`),
      lead_count: n,
      amount_zar: Math.round(rands * 100), // stored in cents (AdminOrdersActivity formatZar)
      currency: "ZAR",
      status: "pending",
      created_by: u.user?.id ?? null,
    };
    if (brand === "smc") row.brand_id = smc!.id;
    if (otherBrand) return setErr("This broker is enrolled in another brand. Change that first.");
    if (notEnrolled && !enrolOk) return setErr("Tick the enrolment line to create a SortMyCover order for this broker.");
    setBusy(true);
    // Enrol first (admin path: RLS "Admins can manage all brokers"; smc_brokers_guard lets admins set brand_id). Only a
    // still-unenrolled row is touched, and routing stays off until an admin switches it on. If enrolment fails, no order.
    if (notEnrolled) {
      const { data: enrolled, error: enrolErr } = await smcDb.from("brokers")
        .update({ brand_id: smc!.id, routing_on: false }).eq("id", brokerId).is("brand_id", null).select("id");
      if (enrolErr || !enrolled?.length) { setBusy(false); return setErr(`Could not enrol the broker in SortMyCover: ${enrolErr ? errText(enrolErr) : "the broker row changed; refresh and try again"}. No order was created.`); }
    }
    const { error } = await smcDb.from("lead_orders").insert(row);
    setBusy(false);
    if (error) return setErr(`${notEnrolled ? "The broker is now enrolled in SortMyCover, but the order was not created: " : ""}${errText(error)}`);
    setTitle(""); setAmount(""); setBrokerId(""); setBrand("lv");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New lead order</DialogTitle>
          <DialogDescription>Creates a pending order. The broker signs the contract in his portal; you Mark Paid once the EFT lands.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <RadioGroup value={brand} onValueChange={(v) => setBrand(v as "lv" | "smc")} className="grid gap-2 sm:grid-cols-2">
              <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${brand === "lv" ? "border-primary" : "border-border"}`}>
                <RadioGroupItem value="lv" id="brand-lv" className="mt-0.5" />
                <span><span className="font-medium block">Lead Velocity</span><span className="text-xs text-muted-foreground">Raw leads, delivered as a list</span></span>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border p-3 ${smc ? "cursor-pointer" : "opacity-50 cursor-not-allowed"} ${brand === "smc" ? "border-primary" : "border-border"}`}>
                <RadioGroupItem value="smc" id="brand-smc" className="mt-0.5" disabled={!smc} />
                <span><span className="font-medium block">SortMyCover</span><span className="text-xs text-muted-foreground">{smc ? "Nurtured on WhatsApp, booked into the broker's calendar" : "Available once the crm-nurture migrations are applied"}</span></span>
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-broker">Broker</Label>
            <Select value={brokerId} onValueChange={setBrokerId}>
              <SelectTrigger id="no-broker"><SelectValue placeholder="Pick a broker" /></SelectTrigger>
              <SelectContent>
                {brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.firm_name || "Unnamed"}{b.contact_person ? ` · ${b.contact_person}` : ""}{b.brand_id ? " (SortMyCover)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {notEnrolled && (
              <label className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300 cursor-pointer">
                <Checkbox checked={enrolOk} onCheckedChange={(v) => setEnrolOk(v === true)} className="mt-0.5" aria-label="Enrol this broker in SortMyCover" />
                <span>
                  <b>Also enrol {broker?.firm_name || "this broker"} in SortMyCover.</b> He can then connect his Outlook calendar and set up his intro card.
                  Routing stays <b>off</b> (no leads reach him) until you switch it on. Once enrolled, his practice name, FSP number and WhatsApp number lock when routing goes on.
                </span>
              </label>
            )}
            {otherBrand && (
              <p className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />This broker is enrolled in another brand.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-title">Title (optional)</Label>
            <Input id="no-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={brand === "smc" ? "SortMyCover nurtured leads" : "Commercial small-business leads"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="no-count">{brand === "smc" ? "Leads to deliver" : "Leads"}</Label><Input id="no-count" type="number" min={1} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="no-amount">Amount (R)</Label><Input id="no-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" /></div>
          </div>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : notEnrolled ? "Enrol and create order" : "Create order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
