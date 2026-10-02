# W34 POPIA operations: what runs when, what is never deleted, practitioner questions

**Status:** DRAFT, inactive. It is gated on GATE-TEST-W34 (`automation/tests/W34.test.mjs`) and on the practitioner answers in section 5.
**Files:** `automation/W34.json` (60 nodes) · `automation/tests/W34.test.mjs` (21 tests, all pass) · this file.
**Owner:** compliance-qa (with devops-security for the VPS paths and media). Timezone: Africa/Johannesburg. Credentials are referenced by name only. Nothing has been applied to any live project, and nobody is messaged directly: every alert goes through W22.
**Sources:** privacy notice draft (`deliverables/contracts-drafter/consent-and-privacy.md`, "How long we keep it" and "Your rights"); register P7/P8 (`compliance-register.md`); `smc_erase_lead()` (smc_03); `wa_threads` (smc_10, I-35l); `dsr_requests` / `retention_log` (smc_03/06); BACKUP.md section 2.

## 1. What runs when

| When (SAST) | Part | What it does | Writes |
|---|---|---|---|
| **Nightly 02:30** | A1 `wa_threads` (I-35l) | Deletes WhatsApp quiz threads past `expires_at`. It also deletes any thread whose last inbound message (else `updated_at`) is older than `W34_UNFINISHED_RETENTION_HOURS` (PN-v1.1 `{{retention_unfinished_hours}}`, 72), whichever comes first. | `retention_log` (`delete`, `wa_thread_expired`, row id = brand + 12-character hash prefix only) |
| | A2 Non-fit entries | Leads with `qualified_at` null, `disqualified_reason` set and `broker_id` null are deleted once `created_at` is 24 h old, through `smc_erase_lead(…,'delete','unqualified_24h')` | `retention_log` (written by the function) |
| | A3 12-month rule | When the latest of `last_contact_at`, `opted_out_at` and `created_at` is 12 months old, the lead is pseudonymised (`smc_erase_lead(…,'pseudonymise','12m_after_last_contact')`). Names, numbers, email, IP/UA, message content, transcripts and join links go. **The consent record stays.** | `retention_log`; media URLs are collected first |
| | A4 5-year rule | Rows that are already pseudonymised are deleted when the latest of `consent_at`, `opted_out_at` and `last_contact_at` is 5 years old (`consent_5y`) | `retention_log` |
| | A5 DSR records | For closed requests, `requester` and `requester_contact` are cleared 5 years after closure. Dates, kind and outcome stay. | `retention_log` (`pseudonymise`) |
| | A6 Media | Voice notes and call recordings referenced by erased rows are erased through the signed `w34-media-erase` edge function (policy `retention`, see 1a). Any failure → `w34_retention_failure` (red) | `retention_log` (written by the function) |
| | A7 Evidence | Writes a PII-free `nightly/YYYY-MM-DD.json` and sets register **P8** green, or red if a job failed or a setting was refused. On red it alerts Jonathan through W22. | file, `obligations` |
| **On receipt** | B Intake | The howzit@ mailbox (read-only, same credential as W17) is filtered by keywords. The manual webhook `POST /w34/dsr` covers portal, WhatsApp and post requests. Both create one `dsr_requests` row (`due_at` = received + 30 d) and one **`ops.notifications` row of kind `dsar`** (no name or contact in the payload), then send an IO alert through W22. The flow is idempotent on `dedupe_key`. | `dsr_requests`, `ops.notifications` |
| **Daily 07:00** | C 30-day clock | **Red** when past `due_at`: W22 alerts both phones and email (MASTER-PROMPT W34 row). **Amber** when 7 days or fewer are left, or when identity is still unverified after 5 days. One ticket per request per SAST day. | `ops.notifications` (`dsar`) |
| **IO action** | D Export / erase | `POST /w34/dsr-action {dsr_id, confirm_dsr_id, action}`. Every statement refuses unless `verified_at` is set and the request is open. **Export:** one JSON covering leads, communications, appointments, outcomes, lead_activities and opt-outs; the file goes in `W34_EXPORT_DIR` and the IO sends it securely. **Erase:** (1) suppress the hash Lead Velocity-wide (`dsr_erase`, insert-only), then (2) run `smc_erase_lead` per matched lead with `dsr_id`, then (3) send media for erasure, then (4) mark the request completed and record whether it was in time, then (5) send the IO confirmation through W22, and the broker notice through the shared WhatsApp sender (template `broker_dsr_erase`, broker and lead first names only). Media goes through the signed `w34-media-erase` edge function (policy `dsr`, `dsr_id` set; see 1a); the request is completed only when every batch comes back `ok`. References outside `broker-media/<uuid>/` are reported red, never silently skipped. | `suppression`, `retention_log`, `dsr_requests` |
| **1st of month 07:30** | E Report | Covers the previous SAST month: rows purged per table, action and policy (`retention_log`); nights run, with missing and red nights listed; DSRs received, completed and late, overdue now, and suppressed on erase. It writes `popia-ops-YYYY-MM.md`, links it as evidence on P7/P8 and notifies Jonathan. | file, `obligations` |

