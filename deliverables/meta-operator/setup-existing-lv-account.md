# SortMyCover: Meta setup on the EXISTING Lead Velocity portfolio (laptop click-path)

Date 2026-10-04. Nothing here has been clicked, bought, submitted or published. Jonathan clicks every step marked (J). Full detail per gate is in `setup-checklist.md` (G1 to G11); this file is only what still needs doing. Rules: use the existing portfolio (never create a second one); no card or token typed by the agent; IDs go into the console `brands` row (code SMC), secrets into `.env` only (names below, values never in chat).

Decision flag (needs_human, NH-MO-17): `build/inventory.md` INV-I02 says "Twilio WhatsApp is not the SortMyCover channel (Cloud API direct)", and W06/W07/W22/W27 and the template `submit.sh` assume the Graph API. Branch B is therefore a change to the build, not just a click-path. Jonathan's decision is recorded before any WhatsApp number is registered (a number can only sit in one place).

---

## 0. Check first (about 15 minutes, nothing is created)

| # | Where | Check | If yes | If no |
|---|---|---|---|---|
| 0.1 | business.facebook.com > Settings > Business info | Legal name reads exactly `Lead Velocity (Pty) Ltd`; address and website match CIPC | Skip G1 steps 1 to 3 | Fix the fields first (verification fails on mismatches) |
| 0.2 | Settings > Security Center | Business verification status: Verified / In review / Not started. 2FA required for everyone; two admins (Jonathan + KG) | Verified: skip. In review: wait, carry on. | Not started: start it (checklist G1 step 7). Wait: usually days; an external clock, build does not wait. |
| 0.3 | Settings > Accounts > WhatsApp accounts | Any existing WABA? Which numbers? Are they on the WhatsApp app, or used by Twilio today? | Reuse only if its name and number suit SortMyCover; else create a new WABA named `SortMyCover` in the same portfolio | Create new at step 3 |
| 0.4 | Settings > Accounts > Pages / Instagram accounts | Is there a SortMyCover Page and @sortmycover already? (Do not reuse the B2B Lead Velocity Page.) | Skip step 1 | Create at step 1 |
| 0.5 | developers.facebook.com > My Apps | Existing app inside this portfolio (for example `Lead Velocity Platform`)? | Reuse; skip app creation | Create at step 6 |
| 0.6 | Settings > Accounts > Ad accounts | Existing ad account: currency ZAR, time zone Africa/Johannesburg (cannot be changed later)? Card on it? | ZAR + Johannesburg: reuse as `SortMyCover - Main`. Wrong currency/zone: do not use; create a new one | Create at step 2 |
| 0.7 | Settings > Data sources > Datasets | Existing pixel/dataset? | Reuse only if empty and unrelated; otherwise create `SortMyCover` | Create at step 5 |
| 0.8 | Decision (J) | Two SA numbers not on WhatsApp (main + standby)? WhatsApp route A or B? | Proceed | Stay on Meta's test number (NH-31 b default) |

Write what you found into section 13 of `setup-checklist.md` (screen differs table), with screenshots.

---

## Steps (same for both branches unless marked A or B)

### 1. Page and Instagram (J creates) , G2. Wait: none (domain/email fields wait for GATE-DOMAINS)
- Settings > Accounts > Pages > Add > Create a new Page. Name `SortMyCover`, category `Website` (never insurance/financial). About text DISC-FULL-v1. Then create Instagram @sortmycover from the Page (Business type).
- Copy back: `page_id` and `ig_user_id` (into the `brands` row; no env var).

### 2. Ad account (J) , G3. Wait: none; a second account may be refused until verification/spend
- Reuse or create `SortMyCover - Main` (ZAR, Africa/Johannesburg, "My business"). Add Page, Instagram. Add the card yourself (J only). Standby account: same, if Meta allows.
- Copy back: `ad_account_id` (act_...), `standby_ad_account_id` (brands row).

### 3. WhatsApp , G4 (branches differ here)

**A. Meta Cloud API direct**
1. Business Settings > Accounts > WhatsApp accounts > Add (or WhatsApp Manager > Create). Name `SortMyCover`, inside the Lead Velocity portfolio. Category Education/Other. (J accepts WhatsApp terms.)
2. Add phone number: display name exactly `SortMyCover`; verify by SMS/voice code (J types it). Set the 6-digit two-step PIN (J, `.env` only).
3. Add the standby number the same way. Link the main number to the Page.
4. Profile photo, About, description per checklist G4 step 6 (website/email after the domain is live).
- Env vars (J types): `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID` (same value), `WA_STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN`, `WA_2FA_PIN_STANDBY`. Until the real numbers exist: `WHATSAPP_TEST_PHONE_NUMBER_ID`. Brands row: `waba_id`, `phone_number_id`, `standby_phone_number_id`.
- Wait: display-name review, usually hours to a few days; read it off the screen, do not assume.

