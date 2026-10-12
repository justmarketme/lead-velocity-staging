/**
 * The admin-documents bucket is private (checked live 2026-10-11), so getPublicUrl links 404/400. Every "View PDF" signs a
 * fresh short-lived URL on click (pattern: src/pages/portal/Agreement.tsx openDoc). The tab is opened synchronously in the
 * click handler, then pointed at the signed URL, so pop-up blockers don't eat it.
 */
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_DOCS_BUCKET = "admin-documents";
/** Long enough to open and download a PDF, short enough that a forwarded link dies quickly. */
export const ADMIN_DOC_LINK_SECONDS = 300;

export async function openAdminDocument(path: string | null | undefined): Promise<{ ok: boolean; error?: string }> {
  if (!path) return { ok: false, error: "This document has no file." };
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const { data, error } = await supabase.storage.from(ADMIN_DOCS_BUCKET).createSignedUrl(path, ADMIN_DOC_LINK_SECONDS);
  if (error || !data?.signedUrl) {
    tab?.close();
    return { ok: false, error: error?.message || "Could not create a link for this document." };
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
  return { ok: true };
}

// ---------------------------------------------------------------- per-broker documents (migration 20261012120000)
/** admin_documents rows that belong to one broker (broker_id). Brokers read their own by RLS; admins read all. */
export interface BrokerDocument {
  id: string; name: string; description: string | null; file_path: string; file_type: string | null; file_size: number | null;
  category: string | null; kind: string | null; broker_id: string | null; signed_at: string | null; signed_by: string | null; created_at: string;
}

export const DOC_KINDS = [
  { value: "signed_agreement", label: "Signed agreement" },
  { value: "agreement", label: "Agreement (unsigned)" },
  { value: "authorisation_letter", label: "Authorisation letter" },
  { value: "invoice", label: "Invoice" },
  { value: "other", label: "Other" },
] as const;
export const docKindLabel = (k: string | null) => DOC_KINDS.find((x) => x.value === k)?.label || "Document";
/** Kinds the broker portal shows as "Your signed agreement". */
export const AGREEMENT_KINDS = ["signed_agreement", "agreement"];

// The generated Database types predate the broker_id/kind/signed_* columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docsDb = supabase as any;
const DOC_COLUMNS = "id, name, description, file_path, file_type, file_size, category, kind, broker_id, signed_at, signed_by, created_at";

/** Signed contracts first, then newest. */
export async function loadBrokerDocuments(brokerId: string): Promise<{ docs: BrokerDocument[]; error?: string }> {
  const { data, error } = await docsDb.from("admin_documents").select(DOC_COLUMNS).eq("broker_id", brokerId).order("created_at", { ascending: false });
  if (error) return { docs: [], error: error.message };
  const rank = (d: BrokerDocument) => (d.kind === "signed_agreement" ? 0 : d.kind === "agreement" ? 1 : 2);
  return { docs: ((data || []) as BrokerDocument[]).sort((a, b) => rank(a) - rank(b)) };
}

/** Download (Content-Disposition: attachment) through a fresh short-lived signed URL. */
export async function downloadAdminDocument(path: string, fileName: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.storage.from(ADMIN_DOCS_BUCKET).createSignedUrl(path, ADMIN_DOC_LINK_SECONDS, { download: fileName });
  if (error || !data?.signedUrl) return { ok: false, error: error?.message || "Could not create a download link." };
  window.location.assign(data.signedUrl);
  return { ok: true };
}

const kindCategory = (kind: string) => (kind === "signed_agreement" || kind === "agreement" ? "contracts" : kind === "invoice" ? "invoices" : "general");

/** Admin upload of a document for one broker: file into brokers/<id>/, then its admin_documents row. */
export async function uploadBrokerDocument(input: {
  brokerId: string; file: File; name: string; kind: string; signedBy: string | null; signedAt: string | null; description?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Please sign in again." };
  const safe = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
  const path = `brokers/${input.brokerId}/${Date.now()}-${safe}`;
  const up = await supabase.storage.from(ADMIN_DOCS_BUCKET).upload(path, input.file, { upsert: false, contentType: input.file.type || "application/pdf" });
  if (up.error) return { ok: false, error: `Upload failed: ${up.error.message}` };
  const { error } = await docsDb.from("admin_documents").insert({
    name: input.name, description: input.description || null, file_path: path, file_type: input.file.type || null, file_size: input.file.size,
    category: kindCategory(input.kind), kind: input.kind, broker_id: input.brokerId,
    signed_by: input.signedBy || null, signed_at: input.signedAt || null, uploaded_by: u.user.id,
  });
  if (error) {
    await supabase.storage.from(ADMIN_DOCS_BUCKET).remove([path]); // no orphan file without its row
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
