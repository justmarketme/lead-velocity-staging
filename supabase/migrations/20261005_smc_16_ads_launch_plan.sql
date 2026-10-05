-- smc_16: SortMyCover ads launch plan (editable in Console, Ads). FILE ONLY: never applied by an agent to a live database.
-- One jsonb row per brand: budgets per campaign (warm-up Reach, A, B, C), guardrails and kill/scale thresholds.
-- ALL AMOUNTS ARE ZAR EXCL. VAT (the figure typed into Meta). pricing.media_share_zar is VAT-inclusive: daily = share / 1.15 / 30.
-- Editing the plan changes NOTHING at Meta. Meta budgets change only through the two-step confirm (ads-confirm, then ads-budget).
-- Seed = automation/ads/launch-plan.js DEFAULT_LAUNCH_PLAN (campaign-spec 6, 11, 12; setup-checklist G8). Jonathan confirms every figure.

CREATE TABLE IF NOT EXISTS public.ads_launch_plan (
  brand_id    uuid PRIMARY KEY REFERENCES public.brands(id),
  plan        jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object' AND jsonb_typeof(plan->'campaigns') = 'array'),
  reason      text,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ads_launch_plan IS 'SMC: launch plan for ads (budgets per campaign incl. warm-up Reach, guardrails, kill/scale thresholds). ZAR excl. VAT. Plan edits never touch Meta.';

INSERT INTO public.ads_launch_plan (brand_id, plan, reason)
SELECT b.id, $plan${
  "version": 1,
  "currency": "ZAR",
  "vat_basis": "excl_vat",
  "note": "All amounts excl. VAT, as typed into Meta. Defaults from campaign-spec 12; Jonathan confirms. Source of truth for caps is pricing.media_share_zar.",
  "bronze_media_share_zar": 8492,
  "campaigns": [
    {
      "key": "W",
      "name": "SMC_W_REACH_ZA_warmup",
      "objective": "OUTCOME_AWARENESS",
      "role": "Page warm-up (Reach, never a Boost)",
      "daily_budget_zar": 50,
      "duration_days": 7,
      "monthly_cap_zar": 350,
      "share_pct_all_on": null,
      "starts": "after_first_payment",
      "human_gate": "NH-31 a: Jonathan publishes. Organic posts first; paid Reach only after first payment.",
      "notes": "7 days with an end date. South Africa 18+, Advantage+ placements without Audience Network, \"Use existing post\"."
    },
    {
      "key": "A",
      "name": "SMC_A_LEADS-IF_ZA_c1",
      "objective": "OUTCOME_LEADS",
      "role": "Primary: instant form leads",
      "daily_budget_zar": 246,
      "duration_days": null,
      "monthly_cap_zar": 7384,
      "share_pct_all_on": 60,
      "starts": "go_live",
      "human_gate": "R0 until Approve & go live; then sum(active media_share_zar) / 1.15 / 30.",
      "notes": "Cycle 1 = Bronze share. Monthly cap = Bronze R8,492 / 1.15. Changes in <= 20% steps once per 48 h after go-live."
    },
    {
      "key": "B",
      "name": "SMC_B_LEADS-WEB_ZA_c1",
      "objective": "OUTCOME_LEADS",
      "role": "Website conversions (quiz page)",
      "daily_budget_zar": null,
      "duration_days": null,
      "monthly_cap_zar": null,
      "share_pct_all_on": 30,
      "starts": "trigger",
      "human_gate": "Switch on at monthly media >= R20,000 or A qualify rate < 50% (11.2). Built paused.",
      "notes": "Budget at switch-on = 30% of total daily media."
    },
    {
      "key": "C",
      "name": "SMC_C_LEADS-CTWA_ZA_c1",
      "objective": "OUTCOME_LEADS",
      "role": "Click-to-WhatsApp test",
      "daily_budget_zar": null,
      "duration_days": null,
      "monthly_cap_zar": null,
      "share_pct_all_on": 10,
      "starts": "trigger",
      "human_gate": "Same switch-on trigger as B. Built paused.",
      "notes": "Budget at switch-on = 10% of total daily media. Judged on reply rate until >= 30 leads."
    }
  ],
  "guardrails": {
    "daily_cap_multiplier": 1.2,
    "max_step_pct": 20,
    "step_cooldown_hours": 48,
    "alert_pct": 80,
    "day_over_ratio": 1.5,
    "min_daily_budget_zar": 20
  },
  "rules": {
    "spend_gate_zar": 3000,
    "cpl_max_zar": 250,
    "qualify_min_pct": 60,
    "cost_per_qualified_target_zar": 250,
    "stop_day": 14,
    "stop_cost_per_qualified_zar": 400,
    "min_dispositions": 5,
    "quality_pause_below": 2.5,
    "quality_scale_at_least": 4,
    "scale_step_pct": 20,
    "hook_min_reels_pct": 30,
    "hook_min_feed_pct": 25,
    "hold_min_pct": 35,
    "hook_min_impressions": 2000,
    "good_fit_target_zar": 1300,
    "good_fit_escalate_multiple": 1.5
  }
}$plan$::jsonb, 'seed from campaign-spec 12'
FROM public.brands b WHERE b.code = 'SMC'
ON CONFLICT (brand_id) DO NOTHING;

ALTER TABLE public.ads_launch_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_launch_plan FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.ads_launch_plan TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ads_launch_plan TO n8n_app;
DROP POLICY IF EXISTS "smc admin all" ON public.ads_launch_plan;
CREATE POLICY "smc admin all" ON public.ads_launch_plan FOR ALL TO authenticated USING (public.smc_is_admin()) WITH CHECK (public.smc_is_admin());
DROP POLICY IF EXISTS "smc n8n_app rw" ON public.ads_launch_plan;
CREATE POLICY "smc n8n_app rw" ON public.ads_launch_plan FOR ALL TO n8n_app USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS smc_touch_updated_at ON public.ads_launch_plan;
CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON public.ads_launch_plan FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS smc_audit ON public.ads_launch_plan;
CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.ads_launch_plan FOR EACH ROW EXECUTE FUNCTION public.smc_audit();
