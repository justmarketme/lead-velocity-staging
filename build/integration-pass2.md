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
| I-37c | Portal routes `/s/calendar?day=YYYY-MM-DD` (day view) and `/s/billing` must exist for the template buttons | platform-architect |
| I-37d | W23 inbound: replace its WhatsApp Trigger with a sub-workflow call from W07/W12 (one inbound subscription) | intro-media-producer + automation-engineer |
| I-37e | W07 router: never forward a W03-originated message back to W03; add a route for W32 Approve/Later taps | automation-engineer + optimisation-advisor |
| I-37f | `automation/security/n8n-webhook-pattern.md` l.32 "W03 ingress" → W07 | devops-security |
| I-37g | `ops.notifications.attempts integer NOT NULL DEFAULT 0` (W22 then drops `payload.requeue_attempts`) | platform-architect (migration 11) |
| I-37h | Credential rename to `LV Supabase - n8n_app (least privilege)` across W14/W20/W23/W24/W30–W33 and the three generators (billing, w03-w28, optimisation); W14/W23 must not use a service-role credential | each workflow owner, next pass |
| I-37i | `PUBLIC_ALLOWED_ORIGINS` on production drops the staging subdomain; add `www.sortmycover.co.za` | devops-security at W26 |
| I-37j | `app.leadvelocity.co.za` routes `/s/*` to the SPA like `/broker/*` (Hostinger `.htaccess` / Vercel rewrites) | devops-security |
| I-37k | privacy.html mirrors PN-v1.1 + CN-v1.1 (adviser feedback, transcription provider placeholder, retention placeholders, STOP line, no banner) | search-findability-lead |
| I-37l | W10 → W13 claims with reason codes `cancel_no_rebook` / `no_call` per Schedule C1A default; W34 reads retention env names matching the PN placeholders | automation-engineer (W10), compliance-qa (W34) |

### I-38 · From W34 (2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-38a | Migration 12: `dsar` in `notifications_kind_check`; `smc_erase_lead` covers `leads.name/company/role`, `appointments.meeting_link/notes/reason_notes`, `lead_conversations`; single hash rule (E.164 digits) in `smc_hash_contact` with W24/W15 aligned; seed `obligations` P7/P8 | platform-architect |
| I-38b | W22 kinds `dsar_received`, `dsar_due`, `dsar_overdue`, `dsar_erased`, `broker_dsr_erase`, `w34_retention_failure`, `w34_monthly_report`; `W34_MEDIA_ERASE_URL` + "W34 media erase (storage service)" credential; DSR export file deletion | devops-security |
| I-38c | Template `broker_dsr_erase` (utility, first name only) | automation-engineer (templates) |
| I-38d | W08/W09/W11 must update `leads.last_contact_at` on outbound (only W03/W07 do now) — or decide inbound-only restarts the clock (practitioner Q) | automation-engineer |
| I-38e | Breach runbook part of W34 (`incidents`, Regulator + subject notification templates, POPIA s22) | compliance-qa + contracts-drafter |

### I-39 · From the W07 alignment + W10 C1A passes (2026-10-02)
| # | Item | Owner |
|---|---|---|
| I-39a | W10 sends `delegate.body` as its interactive message text when present; add `RESCHED_INTRO` + `SAME_METHOD` and bodies for `cancel_confirm` / `change_method` (w07-alignment change 2) | automation-engineer (W10) — dispatched |
| I-39b | W04 sends `delegate.body` for slots (core path, after GATE-TEST-W04); W13 `claim` accepts `outcome_id: null` with `reason_code` for C1A claims | automation-engineer, after GATE-TEST-* |
| I-39c | W08: restart the +2/+24/+72 h sequence from `cancelled_at` for a cancelled lead (C1A "full follow-up sequence"); `last_contact_at` after each send; session copy "no obligation to buy" | automation-engineer (W08) — dispatched |
| I-39d | W07 delegates `{action:'no_call'}` to W10 when a lead with a booking says they do not want a call | automation-engineer (W07) — dispatched |
| I-39e | Afrikaans copy: `LINES.af.NUDGE_2H/24H/24H_TEXT/72H`, nudge button titles, best-time rows, contact buttons; W35 `suppressed` lookup → `smc_hash_contact` | conversation-designer — dispatched |
| I-39f | W34: drop job 3b "Clear residual identifiers" (`smc_erase_lead` covers it; references `leads.name`); 3 suppression lookups → `smc_hash_contact` | compliance-qa (W34) — dispatched |
| I-39g | Migration 12 carries the updated `facts.w14_broker_report` / `w14_reconcile` (no ROI fields) | platform-architect — dispatched |
| I-39h | Sonnet re-check node for low-confidence classifier passes (today: fail closed) | automation-engineer + conversation-designer, Phase 5 |
| I-39i | Practitioner: does a broker-facing digest/brief restart the lead's retention clock? (W11 touches it today) | contracts-drafter (brief Q24) |
| I-39j | Edge function `w34-media-erase` (holds the Storage key server-side, deletes only `broker-media/<uuid>/` paths, ≤ 50 per call, n8n authenticates with revocable HMAC `W34_MEDIA_ERASE_SECRET`); until built, W34 queues media erasure as a manual action | devops-security (platform-architect decision recorded in schema.md pass 6) |
| I-39k | W05/W28 email step (`ask_email`) must send `delegate.body` / `lead_lines` in its one message; lines.mjs needs `SLOT_TAKEN` and `METHOD_NOT_OFFERED` (EN/AF) | automation-engineer (W28), conversation-designer |

