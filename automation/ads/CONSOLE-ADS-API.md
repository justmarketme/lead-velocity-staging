# CONSOLE-ADS-API: the contract the console Ads screen calls

Owner: ads-api-engineer. Reader: platform-architect / console builders. Source: MASTER-PROMPT 6.2, 6.3, 6.1 step 5; `deliverables/media-buyer/campaign-spec.md` sections 12 and 13.
Status: contract only. Nothing is called live (no token exists). Endpoints are shown as edge-function names under `supabase/functions/ads-*` (platform-architect may mount them elsewhere; the shapes are what matter). All Meta IDs come from the `brands` row, never hard-coded. Every call is admin-only (RLS `has_role('admin')`); the edge function wraps `automation/ads/meta-ads.js`.

## Rules that never bend
1. **Reads never touch Meta from the browser.** The screen reads `ad_metrics` (filled hourly by W21). "Live" means at most one hour old; the screen shows `fetched_at`. Insights are never fetched more often than hourly.
2. **Every write is confirm-to-apply, two steps:** `POST /ads-confirm` (preview + mint token, only reachable from the confirm button), then the apply call with `confirm_token` + `confirmed_by`. Token is HMAC-signed, bound to action + target + parameters, single use, 15 minutes. Changing any number after minting invalidates it (`CONFIRM_MISMATCH`).
3. **Every write returns `audit[]` and `notifications[]` rows** (who / when / why). The edge function inserts them into `audit_log` and `ops.notifications` in the same transaction as it records the result. `reason` is mandatory (min 3 chars).
4. **Guardrails run before any Meta call**, with the caps passed in from the CRM (below). A refused write sends nothing to Meta.
5. **Never autonomous.** The kill/scale rules in campaign-spec 11.1 only create `ops.proposals` (source `kill_rule`); a human tap mints the token.
6. Errors are `{ok:false, code, message, retry_after_ms?}`. Codes: `CONFIRM_REQUIRED, CONFIRM_INVALID, CONFIRM_EXPIRED, CONFIRM_MISMATCH, CONFIRM_REUSED, DAILY_CAP, MONTHLY_CAP, BUDGET_BELOW_MIN, STEP_LIMIT, STEP_COOLDOWN, CAP_MISSING, RATE_LIMIT_BACKOFF, TOO_SOON, SPECIAL_AD_CATEGORY_UNDECIDED, INTEREST_TARGETING, BAD_CTA, BAD_NAME, PLACEHOLDER_LEFT, SEED_TOO_SMALL, RAW_PII_REJECTED`. On `RATE_LIMIT_BACKOFF` the screen shows "Meta is busy, retry in N min" (no automatic retry loop).

## 1. Reads (from `ad_metrics`, joined to `leads` / outcomes)

### `GET /ads-tree?brand_id=&from=&to=&origin=`
Returns campaign -> ad set -> ad with metrics summed over the window.
```json
{ "fetched_at": "2026-10-16T07:07:00Z",
  "campaigns": [{ "campaign_id": "", "name": "SMC_A_LEADS-IF_ZA_c1", "status": "ACTIVE",
    "daily_budget_zar": 350, "month_cap_zar": 10500, "month_spend_zar": 3120.4,
    "metrics": { "spend_zar": 0, "leads_raw": 0, "qualified": 0, "booked": 0, "attended": 0,
      "cost_per_qualified": 0, "cost_per_attended": 0, "cpl": 0, "qualify_pct": 0, "show_pct": 0, "frequency": 0 },
    "adsets": [{ "adset_id": "", "name": "SMC_A_BROAD_ZA_35-50", "metrics": {}, "ads": [{
      "ad_id": "", "name": "C01_H1_sta-amb_20261015", "concept": "01", "angle": "H1", "format": "sta-amb",
      "status": "ACTIVE", "effective_status": "ACTIVE", "metrics": {}, "hook_rate": 0, "hold_rate": 0,
      "broker_quality_index": null, "n_for_decision": 0, "kill_scale_hint": null }] }] }] }
```
- Headline columns are **cost per qualified lead** and **cost per attended meeting** (Madgicx lens); raw CPL is secondary. Per-creative economics is the unit.
- `qualified`, `cost_per_qualified` are filled by the W21 join; `booked`, `attended`, `cost_per_attended`, `broker_quality_index` by W29 (nulls until those tables exist; the screen shows "n/a", never zero).
- `origin` filter = `leads.origin` (`lead_ad`, `page`, `ctwa`, `comment`).
- `status` / `effective_status` / `daily_budget_zar` come from a cached `ad_objects` read refreshed by W21 (one `GET /{ad_account}/ads?fields=...` batched with insights; ASSUMPTION: platform-architect adds the columns or table, otherwise the screen shows metrics without live status).
- `kill_scale_hint` is computed in SQL from campaign-spec 11.1 (R3,000 spend rule, n >= 5 dispositions) and only suggests; it applies nothing.

