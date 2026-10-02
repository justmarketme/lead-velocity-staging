# BACKUP.md: what is backed up, where, for how long, and how we prove a restore works

**Target (agent true north):** tested restore **monthly**; nightly `pg_dump` **copied off-server** (Section 7, Platform & money); VPS-down → restored **within 2 h** (6B.10 drill).
**Files:** `pg_dump_nightly.sh` (VPS, nightly + monthly consent archive), `restore.sh` (operator laptop: test, real restore, n8n restore), `cron.lv-backup` (→ `/etc/cron.d/lv-backup`). Results land in `ops.backup_runs`. W22 alerts on `backup_stale` (> 26 h) and `restore_test_overdue` (> 35 d).

## 1. What is backed up

| Data | Where it lives | How | Schedule |
|---|---|---|---|
| CRM + SortMyCover tables (`public`, `ops`, `facts`) | Supabase Postgres (NH-09 system of record) | `pg_dump --format=custom -n public -n ops -n facts` as `backup_reader` (read-only) | nightly 02:30 SAST |
| n8n state: workflows, **credentials (still encrypted with `N8N_ENCRYPTION_KEY`)**, users, settings | VPS Postgres container (local Docker before W26) | `pg_dump` inside the `postgres` container | nightly, same run |
| Consent evidence: consent text, timestamp, page URL, source per lead; suppression list | Supabase (`BACKUP_CONSENT_TABLES`) | separate monthly archive | 1st of month 03:30 SAST |
| Workflow JSON | the repo (`automation/W*.json`) | git | every commit |
| `.env` and `N8N_ENCRYPTION_KEY` | laptop + VPS | **not** in any backup file. Kept in the password manager (Jonathan + KG). Without the key, the n8n credential rows can't be decrypted, by design | on change |
| Supabase Auth users (`auth` schema) and Storage objects | Supabase | not in the nightly dump (Supabase-managed schemas). Brokers re-auth with a magic link. Storage files (headshots, intro videos, signed agreements) are mirrored by W23/W20 to the same bucket under `media/` | — *(see needs_human)* |
| Hostinger VPS snapshot | Hostinger | the plan's included weekly backup. It is **not** off-provider, so it doesn't count as the off-server copy | weekly |

## 2. Encryption and the second location
- **Encrypted before it leaves the process:** `pg_dump | age -r $BACKUP_AGE_RECIPIENT`. No plaintext dump ever touches disk or the network. gpg to a public key is the fallback, and with neither available the script refuses (exit 3). `age` is in Ubuntu 24.04 (`apt install age`); `provision.sh` installs it.
- **The private key is never on the VPS.** It lives in the password manager plus an encrypted USB that KG holds. So a stolen VPS or a leaked bucket key exposes nothing readable. The cost is that restores run where the key is (the laptop), which is why the monthly test runs there.
- **Second location:** an S3-compatible bucket in a different provider from Hostinger, written with `curl --aws-sigv4`, so no extra tools are needed. The bucket key is **write-only to one bucket** where the provider supports it, so the VPS cannot delete or read old backups. Restores use a separate read key (`BACKUP_S3_READ_*`) that lives on the laptop only. *Which provider is a needs_human item. Default: a free-tier S3-compatible bucket (R0, 0.1), chosen at W26. Its free-tier terms are a time-sensitive fact, checked once at purchase (4.0a style), not researched here.*
- **Retention (bucket lifecycle rules, set once at W26):**
  - `pg/` → expire after **30 days**.
  - `consent/` → expire after **5 years (1,827 days)**.
  - `media/` → follows the POPIA schedule (W34).
  - Locally on the VPS: 7 days of encrypted files.

## 3. Consent records are legal evidence: the 5-year rule
2.1.2 / 2.1.7: store the exact consent wording shown, the timestamp, page URL and source with each lead; consent records are kept **5 years as legal evidence**. Everything else follows "12 months after last contact, then deletion". Two consequences:
1. The **live** consent rows must outlive lead deletion. W34's nightly purge deletes or anonymises the lead's contact data but keeps the consent record (hashed number, wording version, timestamp, URL, source) for 5 years. That's a schema rule for platform-architect and compliance-qa, flagged in my report.
2. The **monthly consent archive** (`--consent`) is the off-server proof. It sits under its own `consent/` prefix with a 5-year lifecycle, separate from the 30-day rolling backups. A 30-day backup policy alone would lose the evidence.
- **Data-subject erasure vs backups (W34):** an erased lead can survive up to 30 days in `pg/` backups and is never restored back into production. `restore.sh --into` is followed by re-running the W34 erasure log (`dsr_requests` with `status = done` since the dump date) before the restored DB goes live. Compliance-qa states this in the privacy notice ("backups expire within 30 days").

