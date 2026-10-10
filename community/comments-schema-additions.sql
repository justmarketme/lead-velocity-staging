-- SUPERSEDED. The community schema was applied by platform-architect in
-- supabase/migrations/20261002060000_smc_06_pass2.sql section 15 (comments queue columns + unique comment_id,
-- comment_ad_sentiment, dm_queue, dm_threads, escalations.assigned_agent + new kinds, ads view in section 14).
-- Do NOT apply anything from the earlier request: it altered `conversations`, which is a per-message VIEW.
-- W30 reads/writes: comments, comment_ad_sentiment, escalations (assigned_agent), ads (view).
-- W31 reads/writes: dm_threads (state, paused, opted_out, last_user_message_at, external_id), dm_queue, escalations.
-- Nothing else is required from this file.
select 1;
