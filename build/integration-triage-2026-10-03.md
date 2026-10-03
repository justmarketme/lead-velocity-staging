# Integration pass 2 triage, 2026-10-03

Scope: rows of `build/integration-pass2.md` whose first cell lacked a tick. Read-only check of repo (code, tests, migrations, docs, git log). DONE rows were ticked in the table; nothing else in the table changed. Row IDs that appear twice in the table (I-32a) were both ticked.

Counts: DONE 112 (ticked 113 rows), OPEN-OFFLINE 18, BLOCKED 21, skipped (already closed / recorded / needs_human / [Jonathan]) 9.

Evidence notes: file:line is the first line proving the item. Migrations are drafted, not applied anywhere (applying is NH-15), so "DONE" for schema rows means the migration file carries it. Tests: `node --test automation/tests/W12.test.mjs` re-run, 30/30 pass.

## 1. DONE (with evidence)

| ID | Evidence |
|---|---|
| I-01 | supabase/migrations/20261002_smc_06_pass2.sql:15 |
| I-02 | analytics/W14-broker-payload.sql:3 |
| I-03 | automation/security/verify-webhooks.js:59 (W30/W31 now call it positionally, automation/W30.json Verify signature; no object-arg caller remains, so no overload needed) |
| I-04 | supabase/migrations/20261002_smc_06_pass2.sql:877 |
| I-05 | automation/.env.example:177 (all 19 names present) |
| I-07 | automation/templates/README.md:78 (8 onboarding templates broker_onb_*, broker_weekly_noask, broker_disposition in automation/templates) |
| I-08 | automation/tests/W22.test.mjs:516 |
| I-09 | automation/build-w03-w28.mjs:245 |
| I-10 | automation/tests/W24.test.mjs:233 |
| I-11 | automation/tests/W01.test.mjs:434 |
| I-12 | automation/W16.json:852 |
| I-13 | src/pages/smc/Today.tsx:4 |
| I-14 | supabase/migrations/20261002_smc_06_pass2.sql:1272 |
| I-15 | automation/docker-compose.yml:12 (commit b609a9d) |
| I-17 | automation/W30.json:125 (same as I-03: callers aligned to positional) |
| I-18 | analytics/tests/scenarios.test.sql:2 |
| I-19 | supabase/migrations/20261002_smc_08_pass3.sql:9 |
| I-20 | automation/tests/W14.test.mjs:76 |
| I-21 | automation/W21.json:116 (+ W16.json SET LOCAL smc.reason; W27.json meta_status; W31.json dm_threads; W30.json assigned_agent; W23.json approved_by guard; commit 5a6ad33) |
| I-23 | knowledge/metrics.md:5 |
| I-24 | supabase/migrations/20261002_smc_08_pass3.sql:127 |
| I-26 | automation/tests/W22.test.mjs:138 |
| I-27 | automation/W30.json:674 |
| I-28 | supabase/migrations/20261002_smc_08_pass3.sql:47 |
| I-30a | automation/CONTRACTS.md:49 |
| I-30b | supabase/migrations/20261002_smc_08_pass3.sql:419 |
| I-30c | supabase/migrations/20261002_smc_08_pass3.sql:414 |
| I-30d | supabase/migrations/20261002_smc_08_pass3.sql:506 |
| I-30e | automation/W19.json:369 |
| I-30f | automation/W14-broker.md:32 |
| I-30g | supabase/migrations/20261002_smc_09_storage.sql:2 |
| I-30i | supabase/migrations/20261002_smc_08_pass3.sql:548 |
| I-30j | automation/CONTRACTS.md:75 |
| I-30k | supabase/migrations/20261002_smc_10_pass4.sql:81 |
| I-31a | automation/local/LOCAL-STAGING.md:19 |
| I-31c | automation/.env.example:258 (name + W30 sticky note; the value flip itself is I-35g, BLOCKED) |
| I-32a | automation/media/patch-w23-auth.mjs (commit c4110db) |
| I-33a | automation/W16.json:734 |
| I-33b | deliverables/analytics-reporter/SUMMARY.md:7 |
| I-33c | src/pages/smc/Today.tsx:4 |
| I-33d | supabase/migrations/20261002_smc_08_pass3.sql:17 |
| I-33f | automation/W03.json:17 |
| I-33g | supabase/migrations/20261002_smc_10_pass4.sql:81 |
| I-33h | scripts/build-broker-report-email.mjs + scripts/build-broker-report-email.test.mjs (commit 50e1a84 area) |
| I-33i | supabase/migrations/20261002_smc_10_pass4.sql:9 |
| I-34a | supabase/migrations/20261002_smc_10_pass4.sql:5 |
| I-34b | landing/template/page.js:202 |
| I-34c | automation/local/LOCAL-STAGING.md:50 |
| I-34d | automation/W32.json:2506 |
| I-34e | landing/RECONCILE.md:68 |
| I-34f | automation/flows/w28-endpoint.js:25 |
| I-34i | automation/.env.example:259 |
| I-35a | automation/templates/broker_booking_changed.json:1 |
| I-35b | automation/docker-compose.yml:45 |
| I-35c | automation/CONTRACTS.md:124 |
| I-35d | automation/CONTRACTS.md:113 |
| I-35e | deliverables/conversation-designer/w07-alignment.md:17 |
| I-35f | automation/.env.example:183 |
| I-35h | automation/local/LOCAL-STAGING.md:36 |
| I-35i | supabase/migrations/20261002_smc_11_pass5.sql:6 |
| I-35j | automation/templates/broker_autorenew_off.json:1 |
| I-35k | automation/vps/apply-analytics.sh:20 |
| I-35l | automation/W34.json:52 |
| I-36a | optimisation/n8n-code/w32-approve-confirm.js:2 |
| I-36b | automation/W22.md:60 |
| I-36d | automation/W14-broker.md:54 |
| I-36e | automation/docker-compose.yml:45 |
| I-37a | automation/W23.json:1709 |
| I-37c | src/App.tsx:121 |
| I-37d | automation/W23.json:31 (executeWorkflowTrigger; no WhatsApp Trigger node) |
| I-37e | automation/lib/w07.mjs:110 |
| I-37f | automation/security/n8n-webhook-pattern.md:32 |
| I-37g | supabase/migrations/20261002_smc_11_pass5.sql:5 |
| I-37h | automation/local/LOCAL-STAGING.md:48 |
| I-37i | deliverables/devops-security/static-hosting.md:47 |
| I-37j | deploy/hostinger-app/.htaccess:1 |
| I-37k | landing/holding/privacy.html:38 |
| I-37l | automation/CONTRACTS.md:177 |
| I-38a | supabase/migrations/20261002_smc_12_pass6.sql:2 |
| I-38b | automation/W22.json:434 |
| I-38c | automation/templates/broker_dsr_erase.json:1 |
| I-38d | automation/CONTRACTS.md:162 |
| I-38e | automation/W34.json:1404 |
| I-39a | conversation/lines.mjs:62 |
| I-39c | automation/lib/w08.mjs:50 |
| I-39d | automation/lib/w07.mjs:128 |
| I-39e | conversation/lines.mjs:163 |
| I-39f | automation/W34.json:511 |
| I-39g | supabase/migrations/20261002_smc_12_pass6.sql:177 |
| I-39j | supabase/functions/w34-media-erase/index.ts (skeleton, commit 3adcc54) |
| I-39k | conversation/lines.mjs:66 |
| I-40b | supabase/migrations/20261002_smc_13_pass7.sql:40 |
| I-40d | conversation/lines.mjs:67 |
| I-40e | optimisation/rubrics/lead-pulse.md:1 |
| I-40g | optimisation/build-workflows.cjs:64 |
| I-40h | automation/flows/w28-endpoint.js:176 |
| I-43c | supabase/migrations/20261002_smc_13_pass7.sql:13 |
| I-44f | automation/local/CREDENTIALS.md:1 |
| I-46e | automation/SUB-whatsapp-send.json, SUB-capi-send.json, SUB-ads-budget.json, SUB-w26-runner.json |
| I-48c | automation/lib/w12.mjs:10 |
| I-48d | automation/lib/w15.mjs:11 |
| I-48e | automation/tests/W01.test.mjs:373 |
| I-49e | automation/lib/sub-whatsapp-send.mjs:135 |
| I-50e | automation/tests/fixtures/synthetic-leads.json:190 |
| I-51a | automation/local/REHEARSAL-L01.md:5 (commit 60b8bc6, round 4 stages 1-8 pass) |
| I-52c | automation/local/pubcheck.mjs:2 |
| I-53h | automation/local/pubcheck.mjs:2 |
| I-53j | automation/local/REHEARSAL-L01.md:40 (commit 60b8bc6) |
| I-53k | automation/local/REHEARSAL-L01.md:44 |
| I-53l | automation/local/REHEARSAL-L01.md:43 |
| I-53m | automation/local/REHEARSAL-L01.md:39 |
| I-55c | src/pages/portal/Leads.tsx:96 (commit c7c55f8) |

