-- =============================================================================
-- 20261002_smc_06_pass2.sql  —  SortMyCover build, migration 6: integration pass 2
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–05).
-- Implements build/integration-pass2.md I-04 and I-14 (I-13 is a dashboard/config step,
-- documented in deliverables/platform-architect/security-runbook.md §E):
--   billing (NH-BA-05), broker-success (portal/spec/README.md), intro-media (measurement.md),
--   ads-api (CONSOLE-ADS-API.md), community (comments-schema-additions.sql),
--   W22 (automation/W22.md §4), W24 (compliance-qa), analytics (facts additions),
--   optimisation (sql-additions.sql + data-contract.md bodies).
-- Rules kept from 01–05: additive (no DROP TABLE/COLUMN/VIEW/FUNCTION/SCHEMA), IF NOT EXISTS
-- everywhere, safe to run twice. Views are only ever extended by APPENDING columns.
-- Read-only alias columns (GENERATED) give the 4.6 prompt names that other agents'
-- workflow SQL reads (brokers.broker_id / adviser_name / practice_name / adviser_whatsapp,
-- brands.brand_id / status, cycles.cycle_id). Writes always use the physical names.
-- Disposition codes stay as 4.12a (I-01): fit_proceeding, fit_followup, nofit_budget,
-- nofit_covered, nofit_criteria, unreachable. No change to smc_disposition_code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. brokers — broker-success onboarding columns, billing columns, 4.6 aliases
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.brokers_billing_ref_seq START 1 MINVALUE 1 MAXVALUE 999999;

ALTER TABLE public.brokers
  -- portal/spec/README.md "New columns this spec needs on brokers" (NH-BS-03)
  ADD COLUMN IF NOT EXISTS first_login_at              timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at                timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_last_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_nudges           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preflight_card              jsonb,
  ADD COLUMN IF NOT EXISTS preflight_run_id            text,
  ADD COLUMN IF NOT EXISTS practice_legal_name         text,
  ADD COLUMN IF NOT EXISTS signatory_name              text,
  ADD COLUMN IF NOT EXISTS signatory_role              text,
  ADD COLUMN IF NOT EXISTS fb_page_name                text,
  ADD COLUMN IF NOT EXISTS fb_page_id                  text,
  ADD COLUMN IF NOT EXISTS calendar_mode               text,
  ADD COLUMN IF NOT EXISTS calendar_status             text,
  ADD COLUMN IF NOT EXISTS calendar_connected_at       timestamptz,
  ADD COLUMN IF NOT EXISTS next_free_slot_at           timestamptz,
  -- billing-automation NH-BA-05 / NH-26: short numeric bank-reference number + card auto-renew tokens (Vault names only)
  ADD COLUMN IF NOT EXISTS billing_ref                       integer,
  ADD COLUMN IF NOT EXISTS next_tier_code                    text REFERENCES public.pricing(tier_code),
  ADD COLUMN IF NOT EXISTS paystack_subscription_code        text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_token_ref   text,
  ADD COLUMN IF NOT EXISTS paystack_authorization_ref        text;

-- 4.6 prompt-name aliases (read-only). W20/W21/W27 SQL reads these names.
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS broker_id        uuid GENERATED ALWAYS AS (id) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS adviser_name     text GENERATED ALWAYS AS (contact_person) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS practice_name    text GENERATED ALWAYS AS (firm_name) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS adviser_whatsapp text GENERATED ALWAYS AS (whatsapp_number) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_pass2_checks') THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_pass2_checks CHECK (
          (calendar_mode   IS NULL OR calendar_mode   IN ('oauth','shared_fallback'))
      AND (calendar_status IS NULL OR calendar_status IN ('ok','needs_reconnect','blocked_admin_consent'))
      AND (billing_ref     IS NULL OR billing_ref BETWEEN 1 AND 999999)
      AND coalesce(paystack_subscription_token_ref, '') !~ '^(sk_|pk_|AUTH_)'   -- Vault secret NAMES only
      AND coalesce(paystack_authorization_ref, '')      !~ '^(sk_|pk_|AUTH_)');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS brokers_billing_ref_uidx ON public.brokers (billing_ref) WHERE billing_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS brokers_paystack_customer_idx ON public.brokers (paystack_customer_code) WHERE paystack_customer_code IS NOT NULL;

-- Status list: + invited / prospect (NH-27 c: row created at invoice issue) + not_renewed (W19, no grace)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_status_check'
                  AND pg_get_constraintdef(oid) LIKE '%not_renewed%') THEN
    ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_status_check;
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_status_check CHECK (
      status IS NULL OR status IN ('Active','Inactive',
                                   'invited','prospect','onboarding','onboarded','ready_for_go_live',
                                   'active','paused','not_renewed','ended'));
  END IF;
END $$;

-- billing_ref is assigned once, to SortMyCover rows only (legacy B2B rows never consume a number)
CREATE OR REPLACE FUNCTION public.smc_brokers_billing_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL AND NEW.billing_ref IS NULL THEN
    NEW.billing_ref := nextval('public.brokers_billing_ref_seq');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_billing_ref ON public.brokers;
CREATE TRIGGER smc_brokers_billing_ref BEFORE INSERT OR UPDATE OF brand_id ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_billing_ref();
-- backfill existing SMC brokers (no-op on a second run)
UPDATE public.brokers SET billing_ref = nextval('public.brokers_billing_ref_seq')
 WHERE brand_id IS NOT NULL AND billing_ref IS NULL;

COMMENT ON COLUMN public.brokers.billing_ref IS 'SMC NH-26: short broker number in the bank reference LV-{billing_ref:0000}-{pricing.ref_code}-{YYYYMM}. Assigned by trigger to SMC rows only.';
COMMENT ON COLUMN public.brokers.broker_id IS 'SMC 4.6 alias of id (read-only, generated). Write id.';
COMMENT ON COLUMN public.brokers.adviser_name IS 'SMC 4.6 alias of contact_person (read-only, generated). Write contact_person.';
COMMENT ON COLUMN public.brokers.practice_name IS 'SMC 4.6 alias of firm_name (read-only, generated). Write firm_name.';
COMMENT ON COLUMN public.brokers.adviser_whatsapp IS 'SMC 4.6 alias of whatsapp_number (read-only, generated). Write whatsapp_number.';
COMMENT ON COLUMN public.brokers.onboarding_nudges IS 'SMC W20: {since, 24h, 72h, suppress_until, sla_48h_missed_at}. System-written.';

-- Audit (02) must not copy the new alias/person columns into audit_log: same function, longer PII list.
CREATE OR REPLACE FUNCTION public.smc_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- column names whose VALUES never enter the audit log (2.1.7, pre-mortem #10)
  pii constant text[] := ARRAY[
    'first_name','last_name','phone','phone_number','email','mobile','call_number','alt_number',
    'whatsapp_number','contact_person','address','firm_address','client_ip','client_user_agent',
    'content','recipient_contact','subject','transcript','summary','voice_note_url','text_redacted',
    'line','notes','conv_state','reference_raw','signer_ip','signed_user_agent','requester',
    'requester_contact','google_calendar_token','calendar_email','author_hash','note',
    -- pass 2: generated aliases of PII columns + new person/contact fields
    'adviser_name','adviser_whatsapp','signatory_name','reply_text','external_id','mobile_hash','page_text'];
  o jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  n jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  r jsonb := coalesce(n, o);
  d jsonb := '{}'::jsonb;
  k text;
  v_role text;
BEGIN
  -- brand-scoped mode for shared legacy tables: only SortMyCover rows are audited
  IF TG_NARGS > 0 AND TG_ARGV[0] = 'brand_scoped'
     AND coalesce(n->>'brand_id', o->>'brand_id') IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at') AND (n->k) IS DISTINCT FROM (o->k) THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii)
                                             THEN jsonb_build_object('changed', true)
                                             ELSE jsonb_build_object('old', o->k, 'new', n->k) END);
      END IF;
    END LOOP;
    IF d = '{}'::jsonb THEN
      RETURN NULL;   -- no-op update
    END IF;
  ELSE
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF (r->k) IS NOT NULL AND (r->k) <> 'null'::jsonb THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii) THEN to_jsonb('[redacted]'::text) ELSE r->k END);
      END IF;
    END LOOP;
  END IF;

  v_role := CASE
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)  THEN 'admin'
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'broker'::public.app_role) THEN 'broker'
              WHEN coalesce(current_setting('role', true), 'none') NOT IN ('none', '') THEN current_setting('role', true)
              ELSE session_user::text
            END;

  INSERT INTO public.audit_log (actor_uid, actor_role, source, table_name, row_id, action, diff, reason)
  VALUES (auth.uid(), v_role,
          nullif(current_setting('smc.source', true), ''),
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          coalesce(r->>'id', r->>'tier_code', r->>'code'),
          TG_OP, d,
          nullif(current_setting('smc.reason', true), ''));
  RETURN NULL;
END $$;

-- Field-level security (Salesforce): extend the broker guard to the new system-owned fields.
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.brand_id IS NULL OR auth.uid() IS NULL OR public.smc_is_admin()
     OR current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;   -- legacy rows, n8n/service connections, admins, and the SECURITY DEFINER portal RPCs below
                  -- (they run as the function owner, so current_user is not 'authenticated') are not restricted here
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

-- leads.qualified: boolean alias of qualified_at (W21 funnel join reads it; read-only, generated)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS qualified boolean GENERATED ALWAYS AS (qualified_at IS NOT NULL) STORED;

-- -----------------------------------------------------------------------------
-- 2. pricing — tier token for references (B/S/G) + NOTIFY for W25
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing ADD COLUMN IF NOT EXISTS ref_code text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_ref_code_check') THEN
    ALTER TABLE public.pricing ADD CONSTRAINT pricing_ref_code_check CHECK (ref_code IS NULL OR ref_code ~ '^[A-Z]{1,3}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_ref_code_uidx ON public.pricing (brand_id, ref_code) WHERE ref_code IS NOT NULL;
UPDATE public.pricing SET ref_code = 'B' WHERE tier_code = 'SMC_BRONZE' AND ref_code IS NULL;
UPDATE public.pricing SET ref_code = 'S' WHERE tier_code = 'SMC_SILVER' AND ref_code IS NULL;
UPDATE public.pricing SET ref_code = 'G' WHERE tier_code = 'SMC_GOLD'   AND ref_code IS NULL;

CREATE OR REPLACE FUNCTION public.smc_pricing_notify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('pricing_changed', coalesce(NEW.tier_code, OLD.tier_code));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS smc_pricing_notify ON public.pricing;
CREATE TRIGGER smc_pricing_notify AFTER INSERT OR UPDATE OR DELETE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.smc_pricing_notify();

-- -----------------------------------------------------------------------------
-- 3. cycles — invoice link, cycle_id alias, dates open until routing starts, auto-fill
-- -----------------------------------------------------------------------------
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices_smc(id);
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS cycle_id uuid GENERATED ALWAYS AS (id) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS cycles_invoice_uidx ON public.cycles (invoice_id);   -- W16: ON CONFLICT (invoice_id); NULLs never conflict
-- First cycle: starts_at/ends_at stay NULL until routing goes on (W16 "First cycle: null until routing goes on", NH-CD-14).
ALTER TABLE public.cycles ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE public.cycles ALTER COLUMN ends_at   DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycles_dates_together') THEN
    ALTER TABLE public.cycles ADD CONSTRAINT cycles_dates_together
      CHECK ((starts_at IS NULL) = (ends_at IS NULL) AND (status = 'scheduled' OR starts_at IS NOT NULL));
  END IF;
END $$;

-- W16 inserts (broker_id, tier_code, price_zar, committed_leads, replacement_cap, status, invoice_id, starts_at, ends_at):
-- brand, cycle number and the media share are filled here from the broker / pricing row (one source of truth, 3.6).
CREATE OR REPLACE FUNCTION public.smc_cycles_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p public.pricing%ROWTYPE;
BEGIN
  IF NEW.brand_id IS NULL THEN
    SELECT b.brand_id INTO NEW.brand_id FROM public.brokers b WHERE b.id = NEW.broker_id;
  END IF;
  IF NEW.cycle_no IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('smc_cycle_no:' || NEW.broker_id::text));
    SELECT coalesce(max(c.cycle_no), 0) + 1 INTO NEW.cycle_no FROM public.cycles c WHERE c.broker_id = NEW.broker_id;
  END IF;
  IF NEW.price_zar IS NULL OR NEW.committed_leads IS NULL OR NEW.replacement_cap IS NULL OR NEW.media_share_zar IS NULL THEN
    SELECT * INTO p FROM public.pricing WHERE tier_code = NEW.tier_code;
    NEW.price_zar       := coalesce(NEW.price_zar, p.price_zar);
    NEW.committed_leads := coalesce(NEW.committed_leads, p.committed_leads);
    NEW.replacement_cap := coalesce(NEW.replacement_cap, p.replacement_cap_cycle);
    NEW.media_share_zar := coalesce(NEW.media_share_zar, p.media_share_zar);
  END IF;
  IF NEW.previous_cycle_id IS NULL THEN
    SELECT c.id INTO NEW.previous_cycle_id FROM public.cycles c
     WHERE c.broker_id = NEW.broker_id AND c.id <> NEW.id ORDER BY c.cycle_no DESC LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_cycles_fill ON public.cycles;
