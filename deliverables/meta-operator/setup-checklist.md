# SortMyCover: Meta setup runbook (laptop, gate by gate)

Owner: meta-operator (Ads Platform Administrator). Date: 2026-10-02. Status: **ready to run. Nothing has been clicked, created, bought or published.** This sandbox has no browser and no Meta login.
Readers: Jonathan (logged in, does every ★ himself), the Claude in Chrome agent (prepares the screens, reads them back, records), KG (second admin).
Sources used: MASTER-PROMPT 2.1.3, 2.1.4, 2.2, 4.4a, 4.4b, 4.6, 4.7, 4.14, 6.2, 6.8b, Section 7; `build/gates-batch.md`; `deliverables/media-buyer/campaign-spec.md` (CS); `deliverables/brand-naming-lead/disclosure-wording.md` (DW); `brand/exports/`; `landing/holding/deploy.md`; `automation/templates/`; `automation/flows/booking-flow-endpoint.md`; `automation/ads/CONSOLE-ADS-API.md`; `automation/security/SECURITY.md`; migration `supabase/migrations/20261002_smc_02_core.sql` (`brands` columns).
Companion files: `appeal-playbook.md` (when Meta says no), `template-submission-runbook.md` (GATE-TEMPLATES, GATE-FLOW-PUBLISH), `first-principles.md`. Open questions are in §14 (NH-MO-xx).

---

## 0. Rules for this session (read once, apply on every screen)

1. **Order is the safety mechanism** (Meta Business Help Center): portfolio, then verification, then assets (Page, IG, ad accounts, WABA, dataset), then permissions (system user, app, tokens). Do not skip ahead. A missing earlier step is the usual cause of the restrictions that kill new accounts.
2. **★ = only Jonathan clicks.** The Chrome agent fills fields, reads the screen back aloud, and stops with the cursor on the button. ★ applies to: anything that creates an account-level object in Meta, any payment or billing screen, any budget field, any "Publish", any template "Submit", any Flow "Publish", accepting any Meta terms (Lead Ads terms, Custom Audience terms, WhatsApp terms), Business Verification submission, and 2FA or security settings.
3. **Never** done by the agent: typing card or bank details; typing or reading out a token, PIN, password or 2FA code; buying anything; aged or bought accounts; "warming" scripts; cloaking; any workaround of a Meta review.
4. **Read every screen; never guess.** If a label, option or limit on the screen differs from this runbook, stop, screenshot, write a line in §13 "Screen differs" and continue with independent steps. Do not research around it.
5. **RECORD** = (a) type the ID into the CRM console `brands` row for `code = 'SMC'` (Settings, Brands, SortMyCover), and (b) save a screenshot to `/deliverables/meta-operator/screens/` named `G{gate}-{nn}-{slug}.png`. IDs never go into chat, WhatsApp or commit messages.
6. **Secrets go only into the local `.env`** on Jonathan's laptop, typed by Jonathan. The `brands` row stores the **name** of the secret (for example `META_SYSTEM_USER_TOKEN`), never the value (the table has a CHECK that rejects values starting `EAA`).
7. **Screenshots must not show:** tokens, app secret, 2FA codes, PINs, card numbers, ID numbers, personal phone numbers. Close or crop those screens before capture.
8. **Consumer surfaces show only `sortmycover.co.za`.** Never enter `sortmycover.leadvelocity.co.za` (staging) or any `leadvelocity.co.za` URL on the Page, IG, WhatsApp profile, Pixel, ads or forms (0.1). The portfolio itself is Lead Velocity (Pty) Ltd and uses leadvelocity.co.za, because that is the legal entity.

### 0.1 Dependency map (what can start now)

| Gate | Needs first | Can start today? |
|---|---|---|
| G1 GATE-META-PORTFOLIO | nothing | Yes |
| G2 GATE-META-PAGE-IG | G1 | Yes. Website and email fields wait for GATE-DOMAINS (G2a steps 6 and 7, NH-MO-02) |
| G3 GATE-AD-ACCOUNT | G1 | Yes |
| G4 GATE-WABA | G1; two phone numbers not on WhatsApp (NH-MO-03) | Yes for the test number; real numbers when supplied |
| G5 GATE-PIXEL | G1, G3; domain verification also needs GATE-DOMAINS live | Dataset yes; domain verification after GATE-DOMAINS |
| G6 App, system user, tokens, webhooks | G1 to G5 | Yes, once G2 to G5 exist |
| G7 Day-0 audiences | G2, G3, G5 | Yes, as soon as the assets are linked |
| G8 Page warm-up | G2, G3, payment method; money decision NH-MO-01 | Organic posts yes; paid part waits |
| G9 Handle reservations | nothing | Yes |
| G10 GATE-TEMPLATES | G4, samples (present) | Yes, see `template-submission-runbook.md` |
| G11 GATE-ADS-APPROVE-3 / GATE-CAMPAIGN-PUBLISH | G2 to G7; Mark's FSP verified (named-consent form fails closed without it, CS 3.5); creative manifest (NH-MO-10) | No, after broker onboarding data and creative exist |
| G12 GATE-FLOW-PUBLISH | W28 endpoint live on a stable hostname | See `template-submission-runbook.md` §6 |

---

## G1. GATE-META-PORTFOLIO: Business Portfolio, admins, 2FA, Business Verification ★

**Where:** business.facebook.com, logged in as Jonathan's personal Facebook profile (real, long-standing, with 2FA already on).

