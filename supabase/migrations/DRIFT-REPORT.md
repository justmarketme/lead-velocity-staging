# DRIFT REPORT: live project vs this repo

Project `cmsylaupctrbsvzrgzwy` ("lead-velocity-staging", Postgres 17.6, free plan). Captured 2026-10-10 with **read-only SELECTs only** (Supabase MCP `execute_sql`, `list_migrations`, `list_extensions`, `get_advisors`). Nothing was applied to that project.

## 1. How the comparison was made

1. Captured the live `public` schema: every table, column (type, NOT NULL, default), constraint, index, RLS flag, policy (public and `storage.objects`), trigger, function (signature, SECURITY DEFINER, search_path, EXECUTE ACL), table grants, default privileges, enums, buckets, cron jobs, roles, extensions, applied-migration list and exact row counts.
2. Rebuilt it locally as `supabase/drift/real-public-schema-2026-10-10.sql` (+ `real-public-prelude.sql` for Supabase default privileges and extension schema). **Fidelity proof:** `supabase/drift/live-fingerprint.sql` run on the live project and on the local mirror returns identical md5s for columns (508), constraints (127), indexes (106), policies (105), triggers (17), function signatures (28) and RLS flags (46). The mirror is a structural replica. Function bodies of the order/invite RPCs are signature-exact stubs (no smc file touches them).
3. Replayed the repo's 60 NON-smc migrations on a clean Postgres 17 and diffed the catalog against the live mirror (`supabase/drift/catalog-dump.sql`): this is "what the repo says production should look like" versus "what production is".
4. Applied the whole smc chain to the live mirror (details in `MIGRATION-SAFETY-REVIEW.md`).

## 2. Applied-migration list (live `supabase_migrations.schema_migrations`: 82 entries)

* All **60** non-smc migration versions in the repo are recorded as applied live. Nothing in the repo is unapplied except the smc chain (`smc_*` never ran; no `ops`, `facts`, `smc_private` schema, no `n8n_app` / `facts_reader` role live).
* **26 migrations are applied live but absent from the repo** (the repo cannot reproduce production):

| Version | Name | What it evidently does |
|---|---|---|
| 20260423150000 | update_ai_call_constraints | ai_call_requests CHECKs (purpose list incl. `cold_call`) |
| 20260602182013 | enable_rls_on_crm_tables | RLS on the agency-CRM tables (clients, deals, events, tasks, upsells, reports, crm_activity) |
| 20260602182131 | tighten_security_policies_and_revoke_anon | broker_onboarding_responses / analysis policy tightening |
| 20260609222404 / 20260610101837 / 20260610111010 | 010_blueprint_columns, 011_missing_leads_presence_columns, 012_website_goal_column | clients blueprint columns |
| 20260620125932 | tunnel_config | EMMA tunnel table (anon SELECT policy) |
| 20260620193608 / 20260623111534 / 20260623125555 | create_call_transcripts, emma_conversation_messages, emma_secure_existing_tables | EMMA tables (`call_transcripts`, `conversation_messages`, ...) |
| 20260918140535 / 20260918140555 | lead_broker_portal_orders, lead_order_rpcs | `lead_orders`, `lead_order_items` (4,200 rows) and order RPCs |
| 20260921083748 .. 20260921100017 (7 files) | post_payment_broker_admin_rpcs, broker_pipeline_and_feedback, admin_list_orders_activity_* , signed_contract_upload_flow, sign_order_contract_drawn | order/contract RPCs, `broker_feedback`, bucket `signed-contracts` + its policies |
| 20260922111606 | broker_notes_id_and_delete | broker_notes RPCs |
| 20260923135002 | broker_management_pipeline | `broker_activities`, `broker_followups`, brokers.mgmt_stage / next_follow_up_at |
| 20260924091105 | audit_log_paper_trail | **`audit_log` (uuid id, record_id, old_data/new_data...) + `fn_audit` triggers** |
| 20260925110454 | admin_bulk_insert_leads | RPC |
| 20260928121734 | contact_submissions | table |
| 20260928225322 | onboarding_auto_into_pipeline | `fn_onboarding_to_pipeline` trigger |
| 20260929080638 | harden_function_exposure | EXECUTE revokes on trigger/admin functions |

Action: commit those 26 files (e.g. `supabase db pull`) so the repo, the next developer and CI see the real base. Until then the repo's own harness (replay of legacy migrations) tests the smc chain against a schema that production does not have; `automation/tests/_localpg.mjs` now supports `SMC_BASE=real` (live mirror + synthetic seed) and that is what the smc tests were run against.

## 3. Schema differences (repo-replay vs live)