CREATE TRIGGER smc_cycles_fill BEFORE INSERT ON public.cycles
  FOR EACH ROW EXECUTE FUNCTION public.smc_cycles_fill();
COMMENT ON COLUMN public.cycles.cycle_id IS 'SMC 4.6 alias of id (read-only, generated). Billing SQL reads it.';
COMMENT ON COLUMN public.cycles.invoice_id IS 'SMC W16: the paid invoice that created this cycle (one cycle per invoice).';

-- -----------------------------------------------------------------------------
-- 4. invoices_smc — card retries, total written by billing, defaults filled by trigger
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices_smc
  ADD COLUMN IF NOT EXISTS charge_attempts       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_charge_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_charge_error     text;
-- billing-automation writes total_zar explicitly (W16 re-issue, W19 renewal). Keep the column and the
-- rule (total = amount excl VAT + VAT) but enforce it in a trigger instead of a generated expression.
ALTER TABLE public.invoices_smc ALTER COLUMN total_zar DROP EXPRESSION IF EXISTS;
CREATE SEQUENCE IF NOT EXISTS public.invoices_smc_no_seq START 1;

CREATE OR REPLACE FUNCTION public.smc_invoices_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  IF NEW.brand_id IS NULL THEN
    SELECT b.brand_id INTO NEW.brand_id FROM public.brokers b WHERE b.id = NEW.broker_id;
  END IF;
  IF NEW.invoice_no IS NULL THEN
    NEW.invoice_no := 'SMC-' || to_char(now() AT TIME ZONE 'Africa/Johannesburg', 'YYYY') || '-'
                      || lpad(nextval('public.invoices_smc_no_seq')::text, 5, '0');
  END IF;
  v_total := NEW.amount_excl_vat + coalesce(NEW.vat_zar, 0);
  IF NEW.total_zar IS NOT NULL AND abs(NEW.total_zar - v_total) > 0.005 THEN
    RAISE EXCEPTION 'invoices_smc: total_zar % <> amount_excl_vat + vat_zar %', NEW.total_zar, v_total USING ERRCODE = '23514';
  END IF;
  NEW.total_zar := v_total;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_invoices_fill ON public.invoices_smc;
CREATE TRIGGER smc_invoices_fill BEFORE INSERT OR UPDATE OF amount_excl_vat, vat_zar, total_zar ON public.invoices_smc
  FOR EACH ROW EXECUTE FUNCTION public.smc_invoices_fill();
-- A fully credited invoice has amount 0 (invoice.js: status 'credited' when total = 0).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_smc_amount_chk') THEN
    ALTER TABLE public.invoices_smc DROP CONSTRAINT IF EXISTS invoices_smc_check1;
    ALTER TABLE public.invoices_smc ADD CONSTRAINT invoices_smc_amount_chk
      CHECK (kind = 'credit_note' OR amount_excl_vat > 0 OR (amount_excl_vat = 0 AND status IN ('credited','void','draft')));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS invoices_smc_open_idx ON public.invoices_smc (broker_id, issued_at DESC) WHERE status = 'issued';

-- -----------------------------------------------------------------------------
-- 5. bank_credits — reconciliation queue fields (W16/W17/W18)
-- -----------------------------------------------------------------------------
ALTER TABLE public.bank_credits
  ADD COLUMN IF NOT EXISTS external_id            text,
  ADD COLUMN IF NOT EXISTS duplicate_of           uuid REFERENCES public.bank_credits(id),
  ADD COLUMN IF NOT EXISTS queue_reason           text,
  ADD COLUMN IF NOT EXISTS queue_suggestions      jsonb,
  ADD COLUMN IF NOT EXISTS statement_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS statement_external_id  text;
CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_external_uidx ON public.bank_credits (external_id);
-- ON CONFLICT (col) cannot use a PARTIAL unique index (02 created those with WHERE col IS NOT NULL).
-- Non-partial twins: NULLs stay distinct, so the rule is identical and the workflows' ON CONFLICT targets resolve.
CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_graph_msg_full_uidx  ON public.bank_credits (graph_message_id);     -- W17
CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_stmt_line_full_uidx  ON public.bank_credits (statement_line_hash);  -- W18
CREATE UNIQUE INDEX IF NOT EXISTS lead_activities_idem_full_uidx    ON public.lead_activities (idempotency_key);   -- W20, smc_portal_event
CREATE UNIQUE INDEX IF NOT EXISTS appointments_idem_full_uidx       ON public.appointments (idempotency_key);      -- W05
CREATE UNIQUE INDEX IF NOT EXISTS appointments_graph_event_full_uidx ON public.appointments (graph_event_id);      -- W05/W06
CREATE UNIQUE INDEX IF NOT EXISTS leads_leadgen_full_uidx           ON public.leads (leadgen_id);                  -- W02 idempotency (ads-api ask)
CREATE INDEX IF NOT EXISTS bank_credits_unmatched_idx ON public.bank_credits (received_at) WHERE match_status = 'unmatched';

-- -----------------------------------------------------------------------------
-- 6. ops.billing_reports / ops.billing_actions_log (W18 daily report, W19 idempotency)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.billing_reports (
  day        date PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('green','amber','red')),
  report     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ops.billing_actions_log (
  cycle_id   uuid NOT NULL REFERENCES public.cycles(id),
  action     text NOT NULL CHECK (action IN ('offer_t7','remind_t3','remind_t1','cycle_end','retry_card','come_back')),
  day        date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, action, day)
);

-- -----------------------------------------------------------------------------
-- 7. appointments → bookings: intro-media test arms (deliverables/intro-media/measurement.md)
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS intro_arm       text,
  ADD COLUMN IF NOT EXISTS intro_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS intro_read_at   timestamptz,
  ADD COLUMN IF NOT EXISTS intro_played_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_booking    boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_intro_arm_check') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_intro_arm_check
      CHECK (intro_arm IS NULL OR intro_arm IN ('video','voice','none','not_randomised'));
  END IF;
END $$;

CREATE OR REPLACE VIEW public.bookings WITH (security_invoker = true) AS
SELECT a.id, a.brand_id, a.broker_id, a.client_id AS lead_id, a.cycle_id,
       a.appointment_date AS starts_at, a.ends_at, a.method, a.status, a.calendar_provider,
       a.graph_event_id, a.graph_calendar_id, a.ical_uid, a.join_url, a.ics_url, a.call_number,
       a.invite_email_status, a.booked_via AS source, a.booked_at, a.schedule_event_id,
       a.confirmed_at, a.cancelled_at, a.reschedule_count, a.previous_booking_id,
       a.created_at, a.updated_at,
       -- pass 2 (appended)
       a.intro_arm, a.intro_sent_at, a.intro_read_at, a.intro_played_at, a.late_booking
FROM public.appointments a
WHERE a.brand_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. broker_media — state for the portal (processing → ready/rejected → approved/superseded)
--    W23 writes the state into ai_check; the column derives from it (one source of truth).
-- -----------------------------------------------------------------------------
ALTER TABLE public.broker_media ALTER COLUMN url DROP NOT NULL;   -- a take exists before its file is ready (W23 'processing')
ALTER TABLE public.broker_media ADD COLUMN IF NOT EXISTS state text GENERATED ALWAYS AS (
  CASE
    WHEN approved_at IS NOT NULL AND is_current THEN 'approved'
    WHEN approved_at IS NOT NULL               THEN 'superseded'
    WHEN ai_check->>'state' IN ('processing','ready','rejected') THEN ai_check->>'state'
    WHEN url IS NULL                           THEN 'processing'
    ELSE 'ready' END) STORED;
COMMENT ON COLUMN public.broker_media.state IS 'SMC 4.10b: processing | ready | rejected | approved | superseded (generated from ai_check.state + approval).';

-- -----------------------------------------------------------------------------
-- 9. report_history → reports: edition (I-02)
-- -----------------------------------------------------------------------------
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS edition text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_history_edition_check') THEN
    ALTER TABLE public.report_history ADD CONSTRAINT report_history_edition_check
      CHECK (edition IS NULL OR edition IN ('weekly','midcycle','cycle_end'));
  END IF;
END $$;
CREATE OR REPLACE VIEW public.reports WITH (security_invoker = true) AS
SELECT r.id, r.brand_id, r.broker_id, r.cycle_id, r.week, r.report_kind,
       r.report_data AS payload_json, r.pdf_url, r.sent_wa_at, r.sent_email_at,
       r.opened_portal_at, r.opened_wa_at, r.ask, r.ask_done_at, r.judge_passed,
       r.status, r.created_at,
       r.edition                                   -- pass 2 (appended)
