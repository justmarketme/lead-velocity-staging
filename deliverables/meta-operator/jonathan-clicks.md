# What Jonathan clicks: one page per gate

Owner: meta-operator. 2026-10-02. For Jonathan on the laptop, with the Chrome agent filling fields and reading them back. **Only you click the ★ buttons, type codes, cards and tokens.** Full detail and screenshots: `setup-checklist.md` (G1 to G11) and `template-submission-runbook.md`. Nothing here has been done yet.

Three rules on every page: (1) never type `sortmycover.leadvelocity.co.za` or any leadvelocity URL on a SortMyCover surface; (2) a secret goes straight into `.env` (names below), never chat, screenshots or the console; (3) if the screen differs from this page, stop and tell the agent.

---

## Gate P: GATE-META-PORTFOLIO (business.facebook.com)

| ★ You click | Field values |
|---|---|
| Create business portfolio (only if no Lead Velocity portfolio exists) | Name `Lead Velocity (Pty) Ltd` · your legal name · email `howzit@leadvelocity.co.za` |
| Save Business info | Legal name `Lead Velocity (Pty) Ltd` (exactly as CIPC) · CIPC registered address (NH-20) · business phone · website `https://leadvelocity.co.za` |
| Send invite to KG | Full control (admin) |
| Two-factor: Required for everyone | Both admins show 2FA on |
| Start verification → upload → Submit | CIPC CoR 14.3 · FNB confirmation letter (same address) · domain or email check on leadvelocity.co.za |

`.env`: none. Agent records `business_id`.

---

## Gate S: GATE-META-PAGE-IG

**Facebook Page** (Settings → Accounts → Pages → Create new Page inside the portfolio)
| ★ You click | Field values |
|---|---|
| Create Page | Name `SortMyCover` · Category **`Website`** (second: `Education`). **Never** Insurance / Financial service |
| Save | Username `sortmycover` |
| Save | Intro (S97): `A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes.` |
| Save | About (DISC-FULL-v1): `SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.` |
| Save (only once the domain is live / the alias works) | Website `https://sortmycover.co.za` · Email `hello@sortmycover.co.za` |
| Save | Phone, address, price: empty · Profile `brand/exports/profile/fb-profile-1024.png` · Cover `brand/exports/cover/fb-cover-851x315@2x.png` |
| Assign people | You + KG full control (through the portfolio only) |
| Create standby Page | `SortMyCover South Africa`, same category, intro, About, images |

**Instagram** (from the Page → Linked accounts → Instagram)
| ★ You click | Field values |
|---|---|
| Create / Connect (type **Business**) | Username `sortmycover` · Name `SortMyCover` |
| Save | Bio (S148): `A service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. No advice, product comparisons or premium quotes.` · Link `https://sortmycover.co.za` (after domain) · Category `Website`/`Education`, display off · Photo `brand/exports/profile/ig-profile-1024.png` |
| Create @coverklaar | Parked: no posts, no bio, not linked to ads |

`.env`: none. Agent records `page_id`, `ig_user_id`, handles.

---

## Gate W: GATE-WABA (WhatsApp Manager, inside the portfolio)

| ★ You click | Field values |
|---|---|
| Create WhatsApp Business Account + accept WhatsApp terms | Name `SortMyCover` · Africa/Johannesburg · ZAR |
| Confirm category | `Education` (else `Other`); never Finance |
| Add number → type the SMS/voice code | Display name **`SortMyCover`** (no extra words) |
| Set 2-step PIN | 6 digits, into `.env` |
| Save profile | About `Sort your cover. 30 minutes. A real adviser.` · Description (DISC-WA-DESC-v1): `SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums. Our WhatsApp assistant uses AI. Type "person" at any time to reach a human. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy` (if the field is too short, stop) · Photo `brand/exports/profile/whatsapp-profile-640.png` · Website `https://sortmycover.co.za` and email `hello@sortmycover.co.za` after domain · no address |
| Add standby number (same WABA, same profile) | Display name `SortMyCover`; own PIN |
| Link primary number to the Page; assign WABA to you + KG + both ad accounts | — |

`.env`: `WABA_ID`, `PHONE_NUMBER_ID`, `WA_PHONE_NUMBER_ID` (same value), `WA_STANDBY_PHONE_NUMBER_ID`, `WA_2FA_PIN`, `WA_2FA_PIN_STANDBY`; until real numbers exist `WHATSAPP_TEST_PHONE_NUMBER_ID`.

---

## Gate A: GATE-AD-ACCOUNT (Business Settings → Ad accounts)

