# Integration pass 2 — cross-agent reconciliation (orchestrator list; owners act in the next wave)

| # | Item | Decision / owner |
|---|---|---|
| I-01 | Disposition code spelling: 4.12a `fit_proceeding/fit_followup/nofit_budget/nofit_covered/nofit_criteria/unreachable` vs crm-gap A1 `good_fit_*/not_fit_*` | **4.12a names win** (templates, tests, portal, contract use them). platform-architect aligns `outcomes` enum in migration pass 2; `facts.disp_class()` keeps accepting both. |
| I-02 | Broker weekly payload field names: `analytics/W14-broker.sql` (`one_liner`, `{value,target,last_week}`) vs `automation/W14-broker.md` (`s1_one_line`, `{v,target,last}`) + policies-tracking formula + `edition` column | **broker-success's spec is the contract** (it owns the words). analytics-reporter adds a renaming view; policies formula = analytics' (close rate × (attended + upcoming booked × show rate)) documented in W14-broker.md; `reports.edition` added by platform-architect. |
| I-03 | Webhook verifier interface: W30/W31 call `verifyMetaSignature({rawBody, signatureHeader, appSecret})`; `automation/security/verify-webhooks.js` exports positional args | devops-security adds an object-arg overload; community workflows unchanged. |
| I-04 | Schema additions requested by agents: ads-api (brands health fields, message_templates status, ops.notifications.body, ad_objects, creative_queue, idx leads.leadgen_id), community (`comments-schema-additions.sql`), intro-media (bookings.intro_*, broker_media.state), broker-success (brokers onboarding columns, lead_activities.lead_id nullable, reports.edition, support_events), W24 (suppression.source deletion, dsr_requests.mobile_hash/lead_id, unique idx, obligations.status/note), analytics (fact_system_day, fact_lead_theme, fact_broker_roi, fact_page_day, fact_cycle.renewed, media cost per cycle) | platform-architect migration `smc_06_pass2.sql` (additive). |
| I-05 | Env names to add to `automation/.env.example`: FSCA_REGISTER_URL, FSCA_LIFE_CATEGORY_PATTERN, SLOTS_API_URL, COMPLIANCE_PREFLIGHT_URL, GO_LIVE_HANDOFF_URL, TRANSCRIBE_URL, WHISPER_MODEL, ANTHROPIC_MODEL_CHECK, INTRO_PUBLIC_BASE, OPS_ALERT_WEBHOOK, PORTAL_URL, WA_PHONE_NUMBER_ID, META_MIN_DAILY_BUDGET_ZAR, META_CONFIRM_SECRET, META_WEBHOOK_VERIFY_TOKEN, CTWA_BASE_URL, NCC_REGISTRY_ENDPOINT, W24_INCLUDE_LEGACY, TURNSTILE_SITE_KEY/SECRET | automation-engineer / devops-security. |
| I-06 | n8n runtime settings every workflow assumes: `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, Execute Command enabled (W23), `/opt/lv/automation` mounted read-only, `../compliance` volume, `EXECUTIONS_DATA_MAX_AGE` short, error-workflow wiring, W15/W22 workflow-id placeholders | devops-security updates docker-compose + LOCAL-STAGING.md. |
| I-07 | 8 proposed portal templates (`portal/spec/proposed-templates.json`) + a no-ask `broker_weekly` variant + `broker_disposition` buttons to the NH-19 label set | automation-engineer, after NH-19. |
| I-08 | W22 alert contract `/webhook/w22-alert {severity, kind, to, text, deep_link, source}` assumed by W20/W24/W30/W31/W23 | devops-security confirms in W22.md. |
| I-09 | CTWA `ref=cmt_{ad_id}` needs a tracked redirect on the consumer domain; W03 parses the ref | landing-page-builder (redirect) + automation-engineer (W03). |
| I-10 | W20 / W24 acceptance tests (`automation/tests/W20.test.mjs`, `W24.test.mjs`) not yet written | automation-engineer / compliance-qa. |
| I-11 | Public `/lead` `/slots` `/book` protection: Turnstile + honeypot + rate limit (no HMAC in browser) | devops-security + automation-engineer in W01/W04/W05 build. |
| I-12 | `brokers.user_id` is NOT NULL → W16 creates the Supabase auth user (magic link) before inserting the `brokers` row | billing-automation + broker-success. |
| I-13 | `ops` schema exposure: add `ops` to the Supabase API exposed schemas for the console (facts stays unexposed) or read via RPC | platform-architect + devops-security. |
| I-14 | optimisation read objects owed: `facts.pulse_daily` (rolling 7-day numerators/denominators), `ops.judge_samples(date)`, `ops.proposal_actuals(date)`, `ops.notifications_due()`, `ops.alert_recipients`, `ops.build_state_latest`; apply `optimisation/sql-additions.sql` | platform-architect pass 2. |
| I-15 | `automation/docker-compose.yml` `env_file: ../.env` hands every secret to the postgres container — scope postgres to `POSTGRES_*` only | laptop (bootstrap) session owns the compose file. |
| I-16 | One Meta callback URL per object type: W03 = WABA ingress (routes broker video to W23), W02 = `page` ingress (routes comments to W30, DMs to W31), W30 = `instagram` ingress; use Webhook nodes, not the WhatsApp Trigger node | automation-engineer + community-response-lead. |
| I-17 | Verifier interface (I-03) is now in `automation/security/verify-webhooks.js` positional; add the object-arg overload W30/W31 call | devops-security (next pass). |
| I-18 | analytics pass 3 (after smc_06 lands): realign the SQL blocks in knowledge/metrics.md to the real column names (fact_ad_day.date/leads_meta, fact_outcome.slot_date, fact_lead booleans; M14/M23/M39 from operational tables); rewrite analytics/tests/scenarios.test.sql against public.outcomes/leads/appointments; realign ask-the-data.md + questions.json (fact_system_day, fact_lead_theme, fact_broker_roi now in smc_06); tile 5 performance on the fixture; finish run-all.sh + watchlist-reconcile check | analytics-reporter. |
| I-19 | facts.v_watchlist targets: tile 1 → R1,300 (stretch R900), tile 4 → 60% (NH-25 defaults); tile 4 denominator excludes `unreachable`; fact_broker_day rewritten as joins (O(days × leads) today) | platform-architect pass 3. |
| I-20 | W14 broker payload: `s2_progress.booked.last` is a count; `s6_roi.basis` carries booked_upcoming + show_rate; `s6_roi = {shown:false}` when no close rate; `reconnect_calendar` and `confirm_holiday_hours` asks skipped until calendar_status/holiday table exist | broker-success confirms. |
| I-21 | Workflow SQL fixes found by the schema parse-check (153 statements): W16 drop the manual audit_log insert (trigger logs it; pass idempotency via `SET LOCAL smc.reason`) + `assigned_by::uuid`; W21 stop inserting generated `cpl`/`cost_per_qualified`, use `ON CONFLICT (date, ad_id, placement)`; W27 write `meta_status`/`meta_category` not `status`/`category`; W31 use `dm_threads` not `conversations`; W30 write `assigned_agent` (text); W23 `approved_by` uuid or null | billing-automation, ads-api-engineer, community-response-lead, intro-media-producer (fix wave 2). |
| I-22 | Unassigned feeders: `ops.infra_day`, `ops.page_day`, `ops.page_audits`, `ops.build_state`; `lead_activities` rows of type `lead_theme`, `flow_opened`, `calendar.refresh_failed`; `pulse_daily` sources for quiz_step_dropoff_max, time_to_brief_min, renewal_risk, branded_search_wow, serp_ownership, waba_quality; `brokers.media_share_pct` | devops-security (infra/page), W32 build-state writer (orchestrator Makefile), W07/W28/W04 (activities), search-findability (branded search). |
| I-23 | Dual naming: read-only generated alias columns (`brokers.broker_id/adviser_name/practice_name/adviser_whatsapp`, `brands.brand_id/status`, `cycles.cycle_id`) — writes must use physical names; `invoices_smc.total_zar` now trigger-enforced (= amount + VAT) instead of generated | documented in schema.md; owners read it. |
| I-24 | W23 approve statement demotes the old current row and promotes the new one in one CTE; `broker_media_one_current` is a non-deferrable unique index, so re-approval may hit a unique violation — make the index DEFERRABLE INITIALLY DEFERRED in pass 3 or split into two sequential nodes | platform-architect pass 3 / intro-media-producer. |
| I-25 | `escalations_kind_check` lacks `sensitive`, `dm_handoff`, `dm_after_link` (W30/W31 map them for now); W02 must forward page `feed` comments to W30 byte-for-byte with the original X-Hub-Signature-256 header (no re-serialising) | platform-architect pass 3; ads-api-engineer (W02 forward). |
| I-26 | W22 has no mapping for signal_key `meta_asset_health` (W27 sends it) — add it to W22 thresholds/policy so it is not an amber `unknown_signal`; also W31 handshake could use `metaVerifyHandshake` from the security module | devops-security (W22), community-response-lead. |
| I-27 | W30/W31 (and W07 when built) must call `classifierInput()` from conversation/guardrail.mjs so the classifier sees the lead question and the public flag (G-1/G-3) | community-response-lead, automation-engineer. |
| I-28 | `n8n_app` role needs `GRANT USAGE ON SCHEMA auth` + EXECUTE on `auth.uid()` (smc_brokers_guard calls it) and either grants on `vault` (`vault.create_secret`, `vault.decrypted_secrets`) or SECURITY DEFINER wrappers for W16/W19 card-token writes — found by billing's scenario run (69/69 once granted); check what Supabase grants custom roles on the live project | platform-architect pass 3 (migration 08). |

### I-29 · `lead_token` contract for `/slots` and `/book` — OPEN (owner: automation-engineer)
The landing page calls `/slots` and `/book` but has no defined way to prove which lead it is acting for. Define: header or body field name, how the token is minted (W01 on lead insert, HMAC over lead id + exp), TTL, and that `/slots` derives the broker from the token server-side — the browser must never send a broker id. Landing wires it as soon as the name is fixed (`landing/template/page.js`, search `lead_token`).

### I-30 · Console/portal → backend contracts (from platform-architect console build, 2026-10-02)
| # | Item | Owner | Note |
|---|---|---|---|
| I-30a | `/slots` needs a broker-authenticated path (portal "next free slot" sends the broker JWT) or W20 keeps `brokers.next_free_slot_at` fresh | automation-engineer | ties to I-29 |
| I-30b | `smc_sign_document` must capture signer IP server-side (`p_signer_ip` from the client is null) | platform-architect (migration 08) | e-signature evidence |
| I-30c | Agreement acceptances (clause 11.2, Annex 1, no-Page) need a column; spec 06 names `admin_documents.metadata` which does not exist | platform-architect + contracts-drafter | currently only in `step.completed(agreement)` timeline payload |
| I-30d | "Policies written" needs an RPC or `smc_portal_event` type; brokers cannot write `cycles` | platform-architect | portal shows read-only |
| I-30e | `billing-autorenew` webhook assumed; `brokers` guard blocks direct `card_autorenew` change | billing-automation | define in W19 |
| I-30f | W14 example `s8_cycle.line` says "No contract." — change to "no lock-in" at source | broker-success / analytics-reporter | portal swaps on display |
| I-30g | Private `broker-media` bucket (env `VITE_SMC_MEDIA_BUCKET`) assumed for headshots | devops-security | storage policy |
| I-30h | Explainer video, step clips, `portal/intro-media/`, `billing/checkout/` need a host (env URLs) | devops-security | NH-29 |
| I-30i | Faculty values/sparklines need an admin RPC over `facts.pulse_daily` like `smc_watchlist_tiles` | platform-architect (migration 08) | |
| I-30j | W32 consumes `ops.notifications` kind `approval` (console never calls a W32 webhook) | automation-engineer / optimisation-advisor | |
| I-30k | `close_rate` stored as fraction (0.30) — confirm | analytics-reporter | |
| I-30l | Magic-link login (spec 6.1) not built; password only today | platform-architect | backlog unless Jonathan wants it for cycle 1 |

### I-31 · W30/W31 follow-ups (from fix wave 2, 2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-31a | n8n Code node must be able to `import()` `conversation/guardrail.mjs` from `$env.REPO_DIR`; if the runtime blocks it, ship a CJS shim or inline `classifierInput` | devops-security (n8n settings) / automation-engineer |
| I-31b | W22 maps `kind_requested` + new kinds `sensitive`, `dm_handoff`, `dm_after_link`; note field format is now `kind_requested=<kind>` (was `esc_kind=`) | devops-security |
| I-31c | `ESC_REAL_KINDS=true` after migration 08 lands; add to `automation/.env.example` (name only) and the W30/W31 sticky notes | automation-engineer |
| I-31d | Confirm Meta accepts 400 on a bad `hub.challenge` (ASSUMPTION; 403 before) | meta-operator |

### I-32 · From devops pass 3 (2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-32a | intro-media: replace same-origin `/intro/*` cookie with Bearer Supabase token to `{API}/intro`, verified in n8n (static hosting cannot proxy) | intro-media-producer + automation-engineer |
| I-32b | `ops.page_day.visits` has no source: first-party visit beacon to n8n (preferred, no provider) or analytics provider — decide; until then quiz drop-off pulse is empty | landing-page-builder + analytics-reporter |
| I-32c | `VITE_GEMINI_API_KEY` in legacy root `.env.example`: if the old CRM calls Gemini from the client, move to an edge function | platform-architect (NH-13/NH-15 follow-up) |
| I-32d | n8n_app media download needs a Storage API token or service-role key kept server-side in n8n credentials | devops-security, when W20 headshots land |

### I-33 · From migration 08 (platform-architect pass 3, 2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-33a | W16 "Card auto-renew token to Vault" / "Card auto-renew on (Plan mode)" and W19 "Cycle end: open invoice + card token" must call `smc_vault_store_paystack_auth` / `smc_vault_store_paystack_sub` / `smc_vault_paystack_auth_code` instead of querying `vault` directly | billing-automation |
| I-33b | `facts.v_params` hard-codes the watchlist targets; read `ops.watchlist_targets` so a target exists in one place | analytics-reporter |
| I-33c | Console/portal switch to the RPCs: Today.tsx (`smc_console_pulses/signals_open/quality_grades/judge_runs/build_state/proposals/decide_proposal/proposal_from_grade`, `smc_faculty_tiles`), Agreement.tsx 6-arg `smc_sign_document` with `p_acceptances`, Reports.tsx `smc_report_policies_written`; retire `opsDb()` | platform-architect (dispatched) |
| I-33d | `smc_brokers_guard`: test `current_user` before `auth.uid()` so `n8n_app` works even if the hosted grant is refused (option b) | platform-architect (dispatched) |
| I-33e | Verify on staging that the first `x-forwarded-for` entry is the client IP (one test signature vs gateway log) | devops-security, after NH-15 |
| I-33f | W03 draft references `ops.ctwa_clicks` and `public.wa_threads`, which do not exist in 01–09: use existing tables (`lead_activities` / `dm_threads`-style) or request migration 10 | automation-engineer (W03) |
| I-33g | `brokers.close_rate` CHECK 0–100 allows a percent where a fraction is expected; tighten to 0–1 in migration 10 or validate in the portal write | platform-architect |
| I-33h | `scripts/build-broker-report-email.mjs` (PDF, initials only) missing; W14 queues an `ops.notifications` email row only | automation-engineer |
| I-33i | `facts.w14_broker_report(uuid)` and `facts.w14_lv_payload()` live in `analytics/W14-broker-payload.sql` / `W14-lv.sql`, not in a migration — fold into migration 10 so the stub chain covers W14 | platform-architect + analytics-reporter |

### I-34 · From contracts + W03/W28 (automation-engineer, 2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-34a | Migration 10: `public.wa_threads(brand_id, mobile_hash, state jsonb, stage, last_inbound_at, stall_due_at, expires_at, updated_at, PK(brand_id,mobile_hash))` + `ops.ctwa_clicks(ref, clicked_at, ua_class)`; drop asks for `leads.lead_token_hash/_expires_at` and `flow_tokens`; also I-33g/I-33i | platform-architect |
| I-34b | `landing/template/page.js`: send `X-Lead-Token` on `/slots` and `/book`, stop sending `broker=`; token arrives in the W01 `/lead` response | landing-page-builder |
| I-34c | CORS on `API_HOST` must allow `X-Lead-Token` | devops-security |
| I-34d | W32: add 1-minute poll of `ops.notifications` kind `approval` source `console`, claim with `FOR UPDATE SKIP LOCKED`, ack/send_failed | optimisation-advisor / automation-engineer |
| I-34e | Canonical band codes (`lt35/35_44/45_50/51plus`, `lt750/750_1250/1250plus` per schema) across quiz, fixture, W01, W03 | landing-page-builder + automation-engineer |
| I-34f | Method code `meet` (schema) vs `google_meet` (Flow docs) — schema wins; W28 maps | automation-engineer |
| I-34g | `flow-crypto.js` bodies → Meta's published `decryptRequest`/`encryptResponse`, then re-run `build-w03-w28.mjs` | automation-engineer, W28 step 2 (4.0a lookup allowed) |
| I-34h | Consent fixture L04–L06 (`ctwa-v1`, `broker_named:false`) vs 0.1 named default — decide at GATE-TEST-W01 | Jonathan |
| I-34i | `BROKER_WA_NUMBERS` added to `.env.example` (name only) | orchestrator (done) |

### I-35 · From W07/W08/W10/W11/W29 drafts (2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-35a | New utility template `broker_booking_changed` (move/cancel notice to broker) — draft JSON + sample in automation/templates before GATE-TEMPLATES | automation-engineer (templates) / meta-operator |
| I-35b | `automation/docker-compose.yml`: mount repo at `REPO_DIR`, set `NODE_FUNCTION_ALLOW_BUILTIN=url,fs,crypto,path` so Code nodes can `import()` `conversation/guardrail.mjs` and `automation/lib/*.mjs` (also I-31a) | devops-security |
| I-35c | Sub-workflow interface contract: W04 `is_free`/`graph_token`/exclude-booking; W09 `pause`/`rebuild`/`cancel_all`; W05 `previous_booking_id`/`update_method`; W12 `auto_attended` + `reach_check` rows; W13 `claim`/`withdraw` — add to CONTRACTS.md and honour in the core-path builds after GATE-TEST-* | automation-engineer |
| I-35d | W07 owns `POST /whatsapp`; W03 receives CTWA leads by sub-workflow call — confirm in CONTRACTS.md | automation-engineer |
| I-35e | reply.md actions send_slots/reschedule/cancel_confirm/change_method are executed by W04/W10 with reply.md fallback wording (one message, never two) | conversation-designer |
| I-35f | Env names `TRANSCRIBE_URL`, howzit@ Graph credential shared with W17 — add to `.env.example` (names only) | orchestrator (done) |
| I-35g | After migration 08 is applied: flip `ESC_DB_KIND.sensitive` in `automation/lib/w07.mjs` and `ESC_REAL_KINDS=true` for W30/W31 | automation-engineer, post NH-15 |
| I-35h | Billing Postgres credential must be (or inherit) `n8n_app` so the `smc_vault_*` wrappers are executable; align the two credential names in LOCAL-STAGING.md | devops-security |
| I-35i | `smc_vault_paystack_sub_token(broker_id)` (n8n_app only) so W19 can disable a Paystack Plan when auto-renew is switched off; until then W22 notice to Jonathan | platform-architect (migration 10/11) |
| I-35j | Draft `broker_autorenew_off` utility template (+ `broker_booking_changed`, I-35a) | automation-engineer (templates) |
| I-35k | Analytics layer deploy: W26 runbook applies `analytics/params.sql, watchlist.sql, kill-scale.sql, W14-broker.sql, W14-lv.sql` after migrations (default) — or migration 11 by analytics-reporter once `params.sql` uses CREATE OR REPLACE | devops-security (W26) + analytics-reporter |
| I-35l | W34 purges `wa_threads` rows past `expires_at` (POPIA ops) | compliance-qa (W34) |

### I-36 · From W32 outbox + email builder (2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-36a | `optimisation/n8n-code/w32-approve-confirm.js` is empty — write the approver confirmation step | optimisation-advisor |
| I-36b | W22: alert on / re-queue `ops.notifications` approval rows in `sending` > 10 min | devops-security |
| I-36c | W14 email send step: run `scripts/build-broker-report-email.mjs --pdf`, attach, send via Graph from howzit@ (same credential as W17) | automation-engineer |
| I-36d | Canonical broker PDF = email builder print view (initials only); portal `/r/<id>/print` stays an on-screen view | analytics-reporter + platform-architect (update W14-broker.md) |
| I-36e | `NODE_FUNCTION_ALLOW_BUILTIN` must include `url` (and `fs`, `path`) for W30/W31/W07 `import()` — see I-35b | devops-security |
| I-32a | **done** (recorder → Bearer to `{API}/intro`, W23 JWT check); follow-ups: I-37a | — |
| I-37a | n8n endpoints for `/intro/status`, `/intro/interview`, `/intro/script-select`, signed-URL `/intro/upload` with the same JWT check; script generation behind conversation-designer's gate; take-ownership check on upload-confirm | automation-engineer + conversation-designer |
| I-37b | W23/W19/W04 webhook CORS allowlist: portal origin + staging subdomain + tunnel origin (env-driven) | devops-security |