| # | Screen | Action | Who |
|---|---|---|---|
| 1 | business.facebook.com/overview | If a "Lead Velocity" portfolio already exists, **use it; do not create a second one**. Read Settings, Business info. If none exists: Create a business portfolio. | ★ Jonathan clicks Create |
| 2 | Create portfolio | Business portfolio name: `Lead Velocity (Pty) Ltd`. Your name: Jonathan's legal name (NH-20). Business email: `howzit@leadvelocity.co.za`. | Agent fills, ★ Jonathan submits |
| 3 | Settings, Business info | Legal business name: `Lead Velocity (Pty) Ltd` exactly as on the CIPC certificate. Address: the CIPC registered address (NH-20). Phone: Lead Velocity's business number. Website: `https://leadvelocity.co.za`. Every one of these must match the documents in step 7 letter for letter. | Agent fills, ★ Jonathan saves |
| 4 | Settings, Users, People | Invite KG (her own personal profile) with **full control** (admin). Jonathan is admin. No other people. | ★ Jonathan sends invite; KG accepts on her phone |
| 5 | Settings, Security Center | Two-factor authentication: **Required for everyone**. Confirm both admins show 2FA on. | ★ Jonathan |
| 6 | Security Center | Confirm 2 admins listed (the Help Center recommends at least two so one lockout does not lose the portfolio). | RECORD `G1-01-security-center.png` |
| 7 | Security Center, Business verification, Start verification | Country South Africa. Legal name, address, phone, website as step 3. Upload documents (list below). Contact verification: domain verification of `leadvelocity.co.za` if offered (it also proves the website), else email to `howzit@leadvelocity.co.za`. | ★ Jonathan uploads and submits; agent never handles the files |
| 8 | Business info | RECORD `business_id` (the Business portfolio ID) and `verification_status = bv_submitted:{date}`. `G1-02-business-info.png`, `G1-03-verification-submitted.png` (no document images in the shot). | Agent |

**Business Verification document list (prepare before step 7):**
| Purpose | Document | Must show |
|---|---|---|
| Legal name and registration | CIPC Certificate of Incorporation / Registration (CoR 14.3) and, if names differ, the CoR 15.1 / MOI front page | `Lead Velocity (Pty) Ltd`, registration number |
| Address | FNB bank confirmation letter on letterhead (recent; the same letter Paystack KYC uses), or a municipal / utility bill in the company name | Company name and the same address as step 3 |
| Phone or email | A document showing the business phone, or email/domain verification on `leadvelocity.co.za` | The number / domain entered in step 3 |
| Website | `https://leadvelocity.co.za` live, footer showing `Lead Velocity (Pty) Ltd` and registration number | Legal name visible on the site |
| Director identity (only if asked) | Jonathan's ID, uploaded by him | — |

Common rejection causes to pre-empt (Meta Business Verification docs): legal name in the portfolio differs from the documents (for example "Lead Velocity" vs "Lead Velocity (Pty) Ltd"); address differs between documents and portfolio; document cropped, expired or unreadable; website does not show the legal name; phone not reachable for the call/SMS code. If rejected, follow `appeal-playbook.md` §7.

**Pre-mortem #2:** verification is an external clock. Continue to G2 immediately; do not wait for the result.

---

## G2. GATE-META-PAGE-IG: SortMyCover Page, standby Page, Instagram ★

### G2a. Facebook Page "SortMyCover"

**Where:** business.facebook.com, Settings, Accounts, Pages, Add, **Create a new Facebook Page** (created inside the portfolio so the portfolio owns it; Page access is then given through the portfolio only, never as personal Page roles).

| # | Field | Type exactly | Notes |
|---|---|---|---|
| 1 | Page name | `SortMyCover` | Not "SortMyCover Insurance", not "Life Cover" |
| 2 | Category | `Website` (primary). If a second category is offered, `Education`. | **Never** "Insurance company", "Insurance broker", "Insurance agent", "Financial service", "Financial planner" or anything implying licensed status (4.7). If the screen forces a finance-type category, stop and RECORD |
| 3 | Bio / Intro (short field) | `A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes.` | `DISC-S97-v1`, 97 characters. Re-count in the field |
| 4 | ★ Jonathan clicks Create Page | | Check the name and category on the confirmation before clicking |
| 5 | Username | `sortmycover` (shows as @sortmycover) | If taken, stop and RECORD; do not use a variant without brand-naming-lead |
| 6 | Website | `https://sortmycover.co.za` **only after GATE-DOMAINS is live and the holding page loads on that domain**. Until then leave empty. | Never the staging host (0.1). NH-MO-02 |
| 7 | Email | `hello@sortmycover.co.za` **only after** the domain is added to Microsoft 365 and the alias to howzit@ delivers a test mail. Until then leave empty. | Never howzit@leadvelocity.co.za on the consumer Page |
| 8 | About, details ("Additional information" / "About" long text) | `SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.` | `DISC-FULL-v1`, 182 characters |
| 9 | Phone, address, hours, price range | Leave empty. No address (virtual service; no fake address). Hours: "No hours available". | |
| 10 | Profile picture | Upload `brand/exports/profile/fb-profile-1024.png` | Check the circle crop shows the whole tick mark |
| 11 | Cover photo | Upload `brand/exports/cover/fb-cover-851x315@2x.png` (1702 x 630) | Check the mobile crop; safe-area note in `deliverables/visual-producer/SUMMARY.md` |
| 12 | Action button | Until WABA is linked: `Learn more` to `https://sortmycover.co.za` (after domain). After G4: `Send WhatsApp message` to the Cloud API number | Never "Get quote", never "Call now" to a personal number |
| 13 | Page access | Settings, Accounts, Pages, SortMyCover, Assign people: Jonathan full control, KG full control | No personal Page roles outside the portfolio |
| 14 | Instant form terms | Not now. Accepted in G11 by Jonathan (★) | |
| 15 | RECORD | `page_id`; `handles.fb = "sortmycover"`; screenshots `G2-01-page-about.png`, `G2-02-page-category.png`, `G2-03-page-access.png` | |

