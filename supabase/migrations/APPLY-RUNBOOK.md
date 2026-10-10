# APPLY RUNBOOK: smc_00 .. smc_24 on project `cmsylaupctrbsvzrgzwy`

Everything below is for a human (Jonathan) to run. Nothing in this repo or in the review sessions has applied, or may apply, any of it to the live project. Read `MIGRATION-SAFETY-REVIEW.md` (what changes) and `DRIFT-REPORT.md` (why) first.

**User-gated steps (cannot be automated):** the backup (needs the DB password), the live fingerprint / pre-check queries, the apply itself, the storage-ownership dry run, the decisions in review section 5, enabling Auth leaked-password protection.

Free plan: **no managed backups, no PITR, no branching.** The backup in section 4 is the only safety net besides the undo files. Do not skip it.

## 1. Go / no-go

| Gate | How | Expected |
|---|---|---|
| Fingerprint unchanged | section 3.1 | the md5s below |
| Backup taken and verified | section 4 | manifest with 46 tables |
| Quiet window | no admin/broker session in the CRM, EMMA idle | off-hours (SAST night); locks are held to the end of each file (1-4 s for the big ones) |
| Apply connection | `postgres` role, session pooler or direct, NOT PostgREST (anon `statement_timeout` 3 s, authenticated 8 s) | |
| `lock_timeout` | `-c lock_timeout=5s` | a stuck CRM transaction makes a file abort cleanly instead of queueing |

## 2. Baseline recorded 2026-10-10 (get_advisors, before anything is applied)

