/**
 * A broker's plan and current cycle, from real records only (no defaults that could show a client a number he never bought):
 *  - plan: the signed agreement's plan (admin_documents kind='signed_agreement', content_data.plan), else brokers.tier;
 *  - cycle: the latest PAID lead_orders row starts a cycle of TERMS.cycle_days; without one the plan is "awaiting payment";
 *  - delivered: leads assigned to the broker since the cycle started.
 * Prices and committed numbers come from src/lib/pricing.ts (the pricing seed).
 */
import { supabase } from "@/integrations/supabase/client";
import { PricingTier, TERMS, planByName } from "@/lib/pricing";

export interface BrokerPlanState {
  plan: PricingTier | null;
  /** Where the plan came from, for the admin's benefit. */
  planSource: "signed_agreement" | "broker_record" | null;
  /** Latest paid order, if any. */
  paidOrder: { id: string; paid_at: string; lead_count: number | null; amount_zar: number | null } | null;
  /** Set only while a paid cycle is running (or within the shortfall rollover). */
  cycle: { start: Date; end: Date; day: number; committed: number; delivered: number } | null;
  paidOrdersCount: number;
}

const DAY = 86_400_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function loadBrokerPlan(broker: { id: string; tier?: string | null }): Promise<BrokerPlanState> {
  const [orders, agreement] = await Promise.all([
    db.from("lead_orders").select("id, paid_at, lead_count, amount_zar, status").eq("broker_id", broker.id).eq("status", "paid").order("paid_at", { ascending: false }),
    db.from("admin_documents").select("content_data, signed_at").eq("broker_id", broker.id).eq("kind", "signed_agreement").order("signed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const agreedPlan = planByName(String(agreement.data?.content_data?.plan || ""));
  const recordPlan = planByName(String(broker.tier || ""));
  const plan = agreedPlan || recordPlan || null;
  const planSource = agreedPlan ? "signed_agreement" : recordPlan ? "broker_record" : null;

  const paid = ((orders.data || []) as BrokerPlanState["paidOrder"][]).filter((o) => o && o.paid_at);
  const paidOrder = paid[0] || null;
  let cycle: BrokerPlanState["cycle"] = null;
  if (paidOrder) {
    const start = new Date(paidOrder.paid_at);
    const end = new Date(start.getTime() + TERMS.cycle_days * DAY);
    const sinceStart = Date.now() - start.getTime();
    if (sinceStart >= 0 && sinceStart <= (TERMS.cycle_days + TERMS.shortfall_rollover_days) * DAY) {
      const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("broker_id", broker.id).gte("created_at", start.toISOString());
      cycle = {
        start, end,
        day: Math.min(TERMS.cycle_days, Math.floor(sinceStart / DAY) + 1),
        committed: paidOrder.lead_count || plan?.committed_leads || 0,
        delivered: count || 0,
      };
    }
  }
  return { plan, planSource, paidOrder, cycle, paidOrdersCount: paid.length };
}

/** Leads assigned per week for the last `weeks` weeks (oldest first), Monday-based. */
export async function loadLeadsPerWeek(brokerId: string, weeks = 8): Promise<{ week: string; leads: number }[]> {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const from = new Date(monday.getTime() - (weeks - 1) * 7 * DAY);
  const { data } = await db.from("leads").select("created_at").eq("broker_id", brokerId).gte("created_at", from.toISOString());
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(from.getTime() + i * 7 * DAY);
    return { start: d.getTime(), week: d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }), leads: 0 };
  });
  for (const r of (data || []) as { created_at: string | null }[]) {
    if (!r.created_at) continue;
    const i = Math.floor((new Date(r.created_at).getTime() - from.getTime()) / (7 * DAY));
    if (i >= 0 && i < weeks) buckets[i].leads++;
  }
  return buckets.map(({ week, leads }) => ({ week, leads }));
}
