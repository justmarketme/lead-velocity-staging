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
