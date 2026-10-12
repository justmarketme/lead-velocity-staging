/**
 * Broker portal "Documents": the broker's real documents. Rows with admin_documents.broker_id = this broker (signed
 * contracts first) plus library documents an admin shared with him (document_shares). Files sit in the private
 * admin-documents bucket and open through short-lived signed URLs. Filters by broker id explicitly, so the admin
 * "Preview as broker" view (where RLS would return every document) shows exactly what the broker sees.
 * The signed agreement opens in an in-page viewer that grows out of its card (shared layout transition).
 */
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDownToLine, CheckCircle2, ExternalLink, Eye, FileSignature, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AGREEMENT_KINDS, BrokerDocument, docKindLabel, downloadAdminDocument, loadBrokerDocuments, openAdminDocument, signAdminDocument } from "@/lib/adminDocs";
import { FadeIn, Skeleton, m, stagger, item } from "./motion";

function useBrokerDocs(brokerId: string | null | undefined) {
  const [docs, setDocs] = useState<BrokerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!brokerId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const own = await loadBrokerDocuments(brokerId);
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
const btn = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors";

function useFail() {
  const { toast } = useToast();
  return (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ title: "Could not open the document", description: r.error, variant: "destructive" }); };
}

/** Full-screen viewer that animates out of the card (same layoutId). PDFs are embedded on wider screens only: phone browsers don't render PDFs in frames, so phones get Open / Download. */
function DocumentViewer({ doc, layoutId, onClose }: { doc: BrokerDocument; layoutId: string; onClose: () => void }) {
  const fail = useFail();
  const [url, setUrl] = useState<string | null>(null);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => { let alive = true; void signAdminDocument(doc.file_path).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [doc.file_path]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { mq.removeEventListener("change", on); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center md:p-8" role="dialog" aria-modal="true" aria-label={doc.name}>
      <m.div className="absolute inset-0 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <m.div layoutId={layoutId} className="relative w-full md:max-w-5xl h-[85vh] md:h-full flex flex-col rounded-t-[28px] md:rounded-[28px] border border-white/10 bg-[#0b1020] overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-white/10">
          <FileSignature className="h-5 w-5 text-emerald-300 shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 font-semibold text-white truncate">{doc.name}</p>
          <button type="button" onClick={onClose} className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <m.div className="flex-1 min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }}>
          {wide && url ? (
            <iframe src={url} title={doc.name} className="h-full w-full bg-white" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
              <FileText className="h-12 w-12 text-slate-500" aria-hidden="true" />
              <p className="text-slate-300 max-w-sm">{url || !wide ? "Open the PDF in your phone's viewer, or save a copy." : "Preparing the document…"}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={async () => fail(await openAdminDocument(doc.file_path))} className={`${btn} bg-white text-slate-950 hover:bg-slate-200`}><ExternalLink className="h-4 w-4" />Open PDF</button>
                <button type="button" onClick={async () => fail(await downloadAdminDocument(doc.file_path, fileNameOf(doc)))} className={`${btn} border border-white/15 text-white hover:bg-white/10`}><ArrowDownToLine className="h-4 w-4" />Download</button>
              </div>
            </div>
          )}
        </m.div>
      </m.div>
    </div>
  );
}

/** "Your signed agreement": the newest signed (or, failing that, unsigned) agreement for this broker. */
export function SignedAgreementCard({ brokerId, hideWhenEmpty = false }: { brokerId: string | null | undefined; hideWhenEmpty?: boolean }) {
  const { docs, loading } = useBrokerDocs(brokerId);
  const fail = useFail();
  const [viewing, setViewing] = useState(false);
  const agreement = docs.find((d) => d.kind === "signed_agreement") || docs.find((d) => d.kind && AGREEMENT_KINDS.includes(d.kind)) || null;
  if (loading) return hideWhenEmpty ? null : <Skeleton className="h-[120px] w-full" />;
  if (!agreement && hideWhenEmpty) return null;
  const isSigned = agreement?.kind === "signed_agreement";
  const layoutId = `agreement-${agreement?.id || "none"}`;
  return (
    <>
      <m.section layoutId={layoutId} className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/[0.04] p-5 sm:p-7" aria-labelledby={`${layoutId}-t`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <span className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 shrink-0"><FileSignature className="h-6 w-6 text-emerald-300" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Your signed agreement</p>
              {agreement ? (
                <>
                  <h3 id={`${layoutId}-t`} className="text-lg font-semibold text-white break-words mt-1">{agreement.name}</h3>
                  <p className="text-sm text-slate-400 mt-1 flex flex-wrap items-center gap-x-2">
                    {isSigned && <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />}
                    {isSigned ? `Signed${agreement.signed_at ? ` ${format(new Date(agreement.signed_at), "d MMMM yyyy")}` : ""}` : "Not signed yet"}
                    {agreement.signed_by ? <span className="text-slate-500">· {agreement.signed_by}</span> : null}
                  </p>
                </>
              ) : (
                <p id={`${layoutId}-t`} className="text-sm text-slate-400 mt-1">Your agreement will appear here once it has been signed.</p>
              )}
            </div>
          </div>
          {agreement && (
            <div className="flex flex-wrap gap-3">
              <m.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setViewing(true)} className={`${btn} bg-white text-slate-950 hover:bg-slate-200`}><Eye className="h-4 w-4" />View</m.button>
              <m.button whileTap={{ scale: 0.96 }} type="button" onClick={async () => fail(await downloadAdminDocument(agreement.file_path, fileNameOf(agreement)))} className={`${btn} border border-white/15 text-white hover:bg-white/10`}><ArrowDownToLine className="h-4 w-4" />Download</m.button>
            </div>
          )}
        </div>
      </m.section>
      <AnimatePresence>{viewing && agreement && <DocumentViewer doc={agreement} layoutId={layoutId} onClose={() => setViewing(false)} />}</AnimatePresence>
    </>
  );
}

const PremiumDocuments = ({ brokerId }: { brokerId: string | null | undefined }) => {
  const { docs, loading } = useBrokerDocs(brokerId);
  const fail = useFail();
  const others = docs.filter((d) => d.kind !== "signed_agreement");

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white">Documents</h2>
        <p className="text-slate-400 mt-1">Your agreement and the documents we share with you. Private to you.</p>
      </div>

      <SignedAgreementCard brokerId={brokerId} />

      <section aria-labelledby="other-docs">
        <h3 id="other-docs" className="text-sm font-semibold text-slate-300 mb-3">Other documents</h3>
        <AnimatePresence mode="wait">
          {loading ? (
            <m.div key="sk" className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></m.div>
          ) : others.length === 0 ? (
            <FadeIn key="empty"><p className="text-sm text-slate-400">Nothing else here yet. Invoices and documents we share with you will appear here.</p></FadeIn>
          ) : (
            <m.ul key="list" className="space-y-3" variants={stagger} initial="hidden" animate="show">
              {others.map((d) => (
                <m.li key={d.id} variants={item} layout className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-center gap-4">
                  <span className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 shrink-0"><FileText className="h-5 w-5 text-slate-300" aria-hidden="true" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white break-words">{d.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{d.kind ? docKindLabel(d.kind) : (d.category || "Document")} · {format(new Date(d.signed_at || d.created_at), "d MMM yyyy")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <m.button whileTap={{ scale: 0.92 }} type="button" title="View" aria-label={`View ${d.name}`} onClick={async () => fail(await openAdminDocument(d.file_path))} className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10"><Eye className="h-5 w-5" /></m.button>
                    <m.button whileTap={{ scale: 0.92 }} type="button" title="Download" aria-label={`Download ${d.name}`} onClick={async () => fail(await downloadAdminDocument(d.file_path, fileNameOf(d)))} className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10"><ArrowDownToLine className="h-5 w-5" /></m.button>
                  </div>
                </m.li>
              ))}
            </m.ul>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default PremiumDocuments;