### G2b. Standby Page (2.1.3)

| # | Action | Notes |
|---|---|---|
| 1 | Create a second Page in the same portfolio: name `SortMyCover South Africa`, category `Website`, same Bio (S97) and About (FULL), same profile/cover files, username left empty unless `sortmycoversa` is free | ★ Jonathan clicks Create. Name is a default (NH-MO-04) |
| 2 | Publish it but run nothing on it. Two or three of the same organic educational posts as the main Page over the first month so it is not an empty shell. | Organic only; no posting scripts |
| 3 | RECORD the standby Page ID. `brands` has no `standby_page_id` column: store it in `handles` as `{"fb_standby_page_id": "..."}` until platform-architect adds the column (NH-MO-05). `G2-04-standby-page.png` | |

### G2c. Instagram @sortmycover

| # | Screen | Action |
|---|---|---|
| 1 | Business Settings, Accounts, Instagram accounts, Add (or from the Page: Settings, Linked accounts, Instagram, Connect) | Create a **new** Instagram account from the Page; type **Business** (not Creator). ★ Jonathan clicks Create/Connect |
| 2 | Username | `sortmycover`. If taken, stop and RECORD |
| 3 | Name | `SortMyCover` |
| 4 | Bio | `A service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. No advice, product comparisons or premium quotes.` (`DISC-S148-v1`, 148 characters; re-count in the field) |
| 5 | Link | `https://sortmycover.co.za` only after GATE-DOMAINS; empty until then |
| 6 | Category | `Website` or `Education`; never a finance/insurance category. Display category on profile: off if the toggle exists |
| 7 | Contact options | Email `hello@sortmycover.co.za` after the alias works; no phone; no address |
| 8 | Profile photo | `brand/exports/profile/ig-profile-1024.png` |
| 9 | Assign in portfolio | Jonathan and KG full control; linked to the SortMyCover Page (Settings, Linked accounts shows the link) |
| 10 | RECORD | `ig_user_id` (Instagram account ID shown in Business Settings), `handles.ig = "sortmycover"`, `G2-05-ig-profile.png`, `G2-06-ig-linked.png` |

### G2d. Reserve @coverklaar on Instagram (parking only)

Create `@coverklaar` as a separate Instagram account with Jonathan's login. No posts, bio empty, no profile photo until the CoverKlaar decision (NH-23). Do **not** link it to an ad account. RECORD in the CK `brands` row: `handles.ig = "coverklaar"`. `G2-07-coverklaar-ig.png`.

---

## G3. GATE-AD-ACCOUNT: main + standby ad accounts ★

**Where:** Business Settings, Accounts, Ad accounts, Add, Create a new ad account.

**Time zone and currency cannot be changed after creation. Read them back aloud before Jonathan clicks.**

| # | Field | Main | Standby |
|---|---|---|---|
| 1 | Ad account name | `SortMyCover - Main` | `SortMyCover - Standby` |
| 2 | Time zone | `(GMT+02:00) Africa/Johannesburg` | same |
| 3 | Currency | `ZAR - South African Rand` | same |
| 4 | This ad account will be used for | **My business** (Lead Velocity (Pty) Ltd is the advertiser of record, 2.1.3) | same |
| 5 | ★ Jonathan clicks Create | | If Meta does not allow a second ad account yet (new portfolios can be limited), RECORD the message and retry after verification or first spend. Never obtain accounts through a third party |
| 6 | Add people | Jonathan: full control. KG: full control. | same |
| 7 | Add assets (the ad account, Connected assets) | Page SortMyCover, Instagram @sortmycover, WABA (after G4), dataset SortMyCover (after G5) | Same, plus the standby Page |
| 8 | **Payment method ★ Jonathan only** | Billing & payments, Add payment method. The agent leaves the screen; Jonathan types the card himself. | Default: add the same method now so a switch is fast (no spend happens without campaigns). Jonathan may choose to add it only at switch time |
| 9 | Account spending limit (optional safety net) ★ | Jonathan's choice. Suggested: the cycle-1 monthly cap from CS §12 (R10,500 default pending NH-22). Money setting: the agent applies no default | Standby: none until used |
| 10 | RECORD | `ad_account_id` (format `act_...`), `standby_ad_account_id`; `G3-01-main-settings.png` (time zone + currency), `G3-02-standby-settings.png`, `G3-03-assets.png`. **No screenshot of the billing screen** | |

The standby account carries no campaigns, no spend and no "warming". It exists so a non-policy outage (payment failure, compromise, stuck review) does not stop the business. When it may and may not be used: `appeal-playbook.md` §9. Re-running content Meta rejected from it is circumvention and is never done.

---

## G4. GATE-WABA: WhatsApp Business Account, Cloud API number, standby number ★

**Where:** business.facebook.com, WhatsApp Manager (or Business Settings, Accounts, WhatsApp accounts, Add). The WABA must be **inside the Lead Velocity portfolio**.

**Before you start:** two SA mobile numbers that are **not** active on the WhatsApp or WhatsApp Business app (registering a number on the Cloud API removes it from the app), each able to receive an SMS or voice call for the code (NH-MO-03). Until then staging runs on Meta's test number (`WHATSAPP_TEST_PHONE_NUMBER_ID`).

