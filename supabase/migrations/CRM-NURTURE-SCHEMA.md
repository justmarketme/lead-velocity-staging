# CRM-NURTURE-SCHEMA: the trimmed SortMyCover chain inside the Lead Velocity CRM

Branch `crm-nurture` (from `migrations-merge`), 2026-10-11. Target: Supabase project `cmsylaupctrbsvzrgzwy` (the Lead Velocity CRM, live: 18 brokers, 4,209 leads, 2 paid `lead_orders` for Discovery with 4,200 `lead_order_items`, 14 onboarding responses). **Nothing here has been applied to it.** Only read-only SELECTs were run against it (fingerprint re-checked 2026-10-11: identical to the 2026-10-10 capture, see `APPLY-RUNBOOK.md` 3.1).

Decisions (Jonathan, 2026-10-11): a lead counts toward the broker's order when it is booked AND its attendance is confirmed (agreement LGSA v0.3 clause 5 / Schedule 2), never on hand-over (section 2); a broker cannot have routing on, and no lead can be routed to him, without his FSP number, practice, adviser name and intro card. The CRM is the ONE system. SortMyCover is a consumer lead source. The WhatsApp nurture flow (click-to-WhatsApp, welcome, qualifying questions, live broker availability, email + contact details + email verification, booking into the broker's Outlook with a Teams link, intro card, reminders with the Teams link, later a broker intro video) runs inside the CRM and is recorded in the CRM. No parallel billing, cycles, invoices or reports: the CRM already has `lead_orders` (+ `lead_order_items`, `admin_mark_order_paid`, contracts, the invoicer). WhatsApp goes through the CRM's Twilio account. Calendar: Microsoft now (`ms-oauth` edge function), Google later. Verification email: hello@sortmycover.co.za via Resend (no schema needed beyond the `leads.email_verify_*` columns).

This chain replaces the 25-file `smc_00..smc_24` chain of `migrations-merge`. Every SAFETY REWRITE of that chain's review (`MIGRATION-SAFETY-REVIEW.md`) that still applies to a kept object is carried over unchanged.

## 1. Files (apply in this order, one transaction each)

| # | File | What it does |
|---|---|---|
| 00 | `20261011000000_smc_00_preflight_drift.sql` | Adds the 5 `brokers` columns the repo says exist but live lacks (drift); stops with a message if a TABLE holds a name this chain creates as a view (`bookings`, `smc_order_capacity`). |
| 01 | `20261011010000_smc_01_security.sql` | Unchanged from the reviewed smc_01: closes pre-existing holes in the CRM (anon grants, open policies, storage "Public Access"). **Changes live CRM behaviour, section 5.** |
| 02 | `20261011020000_smc_02_core.sql` | Helpers, `brands` (+ SMC seed), the SortMyCover columns on `brokers`, `leads`, `lead_activities`, `communications`, `appointments` (+ view `bookings`), `webhook_events`, `audit_log` convergence + `smc_audit`. |
| 03 | `20261011030000_smc_03_orders_outcomes.sql` | **Capacity from the CRM's `lead_orders`** (`lead_orders.brand_id`, routing triggers that attach each delivered lead via `lead_order_items`, view `smc_order_capacity`), `outcomes`, `replacements` (weekly rule), the portal replacement RPC. |
| 04 | `20261011040000_smc_04_engagement.sql` | `wa_threads`, `lead_offers`, `suppression`, `escalations`, `broker_media`, `incidents`, `capi_log`. |
| 05 | `20261011050000_smc_05_access.sql` | Role `n8n_app`, RLS + policies, the merged brokers field guard, the trimmed `smc_portal_event`. |
| 06 | `20261011060000_smc_06_storage_calendar.sql` | Private bucket `broker-media`; Microsoft refresh token in Vault through definer wrappers; Disconnect. |
| 07 | `20261011070000_smc_07_security_sweep.sql` | Strips TRUNCATE/REFERENCES/TRIGGER from chain objects, then asserts the posture (RLS, anon, search_path, definer EXECUTE, Vault read wrapper, no object of the dropped design) or rolls back. |

`undo/` holds one generated undo file per migration (run 07 -> 00, only while no SortMyCover data you want exists). Rehearsal tooling: `supabase/drift/rehearse-chain.mjs` (whole proof in one command) and `supabase/drift/smoke-nurture.sql`.

## 2. Capacity: the CRM's lead orders, enforced in the database