FROM public.report_history r
WHERE r.brand_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 10. support_events (portal/spec/09-help.md) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid REFERENCES public.brands(id),
  broker_id   uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('portal','whatsapp','email')),
  topic       text NOT NULL,                 -- the page the broker was on (start, profile, calendar, …)
  note        text,                          -- broker's words, if any (no lead PII: portal rule 6)
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_events_open_idx ON public.support_events (created_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS support_events_topic_idx ON public.support_events (topic, created_at);

-- -----------------------------------------------------------------------------
-- 11. brands — W21/W27 fields + read-only aliases
-- -----------------------------------------------------------------------------
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS insights_last_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_alerts            jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS brand_id uuid GENERATED ALWAYS AS (id) STORED;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS status text GENERATED ALWAYS AS (CASE WHEN is_active THEN 'active' ELSE 'held' END) STORED;
COMMENT ON COLUMN public.brands.brand_id IS 'SMC 4.6 alias of id (read-only, generated).';
COMMENT ON COLUMN public.brands.status IS 'SMC alias: active | held, from is_active (read-only, generated). Write is_active.';

-- -----------------------------------------------------------------------------
-- 12. message_templates — W27 sync fields (status itself is meta_status / meta_category)
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS status_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason  text;

-- -----------------------------------------------------------------------------
-- 13. ops.notifications — one table for W22 alerts, W32 pulse/approvals, ads audit rows
--     (columns from automation/W22.md §4 + optimisation/sql-additions.sql + ads-api `body`)
-- -----------------------------------------------------------------------------
ALTER TABLE ops.notifications
  ADD COLUMN IF NOT EXISTS "to"             text,
  ADD COLUMN IF NOT EXISTS body             jsonb,
  ADD COLUMN IF NOT EXISTS payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signal_key       text,
  ADD COLUMN IF NOT EXISTS scope            text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS severity         text,
  ADD COLUMN IF NOT EXISTS always_send      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status           text,
  ADD COLUMN IF NOT EXISTS source           text,
  ADD COLUMN IF NOT EXISTS what             text,
  ADD COLUMN IF NOT EXISTS impact           text,
  ADD COLUMN IF NOT EXISTS first_action     text,
  ADD COLUMN IF NOT EXISTS since_label      text,
  ADD COLUMN IF NOT EXISTS primary_partner  text NOT NULL DEFAULT 'jonathan',
  ADD COLUMN IF NOT EXISTS channel_log      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS acked_by         text,
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz,
  ADD COLUMN IF NOT EXISTS seen_count       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS external_id      text,
  ADD COLUMN IF NOT EXISTS error            text,
  ADD COLUMN IF NOT EXISTS proposal_id      uuid REFERENCES ops.proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS called_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at      timestamptz;
ALTER TABLE ops.notifications ALTER COLUMN channel SET DEFAULT 'console';   -- delivery per channel is in channel_log
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_pass2_checks') THEN
    ALTER TABLE ops.notifications ADD CONSTRAINT notifications_pass2_checks CHECK (
          (severity IS NULL OR severity IN ('red','amber','green','info'))
      AND (status   IS NULL OR status   IN ('sending','held_dnd','amber_to_pulse','sent','escalated','send_failed','cancelled','queued','acked'))
      AND primary_partner IN ('jonathan','kg'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_kind_check'
                  AND pg_get_constraintdef(oid) LIKE '%lead_routed_out%') THEN
    ALTER TABLE ops.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
    ALTER TABLE ops.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN
      ('daily_pulse','approval','red','weekly_memo','monthly_retro','build_gate','escalation_call',
       -- optimisation/sql-additions.sql
       'pulse','action','action_reminder','confirm','red_email','red_resend','banner','pulse_red_email','weekly','weekly_email','monthly_email',
       -- W22 / W02 / ads-api / W16-W19 / portal
       'alert','lead_routed_out','ads_audit','ads_reminder','billing','go_live','portal'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notifications_dedupe_idx   ON ops.notifications (dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_open_red_idx ON ops.notifications (first_sent_at) WHERE severity = 'red' AND acked_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_proposal_idx ON ops.notifications (proposal_id) WHERE proposal_id IS NOT NULL;

-- "to" (W02/W22 spelling) and recipient (01–05 spelling) are kept in step: either may be written.
CREATE OR REPLACE FUNCTION ops.notifications_sync_to()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.recipient := coalesce(NEW.recipient, NEW."to");
  NEW."to"      := coalesce(NEW."to", NEW.recipient);
  IF NEW.recipient IS NULL THEN
    RAISE EXCEPTION 'ops.notifications: recipient ("to") is required' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notifications_sync_to ON ops.notifications;
CREATE TRIGGER notifications_sync_to BEFORE INSERT OR UPDATE OF recipient, "to" ON ops.notifications
  FOR EACH ROW EXECUTE FUNCTION ops.notifications_sync_to();
ALTER TABLE ops.notifications ALTER COLUMN recipient DROP NOT NULL;   -- enforced by the trigger above (either spelling)
UPDATE ops.notifications SET "to" = recipient WHERE "to" IS NULL;

-- W22 support tables (automation/W22.md §4; metadata only — never a secret value)
CREATE TABLE IF NOT EXISTS ops.secret_inventory (
  name              text PRIMARY KEY,
  holder            text NOT NULL,
  stored_in         text NOT NULL,
  rotate_every_days integer NOT NULL,
  rotated_at        timestamptz,
  expires_at        timestamptz,
  owner             text NOT NULL DEFAULT 'devops-security'
);
CREATE TABLE IF NOT EXISTS ops.backup_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('pg_dump','n8n_export','restore_test')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  ok          boolean NOT NULL,
  bytes       bigint,
  sha256      text,
  location    text,
  note        text
);
-- Uptime + page measurements written by W22 / the uptime monitor / CI (feed facts.fact_system_day, fact_page_day)
CREATE TABLE IF NOT EXISTS ops.infra_day (
  day         date NOT NULL,
  monitor     text NOT NULL DEFAULT 'api',
  uptime_pct  numeric CHECK (uptime_pct BETWEEN 0 AND 100),
  down_minutes integer,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, monitor)
);
CREATE TABLE IF NOT EXISTS ops.page_day (
  day          date NOT NULL,
  brand_id     uuid REFERENCES public.brands(id),
  page_path    text NOT NULL,
  visits       integer NOT NULL DEFAULT 0 CHECK (visits >= 0),
  quiz_starts  integer CHECK (quiz_starts >= 0),
  quiz_steps   jsonb,                       -- {step_key: {views, abandons}}
  lcp_p75_s    numeric,
  source       text,                        -- e.g. cloudflare_web_analytics | lighthouse_ci
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (day, brand_id, page_path)
);
CREATE TABLE IF NOT EXISTS ops.page_audits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audited_at timestamptz NOT NULL DEFAULT now(),
  url        text NOT NULL,
  build_sha  text,
  axe        jsonb,
  lighthouse jsonb,
  page_text  text,                          -- public page copy only
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 14. ads-api: ad_objects cache, ads view (W30 reads it), creative_queue (CONSOLE-ADS-API.md)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_objects (
  id                        text PRIMARY KEY,                 -- Meta object id
  level                     text NOT NULL CHECK (level IN ('campaign','adset','ad')),
  brand_id                  uuid NOT NULL REFERENCES public.brands(id),
  campaign_id               text,
  adset_id                  text,
  name                      text NOT NULL,
  status                    text,                             -- configured status (ACTIVE | PAUSED | …)
  effective_status          text,                             -- what Meta is doing (PENDING_REVIEW | DISAPPROVED | …)
  daily_budget_zar          numeric(12,2),
  lifetime_budget_zar       numeric(12,2),
  spend_cap_zar             numeric(12,2),
  last_budget_change_at     timestamptz,
  creative_id               text,
  effective_object_story_id text,                             -- FB post id (W30 comment → ad)
  ig_media_id               text,                             -- IG media id (W30)
  launched_at               timestamptz,
  fetched_at                timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_objects_tree_idx  ON public.ad_objects (brand_id, level, campaign_id, adset_id);
CREATE INDEX IF NOT EXISTS ad_objects_story_idx ON public.ad_objects (effective_object_story_id) WHERE effective_object_story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_objects_ig_idx    ON public.ad_objects (ig_media_id) WHERE ig_media_id IS NOT NULL;

CREATE OR REPLACE VIEW public.ads WITH (security_invoker = true) AS
SELECT o.id AS ad_id, o.brand_id, o.campaign_id, o.adset_id, o.name AS ad_name, o.status, o.effective_status,
       o.effective_object_story_id, o.ig_media_id, o.launched_at, o.fetched_at
FROM public.ad_objects o
WHERE o.level = 'ad';
COMMENT ON VIEW public.ads IS 'SMC: ads from the ad_objects cache (W21). W30 maps a commented post to its ad here.';

CREATE TABLE IF NOT EXISTS public.creative_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES public.brands(id),
  source_ad_id     text,
  concept          text,
  angle            text,
  format           text,
  new_format       text,
  brief            text,
  refresh_at       timestamptz,                 -- scheduled refresh (POST /ads-refresh-schedule)
  status           text NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested','in_progress','in_review','needs_changes','approved','published','rejected','scheduled')),
  preview_urls     text[] NOT NULL DEFAULT '{}',
  primary_text     text,
  headline         text,
  description      text,
  image_hash       text,
  video_id         text,
  form_id          text,
  compliance_gate  text NOT NULL DEFAULT 'pending' CHECK (compliance_gate IN ('pass','fail','pending')),
  ad_name          text,
  published_ad_id  text,
  requested_by     uuid,
  approved_by      uuid,
  approved_at      timestamptz,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR compliance_gate = 'pass'),
  CHECK (status NOT IN ('approved','published') OR approved_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS creative_queue_status_idx ON public.creative_queue (status, created_at);

-- -----------------------------------------------------------------------------
-- 15. community (community/comments-schema-additions.sql) — comments queue, sentiment, DMs
-- -----------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS status   text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS due_at   timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_status_check') THEN
    ALTER TABLE public.comments ADD CONSTRAINT comments_status_check
      CHECK (status IN ('received','queued','retry','done','skipped','failed'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS comments_comment_id_uq    ON public.comments (comment_id);
CREATE INDEX IF NOT EXISTS comments_queue_idx               ON public.comments (status, due_at) WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS comments_ad_class_idx            ON public.comments (ad_id, class, created_at);
CREATE INDEX IF NOT EXISTS comments_author_post_idx         ON public.comments (author_hash, parent_post_id);

CREATE TABLE IF NOT EXISTS public.comment_ad_sentiment (
  day              date NOT NULL,
  ad_id            text NOT NULL,
  sentiment        text NOT NULL CHECK (sentiment IN ('positive','neutral','negative')),
  themes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  flag_media_buyer boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, ad_id)
);

-- W31: DM replies held outside 07:00–22:00 SAST (text is the planned reply, never the user's message)
CREATE TABLE IF NOT EXISTS public.dm_queue (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  channel           text NOT NULL CHECK (channel IN ('messenger','instagram')),
  external_id       text NOT NULL,                  -- PSID / IGSID
  owner_id          text NOT NULL,                  -- Page id / IG business id
  reply_text        text NOT NULL,
  quick_replies     jsonb,
  window_expires_at timestamptz NOT NULL,           -- last user message + 24 h: never send after this
  due_at            timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','expired','failed')),
  attempts          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_queue_due_idx ON public.dm_queue (status, due_at);

-- W31 thread state. `conversations` is the SMC view over communications (one row per MESSAGE),
-- so per-thread DM state lives in its own table: same columns the community request listed.
CREATE TABLE IF NOT EXISTS public.dm_threads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             uuid REFERENCES public.brands(id),
  channel              text NOT NULL CHECK (channel IN ('messenger','instagram')),
  external_id          text NOT NULL,
  state                jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {step, faq_count, cta_count, age_band, lang, origin_ref}
  paused               boolean NOT NULL DEFAULT false,       -- true after a human handoff
  opted_out            boolean NOT NULL DEFAULT false,
  last_user_message_at timestamptz,
  lead_id              uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);

-- escalations: W30/W31 assign to an agent role (text), not only to an admin user (uuid)
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS assigned_agent text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalations_kind_check'
                  AND pg_get_constraintdef(oid) LIKE '%hostile_thread%') THEN
    ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS escalations_kind_check;
    ALTER TABLE public.escalations ADD CONSTRAINT escalations_kind_check CHECK (kind IN
      ('human_handoff','comment','dm','guardrail_trip','outcome_unmarked','replacement_dispute','unmatched_payment',
       'fsca_mismatch','complaint','dsr','other',
       'hostile_thread','needs_human','classifier_invalid','comment_sentiment','webhook_signature_invalid'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 16. W24 (compliance register): suppression, dsr_requests, obligations
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppression_source_check'
                  AND pg_get_constraintdef(oid) LIKE '%deletion%') THEN
    ALTER TABLE public.suppression DROP CONSTRAINT IF EXISTS suppression_source_check;
    ALTER TABLE public.suppression ADD CONSTRAINT suppression_source_check CHECK (source IN
      ('stop','objection','ncc_registry','complaint','no_consent_ctwa','dsr_erase','deletion'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS suppression_mobile_source_uidx ON public.suppression (mobile_hash, source);

ALTER TABLE public.dsr_requests ADD COLUMN IF NOT EXISTS mobile_hash text;   -- lead_id already exists (03)
CREATE INDEX IF NOT EXISTS dsr_requests_mobile_idx ON public.dsr_requests (mobile_hash) WHERE mobile_hash IS NOT NULL;

ALTER TABLE public.obligations ADD COLUMN IF NOT EXISTS note text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obligations_status_check'
                  AND pg_get_constraintdef(oid) LIKE '%amber%') THEN
    ALTER TABLE public.obligations DROP CONSTRAINT IF EXISTS obligations_status_check;
    -- green/amber/red is the register's traffic light (W24); the 03 values are kept for existing writers.
    ALTER TABLE public.obligations ADD CONSTRAINT obligations_status_check CHECK (status IN
      ('green','amber','red','open','done','overdue','not_applicable'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 17. optimisation/sql-additions.sql (applied here, made idempotent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
-- ASSUMPTION values from optimisation/data-contract.md (usd_zar 18, caps) — owner: optimisation-advisor
INSERT INTO ops.settings (key, value) VALUES
  ('usd_zar','18'), ('opt_daily_cap_zar','15'), ('opt_weekly_cap_zar','40'), ('build_active','true'),
  ('ops_email','howzit@leadvelocity.co.za')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.judge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), date date NOT NULL, rubric text NOT NULL,
  sampled int, passed int, failed int, critical int, status text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS judge_runs_date_idx ON ops.judge_runs (date, rubric);

ALTER TABLE ops.pulses ADD COLUMN IF NOT EXISTS quiet boolean,
                       ADD COLUMN IF NOT EXISTS card_markdown text,
                       ADD COLUMN IF NOT EXISTS whatsapp_text text;

ALTER TABLE ops.proposals ADD COLUMN IF NOT EXISTS pulse_date date, ADD COLUMN IF NOT EXISTS mechanism text, ADD COLUMN IF NOT EXISTS kill_rule text,
  ADD COLUMN IF NOT EXISTS ice jsonb, ADD COLUMN IF NOT EXISTS evidence text, ADD COLUMN IF NOT EXISTS verdict text, ADD COLUMN IF NOT EXISTS kill_rule_hit boolean,
  ADD COLUMN IF NOT EXISTS grade_note text, ADD COLUMN IF NOT EXISTS graded_at timestamptz, ADD COLUMN IF NOT EXISTS decided_by_label text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_proposals_verdict_chk') THEN
    ALTER TABLE ops.proposals ADD CONSTRAINT ops_proposals_verdict_chk
      CHECK (verdict IS NULL OR verdict IN ('beat_forecast','within_range','missed'));
  END IF;
END $$;

ALTER TABLE ops.signals ADD COLUMN IF NOT EXISTS signal_key text, ADD COLUMN IF NOT EXISTS rule text,
                        ADD COLUMN IF NOT EXISTS side text, ADD COLUMN IF NOT EXISTS burning boolean;
CREATE UNIQUE INDEX IF NOT EXISTS ops_signals_key_uidx ON ops.signals (signal_key) WHERE signal_key IS NOT NULL;

ALTER TABLE ops.optimisation_memos ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE ops.quality_grades ADD COLUMN IF NOT EXISTS exact_text text, ADD COLUMN IF NOT EXISTS owner_agent text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_grades_severity_check'
                  AND pg_get_constraintdef(oid) LIKE '%medium%') THEN
    ALTER TABLE ops.quality_grades DROP CONSTRAINT IF EXISTS quality_grades_severity_check;
    ALTER TABLE ops.quality_grades ADD CONSTRAINT quality_grades_severity_check
      CHECK (severity IN ('info','minor','major','critical','high','medium','low'));
  END IF;
END $$;

-- Build line (6.8b): one row per orchestrator/CI snapshot of build/tasks.json + test results
CREATE TABLE IF NOT EXISTS ops.build_state (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  commits_24h         integer NOT NULL DEFAULT 0,
  tests_failing       integer NOT NULL DEFAULT 0,
  tests_failed_twice  integer NOT NULL DEFAULT 0,
  gates_waiting       integer NOT NULL DEFAULT 0,
  gates_oldest_hours  numeric,
  tasks_total         integer,
  tasks_by_status     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"green": n, "red": n, "needs_human": n, …}
  source              text NOT NULL DEFAULT 'orchestrator'
);
CREATE OR REPLACE VIEW ops.build_state_latest WITH (security_invoker = true) AS
SELECT b.commits_24h, b.tests_failing, b.tests_failed_twice, b.gates_oldest_hours,
       b.gates_waiting, b.tasks_total, b.tasks_by_status, b.captured_at, b.source
FROM ops.build_state b
ORDER BY b.captured_at DESC
LIMIT 1;

-- Recipients for W32 sends: the admins' own numbers (profiles) + the SMC WhatsApp sender.
CREATE OR REPLACE VIEW ops.alert_recipients AS
SELECT p.whatsapp_number AS wa,
       u.email           AS email,
       (SELECT s.value FROM ops.settings s WHERE s.key = 'ops_email') AS ops_email,
       coalesce(p.full_name, split_part(u.email, '@', 1)) AS name,
       (SELECT br.phone_number_id FROM public.brands br WHERE br.code = 'SMC') AS pnid
FROM public.user_roles r
JOIN public.profiles p ON p.user_id = r.user_id
JOIN auth.users u      ON u.id = r.user_id
WHERE r.role = 'admin'::public.app_role
  AND p.whatsapp_number IS NOT NULL;
COMMENT ON VIEW ops.alert_recipients IS 'SMC 6.8b: Jonathan + KG (admins with a WhatsApp number on their profile). n8n_app only.';

-- -----------------------------------------------------------------------------
-- 18. facts — pass 2 columns (appended) and new fact views (analytics I-04)
-- -----------------------------------------------------------------------------
-- fact_lead: + verified_at, replaced, lead_pulse_thumbs (analytics contract names)
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
  l.is_synthetic,
  -- pass 2 (appended)
  l.verified_at,
  (rp.status IN ('approved','fulfilled'))               AS replaced,
  CASE lp.thumbs WHEN 'up' THEN 1 WHEN 'down' THEN 0 END::smallint AS lead_pulse_thumbs,
  l.first_message_at,
  l.wa_delivered_at                                     AS first_contact_at,
  (l.consent_at IS NOT NULL AND l.consent_text_version IS NOT NULL) AS consent_ok,
  l.consent_text_version,
  (l.disclosure_delivered_at IS NOT NULL)               AS disclosure_delivered,
  l.opted_out_at
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
  AND (NOT l.is_synthetic OR facts.include_synthetic());

-- fact_booking: + booked_at and the intro-media test fields
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
  facts.sa_date(coalesce(a.booked_at, a.created_at)) AS booked_date,
  -- pass 2 (appended)
  coalesce(a.booked_at, a.created_at) AS booked_at,
  a.intro_arm, a.intro_sent_at, a.intro_read_at, a.intro_played_at, a.late_booking,
  a.confirmed_at,
  l.ad_id, l.angle
FROM public.appointments a
JOIN public.leads l ON l.id = a.client_id
WHERE a.brand_id IS NOT NULL
  AND (NOT l.is_synthetic OR facts.include_synthetic());

-- fact_outcome: + ad_id, angle, marked_at (kill-scale / W14 group outcomes by ad)
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
  o.summary                        AS summary_redacted,
  -- pass 2 (appended)
  l.ad_id, l.angle, o.marked_at
FROM public.outcomes o
JOIN public.appointments a ON a.id = o.booking_id
JOIN public.leads l        ON l.id = o.lead_id
WHERE (NOT l.is_synthetic OR facts.include_synthetic());

-- fact_ad_day: + contract names (day, ad_name, status, leads_raw) and the slos.json read columns
CREATE OR REPLACE VIEW facts.fact_ad_day AS
WITH spend AS (
  SELECT am.date, am.brand_id, am.ad_id,
         max(am.campaign_id) AS campaign_id, max(am.adset_id) AS adset_id,
         max(am.concept) AS concept, max(am.angle) AS angle, max(am.format) AS format,
         sum(am.spend_zar) AS spend_zar, sum(am.impressions) AS impressions, sum(am.clicks) AS clicks,
         sum(am.leads_raw) AS leads_meta, max(am.frequency) AS frequency,
         avg(am.hook_rate) AS hook_rate, avg(am.hold_rate) AS hold_rate, max(am.emq) AS emq,
         max(am.ad_name) AS ad_name
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
         count(*) FILTER (WHERE fl.disposition_code IN ('nofit_budget','nofit_covered','nofit_criteria')) AS nofit,
         count(*) FILTER (WHERE fl.disposition_code IS NOT NULL AND fl.disposition_code <> 'unreachable') AS dispositioned
    FROM facts.fact_lead fl
   WHERE fl.ad_id IS NOT NULL
   GROUP BY fl.created_date, fl.brand_id, fl.ad_id
),
j AS (
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
  coalesce(ls.nofit, 0)     AS nofit,
  s.ad_name, coalesce(ls.dispositioned, 0) AS dispositioned
FROM spend s
FULL JOIN leadside ls ON ls.date = s.date AND ls.brand_id = s.brand_id AND ls.ad_id = s.ad_id
)
SELECT j.date, j.brand_id, j.ad_id, j.campaign_id, j.adset_id, j.concept, j.angle, j.format,
       j.spend_zar, j.impressions, j.clicks, j.leads_meta, j.frequency, j.hook_rate, j.hold_rate, j.emq,
       j.leads, j.verified, j.qualified, j.booked, j.attended, j.good_fit, j.quality_n, j.quality_index, j.nofit,
       -- pass 2 (appended)
       j.date                                                        AS day,
       coalesce(j.ad_name, ao.name)                                  AS ad_name,
       ao.effective_status                                           AS status,
       coalesce(j.leads_meta, j.leads)                               AS leads_raw,
       CASE WHEN coalesce(j.leads_meta, j.leads) > 0 THEN round(j.spend_zar / coalesce(j.leads_meta, j.leads), 2) END AS cpl,
       CASE WHEN j.qualified > 0 THEN round(j.spend_zar / j.qualified, 2) END AS cost_per_qualified,
       CASE WHEN j.attended  > 0 THEN round(j.spend_zar / j.attended, 2)  END AS cost_per_attended,
       CASE WHEN j.dispositioned > 0 THEN round(j.nofit::numeric / j.dispositioned, 4) END AS nofit_rate,
       j.dispositioned
FROM j
LEFT JOIN public.ad_objects ao ON ao.id = j.ad_id AND ao.level = 'ad';

-- fact_broker_day: + contract names and forward capacity windows (v_capacity_day / kill-scale read them)
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
base AS (
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
)
SELECT base.broker_id, base.brand_id, base.date, base.cycle_id, base.capacity_slots, base.leads_routed,
       base.bookings_made, base.meetings_scheduled, base.meetings_held, base.outcomes_unmarked, base.report_opened,
       -- pass 2 (appended): forward windows from the day after `date`
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

-- fact_cost: + cycle_id, so media (and every other cost) rolls up per cycle
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
),
x AS (
SELECT r.date, r.kind, r.brand_id, r.broker_id, r.amount_zar, r.source, 'direct'::text AS allocation
  FROM raw r WHERE r.broker_id IS NOT NULL
UNION ALL
SELECT r.date, r.kind, r.brand_id, s.broker_id,
       round(r.amount_zar * coalesce(s.share, 1), 2), r.source,
       CASE WHEN s.broker_id IS NULL THEN 'unallocated' ELSE 'lead_share' END
  FROM raw r
  LEFT JOIN share s ON s.brand_id IS NOT DISTINCT FROM r.brand_id AND s.date = r.date
 WHERE r.broker_id IS NULL
)
SELECT x.date, x.kind, x.brand_id, x.broker_id, x.amount_zar, x.source, x.allocation,
       -- pass 2 (appended): the cycle that day belongs to (media cost per cycle)
       (SELECT c.id FROM public.cycles c
         WHERE c.broker_id = x.broker_id AND c.starts_at IS NOT NULL
           AND x.date >= facts.sa_date(c.starts_at)
           AND x.date <  facts.sa_date(coalesce(c.extended_until, c.ends_at))
         ORDER BY c.starts_at DESC LIMIT 1) AS cycle_id,
       x.date AS day
FROM x;

-- fact_cycle: + renewed (slos.json billing.renewal_rate_cycle1) + contract tier_name
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
  c.policies_written_reported,
  -- pass 2 (appended)
  (c.renewal_decision IN ('renewed','upgraded','downgraded')
     OR EXISTS (SELECT 1 FROM public.cycles n
                 WHERE n.broker_id = c.broker_id AND n.cycle_no = c.cycle_no + 1
                   AND (n.invoice_id IS NOT NULL OR n.status IN ('active','extended','closed')))) AS renewed,
  (SELECT p.name FROM public.pricing p WHERE p.tier_code = c.tier_code) AS tier_name,
  c.renewal_decision     -- shortfall_credit_zar deliberately not repeated: analytics' cycle_margin() joins cycles for it
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
    AND c.starts_at IS NOT NULL
    AND fc.date >= facts.sa_date(c.starts_at)
    AND fc.date <  facts.sa_date(coalesce(c.extended_until, c.ends_at))
) k;

-- fact_system_day: uptime (ops.infra_day) + webhook latency/errors (webhook_events)
CREATE OR REPLACE VIEW facts.fact_system_day AS
WITH wh AS (
  SELECT facts.sa_date(w.received_at) AS day,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (w.processed_at - w.received_at)) * 1000)
           FILTER (WHERE w.processed_at IS NOT NULL) AS webhook_p95_ms,
         count(*)                                    AS webhook_count,
         count(*) FILTER (WHERE w.error IS NOT NULL) AS webhook_errors
    FROM public.webhook_events w
   GROUP BY 1
),
up AS (
  SELECT i.day, min(i.uptime_pct) AS uptime_pct FROM ops.infra_day i GROUP BY i.day
)
SELECT coalesce(wh.day, up.day) AS day,
       up.uptime_pct,
       round(wh.webhook_p95_ms::numeric, 0) AS webhook_p95_ms,
       coalesce(wh.webhook_count, 0)::integer AS webhook_count,
       coalesce(wh.webhook_errors, 0)::integer AS webhook_errors
FROM wh FULL JOIN up ON up.day = wh.day;

-- fact_lead_theme: themes a lead raised (W11/W29 write lead_activities activity_type 'lead_theme', payload.theme; redacted label only)
CREATE OR REPLACE VIEW facts.fact_lead_theme AS
SELECT facts.lead_key(a.lead_id) AS lead_key, a.broker_id, a.cycle_id,
       a.payload->>'theme'        AS theme,
       a.occurred_at              AS created_at
FROM public.lead_activities a
JOIN public.leads l ON l.id = a.lead_id
WHERE a.brand_id IS NOT NULL AND a.activity_type = 'lead_theme' AND a.payload ? 'theme'
  AND (NOT l.is_synthetic OR facts.include_synthetic());

-- fact_broker_roi: broker-entered ROI inputs. OUTSIDE Ask-the-data (no facts_reader grant, migration 07): FAIS 3.7.
CREATE OR REPLACE VIEW facts.fact_broker_roi AS
SELECT c.id AS cycle_id, c.broker_id, b.close_rate, c.policies_written_reported, b.avg_commission_zar
FROM public.cycles c
JOIN public.brokers b ON b.id = c.broker_id
WHERE c.brand_id IS NOT NULL;

-- fact_page_day: visits (ops.page_day, written from web analytics / Lighthouse CI) + page leads per day
CREATE OR REPLACE VIEW facts.fact_page_day AS
WITH v AS (
  SELECT pd.day, pd.brand_id, sum(pd.visits) AS page_visits, sum(pd.quiz_starts) AS quiz_starts,
         max(pd.lcp_p75_s) AS lcp_p75_s
    FROM ops.page_day pd GROUP BY pd.day, pd.brand_id
),
ld AS (
  SELECT fl.created_date AS day, fl.brand_id, count(*) AS leads_raw,
         count(*) FILTER (WHERE fl.qualified) AS qualified
    FROM facts.fact_lead fl WHERE fl.origin = 'page' GROUP BY 1, 2
)
SELECT coalesce(v.day, ld.day) AS day, coalesce(v.brand_id, ld.brand_id) AS brand_id,
       coalesce(v.page_visits, 0)::integer AS page_visits, v.quiz_starts,
       coalesce(ld.leads_raw, 0)::integer AS leads_raw, coalesce(ld.qualified, 0)::integer AS qualified,
       CASE WHEN v.page_visits > 0 THEN round(coalesce(ld.leads_raw, 0)::numeric / v.page_visits, 4) END AS conversion,
       v.lcp_p75_s
FROM v FULL JOIN ld ON ld.day = v.day AND ld.brand_id IS NOT DISTINCT FROM v.brand_id;

-- -----------------------------------------------------------------------------
-- 19. facts.pulse_daily (I-14) — one row per (faculty, metric, date) for the slos.json metric ids
--     numerator/denominator are daily; *_7d are rolling 7-day sums (NH-AD-06: p-charts on weekly points).
--     Metrics with no data source yet return no rows (listed in schema.md "pass 2").
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW facts.pulse_daily AS
WITH win AS (SELECT facts.sa_date(now()) - 89 AS d0, facts.sa_date(now()) AS d1),
ad AS (
  SELECT a.date, sum(a.spend_zar) AS spend, sum(coalesce(a.leads_meta, a.leads)) AS raw, sum(a.qualified) AS q,
         sum(a.attended) AS att, avg(a.emq) AS emq, max(a.frequency) AS freq,
         avg(a.hook_rate) AS hook, avg(a.hold_rate) AS hold, sum(a.nofit) AS nofit, sum(a.dispositioned) AS disp
    FROM facts.fact_ad_day a, win WHERE a.date BETWEEN win.d0 AND win.d1 GROUP BY a.date
),
fl AS (
  SELECT f.created_date AS date,
         count(*) AS leads,
         count(*) FILTER (WHERE f.first_message_seconds IS NOT NULL) AS messaged,
         count(*) FILTER (WHERE f.first_message_seconds <= 60) AS under60,
         count(*) FILTER (WHERE f.verify_window_closed) AS matured,
         count(*) FILTER (WHERE f.verify_window_closed AND f.verified_within_72h) AS reached,
         count(*) FILTER (WHERE f.verified) AS verified,
         count(*) FILTER (WHERE f.verified AND f.booked) AS booked_of_verified,
         count(*) FILTER (WHERE f.consent_ok) AS consent_ok,
         count(*) FILTER (WHERE f.first_message_at IS NOT NULL AND f.disclosure_delivered) AS disclosed,
         count(*) FILTER (WHERE f.origin = 'comment') AS comment_leads
    FROM facts.fact_lead f, win WHERE f.created_date BETWEEN win.d0 AND win.d1 GROUP BY f.created_date
),
msg AS (
  SELECT m.date,
         count(DISTINCT m.lead_key) AS convs,
         count(*) FILTER (WHERE m.guardrail_trip) AS trips,
         count(DISTINCT m.lead_key) FILTER (WHERE m.handoff) AS handoffs,
         count(DISTINCT m.lead_key) FILTER (WHERE m.intent = 'person') AS person,
         count(DISTINCT m.lead_key) FILTER (WHERE m.intent = 'stop') AS stops,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY m.latency_ms) FILTER (WHERE m.direction = 'outbound' AND m.author = 'bot' AND m.latency_ms IS NOT NULL) AS p95_ms,
         count(*) FILTER (WHERE m.direction = 'outbound' AND m.author = 'bot' AND m.latency_ms IS NOT NULL) AS bot_replies
    FROM facts.fact_message m, win WHERE m.date BETWEEN win.d0 AND win.d1 AND m.channel = 'whatsapp' GROUP BY m.date
),
bk AS (
  SELECT b.slot_date AS date,
         count(*) FILTER (WHERE b.status NOT IN ('cancelled')) AS slots,
         count(*) FILTER (WHERE b.confirmed) AS confirmed,
         count(*) FILTER (WHERE b.intro_sent_at IS NOT NULL) AS intro_sent,
         count(*) FILTER (WHERE b.intro_sent_at IS NOT NULL AND (b.intro_read_at IS NOT NULL OR b.intro_played_at IS NOT NULL)) AS intro_viewed
    FROM facts.fact_booking b, win WHERE b.slot_date BETWEEN win.d0 AND win.d1 GROUP BY b.slot_date
),
bkm AS (
  SELECT b.booked_date AS date, count(*) AS made, count(*) FILTER (WHERE b.is_reschedule) AS reschedules,
         count(*) FILTER (WHERE b.booked_via = 'flow') AS via_flow
    FROM facts.fact_booking b, win WHERE b.booked_date BETWEEN win.d0 AND win.d1 GROUP BY b.booked_date
),
flow_open AS (
  SELECT facts.sa_date(a.occurred_at) AS date, count(*) AS opened
    FROM public.lead_activities a, win
   WHERE a.brand_id IS NOT NULL AND a.activity_type = 'flow_opened' AND facts.sa_date(a.occurred_at) BETWEEN win.d0 AND win.d1
   GROUP BY 1
),
oc AS (
  SELECT o.slot_date AS date,
         count(*) FILTER (WHERE o.outcome = 'attended') AS att,
         count(*) FILTER (WHERE o.outcome = 'no_show') AS ns,
         count(*) FILTER (WHERE o.outcome = 'attended' AND o.disposition_code IS NOT NULL AND NOT o.auto_marked) AS disp,
         count(*) FILTER (WHERE o.outcome = 'attended' AND o.good_fit) AS gf,
         count(*) FILTER (WHERE o.outcome = 'attended' AND o.disposition_code IS NOT NULL) AS disp_any,
         avg(o.quality_score) AS q, count(o.quality_score) AS qn
    FROM facts.fact_outcome o, win WHERE o.slot_date BETWEEN win.d0 AND win.d1 GROUP BY o.slot_date
),
cm AS (
  SELECT c.date,
         count(*) FILTER (WHERE c.replied_public) AS replied,
         count(*) FILTER (WHERE c.replied_public AND c.sla_seconds <= 900) AS replied_in_sla,
         count(*) FILTER (WHERE c.hidden) AS hidden,
         count(*) FILTER (WHERE c.hidden AND c.sla_seconds <= 900) AS hidden_in_sla
    FROM facts.fact_comment c, win WHERE c.date BETWEEN win.d0 AND win.d1 GROUP BY c.date
),
qg AS (
  SELECT facts.sa_date(g.graded_at) AS date,
         count(*) FILTER (WHERE g.rule = 'fais_gate' AND g.severity IN ('high','critical') AND NOT g.passed) AS advice_all,
         count(*) FILTER (WHERE g.rule = 'fais_gate' AND g.severity IN ('high','critical') AND NOT g.passed AND g.faculty IN ('comments','comments_dms')) AS advice_comments
    FROM ops.quality_grades g, win WHERE facts.sa_date(g.graded_at) BETWEEN win.d0 AND win.d1 GROUP BY 1
),
bd AS (
  SELECT d.date, sum(d.slots_booked_7d) AS booked7, sum(d.slots_total_7d) AS total7
    FROM facts.fact_broker_day d, win WHERE d.date BETWEEN win.d0 AND win.d1 GROUP BY d.date
),
onb AS (
  SELECT facts.sa_date(b.approved_live_at) AS date,
         avg(extract(epoch FROM (b.approved_live_at - b.first_login_at)) / 3600) AS hours, count(*) AS n
    FROM public.brokers b, win
   WHERE b.brand_id IS NOT NULL AND b.approved_live_at IS NOT NULL AND b.first_login_at IS NOT NULL
     AND facts.sa_date(b.approved_live_at) BETWEEN win.d0 AND win.d1
   GROUP BY 1
),
rep AS (
  SELECT dd::date AS date, sum(rc.claimed) AS claimed, sum(c.replacement_cap) AS cap
    FROM win CROSS JOIN generate_series(win.d0, win.d1, interval '1 day') dd
    JOIN public.cycles c ON c.starts_at IS NOT NULL AND dd::date >= facts.sa_date(c.starts_at)
                         AND dd::date < facts.sa_date(coalesce(c.extended_until, c.ends_at))
    CROSS JOIN LATERAL (SELECT count(*) AS claimed FROM public.replacements r
                         WHERE r.cycle_id = c.id AND r.status <> 'rejected' AND facts.sa_date(r.claimed_at) <= dd::date) rc
   GROUP BY 1
),
cyc_end AS (
  SELECT facts.sa_date(coalesce(fc.extended_until, fc.ends_at)) AS date,
         count(*) AS ended, count(*) FILTER (WHERE fc.renewed) AS renewed, avg(fc.margin_pct) AS margin
    FROM facts.fact_cycle fc, win
   WHERE fc.ends_at IS NOT NULL AND facts.sa_date(coalesce(fc.extended_until, fc.ends_at)) BETWEEN win.d0 AND win.d1
     AND coalesce(fc.extended_until, fc.ends_at) <= now()
   GROUP BY 1
),
inv AS (
  SELECT facts.sa_date(i.paid_at) AS date, avg(extract(epoch FROM (i.paid_at - i.issued_at)) / 86400) AS days, count(*) AS n
    FROM public.invoices_smc i, win
   WHERE i.status = 'paid' AND i.issued_at IS NOT NULL AND facts.sa_date(i.paid_at) BETWEEN win.d0 AND win.d1 GROUP BY 1
),
bc AS (
  SELECT facts.sa_date(c.received_at) AS date, count(*) FILTER (WHERE c.match_status = 'unmatched') AS unmatched
    FROM public.bank_credits c, win WHERE facts.sa_date(c.received_at) BETWEEN win.d0 AND win.d1 GROUP BY 1
),
stp AS (
  SELECT facts.sa_date(l.opted_out_at) AS date, count(*) AS stops,
         count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM public.communications c
            WHERE c.lead_id = l.id AND c.direction = 'outbound'
              AND c.created_at > l.opted_out_at + interval '1 minute'
              AND coalesce(c.template_name, '') NOT LIKE '%stop_confirm%')) AS honoured
    FROM public.leads l, win
   WHERE l.brand_id IS NOT NULL AND l.opted_out_at IS NOT NULL AND facts.sa_date(l.opted_out_at) BETWEEN win.d0 AND win.d1
     AND (NOT l.is_synthetic OR facts.include_synthetic())
   GROUP BY 1
),
sysd AS (
  SELECT s.day AS date, s.uptime_pct, s.webhook_p95_ms, s.webhook_count, s.webhook_errors
    FROM facts.fact_system_day s, win WHERE s.day BETWEEN win.d0 AND win.d1
),
cost AS (
  SELECT c.date, sum(c.amount_zar) FILTER (WHERE c.kind IN ('whatsapp','llm','infra')) AS sys_cost,
         sum(c.amount_zar) FILTER (WHERE c.kind = 'llm') AS llm
    FROM facts.fact_cost c, win WHERE c.date BETWEEN win.d0 AND win.d1 GROUP BY c.date
),
pg AS (
  SELECT p.day AS date, sum(p.leads_raw) AS leads, sum(p.page_visits) AS visits, max(p.lcp_p75_s) AS lcp
    FROM facts.fact_page_day p, win WHERE p.day BETWEEN win.d0 AND win.d1 GROUP BY p.day
),
bs AS (
  SELECT facts.sa_date(b.captured_at) AS date,
         (array_agg(coalesce((b.tasks_by_status->>'red')::int, 0) + coalesce((b.tasks_by_status->>'needs_human')::int, 0) ORDER BY b.captured_at DESC))[1] AS blocked,
         (array_agg(b.tests_failing ORDER BY b.captured_at DESC))[1] AS failing,
         (array_agg(b.gates_waiting ORDER BY b.captured_at DESC))[1] AS gates,
         (array_agg(b.commits_24h ORDER BY b.captured_at DESC))[1] AS commits
    FROM ops.build_state b, win WHERE facts.sa_date(b.captured_at) BETWEEN win.d0 AND win.d1 GROUP BY 1
),
comp_today AS (
  SELECT facts.sa_date(now()) AS date,
         (SELECT facts.sa_date(now()) - facts.sa_date(o.last_done_at) FROM public.obligations o WHERE o.code = 'C2') AS days_since_cleanse,
         (SELECT count(*) FROM public.dsr_requests d WHERE d.due_at < now() AND d.status NOT IN ('completed','rejected')) AS dsr_overdue
),
-- long format: (faculty, metric, date, value, numerator, denominator, n, spend_zar, conversions)
l AS (
  SELECT 'media' AS faculty, 'qualified_cpl' AS metric, date, CASE WHEN q > 0 THEN spend / q END AS value, spend AS numerator, q::numeric AS denominator, q::numeric AS n, spend AS spend_zar, q::numeric AS conversions FROM ad
  UNION ALL SELECT 'media','raw_cpl', date, CASE WHEN raw > 0 THEN spend / raw END, spend, raw, raw, spend, raw FROM ad
  UNION ALL SELECT 'media','cost_per_attended', date, CASE WHEN att > 0 THEN spend / att END, spend, att, att, spend, att FROM ad
  UNION ALL SELECT 'media','qualify_rate', date, CASE WHEN raw > 0 THEN q::numeric / raw END, q, raw, raw, spend, q FROM ad
  UNION ALL SELECT 'media','emq', date, emq, NULL, NULL, NULL, spend, NULL FROM ad WHERE emq IS NOT NULL
  UNION ALL SELECT 'media','frequency_7d', date, freq, NULL, NULL, NULL, spend, NULL FROM ad WHERE freq IS NOT NULL
  UNION ALL SELECT 'media','hook_rate', date, hook, NULL, NULL, NULL, spend, NULL FROM ad WHERE hook IS NOT NULL
  UNION ALL SELECT 'media','hold_rate', date, hold, NULL, NULL, NULL, spend, NULL FROM ad WHERE hold IS NOT NULL
  UNION ALL SELECT 'media','ad_nofit_rate', date, CASE WHEN disp > 0 THEN nofit::numeric / disp END, nofit, disp, disp, spend, NULL FROM ad
  UNION ALL SELECT 'page_flow','page_conversion', date, CASE WHEN visits > 0 THEN leads::numeric / visits END, leads, visits, visits, NULL, leads FROM pg
  UNION ALL SELECT 'page_flow','lcp_p75', date, lcp, NULL, NULL, NULL, NULL, NULL FROM pg WHERE lcp IS NOT NULL
  UNION ALL SELECT 'page_flow','flow_completion', fo.date, CASE WHEN fo.opened > 0 THEN coalesce(m.via_flow, 0)::numeric / fo.opened END, coalesce(m.via_flow, 0), fo.opened, fo.opened, NULL, coalesce(m.via_flow, 0) FROM flow_open fo LEFT JOIN bkm m ON m.date = fo.date
  UNION ALL SELECT 'conversation','first_message_under_60s', date, CASE WHEN messaged > 0 THEN under60::numeric / messaged END, under60, messaged, messaged, NULL, NULL FROM fl
  UNION ALL SELECT 'conversation','booking_rate', date, CASE WHEN verified > 0 THEN booked_of_verified::numeric / verified END, booked_of_verified, verified, verified, NULL, booked_of_verified FROM fl
  UNION ALL SELECT 'conversation','verified_rate', date, CASE WHEN matured > 0 THEN reached::numeric / matured END, reached, matured, matured, NULL, reached FROM fl
  UNION ALL SELECT 'conversation','guardrail_trips', date, CASE WHEN convs > 0 THEN 100.0 * trips / convs END, trips, convs, convs, NULL, NULL FROM msg
  UNION ALL SELECT 'conversation','handoff_rate', date, CASE WHEN convs > 0 THEN handoffs::numeric / convs END, handoffs, convs, convs, NULL, NULL FROM msg
  UNION ALL SELECT 'conversation','speak_to_person_rate', date, CASE WHEN convs > 0 THEN person::numeric / convs END, person, convs, convs, NULL, NULL FROM msg
  UNION ALL SELECT 'conversation','stop_rate', date, CASE WHEN convs > 0 THEN stops::numeric / convs END, stops, convs, convs, NULL, NULL FROM msg
  UNION ALL SELECT 'conversation','reply_latency_p95_s', date, p95_ms / 1000.0, NULL, NULL, bot_replies, NULL, NULL FROM msg WHERE p95_ms IS NOT NULL
  UNION ALL SELECT 'nurture_show','show_rate', date, CASE WHEN att + ns > 0 THEN att::numeric / (att + ns) END, att, att + ns, att + ns, NULL, att FROM oc
  UNION ALL SELECT 'nurture_show','confirm_tap_rate', date, CASE WHEN slots > 0 THEN confirmed::numeric / slots END, confirmed, slots, slots, NULL, confirmed FROM bk
  UNION ALL SELECT 'nurture_show','intro_media_view_rate', date, CASE WHEN intro_sent > 0 THEN intro_viewed::numeric / intro_sent END, intro_viewed, intro_sent, intro_sent, NULL, NULL FROM bk WHERE intro_sent > 0
  UNION ALL SELECT 'nurture_show','reschedule_rate', date, CASE WHEN made > 0 THEN reschedules::numeric / made END, reschedules, made, made, NULL, NULL FROM bkm
  UNION ALL SELECT 'comments_dms','public_sla_share', date, CASE WHEN replied > 0 THEN replied_in_sla::numeric / replied END, replied_in_sla, replied, replied, NULL, NULL FROM cm
  UNION ALL SELECT 'comments_dms','comment_origin_leads_wk', date, comment_leads, NULL, NULL, comment_leads, NULL, comment_leads FROM fl
  UNION ALL SELECT 'comments_dms','hide_sla_share', date, CASE WHEN hidden > 0 THEN hidden_in_sla::numeric / hidden END, hidden_in_sla, hidden, hidden, NULL, NULL FROM cm
  UNION ALL SELECT 'comments_dms','public_advice_statements', date, advice_comments, NULL, NULL, NULL, NULL, NULL FROM qg
  UNION ALL SELECT 'broker','disposition_rate', date, CASE WHEN att > 0 THEN disp::numeric / att END, disp, att, att, NULL, NULL FROM oc
  UNION ALL SELECT 'broker','calendar_fill', date, CASE WHEN total7 > 0 THEN booked7::numeric / total7 END, booked7, total7, total7, NULL, NULL FROM bd
  UNION ALL SELECT 'broker','onboarding_hours', date, hours, NULL, NULL, n, NULL, NULL FROM onb
  UNION ALL SELECT 'broker','quality_index', date, q, NULL, NULL, qn, NULL, NULL FROM oc WHERE qn > 0
  UNION ALL SELECT 'broker','good_fit_rate', date, CASE WHEN disp_any > 0 THEN gf::numeric / disp_any END, gf, disp_any, disp_any, NULL, gf FROM oc
  UNION ALL SELECT 'broker','replacement_claims_vs_cap', date, CASE WHEN cap > 0 THEN claimed::numeric / cap END, claimed, cap, claimed, NULL, NULL FROM rep
  UNION ALL SELECT 'billing','renewal_rate_cycle1', date, CASE WHEN ended > 0 THEN renewed::numeric / ended END, renewed, ended, ended, NULL, renewed FROM cyc_end
  UNION ALL SELECT 'billing','days_to_pay', date, days, NULL, NULL, n, NULL, NULL FROM inv
  UNION ALL SELECT 'billing','unmatched_credits', date, unmatched, NULL, NULL, NULL, NULL, NULL FROM bc
  UNION ALL SELECT 'billing','margin_per_cycle', date, margin, NULL, NULL, ended, NULL, NULL FROM cyc_end WHERE margin IS NOT NULL
  UNION ALL SELECT 'compliance','consent_stored_pct', date, CASE WHEN leads > 0 THEN consent_ok::numeric / leads END, consent_ok, leads, leads, NULL, NULL FROM fl
  UNION ALL SELECT 'compliance','disclosure_delivered_pct', date, CASE WHEN messaged > 0 THEN disclosed::numeric / messaged END, disclosed, messaged, messaged, NULL, NULL FROM fl
  UNION ALL SELECT 'compliance','stop_honoured_pct', date, CASE WHEN stops > 0 THEN honoured::numeric / stops END, honoured, stops, stops, NULL, NULL FROM stp
  UNION ALL SELECT 'compliance','days_since_cleanse', date, days_since_cleanse, NULL, NULL, NULL, NULL, NULL FROM comp_today WHERE days_since_cleanse IS NOT NULL
  UNION ALL SELECT 'compliance','advice_statements', date, advice_all, NULL, NULL, NULL, NULL, NULL FROM qg
  UNION ALL SELECT 'compliance','dsr_overdue', date, dsr_overdue, NULL, NULL, NULL, NULL, NULL FROM comp_today
  UNION ALL SELECT 'infra_cost','uptime_pct', date, uptime_pct, NULL, NULL, NULL, NULL, NULL FROM sysd WHERE uptime_pct IS NOT NULL
  UNION ALL SELECT 'infra_cost','webhook_p95_ms', date, webhook_p95_ms, NULL, NULL, webhook_count, NULL, NULL FROM sysd WHERE webhook_p95_ms IS NOT NULL
  UNION ALL SELECT 'infra_cost','webhook_error_rate', date, CASE WHEN webhook_count > 0 THEN webhook_errors::numeric / webhook_count END, webhook_errors, webhook_count, webhook_count, NULL, NULL FROM sysd WHERE webhook_count > 0
  UNION ALL SELECT 'infra_cost','system_cost_per_lead', c.date, CASE WHEN f.leads > 0 THEN c.sys_cost / f.leads END, c.sys_cost, f.leads, f.leads, NULL, NULL FROM cost c LEFT JOIN fl f ON f.date = c.date WHERE c.sys_cost IS NOT NULL
  UNION ALL SELECT 'infra_cost','tokens_zar_per_agent', date, llm, NULL, NULL, NULL, NULL, NULL FROM cost WHERE llm IS NOT NULL
  UNION ALL SELECT 'build','tasks_blocked', date, blocked, NULL, NULL, NULL, NULL, NULL FROM bs
  UNION ALL SELECT 'build','acceptance_tests_failing', date, failing, NULL, NULL, NULL, NULL, NULL FROM bs
  UNION ALL SELECT 'build','gates_waiting', date, gates, NULL, NULL, NULL, NULL, NULL FROM bs
  UNION ALL SELECT 'build','commits_24h', date, commits, NULL, NULL, NULL, NULL, NULL FROM bs
)
SELECT l.faculty, l.metric, l.date,
       round(l.value::numeric, 6)        AS value,
       l.numerator::numeric              AS numerator,
       l.denominator::numeric            AS denominator,
       l.n::numeric                      AS n,
       l.spend_zar::numeric              AS spend_zar,
       l.conversions::numeric            AS conversions,
       facts.include_synthetic()         AS seed,
       sum(l.numerator::numeric)   OVER r7 AS numerator_7d,
       sum(l.denominator::numeric) OVER r7 AS denominator_7d,
       round(sum(l.numerator::numeric) OVER r7 / nullif(sum(l.denominator::numeric) OVER r7, 0), 6) AS value_7d
