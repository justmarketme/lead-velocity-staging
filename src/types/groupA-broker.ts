import type { Tables } from "@/integrations/supabase/types";

/**
 * Onboarding row as used by the document generators and invite screens.
 * `phone` and `office_address` are read defensively but are not columns in the generated types.
 */
export type BrokerOnboardingRow = Tables<"broker_onboarding_responses"> & {
  phone?: string | null;
  office_address?: string | null;
};

/** brokers row plus optional quota fields. public.brokers has no lead_quota / leads_used columns (checked live 21 Oct 2026); the quota comes from the plan. */
export type BrokerWithQuota = Tables<"brokers"> & {
  lead_quota?: number | null;
  leads_used?: number | null;
};
