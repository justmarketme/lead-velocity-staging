/**
 * Elite portal "Vault & Ledger": the broker's real documents. Rows with admin_documents.broker_id = this broker (signed
 * contracts first) plus library documents an admin shared with him (document_shares). Files sit in the private
 * admin-documents bucket and open through short-lived signed URLs. Filters by broker id explicitly, so the admin
 * "Preview as broker" view (where RLS would return every document) shows exactly what the broker sees.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDownToLine, CheckCircle2, Eye, FileSignature, FileText, Lock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AGREEMENT_KINDS, BrokerDocument, docKindLabel, downloadAdminDocument, loadBrokerDocuments, openAdminDocument } from "@/lib/adminDocs";

function useBrokerDocs(brokerId: string | null | undefined) {
  const [docs, setDocs] = useState<BrokerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!brokerId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const own = await loadBrokerDocuments(brokerId);
      // library documents shared with this broker
      const { data: shares } = await supabase.from("document_shares").select("document_id").eq("broker_id", brokerId);
      const ids = (shares || []).map((s) => s.document_id).filter((id) => !own.docs.some((d) => d.id === id));
      let shared: BrokerDocument[] = [];
      if (ids.length) {
        const { data } = await supabase.from("admin_documents").select("*").in("id", ids).order("created_at", { ascending: false });
        shared = (data || []) as unknown as BrokerDocument[];
      }
      if (alive) { setDocs([...own.docs, ...shared]); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [brokerId]);
  return { docs, loading };
}

const fileNameOf = (d: BrokerDocument) => d.file_path.split("/").pop() || "document.pdf";

function DocActions({ doc, big = false }: { doc: BrokerDocument; big?: boolean }) {
  const { toast } = useToast();
  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ title: "Could not open the document", description: r.error, variant: "destructive" }); };
  if (big) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button onClick={async () => fail(await openAdminDocument(doc.file_path))} className="bg-white text-black hover:bg-slate-200 font-black h-12 px-6 rounded-2xl text-xs uppercase tracking-widest">
          <Eye className="mr-2 h-4 w-4" /> View
        </Button>
        <Button variant="outline" onClick={async () => fail(await downloadAdminDocument(doc.file_path, fileNameOf(doc)))} className="bg-transparent border-white/15 text-white hover:bg-white/10 font-black h-12 px-6 rounded-2xl text-xs uppercase tracking-widest">
          <ArrowDownToLine className="mr-2 h-4 w-4" /> Download
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button variant="ghost" size="icon" title="View" aria-label={`View ${doc.name}`} onClick={async () => fail(await openAdminDocument(doc.file_path))} className="h-12 w-12 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl border border-white/5"><Eye className="w-5 h-5" /></Button>
      <Button variant="ghost" size="icon" title="Download" aria-label={`Download ${doc.name}`} onClick={async () => fail(await downloadAdminDocument(doc.file_path, fileNameOf(doc)))} className="h-12 w-12 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl border border-white/5"><ArrowDownToLine className="w-5 h-5" /></Button>
    </div>
  );
}

/** "Your signed agreement": the newest signed (or, failing that, unsigned) agreement for this broker. */
export function SignedAgreementCard({ brokerId, hideWhenEmpty = false }: { brokerId: string | null | undefined; hideWhenEmpty?: boolean }) {
  const { docs, loading } = useBrokerDocs(brokerId);
  const agreement = docs.find((d) => d.kind === "signed_agreement") || docs.find((d) => d.kind && AGREEMENT_KINDS.includes(d.kind)) || null;
  if (loading || (!agreement && hideWhenEmpty)) return null;
  const isSigned = agreement?.kind === "signed_agreement";
  return (
    <Card className="bg-[#020617] border-white/5 rounded-[32px] shadow-2xl overflow-hidden border-l-4 border-l-emerald-500">
      <CardContent className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-5 min-w-0">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shrink-0"><FileSignature className="w-7 h-7 text-emerald-400" /></div>
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Your signed agreement</p>
            {agreement ? (
              <>
                <h3 className="text-xl font-black text-white tracking-tight break-words">{agreement.name}</h3>
                <p className="text-sm text-slate-400 flex flex-wrap items-center gap-x-2">
                  {isSigned && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {isSigned ? `Signed${agreement.signed_at ? ` ${format(new Date(agreement.signed_at), "d MMMM yyyy")}` : ""}` : "Not signed yet"}
                  {agreement.signed_by ? <span className="text-slate-500">· {agreement.signed_by}</span> : null}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Your agreement will appear here once it has been signed.</p>
            )}
          </div>
        </div>
        {agreement && <DocActions doc={agreement} big />}
      </CardContent>
    </Card>
  );
}

const PremiumDocuments = ({ brokerId }: { brokerId: string | null | undefined }) => {
  const { docs, loading } = useBrokerDocs(brokerId);
  const others = docs.filter((d) => d.kind !== "signed_agreement");

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-10 duration-1000 pb-20">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-pink-500/10 p-2.5 rounded-2xl"><Lock className="w-5 h-5 text-pink-500" /></div>
          <span className="text-[10px] font-black uppercase text-pink-500 tracking-[0.3em] bg-pink-500/5 px-4 py-1.5 rounded-full border border-pink-500/10">Private to you</span>
        </div>
        <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tighter italic uppercase">Vault & Ledger</h2>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Your agreement and the documents we share with you</p>
      </div>

      <SignedAgreementCard brokerId={brokerId} />

      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Other documents</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing else here yet. Invoices and documents we share with you will appear here.</p>
        ) : others.map((d) => (
          <Card key={d.id} className="bg-[#020617] border-white/5 hover:border-pink-500/20 transition-all rounded-[24px] shadow-xl">
            <CardContent className="p-5 sm:p-6 flex items-center gap-5">
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 shrink-0"><FileText className="w-6 h-6 text-slate-400" /></div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-black text-white break-words">{d.name}</h4>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  <Badge variant="outline" className="border-white/10 text-slate-400 text-[10px]">{d.kind ? docKindLabel(d.kind) : (d.category || "Document")}</Badge>
                  <span>{format(new Date(d.signed_at || d.created_at), "d MMM yyyy")}</span>
                </div>
              </div>
              <DocActions doc={d} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PremiumDocuments;