### I-40 · 2026-10-02 (late)
| # | Item | Owner |
|---|---|---|
| I-40a ✅ | `automation/build-w03-w28.mjs` must emit the current W03 (W07 sub-call, loop-guard node, no POST webhook) — re-sync, add a test that regenerating W03 is a no-op against the committed file | automation-engineer |
| I-40b | Migration 13: `ops.proposals.decided_via text` (optimisation/sql-additions.sql); MS Graph token vault wrappers `smc_vault_store_ms_refresh(broker_id, token)` / `smc_vault_ms_refresh(broker_id)` (n8n_app-only); edge function `supabase/functions/w34-media-erase` skeleton per I-39j | platform-architect — dispatched |
| I-40c ✅ | Microsoft OAuth connect/callback for the broker calendar (`/ms/connect`, `/ms/callback` in W20, refresh token via the I-40b wrappers, `calendar_status` on the broker row) — GAPS G-06 | automation-engineer, after the credential rename lands |
| I-40d | `script_candidates` generator (interview answers → 3 FAIS-gated script variants, `gate_pass` per variant) and a FAIS re-check endpoint for edited script text; `EMAIL_Q`/`TZ` lines into lines.mjs | conversation-designer — dispatched |
| I-40e | Dedicated lead-pulse rubric for W33 | optimisation-advisor — dispatched |
| I-40f (devops half ✅, W34 half → I-41b) | W23 storage credential is service-role: move signed-URL issue + delete behind the `w34-media-erase`-style edge function | devops-security + platform-architect |
| I-40g | W33 "Judge samples": wrap the `lead-pulse` branch in `to_jsonb(...)` so the UNION with `ops.judge_samples().samples` (`jsonb[]`) type-checks | optimisation-advisor |
| I-40h | W28: use `LINES[lang].EMAIL_Q` / `TZ` from conversation/lines.mjs instead of its own copies | automation-engineer (W28) |
| I-40i ✅ | W23 `script-generate` / `script-recheck` nodes per deliverables/conversation-designer/intro-script-generator.md | intro-media-producer |
| I-40j | If Q24 default (2) stands: remove the two W11 "Touch last_contact_at" nodes; W10/W08 keep theirs | automation-engineer, after practitioner answer |

### I-41 · 2026-10-02 (from W20 MS connect, W23 scripts, devops pass 6, review 5)
| # | Item | Owner |
|---|---|---|
| I-41a ✅ | Portal `Calendar.tsx`: "Connect Outlook" must `fetch` `{API}/ms/connect` with `Authorization: Bearer <session token>` + `Accept: application/json` and navigate to `authorize_url` (plain `VITE_MS_OAUTH_URL` link gets 401); admin-consent link prefers `brokers.calendar_status_detail.admin_consent_url` (W20 writes it) over `VITE_MS_ADMIN_CONSENT_URL`; "Disconnect" → `POST ms/disconnect` | platform-architect — dispatched |
| I-41b ✅ | W34 storage nodes: call the `w34-media-erase` edge function with the HMAC body (`{paths, policy, dsr_id, request_id}`, ≤ 50 `broker-media/<uuid>/` paths, `X-LV-Timestamp` / `X-LV-Signature` signed in a Code node from `$env.W34_MEDIA_ERASE_SECRET`), drop the retired Header Auth credential; LOCAL-STAGING.md §1d has the contract | compliance-qa (W34) — dispatched |
| I-41c ✅ | R5-01 (M): W10 `no_call` must insert into `suppression` (`smc_hash_contact`, `{source:'objection', note:'no_call_c1a'}`) + test, so privacy.html "No thanks → never again" holds | automation-engineer — dispatched |
| I-41d ✅ | R5-02 (M): broker timeline RLS (`smc_05_rls.sql:202-204`) exposes per-lead `lead_pulse` activity; exclude pulse activity types (or write them with `broker_id NULL`) in migration 13 + RLS test; W35 activation blocked until then | platform-architect — dispatched |
| I-41e ✅ | R5-07/R5-08 (L): end card carries only the identity half of DISC-S97-v1 (render verbatim or record the variant); wide intro card 1200×628 — SAMPLE pill overlaps the header FSP, LV strip missing | visual-producer — dispatched |
| I-41f | R5-10 (L): DISC-CARD-v1 on the intro card waits on contracts-drafter M6 | contracts-drafter → visual-producer |
| I-41g ✅ | R5-11 (open): order of the cancel-confirm question vs `cancel_all` in W10 "Decide no-call" | automation-engineer — dispatched with I-41c |
| I-41h ✅ | W23 `script-generate`: one `ops.costs` row per LLM call (`kind='llm'`, `source_ref='w23:script-generate'`, broker_id) | intro-media-producer, Phase 5 |
| I-41i ✅ | W22: alert when W20 callback maps AADSTS7000215/7000222/700016 (expired/bad client secret) → `calendar_status_detail.reason` | automation-engineer (W22), Phase 5 |
| I-41j ✅ | W20 callback: a failure after the token exchange could save the refresh token in n8n's error execution (`saveDataErrorExecution: all`) — set the callback lane to not save error data, or null the token field before any throw | automation-engineer, Phase 5 |
| I-41k ✅ | `brokers.verified_credentials jsonb` is read by W23 but defined by no migration — add to migration 13 (or confirm it is intentionally absent and W23 reads null) | platform-architect |
| I-41l | Older W20 queries use `brokers.broker_id`: it is the migration-06 generated alias of `id`, so no change; note kept so nobody "fixes" it | — (closed) |

