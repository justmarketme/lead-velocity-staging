/**
 * Top of the admin broker drawer: "Ad consent: granted on … / not given" (onboarding_progress.ad_consent, migration
 * 20261013190000) and the broker's open change requests (onboarding_progress.change_requests, migration 20261013200000)
 * with "Mark resolved" / "Resolve and unlock" through admin_resolve_change_request(). Self-loading; renders the consent
 * line even when there are no requests.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adConsentAdminText, fmtDayTimeSast } from "@/lib/adConsent";
import { CHANGE_ITEM_LABEL, openRequests, type ChangeRequest } from "@/lib/changeRequests";

export default function BrokerAdminStatus({ brokerId }: { brokerId: string }) {
  const [progress, setProgress] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("brokers").select("onboarding_progress").eq("id", brokerId).maybeSingle();
    setProgress(error ? null : ((data?.onboarding_progress as Record<string, unknown>) ?? {}));
  }, [brokerId]);
  useEffect(() => { setProgress(undefined); setErr(null); void load(); }, [load]);

  if (progress === undefined || progress === null) return null;
  const consent = adConsentAdminText(progress);
  const open = openRequests(progress);

  async function resolve(r: ChangeRequest, unlock: boolean) {
    setErr(null); setBusy(`${r.id}:${unlock}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_resolve_change_request", { p_broker_id: brokerId, p_request_id: r.id, p_unlock: unlock, p_note: null });
    setBusy(null);
    if (error) { setErr(error.message || "Could not resolve it."); return; }
    void load();
  }

  return (
    <div className="space-y-2">
      <p className={`inline-flex items-center gap-1.5 text-xs ${consent.granted ? "text-emerald-400" : "text-muted-foreground"}`}>
        {consent.granted ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        {consent.text}
      </p>
      {open.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
            <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden="true" />{open.length === 1 ? "1 change request" : `${open.length} change requests`} from the broker
          </p>
          <ul className="space-y-2">
            {open.map((r) => (
              <li key={r.id} className="text-sm space-y-1">
                <p><span className="font-medium">{CHANGE_ITEM_LABEL[r.item]}</span> <span className="text-xs text-muted-foreground">{fmtDayTimeSast(r.at)}</span></p>
                <p className="text-muted-foreground whitespace-pre-wrap break-words">{r.message}</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={!!busy} onClick={() => resolve(r, false)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
                    {busy === `${r.id}:false` && <Loader2 className="h-3 w-3 animate-spin" />}Mark resolved
                  </button>
                  {r.item !== "ad" && (
                    <button type="button" disabled={!!busy} onClick={() => resolve(r, true)}
                      title="Resolves it and lets the broker edit his bio / photo again until a new card is approved"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50">
                      {busy === `${r.id}:true` && <Loader2 className="h-3 w-3 animate-spin" />}Resolve and unlock editing
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {err && <p role="alert" className="text-xs text-rose-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
