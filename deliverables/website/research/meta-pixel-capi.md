# Lens: meta-pixel-capi

Research date: 10 Oct 2026. Scope: Meta Pixel + Conversions API for SortMyCover (static Vercel site, campaign pages on subdomains of sortmycover.co.za, conversions finishing in WhatsApp/n8n), plus the POPIA position for pixel use and the soundness of the existing ad-measurement consent.

## How to read this file

- Evidence grades: **A** = Meta developer docs / regulator PDF / official changelog read this session. **B** = practitioner or vendor source (named). **C** = single secondary source.
- Meta's developer docs pages carry no publication date; they are listed as "undated, fetched 2026-10-10". Meta Business Help Centre (facebook.com/business/help) pages could not be rendered by the fetch tool, so anything that only lives there is marked **UNVERIFIED (primary)** and backed by named secondary sources.
- Anything older than 2024 is flagged STALE-RISK. Quotes are avoided on purpose; everything is paraphrased.
- Existing work read first: `landing/shared/pixel.js`, `pixel.README.md`, `automation/capi/capi.js`, `automation/capi/event-spec.md`, `landing/config/consent.json`, `landing/build.mjs`, `landing/template/{index.html,page.js}`, `landing/holding/privacy.{html,js}`, `docs/MASTER-PROMPT.md` 4.4/4.4a, `deliverables/verified-facts.md`, `deliverables/search-findability-lead/SUMMARY.md`. Not duplicated here.

## Top actions (ranked)

1. Split the ad-measurement consent into its own optional, unticked checkbox. Today it is a sentence inside the single required tick, so `consent_ads_at` is set for every web lead and the CAPI consent gate filters nobody (F1).
2. Decide Pixel-on-load vs opt-in with the Regulator's own words in front of the practitioner: the Information Regulator's Dec 2024 direct-marketing guidance lists "use of cookies" as a section 69 electronic-marketing method (F2).
3. Store the opt-out in a cookie scoped to `.sortmycover.co.za`, not localStorage; localStorage will not follow a visitor from `sortmycover.co.za/privacy` to a campaign subdomain (F3).
4. Change the CTWA/business-messaging events to the names Meta lists (`LeadSubmitted`, `QualifiedLead`); `Lead` and `Schedule` are not on the list (F4).
5. Plan for Meta's financial-services data restrictions: check "Manage data source categories" right after the dataset exists, register the custom events, keep sensitive-sounding values out of anything sent to Meta (F5).
6. Drop "event priority" from the launch checklist; it has not been required since May 2023 (F6).

## Findings

### F1. The "separate optional" ad-measurement consent is neither separate nor optional in the built code (impact: high)

- `landing/config/consent.json` holds the ads sentence as a separate key (`ads`), but `landing/build.mjs` L75-79 concatenates it into the same `consent_html`/`consent_text` as the FSP-sharing consent.
- `landing/template/index.html` L126 renders one checkbox, `required`, whose label contains both. `page.js` L194-197 blocks submit unless it is ticked.
- `automation/lib/w01.mjs` L111-113 and L367 derive `consent_ads_at` by detecting the ads sentence inside the stored consent text (`adsSentence()`), so any web submission gets `consent_ads_at` set. `event-spec.md` "Consent gate" (CAPI/offline/audience sends only when `consent_ads_at IS NOT NULL`) therefore never excludes a web lead.
- POPIA defines consent as a voluntary, specific and informed expression of will; the Regulator's Dec 2024 guidance repeats it, and para 7.2.4 says the consent form must name the goods/services marketed and the contact method so consent can be specific. Making an unrelated advertising purpose a condition of getting an adviser call is hard to call voluntary or specific.
- Fix (small): second checkbox `name="consent_ads"`, unticked, not required, label = `consent.json.ads` text; page posts `consent.ads=true|false`; w01 sets `consent_ads_at` only from that flag; bump `consent_version` to a new `+CONSENT-ADS-v2`. Keep the FSP-sharing tick required.
- Evidence: A (regulator PDF) for the definition and para 7.2.4; the code facts are from this repo.
- Sources: Information Regulator, Guidance Note on Direct Marketing, 3 Dec 2024 (PDF linked from inforegulator.org.za/guidance-notes/).

### F2. POPIA has no cookie section, but the Regulator's published view puts cookies inside section 69; Meta only demands notice (not consent) for South Africa (impact: high)

