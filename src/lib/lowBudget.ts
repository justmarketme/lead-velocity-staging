// C-tier (under R750) leads: names shared with the crm-nurture backend.
// Change them here only. The columns may not exist on the live DB yet, so every
// caller treats a query error as "feature off" and hides its controls.
import { supabase } from "@/integrations/supabase/client";

export const LOW_BUDGET = {
  /** brokers column: auto-accept C-tier offers for this broker */
  brokerSwitch: "accepts_low_budget",
  /** leads.budget_band value for under R750 */
  band: "lt750",
  /** leads.routing_reason while waiting for an admin */
  heldReason: "held_low_budget",
  /** leads.routing_reason once an admin assigns it (starts the booking flow) */
  assignedReason: "manual_low_budget",
  label: "C-tier (under R750)",
} as const;

export const COUNTS_HELPER = "Counts toward the broker's order only once they've seen the client (attendance confirmed).";

const db = supabase as any;

/** Broker id -> switch value, or null when the column doesn't exist yet. */
export async function loadLowBudgetSwitches(): Promise<Record<string, boolean> | null> {
  const { data, error } = await db.from("brokers").select(`id, ${LOW_BUDGET.brokerSwitch}`);
  if (error) return null;
  const m: Record<string, boolean> = {};
  for (const r of data || []) m[r.id] = !!r[LOW_BUDGET.brokerSwitch];
  return m;
}

export async function setLowBudgetSwitch(brokerId: string, on: boolean) {
  return db.from("brokers").update({ [LOW_BUDGET.brokerSwitch]: on }).eq("id", brokerId);
}

export const AGE_TEXT: Record<string, string> = { lt35: "Under 35", "35_44": "35–44", "45_50": "45–50", "51plus": "51+" };
export const REASON_TEXT: Record<string, string> = {
  life_cover: "Life cover", funeral_cover: "Funeral cover", retirement_planning: "Retirement",
  investments: "Investments", disability: "Disability", paying_too_much: "Paying too much", other: "Other",
};
