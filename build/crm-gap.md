# /build/crm-gap.md — CRM gap map (every table, screen and workflow in the master prompt → reuse as-is / extend / new)

**Owner:** `platform-architect` · **Task:** `P0-INVENTORY` · **Date:** 2026-10-02 · **Reads with:** `/build/inventory.md` (the `INV-*` IDs cited below).
**Rule (0.2 + pre-mortem #8):** when the repo has a thing, adapt it; when this map says **new**, build it; never both. Every later platform task cites the row it implements. Anything here that turns out wrong against the live database → `needs_human`, not a guess.

**Outcome legend (exactly one per row):**
- **reuse as-is** — use the existing table/screen/function unchanged (security fixes from NH-15 aside).
- **extend** — keep the existing object and add columns, values, screens or a code path; never fork it.
- **new** — nothing in the repo does this; build it (cite why in "Existing").

**Design rules that apply to every row (from my five):**
- *HubSpot:* one stamped timeline per lead — every workflow writes a `lead_activities` event (W-id, actor, payload) alongside its own row.
- *Salesforce:* admin vs broker enforced by RLS in the database (`has_role()` + `brokers.user_id = auth.uid()` pattern, INV-A06); every write to a SortMyCover table lands in `audit_log`.
- *GoHighLevel:* one system for ads + funnel + messaging + billing, with ads driven through the Marketing API directly.
- *Pipedrive:* every lead row carries a stage and a stage-entered time; a broker's week fits one screen.
- *Close:* operator actions are one tap / one key (pause ad, mark outcome, assign payment, approve broker).
- **Coexistence:** the existing B2B product (INV §0 item 2) keeps working. SortMyCover rows are identified by a non-null `brand_id`; legacy rows keep `brand_id = null`. No multi-tenant abstraction beyond that one key (deliberately not copied: multi-tenancy before broker #2). Pending NH-14.

---

## A. Tables

### A1. Core objects (the lead's path and the broker's cycle)
| Target (prompt §) | Existing thing it maps onto | Outcome | What is added / changed | Implemented by |
|---|---|---|---|---|
| `brands` (4.6, W27, W28) | none — no consumer-brand or Meta asset store anywhere (INV-I16) | **new** | All 4.6 columns (`brand_id`, `name`, `domain`, `staging_url`, `business_id`, `page_id`, `ig_user_id`, `waba_id`, `phone_number_id`, `standby_phone_number_id`, `ad_account_id`, `standby_ad_account_id`, `pixel_id`, `dataset_id`, `app_id`, `system_user_token_ref`, `booking_flow_id`, `flow_public_key_ref`, `handles jsonb`, `verification_status`, `disclosure_text`, `brand_kit_url`) + `booking_ui` (`list`/`flow`, W28) + W27 health fields (`page_status`, `ig_status`, `bv_status`, `ad_account_status`, `waba_quality`, `template_status jsonb`, `emq`, `health_checked_at`). `*_ref` columns hold secret **names** only (values in `.env`/Vault). Rows: SortMyCover, CoverKlaar. | platform-architect; W27 writes health |
| `brokers` (4.6, 6.1, 3.6) | `brokers` (INV-T03): `firm_name`, `contact_person`, `email`, `whatsapp_number`, `calendar_email`, `google_calendar_token`, `tier`, `status`, `preferred_language` | **extend** | Map, don't rename (existing UI reads them): `practice_name`≙`firm_name`, `adviser_name`≙`contact_person`, `adviser_whatsapp`≙`whatsapp_number`, `calendar_id`≙`calendar_email`. **Add:** `brand_id`, `tier_code` (FK `pricing`; legacy `tier` text kept read-only), `fsp_number`, `fsp_verified_at`, `fsp_check jsonb`, `calendar_provider` (`outlook` default/`google`), `ms_tenant_id`, `calendar_token_ref` (token in Vault, not jsonb — the existing `google_calendar_token` column is not used for new data), `methods_supported text[]`, `meeting_hours jsonb`, `slot_minutes`(30), `buffer_minutes`(15), `min_notice_hours`(2), `horizon_days`(14), `max_meetings_per_day`(3), `max_meetings_per_week`(12), `bookings_paused`, `add_client_as_attendee`, `routing_rules jsonb`, `routing_on`, `headshot_url`, `bio_short`, `languages text[]`, `years_advising`, `intro_card_url`, `intro_voice_url jsonb` (per language), `intro_video_url jsonb`, `intro_media_pref`, `positioning_answers jsonb`, `consent_mode` (`named` default, 0.1), `onboarding_step`, `onboarding_progress jsonb`, `explainer_watched_at`, `approved_live_by/at`, `current_cycle_id`, `card_autorenew`, `paystack_customer_code`, `close_rate`, `avg_commission` (broker-entered, ROI view only — never in any fee, 3.7/FAIS). **Status:** widen the CHECK to `onboarding · onboarded · ready_for_go_live · active · paused · ended` alongside legacy `Active/Inactive`; 4.6 `active` = a generated boolean from `status`. Broker #2 = one new row (true north). Root-SQL `lead_quota/leads_used` (never applied) are superseded by `cycles`. | platform-architect (schema), broker-success (wizard writes) |
| `pricing` (3.6) | none as a table. Prices are **hard-coded** in `ProposalGenerator.tsx`, `InvoiceGenerator.tsx`, `ContractGenerator.tsx` (INV-G01…G03), `src/pages/Pricing.tsx`, `src/pages/Promotions.tsx`, `src/hooks/useChatbot.ts`, `supabase/functions/_shared/knowledge.ts` | **new** | `tier_code`, `name`, `price_zar`, `committed_leads`, `replacement_cap_cycle`, `media_share_zar`, `paystack_page_code`, `paystack_plan_code`, `active_from`, `active_to`, `vat_rate` (null until registered). Seeds Bronze/Silver/Gold per 3.5 once Q5 is answered. All seven hard-coded sites are rewired to read it (W25 diff check enforces). | billing-automation owns rows; platform-architect owns table + RLS (admin write, broker read own tier) |
| `cycles` (0.2 linkage, 6.1 step 7, 0.1 shortfall) | none (`brokers.lead_quota/leads_used` in root `MIGRATION_PREMIUM_PORTAL.sql`, not applied) | **new** | `cycle_id`, `broker_id`, `tier_code`, snapshot `price_zar`/`committed_leads`/`replacement_cap`, `starts_at`, `ends_at`, `extended_until` (≤ +14 d), `status` (`scheduled/active/extended/closed/not_renewed`), `invoice_id`, `renewal_offer_sent_at`, `shortfall_credit_zar`, `policies_written_reported` (voluntary, ROI only). View `v_cycle_progress` gives Mark's line: *committed 20 · verified X · booked Y · attended Z · replacements N/4*. New cycle row on payment (W16). | platform-architect; billing-automation writes |
| `leads` (0.2, 3.3, 4.6, 6.3) | `leads` (INV-T04): `broker_id` ✓, `first_name` ✓, `last_name`, `phone`, `email` (NOT NULL), `source`, `current_status`, `notes` | **extend** | **Keep** `broker_id` (routing writes it before the first WhatsApp), `phone` (= `mobile`, E.164). **Change:** drop NOT NULL on `email` (0.1 Email rule). **Add — linkage:** `brand_id`, `tier_code`, `cycle_id`, `routed_at`, `routing_reason`. **Attribution (6.3 + `automation/capi/event-spec.md`):** `origin` (page/lead_ad/ctwa/comment/dm), `campaign_id`, `adset_id`, `ad_id`, `concept`, `angle`, `placement`, `utm_source/medium/campaign/content/term`, `fbclid`, `fbp`, `fbc`, `lead_event_id` (browser `event_id`), `leadgen_id`, `ctwa_clid`, `ref`, `page_url`, `client_ip`, `client_user_agent` (both purged after CAPI send). **Consent (2.1.2):** `consent_text`, `consent_text_version`, `consent_at`, `consent_page_url`, `consent_source`, `consent_mode_at_capture`, `consent_ads_at`. **Verification (3.3):** `line_type`, `wa_delivered_at`, `verified_at`, `disclosure_msg_id`, `disclosure_delivered_at`. **Qualification:** `age_band`, `budget_band`, `has_bond`, `has_dependants`, `preferred_method`, `qualified`, `disqualified_reason`, `dedupe_hash` + `duplicate_of` (90-day rule). **Contact data (4.6):** `email_status`, `email_purpose`, `call_number`, `call_number_line_type`, `alt_number`, `alt_purpose`, `best_time`, `language`. **State:** `stage` (Pipedrive bar: `new → disclosed → verified → qualified → booked → confirmed → attended/no_show → dispositioned`, plus `unbooked_closed`, `opted_out`, `replacement_due`) + `stage_entered_at`, `conv_state jsonb` (W07 memory), `opted_out_at`, `health_flag` (boolean only — never the detail, 2.1.7), `retention_delete_after`, `is_synthetic` (test data). Legacy `current_status` untouched for legacy rows. **RLS:** brokers keep SELECT on own rows; for `brand_id` rows broker UPDATE is limited to outcome actions (via `outcomes`), not lead fields. | platform-architect; W01/W02/W03 write |
| lead timeline / `events` (6.4 "events", HubSpot) | `lead_activities` (INV-T05): `lead_id`, `agent_id`, `activity_type`, `notes` | **extend** | Make it the single stamped timeline: `agent_id` nullable (system events), add `brand_id`, `broker_id`, `workflow` (`W01`…`W35`), `actor_type` (`system/admin/broker/lead`), `payload jsonb`, `occurred_at`, `idempotency_key` (unique). Every workflow appends one row per state change. | platform-architect; all workflows write |
| `conversations` (W03, W07, W31) | `communications` (INV-T14): `channel` (email/sms/whatsapp/call), `direction`, `status`, `external_id`, `lead_id`, `broker_id`, `metadata`, `response_time_seconds` — already the per-message log | **extend** | Add channels `messenger`, `instagram`; add `brand_id`, `author` (`lead/bot/human/broker/system`), `template_name`, `template_category`, `intent`, `llm_model`, `latency_ms`, `guardrail_trip`, `guardrail_rule`, `handoff`, `delivered_at`, `read_at`, `failed_reason`, `cost_zar`, `redacted`; status adds `read`. `external_id` = WhatsApp `wamid` (disclosure evidence, 4.6). Conversation state lives on `leads.conv_state`, so no separate header table. A read-only view `conversations` exposes the SortMyCover rows under the prompt's name. `lead_conversations` (INV-T11) stays as the **internal** broker↔admin chat — reuse as-is. | platform-architect; W03/W06–W10/W31 write |
| `bookings` (W05, Section 7 "Graph `event.id`") | `appointments` (INV-T24): `broker_id`, `client_id`→leads, `appointment_date`, `status`, `reason`, `reason_notes`; written by `ayanda-tools-bridge` | **extend** | Keep `client_id` (= lead) and `appointment_date` (= start). **Add:** `brand_id`, `cycle_id`, `ends_at`, `method` (`teams/zoom/meet/whatsapp_call/phone`), `calendar_provider`, **`graph_event_id`**, `graph_calendar_id`, `ical_uid`, `join_url`, `ics_url`, `invite_email_status`, `booked_via` (`page/flow/list/chat`), `schedule_event_id` (CAPI), `confirmed_at`, `reschedule_count`, `previous_booking_id`, `idempotency_key`. Normalise `status` to `booked/confirmed/rescheduled/cancelled/attended/no_show` (legacy `Scheduled` kept). **Zero double-bookings:** partial unique index on (`broker_id`, `appointment_date`) where status is active, plus W05's free/busy re-check. Fix the `USING (true)` and `auth.uid() = broker_id` policies (NH-15). The second, never-applied `appointments` definition in `20260402120000` is ignored. View `bookings` for the prompt's name. | platform-architect; W05/W10 write |
| `outcomes` (4.12a, W12) | none — only `appointments.status/reason` and unapplied `referrals.appointment_status` | **new** | `booking_id`, `lead_id`, `broker_id`, `cycle_id`, `outcome` (`attended/no_show/rescheduled/broker_no_show`), `disposition_code` (`good_fit_proceeding`, `good_fit_follow_up`, `not_fit_budget`, `not_fit_covered`, `not_fit_criteria`, `unreachable`), `quality_score` 1–5, `voice_note_url`, `transcript` (redacted), `summary`, `lead_reach_check` (yes/no/none, W12 T+30), `marked_by`, `marked_at`, `auto_marked`, `unconfirmed`, `dispute_status`. Broker INSERT on own bookings; admin all. | platform-architect; W12 writes |
| `replacements` (W13, 0.1 cap) | none | **new** | `lead_id`, `cycle_id`, `broker_id`, `reason` (`no_show/uncontactable/disqualified`), `reason_code`, `claimed_at`, `dispute_window_ends_at` (48 h), `status` (`due/disputed/approved/rejected/fulfilled`), `replacement_lead_id`, `decided_by`. Cap check against `cycles.replacement_cap` — **per cycle** (0.1; NH-02). | platform-architect; W13 writes |
| `invoices` (3.6 #5, W16, W19) | invoices exist only as **documents**: `admin_documents` rows with `category='invoices'` + PDF in bucket `admin-documents`, produced by `InvoiceGenerator.tsx` (INV-T12, INV-G02). No amount/status/reference columns. | **new** | Structured money table: `invoice_no`, `broker_id`, `cycle_id`, `tier_code`, `amount_excl_vat`, `vat_zar` (null), `total_zar`, `reference` (`LV-{broker_id}-{tier}-{YYYYMM}`), `method` (`instant_eft/manual_eft/card`), `status` (`issued/paid/void/credited`), `issued_at`, `due_at`, `paid_at`, `paystack_reference`, `bank_credit_id`, `document_id` → `admin_documents` (the PDF still comes from the existing generator, rewired to `pricing`). **Name check pending NH-11** (a live `public.invoices` may already exist). | platform-architect (table); billing-automation (writes) |
| `bank_credits` (W17, W18) | none | **new** | `received_at`, `amount_zar`, `reference_raw`, `parsed_reference`, `source` (`incontact/statement/paystack_settlement`), `graph_message_id`, `matched_invoice_id`, `match_status` (`auto/manual/unmatched`), `assigned_by`. | billing-automation |
| webhook idempotency (W01, W02, W16, W28; automation-engineer "idempotency keys") | none | **new** | `webhook_events(source, external_id, received_at, signature_ok, payload_hash, processed_at, error)` with unique(`source`,`external_id`) — one table for Meta, WhatsApp, Paystack, Graph. | platform-architect |
| `audit_log` (6.4 Salesforce; 6.2 "every write action logs who/when/why") | none (INV-A08) | **new** | Trigger on every SortMyCover table + console actions: `at`, `actor_uid`, `actor_role`, `source` (`console/portal/n8n/edge`), `table_name`, `row_id`, `action`, `diff jsonb` (PII-redacted), `reason`. Admin read-only; nobody updates or deletes. | platform-architect |
| `capi_log` (6.3; `automation/capi/event-spec.md`) | none | **new** | `lead_id`, `event_name`, `event_id`, `action_source`, `sent_at`, `events_received`, `fbtrace_id`, `status`; unique(`event_id`,`event_name`). | attribution-analyst spec, platform-architect table |

### A2. Broker onboarding, documents and media
| Target | Existing | Outcome | What is added / changed | Owner |
|---|---|---|---|---|
| Broker accounts & roles (6.1 step 1, 6.4 roles) | `user_roles` + `app_role` (`admin`/`broker`) + `has_role()` (INV-T02, INV-F01/F02) | **reuse as-is** | KG is an `admin`; Mark is a `broker`. No new roles. | — |
| `profiles` (Jonathan/KG alert numbers) | `profiles` (INV-T01) | **extend** | Add `whatsapp_number`, `notify_dnd jsonb` for 6.8b notifications; security Q&A columns retired when magic links land (S7). | platform-architect |
| Broker invite → magic link (6.1 step 1) | `broker_invites`, `send-broker-invite`, `get-broker-invite-by-token`, `BrokerSetup.tsx`, `handle_new_broker()` (INV-A03) | **extend** | Payment (W16) creates the `brokers` row (status `onboarding`) and sends a Supabase **magic link** (`signInWithOtp`) by WhatsApp + email; the token invite path stays for admin-initiated invites. Password + security questions remain only for legacy users. | platform-architect |
| Onboarding step state (6.1 step 2, W20 nudges) | none for this wizard (the public `/onboarding` stepper is a prospect assessment, INV-T22) | **extend** (`brokers`) | `onboarding_step`, `onboarding_progress jsonb` (per-step done-at), nudges logged in `lead_activities`-style timeline (`broker_id`, `workflow=W20`). | broker-success |
| Agreement e-sign + authorisation letter + addenda (6.1 step 2, Q7) | `admin_documents` + `document_shares` + `ContractGenerator.tsx` + `contractToDocx.ts` (INV-T12/T13, INV-G03) | **extend** | `admin_documents` gains `broker_id`, `kind` (`agreement/authorisation_letter/addendum/invoice/proposal`), `version`, `doc_sha256`, `signed_at`, `signed_by_name`, `signer_ip`, `signed_user_agent`; generator reads `pricing` for Schedule A. Copy emailed from howzit@ (4.10 item 0). | contracts-drafter (text), platform-architect (schema) |
| Proposals (sales) (3.6 #3) | `ProposalGenerator.tsx` → `admin_documents` category `proposals` (INV-G01) | **extend** | Rewire tier block to `pricing`; add the 3.7 ROI funnel section. Remove "guaranteed" wording. | billing-automation (W25) |
| Intro media versions, scripts, takes (4.10, 4.10b) | none | **new** | `broker_media(broker_id, kind voice/video/card, language, version, url, thumbnail_url, transcript, script_text, ai_check jsonb, approved_at, approved_by, compliance_checked_by, is_current)`; `brokers.intro_*_url` point at the current approved version ("previous versions kept"). | intro-media-producer |
| Shared document library for brokers | `admin_documents`, `document_shares`, `BrokerDocuments.tsx` | **reuse as-is** | Agreements/invoices PDFs show up here automatically once shared. Bucket must be private (S3). | — |

### A3. Ads, reporting, community
| Target | Existing | Outcome | What is added / changed | Owner |
|---|---|---|---|---|
| `ad_metrics` (W21, W29, 6.2) | none | **new** | `date`, `brand_id`, `campaign_id/name`, `adset_id/name`, `ad_id/name`, `concept`, `angle`, `format`, `placement`, `spend_zar`, `impressions`, `clicks`, `leads_raw`, `qualified`, `booked`, `attended`, `cpl`, `cost_per_qualified`, `cost_per_attended`, `frequency`, `hook_rate`, `hold_rate`, `emq`, `quality_index`, `nofit_rate`; unique(`date`,`ad_id`). Ad writes (pause/budget) go through `audit_log` with confirm-to-apply. | ads-api-engineer |
| `reports` (4.10a, W14) | `scheduled_reports` + `report_history` + `send-scheduled-report` (INV-T20/T21, INV-G07) | **extend** | `report_history` gains `broker_id`, `cycle_id`, `week`, `report_kind` (`broker_weekly/midcycle/cycle_end/lv_weekly`), `pdf_url`, `sent_wa_at`, `sent_email_at`, `opened_portal_at`, `ask`, `ask_done_at`; `report_data` (existing jsonb) = `payload_json`. View `reports` for the prompt's name. Broker SELECT on own rows (new policy). | analytics-reporter |
| `comments` (W30, 4.14) | none | **new** | `platform` (fb/ig), `comment_id`, `parent_post_id`, `ad_id`, `author_hash`, `text_redacted`, `class`, `public_reply_id`, `private_reply_sent_at`, `hidden`, `sla_seconds`, `origin_lead_id`, `brand_id`. | community-response-lead |
| `escalations` (W30, W31, W07 handoff) | none (`ai_call_requests` approve-queue is voice-only) | **new** | `kind`, `ref_table`, `ref_id`, `raised_at`, `assigned_to`, `acked_at`, `resolved_at`, `note`. Feeds the console queue. | community-response-lead / automation-engineer |
| `insights` (W29) | none | **new** | `source`, `broker_id`, `ad_id`, `angle`, `kind`, `text`, `n`, `created_at`. | analytics-reporter |
| `lead_pulse` (W35) | none | **new** | `lead_id`, `booking_id`, `thumbs`, `line` (redacted), `answered_at`. Aggregates only shown to brokers. | conversation-designer |
| WhatsApp template registry (4.6 list, W27) | `message_templates` (INV-T15) | **extend** | Add `wa_name`, `language`, `meta_category` (as assigned by Meta), `meta_status`, `meta_template_id`, `header_type`, `has_flow_button`, `version`, `brand_id`, `submitted_at`, `approved_at`; channel adds `whatsapp_cloud`. Existing SMS/email templates untouched. | automation-engineer / meta-operator |
| First-message SLA (< 60 s, 6.3) | `sla_thresholds` / `sla_alerts` / `send-sla-alert` (INV-G08) | **extend** | Add `metric` (`first_message_seconds`, `reply_seconds`) and `brand_id`; seed 60 s for SortMyCover. Alert delivery moves to WhatsApp (W22). | devops-security |

### A4. Compliance and POPIA lifecycle
| Target | Existing | Outcome | What is added / changed | Owner |
|---|---|---|---|---|
| `suppression` (W15, W24, 2.3) | none | **new** | `mobile_hash`, `email_hash`, `source` (`stop/objection/ncc_registry/complaint/no_consent_ctwa`), `brand_id` (null = LV-wide), `lead_id`, `added_at`. Checked by W01/W02/W03 before any message; LV-wide so it also covers the legacy B2B product. | compliance-qa / automation-engineer |
| `dsr_requests` (W34) | none (only "delete own profile" policies on `profiles`) | **new** | `requester`, `verified_at`, `kind` (access/correct/erase/object), `received_at`, `due_at` (+30 d), `status`, `export_url`, `completed_at`. | compliance-qa |
| `retention_log` (W34) | none | **new** | `table_name`, `row_id`, `action` (pseudonymise/delete), `policy`, `at`. Driven by `leads.retention_delete_after` (12 months after last contact; consent records 5 years — 2.1.7). | compliance-qa / devops-security |
| `incidents` (W34 breach runbook) | none | **new** | `declared_at`, `severity`, `summary`, `affected_count`, `regulator_notified_at`, `subjects_notified_at`, `closed_at`. | compliance-qa |
| Compliance register / obligations (2.3, 6.8b compliance line) | none | **new** | `obligations(code, description, owner, due_at, last_done_at, evidence_url, status)` — IO registration, PAIA, NCC, cleanse dates. | compliance-qa |

### A5. Optimisation, pulse and decision data (6.8b, 4.15, 6A2)
All in a separate Postgres schema **`ops`** to avoid name clashes with legacy tables (NH-16); admin-only RLS; the advisor's write access is limited to its own tables (4.15).
| Target | Existing | Outcome | Notes |
|---|---|---|---|
| `pulses` | none (Overview tab shows counts only, INV-S01) | **new** | `date, status, working, not_working, actions jsonb, compliance jsonb, build jsonb`. |
| `proposals` (optimisation) | name collides with LV sales proposals (`admin_documents` category `proposals`) and a possibly live `public.proposals` (INV-T29…T38) | **new** (as `ops.proposals`) | 6.8b columns + `source` (`advisor/manual/kill_rule`) so kill/scale, pricing and routing changes also land here — this table **is** the 6A2 decision journal (no second journal). |
| `signals` | none | **new** | `metric, value, limit, run, cause, owner, resolved_at`. |
| `quality_grades` (W33) | none | **new** | `sample_ref, faculty, rule, severity, note, graded_at`. |
| `notifications` (6.8b) | `notification_preferences` (INV-T17) is per-user AI-call prefs; `NotificationBell` reads `ai_call_requests`; a live `public.notifications` may exist | **new** (as `ops.notifications`) | `kind, to, sent_at, acked_at, dedupe_key, escalated_at`. `notification_preferences` stays reuse as-is for legacy. |
| `optimisation_memos` (W32) | none | **new** | weekly memo + monthly retro rows. |
| Costs ledger (6A2 `fact_cost`, 6.3 WhatsApp/LLM cost) | none (build-time `build/costs.jsonl` only) | **new** | `ops.costs(date, kind media/whatsapp/llm/infra/fees, broker_id, brand_id, amount_zar, source_ref)`. |
| `facts` schema (6A2): `fact_lead`, `fact_message`, `fact_booking`, `fact_outcome`, `fact_comment`, `fact_ad_day`, `fact_broker_day`, `fact_cycle`, `fact_cost` | none | **new** | Schema `facts` of **views / materialised views** over the operational tables above (pseudonymised: no names, numbers, emails; `lead_key` = hash), refreshed by pg_cron (INV-06) every 15 min. One-hop joins on `lead_key`, `broker_id`, `cycle_id`, `ad_id`, `date`. A read-only role `facts_reader` (whitelisted views, row limits) is the only role "Ask the data" uses. Promote a view to a table only if refresh is too slow. Metric dictionary lives in `/knowledge/metrics.md` (file, not a table). |

### A6. Existing tables not on the SortMyCover path (kept for the legacy product)
| Table | Outcome | Note |
|---|---|---|
| `referrals` (INV-T06) | **reuse as-is** | Wills referrals. |
| `ai_call_requests` (INV-T16), `call_coaching` (INV-T27) | **reuse as-is** | Voice fallback stays off by default (4.6 item 13). |
| `admin_invites` (INV-T07) | **reuse as-is** | KG admin invite. |
| `broker_onboarding_responses`, `broker_analysis` (INV-T22/T23) | **reuse as-is** after RLS fix (NH-15) | Prospect-broker assessment; feeds the backlog broker-acquisition funnel. |
| `broker_security_questions`, `broker_reset_requests` (INV-T09/T10) | **reuse as-is** (legacy logins) | Retire once brokers move to magic links. |
| `lead_conversations` (INV-T11) | **reuse as-is** | Internal broker↔admin chat. |
| `broker_notes` (INV-T25), `client_engagement_notes` (INV-T26) | **reuse as-is** (RLS fix on `broker_notes`) | Two duplicates of `lead_conversations`; consolidation goes to `/build/backlog.md` (not gating Section 7). |
| `document_shares` (INV-T13), `scheduled_reports` (INV-T20), `notification_preferences` (INV-T17) | **reuse as-is** | — |
| contacts / deals (named in 0.2) | n/a | The CRM has neither; `leads` plays "contact". SortMyCover needs no deals table — policies are never tracked beyond the broker's voluntary ROI number (`cycles.policies_written_reported`, FAIS 3.7). |

---

## B. Screens

### B1. Admin console (`/dashboard?tab=…`, INV §4.2)
| Target screen (prompt §) | Existing | Outcome | What is added |
|---|---|---|---|
| **Today** — pulse card, faculty strip (11 tiles), signals, judge findings, compliance line, build line, history (6.8b) + owner's watchlist (6A2 #3) | Overview tab, `DashboardOverview.tsx` (INV-S01) | **extend** | Becomes the default tab and renders from `ops.*` + `facts.*`; Approve / Snooze / Decline buttons write `ops.proposals` + `audit_log`. Design ref `/deliverables/console/pulse-mock.html`. |
| Faculty drill-down (6.8b #2) | none | **new** | Control charts per input metric + graded samples. |
| **Ask the data** (6A2 #4) | none (Einstein advisor in `einstein-ai` is chat over raw tables, not governed) | **new** | Read-only, `facts_reader` role, logged queries. |
| **Ads** — spend/CPL/qualified/booked/show by campaign → ad set → ad; pause/resume, budget, duplicate, refresh; confirm-to-apply (6.2) | none (Marketing Hub is B2B prospecting, INV-S03) | **new** | Reads `ad_metrics`; writes via ads-api-engineer endpoints; every write in `audit_log`. |
| Creative review queue (6.2) | none | **new** | Inside Ads; Approve → publish via API. |
| Leads list with stage bar + filters by brand/broker/cycle (Pipedrive) | Lead Database `LeadsTable.tsx` (INV-S04) + kanban `WorkflowManagement.tsx` (INV-S02) | **extend** | SortMyCover stage set; row shows booking time + Outlook `graph_event_id`; age-in-stage. |
| Lead detail — one timeline (HubSpot) | `UnifiedCommunicationHub.tsx`, `LeadConversation.tsx`, `CommunicationPanel.tsx` (INV-S17) | **extend** | Merge `lead_activities` + `communications` + bookings + outcomes in time order; consent record and disclosure evidence pinned at top. |
| Human handoff inbox (W07 "person", 6.8a) | `send-communication` + `CommunicationPanel` (INV-E03) | **extend** | Reply through the WhatsApp Cloud API number for `brand_id` rows (new code path); Close-style keyboard actions. |
| Brokers list with cycle progress and capacity | Team Management `TeamManagement.tsx` (INV-S12) + header broker switcher (INV-S15) | **extend** | Status, tier, *committed/verified/booked/attended/replacements N/cap*, calendar fill %, onboarding step. |
| **Approve & go live** + Section 7 readiness checklist (6.1 step 4, Section 7) | none | **new** | One button, red lines block it; writes `brokers.status`, triggers go-live (budget + routing). |
| Onboarding monitor (stalled steps, nudges) | none (Onboarding tab = prospect assessment, INV-S06) | **new** | Per-broker wizard progress; nudge history. |
| Billing — invoices, **unmatched payments queue** (one-tap assign), reconciliation report, "payment received" tap (6.5) | Documents tab + `InvoiceGenerator.tsx` (INV-S09) for PDFs only | **new** (tab) reusing the generator | Reads `invoices`, `bank_credits`, `cycles`. |
| Outcomes & disputes queue (W12 unmarked 24 h, W13 48-h disputes, 6.8a) | none (AI Calls approve-queue is voice-only, INV-S11) | **new** | One key per disposition. |
| Comments & DMs (4.14) | none | **new** | SLA board + escalations. |
| Compliance — consent %, disclosure %, STOP %, last cleanse, DSR queue, suppression, obligations | none | **new** | Reads A4 tables. |
| Pricing editor (3.6) | none | **new** | Admin edits `pricing` → W25. |
| Brands & Meta health (W27) | none | **new** | `brands` health fields; deep links. |
| WhatsApp templates (4.6 list) | Message Templates `MessageTemplates.tsx` (INV-S10) | **extend** | Meta status/category columns, submit tracking. |
| Calendar (all brokers) | `AdminCalendar.tsx` (INV-S07) | **extend** | Reads extended `appointments` (method, join link, Graph event). |
| Notifications bell | `NotificationBell.tsx`, `/notifications` (INV-S16) | **extend** | Also lists `ops.notifications` (Red alerts, gates). |
| Admin/broker invites, Upload, Referrals, AI Calls, Marketing Hub, Analytics, Onboarding (readiness) | INV-S03…S14 | **reuse as-is** | Legacy product screens; untouched. |

### B2. Broker portal (role-scoped view inside the same app — 0.2; nav in `BrokerLayout.tsx`, INV-P11)
| Target page (4.10) | Existing | Outcome | What is added |
|---|---|---|---|
| Login by **magic link** (6.1 step 1, 6.4) | `/broker` `BrokerPortal.tsx` password login (INV-P01, INV-A01) | **extend** | `signInWithOtp` as the default button; password stays for legacy users. |
| Portal shell / nav | `BrokerLayout.tsx` (INV-P11) | **extend** | SortMyCover nav for `brand_id` brokers (the nine pages below); legacy nav unchanged for others. |
| **Start here** — explainer video + progress checklist | none (`BrokerDashboard.tsx` shows legacy counts) | **new** | Landing page while `status = onboarding`; tracks `explainer_watched_at`. |
| **Profile** — practice, FSP (FSCA check), adviser, headshot, bio, languages | `/broker/profile` `BrokerProfile.tsx` (writes `profiles` only, INV-P09) | **extend** | Writes the `brokers` row; FSCA result shown; headshot upload to a private bucket. |
| **Intro card** — preview/approve | none | **new** | Renders `intro_card_url`; approve writes `broker_media`. |
| **Voice note & video** — interview → 3 scripts → record → AI check → approve (4.10b) | none | **new** | MediaRecorder, teleprompter, takes; writes `broker_media`. |
| **Calendar & availability** — Outlook connect, hours, methods, caps, pause, next free slot | `/broker/calendar` `BrokerCalendar.tsx` (referral dates only, INV-P06) | **extend** | Microsoft sign-in (admin-consent link fallback, 0.3 #4), capacity controls writing `brokers`, live "next free slot" from W04. |
| **Agreement & billing** — e-sign, tier, invoices, pay links, card auto-renew opt-in | `/broker/documents` `BrokerDocuments.tsx` (shared PDFs, INV-P07) | **extend** | E-sign flow on `admin_documents`; invoice list from `invoices`; pay buttons to the checkout. |
| **My leads** — today's meetings, outcome buttons, pre-call briefs, cycle bar | `/broker/leads` `BrokerLeads.tsx` (INV-P03) | **extend** | Cycle progress bar, outcome/disposition/quality buttons (writes `outcomes`), brief per booking, Outlook event id. |
| **Reports** — 4.10a weekly report, history, PDF, close-rate input | `/broker/reports` `BrokerReports.tsx` (INV-P08) | **extend** | Reads `report_history` rows for the broker; PDF via INV-G04; close-rate/commission inputs to `brokers`. |
| **Help** — clips, FAQ, message us | none | **new** | Renders `/knowledge/faq.md` (6B.9) + clips. |
| Legacy pages (Upload, Referrals, `/broker-elite`) | INV-P04/P05/P10 | **reuse as-is** | Hidden from SortMyCover brokers' nav. |

### B3. Public and payment surfaces
| Target | Existing | Outcome | Note |
|---|---|---|---|
| **Checkout** — tier pre-selected, Instant EFT / manual EFT with copy-reference / optional card auto-renew (6.1 step 0, 6.5) | none | **new** | Reads `pricing`; Paystack page codes; same component serves the renewal offer (W19). |
| SortMyCover landing pages (`go.`/`sortmycover.co.za`) + consent + in-page picker | none in the CRM; holding site prepared this session in `landing/holding/` (inventory §12) | **new** | landing-page-builder. |
| leadvelocity.co.za pricing/home wording (3.5a, W25) | `src/pages/Pricing.tsx`, `Home.tsx`, `Promotions.tsx` in this repo (deployed on Vercel, NH-12) | **extend** | Tier cards generated from `pricing`; "guaranteed"/"estimated leads" removed. Scope pending NH-14. |
| Broker explainer video (4.10) | `public/lead-velocity-explainer.webm` is the B2B explainer (INV-G13) | **new** | Rendered from the real portal (Playwright). |

---

## C. Workflows W01–W35 vs what exists
n8n workflows are new code by definition (no n8n JSON in the repo; INV-I11 shows n8n was planned). "Existing" lists the edge function or table each one adapts.
| W | Workflow | Existing thing it maps onto | Outcome | Note (owner per `build/tasks.json`) |
|---|---|---|---|---|
| W01 | Lead intake (web) | `normalize-leads` (INV-E21) + `_shared/utils.ts` `normalizePhoneNumber` / `src/lib/format-phone.ts` (INV-G11) | **new** | Port the SA→E.164 logic; add Lookup, dedupe, routing, consent, CAPI. automation-engineer |
| W02 | Lead intake (Meta form) | none | **new** | automation-engineer |
| W03 | Lead intake (CTWA) | none | **new** | automation-engineer |
| W04 | Slots API | none (`brokers.google_calendar_token` unused, INV-I12) | **new** | Graph `getSchedule`. automation-engineer |
| W05 | Book | `book-appointment` (INV-E01: status + email only) and `ayanda-tools-bridge` `book_appointment` (INV-E08: inserts `appointments`) | **new** | Writes the **extended** `appointments`; neither edge function is used for SortMyCover (they stay for the legacy Ayanda path — no second booking engine). automation-engineer |
| W06 | First touch (< 60 s) | `send-communication` (INV-E03, Twilio WhatsApp) | **new** | WhatsApp Cloud API direct; SMS fallback reuses Twilio creds (INV-I02). automation-engineer |
| W07 | Conversation agent | Ayanda rules (INV-K02, partial) | **new** | Human handoff replies use the extended console path (B1). automation-engineer + conversation-designer |
| W08 | Unbooked nurture | none (voice step optional: `initiate-ai-call`, INV-E05) | **new** | automation-engineer |
| W09 | Reminder sequence | `send-appointment-reminders` + pg_cron (INV-E02, INV-06), email/referral-only | **new** | WhatsApp sequence; legacy cron untouched. automation-engineer |
| W10 | Reschedule / cancel | none | **new** | automation-engineer |
| W11 | Broker reminders (07:30 digest, T-15 brief) | `send-appointment-reminders` (email digest pattern) | **new** | automation-engineer |
| W12 | Outcome, disposition & feedback | none | **new** | Writes `outcomes`. automation-engineer |
| W13 | No-show & replacement | none | **new** | Writes `replacements`; per-cycle cap. automation-engineer |
| W14 | Reports | `scheduled_reports` / `report_history` / `send-scheduled-report` (INV-G07) + PDF engine (INV-G04) | **extend** | Same tables extended (A3); generator logic new in n8n. analytics-reporter |
| W15 | Opt-out | none | **new** | Writes `leads.opted_out_at` + `suppression`. automation-engineer |
| W16 | Payment received | none | **new** | Creates `cycles` row, marks `invoices` paid, creates broker + magic link. billing-automation |
| W17 | inContact parser | none (no Graph) | **new** | billing-automation |
| W18 | Statement import | none | **new** | billing-automation |
| W19 | Cycle renewal offer | none | **new** | billing-automation |
| W20 | Onboarding wizard | broker invite flow (INV-A03) + `/onboarding` stepper UI pattern (`BrokerOnboarding.tsx`) | **extend** | Invite → magic link; wizard screens are the B2 pages; FSCA check new. broker-success |
| W21 | Ads sync | none | **new** | ads-api-engineer |
| W22 | Alerts | `sla_alerts` / `send-sla-alert` (INV-G08); Discord bot (INV-I09) | **extend** | Thresholds + alert log reused; delivery = WhatsApp to Jonathan/KG (6.8b), Discord not used for SortMyCover. devops-security |
| W23 | Media processing | none | **new** | intro-media-producer |
| W24 | Compliance cleanse & calendar | none | **new** | compliance-qa |
| W25 | Pricing & website sync | generators INV-G01…G03, `Pricing.tsx`, `useChatbot.ts`, `_shared/knowledge.ts` | **extend** | Rewire every consumer to `pricing`; repo diff check. billing-automation |
| W26 | Go-live runner | none | **new** | devops-security |
| W27 | Meta asset health | none | **new** | ads-api-engineer |
| W28 | Booking Flow | none | **new** | automation-engineer |
| W29 | Feedback loop | none | **new** | automation-engineer |
| W30 | Comment handler | none | **new** | community-response-lead |
| W31 | DM handler | none | **new** | community-response-lead |
| W32 | Optimisation pulse / memo / retro | none | **new** | optimisation-advisor |
| W33 | Daily judge | none (`analyze-call-coach` grades voice calls with Gemini — different scope and model) | **new** | optimisation-advisor |
| W34 | POPIA operations | none | **new** | compliance-qa |
| W35 | Lead pulse | none | **new** | conversation-designer |

### C2. Every existing edge function → disposition
| Function (INV) | Outcome | Maps to |
|---|---|---|
| `send-communication` (E03), `send-bulk-communication` (E04) | **extend** (E03) / **reuse as-is** (E04) | E03 gains a WhatsApp Cloud API branch for `brand_id` rows = W07 human handoff from the console. E04 stays legacy. |
| `send-broker-invite`, `get-broker-invite-by-token` (E22/E23) | **extend** | W20 / 6.1 step 1 (magic link). |
| `send-sla-alert` (E27) | **extend** | W22. |
| `send-scheduled-report` (E26) | **reuse as-is** | Legacy reports; W14 shares its tables, not its code. |
| `send-admin-invite` (E22) | **reuse as-is** | KG admin. |
| `book-appointment` (E01), `ayanda-tools-bridge` (E08), `send-appointment-reminders` (E02) | **reuse as-is** (legacy) — after the auth fix (NH-15) | Not used by W05/W09. |
| `initiate-ai-call`, `create-ayanda-call`, `handle-inbound-call`, `handle-ai-call-status/recording/transcription`, `send-ai-call-notification`, `analyze-call-coach`, `transcribe-call-recording`, `initiate-browser-call`, `end-browser-call` (E05–E16) | **reuse as-is** | Optional voice fallback (W08 step, off by default); 6.8b 4-hour escalation call can call Twilio directly from n8n. |
| `einstein-ai`, `create-einstein-call`, `marketing-ai`, `legal-ai-assistant`, `analyze-broker-score`, `normalize-leads` (E07, E17–E21) | **reuse as-is** | Legacy LV features (Gemini). Not in 4A routing; not used for SortMyCover. |
| `send-document-notification`, `send-message-notification`, `send-referral-*` (E24/E25) | **reuse as-is** | Legacy notifications. |
| `discord-webhook`, `trigger-discord-alert`, `telegram-webhook` (E28–E30) | **reuse as-is** | Legacy admin bots. |
| `send-appointment-update` (referenced by `src/utils/notifications.ts`, missing) | n/a | Dead reference → backlog. |

---

## D. Build order for the platform tasks (critical path first)
1. **Close NH-11 and NH-15 first:** schema-only dump of the live project; security fixes (S1–S7) as migration 1 — before any consumer row exists.
2. `brands`, `pricing`, `cycles`, `brokers` extension, `audit_log`, `webhook_events` (everything W16/W20/W26 need for payment → live).
3. `leads` extension, `lead_activities` extension, `communications` extension, `suppression`, `capi_log` (W01–W03, W06, W07, W15).
4. `appointments` extension + unique slot index, `outcomes`, `replacements` (W04, W05, W09–W13).
5. `invoices`, `bank_credits`, `admin_documents` signature fields (W16–W19).
6. `ad_metrics`, `report_history` extension, `message_templates` extension, `sla_*` extension (W14, W21, W22, W27).
7. `ops.*`, `facts.*` views, `broker_media`, `comments`, `escalations`, `insights`, `lead_pulse`, A4 compliance tables (W23, W24, W29–W35).
8. Screens in the order of the payment → live path: checkout → magic link → Start here/Profile/Calendar/Agreement → Approve & go live → My leads/outcomes → Today → the rest.
All migrations are additive (`ADD COLUMN IF NOT EXISTS`, new tables, views); no renames or drops of anything the legacy product reads. `src/integrations/supabase/types.ts` is regenerated after each migration (it is stale today).

---

## E. Decisions for Jonathan (needs_human)
Codes NH-11 onward are proposed for `build/tasks.json` / `build/gates-batch.md`. The orchestrator records them; this file does not change `tasks.json`.

### NH-09 — one data store for the system of record (recommendation)
**Recommendation: keep the existing Supabase Postgres (project `cmsylaupctrbsvzrgzwy`) as the single system of record for the CRM and every SortMyCover table. n8n (local Docker now, Hostinger VPS after W26) connects to it as a client over TLS through the Supabase connection pooler, using a dedicated least-privilege Postgres role (`n8n_app`, grants only on SortMyCover tables; not the service-role key). The Postgres container on the VPS holds n8n's own state (executions, credentials, queue) plus an intake dead-letter buffer — never business data.** This is the reuse the 0.2 rule asks for, and it meets 6.4's own test ("Supabase … only if its auth/RLS saves real build time"): auth, the admin/broker roles, broker-scoped RLS, storage, pg_cron, realtime and 35 edge functions already exist (INV §2–§5), and the console and portal are already Supabase clients.
- **For — reuse and isolation:** zero data migration and no second database. Magic links are native to Supabase Auth. Broker isolation is enforced in the database, not the UI (devops-security's "Supabase RLS patterns" inspiration). The prompt's own staging plan (6.6) already allows Supabase free tier. Moving later is cheap, because it is plain Postgres: `pg_dump` is portable, and only Auth and Storage would need re-homing.
- **Against — limits and resilience:** if the project is on the free tier, the 500 MB cap (6.6) applies. *ASSUMPTION — validate by Phase 5 in the Supabase dashboard:* free projects can be paused when inactive and have no point-in-time recovery. Mitigation at R0: n8n traffic keeps the project active, and the nightly `pg_dump` copied off-server (a Section 7 line anyway) is the backup. A Supabase outage would stop intake, so W01–W03 write to the VPS dead-letter buffer and replay. Jonathan to confirm the current plan and the project region.
- **Against — processors and latency:** Supabase becomes a named processor holding consumer personal information. The 2.1.7 processor/overseas-transfer list (Meta, Anthropic, Google, Paystack, Microsoft) does not name Supabase, or the other existing processors Vercel, Twilio and Resend; compliance-qa adds them to the privacy notice. Each n8n → Supabase query crosses the internet. *ASSUMPTION — validate on the synthetic suite:* this costs milliseconds per query against a 60-second first-message SLA, so it is not a risk. The first-message latency tile measures it from day 1.

### New needs_human lines (repo ↔ prompt contradictions found in this pass)
| Code | Contradiction / gap | Evidence | Recommendation (default if silent) | Blocks |
|---|---|---|---|---|
| **NH-11** | **Live schema drift.** Twelve tables are referenced but never defined in the repo (`call_coaching`, `system_logs`, and `emails`, `invoices`, `legal_documents`, `notifications`, `proposals`, `secrets`, `system_settings`, `whatsapp_history`, `workflow_stages`, `workflows`). Two RPCs exist only in types (`submit_broker_analysis`, `submit_broker_onboarding`). `types.ts` is stale, `supabase/types.ts` is empty, and `appointments` has two conflicting definitions. | inventory §2.2, §2.3, INV-T24; `supabase/clean_setup.sql` lines 1–26 | Jonathan (laptop) runs `supabase db dump --schema-only` on the live project, read-only, and commits it as `supabase/live_schema_2026-10.sql`; or he grants read-only DB access. Until then every migration stays additive with `IF NOT EXISTS`, and none uses the names `invoices`, `proposals` or `notifications` in `public`. | First migration (D.1) |
| **NH-12** | **Hosting of the console/portal.** The prompt (6.7, 0.2) says static on Hostinger `app.`, and that leadvelocity.co.za is on Hostinger. The repo deploys this CRM, including the public LV site pages, to **Vercel**. *ASSUMPTION — validate via the Vercel dashboard:* the A record 216.198.79.1 cited in 6.7 is a Vercel address, which would mean the live LV site is this repo. | `vercel.json`, `README.md`, `KNOWLEDGE_TRANSFER.md`; 6.7 | Keep Vercel for the CRM app (reuse, CI already wired, R0 if the current plan allows commercial use — *ASSUMPTION, confirm the plan*). Point `app.leadvelocity.co.za` at Vercel. SortMyCover landing pages go on Hostinger as specified. The `dist/` bundle is static, so moving to Hostinger later is a copy. | devops-security DNS (GATE-DNS), W25 target |
| **NH-13** | **Email transport.** The code sends through **Resend** (11 functions; `KNOWLEDGE_TRANSFER.md` wrongly says SendGrid). The prompt (6.7) says transactional mail goes from howzit@ via Graph `Mail.Send`, with bounces read on the same mailbox (W05/W17). | INV-I08 | SortMyCover invites, invoices, reports and agreement copies go from howzit@ via Graph, because bounce detection and the single audit trail (4.10 item 0) require it. Legacy LV mail stays on Resend. Supabase Auth magic-link email uses custom SMTP: confirm whether Resend is paid and whether its sending domain has DKIM. If not, use M365 SMTP. | W05, W16, W20, magic links |
| **NH-14** | **Two products, one CRM.** The repo sells B2B SME lead tokens: tiers Pilot R6,000, Bronze R8,500, Silver R10,500 and Gold R16,500+, with "guaranteed" wording and the Ayanda cold-call outreach. 3.5/3.5a rewrite the LV pricing page to the SortMyCover ladder and reuse the tier names Bronze/Silver/Gold with different prices. That is a **money decision.** | INV §0 item 2, INV-G01…G03, INV-K04; `src/pages/Pricing.tsx`, `Promotions.tsx` | Keep both products in one CRM, separated by `brand_id`. Legacy brokers keep `brokers.tier` (text). SortMyCover brokers use `tier_code` → `pricing` with codes `SMC_BRONZE/SMC_SILVER/SMC_GOLD`, so the names never collide. **Jonathan decides** whether the B2B tiers are withdrawn from the site (W25 scope) and whether the legacy cold-call leads are covered by the NCC cleanse (compliance-qa). | W25, `pricing` seed |
| **NH-15** | **Pre-existing security/POPIA defects in the live CRM** (S1–S7): public read/write on prospect-broker PII; `USING (true)` policies on `appointments`/`broker_notes`; a public `admin-documents` bucket; unauthenticated service-role functions; a browser-exposed Gemini key; **passwords in tracked scripts** `reset-admin.js` / `test-login.js`; plain-text security answers. The fixes change behaviour of the live legacy product. | inventory §11 | Approve migration 1 = security fixes. Rotate the admin password(s) in those scripts and `git rm --cached` them (values not reproduced anywhere). Move the Gemini call behind `legal-ai-assistant`. Add Twilio/Meta signature checks. Owner devops-security. Needs a yes because it touches production behaviour (public `/onboarding` form, Ayanda tool bridge). | Any consumer data in the DB |
| **NH-16** | **Name collisions with prompt tables.** `proposals` (6.8b optimisation proposals vs LV sales proposals and a possible live `public.proposals`) and `notifications` (6.8b vs a possible live table). | A5, NH-11 | Put the 6.8b/4.15 tables in a Postgres schema `ops` (`ops.proposals`, `ops.notifications`, `ops.pulses`, `ops.signals`, `ops.quality_grades`, `ops.optimisation_memos`, `ops.costs`). The literal names are kept and no clash is possible. The `facts` schema is already separate per 6A2. | W32, W33, Today screen |
| **NH-17** | **Processor list incomplete for POPIA.** 2.1.7 lists Meta, Anthropic, Google, Paystack and Microsoft. The CRM that will hold SortMyCover data also uses Supabase, Vercel, Twilio and Resend; ElevenLabs is used only if the voice fallback is turned on. | INV §7 | compliance-qa adds them to the privacy notice and processing register with their regions (*ASSUMPTION: regions unknown — read from each dashboard*). | Privacy notice (Section 7 compliance line) |

Already open and still relevant here: **NH-02** (per-cycle replacement cap — this map builds per cycle, as 0.1 says) and **NH-10** (`.gitignore` `*.json` rule — the regenerated `types.ts` is `.ts`, so it is unaffected).
