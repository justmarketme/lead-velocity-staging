-- =============================================================================
-- 20261002040000_smc_04_facts.sql  —  SortMyCover build, migration 4 of 5: decision data (6A2)
-- Owner: platform-architect (+ analytics-reporter, optimisation-advisor read it). Drafted 2026-10-02. NOT applied.
-- Implements crm-gap §A5 `facts` row and 6A2 items 1 and 3:
--   facts.fact_lead, fact_message, fact_booking, fact_outcome, fact_comment,
--   fact_ad_day, fact_broker_day, fact_cycle, fact_cost   (plain views, always fresh)
--   facts.v_watchlist  — the owner's seven numbers (value · target · previous 28 days)
--   public.smc_watchlist() — admin-only RPC wrapper for the console "Today" tiles
--
-- Pseudonymisation (6A2 #1): no names, numbers, emails, IPs, user agents, message
-- bodies or transcripts appear in facts. Leads are joined on lead_key =
-- sha256(secret salt || lead id); the salt lives in smc_private (no grants), so a
-- facts reader cannot re-identify a lead. Free-text that does appear
-- (outcome summary, lead-pulse line, insights) is redacted at write time by the
-- workflows (2.1.7) — columns are suffixed _redacted to say so.
--
-- Synthetic data: excluded by default; `SET smc.include_synthetic = 'on'` includes it
-- (acceptance tests: "seven watchlist tiles show real values from a synthetic cycle").
-- Days are South African days (Africa/Johannesburg).
-- Views, not materialised views: promote one to a materialised view only if it is
-- measured to be slow (crm-gap A5). Joins are one hop on lead_key, broker_id, cycle_id, ad_id, date.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS facts;
CREATE SCHEMA IF NOT EXISTS smc_private;
COMMENT ON SCHEMA facts IS 'SMC 6A2: governed, pseudonymised decision layer. Read by facts_reader ("Ask the data"), n8n_app (advisor) and admin RPCs.';
COMMENT ON SCHEMA smc_private IS 'SMC: secrets for pseudonymisation. No grants to any API role.';
REVOKE ALL ON SCHEMA smc_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS smc_private.pseudonym_key (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt       text NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text),  -- generated in the database, never in the repo
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO smc_private.pseudonym_key (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION facts.lead_key(p_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = smc_private, public
AS $$ SELECT CASE WHEN p_id IS NULL THEN NULL
                  ELSE encode(sha256(convert_to((SELECT salt FROM smc_private.pseudonym_key WHERE id = 1) || p_id::text, 'UTF8')), 'hex') END $$;

CREATE OR REPLACE FUNCTION facts.include_synthetic()
RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('smc.include_synthetic', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION facts.sa_date(ts timestamptz)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$ SELECT (ts AT TIME ZONE 'Africa/Johannesburg')::date $$;

-- -----------------------------------------------------------------------------
-- fact_lead — one row per SortMyCover lead, the funnel in booleans
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_lead' AND column_name = 'verified_at') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_lead AS
SELECT
  facts.lead_key(l.id)                                  AS lead_key,
  l.brand_id, l.broker_id, l.cycle_id, l.tier_code,
  facts.sa_date(l.created_at)                           AS created_date,
  l.created_at,
  l.origin, l.campaign_id, l.adset_id, l.ad_id, l.concept, l.angle, l.placement,
  l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content,
  l.consent_mode,
  (l.consent_at IS NOT NULL)                            AS consented,
  (l.consent_ads_at IS NOT NULL)                        AS consented_ads,
  l.line_type, l.age_band, l.budget_band, l.bond, l.dependants, l.work_cover,
  l.method_pref, l.language, l.best_time,
  extract(epoch FROM (l.first_message_at - l.created_at))::integer AS first_message_seconds,
  (l.wa_delivered_at IS NOT NULL)                       AS delivered,
  (l.verified_at IS NOT NULL)                           AS verified,
  (l.verified_at IS NOT NULL AND l.first_message_at IS NOT NULL
     AND l.verified_at <= l.first_message_at + interval '72 hours') AS verified_within_72h,
  (l.first_message_at IS NOT NULL AND l.first_message_at <= now() - interval '72 hours') AS verify_window_closed,
  (l.qualified_at IS NOT NULL)                          AS qualified,
  l.disqualified_reason,
  (bk.lead_id IS NOT NULL)                              AS booked,
  bk.first_booked_at,
  bk.method                                             AS booked_method,
  oc.outcome,
  (oc.outcome = 'attended')                             AS attended,
  (oc.outcome = 'no_show')                              AS no_show,
  oc.disposition_code,
  (oc.disposition_code IN ('fit_proceeding','fit_followup')) AS good_fit,
  oc.quality_score,
  lp.thumbs                                             AS lead_pulse,
  l.stage, l.stage_entered_at,
  (l.opted_out_at IS NOT NULL)                          AS opted_out,
  (rp.id IS NOT NULL)                                   AS replacement_claimed,
  rp.status                                             AS replacement_status,
  EXISTS (SELECT 1 FROM public.replacements r2
           WHERE r2.replacement_lead_id = l.id AND r2.status <> 'rejected') AS is_replacement_lead,
  (SELECT CASE WHEN sum(am.leads_raw) > 0 THEN round(sum(am.spend_zar) / sum(am.leads_raw), 2) END
     FROM public.ad_metrics am
    WHERE am.ad_id = l.ad_id AND am.date = facts.sa_date(l.created_at)) AS attributed_media_zar,
  l.is_synthetic
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT a.client_id AS lead_id, min(coalesce(a.booked_at, a.created_at)) AS first_booked_at,
         (array_agg(a.method ORDER BY a.appointment_date DESC))[1] AS method
    FROM public.appointments a
   WHERE a.client_id = l.id AND a.brand_id IS NOT NULL
   GROUP BY a.client_id
) bk ON true
LEFT JOIN LATERAL (
  SELECT o.outcome, o.disposition_code, o.quality_score
    FROM public.outcomes o WHERE o.lead_id = l.id
   ORDER BY o.marked_at DESC LIMIT 1
) oc ON true
LEFT JOIN LATERAL (
  SELECT p.thumbs FROM public.lead_pulse p
   WHERE p.lead_id = l.id AND p.answered_at IS NOT NULL
   ORDER BY p.answered_at DESC LIMIT 1
) lp ON true
LEFT JOIN LATERAL (
  SELECT r.id, r.status FROM public.replacements r
   WHERE r.lead_id = l.id AND r.status <> 'rejected' LIMIT 1
) rp ON true
WHERE l.brand_id IS NOT NULL
  AND (NOT l.is_synthetic OR facts.include_synthetic())
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_message — one row per SortMyCover message; no bodies, no numbers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW facts.fact_message AS
SELECT
  c.id                         AS message_id,
  facts.lead_key(c.lead_id)    AS lead_key,
  c.brand_id, c.broker_id,
  facts.sa_date(c.created_at)  AS date,
  c.created_at,
  c.channel, c.direction, c.author, c.status,
  c.template_name, c.template_category, c.intent, c.llm_model, c.latency_ms,
  c.guardrail_trip, c.guardrail_rule, c.handoff, c.workflow,
  (c.delivered_at IS NOT NULL) AS delivered,
  (c.read_at IS NOT NULL)      AS read,
  c.cost_zar
FROM public.communications c
LEFT JOIN public.leads l ON l.id = c.lead_id
WHERE c.brand_id IS NOT NULL
  AND (l.id IS NULL OR NOT l.is_synthetic OR facts.include_synthetic());

-- -----------------------------------------------------------------------------
-- fact_booking
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_booking' AND column_name = 'booked_at') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_booking AS
SELECT
  a.id                                AS booking_id,
  facts.lead_key(a.client_id)         AS lead_key,
  a.brand_id, a.broker_id, a.cycle_id,
  facts.sa_date(a.appointment_date)   AS slot_date,
  a.appointment_date                  AS starts_at,
  a.ends_at,
  a.method, a.booked_via, a.status, a.calendar_provider,
  (a.graph_event_id IS NOT NULL)      AS has_calendar_event,
  a.invite_email_status,
  a.reschedule_count,
  (a.previous_booking_id IS NOT NULL) AS is_reschedule,
  (a.confirmed_at IS NOT NULL)        AS confirmed,
  round((extract(epoch FROM (a.appointment_date - coalesce(a.booked_at, a.created_at))) / 3600)::numeric, 1) AS lead_time_hours,
  facts.sa_date(coalesce(a.booked_at, a.created_at)) AS booked_date
FROM public.appointments a
JOIN public.leads l ON l.id = a.client_id
WHERE a.brand_id IS NOT NULL
  AND (NOT l.is_synthetic OR facts.include_synthetic())
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_outcome
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_outcome' AND column_name = 'marked_at') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_outcome AS
SELECT
  o.id                             AS outcome_id,
  o.booking_id,
  facts.lead_key(o.lead_id)        AS lead_key,
  o.brand_id, o.broker_id, o.cycle_id,
  facts.sa_date(a.appointment_date) AS slot_date,
  o.outcome, o.disposition_code,
  (o.disposition_code IN ('fit_proceeding','fit_followup')) AS good_fit,
  o.quality_score, o.lead_reach_check,
  o.marked_via, o.auto_marked, o.unconfirmed, o.dispute_status, o.replacement_eligible,
  round((extract(epoch FROM (o.marked_at - coalesce(a.ends_at, a.appointment_date))) / 60)::numeric, 0) AS marked_minutes_after_slot,
  (o.voice_note_url IS NOT NULL)   AS has_voice_note,
  o.summary                        AS summary_redacted
FROM public.outcomes o
JOIN public.appointments a ON a.id = o.booking_id
JOIN public.leads l        ON l.id = o.lead_id
WHERE (NOT l.is_synthetic OR facts.include_synthetic())
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_comment
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW facts.fact_comment AS
SELECT
  cm.id                              AS comment_row_id,
  cm.brand_id, cm.platform, cm.ad_id, cm.parent_post_id,
  facts.sa_date(cm.received_at)      AS date,
  cm.class, cm.needs_human, cm.fais_risk, cm.hidden,
  (cm.public_reply_id IS NOT NULL)   AS replied_public,
  (cm.private_reply_sent_at IS NOT NULL) AS replied_private,
  cm.sla_seconds,
  facts.lead_key(cm.origin_lead_id)  AS origin_lead_key
FROM public.comments cm;

-- -----------------------------------------------------------------------------
-- fact_cost — one ledger: media from ad_metrics (source of truth for spend) +
-- ops.costs (WhatsApp, LLM, infra, fees, and media adjustments such as VAT on media).
-- Shared rows (broker_id NULL) are allocated to brokers by their share of that
-- brand's routed leads on that SA day. ASSUMPTION — allocation by lead share;
-- validate against media_share_zar at the first cycle close (analytics-reporter).
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_cost' AND column_name = 'cycle_id') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_cost AS
WITH raw AS (
  SELECT am.date, 'media'::text AS kind, am.brand_id, NULL::uuid AS broker_id, sum(am.spend_zar) AS amount_zar, 'ad_metrics'::text AS source
    FROM public.ad_metrics am GROUP BY am.date, am.brand_id
  UNION ALL
  SELECT c.date, c.kind, c.brand_id, c.broker_id, c.amount_zar, coalesce(c.source_ref, 'ops.costs')
    FROM ops.costs c
),
share AS (
  SELECT l.brand_id, facts.sa_date(l.created_at) AS date, l.broker_id,
         count(*)::numeric / sum(count(*)) OVER (PARTITION BY l.brand_id, facts.sa_date(l.created_at)) AS share
    FROM public.leads l
   WHERE l.brand_id IS NOT NULL AND l.broker_id IS NOT NULL
     AND (NOT l.is_synthetic OR facts.include_synthetic())
   GROUP BY l.brand_id, facts.sa_date(l.created_at), l.broker_id
)
SELECT r.date, r.kind, r.brand_id, r.broker_id, r.amount_zar, r.source, 'direct'::text AS allocation
  FROM raw r WHERE r.broker_id IS NOT NULL
UNION ALL
SELECT r.date, r.kind, r.brand_id, s.broker_id,
       round(r.amount_zar * coalesce(s.share, 1), 2), r.source,
       CASE WHEN s.broker_id IS NULL THEN 'unallocated' ELSE 'lead_share' END
  FROM raw r
  LEFT JOIN share s ON s.brand_id IS NOT DISTINCT FROM r.brand_id AND s.date = r.date
 WHERE r.broker_id IS NULL
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_ad_day — spend (ad_metrics) joined to what the leads actually did (leads/outcomes)
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_ad_day' AND column_name = 'day') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_ad_day AS
WITH spend AS (
  SELECT am.date, am.brand_id, am.ad_id,
         max(am.campaign_id) AS campaign_id, max(am.adset_id) AS adset_id,
         max(am.concept) AS concept, max(am.angle) AS angle, max(am.format) AS format,
         sum(am.spend_zar) AS spend_zar, sum(am.impressions) AS impressions, sum(am.clicks) AS clicks,
         sum(am.leads_raw) AS leads_meta, max(am.frequency) AS frequency,
         avg(am.hook_rate) AS hook_rate, avg(am.hold_rate) AS hold_rate, max(am.emq) AS emq
    FROM public.ad_metrics am
   GROUP BY am.date, am.brand_id, am.ad_id
),
leadside AS (
  SELECT fl.created_date AS date, fl.brand_id, fl.ad_id,
         count(*)                                   AS leads,
         count(*) FILTER (WHERE fl.verified)        AS verified,
         count(*) FILTER (WHERE fl.qualified)       AS qualified,
         count(*) FILTER (WHERE fl.booked)          AS booked,
         count(*) FILTER (WHERE fl.attended)        AS attended,
         count(*) FILTER (WHERE fl.good_fit)        AS good_fit,
         count(fl.quality_score)                    AS quality_n,
         round(avg(fl.quality_score), 2)            AS quality_avg,
         count(*) FILTER (WHERE fl.disposition_code IN ('nofit_budget','nofit_covered','nofit_criteria')) AS nofit
    FROM facts.fact_lead fl
   WHERE fl.ad_id IS NOT NULL
   GROUP BY fl.created_date, fl.brand_id, fl.ad_id
)
SELECT
  coalesce(s.date, ls.date)         AS date,
  coalesce(s.brand_id, ls.brand_id) AS brand_id,
  coalesce(s.ad_id, ls.ad_id)       AS ad_id,
  s.campaign_id, s.adset_id, s.concept, s.angle, s.format,
  coalesce(s.spend_zar, 0)          AS spend_zar,
  s.impressions, s.clicks, s.leads_meta, s.frequency, s.hook_rate, s.hold_rate, s.emq,
  coalesce(ls.leads, 0)     AS leads,
  coalesce(ls.verified, 0)  AS verified,
  coalesce(ls.qualified, 0) AS qualified,
  coalesce(ls.booked, 0)    AS booked,
  coalesce(ls.attended, 0)  AS attended,
  coalesce(ls.good_fit, 0)  AS good_fit,
  coalesce(ls.quality_n, 0) AS quality_n,
  CASE WHEN coalesce(ls.quality_n, 0) >= 5 THEN ls.quality_avg END AS quality_index,   -- n ≥ 5 (3.4)
  coalesce(ls.nofit, 0)     AS nofit
FROM spend s
FULL JOIN leadside ls ON ls.date = s.date AND ls.brand_id = s.brand_id AND ls.ad_id = s.ad_id
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_broker_day — a broker's week in one screen (Pipedrive): capacity, load, to-dos
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_broker_day' AND column_name = 'day') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_broker_day AS
WITH days AS (
  SELECT b.id AS broker_id, b.brand_id, gs::date AS date
    FROM public.brokers b
   CROSS JOIN LATERAL generate_series(
           (SELECT facts.sa_date(min(c.starts_at)) FROM public.cycles c WHERE c.broker_id = b.id),
           facts.sa_date(now()) + b.horizon_days,
           interval '1 day') AS gs
   WHERE b.brand_id IS NOT NULL
)
SELECT
  d.broker_id, d.brand_id, d.date,
  (SELECT c.id FROM public.cycles c
    WHERE c.broker_id = d.broker_id
      AND d.date >= facts.sa_date(c.starts_at)
      AND d.date <  facts.sa_date(coalesce(c.extended_until, c.ends_at))
    ORDER BY c.starts_at DESC LIMIT 1)                                         AS cycle_id,
  CASE WHEN b.meeting_hours ? lower(to_char(d.date, 'Dy')) AND NOT b.bookings_paused
       THEN b.max_meetings_per_day ELSE 0 END                                  AS capacity_slots,
  (SELECT count(*) FROM facts.fact_lead fl
    WHERE fl.broker_id = d.broker_id AND fl.created_date = d.date)             AS leads_routed,
  (SELECT count(*) FROM facts.fact_booking fb
    WHERE fb.broker_id = d.broker_id AND fb.booked_date = d.date
      AND NOT fb.is_reschedule)                                                AS bookings_made,
  (SELECT count(*) FROM facts.fact_booking fb
    WHERE fb.broker_id = d.broker_id AND fb.slot_date = d.date
      AND fb.status IN ('booked','confirmed','attended','no_show'))             AS meetings_scheduled,
  (SELECT count(*) FROM facts.fact_outcome fo
    WHERE fo.broker_id = d.broker_id AND fo.slot_date = d.date
      AND fo.outcome = 'attended')                                             AS meetings_held,
  (SELECT count(*) FROM facts.fact_booking fb
    WHERE fb.broker_id = d.broker_id AND fb.slot_date = d.date
      AND fb.status IN ('booked','confirmed') AND fb.ends_at < now()
      AND NOT EXISTS (SELECT 1 FROM public.outcomes o WHERE o.booking_id = fb.booking_id)) AS outcomes_unmarked,
  EXISTS (SELECT 1 FROM public.report_history r
           WHERE r.broker_id = d.broker_id AND r.brand_id IS NOT NULL
             AND d.date BETWEEN r.week AND r.week + 6
             AND (r.opened_portal_at IS NOT NULL OR r.opened_wa_at IS NOT NULL))  AS report_opened
FROM days d
JOIN public.brokers b ON b.id = d.broker_id
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- fact_cycle — committed, delivered, replacements, margin per cycle
-- -----------------------------------------------------------------------------
-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'facts' AND table_name = 'fact_cycle' AND column_name = 'renewed') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW facts.fact_cycle AS
SELECT
  c.id AS cycle_id, c.broker_id, c.brand_id, c.tier_code, c.cycle_no, c.status,
  c.starts_at, c.ends_at, c.extended_until,
  c.price_zar, c.committed_leads, c.replacement_cap, c.media_share_zar,
  x.delivered, x.leads_total, x.booked, x.attended, x.no_show, x.good_fit,
  (SELECT count(*) FROM public.replacements r WHERE r.cycle_id = c.id AND r.status <> 'rejected') AS replacements_used,
  greatest(c.committed_leads - x.delivered, 0)                                            AS shortfall_now,
  k.media_zar, k.whatsapp_zar, k.llm_zar, k.infra_zar, k.fees_zar, k.other_zar,
  (k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar)   AS cost_zar,
  c.price_zar - (k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar) AS margin_zar,
  round((c.price_zar - (k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar))
        / nullif(c.price_zar, 0), 4)                                                    AS margin_pct,
  c.policies_written_reported
FROM public.cycles c
CROSS JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE fl.verified AND fl.qualified AND NOT fl.is_replacement_lead) AS delivered,
    count(*)                                   AS leads_total,
    count(*) FILTER (WHERE fl.booked)          AS booked,
    count(*) FILTER (WHERE fl.attended)        AS attended,
    count(*) FILTER (WHERE fl.no_show)         AS no_show,
    count(*) FILTER (WHERE fl.good_fit)        AS good_fit
  FROM facts.fact_lead fl WHERE fl.cycle_id = c.id
) x
CROSS JOIN LATERAL (
  SELECT
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'media'), 0)    AS media_zar,
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'whatsapp'), 0) AS whatsapp_zar,
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'llm'), 0)      AS llm_zar,
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'infra'), 0)    AS infra_zar,
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'fees'), 0)     AS fees_zar,
    coalesce(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'other'), 0)    AS other_zar
  FROM facts.fact_cost fc
  WHERE fc.broker_id = c.broker_id
    AND fc.date >= facts.sa_date(c.starts_at)
    AND fc.date <  facts.sa_date(coalesce(c.extended_until, c.ends_at))
) k
    $smc_q$;
  END IF;