## 4. Restore procedures

| Situation | Command (operator laptop, `AGE_KEY_FILE` from the password manager; delete it afterwards) | Time |
|---|---|---|
| **Monthly test** (first Monday 09:00) | `restore.sh --test --key-path pg/YYYY/MM/DD/crm-<ts>.dump.age`: scratch Postgres container → restore → row counts on `BACKUP_SANITY_TABLES` → `ops.backup_runs(kind='restore_test')` | ~10 min |
| Bad migration / data loss in Supabase | `restore.sh --into "$TARGET_DB_URL" --file …` (asks you to type RESTORE). Prefer restoring into a **new** Supabase branch/project and copying the affected rows back over a full overwrite | 30–60 min |
| **VPS dead** (6B.10 drill: ≤ 2 h) | Buy/reinstall the VPS → `automation/vps/provision.sh --apply` (the same script as W26) → `restore.sh --n8n --key-path pg/<latest>/n8n-<ts>.dump.age` with the same `N8N_ENCRYPTION_KEY` in `.env` → re-point DNS if the IP changed | 45–90 min |
| Laptop staging lost (before W26) | Same `--n8n` restore into the local compose | 20 min |

**Drill log:** every restore test and drill gets a line in `ops.backup_runs.note` plus the quarterly drill record (6B.10).

## 5. Roles (Supabase, created by platform-architect's migration; values never in the repo)
```sql
-- backup_reader: dump-only + record its own runs
CREATE ROLE backup_reader LOGIN PASSWORD :'set_in_dashboard' NOINHERIT;
GRANT pg_read_all_data TO backup_reader;          -- if Supabase disallows it: GRANT USAGE + SELECT on public, ops, facts
GRANT USAGE ON SCHEMA ops TO backup_reader;
GRANT INSERT ON ops.backup_runs TO backup_reader;
```

## 5a. Ops feeders (I-22), step 5 of the nightly run
After the dump is recorded, the nightly script fills `ops.infra_day` for yesterday (SAST) from W22's `uptime_down` / `uptime_recovered` rows (`ops_feeders.sql`). It also loads any Lighthouse reports dropped in `OPS_PAGE_REPORT_DIR` into `ops.page_day` (lab LCP only; visits are never invented) and `ops.page_audits` (`ops_feeders.mjs`), then moves them to `fed/`. It connects as **n8n_app** (`OPS_FEEDER_DB_URL`), never as backup_reader, and a feeder failure only logs a WARN. Pre-VPS, run by hand after `landing/lighthouse.sh`: `node automation/backup/ops_feeders.mjs pages landing/reports --dist landing/dist | psql "$OPS_FEEDER_DB_URL"`. Test: `node --test automation/tests/ops-feeders.test.mjs`.

## 5b. DSR export clean-up (W34, I-38b), step 6 of the nightly run
W34's export action writes one JSON per data-subject request into `W34_EXPORT_DIR` (default `/home/node/compliance/dsr-exports`, inside the n8n container). The IO sends it securely; the file itself is personal information with no reason to stay. Every night, after the dump is recorded, the script deletes files in that folder older than 7 days (`find -maxdepth 1 -type f -mmin +10080 -delete`), inside the running n8n container of compose project `LV_COMPOSE_PROJECT` (default `lv`), or in `DSR_EXPORT_HOST_DIR` when the folder is a host bind mount. It logs a count, never file names, and a failure is only a WARN. Run it alone with `pg_dump_nightly.sh --dsr-exports` (`DRY_RUN=1` to see the count first). The folder is not in any backup: exports are never copied off-server. Note: the folder is in the container layer, not a volume, so a container re-create also empties it; that is acceptable (the export can be re-run from the console). Test: `node --test automation/tests/W26.test.mjs`.

## 6. Cron (`cron.lv-backup`)
```
30 0 * * * root /opt/lead-velocity/automation/backup/pg_dump_nightly.sh            # 02:30 SAST nightly
30 1 1 * * root /opt/lead-velocity/automation/backup/pg_dump_nightly.sh --consent  # 03:30 SAST on the 1st
```
Restore test: laptop, first Monday monthly (Windows Task Scheduler entry next to the n8n keeper, or a calendar reminder; W22 nags at 35 days).
Check after install: `pg_dump_nightly.sh --selftest` (offline round trip) and `DRY_RUN=1 pg_dump_nightly.sh`.