**Tables only in production (21):** audit_log, broker_activities, broker_feedback, broker_followups, call_coaching, call_transcripts, clients, contact_submissions, conversation_messages, conversations, crm_activity, deals, events, lead_order_items, lead_orders, reports, research_notes, system_logs, tasks, tunnel_config, upsells. (They come from the 26 missing migrations or from out-of-band changes: `call_coaching` and `system_logs` have no creating migration anywhere in the repo.) **No table exists only in the repo.**

**Column differences on shared tables**

| Table | Only live | Only repo (absent live) | Differs |
|---|---|---|---|
| brokers | mgmt_stage, next_follow_up_at, portal_type | **calendar_email, google_calendar_token, whatsapp_number, firm_address, preferred_language** | user_id nullable live (NOT NULL in repo) |
| ai_call_requests | conversation_history, opener_index | **call_goal, coaching_feedback, email_sent_at, is_roleplay, whatsapp_sent_at** | requested_by nullable live |
| broker_onboarding_responses | phone_number, pipeline_broker_id | phone | product_focus has default `'{}'` live |
| broker_invites | portal_type | (none) | |
| profiles | security_answer_1/2, security_question_1/2 | (none) | |
| leads | (none) | (none) | vibe default 0 live |

**The important one:** repo migration `20260402120000_advanced_ayanda_integrations.sql` is recorded as applied, but its column additions are **not in production** (brokers: 5 columns; ai_call_requests: 5 columns). Consequences: (a) the smc chain read `brokers.whatsapp_number` (smc_06 generated column) and would have **aborted at smc_06**; fixed by `smc_00_preflight_drift.sql` (+ a guard in smc_06). (b) repo code that uses the missing `ai_call_requests` columns fails at runtime today (`supabase/functions/create-ayanda-call`, `ayanda-tools-bridge`, `src/components/dashboard/CallCommandCenter.tsx` reference call_goal / is_roleplay / coaching_feedback / whatsapp_sent_at). That is **independent of SortMyCover** and not changed by the chain. Optional repair (additive, safe to run any time; the original file is NOT re-runnable because it also does an unguarded `CREATE POLICY` and `ALTER PUBLICATION`):

```sql
ALTER TABLE public.ai_call_requests
  ADD COLUMN IF NOT EXISTS is_roleplay boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coaching_feedback text,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_goal text DEFAULT 'appointment_scheduling';
```

