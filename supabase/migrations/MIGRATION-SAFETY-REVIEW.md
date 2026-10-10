# MIGRATION SAFETY REVIEW: smc_00 .. smc_24

Target: Supabase project `cmsylaupctrbsvzrgzwy` (live data: 18 brokers, 4,209 leads, 4,200 lead_order_items, 14 onboarding responses; 46 public tables). Nothing here was applied to it. Method: every statement of every file read in order (four independent read-only reviews of smc_01-03, 04-07, 08-14, 15-23, plus my own pass), then rehearsed on a local Postgres 17 that mirrors the live schema exactly (`supabase/drift/`, fingerprint-identical, see `DRIFT-REPORT.md`).

## 0. Verdict

**The chain as it was in the repo was NOT safe to apply** to this project. It failed in smc_02 (and would have failed again at smc_03 and smc_06), and four statements would have damaged or silently broken the existing CRM/EMMA:

1. `CREATE OR REPLACE VIEW public.conversations` / `public.reports` over live **tables** (EMMA assistant, agency CRM), with grants that would have exposed those tables to `authenticated`.
2. `CREATE TABLE IF NOT EXISTS public.audit_log` silently skipped (live table has a different shape), then indexes/trigger writes on columns that do not exist.
3. `brokers_status_check` rewritten without the live value `'Prospect'` (aborts on live rows, and afterwards the onboarding trigger, which swallows errors, would silently stop creating pipeline brokers).
4. smc_06 reads `brokers.whatsapp_number`, a column that does not exist live (a repo migration is recorded as applied but did nothing).

All four are fixed in this branch, plus 15 security gaps found by the review (section 2). With the rewrites the whole chain applies cleanly on the live-schema mirror, as a non-superuser CREATEROLE role, idempotently, with no existing row changed (section 3). **Recommendation: apply after the manual gates in `APPLY-RUNBOOK.md`** (backup, fingerprint check, off-hours with `lock_timeout`, storage-ownership dry run, decisions listed in section 5). Do not apply the unmodified files from the other branches.

## 1. Final ordered file set (25 files, unique 14-digit versions)

`supabase/migrations/`:

| # | File | Origin |
|---|---|---|
| 00 | `20261002000000_smc_00_preflight_drift.sql` | NEW: reconcile live drift |
| 01-14 | `2026100201..14` `_smc_01_security` ... `_smc_14_pass8` | build branch (renamed to unique versions; 14 files shared `20261002`, which makes `supabase db push` fail on a duplicate version) |
| 15-17 | `20261005{15,16,17}0000_smc_15_budget_1500`, `_16_ads_launch_plan`, `_17_ads_write_log` | build branch |
| 18-19 | `20261007180000_smc_18_ms_oauth_edge`, `20261007190000_smc_19_capture_v2` | build branch |
| 20 | `20261008200000_smc_20_feedback_firewall.sql` | `origin/ux-sprint-1` (was `smc_18_feedback_firewall`) |
| 21 | `20261010210000_smc_21_unreachable_replacements.sql` | `origin/ux-sprint-1` (was `smc_20_...`; needs 20) |
| 22 | `20261010220000_smc_22_topup.sql` | `origin/sprint-2-billing-csp` (was `smc_18_topup`; needs `invoices_smc`, `cycles`) |
| 23 | `20261010230000_smc_23_budget_three_bands.sql` | `origin/sprint-2-billing-csp` (was `smc_19_budget_three_bands`; rewrites `leads_smc_checks` last defined in smc_15; strict superset, verified by diff) |
| 24 | `20261010240000_smc_24_security_sweep.sql` | NEW: final sweep + self-asserting check |