**Settings (env, no workflow edit; mapped to the PN-v1.1 placeholders in `.env.example`):** `W34_NONFIT_RETENTION_HOURS` (24, `{{retention_nonfit_hours}}`), `W34_LEAD_RETENTION_MONTHS` (12, `{{retention_lead_months}}`), `W34_CONSENT_RETENTION_YEARS` (5, `{{retention_consent_years}}`), `W34_UNFINISHED_RETENTION_HOURS` (72, `{{retention_unfinished_hours}}`), `W34_DSR_RECORD_YEARS` (5), `W34_WA_THREAD_GRACE_HOURS` (0), `W34_DSR_DUE_DAYS` (30; values above 30 fall back to 30), `W34_DSR_WARN_DAYS` (7), `W34_DSR_VERIFY_DAYS` (5), `W34_DSR_ERASE_ACTION` (`pseudonymise` | `delete`), `W34_BATCH_LIMIT` (500), `W34_IO_RECIPIENT`, `W34_TEST_MODE`, `W34_DRY_RUN`, `W34_EVIDENCE_DIR`, `W34_EXPORT_DIR`, `W34_MEDIA_ERASE_URL`, `CONSOLE_URL`.

**Safety rules for settings:** All date arithmetic happens in one Code node and is tested; the SQL only compares against cutoffs. A period that is not a whole number, or is below its floor, is **refused**: that job is skipped and a red alert goes out. It is never clamped into an early purge. If the consent period would be shorter than the lead period, the consent job is refused. Month-ends and leap days round late, never early (by at most 3 days). Holds: a lead with an open data-subject request or a future booking is never purged. Test mode touches `is_synthetic` rows only. Dry run counts what is due and erases nothing.

### 1a. Media erase: the signed call to `w34-media-erase` (I-41b)
n8n holds no Storage key. Both media paths (nightly **A6**, DSR erase step 3) call the edge function `supabase/functions/w34-media-erase` (contract: `automation/local/LOCAL-STAGING.md` §1d). The function alone holds the server key, can delete only `broker-media/<broker uuid>/…` objects and writes one `retention_log` row per deleted object. The old "W34 media erase (storage service)" Header Auth credential is retired: no W34 node references it, and it should be deleted in n8n if it was created.

| Step | Nightly (A6) | DSR erase (step 3) |
|---|---|---|
| Map | **Collect media to erase**: policy `retention`, `dsr_id: null`, `request_id = run_id` | **Map subject media to paths**: policy `dsr`, `dsr_id`, `request_id = "dsr-" + dsr_id` |
| Sign (Code) | **Sign media erase (nightly)**: on failure, emits an `{error}` item and the night turns red | **Sign subject media erase (DSR)**: on failure, throws and the run stops before completion |
| Send (HTTP, `authentication: none`) | **Erase media files (storage)**: continue-on-error | **Erase subject media (storage)**: a non-2xx stops the run |
| Read the response | **Summarise night**: `media {requested, deleted, not_found, rejected, failed}` | **Check subject media erase**: totals, and throws unless every batch is `ok` |

