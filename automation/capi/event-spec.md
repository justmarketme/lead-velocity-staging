# SortMyCover event dictionary (Pixel + CAPI + offline)

Source: MASTER-PROMPT 4.4a/4.4b/6.3. Nothing is deployed; needs `pixel_id`, dataset id and system-user token from GATE-PIXEL.
Code: `landing/shared/pixel.js` (browser), `automation/capi/capi.js` (server).

## event_id rule
1. **Browser-originated events** (PageView, ViewContent, Lead, Schedule, Contact): the browser generates a UUID per event (`smc.track`). The form posts it as `context.event_id`; n8n reuses it verbatim as `eventId`. Same `event_name` + same `event_id` = Meta dedupes the Pixel and CAPI copies.
2. **Server-only events** (offline stages, business-messaging, Lead Ads): `evt_<lead_id>_<stage>` (`stableId()`), e.g. `evt_8c1f_qualified`. Re-running a workflow resends the same id, so it is idempotent. If a browser id is missing on W01 (JS off), fall back to `evt_<lead_id>_lead`.
3. Never reuse one event's id for a different event name.

## Events
| Event | Fires where | event_id | action_source | Required user_data (source column in `leads`) | Dedupe window |
|---|---|---|---|---|---|
| `PageView` | Browser only (pixel.js on load) | browser UUID | website | n/a (pixel cookies) | Browser-only; not sent via CAPI (volume, no PII) |
| `ViewContent` (quiz start) | Browser (`smc.track('ViewContent')`); CAPI optional, off by default | browser UUID | website | `fbp`,`fbc` | 48 h if CAPI enabled |
| `Lead` (web form) | Browser at details submit **and** W01 server | browser UUID from `context.event_id` | website | `ph`<-`mobile`, `fn`<-`first_name`, `em` (only if collected), `external_id`<-`id`, `fbp`,`fbc`, `client_ip_address`,`client_user_agent`, `country`=za | 48 h (Meta dedupe) |
| `Schedule` | Browser on confirmed booking **and** W05 | browser UUID from `/book` `context.event_id` (chat/Flow bookings: `evt_<lead_id>_schedule`) | website (page) / system_generated (chat, Flow) | same as Lead | 48 h |
| `Contact` (CTWA click) | Browser click on WhatsApp link; W03 has no server twin (the CTWA `Lead` below is the server signal) | browser UUID | website | `fbp`,`fbc` | browser only |
| `Qualified` (offline) | W12/W29 daily batch, after verified + bands met | `evt_<lead_id>_qualified` | system_generated | `ph`,`fn`,`em`?, `external_id`, `fbc` if known | n/a, id-idempotent |
| `Attended` (offline) | W12 on broker outcome = attended (or 24 h auto) | `evt_<lead_id>_attended` | system_generated | as above; `value` = broker quality score 1-5 when present (W29) | id-idempotent |
| `GoodFit` (offline) | W29, quality >= 4 | `evt_<lead_id>_goodfit` | system_generated | as above; `value` = quality score | id-idempotent |
| business-messaging `Lead` (CTWA) | W03 when a conversation starts from a CTWA ad (referral present) | `evt_<lead_id>_ctwa_lead` | business_messaging (+`messaging_channel: whatsapp`) | `ctwa_clid` (<- referral), `whatsapp_business_account_id`; `ph` optional | id-idempotent |
| business-messaging `Schedule` | W05 when a CTWA lead books | `evt_<lead_id>_ctwa_schedule` | business_messaging | `ctwa_clid`, WABA id | id-idempotent |

Offline events also carry `custom_data.event_source = "crm"` and `lead_event_source = "SortMyCover"` (Conversion Leads style). Use `sendOffline`; business-messaging via `sendBusinessMessagingLead` (a `Schedule` variant can reuse `sendEvent` with `actionSource: 'business_messaging'`, `messagingChannel: 'whatsapp'`).

