-- =============================================================================
-- 20261002_smc_08_pass3.sql  —  SortMyCover build, migration 8: integration pass 3
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–08).
-- Additive and idempotent, same conventions as 01–07 (re-runnable; every object guarded or OR REPLACE).
-- Covers build/integration-pass2.md:
--   I-28  n8n_app: auth.uid() + SECURITY DEFINER Vault wrappers for W16/W19 (no direct vault grants)
--   I-24  broker_media "one current take" becomes DEFERRABLE INITIALLY DEFERRED (W23 approve CTE)
--   I-25  escalations kinds + sensitive, dm_handoff, dm_after_link
--   I-19/I-22  ops.watchlist_targets (seeded with the NH-25 defaults) read by facts.v_watchlist;
--         tile 4 excludes `unreachable`; facts.fact_broker_day rewritten as grouped joins
--   I-30b smc_sign_document captures signer IP server-side (PostgREST request.headers)
--   I-30c admin_documents.acceptances (jsonb) — the repo has no admin_documents.metadata
--   I-30d smc_report_policies_written() — broker's voluntary "policies written" number
--   I-30i smc_faculty_tiles() over facts.pulse_daily
--   NH-22 default: admin SECURITY DEFINER RPCs for every ops.* read/write the console does,
--         so `ops` need not be an exposed API schema (facts stays unexposed too)
--   I-28b smc_brokers_guard checks current_user before auth.uid() (§12)
-- Inventory lines extended: INV-F02 (has_role), INV-T12 (admin_documents), INV-A06 (own-row pattern).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. I-28 — n8n_app and auth.uid()
-- smc_brokers_guard (05/06) calls auth.uid() before it checks current_user, so every n8n UPDATE on
-- public.brokers needs USAGE on schema auth + EXECUTE on auth.uid().
-- ASSUMPTION — validate after NH-15 on the live project (cmsylaupctrbsvzrgzwy), by running
--   SELECT has_schema_privilege('n8n_app','auth','USAGE'), has_function_privilege('n8n_app','auth.uid()','EXECUTE');
-- What hosted Supabase grants: schema `auth` is owned by supabase_auth_admin; USAGE is granted to
-- anon, authenticated, service_role (and postgres); a role created by the project owner gets NOTHING on
-- auth or vault by default. `postgres` has historically been able to grant USAGE/EXECUTE on auth objects,
-- but newer projects restrict changes in the auth schema. So the grants are attempted and, if refused,
-- the migration warns instead of failing: the fallback is that W16/W19/W20 connect with a role that
-- already has auth access, or the guard is reordered (needs_human, see schema.md pass 3).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA auth TO n8n_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.uid() TO n8n_app';
  EXCEPTION WHEN insufficient_privilege OR undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'smc_08: could not grant auth.uid() to n8n_app (%). See schema.md pass 3 / I-28.', SQLERRM;
  END;
END $$;

-- I-28 — Vault through SECURITY DEFINER wrappers (no grants on the vault schema to n8n_app).
-- Only Paystack tokens (authorization_code / subscription email token) are stored; never card data.
-- The secret NAME goes on brokers; the value stays in Vault. Callers SET LOCAL smc.source = 'n8n' first.
CREATE OR REPLACE FUNCTION public.smc_vault_store_paystack_auth(p_broker_id uuid, p_authorization_code text, p_customer_code text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_broker_id IS NULL OR coalesce(p_authorization_code, '') = '' THEN
    RETURN NULL;   -- broker did not opt in: nothing stored (W16 node skips on NULL)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brokers b WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL) THEN
    RAISE EXCEPTION 'smc_vault_store_paystack_auth: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  v_name := 'paystack_auth_' || p_broker_id::text || '_' || extract(epoch FROM clock_timestamp())::bigint;
  PERFORM vault.create_secret(p_authorization_code, v_name);
  UPDATE public.brokers b
     SET card_autorenew = true,
         paystack_customer_code = coalesce(nullif(p_customer_code, ''), b.paystack_customer_code),
         paystack_authorization_ref = v_name
   WHERE b.id = p_broker_id;
  RETURN v_name;
END $$;
COMMENT ON FUNCTION public.smc_vault_store_paystack_auth(uuid, text, text) IS
  'SMC I-28 (W16): stores the Paystack authorization_code in Vault, sets brokers.card_autorenew + paystack_authorization_ref (secret name). n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_vault_store_paystack_sub(p_customer_code text, p_subscription_code text, p_email_token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF coalesce(p_customer_code, '') = '' OR coalesce(p_subscription_code, '') = '' THEN
    RETURN NULL;
  END IF;
  v_name := 'paystack_sub_' || p_subscription_code;
  IF coalesce(p_email_token, '') <> ''
     AND NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets s WHERE s.name = v_name) THEN
    PERFORM vault.create_secret(p_email_token, v_name);
  END IF;
  UPDATE public.brokers b
     SET card_autorenew = true,
         paystack_subscription_code = p_subscription_code,
         paystack_subscription_token_ref = CASE
           WHEN EXISTS (SELECT 1 FROM vault.decrypted_secrets s WHERE s.name = v_name) THEN v_name
           ELSE b.paystack_subscription_token_ref END
   WHERE b.paystack_customer_code = p_customer_code AND b.brand_id IS NOT NULL;
  RETURN v_name;
END $$;
COMMENT ON FUNCTION public.smc_vault_store_paystack_sub(text, text, text) IS
  'SMC I-28 (W16 plan mode): stores the Paystack subscription email token in Vault once; sets brokers.paystack_subscription_code/_token_ref. n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_vault_paystack_auth_code(p_broker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.decrypted_secret
    FROM public.brokers b
    JOIN vault.decrypted_secrets s ON s.name = b.paystack_authorization_ref
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL AND b.card_autorenew
   LIMIT 1
