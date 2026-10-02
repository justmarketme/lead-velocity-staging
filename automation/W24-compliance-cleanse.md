# W24: Compliance cleanse & calendar (spec)

**Owner:** compliance-qa · **Workflow file:** `automation/W24.json` (n8n skeleton, inactive on import) · **Task:** `W24` in `build/tasks.json` (phase 4b)
**Sources:** MASTER-PROMPT 2.3 and 4.6 row W24; `deliverables/contracts-drafter/ncc-direct-marketer-pack.md` Part B; `compliance-register.md` rows C1–C3, P4, P5, P14; `build/crm-gap.md` A1/A4 (table and column names).
This is a QA/automation spec, not legal advice. *DRAFT. The cleanse policy itself is with the practitioner (brief Q5, Q6).*

---

## 1. What W24 must prove every month

A dated file shows that every active lead number was checked against the NCC opt-out registry. Every match is on the one `suppression` list, gets no further messages from us, and its broker was told. STOP and objections reconcile into the same list. The file has an IO sign-off.

Done means: `obligations` rows `C2` and `C3` have `last_done_at` this month, `evidence_url` = `compliance/evidence/YYYY-MM.md`, the invariant `blocked_but_contactable = 0`, and the IO has signed in the console.

## 2. Triggers (all Africa/Johannesburg; set as the workflow timezone)

| Trigger | Cron | Does |
|---|---|---|
| Monthly | `0 6 1 * *` (1st, 06:00) | Full cleanse (steps 1–7) |
| Daily | `0 6 * * *` | (a) Retry if this month's cleanse is missing, from day 2. (b) On day 4+ (3 failed days) also alert Jonathan, per pack B3.7. (c) Dated reminders (section 5) |
| Manual | — | CSV fallback run once Jonathan has dropped the file. Synthetic test runs (`W24_TEST_MODE=true`) |

## 3. Steps

| # | Node(s) | What | Tables / columns |
|---|---|---|---|
| 0 | `Set run context` | `run_id = W24-YYYY-MM`. Mode from `.env` `NCC_REGISTRY_MODE` (`api`/`csv`, default `csv`). If `api` but `NCC_REGISTRY_ENDPOINT` is empty, fall back to `csv` and record a note | — |
| 1 | `Read active leads` | Active = `phone` not null, `opted_out_at` null, inside retention (`retention_delete_after` > now), hash not already in `suppression`. SortMyCover only (`brand_id` not null) unless `W24_INCLUDE_LEGACY=true` (NH-14). `is_synthetic` must equal test mode. **In `csv` mode the number never leaves the database; only `mobile_hash` is read** | `leads.id, broker_id, brand_id, phone, opted_out_at, retention_delete_after, is_synthetic`; `suppression.mobile_hash` |
| 2a | `Batch for registry` → `NCC registry check (HTTP)` → `Normalise registry response` | **API mode.** POST `{reference, numbers[]}` in batches of `NCC_REGISTRY_BATCH_SIZE` (1,000) to `NCC_REGISTRY_ENDPOINT`, using credential **"NCC registry API"** (header auth). 3 tries, 5 s apart. **The request and response shape is a placeholder.** The normaliser accepts `blocked[]` or `results[{number, blocked}]` and **throws on any other shape**, so an unknown answer is a failure, never a silent "0 matches" | — |
| 2b | `Read registry CSV (manual fallback)` → `Parse registry CSV` → `Hash registry numbers` | **CSV mode.** Reads `compliance/inbox/ncc-registry-YYYY-MM.csv`. This is the file the NCC returns, or the registry export, whichever its mechanism gives. Column `number`/`msisdn`/`mobile`/`phone`/`cell` or the first column. Numbers are hashed at once and the raw values dropped. A missing file = failure path | — |
| 3 | `Intersect with active leads` → `Upsert registry blocks into suppression` | Match on hash. Insert `source = 'ncc_registry'`, idempotent on `(mobile_hash, source)` | `suppression(mobile_hash, source, brand_id, lead_id, added_at)` |
| 4 | `Matches to items` → `W15 suppress lead` → `Collapse W15 results` | **Reuse W15** (no second opt-out path, 0.2) with `reason = 'ncc_registry'`, `send_lead_confirmation = false` (never message a registry-blocked number), `notify_broker = true` (agreement 9.5, within 24 h). W15 flags the lead (`opted_out_at`, `stage = opted_out`, `lead_activities` row with `workflow = W24`, `idempotency_key = W24-YYYY-MM-{lead_id}`) and cancels its scheduled messages | `leads`, `lead_activities`, W15's schedule store |
| 5 | `Reconcile STOP + objections` → `Count suppression list` | Close gaps: any `leads.opted_out_at` or `dsr_requests` objection whose hash is not listed gets added. Then count totals, by source, added this month, and the **invariant** `blocked_but_contactable` (a listed hash on a lead with `opted_out_at` null), which must be 0 | `suppression`, `leads`, `dsr_requests` |
| 6 | `Build evidence file` → write `.md` + `.csv` | `compliance/evidence/YYYY-MM.md`: **counts only, no PII** (fields per pack B4). `YYYY-MM-registry-matches.csv`: hashes only. Result is RED if the invariant fails, any W15 call failed, or W15 ok-count < match count | files |
| 7 | `Close C2 in obligations register` → `Ask IO to sign off (W22)` | `C2`, `C3`: `last_done_at = now()`, `evidence_url`, `status = amber` (awaiting IO tap) or `red`, `due_at` = next 1st 06:00. Console sign-off sets green | `obligations(code, last_done_at, evidence_url, status, due_at)` |
| F | `Build failure alert` → `Mark C2 amber/red` → `Alert compliance-qa (W22)` | Registry unavailable, file missing, unknown shape, or evidence write failed. C2 goes amber, then red from day 4. The alert carries no numbers. The daily trigger retries | `obligations` |