* A SortMyCover order is a normal CRM `lead_orders` row with `brand_id` = the SMC brand (new nullable column; the two Discovery orders keep NULL and are untouched). It is created, contracted and paid through the existing CRM flow (`sign_order_contract*`, `admin_mark_order_paid`, Paystack reference).
* **When a lead counts (decision D2, Jonathan 2026-10-11; agreement LGSA v0.3 clause 5.1(e) / 5.2, Schedule 2 criterion 6 / S2.4):** a lead is Delivered and counts toward the order when it has a booked appointment with the broker, **the broker has marked the meeting attended** (`outcomes.outcome = 'attended'`, `auto_marked = false`, `unconfirmed = false`: portal one-tap, WhatsApp tap via W12 or console; clause 14.3(c)) **and its email is verified** (`leads.email_verified`); whichever comes second counts it (`smc_count_lead`). Not on hand-over and never on the client's Confirm tap (`appointments.confirmed_at` is a reminder signal only, 2026-10-11). Four states on the lead (`leads.order_state`, new nullable columns `lead_order_id`, `order_state`, `order_attached_at`, `order_counted_at`, `order_released_at`, `order_release_reason`):
  * **held** - routed with no room or to a broker that is not ready: `broker_id` cleared, `routing_reason = 'held_no_open_order'` / `'held_broker_not_ready'`, nothing sent.
  * **attached** - routed: one place RESERVED on the broker's oldest open order. No `lead_order_items` row yet, so the CRM pipeline does not show the lead and no contact details unlock (S2.4: the lead data goes to the broker at Delivery).
  * **counted** - booked + attendance confirmed: one `lead_order_items` row (pipeline stage `New`), `leads.delivered = true`, timeline `order_counted`. Exactly once.
  * **released** - an attached lead that will not be delivered: STOP, disqualified, closed unbooked, re-routed, or the meeting's outcome is not attended (no-show, unreachable, rescheduled, broker no-show). The place goes back; a later confirmed booking re-attaches if there is room (else timeline `count_held_no_room`).
* A broker is eligible for a SortMyCover lead only while he has such an order with `status = 'paid'` and room: counted items + reserved places < `lead_count` + approved goodwill replacements. `smc_order_capacity` shows `counted`, `reserved`, `attached` (= in use), `capacity`, `remaining`, `counted_toward_order` (= counted - approved replacements), `open` and the broker's replacement requests this week.
* **A broker must be ready (FAIS disclosure, 2026-10-11):** `brokers_smc_routing_ready` (file 02) refuses `routing_on = true` unless the FSP number, practice name (`firm_name`), adviser name (`contact_person`) and an https intro card (`intro_card_url`, the IMAGE header of `broker_intro_booked`) are present, and `smc_broker_ready()` makes the routing trigger hold any lead routed to a broker without them (also an admin route to a broker whose switch is off). No lead is introduced to a broker without his FSP number.
* **Tier C (budget under R750, Jonathan 2026-10-11):** not disqualified. `brokers.accepts_low_budget` (file 02, admin-only via the file-05 guard) is the broker's standing yes to the agreement 5.7 offer. The routing trigger routes a `budget_band = 'lt750'` lead only to such a broker, or when an admin assigns it (`routing_reason = 'manual_low_budget'`, refused with an error if the broker is not ready / has no room / is not the practice a named consent names); otherwise it HOLDS it open (`routing_reason = 'held_low_budget'`, stage unchanged). The accept is recorded in `lead_offers` (`decided_via` `standing` / `admin`, file 04) and on the timeline (`low_budget_accepted`). Counting is unchanged: booked + attendance confirmed. Contract for the portal: `automation/CONTRACTS.md` "Tier C".
* Routing (W01 web/lead-ad, W01 hand-over for CTWA, capture-v2 tier-B accept, or an admin) only ever writes `leads.broker_id`. Triggers do the rest, so every path behaves the same:
  * `smc_leads_route_check` (BEFORE INSERT / UPDATE OF broker_id, brand_id, budget_band on leads): tags tier C, applies the tier-C rule above, checks `smc_broker_ready`, locks the broker's oldest open order (`FOR UPDATE`, then counts items + reservations), reserves the place, or **holds** the lead. Re-routing an already-routed lead to a broker without room / not ready raises an error. Leaving a broker releases the reservation. A row-level BEFORE trigger sees the rows earlier rows of the same statement wrote, so a multi-row routing statement now holds the surplus instead of erroring.
  * `smc_leads_attach_order` (AFTER on leads): detaches a counted lead from the previous broker's order on a re-route, writes `order_attached` (reserved, `counted: false`) / `routing_held` timeline rows. It never inserts `lead_order_items`.
  * `smc_leads_release_reservation` (BEFORE UPDATE OF opted_out_at, stage on leads), `smc_outcome_release_reservation` (AFTER INSERT on outcomes): release.
  * `smc_count_lead` (definer) via `smc_outcome_count_or_release` (AFTER INSERT OR UPDATE OF outcome, auto_marked, unconfirmed on outcomes; also releases a not-counted reservation on any non-attended outcome) and `smc_count_on_email_verified` (AFTER UPDATE OF email_verified on leads): THE delivery point, both conditions. Works when the confirmation / verification is written by `n8n_app`, which has no write on `lead_order_items`.
* **Verify gate (Jonathan, 2026-10-11):** a booking of a lead whose email is not verified is a HELD slot (`appointments.status = 'pending_verification'`, `verify_by`, file 02): it blocks the time (overlap exclusion + unique index include it) but is not in the broker's calendar. Brokers cannot see an unverified lead, its held booking, timeline, messages or outcomes: RESTRICTIVE policies (file 05) with `smc_lead_email_verified(uuid)`. Portal predicate: `leads.email_verified IS TRUE`. Workflow side: `automation/CONTRACTS.md` "Verify gate".
  * Proven under concurrency on the live-schema mirror: 10 leads routed at once to an order with room for 3 -> exactly 3 reserved, 7 held, none counted; the 3 then confirm at once -> exactly 3 counted (`automation/tests/W13-claim-tx.local.test.mjs`).