**Constraints.** 48 live-only (mostly the missing tables); real differences: `brokers_status_check` live = `('Active','Inactive','Prospect')`, repo = `('Active','Inactive')`; `leads_source_check` live = strict list (+ `Ayanda Prospecting | %`), repo = `source IS NULL OR source = '' OR true` (i.e. the repo's effective constraint is "anything"); `brokers_tier_check`, `brokers_portal_type_check`, `brokers_email_key` exist live only; `broker_security_questions_user_id_fkey` is DEFERRABLE live.

**Policies.** Live is stricter than the repo in places and has 48 policies the repo lacks. Repo-only (not live, so the repo's smc_01 drops are no-ops): "Service role full access to responses/analysis", "Enable all access for dev", "Deny anonymous access to leads/communications", appointments "...USING (true)". Live-only: admin/own-row policies on the missing tables, `anon can read tunnel_config`, `Public can insert broker analysis`, `Token holder can update invite` (UPDATE true/true), `Allow anyone to insert security questions`, `Allow authenticated read access` on system_logs (true), storage `Public Access`.

**Triggers / functions.** Live-only: `trg_audit_*` (fn_audit) on brokers, broker_analysis, broker_followups, broker_onboarding_responses, contact_submissions; `trg_onboarding_to_pipeline`; 21 functions (order, invite, audit, onboarding RPCs, `handle_new_user_master`). Repo-only: `update_appointments_updated_at` trigger (live `appointments.updated_at` is never auto-updated), functions `handle_new_user`, `handle_new_broker` (live uses `handle_new_user_master`).

**Grants.** Supabase default: every public table grants ALL to `anon`, `authenticated`, `service_role` (default privileges); only RLS stands between the anon key and the data on the tables smc_01 does not list.

**Storage.** Live buckets: `admin-documents` (private flag), `signed-contracts`. Live policy "Public Access" lets anyone with the anon key read every `admin-documents` object. smc_01 drops it.

## 4. Live facts that matter for applying anything

* Roles: no `n8n_app`, no `facts_reader`. Migration role `postgres` is NOT superuser (CREATEROLE, BYPASSRLS). Role settings: anon `statement_timeout=3s`, authenticated `8s`, authenticator `8s`; `postgres`: `statement_timeout=0`. Apply as `postgres` over a direct/session connection (SQL editor or `psql`), never through PostgREST.
* Extensions installed: pgcrypto, uuid-ossp (schema `extensions`), pg_stat_statements, pg_cron, supabase_vault, plpgsql. **Not installed:** pg_net (the live `on_reset_request_created` function calls `net.http_post`; the daily cron job `send-daily-appointment-reminders` also depends on it), btree_gist (smc_02 creates it: available, trusted).
* DB default `search_path` for the app roles: `"$user", public, extensions`.
* Auth hook: trigger `on_auth_user_created_master` on `auth.users` -> `handle_new_user_master()`.
* Cron: one job (`send-daily-appointment-reminders`, 07:00 daily). The smc chain adds no cron jobs.
* Row counts (2026-10-10): leads 4,209; lead_order_items 4,200; ai_call_requests 65; audit_log 41; brokers 18; broker_onboarding_responses 14; clients 14; crm_activity 15; events 19; deals 4; reports 4; profiles 9; user_roles 7; lead_orders 2; message_templates 6; sla_thresholds 4; tasks 5; system_logs 8; admin_documents 8; broker_invites 16; `appointments` 0; `lead_activities` 1; the remaining tables hold 0-3 rows.

## 5. Collisions between live objects and the smc chain (all fixed in this branch)

| Chain statement | Live object | Result if applied unchanged | Fix |
|---|---|---|---|
| `CREATE OR REPLACE VIEW public.conversations` (smc_02) | TABLE `conversations` (EMMA assistant) | ERROR, smc_02 aborts; and smc_05 would have granted `authenticated` SELECT on the EMMA table | view is now `public.smc_conversations` |
| `CREATE OR REPLACE VIEW public.reports` (smc_03, smc_06) | TABLE `reports` (agency CRM, 4 rows) | ERROR; smc_05/07 grants would have exposed the table | view is now `public.smc_reports` (+ `Reports.tsx`, types, 2 tests) |
| `CREATE TABLE IF NOT EXISTS public.audit_log` (smc_02) | TABLE `audit_log` with a different shape (uuid id, record_id, changed_at, old/new_data) | silent no-op, then `CREATE INDEX ... (table_name, row_id)` fails; `smc_audit()` would fail on every audited write | table is extended with the smc columns (`at, actor_uid, actor_role, source, row_id, diff, reason`); `fn_audit` and `smc_audit` now share it |
| `brokers_status_check` re-created without `'Prospect'` (smc_02, smc_06) | live value `Prospect` (created by `fn_onboarding_to_pipeline`) | migration aborts on live rows; afterwards the onboarding trigger **silently** stops creating pipeline brokers (it swallows errors) | `'Prospect'` kept; list is a strict superset of live |
| `lead_activities.agent_id NOT NULL` (live) | SMC system events have no agent | inserts fail | smc_02 already relaxes it (`DROP NOT NULL`), confirmed |
| `brokers.whatsapp_number` read by smc_06 | column missing live (drift, section 3) | smc_06 aborts | `smc_00_preflight_drift.sql` adds it (and the other four); smc_06 also adds it itself |
| `GRANT ... TO n8n_app` / `facts_reader` | roles absent | fails | smc_05 creates them (NOLOGIN); verified it works as a non-superuser CREATEROLE role |

## 6. Pre-existing security findings (NOT caused by the smc chain)

From the live Supabase advisors and the policy capture (baseline numbers are repeated in `APPLY-RUNBOOK.md`):

* 19 SECURITY DEFINER RPCs are executable by `anon` (broker_*, get_order_*, sign_order_contract*, submit_broker_*, use/validate/get_admin_invite*, has_role, handle_new_user_master) and 22 by `authenticated`; their internal `auth.uid()` checks were not reviewed here. `has_role` and `handle_new_user_master` should not be anon-callable.
* Storage policy `Public Access` (anon can read all admin documents); `Brokers can download shared documents` compares `ad.file_path = ad.name` (a row to itself): any broker with any share could read all documents. smc_01 replaces both.
* Open policies: `Token holder can update invite` (UPDATE true), `Allow anyone to insert security questions`, `Allow authenticated read access` on system_logs; smc_01 now closes these three. `broker_security_questions.answer_*` and `profiles.security_answer_*` are plain text.
* Leaked-password protection is off (Auth setting).
* 17 unindexed foreign keys, 96 `auth_rls_initplan` and 120 `multiple_permissive_policies` performance warnings (see runbook baseline).
* The anon key still holds TRUNCATE/DELETE/INSERT/UPDATE grants on `clients, deals, events, reports, tasks, upsells, crm_activity, conversations, conversation_messages, research_notes, call_transcripts, tunnel_config, contact_submissions` (RLS is the only guard). Not changed by the chain because EMMA and the agency CRM share these tables; consider revoking anon on the ones that do not need it.
* Repo code vs live: `Setup.tsx` health check and the forgot-password flow call tables as anon that RLS already blocks.