**Hash rule (one rule everywhere):** E.164 digits without "+", where `0XXXXXXXXX` becomes `27XXXXXXXXX` and a `00` prefix is dropped, then SHA-256 lower-case hex. This is the same as `automation/capi/capi.js` `norm.phone`. SQL uses `extensions.digest` (pgcrypto). A shared SQL function `public.mobile_hash(text)` would remove the three inline copies; that is platform-architect's call.

## 4. Suppression semantics (from pack B1–B2)
- A registry block overrides prior consent. Default (Q6 pending): booking confirmations and reminders are suppressed too. W24 does **not** cancel the broker's calendar event. It tells the broker, and the broker must stop marketing (agreement 9.5).
- Suppression never expires, unless the person gives fresh specific consent **and** is off the registry (manual, IO-approved).
- Every outbound send checks `suppression` first (W01–W03, W06–W12). That check is not W24's. W24's invariant catches any lead that slipped through.

## 5. Dated reminders (daily branch)
`obligations` codes `C1` (NCC renewal), `P4` (IO registration check), `P5` (PAIA manual review) and `P14` (breach drill). Reminders go at **60, 30, 7, 1 and 0 days** before `due_at` (pack B5 says 60/30/7; 1 and 0 are added). Overdue or undated rows remind every Monday. Delivery is through W22 to Jonathan + compliance-qa, deduped on `code + days_left`. `C1.due_at` = NCC registration date + 12 months, entered by Jonathan when he files (pack A2.5). Until then C1 shows as "undated" weekly.

## 6. Config (.env names only; values never in the repo)
| Name | Purpose | Default |
|---|---|---|
| `NCC_REGISTRY_MODE` | `api` or `csv` | `csv` |
| `NCC_REGISTRY_ENDPOINT` | API URL once the NCC mechanism is known | empty |
| `NCC_REGISTRY_BATCH_SIZE` | Numbers per API call | 1000 |
| `W24_INCLUDE_LEGACY` | Also cleanse legacy B2B leads (`brand_id` null) | `false` (NH-14, see needs_human) |
| `W24_TEST_MODE` | Run on `is_synthetic` leads only | `false` |
| `W24_EVIDENCE_DIR` / `W24_INBOX_DIR` | Container paths | `/home/node/compliance/evidence`, `/home/node/compliance/inbox` |
| n8n: `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (or an allow-list), `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, a volume `../compliance:/home/node/compliance`, `N8N_RESTRICT_FILE_ACCESS_TO=/home/node/compliance` | | devops-security |

**Credentials (by name):** `Supabase CRM (Postgres, W24 role)`, a least-privilege DB role. It may SELECT `leads` (listed columns), `dsr_requests`, `obligations`. It may INSERT `suppression`. It may UPDATE `obligations`. Nothing else. `NCC registry API` (httpHeaderAuth). Sub-workflow IDs for W15/W22 are placeholders (`REPLACE_WITH_…`) set on import.

## 7. Security / POPIA controls (ASVS)
- **Execution data:** `saveDataSuccessExecution = none`, `saveManualExecutions = false`. Error executions are kept so failures can be debugged, so `EXECUTIONS_DATA_MAX_AGE` must be short (≤ 7 days, devops-security). Phone numbers exist in memory only in `api` mode.
- **Evidence:** the `.md` holds counts only. The `.csv` holds hashes only, but unsalted SHA-256 of SA mobile numbers can be brute-forced, so it is personal information. `compliance/` must be git-ignored and private. Back it up with the off-server `pg_dump` set. Keep 5 years (register 1.5). Delete the inbox CSV after each run.
- **Alerts and logs** carry run IDs and counts, never numbers or names.
- **Idempotent:** re-running a month inserts nothing new. The evidence file is overwritten with the latest run, and `lead_activities` is keyed `W24-YYYY-MM-{lead_id}`.

