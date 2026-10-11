# SETUP-TWILIO: putting the SortMyCover WhatsApp flow on the CRM's Twilio account

Owner: Jonathan. Everything below is a step only Jonathan can take (an account, a purchase, a Meta login, an approval). The code side is done and tested offline (`automation/tests/twilio-flow.test.mjs`, `wa-provider.test.mjs`, `SUB.test.mjs`, the rehearsal). **Nothing has been sent, bought or submitted.**

How it works now: every WhatsApp message any workflow sends goes through one sub-workflow, `SUB-whatsapp-send` (`smc-whatsapp-send`). With `WHATSAPP_PROVIDER=twilio` it posts to Twilio's Messages API with a `ContentSid`; inbound messages, taps, Flow completions and delivery receipts arrive at W07 `POST /webhook/whatsapp-twilio`. The Flow screens are still served by W28 (Meta calls it directly; Twilio only carries the Flow message). Every message in and out is a `communications` row, so it shows on the lead in the CRM's communication hub.

**Base URL.** `<N8N_PUBLIC_URL>` below is n8n's public base. Today (n8n on the EMMA VPS) it is `https://n8n.sortmycover.co.za`, so the inbound webhook is `https://n8n.sortmycover.co.za/webhook/whatsapp-twilio` and the Flow endpoint `https://n8n.sortmycover.co.za/webhook/flow`. After W26 it becomes `https://<API_HOST>`.

## 1. Buy the number (Twilio Console, the CRM's existing account)
1. Phone Numbers > Buy a number > Country **South Africa (+27)**, capability SMS (WhatsApp needs to receive the one-time code by SMS or voice). South African numbers need a **Regulatory Bundle** (business address + company documents) before Twilio releases them; create it under Phone Numbers > Regulatory Compliance if asked.
   - If Twilio has no suitable +27 number, a **non-Twilio** SA mobile number that can receive the code also works as a WhatsApp sender (Twilio supports both).
2. Note the number as `+27…`. Never use a +1 / US number for this flow.

## 2. Register it as a WhatsApp sender (same WABA as the existing sender)
1. Console > Messaging > Senders > WhatsApp senders > **Create new sender**, pick the number from step 1.
2. **Continue with Facebook**, choose the existing Meta Business Portfolio **and the same WhatsApp Business Account the account already uses** (Twilio allows one WABA per account; picking another gives errors 63102 / 63111).
3. Verify by SMS or voice code. **Display name: `SortMyCover`** (Meta checks it against the business; sortmycover.co.za should show the name).
4. On the sender, set **Webhook URL for incoming messages** = `<N8N_PUBLIC_URL>/webhook/whatsapp-twilio` (POST) and the **status callback URL** to the same URL. (Every send also sets `StatusCallback` to it.)
5. Set the env and the brand row:
   ```
   TWILIO_WHATSAPP_FROM=+27…            # the new sender
   ```
   ```sql
   -- the receiving number identifies the brand under Twilio (W07 phone_number_id = the sender digits)
   UPDATE public.brands SET phone_number_id = '27…' WHERE code = 'SMC';
   ```

