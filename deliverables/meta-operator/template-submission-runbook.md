# SortMyCover: WhatsApp template submission and Flow publish runbook

Owner: meta-operator. Revised 2026-10-02 (rev 2). Gates: **GATE-TEMPLATES ★** (Jonathan submits) and **GATE-FLOW-PUBLISH ★** (Jonathan taps publish).
Inputs: `automation/templates/*.json` (**52** bodies, all `category: UTILITY`, `language: en`), `automation/templates/README.md` (index), `automation/templates/submit.sh`, `automation/templates/samples/`, `automation/flows/*`, `deliverables/compliance-qa/phase4-review-4.md`, `build/gates-batch.md` (GATE-TEMPLATES, NH-19, NH-38, NH-45), MASTER-PROMPT 0.3 #1 and #3, 4.6, W28.
Status: **nothing submitted. No WABA exists yet (GATE-WABA).** This file is a runbook only; the agent never submits.
One-page click list for Jonathan: `jonathan-clicks.md` (gate T and gate F).

**Pre-mortem #1, applied:** submit on Day 0, straight after GATE-WABA; build and test meanwhile on Meta's test number; **accept Meta's category decision and log it**; a template never blocks the build. **Pre-mortem #2:** display-name review is an external clock; templates can be submitted while it is pending.

---

## 1. Before submitting (10 minutes, all must be green)