**B. Twilio (WhatsApp Sender via embedded signup)**
1. Twilio Console > Messaging > Senders > WhatsApp senders > Create new sender (menu wording may differ; if it does, screenshot and log it). Choose Twilio number or your own number.
   - Own number: must not be active on the WhatsApp app; must receive an SMS or voice code. It moves to Twilio/Cloud API.
   - Twilio number: a Twilio-owned SA number if available; it cannot be one currently used for voice/AI calls unless you accept it being tied to WhatsApp (check; the CRM already uses `TWILIO_PHONE_NUMBER`).
2. Continue with Facebook (embedded signup, J logs in). At the portfolio step, **select the existing `Lead Velocity (Pty) Ltd` portfolio** (never "create new"). Create or select the WABA named `SortMyCover`. Display name exactly `SortMyCover`. Confirm the WABA appears in Meta Business Settings under WhatsApp accounts afterwards, owned by the Lead Velocity portfolio.
3. Back in Twilio, set the sender profile (photo, About, description, website, email) and the inbound/status webhook URLs (to the W07 tunnel URL, not leadvelocity staging on any consumer surface).
4. Standby number: a second sender on the same WABA.
- Env vars (J types): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (format `whatsapp:+27...`), `WABA_ID` (read from Meta WhatsApp accounts). Proposed new, needs automation-engineer: `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_WHATSAPP_STANDBY_FROM`. `PHONE_NUMBER_ID` is only needed if you still call the Graph API on the number; Twilio owns the number registration, so the PIN steps in A do not apply.
- Brands row: `waba_id` (and `phone_number_id` if Meta shows it).
- Wait: Twilio sender review plus Meta display-name review, typically hours to days; Meta's own timeline is read off the screen.
- Consequences to accept (log in NH-MO-17): messages and templates run through Twilio (per-message Twilio fee on top of Meta's; Content Template Builder rather than `submit.sh`/Graph); `message_template_status_update` and quality events arrive via Twilio/Meta webhook config, so W22/W27 and W06/W07 need a Twilio adapter; WhatsApp Flow publish (W28) may not be available through Twilio, so the 10-slot list stays the booking path (pre-mortem #3 already covers this).

### 4. Templates (J submits) , G10. Wait: 1 to 48 h each; accept Meta's category decision (pre-mortem #1)
Submit these **6 core templates first**, in this order, the same day the number exists:
1. `broker_intro_booked`
2. `broker_intro_slots`
3. `booking_confirmed`
4. `reminder_24h`
5. `reminder_2h`
6. `missed_you`

Holds before any submit: the intro-card image header still shows "FSP 12345" (must be `00000 (SAMPLE)`) and the three `broker_intro_*` carry the AI sentence (NH-19a: keep or delete). Both sit with their owners, not Jonathan. Then the remaining 46 per `template-submission-runbook.md`.
- A: Graph via `submit.sh` (needs `WABA_ID`, `META_SYSTEM_USER_TOKEN`) or WhatsApp Manager.
- B: Twilio Content Template Builder, "Request WhatsApp approval"; same JSON text, new `content_sid` per template (store the SIDs; name of var to be set by automation-engineer).

### 5. Dataset/Pixel , G5. Wait: none; domain verification waits for sortmycover.co.za to be live
- Events Manager > Connect data sources > Web > `SortMyCover`; Automatic advanced matching OFF; allow list `sortmycover.co.za` only. Add the ad account(s).
- Env vars: `META_PIXEL_ID`, `META_DATASET_ID`. Brands row: `pixel_id`, `dataset_id`.
- Later (domain live): Business Settings > Brand safety > Domains > Add `sortmycover.co.za` (meta-tag, value goes into the holding page, not chat). Then Dataset > Settings > Generate token (J) into `.env` as `META_CAPI_TOKEN` (and `META_TEST_EVENT_CODE` for staging).

### 6. App, system user, token, webhooks , G6. Wait: none
- Reuse or create the Business app (`Lead Velocity Platform`) in this portfolio. Products: Marketing API, Webhooks (and WhatsApp for branch A). Standard access only; no App Review. Require app secret ON. Live mode once the privacy URL is set.
- Business Settings > System users > Add `smc-automation` (Admin). Assign Page, IG, ad accounts, dataset, app (and WABA for A; for B too, so Meta-side health reads still work). Generate token, expiry Never (J); paste into `.env`.
- Env vars: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_SYSTEM_USER_TOKEN`. Brands row: `app_id`, `system_user_token_ref = META_SYSTEM_USER_TOKEN`.
- Subscribe webhooks: Page (`leadgen`, `messages`), Instagram, and for A the WhatsApp object. For B, WhatsApp events go through Twilio instead. Leads Access for the system user.

### 7. Later gates (not today)
Audiences (G7), warm-up (G8; paid part is NH-31 a money decision), handles (G9), campaigns and the Special Ad Category check (G11). Payment path for the cycle is manual EFT per NH-61 (Paystack is post-launch); ad money split per NH-64 (6 ads in cycle 1). No decision from Jonathan is needed for the steps above.

---

## What Jonathan must decide before step 3
1. Route A or B (see decision flag; build impact listed under B).
2. Which numbers (own, Twilio, or test number only until payment, NH-31 b).