FROM l
WINDOW r7 AS (PARTITION BY l.faculty, l.metric ORDER BY l.date RANGE BETWEEN interval '6 days' PRECEDING AND CURRENT ROW);
COMMENT ON VIEW facts.pulse_daily IS 'SMC I-14 / optimisation data-contract: long format for W32. seed = rows include synthetic data (SET smc.include_synthetic). *_7d = rolling 7-day sums (NH-AD-06).';

-- Daily series for the console sparklines (watchlist tiles 1–4, rolling 28-day values per day)
CREATE OR REPLACE VIEW facts.v_watchlist_daily AS
WITH days AS (
  SELECT gs::date AS date FROM generate_series(facts.sa_date(now()) - 27, facts.sa_date(now()), interval '1 day') gs
)
SELECT d.date, 1 AS metric_no,
       (SELECT CASE WHEN count(*) > 0 THEN round(
           (SELECT coalesce(sum(fc.amount_zar), 0) FROM facts.fact_cost fc WHERE fc.kind = 'media' AND fc.date BETWEEN d.date - 27 AND d.date)
           / count(*), 2) END
          FROM facts.fact_outcome fo WHERE fo.good_fit AND fo.outcome = 'attended' AND fo.slot_date BETWEEN d.date - 27 AND d.date) AS value