### `GET /ads-guardrails?brand_id=`
`{ daily_cap_zar, monthly_cap_zar, month_spend_zar, projected_month_spend_zar, pct_of_cap, alert_80: bool, day_spend_over_1_5x: bool, last_budget_change_at, min_daily_budget_zar }`
- `monthly_cap_zar` = sum of `pricing.media_share_zar` over brokers with `status='active'` for the cycle (cycle 1 default R10,500 pending needs_human 2 in the media-buyer SUMMARY). `daily_cap_zar` = per-campaign cap set by admin (default = monthly cap / 30 x 1.2).

### `GET /ads-health?brand_id=`
The `brands` health fields written by W27: `page_status, ig_status, bv_status, ad_account_status, waba_quality, template_status, emq, health_alerts[], health_checked_at`. Plus token-health from W22.

## 2. Writes (all confirm-to-apply)

### Step 1: `POST /ads-confirm`
```json
{ "action": "set_campaign_budget | pause_ad | resume_ad | create_campaign_tree | create_leadgen_form | subscribe_leadgen_webhook | create_engagement_audiences | create_customer_list_audience | create_lookalike",
  "target": "<campaign_id | ad_id | act_id | page_id>",
  "params": { },
  "requested_by": "<auth.uid>", "reason": "why (required)" }
```
Response: `{ confirm_token, expires_at, preview }`. The `params` object must be exactly what the apply call will carry (see table). The UI shows `preview` (old value, new value, caps, projected month spend) and a Confirm button; only that button calls the apply endpoint.

| action | `target` | `params` to bind | Apply endpoint |
|---|---|---|---|
| `set_campaign_budget` | campaign_id | `{dailyBudgetZar, setSpendCap, monthlyCapZar}` | `POST /ads-budget` |
| `pause_ad` | ad_id | `{status:"PAUSED"}` | `POST /ads-ad-status` |
| `resume_ad` | ad_id | `{status:"ACTIVE"}` | `POST /ads-ad-status` |
| `create_campaign_tree` | `act_{id}` | `{specHash}` = `specHash(spec)` from meta-ads.js | `POST /ads-publish` |

### Change budget: `POST /ads-budget`
```json
{ "campaign_id": "", "daily_budget_zar": 350, "set_spend_cap": true,
  "confirm_token": "", "confirmed_by": "<auth.uid>",
  "go_live": false }
```
The edge function loads `current_daily_budget_zar`, `month_spend_to_date_zar`, `days_remaining`, `last_change_at` and `caps` itself (the browser cannot supply caps) and calls `setCampaignBudget`. Enforced: daily cap, monthly cap (projected = spend to date + daily x days remaining), Meta minimum, <= 20% increase and 48 h between increases (campaign-spec 12). `go_live:true` is only accepted from the Approve & go live flow (6.1 step 5): it lifts the 20% step for the raise from the minimum to `media_share_zar / 30`, still inside both caps. Rand values are converted to minor units (x100) inside the client.

### Pause / resume ad: `POST /ads-ad-status`
`{ "ad_id": "", "status": "PAUSED|ACTIVE", "confirm_token": "", "confirmed_by": "" }`. Resume of an ad that Meta has not approved is refused by Meta; the screen shows the `effective_status`.

### Duplicate a winning concept into a new ad with new creative
No single Meta call; the console composes it from the creative queue:
1. Admin clicks "Duplicate" on a winner -> `POST /ads-creative-queue` `{ source_ad_id, concept, angle, new_format, brief }` -> a `creative_queue` row (`status: requested`).
2. creative-strategist writes copy, visual-producer renders assets (HTML/SVG -> PNG/MP4) and uploads them to Meta (image hash / video id via the API; stored on the queue row) -> `status: in_review`.
3. Review (below) -> publish.
The new ad name is built by `buildAdName` (never typed): new `format` and `date`, same `concept` + `angle` for clean attribution. The old ad is untouched.