$$;
COMMENT ON FUNCTION public.smc_vault_paystack_auth_code(uuid) IS
  'SMC I-28 (W19 cycle-end charge): the decrypted Paystack authorization_code, only while card_autorenew is on. n8n_app only; never exposed to the API roles.';

REVOKE ALL ON FUNCTION public.smc_vault_store_paystack_auth(uuid, text, text),
                       public.smc_vault_store_paystack_sub(text, text, text),
                       public.smc_vault_paystack_auth_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_vault_store_paystack_auth(uuid, text, text),
                          public.smc_vault_store_paystack_sub(text, text, text),
                          public.smc_vault_paystack_auth_code(uuid) TO n8n_app;

-- -----------------------------------------------------------------------------
-- 2. I-24 — one current take per (broker, kind, language), checked at COMMIT
-- A partial unique index cannot be deferred, so it becomes an EXCLUDE constraint with the same rule
-- (kind and language are NOT NULL, so the semantics are identical). W23's single-statement
-- demote + promote CTE no longer depends on row order. Nothing uses it as an ON CONFLICT target.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broker_media_one_current_x'
                  AND conrelid = 'public.broker_media'::regclass) THEN
    ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_one_current_x
      EXCLUDE USING btree (broker_id WITH =, kind WITH =, language WITH =) WHERE (is_current)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
DROP INDEX IF EXISTS public.broker_media_one_current;
COMMENT ON CONSTRAINT broker_media_one_current_x ON public.broker_media IS
  'SMC I-24: one is_current row per broker/kind/language, deferred to commit (replaces index broker_media_one_current).';

