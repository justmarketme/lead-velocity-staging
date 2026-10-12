/**
 * Admin: create a CRM lead order (lead_orders, RLS "Admins full access") with its campaign (brand).
 * Lead Velocity raw leads -> brand_id NULL (uploaded / delivered as today). A campaign (a `brands` row, today SortMyCover)
 * -> nurtured leads: once the order is paid, the routing triggers attach each consumer lead the broker receives
 * (lead_order_items) until lead_count is reached (CRM-NURTURE-SCHEMA.md section 2). Contract, invoice and Mark Paid stay
 * the existing flow. A campaign order for a broker not yet enrolled also enrols him (brokers.brand_id, routing_on stays
 * false) after an explicit tick. Leads and price come from the plan catalogue (src/lib/pricing.ts) or are typed (Custom).
 * The logic lives in src/lib/brokerCampaign.ts so the broker drawer's Campaigns panel opens this same dialog.
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
import { smcDb } from "@/lib/smc";
import { isPilot, zar } from "@/lib/pricing";
import { ORDER_PLANS, createLeadOrder, enrolBrokerInBrand, planByCode } from "@/lib/brokerCampaign";
import type { Brand } from "./orderBrands";

interface BrokerOpt { id: string; firm_name: string | null; contact_person: string | null; brand_id?: string | null }

const LV = "lv";        // brand radio value for Lead Velocity raw leads (brand_id NULL)
const CUSTOM = "custom"; // plan select value for typed lead count + amount

export default function NewOrderDialog({ open, onOpenChange, brands, onCreated, initialBrokerId, initialBrandId, initialPlan }: {
  open: boolean; onOpenChange: (o: boolean) => void; brands: Brand[] | null; onCreated: (orderId: string | null) => void;
  /** Prefill (broker drawer): the broker, the campaign (null = Lead Velocity) and the plan tier_code. */
  initialBrokerId?: string; initialBrandId?: string | null; initialPlan?: string;
}) {
  const campaigns = useMemo(() => (brands || []).filter((b) => b.is_active), [brands]);
  const [brokers, setBrokers] = useState<BrokerOpt[]>([]);
  const [brokerId, setBrokerId] = useState("");
  const [brand, setBrand] = useState<string>(LV);
  const [plan, setPlan] = useState<string>(CUSTOM);
  const [title, setTitle] = useState("");
  const [count, setCount] = useState("50");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [enrolOk, setEnrolOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (initialBrokerId) setBrokerId(initialBrokerId);
    if (initialBrandId !== undefined) setBrand(initialBrandId || LV);
    if (initialPlan) choosePlan(initialPlan);
    (async () => {
      const withBrand = await smcDb.from("brokers").select("id, firm_name, contact_person, brand_id").order("firm_name");
      const r = withBrand.error // before the migrations brokers.brand_id does not exist
        ? await smcDb.from("brokers").select("id, firm_name, contact_person").order("firm_name")
        : withBrand;
      setBrokers(((r.data as unknown as BrokerOpt[]) || []));
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const campaign = campaigns.find((b) => b.id === brand) || null;
  const broker = brokers.find((b) => b.id === brokerId);
  const notEnrolled = !!campaign && !!broker && !broker.brand_id;
  const otherBrand = !!campaign && !!broker?.brand_id && broker.brand_id !== campaign.id;
  const brandName = (id: string | null | undefined) => campaigns.find((b) => b.id === id)?.name || "a campaign";
  useEffect(() => { setEnrolOk(false); }, [brokerId, brand]);

  function choosePlan(code: string) {
    setPlan(code);
    const p = planByCode(code);
    if (p) { setCount(String(p.committed_leads)); setAmount(String(p.price_zar)); }
  }

  async function create() {
    setErr(null);
    const n = Number(count);
    const rands = Number(amount.replace(/[\s,]/g, ""));
    if (!brokerId) return setErr("Pick the broker.");
    if (!Number.isInteger(n) || n < 1 || n > 100000) return setErr("Leads: a whole number from 1.");
    if (!Number.isFinite(rands) || rands < 0) return setErr("Amount: rands, e.g. 15000.");
    if (brand !== LV && !campaign) return setErr("That campaign is not in this database.");
    if (otherBrand) return setErr(`This broker is linked to ${brandName(broker?.brand_id)}. Change that first.`);
    if (notEnrolled && !enrolOk) return setErr(`Tick the line to also link this broker to ${campaign!.name}.`);
    setBusy(true);
    // Enrol first; if enrolment fails, no order.
    if (notEnrolled) {
      const { error } = await enrolBrokerInBrand(brokerId, campaign!.id);
      if (error) { setBusy(false); return setErr(`Could not link the broker to ${campaign!.name}: ${error}. No order was created.`); }
    }
    const { id, error } = await createLeadOrder({
      brokerId, brandId: campaign?.id ?? null, brandName: campaign?.name ?? null, leadCount: n, amountRands: rands,
      title, planCode: plan === CUSTOM ? null : plan,
    });
    setBusy(false);
    if (error) return setErr(`${notEnrolled ? `The broker is now linked to ${campaign!.name}, but the order was not created: ` : ""}${error}`);
    setTitle(""); setAmount(""); setBrokerId(""); setBrand(LV); setPlan(CUSTOM); setCount("50");
    onOpenChange(false);
    onCreated(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg z-[130]">
        <DialogHeader>
          <DialogTitle>New lead order</DialogTitle>
          <DialogDescription>Creates a pending order. The broker signs the contract in his portal; you mark it paid once the EFT lands (or attach his proof of payment).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <RadioGroup value={brand} onValueChange={setBrand} className="grid gap-2 sm:grid-cols-2">
              <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${brand === LV ? "border-primary" : "border-border"}`}>
                <RadioGroupItem value={LV} id="brand-lv" className="mt-0.5" />
                <span><span className="font-medium block">Lead Velocity</span><span className="text-xs text-muted-foreground">Raw leads, delivered as a list</span></span>
              </label>
              {campaigns.map((c) => (
                <label key={c.id} className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${brand === c.id ? "border-primary" : "border-border"}`}>
                  <RadioGroupItem value={c.id} id={`brand-${c.code}`} className="mt-0.5" />
                  <span><span className="font-medium block">{c.name}</span><span className="text-xs text-muted-foreground">Nurtured on WhatsApp, booked into the broker's calendar</span></span>
                </label>
              ))}
              {!campaigns.length && (
                <p className="text-xs text-muted-foreground sm:col-span-2">No campaigns in this database yet (brands table).</p>
              )}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-broker">Broker</Label>
            <Select value={brokerId} onValueChange={setBrokerId} disabled={!!initialBrokerId}>
              <SelectTrigger id="no-broker"><SelectValue placeholder="Pick a broker" /></SelectTrigger>
              <SelectContent className="z-[140]">
                {brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.firm_name || "Unnamed"}{b.contact_person ? ` · ${b.contact_person}` : ""}{b.brand_id ? ` (${brandName(b.brand_id)})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {notEnrolled && (
              <label className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300 cursor-pointer">
                <Checkbox checked={enrolOk} onCheckedChange={(v) => setEnrolOk(v === true)} className="mt-0.5" aria-label={`Link this broker to ${campaign?.name}`} />
                <span>
                  <b>Also link {broker?.firm_name || "this broker"} to {campaign?.name}.</b> He can then connect his Outlook calendar and set up his intro card.
                  Routing stays <b>off</b> (no leads reach him) until you press Go live in his drawer. His practice name, FSP number and WhatsApp number lock while he is live.
                </span>
              </label>
            )}
            {otherBrand && (
              <p className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />This broker is linked to {brandName(broker?.brand_id)}.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-plan">Plan</Label>
            <Select value={plan} onValueChange={choosePlan}>
              <SelectTrigger id="no-plan"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[140]">
                {ORDER_PLANS.map((p) => (
                  <SelectItem key={p.tier_code} value={p.tier_code}>{p.name}: {p.committed_leads} leads, {zar(p.price_zar)}{isPilot(p) ? " once-off" : " per cycle"}</SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom (type the leads and amount)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-title">Title (optional)</Label>
            <Input id="no-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={campaign ? `${campaign.name} nurtured leads` : "Commercial small-business leads"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="no-count">{campaign ? "Leads to deliver" : "Leads"}</Label><Input id="no-count" type="number" min={1} inputMode="numeric" value={count} disabled={plan !== CUSTOM} onChange={(e) => setCount(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="no-amount">Amount (R, excl. VAT)</Label><Input id="no-amount" inputMode="decimal" value={amount} disabled={plan !== CUSTOM} onChange={(e) => setAmount(e.target.value)} placeholder="15000" /></div>
          </div>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : notEnrolled ? "Link and create order" : "Create order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