- **Paths.** Each map node turns a stored URL (`…/storage/v1/object/[sign|public|authenticated/]broker-media/<key>`, `broker-media/<key>` or `<key>`) into `broker-media/<uuid>/<file>`. It applies the function's own `PATH_RE` and unsafe-path rules, so the function never needs to reject a path. Anything else is `unmapped` and reported red for deletion by hand: Meta media ids, other buckets or hosts, non-uuid folders, `..`, `*`, spaces. Paths are de-duplicated and sent in batches of **at most 50**. When a request is split, its `request_id` gets `:1`, `:2` and so on.
- **Signature.** The body `{"paths":[…],"policy":…,"dsr_id":…,"request_id":…}` is serialised once. The headers are `X-LV-Timestamp: <unix s>` and `X-LV-Signature: sha256=<hex HMAC-SHA256(W34_MEDIA_ERASE_SECRET, timestamp + "." + body)>`. The HTTP node sends that exact string as the raw body (`application/json`). This is the string the function verifies (``hmacHex(secret, `${ts}.${raw}`)``, ±300 s) and the same scheme as `/webhook/w26/status`. The signer refuses to send if `W34_MEDIA_ERASE_URL` does not end in `/functions/v1/w34-media-erase`, or if the secret is shorter than 32 characters.
- **Response.** The function returns `{ok, deleted, not_found, rejected:[{path, reason}], request_id}`. A 207 (`deleted_but_not_logged`) and a 2xx with `ok:false` count as failures, as does any non-2xx. `not_found` alone does not, because the object is already gone. Nightly failures raise `w34_retention_failure`. A DSR failure leaves the request open, and W22's errorWorkflow alerts. The IO confirmation (`dsar_erased`) carries `media_deleted` (a count only).
- **Pre-VPS.** `W34_MEDIA_ERASE_URL` stays empty and `W34_DRY_RUN=true`. Dry run sends nothing, and no secret is needed when there is nothing to erase.

## 2. Never deleted by W34
| Kept | Why | How enforced |
|---|---|---|
| `public.suppression` (hash, source, date) | STOP, objections, NCC blocks and erase requests must be honoured forever. Deleting the hash would let us message the person again. | W34 SQL has no DELETE or UPDATE on it. Its insert is `ON CONFLICT DO NOTHING`. `lead_id` is `ON DELETE SET NULL`. Tested. |
| `public.audit_log` | Audit trail of who changed what. Values of PII columns are already excluded by trigger. | n8n_app has no write grant (smc_05). No W34 statement touches it. Tested. |
| `public.retention_log` | Proof of each purge (P8 evidence) | Append-only for n8n_app (smc_05). W34 only inserts. Tested. |
| Consent record on the lead row (wording, version, mode, timestamps, page URL, source, `disclosure_msg_id`, `opted_out_at`) | Evidence for 5 years (2.1.7) | `smc_erase_lead('pseudonymise')` does not touch these columns (tested against the migration body). Deleted only by the 5-year job. |
| `dsr_requests` dates, kind, status | Proof that we answered within 30 days | Only name and contact are cleared after 5 years |

The only physical `DELETE` in W34 is the `wa_threads` expiry. All lead erasure goes through the audited `smc_erase_lead()` (tested).