* Effect on the CRM: the broker sees a SortMyCover lead in the existing order pipeline (`broker_get_pipeline`, `get_order_leads`, contact details unlocked because the order is paid) from the moment it counts; admins see it in `admin_list_orders_activity`. Before that the broker has the booking in his Outlook with the first name only (W05 `broker_new_booking`). The workflows read capacity from `smc_order_capacity` only to pick the broker (`order_remaining > 0`); the database decides.
* The order's `status` is not changed when it fills (it stays `paid`; "full" is a count). Decision D1.
* Replacements need a counted lead: a lead that never confirmed was never Delivered, so the portal RPC answers `not_on_a_lead_order` and W13 `not_delivered_on_a_lead_order`.

## 3. Replacements (agreed rule, no cycles)

Goodwill only, for a lead **no-show** (confirmed by both sides, W12) or a lead the broker **could not reach** (`unreachable`, a verified lead silent through W08, W10 C1A `cancel_no_rebook`). At most **3 requests per broker per Calendar Week** (Mon 00:00 to Sun 23:59 SAST, by the date of the missed appointment), no-shows and unreachable together, every request row counts. Never "didn't buy", never a broker no-show, never "outside criteria" or "no call" (these were replaceable in the old code: `reason` CHECK is now `no_show | uncontactable`). Lead Velocity keeps its 48-h dispute window. An **approved** replacement adds one lead of capacity to the order the missed lead was delivered on, so routing sends the broker one more lead; `counted_toward_order` stays at the paid number.

Two writers, one rule, one lock key: W13 (WhatsApp / system path, `n8n_app`) and the broker portal RPC `smc_request_replacement` both take `pg_advisory_xact_lock(hashtextextended('w13:week:' || broker || ':' || <SAST week start in UTC>, 0))` and count after the lock. Over the maximum nothing is written. Proven concurrently: 8 simultaneous claims in one week -> exactly 3 rows, positions 1..3; 5 simultaneous claims for one lead -> 1 row.

## 4. KEEP: every object, and why the flow needs it

### Helpers and audit (02)
| Object | Why |
|---|---|
| `smc_is_admin()`, `smc_current_broker_id()` | RLS helpers (definer, avoid recursion); every SMC policy and portal RPC uses them. |
| `smc_hash_contact(text)` (final digits-only rule) | Suppression and 90-day dedupe use the same hash in SQL and in code (W01/W03/W15). The v1 rule and re-hash pass are not needed: no hash is stored yet. |
| `btree_gist` | The appointments overlap exclusion. |
| `audit_log` + 7 columns, `smc_audit()` + triggers on brands, brokers, leads, appointments, communications, lead_orders (brand-scoped), outcomes, replacements, suppression, escalations, broker_media, incidents, lead_offers | POPIA accountability for every SortMyCover write in the one live audit table; PII values never stored (redaction list includes every capture-v2 identifier). Legacy rows keep the live `fn_audit` path. |

### Brand and broker (02)
| Object | Why |
|---|---|
| `brands` (+ `brand_id`, `status` aliases), SMC seed | The SortMyCover discriminator (`brand_id IS NOT NULL` on every shared table), the WhatsApp sender (`phone_number_id`; under Twilio the sender digits), `booking_ui` / `booking_flow_id` (W28 Flow vs list), `template_status` (SUB-whatsapp-send), `pixel_id` / `dataset_id` (CAPI). Ads/page-health fields and the CoverKlaar seed are not carried over. |
| `brokers.brand_id`, `routing_on`, `consent_mode`, `fsp_number`, `licence_categories` | Routing switch, named consent and the disclosure ("practice (FSP n)"), capture-v2 licence check. |
| `calendar_provider`, `ms_tenant_id`, `calendar_token_ref`, `calendar_mode`, `calendar_status`, `calendar_status_at`, `calendar_status_detail`, `calendar_scopes`, `calendar_connected_at`, `next_free_slot_at` | Live Outlook availability (W04), booking into Outlook with Teams (W05), ms-oauth connect / disconnect, portal Calendar page. |
| `methods_supported`, `meeting_hours`, `timezone`, `slot_minutes`, `buffer_minutes`, `min_notice_hours`, `horizon_days`, `max_meetings_per_day/week`, `bookings_paused`, `add_client_as_attendee` | The slot engine and the portal Calendar page (broker-editable). |
| `headshot_url`, `bio_short`, `languages`, `years_advising`, `intro_card_url`, `intro_voice_url`, `intro_video_url`, `intro_media_pref`, `positioning_answers`, `verified_credentials`, `onboarding_progress` | Intro card with photo, the later intro video (W23), intro script inputs and the only identity claims a script may use. |
| aliases `broker_id`, `adviser_name`, `practice_name`, `adviser_whatsapp`, `active` (generated) | The workflow SQL reads these names (40+ references). 18-row table, millisecond rewrite. |
| `brokers_status_check` widened (superset, `Prospect` kept) | SortMyCover broker lifecycle (`invited` ... `active`, `paused`, `ended`); `active` gates routing. |
| `brokers_smc_checks` | Availability bounds, calendar status vocabulary, token-reference NAME pattern (never a token), credentials shape. |
| `brokers.accepts_low_budget` (2026-10-11) | Tier C standing yes (agreement 5.7 offer accepted at once); admin-only. |
| `brokers.handles_wills`, `leads.product_interest` (2026-10-11) | Wills / estate leads (theme-B angles) route only to brokers with `handles_wills` (else `held_no_wills_broker`); admin-only switch. |
| `brokers_smc_routing_ready` (2026-10-11) | `routing_on` only with FSP number, practice, adviser and intro card (FAIS disclosure on the intro card). Every live row has `routing_on = false`, so it validates at once. |

