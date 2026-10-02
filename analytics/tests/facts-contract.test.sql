-- TEST-ONLY stand-in for the `facts` schema (6A2 item 1).
-- In production platform-architect ships facts.* as pseudonymised VIEWS over the operational tables
-- (build/crm-gap.md A5). `create table if not exists` is a no-op when a view of the same name exists,
-- so this file never shadows the real layer. Column names below are THE CONTRACT analytics/*.sql reads.
-- ALIGN WHEN SCHEMA LANDS: platform-architect has not yet published facts DDL (no supabase/migrations/*smc*).
create schema if not exists facts;

create table if not exists facts.fact_lead (
  lead_key text primary key,            -- hash; never a name, number or email
  brand_id text, broker_id text, cycle_id text,
  created_at timestamptz not null,
  origin text,                          -- page / lead_ad / ctwa / comment / dm   (6.3)
  campaign_id text, adset_id text, ad_id text, concept text, angle text, placement text,
  consent_ok boolean,
  qualified boolean,                    -- meets 3.3 items 1,2,4,5 (age, budget, call, not duplicate)
  disqualified_reason text,
  first_contact_at timestamptz,         -- first WhatsApp template delivered (wa_delivered_at)
  first_message_seconds numeric,        -- submit -> first message delivered
  verified_at timestamptz,              -- replied/tapped within 72 h (3.3 item 3)
  replaced boolean default false,       -- W13 replaced this lead (counts toward cap, not toward committed)
  lead_pulse_thumbs smallint            -- W35: 1 = worth it, 0 = not; null = no answer
);
create table if not exists facts.fact_booking (
  booking_id text primary key, lead_key text, broker_id text, cycle_id text, ad_id text, angle text,
  booked_at timestamptz, slot_start timestamptz, status text, method text
);
create table if not exists facts.fact_outcome (
  outcome_id text primary key, booking_id text, lead_key text, broker_id text, cycle_id text, ad_id text, angle text,
  marked_at timestamptz, outcome text,            -- attended / no_show / rescheduled / broker_no_show
  disposition_code text,                          -- fit_proceeding fit_followup nofit_budget nofit_covered nofit_criteria unreachable (4.12a)
  quality_score smallint, auto_marked boolean default false, unconfirmed boolean default false,
  lead_reach_check text                           -- yes / no / none (W12 T+30)
);
create table if not exists facts.fact_ad_day (
  day date, brand_id text, campaign_id text, ad_id text, ad_name text, concept text, angle text, placement text,
  status text, spend_zar numeric, impressions int, clicks int, leads_raw int, emq numeric, frequency numeric, hook_rate numeric,
  primary key (day, ad_id)
);
create table if not exists facts.fact_broker_day (
  day date, broker_id text, cycle_id text,
  slots_total_7d int,          -- bookable slots in the next 7 days (hours x caps)
  slots_booked_7d int,         -- of those, already booked
  slots_open_14d int,          -- bookable and still free in the next 14 days
  todos_open int,              -- outcomes unmarked + follow-ups due
  media_trimmed boolean default false,
  report_sent_at timestamptz, report_opened_at timestamptz,
  primary key (day, broker_id)
);
create table if not exists facts.fact_cycle (
  cycle_id text primary key, broker_id text, brand_id text, tier_code text, tier_name text,
  price_zar numeric, committed_leads int, replacement_cap int,
  starts_at date, ends_at date, extended_until date, status text, shortfall_credit_zar numeric default 0
);
create table if not exists facts.fact_cost (
  day date, brand_id text, broker_id text, cycle_id text, ad_id text,
  kind text,                   -- media / whatsapp / llm / infra / fees
  amount_zar numeric           -- media is ex-VAT (VAT added by v_params.vat_media until registered, 3.1)
);
create table if not exists facts.fact_message (
  msg_key text primary key, lead_key text, created_at timestamptz, channel text, direction text, author text,
  template_name text, llm_model text, latency_ms int, guardrail_trip boolean, cost_zar numeric
);
create table if not exists facts.fact_comment (
  comment_id text primary key, ad_id text, created_at timestamptz, sla_seconds int, origin_lead_key text
);
create table if not exists facts.fact_system_day (day date primary key, uptime_pct numeric, webhook_p95_ms numeric, webhook_count int);
create table if not exists facts.fact_lead_theme (lead_key text, broker_id text, cycle_id text, theme text, created_at timestamptz);
-- Broker-entered ROI inputs. Deliberately OUTSIDE the shared layer and outside Ask-the-data (FAIS: never in any fee or ranking, 3.7).
create table if not exists facts.fact_broker_roi (cycle_id text primary key, broker_id text, close_rate numeric, policies_written_reported int);