**Security**
* `rls_enabled_no_policy` INFO x4: `call_transcripts`, `conversation_messages`, `conversations`, `research_notes` (EMMA tables, service-role only: intended).
* `anon_security_definer_function_executable` WARN x19: broker_add_lead_note, broker_delete_lead_note, broker_get_order_notes, broker_get_pipeline, broker_send_feedback, broker_set_lead_stage, broker_update_lead_status, get_admin_invite_by_token, get_broker_invite_by_token, get_order_leads, get_order_summary, handle_new_user_master, has_role, sign_order_contract, sign_order_contract_drawn, submit_broker_analysis, submit_broker_onboarding, use_admin_invite, validate_admin_invite.
* `authenticated_security_definer_function_executable` WARN x22 (the 19 above's authenticated twin plus admin_bulk_insert_leads, admin_list_orders_activity, admin_mark_order_paid).
* `auth_leaked_password_protection` WARN x1 (Auth setting, switch on in the dashboard).

**Performance**
* `unindexed_foreign_keys` INFO x17 (appointments, broker_analysis, broker_feedback, broker_invites, broker_notes, broker_onboarding_responses, broker_reset_requests, communications, document_shares, lead_activities, leads, referrals, scheduled_reports, sla_alerts, sla_thresholds ...).
* `auth_rls_initplan` WARN x96 (41 tables: policies calling `auth.uid()` per row instead of `(select auth.uid())`).
* `multiple_permissive_policies` WARN x120 (22 tables).
* `unused_index` INFO x31.

**Expected after the chain:** the security list gains nothing new from the chain objects (smc_24 asserts it); the 19/22 pre-existing definer warnings are unchanged (not touched), the 4 EMMA INFOs unchanged. Performance: new tables add `auth_rls_initplan`/`multiple_permissive_policies` noise for their policies (they call `smc_is_admin()` / `smc_current_broker_id()`, wrap them as `(select ...)` later if the tables grow), new unindexed-FK INFOs for the new tables' FKs, and `unused_index` INFOs while they are empty. Record the post-apply lists and compare: any NEW `ERROR`/`WARN` in the security list that names an `smc_*`, `ops.*` or `facts.*` object is a stop.

## 3. Pre-checks (read-only SELECTs)

### 3.1 Fingerprint (`supabase/drift/live-fingerprint.sql`)
Run it in the SQL editor. Captured values (2026-10-10, identical on live and on the verified local mirror):

| part | n | md5 |
|---|---|---|
| columns | 508 | fc37d79ddb00f2094a9d79a83b7ccaa8 |
| constraints | 127 | 24ddd60c8066bc8c4778eba982b06bdb |
| indexes | 106 | c45f9b49907e498563a495140fda0af4 |
| policies | 105 | 7cd132a63a1b64d9dbd8f75c7a4c36b3 |
| triggers | 17 | 7885b291d4be33ff6d510e173cc1f342 |
| functions | 28 | 3ea2d709cc97eca566bed74e7e1554a4 |
| rls_flags | 46 | 7b7e57b5d5f390b6f855145bfb7ea671 |
| schemas_roles | 0/0 | expect 0/0 |
| rows (brokers, leads, lead_order_items, audit_log, broker_onboarding_responses) | 18, 4209, 4200, 41, 14 | (they may legitimately grow; structure must not change) |

**Any structural md5 different = the project drifted after this review: STOP, re-run the drift capture (`supabase/drift/catalog-dump.sql`) and re-review.** Row counts growing is fine.

### 3.2 Environment checks
```sql
select has_table_privilege('postgres','vault.secrets','DELETE');          -- smc_18 needs true
select rolcreaterole, rolsuper, rolbypassrls from pg_roles where rolname = current_user;  -- postgres: true,false,true
select extname from pg_extension where extname in ('btree_gist','pg_net','supabase_vault');   -- btree_gist is created by smc_02 (trusted); pg_net absent is fine
select public from storage.buckets where id = 'admin-documents';          -- false expected (if true, read the smc_01 note on getPublicUrl)
select distinct status from public.brokers;                              -- subset of Active / Inactive / Prospect
select pg_get_functiondef('public.handle_new_user_master'::regproc) ~* 'populate_record|\(NEW\)\.\*|row\(' as writes_whole_row_a,
       pg_get_functiondef('public.admin_bulk_insert_leads'::regproc) ~* 'populate_record|\.\*' as writes_whole_row_b;   -- both false expected (generated columns: see review smc_06)
```
If `writes_whole_row_*` is true, rewrite that function with explicit column lists in the same change; otherwise `leads.qualified` / `brokers.active` (generated) would break it.

### 3.3 Optional dry run of the risky DDL classes (rolled back)
Uses locks briefly on the live DB, writes nothing: `begin; create role smc_probe nologin; alter role smc_probe set statement_timeout = '5s'; drop policy if exists "Public Access" on storage.objects; rollback;` (confirms the `postgres` role may manage roles and `storage.objects` policies). Skip if you prefer; the chain was rehearsed as a non-superuser CREATEROLE role locally, but the storage/auth/vault ownership on hosted Supabase cannot be reproduced locally.

## 4. Backup (not committed, outside the repo)

Output folder: `C:\Users\Jono\lv-mig-backup\<UTC timestamp>\` (created by the script). **Never commit it** (it holds leads and broker personal data); `.gitignore` should not need to know about it because it lives outside the repo.

Get the DB URL from Dashboard -> Connect -> **Session pooler** (the direct host is IPv6-only on the free plan): `postgresql://postgres.cmsylaupctrbsvzrgzwy:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`. Keep it in the environment only.

PowerShell:
```powershell
$env:SUPABASE_DB_URL = 'postgresql://postgres.cmsylaupctrbsvzrgzwy:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres'
cd C:\Users\Jono\lv-mig
node supabase\migrations\backup\backup-live.mjs backup          # NDJSON per table + manifest.json + catalog.json, one read-only snapshot
# second, independent, restorable copy (custom format) using the Postgres 17 client already on this machine's Docker:
docker run --rm -e PGPASSWORD='<DB_PASSWORD>' -v C:\Users\Jono\lv-mig-backup:/out postgres:17-alpine pg_dump "host=aws-0-<region>.pooler.supabase.com port=5432 user=postgres.cmsylaupctrbsvzrgzwy dbname=postgres sslmode=require" -n public -Fc -f /out/public-before-smc.dump
```
`backup-live.mjs` writes per table: rows (cursor count AND an independent `count(*)` from the same snapshot, mismatch = non-zero exit), bytes, `sha256` of the file, and `canon_sha256` of the sorted rows. The `catalog.json` file holds every function, policy, trigger and constraint definition and the applied-migration list (a schema backup you can read).
Check: `manifest.json` lists 46 tables; `leads` rows = 4209 (or the current count); `lead_order_items` = 4200. Open nothing else.
Restore path if ever needed: the `.dump` with `pg_restore --clean --if-exists -n public`, or per table `INSERT INTO public.t SELECT * FROM jsonb_populate_recordset(null::public.t, '<ndjson lines as a json array>')`. Test that you can read the dump once (`pg_restore -l`).

## 5. Apply

Method (per file, in this exact order, stop at the first error; each file is one transaction, a failure rolls that file back completely):
```powershell
$files = Get-ChildItem C:\Users\Jono\lv-mig\supabase\migrations\2026*_smc_*.sql | Sort-Object Name
foreach ($f in $files) {
  Write-Host "== $($f.Name)"
  Get-Content $f.FullName -Raw | docker run --rm -i -e PGPASSWORD='<DB_PASSWORD>' -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' postgres:17-alpine psql "host=aws-0-<region>.pooler.supabase.com port=5432 user=postgres.cmsylaupctrbsvzrgzwy dbname=postgres sslmode=require" -v ON_ERROR_STOP=1 -1 -f -
  if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED at $($f.Name)"; break }
  # run the verification query for this step (table in 5.1) before continuing
}
```
Or paste each file into the SQL editor one at a time (the editor runs a file as one implicit transaction; add `set lock_timeout = '5s';` as the first line). Do NOT run two files in one editor submission.
Order: `20261002000000 smc_00` -> `...010000 smc_01` -> ... -> `...140000 smc_14` -> `20261005150000 smc_15` -> `16` -> `17` -> `20261007180000 smc_18` -> `19` -> `20261008200000 smc_20` -> `20261010210000 smc_21` -> `22` -> `23` -> `20261010240000 smc_24`.

Migration history: files run through psql leave no row in `supabase_migrations.schema_migrations`. If you use the Supabase CLI later, register them with `supabase migration repair --status applied <version>` for each of the 25 versions (they are unique 14-digit versions on purpose).

### 5.1 Verification after each step

| After | Query (SQL editor) | Expect |
|---|---|---|
| 00 | `select count(*) from information_schema.columns where table_name='brokers' and column_name in ('calendar_email','google_calendar_token','whatsapp_number','firm_address','preferred_language')` | 5 |
| 01 | `select count(*) from pg_policies where tablename in ('broker_invites','broker_security_questions') and policyname in ('Token holder can update invite','Allow anyone to insert security questions')` ; `select has_table_privilege('anon','public.leads','SELECT')` | 0 ; false |
| 02 | `select (select count(*) from brands), (select count(*) from pricing), pg_get_constraintdef(oid) like '%Prospect%' from pg_constraint where conname='brokers_status_check'` ; `select count(*) from information_schema.columns where table_name='audit_log' and column_name in ('at','actor_uid','actor_role','source','row_id','diff','reason')` | 2, 3, true ; 7 |
| 03 | `select count(*) from sla_thresholds` ; `select to_regclass('public.smc_reports') is not null, to_regclass('ops.pulses') is not null` | 5 (4 + 1) ; true, true |
| 04 | `select count(*) from information_schema.views where table_schema='facts'` | 10 |
| 05 | `select rolname, rolcanlogin from pg_roles where rolname in ('n8n_app','facts_reader')` ; `select count(*) from pg_policies where policyname = 'smc restrict broker self-insert'` | 2 rows, both false ; 1 |
| 06 | `select count(*) from information_schema.columns where table_name='leads' and column_name='qualified'` ; `select count(*) from pg_tables where schemaname='ops'` | 1 ; 17 |
| 07 | `select count(*) from pg_tables where schemaname='ops' and not rowsecurity` (the final all-table RLS assertion is smc_24) | 0 |
| 08-14 | `select to_regclass('ops.watchlist_targets') is not null, (select count(*) from storage.buckets where id='broker-media')` after 09 | true ; 1 |
| 15-17 | `select count(*) from information_schema.columns where table_name='leads' and column_name='premium_1500'` | 1 |
| 18-19 | `select to_regclass('public.lead_offers') is not null` ; `select count(*) from information_schema.columns where table_name='leads' and column_name in ('alt_email','wa_id','offer_status')` | true ; 3 |
| 20-23 | `select count(*) from information_schema.columns where table_name='v_cycle_progress'` ; `select pg_get_constraintdef(oid) from pg_constraint where conname='leads_smc_checks'` | 20 (17 + delivered, replacement_requests_this_week, replacement_weekly_max) ; contains `750_1499` |
| 24 | file succeeds (it fails with the offending object name otherwise); `select count(*) from pg_tables where schemaname='public'` | 76 |

Smoke test of the onboarding trigger (it swallows errors, so a broken `brokers_status_check` would otherwise be invisible) after smc_02 and again after smc_24:
```sql
begin;
select public.submit_broker_onboarding(null,'Smoke Test','smoke@example.test','0000000000','Smoke Firm',null,null,false,false,null,0,0,null,'none','fast','1','manual','0','no','ok',1,1,'clear','clear','clear','now',0,'{}');
select status from public.brokers where email = 'smoke@example.test';     -- expect Prospect
rollback;
```
(Adjust the argument list to your function's 28 parameters; all of it is rolled back.)

### 5.2 After the last file: counts and posture
1. Re-run `node supabase\migrations\backup\backup-live.mjs verify C:\Users\Jono\lv-mig-backup\<ts>` -> `VERIFY OK`. Expected additions only: `audit_log` +5 and `sla_thresholds` +1 (plus anything the live apps wrote meanwhile). Any `changed-or-lost` > 0 = rollback decision D4.
2. Run the Supabase advisors again (security and performance) and compare with section 2.
3. Spot-check the CRM: admin login, broker login, broker invite flow, onboarding form submit (anon), contract signing, document upload and download, an EMMA/Teams message (the `conversations` table is untouched).
4. Set Auth -> Passwords -> leaked password protection on. Do not add `ops`, `facts` or `smc_private` to the API "Exposed schemas".

## 6. Rollback decision points

| Point | Trigger | Action |
|---|---|---|
| D1 after smc_01 | any CRM flow in 5.2.3 broken (e.g. admin document links) | run `undo/...smc_01...undo.sql` (it re-creates the removed policies and re-grants anon: re-opens the earlier exposure), fix the app (signed URLs), retry |
| D2 after smc_02/03 | onboarding smoke test fails, any error | the failing file already rolled back; undo files of the previous steps in reverse; investigate |
| D3 after smc_05 | n8n/admin cannot read; role creation failed | undo 05..00 in reverse |
| D4 after any step or at the end | `verify` reports changed-or-lost rows, or CRM broken | undo 24 -> 00 in reverse (`supabase/migrations/undo/`), re-run `verify`; if rows are damaged restore from the backup (section 4) |
| D5 after go-live | SMC data exists | undo drops tables and columns **with their data**; export first (`backup` again), or fix forward |

Undo rules (`supabase/migrations/undo/*.undo.sql`, generated from a catalog diff and tested): run strictly in reverse order (24 first, 00 last), one file per transaction, only while no SortMyCover data you want to keep exists. Rehearsed locally: apply 25 -> undo 25 -> catalog identical to baseline, data identical, except the storage bucket `broker-media` (Supabase blocks SQL deletes on storage tables: remove it in the dashboard) and the roles (dropped by undo 05). Not reversible by SQL: data written into dropped objects; the storage bucket; `CREATE EXTENSION btree_gist` (harmless, left in place).

## 7. What was not verified

* Ownership/ACL of `storage`, `auth` and `vault` objects on hosted Supabase (the local mirror owns them with the migration role): dry run 3.3 and `has_table_privilege` checks in 3.2.
* The bodies of `admin_bulk_insert_leads`, `handle_new_user_master` against the new generated columns (checked from the dump: neither populates a record, but verify 3.2).
* Behaviour of the n8n workflows and the portal against the migrated schema end to end (only the database side was tested).
* Performance on a larger `leads` table.

## 8. Files in this folder

`MIGRATION-SAFETY-REVIEW.md`, `DRIFT-REPORT.md`, `APPLY-RUNBOOK.md` (this file), `undo/` (25 undo scripts), `backup/backup-live.mjs`; and `supabase/drift/` (live schema mirror, prelude, seed, fingerprint, catalog dump, security audit, smoke test, undo generator).

## 9. Local test results

(See the section at the end of `MIGRATION-SAFETY-REVIEW.md`.)