| # | Screen | Action | Who |
|---|---|---|---|
| 1 | Create WhatsApp Business Account | Name: `SortMyCover`. Time zone Africa/Johannesburg. Currency ZAR if asked. Accept WhatsApp terms | ★ Jonathan |
| 2 | Business profile category | `Education` if offered; else `Other`. Never "Finance" / "Financial services" (same reasoning as the Page) | Agent proposes, ★ Jonathan confirms |
| 3 | Add phone number (primary) | Display name: `SortMyCover`. Verification by SMS or voice | ★ Jonathan types the code |
| 4 | Two-step verification PIN | Jonathan sets a 6-digit PIN and stores it in `.env` as `WA_2FA_PIN` (and his password manager). Never in chat | ★ Jonathan |
| 5 | Display name review | Meta reviews the display name against the business's online presence. What we give Meta: the name `SortMyCover` exactly as on the Page, IG and website, and the website (after GATE-DOMAINS) whose footer says "SortMyCover is a service of Lead Velocity (Pty) Ltd". Do not add descriptors ("SortMyCover Life Cover", "SortMyCover Insurance"): extra words are a common rejection cause and would imply a product | Agent RECORDS the name status |
| 6 | Business profile | Photo `brand/exports/profile/whatsapp-profile-640.png`; About `Sort your cover. 30 minutes. A real adviser.` (`DISC-WA-ABOUT-v1`); Description `DISC-WA-DESC-v1` verbatim from DW §2 (about 316 characters; re-count against the field limit; if the field is shorter, stop and ask brand-naming-lead, do not trim on the fly); Email `hello@sortmycover.co.za` (after alias works); Website `https://sortmycover.co.za` (after domain); no address | Agent fills, ★ Jonathan saves |
| 7 | Add phone number (standby) | Same WABA. Display name `SortMyCover`. Same profile fields. Own PIN `WA_2FA_PIN_STANDBY` | ★ Jonathan |
| 8 | Link to Page | Page settings, Linked accounts, WhatsApp: link the **primary** Cloud API number (needed for the Page action button and Campaign C) | ★ Jonathan |
| 9 | Assign | WABA assigned to Jonathan and KG (full control) and connected to both ad accounts | ★ Jonathan |
| 10 | Read and RECORD | `waba_id`, `phone_number_id` (primary), `standby_phone_number_id`, display-name status of each number, quality rating, messaging limit tier shown. `G4-01-waba-overview.png`, `G4-02-primary-number.png`, `G4-03-standby-number.png`, `G4-04-profile.png` | Agent |
| 11 | `.env` (Jonathan types) | `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID` (same value; the repo uses both names, NH-MO-06), `WA_STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN`, `WA_2FA_PIN_STANDBY` | ★ Jonathan |

Cloud API registration (`POST /{phone_number_id}/register` with the PIN) is done once the system-user token exists (G6b step 8). If WhatsApp Manager already shows the number as Connected, RECORD and skip.

Standby number use (genuine traffic only, no warming scripts): default is to send the internal `ops_*` notifications (6.8b, to Jonathan's and KG's own numbers) from the standby number, so it builds a real quality history under the same WABA and display name. Templates belong to the WABA, so the same approved templates work from both numbers (NH-MO-07).

