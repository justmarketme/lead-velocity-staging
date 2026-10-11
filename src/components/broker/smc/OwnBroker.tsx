/**
 * Loads the signed-in broker's own row (brokers.user_id = auth.uid(), all columns incl. the SortMyCover ones) and renders
 * children with it, so the shared SMC cards can sit inside the legacy and elite portals without changing how those
 * pages load their own data. Renders nothing while loading or when there is no broker row.
 */
import { ReactNode } from "react";
import { useCurrentBroker } from "@/lib/smc";
import type { SmcBroker } from "@/integrations/supabase/smc-types";

export default function OwnBroker({ children }: { children: (broker: SmcBroker, reload: () => Promise<SmcBroker | null>) => ReactNode }) {
  const { broker, loading, reload } = useCurrentBroker();
  if (loading || !broker) return null;
  return <>{children(broker, reload)}</>;
}
