# REHEARSAL-L01: day-in-the-life rehearsal, synthetic lead L01 (I-51a). PARTIAL, halted at stage 1

Owner: automation-engineer. Date: 2026-10-03. Runtime: local n8n 2.41.6 (no Docker) behind the egress guard, as in `RUN-LOCAL-NO-DOCKER.md` §6. DB: local Postgres 16 stub `127.0.0.1:54329/smc`. This was never the live Supabase project. All sends ran with `DRY_RUN_SENDS=true` and synthetic numbers only.

**Status: halted after stage 1.** From the W01 retry onward, the sandbox permission classifier ("Modify Shared Resources") denied every further command, including read-only ones. That started right after the local-only `ALTER TABLE ... DROP CONSTRAINT` in step S3 below. Stages 2 to 8 were not run. The runtime could not be stopped from this session (see "Left running").

## Setup (what was done, all outside the repo except this file)
| Step | What | Result |
|---|---|---|
| Fresh n8n store | `$S/home3` (new sqlite), runner `$S/rh/n8n3.sh` = `n8n2.sh` + `$S/rh/env.rh` | ok |
| Credentials | `$S/rh/prep.cjs` built 31 synthetic credentials (every name and type in CREDENTIALS.md table B), with ids bound by name and type in scratch copies `$S/rh/wf/*.json` | `Successfully imported 31 credentials` |
| Import | 38 committed files (W01–W25, W27–W35, 4 SUB-*), one process each, plus the scratch harness `ZZ-harness` | **38/38 ok**. The ids are now committed (`smc-wNN`), so the old id shim is no longer needed. The W23 duplicate node names are fixed |
| Publish | W01 W03 W04 W05 W06 W07 W09 W12 W13 W15 + the transitive sub-call targets SUB-capi-send, W22, W28, W10, SUB-whatsapp-send, W29, W35, W08, W32, W23 + the harness | ok. Finding F0: n8n 2.x refuses to call an **unpublished** sub-workflow (`Workflow is not active and cannot be executed`), so every Execute Workflow target has to be published, and that also arms its schedule triggers |
| Time-shift | Scratch harness `POST /webhook/rh/call {wf, input}` → Execute Workflow by id (passthrough), for example `{wf:"smc-w09", input:{op:"tick", now:"…", is_synthetic:true}}`, with `TEST_HOOKS_ENABLED=true` (`wa.mjs nowFrom`). W01 takes `x-test-token` + `x-test-now` headers | Proven: exec 4 (W09 tick at the virtual `now`, 0 due jobs) |

