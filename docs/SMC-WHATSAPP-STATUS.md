# SortMyCover WhatsApp: status (13 Oct 2026, 15:25 SAST)

Everything below is in Twilio **subaccount** `ACb4df9d33c7da9632689...` ("Lead Velocity - SortMyCover"), WABA `1370588024885127`. No messages were sent.

## 1. Sender: OFFLINE (blocked)

| Field | Value |
|---|---|
| Sender SID | `XEad043d7ed53be644bfcc03305fa3c8db` (2nd attempt; 1st `XE1665ca92…` deleted before the retry) |
| sender_id | `whatsapp:+27600156480` |
| Status | **OFFLINE**, from the first poll on both attempts (polled 13:16–13:22 UTC) |
| offline_reasons | `410 "Something went wrong. Please create a support ticket"` (+ an empty `code 0` entry) |
| Profile name | SortMyCover |
| Webhook / status callback | `https://n8n.sortmycover.co.za/webhook/whatsapp-twilio` (POST), both |
| Monitor alerts | none for the sender |

The other sender in the subaccount is the sandbox number `XE4845bc5…` (`whatsapp:+14155238886`), OFFLINE, oddly tagged with the same `waba_id`.

**Most likely cause:** the number is still registered in the WABA from the 12 Oct Self Sign-up (WhatsApp Manager shows it Offline) and Meta refuses the new registration. Twilio's docs for the same situation (errors 63110/63111) say: turn off **two-step verification** for +27 60 015 6480 in WhatsApp Manager, then register again. **What to do:**
1. WhatsApp Manager > Phone numbers > +27 60 015 6480 > Settings > Two-step verification > turn it off.
2. Delete `XEad043d…` and POST the same body again (`configuration.waba_id`, profile name, webhook as above). OR register it in Console > Messaging > Senders > WhatsApp senders, picking the same WABA.
3. If it still fails with 410: open a Twilio support ticket and quote the sender SID (the error text asks for one).

## 2. Templates (Content API, subaccount)

All submitted as UTILITY on 13 Oct. Meta reviews templates on the WABA, so the sender doesn't need to be online for this.

| Key | Friendly name | ContentSid | Approval |
|---|---|---|---|
| qualify_budget | smc_qualify_budget | `HX5a0030506140a58a86e8611f15a5af64` | pending (footer now "SortMyCover") |
| booking_confirmed | smc_booking_confirmed | `HXea3cd0796b41eab3c0442a816b0ed435` | pending |
| reminder_24h | smc_reminder_24h | `HX02f04ccea1c7fb96bc5f098772927c7e` | pending |
| reminder_2h | smc_reminder_2h | `HX3cf59689cfadd5dca289581e6049df34` | pending |
| missed_you | smc_missed_you | `HX432f7dc78379e11a9e8a5e8b39859d6d` | pending |
| lead_low_budget_held | smc_lead_low_budget_held | `HX46399a6d0efa134f7832eb64beedbdba` | pending |
| lead_low_budget_closed | smc_lead_low_budget_closed | `HX919aaa38c6a10c5b76fe9937486fede0` | pending |
| booking_hold_released | smc_booking_hold_released | `HXfebaf08916d9210839cac68a9a01d8d3` | pending |
| booking_held_verify_email | smc_booking_held_verify_email | `HX7fe6182529e714389b8abb4bce04fa95` | **REJECTED: INCORRECT_CATEGORY** (Twilio alert 63040). The parent-account copy was rejected too. Meta most likely reads "reply here with the 6-digit code" as AUTHENTICATION. The copy needs to change (for example, drop the code and keep only the emailed link). That is Jono's wording call. |
| broker_intro_booked | smc_broker_intro_booked | not created | **blocked: media host** |
| broker_intro_slots | smc_broker_intro_slots | not created | **blocked: media host** |

