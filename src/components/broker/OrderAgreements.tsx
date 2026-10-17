import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, PenLine, CheckCircle2, Loader2 } from "lucide-react";
import SignaturePad, { SignaturePadHandle } from "@/components/broker/SignaturePad";
import { generateSmartPDF } from "@/utils/pdfUtils";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";

// ── Constants (the delivering + invoicing entities) ─────────────────────────
const SELLER = "Lead Velocity";
const SELLER_ENTITY = "Lead Velocity (Pty) Ltd";
const CLIENT_ENTITY = "Opulent Wealth Pty Ltd";
const CLIENT_TRADING = "Discovery Financial Consultants – Helderberg";

// Banking (FNB / Lead Velocity Pty Ltd)
const BANK = {
  bank: "First National Bank (FNB)",
  account: "Lead Velocity Pty Ltd",
  number: "63174286724",
  branch: "250655",
};

// ── Types (kept loose — these custom tables aren't in generated types) ──────
interface LeadOrder {
  id: string;
  broker_id: string;
  title: string | null;
  lead_count: number | null;
  amount_zar: number | null; // cents
  currency: string | null;
  status: string;
  contract_signed_at: string | null;
  contract_signature?: string | null;
  contract_signature_image?: string | null;
  criteria: Record<string, unknown> | null;
  created_at: string | null;
}

interface OrderAgreementsProps {
  order: LeadOrder;
  brokerContactName: string;
  brokerFirmName: string;
  brokerEmail: string;
  onSigned: (result: { signedAt: string | null; signature: string | null; signatureImage?: string | null; status: string }) => void;
  /** When true, hide the e-sign block and render the documents read-only (still downloadable). */
  readOnly?: boolean;
}

