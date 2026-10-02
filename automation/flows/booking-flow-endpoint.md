# W28 booking Flow: endpoint contract

Applies to `booking-flow.json` and `reschedule-flow.json` (Flow JSON `version` 7.0, `data_api_version` 3.0; version is an ASSUMPTION until checked, see `deliverables/automation-engineer/verified-facts.md`).

**Launch rule:** the 10-slot interactive list (W03 step 5 fallback) ships first. The Flow is never on the critical path (0.3 #3). Turning it on is a flag flip: `brands.booking_ui = 'flow'` once the Flow is published and `broker_intro_slots_v2` / `reschedule_offer_v2` are approved. Turning it off is `brands.booking_ui = 'list'`. W22 pings the endpoint every hour. If the ping fails, `booking_ui` goes back to `list` on its own and an `ops_alert` is sent.

## 1. Encryption: reuse Meta's code, do not write your own

- Use **Meta's reference Node endpoint (WhatsApp-Flows-Tools, `examples/endpoint/nodejs`)**. Copy its `decryptRequest` / `encryptResponse` exactly as published. Our code goes only in `flow.js` (the screen logic below).
- What that code does, so a reviewer can check it:
  - unwraps the AES key from `encrypted_aes_key` with **RSA-OAEP** (SHA-256) using `FLOW_PRIVATE_KEY`;
  - decrypts `encrypted_flow_data` with **AES-128-GCM** using `initial_vector`;
  - encrypts the response with the same AES key and the **IV with every bit flipped**, then base64-encodes it.
- Every request is checked against the `X-Hub-Signature-256` HMAC with `META_APP_SECRET`. If the check fails, return 432.
- If decryption fails, return HTTP **421**. The client then fetches the public key again and retries.
- Hosting: a small service next to n8n on the VPS (local Docker plus a tunnel before payment, 0.3 #7), with HTTPS through Traefik. It can also run as an n8n Code node with `NODE_FUNCTION_ALLOW_BUILTIN=crypto`. Every response must arrive in under 3 s; we aim for 1.5 s. W04 free/busy is cached for 60 s for each broker and day.
- Key setup (W28 step 1): generate an RSA-2048 key pair. The private key goes in `.env` as `FLOW_PRIVATE_KEY` (PEM, plus `FLOW_PRIVATE_KEY_PASSPHRASE` if one is set). Register the public key with `POST /{PHONE_NUMBER_ID}/whatsapp_business_encryption` (`business_public_key=$FLOW_PUBLIC_KEY`). That call is made in W28 step 1 and is not part of this phase.

## 2. Requests and responses (the decrypted JSON)

Every decrypted request has `version: "3.0"`, `action`, `flow_token`, and also `screen` and `data` for `data_exchange`. When W06 or W10 sends the template, it sets `flow_token` = `ft_{lead_id}_{nonce}`. The `flow_tokens` table maps it to `lead_id`, `broker_id`, `booking_id?` and `kind` (book or reschedule). **The endpoint trusts the token's mapping, not the `broker_id` or `lead_id` in the payload.** If they don't match, it returns `error_message` and logs a security event.

### `ping` (health check)
Request `{"action":"ping","version":"3.0"}` → response `{"data":{"status":"active"}}`.

### `error` notification (the client reports a bad response)
Request `{"action":"error","flow_token":"…","data":{"error":"…","error_message":"…"}}` → response `{"data":{"acknowledged":true}}`. It is logged to `fact_message` with `guardrail=flow_error`. Two errors on the same token mean the lead gets the 10-slot list instead (W28 failure rule).

### `INIT` (the lead taps "Pick a time")
Look up the token, load the routed broker and run W04 for the calendar bounds.
```json
{"screen":"METHOD","data":{
  "broker_id":"brk_mark","lead_id":"ld_51c9","adviser_name":"Mark",
  "heading":"How would you like to meet Mark?",
  "methods":[{"id":"teams","title":"Microsoft Teams video call","description":"We email you the Teams link"},
             {"id":"phone","title":"Phone call","description":"Mark calls your mobile"}],
  "min_date":"2026-10-02","max_date":"2026-10-16",
  "include_days":["Mon","Tue","Wed","Thu","Fri"],
  "unavailable_dates":["2026-10-06","2026-10-09"]}}
```
- `methods` = only the broker's `methods_supported`. `google_meet` appears only if `calendar_provider = google`.
- `min_date` = the date of now + `min_notice_hours` (Africa/Johannesburg). `max_date` = today + `horizon_days` (14).
- `include_days` = the broker's working days, as `Mon`…`Sun`.
- `unavailable_dates` = days with no free 30-minute slot after rules are applied, days at `max_meetings_per_day`, days in a week at `max_meetings_per_week`, SA public holidays, and every date if `bookings_paused`. If paused or at capacity, send no Flow: W10/W08 send the list or the "later dates" path.
- **Reschedule** also returns `booking_id`, `current_method`, `current_date` and `current_booking_text` (for example "Now booked: Tue 7 Oct at 10:00, Microsoft Teams"). These pre-fill the Flow through `init-value`.

### `data_exchange`, `action_type = date_selected` (from DATE: CalendarPicker `on-select-action`, or the "See times" footer)
Request `data`: `{action_type, date, method, broker_id, lead_id[, booking_id]}` → run W04 `GET /slots?broker&date` → response:
```json
{"screen":"SLOTS","data":{"broker_id":"…","lead_id":"…","adviser_name":"Mark","method":"teams",
  "date":"2026-10-07","date_label":"Tuesday 7 October (South African time)",
  "slots":[{"id":"2026-10-07T10:00:00+02:00","title":"10:00"}],
  "show_error":false,"error_message":""}}
```
- Return at most 20 slots, earliest first, after the round-robin-by-day spread. Slot `id` is the ISO start in +02:00.
- If the day has no slots (it filled in the last second), return `screen: "DATE"` with fresh `unavailable_dates`.
- If calendar auth fails, return `{"screen":"SLOTS","data":{…,"slots":[],"show_error":true,"error_message":"We can't load times right now. We'll send you times here on WhatsApp."}}` and start the list fallback (W04 failure rule).

### `data_exchange`, `action_type = slot_selected` (SLOTS footer)
Re-check free/busy for that one slot (fresh `getSchedule`, no cache). Then:
- Slot gone: return SLOTS with the next 3 free slots and `show_error: true`.
- Method is `teams`, `zoom` or `google_meet` (needs an invite): return **EMAIL** with `prompt` ("Where should we send the Teams invite?" or the Zoom/Meet wording) and `init_email` (the stored email if there is one, else `""`).
- Method is `whatsapp_call` or `phone`: return **SUMMARY** with `email: ""` and `summary_text`. **Email is never asked for call methods (0.1).**

### `data_exchange`, `action_type = email_entered` (EMAIL footer), all in under 300 ms
1. Check the syntax. 2. Look for typos (Mailcheck-style list: gmial→gmail, yaho→yahoo, outlok→outlook, webmial→webmail, …). 3. Do an **MX lookup** on the domain (DNS, cached for 24 h). 4. Block disposable domains (a list kept in the repo).
- Syntax error, no MX, or a disposable domain: return EMAIL with `show_error: true` and a short `error_message`.
- Typo found **on the first submit**: return EMAIL with `show_suggestion: true`, `suggestion_text` ("Did you mean …?") and `init_email` = the suggested address. If they submit again, accept what they typed.
- Valid: return SUMMARY. Store `email`, `email_status = mx_ok` and `email_purpose = meeting_invite` on the lead.

### `complete` (SUMMARY footer). This does not call the endpoint.
The Flow closes. WhatsApp sends the payload as an `nfm_reply` message (`interactive.nfm_reply.response_json`) to the WhatsApp webhook. W07 sends it on to **W05**:
```json
{"flow_token":"…","flow_kind":"book|reschedule","broker_id":"brk_mark","lead_id":"ld_51c9",
 "adviser_name":"Mark","booking_id":"(reschedule only)","method":"teams",
 "date":"2026-10-07","slot":"2026-10-07T10:00:00+02:00","email":"lerato.m@gmail.com | \"\""}
```
- W05 checks the payload against the `flow_token` mapping. It then re-checks `getSchedule` **inside the booking transaction** (idempotency key = `flow_token` + `slot`). It creates the Outlook event, or **moves** the existing event for a reschedule (PATCH, no duplicate). It sends `booking_confirmed`, sends the invite from howzit@ for invite methods, and fires CAPI `Schedule` (book only).
- If the slot was taken between SUMMARY and complete, W05 sends an interactive list of the next 3 slots. Nothing is double-booked.
- Every `flow_token`, response timestamp and `nfm_reply` message id is logged against the lead.

## 3. Fallback ladder (W28 failure handling)
1. Flow endpoint error: the Flow shows a retry.
2. Two failures on one token, or the client doesn't support Flows: send an interactive list of the next 10 slots.
3. Endpoint ping fails (W22, hourly): `brands.booking_ui` goes back to `list`, plus an `ops_alert`.
4. Last resort: W07 asks for a preferred day and offers 3 times.

## 4. `.env` names used (values only in `.env`)
`FLOW_PRIVATE_KEY`, `FLOW_PRIVATE_KEY_PASSPHRASE`, `FLOW_PUBLIC_KEY`, `PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_GRAPH_VERSION`, `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID`, `FLOW_ENDPOINT_URL`, `N8N_PUBLIC_URL`.

## 5. Publishing (W28 steps 5–7, not in this phase)
The Chrome agent pastes the JSON into Flow Builder, attaches `FLOW_ENDPOINT_URL`, and runs Meta's endpoint health check and the interactive preview. It then makes 3 test bookings on the test number. **HUMAN GATE:** an `ops_gate` "Flow passed all checks — tap to publish" goes to Jonathan, and the console button calls `POST /{flow_id}/publish`. After that, run `submit.sh --submit --only broker_intro_slots_v2` (with `BOOKING_FLOW_ID` set) and `--only reschedule_offer_v2` (with `RESCHEDULE_FLOW_ID` set). The reschedule Flow is published as its own Flow id.