## Aggregated Event Measurement priority and EMQ
Priority order set by meta-operator on the verified domain: **`Lead` > `Schedule` > `Contact`** (ViewContent/PageView after). EMQ target **>= 6/10** on test events (Great >= 8): send `ph`, `fn`, `external_id`, `fbp`, `fbc`, IP and UA on every web `Lead`/`Schedule`; `em` only when collected (Teams/Zoom/Meet bookings), since email is not asked otherwise.

## Join keys (6.3): one record per lead
`fbclid` (page) / `event_id` (browser) / `leadgen_id` (Lead Ads, W02) / `ctwa_clid` (CTWA, W03) -> `leads.id` -> WhatsApp conversation -> `bookings` -> `outcomes`. Every stage stamps `campaign_id`/`adset_id`/`ad_id` on the lead so cost per qualified lead, booking and attended meeting is per creative.

Columns for platform-architect to add (additive; reuse existing where the gap map says they exist):
| Table | Columns |
|---|---|
| `leads` | `fbclid`, `fbp`, `fbc`, `lead_event_id` (browser id), `leadgen_id`, `ctwa_clid`, `utm_source/medium/campaign/content/term`, `ref`, `origin` (page/ctwa/lead_ad/comment), `campaign_id`, `adset_id`, `ad_id`, `client_ip`, `client_user_agent`, `page_url`, `consent_ads_at` (advertising-improvement sentence ticked/accepted), `consent_text_version` |
| `bookings` | `lead_id`, `schedule_event_id`, `source` (page/flow/list/chat), `booked_at` |
| `outcomes` | `lead_id`, `booking_id`, `outcome`, `quality` (1-5), `disposition`, `decided_at` |
| `capi_log` (new) | `lead_id`, `event_name`, `event_id`, `action_source`, `sent_at`, `events_received`, `fbtrace_id`, `status`; unique(`event_id`,`event_name`) so reruns skip |

## Staged rollout checklist (4.4a)
- [ ] **Phase 1 (launch):** domain verified; pixel + CAPI `Lead`/`Schedule`/`Contact` live; test events checked with `META_TEST_EVENT_CODE` (remove for production); event priority set; EMQ >= 6; offline `Qualified`/`Attended` flowing from day 1 (seeds, 4.4b); hashed exclusions (Lead 90 d, booked, attended) uploaded nightly; engagement audiences created on day 0.
- [ ] **Phase 2 (pixel audience >= 1,000 or week 3):** retargeting Campaign B (quiz abandoners 14 d via `ViewContent` minus `Lead`; page visitors 30 d); different creative; frequency cap 3/7 d; excluded once submitted.
- [ ] **Phase 3 (>= 1,000 `Attended`/`GoodFit` or >= 200 leads/mo):** value-based quality lookalike (LAL-Q 1%/3%) as Advantage+ suggestion; Conversion Leads optimisation. Seed gates per 4.4b (>= 300 for `Lead`/`Qualified` LALs).

## POPIA note
Uploads are SHA-256 hashed in n8n only; no raw name/phone/email leaves our systems or the browser. Customer-list audiences are used only for **exclusion** and **lookalike seeding**, never for messaging. The consent line carries a separate sentence "to measure and improve our advertising" (distinct from the FSP-sharing purpose); privacy policy names Pixel, CAPI and cookies. No third-party lists. Final wording is contracts-drafter / compliance-qa's.

## ASSUMPTIONS to verify on test events
`v23.0` API version; `Schedule`/`Lead` accepted for business_messaging; value-as-quality-score with currency ZAR placeholder; `fb.1` subdomain index in `_fbc`; offline events sent via the dataset `/events` endpoint with `system_generated` (not the legacy offline-event-set API).


## Consent gate (compliance-qa phase0-review-1)
Every server-side send (`sendEvent`, `sendOffline`, `sendBusinessMessagingLead`, audience uploads) is called by n8n only when `leads.consent_ads_at IS NOT NULL` (the advertising-improvement sentence inside the consent tick, 4.4a). Leads with `consent_ads_at` null are excluded from CAPI, offline events and audience seeds, but still receive the service messages they asked for. The unhashed `client_ip_address` / `client_user_agent` and the broker's 1–5 quality score (as `value`) are named in the privacy notice as data sent to Meta.