### Leads, timeline, messages, bookings (02)
| Object | Why |
|---|---|
| `leads` consent columns (`consent_text`, `_version`, `_mode`, `_at`, `_ads_at`, `_page_url`, `_source`) + CHECK "no SortMyCover lead without consent" | POPIA consent record captured at the CTWA tap / page. |
| qualifying columns (`age_band`, `budget_band`, `bond`, `dependants`, `work_cover`, `method_pref`, `best_time`, `language`, `qualified_at`, `disqualified_reason`) | The WhatsApp questions (W03) and the Flow pop-up. |
| contact + email verification (`call_number*`, `alt_number`, `alt_email*`, `email_status`, `email_purpose`, `email_verified*`, `email_verify_*`, `email_unverified_flag*`, `wa_id`, `wa_verified`) + `email DROP NOT NULL` | Email + contact details step and the Resend verification (code hash only, never the code). |
| capture-v2 (`reasons`, `spend_band`, `lead_tier`, `income_band`, `smoker*`, `licence_flag`, `capture_state`, `delivered`, `offer_*`, `declined_broker_ids`) + `leads_capture_v2_checks` (NOT VALID) | The Flow capture v2 and the tier-B offer. |
| WhatsApp evidence (`first_message_at`, `wa_delivered_at`, `verified_at`, `disclosure_msg_id`, `disclosure_delivered_at`), `stage`, `stage_entered_at`, `conv_state`, `opted_out_at`, `last_contact_at`, `retention_delete_after`, `health_flag`, `is_synthetic`, `routed_at`, `routing_reason`, `dedupe_hash`, `duplicate_of` | First touch < 60 s with disclosure, conversation state, STOP, 90-day dedupe, held reasons, retention clock. |
| source / attribution (`origin`, `ctwa_clid`, `ref`, `ad_id`, `adset_id`, `campaign_id`, `angle`, `utm_*`, `fbclid`, `fbp`, `fbc`, `lead_event_id`, `leadgen_id`, `page_url`, `client_ip`, `client_user_agent`) | The CRM records where a lead came from (click-to-WhatsApp id, page, Lead Ads); W01/W03 write them. |
| `smc_leads_stage_stamp` trigger, `leads_smc_checks`, indexes (`leads_leadgen_full_uidx` is the W01 ON CONFLICT target) | Stage bookkeeping and idempotency, SMC rows only. |
| `lead_activities` columns, CHECK, FULL unique `idempotency_key` index | The one stamped timeline: every reminder job (W09), tap, booking, outcome, consent and order attach; the bare `ON CONFLICT (idempotency_key)` the workflows use (33 statements) needs the full index. |
| `communications` columns, CHECK swaps (supersets), `communications_smc_external_uidx`, `communications_smc_send_correlation_uidx` | Every WhatsApp/SMS/email in and out (disclosure evidence, delivery receipts, one send per correlation). |
| `appointments` columns (Outlook `graph_event_id`, `ical_uid`, Teams `join_url`, `ics_url`, `method`, `ends_at`, `confirmed_at`, `cancelled_at`, `reschedule_count`, `previous_booking_id`, `booked_via`, `booked_at`, `schedule_event_id`, `invite_email_status`, `call_number`, `idempotency_key`, `intro_played_at`, `late_booking`), CHECK, no-double-booking unique index + GiST exclusion, full unique indexes | Booking into the broker's Outlook with a Teams link, reminders carrying the link, zero double bookings. |
| view `bookings` | The portal Leads page reads it. |
| `webhook_events` (source CHECK: whatsapp, rate counters, Graph dedupe) | Inbound wamid / MessageSid claims, one reply per inbound message, W01/W05 rate limits. |

### Orders, outcomes, replacements (03)
| Object | Why |
|---|---|
| `lead_orders.brand_id` + index, `smc_open_order_for`, `smc_leads_route_check`, `smc_leads_attach_order`, view `smc_order_capacity` | Capacity from the CRM's own orders (section 2). |
| `leads.lead_order_id`, `order_state`, `order_*_at`, `order_release_reason` (+ `leads_smc_order_state_check` NOT VALID, partial index), `smc_broker_ready`, `smc_leads_release_reservation`, `smc_count_lead` + `smc_outcome_count_or_release` (on appointments), `smc_outcome_release_reservation` (on outcomes) | Count at booked + attendance confirmed, reservations, release (section 2). |
| `outcomes` (`unreachable` kind, `replacement_eligible` = no_show or unreachable), `smc_disposition_code` | W12 meeting outcomes; the replacement trigger. |
| `replacements` (`lead_order_id`, `booking_id`, `missed_start_at`, proof columns), `smc_week_start`, `smc_replacements_cap` (weekly position), one-per-lead / one-per-booking indexes | Section 3. |
| `smc_request_replacement`, `smc_request_noshow_replacement` | The broker's portal request (older portal builds call the no-show name). |

