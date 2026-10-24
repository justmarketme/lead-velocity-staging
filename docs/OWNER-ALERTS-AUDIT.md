# SortMyCover owner alerts: audit and proposal (24 Oct 2026)

**Owner rule (Jono, 24 Oct 2026):** until the separate internal WhatsApp number ("Zoe Experience") exists, EVERY
SortMyCover notification must reach Jono on WhatsApp +27 72 554 8057, sent from the SortMyCover Twilio WhatsApp
number +27 60 015 6480.

Scope of this audit: every path in the live n8n code (`feat/smc-test-real-routing` @ 9b201bd, imported on the VPS
23 Oct 13:47 UTC) and the SortMyCover edge functions that tell a human anything. Read-only: n8n Postgres, the n8n
container env, the LV Supabase project, the Twilio Messages / Content APIs, the EMMA journal. Nothing was sent,
deployed or written.

Branch for the fix: `feat/smc-owner-whatsapp-alerts` (from 9b201bd), worktree `C:\tmp\lv-owner-alerts`.

---

## 1. Why Cassiem's lead (5730e361, 08:12 SAST) produced no WhatsApp to Jono

Timeline (UTC, from n8n `execution_entity`, `public.leads` / `lead_activities` / `communications`, the EMMA journal
and W38's static data):

| Time | What |
|---|---|
| 06:12:11 | W07 webhook: first inbound from the Click-to-WhatsApp ad -> W03 intake (06:12:13) -> consent question sent (06:12:15, `communications` W03, phone ends 495). |
| 06:12:49 | W07: consent "yes" -> W03 (06:12:50) -> `leads` row 06:12:51 (origin `ctwa`, `is_synthetic=false`) -> Start-here card sent 06:12:51. |
| 06:12:52 | W22 run 19518 (Error Trigger): `workflow_failed` `smc-capi-send` / "Update capi_log", **amber** -> email only to `OPS_ALERT_EMAIL` (relay answered 200). Nothing to WhatsApp (amber by design). |
| 06:13:15 | **W38 tick**: 1 new item, message `SortMyCover: 1 new lead / - Lead: Cassiem, WhatsApp ad, phone ends 495, not routed` -> `POST https://emmadoesit.cloud/api/notify`. |
| 06:13:17 | EMMA journal: `[EMMA notify] delivered via teams_bot, telegram`. W38 static data: `last: { at 06:13:17Z, items 1, status 200, dry_run false }`, `fails 0`. |
| 06:13:30-37 | W39 `/start/answers` -> adviser path -> W01 routed the lead to Mark (306062a1, real adviser) at 06:13:37 (`routed`, `order_attached`). |
| 24 Oct | Twilio Messages API, `To=whatsapp:+27725548057`: **no message on 24 Oct**; the newest is 23 Oct 23:20 UTC. |

Findings:

1. **W38 worked exactly as built.** `SMC_LEAD_ALERT_ENABLED=true`, `DRY_RUN_SENDS=false`, the tick fired 24 s after the
   lead row, EMMA answered 200. The alert is one minute-resolution tick, so it said "not routed" (W01 routed 22 s later;
   the id is then in the `seen` map, so no "routed" follow-up is sent).
2. **W38's only transport is EMMA, and EMMA does not WhatsApp when Teams or Telegram lands.** `src/notify/deliver.ts`
   `deliverToOwner()` runs Teams bot -> Teams Graph -> Telegram; WhatsApp runs first only with `prefer: 'whatsapp'`
   (which `/api/notify` never passes) and otherwise only as a last resort when nothing else reached. Teams + Telegram
   reached, so WhatsApp was skipped.
3. **Even EMMA's WhatsApp rung is the wrong number.** It is EMMA's own whatsapp-web.js session (`EMMA_OWNER_WHATSAPP`),
   not the SortMyCover Twilio sender +27 60 015 6480. The owner rule is unmet by design, not by a failure.
4. The same EMMA transport is used by W07 "Never silent: notify Jono" and W10 "Notify Jono (rebook failed)".

So: no bug to fix in W38's logic; the transport has to change.

---

## 2. Live environment (n8n container on the VPS, read 24 Oct; names and non-secret values only)

| Env | Value |
|---|---|
| `SMC_LEAD_ALERT_ENABLED` | `true` |
| `DRY_RUN_SENDS` | `false` |
| `WHATSAPP_PROVIDER` | `twilio`; `TWILIO_WHATSAPP_FROM=whatsapp:+27600156480`; `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` set; no Messaging Service SID |
| `OPS_WHATSAPP_JONATHAN` | `+27725548057` (Jono) |
| `OPS_WHATSAPP_KG` | `+27736867990` |
| `OPS_ALERT_EMAIL` | `jono@vantagestack.co.za` (W22 email leg, via `smc-email-send` relay; `LINDI_RELAY_TOKEN` set, `RESEND_API_KEY` unset in n8n) |
| `OPS_EMAIL` / `CL_WATCH_TO` | `howzit@leadvelocity.co.za` / `jono@vantagestack.co.za` (W36 weekly email) |
| `SMC_TEST_PHONES` | `+27725548057,+27736867990` (Jono, KG: test-lead ROUTING only) |
| `SMC_TEST_BROKER_IDS` | `f688380e-fb68-4bfc-a9ee-4bf37ce76dcc` (test practice) |
| `SYNTHETIC_TEST_NUMBERS` | 14 numbers `+276000009xx` (the only numbers the sender dry-runs) |
| `WHATSAPP_TEST_RECIPIENTS` | empty = no allow-list |
| `TWILIO_CONTENT_SIDS` | JSON with ~90 keys, including `ops_alert` |
| `EMMA_SHARED_SECRET` | set (W38 / W07 / W10 -> EMMA) |
| `CONSOLE_URL` | UNSET (the W07 ops_alert URL button suffix "console" points nowhere) |
| Workflows active | W01, W03, W05, W07, W10, W12, W13, W22, W29, W34, W38, W39 all `active=true` |

**Jono's number and the test/real split (verified, keep true):** `lib/sub-whatsapp-send.mjs decide()` dry-runs a
recipient only when `isSyntheticNumber(to, env)` (exact `SYNTHETIC_TEST_NUMBERS`) or `DRY_RUN_SENDS=true`;
`SMC_TEST_PHONES` is read only by `lib/routing-split.mjs` (`isTestLead`, routing + W38 labels) and never by the sender.
Evidence: Twilio shows 16 messages delivered/read to +27725548057 from the SMC number on 22-23 Oct, after the split
went live. Two `leads` rows carry Jono's number (4a86158f, 2f7fac03 test lead of 22 Oct): an owner alert must be sent
with `record:false` (no `communications` row against his test lead, no `last_contact_at` touch) and
`bypass_suppression:true` (a STOP he sent as a tester must not silence ops), exactly as W22 does today.

**Twilio template `ops_alert`:** Content `HX938d197d...`, friendly name `smc_ops_alert`, **approved**, type
`whatsapp/card`, 3 body variables, footer "SortMyCover". Meta classified it **MARKETING** (submitted as UTILITY), so
each send is a marketing conversation and subject to Meta's per-user marketing frequency caps. It demonstrably
delivers outside any 24-h window: 18-21 Oct "Hi Jono, a SortMyCover system alert needs your attention..." messages all
show Twilio status `read`.

---

## 3. The map: every path that tells a human something

Legend: **Owner?** = does Jono get a WhatsApp from +27 60 015 6480 today. Window = does it work outside the 24-h
customer-service window.

| # | Path | Trigger | Channel(s) and recipient today | Template / text | Window | Owner? | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | **W38 lead / owner alert** (`build-w38.mjs`, `lib/w38.mjs`) | every minute: new `leads` + `appointments` rows (brand SMC) since the watermark | `POST emmadoesit.cloud/api/notify` -> EMMA `deliverToOwner`: Teams bot -> Teams Graph -> Telegram; EMMA's own WhatsApp only if all fail | free text, minimised (first name, phone last 3, source, practice, booking time/method, TEST/real side) | n/a (not WhatsApp Business) | **No** (Teams + Telegram) | journal 06:13:15/17; static `last.status 200`; Twilio: nothing on 24 Oct |
| 2a | **W05 booking created** (`book`) | `POST /book` (W39 Start page, W07 taps, Flow) | lead: `booking_confirmed` / `booking_confirm_chat` (template or session) + client email (`smc-client-email`); adviser: `broker_new_booking` template to `adviser_whatsapp` (Mark ...851) + email via `smc-email-send` | templates (SIDs present) | yes | **No** direct; W38 sees the appointment row (#1) | `lib/w05.mjs brokerNotice/afterBooking`; `build-w04-w05.mjs` |
| 2b | **W05 booking held** (email not verified / band missing) | same, verify gate | lead: `booking_held_verify_email` + verify email (`smc-email-verify`); adviser: nothing (gate) | template | yes | **No** direct; W38 line says "(held until the email is verified)" | `w05.mjs` verify gate; W38 SQL `status` |
| 2c | **W05 verified** (`finalize`) | `smc-email-verify` link / code | the held row is PROMOTED in place (UPDATE), then 2a's adviser notice fires | as 2a | yes | **No**: W38 keys on `created_at`, so a verify never re-alerts | `build-w04-w05.mjs` "promote", `up UNION ins` |
| 2d | **W05 hold released** (5-min sweep) | `verify_by` passed | lead: `booking_hold_released`; nobody else | template | yes | **No** | W05 static data sweep node |
| 2e | W05 failure signals | Graph event / client email failures | W22 (`calendar_event_create_failed` red -> #8 WhatsApp; `client_email_failed` amber -> email) | via W22 | yes | red only | `w05.mjs` alert builders |
| 3 | **W10 moved / cancelled / method change** | W07 taps + typed intents, W12 `broker_rescheduled`, hourly C1A sweep | lead: session text / `booking_confirmed` / reschedule card + client email; adviser: session text in his window, else `broker_booking_changed` template, plus email via `smc-email-send`; owner: nothing. Second reschedule / `no_slots` -> `escalations` row only. Schedule-D rebook failed -> EMMA `/api/notify` (Teams/Telegram) | templates + session text | adviser yes | **No** | `W10.json` nodes "Broker notice (cancelled)", "Email adviser from SortMyCover", "Notify Jono (EMMA /api/notify, rebook failed)"; `escalations` rows `esc_kind=second_reschedule` 19/20 Oct |
| 4 | **W12 outcomes / no-shows / disputes / unconfirmed** (`lib/w12.mjs`) | 5-min post-call sweep, broker taps, portal marks, lead reach check | broker: `broker_outcome_check` (+15 min), nudge +3 h, disposition list / `broker_disposition`, `broker_quality`; lead: `reach_check`, `attended_thanks`, Schedule-D apology; **Jono / KG: `escalations` rows only** (`other`/urgent `esc_kind=broker_no_show` "KG", `outcome_unmarked` disputes "KG reviews in the console", `two_unconfirmed` "Jonathan calls the broker", `broker_no_whatsapp`) | templates; console rows | yes | **No** (console only) | builder node "Escalate (KG broker no-show / console dispute)" = INSERT only; rows 19-23 Oct |
| 5 | W11 digest / pre-call brief / 24-h unmarked backstop | 07:30 daily, T-15 min, slot end + 24 h | broker only; backstop -> `escalations outcome_unmarked` | `broker_daily_digest`, `precall_brief` | yes | **No** | `lib/w11.mjs` |
| 6 | **W13 no-show & replacement** | W12 `no_show`, W29 `unreachable`, W10 C1A, hourly 48-h clocks | lead: `missed_you`; `replacements` rows; weekly max refused / dispute -> `escalations` + timeline | template; console rows | yes | **No** | `build-w09-w12-w13.mjs` "Claim replacement", "Escalate + timeline" |
| 7 | **W29 broker replies** (disposition list, quality 1-5, voice note, follow-up tap) | W07 `routeInbound` -> broker numbers -> W29 | `outcomes` rows, `broker_feedback_thanks`, admin-only `quality_signal` timeline rows | template; rows | yes | **No** (nothing tells a human) | `lib/w29.mjs`; `w07.mjs routeInbound` |
| 8 | **W22 ops alerts** (`lib/w22.mjs`) | n8n Error Trigger (every SMC workflow) + producer signals (W05, W06, W20, W27, W30/31, W34, SUB-whatsapp-send, SUB-capi-send) | email ALWAYS to `OPS_ALERT_EMAIL` (Resend via `smc-email-send`, from hello@sortmycover.co.za); **WhatsApp `ops_alert` via SUB-whatsapp-send to `OPS_WHATSAPP_JONATHAN` (+KG) only for red / `notify_now`, never for a synthetic signal**; 24-h dedupe per `signal_key|scope|severity` | `ops_alert` template (3 vars) | yes (template) | **Partly** (red only; amber = email) | Twilio read receipts 18-21 Oct; run 19518 today = amber -> email 200, no WA; W22 static `sent` map |
| 9 | **W34 DSR intake / breach / retention** | howzit@ mail (Outlook trigger) + manual webhook; nightly 02:30 | `escalations kind dsr` + W22 `dsar_received` (amber + `notify_now` -> email + WhatsApp to Jono); `popia_breach` red -> both phones; `w34_retention_failure` red -> both; monthly report -> email | via W22 `ops_alert` | yes | **Yes** (through W22) | `W34.json` nodes "Alert Information Officer (W22)", "Alert breach (W22)" |
| 10a | **W07 Lindi hand-offs** (`human_handoff`, `frustrated`, `unanswered`, `claim_problem`, `complaint`, `sensitive`, `guardrail_trip`) | Lindi turn labels (`lib/w07.mjs planActions`) | `escalations` row + node "Alert ops" -> `ops_alert` via SUB-whatsapp-send to `OPS_WHATSAPP_JONATHAN` (+KG when `sensitive`), `record:false`; synthetic subjects: row only | `ops_alert` | yes | **Yes, but broken copy**: var 1 (the name slot) carries the text, var 2 is the word "now" ("Hi Chat handoff (unanswered): , a SortMyCover system alert... What happened: now"); `CONSOLE_URL` unset | Twilio 21 Oct 19:18; `W07.json` node code |
| 10b | **W07 pre-consent hand-off** (distress / asked for a person before consent) | `routeInbound handoff_pre_consent` | `ops_alert` to both numbers; the person gets nothing automated | `ops_alert` with 4 params + URL button against a 3-var content; **puts the full phone number in var 1** | yes | Yes (same copy defect; POPIA: full number in the template) | Twilio 21 Oct 12:39 / 14:32 |
| 10c | **W07 never-silent fallback** (a hand-off to W03/W04/W05/W10 produced no reply in 25-45 s) and `LINDI_BRAIN_URL` unset | parallel guard | lead: one holding line; `escalations needs_human/urgent`; owner: EMMA `/api/notify` (Teams/Telegram) | free text (`w07.neverSilentAlert`) | n/a | **No** | `patch-w07-never-silent-alert.mjs`; 20+ `needs_human` rows 17-20 Oct |
| 11a | **Voice (smc-voice) call-back request** (caller said no to WhatsApp) | ElevenLabs tool `request_callback` | `team-notify` (Resend, from howzit@) email to howzit@ + jonojettoo@leadvelocity.co.za, cc KG; `lead_activities voice_callback_requested` | plain email (carries the number: team-only) | n/a | **No** (email only) | `smc-voice/index.ts requestCallback`, `smc_voice_lib.ts callbackAlertEmail` |
| 11b | Voice WhatsApp hand-off (`send_whatsapp_followup`) | caller said yes to WhatsApp | template (`smc_start_here` / `smc_qualify_budget`) to the CALLER; the `leads` row then shows up in W38 (#1) | template | yes | via #1 only | `communications` rows 20/21 Oct "voice handoff" |
| 11c | Voice missed call / callback no-answer / cancelled | `/status`, `/tick` (pg_cron) | automatic callback (`SMC_CALLBACKS_ENABLED`), `lead_activities` rows; **nobody is told** | - | - | **No** | `smc-voice/index.ts scheduleCallback`, `callbackClosed` |
| 12 | W03 wills opener; W39 `/start/` wills / "something else"; W37 Cal.com | intake | `escalations human_handoff` / `needs_human` rows only (W39: one per lead per day) | console rows | - | **No** | builders; rows 20/22 Oct "start page: the lead also asked for help with a will" |
| 13 | W15 STOP / "changed my mind" | inbound STOP | lead confirmation; adviser `broker_lead_opted_out`; "changed mind" -> `escalations other` | template; row | yes | **No** | `lib/w15.mjs`; row 21 Oct |
| 14 | W36 Capital Legacy watch | Monday 07:00 | email to `CL_WATCH_TO` (jono@vantagestack.co.za) via Graph howzit@ | email | n/a | **No** (email) | `build-w36-capital-legacy-watch.mjs` |
| 15 | W01 held / low-budget / no-capacity leads; W08 nudges; W09 reminders | intake, sweeps | lead-facing only; failures -> W22 (#8) | templates | yes | via #1 (lead row) | `lib/w01.mjs`, `w08.mjs`, `w09.mjs` |
| 16 | **`escalations` table itself** | written by W03, W07, W10, W11, W12, W13, W15, W34, W37, W39 | the CRM console queue; **nothing pushes it anywhere** (only W07 10a adds its own WhatsApp). 34 rows in 7 days, 1 resolved | - | - | **No** | `select ... from escalations where raised_at > now()-'7 days'` |
| 17 | Edge: `appointment-allocation` (admin "Pick a time"), `team-notify` | admin actions | client / adviser email + `booking_confirmed`; team email only | - | - | **No** | functions source |

Summary: of 17 paths, only three WhatsApp Jono from the SMC number today (W22 red, W34 via W22, W07 hand-offs), one of
them with mangled variables. Lead and booking arrivals (W38), every console escalation (W10/W11/W12/W13/W15/W03/W39),
the never-silent and rebook-failed alerts, voice call-backs and amber ops alerts do not.

---

## 4. What must change (fewest moving parts)

### 4.1 One helper, one transport, one template

**As built (branch `feat/smc-owner-whatsapp-alerts`, reviewed 24 Oct):** the helper's signature is
`ownerAlert({ what, detail, who: 'owner' | 'kg' | 'both', source, key, subject, window_open }, env)`; the utility template is
named **`ops_update`** (not `owner_update`) and has the same three body variables as `ops_alert` (`[name, what, detail]`),
so one variable plan serves both; the owner number is `SMC_OWNER_WHATSAPP`, else `OPS_WHATSAPP_JONATHAN`, else the
documented default (never empty, so a missing env never silences the owner); the `lead_activities` union also sweeps W01's
`routed` row, so a lead routed after its own tick (every Click-to-WhatsApp lead: routing follows `/start/answers`) gets a
`Routed: <first name>, phone ends ###, to <practice> (real adviser)` line, and a routed row inside the lead's own tick is
folded into the lead line. The text below is the design record it was built from.

**`automation/lib/owner-alert.mjs`** (exported as `require('lv-automation').ownerAlert`; pure, tested), used by every
path:

```
ownerAlert({ what, detail = '', who = 'jonathan' | 'kg' | 'both', source, correlation }, env)
  -> [] | [{ kind: 'prebuilt', to: <OPS_WHATSAPP_*>, record: false, caller: source, bypass_suppression: true,
             correlation, wa: { type: 'template', template: { name: <key>, components: [body params] } } }, ...]
```

- Transport = the existing **SUB-whatsapp-send** (Twilio Content, `WHATSAPP_PROVIDER=twilio`, from +27 60 015 6480).
  It already applies `DRY_RUN_SENDS`, the synthetic dry-run and the allow-list; no new sender, no Meta/Graph path.
- Template key = `owner_update` when `TWILIO_CONTENT_SIDS.owner_update` exists, else **`ops_alert`** (approved, SID
  live today). Vars: `ops_alert` -> `[name, what, detail || 'See the CRM']`; `owner_update` -> `[name, what + detail]`.
- Hygiene in the helper, once: `w22.redact()` (emails, SA numbers, SA IDs), `wa.cleanParam()` (no newline/tab, no 5+
  spaces), clip each var (300 chars; multi-line digests joined with " | ", cut with "...(see the CRM)"), skip when the
  subject is synthetic (`w07.syntheticSubject` / `w22.synthetic`), no item when the recipient env is empty.
- `record:false` + `bypass_suppression:true` for the reasons in section 2 (Jono's number is also a test lead).

**New utility template `owner_update`** (the proper one; `ops_alert` is the stopgap):
`automation/templates/owner_update.json`: UTILITY, body `SortMyCover update for {{1}}: {{2}}`, footer `SortMyCover`,
no buttons; add it to `FLOW_TEMPLATES` in `templates/twilio/build-content.mjs`, regenerate
`templates/twilio/content/owner_update.json`. Jono submits with
`node automation/templates/twilio/submit-twilio.mjs --submit --only owner_update`, pastes the SID into
`TWILIO_CONTENT_SIDS`, recreates the container (`/opt/leadvelocity-n8n/dc up -d --force-recreate n8n`). Until then
every path uses `ops_alert`, whose body reads "system alert ... details are in your email": acceptable for days, not
weeks, and it is billed as MARKETING.

### 4.2 Wiring, per path

| Path | Change |
|---|---|
| **W38** (#1) | Replace the EMMA POST with `ownerAlert()` -> Execute Workflow `smc-whatsapp-send` (wait for it); commit the watermark only on `ok` (same `commit()` contract: treat `{ ok:true }` as 2xx). Keep the EMMA POST as the **fallback rung** when the sub answers `ok:false`, so Teams/Telegram still mirror. Per-item lines joined with " | " to fit one template parameter. |
| **W38 covers the console queue** (#4, #5, #6, #12, #13, #3 second-reschedule, #10c rows) | Add ONE more `UNION ALL` to W38's SQL: `public.escalations` rows with `raised_at > since` (kind, severity, `esc_kind` from the note, first name + phone last 3 via `leads`), rendered as `- Needs a person: <esc_kind>, <first name>, phone ends ###, <practice>`. Same watermark, same `seen` de-dupe, same sender: **zero edits to W03/W10/W11/W12/W13/W15/W37/W39**. Optional fourth union over `lead_activities` for `voice_callback_requested` (#11a) and `voice_whatsapp_handoff`. |
| **W07 hand-offs** (#10a, #10b) | "Alert ops" and "Pre-consent handoff: alert ops" build their items with `ownerAlert()`: fixes the variable order, drops the 4th param + dead URL button, replaces the full number with the last 3 digits (first name when known). Recipients unchanged (`sensitive` -> both). |
| **W07 never-silent** (#10c) and **W10 rebook failed** (#3) | Swap the EMMA POST node for the SUB call through `ownerAlert()` (same text from `w07.neverSilentAlert`), EMMA kept as fallback only. |
| **W22** (#8) | `plan()`: WhatsApp for amber too (owner rule = every notification); keep the 24-h dedupe, keep synthetic = email only, keep KG on `to: both`. |
| **Voice call-back** (#11a) | Either the `lead_activities` union above (no edge-function change), or `smc-voice requestCallback` posts the same Content SID to `SMC_OWNER_WHATSAPP` next to the team email (it already sends Content templates through Twilio). The union is fewer parts. |
| EMMA | Demoted to a mirror. No change needed in EMMA. |

### 4.3 Guard rails that stay

- `SMC_TEST_PHONES` numbers (Jono, KG) are never dry-run: the sender keeps reading only `SYNTHETIC_TEST_NUMBERS`
  (`sub-whatsapp-send.decide`), and W38's labels keep saying `[test data]` / `(TEST practice)` for test leads.
- Synthetic subjects (`+276000009xx`) still never WhatsApp anyone: `escalations`/email are the record.
- POPIA minimisation unchanged: first name, phone last 3, labels; `redact()` on every variable; never the message text.
- Dedupe: W38 `seen` map (lead / booking / escalation ids), W22 24-h key.

### 4.4 Tests and proof

- New `automation/tests/owner-alert.test.mjs`: var count equals the Content var plan for both keys; redaction; no
  newline in any var; recipients per `who`; synthetic -> `[]`; no env -> `[]`; `record:false`, `bypass_suppression:true`.
- `W38.test.mjs`: escalation union renders; sender gated (`findUngated`); EMMA only on `ok:false`; watermark held on
  `ok:false`. `W07.test.mjs`: hand-off alert items come from the helper. `W22.test.mjs`: amber plans a WhatsApp.
- Builders regenerate with no diff: `node automation/build-w38.mjs && node automation/build-w22.mjs && node
  automation/patch-w07-never-silent-alert.mjs && git diff --exit-code automation/W38.json automation/W22.json automation/W07.json`.
- Live proof after import (Jono-gated deploy): one test lead from Jono's own number (routes to the test practice) ->
  a WhatsApp from +27 60 015 6480 within 60 s; Twilio Messages API shows it; W38 static `last` carries the Twilio
  `SM...` id; EMMA journal shows no `/api/notify` for that tick (or only the fallback).

### 4.5 Deploy (user-gated, in order)

1. Stopgap needs **no env change**: `ops_alert` SID and `OPS_WHATSAPP_JONATHAN` are already live. Import W38, W07, W10,
   W22 (`automation/emma-vps/import_wf.sh`), which restarts n8n.
2. `owner_update`: Jono submits the Content + approval, adds the key to `TWILIO_CONTENT_SIDS`, recreates the container.
3. When "Zoe Experience" exists: change `OPS_WHATSAPP_JONATHAN` (and the sender env) only; no code change.

---

## 5. Evidence log (commands and sources)

- n8n DB (read-only): `workflow_entity.staticData` for smc-w38 / smc-w22; `execution_entity` 24 Oct 05:55-06:40 UTC;
  execution 19518 data (`statusCode: 200`).
- VPS: `docker exec lv-n8n-n8n-1 printenv <NAME>`; `journalctl -u emma --since "2026-10-24 06:05 UTC"`; `curl
  127.0.0.1:3000/api/whatsapp/status` -> `{ready:true}`.
- Twilio (GET): `/2010-04-01/Accounts/{sid}/Messages.json?To=whatsapp:+27725548057`;
  `content.twilio.com/v1/Content/{ops_alert}` and `/ApprovalRequests` (approved, MARKETING).
- Supabase `cmsylaupctrbsvzrgzwy` (read-only): `leads` 5730e361, `lead_activities`, `communications` 05:50-07:30 UTC,
  `escalations` 7 days, `appointments` 3 days, `brokers` 306062a1 / f688380e, suppression columns.
- Code: `automation/lib/{w38,w22,w07,w05,w10,w12,w13,w29,w11,w15,w39,sub-whatsapp-send,routing-split,wa,wa-provider,egress-gate}.mjs|cjs`,
  `automation/{W07,W10,W34}.json`, `automation/build-*.mjs`, `supabase/functions/{smc-voice,team-notify,appointment-allocation}`,
  `supabase/functions/_shared/smc_voice_lib.ts`, EMMA `src/index.ts` (`/api/notify`) and `src/notify/deliver.ts`.
