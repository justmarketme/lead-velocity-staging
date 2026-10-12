/**
 * Admin "Preview as broker": the real broker portal rendered for one broker, loaded through the ADMIN's own session
 * (admin RLS reads brokers, leads, appointments). Never signs in as the broker and never touches his credentials.
 *
 * Read-only is enforced twice:
 *  1. Components read useBrokerPreview() and no-op their write actions (save, connect, notes, status marks, logout).
 *  2. installPreviewWriteGuard() rejects every non-GET request to Supabase while the preview is mounted, so a write
 *     path someone forgets to gate still cannot reach the database under the admin's (write-capable) role.
 */
import { createContext, useContext } from "react";

export interface BrokerPreview { brokerId: string }

export const BrokerPreviewContext = createContext<BrokerPreview | null>(null);

/** Non-null only inside /admin/preview/broker/:brokerId. */
export const useBrokerPreview = () => useContext(BrokerPreviewContext);

export const PREVIEW_READ_ONLY = { title: "Preview only", description: "This is read-only. Nothing was saved or sent." };

/** Origin of the Supabase project. The prod env value carries a trailing CR/LF, so trim and normalise through URL. */
const SUPABASE_ORIGIN = (() => {
  try { return new URL(String(import.meta.env.VITE_SUPABASE_URL || "").trim()).origin; } catch { return ""; }
})();
const isSupabase = (url: string) => {
  try { return new URL(url, window.location.href).origin === SUPABASE_ORIGIN; } catch { return false; }
};

/** Non-GET Supabase calls that only read or keep the admin signed in. */
const ALLOWED_WRITES = [
  /\/auth\/v1\/token\b/,               // session refresh for the admin
  /\/storage\/v1\/object\/sign\//,     // signed URL to view the broker's private headshot
  /\/rest\/v1\/rpc\/has_role\b/,       // admin check (read-only function)
];

/** Blocks writes to Supabase until the returned function is called. */
export function installPreviewWriteGuard(): () => void {
  if (typeof window === "undefined" || !SUPABASE_ORIGIN) return () => {};
  const original = window.fetch;
  const guarded: typeof window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (isSupabase(url) && method !== "GET" && method !== "HEAD" && !ALLOWED_WRITES.some((r) => r.test(url))) {
      console.warn(`[broker preview] blocked ${method} ${url}`);
      return Promise.resolve(new Response(JSON.stringify({ message: "Preview is read-only", code: "PREVIEW_READ_ONLY" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      }));
    }
    return original(input, init);
  };
  window.fetch = guarded;
  return () => { if (window.fetch === guarded) window.fetch = original; };
}