| # | Check | How / pass condition |
|---|---|---|
| 1 | WABA and the primary number exist | `setup-checklist.md` G4 done; display name submitted (pending is fine) |
| 2 | `.env` names present (script route) | `WABA_ID`, `META_SYSTEM_USER_TOKEN`, `META_APP_ID`, `META_GRAPH_VERSION`. Check names only (`grep -c '^WABA_ID=' .env`), never print values |
| 3 | Generator checks clean | `node automation/templates/check.mjs`: **52 templates, 0 errors** (review-4 ran it at 50; the two counts differ because 2 were added after that review). Button-count notes are expected |
| 4 | Dry run clean | `automation/templates/submit.sh` (dry run is the default): `count=52`; no `FAIL ... resolve error`; `DRYRUN_HANDLE_FOR_intro_card_sample.png` on the IMAGE templates; the two `_v2` show `SKIP ... flow id not set` |
| 5 | **Sample FSP rule (below) holds on every sample Meta will see** | Body examples and header media both. **Currently FAILS for the image header: see §1a** |
| 6 | **NH-19a answered** (AI sentence in `broker_intro_*`) | See §1b. Until then hold the three `broker_intro_*` templates only |
| 7 | **The two re-worded nudges carry the new text** | See §1c. `cat automation/templates/samples/unbooked_nudge_2h.txt` and `..._72h.txt` match the JSON (check.mjs fails if not) |
| 8 | URL buttons on `sortmycover.co.za` | `broker_intro_booked`, `booking_confirmed`, `what_to_expect` carry `https://sortmycover.co.za/c/{{1}}`. If GATE-DOMAINS is deferred and the domain does not resolve (`dns.google` check, 0.3 #6), submit these three once it does (NH-MO-02). Every other template goes now |

### 1a. Sample FSP rule: `00000 (SAMPLE)`

Every FSP number Meta's reviewer sees is the fictional **`00000`**, and wherever a sample is visual it carries the tag **"SAMPLE: fictional adviser"**. Never a real FSP number, never Mark's, never `12345` (it may belong to a real FSP).

| Where | State on 2026-10-02 | Action |
|---|---|---|
| Body `example` values in `broker_intro_booked.json`, `broker_intro_slots.json`, `broker_intro_slots_v2.json` | `"00000"`: **PASS** (review-4 §1 #8) | none |
| Brand templates (`brand/templates/intro-card.html`, `lower-third.html`, `reminder-card.html`, `intro-video.html`) | `00000 (SAMPLE: fictional adviser)`: **PASS** (review-4 §1 #9) | none |
| **`automation/templates/samples/intro_card_sample.png`** (header sample for `broker_intro_booked`, `broker_intro_slots`, `broker_intro_slots_v2`) | **PASS (review 5, 2026-10-02):** byte-identical to `brand/exports/whatsapp/intro-card-1080x1080_sample.png`; shows "FSP 00000 (SAMPLE)" twice and the "SAMPLE: fictional adviser" pill (`brand/exports/render.mjs` `fsp: '00000 (SAMPLE)'`) | Upload as the header sample. Meta-operator re-opens the PNG once more at submission time |
| `automation/templates/samples/intro_video_sample.mp4` (header sample for `intro_media`, `unbooked_nudge_24h`) | **PASS (review 5, 2026-10-02):** 10 s, 1080×1920; the "SAMPLE: fictional adviser" tag is visible from frame 0 and the lower third reads "FSP 00000 (SAMPLE: fictional adviser)" | Upload as the header sample for the two VIDEO templates |

### 1b. NH-19a open point: the AI-assistant sentence

- Proposed sentence (compliance-qa, NH-19 a): *"This chat is run by Lead Velocity's AI booking assistant."*, placed before "Reply STOP to opt out." in `broker_intro_booked`, `broker_intro_slots`, `broker_intro_slots_v2` (and the CTWA consent).
- Repo today: **none of the three JSON files contains it** (grep on 2026-10-02). `disclosure-wording.md` §3 also says the intro templates stay verbatim from 4.6.
- Gates batch: NH-19 default "accept all four"; NH-38 default "AI sentence yes" if silent.
- Why it matters for submission: template text is fixed at review. Submitting without the sentence and adding it later means a new template name and a second review.
- **Rule:** hold the three `broker_intro_*` templates until NH-19a is recorded in `build/decisions.md`. If the record is yes (or the default applies), automation-engineer adds the sentence, `check.mjs` passes, compliance-qa signs the new text, then submit. If no, submit as drafted. Every other template is unaffected and goes on Day 0.
- In practice this hold runs alongside the §1a PNG re-render, which blocks the two IMAGE intro templates anyway.

### 1c. Wording changed since the last runbook: submit the new text

| Template | Old text (do NOT submit) | **New text: submit this** (NH-45 default "apply"; FAQ K-6 wording) |
|---|---|---|
| `unbooked_nudge_2h` | "...there is nothing to buy on the call..." | "Hi {{1}}, following up on your life cover enquiry. A call with {{2}} takes about 30 minutes, and **there's no obligation to buy anything**. Tap below to see open times. Reply STOP to opt out." Buttons: See open times · Not now |
| `unbooked_nudge_72h` | the earlier last-message text without the useful fact | "Hi {{1}}, this is our last message about your life cover enquiry. **On the call, {{2}} goes through where you are now, and any next step is your choice.** Tap below to pick a time, or if not, no problem, we won't message again. Reply STOP to opt out." Buttons: See open times · No thanks |

Same variables and buttons as before, so W08 needs no code change. The submitted text is whatever is in the JSON on the day; the review samples above are rendered from it and `check.mjs` fails if they drift. If any copy of the old text was pasted into WhatsApp Manager as a draft, delete the draft. The W08 owner keeps the session copy in `automation/W08.json` (around line 211) in step with this.

---

## 2. Day-0 submission order (all 52, grouped)

`submit.sh` already holds this order (CORE, then REST in the order below). Batches are logged separately in §5.

### Batch 1: CORE (6), per GATE-TEMPLATES

| # | Template | Header | Day-0 status |
|---|---|---|---|
| 1 | `broker_intro_booked` | IMAGE | **Hold**: §1a PNG + §1b NH-19a + §1 #8 URL button |
| 2 | `broker_intro_slots` | IMAGE | **Hold**: §1a PNG + §1b NH-19a |
| 3 | `booking_confirmed` | TEXT | Go (URL button: hold only if the domain does not resolve, §1 #8) |
| 4 | `reminder_24h` | TEXT | Go |
| 5 | `reminder_2h` | none | Go |
| 6 | `missed_you` | none | Go |

Run the go items one by one: `automation/templates/submit.sh --submit --only reminder_24h` (then `reminder_2h`, `missed_you`, `booking_confirmed`). Run `--submit --core` only when all six are clear; the duplicates already submitted are rejected by Meta and skipped (idempotent).

### Batch 2: lead-facing (13). Every one ends "Reply STOP to opt out."

`reminder_10m` · `what_to_expect` (URL button, §1 #8; review sample `samples/what_to_expect.txt`) · `reschedule_offer` · `attended_thanks` · `prep_nudge` · `intro_media` (VIDEO, §1a video check) · `intro_media_voice` · **`unbooked_nudge_2h` (new text, §1c)** · `unbooked_nudge_24h` (VIDEO, §1a video check) · `unbooked_nudge_24h_text` · **`unbooked_nudge_72h` (new text, §1c)** · `reach_check` · `lead_pulse`

### Batch 3: broker (24). First name + initial only for leads; no STOP line

Delivery and feedback (16): `broker_new_booking` · `broker_outcome_check` · `broker_disposition` (6 buttons, out-of-window fallback only; if Meta rejects the button count, drop it, W12 uses the in-window list) · `broker_quality` · `broker_feedback_thanks` · `broker_fit_followup` · `broker_daily_digest` · `precall_brief` · `broker_weekly` · `broker_weekly_noask` · `broker_midcycle` · `broker_cycle_end` · `broker_renewal_reminder` · **`broker_booking_changed`** (new) · **`broker_autorenew_off`** (new) · **`broker_dsr_erase`** (new)

Onboarding (8): `broker_onb_welcome` · `broker_onb_next` · `broker_onb_calendar_ok` · `broker_onb_ready` · `broker_onb_nudge_24h` · `broker_onb_nudge_72h` · `broker_onb_issue` · `broker_onb_live`

### Batch 4: ops (7). Sent only to Jonathan's and KG's own numbers (6.8b)

`ops_pulse` · `ops_pulse_quiet` · `ops_action` · **`ops_action_confirmed`** (new) · `ops_alert` · `ops_weekly` · `ops_gate`

### Batch 5: Flow-button templates (2). Only after GATE-FLOW-PUBLISH (§6)

`broker_intro_slots_v2` (IMAGE: same §1a PNG and §1b NH-19a holds apply) · `reschedule_offer_v2`. `submit.sh` skips both while `BOOKING_FLOW_ID` / `RESCHEDULE_FLOW_ID` are unset.

**Count check:** 6 + 13 + 24 + 7 + 2 = **52** = the README index = `submit.sh` CORE + REST.

**Review samples (text)** for the reviewer notes field, never uploaded: `samples/{broker_booking_changed, broker_autorenew_off, broker_dsr_erase, ops_action_confirmed, unbooked_nudge_2h, unbooked_nudge_72h, what_to_expect}.txt`.

---

## 3. Route A: script (preferred once the token exists)

Jonathan runs, on the laptop, from the repo root (★ each `--submit` is his):

```
automation/templates/submit.sh --submit --only <name>   # the Day-0 "go" core items, one by one
automation/templates/submit.sh --submit                 # everything else in batch order; only after §1a is fixed,
                                                        # because the full run uploads the IMAGE/VIDEO header samples
```

If §1a is still open when the rest should go, submit batches 2 to 4 with `--only` per name, skipping the four media templates (`intro_media`, `unbooked_nudge_24h`, and the held intro pair).
- The script resolves `__UPLOAD_HANDLE__:<file>` through the Resumable Upload API (`POST /{META_APP_ID}/uploads`), then posts to `POST /{WABA_ID}/message_templates`. One retry after 30 s on 429/5xx, no loops.
- Output per template: `name HTTP code {id, status, category, error}`. Copy it straight into the §5 log (IDs only, no secrets).
- `HTTP 400`: do not re-run blindly. Read `error.message`, fix the JSON, `--only NAME` dry run, then `--submit --only NAME`.

## 4. Route B: WhatsApp Manager by hand (if the token is not ready)

WhatsApp Manager, Account tools, Message templates, **Create template**: Category **Utility**; Name = exact file name; Language English (`en`); Header as in the JSON (IMAGE: upload `samples/intro_card_sample.png` **only after §1a passes**; VIDEO: `samples/intro_video_sample.mp4` after the frame-0 check); Body copied exactly from the JSON incl. `{{n}}` and "Reply STOP to opt out." where present; Variable samples = the JSON `example` values (FSP `00000`); Buttons exactly as the JSON. ★ Jonathan clicks Submit.
If Manager warns the content looks like marketing or suggests another category: screenshot, submit as Utility anyway (Meta decides), log it. Never let it rewrite the copy.

## 5. Reading Meta's decisions and what to log

**Where:** WhatsApp Manager, Message templates (Status, Category, reason); the `message_template_status_update` webhook into W27 (`brands.template_status`); one-off `GET /{WABA_ID}/message_templates?fields=name,status,category,rejected_reason,language,id`.

| Status seen | Action |
|---|---|
| `PENDING` | Nothing. Build continues on the test number (0.3 #1) |
| `APPROVED`, UTILITY | Log; workflows may use it in production |
| `APPROVED`, **MARKETING** (re-categorised) | **Accept and log** the category and cost delta (0.3 #1). Most likely: `unbooked_nudge_*`. Same day, a reworded `{name}_u2` may be submitted as utility (`appeal-playbook.md` §6). Production use of a marketing lead-facing template waits for NH-MO-12 |
| `REJECTED` | `appeal-playbook.md` §6: fix and resubmit, or request review once |
| `PAUSED` / `DISABLED` | `appeal-playbook.md` §5 |

**Log row per template:** `name`, `language`, `batch` (1-5), `submitted_at`, `submitted_by`, `route`, `template_id`, `category_requested` (UTILITY), `category_decided`, `decided_at`, `hours_to_decision`, `status`, `rejected_reason` (verbatim), `text_version` (for the two nudges: `NH-45`), `header_sample_file` + `sample_fsp_checked` (00000 yes/no), `cost_delta_note`, `action_taken`, `screenshot` (`screens/G10-{name}.png`, no secrets).

Section 7 line: "the 6 core templates approved (any category; category cost logged); the rest submitted and tracked".

## 6. Booking Flow publish (W28; GATE-FLOW-PUBLISH ★)

Never on the critical path (pre-mortem #3): launch runs on the 10-slot list; the Flow is a flag flip (`brands.booking_ui = 'flow'`). Only with a **stable public HTTPS hostname** (named tunnel or `api.leadvelocity.co.za`).

| Step | What | Who | Pass |
|---|---|---|---|
| 1 Keys | RSA-2048 pair on the laptop; `.env` `FLOW_PRIVATE_KEY`, `FLOW_PRIVATE_KEY_PASSPHRASE`, `FLOW_PUBLIC_KEY`; register via `POST /{PHONE_NUMBER_ID}/whatsapp_business_encryption`; `brands.flow_public_key_ref = FLOW_PUBLIC_KEY` | Jonathan runs | Key shows valid |
| 2 Endpoint | Reference endpoint + our `flow.js`; signature check with `META_APP_SECRET`; 421 on decrypt failure; URL in `.env` `FLOW_ENDPOINT_URL` | automation-engineer | Local tests green |
| 3 Health | Encrypted `ping` returns `{"data":{"status":"active"}}` < 3 s via the public URL; W22 hourly ping | automation-engineer | `G12-01-health.png` |
| 4 Create | Flows: `SMC_booking_v1`, `SMC_reschedule_v1` (category Appointment booking or closest) | Chrome agent (drafts only) | Two drafts |
| 5 Builder | Paste `automation/flows/booking-flow.json` / `reschedule-flow.json`; fix only what the Builder names, record in `deliverables/automation-engineer/verified-facts.md`; set Endpoint; run Meta's health check | Chrome agent | No errors; `G12-02-builder.png` |
| 6 Preview | METHOD, DATE (CalendarPicker), SLOTS, EMAIL (only Teams/Zoom/Meet, 0.1), SUMMARY | Chrome agent | Email screen absent for phone/WhatsApp call |
| 7 Tests | 3 test bookings on the test number: Teams with email typo; phone (no email asked); reschedule of booking 1 | KG as lead; Chrome agent watches W05 | Event moved, not duplicated; `G12-03..05` |
| 8 **★ Publish** | `ops_gate` to Jonathan; console calls `POST /{flow_id}/publish` per Flow | Jonathan | Published (locked; changes = new version) |
| 9 Record | `brands.booking_flow_id`; `.env` `BOOKING_FLOW_ID`, `RESCHEDULE_FLOW_ID` (NH-MO-05) | Jonathan / console | — |
| 10 Batch 5 | `submit.sh --submit --only broker_intro_slots_v2` (after §1a/§1b), then `--only reschedule_offer_v2` ★ | Jonathan | Logged per §5 |
| 11 Flip | Console sets `brands.booking_ui = 'flow'`; W22 reverts to `list` on a failed ping | Jonathan confirms | First Flow booking logged |

If steps 3 to 7 fail, launch stays on the list and nothing is published.
