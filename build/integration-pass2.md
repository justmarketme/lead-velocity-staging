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
| I-43b | Migration 13 COMMENT on `brokers.verified_credentials`: now an array of objects `{type, number, register_name, verified_at}` written by W20 on `verified` (admin console may add others) | platform-architect |
| I-43c | W14 broker report + portal pulse tile: report the lead pulse per cycle only, or hide the week-on-week delta when < 5 new answers arrived, so a broker cannot difference totals to one lead's answer (compliance ruling W35-pulse-visibility.md) | analytics-reporter + broker-success |
| I-43d | Phase 5 synthetic run on local n8n: W34 one-batch loop passes every batch result on; Summarise night reads all batches; signing-failure item shape | compliance-qa + devops-security, Phase 5 |
| I-43e | W20 callback: the HTTP node's own token response can still persist if n8n crashes mid-run — full fix is a sub-workflow with error data off; accepted residual until Phase 5 | automation-engineer, Phase 5 |
| I-43f | W23 cost rows aggregate per attempt (generation + gate + re-check summed), not per LLM call; `usd_zar` 18.00 and 4A rates are ASSUMPTION constants in intro-script.mjs — measure in production | intro-media-producer (recorded) |
| I-43g | Lighthouse now runs in the sandbox (lighthouse 13.5.0 + /opt/pw-browsers); LP01–LP13 green on the local build; S7-15 re-runs on the public URL after GATE-DOMAINS + hosting | landing-page-builder (recorded) |

### I-44 · 2026-10-03 (first real n8n import + smoke, devops pass 7)
| # | Item | Owner |
|---|---|---|
| I-44a | Code nodes cannot load repo modules on n8n 2.41.6 (path `require` disallowed; `import()` of .mjs unsupported). Decision: one allowlisted package `lv-automation` (= automation/), `require('lv-automation/lib/x.mjs')` via Node 24 require(esm), fallback generated CJS; compose/VPS/local set `NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation`; every workflow + generator updated | automation-engineer — dispatched |
| I-44b | Committed workflows need a stable top-level `id` (`smc-wNN`) and filled Execute Workflow references (40 blank); test that every reference resolves | automation-engineer — dispatched |
| I-44c ✅ | W23 duplicate node names → "(upload-url)" lane | intro-media-producer |
| I-44d | W03 GET verify returns an empty body (`$json.challenge` → `body`) | automation-engineer — dispatched |
| I-44e | W03 CTWA redirect path is `/webhook/w03-ctwa-redirect/wa/:ref`; landing/templates assume `/wa/:ref` — align (reverse proxy rule or path) | devops-security + landing-page-builder |
| I-44f | One missing credential blocks a whole workflow at activation (W03 needed "WhatsApp Cloud API (system user)"): LOCAL-STAGING §1 must list every credential name per workflow; W26 restore step verifies them | devops-security |

### I-45 · 2026-10-03 (core-path drafts, pending GATE-TEST-*)
| # | Item | Owner |
|---|---|---|
| I-45a | W05 offline booking adapter still uses the test's reference book(); swap to lib/w05.mjs | automation-engineer |
| I-45b | Append W04/W05 request/response contracts to CONTRACTS.md | automation-engineer |
| I-45c | Rewire W01/W06/W15 tests to the real libs + JSON (4 fixture contradictions logged) | automation-engineer — dispatched |
| I-45d | W07: route `flow_complete` to W05 (not W28); call W04 by its real name; forward delivery/failure receipts for intro cards to W06 `op:'status'` | automation-engineer (W07) |
| I-45e | W10: W04 is_free / graph_token sub-calls must wait (`waitForSubWorkflow: true` per CONTRACTS) | automation-engineer (W10) |
| I-45f | W06 accepts `{event:'booking'}` from W05 and chooses broker_intro_booked vs booking_confirmed; W05 calls W06 `op:'booking'` for a page booking inside the hold | automation-engineer |
| I-45g | Drop the "(DRAFT pending …)" name suffix on each workflow at gate approval (callers bind by name) | orchestrator at GATE-TEST-* |
| I-45h | /book and /lead Turnstile + rate limits need the Public guard (W03-notes B.3); `ops.rate_counters` table (today W01 counts in webhook_events) | automation-engineer + platform-architect |
| I-45i | lines.mjs EMAIL_BOUNCED (EN/AF) + a utility template for the bounce prompt outside 24 h; W17 forwards bounce notices to W05 `invite_bounced` | conversation-designer + billing-automation (W17) |
| I-45j | Serve `/c/{booking_id}` for the .ics link; Zoom meeting creation and Google Meet path not built (Teams + phone + WhatsApp-call are) | automation-engineer, Phase 5 |
| I-45k | W29 → W13 call sends only `{lead_id}`; add a Code node sending `{op, outcome_id, reason, reason_code, idempotency_key}` | automation-engineer (W29) |
| I-45l | Voice-note owner: W29 transcribes today, W12 stores `whatsapp-media:{id}` only; pick one (P17/Q22) | conversation-designer + compliance-qa |
| I-45m | W13 claim query must run as one transaction (two statements, batching `single`) — confirm on staging | compliance-qa, Phase 5 |
| I-45n | `BROKER_NO_SHOW_APOLOGY` (EN/AF) in lib/w12.mjs is draft wording → approve into lines.mjs | conversation-designer |
| I-45o | Landing "I'll pick on WhatsApp" button must call `POST /lead/skip` | landing-page-builder |
| I-45p | `broker_lead_opted_out` template for the WhatsApp broker notice when the window is closed (today email only) | conversation-designer + meta-operator |
| I-45q | Shared-calendar route needs credential "Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite)" + per-broker `calendar_status_detail.shared_calendar_id` (else `SMC_SHARED_CALENDAR_ID`) | devops-security + platform-architect |
| I-45r | W14-broker.md + W14.test.mjs: add `lead_pulse` to the s4_quality key list | broker-success |