## 8. Acceptance tests (`automation/tests/W24.test.mjs`, to exist before implementation per 4C.2; synthetic data only)
1. 10 synthetic leads, 2 on a synthetic registry CSV → 2 `ncc_registry` rows, W15 called twice with `send_lead_confirmation=false`, evidence shows matches 2, invariant 0, result PASS.
2. Re-run the same month → 0 new rows, same counts.
3. A STOP lead with no suppression row → reconciled as `stop`. An objection with `mobile_hash` → `objection`.
4. API mode against a mock returning an unknown shape → failure path, C2 amber, no evidence file, alert with no number in the payload.
5. Missing CSV → failure path. Daily trigger on day 2 retries. Day 4 alerts Jonathan, and C2 is red.
6. Zero active leads → evidence written with 0 checked, PASS.
7. A W15 failure for one match → result RED.
8. Reminders: C1 `due_at` = today + 30 → one reminder. Undated C1 on a Monday → one reminder, and none on Tuesday.
9. Grep the evidence `.md` and the alert payloads for `\+?27\d{9}` → no hits.
10. Timezone: a trigger at 1 Nov 06:00 SAST (04:00 UTC) → `run_month = 2026-11`.

## 9. needs_human (raised here; `build/tasks.json` not edited)
| Code | Issue | Default in the build |
|---|---|---|
| NH-CQ-W24-1 | **The NCC registry mechanism is unknown offline** (API, bulk file upload/return, or portal lookup; auth; whether numbers or hashes are accepted; rate limits). 2.3 and pack A2.6 say "per its published mechanism" | `csv` mode is the working path. The `api` node is a placeholder that fails closed. Jonathan reads the mechanism at NCC registration and records it. compliance-qa then replaces the HTTP body and normaliser |
| NH-CQ-W24-2 | **Evidence path conflict:** the task says `compliance/evidence/YYYY-MM.md`; pack B4 says `/compliance/ncc/cleanse/YYYY-MM.md` | Uses `compliance/evidence/`. contracts-drafter aligns pack B4, or the orchestrator picks one |
| NH-CQ-W24-3 | **W15 interface:** W24 reuses W15 and needs it to accept `reason`, `send_lead_confirmation=false`, `notify_broker`, `idempotency_key` and to return `{ok, broker_id, broker_notified, schedules_cancelled}`. crm-gap names no table for scheduled messages, so where "cancel schedules" acts is undefined | automation-engineer adds this to W15. Until then, W24's invariant and RED result catch failures |
| NH-CQ-W24-4 | **Schema gaps vs pack B1:** `suppression.source` has no `deletion` value; `dsr_requests` has no `mobile_hash`/`lead_id`, so objections cannot be matched; `suppression` has no `broker_id` ("broker it was passed to", B1); `obligations` has no `note` and an undefined `status` set; a unique `(mobile_hash, source)` is needed for idempotency | platform-architect adds `deletion` to the source check, `dsr_requests.mobile_hash`, the unique index, and `obligations.status in (green, amber, red)`. `broker_id` is derivable via `lead_id` until erasure, so it is low priority |
| NH-CQ-W24-5 | **Legacy B2B leads (NH-14):** the Ayanda cold-call outreach is closer to classic direct marketing than SortMyCover is. crm-gap leaves it to Jonathan | `W24_INCLUDE_LEGACY=false`. **compliance-qa recommends `true`**: cleansing more never harms, and the penalty exposure is R1m / 10% of turnover |
| NH-CQ-W24-6 | **Money:** a delivered, counted lead that is later registry-blocked cannot be contacted by the broker. Schedule C triggers (no-show / uncontactable / disqualified) do not cover this | Not replaced by W24. Jonathan decides whether it counts as "uncontactable" (contracts-drafter Schedule C) |
| NH-CQ-W24-7 | **Infra:** the volume mount, `N8N_BLOCK_ENV_ACCESS_IN_NODE`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, the execution-data max age, `.gitignore` for `compliance/` and the W24 DB role are not in `automation/docker-compose.yml` / `.env.example` | devops-security adds them. W24 stays inactive until then |
| NH-CQ-W24-8 | **Practitioner Q6:** must a same-day booking confirmation be suppressed for a registry-blocked number? | Suppress (pack B2.2) |
