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
