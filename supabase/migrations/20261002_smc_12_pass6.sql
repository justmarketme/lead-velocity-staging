-- =============================================================================
-- 20261002_smc_12_pass6.sql  —  SortMyCover build, migration 12: integration pass 6 (I-38a, from W34)
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–12).
-- Additive and idempotent, same conventions as 01–11.
--   1. ops.notifications kinds: + dsar (W34 inserts), approval_confirmed (W32 "Confirm to approvers"), and the
--      W22 alert kinds W34/W19/W22 post (W22 itself stores them as kind 'alert' + signal_key; listed so a
--      direct insert never fails).
--   2. smc_erase_lead also clears leads.name/company/role, appointments.meeting_link/notes/reason_notes and
--      lead_conversations (columns that do not exist on this database are skipped, NH-11).
--   3. One hash rule: smc_hash_contact(phone) = sha256 hex of the E.164 DIGITS only (no "+", spaces or dashes) —
--      the rule W24 and W15 already apply in code. Emails keep lower(trim). Stored hashes recomputed where the
--      source value is still on the row.
--   4. obligations P7 (DSR in 30 days) and P8 (retention purge) seeded from the compliance register.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. notifications_kind_check
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_kind_check'
                  AND conrelid = 'ops.notifications'::regclass
                  AND pg_get_constraintdef(oid) LIKE '%w34_monthly_report%') THEN
    ALTER TABLE ops.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
    ALTER TABLE ops.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN
      ('daily_pulse','approval','red','weekly_memo','monthly_retro','build_gate','escalation_call',
       'pulse','action','action_reminder','confirm','red_email','red_resend','banner','pulse_red_email','weekly','weekly_email','monthly_email',
       'alert','lead_routed_out','ads_audit','ads_reminder','billing','go_live','portal',
       -- pass 6 (I-38a): W34 DSR tickets, W32 approver confirmation, W22 alert kinds from W19/W22/W34
       'dsar','approval_confirmed','approval_stuck','card_autorenew_off',
       'dsar_received','dsar_due','dsar_overdue','dsar_erased','broker_dsr_erase',
       'w34_retention_failure','w34_monthly_report'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3 (first, the erase function uses it). One hash rule.
-- Phone-like input (only digits, +, spaces, dashes, dots, brackets) → digits only, then SHA-256 hex.
-- Callers pass E.164 (+27…); a local 0… number is NOT rewritten to 27… here (W01/W03 normalise before storing).
-- Anything with '@' (or other text) keeps the email rule lower(trim).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_hash_contact_v1(p text)   -- the pre-pass-6 rule, kept only to find old hashes
RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN p IS NULL OR btrim(p) = '' THEN NULL
               ELSE encode(sha256(convert_to(lower(btrim(p)), 'UTF8')), 'hex') END $$;
REVOKE ALL ON FUNCTION public.smc_hash_contact_v1(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.smc_hash_contact(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE
            WHEN p IS NULL OR btrim(p) = '' THEN NULL
            WHEN btrim(p) ~ '^[+0-9 ()./-]+$' AND regexp_replace(p, '\D', '', 'g') <> ''
              THEN encode(sha256(convert_to(regexp_replace(p, '\D', '', 'g'), 'UTF8')), 'hex')
            ELSE encode(sha256(convert_to(lower(btrim(p)), 'UTF8')), 'hex')
          END $$;
COMMENT ON FUNCTION public.smc_hash_contact(text) IS
  'SMC single hash rule (I-38a): phone → SHA-256 hex of the E.164 digits only (no "+"), as W24/W15 hash in code; email → SHA-256 of lower(trim).';

-- One-off re-hash where the clear value is still on the row (pre-launch: synthetic rows only).
-- Hashes whose source is gone (erased leads, wa_threads after 72 h) cannot be recomputed and expire on their own.
DO $$
BEGIN
  PERFORM set_config('smc.source', 'migration', true);
  PERFORM set_config('smc.reason', 'I-38a single hash rule', true);
  UPDATE public.suppression s
     SET mobile_hash = public.smc_hash_contact(l.phone)
    FROM public.leads l
   WHERE s.lead_id = l.id AND l.phone NOT LIKE 'erased:%'
     AND s.mobile_hash = public.smc_hash_contact_v1(l.phone)
     AND s.mobile_hash IS DISTINCT FROM public.smc_hash_contact(l.phone)
     AND NOT EXISTS (SELECT 1 FROM public.suppression x            -- unique (mobile_hash, source)
                      WHERE x.mobile_hash = public.smc_hash_contact(l.phone) AND x.source = s.source);
  UPDATE public.dsr_requests d
     SET mobile_hash = public.smc_hash_contact(l.phone)
    FROM public.leads l
   WHERE d.lead_id = l.id AND l.phone NOT LIKE 'erased:%'
     AND d.mobile_hash = public.smc_hash_contact_v1(l.phone)
     AND d.mobile_hash IS DISTINCT FROM public.smc_hash_contact(l.phone);
  UPDATE public.dsr_requests d
     SET subject_hash = public.smc_hash_contact(l.phone)
    FROM public.leads l
   WHERE d.lead_id = l.id AND l.phone NOT LIKE 'erased:%'
     AND d.subject_hash = public.smc_hash_contact_v1(l.phone)
     AND d.subject_hash IS DISTINCT FROM public.smc_hash_contact(l.phone);
  UPDATE public.leads l
     SET dedupe_hash = public.smc_hash_contact(l.phone)
   WHERE l.brand_id IS NOT NULL AND l.phone NOT LIKE 'erased:%'
     AND l.dedupe_hash IS DISTINCT FROM public.smc_hash_contact(l.phone);
END $$;

-- -----------------------------------------------------------------------------
-- 2. smc_erase_lead — wider PII coverage (W34). Same signature, same actions, same audit/retention log.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_erase_lead(p_lead_id uuid, p_action text, p_policy text, p_dsr_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_hash  text;
  v_set   text;
BEGIN
  IF p_action NOT IN ('pseudonymise','delete','purge_ip_ua') THEN
    RAISE EXCEPTION 'smc_erase_lead: unknown action %', p_action;
  END IF;
  SELECT brand_id, public.smc_hash_contact(phone) INTO v_brand, v_hash FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'smc_erase_lead: lead % is not a SortMyCover lead (legacy rows are out of scope)', p_lead_id;
  END IF;
  PERFORM set_config('smc.source', 'n8n', true);
  PERFORM set_config('smc.reason', 'W34 ' || p_action || ' / ' || p_policy, true);

  IF p_action = 'purge_ip_ua' THEN
    UPDATE public.leads SET client_ip = NULL, client_user_agent = NULL WHERE id = p_lead_id;
  ELSE
    UPDATE public.communications
       SET content = NULL, subject = NULL, recipient_contact = 'erased', redacted = true,
           metadata = '{}'::jsonb, call_recording_url = NULL
     WHERE lead_id = p_lead_id;
    UPDATE public.outcomes SET transcript = NULL, summary = NULL, voice_note_url = NULL WHERE lead_id = p_lead_id;
    UPDATE public.lead_pulse SET line = NULL WHERE lead_id = p_lead_id;
    UPDATE public.appointments SET call_number = NULL, join_url = NULL, ics_url = NULL WHERE client_id = p_lead_id;
    -- pass 6: free-text / link columns that exist on some CRM versions only (NH-11) — cleared when present
    SELECT string_agg(format('%I = NULL', a.attname), ', ') INTO v_set
      FROM pg_attribute a
     WHERE a.attrelid = 'public.appointments'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND NOT a.attnotnull
       AND a.attname IN ('meeting_link','notes','reason_notes');
    IF v_set IS NOT NULL THEN
      EXECUTE format('UPDATE public.appointments SET %s WHERE client_id = $1', v_set) USING p_lead_id;
    END IF;
    IF to_regclass('public.lead_conversations') IS NOT NULL THEN
      IF p_action = 'pseudonymise' THEN
        UPDATE public.lead_conversations SET message = '[erased]' WHERE lead_id = p_lead_id;
      ELSE
        DELETE FROM public.lead_conversations WHERE lead_id = p_lead_id;
      END IF;
    END IF;
    IF p_action = 'pseudonymise' THEN
      UPDATE public.leads
         SET first_name = NULL, last_name = NULL, email = NULL,
             phone = 'erased:' || coalesce(v_hash, p_lead_id::text),
             call_number = NULL, alt_number = NULL, address = NULL, notes = NULL,
             client_ip = NULL, client_user_agent = NULL, conv_state = NULL,
             fbclid = NULL, fbp = NULL, fbc = NULL, ctwa_clid = NULL
       WHERE id = p_lead_id;
      SELECT string_agg(format('%I = NULL', a.attname), ', ') INTO v_set
        FROM pg_attribute a
       WHERE a.attrelid = 'public.leads'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND NOT a.attnotnull
         AND a.attname IN ('name','company','role');
      IF v_set IS NOT NULL THEN
        EXECUTE format('UPDATE public.leads SET %s WHERE id = $1', v_set) USING p_lead_id;
      END IF;
    ELSE
      DELETE FROM public.communications WHERE lead_id = p_lead_id;
      DELETE FROM public.leads WHERE id = p_lead_id;   -- cascades: lead_activities, appointments, outcomes, replacements, lead_pulse
    END IF;
  END IF;

  INSERT INTO public.retention_log (table_name, row_id, action, policy, dsr_id)
  VALUES ('public.leads', p_lead_id::text, p_action, p_policy, p_dsr_id);
END $function$;
REVOKE ALL ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) TO n8n_app;

-- -----------------------------------------------------------------------------
-- 4. Compliance register rows W34 updates (deliverables/contracts-drafter/compliance-register.md P7/P8)
-- -----------------------------------------------------------------------------
INSERT INTO public.obligations (code, description, owner, status) VALUES
  ('P7', 'Data-subject requests answered within 30 days (dsr_requests; W34 clock)', 'Jonathan; W34', 'open'),
  ('P8', 'Retention per 1.5: nightly W34 purge, same periods as the privacy notice (retention_log)', 'devops-security (W34); contracts-drafter', 'open')
ON CONFLICT (code) DO NOTHING;