FROM days d
UNION ALL
SELECT d.date, 2,
       (SELECT round(count(*) FILTER (WHERE fl.verified_within_72h)::numeric / nullif(count(*), 0), 4)
          FROM facts.fact_lead fl WHERE fl.verify_window_closed AND fl.created_date BETWEEN d.date - 27 AND d.date)
FROM days d
UNION ALL
SELECT d.date, 3,
       (SELECT round(count(*) FILTER (WHERE fo.outcome = 'attended')::numeric
                     / nullif(count(*) FILTER (WHERE fo.outcome IN ('attended','no_show')), 0), 4)
          FROM facts.fact_outcome fo WHERE fo.slot_date BETWEEN d.date - 27 AND d.date)
FROM days d
UNION ALL
SELECT d.date, 4,
       (SELECT round(count(*) FILTER (WHERE fo.good_fit)::numeric
                     / nullif(count(*) FILTER (WHERE fo.disposition_code IS NOT NULL), 0), 4)
          FROM facts.fact_outcome fo WHERE fo.outcome = 'attended' AND fo.slot_date BETWEEN d.date - 27 AND d.date)
FROM days d;

-- -----------------------------------------------------------------------------
-- 20. ops read functions for W32/W33 (optimisation/data-contract.md) — bodies owed in I-14
-- -----------------------------------------------------------------------------
-- Redaction used for every judge sample: e-mail addresses, numbers of 7+ digits (phones, ID numbers).
CREATE OR REPLACE FUNCTION ops.redact(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(p, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
           '\+?\d[\d \-]{5,}\d', '[number]', 'g')
$$;

-- ops.judge_samples(date): one row per rubric with its samples (4.15 counts). Excludes W32/W33 output.
CREATE OR REPLACE FUNCTION ops.judge_samples(p_date date)
RETURNS TABLE (rubric text, samples jsonb[])
LANGUAGE sql STABLE
SET search_path = public, ops, facts
AS $$
WITH conv AS (
  SELECT c.lead_id,
         bool_or(c.guardrail_trip OR c.handoff) AS flagged,
         bool_or(c.direction = 'inbound' AND c.template_name IS NULL AND length(coalesce(c.content, '')) >= 20) AS free_text
    FROM public.communications c
   WHERE c.brand_id IS NOT NULL AND c.lead_id IS NOT NULL AND c.channel = 'whatsapp'
     AND facts.sa_date(c.created_at) = p_date
     AND coalesce(c.workflow, '') NOT IN ('W32','W33')
   GROUP BY c.lead_id
),
conv_ranked AS (
  SELECT cv.*,
         row_number() OVER (PARTITION BY cv.free_text AND NOT cv.flagged ORDER BY md5(cv.lead_id::text || p_date::text)) AS rn_free,
         md5(cv.lead_id::text || p_date::text) AS shuffle
    FROM conv cv
),
conv_pick AS (
  SELECT * FROM conv_ranked
   ORDER BY flagged DESC, (free_text AND NOT flagged AND rn_free <= 5) DESC, shuffle
   LIMIT greatest(20, (SELECT count(*) FROM conv WHERE flagged))
),
conv_samples AS (
  SELECT jsonb_build_object(
           'sample_ref', 'conv:' || facts.lead_key(p.lead_id) || ':' || p_date,
           'author', 'conversation-designer',
           'flagged', p.flagged,
           'flow_state', l.conv_state,
           'stage', l.stage,
           'booking', (SELECT jsonb_build_object('method', a.method, 'status', a.status, 'starts_at', a.appointment_date, 'booked_via', a.booked_via)
                         FROM public.appointments a WHERE a.client_id = p.lead_id AND a.brand_id IS NOT NULL
                         ORDER BY a.created_at DESC LIMIT 1),
           'messages', (SELECT jsonb_agg(jsonb_build_object('at', c.created_at, 'direction', c.direction, 'author', c.author,
                                                            'template', c.template_name, 'intent', c.intent,
                                                            'guardrail_rule', c.guardrail_rule, 'text', ops.redact(c.content))
                                         ORDER BY c.created_at)
                          FROM public.communications c
                         WHERE c.lead_id = p.lead_id AND c.channel = 'whatsapp'
                           AND facts.sa_date(c.created_at) = p_date)) AS s
    FROM conv_pick p JOIN public.leads l ON l.id = p.lead_id
),
cmt AS (
  SELECT jsonb_build_object('sample_ref', 'comment:' || cm.comment_id, 'author', 'community-response-lead',
                            'class', cm.class, 'text', ops.redact(cm.text_redacted), 'hidden', cm.hidden,
                            'public_reply_id', cm.public_reply_id, 'decision', cm.decision, 'ad_id', cm.ad_id) AS s
    FROM public.comments cm
   WHERE cm.replied_at IS NOT NULL AND facts.sa_date(cm.replied_at) = p_date
   ORDER BY md5(cm.comment_id || p_date::text) LIMIT 20
),
brief AS (
  SELECT jsonb_build_object('sample_ref', 'brief:' || c.id, 'author', 'W09',
                            'text', ops.redact(c.content), 'template', c.template_name, 'at', c.created_at) AS s
    FROM public.communications c
   WHERE c.brand_id IS NOT NULL AND c.workflow = 'W09' AND c.direction = 'outbound' AND c.recipient_type = 'broker'
     AND facts.sa_date(c.created_at) = p_date
   ORDER BY md5(c.id::text) LIMIT 5
),
rpt AS (
  SELECT jsonb_build_object('sample_ref', 'report:' || r.id, 'author', 'analytics-reporter',
                            'kind', r.report_kind, 'edition', r.edition, 'payload', r.report_data, 'ask', r.ask) AS s
    FROM public.report_history r
   WHERE r.brand_id IS NOT NULL AND facts.sa_date(r.created_at) = p_date
),
crt AS (
  SELECT jsonb_build_object('sample_ref', 'creative:' || q.id, 'author', 'creative-strategist',
                            'ad_name', q.ad_name, 'primary_text', q.primary_text, 'headline', q.headline,
                            'description', q.description, 'preview_urls', to_jsonb(q.preview_urls),
                            'compliance_gate', q.compliance_gate, 'status', q.status) AS s
    FROM public.creative_queue q
   WHERE q.status IN ('in_review','approved','published')
     AND q.updated_at >= (p_date::timestamp AT TIME ZONE 'Africa/Johannesburg') - interval '1 day'
     AND q.updated_at <  ((p_date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
),
page AS (
  SELECT jsonb_build_object('sample_ref', 'page:' || a.id, 'author', 'landing-page-builder',
                            'url', a.url, 'build_sha', a.build_sha, 'axe', a.axe, 'lighthouse', a.lighthouse,
                            'page_text', a.page_text) AS s
    FROM ops.page_audits a
   WHERE facts.sa_date(a.audited_at) <= p_date
   ORDER BY a.audited_at DESC LIMIT 1
)
SELECT 'whatsapp-conversation', coalesce((SELECT array_agg(s) FROM conv_samples), '{}'::jsonb[])
UNION ALL SELECT 'comment-reply',  coalesce((SELECT array_agg(s) FROM cmt),   '{}'::jsonb[])
UNION ALL SELECT 'pre-call-brief', coalesce((SELECT array_agg(s) FROM brief), '{}'::jsonb[])
UNION ALL SELECT 'report',         coalesce((SELECT array_agg(s) FROM rpt),   '{}'::jsonb[])
UNION ALL SELECT 'creative',       coalesce((SELECT array_agg(s) FROM crt),   '{}'::jsonb[])
UNION ALL SELECT 'landing-page',   coalesce((SELECT array_agg(s) FROM page),  '{}'::jsonb[])
$$;

-- ops.proposal_actuals(date): approved/done proposals due for grading; numbers from facts.pulse_daily, not the model.
-- actual   = 7 days ending check_date (ratio of sums for p-metrics, mean otherwise)
-- baseline = 7 days before the decision (falls back to number_at_decision)
-- limits   = mean ± 3 sd of the 28 daily values before the decision
CREATE OR REPLACE FUNCTION ops.proposal_actuals(p_date date)
RETURNS TABLE (proposal_id uuid, faculty text, title text, metric text, forecast text, baseline numeric, actual numeric,
               n numeric, limits jsonb, test text, kill_rule text, check_date date)
LANGUAGE sql STABLE
SET search_path = public, ops, facts
AS $$
WITH p AS (
  SELECT pr.*, facts.sa_date(coalesce(pr.decided_at, pr.created_at)) AS d_date
    FROM ops.proposals pr
   WHERE pr.status IN ('approved','done') AND pr.check_date IS NOT NULL AND pr.check_date <= p_date AND pr.verdict IS NULL
)
SELECT p.id, p.faculty, p.title, p.metric, p.forecast,
       coalesce(b.v, p.number_at_decision) AS baseline,
       a.v AS actual,
       a.n,
       lim.j AS limits,
       p.test, p.kill_rule, p.check_date
FROM p
LEFT JOIN LATERAL (
  SELECT CASE WHEN sum(pd.denominator) > 0 THEN round(sum(pd.numerator) / sum(pd.denominator), 6) ELSE round(avg(pd.value), 6) END AS v,
         coalesce(sum(pd.n), count(pd.value)) AS n
    FROM facts.pulse_daily pd
   WHERE pd.metric = p.metric AND pd.date BETWEEN p.check_date - 6 AND p.check_date
) a ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN sum(pd.denominator) > 0 THEN round(sum(pd.numerator) / sum(pd.denominator), 6) ELSE round(avg(pd.value), 6) END AS v
    FROM facts.pulse_daily pd
   WHERE pd.metric = p.metric AND pd.date BETWEEN p.d_date - 7 AND p.d_date - 1
) b ON true
LEFT JOIN LATERAL (
  SELECT jsonb_build_object('mean', round(avg(pd.value), 6), 'sd', round(stddev_samp(pd.value), 6),
                            'lcl', round(avg(pd.value) - 3 * coalesce(stddev_samp(pd.value), 0), 6),
                            'ucl', round(avg(pd.value) + 3 * coalesce(stddev_samp(pd.value), 0), 6),
                            'days', count(pd.value)) AS j
    FROM facts.pulse_daily pd
   WHERE pd.metric = p.metric AND pd.date BETWEEN p.d_date - 28 AND p.d_date - 1
) lim ON true
$$;

-- ops.notifications_due(): W32 escalation ladder for its own rows (W22 escalates kind 'alert' itself).
--   resend_other_partner : red, unacked ≥ 2 h, not yet resent (escalated_at null)
--   call                 : red, unacked ≥ 4 h, not yet called
--   reminder             : approval/action unactioned ≥ 24 h (proposal still proposed), not yet reminded
CREATE OR REPLACE FUNCTION ops.notifications_due()
RETURNS TABLE (id uuid, "to" text, stage text, what text, impact text, first_action text, title text, moves text,
               cost_zar numeric, grade text, owner_agent text, proposal_id uuid)
LANGUAGE sql STABLE
SET search_path = public, ops
AS $$
SELECT n.id, coalesce(n."to", n.recipient), s.stage, n.what, n.impact, n.first_action,
       pr.title, pr.metric, pr.cost_zar, pr.grade, pr.owner_agent, n.proposal_id
FROM ops.notifications n
LEFT JOIN ops.proposals pr ON pr.id = n.proposal_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN (n.severity = 'red' OR n.kind IN ('red','pulse_red_email')) AND n.acked_at IS NULL
         AND coalesce(n.first_sent_at, n.sent_at) <= now() - interval '4 hours' AND n.called_at IS NULL     THEN 'call'
    WHEN (n.severity = 'red' OR n.kind IN ('red','pulse_red_email')) AND n.acked_at IS NULL
         AND coalesce(n.first_sent_at, n.sent_at) <= now() - interval '2 hours' AND n.escalated_at IS NULL  THEN 'resend_other_partner'
    WHEN n.kind IN ('approval','action') AND n.acked_at IS NULL AND pr.status = 'proposed'
         AND coalesce(n.first_sent_at, n.sent_at) <= now() - interval '24 hours' AND n.reminded_at IS NULL  THEN 'reminder'
  END AS stage) s
WHERE n.kind <> 'alert' AND s.stage IS NOT NULL
ORDER BY n.created_at
$$;

-- W22 metric view (automation/W22.md §4): backups, restore tests, secrets + the funnel branches owed by platform-architect
CREATE OR REPLACE VIEW ops.w22_metrics AS
SELECT 'backup_hours_since_success'::text AS metric, 'global'::text AS scope,
       COALESCE(EXTRACT(epoch FROM now() - max(finished_at)) / 3600, 9999)::numeric AS value,
       0::numeric AS n, '{}'::jsonb AS context, max(finished_at) AS since
  FROM ops.backup_runs WHERE kind = 'pg_dump' AND ok
UNION ALL
SELECT 'restore_test_days_since', 'global',
       COALESCE(EXTRACT(epoch FROM now() - max(finished_at)) / 86400, 9999)::numeric, 0, '{}'::jsonb, max(finished_at)
  FROM ops.backup_runs WHERE kind = 'restore_test' AND ok
UNION ALL
SELECT 'secret_days_to_expiry', 'secret:' || name,
       (EXTRACT(epoch FROM expires_at - now()) / 86400)::numeric, 0, '{}'::jsonb, now()
  FROM ops.secret_inventory WHERE expires_at IS NOT NULL
UNION ALL   -- funnel per campaign, current cycles to date
SELECT 'raw_cpl_zar', 'campaign:' || a.campaign_id,
       round(sum(a.spend_zar) / nullif(sum(coalesce(a.leads_meta, a.leads)), 0), 2), sum(coalesce(a.leads_meta, a.leads)),
       jsonb_build_object('spend_zar', sum(a.spend_zar)), min(a.date)::timestamptz
  FROM facts.fact_ad_day a
 WHERE a.campaign_id IS NOT NULL
   AND a.date >= coalesce((SELECT facts.sa_date(min(c.starts_at)) FROM public.cycles c WHERE c.status IN ('active','extended')), facts.sa_date(now()) - 29)
 GROUP BY a.campaign_id
UNION ALL
SELECT 'qualify_rate', 'campaign:' || a.campaign_id,
       round(sum(a.qualified)::numeric / nullif(sum(coalesce(a.leads_meta, a.leads)), 0), 4), sum(coalesce(a.leads_meta, a.leads)),
       jsonb_build_object('spend_zar', sum(a.spend_zar)), min(a.date)::timestamptz
  FROM facts.fact_ad_day a
 WHERE a.campaign_id IS NOT NULL
   AND a.date >= coalesce((SELECT facts.sa_date(min(c.starts_at)) FROM public.cycles c WHERE c.status IN ('active','extended')), facts.sa_date(now()) - 29)
 GROUP BY a.campaign_id
UNION ALL
SELECT 'cost_per_qualified_zar', 'campaign:' || a.campaign_id,
       round(sum(a.spend_zar) / nullif(sum(a.qualified) FILTER (WHERE true), 0), 2), sum(a.qualified),
       jsonb_build_object('days_live', count(DISTINCT a.date)), min(a.date)::timestamptz
  FROM facts.fact_ad_day a
 WHERE a.campaign_id IS NOT NULL
   AND a.date >= coalesce((SELECT facts.sa_date(min(c.starts_at)) FROM public.cycles c WHERE c.status IN ('active','extended')), facts.sa_date(now()) - 29)
 GROUP BY a.campaign_id
UNION ALL
SELECT 'show_rate_14d', coalesce('broker:' || o.broker_id::text, 'global'),
       round(count(*) FILTER (WHERE o.outcome = 'attended')::numeric / nullif(count(*) FILTER (WHERE o.outcome IN ('attended','no_show')), 0), 4),
       count(*) FILTER (WHERE o.outcome IN ('attended','no_show')), '{}'::jsonb, now()
  FROM facts.fact_outcome o
 WHERE o.slot_date >= facts.sa_date(now()) - 13
 GROUP BY GROUPING SETS ((o.broker_id), ())
UNION ALL
SELECT 'first_message_sla_breaches', 'global',
       count(*) FILTER (WHERE l.first_message_at IS NULL AND l.created_at <= now() - interval '60 seconds'
                           OR l.first_message_at - l.created_at > interval '60 seconds')::numeric,
       count(*),
       jsonb_build_object('worst_seconds', max(extract(epoch FROM (coalesce(l.first_message_at, now()) - l.created_at)))::integer),
       now()
  FROM public.leads l
 WHERE l.brand_id IS NOT NULL AND NOT l.is_synthetic AND l.created_at >= now() - interval '15 minutes'
UNION ALL
SELECT 'leads_last_hour', 'global',
       (SELECT count(*) FROM public.leads l WHERE l.brand_id IS NOT NULL AND NOT l.is_synthetic AND l.created_at >= now() - interval '60 minutes')::numeric,
       0,
       jsonb_build_object('baseline_hourly_median_7d',
         (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY h.c) FROM (
            SELECT date_trunc('hour', l.created_at) AS hr, count(*) AS c FROM public.leads l
             WHERE l.brand_id IS NOT NULL AND NOT l.is_synthetic AND l.created_at >= now() - interval '7 days'
             GROUP BY 1) h)),
       now()
