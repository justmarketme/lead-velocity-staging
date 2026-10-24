import type { Tables } from "@/integrations/supabase/types";

/**
 * Onboarding row as used by the document generators and invite screens.
 * `phone` and `office_address` are read defensively but are not columns in the generated types.
 */
export type BrokerOnboardingRow = Tables<"broker_onboarding_responses"> & {
  phone?: string | null;
  office_address?: string | null;
};

/** brokers row plus quota columns that exist in production but are missing from the generated types. */
export type BrokerWithQuota = Tables<"brokers"> & {
  lead_quota?: number | null;
  leads_used?: number | null;
};