const formatZar = (cents: number | null | undefined) => {
  const value = (cents ?? 0) / 100;
  return `R${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : "—";

const OrderAgreements = ({
  order,
  brokerContactName,
  brokerFirmName,
  brokerEmail,
  onSigned,
  readOnly = false,
}: OrderAgreementsProps) => {
  const { toast } = useToast();
  const [signature, setSignature] = useState(brokerContactName || "");
  const [agreed, setAgreed] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState<"contract" | "invoice" | null>(null);

  const contractRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const signed = !!order.contract_signed_at;

  // ── Derived scope from criteria ───────────────────────────────────────────
  const scope = useMemo(() => {
    const c = (order.criteria || {}) as Record<string, unknown>;
    const areasRaw = (c.areas ?? c.area) as unknown;
    const areas = Array.isArray(areasRaw)
      ? areasRaw.map(String)
      : areasRaw
        ? [String(areasRaw)]
        : [];
    return {
      areas,
      areasText: areas.length ? areas.join(", ") : "the agreed target areas",
      segment: c.segment ? String(c.segment) : "commercial small-business",
      qualifier: c.qualifier ? String(c.qualifier) : "",
      product: c.product ? String(c.product) : "",
    };
  }, [order.criteria]);

  const leadCount = order.lead_count ?? 0;
  const total = formatZar(order.amount_zar);
  const invoiceNo = `INV-${(order.id || "").slice(0, 8).toUpperCase()}`;
  const docDate = formatDate(order.created_at);
  const firmName = brokerFirmName || CLIENT_ENTITY;

  // ── Shared "Smart PDF" download (mirrors the admin generators) ─────────────
  const downloadDoc = async (
    ref: React.RefObject<HTMLDivElement>,
    fileName: string,
    key: "contract" | "invoice",
    toastLabel: string,
  ) => {
    if (!ref.current) return;
    try {
      setBusy(key);
      toast({ title: "Generating PDF...", description: toastLabel });

      const element = ref.current;
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.transform = "none";
      clone.style.position = "fixed";
      clone.style.top = "-9999px";
      clone.style.left = "0";
      clone.style.width = "210mm";
      clone.style.minHeight = "297mm";
      clone.style.height = "auto";
      clone.style.zIndex = "-9999";
      clone.style.backgroundColor = "#ffffff";

      // Strip interactive-only chrome so the PDF matches the printed doc
      clone.querySelectorAll("[data-no-print]").forEach((el) => el.remove());
      clone.querySelectorAll("button").forEach((btn) => btn.remove());

      const style = document.createElement("style");
      style.textContent = `
        header { page-break-after: avoid!important; break-after: avoid!important; }
        h1, h2, h3, h4 { page-break-after: avoid!important; break-after: avoid!important; }
        section, table, .bg-slate-50, .border, .bg-slate-900 {
          page-break-inside: avoid!important;
          break-inside: avoid!important;
          margin-bottom: 24px!important;
          position: relative!important;
        }
        tr { page-break-inside: avoid!important; break-inside: avoid!important; }
        p { orphans: 4; widows: 4; line-height: 1.6!important; }
        table { border-collapse: collapse!important; width: 100%!important; page-break-inside: auto!important; }
      `;
      clone.appendChild(style);
      document.body.appendChild(clone);

      const pdf = await generateSmartPDF(clone, { scale: 1.5, quality: 0.9 });
      document.body.removeChild(clone);

      pdf.save(fileName);
      toast({ title: "Downloaded", description: fileName });
    } catch (e: any) {
      console.error(`${key} pdf error`, e);
      toast({ title: "Export failed", description: e?.message || "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // ── E-sign the contract with a drawn (hand) signature ─────────────────────
  const handleSign = async () => {
    const image = padRef.current?.toDataURL() ?? null;
    if (!image) {
      toast({ title: "Signature required", description: "Please draw your signature in the box.", variant: "destructive" });
      return;
    }
    if (!agreed) {
      toast({ title: "Please agree", description: "Tick the box to accept the terms before signing.", variant: "destructive" });
      return;
    }
    const name = signature.trim() || brokerContactName || firmName;
    setSigning(true);
    try {
      const { data, error } = await (supabase as any).rpc("sign_order_contract_drawn", {
        p_order_id: order.id,
        p_signature_name: name,
        p_signature_image: image,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      onSigned({
        signedAt: row?.out_signed_at ?? new Date().toISOString(),
        signature: name,
        signatureImage: image,
        status: row?.out_status ?? "contract_signed",
      });
      toast({ title: "Agreement signed", description: "Thank you — your agreement is now on file." });
    } catch (e: any) {
      console.error("sign_order_contract_drawn error", e);
      toast({ title: "Signing failed", description: e?.message || "Could not record your signature.", variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  // ── Small building blocks that reproduce the admin document look ──────────
  const SectionHeading = ({ accent = "bg-pink-600", children }: { accent?: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 mb-2">
      <div className={`h-6 w-1 ${accent} rounded-full`} />
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
    </div>
  );

  const signedName = order.contract_signature || brokerContactName || signature;
  const signatureImage = order.contract_signature_image || null;

  return (
    <div className="space-y-8">
      {/* ═══════════════ CONTRACT ═══════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Raw Leads Delivery Agreement</h3>
            <p className="text-sm text-muted-foreground">The contract governing this lead order</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadDoc(contractRef, `Agreement-${invoiceNo}.pdf`, "contract", "Raw Leads Delivery Agreement")}
            disabled={busy !== null}
            className="shrink-0"
          >
            {busy === "contract" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </div>

        {/* Scrollable A4 canvas — fluid on phones, fixed A4 in the PDF clone */}
        <div className="overflow-x-auto rounded-xl ring-1 ring-border shadow-lg">
          <div
            ref={contractRef}
            className="w-full min-w-[320px] max-w-[820px] mx-auto bg-white text-slate-900 font-sans relative overflow-hidden"
          >
            <div className="h-2 w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600" />
            <div className="p-6 sm:p-10">
              {/* Letterhead */}
              <header className="border-b-2 border-slate-100 pb-6 mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                <div>
                  <img src={logo} alt="Lead Velocity" className="h-16 w-auto object-contain mb-4" />
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Raw Leads Delivery Agreement</h1>
                  <p className="text-slate-500 font-medium mt-1">Commercial Lead Data · {invoiceNo}</p>
                </div>
                <div className="sm:text-right">
                  <div className="bg-slate-50 px-4 py-2 rounded-lg border inline-block">
                    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">The Client</p>
                    <p className="font-bold text-lg text-slate-900">{firmName}</p>
                    <p className="text-sm text-slate-500">{brokerContactName || "Authorised Signatory"}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Dated {docDate}</p>
                </div>
              </header>

              <main className="space-y-4 text-[13px] sm:text-[14px] leading-relaxed text-slate-600">
                {/* Parties */}
                <section className="bg-slate-50 border rounded-xl p-5">
                  <SectionHeading>Parties to this Agreement</SectionHeading>
                  <p className="text-sm text-slate-500 mb-4">
                    This Raw Leads Delivery Agreement ("Agreement") is entered into as of {docDate}, by and between:
                  </p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="bg-white border border-pink-200 rounded-lg p-4">
                      <p className="text-[10px] font-black text-pink-600 uppercase tracking-widest mb-3">The Provider</p>
                      <p className="font-bold text-slate-900 text-lg">{SELLER_ENTITY}</p>
                      <p className="text-xs text-slate-400 mt-3 italic">(hereinafter "{SELLER}" or "the Provider")</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">The Client</p>
                      <p className="font-bold text-slate-900 text-lg">{firmName}</p>
                      <p className="text-slate-600 text-sm mt-1">t/a {CLIENT_TRADING}</p>
                      <p className="text-xs text-slate-400 mt-3 italic">(hereinafter "the Client")</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-200">
                    The Provider and the Client are collectively referred to as "the Parties".
                  </p>
                </section>

                {/* Commercial Terms */}
                <section className="bg-slate-50 rounded-xl p-6 border">
                  <h3 className="text-xs font-black text-slate-400 uppercase mb-4">Commercial Terms</h3>
                  <div className="grid grid-cols-3 gap-4 sm:gap-8">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Fee</p>
                      <p className="text-pink-600 font-bold text-lg sm:text-xl">{total}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Quantity</p>
                      <p className="text-slate-900 font-bold">{leadCount} leads</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Unit Price</p>
                      <p className="text-slate-900 font-bold">R1.00 / lead</p>
                    </div>
                  </div>
                </section>

                {/* 1. Scope */}
                <section>
                  <SectionHeading>1. Scope of Delivery</SectionHeading>
                  <p className="pl-4">
                    The Provider will deliver <span className="font-semibold text-slate-800">{leadCount}</span> {scope.segment}{" "}
                    (commercial raw) leads located in <span className="font-semibold text-slate-800">{scope.areasText}</span>.
                    {scope.qualifier ? ` Qualifier: ${scope.qualifier}.` : ""}
                    {scope.product ? ` Product focus: ${scope.product}.` : ""}
                  </p>
                </section>

                {/* 2. Raw data only */}
                <section>
                  <SectionHeading>2. Raw Data Only</SectionHeading>
                  <p className="pl-4">
                    The Provider supplies raw contact data only. No appointment booking, qualification calls, or lead
                    nurturing is included in this order.
                  </p>
                </section>

                {/* 3. POPIA */}
                <section className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <SectionHeading accent="bg-blue-600">3. POPIA & Consent</SectionHeading>
                  <p className="text-blue-800 text-sm">
                    All data is processed in line with the Protection of Personal Information Act (POPIA). The Client is
                    responsible for lawful, consent-based outreach to the supplied contacts.
                  </p>
                </section>

                {/* 4. Release conditions */}
                <section className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <SectionHeading accent="bg-green-600">4. Release Conditions</SectionHeading>
                  <p className="text-green-800 text-sm">
                    Contact details are released only after (a) this Agreement is <span className="font-semibold">signed</span>{" "}
                    AND (b) payment has <span className="font-semibold">cleared</span>. Neither condition alone unlocks the
                    data.
                  </p>
                </section>

                {/* 5. No resale */}
                <section className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <SectionHeading accent="bg-red-600">5. No Resale</SectionHeading>
                  <p className="text-red-800 text-sm">
                    The Client may not resell, redistribute, or sublicense the supplied lead data to any third party.
                  </p>
                </section>

                {/* Banking block */}
                <section className="bg-slate-900 text-white p-6 rounded-xl">
                  <h3 className="font-bold mb-3">Payment Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-400">Bank:</span> <span className="font-bold">{BANK.bank}</span></div>
                    <div><span className="text-slate-400">Account Holder:</span> <span className="font-bold">{BANK.account}</span></div>
                    <div><span className="text-slate-400">Account #:</span> <span className="font-bold">{BANK.number}</span></div>
                    <div><span className="text-slate-400">Branch Code:</span> <span className="font-bold">{BANK.branch}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Reference:</span> <span className="font-bold">{invoiceNo}</span></div>
                  </div>
                </section>

                {/* Signature area */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 pt-8 mt-8 border-t-2">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold mb-6">For Lead Velocity</p>
                    <div className="border-b-2 border-slate-300 mb-2 h-12" />
                    <p className="text-sm text-slate-600">Authorised Representative</p>
                    <p className="text-sm text-slate-400">{docDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold mb-6">For The Client</p>
                    <div className="border-b-2 border-slate-300 mb-2 h-16 flex items-end">
                      {signed && signatureImage ? (
                        <img src={signatureImage} alt="Signature" className="h-16 w-auto object-contain pb-1" crossOrigin="anonymous" />
                      ) : signed ? (
                        <span className="font-signature text-lg text-slate-800 pb-1">{signedName}</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-600">{signed ? signedName : "Authorised Signatory"}</p>
                    <p className="text-sm text-slate-400">
                      {signed ? `Date: ${formatDate(order.contract_signed_at)}` : "Date: _______________"}
                    </p>
                  </div>
                </section>
              </main>
            </div>
          </div>
        </div>

        {/* ── Interactive e-sign block (never captured in the PDF) ── */}
        <div className="rounded-xl border border-border bg-card/50 p-4 sm:p-6" data-no-print>
          {signed ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-green-600">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Signed on {formatDate(order.contract_signed_at)}</p>
                  <p className="text-xs opacity-90">by {signedName} — download your signed copy</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDoc(contractRef, `Agreement-${invoiceNo}.pdf`, "contract", "Signed Agreement")}
                disabled={busy !== null}
                className="shrink-0"
              >
                {busy === "contract" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {readOnly ? "Download signed copy" : "Download your signed copy"}
              </Button>
            </div>
          ) : readOnly ? (
            <p className="text-sm text-muted-foreground">This agreement has not been signed yet.</p>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" /> Sign this agreement
              </p>
              <div className="space-y-1.5">
                <label htmlFor="sig" className="text-xs text-muted-foreground">Full name (optional — for the record)</label>
                <Input
                  id="sig"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={brokerContactName || "Your full name"}
                  className="max-w-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Draw your signature</label>
                <SignaturePad ref={padRef} onChange={setHasDrawing} className="max-w-md" />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
                <span className="text-sm text-muted-foreground">
                  I, on behalf of {firmName}, agree to the terms of this Raw Leads Delivery Agreement.
                </span>
              </label>
              <Button onClick={handleSign} disabled={signing || !agreed || !hasDrawing}>
                <PenLine className="mr-2 h-4 w-4" />
                {signing ? "Signing…" : "Sign Agreement"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════ INVOICE ═══════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Invoice</h3>
            <p className="text-sm text-muted-foreground">{invoiceNo} · {docDate}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadDoc(invoiceRef, `Invoice-${invoiceNo}.pdf`, "invoice", "Invoice")}
            disabled={busy !== null}
            className="shrink-0"
          >
            {busy === "invoice" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl ring-1 ring-border shadow-lg">
          <div
            ref={invoiceRef}
            className="w-full min-w-[320px] max-w-[820px] mx-auto bg-white text-slate-900 font-sans relative overflow-hidden flex flex-col"
          >
            {/* Header / Letterhead */}
            <div className="p-6 sm:p-10 pb-8 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 border-b-2 border-slate-100">
              <div>
                <img src={logo} alt="Lead Velocity" className="h-20 w-auto object-contain mb-6" />
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">INVOICE</h1>
              </div>
              <div className="sm:text-right">
                <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Lead Velocity</h2>
                <div className="text-[11px] text-slate-500 mt-3 space-y-0.5 leading-tight">
                  <p className="font-bold text-slate-800">{SELLER_ENTITY}</p>
                  <p>Commercial Lead Data</p>
                  <p className="text-green-600 font-medium">howzit@leadvelocity.co.za</p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-10 py-10 flex-1">
              {/* Bill-to + meta */}
              <div className="flex flex-col sm:flex-row sm:justify-between gap-6 mb-12">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Bill To</p>
                  <h3 className="font-black text-xl sm:text-2xl text-slate-900 mb-1">{CLIENT_ENTITY}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">t/a {CLIENT_TRADING}</p>
                  {brokerEmail && <p className="text-slate-400 text-xs mt-3 font-mono">{brokerEmail}</p>}
                </div>
                <div className="sm:text-right space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Invoice #</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2 py-1">{invoiceNo}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Issue Date</span>
                    <span className="text-sm font-medium text-slate-900">{docDate}</span>
                  </div>
                  <div className="pt-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-bold text-[10px] uppercase tracking-tighter">
                      Settlement Pending
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-12">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-950">
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/2">Description</th>
                      <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                      <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit Price</th>
                      <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-5 font-bold text-slate-900 text-sm">
                        Commercial lead data (raw) — {leadCount} leads @ R1.00
                      </td>
                      <td className="py-5 text-center text-slate-500 font-mono text-xs">{leadCount}</td>
                      <td className="py-5 text-right text-slate-500 font-mono text-xs">R1.00</td>
                      <td className="py-5 text-right font-bold text-slate-900 text-sm">{total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end mb-12">
                <div className="w-full sm:w-1/2 bg-slate-950 text-white p-8 rounded-2xl shadow-xl">
                  <div className="flex justify-between mb-3">
                    <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Net Subtotal</span>
                    <span className="font-bold text-sm">{total}</span>
                  </div>
                  <div className="flex justify-between mb-6 pb-6 border-b border-white/10">
                    <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">VAT (0%)</span>
                    <span className="font-bold text-sm">R0.00</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="font-black text-xs uppercase tracking-widest text-green-400">Total Due</span>
                    <span className="font-black text-2xl text-white">{total}</span>
                  </div>
                </div>
              </div>

              {/* Banking & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12">
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                  <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    EFT Payment Details
                  </h4>
                  <div className="space-y-2 text-xs text-slate-600 leading-tight">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Bank</span>
                      <span className="font-bold text-slate-900">{BANK.bank}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Account</span>
                      <span className="font-bold text-slate-900">{BANK.account}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Acc #</span>
                      <span className="font-bold text-slate-900">{BANK.number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Branch</span>
                      <span className="font-bold text-slate-900">{BANK.branch}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Ref</span>
                      <span className="font-black text-green-600">{invoiceNo}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-widest mb-4">Terms & Notes</h4>
                  <p className="text-xs text-slate-500 leading-relaxed italic">
                    Leads are released once this invoice is paid in full and the Raw Leads Delivery Agreement is signed.
                    Raw data only — no appointment setting. POPIA-compliant outreach is the Client's responsibility. No
                    resale permitted.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto relative">
              <div className="h-2 w-full bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
              <div className="bg-slate-950 px-6 sm:px-[20mm] py-4 flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                <p>Strictly Private &amp; Confidential</p>
                <p>Electronic Tax Invoice · Lead Velocity</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrderAgreements;
