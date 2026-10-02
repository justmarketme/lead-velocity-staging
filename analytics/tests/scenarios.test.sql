-- Branch coverage for kill-scale.sql / watchlist / W14 hold. Each block runs in a transaction and rolls back. Run after synthetic-seed.sql.
set facts.as_of = '2026-10-18';

\echo === S1: K4 pause (A3: 5 dispositions, 3 not-a-fit, low quality) and K5 scale (A1: 5 dispositions, quality >= 4, cheap)
begin;
insert into facts.fact_outcome (outcome_id,booking_id,lead_key,broker_id,cycle_id,ad_id,angle,marked_at,outcome,disposition_code,quality_score)
select 'X3'||g, null, null, 'B-MARK','C-MARK-2610','A3','family','2026-10-14 10:00+00','attended',(array['fit_proceeding','nofit_budget','nofit_covered','nofit_budget','fit_followup'])[g],(array[3,1,2,1,3])[g] from generate_series(1,5) g;
insert into facts.fact_outcome (outcome_id,booking_id,lead_key,broker_id,cycle_id,ad_id,angle,marked_at,outcome,disposition_code,quality_score)
select 'X1'||g, null, null, 'B-MARK','C-MARK-2610','A1','bond','2026-10-14 10:00+00','attended',(array['fit_proceeding','fit_proceeding','fit_followup','fit_proceeding','fit_proceeding'])[g],(array[4,5,4,5,4])[g] from generate_series(1,5) g;
select rule_id, scope_id, proposed_action, proposed_pct, evidence ->> 'quality_index' as qi, evidence ->> 'nofit_rate' as nofit from facts.v_kill_scale_candidates where rule_id in ('K4_PAUSE_LOW_QUALITY','K5_SCALE_PLUS_20') order by 1,2;
rollback;

\echo === S2: K3 show rate under 50% (8+ matured meetings), K6 trim at >= 80% booked, restore, upsell
begin;
update facts.fact_outcome set outcome = 'no_show' where outcome_id in ('O01','O03','O06');   -- 3 of 6 attended -> no-show: 3 of 10 attended = 30%
select rule_id, scope_id, evidence from facts.v_kill_scale_candidates where rule_id = 'K3_REVIEW_SHOW_RATE';
update facts.fact_broker_day set slots_booked_7d = 10 where day = '2026-10-18';           -- 10 of 12 = 83%
select rule_id, scope_id, proposed_action, proposed_pct from facts.v_kill_scale_candidates where rule_id like 'K6%';
select 'K5 blocked while trimmed' as note, count(*) as k5_rows from facts.v_kill_scale_candidates where rule_id = 'K5_SCALE_PLUS_20';
update facts.fact_broker_day set media_trimmed = true, slots_booked_7d = 6 where day = '2026-10-18';  -- 50% and trimmed -> restore
select rule_id, proposed_action from facts.v_kill_scale_candidates where rule_id like 'K6%';
update facts.fact_broker_day set slots_booked_7d = 12, media_trimmed = true where day between '2026-10-14' and '2026-10-18';  -- full five days
select rule_id from facts.v_kill_scale_candidates where rule_id like 'K6%';
rollback;

\echo === S3: K2 escalate (qualified cost over R400 after 14 days)
begin;
update facts.fact_lead set qualified = false where lead_key in ('L01','L03','L05','L07','L08');   -- fewer qualified leads in the window
select rule_id, scope_id, evidence from facts.v_kill_scale_candidates where rule_id = 'K2_ESCALATE_QUALIFIED_CPL';
rollback;

\echo === S4: below the spend gate nothing fires; Binet gate view says why
begin;
update facts.fact_ad_day set spend_zar = spend_zar / 4;
select count(*) as candidates_when_spend_is_a_quarter from facts.v_kill_scale_candidates where rule_id like 'K1%' or rule_id like 'K2%';
select campaign_id, gate, value, needed, open from facts.v_kill_scale_gates where gate = 'K1 spend gate';
rollback;

\echo === S5: renewal risk goes red (poor show rate, few marked, 6 to-dos, report unopened twice, low quality)
begin;
update facts.fact_outcome set auto_marked = true where outcome_id in ('O01','O02','O03','O04');
update facts.fact_outcome set quality_score = 2 where quality_score is not null;
update facts.fact_broker_day set todos_open = 6 where day = '2026-10-18';
update facts.fact_broker_day set report_sent_at = '2026-10-05 05:00+00', report_opened_at = null where day in ('2026-10-05','2026-10-12');
select broker_id, score, level, reasons from facts.renewal_risk_at('2026-10-18');
rollback;

\echo === S6: W14 broker report is HELD when a number does not tie to the console
select check_name, report_value, console_value, ok from facts.w14_reconcile('B-MARK', jsonb_set(facts.w14_broker_payload('B-MARK'), '{progress,delivered,value}', '16')) where not ok;
select 'contains spend word -> hold' as note, ok from facts.w14_reconcile('B-MARK', jsonb_set(facts.w14_broker_payload('B-MARK'), '{one_liner}', '"We spent R4,900 on ads this week"')) where check_name = 'no_cost_or_jargon_in_payload';