### Creative review queue -> publish
- `GET /ads-creative-queue?status=in_review` -> `[{ id, concept, angle, format, date, preview_urls[], primary_text, headline, description, image_hash|video_id, form_id, compliance_gate: "pass|fail|pending", ad_name }]`. `compliance_gate` is compliance-qa's no-product/no-insurer/no-premium/no-broker check; **publish is disabled unless `pass`**.
- `POST /ads-creative-queue/:id/approve` `{approved_by}` (Jonathan) -> `status: approved`. Reject/needs-changes returns it to the strategist with a note.
- `POST /ads-publish` `{ queue_ids[], confirm_token, confirmed_by }` -> for an existing ad set: creates the creative and ad **paused**, then Jonathan resumes it with the normal resume confirm (two taps, two audit rows; nothing spends from a publish alone). First-time build of Campaign A/B/C uses `createCampaignTree(spec)` (all objects PAUSED at the minimum budget; `special_ad_categories` must be set explicitly or the call fails closed).
- Pre-approval rule (2.1.8): the first three ads (`C01_H1_vid-amb`, `C03_H3_vid-amb`, `C14_H10_vid-amb` (per deliverables/media-buyer/first-batch.csv rows 1–3)) must be Meta-approved before the rest of the matrix is published; the screen blocks the batch until `effective_status` of those three is not `DISAPPROVED`/`PENDING_REVIEW`.

### Scheduled creative refresh
`POST /ads-refresh-schedule` `{ ad_id|concept, refresh_at, brief }` creates a future `creative_queue` row and an `ops.notifications` reminder. It does not change any ad by itself.

## 3. Lead Ads, forms, audiences (admin tools; setup, not daily)
- **Instant form:** `POST /ads-leadgen-form` (confirm: `create_leadgen_form`) takes the body of `deliverables/media-buyer/instant-form-spec.json` with `{practice_name}`, `{fsp_number}`, `{PRIVACY_URL}` already filled from the `brokers` row (fail closed: refused if any `{placeholder}` remains). A form's consent text is never edited after publish; a new version is a new form (`SMC_A1_HI_v{n}_...`). Higher Intent and conditional logic may be UI-only (media-buyer `_ui_only`); the meta-operator finishes those in Ads Manager.
- **Webhook subscribe:** `POST /ads-subscribe-leadgen` (confirm: `subscribe_leadgen_webhook`) -> page `subscribed_apps` with `leadgen`; the app-level callback URL is W02's `meta-leadgen` webhook.
- **Audiences:** `POST /ads-audiences/engagement` (needs page/IG/form ids), `/ads-audiences/customer-list` (rows arrive **already hashed** from n8n: raw PII is rejected), `/ads-audiences/lookalike` (`seedId`, `ratio` 0.01-0.20, `seedSize` >= 1,000 else `SEED_TOO_SMALL`). Nightly exclusion refresh uses `addAudienceUsers` (hashed rows, no ad-delivery effect, no confirm token) and only rows with `consent_ads_at IS NOT NULL`.
- **Offline events:** `uploadOfflineEvents` delegates to `automation/capi/capi.js` (W12/W29 daily).

## 4. Go-live budget raise (6.1 step 5)
After Jonathan's "Approve & go live" tap the workflow requests a confirm for `set_campaign_budget` with `dailyBudgetZar = sum(active brokers media_share_zar) / 30` (cycle 1: R350 default), `go_live: true`, `reason: "go-live broker {id}"`. The approve tap is the human confirm: the edge function mints the token in the same request and applies it, logging both who and why. At cycle end without payment the reverse (decrease) goes through the same endpoint and the spend cap is lowered in the same step.

## 5. What stays in Ads Manager (6.2)
Done by the meta-operator via Chrome; settings recorded in the console afterwards:
- **Special Ad Category declaration** (campaign-spec section 10 decision procedure). The API call requires the field, so `createCampaignTree` refuses a spec that does not state it.
- Higher Intent / Rich Creative form type and conditional-logic endings if the API does not expose them (verified on a test form).
- Payment method, billing, spending-limit changes at account level, business verification, Page/IG linking, domain verification and aggregated-event priority, WhatsApp display name and Flow publishing (human gates, 2.2).
- Advantage+ audience suggestions and placement exclusions if a field is not writable through the API (record the screen).
