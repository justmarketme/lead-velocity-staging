# SortMyCover: WhatsApp template submission and Flow publish runbook

Owner: meta-operator. Date: 2026-10-02. Gates: **GATE-TEMPLATES ★** (Jonathan submits) and **GATE-FLOW-PUBLISH ★** (Jonathan taps publish).
Inputs: `automation/templates/*.json` (36 drafted bodies, all `category: UTILITY`, `language: en`), `automation/templates/README.md`, `automation/templates/submit.sh`, `automation/templates/samples/`, `automation/flows/booking-flow.json`, `automation/flows/reschedule-flow.json`, `automation/flows/booking-flow-endpoint.md`, MASTER-PROMPT 0.3 #1 and #3, 4.6, W28, 6.8b.
Status: nothing submitted. No WABA exists yet (GATE-WABA).

**Pre-mortem #1, applied:** submit on Day 0, straight after GATE-WABA; build and test meanwhile on Meta's test number; accept Meta's category decision and log it; a template never blocks the build.

---

## 1. Before submitting (10 minutes)

| # | Check | How |
|---|---|---|
| 1 | WABA and the primary number exist; display name submitted | `setup-checklist.md` G4 |
| 2 | `.env` has `WABA_ID`, `META_SYSTEM_USER_TOKEN`, `META_APP_ID`, `META_GRAPH_VERSION` (for the script route) | Jonathan typed them; `grep -c` the names only, never print values |
| 3 | Review samples are present | `automation/templates/samples/intro_card_sample.png` (1080 x 1080) and `intro_video_sample.mp4` (9:16, 0.28 MB) exist as of 2026-10-02 (visual-producer). The README line saying the folder does not exist is out of date |
| 4 | compliance-qa pass on the template text | `deliverables/compliance-qa/phase0-review-1.md`; NH-19 wording decisions (AI-assistant sentence in the three `broker_intro_*` templates) answered or defaulted. If Jonathan has not answered NH-19, submit the core six as drafted (defaults stand) |
| 5 | Dry run is clean | `automation/templates/submit.sh --core` (dry run is the default). Every body prints; no `FAIL ... resolve error`; `DRYRUN_HANDLE_FOR_intro_card_sample.png` appears for the two image templates |
| 6 | The URL buttons point at `https://sortmycover.co.za/c/{{1}}` | The domain must be live for Meta to accept a URL button on our domain; if GATE-DOMAINS is deferred, see NH-MO-02 (submit the text-only core templates first, the URL-button ones once the domain resolves) |

## 2. Submission order

| Batch | Templates | When |
|---|---|---|
| **1. CORE (6)** | `broker_intro_booked` (IMAGE), `broker_intro_slots` (IMAGE), `booking_confirmed`, `reminder_24h`, `reminder_2h`, `missed_you` | Day 0, first |
| 2. Lead journey | `reminder_10m`, `what_to_expect`, `reschedule_offer`, `attended_thanks`, `prep_nudge`, `intro_media` (VIDEO), `intro_media_voice`, `unbooked_nudge_2h`, `unbooked_nudge_24h` (VIDEO), `unbooked_nudge_24h_text`, `unbooked_nudge_72h`, `reach_check`, `lead_pulse` | Day 0, after batch 1 is accepted for review |
| 3. Broker and ops | `broker_new_booking`, `broker_outcome_check`, `broker_disposition`, `broker_quality`, `broker_feedback_thanks`, `broker_fit_followup`, `broker_daily_digest`, `precall_brief`, `broker_weekly`, `broker_midcycle`, `broker_cycle_end`, **`ops_pulse`, `ops_action`, `ops_alert`, `ops_weekly`, `ops_gate`** (6.8b, utility, sent only to Jonathan's and KG's own numbers) | Day 0 or Day 1 |
| 4. Flow buttons | `broker_intro_slots_v2`, `reschedule_offer_v2` | Only after the Flows are published (§6). `submit.sh` skips them while `BOOKING_FLOW_ID` / `RESCHEDULE_FLOW_ID` are unset |

## 3. Route A: script (preferred once the token exists)

Jonathan runs, on the laptop, from the repo root:

```
automation/templates/submit.sh --submit --core     # batch 1
automation/templates/submit.sh --submit            # everything else; the core six are rejected as duplicates and skipped
```

