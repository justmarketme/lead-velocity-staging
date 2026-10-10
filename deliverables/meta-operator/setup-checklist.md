# SortMyCover: Meta setup runbook (laptop, gate by gate)

Owner: meta-operator (Ads Platform Administrator). Date: 2026-10-02 (rev 2: G5d EMQ without email, G10 template order, G11 GATE-ADS-APPROVE-3 rebuilt from `first-batch.csv`). Status: **ready to run. Nothing has been clicked, created, bought or published.** This sandbox has no browser and no Meta login.
Readers: Jonathan (logged in, does every ★ himself), the Claude in Chrome agent (prepares the screens, reads them back, records), KG (second admin).
Sources used: MASTER-PROMPT 2.1.3, 2.1.4, 2.2, 4.4a, 4.4b, 4.6, 4.7, 4.14, 6.2, 6.8b, Section 7; `build/gates-batch.md`; `deliverables/media-buyer/campaign-spec.md` (CS); `deliverables/media-buyer/first-batch.csv` (FB); `deliverables/visual-producer/assets/` + `manifest.json`; `deliverables/brand-naming-lead/disclosure-wording.md` (DW); `deliverables/compliance-qa/phase4-review-4.md` (R4); `automation/capi/event-spec.md` (ES); `brand/exports/`; `landing/holding/deploy.md`; `automation/templates/`; `automation/flows/booking-flow-endpoint.md`; `automation/ads/CONSOLE-ADS-API.md`; `automation/security/SECURITY.md`; migration `supabase/migrations/20261002020000_smc_02_core.sql` (`brands` columns).
Companion files: **`jonathan-clicks.md`** (one page per gate: what Jonathan clicks, exact values, `.env` names), `template-submission-runbook.md` (GATE-TEMPLATES, GATE-FLOW-PUBLISH), `appeal-playbook.md` (when Meta says no), `first-principles.md`. Open questions are in §14 (NH-MO-xx).

---

## 0. Rules for this session (read once, apply on every screen)

1. **Order is the safety mechanism** (Meta Business Help Center): portfolio, then verification, then assets (Page, IG, ad accounts, WABA, dataset), then permissions (system user, app, tokens). Do not skip ahead. A missing earlier step is the usual cause of the restrictions that kill new accounts.
2. **★ = only Jonathan clicks.** The Chrome agent fills fields, reads the screen back aloud, and stops with the cursor on the button. ★ applies to: anything that creates an account-level object in Meta, any payment or billing screen, any budget field, any "Publish", any template "Submit", any Flow "Publish", accepting any Meta terms (Lead Ads terms, Custom Audience terms, WhatsApp terms), Business Verification submission, and 2FA or security settings.
3. **Never** done by the agent: typing card or bank details; typing or reading out a token, PIN, password or 2FA code; buying anything; aged or bought accounts; "warming" scripts; cloaking; any workaround of a Meta review.
4. **Read every screen; never guess.** If a label, option or limit on the screen differs from this runbook, stop, screenshot, write a line in §13 "Screen differs" and continue with independent steps. Do not research around it.
5. **RECORD** = (a) type the ID into the CRM console `brands` row for `code = 'SMC'` (Settings, Brands, SortMyCover), and (b) save a screenshot to `/deliverables/meta-operator/screens/` named `G{gate}-{nn}-{slug}.png`. IDs never go into chat, WhatsApp or commit messages.
6. **Secrets go only into the local `.env`** on Jonathan's laptop, typed by Jonathan. The `brands` row stores the **name** of the secret (for example `META_SYSTEM_USER_TOKEN`), never the value (the table has a CHECK that rejects values starting `EAA`).
7. **Screenshots must not show:** tokens, app secret, 2FA codes, PINs, card numbers, ID numbers, personal phone numbers. Close or crop those screens before capture.
8. **Consumer surfaces show only `sortmycover.co.za`.** Never enter `sortmycover.leadvelocity.co.za` (staging) or any `leadvelocity.co.za` URL on the Page, IG, WhatsApp profile, Pixel, ads or forms (0.1). The portfolio itself is Lead Velocity (Pty) Ltd and uses leadvelocity.co.za, because that is the legal entity. Never use Lead Velocity's B2B Page or the broker's Page for SortMyCover.

### 0.1 Dependency map (what can start now)

