// Admin Team Management "Add broker" row (src/components/dashboard/TeamManagement.tsx).
// Only columns that exist on public.brokers: PostgREST rejects the whole insert on an unknown
// column (42703), which left a stray auth login behind (smoke test 21 Oct 2026, #50: lead_quota).
// The plan's committed leads come from the tier (src/lib/pricing.ts), not from a brokers column.

export interface NewBrokerForm {
  firmName: string;
  contactPerson: string;
  email: string;
  tier: string;
  portalType: string;
  isLeadLoading: boolean;
}

export function newBrokerRow(form: NewBrokerForm, userId: string) {
  return {
    user_id: userId,
    firm_name: form.firmName,
    contact_person: form.contactPerson,
    email: form.email,
    tier: form.tier,
    portal_type: form.portalType,
    is_lead_loading: form.isLeadLoading,
    status: 'Active',
  };
}

/** Leads used against the plan quota, as a whole percentage capped at 100 (0 when there is no quota). */
export function quotaPercent(used: number | null | undefined, quota: number | null | undefined): number {
  if (!quota || quota <= 0) return 0;
  return Math.min(100, Math.round(((used || 0) / quota) * 100));
}