| ★ You click | Field values (time zone and currency are permanent: hear them read back) |
|---|---|
| Create (main) | `SortMyCover - Main` · `(GMT+02:00) Africa/Johannesburg` · `ZAR` · used for **My business** |
| Create (standby) | `SortMyCover - Standby` · same settings · no campaigns, no spend |
| Add people / assets | You + KG full control · Page, IG, WABA, dataset (standby: plus standby Page) |
| **Add payment method: you type it, the agent leaves the screen** | Your card / method |
| Spending limit (optional, money) | Your choice; no default |

`.env`: none (IDs go in the console `brands` row).

---

## Gate X: GATE-PIXEL (Events Manager + Business Settings + developers.facebook.com)

| ★ You click | Field values |
|---|---|
| Create dataset | Name `SortMyCover` · website `https://sortmycover.co.za` (after domain) · manual setup |
| Settings | Automatic advanced matching **OFF** · automatic events **OFF** · first-party cookies on · traffic allow list `sortmycover.co.za` only |
| Domains → Add → **Verify** (after the meta tag is live) | `sortmycover.co.za` (no www, no staging) · meta-tag method |
| Aggregated Event Measurement → Apply | `Lead` > `Schedule` > `Contact` > `ViewContent` > `PageView` |
| Conversions API → **Generate access token** | Paste straight into `.env` |
| Create app (or reuse) / Live mode | `Lead Velocity Platform`, Business type · privacy URL `https://leadvelocity.co.za/privacy` · Require app secret on · **Standard access only, no App Review** |
| System users → Add → Generate token | `smc-automation`, Admin, expiry **Never**, permissions per `setup-checklist.md` G6b step 3 |
| Leads Access; console "subscribe leadgen" Confirm | system user + app |

EMQ: you only read it. No email is ever sent to Meta, so EMQ may read lower than usual; the fixes are technical (fbp/fbc, external_id, IP + user agent, phone format, ctwa_clid), never email.
`.env`: `META_PIXEL_ID`, `META_DATASET_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` (staging only), `META_SYSTEM_USER_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`. Console stores only the name `META_SYSTEM_USER_TOKEN`.

---

## Gate T: GATE-TEMPLATES (laptop shell, or WhatsApp Manager)

| ★ You run / click | What |
|---|---|
| `automation/templates/submit.sh --submit --only reminder_24h` (then `reminder_2h`, `missed_you`, `booking_confirmed`) | Day-0 core items that are clear now |
| `--submit --only broker_intro_booked` / `broker_intro_slots` | Only after: intro-card PNG shows **FSP 00000 (SAMPLE)** (today it shows 12345) **and** your NH-19a answer on the AI sentence (default if silent: yes, added first) |
| `automation/templates/submit.sh --submit` | Everything else (lead-facing 13 → broker 24 → ops 7) once the PNG and video sample checks pass; `unbooked_nudge_2h`/`_72h` go with the **new** text |
| Category: accept what Meta decides | Logged by the agent; never a reason to stop the build |

`.env` used: `WABA_ID`, `META_SYSTEM_USER_TOKEN`, `META_APP_ID`, `META_GRAPH_VERSION`.

---

## Gate F: GATE-FLOW-PUBLISH (only when the endpoint has a stable hostname and all checks passed)

| ★ You run / click | What |
|---|---|
| Run the key-generation and key-registration command automation-engineer prepares | RSA-2048 pair → `.env` |
| Tap **Publish** on the `ops_gate` message (console calls publish for `SMC_booking_v1` and `SMC_reschedule_v1`) | Only after health check, Builder clean, preview, and 3 test bookings by KG |
| `submit.sh --submit --only broker_intro_slots_v2`, then `--only reschedule_offer_v2` | Flow-button templates |
| Confirm the console switch to `booking_ui = flow` | Reverts to the list automatically if the endpoint fails |

`.env`: `FLOW_PRIVATE_KEY`, `FLOW_PRIVATE_KEY_PASSPHRASE`, `FLOW_PUBLIC_KEY`, `FLOW_ENDPOINT_URL`, `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID`.

---

## Gate C: GATE-ADS-APPROVE-3 / GATE-CAMPAIGN-PUBLISH (later; detail in `setup-checklist.md` G11)

| ★ You click | What |
|---|---|
| Accept Lead Ads terms; budget field at Meta's minimum with the campaign **Off** | `SMC_A_LEADS-IF_ZA_c1` / `SMC_A_BROAD_ZA_35-50` / form `SMC_A1_HI_v1_named_{date}` |
| **Publish** (campaign stays Off) | Trio only: `C01_H1_vid-amb_*`, `C03_H3_vid-amb_*`, `C14_H10_vid-amb_*`, after the agent shows you the 4:5 Feed and Reels previews |
| Never | Switching a campaign on to force a review (that spends) |