Dependency order problems found and fixed: duplicate numbers (the three source branches each had an `smc_18` and `smc_19`, ux-sprint-1 also an `smc_20`: renumbered 20-23 after the build branch's 19); smc_21 needs smc_20 (outcome kind, replacement columns, `smc_week_start`); smc_23 must follow smc_15 (it rewrites the same constraint); smc_22 needs `invoices_smc` and `cycles` from smc_02; and 14 files shared the version prefix `20261002`. References in code/tests/docs to the old file names were updated (`grep` clean); the test harness now selects smc files by `^\d{14}_smc_`.

## 2. Rewrites applied (each marked `SAFETY REWRITE` in the file)

| Sev | File | Problem | Fix |
|---|---|---|---|
| BLOCKER | smc_02, 05 | view `conversations` over EMMA table | view is `smc_conversations`; grants follow |
| BLOCKER | smc_03, 06, 07, 05 | view `reports` over agency-CRM table | view is `smc_reports`; `Reports.tsx`, `smc-types.ts`, `S7-07`, `W14-surfaces` test updated |
| BLOCKER | smc_02 | `audit_log` shape clash | live table extended with `at, actor_uid, actor_role, source, row_id, diff, reason` (nullable / constant defaults, no rewrite); legacy 41 rows get `at = changed_at`; `fn_audit` and `smc_audit` share the table |
| BLOCKER | smc_02, 06 | `'Prospect'` dropped from `brokers_status_check` | kept (strict superset of live) |
| BLOCKER | smc_00 (+smc_06) | `brokers.whatsapp_number` etc. missing | additive `ADD COLUMN IF NOT EXISTS` x5 (+ collision guard) |
| HIGH | smc_02, 03 | new tables created with Supabase default ALL grants to anon/authenticated and no RLS until smc_05 (a separate transaction that needs new roles); a failure after 02/03 leaves `bank_credits`, `invoices_smc`, DSR and suppression tables world-writable | fail-closed block at the end of 02 and 03: RLS on + `REVOKE ALL FROM PUBLIC, anon, authenticated`; also revokes PUBLIC EXECUTE on `smc_is_admin/smc_current_broker_id/smc_audit` |
| HIGH | smc_05/08 | `smc_brokers_guard` returned early for every legacy broker (all 18): any broker could set his own `brand_id`, `tier_code`, `routing_on`, `approved_live_*`, `fsp_*` | legacy rows now locked on the SortMyCover control columns (legacy columns still writable exactly as today); RESTRICTIVE policy blocks self-insert of an enrolled broker row |
| HIGH | smc_05 | live policy let any broker INSERT `lead_activities` rows with `workflow='portal'` for any lead (W20 trusts them) | RESTRICTIVE insert/update policies: only admin, SECURITY DEFINER RPCs and n8n write SMC timeline rows |
| HIGH | smc_01 | three "any signed-in user" holes: `Token holder can update invite` (UPDATE true), `Allow anyone to insert security questions` (INSERT true), `system_logs` readable by every broker | dropped / admin-only (no frontend caller, verified by grep); anon revoke list extended with six more tables |
| HIGH | smc_06, 08 | `ON CONFLICT (idempotency_key) DO NOTHING` against a PARTIAL unique index: `smc_report_policies_written` and the portal event RPC always raise at runtime | predicate `WHERE idempotency_key IS NOT NULL` added (smc_20/21 already had it) |
| HIGH | smc_19 | `lead_offers`: RLS on with no policy and no n8n grant (workflows get "permission denied"), anon/authenticated keep ALL incl. TRUNCATE, no broker FK | explicit access model: anon none, authenticated read through admin policy, n8n_app rw, FK + index |
| HIGH | smc_06 | audit redaction list missed `dedupe_hash, fbclid/fbp/fbc/ctwa_clid, consent_text, alt_email, wa_id, smoker*, income_band, spend_band, email_verify_code_hash, capture_state, reasons, declined_broker_ids`: they would land in clear in the append-only `audit_log` (POPIA erasure cannot reach it) | added to the `pii` array |
| HIGH | smc_20 | `v_cycle_progress.verified/delivered` counted tier-B leads never accepted (smc_19 "needs_human") | `counts_toward_cycle IS DISTINCT FROM false AND (offer_status IS NULL OR 'accepted')` in both subqueries |
| MED | smc_09 | unguarded `GRANT SELECT ON storage.objects, storage.buckets TO n8n_app` could abort the file on hosted (`supabase_storage_admin` owns them) | non-fatal block; `storage.buckets` no longer granted |
| MED | smc_14 | broker could set his own `media_share_pct` (money), `ms_tenant_id`, `calendar_provider` | added to `smc_brokers_guard_pass7` |
| MED | smc_20, 21 | proof path only LIKE-matched (`<me>/noshow-proof/../<other>/x` passed) | `..`, `//`, `\` rejected |
| MED | smc_21 | advisory-lock key used `timestamptz::text` (depends on session TimeZone, portal and n8n would not exclude each other) | key = SAST week start rendered in UTC; W13 must use the same expression |
| MED | smc_22 | `cycles_shortfall_credit_cap` evaluated to NULL (= pass) when `committed = topup`, and per-lead rounding could reject valid credits | `ceil(price * committed / (committed - topup))` with a CASE guard |
| MED | smc_05 | `n8n_app` had whole-table SELECT on `profiles` (plain-text `security_answer_*`, Telegram/Discord ids) and on every `user_roles` row | column-level grant `(user_id, full_name, whatsapp_number, notify_dnd)`; roles policy admin-only |
| MED | smc_02 | re-running smc_02 after smc_20 failed ("cannot drop columns from view") | `v_cycle_progress` only created when absent (idempotent) |
| LOW | smc_04 | `smc_private.pseudonym_key` (salt) relied on "no grants" alone | RLS on + revokes |
| LOW | smc_05 | `REVOKE ... FROM anon` left PUBLIC EXECUTE on definer helpers; `smc_hash_contact` anon-callable | revoked from PUBLIC |
| new | smc_24 | no guard that the end state is secure | revokes TRUNCATE/REFERENCES/TRIGGER from every chain table, hardens `facts_reader` (3 connections, read-only default, idle timeout), then **asserts** RLS on, no anon grant, pinned `search_path`, no anon-callable definer; any failure rolls the whole file back |

## 3. Evidence

* **Applies cleanly** on the live-schema mirror: 25/25 files in order, as `postgres` superuser AND as a non-superuser `CREATEROLE` role (hosted-like; role creation, `ALTER ROLE ... SET`, `CREATE EXTENSION btree_gist`, default privileges all work).
* **Idempotent:** every file re-applies without error on a database that already has the whole chain.
* **Existing data untouched:** `supabase/migrations/backup/backup-live.mjs verify` after the chain: all 46 tables, every pre-existing row present and unchanged (new columns ignored). Additions only: `audit_log` +5 (rows written by the chain's own seed triggers), `sla_thresholds` +1 (`smc_first_message`, smc_03).
* **Full undo works:** apply -> run all 25 undo files in reverse -> catalog identical to the baseline and data identical. Only the storage bucket `broker-media` remains (Supabase blocks SQL deletes on storage tables).
* **Security audit** (`supabase/drift/post-apply-security-audit.sql`): zero chain tables without RLS, zero anon privileges on anything the chain created, zero definer functions without a pinned `search_path`, zero anon-callable chain definers.
* **Functional smoke test** (`supabase/drift/smoke-rpc-and-guards.sql`): replacement RPCs (unreachable / no-show, weekly cap of 3, duplicate request, traversal refused, other broker refused), legacy broker may still edit his profile, self-promotion refused.
* **Suites run against the real-schema mirror** (`SMC_BASE=real`): S7-06, S7-07, S7-08/09 (see section 6 for final results). `S7-20` is a readiness evidence gate, not a database test; `W13-claim-tx.local` needs native Postgres binaries (skipped on Windows).

## 4. File by file

Format: (a) creates, (b) touches pre-existing objects, (c) additive-only?, (d) data-loss risk, (e) lock risk, (f) security. "live" means the production project; leads = 4,209 rows.

### smc_00 preflight (new)
(a) five nullable columns on brokers. (b) `ALTER TABLE brokers ADD COLUMN IF NOT EXISTS calendar_email, google_calendar_token, whatsapp_number, firm_address, preferred_language` + a name-collision guard that aborts with a message if a TABLE named `smc_conversations`, `smc_reports`, `bookings` or `v_cycle_progress` exists. (c) yes. (d) none. (e) ACCESS EXCLUSIVE on brokers (18 rows), milliseconds. (f) none.

### smc_01 security
(a) 6 policies (admin-manage on onboarding responses, analysis, appointments, notes; broker-reads-own onboarding; storage broker download); +1 admin system_logs policy (rewrite). (b) Drops "Service role full access..."/"Enable all access for dev" (not present live: no-ops), replaces the appointments/notes admin policies by equivalents (live ones are `has_role(admin)`, not `USING (true)` as the header says), `UPDATE storage.buckets SET public = false` (already false live), **drops storage "Public Access"** (anon can currently read every admin document: an exposure fix), replaces "Brokers can download shared documents" (its `ad.file_path = ad.name` compared a row to itself), **REVOKE ALL FROM anon on ~31 tables**, (rewrite) drops 3 more open policies. (c) no: policy drops/replacements and revokes; nothing deleted. (d) none. (e) < 1 s total, brief locks per table. (f) behaviour changes to the CRM: anon loses access to those tables and to the admin-documents objects; no working flow uses it (frontend uses SECURITY DEFINER RPCs or service-role edge functions; `Setup.tsx` health check and the already-broken anon `.insert().select()` in `BrokerForgotPassword.tsx` only change error text). Admin "open document" links using `getPublicUrl` (ContractGenerator.tsx:631, InvoiceGenerator.tsx:631, ProposalGenerator.tsx:731) must use `createSignedUrl` (pattern in `src/pages/portal/Agreement.tsx:30`) if the bucket is, or becomes, private: check `select public from storage.buckets where id='admin-documents'` live (mirror says false). Policy DDL on `storage.objects` as `postgres` is routinely done but unverified here: dry-run in the runbook.

### smc_02 core
(a) extension btree_gist; helper functions; tables brands(+2 seed), pricing(+3 seed), cycles, outcomes, replacements, bank_credits, invoices_smc, webhook_events; enum; views smc_conversations, bookings, v_cycle_progress; ~35 indexes; EXCLUDE constraint `appointments_smc_no_overlap`; audit triggers. (b) brokers: ~50 columns incl. stored generated `active` (table rewrite of 18 rows), CHECK, `brokers_status_check` widened; leads: `email DROP NOT NULL`, ~70 columns (constant defaults, no rewrite), `leads_smc_checks` (validates 4,209 rows, all NULL-tolerant), 7 indexes (non-concurrent, SHARE lock, ms), BEFORE trigger `smc_leads_stage_stamp` (returns immediately for legacy rows); lead_activities: `agent_id`, `lead_id` DROP NOT NULL, columns, indexes; communications: 4 CHECKs swapped for supersets, 16 columns, 2 indexes; appointments: 20 columns, brand-scoped CHECK, unique + GiST exclusion indexes; admin_documents: 9 columns + CHECK; audit_log: converged (see section 2); AFTER triggers `smc_audit('brand_scoped')` on brokers, leads, appointments, communications, admin_documents (return early for legacy rows). (c) mostly: 3 DROP NOT NULL (relaxing), 5 constraint swaps to supersets, one 18-row table rewrite, new triggers on 5 live tables. (d) none: every replacement CHECK is a superset of the live one, new CHECKs are NULL-tolerant or scoped to `brand_id IS NOT NULL`. (e) 1-3 s with ACCESS EXCLUSIVE held on brokers/leads/lead_activities/communications/appointments until commit (all locks are held to the end of the file): use `lock_timeout`, off-hours. (f) new tables RLS-closed by the rewrite until smc_05; all definer functions pin `search_path = public`. Open decisions in section 5 (broker visibility of new lead columns).

### smc_03 ops, reporting, DSR
(a) schema `ops`; 12 public + 7 `ops` tables (ad_metrics, comments, escalations, insights, lead_pulse, capi_log, suppression, dsr_requests, retention_log, incidents, obligations, broker_media, ops.*); `smc_erase_lead` (definer, EXECUTE revoked from PUBLIC/anon/authenticated); view smc_reports. (b) report_history: `sent_at`, `recipients` DROP NOT NULL, status CHECK widened, 15 columns; message_templates: channel CHECK widened, 11 columns; **one seed row INSERTed into live `sla_thresholds`** (`smc_first_message`; the admin SLA page will list it and it is editable); profiles: `whatsapp_number`, `notify_dnd` columns. (c) mostly. (d) none. (e) small tables only, < 1 s. (f) fail-closed block added; `dsr_requests`/`suppression` hold requester contact / hashed numbers (RLS + admin/n8n only after smc_05). `smc_erase_lead` pseudonymisation is reversible (unsalted SHA-256 of a ~10^9 phone space, `dedupe_hash` kept): decision in section 5.

### smc_04 facts (decision layer)
(a) schemas `facts`, `smc_private`, salt table (generated inside the DB), 3 helper functions, `smc_watchlist` (definer, admin check), 10 views. (b) none: reads only. (c) yes. (d) none. (e) none (query cost grows with SMC leads). (f) views are owner-run by design; schemas closed to anon/authenticated by smc_05; salt table now RLS-closed. Design notes: `fact_outcome.summary_redacted`/`fact_lead.disqualified_reason` reach the LLM role on the strength of write-time redaction; `fact_cycle` still carries `policies_written_reported` which the FAIS note says must stay out of "Ask the data" (decision, section 5).

### smc_05 access control
(a) roles `n8n_app`, `facts_reader` (NOLOGIN, no passwords in SQL); RLS + policies for 28 tables; guard trigger; two portal RPCs; grants. (b) live `audit_log`: RLS stays, `REVOKE INSERT/UPDATE/DELETE/TRUNCATE` from authenticated/n8n_app/anon and UPDATE/DELETE/TRUNCATE from service_role (live writers are definer triggers, readers are admin SELECT only); GRANTs to `n8n_app` on 8 live tables with `brand_id IS NOT NULL` policies (legacy rows invisible to n8n); RESTRICTIVE policies on leads/appointments (brand rows: admin only for broker writes; legacy rows unaffected); permissive SELECT for brokers on their own SMC timeline/reports/documents; trigger on brokers. (c) no. (d) none. (e) sub-second. (f) rewrites: guard, self-insert, lead_activities, profiles columns, roles. Open: brokers can still read, through the existing policies, `communications.content` / lead tracking columns of their routed leads (section 5).

### smc_06 pass 2
(a) 6 public + 10 ops tables, 2 sequences, views ads/bookings/smc_reports/ops.*/facts.*, portal RPCs. (b) brokers: 20 columns, 4 generated columns (4 small rewrites), CHECK, status CHECK (Prospect kept), billing_ref trigger; **leads: stored generated `qualified` = full table rewrite of 4,209 rows (~0.2-1.5 s under ACCESS EXCLUSIVE)**; 4 unique indexes; appointments: columns + CHECK; report_history/message_templates columns. (c) mostly. (d) none. (e) 1-4 s total, locks held to the end of the file; set `lock_timeout`. (f) the live-only definer bodies `admin_bulk_insert_leads` and `handle_new_user_master` were not in the repo: the new stored generated columns (`leads.qualified`, `brokers.broker_id/adviser_name/practice_name/adviser_whatsapp/active`) break any code that writes a whole row record; run the check in the runbook before applying. `smc_portal_event` also runs for legacy brokers: add `brand_id IS NOT NULL` + payload size limit (decision list).

### smc_07 pass 2 RLS
(a) no objects. (b) none live (policies/grants on chain objects only). (c) yes. (d)(e) none. (f) all 16 pass-2 tables RLS-closed, anon revoked, ops owner-run views restricted to n8n_app; broker read-own on support_events.

### smc_08 pass 3
(a) Vault wrappers (paystack), `smc_request_ip`, `smc_sign_document`, `smc_report_policies_written`, `smc_faculty_tiles`, `smc_console_*` admin RPCs, `ops.watchlist_targets` (+7 seeds), guard replace. (b) `GRANT ... auth.uid() TO n8n_app` (inside an exception block; on hosted it may be a silent no-op rather than an error: verify `has_function_privilege('n8n_app','auth.uid()','EXECUTE')` after); admin_documents: 2-4 columns + CHECK. (c) yes for live objects. (d)(e) none. (f) all definer functions pin `search_path`, revoked from PUBLIC/anon. Open: `service_role` keeps default EXECUTE on the Vault wrappers (it can read decrypted Paystack tokens; the Microsoft ones are deliberately granted to it by smc_18); `smc_request_ip` trusts the left-most `x-forwarded-for` (signer IP is forgeable: prefer `cf-connecting-ip`).

### smc_09 storage
(a) private bucket `broker-media` (50 MB, image/video/audio MIME list) + 6 policies. (b) none (bucket and policy names are its own; live buckets/policies untouched). (c) yes. (d) none. (e) none. (f) brokers write only under `<their brokers.id>/`; admin read-only; the n8n grant is now non-fatal. Open: brokers can UPDATE/DELETE objects under their prefix after admin approval of an intro take, and (smc_20/21) can delete no-show proof after requesting a replacement; MIME check may reject `video/webm;codecs=vp9,opus`. The file has its own BEGIN/COMMIT (harmless).

### smc_10 pass 4
(a) `wa_threads`, `ops.ctwa_clicks`, `facts.w14_*` functions (definer, `search_path public, facts, pg_temp`, n8n_app only). (b) a 0-row `UPDATE brokers` (close_rate is new), `brokers_smc_close_rate_fraction` CHECK. (c) yes. (d)(e) none. (f) OK. The W14 functions read `facts.v_params`, `cycle_counts`, ... that NO migration creates (the `analytics/*.sql` layer): they create fine and every call fails until that layer is deployed (also smc_12/13).

### smc_11 pass 5
(a) `ops.notifications.attempts`, Vault read wrapper. (b) none. (c) yes. (f) service_role keeps EXECUTE (see smc_08).

### smc_12 pass 6
(a) `smc_hash_contact_v1`, new `smc_hash_contact` rule, `smc_erase_lead` v2, 2 obligations seeds, W14 report/reconcile. (b) a re-hash `UPDATE` that matches 0 live leads (`brand_id` NULL everywhere; one seq scan, ~10 ms). (c) behaviour of `smc_hash_contact` changes (used by the leads BEFORE trigger for SMC rows only). (d)(e) none. (f) OK; erasure caveat above.

### smc_13 pass 7
(a) calendar/credential columns on brokers, Vault wrappers for the Microsoft refresh token, `smc_brokers_guard_pass7`, `facts.broker_pulse`, RESTRICTIVE policy hiding lead pulse from brokers on `communications`, partial unique index on communications. (b) brokers: 4 columns + 2 CHECKs, new trigger; communications: RESTRICTIVE SELECT policy (no-op for legacy rows) + non-concurrent index (SHARE lock, ms); lead_activities: policy re-created atomically. (c) yes for live data. (d)(e) none material. (f) token VALUE only in `vault.secrets`; `calendar_token_ref` holds the NAME and a CHECK enforces the pattern; anon/authenticated/n8n_app read only through the wrappers. Open: `vault.secrets` rows accumulate per reconnect.

### smc_14 pass 8
(a) `brokers.media_share_pct` + CHECK. (b) brokers column. (c) yes. (f) guard extended (rewrite).

### smc_15 budget 1500
(a) `leads_smc_checks` re-issued with the 1,250-1,499 / 1,500+ bands; stored generated `leads.premium_1500`. (b) drop + add of the CHECK on **leads (validates 4,209 rows)** and a **table rewrite of leads** (all indexes rebuilt): ~0.1-0.5 s, ACCESS EXCLUSIVE. (c) no. (d) none (superset of smc_02, verified by diff). (e) set `lock_timeout`; if the runner is not one transaction the DROP-then-ADD leaves a short window without the constraint (use the runner modes in the runbook). (f) none.

### smc_16 ads_launch_plan / smc_17 ads_write_log
(a) one table each (+ seed row for the launch plan), RLS, admin policy + n8n_app rw, audit/updated_at triggers. (b) none. (c) yes. (d)(e) none. (f) RLS on, anon revoked; the residual TRUNCATE for authenticated is removed by smc_24.

### smc_18 ms_oauth edge
(a) `smc_ms_disconnect(uuid)` (definer, `search_path public, pg_temp`). (b) `DELETE FROM vault.secrets` for one broker's `ms_refresh_<id>_*` names; needs DELETE on `vault.secrets` for `postgres` (verify: `select has_table_privilege('postgres','vault.secrets','DELETE')`). (c) yes. (d) intended: that broker's refresh tokens. (f) the function trusts `p_broker_id`: the edge function must derive it from the verified JWT, never from the request body. Granted to service_role and n8n_app only.

### smc_19 capture v2
(a) 29 columns on leads (constant defaults, fast), CHECK `leads_capture_v2_checks` (NOT VALID), `brokers.licence_categories`, table `lead_offers`. (b) leads/brokers columns. (c) yes. (d) none. (e) catalog-only, ms. (f) audit redaction and `lead_offers` access model rewritten. Open: brokers can read `email_verify_code_hash` (sha256 of lead_id|code, brute-forceable), `capture_state`, `declined_broker_ids` of their own routed leads via the existing full-row SELECT policy (move to a service-only side table).

### smc_20 feedback firewall (imported)
(a) `outcomes_outcome_kind_check` (+ `unreachable`), 4 columns + index on replacements, `smc_week_start`, `smc_request_noshow_replacement`, redefined `v_cycle_progress` (first 17 columns identical in name/order/type, 3 appended: verified against smc_02, no other redefinition exists). (b) swaps the inline outcomes CHECK for a superset, replaces `smc_replacements_cap` (per cycle -> per Calendar Week, counts rejected rows too), `REVOKE EXECUTE ... smc_report_policies_written FROM authenticated`. (c) no. (d) none (empty tables). (e) negligible. (f) definer, `search_path public`, identity from `smc_current_broker_id()`, cannot act on another broker's booking; rewrites: proof traversal, NULL-safe view predicates. Open: the request can overwrite an existing `attended` outcome inside the 10-30 min window; `outcomes.replacement_eligible` (generated) does not know the new `unreachable` kind. **W13 (`automation/W13.json`) still enforces the old per-cycle cap in its own SQL** (`replacement_cap_reached`), so workflow and database now disagree about the cap: reconcile before go-live.

### smc_21 unreachable replacements (imported)
(a) `smc_request_replacement(uuid,text,text)`; `smc_request_noshow_replacement` becomes a wrapper; comments. (b) replaces smc_20's function. (c) yes. (f) as smc_20; the n8n_app role has no EXECUTE and `auth.uid()` is NULL on its connection, so "WhatsApp calls the same function" is not possible: W13 must reproduce the checks and the lock key.

### smc_22 topup (imported)
(a) `invoices_smc.topup_leads/topup_starts_at`, CHECK `invoices_smc_topup_chk`, partial unique index (one open top-up per broker), `cycles.topup_leads`, CHECK `cycles_shortfall_credit_cap` (replaces the unnamed smc_02 CHECK, found by `ILIKE` on its definition; verified it matches exactly one constraint). (b) chain tables only. (c) no (cap replaced and loosened by design). (d)(e) none. (f) rewrite above; note `kind = 'add_on'` is now exclusive to top-ups.

### smc_23 budget three bands (imported)
(a) `leads_smc_checks` with `lt750, 750_1499, 1500_plus` + the legacy codes. (b) drop + add on leads (same cost and caveats as smc_15). (c) no. (d) none: every other clause identical to smc_15; the budget list is smc_15's plus `750_1499`; nothing added elsewhere is lost (smc_19 uses a separate constraint).

### smc_24 security sweep (new)
See section 2.

## 5. Not changed: owner decisions and follow-ups

1. **Brokers can read SMC conversation rows** (`communications.content`, `recipient_contact`) and the new tracking columns of their routed leads (`client_ip`, `client_user_agent`, `fbclid`, `conv_state`, `health_flag`, `email_verify_code_hash`) through the pre-existing full-row policies. smc_13 deliberately lets brokers see non-pulse SMC conversation rows, so I did not remove it. If that is not intended: RESTRICTIVE SELECT `brand_id IS NULL OR smc_is_admin()` on `communications`, and a side table for the tracking columns.
2. Pre-existing definer RPCs executable by `anon` (19) and `authenticated` (22), `has_role` anon-callable: out of scope, lint list in `DRIFT-REPORT.md`.
3. `outcomes` identity columns are broker-editable on UPDATE (retarget `booking_id`/`lead_id`, backdate, self-mark `no_show` -> replacement-eligible): add the `smc_outcomes_guard` trigger from the part-2 review after checking `Leads.tsx` payloads.
4. `smc_sign_document` accepts client-supplied IP / user agent / hash (e-sign evidence is forgeable); take them from `request.headers`.
5. Vault wrappers: `service_role` keeps EXECUTE (Paystack wrappers: revoke if no edge function needs them).
6. `facts_reader`: also set read-only and the timeout on the pooler/connection string; remove `policies_written_reported` from `facts.fact_cycle` for that role (FAIS).
7. `smc_erase_lead` pseudonymisation is reversible (random token + null `dedupe_hash` instead).
8. W14 payload functions need the `analytics/*.sql` layer deployed (`facts.v_params`, `cycle_counts`, ...).
9. W13 per-cycle cap vs database per-week cap (above); `smc_21` lock key must be mirrored in W13.
10. Anon still holds ALL table grants on the agency-CRM and EMMA tables (RLS only): decide per table; EMMA/Vercel use the service key and anon only for `tunnel_config` SELECT.
11. `brokers.active`, `leads.qualified` etc. are generated columns: any code that writes a whole row object back fails ("cannot insert into generated column"). Run the runbook check on the bodies of `admin_bulk_insert_leads` and `handle_new_user_master` before applying.

## 6. Behaviour changes to the EXISTING CRM (read before applying)

* anon loses every privilege on ~31 CRM tables (smc_01) and the storage "Public Access" read; three permissive policies are dropped/tightened (invite update, security-question insert, system_logs read).
* Admin document links built with `getPublicUrl` will not work if the bucket is private (use signed URLs).
* A new `sla_thresholds` row (`smc_first_message`) appears in the admin SLA list; `audit_log` gains five columns and a few seed rows.
* `brokers`, `leads`, `lead_activities`, `communications`, `appointments`, `admin_documents`, `report_history`, `message_templates`, `profiles` gain columns; three tables (brokers, leads, appointments) get RESTRICTIVE write policies, triggers or guards that act on SortMyCover rows only; a legacy broker can no longer enrol himself in SortMyCover.
* No existing row is modified or deleted.

## 7. Test results

Filled in by the final run (see `APPLY-RUNBOOK.md` section 9 and the commit message of the test run): S7-06, S7-07, S7-08/09 against the live-schema mirror; static suites (`node --test` over `automation/tests/*.test.mjs`, `automation/billing/*.test.js`).
