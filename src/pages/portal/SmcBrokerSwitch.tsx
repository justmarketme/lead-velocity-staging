/**
 * Route switch for paths the legacy portal already owns (/broker/leads, /calendar, /reports, /profile):
 * a SortMyCover broker (brokers.brand_id IS NOT NULL) gets the SMC page; every other broker gets the legacy page, unchanged.
 * Only mounted when VITE_SMC_ENABLED=true.
 */
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { smcDb } from "@/lib/smc";

export default function SmcBrokerSwitch({ smc, legacy }: { smc: ReactNode; legacy: ReactNode }) {
  const [mode, setMode] = useState<"loading" | "smc" | "legacy">("loading");
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { if (alive) setMode("legacy"); return; }
      const { data, error } = await smcDb.from("brokers").select("id, brand_id").eq("user_id", u.user.id).maybeSingle();
      // brand_id missing (migration not applied) or a legacy broker → legacy page
      if (alive) setMode(!error && (data as { brand_id?: string | null } | null)?.brand_id ? "smc" : "legacy");
    })();
    return () => { alive = false; };
  }, []);
  if (mode === "loading") return <div className="min-h-screen bg-background" />;
  return <>{mode === "smc" ? smc : legacy}</>;
}