- Guidance Note para 7.1 lists methods of "unsolicited electronic communication" under section 69 and includes item (h) "use of cookies" (footnote cites the UK ICO PECR guide and the EU WP171 opinion on online behavioural advertising). Para 7.2 then says a non-customer must be approached for consent first, using Form 4 or a substantially similar form; the responsible party carries the onus of proving consent (s11(2)(a)).
- Para 11 says the note is advisory and POPIA prevails in any inconsistency. So: not a statute, but it is the enforcer's stated reading, issued 3 Dec 2024.
- DLA Piper Africa (25 Jun 2025) notes the guidance mentions cookies only briefly and gives no cookie-specific rules. Several cookie-banner vendors overstate this (claim the Regulator "confirmed" consent for all analytics cookies); I did not rely on them.
- Meta side: the Business Tools Terms (effective 3 Nov 2025 per the fetched page) require robust, sufficiently prominent notice everywhere and require the business to ensure consent only for the EU (extended to UK/Switzerland). South Africa is not mentioned. Meta's `fbq('consent','revoke'/'grant')` mechanism is documented under its GDPR page; usable here anyway.
- Current draft (`privacy.html` ~L106-107): Pixel on at page load, no pop-up, opt-out control, practitioner question Q9 still open. Reading the guidance, "measurement only, under notice" is arguable; **retargeting pools built from the Pixel (4.4a Phase 2: quiz abandoners 14 d, page visitors 30 d) are the weakest part**, because that is advertising to people who never opted in.
- Internal contradiction to resolve: `MASTER-PROMPT.md` L512 lists "retargeting form-abandoners (no consent)" under *deliberately not copied*, while L540, L555 and L562 schedule exactly that for Phase 2.
- Safest design (for practitioner sign-off, not legal advice): Pixel loads only after a one-tap "Allow ad measurement / No thanks" strip (or the optional tick from F1); CAPI only for leads who ticked; Phase 2 retargeting pool = opted-in visitors only. Cost: smaller PageView/ViewContent audiences; Lead/Schedule still arrive through CAPI for ticked leads.
- UNVERIFIED: whether the Regulator would treat conversion-only measurement (no retargeting) as "direct marketing" at all. Put the para 7.1(h) citation in front of the practitioner for Q9.
- Evidence: A (regulator PDF, Meta terms) / B (DLA Piper).
- Sources: Guidance Note 3 Dec 2024; DLA Piper Africa 25 Jun 2025; Meta Business Tools Terms (effective 3 Nov 2025).

### F3. The opt-out lives in per-origin localStorage, so it will not follow visitors across campaign subdomains (impact: high)

- `pixel.js` L16-19 reads the choice from `localStorage`/`sessionStorage` key `smc_ads_off` (`consent()` at L19); `landing/holding/privacy.js` L2-7 writes the same key. Web Storage objects are separate for each origin, and `bond.sortmycover.co.za`, `baby.sortmycover.co.za` and `sortmycover.co.za` are three origins.
- Today it works only because quiz pages are served from the apex path (`/new-bond/` etc.). Moving campaigns to subdomains breaks it silently: a visitor who turns ad measurement off on `/privacy#opt-out` still gets the Pixel on every campaign subdomain.
- Fix: write a first-party cookie `smc_ads_off=1; Domain=.sortmycover.co.za; Path=/; Max-Age=31536000; SameSite=Lax; Secure` (keep localStorage as fallback), read the cookie first in `consent()`, and add the cookie to the privacy cookie table. `co.za` is on the Public Suffix List (list version 2026-10-07), so `Domain=.sortmycover.co.za` is the correct widest scope; `Domain=.co.za` would be rejected.
- Evidence: A (MDN on per-origin storage; PSL file read this session) plus the repo code.
- Sources: MDN Web Storage API guide (undated); publicsuffix.org public_suffix_list.dat, version 2026-10-07.

### F4. Business-messaging CAPI (click-to-WhatsApp) does not list `Lead` or `Schedule`; use `LeadSubmitted` and `QualifiedLead` (impact: high)