## 3. Meta: create and publish the Flows on that WABA (WhatsApp Manager)
Flows are created in Meta, then referenced by Twilio. W28 stays the endpoint.
1. WhatsApp Manager > Flows > Create: paste `automation/flows/booking-flow.json`; a second Flow from `automation/flows/reschedule-flow.json`.
2. Endpoint URI: `<N8N_PUBLIC_URL>/webhook/flow` (W28). Upload the endpoint public key for **the new number** (`POST /{phone-number-id}/whatsapp_business_encryption`, form field `business_public_key`; the matching private key is W28's `FLOW_PRIVATE_KEY`). Re-upload whenever the number is re-registered.
3. Run Meta's endpoint health check, then **Publish**. Put the ids in the env: `BOOKING_FLOW_ID=…`, `RESCHEDULE_FLOW_ID=…`.
4. Keep `brands.booking_ui = 'list'` until the Flow templates in step 5 are approved; then set it to `'flow'`.

## 4. Media and links
1. Serve the approved intro cards and videos under **one static https host**, `TWILIO_MEDIA_BASE_URL` (default `INTRO_PUBLIC_BASE`, then `https://media.sortmycover.co.za`). Twilio Content templates take only a variable *path* on a fixed domain; a card outside that host is not sent (`twilio_media_outside_base`).
2. Put the review samples there too: `samples/intro_card_sample.png` and `samples/intro_video_sample.mp4` (from `automation/templates/samples/`). Twilio/Meta fetch them during approval.
3. Traefik (already in `vps/traefik/docker-compose.traefik.yml`): `LINK_HOST` `/j/*` (Teams join redirect, W05) and `/v/*` (email link, SUB-email-verify) besides `/c/*` and `/wa/*`; `/webhook/whatsapp-twilio` and `/webhook/flow` on `API_HOST`.

## 5. Templates (Twilio Content API + WhatsApp approval)
1. Dry run (sends nothing): `node automation/templates/twilio/submit-twilio.mjs` (or `--core` for the 7 first-day templates + the session types).
2. When steps 2–4 are done: `node automation/templates/twilio/submit-twilio.mjs --submit --core`, then `--submit` for the rest. It creates each Content resource and files the WhatsApp approval (UTILITY) for every type that needs one (cards, call-to-action, Flows); session buttons and lists need none.
3. Paste the printed `TWILIO_CONTENT_SIDS={…}` into the n8n env. Approval status: Console > Content Template Builder (or `GET /v1/Content/{sid}/ApprovalRequests`).
4. The definitions are generated from the reviewed Meta templates: `node automation/templates/twilio/build-content.mjs` (re-run after any template edit; `--check` is in the test suite).

## 6. Email verification (Resend, hello@sortmycover.co.za)
1. In Resend, verify the domain **sortmycover.co.za** (SPF + DKIM records) so `hello@sortmycover.co.za` can send. The key is the CRM's existing `RESEND_API_KEY`; copy it into the n8n env.
2. Set `EMAIL_VERIFY_SECRET` (32+ random characters). Optional: `VERIFY_EMAIL_FROM`, `VERIFY_EMAIL_REPLY_TO`, `VERIFY_BASE_URL`.

## 7. Switch on (staging first)
```
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC…               # the CRM's account (already in the CRM edge functions)
TWILIO_API_KEY_SID=SK…  TWILIO_API_KEY_SECRET=…   # outbound + media download (or leave empty: AccountSid + Auth Token are used)
TWILIO_AUTH_TOKEN=…                  # REQUIRED: X-Twilio-Signature is signed with the primary Auth Token, never an API key secret
WEBHOOK_URL=<N8N_PUBLIC_URL>/       # the signature covers this URL + webhook/whatsapp-twilio
DRY_RUN_SENDS=true                   # first: nothing leaves, rows get dry: ids
WHATSAPP_TEST_RECIPIENTS=+27…        # then: only your own phone
```
Then `DRY_RUN_SENDS=false` with the allow-list, run the day-in-the-life rehearsal (tests/README.md), and only then clear the allow-list.

## 8. Check once on the live sender (marked UNCONFIRMED in the code)
- A list-picker reply: does Twilio send `ListId` / `ListTitle`, or the row id as `ButtonPayload`? Both are handled; note which.
- An approved card (`twilio/card` / `whatsapp/card`) with **variable** quick-reply ids and a URL button on the same template (the reminders and the intro card need it). If Twilio refuses the mix, split the template (URL-only + quick replies) and regenerate.
- `MessageType` values on inbound (not read by the code; useful for the debugger).

## Environment variables (names only)
| Name | Used by | Notes |
|---|---|---|
| `WHATSAPP_PROVIDER` | SUB-whatsapp-send, W07 | `twilio` (default `meta`) |
| `TWILIO_ACCOUNT_SID` | SUB-whatsapp-send, W23, submit-twilio | the CRM's account |
| `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | SUB-whatsapp-send, W23, W07 Lookup, submit-twilio | Basic auth (falls back to AccountSid:AuthToken) |
| `TWILIO_AUTH_TOKEN` | W07 | inbound signature only |
| `TWILIO_WHATSAPP_FROM` | SUB-whatsapp-send | the SortMyCover sender, `+27…` |
| `TWILIO_CONTENT_SIDS` | SUB-whatsapp-send | JSON from submit-twilio |
| `TWILIO_MEDIA_BASE_URL` | SUB-whatsapp-send, submit-twilio | static media host |
| `WEBHOOK_URL` | W07, SUB-whatsapp-send | signature URL + StatusCallback |
| `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID` | W06, W10, submit-twilio | published Meta Flow ids |
| `RESEND_API_KEY`, `EMAIL_VERIFY_SECRET`, `VERIFY_EMAIL_FROM`, `VERIFY_EMAIL_REPLY_TO`, `VERIFY_BASE_URL` | SUB-email-verify | email verification |
| `DRY_RUN_SENDS`, `WHATSAPP_TEST_RECIPIENTS` | every send | staging gates |

## What stays Meta-only (unavoidable)
- Creating, publishing and encrypting the **Flows** (WhatsApp Manager / Flows API on the WABA, step 3) and the W28 endpoint Meta calls.
- Meta's display-name review and the WABA itself.
- `WHATSAPP_PROVIDER=meta` keeps working unchanged (the Graph path in SUB-whatsapp-send and the Meta webhook in W07) as the fallback.
- Out of the nurture scope and still on Graph: W14, W20, W22 (ops alerts), W29, W32, W35 (dropped layers, CRM-NURTURE-SCHEMA.md D5).

## Sources (checked 2026-10-11)
Twilio: content-api-resources, whatsapp-flows, twilio-quick-reply, twiliolist-picker, twiliocard, whatsappcard, twilio-call-to-action, content-types-overview, send-templates-created-with-the-content-template-builder, messaging/guides/webhook-request, track-outbound-message-status, usage/security, messaging/api/media-resource, whatsapp/self-sign-up, api/errors/63016 and 63102 (all under https://www.twilio.com/docs/). Meta: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint and the Flows error-code reference.
