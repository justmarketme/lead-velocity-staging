-- optimisation/sql-additions.sql
-- PROPOSED additive migration for platform-architect (NOT applied, NOT tested: no database in this session).
-- Why: W32/W33 (automation/W32.json, W33.json) were written against 4.15/6.8b; supabase/migrations/20261002_smc_03_ops_reporting.sql
-- has the core ops.* tables but lacks columns the advisor needs. Nothing here drops or renames anything.
-- Also needed (bodies owed by platform-architect; signatures and meaning in optimisation/data-contract.md):
--   facts.pulse_daily, ops.judge_samples(date), ops.proposal_actuals(date), ops.notifications_due(), ops.alert_recipients, ops.build_state_latest.

CREATE TABLE IF NOT EXISTS ops.settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ops.settings (key, value) VALUES ('usd_zar','18'), ('opt_daily_cap_zar','15'), ('opt_weekly_cap_zar','40'), ('build_active','true') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.judge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), date date NOT NULL, rubric text NOT NULL,
  sampled int, passed int, failed int, critical int, status text, created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE ops.pulses        ADD COLUMN IF NOT EXISTS quiet boolean, ADD COLUMN IF NOT EXISTS card_markdown text, ADD COLUMN IF NOT EXISTS whatsapp_text text;

ALTER TABLE ops.proposals     ADD COLUMN IF NOT EXISTS pulse_date date, ADD COLUMN IF NOT EXISTS mechanism text, ADD COLUMN IF NOT EXISTS kill_rule text,
  ADD COLUMN IF NOT EXISTS ice jsonb, ADD COLUMN IF NOT EXISTS evidence text, ADD COLUMN IF NOT EXISTS verdict text, ADD COLUMN IF NOT EXISTS kill_rule_hit boolean,
  ADD COLUMN IF NOT EXISTS grade_note text, ADD COLUMN IF NOT EXISTS graded_at timestamptz, ADD COLUMN IF NOT EXISTS decided_by_label text;
-- decided_by stays the auth.users FK for console taps; WhatsApp taps are recorded in decided_by_label (phone-derived name).
ALTER TABLE ops.proposals ADD CONSTRAINT ops_proposals_verdict_chk CHECK (verdict IS NULL OR verdict IN ('beat_forecast','within_range','missed'));

ALTER TABLE ops.signals       ADD COLUMN IF NOT EXISTS signal_key text, ADD COLUMN IF NOT EXISTS rule text, ADD COLUMN IF NOT EXISTS side text, ADD COLUMN IF NOT EXISTS burning boolean;
CREATE UNIQUE INDEX IF NOT EXISTS ops_signals_key_uidx ON ops.signals (signal_key) WHERE signal_key IS NOT NULL;

ALTER TABLE ops.notifications ADD COLUMN IF NOT EXISTS payload jsonb, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES ops.proposals(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS called_at timestamptz, ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
ALTER TABLE ops.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE ops.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN
  ('daily_pulse','approval','red','weekly_memo','monthly_retro','build_gate','escalation_call',
   'pulse','action','action_reminder','confirm','red_email','red_resend','banner','pulse_red_email','weekly','weekly_email','monthly_email'));

ALTER TABLE ops.optimisation_memos ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE ops.quality_grades ADD COLUMN IF NOT EXISTS exact_text text, ADD COLUMN IF NOT EXISTS owner_agent text;
ALTER TABLE ops.quality_grades DROP CONSTRAINT IF EXISTS quality_grades_severity_check;
ALTER TABLE ops.quality_grades ADD CONSTRAINT quality_grades_severity_check CHECK (severity IN ('info','minor','major','critical','high','medium','low'));
-- The judge rubric severities are critical/high/medium/low (rubrics/README.md); the table's info/minor/major are kept for other writers.
-- Admin-only RLS for the new table/columns follows the smc_05_rls.sql pattern; the advisor role gets write on its own tables only (4.15).