### Side tables (04)
| Object | Why |
|---|---|
| `wa_threads` | Qualifying-thread state per mobile hash (W03), stall nudges (W08); 72-h life. |
| `lead_offers` | Agreement 5.7 offers: tier B (accept / decline / expiry) and tier C (`decided_via` standing / admin) evidence. |
| `suppression` (+ `(mobile_hash, source)` index) | Opt-out: STOP (W15), CTWA "No thanks" (W03), W08/W10; every send checks it. |
| `escalations` (kinds trimmed to the ones written) | Human hand-off queue in the CRM console (W07 handoff, W10, W12 disputes, W13). |
| `broker_media` (+ generated `state`, deferred one-current exclusion) | Intro voice / video takes (W23). |
| `incidents` | POPIA breach register; W07 drafts a row per breach-report mail. |
| `capi_log` | SUB-capi-send logs every Meta conversion event; W01/W03/W05/W12 call it. Decision D3. |

### Access, storage, calendar, sweep (05, 06, 07)
| Object | Why |
|---|---|
| role `n8n_app` (NOLOGIN), schema/auth grants, generic policies (admin all, n8n rw), broker read-own / mark-own policies, n8n "brand rows" policies on the shared tables, read-only n8n policies on `lead_orders` / `lead_order_items` | Least privilege for the workflows; brokers see only their own rows. |
| RESTRICTIVE policies on `leads`, `appointments`, `lead_activities` (broker writes on brand rows), `brokers` (self-insert) | A broker cannot write SortMyCover lead / booking / timeline rows or enrol himself (review rewrites H-1, H-2). |
| `smc_brokers_guard` (merged smc_05/08/13/14 guards, trimmed to kept columns, hardened after the 2026-10-11 review) | Brokers keep editing their profile and availability. Nobody but Lead Velocity sets routing, consent mode, licence, verified credentials, calendar connection state or approved media, on ANY row (a legacy broker cannot pre-load them before enrolment). Practice name, FSP number, adviser name and WhatsApp number are editable during onboarding and frozen once routing is on (they are in the consent text and the disclosure). |
| `smc_portal_event` (trimmed: timeline row only) | The portal Calendar page records availability changes on the timeline. |
| bucket `broker-media` + 6 policies | Headshot, intro takes, no-show proof; brokers write only under their own id. |
| `smc_vault_store_ms_refresh`, `smc_vault_ms_refresh`, `smc_set_calendar_status`, `smc_ms_disconnect` (+ service_role grants for the edge function, read wrapper n8n_app-only) | Microsoft calendar connect (ms-oauth), W04 token refresh, Disconnect forgets the token. |
| file 07 sweep + self-check | The posture is asserted, not assumed. |

## 5. DROP: everything else in smc_00..smc_24, and why

| From | Object(s) | Reason |
|---|---|---|
| 02 | `pricing` (+3 SMC tier seeds) | Prices come from `automation/billing/pricing.seed.json` / `src/lib/pricing.ts`; the CRM order carries the amount. |
| 02, 06, 22 | `cycles` (+ fill trigger, invoice link, top-up columns, shortfall CHECK), `brokers.current_cycle_id`, every `cycle_id` column (leads, lead_activities, appointments, outcomes, replacements), `v_cycle_progress` | Duplicates the CRM's `lead_orders`; capacity is the order (section 2). |
| 02, 06, 08, 11, 22 | `invoices_smc`, `bank_credits`, invoice/billing sequences and triggers, `brokers.tier_code`, `ref_code`, `billing_ref`, `next_tier_code`, `card_autorenew`, `paystack_*`, Paystack Vault wrappers, top-ups | The CRM already has the invoicer, contracts, `admin_mark_order_paid` and the Paystack reference on `lead_orders`. |
| 02 | `leads.tier_code`, `concept`, `placement`; `appointments.graph_calendar_id`, `intro_arm`, `intro_sent_at`, `intro_read_at` (intro-media A/B test arms); `brokers.routing_rules`, `fsp_verified_at`, `fsp_check`, `approved_live_*`, `onboarding_step`, `explainer_watched_at`, `close_rate`, `avg_commission_zar`, `status_changed_at`, and the onboarding-funnel / preflight / FB-page columns of smc_06 | Not read or written by any nurture workflow (column usage scan) or tied to dropped billing / onboarding funnel / ROI (FAIS: close rate retired by clause 8.4). |
| 02, 05, 08 | `admin_documents` e-sign columns + CHECK, `smc_sign_document`, `smc_request_ip` | The CRM's order contract signing (`sign_order_contract`, `sign_order_contract_drawn`, `signed-contracts` bucket) is the agreement path. |
| 02 | view `smc_conversations` | No reader in the flow (workflows read `communications`). |
| 03 | schema `ops` and all its tables (pulses, proposals, signals, notifications, memos, costs, quality_grades, billing_*, secret_inventory, backup_runs, infra_day, page_day, page_audits, settings, judge_runs, build_state, watchlist_targets, ctwa_clicks) | Operations dashboard / optimisation layer, not needed at runtime by the flow. W03's click counter and W23's LLM cost rows were removed from those workflows. |
| 03, 06, 16, 17 | `ad_metrics`, `ad_objects`, view `ads`, `creative_queue`, `ads_launch_plan`, `ads_write_log`, `brokers.media_share_pct` (14) | Ads console. W03's campaign/adset lookup from the ads cache was removed. |
| 03, 06 | `comments`, `comment_ad_sentiment`, `dm_queue`, `dm_threads`, `insights`, `lead_pulse` (+ the smc_13 lead-pulse policies) | Community/DM handling, analytics insights, the W35 lead pulse: not part of the nurture flow. |
| 03, 06, 12 | `report_history` extension, view `smc_reports`, `smc_mark_report_opened`, `smc_report_ask_done`, `smc_report_policies_written`, W14 report functions | Broker reports (the CRM has its own). |
| 03, 06, 12 | `dsr_requests`, `retention_log`, `obligations` (+ seeds), `smc_erase_lead` | W34 DSR/retention machinery. Opt-out (`suppression`, `opted_out_at`) and the retention clock column are kept. Decision D4. |
| 03 | `sla_thresholds` columns + the `smc_first_message` seed row, `message_templates` extension, `profiles.whatsapp_number` / `notify_dnd` | Ops SLA/alerting and template-sync; nothing in the flow reads them. Leaves those live tables untouched. |
| 04 | schema `facts`, `smc_private` (+ salt), `smc_watchlist`, every facts view / function | Reporting/analytics, not needed at runtime. |
| 05 | role `facts_reader` | Only existed for the facts layer. |
| 06 | `support_events`, `smc_portal_touch`, `smc_watchlist_tiles`, `smc_faculty_tiles`, `smc_console_*` | Portal heartbeat / help desk / console tiles over dropped layers. `smc_portal_touch` calls from the portal shell now return 404 (harmless, `void`). |
| 06, 15 | generated `leads.qualified`, `leads.premium_1500` | Would rewrite all 4,209 live leads under an exclusive lock and break any whole-row writer; the flow reads `qualified_at` / `budget_band` directly. |
| 12 | `smc_hash_contact_v1` + re-hash pass | No stored hashes exist yet; the final rule is created directly. |
| 19 | `leads.counts_toward_cycle` | Cycle concept; attach-on-delivery replaces it. |

