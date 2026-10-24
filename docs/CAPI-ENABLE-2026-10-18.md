# Meta Conversions API: what is wired, what blocks it, how to switch it on

Checked 18 Oct 2026, read-only: the repo at release/all-2026-10-18, the VPS n8n database and `.env` (variable names
only), and the live Supabase. Nothing was changed. Meta facts come from developer docs (links at the end); items marked
*unconfirmed* are not stated in an official Meta source.

## How the code sends events

All server events go through one sub-workflow, **`smc-capi-send`** (`automation/SUB-capi-send.json`, logic in
`automation/lib/sub-capi-send.mjs`):

| Caller | Event | action_source | Live state today |
|---|---|---|---|
| W01 Lead core (web, and W02 Instant Form via W01) | `Lead` (also "Lead at hand-over") | website | W01 **active** |
| W03 Click-to-WhatsApp | business-messaging `Lead` | business_messaging (+ `messaging_channel: whatsapp`, `ctwa_clid`, WABA id) | W03 **active** |
| W05 Book | `Schedule` (no email) | website, or business_messaging for CTWA leads | W05 **active** |
| W12 Outcome | `Attended` (offline, `custom_data.event_source = crm`) | system_generated | W12 **inactive** |
| `smc-capi-send` itself | n/a | n/a | **inactive** |

What the sub-workflow reads:
- **Token:** NOT an env var. The HTTP node uses an n8n **credential** named exactly
  **`Meta system user token (Bearer)`** (type *Header Auth*). `CAPI_ACCESS_TOKEN` is not read anywhere.
- **Dataset:** `brands.pixel_id` for `website` events, then `brands.dataset_id`, falling back to env `PIXEL_ID` /
  `DATASET_ID`. The WABA id comes from `brands.waba_id`, falling back to env `WABA_ID`.
- **Graph version:** env `META_GRAPH_VERSION`, with a code default of **v21.0** (too old in Oct 2026; set it explicitly).
- **Test events:** env `CAPI_TEST_EVENT_CODE` (added as `test_event_code`; evidence lines are written to `CAPI_EVIDENCE_PATH`).
- **Gates, in order:**
  1. the consent gate: `leads.consent_ads_at` must be set, otherwise the event is skipped;
  2. dedupe on `capi_log (event_id, event_name)`;
  3. `DRY_RUN_SENDS=true`, which posts nothing.
- No email is ever sent. Phone and name are hashed with SHA-256 inside `capi.js`.

## Live state (18 Oct)

| Item | State |
|---|---|
| n8n credential `Meta system user token (Bearer)` | **missing** (no Meta or CAPI credential on the VPS) |
| VPS `.env` `META_GRAPH_VERSION`, `PIXEL_ID`, `DATASET_ID`, `WABA_ID`, `CAPI_TEST_EVENT_CODE` | **not set** |
| `brands` (code SMC) `pixel_id` / `dataset_id` / `waba_id` | **all null** |
| `capi_log` table | exists |
| `DRY_RUN_SENDS` | `false` (live sends) |
| SMC leads with `consent_ads_at` | **0 of 6** |

## Consent gate: decided for click-to-WhatsApp (Jono, 18 Oct 2026)

`consent_ads_at` is set only by **W01**, when the web form posts `consent_ads: true`. W03 never sets it, and W03 creates
every WhatsApp lead, so the old gate dropped every click-to-WhatsApp (CTWA) event.

**Decision:** CTWA events (`action_source = business_messaging`: W03 `Lead`, W05 `Schedule` for a CTWA lead) carry the
ad-click reference ONLY. That means `user_data = { ctwa_clid, whatsapp_business_account_id }`, with no hashed phone, name,
country or external_id, and **no ads-consent gate**.
- Built in `automation/lib/sub-capi-send.mjs` and tested in `automation/tests/SUB.test.mjs`.
- It is the default. `CAPI_CTWA_CLID_ONLY=false` in the VPS `.env` restores the old behaviour (gate plus hashed user data).
- **Instant Form and web events keep the consent gate** whatever the flag says.
- The lib is shipped by `deploy.sh`; no workflow import is needed. `Attended` (W12) is `system_generated` and keeps the gate.
- Website openers that ticked "measure ads" still need W03 to record `consent_ads_at`. Without that they send nothing
  beyond the CTWA rule. That is open.

## Token: can the system-user token be the CAPI token?

**Yes.** Meta's own-app setup assigns the pixel to a system user and generates the token there. Requirements:
- The system user and the app are in the **same Business Manager**. The app is installed for the system user, and it has
  Ads Management standard access or higher.
- **Scope:** `ads_management` is the one Meta documents. `business_management` is harmless; Meta doesn't say it's required.
  - **For the business-messaging (CTWA) events, also add `whatsapp_business_management` and
    `whatsapp_business_manage_events`**. The planned token (ads_management + business_management) lacks them.