-- -----------------------------------------------------------------------------
-- 3. I-25 — escalation kinds for W30/W31
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalations_kind_check'
                  AND pg_get_constraintdef(oid) LIKE '%dm_after_link%') THEN
    ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS escalations_kind_check;
    ALTER TABLE public.escalations ADD CONSTRAINT escalations_kind_check CHECK (kind IN
      ('human_handoff','comment','dm','guardrail_trip','outcome_unmarked','replacement_dispute','unmatched_payment',
       'fsca_mismatch','complaint','dsr','other',
       'hostile_thread','needs_human','classifier_invalid','comment_sentiment','webhook_signature_invalid',
       'sensitive','dm_handoff','dm_after_link'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. I-19 / I-22 — watchlist targets live in one editable, audited table
-- analytics/params.sql (facts.v_params) carries the same defaults today; analytics-reporter points
-- v_params at this table in its next pass so a target is never hard-coded twice.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.watchlist_targets (
  metric_no      integer PRIMARY KEY CHECK (metric_no BETWEEN 1 AND 7),
  metric_code    text NOT NULL UNIQUE,
  target         numeric,
  stretch_target numeric,
  floor          numeric,
  target_rule    text NOT NULL CHECK (target_rule IN ('<=','>=')),
  unit           text NOT NULL,
  source         text NOT NULL,
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ops.watchlist_targets IS 'SMC 6A2 #3 / I-19: target, stretch and floor per watchlist number. Edited through smc_console_set_watchlist_target(); read by facts.v_watchlist.';
INSERT INTO ops.watchlist_targets (metric_no, metric_code, target, stretch_target, floor, target_rule, unit, source) VALUES
  (1, 'cost_per_good_fit_meeting', 1300, 900,  NULL, '<=', 'ZAR',   'NH-25 default (I-19): R1,300; stretch R900 = 6A2 example'),
  (2, 'leads_reached_pct',         0.85, NULL, NULL, '>=', 'ratio', '6A2 item 2 example'),
  (3, 'booked_to_attended_pct',    0.65, NULL, 0.50, '>=', 'ratio', '3.4 / 3.7'),
  (4, 'broker_good_fit_pct',       0.60, NULL, NULL, '>=', 'ratio', 'NH-25 default (I-19): mirror of the 40% not-a-fit pause line (3.4); excludes unreachable'),
  (5, 'margin_this_cycle_pct',     0.43, NULL, 0.30, '>=', 'ratio', '3.5 model 43%, floor 30%'),
  (6, 'days_capacity_left',        5,    NULL, NULL, '>=', 'days',  '4.6 capacity alert (5 working days)'),
  (7, 'renewal_risk',              0,    NULL, NULL, '<=', 'level', 'ASSUMPTION thresholds 3.4 / 4.12a / 4.10a — validate at cycle-1 close (NH-21)')
ON CONFLICT (metric_no) DO NOTHING;   -- re-runs never overwrite a target Jonathan changed

ALTER TABLE ops.watchlist_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.watchlist_targets FROM anon;
GRANT SELECT, INSERT, UPDATE ON ops.watchlist_targets TO authenticated;
GRANT SELECT ON ops.watchlist_targets TO n8n_app;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'ops' AND tablename = 'watchlist_targets' AND policyname = 'smc admin all') THEN
    CREATE POLICY "smc admin all" ON ops.watchlist_targets FOR ALL TO authenticated
      USING (public.smc_is_admin()) WITH CHECK (public.smc_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'ops' AND tablename = 'watchlist_targets' AND policyname = 'smc n8n_app read') THEN
    CREATE POLICY "smc n8n_app read" ON ops.watchlist_targets FOR SELECT TO n8n_app USING (true);
  END IF;
  -- audit on every write (Salesforce): same trigger function as every other SMC table
  IF to_regprocedure('public.smc_audit()') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'smc_audit' AND tgrelid = 'ops.watchlist_targets'::regclass) THEN
    CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON ops.watchlist_targets
      FOR EACH ROW EXECUTE FUNCTION public.smc_audit();
  END IF;
END $$;

-- facts.v_watchlist: identical columns to 04; targets/floors now come from ops.watchlist_targets and
-- tile 4 (good-fit %) excludes `unreachable` from both numerator and denominator (I-19).
CREATE OR REPLACE VIEW facts.v_watchlist AS
WITH win AS (
  SELECT 'cur'::text AS w, facts.sa_date(now()) - 27 AS d0, facts.sa_date(now()) AS d1
  UNION ALL
  SELECT 'prev', facts.sa_date(now()) - 55, facts.sa_date(now()) - 28
),
scopes AS (
  SELECT NULL::uuid AS broker_id
  UNION ALL
  SELECT b.id FROM public.brokers b WHERE b.brand_id IS NOT NULL
),
base AS (
  SELECT s.broker_id, w.w,
    (SELECT coalesce(sum(fc.amount_zar), 0) FROM facts.fact_cost fc
      WHERE fc.kind = 'media' AND fc.date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fc.broker_id = s.broker_id))                     AS media_zar,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.good_fit AND fo.outcome = 'attended' AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS good_fit_meetings,
    (SELECT count(*) FROM facts.fact_lead fl
      WHERE fl.verify_window_closed AND fl.created_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fl.broker_id = s.broker_id))                     AS leads_matured,
    (SELECT count(*) FROM facts.fact_lead fl
      WHERE fl.verify_window_closed AND fl.verified_within_72h AND fl.created_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fl.broker_id = s.broker_id))                     AS leads_reached,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.outcome = 'attended' AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS attended,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.outcome = 'no_show' AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS no_show,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.outcome = 'attended' AND fo.disposition_code IS NOT NULL
        AND fo.disposition_code <> 'unreachable' AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS dispositioned,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.outcome = 'attended' AND fo.good_fit AND fo.disposition_code <> 'unreachable' AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS good_fit_dispositions,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.unconfirmed AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS unconfirmed
  FROM scopes s CROSS JOIN win w
),
cyc AS (   -- margin and pace on the cycle that is running now (or the latest one)
  SELECT s.broker_id,
    sum(fc.price_zar)  AS price_zar,
    sum(fc.margin_zar) AS margin_zar,
    sum(fc.delivered)  AS delivered,
    sum(fc.committed_leads * least(1.0, greatest(0.0,
          extract(epoch FROM (now() - fc.starts_at)) / nullif(extract(epoch FROM (fc.ends_at - fc.starts_at)), 0)))) AS expected_by_now
  FROM scopes s
  JOIN facts.fact_cycle fc
    ON (s.broker_id IS NULL OR fc.broker_id = s.broker_id)
   AND fc.status IN ('active','extended')
  GROUP BY s.broker_id
),
cap AS (
  SELECT s.broker_id,
    (SELECT coalesce(sum(greatest(bd.capacity_slots - bd.meetings_scheduled, 0)), 0) FROM facts.fact_broker_day bd
      WHERE bd.date > facts.sa_date(now()) AND (s.broker_id IS NULL OR bd.broker_id = s.broker_id)) AS free_slots,
    (SELECT sum(bd.bookings_made)::numeric / 14 FROM facts.fact_broker_day bd
      WHERE bd.date BETWEEN facts.sa_date(now()) - 13 AND facts.sa_date(now())
        AND (s.broker_id IS NULL OR bd.broker_id = s.broker_id))                    AS bookings_per_day,
    (SELECT count(DISTINCT r.week) FROM public.report_history r
      WHERE r.brand_id IS NOT NULL AND r.report_kind = 'broker_weekly'
        AND r.week >= facts.sa_date(now()) - 20
        AND r.opened_portal_at IS NULL AND r.opened_wa_at IS NULL
        AND (s.broker_id IS NULL OR r.broker_id = s.broker_id))                     AS reports_unopened_3w
  FROM scopes s
),
m AS (
  SELECT c.broker_id, c.w,
    CASE WHEN c.good_fit_meetings > 0 THEN round(c.media_zar / c.good_fit_meetings, 2) END   AS m1,
    c.good_fit_meetings                                                                       AS n1,
    CASE WHEN c.leads_matured > 0 THEN round(c.leads_reached::numeric / c.leads_matured, 4) END AS m2,
    c.leads_matured                                                                           AS n2,
    CASE WHEN c.attended + c.no_show > 0 THEN round(c.attended::numeric / (c.attended + c.no_show), 4) END AS m3,
    c.attended + c.no_show                                                                    AS n3,
    CASE WHEN c.dispositioned > 0 THEN round(c.good_fit_dispositions::numeric / c.dispositioned, 4) END AS m4,
    c.dispositioned                                                                           AS n4,
    CASE WHEN c.attended > 0 THEN round(c.dispositioned::numeric / c.attended, 4) END        AS disposition_rate,
    c.unconfirmed
  FROM base c
)
SELECT * FROM (
  SELECT 1 AS metric_no, 'cost_per_good_fit_meeting' AS metric_code,
         'Cost per good-fit meeting' AS plain_name,
         cur.broker_id, cur.m1 AS value, NULL::text AS value_label,
         (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 1)::numeric AS target, (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 1)::numeric AS floor, 'ZAR' AS unit, prev.m1 AS value_prev, cur.n1 AS n,
         'What we pay in ads for one meeting the broker rated a good fit. If it rises for 7 days, check which angle''s good-fit rate dropped.' AS what_to_watch
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 2, 'leads_reached_pct', 'Leads we could actually reach', cur.broker_id, cur.m2, NULL, (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 2), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 2), 'ratio', prev.m2, cur.n2,
         'Share of leads who replied on WhatsApp within 72 hours. If it falls, check number validation and first-message timing.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 3, 'booked_to_attended_pct', 'Booked calls that happened', cur.broker_id, cur.m3, NULL, (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 3), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 3), 'ratio', prev.m3, cur.n3,
         'Share of booked calls the lead attended. Below 50% for 14 days: review the reminder sequence and qualification.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 4, 'broker_good_fit_pct', 'Calls the broker rated a good fit', cur.broker_id, cur.m4, NULL, (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 4), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 4), 'ratio', prev.m4, cur.n4,
         'Share of attended calls the broker marked good fit. If it drops, look at which angle or budget band the not-a-fit calls came from.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 5, 'margin_this_cycle_pct', 'What we keep this cycle', s.broker_id,
         round(cy.margin_zar / nullif(cy.price_zar, 0), 4), NULL, (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 5), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 5), 'ratio', NULL, NULL,
         'Price minus ads, WhatsApp, AI, hosting and fees, as a share of price. Below 30% means the kill rules apply before selling more.'
    FROM scopes s LEFT JOIN cyc cy ON cy.broker_id IS NOT DISTINCT FROM s.broker_id
  UNION ALL
  SELECT 6, 'days_capacity_left', 'Days before the broker''s diary is full', s.broker_id,
         CASE WHEN cp.bookings_per_day > 0 THEN round(cp.free_slots / cp.bookings_per_day, 1) END,
         NULL, (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 6), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 6), 'days', NULL, cp.free_slots::integer,
         'Free meeting slots ahead divided by bookings per day. Under 5 working days: offer an upgrade or add a broker.'
    FROM scopes s JOIN cap cp ON cp.broker_id IS NOT DISTINCT FROM s.broker_id
  UNION ALL
  SELECT 7, 'renewal_risk', 'Chance the broker does not renew', s.broker_id,
         r.score, CASE r.score WHEN 2 THEN 'red' WHEN 1 THEN 'amber' ELSE 'green' END,
         (SELECT t.target FROM ops.watchlist_targets t WHERE t.metric_no = 7), (SELECT t.floor FROM ops.watchlist_targets t WHERE t.metric_no = 7), 'level', NULL, NULL,
         'Red if calls happen less than half the time, delivery is behind pace, or reports go unopened 2 weeks; amber if outcomes go unmarked. Red means Jonathan calls the broker.'
    FROM scopes s
    JOIN m cur ON cur.broker_id IS NOT DISTINCT FROM s.broker_id AND cur.w = 'cur'
    LEFT JOIN cyc cy ON cy.broker_id IS NOT DISTINCT FROM s.broker_id
    JOIN cap cp ON cp.broker_id IS NOT DISTINCT FROM s.broker_id
    CROSS JOIN LATERAL (SELECT CASE
        WHEN (cur.m3 IS NOT NULL AND cur.m3 < 0.50)
          OR (cy.expected_by_now > 0 AND cy.delivered / cy.expected_by_now < 0.70)
          OR cp.reports_unopened_3w >= 2                                   THEN 2
        WHEN (cur.disposition_rate IS NOT NULL AND cur.disposition_rate < 0.90)
          OR (cur.m3 IS NOT NULL AND cur.m3 < 0.65)
          OR cur.unconfirmed >= 2                                          THEN 1
        ELSE 0 END AS score) r
) wl;
COMMENT ON VIEW facts.v_watchlist IS 'SMC 6A2 #3: seven owner numbers; broker_id NULL = all brokers. value · target · value_prev (previous 28 days) · n (sample size; "not enough data" below 20).';
COMMENT ON VIEW facts.v_watchlist IS 'SMC 6A2 #3: seven owner numbers; broker_id NULL = all brokers. value · target (ops.watchlist_targets) · value_prev (previous 28 days) · n (sample size; "not enough data" below 20). Tile 4 excludes unreachable (I-19).';

