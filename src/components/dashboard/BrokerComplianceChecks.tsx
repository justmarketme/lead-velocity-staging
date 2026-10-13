/**
 * Admin broker drawer: Lead Velocity's compliance checks on this broker (public.broker_compliance_checks, append-only;
 * admins read all rows by RLS), newest first. Evidence screenshots live in the PRIVATE bucket compliance-evidence and
 * open through a short-lived signed URL. Deliberately shows only date, type, result and summary: never who checked or
 * the raw details (they can name compliance officers / key individuals).
 */
import { useEffect, useState } from "react";
import { FileSearch, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDaySast } from "@/lib/brokerReview";

const EVIDENCE_BUCKET = "compliance-evidence";
const LINK_SECONDS = 300;

interface CheckRow { id: string; check_type: string; result: string; summary: string | null; evidence_path: string | null; checked_at: string }

const TYPE_LABEL: Record<string, string> = {
  fsp_register: "FSP on the FSCA register", representative: "Representative listing", product_categories: "Product categories",
  content_review: "Content review", consent: "Consent", compliance_officer: "Compliance officer", other: "Other",
};
const typeLabel = (t: string) => TYPE_LABEL[t] || t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const RESULT_CLS: Record<string, string> = {
  pass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  fail: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/20",
};

async function openEvidence(path: string): Promise<string | null> {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data?.signedUrl) { tab?.close(); return error?.message || "Could not create a link for this evidence."; }
  if (tab) tab.location.href = data.signedUrl; else window.location.assign(data.signedUrl);
  return null;
}

export default function BrokerComplianceChecks({ brokerId }: { brokerId: string }) {
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("broker_compliance_checks")
      .select("id, check_type, result, summary, evidence_path, checked_at")
      .eq("broker_id", brokerId).order("checked_at", { ascending: false }).limit(50)
      .then(({ data, error }: { data: CheckRow[] | null; error: { message: string } | null }) => {
        if (!alive) return;
        if (error) setErr(error.message); else setRows(data || []);
      });
    return () => { alive = false; };
  }, [brokerId]);

  if (err) return null; // table not on this database (or no access): nothing to show
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><ShieldCheck className="h-4 w-4 text-primary" /> Compliance checks</h3>
      <ul className="rounded-lg border border-white/10 bg-slate-900/40 divide-y divide-white/[0.06]">
        {rows.map((r) => (
          <li key={r.id} className="p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">{fmtDaySast(r.checked_at)}</span>
              <span className="font-medium">{typeLabel(r.check_type)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${RESULT_CLS[r.result] || "bg-white/5 text-slate-300 border-white/10"}`}>{r.result}</span>
              {r.evidence_path && (
                <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  onClick={async () => setLinkErr(await openEvidence(r.evidence_path!))}>
                  <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />Evidence
                </button>
              )}
            </div>
            {r.summary && <p className="text-muted-foreground break-words">{r.summary}</p>}
          </li>
        ))}
      </ul>
      {linkErr && <p role="alert" className="mt-2 text-xs text-rose-300">{linkErr}</p>}
    </div>
  );
}