UNION ALL
SELECT 'oauth_refresh_failures_24h', 'broker:' || a.broker_id::text, count(*)::numeric, 0, '{}'::jsonb, min(a.occurred_at)
  FROM public.lead_activities a
 WHERE a.brand_id IS NOT NULL AND a.activity_type = 'calendar.refresh_failed' AND a.occurred_at >= now() - interval '24 hours'
 GROUP BY a.broker_id;
COMMENT ON VIEW ops.w22_metrics IS 'SMC W22 §4: one row per metric per scope. oauth failures are lead_activities rows activity_type calendar.refresh_failed (W04/W05 write them).';

-- -----------------------------------------------------------------------------
-- 21. Portal and console RPCs (one tap, Close) — broker writes that are not plain profile edits
-- -----------------------------------------------------------------------------
-- First login / last seen (portal/spec README "Clocks"); safe to call on every page load.
CREATE OR REPLACE FUNCTION public.smc_portal_touch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_broker uuid := public.smc_current_broker_id();
BEGIN
  IF v_broker IS NULL THEN RETURN; END IF;
  PERFORM set_config('smc.source', 'portal_rpc', true);
  UPDATE public.brokers
     SET first_login_at = coalesce(first_login_at, now()),
         onboarding_last_progress_at = coalesce(onboarding_last_progress_at, now()),
         last_seen_at = now()
   WHERE id = v_broker AND brand_id IS NOT NULL;