- Meta's business-messaging CAPI page lists the supported event names as: Purchase, LeadSubmitted, InitiateCheckout, AddToCart, ViewContent, OrderCreated, OrderShipped, OrderDelivered, OrderCanceled, OrderReturned, CartAbandoned, QualifiedLead, RatingProvided, ReviewProvided.
- Required shape: `action_source=business_messaging`, `messaging_channel=whatsapp`, `user_data.whatsapp_business_account_id`, `user_data.ctwa_clid` (from the `referral` object on the first inbound message of a click-to-WhatsApp conversation; do not hash). One dataset per WhatsApp Business Account, created with `POST /{WABA_ID}/dataset`.
- Repo impact: `capi.js` L130 sends `eventName: 'Lead'` for CTWA, and `event-spec.md` rows "business-messaging Lead / Schedule" are marked ASSUMPTION. Map CTWA lead-in-chat to `LeadSubmitted`, and our "qualified on WhatsApp" stage to `QualifiedLead`. There is no listed equivalent for a booked slot; keep booking as an internal/CRM signal for the CTWA arm. Whether `RatingProvided` could carry the broker quality score is UNVERIFIED and probably not its intent (it is a customer-rating event).
- STALE-RISK: the page's own examples use Graph v16.0 and mention On-Premises API support ending 23 Oct 2025, so it predates 2024 in parts; the list may have grown. Confirm in Test Events with a throwaway conversation before building W03/W05 on it.
- Evidence: A (Meta developer docs, two URLs, same list).
- Sources: developers.facebook.com/docs/marketing-api/conversions-api/business-messaging and developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging (undated, fetched 2026-10-10).

### F5. Meta restricts financial/health-status data; for an insurance-adjacent site expect "core setup" restrictions and a custom-event registration step (impact: high)

- Terms: the Business Tools Terms (effective 3 Nov 2025 per fetched page) bar sending data that includes or is based on health or financial information or other sensitive categories. The advertiser carries the responsibility.
- Sept 2025 change: Meta's notice (relayed in a LiveRamp customer announcement dated 17 Jul 2025) says that from 2 Sep 2025 custom audiences and custom conversions whose definitions contain prohibited attributes (health conditions, financial-status terms such as "credit score" or "high income") are blocked from new campaigns and stop receiving users/conversions. Not confirmed whether CAPI payloads themselves are screened.
- Data-source categories: Events Manager > dataset > Settings > "Manage data source categories". Practitioner sources (Twigeo 8 Apr 2025; Ours Privacy, published 5 Oct 2026 with content dated 25 Mar 2026) say financial-services sources get "core setup" restrictions: custom parameters and URL data after the domain are stripped, custom events must be registered/confirmed or are blocked, and the flag is described as permanent until an appeal succeeds. Standard events such as Lead/ViewContent keep working. Meta's own Help Centre article is **UNVERIFIED (primary)**.
- What to do: (1) the day the dataset exists, look at the category panel and request review if wrongly tagged; (2) register `Qualified`, `Attended`, `GoodFit` as custom events in Events Manager or expect them to be dropped; (3) never send the budget band, age band or "qualified because budget >= R750" as a parameter; (4) name audiences/custom conversions neutrally (for example "Seg-A"), never with income/credit words; (5) do not depend on `content_name`, URL path or UTM reaching Meta for angle reporting - keep angle attribution in our own tables (the `utm` and `context` fields already do this); (6) slugs like `new-bond` and `self-employed` appear in the page URL Meta receives; whether Meta treats a bond as financial status is UNVERIFIED, so prefer neutral codes in anything we choose (`content_name`, event custom_data).
- Evidence: A (Business Tools Terms) / B (LiveRamp relay of Meta notice; Twigeo; Ours Privacy).
- Sources: facebook.com/legal/technology_terms; docs.liveramp.com announcement 17 Jul 2025; twigeo.com 8 Apr 2025; oursprivacy.com core-setup article 5 Oct 2026.

### F6. "Event priority on a verified domain" is a stale launch step; AEM prioritisation went away in May 2023 (impact: medium)

