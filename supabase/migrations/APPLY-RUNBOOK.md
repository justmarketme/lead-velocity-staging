# APPLY RUNBOOK: crm-nurture chain (smc_00 .. smc_07, 2026-10-11) on project `cmsylaupctrbsvzrgzwy`

Everything below is for a human (Jonathan) to run. Nothing in this repo or in the review sessions has applied, or may apply, any of it to the live project. Read `CRM-NURTURE-SCHEMA.md` (what the chain adds, what it drops, what changes in the CRM) and `DRIFT-REPORT.md` (why file 00 exists) first. This replaces the runbook of the 25-file chain (`migrations-merge`); do NOT apply those files.

**User-gated steps (cannot be automated):** the backup (needs the DB password), the fingerprint and pre-checks, the apply itself, the hosted-ownership checks (`auth.uid()`, `storage.objects`, `vault.secrets`), the decisions D1-D12 in `CRM-NURTURE-SCHEMA.md` section 8, enabling Auth leaked-password protection, enabling LOGIN + a password for `n8n_app`.

Free plan: **no managed backups, no PITR, no branching.** The backup in section 4 is the only safety net besides the undo files.

## 1. Go / no-go

| Gate | How | Expected |
|---|---|---|
| Fingerprint unchanged | section 3.1 | the md5s below |
| Backup taken and verified | section 4 | manifest with 46 tables |
| Quiet window | no admin/broker session in the CRM, EMMA idle | off-hours; file 02 holds ACCESS EXCLUSIVE locks on brokers / leads / lead_activities / communications / appointments until it commits (sub-second: no table rewrite of leads) |
| Apply connection | `postgres` role, session pooler or direct, NOT PostgREST | |
| `lock_timeout` | `-c lock_timeout=5s` | a stuck CRM transaction makes a file abort cleanly instead of queueing |
| Local rehearsal green | `node supabase/drift/rehearse-chain.mjs` on this branch | `REHEARSAL PASSED` |

## 2. Baseline (get_advisors 2026-10-10, unchanged; see the previous runbook in git history for the full lists)

Security: `rls_enabled_no_policy` x4 (EMMA tables), `anon_security_definer_function_executable` x19, `authenticated_security_definer_function_executable` x22, `auth_leaked_password_protection` x1. Expected after the chain: the security list gains nothing that names an `smc_*` object (file 07 asserts it); the 19/22 pre-existing definer warnings are unchanged. New tables add `auth_rls_initplan` / `multiple_permissive_policies` / unused-index noise in the performance list. Any NEW security `ERROR`/`WARN` naming a chain object is a stop.

## 3. Pre-checks (read-only SELECTs)

### 3.1 Fingerprint (`supabase/drift/live-fingerprint.sql`)
**Known drift since this capture (2026-10-12):** `20261012120000_broker_documents.sql` was applied live. It adds four nullable columns to `admin_documents` (broker_id, kind, signed_at, signed_by), the FK + check constraint `admin_documents_kind_check`, index `admin_documents_broker_id_idx`, and policies "Brokers can view their own documents" (admin_documents) and "Brokers can read their own documents" (storage.objects). The columns / constraints / indexes / policies md5s below therefore no longer match; re-capture the fingerprint and re-run the rehearsal with that migration in the mirror before applying the chain. The chain does not touch those columns.
Re-checked live 2026-10-11 (identical to the 2026-10-10 capture and to the local mirror):

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
| rows (brokers, leads, lead_order_items, audit_log, onboarding) | 18, 4209, 4200, 41, 14 | may grow; structure must not change |

**Any structural md5 different = the project drifted: STOP, re-capture (`supabase/drift/catalog-dump.sql`) and re-rehearse.**

### 3.2 Environment checks
```sql
select has_table_privilege('postgres','vault.secrets','DELETE');          -- smc_ms_disconnect needs true
select rolcreaterole, rolsuper, rolbypassrls from pg_roles where rolname = current_user;  -- postgres: true,false,true
select public from storage.buckets where id = 'admin-documents';          -- false (already private: see CRM-NURTURE-SCHEMA.md 6.2)
select distinct status from public.brokers;                              -- subset of Active / Inactive / Prospect
select id, title, status from public.lead_orders;                        -- the two Discovery orders; both keep brand_id NULL
```

## 4. Backup (outside the repo, never committed)

Unchanged from the previous runbook: `node supabase/migrations/backup/backup-live.mjs backup` with `SUPABASE_DB_URL` (session pooler) in the environment, plus a `pg_dump -n public -Fc` through `postgres:17-alpine`. Check `manifest.json` lists 46 tables, `leads` = 4209 (or current), `lead_order_items` = 4200.

## 5. Apply