END $$;

-- Portal events → the stamped timeline (HubSpot) = the W20 outbox. A Supabase database webhook on
-- lead_activities (workflow = 'portal') calls W20 with the server-side signature; the browser holds no secret.
-- Steps a broker may self-complete: video watched/skipped, availability "Looks right", media skipped.
CREATE OR REPLACE FUNCTION public.smc_portal_event(p_type text, p_step text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb, p_event_id uuid DEFAULT gen_random_uuid())
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_broker uuid := public.smc_current_broker_id();
  v_brand  uuid;
  v_status text;
BEGIN
  IF v_broker IS NULL THEN
    RAISE EXCEPTION 'smc_portal_event: not a broker' USING ERRCODE = '42501';
  END IF;
  IF p_type NOT IN ('step.completed','step.skipped','fsp.submitted','calendar.fallback_chosen','card.approved',
                    'report.ask','support.message','profile.saved','availability.saved','outcome.marked') THEN
    RAISE EXCEPTION 'smc_portal_event: unknown type %', p_type USING ERRCODE = '22023';
  END IF;
  SELECT b.brand_id INTO v_brand FROM public.brokers b WHERE b.id = v_broker;
  PERFORM set_config('smc.source', 'portal_rpc', true);

  IF p_type IN ('step.completed','step.skipped') THEN
    IF p_step = 'video' THEN
      v_status := CASE WHEN p_type = 'step.completed' THEN 'done' ELSE 'skipped' END;
      UPDATE public.brokers
         SET onboarding_progress = jsonb_set(onboarding_progress, '{video}', jsonb_build_object('status', v_status, 'done_at', now(), 'by', 'broker')),
             explainer_watched_at = CASE WHEN v_status = 'done' THEN coalesce(explainer_watched_at, now()) ELSE explainer_watched_at END,
             onboarding_last_progress_at = now()
       WHERE id = v_broker;
    ELSIF p_step = 'availability' AND p_type = 'step.completed' THEN
      UPDATE public.brokers
         SET onboarding_progress = jsonb_set(onboarding_progress, '{availability}', jsonb_build_object('status', 'done', 'done_at', now(), 'by', 'broker')),
             onboarding_last_progress_at = now()
       WHERE id = v_broker;
    ELSIF p_step = 'media' AND p_type = 'step.skipped' THEN
      UPDATE public.brokers
         SET onboarding_progress = jsonb_set(onboarding_progress, '{media}', jsonb_build_object('status', 'skipped', 'done_at', now(), 'by', 'broker')),
             onboarding_last_progress_at = now()
       WHERE id = v_broker;
    END IF;
    -- every other step is completed by W20 after its own checks (FSP, calendar, agreement, card)
  END IF;

  IF p_type = 'support.message' THEN
    INSERT INTO public.support_events (brand_id, broker_id, source, topic, note)
    VALUES (v_brand, v_broker, 'portal', coalesce(p_step, p_payload->>'topic', 'unknown'), left(p_payload->>'note', 1000));
  END IF;

  INSERT INTO public.lead_activities (brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (v_brand, v_broker, 'portal', 'broker', p_type,
          jsonb_build_object('event_id', p_event_id, 'type', p_type, 'broker_id', v_broker, 'step', p_step,
                             'occurred_at', now(), 'payload', coalesce(p_payload, '{}'::jsonb)),
          now(), 'portal:' || p_event_id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN p_event_id;
END $$;

-- Report "one ask" button (4.10a): mark done once, and log it on the timeline.
CREATE OR REPLACE FUNCTION public.smc_report_ask_done(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('smc.source', 'portal_rpc', true);
  UPDATE public.report_history
     SET ask_done_at = coalesce(ask_done_at, now())
   WHERE id = p_report_id AND brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'smc_report_ask_done: not found or not yours' USING ERRCODE = '42501';
  END IF;
  PERFORM public.smc_portal_event('report.ask', NULL, jsonb_build_object('report_id', p_report_id));
END $$;

-- Console: the watchlist tiles. Uses analytics' tile views (trend, traffic light, n) when they are
-- installed (analytics/watchlist.sql); falls back to facts.v_watchlist + v_watchlist_daily otherwise.
CREATE OR REPLACE FUNCTION public.smc_watchlist_tiles(p_include_synthetic boolean DEFAULT false)
RETURNS TABLE (metric_no integer, plain_name text, value numeric, value_label text, target numeric, unit text,
               n numeric, value_prev numeric, status text, trend jsonb, look_out text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, facts
AS $$
DECLARE
  v_sql text := '';
  r record;
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'smc_watchlist_tiles: admin only' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('smc.include_synthetic', CASE WHEN p_include_synthetic THEN 'on' ELSE 'off' END, true);
  IF to_regclass('facts.v_watchlist_1_cost_per_good_fit') IS NOT NULL THEN
    FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
              WHERE ns.nspname = 'facts' AND c.relname ~ '^v_watchlist_[1-7]_' ORDER BY c.relname LOOP
      v_sql := v_sql || CASE WHEN v_sql = '' THEN '' ELSE ' UNION ALL ' END ||
        format('SELECT tile_no::int, tile::text, value::numeric, NULL::text, target::numeric, unit::text, n::numeric, last_period::numeric, status::text, trend_28d::jsonb, look_out::text FROM facts.%I WHERE scope = %L', r.relname, 'ALL');
    END LOOP;
    RETURN QUERY EXECUTE v_sql || ' ORDER BY 1';
  ELSE
    RETURN QUERY
      SELECT w.metric_no::int, w.plain_name::text, w.value::numeric, w.value_label::text, w.target::numeric, w.unit::text,
             w.n::numeric, w.value_prev::numeric,
             CASE WHEN w.value IS NULL OR coalesce(w.n, 20) < 20 THEN 'grey' ELSE NULL END::text,
             (SELECT jsonb_agg(jsonb_build_object('d', d.date, 'v', d.value) ORDER BY d.date)
                FROM facts.v_watchlist_daily d WHERE d.metric_no = w.metric_no),
             w.what_to_watch::text
        FROM facts.v_watchlist w
       WHERE w.broker_id IS NULL
       ORDER BY w.metric_no;
  END IF;
END $$;
