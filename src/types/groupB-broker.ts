import type { Tables } from "@/integrations/supabase/types";
import type { SmcBroker } from "@/integrations/supabase/smc-types";

/**
 * The broker record the portal holds in state: the `brokers` row (plus the SMC columns that are missing from the
 * generated types, see SmcBroker) enriched client-side with profile + quota fields. Every field is optional because the
 * DEV bypass builds a partial object.
 */
export type PortalBroker = Partial<Omit<SmcBroker, "status">> & {
  status?: string | null;
  tier?: string | null;
  is_lead_loading?: boolean | null;
  portal_type?: string | null;
  whatsapp_confirmed_at?: string | null;
  leads_used?: number;
  lead_quota?: number;
  profiles?: Tables<"profiles"> | null;
  broker_onboarding_responses?: unknown;
};

/** An `appointments` row flattened with its joined lead (see PremiumBrokerPortalPage.fetchAppointments). */
export type PortalAppointment = Tables<"appointments"> & {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  appointment_status?: string | null;
  /** Not in the generated appointments types; read defensively by PremiumCalendar. */
  method?: string | null;
};