DROP TRIGGER IF EXISTS smc_touch_updated_at ON ops.watchlist_targets;
CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON ops.watchlist_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5. I-19 / I-22 — facts.fact_broker_day as grouped joins (was one correlated count per broker-day)
-- Same 18 columns, names, order and types as 06 (CREATE OR REPLACE keeps dependants valid).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW facts.fact_broker_day AS
WITH days AS (
  SELECT b.id AS broker_id, b.brand_id, gs::date AS date
    FROM public.brokers b
   CROSS JOIN LATERAL generate_series(
           (SELECT facts.sa_date(min(c.starts_at)) FROM public.cycles c WHERE c.broker_id = b.id),
           facts.sa_date(now()) + b.horizon_days,
           interval '1 day') AS gs
   WHERE b.brand_id IS NOT NULL
),
lr AS (SELECT fl.broker_id, fl.created_date AS date, count(*) AS n
         FROM facts.fact_lead fl WHERE fl.broker_id IS NOT NULL GROUP BY 1, 2),
bm AS (SELECT fb.broker_id, fb.booked_date AS date, count(*) AS n
         FROM facts.fact_booking fb WHERE NOT fb.is_reschedule GROUP BY 1, 2),
ms AS (SELECT fb.broker_id, fb.slot_date AS date,
              count(*) FILTER (WHERE fb.status IN ('booked','confirmed','attended','no_show')) AS scheduled,
              count(*) FILTER (WHERE fb.status IN ('booked','confirmed') AND fb.ends_at < now() AND o.booking_id IS NULL) AS unmarked
         FROM facts.fact_booking fb
         LEFT JOIN (SELECT DISTINCT booking_id FROM public.outcomes) o ON o.booking_id = fb.booking_id
        GROUP BY 1, 2),
mh AS (SELECT fo.broker_id, fo.slot_date AS date, count(*) AS n
         FROM facts.fact_outcome fo WHERE fo.outcome = 'attended' GROUP BY 1, 2),
ro AS (SELECT DISTINCT r.broker_id, (r.week + k)::date AS date
         FROM public.report_history r CROSS JOIN generate_series(0, 6) AS k
        WHERE r.brand_id IS NOT NULL AND r.week IS NOT NULL
          AND (r.opened_portal_at IS NOT NULL OR r.opened_wa_at IS NOT NULL)),