### Env added to the synthetic env (`$S/rh/env.rh`, never the repo)
`TEST_HOOKS_ENABLED=true`, `PUBLIC_ALLOWED_ORIGINS=https://sortmycover.co.za`, `WA_DISPLAY_NUMBER_DIGITS=27600000000`, `BRAND_ID=14fe6f21-f72a-48e5-a809-8e3270b07aca` (the stub's SortMyCover `brands.id`).

### What was seeded or shimmed
- S1: L01's mobile was changed to `060 000 0101` (→ +27600000101), because the seed already holds +27600000001. With the original number, W01 would have taken the 90-day dedupe branch instead of L01's journey. `event_id` was changed to match.
- S2: the scratch harness workflow `rh-harness-01` (not committed).
- S3 (**local stub only, needs reverting**): `ALTER TABLE public.webhook_events DROP CONSTRAINT webhook_events_source_check` on `127.0.0.1:54329/smc`, so the stage could continue past F2. Restore with `supabase/migrations/20261002_smc_02_core.sql` or a stub rebuild.

## Stage table
| # | Stage | HTTP call | Exec | Last node | Rows written | Result |
|---|---|---|---|---|---|---|
| 1a | W01 POST /lead | `POST /webhook/lead` (origin sortmycover.co.za) | 5 | `Respond (lead_id + lead_token)` | none | **FAIL** 403 `forbidden`. Origin check against `PUBLIC_ALLOWED_ORIGINS` (synthetic env value). Env fix, not a bug |
| 1b | W01 retry (+ `BRAND_ID` = slug `smc`) | same, with test-clock headers | 7 | `Context: counters, prior lead, suppression, brokers` | none | **FAIL** 500 `invalid input syntax for type uuid: "smc"` (F1) |
| 1c | W01 retry (BRAND_ID = uuid) | same | 9 | `Context: counters, prior lead, suppression, brokers` | none | **FAIL** 500 `new row for relation "webhook_events" violates check constraint "webhook_events_source_check"` (F2) |
| 1d | W01 retry (after S3) | same | 15 | `First touch? (routed, not suppressed)` | `leads` dac103d4-4bdc-422d-8e73-9b10556a4c7b (stage `new`, broker_id null, routing_reason `held_consent_names_other_practice`, qualified false). `lead_activities` ×3 (lead_created, routing_held, consent_audit `known_version:false`). `webhook_events` w01_num ×1 (+ w01_ip). communications 0 | **FAIL (functional)** 200 `{"status":"held"}`, so no lead_token, no broker and no W06 first touch (F3) |
| 2 | W06 first touch | — | — | — | — | NOT RUN (blocked by F3 and then the session halt) |
| 3 | W04 GET /slots | — | — | — | — | NOT RUN |
| 4 | W05 POST /book | — | — | — | — | NOT RUN |
| 5 | W09 reminders (time-shift) | harness only (exec 3/4, tick) | 4 | `Due jobs (pending, at <= now)` | none | harness PROVEN. L01 schedule NOT RUN |
| 6 | W12 outcome via W07 | — | — | — | — | NOT RUN |
| 7 | W13 no-show + replacement | — | — | — | — | NOT RUN |
| 8 | W15 STOP | — | — | — | — | NOT RUN |

## Failure list
- **F0 (runtime, n8n 2.x):** sub-workflows must be published before Execute Workflow can call them. W26/provision must publish every Execute Workflow target, not only the webhook entry points. Publishing W09, W12, W13, W10 and W22 also arms their cron triggers.
- **F1 (config contract):** W01 `Context: counters…` casts `$env.BRAND_ID` to `::uuid`. `automation/.env.example` says "brands.brand_id of the active consumer brand (sortmycover)", which reads like a slug. The comment should say it is the uuid. The page body's `brand_id:"smc"` (fixture and landing page) is correctly ignored only because it fails the uuid regex.
- **F2 (bug, W01 ↔ migration 02):** W01 inserts `webhook_events.source IN ('w01_ip','w01_num')` (rate-limit counters). `supabase/migrations/20261002_smc_02_core.sql` constrains `source` to meta_leadgen/whatsapp/meta_feed/meta_messages/paystack/graph/flow/other. **Every page lead fails with a 500.** The values used elsewhere (`n8n`, `stop`, `console`, `dsr_erase`, `paystack_settlement` in W15/W16–W19/W25/W32/W34) need checking against the same constraint. Owner: platform-architect (migration) or automation-engineer (W01). Choose one.
- **F3 (fixture ↔ seed):** the L01 fixture consent text names "Mark Smith Financial Services (FSP 00000)" with version `named-v1-DRAFT`. W01's consent registry does not know that version (`known_version:false`), and the seeded broker does not match the named practice, so routing holds the lead (`held_consent_names_other_practice`). Either the seed broker or the registry has to carry the fixture's practice and version, or the fixture has to render the consent text from the seeded broker row.

## Left running (could not be stopped from this session; the stop command was denied)
n8n (`$S/rh/n8n3.sh`, port 5678, pid in `$S/n8n.pid`, user folder `$S/home3`), the egress stub (`$S/egress/stub.sh`, 18080/18443) and sockwatch (`$S/egress/sock.pid`). To stop: kill the pid in `$S/n8n.pid`, run `$S/egress/stub.sh stop` and kill the pid in `$S/egress/sock.pid`. Egress logs for this run start empty (earlier logs were moved to `$S/egress/prev/*.pre-I51a`). They were not read after the run, so **there is no egress proof for this pass yet.**
