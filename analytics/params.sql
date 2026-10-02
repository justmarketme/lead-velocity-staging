-- analytics/params.sql — one place for every threshold the analytics layer uses (3.6 spirit: nothing hard-coded twice).
-- Each value cites its source in the comment. ASSUMPTION = not given in the prompt; measured in production, listed in SUMMARY needs_human.
create schema if not exists facts;

-- "Today" for every view. Tests: set facts.as_of = '2026-10-18';  Production: unset -> current_date (Africa/Johannesburg).
create or replace function facts.as_of() returns date language sql stable as $$
  select coalesce(nullif(current_setting('facts.as_of', true), ''), (now() at time zone 'Africa/Johannesburg')::date::text)::date
$$;

drop view if exists facts.v_params cascade;
create view facts.v_params as
select
  facts.as_of()      as as_of,
  14                 as verdict_days,          -- 3.4 / Binet & Field: 14-day window before any verdict
  3                  as verify_lag_days,       -- 3.3: a lead verifies within 72 h, so qualified numbers are read on leads >= 3 days old
  3000               as spend_gate_zar,        -- 3.4
  250                as raw_cpl_max_zar,       -- 3.4 (stress CPL, 3.5)
  0.60               as qualify_min,           -- 3.4
  400                as qualified_cpl_max_zar, -- 3.4
  0.60               as booking_target,        -- 3.4 booking >= 60% of verified
  0.65               as show_target,           -- 3.4 / 3.7
  0.50               as show_floor,            -- 3.4
  2.5                as quality_floor,         -- 3.4 / 4.12a
  0.40               as nofit_max,             -- 3.4 / 4.12a
  5                  as min_dispositions,      -- 3.4 "n >= 5"
  4.0                as quality_scale_min,     -- 3.4
  0.20               as scale_step,            -- 3.4 (+20% budget)
  0.80               as capacity_trim_at,      -- line 758: next 7 days >= 80% booked
  0.60               as capacity_restore_at,   -- line 758
  0.30               as trim_share,            -- line 758
  5                  as capacity_floor_days,   -- line 758: full for 5 working days -> alert; ASSUMPTION reused as the days-left floor
  0.30               as margin_floor,          -- 3.5 guardrail
  250                as stress_cpl_zar,        -- 3.5
  0.15               as vat_media,             -- 3.1 (set to 0 once VAT-registered)
  1300               as cost_per_good_fit_max_zar, -- target (default pending NH-25): R1,300; the model implies R1,100-R1,600 at full-cycle volume
  900                as cost_per_good_fit_stretch_zar, -- stretch (6A2 item 2 example), shown as the second line on the tile
  0.60               as good_fit_target,       -- target (default pending NH-25): 60% = the mirror of the 40% not-a-fit pause line (3.4)
  0.85               as reach_target,          -- 6A2 item 2 example
  0.90               as disposition_target,    -- 6.8 broker faculty: disposition >= 90%
  60                 as first_message_sla_s,   -- 6.3
  4                  as stress_overhead_per_raw_zar, -- 3.5: R4 per raw lead WhatsApp + LLM in the stress model; actuals come from fact_cost
  20                 as min_n_ask,             -- 6A2 item 4
  8                  as min_booked_for_show_rule, -- ASSUMPTION: fewer than 8 matured bookings is noise (Binet)
  300                as min_ad_spend_zar       -- ASSUMPTION: an ad needs R300 spend before it can be ranked
;

-- Disposition spelling: 4.12a names win (integration-pass2 I-01; smc_02 enum = fit_proceeding ... unreachable). The legacy good_fit_* / not_fit_* spellings are still accepted.
create or replace function facts.disp_class(code text) returns text language sql immutable as $$
  select case
    when code in ('fit_proceeding','fit_followup','good_fit_proceeding','good_fit_follow_up','good_fit_followup') then 'fit'
    when code in ('nofit_budget','nofit_covered','nofit_criteria','not_fit_budget','not_fit_covered','not_fit_criteria') then 'nofit'
    when code = 'unreachable' then 'unreachable'
    else null end
$$;

-- Same helper for the real enum type (smc_02: public.smc_disposition_code); functions do not cast enum -> text implicitly.
create or replace function facts.disp_class(code public.smc_disposition_code) returns text language sql immutable as $$
  select facts.disp_class(code::text)
$$;

-- Traffic light: green = meets target; amber = within 20% worse than target; red = beyond (or beyond an explicit red_at).
create or replace function facts.tile_status(v numeric, target numeric, higher_is_better boolean, red_at numeric default null)
returns text language sql immutable as $$
  select case
    when v is null then 'grey'
    when higher_is_better and v >= target then 'green'
    when not higher_is_better and v <= target then 'green'
    when red_at is not null and ((higher_is_better and v < red_at) or (not higher_is_better and v > red_at)) then 'red'
    when red_at is not null then 'amber'
    when higher_is_better and v >= target*0.8 then 'amber'
    when not higher_is_better and v <= target*1.2 then 'amber'
    else 'red' end
$$;