base AS (
SELECT
  d.broker_id, d.brand_id, d.date,
  cy.id                                                                        AS cycle_id,
  CASE WHEN b.meeting_hours ? lower(to_char(d.date, 'Dy')) AND NOT b.bookings_paused
       THEN b.max_meetings_per_day ELSE 0 END                                  AS capacity_slots,
  coalesce(lr.n, 0)::bigint                                                    AS leads_routed,
  coalesce(bm.n, 0)::bigint                                                    AS bookings_made,
  coalesce(ms.scheduled, 0)::bigint                                            AS meetings_scheduled,
  coalesce(mh.n, 0)::bigint                                                    AS meetings_held,
  coalesce(ms.unmarked, 0)::bigint                                             AS outcomes_unmarked,
  (ro.broker_id IS NOT NULL)                                                   AS report_opened
FROM days d
JOIN public.brokers b ON b.id = d.broker_id
LEFT JOIN LATERAL (SELECT c.id FROM public.cycles c
                    WHERE c.broker_id = d.broker_id
                      AND d.date >= facts.sa_date(c.starts_at)
                      AND d.date <  facts.sa_date(coalesce(c.extended_until, c.ends_at))
                    ORDER BY c.starts_at DESC LIMIT 1) cy ON true
LEFT JOIN lr ON lr.broker_id = d.broker_id AND lr.date = d.date
LEFT JOIN bm ON bm.broker_id = d.broker_id AND bm.date = d.date
LEFT JOIN ms ON ms.broker_id = d.broker_id AND ms.date = d.date
LEFT JOIN mh ON mh.broker_id = d.broker_id AND mh.date = d.date
LEFT JOIN ro ON ro.broker_id = d.broker_id AND ro.date = d.date
)
SELECT base.broker_id, base.brand_id, base.date, base.cycle_id, base.capacity_slots, base.leads_routed,
       base.bookings_made, base.meetings_scheduled, base.meetings_held, base.outcomes_unmarked, base.report_opened,
       base.date AS day,
       coalesce(sum(base.capacity_slots)     OVER w7, 0)::integer AS slots_total_7d,
       coalesce(sum(base.meetings_scheduled) OVER w7, 0)::integer AS slots_booked_7d,
       coalesce(sum(greatest(base.capacity_slots - base.meetings_scheduled, 0)) OVER w14, 0)::integer AS slots_open_14d,
       base.outcomes_unmarked::integer AS todos_open,
       false AS media_trimmed,
       round(coalesce(sum(base.meetings_scheduled) OVER w7, 0)::numeric / nullif(sum(base.capacity_slots) OVER w7, 0), 4) AS calendar_fill_7d
FROM base
WINDOW w7  AS (PARTITION BY base.broker_id ORDER BY base.date ROWS BETWEEN 1 FOLLOWING AND 7 FOLLOWING),
       w14 AS (PARTITION BY base.broker_id ORDER BY base.date ROWS BETWEEN 1 FOLLOWING AND 14 FOLLOWING);

-- -----------------------------------------------------------------------------
-- 6. I-30c — agreement acceptances (clause 11.2, Annex 1, no-Page …) on the signed document row.
-- The repo's admin_documents (INV-T12) has no `metadata` column (spec 06 assumed one), so a dedicated
-- jsonb column is added rather than a general metadata bag.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_documents ADD COLUMN IF NOT EXISTS acceptances jsonb;
ALTER TABLE public.admin_documents ADD COLUMN IF NOT EXISTS signer_ip_source text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_documents_acceptances_check'
                  AND conrelid = 'public.admin_documents'::regclass) THEN
    ALTER TABLE public.admin_documents ADD CONSTRAINT admin_documents_acceptances_check CHECK (
          (acceptances IS NULL OR jsonb_typeof(acceptances) = 'object')
      AND (signer_ip_source IS NULL OR signer_ip_source IN ('x-forwarded-for','x-real-ip','none')));
  END IF;
END $$;
COMMENT ON COLUMN public.admin_documents.acceptances IS 'SMC I-30c: what the signer ticked, e.g. {"clause_11_2":true,"annex_1":true,"no_page":true,"version":"…"}; written once by smc_sign_document.';