- Meta announced on 15 May 2023 that advertisers no longer have to configure and rank eight web conversion events, no longer need domain verification for event configuration, and that the AEM tab would be removed; value-set activation also ended. 2026 setup guides repeat the same state.
- `event-spec.md` ("Aggregated Event Measurement priority", Phase 1 checklist) and `MASTER-PROMPT.md` L562 still tell meta-operator to set `Lead > Schedule > Contact` priority. Remove it; it is not a gate and the setting no longer exists in the same form.
- Keep domain verification anyway, for different reasons: it governs who can edit link previews on ads pointing at the domain, and Meta's server-event doc says `event_source_url` should match the verified domain. Verify the root `sortmycover.co.za` once (DNS TXT at Hostinger covers the whole domain; the meta-tag route only covers the page it sits on). Secondary sources say verifying the root covers subdomains and that subdomains cannot be verified separately except for Commerce; Meta's Help Centre page is **UNVERIFIED (primary)**.
- STALE-RISK: the dated evidence is from 2023; no Meta source seen this session reverses it.
- Evidence: B (Jon Loomer 16 May 2023; Adviso 4 Jul 2023) plus A for the `event_source_url` rule.
- Sources: jonloomer.com/meta-announces-big-changes-to-website-conversion-campaigns/ (16 May 2023); adviso.ca/en/blog/evolution-aggregated-measurement-meta (4 Jul 2023); developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event (undated).

### F7. Cookie scope: `pixel.js` writes `_fbc` host-only; Meta's pixel writes at the registrable domain; Safari shortens JS-set cookies (impact: medium)