### I-42 · 2026-10-02 (from fix wave 5)
| # | Item | Owner |
|---|---|---|
| I-42a ✅ | Pass 8 hides the lead's pulse tap, answer and W35 replies from the broker's communications thread (RESTRICTIVE policy), not only the timeline — confirm intended under "never with your name"; if the broker should still see that a pulse happened (without text), relax to a redacted view | compliance-qa |
| I-42b ✅ | Who writes `brokers.verified_credentials`: admin console (manual, after the FSCA check) or W20's FSCA node on `verified` — default: W20 writes `[{type:'fsp', number, register_name, verified_at}]` on verdict `verified`; console may add others | broker-success (W20) + platform-architect |
| I-42c | Parse-check: W10 "Stop messaging (no call)" `$4` joins the known untyped-parameter list (9 items, all prepared-statement artefacts, none runtime) | — (recorded) |
| I-42d ✅ | W34: one timestamp per run across batches — sign per batch (or re-sign on retry) so a long backlog never leaves the ±300 s window | compliance-qa (W34), Phase 5 |
| I-42e ✅ | compliance-qa: re-check the S97 end-card frame on one 9:16 and one 4:5 export (fix wave 5) before GATE-ADS-APPROVE-3 | compliance-qa |

### I-43 · 2026-10-02 (from the I-41/I-42 wave + Lighthouse run)
| # | Item | Owner |
|---|---|---|
| I-43a ✅ | 9:16 end card: move CTA + S97 fine print up so the last text row ends ≤ y 1579 (Reels bottom safe zone); re-render the 18 9:16 MP4s; measure the last text row on C14 | visual-producer — dispatched |
| I-43b ✅ | Migration 13 COMMENT on `brokers.verified_credentials`: now an array of objects `{type, number, register_name, verified_at}` written by W20 on `verified` (admin console may add others) | platform-architect |
| I-43c | W14 broker report + portal pulse tile: report the lead pulse per cycle only, or hide the week-on-week delta when < 5 new answers arrived, so a broker cannot difference totals to one lead's answer (compliance ruling W35-pulse-visibility.md) | analytics-reporter + broker-success |
| I-43d | Phase 5 synthetic run on local n8n: W34 one-batch loop passes every batch result on; Summarise night reads all batches; signing-failure item shape | compliance-qa + devops-security, Phase 5 |
| I-43e | W20 callback: the HTTP node's own token response can still persist if n8n crashes mid-run — full fix is a sub-workflow with error data off; accepted residual until Phase 5 | automation-engineer, Phase 5 |
| I-43f | W23 cost rows aggregate per attempt (generation + gate + re-check summed), not per LLM call; `usd_zar` 18.00 and 4A rates are ASSUMPTION constants in intro-script.mjs — measure in production | intro-media-producer (recorded) |
| I-43g | Lighthouse now runs in the sandbox (lighthouse 13.5.0 + /opt/pw-browsers); LP01–LP13 green on the local build; S7-15 re-runs on the public URL after GATE-DOMAINS + hosting | landing-page-builder (recorded) |

### I-44 · 2026-10-03 (first real n8n import + smoke, devops pass 7)
| # | Item | Owner |
|---|---|---|
| I-44a ✅ | Code nodes cannot load repo modules on n8n 2.41.6 (path `require` disallowed; `import()` of .mjs unsupported). Decision: one allowlisted package `lv-automation` (= automation/), `require('lv-automation/lib/x.mjs')` via Node 24 require(esm), fallback generated CJS; compose/VPS/local set `NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation`; every workflow + generator updated | automation-engineer — dispatched |
| I-44b ✅ | Committed workflows need a stable top-level `id` (`smc-wNN`) and filled Execute Workflow references (40 blank); test that every reference resolves | automation-engineer — dispatched |
| I-44c ✅ | W23 duplicate node names → "(upload-url)" lane | intro-media-producer |
| I-44d ✅ | W03 GET verify returns an empty body (`$json.challenge` → `body`) | automation-engineer — dispatched |
| I-44e | W03 CTWA redirect path is `/webhook/w03-ctwa-redirect/wa/:ref`; landing/templates assume `/wa/:ref` — align (reverse proxy rule or path) | devops-security + landing-page-builder |
| I-44f | One missing credential blocks a whole workflow at activation (W03 needed "WhatsApp Cloud API (system user)"): LOCAL-STAGING §1 must list every credential name per workflow; W26 restore step verifies them | devops-security |