-- -----------------------------------------------------------------------------
-- 7. I-30b — smc_sign_document records the signer IP from the request, never from the browser.
-- PostgREST exposes request headers as the GUC request.headers (JSON). On Supabase the client IP is the
-- first entry of x-forwarded-for (ASSUMPTION — validate on staging by signing a test document and
-- comparing with the API gateway log). p_signer_ip is kept in the signature for compatibility and ignored.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_request_ip(OUT ip text, OUT ip_source text)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
AS $$
DECLARE
  h json;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    h := NULL;
  END;
  ip := nullif(btrim(split_part(h->>'x-forwarded-for', ',', 1)), '');
  ip_source := CASE WHEN ip IS NOT NULL THEN 'x-forwarded-for' END;
  IF ip IS NULL THEN
    ip := nullif(btrim(h->>'x-real-ip'), '');
    ip_source := CASE WHEN ip IS NOT NULL THEN 'x-real-ip' ELSE 'none' END;
  END IF;
  -- keep only something that parses as an address (a header is attacker-supplied text)
  IF ip IS NOT NULL THEN
    BEGIN
      ip := host(ip::inet);
    EXCEPTION WHEN others THEN
      ip := NULL; ip_source := 'none';
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.smc_sign_document(p_document_id uuid, p_signed_by_name text, p_doc_sha256 text,
                                                    p_signer_ip text, p_user_agent text, p_acceptances jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_ip    record;
BEGIN
  IF coalesce(btrim(p_signed_by_name), '') = '' OR coalesce(p_doc_sha256, '') !~* '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'smc_sign_document: typed name and SHA-256 required' USING ERRCODE = '22023';
  END IF;
  IF p_acceptances IS NOT NULL AND jsonb_typeof(p_acceptances) <> 'object' THEN
    RAISE EXCEPTION 'smc_sign_document: acceptances must be a JSON object' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ip FROM public.smc_request_ip();
  PERFORM set_config('smc.source', 'portal', true);
  PERFORM set_config('smc.reason', 'e-sign', true);
  UPDATE public.admin_documents
     SET signed_at = now(), signed_by_name = btrim(p_signed_by_name), doc_sha256 = p_doc_sha256,
         signer_ip = v_ip.ip, signer_ip_source = v_ip.ip_source,
         signed_user_agent = left(p_user_agent, 500),
         acceptances = p_acceptances
   WHERE id = p_document_id AND brand_id IS NOT NULL AND signed_at IS NULL
     AND broker_id = public.smc_current_broker_id()
     AND kind IN ('agreement','authorisation_letter','addendum');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'smc_sign_document: not found, not yours, or already signed' USING ERRCODE = '42501';
  END IF;
END $$;

-- The 5-argument form the portal calls today: same behaviour, no acceptances, IP still server-side.
CREATE OR REPLACE FUNCTION public.smc_sign_document(p_document_id uuid, p_signed_by_name text, p_doc_sha256 text,
                                                    p_signer_ip text, p_user_agent text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.smc_sign_document(p_document_id, p_signed_by_name, p_doc_sha256, NULL::text, p_user_agent, NULL::jsonb)
$$;

-- -----------------------------------------------------------------------------
-- 8. I-30d — "Policies written" (voluntary, ROI only, never priced — 3.7/FAIS). Brokers cannot write
-- cycles; this RPC sets cycles.policies_written_reported on the broker's own cycle and stamps the timeline.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_report_policies_written(p_count integer, p_cycle_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_broker uuid := public.smc_current_broker_id();
  v_cycle  uuid;
  v_brand  uuid;
  v_event  uuid := gen_random_uuid();
BEGIN
  IF v_broker IS NULL THEN
    RAISE EXCEPTION 'smc_report_policies_written: not a broker' USING ERRCODE = '42501';
  END IF;
  IF p_count IS NULL OR p_count < 0 OR p_count > 1000 THEN
    RAISE EXCEPTION 'smc_report_policies_written: count must be 0–1000' USING ERRCODE = '22023';
  END IF;
  SELECT c.id, c.brand_id INTO v_cycle, v_brand
    FROM public.cycles c
   WHERE c.broker_id = v_broker
     AND (p_cycle_id IS NULL OR c.id = p_cycle_id)
   ORDER BY (c.id = (SELECT b.current_cycle_id FROM public.brokers b WHERE b.id = v_broker)) DESC NULLS LAST,
            c.starts_at DESC NULLS LAST
   LIMIT 1;
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'smc_report_policies_written: cycle not found or not yours' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('smc.source', 'portal_rpc', true);
  PERFORM set_config('smc.reason', 'policies_written_reported', true);
  UPDATE public.cycles SET policies_written_reported = p_count WHERE id = v_cycle;
  INSERT INTO public.lead_activities (brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (v_brand, v_broker, 'portal', 'broker', 'policies.reported',
          jsonb_build_object('event_id', v_event, 'type', 'policies.reported', 'broker_id', v_broker,
                             'cycle_id', v_cycle, 'count', p_count, 'occurred_at', now()),
          now(), 'portal:' || v_event::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN v_cycle;
END $$;

-- -----------------------------------------------------------------------------
-- 9. I-30i — faculty strip: one tile per (faculty, metric) from facts.pulse_daily, shaped like
-- smc_watchlist_tiles (value · 7-day value · n · 28-day trend). Admin only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_faculty_tiles(p_days integer DEFAULT 28, p_include_synthetic boolean DEFAULT false)
RETURNS TABLE (faculty text, metric text, date date, value numeric, value_7d numeric, numerator_7d numeric,
               denominator_7d numeric, n numeric, value_prev numeric, trend jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, facts, pg_temp
AS $$
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'smc_faculty_tiles: admin only' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('smc.include_synthetic', CASE WHEN p_include_synthetic THEN 'on' ELSE 'off' END, true);
  RETURN QUERY
  WITH p AS (
    SELECT pd.* FROM facts.pulse_daily pd
     WHERE pd.date >= facts.sa_date(now()) - greatest(least(coalesce(p_days, 28), 90), 1)
  ), last AS (
    SELECT DISTINCT ON (p.faculty, p.metric) p.* FROM p ORDER BY p.faculty, p.metric, p.date DESC
  )
  SELECT l.faculty::text, l.metric::text, l.date, l.value, l.value_7d, l.numerator_7d, l.denominator_7d,
         coalesce(l.denominator_7d, l.n),
         (SELECT p2.value_7d FROM p p2 WHERE p2.faculty = l.faculty AND p2.metric = l.metric AND p2.date = l.date - 7),
         (SELECT jsonb_agg(jsonb_build_object('d', p3.date, 'v', coalesce(p3.value_7d, p3.value)) ORDER BY p3.date)
            FROM p p3 WHERE p3.faculty = l.faculty AND p3.metric = l.metric)
    FROM last l
   ORDER BY l.faculty, l.metric;
END $$;

-- -----------------------------------------------------------------------------
-- 10. NH-22 default — console reads/writes of ops.* through admin RPCs (has_role('admin') inside each,
-- via smc_is_admin(), INV-F02), so `ops` does not need to be an exposed API schema.
-- One function per call site in src/pages/smc/Today.tsx; signatures mirror the current queries.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_console_assert_admin(p_fn text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION '%: admin only', p_fn USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_pulses(p_limit integer DEFAULT 14)
RETURNS SETOF ops.pulses LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_pulses');
  RETURN QUERY SELECT * FROM ops.pulses ORDER BY date DESC LIMIT least(greatest(coalesce(p_limit, 14), 1), 90);
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_signals_open(p_limit integer DEFAULT 200)
RETURNS SETOF ops.signals LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_signals_open');
  RETURN QUERY SELECT * FROM ops.signals WHERE resolved_at IS NULL
                ORDER BY detected_at DESC LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_quality_grades(p_hours integer DEFAULT 48, p_limit integer DEFAULT 30)
RETURNS SETOF ops.quality_grades LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_quality_grades');
  RETURN QUERY SELECT * FROM ops.quality_grades
                WHERE graded_at >= now() - make_interval(hours => least(greatest(coalesce(p_hours, 48), 1), 720))
                ORDER BY passed, graded_at DESC LIMIT least(greatest(coalesce(p_limit, 30), 1), 200);
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_judge_runs(p_limit integer DEFAULT 10)
RETURNS SETOF ops.judge_runs LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_judge_runs');
  RETURN QUERY SELECT * FROM ops.judge_runs ORDER BY date DESC LIMIT least(greatest(coalesce(p_limit, 10), 1), 90);
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_build_state()
RETURNS SETOF ops.build_state_latest LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_build_state');
  RETURN QUERY SELECT * FROM ops.build_state_latest LIMIT 1;
END $$;

-- p_pulse_date given → that day's proposals (max 10); NULL → open proposals (max 3), oldest first.
CREATE OR REPLACE FUNCTION public.smc_console_proposals(p_pulse_date date DEFAULT NULL)
RETURNS SETOF ops.proposals LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_proposals');
  IF p_pulse_date IS NOT NULL THEN
    RETURN QUERY SELECT * FROM ops.proposals WHERE pulse_date = p_pulse_date ORDER BY created_at LIMIT 10;
  ELSE
    RETURN QUERY SELECT * FROM ops.proposals WHERE status = 'proposed' ORDER BY created_at LIMIT 3;
  END IF;
END $$;

-- Approve / snooze (+7 SA days) / decline (reason required) + the W32 approval outbox row, in one transaction.
CREATE OR REPLACE FUNCTION public.smc_console_decide_proposal(p_proposal_id uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS ops.proposals LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row ops.proposals;
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_decide_proposal');
  IF p_decision NOT IN ('approve','snooze','decline') THEN
    RAISE EXCEPTION 'smc_console_decide_proposal: decision must be approve, snooze or decline' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'decline' AND coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'smc_console_decide_proposal: a reason is required to decline' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('smc.source', 'console', true);
  PERFORM set_config('smc.reason', 'proposal:' || p_decision, true);
  UPDATE ops.proposals
     SET status = CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'snooze' THEN 'snoozed' ELSE 'declined' END,
         decided_by = v_uid, decided_at = now(), decided_by_label = 'console',
         snooze_until = CASE WHEN p_decision = 'snooze' THEN facts.sa_date(now()) + 7 ELSE snooze_until END,
         decline_reason = CASE WHEN p_decision = 'decline' THEN btrim(p_reason) ELSE decline_reason END
   WHERE id = p_proposal_id AND status = 'proposed'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'smc_console_decide_proposal: not found or already decided' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO ops.notifications (kind, recipient, channel, ref_table, ref_id, proposal_id, dedupe_key, status, source, what, payload)
  VALUES ('approval', 'jonathan', 'console', 'ops.proposals', v_row.id::text, v_row.id,
          'proposal:' || v_row.id || ':' || p_decision, 'queued', 'console', v_row.title,
          jsonb_build_object('decision', p_decision, 'proposal_id', v_row.id, 'decided_by', v_uid,
                             'reason', nullif(btrim(p_reason), ''), 'via', 'console'));
  RETURN v_row;
END $$;

-- Judge "turn into fix": a proposal (source judge) from one failed grade.
CREATE OR REPLACE FUNCTION public.smc_console_proposal_from_grade(p_grade_id uuid)
RETURNS ops.proposals LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g   ops.quality_grades;
  v_row ops.proposals;
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_proposal_from_grade');
  SELECT * INTO g FROM ops.quality_grades WHERE id = p_grade_id;
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'smc_console_proposal_from_grade: grade not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('smc.source', 'console', true);
  INSERT INTO ops.proposals (source, faculty, title, metric, owner_agent, evidence, pulse_date)
  VALUES ('judge',
          CASE WHEN g.faculty IN ('media','page_flow','conversation','nurture_show','comments_dms','broker','billing',
                                  'compliance','infra_cost','brand_search','build') THEN g.faculty ELSE 'conversation' END,
          left('Fix: ' || g.rule, 200), NULL, g.owner_agent,
          g.sample_ref || coalesce(' · "' || left(g.exact_text, 200) || '"', ''),
          facts.sa_date(now()))
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Watchlist target edit (Close: one field, one click). Audited by the table trigger.
CREATE OR REPLACE FUNCTION public.smc_console_set_watchlist_target(p_metric_no integer, p_target numeric,
                                                                   p_stretch_target numeric DEFAULT NULL, p_floor numeric DEFAULT NULL,
                                                                   p_reason text DEFAULT NULL)
RETURNS ops.watchlist_targets LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row ops.watchlist_targets;
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_set_watchlist_target');
  PERFORM set_config('smc.source', 'console', true);
  PERFORM set_config('smc.reason', coalesce(nullif(btrim(p_reason), ''), 'watchlist target edit'), true);
  UPDATE ops.watchlist_targets
     SET target = p_target, stretch_target = p_stretch_target, floor = p_floor,
         updated_by = auth.uid(), source = 'console: ' || coalesce(nullif(btrim(p_reason), ''), 'edited')
   WHERE metric_no = p_metric_no
  RETURNING * INTO v_row;
  IF v_row.metric_no IS NULL THEN
    RAISE EXCEPTION 'smc_console_set_watchlist_target: unknown metric %', p_metric_no USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.smc_console_watchlist_targets()
RETURNS SETOF ops.watchlist_targets LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.smc_console_assert_admin('smc_console_watchlist_targets');
  RETURN QUERY SELECT * FROM ops.watchlist_targets ORDER BY metric_no;
END $$;

-- -----------------------------------------------------------------------------
-- 11. Function privileges (Supabase grants EXECUTE on public functions to anon by default)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.smc_request_ip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_ip() TO authenticated;
REVOKE ALL ON FUNCTION public.smc_sign_document(uuid, text, text, text, text, jsonb),
                       public.smc_sign_document(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_sign_document(uuid, text, text, text, text, jsonb),
                          public.smc_sign_document(uuid, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_report_policies_written(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_report_policies_written(integer, uuid) TO authenticated;
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.smc_faculty_tiles(integer, boolean)',
    'public.smc_console_assert_admin(text)',
    'public.smc_console_pulses(integer)', 'public.smc_console_signals_open(integer)',
    'public.smc_console_quality_grades(integer, integer)', 'public.smc_console_judge_runs(integer)',
    'public.smc_console_build_state()', 'public.smc_console_proposals(date)',
    'public.smc_console_decide_proposal(uuid, text, text)', 'public.smc_console_proposal_from_grade(uuid)',
    'public.smc_console_set_watchlist_target(integer, numeric, numeric, numeric, text)',
    'public.smc_console_watchlist_targets()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);   -- admin check inside each
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 12. I-28 option (b) — smc_brokers_guard tests current_user before auth.uid().
-- Same rules as 06 (body copied verbatim below the first check); only the order of the bypass checks changes.
-- Keeps n8n_app UPDATEs on brokers working even if the hosted project refuses the auth.uid() grant in §1.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- I-28 option (b): decide on current_user FIRST, in its own IF (PL/pgSQL does not promise OR short-circuit),
  -- so n8n_app / service / SECURITY DEFINER paths never call auth.uid() and keep working without the auth grant.
  IF current_user NOT IN ('authenticated','anon') OR OLD.brand_id IS NULL THEN
    RETURN NEW;   -- n8n/service connections, SECURITY DEFINER portal RPCs (run as owner), legacy rows
  END IF;
  IF auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;   -- API roles only from here: no session (RLS already blocks) or an admin
  END IF;
  IF NEW.status            IS DISTINCT FROM OLD.status
  OR NEW.brand_id          IS DISTINCT FROM OLD.brand_id
  OR NEW.tier_code         IS DISTINCT FROM OLD.tier_code
  OR NEW.ref_code          IS DISTINCT FROM OLD.ref_code
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.current_cycle_id  IS DISTINCT FROM OLD.current_cycle_id
  OR NEW.approved_live_by  IS DISTINCT FROM OLD.approved_live_by
  OR NEW.approved_live_at  IS DISTINCT FROM OLD.approved_live_at
  OR NEW.fsp_verified_at   IS DISTINCT FROM OLD.fsp_verified_at
  OR NEW.fsp_check         IS DISTINCT FROM OLD.fsp_check
  OR NEW.routing_on        IS DISTINCT FROM OLD.routing_on
  OR NEW.routing_rules     IS DISTINCT FROM OLD.routing_rules
  OR NEW.consent_mode      IS DISTINCT FROM OLD.consent_mode
  OR NEW.paystack_customer_code IS DISTINCT FROM OLD.paystack_customer_code
  OR NEW.calendar_token_ref IS DISTINCT FROM OLD.calendar_token_ref
  OR NEW.intro_card_url    IS DISTINCT FROM OLD.intro_card_url
  OR NEW.intro_voice_url   IS DISTINCT FROM OLD.intro_voice_url
  OR NEW.intro_video_url   IS DISTINCT FROM OLD.intro_video_url
  -- pass 2 additions
  OR NEW.onboarding_progress          IS DISTINCT FROM OLD.onboarding_progress
  OR NEW.onboarding_step              IS DISTINCT FROM OLD.onboarding_step
  OR NEW.onboarding_completed_at      IS DISTINCT FROM OLD.onboarding_completed_at
  OR NEW.onboarding_last_progress_at  IS DISTINCT FROM OLD.onboarding_last_progress_at
  OR NEW.onboarding_nudges            IS DISTINCT FROM OLD.onboarding_nudges
  OR NEW.first_login_at               IS DISTINCT FROM OLD.first_login_at
  OR NEW.preflight_card               IS DISTINCT FROM OLD.preflight_card
  OR NEW.preflight_run_id             IS DISTINCT FROM OLD.preflight_run_id
  OR NEW.calendar_mode                IS DISTINCT FROM OLD.calendar_mode
  OR NEW.calendar_status              IS DISTINCT FROM OLD.calendar_status
  OR NEW.calendar_connected_at        IS DISTINCT FROM OLD.calendar_connected_at
  OR NEW.next_free_slot_at            IS DISTINCT FROM OLD.next_free_slot_at
  OR NEW.billing_ref                  IS DISTINCT FROM OLD.billing_ref
  OR NEW.next_tier_code               IS DISTINCT FROM OLD.next_tier_code
  OR NEW.card_autorenew               IS DISTINCT FROM OLD.card_autorenew
  OR NEW.paystack_subscription_code   IS DISTINCT FROM OLD.paystack_subscription_code
  OR NEW.paystack_subscription_token_ref IS DISTINCT FROM OLD.paystack_subscription_token_ref
  OR NEW.paystack_authorization_ref   IS DISTINCT FROM OLD.paystack_authorization_ref
  OR NEW.explainer_watched_at         IS DISTINCT FROM OLD.explainer_watched_at THEN
    RAISE EXCEPTION 'smc: brokers cannot change status, tier, routing, consent mode, FSP verification, go-live, onboarding state, calendar state, billing or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