## 2. OPEN-OFFLINE (buildable and testable now, no live account/DB/Jonathan decision)

| ID | Task | Owner |
|---|---|---|
| I-06 | Enable Execute Command (NODES_EXCLUDE=[]) for W23 in docker-compose + LOCAL-STAGING and assert in W26.test.mjs; W23 has 2 executeCommand nodes, n8n 2.x disables them by default | devops-security |
| I-16 | Add W02 page-feed forward of raw body + X-Hub-Signature-256 to W30 /webhook/meta-comments (W02 has no forward node; W30.json sticky documents the contract) with test | ads-api-engineer |
| I-22 | Add brokers.media_share_pct and verify pulse_daily sources (quiz_step_dropoff_max, branded_search_wow, serp_ownership) exist; none found in migrations | platform-architect + devops-security |
| I-25 | Same W02 raw-body feed-comment forward as I-16 (schema half done in smc_08_pass3.sql:143) | ads-api-engineer |
| I-31b | Register community_escalation/comment_sentiment/hostile_thread/webhook_signature_invalid (+kind_requested, dm_handoff, dm_after_link) in W22 PRODUCER_SIGNALS; none present, would be amber unknown_signal | devops-security |
| I-32b | Build first-party visit beacon (landing page.js to n8n) feeding ops.page_day.visits; ops_feeders.mjs leaves visits 0 | landing-page-builder + analytics-reporter |
| I-32c | Move VITE_GEMINI_API_KEY use in src/components/voice/EinsteinLiveVoice.tsx:10 behind an edge function; drop from .env.example | platform-architect |
| I-34g | Replace placeholder automation/flows/flow-crypto.js with Meta published decryptRequest/encryptResponse, rerun build-w03-w28.mjs | automation-engineer |
| I-36c | Add W14 consumer step that runs build-broker-report-email.mjs --pdf, attaches, sends via Graph from howzit@ (DRY_RUN); W14 only queues the row today | automation-engineer |
| I-37b | Make W23/W19/W04 webhook CORS allowedOrigins env-driven (PUBLIC_ALLOWED_ORIGINS); W23.json hard-codes app.leadvelocity.co.za | devops-security |
| I-39h | Build Sonnet re-check node for low-confidence classifier passes (stubbed LLM test); today fails closed | automation-engineer + conversation-designer |
| I-43d | Run W34 synthetic one-batch loop night on local n8n/throwaway Postgres; check Summarise reads all batches and signing-failure item shape | compliance-qa + devops-security |
| I-43e | Move W20 callback token handling into a sub-workflow with error data off; add _n8ncode test | automation-engineer |
| I-44e | Align CTWA redirect path: Traefik rule /wa/:ref to /webhook/w03-ctwa-redirect/wa/:ref (traefik overlay only routes /c/ /j/) | devops-security + landing-page-builder |
| I-45m | Test W13 claim SQL as one transaction on throwaway local Postgres (pattern of S7-08-09.local.test.mjs) | compliance-qa |
| I-45r | Add lead_pulse to s4_quality key list in automation/W14-broker.md and W14.test.mjs (no mention today) | broker-success |
| I-55d | Add scoped typecheck script (tsc --noEmit on src/pages/portal + src/pages/smc) to package.json as the SMC gate; none exists | platform-architect |
| I-55e | Fix Traefik link-rewrite so /c/{id} reaches /webhook/w05-ics-get/c/{id} (W05 path has webhookId prefix; current rewrite gives /webhook/c/{id}); same fix class as I-44e | devops-security |