## 6. Behaviour changes to the EXISTING CRM (read before applying)

1. **File 01 (security, as reviewed):** anon loses every privilege on 31 CRM tables (incl. `leads`, `brokers`, `lead_orders`, `lead_order_items`, `audit_log`); anon keeps INSERT on `broker_onboarding_responses` (public form) and `broker_reset_requests`. Storage policy "Public Access" (anon could read every `admin-documents` object) is dropped and the broker download policy is fixed. Three open policies are closed (invite UPDATE true, security-question INSERT true, system_logs readable by every signed-in user). Onboarding responses / analysis become admin-only + own row. Appointments / broker-notes admin policies are replaced by equivalents.
2. **Admin-document links:** `ContractGenerator.tsx:631`, `InvoiceGenerator.tsx:453/631`, `ProposalGenerator.tsx:314/731` build `getPublicUrl` links. The `admin-documents` bucket is already private live (checked 2026-10-11), so those links already fail today, independent of this chain; they need `createSignedUrl` (pattern: `src/pages/portal/Agreement.tsx:30`). Not changed here (legacy CRM UI). Decision D12.
3. **brokers:** 47 new columns (5 from file 00; 5 generated aliases rewrite the 18 rows in ms), `brokers_status_check` widened (superset), `brokers_smc_checks` and `brokers_smc_routing_ready` (all live rows pass: none has routing on), triggers `smc_brokers_guard` and `smc_audit`, RESTRICTIVE self-insert policy (a self-inserted row must leave every SortMyCover field empty). A legacy broker editing his own row can still change every legacy column, but none of the SortMyCover fields (routing, consent, FSP number, licence, credentials, calendar state, intro media).
4. **leads:** `email` becomes nullable; 99 nullable/constant-default columns (no rewrite; 6 of them are the order-state columns of file 03); two NULL-tolerant CHECKs; indexes; triggers that return at once for legacy rows (`WHEN brand_id IS NOT NULL` on the routing triggers); RESTRICTIVE broker write policies on brand rows only.
5. **lead_activities:** `agent_id` and `lead_id` become nullable; a full unique index on the new `idempotency_key`; the live "Agents can create their own activities" policy can no longer set the SortMyCover columns (RESTRICTIVE).
6. **communications / appointments:** CHECKs swapped for supersets (communications), brand-scoped CHECK / unique / exclusion constraints (appointments), RESTRICTIVE broker write policies on brand rows, audit triggers (no-op for legacy rows).
7. **lead_orders / lead_order_items:** new nullable `lead_orders.brand_id` (+ index, audit trigger that ignores legacy orders). `lead_order_items` rows are created only for SortMyCover orders, by `smc_count_lead` when the broker marked the meeting attended and the email is verified (and removed by the routing trigger on a re-route). **outcomes** carries `smc_outcome_count_or_release`, **leads** `smc_count_on_email_verified` (brand rows only). `n8n_app` gets read-only access to SortMyCover orders. Existing order RPCs, statuses and the two Discovery orders are untouched.
8. **audit_log:** +7 columns; the 41 legacy rows get `at = changed_at` (new column only); INSERT/UPDATE/DELETE/TRUNCATE revoked from anon/authenticated, UPDATE/DELETE/TRUNCATE from service_role (append-only; the live writers are definer triggers).
9. New role `n8n_app` (NOLOGIN), new private bucket `broker-media`, extension `btree_gist`.
10. No existing row is modified or deleted (rehearsed: every baseline column of all 46 live tables hashes identical after the chain).

