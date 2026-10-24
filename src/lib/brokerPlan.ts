/**
 * A broker's plan and current cycle, from real records only (no defaults that could show a client a number he never bought):
 *  - plan: the signed agreement's plan (admin_documents kind='signed_agreement', content_data.plan), else brokers.tier;
 *  - payment: a PAID lead_orders row, or a proof of payment Lead Velocity uploaded (admin_documents kind='proof_of_payment',
 *    content_data.paid_on) when there is no order; the latest one starts a cycle of TERMS.cycle_days. Without either the plan is
 *    "awaiting payment";
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
  /** A signed agreement is on file (admin_documents kind='signed_agreement'). */
  hasSignedAgreement: boolean;
  /** FSP number as written in the signed agreement (content_data.fsp_number), for display until it is on the broker record. */
  agreementFsp: string | null;
  /** True once any payment is recorded (paid order or proof of payment). */
  paid: boolean;
  /** Date the latest payment was received (ISO). */
  paidOn: string | null;
  /** Latest proof of payment, viewable by the broker (same per-broker access as the signed agreement). */
  proof: { id: string; file_path: string; name: string; paid_on: string | null; amount_zar: number | null; reference: string | null } | null;
}

const DAY = 86_400_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function loadBrokerPlan(broker: { id: string; tier?: string | null }): Promise<BrokerPlanState> {
  const [orders, agreement, proofs] = await Promise.all([
    db.from("lead_orders").select("id, paid_at, lead_count, amount_zar, status").eq("broker_id", broker.id).eq("status", "paid").order("paid_at", { ascending: false }),
    db.from("admin_documents").select("content_data, signed_at").eq("broker_id", broker.id).eq("kind", "signed_agreement").order("signed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("admin_documents").select("id, name, file_path, content_data, created_at").eq("broker_id", broker.id).eq("kind", "proof_of_payment").order("created_at", { ascending: false }).limit(1),
  ]);
  const agreedPlan = planByName(String(agreement.data?.content_data?.plan || ""));
  const recordPlan = planByName(String(broker.tier || ""));
  const plan = agreedPlan || recordPlan || null;
  const planSource = agreedPlan ? "signed_agreement" : recordPlan ? "broker_record" : null;

  const paid = ((orders.data || []) as BrokerPlanState["paidOrder"][]).filter((o) => o && o.paid_at);
  const paidOrder = paid[0] || null;
  const p = ((proofs.data || []) as { id: string; name: string; file_path: string; content_data: Record<string, unknown> | null; created_at: string }[])[0];
  const proof: BrokerPlanState["proof"] = p ? {
    id: p.id, file_path: p.file_path, name: p.name,
    paid_on: (p.content_data?.paid_on as string) || p.created_at.slice(0, 10),
    amount_zar: typeof p.content_data?.amount_zar === "number" ? (p.content_data.amount_zar as number) : null,
    reference: (p.content_data?.reference as string) || null,
  } : null;
  // The latest payment we know of: an order's paid_at, or the date on the proof (whichever is later).
  const proofTime = proof?.paid_on ? new Date(`${proof.paid_on}T00:00:00+02:00`).getTime() : NaN;
  const orderTime = paidOrder ? new Date(paidOrder.paid_at).getTime() : NaN;
  const paidAt = Number.isNaN(orderTime) ? (Number.isNaN(proofTime) ? null : proofTime) : Number.isNaN(proofTime) ? orderTime : Math.max(orderTime, proofTime);
  let cycle: BrokerPlanState["cycle"] = null;
  if (paidAt !== null) {
    const start = new Date(paidAt);
    const end = new Date(start.getTime() + TERMS.cycle_days * DAY);
    const sinceStart = Date.now() - start.getTime();
    if (sinceStart >= 0 && sinceStart <= (TERMS.cycle_days + TERMS.shortfall_rollover_days) * DAY) {
      const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("broker_id", broker.id).gte("created_at", start.toISOString());
      cycle = {
        start, end,
        day: Math.min(TERMS.cycle_days, Math.floor(sinceStart / DAY) + 1),
        committed: (paidOrder && paidAt === orderTime ? paidOrder.lead_count : null) || plan?.committed_leads || 0,
        delivered: count || 0,
      };
    }
  }
  return {
    plan, planSource, paidOrder, cycle, paidOrdersCount: paid.length,
    hasSignedAgreement: !!agreement.data, agreementFsp: agreement.data?.content_data?.fsp_number ? String(agreement.data.content_data.fsp_number) : null,
    paid: paidAt !== null, paidOn: paidAt !== null ? new Date(paidAt).toISOString() : null, proof,
  };
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