- `pixel.js` L55 sets `_fbc` with no `Domain` attribute. On a campaign subdomain this creates a host-only cookie while `fbevents.js` (once loaded) writes its own `_fbc`/`_fbp` at the registrable domain, giving two same-name cookies; `cookie()` returns the first match. A 7 Sep 2026 GitHub issue on a Meta CAPI bundle describes exactly this two-`_fbp` effect and says Meta's pixel writes at the registrable domain (practitioner evidence; Meta's cookie doc does not state the scope).
- Fix: do not write `_fbc` yourself when `fbevents.js` is loaded; when you must build it (pixel off, or CAPI-only path), use `Domain=.sortmycover.co.za`, `Path=/`, `Secure`, 90 days, value `fb.1.<ms>.<fbclid>` with the fbclid untouched (Meta says the click ID is case sensitive; do not alter it). Meta's doc says to use subdomain index 1 when generating the value server-side, which resolves the `event-spec.md` ASSUMPTION about `fb.1`.
- `context()` runs synchronously inside the first `track('PageView')`, before the async `fbevents.js` has set `_fbp`, so `fbp` is null on that first event (harmless, PageView is not sent through CAPI, but `Lead`/`Schedule` later in the session read it fine).
- Safari/WebKit: cookies and other script-writable storage created in JavaScript are deleted after 7 days without user interaction, and cookies created in JavaScript after arriving through link decoration (query parameters such as `fbclid`) are capped at 24 hours. The lead record already stores `fbp`/`fbc` at form submit, which is the right place; later events must read from the lead row, not the cookie. Optional hardening: set `_fbp`/`_fbc` in an HTTP `Set-Cookie` from a Vercel edge function (WebKit's page caps only third-party CNAME-cloaked server cookies, not plain first-party ones); only worth doing if iOS Safari share of paid traffic is material.
- Same Pixel ID on every subdomain is fine; one browser ID follows the visitor if the cookie sits on the registrable domain.
- Evidence: A (Meta fbp/fbc doc; WebKit page) / B (GitHub issue 7 Sep 2026).
- Sources: developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc (undated); webkit.org/tracking-prevention/ (undated); github.com/Setono/MetaConversionsApiBundle/issues/29 (7 Sep 2026).

### F8. Dedupe keeps the first event received; server-side `ph`/`fn` may not rescue the PII-free browser event, and EMQ is web-only (impact: medium)

- Meta's dedupe rule: browser `eventID` = server `event_id` and same event name, within 48 hours; Meta generally prefers the event it received first. The fallback `fbp`/`external_id` method only dedupes browser-then-server. Meta's page does not describe merging the two payloads' user data. (A practitioner source says the 48 hours run from receipt, not `event_time`.)
- Our design: browser `Lead` (autoConfig off, no advanced matching, no PII) fires on submit and normally lands first; the CAPI `Lead` with `ph`, `fn`, `external_id`, IP, UA lands second and may be discarded as the duplicate. Whether Events Manager still scores/uses its extra parameters is **UNVERIFIED**. Test it (see "Test Events plan").
- Fallbacks if the test shows no benefit: (a) keep the browser `Lead` and accept an EMQ driven by `fbp`/`fbc`/IP/UA; (b) send `Lead` server-side only for ticked leads and keep the browser Pixel for `ViewContent`/`Contact`; (c) manual Advanced Matching on the Pixel (the Pixel hashes with SHA-256 itself) for opted-in visitors, which needs practitioner sign-off against the "no PII in the browser" rule.
- EMQ: Meta's best-practices doc says the score is out of 10 and available only for web events, so the >= 6 target in `event-spec.md` can only be read on web `Lead`/`Schedule`; CTWA (business_messaging) and CRM (system_generated) events get no EMQ. The labels Great >= 8, Good 6 to 7.9, OK 4 to 5.9, Poor < 4 come from secondary sources only (**UNVERIFIED (primary)**). Meta's doc lists email, IP, name and phone as the strongest inputs; we send no email by design, so treat 6 as a measured result, not a promise (already stated in the spec).
- Hashing rules in `capi.js` match Meta's table: `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country` hashed (SHA-256, lowercase/trim, phone digits with country code and no leading zero, country 2-letter lowercase); `external_id` hashing recommended not required; `client_ip_address`, `client_user_agent`, `fbp`, `fbc`, `ctwa_clid`, `lead_id` never hashed. `client_user_agent`, `action_source` and `event_source_url` are required on website events.
- Evidence: A (dedupe, parameters, best-practices docs) / B (receipt-time claim, EMQ labels).
- Sources: developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events; .../best-practices; .../parameters/customer-information-parameters (all undated, fetched 2026-10-10); developers.facebook.com/docs/meta-pixel/advanced/advanced-matching (undated); usercentrics.com/knowledge-hub/improve-meta-event-match-quality-score/ (undated).

### F9. Server events older than 7 days make the whole request fail, and `capi.js` has no age guard (impact: medium)

- Meta's server-event doc: `event_time` may be up to 7 days before you send; older events cause the entire request to fail. A request carries up to 1,000 events, and Meta asks for events to be sent promptly (ideally within an hour).
- Risk points: W12/W29 daily batches for `Attended` and `GoodFit` where the broker records the outcome late; any batch that includes one stale row loses all rows. `capi.js` `buildEvent` uses `o.eventTime || now` and never checks age.
- Fix in the n8n step before `sendOffline`: set `event_time` to when the stage actually happened, drop and log (`capi_log.status='expired'`) anything older than about 6.5 days, send in batches of at most 1,000, and alert on expired counts. The legacy Offline Conversions API was retired in May 2025 (practitioner sources), so the dataset `/events` route already chosen is the correct one.
- Evidence: A (server-event doc) / B (retirement date).
- Sources: developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event (undated); .../using-the-api (undated); newsletter.aimerce.ai "Meta Offline Conversions API is going away" (2025).

### F10. Conversion Leads needs Instant Form leads (and >= 200 leads a month); website-quiz leads cannot use it (impact: medium)

- Meta's CRM-integration doc requires leads from Facebook/Instagram Lead Ads (Instant Forms), at least 200 leads a month, a lead-to-stage conversion rate between 1% and 40%, uploads at least daily, and the stage occurring within 28 days of lead creation. Lead ID is recommended but other identifiers (click ID, phone, email) are accepted when absent; the programme is still scoped to Lead Ads.
- Effect on the plan: `MASTER-PROMPT.md` 4.4a promises "ready for Conversion Leads" from `Qualified`/`Attended`; that only applies to Campaign A (Instant Form). For Campaign B (quiz on the site) those stages are ordinary custom CAPI events (`action_source=system_generated`, `custom_data.event_source=crm`, `lead_event_source`) that can feed reporting and lookalike seeds, or be chosen as the conversion event of a website campaign if volume allows (the usual guidance is about 50 optimisation events per ad set per week; that figure is from secondary sources, **UNVERIFIED (primary)**).
- At the planned R7,000 to R9,000 a month, optimise Campaign B on `Lead` and use downstream events for measurement and seeds. Store `lead_id` (Meta leadgen id) from W02 on instant-form leads so Campaign A can qualify later.
- Also: standard `Lead` accepts optional `value`/`currency`; `Schedule` and `Contact` take no required parameters. Meta's custom-data doc says `value` must be a monetary amount where value optimisation is used; the spec's plan to send a 1-5 broker quality score as `value` with currency ZAR would be read as rand. Use a custom parameter (`quality_score`) or a real rand figure.
- Evidence: A (CRM integration doc, pixel reference, custom-data doc as summarised) / B (50-event figure).
- Sources: developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration (undated); developers.facebook.com/docs/meta-pixel/reference (undated); developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data (undated).

### F11. No Special Ad Category applies to South Africa targeting; Meta's financial/insurance ad policy does not name South Africa (impact: medium)

- Marketing API docs: the `FINANCIAL_PRODUCTS_SERVICES` special ad category became required on 14 Jan 2025 for advertisers based in the US or showing ads to US audiences (it replaced `CREDIT`); the page names no other country and does not mention insurance or South Africa. Where it applies, age is fixed to 18 to 65+, gender to all, ZIP and lookalikes are unavailable, so the 35 to 50 age band and lookalike plan would be impossible there; they remain available for South Africa on this evidence.
- Meta's "Financial and Insurance Products and Services" ad policy (page shows updated 30 Apr 2026): covers insurance, credit, mortgages, investment products; audience must be 18+; ads must follow local law and carry legally required disclosures; Meta may require business or individual verification and regulator authorisation in some countries; ads must not directly request personal or certain financial information. South Africa, the FSCA and FSP numbers are not named on the page. A secondary claim that financial-advertiser verification covers 38 countries gives no list and no South African entry.
- UNVERIFIED: whether Meta will ask for FSCA/FSP authorisation for a South African insurance-lead advertiser. Lead Velocity is not an FSP (broker-neutral lead gen), so have the partner brokers' FSP numbers and the "how we make money" page ready before the first review request, and keep creative from asking for a phone number or budget inside the ad itself.
- Evidence: A (Marketing API doc, Meta policy page).
- Sources: developers.facebook.com/docs/marketing-api/audiences/special-ad-category/ (undated, requirement start 14 Jan 2025); transparency.meta.com/policies/ad-standards/restricted-goods-services/financial-services/ (updated 30 Apr 2026).

### F12. Events sent with a test code are not discarded; they feed targeting and measurement (impact: medium)

- Meta's "using the API" doc says events carrying `test_event_code` appear in Test Events but are not dropped: they flow into Events Manager and are used for targeting and ads measurement. The code must be removed from production payloads.
- Effect: QA runs with fake leads (including `Lead`, `Qualified`, `Attended`) can seed audiences and lookalikes. The `event-spec.md` checklist says to check with `META_TEST_EVENT_CODE` and then remove it, but does not mention this. Do QA on a separate throwaway dataset/Pixel ID, or use obviously flagged leads and exclude them; never run `Attended` test rows against the production dataset.
- Housekeeping: `capi.js` defaults to Graph `v23.0` (released 29 May 2025; sunset 8 Oct 2027 per the changelog). Current is v26.0 (29 Jul 2026), v25.0 (18 Feb 2026), v24.0 (8 Oct 2025). Set `META_API_VERSION=v25.0` or later after a clean Test Events run.
- Evidence: A (using-the-api doc, Graph changelog).
- Sources: developers.facebook.com/docs/marketing-api/conversions-api/using-the-api (undated); developers.facebook.com/docs/graph-api/changelog/ (v26.0 29 Jul 2026).

## Recommended event set and parameters (for landing-page-builder / automation-engineer)

| Event | Source | Parameters to send | Notes |
|---|---|---|---|
| `PageView` | Browser, only if ad-measurement allowed | none | Not sent through CAPI (as spec). |
| `ViewContent` | Browser, once at quiz start | `content_name: 'quiz_start'` | Retarget pool only from opted-in visitors (F2). May lose custom params under core setup (F5). |
| `Lead` | Browser + CAPI (website) | CAPI: `ph`, `fn`, `external_id`, `fbp`, `fbc`, IP, UA, `country`, `event_source_url` | Same `event_id` both sides; fire browser event only after successful `/lead` (see "Other observations"). No `value` until a real rand value exists. |
| `Schedule` | Browser + CAPI (website); CAPI `system_generated` for chat/Flow bookings | same user_data as Lead | Do not reuse Lead's `event_id`. |
| `Contact` | Browser, CTWA button click | none | Browser only. |
| `LeadSubmitted` | CAPI business_messaging | `ctwa_clid`, `whatsapp_business_account_id` | Replaces CTWA `Lead` (F4). |
| `QualifiedLead` | CAPI business_messaging | same | Replaces CTWA qualified stage (F4). |
| `Qualified`, `Attended`, `GoodFit` | CAPI `system_generated`, website dataset, `custom_data.event_source='crm'`, `lead_event_source='SortMyCover'` | `ph`, `fn`, `external_id`, `fbc` if known; quality score as `custom_data.quality_score` | Register as custom events (F5); `event_time` within 7 days (F9); only for ad-measurement-consented leads (F1). |

CompleteRegistration is not needed: `Lead` already marks the form step.

## Consent and cookie design for subdomains (summary)

- One Pixel ID and one dataset for all subdomains. `fbp`/`fbc` on `.sortmycover.co.za` (Meta's own script does this; `pixel.js` must stop shadowing it).
- Three first-party items, all on `.sortmycover.co.za`: `smc_ads_off` (or an `smc_ads` choice cookie, tri-state allow/refuse/unset), `_fbp`, `_fbc`. Tell visitors in the cookie table.
- Quiz form: required tick for adviser sharing and contact (Form-4-style: names the services and WhatsApp/phone), plus a separate unticked optional tick for ad measurement. Store `consent_text_version`, timestamp and page URL for both.
- Server: every CAPI send, offline event and hashed audience upload gated on the optional tick only.
- Opt-out link on every subdomain footer pointing to `https://sortmycover.co.za/privacy#opt-out`; the cookie makes it work everywhere.
- Meta's mechanism if you prefer to keep the script loaded: call `fbq('consent','revoke')` before `init` on every page and `fbq('consent','grant')` after opt-in. The current approach (do not load `fbevents.js` until allowed) is equally valid and leaves no Meta request before consent.

## Test Events plan

1. Create the dataset; open Events Manager > Test events. Note the code; set `META_TEST_EVENT_CODE` only in the QA environment (F12).
2. Browser: open a campaign subdomain from the Test events tool; confirm `ViewContent`, `Lead`, `Schedule`, `Contact` and that no `SubscribedButtonClick` or `Microdata` events appear (these confirm `autoConfig=false`, which practitioner docs say suppresses them; Meta's own pixel pages did not describe it). Confirm the Automatic Advanced Matching toggle is off in dataset settings.
3. Server: send `Lead` with the same `event_id` as the browser event; confirm the Deduplicated label and which parameters Events Manager lists (answers F8). Repeat for `Schedule`.
4. CTWA: one throwaway click-to-WhatsApp conversation; send `LeadSubmitted` and `QualifiedLead` to the WABA dataset (F4).
5. Cookie checks on two origins: confirm one `_fbp` and one `_fbc` visible, both with Domain `.sortmycover.co.za`; toggle opt-out on the apex and reload a campaign subdomain: Pixel must not load (F3).
6. Look at "Manage data source categories" and the EMQ panel after 24 to 48 hours (F5, F8).
7. Delete or ignore QA data; remove the test code; bump `META_API_VERSION`.

## Other observations (not in the top 12)

- `landing/template/page.js` L313 calls `track('Schedule')` when the Book button is pressed, before `/book` succeeds, while `pixel.README.md` says to use `prepare` then `fire` on success. A 409 slot collision or error leaves a phantom browser `Schedule` with no server twin. Same pattern for `Lead` at L202 (fires before `/lead` returns). Use `smc.prepare()` then `smc.fire()` on success for both. Owner: landing-page-builder.
- `pixel.js` already sets `autoConfig=false` before `init`; practitioner docs say this stops `SubscribedButtonClick` and `Microdata` events. Meta's pixel reference page did not describe the setting, so keep the Test Events check in step 2.
- `page_url` in context is origin plus path only, good. Note the standard Pixel itself still sends the full URL (with query string) to Meta on every event; keep answers and PII out of query strings.
- POPIA section 72: a transfer of personal information to a recipient in another country needs one of the listed grounds (adequate law or binding agreement, data subject consent, contract necessity, benefit with consent impracticable). The privacy notice lists Meta in the United States and Ireland. Meta's Business Tools Terms describe Meta as processor for hashed contact information used for matching, and as having a controller-like role for event data used for ad delivery (stated in GDPR terms). How that maps to POPIA responsible party/operator (sections 20 to 21) and section 72 is a legal question for the practitioner. UNVERIFIED.
- Guidance Note para 7.3 says funeral cover is not a "similar product" for the existing-customer exemption (section 69(3)), so a lead who asked about life cover cannot later be marketed funeral cover on the customer exemption; consent text already widened to "insurance and financial planning" (v3), which fits. Para 10.1 treats lead-sharing with other responsible parties as further processing needing section 15 and 18 compliance, which the named-broker consent line covers.
- The Meta Business Tools Terms effective date (3 Nov 2025) and the Graph changelog dates come from page content as summarised by the fetch tool; re-read the pages at GATE-PIXEL before relying on exact dates.

## Gaps and UNVERIFIED list

1. Meta Business Help Centre pages (domain verification, AEM, EMQ labels, data-source categories, cookie settings) did not render; every claim sourced only from there is secondary.
2. Whether Meta merges or discards the second event's user data on a dedupe match (F8).
3. Whether Meta screens CAPI payload values against the Sept 2025 health/financial attribute rules, or only audience/conversion definitions (F5).
4. Whether Meta applies financial-services "core setup" to this dataset (depends on its categorisation after launch).
5. Whether Meta requires FSCA/FSP authorisation for South African insurance-lead ads (F11).
6. Whether the Regulator treats conversion measurement without retargeting as direct marketing (F2); no enforcement action on pixels found.
7. Whether `RatingProvided` or another business-messaging event can carry a broker quality score (F4).
8. Whether current business-messaging event names have grown since the page's v16-era content (F4).
9. Share of paid traffic on iOS Safari for South Africa (affects F7 hardening); not researched.

## Source list (all fetched 2026-10-10 unless stated)

- Information Regulator, Guidance Note on Direct Marketing, 3 Dec 2024: https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf (listing: https://inforegulator.org.za/guidance-notes/)
- DLA Piper Africa, 25 Jun 2025: https://www.dlapiperafrica.com/en/south-africa/insights/2025/Data-Protection-Guidance-Note-on-Direct-Marketing
- POPIA s69 and s72 text: https://popia.co.za/section-69-direct-marketing-by-means-of-unsolicited-electronic-communications/ and https://popia.co.za/section-72-transfers-of-personal-information-outside-republic/ (undated)
- Meta Business Tools Terms (effective 3 Nov 2025): https://www.facebook.com/legal/technology_terms
- Meta Pixel consent API: https://developers.facebook.com/docs/meta-pixel/implementation/gdpr (undated)
- Meta CAPI docs (all undated): fbp-and-fbc, deduplicate-pixel-and-server-events, parameters/customer-information-parameters, parameters/server-event, parameters/custom-data, best-practices, using-the-api, business-messaging, conversion-leads-integration under https://developers.facebook.com/docs/marketing-api/conversions-api/ (and /documentation/ads-commerce/conversions-api/)
- Meta Pixel reference and advanced matching (undated): https://developers.facebook.com/docs/meta-pixel/reference ; https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
- Meta special ad categories (undated; requirement start 14 Jan 2025): https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/
- Meta ad policy, Financial and Insurance Products and Services (updated 30 Apr 2026): https://transparency.meta.com/policies/ad-standards/restricted-goods-services/financial-services/
- Graph API changelog (v26.0, 29 Jul 2026): https://developers.facebook.com/docs/graph-api/changelog/
- AEM change: https://www.jonloomer.com/meta-announces-big-changes-to-website-conversion-campaigns/ (16 May 2023); https://www.adviso.ca/en/blog/evolution-aggregated-measurement-meta (4 Jul 2023)
- Data restrictions: https://docs.liveramp.com/connect/en/announcement--upcoming-meta-restrictions-on-certain-custom-audiences-and-custom-conversions--7-17-25-.html (17 Jul 2025); https://www.twigeo.com/2025/04/08/unpacking-metas-data-restrictions-the-latest-insights-part-two/ (8 Apr 2025); https://oursprivacy.com/blog/meta-platform-restrictions-explained-core-setup (5 Oct 2026)
- Cookie scope: https://github.com/Setono/MetaConversionsApiBundle/issues/29 (7 Sep 2026); https://webkit.org/tracking-prevention/ (undated); https://publicsuffix.org/list/public_suffix_list.dat (version 2026-10-07); https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API (undated)
- EMQ labels (secondary): https://usercentrics.com/knowledge-hub/improve-meta-event-match-quality-score/ (undated)