Compared with the old 25-file chain, these old changes are gone: the `sla_thresholds` seed row, `report_history` / `message_templates` / `admin_documents` / `profiles` changes, the full rewrite of `leads` (generated columns), the `facts_reader` role, the `ops` / `facts` / `smc_private` schemas.

## 7. Rehearsal and test results (2026-10-11)

`node supabase/drift/rehearse-chain.mjs` (throwaway `postgres:17-alpine`, `--network none`, live-schema mirror + synthetic seed):

| Check | Result |
|---|---|
| apply 8 files in order, one transaction each | PASS |
| re-apply the whole chain | PASS, catalog unchanged |
| pre-existing rows unchanged (baseline columns of all 46 live tables) | PASS (legacy audit rows intact) |
| security audit (`post-apply-security-audit.sql`): no chain table without RLS, no anon privilege on new objects, no definer without pinned search_path, no anon-callable new definer, no new open policy, no secret literals | PASS; pre-existing anon-callable definers unchanged (19) |
| `smoke-nurture.sql` (routing_on refused without FSP / intro card, lead held for a broker that is not ready; reserve at routing, nothing counted at hand-over, COUNT at confirmed attendance exactly once (also when n8n_app confirms), release on STOP / disqualified / un-route / unconfirmed meeting; hold / re-route refusal / replacement adds capacity / legacy order untouched; replacement RPC window, traversal, shared weekly counter, duplicate; brokers guard; portal event; n8n_app scope; anon) | PASS (re-run 2026-10-11 after the count-at-confirmation change) |
| generate undo + run 07 -> 00 | PASS: catalog identical to baseline (bucket `broker-media` and `btree_gist` excepted, both documented), data identical |
| `W13-claim-tx.local.test.mjs` (real W13 claim SQL + routing and counting triggers, concurrent, on the mirror; FSP readiness) | PASS |

Automation suites (offline, mocked, no real send; no `+1` number anywhere), re-run 2026-10-11 after the tier-C + verify-gate pass: W01 37, W03 23, W04 18, W05 32, W06 22, W07 39, W08 15, W09 26, W10 25, W12 28, W13 16, W15 18, W28 17, SUB 27, wa-provider 17, twilio-flow 21, ms-oauth 19, capture-v2 34, budget-1500 5, budget-moved 7, webhook-sources 5, generators 5, workflow-ids 46, egress-dryrun 46, loader 6, credential-inventory 6, credential-copies 6, pubcheck 5, ads/meta-ads 27, media/w23-auth 24, media 11, security/verify-webhooks 11, security/lead-token 11, W13-claim-tx.local 2 (Docker, now also: confirmed attendance alone counts nothing, the verifications count it concurrently): all pass. Smoke adds 1c (tier C) and 7b (held slot + broker visibility); 3a now proves the count needs both conditions in either order. Templates: `check.mjs` 63 / 0 errors; Twilio Content `--check` up to date (50 definitions). Landing: `landing/build.mjs` builds; the Playwright quiz / a11y specs were updated but not run here (no `playwright` install in this worktree).

Suites that now fail because they target dropped objects (out of the nurture scope, decision D5): W11, W14-surfaces, W29, W32, W34, W35, ads-console, ops-feeders, visit-beacon, billing/manual-eft, billing/pilot; the S7-06/07/08-09 local suites (W20/W14/W22).

## 8. Decisions for Jonathan

