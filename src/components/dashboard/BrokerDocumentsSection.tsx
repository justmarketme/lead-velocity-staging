/**
 * Admin broker drawer: this broker's documents (admin_documents.broker_id), signed contracts first, with View / Download
 * through short-lived signed URLs and an upload for further signed documents. The broker sees the same rows in his portal.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye, FileSignature, FileText, Loader2, Upload } from "lucide-react";
import { format } from "date-fns";
import { BrokerDocument, DOC_KINDS, docKindLabel, downloadAdminDocument, loadBrokerDocuments, openAdminDocument, uploadBrokerDocument } from "@/lib/adminDocs";

export default function BrokerDocumentsSection({ brokerId, brokerLabel }: { brokerId: string; brokerLabel: string }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<BrokerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("signed_agreement");
  const [name, setName] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadBrokerDocuments(brokerId);
    setDocs(r.docs); setLoadError(r.error || null); setLoading(false);
  }, [brokerId]);
  useEffect(() => { void load(); setOpen(false); }, [load]);

  const signed = kind === "signed_agreement";
  async function upload() {
    if (!file) return toast({ title: "Choose a file first", variant: "destructive" });
    if (!name.trim()) return toast({ title: "Give the document a name", variant: "destructive" });
    if (signed && (!signedBy.trim() || !signedAt)) return toast({ title: "Signed by and signed date are needed for a signed agreement", variant: "destructive" });
    setBusy(true);
    const r = await uploadBrokerDocument({
      brokerId, file, name: name.trim(), kind,
      signedBy: signedBy.trim() || null, signedAt: signedAt ? new Date(`${signedAt}T12:00:00`).toISOString() : null,
    });
    setBusy(false);
    if (!r.ok) return toast({ title: "Upload failed", description: r.error, variant: "destructive" });
    toast({ title: "Document added", description: `${brokerLabel} now sees it in his portal.` });
    setFile(null); setName(""); setSignedBy(""); setSignedAt(""); setOpen(false);
    void load();
  }

  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ title: "Could not open the document", description: r.error, variant: "destructive" }); };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> Documents</h3>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}><Upload className="mr-1 h-3.5 w-3.5" /> {open ? "Cancel" : "Upload"}</Button>
      </div>

      {open && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-3 mb-3">
          <div className="space-y-1">
            <Label htmlFor="bd-file" className="text-xs">File (PDF)</Label>
            <Input id="bd-file" type="file" accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, "")); }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[130]">{DOC_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bd-date" className="text-xs">Signed on{signed ? "" : " (optional)"}</Label>
              <Input id="bd-date" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bd-name" className="text-xs">Name the broker sees</Label>
            <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead Generation Services Agreement — signed" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bd-by" className="text-xs">Signed by{signed ? "" : " (optional)"}</Label>
            <Input id="bd-by" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Client name (Client); Kgomotso Pule, Director (Lead Velocity)" />
          </div>
          <Button size="sm" onClick={upload} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{busy ? "Uploading…" : "Upload document"}</Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">Documents unavailable: {loadError}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents for this broker yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex gap-2">
                {d.kind === "signed_agreement" ? <FileSignature className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" /> : <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.signed_at ? `Signed ${format(new Date(d.signed_at), "d MMM yyyy")}` : `Added ${format(new Date(d.created_at), "d MMM yyyy")}`}
                    {d.signed_by ? ` · ${d.signed_by}` : ""}
                  </p>
                  <Badge variant="outline" className="mt-1 text-[10px]">{docKindLabel(d.kind)}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-8 px-2" title="View" onClick={async () => fail(await openAdminDocument(d.file_path))}><Eye className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" title="Download" onClick={async () => fail(await downloadAdminDocument(d.file_path, d.file_path.split("/").pop() || "document.pdf"))}><Download className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