- What the script does: for each template it resolves `__UPLOAD_HANDLE__:<file>` by uploading the sample from `samples/` through the Resumable Upload API (`POST /{META_APP_ID}/uploads`, then the file bytes), puts the returned handle into the header `example`, and posts the body to `POST /{WABA_ID}/message_templates`. One retry after 30 s on HTTP 429/5xx, no loops.
- Output per template: `name HTTP code {id, status, category, error}`. Copy the whole output into the submission log (§5) straight away. It contains IDs, no secrets.
- `HTTP 400` with an error: do not re-run blindly. Read `error.message`, fix the JSON, `--only NAME` dry run, then `--submit --only NAME`.

## 4. Route B: WhatsApp Manager by hand (if the token is not ready yet)

WhatsApp Manager, Account tools, Message templates, **Create template**:

| Field | Value |
|---|---|
| Category | **Utility** |
| Name | exact file name (for example `broker_intro_booked`), lower case with underscores |
| Language | English (`en`) |
| Header | as in the JSON: IMAGE for `broker_intro_booked` / `broker_intro_slots` (upload `automation/templates/samples/intro_card_sample.png` as the sample); VIDEO for `intro_media` / `unbooked_nudge_24h` (upload `intro_video_sample.mp4`); TEXT or none for the rest |
| Body | copy the `BODY` text from the JSON exactly, including `{{1}}`-style variables and "Reply STOP to opt out." |
| Variable samples | the `example` values from the JSON (Meta reviews with these; empty or unrealistic samples are a common rejection cause) |
| Buttons | as in the JSON: quick replies with the exact text; URL button `https://sortmycover.co.za/c/{{1}}` with the sample suffix from the JSON |
| ★ Submit | Jonathan clicks |

Do not let WhatsApp Manager "suggest" a different category or rewrite the copy; if it warns that the content looks like marketing, screenshot the warning, submit as Utility anyway (Meta decides), and log it.

**Media-sample note:** the sample intro card and video use a fictional adviser ("Mark Smith, FSP 12345"). Samples are only seen by Meta's reviewers, but the FSP number should not be a real FSP's number (NH-MO-13: compliance-qa to confirm or change to an obviously fictional format before submission).

## 5. Reading Meta's decisions and what to log (per template)

**Where to read:** WhatsApp Manager, Message templates (Status and Category columns, plus the reason on hover/click), and the `message_template_status_update` webhook into W27, which writes `brands.template_status`. One-off check from the laptop:
`GET /{WABA_ID}/message_templates?fields=name,status,category,rejected_reason,language,id` (system-user token).