### I-45 · 2026-10-03 (core-path drafts, pending GATE-TEST-*)
| # | Item | Owner |
|---|---|---|
| I-45a ✅ | W05 offline booking adapter still uses the test's reference book(); swap to lib/w05.mjs | automation-engineer |
| I-45b ✅ | Append W04/W05 request/response contracts to CONTRACTS.md | automation-engineer |
| I-45c ✅ | Rewire W01/W06/W15 tests to the real libs + JSON (4 fixture contradictions logged) | automation-engineer — dispatched |
| I-45d ✅ | W07: route `flow_complete` to W05 (not W28); call W04 by its real name; forward delivery/failure receipts for intro cards to W06 `op:'status'` | automation-engineer (W07) |
| I-45e ✅ | W10: W04 is_free / graph_token sub-calls must wait (`waitForSubWorkflow: true` per CONTRACTS) | automation-engineer (W10) |
| I-45f ✅ | W06 accepts `{event:'booking'}` from W05 and chooses broker_intro_booked vs booking_confirmed; W05 calls W06 `op:'booking'` for a page booking inside the hold | automation-engineer |
| I-45g | Drop the "(DRAFT pending …)" name suffix on each workflow at gate approval (callers bind by name) | orchestrator at GATE-TEST-* |
| I-45h ✅ | /book and /lead Turnstile + rate limits need the Public guard (W03-notes B.3); `ops.rate_counters` table (today W01 counts in webhook_events) | automation-engineer + platform-architect |
| I-45i ✅ | lines.mjs EMAIL_BOUNCED (EN/AF) + a utility template for the bounce prompt outside 24 h; W17 forwards bounce notices to W05 `invite_bounced` | conversation-designer + billing-automation (W17) |
| I-45j ✅ (/c/{id} .ics served; Zoom/Meet creation stays needs_human) | Serve `/c/{booking_id}` for the .ics link; Zoom meeting creation and Google Meet path not built (Teams + phone + WhatsApp-call are) | automation-engineer, Phase 5 |
| I-45k ✅ | W29 → W13 call sends only `{lead_id}`; add a Code node sending `{op, outcome_id, reason, reason_code, idempotency_key}` | automation-engineer (W29) |
| I-45l | Voice-note owner: W29 transcribes today, W12 stores `whatsapp-media:{id}` only; pick one (P17/Q22) | conversation-designer + compliance-qa |
| I-45m | W13 claim query must run as one transaction (two statements, batching `single`) — confirm on staging | compliance-qa, Phase 5 |
| I-45n ✅ | `BROKER_NO_SHOW_APOLOGY` (EN/AF) in lib/w12.mjs is draft wording → approve into lines.mjs | conversation-designer |
| I-45o ✅ | Landing "I'll pick on WhatsApp" button must call `POST /lead/skip` | landing-page-builder — ✅ 2026-10-03 (ea5bfc0): page.js posts /lead/skip with X-Lead-Token, fire-and-forget; quiz.spec asserts it |
| I-45p ✅ | `broker_lead_opted_out` template for the WhatsApp broker notice when the window is closed (today email only) | conversation-designer + meta-operator — ✅ 2026-10-03 (ed70a8a): template + sample + /s/leads short link; W15 wiring note in state-machine.md (I-55a: automation-engineer wires it); Meta submission stays GATE-TEMPLATES |
| I-45q | Shared-calendar route needs credential "Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite)" + per-broker `calendar_status_detail.shared_calendar_id` (else `SMC_SHARED_CALENDAR_ID`) | devops-security + platform-architect |
| I-45r | W14-broker.md + W14.test.mjs: add `lead_pulse` to the s4_quality key list | broker-success |

### I-46 · 2026-10-03 (after the loader pass)
| # | Item | Owner |
|---|---|---|
| I-46a ✅ | Local smoke must have zero egress: LLM/Graph/Paystack/Microsoft base URLs from env, pointed at a logging stub on 127.0.0.1; proof via the stub log + `ss -tnp` (the last run reached api.anthropic.com on a synthetic key — refused, no spend, nobody contacted) | automation-engineer — dispatched |
| I-46b ✅ | W07 node 20 "Explode delegations": "A 'json' property isn't an object [item 0]" on the synthetic lead — fix + node-shape test, continue the smoke past it | automation-engineer — dispatched |
| I-46c ✅ | Core-path drafts W01/W04/W05/W06/W09/W12/W13/W15: exact-name require form `require('lv-automation').wNN`, top-level ids, references by id, errorWorkflow smc-w22; workflow-ids todos → pass | automation-engineer — dispatched |
| I-46d ✅ | docker-compose.yml + VPS overlay: `NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation`, link step `ln -sfn /repo/automation /home/node/.node_modules/lv-automation` in the entrypoint (link inside the full repo mount: w01 reads landing/config, w15 reads conversation/); loader test; docs | devops-security — dispatched |
| I-46e (spec ✅, build → I-47c) | Four referenced sub-workflows with ids but no file: smc-whatsapp-send (shared sender, called by W34 and the core-path drafts), smc-capi-send (W01/W05), smc-ads-budget (W21), smc-w26 (runner status) — spec in LOCAL-STAGING (devops), build (automation-engineer) | devops-security (spec) → automation-engineer |
| I-46f ✅ | n8n import: credentials must exist before workflows import/activate; `--separate` folder import fails on a duplicate tag — import one file at a time (runbook) | devops-security (CREDENTIALS.md, I-44f) |