```powershell
$files = Get-ChildItem C:\Users\Jono\lv-nurture\supabase\migrations\20261011*_smc_*.sql | Sort-Object Name
foreach ($f in $files) {
  Write-Host "== $($f.Name)"
  Get-Content $f.FullName -Raw | docker run --rm -i -e PGPASSWORD='<DB_PASSWORD>' -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' postgres:17-alpine psql "host=aws-0-<region>.pooler.supabase.com port=5432 user=postgres.cmsylaupctrbsvzrgzwy dbname=postgres sslmode=require" -v ON_ERROR_STOP=1 -1 -f -
  if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED at $($f.Name)"; break }
}
```
Or paste each file into the SQL editor, one file per submission, with `set lock_timeout = '5s';` first. Order: 00, 01, 02, 03, 04, 05, 06, 07. Files run through psql leave no row in `supabase_migrations.schema_migrations`; register them with `supabase migration repair --status applied <version>` if you use the CLI later.

### 5.1 Verification after each step

| After | Query | Expect |
|---|---|---|
| 00 | `select count(*) from information_schema.columns where table_name='brokers' and column_name in ('calendar_email','google_calendar_token','whatsapp_number','firm_address','preferred_language')` | 5 |
| 01 | `select has_table_privilege('anon','public.leads','SELECT'), has_table_privilege('anon','public.lead_orders','SELECT')` | false, false |
| 02 | `select (select count(*) from brands), pg_get_constraintdef(oid) like '%Prospect%' from pg_constraint where conname='brokers_status_check'` ; `select count(*) from information_schema.columns where table_name='audit_log' and column_name in ('at','actor_uid','actor_role','source','row_id','diff','reason')` | 1, true ; 7 |
| 03 | `select count(*) from information_schema.columns where table_name='lead_orders' and column_name='brand_id'` ; `select count(*) from lead_order_items` | 1 ; 4200 (unchanged) |
| 04 | `select to_regclass('public.wa_threads') is not null, to_regclass('public.lead_offers') is not null, to_regclass('public.suppression') is not null` | true x3 |
| 05 | `select rolname, rolcanlogin from pg_roles where rolname='n8n_app'` ; `select has_function_privilege('n8n_app','auth.uid()','EXECUTE')` | 1 row, false ; **true** (if false: gate G4, n8n cannot read the CRM tables whose policies call `auth.uid()`) |
| 06 | `select count(*) from storage.buckets where id='broker-media'` ; `select has_function_privilege('service_role','public.smc_vault_ms_refresh(uuid)','EXECUTE')` | 1 ; false |
| 07 | the file succeeds (it fails naming the object otherwise) | NOTICE `smc_07: security self-check passed` |

Onboarding trigger smoke test after 02 and after 07 (it swallows errors, so a broken `brokers_status_check` would be invisible): `begin; select public.submit_broker_onboarding(...); select status from brokers where email = 'smoke@example.test'; rollback;` -> `Prospect`.

### 5.2 After the last file
1. `node supabase/migrations/backup/backup-live.mjs verify <backup dir>` -> `VERIFY OK` (expected additions: none in the 46 tables except the `audit_log.at` backfill, which `verify` ignores as a new column).
2. Advisors again (security + performance), compare with section 2.
3. Spot-check the CRM: admin login, broker login + order pipeline for a Discovery order (unchanged), invite flow, onboarding form (anon), contract signing, document upload/download, an EMMA/Teams message.
4. Create the SortMyCover order for the first broker (CRM order flow), then `update lead_orders set brand_id = (select id from brands where code='SMC') where id = '<order>'` (decision D1) and set the broker's `brand_id`, `status = 'active'`, `routing_on = true`, `fsp_number`, `whatsapp_number` as admin.
5. Leaked-password protection on. Do not add any schema to the API "Exposed schemas".

## 6. Rollback

Run `undo/` files strictly in reverse (07 first, 00 last), one transaction each, only while no SortMyCover data you want to keep exists (undo drops the new tables and columns with their data; undo 03 does not remove `lead_order_items` rows already attached to SortMyCover orders: delete those orders' items first if any exist). Undo 01 re-opens the earlier security exposure. Not reversible by SQL: the `broker-media` bucket (remove it in the dashboard) and `btree_gist` (harmless). If rows are damaged, restore from the section 4 backup.

## 7. Not verified locally

* Ownership/ACL of `storage`, `auth` and `vault` objects on hosted Supabase (the grants in files 05/06 are non-fatal and the 5.1 checks catch a refusal).
* The n8n workflows end to end against the migrated schema (the SQL is schema-checked offline and the W13 claim + routing SQL is proven concurrently on the mirror).
* Performance on a large `leads` table.