| Status seen | Meaning | Action |
|---|---|---|
| `PENDING` / In review | Meta reviewing (minutes to 48 h, pre-mortem #1) | Nothing. Build continues on the test number |
| `APPROVED`, category UTILITY | Done | Log; W06/W09 may use it in production |
| `APPROVED`, category **MARKETING** (re-categorised) | Meta decided it is promotional | Accept and log the category and the per-message cost difference (0.3 #1). Same day submit a reworded `{name}_u2` as utility (`appeal-playbook.md` §6). Production use of a marketing lead-facing template waits for NH-MO-12 |
| `REJECTED` | See reason | `appeal-playbook.md` §6: fix and resubmit, or request review once |
| `PAUSED` / `DISABLED` | Quality problem in use | `appeal-playbook.md` §5 |

**Submission log** (console Templates screen, one row per template; `brands.template_status` holds the latest state; this table is the full history):

| Field | Example |
|---|---|
| `name`, `language` | `reminder_24h`, `en` |
| `batch` | 1 (CORE) |
| `submitted_at`, `submitted_by`, `route` | 2026-10-0x 10:12 SAST, Jonathan, script |
| `template_id` (Meta) | from the script output / Manager |
| `category_requested` | UTILITY |
| `category_decided`, `decided_at`, `hours_to_decision` | UTILITY, ..., 0.4 |
| `status`, `rejected_reason` (verbatim) | APPROVED / — |
| `cost_delta_note` | "marketing vs utility: +R0.6/message est. (3.1, ASSUMPTION until the first WABA invoice)" |
| `action_taken` | none / `_u2` submitted / request review |
| `header_sample_file` | `intro_card_sample.png` |
| `screenshot` | `screens/G10-{name}.png` (Manager row, no secrets) |

Section 7 line: "the 6 core templates approved (any category; category cost logged); the rest submitted and tracked". Tick it when batch 1 shows APPROVED for all six and every other batch has a `submitted_at`.

## 6. Booking Flow publish (W28 steps 1 to 7; GATE-FLOW-PUBLISH ★)

**Never on the critical path (pre-mortem #3).** Launch runs on the 10-slot interactive list; the Flow replaces it by a flag (`brands.booking_ui = 'flow'`). Do this only when the endpoint has a **stable public HTTPS hostname**: a named tunnel that survives restarts, or `api.leadvelocity.co.za` after the VPS. A tunnel URL that changes on restart would break a published Flow.

| Step | What | Who | Pass condition |
|---|---|---|---|
| 1. Keys | RSA-2048 key pair generated on the laptop; private key into `.env` `FLOW_PRIVATE_KEY` (+ passphrase); public key `FLOW_PUBLIC_KEY`; registered with `POST /{PHONE_NUMBER_ID}/whatsapp_business_encryption` (system-user token). `brands.flow_public_key_ref = FLOW_PUBLIC_KEY` | Jonathan runs; automation-engineer prepares the command | Graph returns success; `GET` on the same edge shows the key as valid |
| 2. Endpoint up | Meta's reference Node endpoint (WhatsApp-Flows-Tools) with our `flow.js`; `X-Hub-Signature-256` check with `META_APP_SECRET`; 421 on decrypt failure | automation-engineer / devops-security | Local test suite green |
| 3. **Endpoint health check** | (a) our own: encrypted `ping` returns `{"data":{"status":"active"}}` in under 3 s (target 1.5 s) through the public URL; W22 hourly ping configured. (b) Meta's: Flow Builder's endpoint health check (step 5) passes | automation-engineer, then Chrome agent reads Builder | Both green; screenshot `G12-01-health.png` |
| 4. Create Flows | WhatsApp Manager, Account tools, Flows, Create Flow: name `SMC_booking_v1`, category Appointment booking (or the closest offered); second Flow `SMC_reschedule_v1` | Chrome agent (draft only; drafts are not public) | Two drafts exist |
| 5. **Flow Builder paste** | Paste `automation/flows/booking-flow.json` (and `reschedule-flow.json` into the second). If the Builder rejects `version` "7.0" or a property name, change only the value the Builder names and write the corrected value into `deliverables/automation-engineer/verified-facts.md` (the tool's check, not research). Set **Endpoint**: `FLOW_ENDPOINT_URL`, connect the Lead Velocity app, run Meta's health check | Chrome agent | Builder shows no errors; health check passed; screenshot `G12-02-builder.png` |
| 6. Preview | Interactive preview with endpoint data: METHOD, DATE (CalendarPicker with min/max/unavailable dates from W04), SLOTS, EMAIL (only for Teams/Zoom/Meet), SUMMARY | Chrome agent | Every screen renders; email screen absent for phone/WhatsApp-call methods (0.1) |
| 7. **3 test bookings** on the test number (Flow drafts can be sent to test recipients): (1) Teams with an email, including a typo to see the "did you mean" suggestion; (2) phone call, no email asked; (3) reschedule of booking 1 through `SMC_reschedule_v1` | KG as the lead on her phone; Chrome agent watches W05 | Outlook events created on the test calendar; booking 1 **moved**, not duplicated; `booking_confirmed` received; `flow_token` and `nfm_reply` ids logged; screenshots `G12-03..05` |
| 8. **★ One-tap publish** | `ops_gate` to Jonathan: "Flow passed all checks: tap to publish". The console button calls `POST /{flow_id}/publish` for each Flow | Jonathan | Status Published; after publish the Flow is locked: any later change is a new Flow version with steps 5 to 8 again |
| 9. Record | `brands.booking_flow_id` = booking Flow id; `.env` `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID` (the reschedule Flow id has no `brands` column yet: NH-MO-05) | Jonathan / console | — |
| 10. Flow-button templates | `submit.sh --submit --only broker_intro_slots_v2`, then `--only reschedule_offer_v2` (§5 logging applies) | Jonathan ★ | Both APPROVED |
| 11. Flip | Console sets `brands.booking_ui = 'flow'` (audit-logged). W22 reverts to `list` on a failed ping and sends `ops_alert` | Jonathan confirms | First live booking through the Flow logged |

If anything in steps 3 to 7 fails, the launch path is unchanged (list), the failure goes in the console build line, and nothing is published.