END $smc_v$;

-- -----------------------------------------------------------------------------
-- v_watchlist — 6A2 #3: the seven numbers, overall and per broker.
-- Window = last 28 SA days; value_prev = the 28 days before. Plain names and the
-- "what to look out for" sentence render as-is; /knowledge/metrics.md holds the
-- full dictionary entry (analytics-reporter) and must match metric_code.
-- Targets: #1 R900 (6A2 example), #2 85% (6A2 example), #3 65% (3.4/3.7),
-- #5 43% model with 30% floor (3.5), #6 5 working days (4.6 capacity alert).
-- #4 has no target in the prompt → NULL until the dictionary sets one (needs_human).
-- #7 renewal risk thresholds are ASSUMPTIONS from 3.4 / 4.12a / 4.10a — validate at cycle-1 close.
-- -----------------------------------------------------------------------------
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
      WHERE fo.outcome = 'attended' AND fo.disposition_code IS NOT NULL AND fo.slot_date BETWEEN w.d0 AND w.d1
        AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id))                     AS dispositioned,
    (SELECT count(*) FROM facts.fact_outcome fo
      WHERE fo.outcome = 'attended' AND fo.good_fit AND fo.slot_date BETWEEN w.d0 AND w.d1
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
         900::numeric AS target, NULL::numeric AS floor, 'ZAR' AS unit, prev.m1 AS value_prev, cur.n1 AS n,
         'What we pay in ads for one meeting the broker rated a good fit. If it rises for 7 days, check which angle''s good-fit rate dropped.' AS what_to_watch
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 2, 'leads_reached_pct', 'Leads we could actually reach', cur.broker_id, cur.m2, NULL, 0.85, NULL, 'ratio', prev.m2, cur.n2,
         'Share of leads who replied on WhatsApp within 72 hours. If it falls, check number validation and first-message timing.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 3, 'booked_to_attended_pct', 'Booked calls that happened', cur.broker_id, cur.m3, NULL, 0.65, 0.50, 'ratio', prev.m3, cur.n3,
         'Share of booked calls the lead attended. Below 50% for 14 days: review the reminder sequence and qualification.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 4, 'broker_good_fit_pct', 'Calls the broker rated a good fit', cur.broker_id, cur.m4, NULL, NULL, NULL, 'ratio', prev.m4, cur.n4,
         'Share of attended calls the broker marked good fit. If it drops, look at which angle or budget band the not-a-fit calls came from.'
    FROM m cur JOIN m prev ON prev.broker_id IS NOT DISTINCT FROM cur.broker_id AND prev.w = 'prev' WHERE cur.w = 'cur'
  UNION ALL
  SELECT 5, 'margin_this_cycle_pct', 'What we keep this cycle', s.broker_id,
         round(cy.margin_zar / nullif(cy.price_zar, 0), 4), NULL, 0.43, 0.30, 'ratio', NULL, NULL,
         'Price minus ads, WhatsApp, AI, hosting and fees, as a share of price. Below 30% means the kill rules apply before selling more.'
    FROM scopes s LEFT JOIN cyc cy ON cy.broker_id IS NOT DISTINCT FROM s.broker_id
  UNION ALL
  SELECT 6, 'days_capacity_left', 'Days before the broker''s diary is full', s.broker_id,
         CASE WHEN cp.bookings_per_day > 0 THEN round(cp.free_slots / cp.bookings_per_day, 1) END,
         NULL, 5, NULL, 'days', NULL, cp.free_slots::integer,
         'Free meeting slots ahead divided by bookings per day. Under 5 working days: offer an upgrade or add a broker.'
    FROM scopes s JOIN cap cp ON cp.broker_id IS NOT DISTINCT FROM s.broker_id
  UNION ALL
  SELECT 7, 'renewal_risk', 'Chance the broker does not renew', s.broker_id,
         r.score, CASE r.score WHEN 2 THEN 'red' WHEN 1 THEN 'amber' ELSE 'green' END,
         0, NULL, 'level', NULL, NULL,
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

-- Admin-only entry point for the console Today screen (facts is not exposed through the API).
CREATE OR REPLACE FUNCTION public.smc_watchlist(p_include_synthetic boolean DEFAULT false)
RETURNS SETOF facts.v_watchlist
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, facts
AS $$
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'smc_watchlist: admin only' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('smc.include_synthetic', CASE WHEN p_include_synthetic THEN 'on' ELSE 'off' END, true);
  RETURN QUERY SELECT * FROM facts.v_watchlist ORDER BY metric_no, broker_id NULLS FIRST;
END $$;