## 3. Findings and dependencies (not practitioner questions)
*Follow-up 2026-10-02: items 1, 2, 3, 5 and 6 are closed by migration 12 and W22 (6d27996); job 3b is removed; item 4 is closed by the signed `w34-media-erase` call (1a; I-41b, LOCAL-STAGING.md 1d). Still open: 7, 8, 9.*
1. **`ops.notifications` kind check has no `dsar`.** The intake and clock inserts fail until a migration adds it. The test is marked *todo* and turns green automatically once it is added. Owner: platform-architect.
2. **`smc_erase_lead('pseudonymise')` leaves some identifiers in place:** `leads.name/company/role` (patched by W34 step A3b until it is folded into the function), `appointments.meeting_link/notes/reason_notes`, and the legacy `lead_conversations`. Owner: platform-architect.
3. **Two hash rules exist.** W24/W15 hash mobiles as E.164 digits with SHA-256. `smc_hash_contact()` hashes `lower(trim(raw))`, so `+27…` and `0…` give different hashes. W34 matches mobiles with the W24 rule in SQL and uses `smc_hash_contact` only for email. Any new code should pick one rule.
4. **Where media lives is not settled** (Supabase storage, VPS `media/`, or Meta media id). *Closed (I-41b):* media lives in Supabase Storage `broker-media/<broker uuid>/`, erased through the HMAC-signed `w34-media-erase` edge function (1a). The old Header Auth credential is retired.
5. **Rows P7 and P8 must exist in `public.obligations`.** Otherwise the evidence updates change 0 rows.
6. **New W22 kinds are needed:** `dsar_received`, `dsar_due`, `dsar_overdue`, `dsar_erased`, `broker_dsr_erase` (needs a WhatsApp utility template for the broker), `w34_retention_failure`, `w34_monthly_report`.
7. **DSR export files contain PII and have no deletion job yet.** Proposed default: delete 30 days after the request is completed (backlog).
8. **The breach runbook part of W34** (`incidents`, Regulator and subject notification templates, POPIA s22) is **not in this draft**. It stays open for `/legal/runbooks/` (MASTER-PROMPT 6B item 7).
9. **`last_contact_at`** is written by W03 and W07 only. If reminders and nurture messages do not update it, the 12-month clock runs from an older date, which means earlier deletion. Practitioner question 5 decides which events count as contact.

## 4. How to test
`node --test automation/tests/W34.test.mjs` runs offline on synthetic data with zero dependencies. It covers:
- SQL column existence (shared `_sqlcheck.mjs`);
- retention arithmetic: defaults, env overrides, refusal, the consent ≥ lead rule, month-end and leap-day cases, and a sweep of more than 1,000 cases checking "never early, at most 3 days late";
- `wa_threads` purge;
- the never-erase list, checked on W34's SQL and on the body of `smc_erase_lead`;
- the holds (open DSR, routed lead, future booking, verification first, suppress before erase);
- DSR intake (webhook and mail, hash parity with W24, idempotency);
- the 30-day clock (red/amber boundaries, SAST day key, Red to both phones);
- the action guard;
- media erase (I-41b): both paths are wired Map → Sign (HMAC-SHA256) → IF → HTTP (no credential) → follow-up. Paths pass the function's `PATH_RE` (read from `index.ts`), batches hold at most 50, and every signature is re-verified with the function's WebCrypto check (stale, tampered and wrong-secret requests are refused). Response handling covers 200/`ok:false`/207/non-2xx;
- the monthly report.

Online staging hooks (`/test/w34/*`) are not built yet.

## 5. Practitioner questions (needs_human, for the external opinion; this agent does not opine)
1. **5-year anchor:** does the 5-year evidence period run from the consent date, or from the latest of consent, opt-out and last contact? The draft uses the latest, which is the longer period.
2. **Opt-out hash beyond 5 years:** the notice says "consent record and opt-out: 5 years", but the suppression hash is kept indefinitely so that STOP is honoured. Is indefinite retention of a one-way hash justified (s14 / s11(3))? If yes, the notice wording needs to change.
3. **Erasure request vs. evidence:** should an erase request remove the consent record too (`W34_DSR_ERASE_ACTION=delete`)? Or may we keep the pseudonymised consent record for 5 years to defend a complaint (s14(1)(a)/(d), s24)? The default is `pseudonymise`.
4. **Non-fit entries:** is it acceptable that deleting within 24 h also deletes the consent record for the one polite closing message? Or should a consent stub be kept?
5. **"Last contact":** does an outbound message we send (a reminder, the renewal-era nurture) restart the 12 months, or only the person's own reply or booking?
6. **30-day clock:** does it start at receipt (the draft does this, conservatively) or once identity is verified? What standard of identity verification is enough for an access request made by email?
7. **Backups:** encrypted `pg/` backups expire after 30 days, so erased data survives in them for up to 30 days. W34 re-applies `retention_log` on any restore. Is this acceptable, and does the notice need a sentence about it?
8. **Broker notice on erase:** is the broker an independent responsible party who must be told (as the notice says), and is the first name the minimum identifier?
9. **DSR record retention:** is 5 years the right period for the requester's name and contact on a closed request?
10. **Notice wording:** the notice should state the `wa_threads` 72 h life for WhatsApp quiz answers from people who never finish, if the practitioner wants it there.