| Gate | Needs first | Can start today? |
|---|---|---|
| G1 GATE-META-PORTFOLIO | nothing | Yes |
| G2 GATE-META-PAGE-IG | G1 | Yes. Website and email fields wait for GATE-DOMAINS (G2a steps 6 and 7, NH-MO-02) |
| G3 GATE-AD-ACCOUNT | G1 | Yes |
| G4 GATE-WABA | G1; two phone numbers not on WhatsApp (NH-MO-03 / NH-31 b) | Yes for the test number; real numbers when supplied |
| G5 GATE-PIXEL | G1, G3; domain verification also needs GATE-DOMAINS live | Dataset yes; domain verification after GATE-DOMAINS |
| G6 App, system user, tokens, webhooks | G1 to G5 | Yes, once G2 to G5 exist |
| G7 Day-0 audiences | G2, G3, G5 | Yes, as soon as the assets are linked |
| G8 Page warm-up | G2, G3, payment method; money decision NH-MO-01 / NH-31 a | Organic posts yes; paid part waits |
| G9 Handle reservations | nothing | Yes |
| G10 GATE-TEMPLATES | G4; sample FSP fix on the image header (R4 §1 #10); NH-19a for the 3 intro templates | Yes for 46 of 52 (see `template-submission-runbook.md` §2) |
| G11 GATE-ADS-APPROVE-3 / GATE-CAMPAIGN-PUBLISH | G2 to G7; Mark's FSP verified (named-consent form fails closed without it, CS 3.5); creative manifest (present: `deliverables/visual-producer/assets/manifest.json`) | No: after broker onboarding data, domain and warm-up decision |
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

Common rejection causes to pre-empt (Meta Business Verification docs): legal name in the portfolio differs from the documents (for example "Lead Velocity" vs "Lead Velocity (Pty) Ltd"); address differs between documents and portfolio; document cropped, expired or unreadable; website does not show the legal name; phone not reachable for the call/SMS code. If rejected, follow `appeal-playbook.md` §7. Verification is also the fallback if Meta ever asks for licensing proof (2.1.3): Lead Velocity is the advertiser of record and is not an FSP; the authorised FSP is named in the consent and intro card.

**Pre-mortem #2:** verification is an external clock. Continue to G2 immediately; do not wait for the result.

---

## G2. GATE-META-PAGE-IG: SortMyCover Page, standby Page, Instagram ★

### G2a. Facebook Page "SortMyCover"

**Where:** business.facebook.com, Settings, Accounts, Pages, Add, **Create a new Facebook Page** (created inside the portfolio so the portfolio owns it; Page access is then given through the portfolio only, never as personal Page roles).

| # | Field | Type exactly | Notes |
|---|---|---|---|
| 1 | Page name | `SortMyCover` | Not "SortMyCover Insurance", not "Life Cover" |
| 2 | Category | `Website` (primary). If a second category is offered, `Education`. | **Never** "Insurance company", "Insurance broker", "Insurance agent", "Financial service", "Financial planner" or anything implying licensed status (4.7). If the screen forces a finance-type category, stop and RECORD |
| 3 | Bio / Intro (short field) | `Sort your cover: free 30-min call with a licensed adviser at a time you pick. We book. They advise.` | `BIO-FB-v4`, 99 characters (copy workflow 2026-10-05: research + judge panel + refuters) (Jonathan, 2026-10-05: the bio says what SortMyCover does for consumers, not legal disclosure). The disclosure lives in About (row 8). |
| 4 | ★ Jonathan clicks Create Page | | Check the name and category on the confirmation before clicking |
| 5 | Username | `sortmycover` (shows as @sortmycover) | If taken, stop and RECORD; do not use a variant without brand-naming-lead |
| 6 | Website | `https://sortmycover.co.za` **only after GATE-DOMAINS is live and the holding page loads on that domain**. Until then leave empty. | Never the staging host (0.1). NH-MO-02 |
| 7 | Email | `hello@sortmycover.co.za` **only after** the domain is added to Microsoft 365 and the alias to howzit@ delivers a test mail. Until then leave empty. | Never howzit@leadvelocity.co.za on the consumer Page |
| 8 | About, details ("Additional information" / "About" long text) | `SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.` | `DISC-FULL-v1`, 182 characters |
| 9 | Phone, address, hours, price range | Leave empty. No address (virtual service; no fake address). Hours: "No hours available". | |
| 10 | Profile picture | Upload `brand/exports/profile/fb-profile-1024.png` | Check the circle crop shows the whole tick mark |
| 11 | Cover photo | Upload `brand/exports/cover/fb-cover-851x315@2x.png` (1702 x 630) | Check the mobile crop; safe-area note in `deliverables/visual-producer/SUMMARY.md` |
| 12 | Action button | Before the domain and WABA: `Send message` (Messenger; profile-kit §1). Until WABA is linked: `Learn more` to `https://sortmycover.co.za` (after domain). After G4: `Send WhatsApp message` to the Cloud API number | Never "Get quote", never "Call now" to a personal number |
| 13 | Page access | Settings, Accounts, Pages, SortMyCover, Assign people: Jonathan full control, KG full control | No personal Page roles outside the portfolio |
| 14 | Instant form terms | Not now. Accepted in G11 by Jonathan (★) | |
| 15 | RECORD | `page_id`; `handles.fb = "sortmycover"`; screenshots `G2-01-page-about.png`, `G2-02-page-category.png`, `G2-03-page-access.png` | |

### G2b. Standby Page (2.1.3)

| # | Action | Notes |
|---|---|---|
| 1 | Create a second Page in the same portfolio: name `SortMyCover South Africa`, category `Website`, same Bio (`BIO-FB-v4`) and About (FULL), same profile/cover files, username left empty unless `sortmycoversa` is free | ★ Jonathan clicks Create. Name is a default (NH-MO-04) |
| 2 | Publish it but run nothing on it. Two or three of the same organic educational posts as the main Page over the first month so it is not an empty shell. | Organic only; no posting scripts |
| 3 | RECORD the standby Page ID. `brands` has no `standby_page_id` column: store it in `handles` as `{"fb_standby_page_id": "..."}` until platform-architect adds the column (NH-MO-05). `G2-04-standby-page.png` | |

### G2c. Instagram @sortmycover

| # | Screen | Action |
|---|---|---|
| 1 | Business Settings, Accounts, Instagram accounts, Add (or from the Page: Settings, Linked accounts, Instagram, Connect) | Create a **new** Instagram account from the Page; type **Business** (not Creator). ★ Jonathan clicks Create/Connect |
| 2 | Username | `sortmycover`. If taken, stop and RECORD |
| 3 | Name | `SortMyCover` |
| 4 | Bio | `Sort your cover. 30 minutes. A real adviser. / Free call, licensed adviser, a time you pick. / We book the call. They advise. You decide. / Message us.` (`BIO-IG-v5`, 145 characters, 4 lines; Jonathan 2026-10-05: consumer-benefit bio, disclosure on the linked Page About and site) |
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
| 9 | Account spending limit (optional safety net) ★ | Jonathan's choice. Suggested: the cycle-1 monthly cap from CS §12 (NH-22 b default R283/day x 30). Money setting: the agent applies no default | Standby: none until used |
| 10 | RECORD | `ad_account_id` (format `act_...`), `standby_ad_account_id`; `G3-01-main-settings.png` (time zone + currency), `G3-02-standby-settings.png`, `G3-03-assets.png`. **No screenshot of the billing screen** | |

The standby account carries no campaigns, no spend and no "warming". It exists so a non-policy outage (payment failure, compromise, stuck review) does not stop the business. When it may and may not be used: `appeal-playbook.md` §9. Re-running content Meta rejected from it is circumvention and is never done.

---

## G4. GATE-WABA: WhatsApp Business Account, Cloud API number, standby number ★

**Where:** business.facebook.com, WhatsApp Manager (or Business Settings, Accounts, WhatsApp accounts, Add). The WABA must be **inside the Lead Velocity portfolio**.

**Before you start:** two SA mobile numbers that are **not** active on the WhatsApp or WhatsApp Business app (registering a number on the Cloud API removes it from the app), each able to receive an SMS or voice call for the code (NH-MO-03 / NH-31 b). Until then staging runs on Meta's test number (`WHATSAPP_TEST_PHONE_NUMBER_ID`).

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
| 3 | Settings, Automatic advanced matching | **OFF** (`pixel.js` also sets `autoConfig=false`). Automatic matching would scrape form fields, including email, which never goes to Meta (0.1, ES) |
| 4 | Settings, automatic events / "track events without code" | **OFF**. Only the explicit events in `landing/shared/pixel.README.md` fire |
| 5 | Settings, First-party cookies | On |
| 6 | Settings, Traffic permissions | Allow list: `sortmycover.co.za` only, so the staging host and any other site cannot send browser events (0.1) |
| 7 | Business Settings, Data sources, Datasets, SortMyCover, Connected assets | Add both ad accounts. The system user is added in G6 |
| 8 | RECORD | `pixel_id` and `dataset_id` (in current Events Manager these are usually the same number; record both fields as the screen shows them). `G5-01-dataset-settings.png` |
| 9 | `.env` (Jonathan) | `META_PIXEL_ID`, `META_DATASET_ID` |

### G5b. Domain verification of sortmycover.co.za (needs GATE-DOMAINS live)

1. Business Settings, Brand safety, Domains, Add: `sortmycover.co.za`. Not `www.`, not the staging host, not `leadvelocity.co.za`.
2. Method: **Meta-tag verification**. Copy only the `content` value Meta shows.
3. devops-security / landing-page-builder replaces `{{META_DOMAIN_VERIFICATION}}` in the `<meta name="facebook-domain-verification" ...>` tag that is already in the `<head>` of every page in `landing/holding/`, then uploads per `landing/holding/deploy.md`. The value is not a secret, but it goes into the files, not into chat.
4. Confirm with `view-source:https://sortmycover.co.za/` that the tag is in the head. Then ★ Jonathan clicks **Verify**.
5. Connect the dataset to the domain if the screen asks.
6. RECORD `G5-02-domain-verified.png`; append `domain_verified:{date}` to `brands.verification_status`.

### G5c. Event priority (Aggregated Event Measurement), 4.4a

1. Events Manager, the dataset, Aggregated Event Measurement (or "Configure web events"), domain `sortmycover.co.za`.
2. Order: **1 `Lead`, 2 `Schedule`, 3 `Contact`, 4 `ViewContent`, 5 `PageView`**. ★ Jonathan clicks Apply.
3. If the screen no longer exists, **do not hunt for it**: screenshot what Events Manager shows, write it in §13, and the Section 7 words "event priority set" go to NH-MO-08. Campaign A is on-Meta (instant form) and does not depend on it.
4. RECORD `G5-03-event-priority.png`.

### G5d. Conversions API token, test events and EMQ (no email to Meta)

1. Events Manager, the dataset, Settings, Conversions API, **Generate access token**. ★ Jonathan clicks; the token appears once.
2. Jonathan pastes it straight into `.env` as `META_CAPI_TOKEN`. Not into chat, a screenshot or the console.
3. Events Manager, Test events: copy the test code into `.env` as `META_TEST_EVENT_CODE` (staging only; removed for production, CS §1 item 9).
4. automation-engineer runs `automation/capi/capi.test.js` against the test code. Pass: `Lead` and `Schedule` received, deduped with the browser event by `event_id`. Also read off Test events the GATE-PIXEL ASSUMPTIONS in `build/tasks.json` (API version v23.0, business-messaging `Schedule`, offline stage events through the dataset `/events` endpoint, ZAR value currency).
5. **EMQ read-out.** Events Manager, dataset, Overview, `Lead` (then `Schedule`), Event Match Quality. **Email is never sent to Meta** (0.1: email only for a Teams/Zoom/Meet invite; `capi.js` sends no `em`, `AUDIENCE_SCHEMA` has no `EMAIL`, enforced by `capi.test.js`). So **expect a lower EMQ than an email-bearing setup**; the >= 6/10 target is a measurement to confirm, not a promise. Record the parameter-coverage panel as shown. If below 6, the levers are (ES "Aggregated Event Measurement priority and EMQ"), in this order:
   1. `fbp` and `fbc` on every web event (`fbclid` captured on landing into `fbc`, stored on the lead);
   2. `external_id` = SHA-256 of `lead_id`, identical on browser, server and offline `Qualified`/`Attended` events;
   3. client IP and user agent captured server-side at form submit, sent unhashed;
   4. `ph` in E.164 plus `fn` / `ln` / `ct` / `country`;
   5. `ctwa_clid` + WABA id on CTWA events.
   **Never** turn on automatic advanced matching or collect email to lift EMQ. A below-6 reading after the levers is recorded and goes to NH-MO-08b (Section 7 wording), not "fixed" with email.
6. Privacy precondition (R4 §1 #27): before production traffic, `landing/holding/privacy.html` and `consent-and-privacy.md` must no longer say "number and email" go to Meta (contracts-drafter). Code is already email-free.
7. RECORD `G5-04-test-events.png` (no token visible), `G5-05-emq.png`, and the EMQ value into `brands.emq`.

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
| 5 | `SMC_EXC_leads_90d`, `SMC_EXC_booked`, `SMC_EXC_attended` (customer-list parts) | Customer list, SHA-256 hashed in n8n, phone / name / country / external id only (**no email column**), only rows with `consent_ads_at` | Created by the console tool `create_customer_list_audience` at the first nightly upload. There are no real leads before go-live; synthetic data never goes to Meta. Naming of the two `leads_90d` sources: NH-MO-09 |
| 6 | Custom Audience terms | Ads Manager asks to accept them before the first customer-list audience | ★ Jonathan accepts |
| 7 | RECORD | Audience IDs into the console; `G7-01-audiences.png` | |

Exclusions go on every ad set in G11 (CS 4.2). Lookalikes are **not** created now (CS §11 seed gates; none at all if a Special Ad Category applies).

---

## G8. Page warm-up (2.1.3): 7 days, organic plus a Reach-objective ad

**The paid part is a Reach-objective ad from Ads Manager, not the Page "Boost" button** (CS §1 item 7, §14).

| # | What | Detail |
|---|---|---|
| 1 | Content | 3 to 5 organic educational posts over 7 days on the Page and IG, adapted from the five `landing/holding/learn/` articles. Third person only, no product, insurer, premium, cover amount or broker (2.1.8). Each post passes compliance-qa before posting. At least one short video, so `SMC_ENG_video75_30d` starts filling |
| 2 | Who posts | Jonathan from Business Suite (scheduled posts are fine). No posting scripts |
| 3 | Paid part | Campaign `SMC_W_REACH_ZA_warmup`, objective **Awareness, Reach**; Special Ad Category step checked and recorded as in G11a; one ad set: South Africa, 18+ (no other targeting), Advantage+ placements without Audience Network; one ad "Use existing post"; daily budget **about R50** ★; 7 days with an end date; published ★ by Jonathan only |
| 4 | When | Before any lead campaign spends (2.1.3). NH-31 a default if silent: organic now, paid week after payment (live campaigns start 7 days later) |
| 5 | Record | Spend, reach, any policy flags; `G8-01-warmup-settings.png`; Section 7 "7-day warm-up done" ticked with the end date |

---

## G9. Handle reservations (parking only, 4.7 #8)

No content, no posting, no ads. Profile image `brand/exports/logo/tick-mark@3x.png` or none. Bio empty or `A service of Lead Velocity (Pty) Ltd.` only. Logins in the Lead Velocity password manager with 2FA on.

| Platform | Handle(s) | Account owner | RECORD in `brands.handles` |
|---|---|---|---|
| TikTok | @sortmycover, @coverklaar | Lead Velocity business email | `tiktok` |
| YouTube | @sortmycover, @coverklaar | Lead Velocity Google account (brand account) | `yt` |
| LinkedIn | company page `sortmycover`, `coverklaar` | Lead Velocity's admin (Jonathan's profile as page admin) | `li` |
| X | @sortmycover, @coverklaar | Lead Velocity business email | `x` |

Each creation click is ★ Jonathan. If a handle is taken, RECORD it; no lookalike variant without brand-naming-lead. Screenshot each profile `G9-0n-{platform}.png`. CoverKlaar handles go in the CK `brands` row.

---

## G10. GATE-TEMPLATES ★

Follow `template-submission-runbook.md` (rev 2): all **52** templates in 5 batches (core 6, lead-facing 13, broker 24, ops 7, Flow-button 2), Day 0, straight after G4. Three holds only: the intro-card header PNG still shows FSP 12345 (must be `00000 (SAMPLE)`), NH-19a (AI sentence) for the three `broker_intro_*`, and the frame-0 check on the intro video sample. `unbooked_nudge_2h` / `_72h` go with the new NH-45 text. Never blocks the build (pre-mortem #1); accept Meta's category decision and log it.

---

## G11. Campaigns A, B, C: Special Ad Category check, build, GATE-ADS-APPROVE-3 ★, GATE-CAMPAIGN-PUBLISH ★

**Preconditions (all must be true):** G2 to G7 done; `sortmycover.co.za` live (no ad, form or Pixel ever points at the staging host); warm-up done or scheduled (G8 / NH-31 a); Mark's `practice_name` and `fsp_number` verified (named-consent form fails closed otherwise, CS 3.5); `https://sortmycover.co.za/privacy` live and naming Pixel/CAPI; creative files present in `deliverables/visual-producer/assets/` with compliance-qa `pass`; the C01 condition below cleared.

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

### G11b. Build Campaign A shell (paused)

1. **Instant form** `SMC_A1_HI_v1_named_{date}` (FB column `instant_form`; `{date}` = build date `YYYYMMDD`): exactly CS §3 and `deliverables/media-buyer/instant-form-spec.json`; named consent with Mark's practice and FSP. Lead Ads terms for the Page: ★ Jonathan accepts on the first form. Consent text from the current `consent-and-privacy.md` (CS 3.5: the file wins). Run the two staging submissions for ASSUMPTION A4 (CS 3.4) and RECORD.
2. **Campaign** `SMC_A_LEADS-IF_ZA_c1`, **ad set** `SMC_A_BROAD_ZA_35-50`: CS §4.1 to §4.3 field by field. Budget: enter the **minimum Meta accepts** with the campaign **Off** (CONSOLE-ADS-API); the budget entry is ★ Jonathan. Exclusions per G7.
3. **Placements:** Advantage+ placements **with Audience Network excluded** (and Messenger inbox if listed); everything else automatic (CS 4.2). RECORD the final list `G11-02-placements.png`.

### G11c. GATE-ADS-APPROVE-3: the trio (FB rows 1 to 3) ★

Only these three ads are built before approval. Ad name = FB `ad_name` stem with `{UPLOAD_YYYYMMDD}` = the upload date (for example `C03_H3_vid-amb_20261015`). Files from `deliverables/visual-producer/assets/` only, exactly the names below; never edit a file after upload. All three: campaign `SMC_A_LEADS-IF_ZA_c1`, ad set `SMC_A_BROAD_ZA_35-50`, form `SMC_A1_HI_v1_named_{date}`, CTA button **Learn more** (`LEARN_MORE`), end-card CTA "Check my cover", captions on (upload the `.srt`).

| Order | Ad name stem | Headline (FB) | Reels / Stories / Feed-vertical (9:16) | Feed 4:5 | 1:1 | Fallback for Feed only (if the 4:5 check fails) | Captions | Condition |
|---|---|---|---|---|---|---|---|---|
| 1 | `C01_H1_vid-amb_{UPLOAD_YYYYMMDD}` | Work cover vs the bond. Check the gap. | `C01_employer-cover-gap_9x16_20261002.mp4` | **auto-crop of the 9:16** (do not attach the native amber 4:5) | **auto-crop of the 9:16** (do not attach the native amber 1:1) | `C01_employer-cover-gap_4x5_20261002.png` | `C01_employer-cover-gap_9x16_20261002.srt` | **Pair parity (CS 4.7 rule 4):** the teal twin (FB row 4) has no 4:5/1:1 video, so amber ships 9:16-only too; whatever Feed fallback amber gets, teal gets the same. **2-4x salary source** (NH-PCD-01 / NH-38): only upload the "2-4x salary" render once the source URL is in `verified-facts.md`; if silent, C01 runs with "Work cover is often a few times salary." and visual-producer must supply that render first |
| 2 | `C03_H3_vid-amb_{UPLOAD_YYYYMMDD}` | The one job after bond approval | `C03_trigger-new-bond_9x16_20261002.mp4` | `C03_trigger-new-bond_4x5_20261002.mp4` (native) | `C03_trigger-new-bond_1x1_20261002.mp4` (native) | `C03_trigger-new-bond_4x5_20261002.png` | `C03_trigger-new-bond_9x16_20261002.srt` | NH-PCD-03 wording already in `concepts.csv` |
| 3 | `C14_H10_vid-amb_{UPLOAD_YYYYMMDD}` | See every step before booking | `C14_what-the-call-is_9x16_20261002.mp4` | `C14_what-the-call-is_4x5_20261002.mp4` (native) | `C14_what-the-call-is_1x1_20261002.mp4` (native) | `C14_what-the-call-is_4x5_20261002.png` | `C14_what-the-call-is_9x16_20261002.srt` | UI mocks stay labelled "Example screen"; NH-36 phone height-fill. FB row 4 has `landing_url` = `https://sortmycover.co.za/` and the `/what-the-call/` URL in the `landing_page_status` column: confirm the intended URL with media-buyer before entering any website link (NH-MO-16) |

**Per-placement asset rule (CS 4.7):** Reels, Stories and Feed-vertical always get the 9:16 video. Feed 4:5 and 1:1 get the native motion file where it exists (C03, C14), otherwise Meta's auto-crop of the same 9:16 video (C01), never a still unless the 4:5 check below fails. In the ad's "Media" step use **placement asset customisation** so each placement shows the file in the table.

**4:5 safe-zone preview check (NH-36; CS 4.7 rule 3; DW S97 end-card rule), per ad, before Publish:**
1. Ads Manager, the ad, Preview, open **Facebook Feed** and **Instagram Feed** (4:5), then **Instagram Reels** and **Facebook Stories** (9:16).
2. 4:5 Feed (the auto-crop loses about 285 px top and bottom of a 9:16 frame): the hook line is fully readable in the first frame; the end-card shows "Check my cover" and the S97 small print ("A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes.") unclipped; no SAMPLE or "Example screen" label is cut off (C14).
3. 9:16 Reels/Stories: the S97 small print and CTA sit clear of the bottom caption/CTA overlay and the right-hand icons.
4. Pass: screenshot `G11-04-{ad}-feed45.png` and `G11-05-{ad}-reels.png`. Fail on 4:5: attach that ad's **fallback for Feed only** (column above), record which ads fell back (they are judged on Reels/Stories hook rate only), and for C01 apply the same fallback to the teal twin later. Fail on 9:16: do not publish; send back to visual-producer.

**EMQ check (before Publish; not a blocker for the instant-form trio):** read Events Manager EMQ for `Lead` and `Schedule` as in G5d step 5 and type the value into `brands.emq`. Campaign A is an on-Meta instant form, so its delivery does not depend on web EMQ; Campaigns B and C do. Expect it to sit lower than an email-bearing setup because **no email is sent to Meta**; if below 6, apply the five levers in G5d (fbp/fbc, external_id, IP + UA, ph E.164 + fn/ln/ct/country, ctwa_clid) and never add email or automatic advanced matching. RECORD `G11-06-emq.png`.

**Publish and read the review:**
1. ★ **Jonathan clicks Publish** with the campaign Off and the budget at the minimum. RECORD each ad's review status `G11-03-trio-review.png`.
2. If Meta does not review ads while the campaign is off: **do not switch it on to force a review** (that spends). RECORD; NH-MO-11 / NH-31 c default: leave off.
3. All three **Active/Approved (campaign Off)**: GATE-ADS-APPROVE-3 is cleared; ops_gate to Jonathan. Then batch 2 (FB rows 4 to 10: C01 teal the same day as amber, C04, C05, C06, C08, C10, C13) per the same per-placement rule and 4:5 check (their 4:5/1:1 = auto-crop; fallback = the row's `fallback_feed_asset`); C13 goes to `/c13-check-not-buy/` only, never `/myth-bust/`. Pool rows 11 to 16 are not uploaded until a replacement slot opens (C02, C12 also wait for compliance-qa re-check).
4. Any disapproval: `appeal-playbook.md` §2 (one fix, one resubmit; two disapprovals on one ad for one reason = stop).

### G11d. Campaigns B and C, and GATE-CAMPAIGN-PUBLISH ★

1. **Campaign B** `SMC_B_LEADS-WEB_ZA_c1` and **Test C** `SMC_C_LEADS-CTWA_ZA_c1`: CS §5, §6, built paused, published ★ for review only.
2. IDs: the console reads campaign, ad set and ad IDs through W21; confirm they appear on the Ads screen. GATE-CAMPAIGN-PUBLISH = all three campaigns created, approved, Off, at minimum budget.
3. The go-live budget raise is not done here: it is the console "Approve & go live" tap (6.1 step 5, CONSOLE-ADS-API §4).

---

## G12. Final record (task 6) and Section 7 tick list

Screenshots of the final settings go to `/deliverables/meta-operator/screens/`. Required set:

| File | Shows |
|---|---|
| `G1-01` to `G1-03` | 2FA required, 2 admins; business info; verification submitted/approved |
| `G2-01` to `G2-07` | Page About (disclosure), category, access; standby Page; IG profile and link; @coverklaar |
| `G3-01` to `G3-03` | Both ad accounts' time zone and currency; assets |
| `G4-01` to `G4-04` | WABA, both numbers (display name status, quality), profile |
| `G5-01` to `G5-05` | Dataset settings (AAM off, allow list), domain verified, event priority, test events, EMQ |
| `G6-01` to `G6-03` | App basic (secret hidden), system-user assets, leadgen test |
| `G7-01` | Audiences |
| `G8-01` | Warm-up settings and result |
| `G9-*` | Parked handles |
| `G10-*` | Template rows in WhatsApp Manager (template runbook §5) |
| `G11-01` to `G11-06` + one per campaign | SAC step, placements, trio review, 4:5 and Reels previews per ad, EMQ; each campaign's objective, SAC, location, age, exclusions, status Off |
| `G12-*` | Flow health check, Builder, test bookings (template runbook §6) |

**`brands` row (code `SMC`) when complete** (columns from the migration; nothing else is stored):
| Column | Source gate |
|---|---|
| `business_id` | G1 |
| `page_id` | G2a |
| `ig_user_id` | G2c |
| `waba_id`, `phone_number_id`, `standby_phone_number_id` | G4 |
| `ad_account_id`, `standby_ad_account_id` | G3 |
| `pixel_id`, `dataset_id`, `emq` | G5 |
| `app_id` | G6a |
| `system_user_token_ref` = `META_SYSTEM_USER_TOKEN` | G6b |
| `booking_flow_id`, `flow_public_key_ref` = `FLOW_PUBLIC_KEY` | W28 (template runbook §6) |
| `handles` = `{fb, ig, tiktok, yt, li, x, fb_standby_page_id}` | G2, G9 |
| `verification_status` (BV, domain, display names) | G1, G4, G5b |
| `disclosure_text` = `DISC-FULL-v1` text | DW §1 |
| `brand_kit_url` | visual-producer |
| `domain` = `sortmycover.co.za` (already seeded) | — |

**`.env` names (Jonathan types the values; nothing else stores them):** `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID`, `WA_STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN`, `WA_2FA_PIN_STANDBY`, `WHATSAPP_TEST_PHONE_NUMBER_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_SYSTEM_USER_TOKEN`, `META_CAPI_TOKEN`, `META_PIXEL_ID`, `META_DATASET_ID`, `META_API_VERSION`, `META_TEST_EVENT_CODE`, `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID`, `FLOW_PRIVATE_KEY`, `FLOW_PRIVATE_KEY_PASSPHRASE`, `FLOW_PUBLIC_KEY`, `FLOW_ENDPOINT_URL`.

**Section 7 lines this runbook turns green (W27 health must read them back):** Page + IG live, linked, disclosure in About, 7-day warm-up done; Business Portfolio verified or submitted; all Meta IDs in the `brands` row; Pixel/CAPI domain verified, event priority set, EMQ at least 6, exclusions + engagement audiences created; Pixel + CAPI verified in Events Manager, Lead Ads webhook subscribed and tested; Campaigns A, B, C created per spec with the Special Ad Category decision recorded; WhatsApp number live, Business Verification complete, display name approved, standby number on the same WABA; ads approved and Off (after G11c).

---

## 13. Screen differs (fill in during the session)

| Date | Gate/step | Runbook said | Screen showed | Screenshot | Action taken / NH line |
|---|---|---|---|---|---|
| | | | | | |

---

## 14. needs_human raised by this runbook (for the orchestrator to log; this agent did not edit `build/tasks.json`)

| Code | Issue | Default if silent |
|---|---|---|
| NH-MO-01 (money) | ~R350 paid warm-up before first payment. Now carried as **NH-31 a** in `gates-batch.md` | NH-31 a default: organic now, paid week after payment |
| NH-MO-02 | GATE-DOMAINS may be deferred. Page/IG website and email, WhatsApp profile website, domain verification, Pixel website URL and the three `sortmycover.co.za` URL-button templates all need the domain live | Create every asset now with those fields empty; fill them at the domain cutover (pre-go-live gate); never use the staging host |
| NH-MO-03 (money) | Two SA numbers not on WhatsApp. Now **NH-31 b** | Test number until payment |
| NH-MO-04 | Standby Page name not specified | `SortMyCover South Africa` |
| NH-MO-05 | `brands` has no `standby_page_id` or reschedule Flow id column | `handles.fb_standby_page_id` and `.env` `RESCHEDULE_FLOW_ID`; additive migration later |
| NH-MO-06 | `PHONE_NUMBER_ID` and `WA_PHONE_NUMBER_ID` both used | Same value in both; automation-engineer unifies |
| NH-MO-07 | Standby number sends `ops_*` | Yes |
| NH-MO-08 | "Event priority set" may not be configurable | Record the screen; mark the line "not configurable, recorded {date}" |
| NH-MO-08b | Section 7 says "EMQ at least 6"; with no email sent to Meta (0.1) EMQ may sit below 6 after all five levers | Record the value and levers applied; the line reads "EMQ {n}, email excluded by 0.1"; never add email |
| NH-MO-09 | One source per Meta audience | `SMC_EXC_leads_90d_pix` and `SMC_EXC_leads_90d_list`, both excluded |
| NH-MO-10 | ~~No creative manifest~~ **Closed:** `deliverables/visual-producer/assets/manifest.json` and `first-batch.csv` exist | — |
| NH-MO-11 (money) | Ads in an Off campaign may not be reviewed; switching on spends. Now **NH-31 c** | Leave off |
| NH-MO-12 | 4.6 "never marketing templates" vs 0.3 #1 "accept" | Accept and log; `_u2` rewrite; no lead-facing marketing template in production without Jonathan's yes |
| NH-MO-13 | Sample FSP. **Partly closed:** JSON examples and brand templates use `00000 (SAMPLE)` (R4 §1 #8-9). **Still open (owner, not Jonathan):** `automation/templates/samples/intro_card_sample.png` shows "FSP 12345" (viewed 2026-10-02); visual-producer re-renders | Hold the IMAGE templates until fixed |
| NH-MO-14 | Standby use limited by `appeal-playbook.md` §9. Now **NH-31 d** | Acknowledged by default |
| NH-MO-15 | NH-19a AI sentence: not in the three `broker_intro_*` JSON files; NH-38 default is "yes"; DW §3 says the intro templates stay verbatim | Hold those three; if yes/default, automation-engineer adds the sentence before submission |
| NH-MO-16 (owner: media-buyer) | `first-batch.csv` rows C14, C06, C07, C15: `landing_url` = site root while `landing_page_status` holds a page URL (looks like a shifted column) | Do not enter a website link on those ads until media-buyer confirms |