* **D1 Orders:** the CRM order form has no brand field. Set `lead_orders.brand_id` for a SortMyCover order by SQL or add a brand selector to the admin order form. A full order stays `paid` (count-based); say if it should flip to `delivered` automatically.
* **D2 When a lead counts as delivered: RESOLVED (Jonathan, 2026-10-11).** Broker-marked attended (clause 14.3(c)) AND email verified (LGSA v0.3 clause 5.2 / Schedule 2 criterion 1). Built in file 03 (section 2 above): routing reserves, `smc_count_lead` counts when both conditions hold. A no-show is never counted (its place goes back), so replacements only matter for an outcome changed after counting.
* **D3 CAPI:** `capi_log` is kept because W01/W03/W05/W12 call SUB-capi-send (Meta conversions for the click-to-WhatsApp ads). Drop CAPI from those workflows if it is not wanted.
* **D4 POPIA DSR / retention purge (W34):** dropped with `dsr_requests`, `retention_log`, `obligations`, `smc_erase_lead`. Opt-out and `retention_delete_after` remain. Decide how DSRs and the 12-month purge run in the CRM.
* **D5 Workflows outside the flow** that reference dropped objects and must be retired or re-scoped: W11 (digest / 24-h backstop: `insights`, `cycle_id`), W14, W16-W19, W20 (onboarding funnel), W21, W22 (alerts in `ops.notifications`: many workflows raise W22 signals, so alerts would be lost; the kept console queue is `escalations`), W24-W27, W29 (`insights`, `ad_metrics`; W12 calls it fire-and-forget), W30-W35, SUB-w26 / ads-budget / visit-beacon, console pages `src/pages/smc/*`, `Agreement.tsx` and `smc/Ads.tsx` (read `cycles`).
* **D6 Twilio and the WhatsApp Flow pop-up: RESOLVED (2026-10-11).** Twilio supports Flows built in Meta (`whatsapp/flows` Content, endpoint included); the completion arrives as `InteractiveData` / `FlowData` and W07 routes it to W05. All nurture workflows now send through SUB-whatsapp-send (CONTRACTS.md "One transport"). Jonathan's steps: `automation/SETUP-TWILIO.md`. Every message in and out is a `communications` row (channel whatsapp, direction, lead_id, broker_id, external_id = MessageSid, status from the status callbacks), so it shows in the CRM's UnifiedCommunicationHub.
* **D14 (2026-10-11, updated)** The broker sees a SortMyCover lead's contact details only once it counts (S2.4), and sees nothing at all about the lead (row, booking, timeline, messages) until its email is verified (verify gate, RESTRICTIVE policies). After verification W05 sends him the booking (first name only) and creates the Outlook event.
* **D7 Rule changes made in code to match the agreed replacement rule:** `nofit_criteria` (W29) and C1A `no_call` (W10) no longer open a replacement; the W12 "two unconfirmed outcomes" alert is now per broker within 30 days (was per cycle).
* **D8 (inherited)** brokers can read SortMyCover tracking columns of their own routed leads through the existing full-row lead policies (`client_ip`, `fbclid`, `email_verify_code_hash`, ...).
* **D9** `service_role` can no longer EXECUTE `smc_vault_ms_refresh` (hardening; the ms-oauth edge function never reads a token). Revert only if an edge function must read it.
* **D10** Google Calendar later: `calendar_provider` already allows `google`; the Vault wrappers are Microsoft-only and need a Google twin.
* **D11** see section 6 item 2 (admin-document links) and the gates in `APPLY-RUNBOOK.md` (hosted grants on `auth.uid()` / `storage.objects` / `vault.secrets`).
* **D12 Live `fn_audit` copies whole broker rows:** the live trigger `trg_audit_brokers` writes `to_jsonb(NEW)` into `audit_log.new_data`, which now includes `whatsapp_number`, `calendar_email`, `google_calendar_token`, `positioning_answers`, `verified_credentials`; file 05 makes `audit_log` append-only (even for service_role), so only the `postgres` role could clean it. Decide: redact those columns in `fn_audit` (live-only function, not in the repo) or skip it for SortMyCover rows. Not changed here.
* **D13 Portal pages outside the flow** write columns this chain does not create: `Agreement.tsx` (`signatory_name/role`, reads `cycles`), `Reports.tsx` (`close_rate`), `smc/Ads.tsx` (`cycles`). `Profile.tsx` works (`languages`, `years_advising` are kept; `fsp.submitted` is an accepted portal event).


## 9. Independent review (2026-10-11) and what was fixed

A separate read-only review of the 8 files found 1 high and 10 medium issues; all were fixed and re-rehearsed (section 7 results are after the fixes):
* HIGH: `n8n_app` could forge `request.jwt.claim.sub` and reach legacy CRM rows through live policies without a `TO` clause. Fixed: RESTRICTIVE `n8n_app` policies on leads, appointments, communications, lead_activities, brokers, lead_orders, lead_order_items (smoke test 7 forges the admin uid).
* Un-routing left the lead on the old order (double delivery). Fixed: the AFTER trigger detaches from the previous broker first (smoke test 2).
* Turning a routed lead into a SortMyCover lead bypassed the triggers. Fixed: triggers fire on `broker_id` and `brand_id`.
* REPEATABLE READ / SERIALIZABLE could overfill an order. Fixed: `smc_open_order_for` refuses outside READ COMMITTED.
* Brokers could retarget their own outcome rows. Fixed: the UPDATE policy re-checks the booking belongs to them.
* The replacement RPC accepted cancelled / disputed bookings, missing proof files and leads not on an order. Fixed (smoke test 3).
* Legacy brokers could pre-load SortMyCover fields; self-insert could set tokens / credentials. Fixed (guard + insert policy).
* A token reference could point at another broker's Vault secret. Fixed: CHECK and the read wrapper tie the name to the row id (smoke test 2).
* Brokers could change or delete no-show proof during the dispute window. Fixed: storage UPDATE/DELETE policies exclude `noshow-proof/`.
* Calendar re-connect left old refresh tokens in Vault. Fixed: storing a new one deletes the old ones.
* File 07 missed sequences, PUBLIC / column grants, view security_invoker and 21 of the file-01 tables, and swept every non-live table. Fixed: explicit chain object list, all of those asserted.
* W13: lock key now `$5::uuid::text` (identical to the portal key), `queryBatching` pinned to `single`, one-live-request-per-lead rule identical to the index and the portal.
Not changed (low, documented): a hold on a statement that also sets `first_message_at` errors on `leads_smc_checks`; (fixed 2026-10-11: one statement routing several leads past an order's room now holds the surplus instead of erroring); deleting a SortMyCover lead cascades its replacement rows (frees a weekly slot); D12.