**Media host blocker:** both `broker_intro_*` templates are `twilio/card` with an image header at `TWILIO_MEDIA_BASE_URL/{{8}}`, which defaults to `https://media.sortmycover.co.za`. That domain does not exist (NXDOMAIN), and `sortmycover.co.za/samples/…` returns 404. The base host is fixed into the approved template, so pick the real host first. Then serve `samples/intro_card_sample.png` from it and run:
`TWILIO_MEDIA_BASE_URL=https://<host> node automation/templates/twilio/submit-twilio.mjs --submit --only broker_intro_booked` (and `broker_intro_slots`), using the subaccount credentials.
Their text keeps the NH-19a sentence "Our WhatsApp assistant uses AI." (README default).

The 13 session-only types needed no approval. They were created in the subaccount too, because SUB-whatsapp-send looks them up from `TWILIO_CONTENT_SIDS`.

The 45 `smc_*` resources in the parent (Vantage Stack) account were left untouched. Today: 25 approved, 1 rejected (booking_held_verify_email), 13 session (unsubmitted), no broker_intro_*.

**Repo change (uncommitted):** `automation/templates/qualify_budget.json` footer is now "SortMyCover", and `twilio/content/qualify_budget.json` was regenerated. `check.mjs` passes with 0 errors, and `build-content --check` is up to date.

## 3. n8n switch list (live n8n still points at the PARENT account)

n8n runs as `lv-n8n-n8n-1` on 76.13.252.92. Its env file is `/opt/leadvelocity-n8n/repo/.env` (compose `env_file: ../.env`). Apply changes with `/opt/leadvelocity-n8n/dc up -d n8n`. Current state: `WHATSAPP_PROVIDER=twilio`, `DRY_RUN_SENDS=true`, `TWILIO_WHATSAPP_FROM=whatsapp:+27600156480`, `TWILIO_ACCOUNT_SID=AC298256…` (**parent**), `TWILIO_AUTH_TOKEN` = parent, and `TWILIO_CONTENT_SIDS` = 42 **parent** SIDs. No `TWILIO_API_KEY_*` is set.

| What | Change to | Why |
|---|---|---|
| `.env` `TWILIO_ACCOUNT_SID` | `ACb4df9d33c7da9632689...` | outbound sends (SUB-whatsapp-send), W23 media, W01/W06/W15/W22 URLs |
| `.env` `TWILIO_AUTH_TOKEN` | subaccount auth token | outbound Basic auth (no API key set) **and** W07/W15 inbound `X-Twilio-Signature`. Inbound from the subaccount number is signed with the subaccount token, so with the parent token every inbound message fails the check. |
| `.env` `TWILIO_API_KEY_SID` / `_SECRET` | leave empty, or a key created **in the subaccount** | a parent key would act on the parent account |
| `.env` `TWILIO_CONTENT_SIDS` | the JSON below | parent SIDs belong to the Vantage Stack WABA |
| `.env` `TWILIO_MEDIA_BASE_URL` | the real media host (see blocker) | intro cards |
| n8n credential `lv-twilio-apikey` "Twilio API key (Basic)" (httpBasicAuth, used by W01 Lookup, W06/W15 SMS, W22 voice) | user = subaccount SID, password = subaccount token (or a subaccount API key) | it currently holds the earlier values |
| W32 credential "Twilio (SMC voice)" | not in the n8n DB yet; create it with subaccount creds when W32 is imported | |
| `TWILIO_WHATSAPP_FROM` | already `whatsapp:+27600156480` | no change |

