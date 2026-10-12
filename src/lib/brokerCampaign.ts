/**
 * Linking a broker to a campaign (brokers.brand_id = a row of `brands`, e.g. SortMyCover) and creating his plan order.
 * One implementation, used by NewOrderDialog (Orders & Activity) and the broker drawer's Campaigns panel.
 * Admin path: RLS "Admins can manage all brokers" / "Admins full access to lead_orders"; smc_brokers_guard returns early
 * for admins. Routing stays off on enrolment: only admin_broker_go_live() switches a broker on, after its checks pass.
 */
import { supabase } from "@/integrations/supabase/client";
import { errText, smcDb } from "@/lib/smc";
import { ALL_PLANS, type PricingTier } from "@/lib/pricing";

/** Plans an order can be created from: Pilot (while offered) + the monthly ladder, from the pricing seed. */
export const ORDER_PLANS: PricingTier[] = ALL_PLANS;
export const planByCode = (code: string): PricingTier | undefined => ORDER_PLANS.find((p) => p.tier_code === code);

/** Enrol a still-unenrolled broker in a campaign. Only a row whose brand_id is NULL is touched; routing stays off. */
export async function enrolBrokerInBrand(brokerId: string, brandId: string): Promise<{ error: string | null }> {
  const { data, error } = await smcDb.from("brokers")
    .update({ brand_id: brandId, routing_on: false }).eq("id", brokerId).is("brand_id", null).select("id");
  if (error) return { error: errText(error) };
  if (!data?.length) return { error: "the broker row changed (already linked?); refresh and try again" };
  return { error: null };
}

export interface NewOrder {
  brokerId: string;
  /** null = Lead Velocity raw leads (no campaign). */
  brandId: string | null;
  brandName?: string | null;
  leadCount: number;
  /** Rands (stored in cents). */
  amountRands: number;
  title?: string;
  /** Plan this order was created from (pricing seed tier_code), kept in criteria for the record. */
  planCode?: string | null;
}

/** Creates a pending order (contract, invoice and Mark paid / proof of payment follow the existing flow). */
export async function createLeadOrder(o: NewOrder): Promise<{ id: string | null; error: string | null }> {
  const { data: u } = await supabase.auth.getUser();
  const plan = o.planCode ? planByCode(o.planCode) : undefined;
  const row: Record<string, unknown> = {
    broker_id: o.brokerId,
    title: o.title?.trim() || (o.brandId
      ? `${o.brandName || "Campaign"} ${plan ? plan.name + " " : ""}(${o.leadCount} leads)`
      : `Lead Velocity leads (${o.leadCount})`),
    lead_count: o.leadCount,
    amount_zar: Math.round(o.amountRands * 100), // cents (AdminOrdersActivity formatZar)
    currency: "ZAR",
    status: "pending",
    created_by: u.user?.id ?? null,
    brand_id: o.brandId,
  };
  if (plan) row.criteria = { plan: plan.tier_code, plan_name: plan.name, price_zar: plan.price_zar, committed_leads: plan.committed_leads };
  const { data, error } = await smcDb.from("lead_orders").insert(row).select("id").single();
  if (error) return { id: null, error: errText(error) };
  return { id: (data as { id: string }).id, error: null };
}

/**
 * Broker statuses that mean "a current client": the legacy CRM value 'Active' plus the SortMyCover lifecycle values a
 * broker moves to on Go live ('active', generated brokers.active) and Pause ('paused'). Lists that used .eq('status','Active')
 * would otherwise drop a broker the moment he goes live.
 */
export const CLIENT_STATUSES = ["Active", "active", "paused"];