- **Expiry:** choose the non-expiring system-user token (the default when `set_token_expires_in_60_days` is not set).

## Dataset assignment

**Yes, assign it.** Business settings → Data sources → Datasets → **1088568384160686** → Assign people → system user
**SortMyCover n8n**, with full control ("Manage"). Meta names no level (*unconfirmed*), so full control is the safe choice.

Without the assignment, Graph usually answers code 100 / subcode 33 ("Object with ID … does not exist … missing
permissions"; *unconfirmed* for CAPI specifically).

Business-messaging events go to the dataset **linked to the WABA** (1370588024885127). In Events Manager, check whether that
is 1088568384160686 or a different dataset. If it differs, set `brands.dataset_id` to it and assign it to the system user too.

## Event-name caveat for CTWA

Meta's business-messaging CAPI lists `LeadSubmitted` and `QualifiedLead`; it does not list `Lead` or `Schedule`. The code
sends `Lead` and `Schedule` with `action_source = business_messaging`. That is listed as an assumption in
`automation/capi/event-spec.md`. **Verify it in the test-event run (step 6) before going live.** If Meta rejects it, rename
those two events in `sub-capi-send.mjs` / W03 / W05 (a code change, test first).

## Enable steps (after KG approves the system user; nothing here has been run)

1. **[KG/Jono] Business settings:**
   - assign dataset 1088568384160686 (and the WABA-linked dataset, if different) to **SortMyCover n8n** with full control;
   - assign the WABA to it as well (for CTWA events);
   - generate a non-expiring token with `ads_management`, `business_management`, `whatsapp_business_management` and
     `whatsapp_business_manage_events`.
2. **Quick token check** (laptop, token in a shell variable, never pasted into chat):
   ```bash
   curl -s "https://graph.facebook.com/v25.0/1088568384160686?fields=id,name&access_token=$META_SYSTEM_USER_TOKEN"
   ```
   **Pass:** the response returns the id and name (no error 100/190/200).
3. **n8n credential** (n8n editor, Credentials → New → *Header Auth*):
   - name it exactly `Meta system user token (Bearer)`;
   - header `Authorization`, value `Bearer <token>`.
   The VPS `.env` also has `META_SYSTEM_USER_TOKEN=` for the other Meta modules. Add it there too, with the file still
   chmod 600.
4. **Env lines** in `/opt/leadvelocity-n8n/repo/.env`:
   ```
   META_GRAPH_VERSION=v25.0
   PIXEL_ID=1088568384160686
   DATASET_ID=1088568384160686        # or the WABA-linked dataset id, if it differs
   WABA_ID=1370588024885127
   CAPI_TEST_EVENT_CODE=TESTxxxxx     # from Events Manager -> dataset -> Test events (remove after step 6)
   CAPI_EVIDENCE_PATH=/data/evidence/capi-test-events.jsonl
   ```
   Then run `./dc up -d --force-recreate n8n`.

   Optionally also set the brand row (it wins over env):
   `update brands set pixel_id='1088568384160686', dataset_id='<id>', waba_id='1370588024885127' where code='SMC';`
5. **Activate the sender:** run `import_wf.sh SUB-capi-send` (it publishes it). W12 stays as the main session decides; it
   is needed for `Attended`.
6. **Test-event run:**
   - make one synthetic lead with `consent_ads_at` set (W01 web form with the ads box ticked, or a test lead row), then
     book it (W05);
   - **Pass:**
     - Events Manager → dataset → **Test events** shows `Lead` and `Schedule` with the test code within about a minute;
     - `capi_log` has two rows with a 200 status;
     - `CAPI_EVIDENCE_PATH` has two lines;
     - the Graph response had `events_received: 1` each.
   - Repeat once for a CTWA lead (no ads consent needed; only `ctwa_clid` and the WABA id are sent). This checks that Meta accepts business-messaging `Lead` /
     `Schedule` (see the caveat above).
7. **Go live:**
   - remove `CAPI_TEST_EVENT_CODE`, then recreate n8n;
   - Events Manager → **Overview** shows server events arriving (source "Server"), and deduplication with the browser
     Pixel works (the same `event_id`);
   - after 24 to 48 h, the **Event Match Quality** for Lead is 6 or higher (target in `event-spec.md`).
8. The CTWA rule is on by default (see "Consent gate" above). Check one CTWA test event in step 6: its user_data has only `ctwa_clid` and the WABA id.

**Rollback:** delete or empty the n8n credential, or deactivate `smc-capi-send`. Events stop and nothing else changes.

## Sources

- https://developers.facebook.com/docs/marketing-api/conversions-api/get-started
- https://developers.facebook.com/docs/marketing-api/system-users/install-apps-and-generate-tokens
- https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
- https://developers.facebook.com/docs/marketing-api/reference/ads-pixel/events/
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
- https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging
- https://developers.facebook.com/docs/graph-api/changelog (v26.0 is current; v25.0 is supported to Jul 2028)