New `TWILIO_CONTENT_SIDS`. Only approved templates actually send; until then SUB-whatsapp-send skips or falls back:
```
{"qualify_budget":"HX5a0030506140a58a86e8611f15a5af64","booking_confirmed":"HXea3cd0796b41eab3c0442a816b0ed435","reminder_24h":"HX02f04ccea1c7fb96bc5f098772927c7e","reminder_2h":"HX3cf59689cfadd5dca289581e6049df34","missed_you":"HX432f7dc78379e11a9e8a5e8b39859d6d","lead_low_budget_held":"HX46399a6d0efa134f7832eb64beedbdba","lead_low_budget_closed":"HX919aaa38c6a10c5b76fe9937486fede0","booking_hold_released":"HXfebaf08916d9210839cac68a9a01d8d3","smc_session_buttons_1":"HXe2d65f66f3545edfc28986842f39c50e","smc_session_buttons_2":"HX08def79c5f87a9db5ef675e3d6e80dd3","smc_session_buttons_3":"HX8bfed26ec4aa02bb94da7040a9ec2bdd","smc_session_list_1":"HXfda8b036ce60e8d3cb9756f48bad8022","smc_session_list_2":"HX090a07097dc1c69e5d7c52ad6e0f4cdf","smc_session_list_3":"HXbdd4dbce927b7c8e15080fa57fbc7194","smc_session_list_4":"HXb1f46c5811683d68b57becfc4de0a680","smc_session_list_5":"HXb36c081aa2fe608dedeb6dd716c5219b","smc_session_list_6":"HXea8a85f407291b5beaee3fedb430d26b","smc_session_list_7":"HXacba5c98ed6690335bef2f1475515493","smc_session_list_8":"HX2776344c89913d3be475072776be9273","smc_session_list_9":"HXd3645c358b9a6a482ee51f51b5d4d6c2","smc_session_list_10":"HX948477e1ab9bbde6f090e608af146f00"}
```
The other 21 template keys that live n8n maps today (attended_thanks, broker_*, precall_brief, reach_check, etc.) have no subaccount resource yet. Dropping them from the map is correct: a parent SID can't send from the subaccount. Submit them later with `submit-twilio.mjs --submit` using subaccount creds.

Also, `public.brands.phone_number_id` for SMC should be `27600156480` (SETUP-TWILIO step 2.5). This wasn't checked here.


## 13 Oct update
- booking_held_verify_email reworded (no 6-digit code: email link only; email is collected only when the client confirms a booking, on WhatsApp or the landing page) and resubmitted as smc_booking_held_verify_email_v2 = HXbfc57907a49db8c4aeb8bf98b67ebe33 (received). Update TWILIO_CONTENT_SIDS.
- Approved so far: booking_confirmed, reminder_24h, missed_you, lead_low_budget_held, lead_low_budget_closed. Pending: qualify_budget, reminder_2h, booking_hold_released.

## 14 Oct update: quiz v2 band step on WhatsApp (SUPERSEDES the sender and template status above)
- **Sender `whatsapp:+27600156480` is ONLINE** in the subaccount (checked 14 Oct 02:0x SAST; the sandbox number `+14155238886` is OFFLINE). The VPS env already points at the subaccount (`TWILIO_ACCOUNT_SID` AC**b4df9d**, 22 subaccount content SIDs), `DRY_RUN_SENDS=true` unchanged. `brands.phone_number_id` for SMC is `27600156480`.
- **`smc_qualify_budget` (HX5a0030506140a58a86e8611f15a5af64) is APPROVED**, UTILITY, `whatsapp/card`, five quick replies: Under R500, R500 to R750, R750 to R1,250, R1,250 to R1,499, R1,500 or more; the tap ids are sent as variables 2 to 6 (`budget_under_500` ... `budget_1500_plus`), which are W03's ids.
- **What now sends it:** every quiz v2 web lead (routed or held) gets it from W01 as the band question; the tap goes W07 -> W03 and sets the band, then W05 finalize hands a held booking over once the email is verified. Full description, live state, tests and open decisions: `docs/W01-QUIZ-V2-DEPLOY.md`.
- **Blocker found and NOT fixed (needs Jono's OK, it is DDL):** `smc-whatsapp-send` cannot read or write `public.communications` as `n8n_app` (legacy policies read `user_roles`; "permission denied for table user_roles"). Migration `supabase/migrations/20261014010000_n8n_app_user_roles_select.sql` (one GRANT, undo included) fixes it. Until it is applied no n8n WhatsApp send can complete or be recorded, dry-run included.
- **Also fixed:** W01 wrote `leads.source = 'LV Campaign'`, which the live `leads_source_check` rejects, so no lead could be saved; now `'Campaign Lead'`.
- **Active n8n workflows after the 14 Oct deploy:** `smc-w01`, `smc-w36`, `smc-whatsapp-send` only. W07 (the inbound webhook) is inactive, so a tap does not reach n8n yet.
- The `booking_held_verify_email_v2` content SID (HXbfc57907a49db8c4aeb8bf98b67ebe33) is in the VPS map already; the template-status lines in section 2 are history.