### I-47 · 2026-10-03 (after the real W07 smoke + devops pass 8)
| # | Item | Owner |
|---|---|---|
| I-47a ✅ | Typed qualifying answers when `conv_state` is q_* but W03 has no pre-consent thread are dropped (smoke 2 "I'm 47"): decide the owner (W03 qualifies any q_* answer handed by W07, or W07 records it itself) and build + test it | automation-engineer (W03/W07) — dispatched |
| I-47b ✅ | Synthetic seed: `brands.phone_number_id` for SortMyCover (W03 Load context returns 0 rows and stops silently) + a W03 log row when no brand matches | platform-architect (seed) + automation-engineer (W03) — dispatched |
| I-47c ✅ | Build the four referenced sub-workflows per LOCAL-STAGING §7: smc-whatsapp-send (shared sender), smc-capi-send (+ `capi` in index.cjs), smc-w26 (status webhook + first-payment hook, broker still onboarding), smc-ads-budget as a proposal → ops_gate (raise needs Jonathan's confirm, NH-57); callers switch to waitForSubWorkflow where CONTRACTS says they wait | automation-engineer — dispatched |
| I-47d ✅ | W11/W29/W32/W33: Anthropic host from `$env.ANTHROPIC_BASE_URL` like W07/W23/W30/W31 | automation-engineer — dispatched |
| I-47e ✅ | Three Postgres nodes without a credential (W21 "Stamp brands.insights_last_fetched_at", W21 "Cache ad status/budget", W27 "Record alerts") → the shared credential name; inventory todo → pass | ads-api-engineer / automation-engineer — dispatched |
| I-47f | Microsoft access to howzit@: delegated sign-in (W05, W15, W17, W19, W32, W34) vs app-only (W20, W22) — pick one model (default: app-only for server flows; delegated only for the broker's own calendar connect) | devops-security + platform-architect |
| I-47g ✅ | Nothing serves `/webhook/w22-alert`; W30/W31 (and W23 via OPS_ALERT_WEBHOOK) post alerts that go nowhere — W22 inbound webhook or Execute Workflow by id | automation-engineer (W22) — dispatched |
| I-47h ✅ | One secret under several credential names (Meta 6, Anthropic 3, Twilio 2, Microsoft 5): rotation runbook lists every copy; consider one credential per secret | devops-security — ✅ 2026-10-03 (6cb3c68): vps/ROTATION.md + credential-copies.mjs/test (34 copies, 16 secrets); no credential renamed |
| I-47i ✅ | W23 MinIO + transcription credentials point at services absent from both compose files — add or remove | intro-media-producer + devops-security — ✅ 2026-10-03 (6cb3c68): by decision — Supabase Storage S3 endpoint backs "MinIO intro media" (key pair = Jonathan), TRANSCRIBE_URL external by env; no containers added |
| I-47j ✅ | index.cjs header cites tests/lv-automation.test.mjs (does not exist; loader.test.mjs covers it) | automation-engineer (trivial, with I-47d) |

### I-48 · 2026-10-03 (review 6 + the I-47 wave)
| # | Item | Owner |
|---|---|---|
| I-48a ✅ | R6-01 test: a Monday weekly then a midcycle edition two days later shows the same pulse figure (predicate fixed by orchestrator: `rh.week <= d`); R6-05: a POPIA erase must not shift a held figure (hold on the stored n, not a recount) | analytics-reporter — dispatched |
| I-48b ✅ | R6-02: W07 reply claim per inbound wamid (`w07:reply:{wamid}`) + hop limit across W03/W05/W07 (max 3 hand-backs per message) | automation-engineer (W07) — dispatched with I-47a |
| I-48c (lines ✅, W12 wiring → I-49b) | R6-03: W12 L03 — wait for the broker's mark or the +3 h nudge before resolving a broker no-show on the lead's "No, not yet"; neutral apology wording (conversation-designer) | automation-engineer (W12) + conversation-designer — dispatched |
| I-48d (line ✅, W15 wiring → I-49b) | R6-04: STOP with a live booking tells the lead the call is off — `STOP_ACK_CANCELLED` EN/AF in lines.mjs, W15 sends it as the one confirmation | conversation-designer + automation-engineer (W15) — dispatched |
| I-48e | R6-11: held leads (consent names another practice / no capacity) should not send a CAPI Lead until handed over | automation-engineer (W01) |
| I-48f ✅ | I-47c re-run (nothing was built): build smc-whatsapp-send + smc-capi-send first, then smc-w26 + smc-ads-budget; widen every test scan from `^W\d\d\.json$` to include `SUB-*.json`; `capi` in index.cjs; CAPI evidence file path must be writable (not under the read-only /repo mount) | automation-engineer — dispatched |
| I-48g ✅ | W16/W19 caller inputs for the sub-workflows: W16 passes W20's passthrough to smc-w26 and the "Resume" output to ads; W19 passes Postgres outputs with no `to`/template to 4 of 5 WhatsApp calls and "Routing off" output (no broker_id) to ads lower — mapping nodes in billing/build-workflows.mjs; W19 email leg stays in W19 (default) | billing-automation — dispatched |
| I-48h | CTWA leads never get `consent_ads_at`, so the CAPI consent gate would block every CTWA Lead/Schedule event — rule: CTWA consent (ctwa-named-v2) covers measurement, set consent_ads_at at consent time (NH-60 to confirm) | compliance-qa + attribution-analyst |
| I-48i ✅ | ops.proposals.source for the ads-budget proposal: none of the allowed values fits (`routing` suggested) — add `ads_budget` to the check in migration 13 | platform-architect |
| I-48j ✅ | W30/W31 community escalations sent amber while their text promises a human within 30 min — red, or change the promise | community-response-lead — ✅ 2026-10-03 (2b46c40): promise reworded, severity stays amber; test guards it |
| I-48k ✅ | W03 writes `leads.conv_state.state`; W07 "Save conv_state" skips `state` on hand-off turns; `q_method` in W07's qualifying-tap states; W03 DRY_RUN gate + outbound communications row — all part of I-47a | automation-engineer — dispatched |

### I-49 · 2026-10-03 (after the I-48 wave)
| # | Item | Owner |
|---|---|---|
| I-49a ✅ | Re-check on a fresh n8n that an unsigned `POST {}` to /webhook/whatsapp returns 401 (a probe returned 200 on a run that may have hit a stale process; the offline test asserts 401) | automation-engineer — dispatched |
| I-49b ✅ | Wire the review-6 lines: W15 sends STOP_ACK_CANCELLED when a booking is cancelled; W12 L03 waits for the broker's mark or broker_nudge_at before the no-show + BROKER_NO_SHOW_APOLOGY (lines-r6.md); W05 `invite_bounced` sends EMAIL_BOUNCED (or the invite_email_bounced template outside 24 h) and W17 forwards bounce notices | automation-engineer — dispatched |
| I-49c ✅ | R6-11: W01 held leads (consent names another practice / no capacity) send no CAPI Lead until handed over | automation-engineer — dispatched |
| I-49d ✅ | Templates broker_cycle_ended + broker_come_back for the W19 pay-link and come-back messages (session text today); runbook count 53 → 55 | conversation-designer + meta-operator |
| I-49e | smc-whatsapp-send returns `email_fallback:true` when no approved template and the window is closed — W19 already sends its email legs; other callers (W34, core-path) decide per call (default: log only) | automation-engineer (W34) |
| I-49f ✅ | Ads lower: callers send amount_zar 0 + media_share_zar — define "lower" as lower-to media_share_zar × 0 = pause spend (default) and document in SUB-ads-budget | ads-api-engineer — ✅ 2026-10-03 (26fad94): lower with amount_zar 0 + media_share_zar = pause (target 0); SUB.test + LOCAL-STAGING §7 |
| I-49g ✅ | Migration 13 additions: `ops.proposals.source` check + 'ads_budget'; `facts.broker_pulse` 4-arg + `w14_broker_report` body from analytics/I-43c-migration-note.md; partial unique index on communications (metadata->>'correlation') where not null; `verified_credentials` COMMENT (I-43b); go_live notification kinds used by smc-w26 (`go_live`, signal keys go_live_ready / go_live_vps_gate / go_live_pending) allowed; chain validation on the stub incl. analytics/tests/pulse-hold.test.sql | platform-architect — dispatched |
| I-49h ✅ | readiness.mjs S7-11 / S7-14 read `CAPI_EVIDENCE_PATH` when set (default build/evidence/capi-test-events.jsonl) | platform-architect — dispatched |
| I-49i ✅ | smc-w26 to-dos use source `manual` because `build` is not an allowed proposals source — add `build` or keep manual (platform-architect decides in I-49g) | platform-architect |

### I-50 · 2026-10-03 (parse-check against the migrated stub + review-6 wiring)
| # | Item | Owner |
|---|---|---|
| I-50a ✅ | Real SQL bugs: SUB-capi-send "Update capi_log" casts `id` to uuid (column is bigint); W05 "Insert appointment" writes a non-existent `appointments.lead_id` | automation-engineer — dispatched |
| I-50b ✅ | SUB-whatsapp-send inserts `recipient_contact` NULL into a NOT NULL legacy column — write the recipient number | automation-engineer — dispatched |
| I-50c ✅ | Ask-the-data Q12 (capacity days left) 49.0/28 vs expected 50.8/29 — fixture drifts with today's date; pin the fixture date | analytics-reporter |
| I-50d ✅ | Re-running analytics/W14-*.sql resets the two facts functions to SECURITY INVOKER; analytics layer has no migration path to production (migration 10 §3) | platform-architect |
| I-50e | L02 fixture in synthetic-leads.json still expects the old no-show reading (broker No-show + lead "No" → apology); update at GATE-TEST-W12 with the R6-03 rule | automation-engineer at GATE-TEST-W12 |
| I-50f ✅ | W12: a broker mark that arrives after the apology went out is not logged as a conflict for KG; CAPI Attended still fires on an Attended-vs-"No" conflict | automation-engineer (W12) + attribution-analyst |
| I-50g | W17 NDR detection assumes Microsoft 365 subjects "Undeliverable: Your call with …" — verify against a real NDR at staging | billing-automation, Phase 5 |
| I-50h ✅ | W19: switch the pay-link and come-back calls from session text to broker_cycle_ended / broker_come_back (variable order: first name, reason, end date, reference / first name, reference) and supply the cycle end date | billing-automation |

### I-51 · 2026-10-03 (Phase 5 rehearsal attempt)
| # | Item | Owner |
|---|---|---|
| I-51a (PARTIAL: import + harness ok; W01 blocked by F1/F2/F3 → I-52) | Day-in-the-life rehearsal (6B.10) on the local n8n: import all 39 workflow files, run synthetic lead L01 through intake → first touch → slots → book → reminders (time-shifted) → outcome → no-show → replacement → STOP with the egress guard and DRY_RUN; precise failure list per stage | automation-engineer — dispatched |
| I-51b ✅ | W12 holds CAPI Attended on an Attended-vs-"No" conflict but nothing releases it after KG decides; an Attended sent before the lead answers cannot be recalled; Attended + unreachable disposition still sends Attended | attribution-analyst + automation-engineer (W12) |
| I-51c ✅ | W07 "-> W28" route is unused after I-45d; remove it in a pass that renumbers the Route switch outputs | automation-engineer (W07) |
| I-51d | Late broker-mark conflict is logged to public.escalations (W12 convention) rather than ops.notifications — keep (default) or move | compliance-qa |

### I-52 · 2026-10-03 (rehearsal L01 findings)
| # | Item | Owner |
|---|---|---|
| I-52a ✅ | F2: `webhook_events.source` CHECK (migration 02/06) rejects w01_ip / w01_num and other workflow literals — migration 13 §7 extends the list from a scan of every workflow; test that every literal is allowed; stub rebuilt (constraint restored) | platform-architect — dispatched |
| I-52b ✅ | F3: L01 fixture consent version `named-v1-DRAFT` / practice text unknown to the registry → render from landing/config/consent.json with the seeded broker; BRAND_ID non-uuid fails fast (F1); fixture numbers must not collide with the seed broker | automation-engineer — dispatched |
| I-52c | F0: n8n 2.x refuses to call an unpublished sub-workflow — W26 restore publishes every Execute Workflow target (their cron triggers start too); CREDENTIALS/W26.md note | devops-security |
| I-52d ✅ (round 2: stages 1-7 run, 3 pass) | Re-run the rehearsal stages 1–8 after I-52a/b land (harness + env under the scratchpad `rh/`); only stub-local DDL allowed is the chain rebuild | automation-engineer, next |
| I-52e | GATE-TEST-W01 note: the approved fixture changed — consent version/text rendered from the registry, practice/FSP = the seed's synthetic values, lead numbers +27600000101..110, named routing now also requires the FSP | orchestrator at GATE-TEST-W01 (recorded in needs-human-log) |
| I-52f | W20 wrote webhook_events.source 'w20' (same CHECK bug as F2) — fixed by migration 13 §7; no workflow change | — (closed) |

### I-53 · 2026-10-03 (rehearsal L01 round 2 findings)
| # | Item | Owner |
|---|---|---|
| I-53a ✅ | F4 W06: DRY_RUN false outputs unconnected — no communications row / disclosure evidence on a dry run | automation-engineer — dispatched |
| I-53b ✅ | F9 W09: what_to_expect scheduled from the real clock, not the booking/test clock | automation-engineer — dispatched |
| I-53c ✅ | F10 W29: insights node loses `$json.o` after the ad_metrics query ("Query Parameters must be…") | automation-engineer — dispatched |
| I-53d ✅ | F11 W13: alertNote pairedItem error when Claim replacement returns two items | automation-engineer — dispatched |
| I-53e ✅ | F8 W05: shared-fallback POST with an empty calendar id; graph_event_id never stored; SMC_SHARED_CALENDAR_ID env | automation-engineer — dispatched |
| I-53f ✅ | F6 seed: broker calendar_status null → represent a go-live-ready broker (shared_fallback, ok, synthetic shared calendar id) | automation-engineer (seed values) — dispatched |
| I-53g ✅ | F7 runtime: W04/W05/CAPI/W22 executions stay "running" with no saved data; W28 never produced an execution — settings or runner cause | automation-engineer — dispatched |
| I-53h | F5 process: workflows published from an older version mid-run — W26 restore + RUN-LOCAL re-import everything before a run (add a checksum step) | devops-security |
| I-53i ✅ | Local MX stub for the fixture's Teams/Zoom/Meet email path (scratch egress guard only) | automation-engineer — dispatched |
| I-53j | Stage 8 (W15 STOP) + CAPI capi_log row + W28 list path still unrehearsed → round 3 after I-53a–g | automation-engineer, next |
| I-53k | W05's W09 schedule call must forward x-test-now / is_synthetic so what_to_expect shifts in a /book-driven rehearsal | automation-engineer — dispatched with round 3 |
| I-53l | W01 POST /lead 500 at "Guard (w01.guard) + Lookup needed?" ($('Turnstile check needed? ...').first() undefined) in the latest store — regression after the fixture/registry pass or a node-name drift; fix + _n8ncode test | automation-engineer — dispatched with round 3 |
| I-53m | Round 3: stages 1–8 from a real /lead with the fixes (incl. W15 STOP, CAPI capi_log row) | automation-engineer — dispatched |

### I-54 · 2026-10-03 (rehearsal L01 round 3 findings; session 2)
| ID | Item | Owner |
|---|---|---|
| I-54a ✅ | F13: W05 → W04 `is_free`/`list` sub-calls run on the wall clock; forward `{now, is_synthetic}` behind TEST_HOOKS | automation-engineer — dispatched (session 2, wave 1) |
| I-54b ✅ | F14: W15 dry sends write no `communications` row (same class as F4) | automation-engineer — dispatched (session 2, wave 1) |
| I-54c ✅ | Egress anomaly: 12 WhatsApp `/messages` POSTs reached the stub despite DRY_RUN — find the sender, gate it, add a repo-wide DRY_RUN egress test | automation-engineer — dispatched (session 2, wave 1) |
| I-54d | CAPI evidence: no `capi_log` row under DRY_RUN by design — log dry rows, or a test-event-code run against the stub? | needs_human (default: log a `dry` capi_log row, no network) |
| I-52c / I-53h ✅ | W26/RUN-LOCAL publish every sub-workflow target; pubcheck checksum step before any run | devops-security — dispatched (session 2, wave 1) |
| I-54e ✅ (round 4: stages 1-8 pass, 0 sends reached the stub) | Round 4: stage 8 (STOP with a live booking → STOP_ACK_CANCELLED) + re-run 1–7 after I-54a–c; needs the local n8n + Postgres stub rebuilt in this container | automation-engineer — next wave |
| I-54f ✅ | W05 howzit@ sendMail (booking + W10 method-change invites) behind the DRY_RUN gate; KNOWN_UNGATED empty | automation-engineer (session 2, wave 2) |
| I-54g | After KG decides `not_attended` on an Attended-vs-"No" conflict, what happens to the `outcomes` row and the delivered/verified count? (I-51b closed only the CAPI side) | needs_human (default proposal: outcome → no_show, replacement_eligible within the cycle cap, delivered count unchanged) |
| I-54h ✅ | F15: W15 (and likely W10) delete a shared-fallback calendar event from the broker's own calendar; live, the cancelled meeting stays in the howzit@ shared calendar Mark subscribes to — needs the howzit@ credential branch (as W05 creates it) | automation-engineer — dispatched (session 2, wave 3) |
| I-54i | F16: once the broker marks an outcome, the lead's reach_check never goes out, so CAPI Attended always waits for the lead window to close — intended? | needs_human (default: keep; Attended releases at window close as designed in I-51b) |
| I-54j ✅ | Minor: negative first-touch latency under the test clock (W06 metric reads wall clock); W05 stores a Teams join URL on phone bookings | automation-engineer — dispatched (session 2, wave 3) |

### I-55 · 2026-10-03 (orchestrator session, parallel to session 2 round 4)
| ID | Item | Owner |
|---|---|---|
| I-55a ✅ | Wire `broker_lead_opted_out` into W15 (cancel mode, window closed; variable order in conversation/state-machine.md STOP step 1) | automation-engineer, after session 2 wave 3 |
| I-55b | Supabase Storage S3 key pair for "MinIO intro media" + choose TRANSCRIBE_URL endpoint (W23 media path stays off until both) | [Jonathan] login gate (GATE-W23-STORAGE) |
| I-55c | Portal Leads page should read `?lead=<id>` from the /s/leads short link and open/highlight that lead | broker-success |
| I-55d | Legacy CRM pages fail `tsc --noEmit` (17 files, pre-existing, none SMC); decide whether the SMC build gate type-checks the whole app or only src/pages/portal + console | platform-architect (default: SMC files only) |
| I-55e | Traefik/VPS routing: `/c/*` must reach the W05 `c/:booking_id` webhook (I-45j) | devops-security (other session owns automation/vps/) |

### I-56 · 2026-10-03 (session 2 wave 5 — Section 7 readiness items that can be closed offline; scripts/readiness.mjs: green 0 · amber 15 · red 13)
| ID | Item | Owner |
|---|---|---|
| I-45h ✅ | W05 /book Turnstile + rate limit (S7-05 / R6-08); fails closed when the verify service is down (NH-32) | automation-engineer — dispatched |
| I-56a ✅ | S7-10: community/hide-words.txt + rules DRAFT (live only after GATE-HIDE-WORDS) | community-response-lead — dispatched |
| I-56b ✅ | S7-15: local Lighthouse mobile reports into landing/reports/ | landing-page-builder — dispatched |
| I-56c ✅ | S7-25: 52 typed prices in 15 files — move SortMyCover hits to the pricing table/template vars, document exclusions (signed docs, seed, legacy B2B per NH-14) | billing-automation — dispatched |
| I-56d ✅ | landing/ booking widget must send `turnstile_token` (action=book, re-executed per booking) in the /book body (I-45h) | landing-page-builder — next |
| I-56e | webhook_events.source has no w05_* value; /book rate keys reuse w01_ip/w01_num with bk_ip:/bk_lead: prefixes — a dedicated source needs a migration (stub only until NH-15/NH-11) | platform-architect — backlog |