Templates: submit now, per `template-submission-runbook.md` (pre-mortem #1: Day 0).

---

## G5. GATE-PIXEL: dataset, domain verification, event priority, CAPI token, test events ★

### G5a. Dataset / Pixel

| # | Screen | Action |
|---|---|---|
| 1 | Events Manager, Connect data sources, Web | Name: `SortMyCover`. Website URL: `https://sortmycover.co.za` (only after GATE-DOMAINS; if the form insists on a URL earlier, stop and wait). ★ Jonathan clicks Create |
| 2 | Choose setup | Conversions API and Meta Pixel, manual. No partner integration |
| 3 | Settings, Automatic advanced matching | **OFF** (compliance-qa phase0-review-1; `pixel.js` also sets `autoConfig=false`) |
| 4 | Settings, automatic events / "track events without code" | **OFF**. Only the explicit events in `landing/shared/pixel.README.md` fire |
| 5 | Settings, First-party cookies | On |
| 6 | Settings, Traffic permissions | Allow list: `sortmycover.co.za` only, so the staging host and any other site cannot send browser events (0.1) |
| 7 | Business Settings, Data sources, Datasets, SortMyCover, Connected assets | Add both ad accounts. The system user is added in G6 |
| 8 | RECORD | `pixel_id` and `dataset_id` (in current Events Manager these are usually the same number; record both fields as the screen shows them). `G5-01-dataset-settings.png` |
| 9 | `.env` (Jonathan) | `META_PIXEL_ID`, `META_DATASET_ID` |

### G5b. Domain verification of sortmycover.co.za (needs GATE-DOMAINS live)

1. Business Settings, Brand safety, Domains, Add: `sortmycover.co.za`. Not `www.`, not the staging host, not `leadvelocity.co.za`.
2. Method: **Meta-tag verification**. Copy only the `content` value Meta shows.
3. devops-security / landing-page-builder replaces `{{META_DOMAIN_VERIFICATION}}` in the `<meta name="facebook-domain-verification" ...>` tag that is already in the `<head>` of every page in `landing/holding/` (index, about, privacy, complaints, how-we-make-money, 404, learn/*), then uploads per `landing/holding/deploy.md` (domain-verification paragraph). The value is not a secret, but it goes into the files, not into chat.
4. Confirm with `view-source:https://sortmycover.co.za/` that the tag is in the head. Then ★ Jonathan clicks **Verify**.
5. Connect the dataset to the domain if the screen asks.
6. RECORD `G5-02-domain-verified.png`; append `domain_verified:{date}` to `brands.verification_status`.

### G5c. Event priority (Aggregated Event Measurement), 4.4a

1. Events Manager, the dataset, Aggregated Event Measurement (or "Configure web events"), domain `sortmycover.co.za`.
2. Order: **1 `Lead`, 2 `Schedule`, 3 `Contact`, 4 `ViewContent`, 5 `PageView`**. ★ Jonathan clicks Apply.
3. If the screen no longer exists, or Meta says event configuration is no longer needed, **do not hunt for it**: screenshot what Events Manager shows, write it in §13, and the Section 7 words "event priority set" go to NH-MO-08. Campaign A is on-Meta (instant form) and does not depend on it.
4. RECORD `G5-03-event-priority.png`.

### G5d. Conversions API token and test events

1. Events Manager, the dataset, Settings, Conversions API, **Generate access token**. ★ Jonathan clicks; the token appears once.
2. Jonathan pastes it straight into `.env` as `META_CAPI_TOKEN`. Not into chat, a screenshot or the console.
3. Events Manager, Test events: copy the test code into `.env` as `META_TEST_EVENT_CODE` (staging only; removed for production, CS §1 item 9).
4. automation-engineer runs `automation/capi/capi.test.js` against the test code. Pass: `Lead` and `Schedule` received, deduped with the browser event by `event_id`, Event Match Quality at least 6/10. Also read off Test events the GATE-PIXEL ASSUMPTIONS in `build/tasks.json` (API version v23.0, business-messaging `Schedule`, offline stage events through the dataset `/events` endpoint, ZAR value currency). RECORD `G5-04-test-events.png` (no token visible) and the EMQ value into `brands.emq`.

---

## G6. Permissions last: Lead Velocity app, system user, tokens, webhooks ★

### G6a. The Lead Velocity Meta app

| # | Action | Notes |
|---|---|---|
| 1 | developers.facebook.com, My Apps: if a Lead Velocity app already exists **in this portfolio**, reuse it. Otherwise Create app, type **Business**, name `Lead Velocity Platform`, contact `howzit@leadvelocity.co.za`, business portfolio Lead Velocity (Pty) Ltd. ★ Jonathan | One app for all brands; brands differ by IDs in the `brands` row |
| 2 | Add products: **WhatsApp**, **Webhooks**, **Marketing API**; Facebook Login for Business only if the screen requires it for Page tokens | |
| 3 | App settings, Basic: privacy policy URL `https://leadvelocity.co.za/privacy` (the app belongs to Lead Velocity; SortMyCover's consumer privacy notice stays on sortmycover.co.za/privacy), app domain `leadvelocity.co.za`, category Business | |
| 4 | App settings, Advanced: **Require app secret = On** (SECURITY.md) | |
| 5 | Access level: **Standard access** is enough for our own Page, ad account and WABA. **Do not** apply for Advanced access or App Review (Marketing API access-level docs; 6.2) | If a permission says it needs Advanced access for our own assets, stop and RECORD |
| 6 | App mode: **Live** once the privacy URL is set (in Development mode only test leads from people with app roles arrive). ★ Jonathan | RECORD anything else Meta asks for |
| 7 | `.env` (Jonathan): `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` (a long random string he generates), `META_GRAPH_VERSION=v23.0` (ASSUMPTION per GATE-PIXEL; use the version the app dashboard shows if different) | RECORD `app_id` in `brands`; `G6-01-app-basic.png` with the secret field hidden |

### G6b. System user and the automation token

| # | Action |
|---|---|
| 1 | Business Settings, Users, System users, Add: name `smc-automation`, role **Admin**. ★ Jonathan |
| 2 | Assign assets to `smc-automation`: Page SortMyCover (full control: content, messages, ads, leads, insights), Instagram @sortmycover (full), both ad accounts (manage campaigns), WABA (full control), dataset SortMyCover (manage), the app (develop). Standby Page the same, so a switch needs no new token |
| 3 | Generate new token: app `Lead Velocity Platform`; **expiry Never**; permissions `ads_management`, `ads_read`, `business_management`, `read_insights`, `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `whatsapp_business_management`, `whatsapp_business_messaging` (6.2 + 4.14 + 4.6). ★ Jonathan clicks Generate |
| 4 | Jonathan pastes the token directly into `.env` as `META_SYSTEM_USER_TOKEN`. No screenshot of this screen |
| 5 | Console `brands` row: `system_user_token_ref = META_SYSTEM_USER_TOKEN` (the name, never the value) |
| 6 | Business Settings, Integrations, **Leads Access**: give the `smc-automation` system user and the app access to SortMyCover leads. If Leads Access is not shown, RECORD |
| 7 | Token check (no secret in output): automation-engineer runs W22 token-health once; it must report OK. Pre-mortem #11: the token does not expire; W22 checks daily; back off at 80 % of `X-Business-Use-Case-Usage` |
| 8 | Register both phone numbers on the Cloud API with their PINs (`POST /{phone_number_id}/register`) if WhatsApp Manager did not already. Jonathan runs it from the laptop shell; PIN read from `.env` |
| 9 | RECORD `G6-02-system-user-assets.png` (asset list only, no token) |

### G6c. Webhook subscriptions

| # | Object | Fields | Callback | Notes |
|---|---|---|---|---|
| 1 | App Webhooks, **Page** | `leadgen` (W02), `feed`, `mention`, `messages` (W30/W31, 4.14) | W02 / W30 / W31 URL on the public tunnel now (a **named** Cloudflare Tunnel so the hostname survives restarts, 0.3 #7); `api.leadvelocity.co.za` after the VPS (W26 re-points) | Verify token `META_WEBHOOK_VERIFY_TOKEN`; signatures checked with `META_APP_SECRET` |
| 2 | App Webhooks, **Instagram** | `comments`, `messages` | W30 / W31 | |
| 3 | App Webhooks, **WhatsApp Business Account** | `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`, `phone_number_name_update` | W07 inbound; W27 health | Template, quality and name changes reach the console without polling |
| 4 | Subscribe the WABA to the app | `POST /{waba_id}/subscribed_apps` with the system-user token (or the WhatsApp Manager toggle) | | |
| 5 | Subscribe the Page to the app | Console Ads screen admin tool `ads-subscribe-leadgen` (confirm-to-apply, CONSOLE-ADS-API §3): Page `subscribed_apps` with `leadgen` (plus `feed`, `messages`) | | ★ Jonathan taps Confirm |
| 6 | Test | Meta **Lead Ads Testing Tool** on SortMyCover's form (after G11 creates one): W02 receives the lead in under 5 s and W06 sends `broker_intro_slots` on the test number in under 60 s (CS 3.8). RECORD `G6-03-leadgen-test.png` |

---

## G7. Day-0 audiences and exclusions (4.4a Phase 1, 4.4b Day 0, CS §7)

**Where:** Ads Manager (main ad account), Audiences. Engagement audiences need no PII and start accumulating the day the Page/IG exist.

| # | Audience name | Type and source | Settings |
|---|---|---|---|
| 1 | `SMC_ENG_igpage_90d` | Engagement: Facebook Page SortMyCover, everyone who engaged; plus Instagram @sortmycover, everyone who engaged (two sources in one audience if the screen allows, else `SMC_ENG_page_90d` and `SMC_ENG_ig_90d`) | 90 days |
| 2 | `SMC_ENG_video75_30d` | Engagement: Video, watched at least 75 %, SortMyCover Page/IG videos | 30 days. Created once the first warm-up video is posted |
| 3 | `SMC_ENG_formopen_90d` | Engagement: Lead form, "Opened this form" and separately "Opened but didn't submit" | 90 days. Created after the first form exists (G11). **Audience only, never contacted** |
| 4 | `SMC_EXC_leads_90d` (pixel part) | Website: dataset SortMyCover, event `Lead`, 90 days | Created Day 0 (empty is fine) |
| 5 | `SMC_EXC_leads_90d`, `SMC_EXC_booked`, `SMC_EXC_attended` (customer-list parts) | Customer list, SHA-256 hashed in n8n, only rows with `consent_ads_at` | Created by the console tool `create_customer_list_audience` at the first nightly upload. There are no real leads before go-live; synthetic data never goes to Meta. Naming of the two `leads_90d` sources: NH-MO-09 |
| 6 | Custom Audience terms | Ads Manager asks to accept them before the first customer-list audience | ★ Jonathan accepts |
| 7 | RECORD | Audience IDs into the console; `G7-01-audiences.png` | |

Exclusions go on every ad set in G11 (CS 4.2). Lookalikes are **not** created now (CS §11 seed gates; none at all if a Special Ad Category applies).

---

## G8. Page warm-up (2.1.3): 7 days, organic plus a Reach-objective ad

**Media-buyer's note applies: the paid part is a Reach-objective ad from Ads Manager, not the Page "Boost" button** (CS §1 item 7, §14). A Reach ad uses the objective, placements and exclusions we choose, with the same naming and audit trail; Boost does not.

| # | What | Detail |
|---|---|---|
| 1 | Content | 3 to 5 organic educational posts over 7 days on the Page and IG, adapted from the five `landing/holding/learn/` articles (life cover gap; payslip cover line; life events; what happens on a 30-minute call; how SortMyCover works). Third person only, no product, insurer, premium, cover amount or broker (2.1.8). Each post passes compliance-qa before posting. At least one short video, so `SMC_ENG_video75_30d` starts filling |
| 2 | Who posts | Jonathan from Business Suite (scheduled posts are fine). No posting scripts |
| 3 | Paid part | Campaign `SMC_W_REACH_ZA_warmup`, objective **Awareness, Reach**; Special Ad Category step checked and recorded as in G11a; one ad set: South Africa, 18+ (no other targeting), Advantage+ placements without Audience Network; one ad "Use existing post" (an organic educational post); daily budget **about R50** ★; 7 days with an end date; published ★ by Jonathan only |
| 4 | When | Before any lead campaign spends (2.1.3). Whether the ~R350 may be spent before the first broker payment is **NH-MO-01** (money; no default) |
| 5 | Record | Spend, reach, any policy flags; `G8-01-warmup-settings.png`; Section 7 "7-day warm-up done" ticked with the end date |

---

## G9. Handle reservations (parking only, 4.7 #8; availability-checks E7 to E10)

No content, no posting, no ads. Profile image `brand/exports/logo/tick-mark@3x.png` or none. Bio empty or `A service of Lead Velocity (Pty) Ltd.` only. Logins in the Lead Velocity password manager with 2FA on.

| Platform | Handle(s) | Account owner | RECORD in `brands.handles` |
|---|---|---|---|
| TikTok | @sortmycover, @coverklaar | Lead Velocity business email | `tiktok` |
| YouTube | @sortmycover, @coverklaar | Lead Velocity Google account (brand account) | `yt` |
| LinkedIn | company page `sortmycover`, `coverklaar` | Lead Velocity's admin (Jonathan's profile as page admin) | `li` |
| X | @sortmycover, @coverklaar | Lead Velocity business email | `x` |

Each creation click is ★ Jonathan (4D.4 human gate). If a handle is taken, RECORD it; no lookalike variant without brand-naming-lead. Screenshot each profile `G9-0n-{platform}.png`. CoverKlaar handles go in the CK `brands` row.

---

## G10. GATE-TEMPLATES ★

Follow `template-submission-runbook.md`. Day 0, straight after G4. Never blocks the build (pre-mortem #1).

---

## G11. Campaigns A, B, C: Special Ad Category check, build, first-3 approval ★ (GATE-ADS-APPROVE-3, GATE-CAMPAIGN-PUBLISH)

**Preconditions:** G2 to G7 done; warm-up done or scheduled (G8); Mark's `practice_name` and `fsp_number` verified (named-consent form fails closed otherwise, CS 3.5); `https://sortmycover.co.za/privacy` live and naming Pixel/CAPI; creative manifest from creative-strategist + visual-producer with compliance-qa `pass` (NH-MO-10).

### G11a. Special Ad Category check (2.1.4, CS §10): on the screen, first

1. Ads Manager, main ad account, Create, objective **Leads**. On the Special ad categories step, before choosing anything, screenshot `G11-01-sac-step.png`.
2. Fill in the record below exactly as the screen shows. If Meta shows "Financial products and services" as **required**, or prompts for it: **declare it** honestly, even though it removes age/gender targeting and lookalikes; campaign names get `_SAC`. If optional and nothing prompts: leave it unticked.
3. Same decision for A, B, C and the warm-up Reach campaign. Record it once in the console (Settings, Brands, SortMyCover, "Special Ad Category decision") and in the Section 7 line.
4. If an ad is later flagged for the category: stop; do not appeal blindly; re-create the campaign under the category (it cannot be edited on a live campaign); human gate (CS 10.4).

**SAC record (type into the console; the console row plus `G11-01-sac-step.png` is the record):**
| Field | Value seen on screen |
|---|---|
| Date and time, ad account | |
| Category prompt shown? (yes/no) | |
| "Financial products and services": pre-selected / optional / mandatory | |
| Country field shown and value | |
| Age targeting after the choice: editable min/max, or fixed 18-65+ | |
| Age labelled "suggestion" under Advantage+ audience? | |
| Gender, detailed targeting, lookalike, location radius available? | |
| Warning text shown (verbatim) | |
| Decision taken and by whom | |

### G11b. Build (all paused)

1. **Instant form A1** (and A2 paused): exactly CS §3 and `deliverables/media-buyer/instant-form-spec.json`. Lead Ads terms for the Page: ★ Jonathan accepts on the first form. Consent checkbox text from the current `consent-and-privacy.md` (CS 3.5: the file wins). Run the two staging submissions for ASSUMPTION A4 (CS 3.4) and RECORD.
2. **Campaign A** `SMC_A_LEADS-IF_ZA_c1`: CS §4.1 to §4.3 field by field. Budget: Meta requires a positive daily budget, so enter the **minimum Meta accepts** with the campaign **Off** (CONSOLE-ADS-API: "paused at the minimum budget"); the budget entry is ★ Jonathan. Exclusions per G7. Placements per CS 4.2; RECORD the final list `G11-02-placements.png`.
3. **Pre-approval trio only:** `C01_H1_sta-amb`, `C01_H1_vid-amb`, `C02_H3_vid-amb` (CS 4.4). Upload only files named in the creative manifest.
4. ★ **Jonathan clicks Publish** with the campaign Off. RECORD each ad's review status (`G11-03-trio-review.png`). If Meta does not review ads while the campaign is off, **do not switch it on to force a review** (that spends): RECORD and raise NH-MO-11.
5. All three approved: GATE-ADS-APPROVE-3 is cleared; add the rest of the matrix (CS 4.5) and A2 (paused). Any disapproval: `appeal-playbook.md` §2 (one fix, one resubmit; two disapprovals on one ad for one reason = stop).
6. **Campaign B** `SMC_B_LEADS-WEB_ZA_c1` and **Test C** `SMC_C_LEADS-CTWA_ZA_c1`: CS §5, §6, built paused, published ★ for review only.
7. IDs: the console reads campaign, ad set and ad IDs through W21; confirm they appear on the Ads screen. GATE-CAMPAIGN-PUBLISH = all three campaigns created, approved, Off, at minimum budget.
8. The go-live budget raise is not done here: it is the console "Approve & go live" tap (6.1 step 5, CONSOLE-ADS-API §4).

---

## G12. Final record (task 6) and Section 7 tick list

Screenshots of the final settings go to `/deliverables/meta-operator/screens/`. Required set:

| File | Shows |
|---|---|
| `G1-01` to `G1-03` | 2FA required, 2 admins; business info; verification submitted/approved |
| `G2-01` to `G2-07` | Page About (disclosure), category, access; standby Page; IG profile and link; @coverklaar |
| `G3-01` to `G3-03` | Both ad accounts' time zone and currency; assets |
| `G4-01` to `G4-04` | WABA, both numbers (display name status, quality), profile |
| `G5-01` to `G5-04` | Dataset settings (AAM off, allow list), domain verified, event priority, test events with EMQ |
| `G6-01` to `G6-03` | App basic (secret hidden), system-user assets, leadgen test |
| `G7-01` | Audiences |
| `G8-01` | Warm-up settings and result |
| `G9-*` | Parked handles |
| `G10-*` | Template rows in WhatsApp Manager (template runbook §5) |
| `G11-01` to `G11-03` + one per campaign | SAC step, placements, trio review; each campaign's objective, SAC, location, age, exclusions, status Off |
| `G12-*` | Flow health check, Builder, test bookings (template runbook §6) |

**`brands` row (code `SMC`) when complete** (columns from the migration; nothing else is stored):
| Column | Source gate |
|---|---|
| `business_id` | G1 |
| `page_id` | G2a |
| `ig_user_id` | G2c |
| `waba_id`, `phone_number_id`, `standby_phone_number_id` | G4 |
| `ad_account_id`, `standby_ad_account_id` | G3 |
| `pixel_id`, `dataset_id` | G5a |
| `app_id` | G6a |
| `system_user_token_ref` = `META_SYSTEM_USER_TOKEN` | G6b |
| `booking_flow_id`, `flow_public_key_ref` = `FLOW_PUBLIC_KEY` | W28 (template runbook §6) |
| `handles` = `{fb, ig, tiktok, yt, li, x, fb_standby_page_id}` | G2, G9 |
| `verification_status` (BV, domain, display names) | G1, G4, G5b |
| `disclosure_text` = `DISC-FULL-v1` text | DW §1 |
| `brand_kit_url` | visual-producer |
| `domain` = `sortmycover.co.za` (already seeded) | — |

**`.env` names (Jonathan types the values; nothing else stores them):** `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID`, `WA_STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN`, `WA_2FA_PIN_STANDBY`, `WHATSAPP_TEST_PHONE_NUMBER_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_SYSTEM_USER_TOKEN`, `META_CAPI_TOKEN`, `META_PIXEL_ID`, `META_DATASET_ID`, `META_API_VERSION`, `META_TEST_EVENT_CODE`, `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID`, `FLOW_PRIVATE_KEY`, `FLOW_PRIVATE_KEY_PASSPHRASE`, `FLOW_PUBLIC_KEY`, `FLOW_ENDPOINT_URL`.

**Section 7 lines this runbook turns green (W27 health must read them back):** Page + IG live, linked, disclosure in About, 7-day warm-up done; Business Portfolio verified or submitted; all Meta IDs in the `brands` row; Pixel/CAPI domain verified, event priority set, EMQ at least 6, exclusions + engagement audiences created; Pixel + CAPI verified in Events Manager, Lead Ads webhook subscribed and tested; Campaigns A, B, C created per spec with the Special Ad Category decision recorded; WhatsApp number live, Business Verification complete, display name approved, standby number on the same WABA; ads approved and Off (after G11 step 5).

---

## 13. Screen differs (fill in during the session)

| Date | Gate/step | Runbook said | Screen showed | Screenshot | Action taken / NH line |
|---|---|---|---|---|---|
| | | | | | |

---

## 14. needs_human raised by this runbook (for the orchestrator to log; this agent did not edit `build/tasks.json`)

| Code | Issue | Default if silent |
|---|---|---|
| NH-MO-01 (money) | 2.1.3 wants a ~R50/day x 7 paid warm-up before lead campaigns; 0.1 / 6.6 say nothing spends before the first payment, and Section 7 needs the warm-up done before Go live. About R350 would be spent pre-payment. (The 2.1.3 "boost" vs media-buyer "no boosting" conflict is resolved as a Reach-objective ad.) | **No default (money).** Options: (a) Jonathan approves ~R350 pre-payment; (b) organic-only warm-up now, paid Reach week starts the day payment lands and lead campaigns go live 7 days later |
| NH-MO-02 | GATE-DOMAINS may be deferred. Page/IG website and email, WhatsApp profile website, domain verification, Pixel website URL and template URL buttons all need `sortmycover.co.za` live. | Create every asset now with those fields empty; fill them at the domain cutover, which becomes a pre-go-live gate; never use the staging host |
| NH-MO-03 (money) | Two SA mobile numbers not on WhatsApp are needed (primary + standby). New SIMs cost money before first payment. | Use numbers Lead Velocity already owns that are not on WhatsApp; if none, staging stays on the Meta test number until payment |
| NH-MO-04 | Standby Page name is not specified anywhere. | `SortMyCover South Africa`, same category and disclosure |
| NH-MO-05 | `brands` has no `standby_page_id` or reschedule Flow id column. | Store in `handles` (`fb_standby_page_id`) and `.env` (`RESCHEDULE_FLOW_ID`); platform-architect adds columns in the next additive migration |
| NH-MO-06 | The repo uses both `PHONE_NUMBER_ID` (W22, Flow endpoint) and `WA_PHONE_NUMBER_ID` (W23, tests) for the same number. | Set both to the same value; automation-engineer unifies on one name |
| NH-MO-07 | Using the standby number for `ops_*` messages to Jonathan/KG (6.8b says "from the SortMyCover number"; the standby is a SortMyCover number on the same WABA). | Yes: gives the standby a genuine quality history without scripts |
| NH-MO-08 | 4.4a / Section 7 require "event priority set"; if Events Manager no longer offers the priority screen, the line cannot be ticked as written. | Record the screen; mark the line "not configurable, recorded {date}" |
| NH-MO-09 | CS §7 names `SMC_EXC_leads_90d` as "customer list + pixel Lead 90 d", but a Meta audience has one source. | Two audiences `SMC_EXC_leads_90d_pix` and `SMC_EXC_leads_90d_list`, both excluded |
| NH-MO-10 | No ad creative manifest exists yet (visual-producer produced brand exports and samples only). Task 5 "upload assets from the manifest" cannot run. | Waits; G11 is not on the Phase 0 path |
| NH-MO-11 (money) | Ads published in an Off campaign may not be reviewed until the campaign is on; switching it on spends. | Do not switch on; Jonathan decides (for example a R minimum one-day run after payment) |
| NH-MO-12 | 4.6 "never use marketing-category templates" vs 0.3 #1 "accept category decisions" (already raised by automation-engineer). | Accept and log for build/testing; same-day `_u2` utility rewrite; no lead-facing marketing template in production without Jonathan's yes |
| NH-MO-13 | The template review samples show a fictional "FSP 12345", which may be a real FSP's number. | compliance-qa checks or replaces it with an obviously fictional value before submission |
| NH-MO-14 | Using the standby ad account / Page / number is limited by `appeal-playbook.md` §9 (never while a policy decision stands), which narrows 2.1.3's "standby" and the 6B.10 drill wording. | Adopt the §9 rule; Jonathan acknowledges |