## 3. BLOCKED

| ID | Blocker |
|---|---|
| I-30h | Host for explainer/step clips/portal intro-media/checkout; doc written (static-hosting.md) but hosting choice and env URLs need NH-29 / GATE-DOMAINS + hosting |
| I-30l | Magic-link login: backlog unless Jonathan wants it for cycle 1 (Jonathan decision) |
| I-31d | Meta live behaviour check (400 vs 403 on bad hub.challenge); needs live Meta app (meta-operator) |
| I-32d | Storage API token / service-role key in n8n credentials; live credential, tied to NH-58 |
| I-33e | Verify x-forwarded-for client IP on staging; needs live gateway, after NH-15 |
| I-34h | Consent fixture L04-L06 vs named default: Jonathan decision at GATE-TEST-W01 (NH-40) |
| I-35g | Flip ESC_DB_KIND.sensitive and ESC_REAL_KINDS=true after migration 08 is applied (NH-15 live DB) |
| I-39b | W04 delegate.body for slots: held until GATE-TEST-W04 (W13 null-outcome claim half is done, W13.json:267) |
| I-39i | Practitioner opinion Q24/NH-42: does a broker digest restart the retention clock |
| I-40f | W23 storage credential is service-role; blocked on NH-58 (accept for cycle 1 or move behind edge function); devops half already done |
| I-40j | Remove W11 touch nodes only if practitioner Q24 default stands (NH-42 answer) |
| I-41f | DISC-CARD-v1 on intro card: contracts-drafter M6 sign-off on wording (legal), brand/templates/intro-card.html lacks it |
| I-45g | Drop "(DRAFT pending ...)" suffix at gate approval (GATE-TEST-*); W01.json:3 still carries it |
| I-45l | Voice-note owner (W29 vs W12): P17/Q22 practitioner/compliance decision on transcription provider and retention |
| I-45q | Live Entra credential "Microsoft 365 howzit@" + per-broker shared_calendar_id; live Microsoft tenant (NH-58 area) |
| I-47f | Graph access model (app-only vs delegated): decision plus live Entra app registration |
| I-48h | NH-60: does WhatsApp consent cover Meta measurement (consent_ads_at for CTWA); practitioner item |
| I-50g | Verify W17 NDR subject against a real Microsoft 365 NDR at staging (live tenant) |
| I-51d | Compliance-qa decision keep (default) vs move late broker-mark conflict log; no gate id, no build until decided |
| I-52e | GATE-TEST-W01 note for Jonathan, recorded in needs-human-log; resolves at the gate |
| I-56e | webhook_events.source w05_* value needs a migration; stub only until NH-15/NH-11, platform-architect backlog |

## 4. Skipped (not triaged: already closed, recorded, needs_human or [Jonathan])

| ID | Why |
|---|---|
| I-41l | closed |
| I-42c | recorded |
| I-43f | recorded |
| I-43g | recorded |
| I-52f | closed |
| I-54d | needs_human |
| I-54g | needs_human (NH-62) |
| I-54i | needs_human (NH-63) |
| I-55b | [Jonathan] login gate |
