# Automation contracts (backend ↔ page, portal, console)

Owner: automation-engineer. Each section is the single definition other agents wire against. If a section contradicts another file, this file wins for the interface, and the other file gets a `needs_human` note. No secrets appear here: only env **names**.

---

## lead_token (I-29)

**What it is for.** The landing page calls `GET /slots` and `POST /book` after `POST /lead`. The token proves which lead the browser is acting for. **The browser never sends a broker id.** The server gets the broker from the lead row.

### Format
```
lt1.<lead_id>.<exp>.<sig>
  lead_id  leads.id exactly as stored (uuid in production; [A-Za-z0-9_-]{1,64})
  exp      unix seconds = mint time + 14 days (1,209,600 s)
  sig      base64url( HMAC-SHA256( LEAD_TOKEN_SECRET, "<lead_id>|<exp>" ) ), no padding (43 chars)
```
- Implementation: `automation/security/lead-token.js` (`mintLeadToken`, `verifyLeadToken`). It is zero-dependency CommonJS, inlined into n8n Code nodes the same way as `verify-webhooks.js`. Tests: `automation/security/lead-token.test.js`.
- **Constant-time compare:** `crypto.timingSafeEqual`. A length mismatch still burns one compare, and with rotation both secrets are always tried (no early exit).
- **TTL 14 days.** Verify refuses anything expired, and anything whose `exp` is further out than 14 days + 5 min (a leaked secret cannot mint long-lived tokens unnoticed). `LEAD_TOKEN_TTL_HOURS` is documented as 336 and is not a tuning knob.
- **Stateless.** Nothing is stored. Revocation is the lead row check that follows every verify: the row exists, `opted_out_at is null`, and it was not erased by W34. A STOP or an erasure therefore kills the token at once.
- **Rotation:** set the new value in `LEAD_TOKEN_SECRET` and the old one in `LEAD_TOKEN_SECRET_PREVIOUS`. Clear the previous value after 14 days.
- Secrets: `LEAD_TOKEN_SECRET` must be at least 32 random characters, server-side only (n8n env). It is never in the page build, never in Supabase client env, and never logged.

### Who mints it
| Path | When | Where the token goes |
|---|---|---|
| W01 (page) | in the `/lead` response, right after the lead insert | response body `{ "lead_id": "...", "lead_token": "lt1...." }`. The page keeps it in memory or `sessionStorage` only (never a cookie, never the URL) |
| W02 (instant form) | after the W01 core insert | passed to W06, so any web link it builds (page booking fallback) carries it in the **fragment** `#lt=...` (fragments are not sent to servers or referrers) |
| W03 (CTWA) | node "Mint lead_token" after "Insert lead (consent at the tap)" | same as W02 |

A merged duplicate (90-day dedupe) gets a fresh token for the **existing** lead id. The page never learns whether a lead was a duplicate.

### How it is sent
- `GET /slots` and `POST /book` carry the request header **`X-Lead-Token: lt1....`**. It is a header, not a query parameter or body field, so it stays out of access logs, the Referer and caches. CORS on `API_HOST` must list `X-Lead-Token` in `Access-Control-Allow-Headers` (devops-security, Traefik `headers` middleware).
- `/book` also keeps its existing body (`request_id`, `slot`, `method`, `email?`, Turnstile token). **I-45h guard (page / lead-token calls only):** body `turnstile_token` (Turnstile `action=book`, single-use, re-executed per booking) is verified server-side; missing/invalid/wrong host or action -> `400 try_again`; siteverify unreachable -> **`503 try_again` (fails closed, NH-32; `TURNSTILE_FAIL_MODE` is `/lead`'s switch only)**; per-IP (`RATE_LIMIT_PER_IP_PER_HOUR`, 10) or per-lead-token (`RATE_LIMIT_PER_NUMBER_PER_DAY`, 5) over the limit -> `429 rate_limited`. Broker-JWT console calls and sub-calls (W07/W10/W28) skip the guard. It **may** echo `lead_id` for logs, but the server uses the token's lead id, and a mismatch returns `401`.

### What the server does (W04 `/slots`, W05 `/book`)
1. `resolveSlotsCaller()` / `verifyLeadToken()`. Failure returns `401 {"error":"try_again"}`. The reason (`missing|malformed|bad_signature|expired|exp_too_far`) is logged, never returned.
2. `SELECT broker_id, brand_id, opted_out_at FROM public.leads WHERE id = $lead_id`. If there is no row, or the lead opted out, return `401`. If `broker_id` is null (not routed, out of band), return `200 {"slots":[],"fallback":"whatsapp"}`.
3. Run the W04 slot engine for **that** broker. Any `broker`, `broker_id` or `brk` query parameter is ignored and never echoed (test: `lead-token.test.js` "lead path").
4. The rate limits and Turnstile from W03-notes B.3 still apply. The token replaces B.3 step 6's "opaque 128-bit token stored as sha256, TTL 7 days". **This contract supersedes that line**, so `leads.lead_token_hash` and `leads.lead_token_expires_at` are no longer needed (drop them from the schema ask).

### Landing page change (landing-page-builder)
`landing/template/page.js` currently builds `'/slots?broker=' + lead.broker_id + '&lead_id=' + ...`. Change it to `'/slots?days=5'` with header `X-Lead-Token: <lead_token from the /lead response>`, and add the same header on `/book`. The `/lead` response no longer needs to return `broker_id` to the page.

---

## /slots broker-authenticated path (I-30a)

The portal's "next free slot" tile calls the **same endpoint and the same slot engine** with the broker's own Supabase session. W20 keeps `brokers.next_free_slot_at` fresh as a cache. The live call is the truth.

```
GET {API_HOST}/slots?limit=1
Authorization: Bearer <Supabase access token of the signed-in broker>
```
- **Caller switch** (`resolveSlotsCaller` in `lead-token.js`):
  - `Authorization` only: broker path.
  - `X-Lead-Token` only: lead path.
  - Both: `400 ambiguous_caller`.
  - Neither: `401`.
- **Verify:** HS256 with `SUPABASE_JWT_SECRET` (env name).
  - `alg` must be `HS256`. `none` and RS/ES are refused, which closes alg-confusion.
  - The signature is compared in constant time.
  - `exp` and `nbf` have 30 s leeway.
  - `aud` must contain `authenticated` and `role` must be `authenticated`.
  - `sub` must be a uuid.
  - ASSUMPTION: the project still signs with the shared JWT secret. If it has moved to asymmetric signing keys, swap `verifySupabaseJwt` for a JWKS verify; the contract is unchanged.
- **Broker row:** `SELECT * FROM public.brokers WHERE user_id = $sub`. If there is no row, return `403`. An admin JWT does **not** get another broker's slots on this path (the console reads `next_free_slot_at`).
- **Response:** `{"slots":[{"start":"2026-10-14T10:00:00+02:00","end":"..."}],"next_free_slot_at":"..."}`. `limit` defaults to 1 and is capped at 3. No lead data is ever returned. The response is cached for 60 s per broker (shared with the lead path).
- Tests: `automation/security/lead-token.test.js` (broker path, wrong secret, `alg=none`, expired, anon role, both credentials, none).

---

## W32 approvals come from `ops.notifications` (I-30j)

**The console never calls a W32 webhook.** On Approve, Snooze or Decline, `src/pages/smc/Today.tsx` updates `ops.proposals` (guarded `status = 'proposed'`) and inserts one outbox row:

| column | value |
|---|---|
| `kind` | `approval` |
| `recipient` / `to` | `jonathan` (sync trigger fills both) |
| `channel` | `console` |
| `source` | `console` |
| `status` | `queued` |
| `proposal_id`, `ref_table`, `ref_id` | the proposal (`ops.proposals`) |
| `dedupe_key` | `proposal:<id>:<decision>` |
| `payload` | `{ decision: approve or snooze or decline, proposal_id, decided_by, reason, via: "console" }` |

**W32 consumes it by polling** (Schedule Trigger, every minute; n8n's Postgres Trigger/LISTEN is not used because it drops events across restarts). The claim is one statement, safe for overlapping runs:
```sql
UPDATE ops.notifications n
   SET status = 'sending', updated_at = now()
 WHERE n.id IN (SELECT id FROM ops.notifications
                 WHERE kind = 'approval' AND source = 'console' AND status = 'queued'
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT 20)
RETURNING n.id, n.proposal_id, n.payload;
```
For each row, W32 runs its existing "Approve decision" branch (today fed by the `smc-w32-decision` webhook):
- **approve:** create the `build/tasks.json` task, set `ops.proposals.task_id`, and send the WhatsApp/console confirmation.
- **snooze:** nothing further (the console already set `snooze_until`).
- **decline:** log the reason in the journal.

Then:
```sql
UPDATE ops.notifications SET status = 'acked', acked_at = now(), acked_by = 'w32', updated_at = now() WHERE id = $1;
-- on error: status = 'send_failed', error = <message>; W22 alerts on any approval row in send_failed or queued > 10 min
```
- **Filter on `source = 'console'`.** W32's own outbound rows of kind `approval` (the reminders from `ops.notifications_due()`) are `source` null or `W32` and must never be consumed as decisions.
- Idempotent: the proposal update is already guarded by `status = 'proposed'`, and `dedupe_key` prevents a double row per decision.
- The `smc-w32-decision` webhook stays for the WhatsApp Approve button (Meta → W07 ingress `POST /whatsapp` → W32; see "Inbound ownership"). It is no longer needed by the console.
- **Wiring:** `automation/W32.json` is optimisation-advisor's file. Add one Schedule Trigger + the claim query + the ack query in front of its existing decision branch. That is not done in this pass (needs_human, owner optimisation-advisor).

---

## W28 flow_token (decided in this pass)

`ft1.<lead_id>.<kind>.<booking_id|->.<exp>.<sig>`, where `sig = base64url(HMAC-SHA256(LEAD_TOKEN_SECRET, "ft1|lead_id|kind|booking_id|exp"))`, `kind ∈ {book, reschedule}`, TTL 14 days. It is minted by W06/W10 when they send `broker_intro_slots_v2` / `reschedule_offer_v2` (`mintFlowToken`). The W28 endpoint trusts only this mapping. This replaces the `flow_tokens` table and the `ft_{lead_id}_{nonce}` format in `flows/booking-flow-endpoint.md` §2, so no new table is needed. Per-token error counts and the typo-suggestion memory live in `lead_activities` (`flow_error`, `flow_email_suggested`, keyed by `payload.flow_token`).

---

## Sub-workflow interfaces (I-35c)

Every call is an n8n **Execute Workflow** by stable id (`mode: 'id'`, `smc-wNN`, I-44b; the name stays as `cachedResultName` for readers), fire-and-forget (`waitForSubWorkflow: false`) unless the row says **waits**. The callee owns its own messages, rows and retries. Every write is keyed by the `idempotency_key` given (or the one named here), so a re-run sends nothing twice. A missing required field is logged as `lead_activities.activity_type = 'subcall_rejected'` and stops; it is never guessed. The core-path builds (W04, W05, W09, W12, W13) honour these rows after GATE-TEST-*; callers already send them (W07, W10, W11, W28, W29, W03).

| Callee (name) | Input | Returns (if **waits**) | Callers | Rules |
|---|---|---|---|---|
| `W04 Slots API` — list | `{ broker_id, exclude_booking_id?, limit?: 10, day?: 'YYYY-MM-DD' }` | **waits** → `{ slots: [{start, end}], fallback?: 'whatsapp' }` | W10, W28, W07 (`W04_list`) | Same rules as `GET /slots` (hours, 30-min slots, 15-min buffer, 2-h notice, 14-day horizon, day/week caps, holidays, spread across days). `exclude_booking_id` treats that booking's own time as free (a move never collides with itself). Calendar auth error → `fallback: 'whatsapp'`, `slots: []`. |
| `W04 Slots API` — `is_free` | `{ op: 'is_free', broker_id, start, end, exclude_booking_id? }` | **waits** → `{ free: bool, next_slots: [{start,end}] × 3 }` | W10 (move), W05 (book) | Outlook `getSchedule` + our own `appointments` (buffer). Any calendar error → `free: false` (fail closed). |
| `W04 Slots API` — `graph_token` | `{ op: 'graph_token', broker_id }` | **waits** → `{ access_token, expires_at }` or `{ error: 'refresh_failed' }` | W05, W10 | W04 is the only refresher. Refresh failure writes `calendar.refresh_failed` and raises W22. The token is never logged or stored in an item that reaches a log node. |
| `W05 Book` — book | `{ lead_id, slot_start, method, booked_via: 'page'\|'chat'\|'flow', email?, previous_booking_id?, idempotency_key }` | — (W05 messages the lead itself) | W07, W28, W10 | `previous_booking_id` = a rebooking after a cancel or a no-show: W05 links `appointments.previous_booking_id`, does not resend the intro card (`booking_confirmed` only) and does not start a second W09 T-48 h media message. W05 re-checks with `is_free` inside the insert. Slot gone → next 3. CAPI `Schedule` once per booking. |
| `W05 Book` — `update_method` | `{ op: 'update_method', booking_id, method, email? }` | — | W10 | Same `appointments` row and same Graph event (PATCH): online-meeting on/off, body, title. Teams/Zoom/Meet without an email → W05 asks for one (W28 email step) before patching. Broker told by `brokerNotice('method')`. |
| `W09 Reminder sequence` — `pause` | `{ op: 'pause', lead_id, reason: 'sensitive'\|'human_handoff'\|'opt_out' }` | — | W07, W15 | Pauses every unsent job for the lead's live booking. Resumed only by a human in the console (`op: 'resume'`). |
| `W09 Reminder sequence` — `rebuild` | `{ op: 'rebuild', booking_id }` | — | W10, W05 (`previous_booking_id`) | Cancels unsent jobs and schedules the 4.12 sequence again from the new time. Intro media (T-48 h) is not repeated if it was sent. Booked < 24 h ahead → compressed sequence. |
| `W09 Reminder sequence` — `cancel_all` | `{ op: 'cancel_all', booking_id }` | — | W10 (cancel), W13, W15 | Cancels every unsent job. Idempotent. |
| `W12 Outcome, disposition & feedback` — `auto_attended` | `{ event: 'auto_attended', outcome_id }` | — | W11 (24-h sweep) | The `outcomes` row already exists (`outcome = 'attended'`, `auto_marked = true`, `unconfirmed = true`, `marked_via = 'auto'`, `lead_reach_check` copied). W12 runs only the attended path: `attended_thanks`, CAPI `Attended`, W29 `outcome_recorded`. It never asks the broker again. |
| `W12 …` — `reach_check` rows | Lead taps `reach_yes` / `reach_no` on `reach_check` (T+30) via W07 | — | W07 | W12 writes `lead_activities (activity_type = 'reach_check', payload.answer = 'yes'\|'no', payload.booking_id)`, idempotency key `w12:reach:{booking_id}`. One row per booking, last answer wins. W11 and W13 read the latest row. `no` + broker silent → broker no-show path (Schedule D). |
| `W13 No-show & replacement` — `claim` / `withdraw` | `{ op: 'claim'\|'withdraw', outcome_id, reason: 'uncontactable'\|'disqualified', reason_code }` | — | W29, W12 | W13 owns `replacements` (per-cycle cap Bronze 4 / Silver 6 / Gold 9, `over_cap`, 48-h dispute window). `withdraw` only before the window closes. Nobody else writes `replacements`. |
| `CAPI Send` | `{ event_name: 'Lead'\|'Schedule'\|'Qualified'\|'Attended'\|'GoodFit', event_id, action_source: 'website'\|'business_messaging'\|'system_generated', lead_id, brand_id, ctwa_clid?, value?, event_time? }` | — | W01, W03, W05, W12, W29 | Wraps `automation/capi/capi.js` (`sendEvent` / `sendOffline` / `sendBusinessMessagingLead`). `event_id` per `capi/event-spec.md` (browser UUID, or `evt_<lead_id>_<stage>`). Consent gate first (event-spec "Consent gate"). Back-off at 80% of the usage header; 3 tries, then W22. PII is hashed inside the callee, never in the caller's item. |

---

## Inbound ownership (I-35d)

**W07 owns `POST /whatsapp`.** It is the only workflow subscribed to the `whatsapp_business_account` callback. It verifies `X-Hub-Signature-256`, answers 200 at once, claims the wamid (idempotent), writes status receipts (disclosure evidence), and routes deterministically: STOP → W15, broker numbers → W12/W29, `nfm_reply` (`flow_complete`) → W05 (I-45d; W28 is only the encrypted `data_exchange` endpoint), taps → their owners, everything else → its own agent. Delivered/read/failed receipts of W06 messages (`communications.workflow = 'W06'`) go to W06 `{ op: 'status', wamid, status, at, errors }` (`lib/w07.mjs w06StatusItem`, I-45d).

**W03 is a sub-workflow.** W07 calls `W03 Lead intake (Click-to-WhatsApp)` with `{ source: 'W07', route, msg, lead, booking }` when the sender has no open lead, the message carries a CTWA `referral` or the prefill text, or the lead is mid-qualification (`consent_pending`, `q_*`). `msg` is W07's `normaliseInbound()` shape; W03's first node rebuilds the Cloud API message for `ctwa/w03.js`, so the tested logic is unchanged.

**Change made in this pass:** until now `automation/W03.json` had its own `POST /whatsapp` webhook (signature check, wamid claim, status/STOP/broker/Flow routing). Two POST listeners on one path cannot both be active in n8n, and Meta allows one callback URL per app. The W03 POST webhook, signature check, claim and routing nodes are removed (`automation/build-w03-w28.mjs`, regenerated). W03 now starts at `Called by W07 (CTWA lead)` (Execute Workflow Trigger).

**Still listening in W03:** `GET /whatsapp` (Meta's one-time verify handshake, because W07 has no GET node) and `GET /wa/:ref` (I-09 tracked redirect). These are GET only and do not compete with W07.

**Open points:**
- W03 → `W07 Conversation agent (forward)` (existing 90-day lead found by W03's own dedupe) can loop if W07 routes the same item back to W03. W07 must treat `source = 'W03'` as a known lead and never route it to W03 again (automation-engineer, W07 follow-up). **Resolved, fix wave 4 (I-37e):** W03's `Mark origin w03 (loop guard)` sets `origin: 'w03'` on the hand-back; W07's sub-call trigger sends it through `W03 forward: loop guard` to Load context, and `routeInbound` never returns `W03` for it (known lead → `nlu`, otherwise `ignore_loop`, logged only). W32 Approve/Later taps (`approve:<uuid>` / `later:<uuid>` from `OPS_WHATSAPP_JONATHAN`/`_KG`) route to W32 `Console decision (sub-call)`.
- **Qualifying ownership (I-47a / I-48k, 2026-10-03):** W03 qualifies every `q_*` answer, tapped or typed. W07 routes taps in `consent_pending` / `q_age` / `q_budget` / `q_budget_clarify` / `q_bond` / `q_dependants` / `q_method` to W03, and delegates typed answers (`record_answer`, `next_question`, `repeat_question`, `budget_clarify`, `close_oob`) with the intent-slot `slots`. With no `wa_threads` row W03 rebuilds the thread from the lead (`conv_state.state` + stored bands), maps NLU bands to DB codes, writes the answer and `leads.conv_state.state`, then asks the next question in the 4.6 order (NH-59) or closes out-of-band. When the last answer is in, a routed lead is handed back to W07 (`after_qualifying`) and an unrouted one goes to W01 Lead core. On a turn it hands to W03, W07's "Save conv_state" does not write `state`.
- **One reply per inbound message (I-48b):** every lead-facing reply in W07 and W03 first claims `w07:reply:{wamid}` in `public.webhook_events` (source `whatsapp`, `ON CONFLICT DO NOTHING`). If the claim returns no row, nothing is sent. `msg.hops` counts W03/W05/W07 hand-offs; above 3, the item is logged (`hop_limit:{wamid}`) and stops. W03 also logs an unknown receiving number (`w03:no_brand:{wamid}`) and raises the W22 signal `w03_no_brand`.
- `automation/W23.json` uses an n8n **WhatsApp Trigger** (broker media capture). That registers its own app subscription and competes with W07's callback. W23 should be called by W07/W12 instead (needs_human, owner of W23). **Resolved, fix wave 4 (I-37d):** W23 starts at `Called by W07 (broker media)` (Execute Workflow Trigger); W07 routes broker video (any status) and broker audio while the broker is pre-live (`invited`…`ready_for_go_live`) there with a Cloud API message item (`w23MediaItem`); a live broker's audio stays W29 feedback.
- Ops taps (W32 Approve / Later on `ops_action`) arrive on the same callback. W07's router has no W32 route yet (follow-up, automation-engineer with optimisation-advisor).

## `leads.last_contact_at` — every outbound to the lead updates it (I-38d, 2026-10-02)

**Rule:** every message we send that concerns a lead and that Meta accepts (a `wamid` comes back) sets `leads.last_contact_at = now()` for that lead, in the same branch as the send. W34 runs its 12-month pseudonymise clock and its 5-year consent clock from the latest of `last_contact_at`, `opted_out_at` and `created_at`, so a workflow that sends without touching it makes the lead's data expire early. Dry runs (`DRY_RUN_SENDS=true`) and rejected sends do not touch it. Broker-only and ops messages that are not about a specific lead do not touch it.

| Workflow | Status |
|---|---|
| W03, W07 | Already update it (CTWA intake, conversation agent). |
| W10 | Done: `Touch leads.last_contact_at (lead outbound)` after `Send WhatsApp`; broker notices are skipped (`lib/w10.mjs leadOutbound`). |
| W11 | Done: the 07:30 digest touches every lead on the broker's list for today, and the T-15 brief touches its lead. Both go to the broker, but each comes right before the broker's call with that lead. If the practitioner rules that only messages *to* the lead restart the clock, remove these two nodes (NH, I-38d practitioner question). |
| **W08** (unbooked nurture) | **To do, owned by the W08 engineer:** add the same `UPDATE public.leads SET last_contact_at = now() WHERE id = $1::uuid AND $2 <> ''` (wamid) after each nudge send. |
| W09 (reminder sequence, core path) | Done in the GATE-TEST-W09 draft: `Touch leads.last_contact_at (lead outbound)` after `Send WhatsApp` for every reminder / what-to-expect / intro-media / prep / Confirm reply / voice-note send. W12 (`attended_thanks`, `reach_check`, broker no-show apology) and W13 (`missed_you`) drafts use the same node; broker messages do not touch it. |
| W05, W06, W12, W13, W15, W35 | Owners check their lead-facing sends against this rule at their next pass. |

The alternative (only inbound restarts the clock) is the open practitioner question in I-38d; until it is answered, this rule applies.

## W10 → W13 — Schedule C1A claims (I-37l, default pending NH-42)

W10 sends `W13 No-show & replacement` `{ op: 'claim', lead_id, booking_id, outcome_id: null, reason, code, reason_code, idempotency_key: 'w10:c1a:{booking_id}' }`:
- a verified lead (replied or tapped within 72 h of the first message) who cancelled and did not rebook by the end of the one rebooking offer and the follow-up sequence (96 h after the cancel): `reason: 'uncontactable'`, `code: 'unreachable'`, `reason_code: 'cancel_no_rebook'`;
- a verified lead who said plainly "I don't want a call" / "No thanks" after cancelling: `reason: 'disqualified'`, `code: 'nofit_criteria'`, `reason_code: 'no_call'`. W10 op `no_call` stops messaging at once (`conv_state.declined_call`, W09 `cancel_all`, stage `unbooked_closed`).
- a rebook, a broker-side cancel (Schedule D), an unverified lead, or a STOP with no plain "no call": nothing is claimed.

`W10_C1A_MODE` = `a+b` (default, the drafted agreement default) · `a` · `b` · `off`, switched when Jonathan answers NH-42. W13 must accept `outcome_id: null` for C1A claims (there is no meeting, so no `outcomes` row) and store `reason_code` as given. W07 must delegate `{ action: 'no_call' }` to W10 when a lead with a booking says plainly they do not want a call. W08 must restart its +2 h / +24 h / +72 h sequence from the cancel, not from `first_message_at`, for a lead whose booking was cancelled; otherwise "the full follow-up sequence" in C1A point 3 is never sent.

## W01 / W06 / W15 interfaces (drafts pending GATE-TEST-W01/W06/W15, 2026-10-03)

| Callee | Input | Returns | Callers | Rules |
|---|---|---|---|---|
| `W01` `POST /lead` | landing body (landing/README.md) | `200 { ok, status: accepted\|held\|not_qualified, lead_id, lead_token?, methods_supported? }`, 422/429/400/403 | page | A 90-day duplicate answers `accepted` with a fresh token for the EXISTING lead (the page never learns). Suppression and dedupe use `smc_hash_contact` (digits only). Email is kept only for teams/zoom/meet. CAPI `Lead` gets ids only, never email. No lead-facing send, so `last_contact_at` is not touched. |
| `W01` `POST /lead/skip` | header `X-Lead-Token` | `202` / `401` | page "I'll pick on WhatsApp" | Calls W06 `{ op: 'skip', lead_id }`. **landing-page-builder:** `skipBook` must call this (sendBeacon). Without it, the 45-s hold still sends the slots card in under 60 s. |
| `W01 Lead core` | `{ action: 'ingest', lead }` (W02, **waits**) · `{ kind: 'route_and_first_touch', lead_id }` (W03) | `{ outcome, lead_id, broker_id, first_touch }` | W02, W03 | Routing is written before W06 is called. |
| `W06 First touch` | `{ op: 'routed'\|'skip'\|'booking', lead_id, booking_id? }` · `{ op: 'status', wamid, status, at, errors? }` | — | W01, W05 (page booking inside the hold), W07 (receipts of W06 cards) | One claim per lead (`w06:first:{lead_id}`). Quick-reply payloads: `slot_{ISO}`, `other_times`, `reschedule:{id}`, `cancel:{id}`. The communications row, `first_message_at` and `last_contact_at` are written only when a wamid comes back. A failed or rejected send goes once to Twilio SMS. **W07:** forward delivered/failed statuses for W06 cards (done, I-45d). **W05:** calls `op: 'booking'` (also accepted as `event: 'booking'`, `w06.normaliseEvent`) for every first booking; **W06 chooses** (I-45f): this booking wins `w06:first:{lead_id}` → `broker_intro_booked`; the claim was already taken (slots card out, chat/Flow booking) → `booking_confirmed` once (`w06:booking_confirmed:{booking_id}`, never after this booking's own intro card), touching `last_contact_at` only with a wamid. A rebooking (`previous_booking_id`) still gets `booking_confirmed` from W05. |
| `W15 Opt-out` | W07 `{ source, route, msg, lead }` · `{ op: 'opt_out', lead_id\|mobile, channel }` · `POST /sms-inbound` (Twilio, signed) | — | W07, console, W34 | The suppression insert `(smc_hash_contact, 'stop', brand_id NULL)` is the claim. It is followed by `opted_out_at`, cancelled bookings (`W15_STOP_BOOKING_MODE`, NH-28 b), W09 `pause`(opt_out) + `cancel_all`, a Graph DELETE, the broker notice (WhatsApp + email, first name only) and one `STOP_ACK` confirmation that touches `last_contact_at`. A repeat STOP is a no-op. |

## W09 / W12 / W13 interfaces (drafts pending GATE-TEST-W09/W12/W13, 2026-10-03)

Built by `automation/build-w09-w12-w13.mjs` from `automation/lib/w09.mjs`, `w12.mjs`, `w13.mjs` (loaded by the Code nodes with `require('lv-automation').w09` / `.w12` / `.w13`, I-46c). Workflow names carry `(DRAFT pending GATE-TEST-Wxx)` until Jonathan approves the tests; **callers reference the stable ids** (`smc-w09`, `smc-w12`, `smc-w13`, I-44b; the plain name is kept as `cachedResultName` only), so a rename never breaks a caller. All three take the virtual clock `{ now, is_synthetic: true }` only when `TEST_HOOKS_ENABLED=true` (`wa.mjs nowFrom`); production uses the wall clock.

| Callee | Input | Callers | Rules |
|---|---|---|---|
| `W09 Reminder sequence` — `schedule` | `{ op: 'schedule', booking_id }` | W05 (after the insert) | Plans the 4.12 sequence from `appointments.booked_at`. Jobs = `lead_activities` rows `activity_type = 'reminder_job'`, `idempotency_key = 'w09:{booking_id}:{touch}:{at}'`, payload `{ booking_id, touch, template, at, start, compressed }`. A job is finished by exactly one append-only `reminder_done` row (`'w09done:' \|\| job key`, payload.status `sent`\|`skipped`\|`cancelled`); that insert is the send claim, so overlapping ticks send once. `lead_activities` is never updated or deleted by W09. |
| `W09 …` — `rebuild` / `cancel_all` / `pause` / `resume` | as in "Sub-workflow interfaces"; `cancel_all` also accepts `{ lead_id }` (W13, W15) | W10, W05, W13, W15, W07, console | `rebuild` plans from now and cancels unsent jobs for another start time. `pause` / `resume` are append-only `reminder_paused` / `reminder_resumed` rows; the latest wins at send time. |
| `W09 …` — taps | W07 `{ msg }` with payload `confirm:{booking_id}` · `play_voice_note:{booking_id}` · `looking_forward:{booking_id}` | W07 | Confirm → `appointments.status = 'confirmed'`, `confirmed_at`, `leads.stage` booked → confirmed, one reply (`w09:confirm:{booking_id}`). Play voice note → the OGG note as a session audio message, `appointments.intro_played_at`. |
| `W09 …` — `tick` | every 5 min, or `{ op: 'tick', now, is_synthetic: true }` (staging hook) | schedule, test hooks | Send-time checks: STOP / suppression, pause, booking not live or moved, meeting started, quiet hours 20:00–08:00 SAST (defer; `reminder_10m` exempt), 12-message budget (reminders exempt). |
| `W12 Outcome, disposition & feedback` — taps | W07 `{ msg }`: broker `attended:{bk}` · `no_show:{bk}` · `rescheduled:{bk}`; lead `reach_yes:{bk}` · `reach_no:{bk}` | W07 | Broker mark = `lead_activities` `broker_outcome_mark`, key `w12:mark:{booking_id}` (last tap wins, same as reach). An Attended tap sends the disposition list at once (`session/broker_disposition_list.json`, row ids = 4.12a codes); the reply goes W07 → W29 (quality 1–5, voice note, thanks). |
| `W12 …` — `feedback` | `{ op: 'feedback', booking_id }` | portal / console | Sends the disposition ask: list inside the broker's 24-h window, `broker_disposition` template outside it. Once per booking (`w12:disposition_ask:{booking_id}:{list\|tpl}`). |
| `W12 …` — `voice_note` | `{ op: 'voice_note', msg: { media: 'audio', media_id, from }, booking_id? }` | (not routed yet; see NH below) | Stores only `outcomes.voice_note_url = 'whatsapp-media:{media_id}'` on the broker's latest attended outcome (60 min) or the given booking. No download, no transcript in W12. |
| `W12 …` — sweep (internal) | every 5 min | — | `broker_outcome_check` at end + 15 min (`w12:outcome_check:{bk}`), one nudge at + 3 h 15 (`w12:broker_nudge:{bk}`), `reach_check` at end + 30 (`w12:reach_check:{bk}`). Resolution writes ONE `outcomes` row (`ON CONFLICT (booking_id) DO NOTHING`, shared with the W11 backstop) + `appointments.status` + `leads.stage` + `outcome_recorded` timeline; unmarked at 24 h → attended, `auto_marked`, `unconfirmed`, escalation (two in a cycle → Jonathan). Calls on a new row: W29 `{ event: 'outcome_recorded', outcome_id }` (always), CAPI Send `Attended`, W13 `no_show`, W10 `{ source: 'W12', outcome: 'rescheduled', reason: 'broker_no_show'\|'broker_rescheduled', schedule_d, booking, lead }`. |
| `W13 No-show & replacement` — `no_show` | `{ op: 'no_show', outcome_id, booking_id, lead_id, confirmed_at, idempotency_key: 'w12:no_show:{booking_id}' }` | W12 | Starts the 48-h clock (`no_show_clock`, key `w13:no_show:{booking_id}`), sends `missed_you` once with 3 times from W04 (waits). No rebook (`appointments.previous_booking_id` or W10 `rebooked_after_no_show`) and no inbound reply in 48 h → claim `no_show`. A second no-show for the lead → claim at once. Decided once per booking (`w13:no_show_decided:{booking_id}`). |
| `W13 …` — `claim` | W10 C1A shape (`outcome_id: null` accepted), W29 `{ op, outcome_id, reason, reason_code }`, system `{ op: 'claim', kind: 'uncontactable', lead_id }` | W10, W29, W12 (via `no_show`) | **One counter.** `pg_advisory_xact_lock(hashtext('w13:cycle:' \|\| cycle_id))`, then count rows `status <> 'rejected'` for the cycle against `cycles.replacement_cap` (snapshotted from `pricing.replacement_cap_cycle`). Over the cap → row stored `rejected`, `note = 'cap_reached'`, urgent escalation (wording "committed"). One replacement per lead whoever asks first (a `withdrawn` row frees the lead). The query runs as two statements in one transaction (n8n Postgres query batching `single`). |
| `W13 …` — `withdraw` / `dispute` / `decide` | `{ op: 'withdraw', outcome_id\|lead_id }` · `{ op: 'dispute', replacement_id }` · `{ op: 'decide', replacement_id, upheld: bool }` | W29, console | Withdraw/dispute only while `status = 'due'` and inside the 48-h window. Decide: upheld → `rejected` (`dispute_upheld`), else `approved`. |
| `W13 …` — events for billing | `lead_activities` `replacement_approved` (key `w13:approved:{replacement_id}`) | read by W19 / W14 | W13 never writes `cycles`, extensions or credits; the 0.1 shortfall rule is W19's (`lib/w13.mjs cycleState` is the shared reference). |

Resolved (I-45k, 2026-10-03): W29's `W13 claim item (op, outcome_id, reason, reason_code, idempotency_key)` Code node (`lib/w29.mjs w13Call`) sits before `-> W13 claim / withdraw replacement`; key `w29:{op}:{outcome_id}:{reason_code}`.

W12 conflicts (I-50f, 2026-10-03): a broker mark that arrives after the Schedule D apology went out (`outcome = broker_no_show`, `w12:apology:{booking_id}` claimed) writes one `escalations` row (kind `outcome_unmarked`, `esc_kind=late_broker_mark`, to KG) and nothing else. On a broker Attended vs lead "No" conflict the CAPI `Attended` event is **held** (not emitted; `capi_held` on the resolution, noted in the console escalation) until KG decides; the release is built (I-51b, next section). W07 routes a live broker's audio to W29 (transcribe); W12's `voice_note` op (reference only, P17/Q22) is unused until the practitioner/privacy-notice decision picks one owner.

### CAPI `Attended` hold / release (I-51b, attribution-analyst)

`Attended` cannot be recalled, so `lib/w12.mjs capiAttendedGate()` is the single decider. **Send** on `lead_confirmed` (reach yes), `lead_window_closed` (slot end + 30 min + 2 h, nobody objected) or `kg_attended`; **hold** on `awaiting_lead` and `conflict_pending_kg` (broker Attended vs lead "No"); **drop with a logged reason** on `unreachable_disposition`, `kg_not_attended`, `no_ads_consent`, `outcome_not_attended`, `meta_window_expired`. Same `event_id` (`evt_{lead_id}_attended`) on every path, so Meta dedupes a retry; `event_time` = slot end.
- State (no DDL, `lead_activities` only): `w12:capi_hold:{bk}` (`capi_attended_held`: event_id, reason) parks it; `w12:capi_release:{bk}` (`capi_attended_release`: decision send|drop + reason) claims it once; CAPI Send runs only on a claimed `send`. A drop is the same row with the reason.
- Release: the 5-min tick re-reads reach, `outcomes.disposition_code` and the KG decision for every held booking (so an `unreachable` disposition that arrives after the Attended tap still drops it; a lead "No" that arrives after the outcome row opens the console escalation).
- KG decision entry: W12 `{ op: 'kg_decision', booking_id, decision: 'attended'|'not_attended', decided_by? }` (console -> W12). Writes `w12:kg_decision:{bk}` (first decision wins), resolves the open `esc_kind=outcome_disputed` escalation, releases or drops at once. Resolving the escalation without this op releases nothing: the hold ends in a `meta_window_expired` drop (safe default).
- ASSUMPTION (Meta behaviour, not tested against the live API): Meta rejects `event_time` older than 7 days for `system_generated` events, so a hold is dropped at slot end + 6.5 days (`CAPI_HOLD_MAX`). To be measured in staging with `CAPI_TEST_EVENT_CODE`. Sends stay behind `DRY_RUN_SENDS` inside CAPI Send.
- Resolved (NH-62, Jonathan 2026-10-03): KG `not_attended` on a broker-attended / lead-no conflict turns the `outcomes` row into `no_show` (`dispute_status=upheld`, `marked_via=console`; appointment and lead stage `no_show`), writes the audit activity `w12:kg_not_attended:{bk}` (`outcome_kg_not_attended`), drops the held Attended (`kg_not_attended`) and calls W13 `no_show` (`w12:no_show:{bk}` payload, the same op a lead no-show uses: missed_you once, 48-h clock, second no-show at once). `replacement_eligible` is the generated column, so no DDL. The claim stays inside the W13 cycle cap (Bronze 4 / Silver 6 / Gold 9); over the cap it is recorded `rejected / cap_reached` and Jonathan is alerted. The delivered/verified count is unchanged (W12 never writes it). KG `attended` keeps the outcome `attended`. The update is guarded by the first recorded decision, so a later contradicting call changes nothing. W29 `outcome_recorded` is not re-sent for the flip (quality rolls up from the original row).
- NH-63 (Jonathan, confirmed: keep): no change to the behaviour documented here.

## W04 `GET /slots` and W05 `POST /book` — request / response (I-45b, 2026-10-03)

Logic: `automation/lib/w04.mjs` (`resolveCaller`, `planRequest`, `respond`) and `automation/lib/w05.mjs` (`parseHttp`, `decide`, `afterCheck`, `taken`, `finish`); workflows `smc-w04` / `smc-w05` (Code nodes `require('lv-automation').w04` / `.w05`). Tests: `automation/tests/W04.test.mjs`, `W05.test.mjs` (the offline booking adapter runs these lib steps, I-45a). Caller rules are the "lead_token" and "/slots broker-authenticated path" sections above; nothing here changes them. All times are ISO 8601 with `+02:00` (Africa/Johannesburg). Every response carries `Cache-Control: no-store`.

### `GET {API_HOST}/slots`
| | Lead path (page) | Broker path (portal tile) |
|---|---|---|
| Auth | `X-Lead-Token: lt1....` (broker = `leads.broker_id`; any `broker`/`broker_id`/`brk` query param ignored) | `Authorization: Bearer <Supabase access token>` (broker = `brokers.user_id = sub`) |
| Query | one of `date=YYYY-MM-DD` (that day, ≤ 20 slots, Flow/day view) · `days=1..14` (every slot on the next N days that have one) · `offer=1..20` (spread offers, default 3) | `limit=1..3` (default 1) |
| 200 | `{ slots: [{start, end}], tz: 'Africa/Johannesburg', methods: [...], adviser_first_name }` (`methods` = `methods_supported`, `meet` only for Google-calendar brokers). Never lead or broker ids. | `{ slots, next_free_slot_at, more_this_week, calendar: 'graph'\|'shared'\|'none', capacity: { fill_7d, taken_7d, capacity_7d, hold, release } }` |
| 200 fallback | `{ slots: [], fallback: 'whatsapp' }` — lead not routed, or calendar unreadable (refresh failed, `needs_reconnect`). A paused or inactive broker answers 200 with `slots: []` and no `fallback`. The page shows "we'll send times on WhatsApp"; W06 sends them. | same body |
| 400 | `{ error: 'ambiguous_caller' }` (both credentials) | same |
| 401 | `{ error: 'try_again' }` — no / bad / expired token, unknown or opted-out lead (reason logged only) | bad JWT |
| 403 | `{ error: 'try_again' }` — Origin not in `PUBLIC_ALLOWED_ORIGINS` | `{ error: 'not_a_broker' }` |
| 503 | `{ error: 'try_again' }` — secrets not configured | same |

Rules applied by the engine (both paths, and the `list` / `is_free` sub-calls): broker meeting hours, 30-min slots, 15-min buffer around Outlook busy blocks and our live `appointments`, 2-h notice, 14-day horizon, day cap (3) and week cap (12, Mon–Sun), SA public holidays (`data/za-public-holidays.json` via `require('lv-automation').holidays`), offers spread across days. Calendar route: `calendar_status = ok` → Graph `getSchedule` (busy cached 60 s per broker, `is_free` always fresh); `blocked_admin_consent` / `calendar_mode = shared_fallback` → shared calendar (hours minus our appointments, 0.3 #4); anything else → fallback.

### `POST {API_HOST}/book`
Header `X-Lead-Token` (lead path) or `Authorization: Bearer` (broker path; the lead must be his: else `403 not_your_lead`). Body:
```json
{ "slot_start": "2026-10-15T10:00:00+02:00", "method": "teams|zoom|meet|whatsapp_call|phone",
  "email": "only for teams|zoom|meet", "email_confirmed": false,
  "request_id": "8-64 [A-Za-z0-9-]", "idempotency_key": "optional, [A-Za-z0-9:._+-]{1,160}",
  "context": { "event_id": "browser CAPI event id (8-64 [A-Za-z0-9-])" }, "lead_id": "optional echo; must equal the token's" }
```
`slot` is accepted for `slot_start`; `google_meet` for `meet`. Idempotency key = `idempotency_key`, else `page:{lead_id}:{request_id}`, else `book:{lead_id}:{slot_start}`. Email for a call method is dropped before anything reads it (0.1).

| Status | Body | When |
|---|---|---|
| 201 | `{ booked: true, booking_id, start, end, method, join_url, ics_url }` | Booked; also the replay of the same idempotency key, and a repeat for the lead's live booking at the same time (no second event, no second CAPI `Schedule`). `join_url` is set for Teams when Graph returns it; `ics_url` = `https://sortmycover.co.za/c/{booking_id}`. |
| 200 | `{ booked: false, fallback: 'whatsapp' }` | Lead not routed (no broker). |
| 400 | `{ error_code: 'bad_slot' \| 'lead_required' }` · `{ error: 'ambiguous_caller' }` | Slot not ISO; broker path without `lead_id`; both credentials. |
| 401 / 403 / 503 | `{ error: 'try_again' }` · `{ error: 'not_a_broker' \| 'not_your_lead' }` | As for `/slots` (lead-token mismatch with the body `lead_id` is 401). |
| 404 | `{ error_code: 'unknown_lead' }` | Broker path, lead id not found. |
| 409 | `{ error_code: 'slot_taken', next: [{start,end}]×≤3, slots: (same) }` | The `is_free` re-check (Outlook + our appointments + buffer, fail closed on calendar error) or the INSERT's own overlap+buffer re-check lost the slot; also any slot that breaks the rules (notice, hours, weekend, holiday, caps). `slots` duplicates `next` for `landing/template/page.js`. |
| 409 | `{ error_code: 'opted_out' }` · `{ error_code: 'already_booked', booking: { start, method } }` | Lead STOPped; lead already has a different live booking (moves go through W10). |
| 422 | `{ error_code: 'method_not_supported', methods: [...] }` | Method not in the broker's `methods_supported`. |
| 422 | `{ error_code: 'email_required' }` · `{ error_code: 'email_syntax' \| 'email_typo' \| 'email_disposable' \| 'email_no_mx', suggestion? }` | Teams/Zoom/Meet without a usable email. `email_typo` carries the suggestion; re-post with `email_confirmed: true` to keep the typed address (it still needs MX). |

### `GET /c/{booking_id}` - the booking's .ics (W05, I-45j)
The `ics_url` in the 201 body, in `appointments.ics_url` and in invites / confirmations is `https://sortmycover.co.za/c/{booking_id}?k={sig}`. `sig` = base64url HMAC-SHA256(`LEAD_TOKEN_SECRET`, `ics1|{booking_id}`), domain-separated from `lt1` tokens, no expiry (a calendar link must keep working); `LEAD_TOKEN_SECRET_PREVIOUS` still verifies during rotation. A link cannot carry a header, so the signature rides in `k`; the same route also accepts `X-Lead-Token` when the owning lead calls it (`appointments.client_id` must equal the token's lead, else 404). Traefik routes `/c/*` on the public host to the W05 webhook `c/:booking_id`. Response `200 text/calendar` (`Cache-Control: no-store`): `METHOD:PUBLISH`, `UID:{booking_id}@sortmycover.co.za` (the same UID as the howzit@ invite's .ics so a calendar updates one event), `DTSTART`/`DTEND`/`DTSTAMP` in UTC, `SUMMARY` "Life cover call with {adviser first name}", `DESCRIPTION` the join link (Teams/Zoom/Meet) or "{adviser} will call / WhatsApp-call you". No lead name, number or email, no broker address. `cancelled` and `rescheduled` bookings return `STATUS:CANCELLED`, `SEQUENCE:1`, summary prefixed "Cancelled:". Missing / bad signature / other lead's booking / unknown id / malformed id: one identical `404 not found`. Zoom and Google Meet meeting creation is not built (needs_human).

After a 201 (fan-out, not part of the response): appointment row (`appointments_smc_no_overlap` is the last line of defence), Graph event (`transactionId` from the idempotency key; failure keeps the booking and raises W22 `calendar_event_create_failed`), invite from howzit@ with `.ics` (invite methods only), `broker_new_booking` (first name only), W06 `{ op: 'booking' }` (first booking) or `booking_confirmed` (rebooking), W09 `schedule` / `rebuild`, W07 contact confirm (call methods), CAPI `Schedule` once (ids only, never email). Sub-call inputs and the chat / Flow lanes are in "Sub-workflow interfaces" above.


## `POST <api_base>/beacon`: first-party visit beacon (I-32b, 2026-10-03)

| | |
|---|---|
| Sender | `landing/template/page.js` `beacon()`, `navigator.sendBeacon`, `text/plain` JSON body (no CORS preflight), no cookie |
| Body | `{ v: 1, sid: <anonymous random id, sessionStorage only>, a: <angle slug>, e: 'view' \| 'step', s?: 1..8 }`. `view` once per page load; `step` once per step reached (1 = first quiz tap, 2..8 as `show(n)`). The out-of-band exit (9) is not sent. |
| Receiver | `automation/SUB-visit-beacon.json` (`smc-visit-beacon`, generated by `build-sub-workflows.mjs`, logic in `lib/sub-visit-beacon.mjs`). Always answers `204`. |
| Drops (never counted) | `DNT: 1` or `Sec-GPC: 1` header; client-side the page also stays silent on DNT, Global Privacy Control, `smc_ads_off`, `SMC_CONSENT_ANALYTICS === false` or an empty `api_base`; bad shape, unknown slug (`BEACON_ANGLE_SLUGS` if set), disallowed Origin (`PUBLIC_ALLOWED_ORIGINS`) |
| Rate limit | 20 events per session id per minute, 1,200 per minute in total, in n8n static data (in memory, pruned each window). No IP is used for it. |
| Writes | One daily counter row per (SAST day, `BRAND_ID`, `/<slug>/`) in `ops.page_day`: `visits += 1` on `view`; `quiz_starts += 1` on step 1; `quiz_steps.sN.views += 1` on `step` N (`abandons` is left as it is: derive drop-off as `views[sN] - views[sN+1]`); `source = 'first_party_beacon'` only when the row is new. `ops_feeders.mjs` (Lighthouse) keeps `visits` / `quiz_*` on conflict, so the two feeders do not clobber each other. |
| Never stored | IP, user agent, referrer, session id, raw event. The session id only keys the rate window. No Pixel, no CAPI, no send, no `lead` link. |
| Env | `BRAND_ID` (uuid, as W01), optional `BEACON_ANGLE_SLUGS`, `PUBLIC_ALLOWED_ORIGINS`. Traefik: route `/webhook/smc/beacon` publicly like `/lead`. |
| Counting limits | A visit is counted once per page load per tab; reloads and a second tab count again. No cross-day or cross-device identity (by design). Bots that run JS are counted; the rate limit only bounds floods. |

## WhatsApp provider switch: `WHATSAPP_PROVIDER = meta | twilio` (2026-10-04)

Default `meta`. One env flag; no workflow edits to switch. Logic: `automation/lib/wa-provider.mjs` (loader name `waProvider`), `lib/sub-whatsapp-send.mjs`, generator `build-sub-workflows.mjs`, W07 ingress node.

**Outbound (SUB-whatsapp-send).** Normalise, suppression, allow-list, 24-h window, `DRY_RUN_SENDS`, the `communications` claim row and `correlation` idempotency are unchanged and run before the transport. Under `twilio`, `Provider is twilio?` routes to `Build Twilio request` then `Twilio POST /Messages` (`api.twilio.com`, Basic auth from `TWILIO_API_KEY_SID/SECRET` built in the Code node, so no new n8n credential). `StatusCallback` = `WEBHOOK_URL/webhook/whatsapp-twilio`. `communications.external_id` = the Twilio `MessageSid`.

| Existing shape | Twilio mapping |
|---|---|
| text | `Body` |
| media (public `link`) | `MediaUrl` (+ `Body` = caption). A Meta media `id` has no Twilio equivalent: skip `twilio_media_needs_public_link` |
| template + variables | `ContentSid` = `TWILIO_CONTENT_SIDS[template name]`, `ContentVariables` = `{"1":..}`. No SID: skip `twilio_content_sid_missing` (`email_fallback`, as for an unapproved Meta template). Meta template approval status is not consulted under Twilio |
| interactive buttons / list | **Needs a Twilio Content template** (`twilio/quick-reply`, `twilio/list-picker`) registered under `TWILIO_CONTENT_SIDS[<content_key>]`, with `interactive.content_key` set by the caller. Without one the message is sent as plain `Body` with the option titles ("Reply with: A / B"), and the reply arrives as free text for W07's agent |

ASSUMPTION (verify on a live account): Twilio Content variables are one numbered namespace; we number body variables first, then header, then button variables, so the Content template must be authored in that order. Quick-reply payloads are fixed in the Content template, not set at send time as on Meta; authors must reuse the same payload ids (`confirm:<id>` etc.) the W07 router expects. Twilio's own template approval and its pricing apply instead of Meta's.

**Inbound (W07).** Second webhook `POST /whatsapp-twilio` in W07 (`Verify Twilio signature + normalise`): `X-Twilio-Signature` HMAC-SHA1 over `WEBHOOK_URL/webhook/whatsapp-twilio` + sorted params, timing-safe (`verifyTwilioSignature`, `TWILIO_AUTH_TOKEN`), 401 when invalid or when `WHATSAPP_PROVIDER` is not `twilio`. It emits the same items as the Meta node, so claim, context, routing and status handling are shared. `From` -> `from`; `Body` -> `text`; `ButtonPayload`/`ButtonText` -> `payload`/`text`; `ListId`/`ListTitle` -> `list_id`/`text`; `NumMedia`/`MediaUrl0` -> `media` + `media_id = twilio:<url>` (fetch with `twilioMediaRequest`, Basic auth; W23/W12 media download nodes still call Graph and are Meta-only until switched); `MessageSid` -> `wamid`; `To` digits -> `phone_number_id` (so under Twilio set `brands.phone_number_id` to the sender's number digits). Status callbacks: `queued/sent` -> sent, `delivered`, `read`, `undelivered/failed` -> failed, into the existing receipt query. Twilio sends no timestamp, so `at_ms` is receipt time. ASSUMPTION: CTWA referral arrives as `Referral*` params (`ReferralSourceId`, `ReferralCtwaClid`, ...); verify.

**Flows (W28) are Meta-only. ASSUMPTION, not a fact:** Twilio's WhatsApp API is not known to support Flow messages / `nfm_reply` / the `data_exchange` endpoint. Under `twilio`, `brands.booking_ui` must stay `list` (the 10-slot list is already the launch path; W28 auto-reverts when its ping fails). Verify with Twilio before relying on it.

**Not yet switched (gap, needs owner decision):** 12 workflows (W05, W06, W07 session/ops sends, W08-W13, W15, W29, W35) still POST to Graph directly; only SUB-whatsapp-send callers and the W07 ingress are provider-aware. Move those sends behind SUB-whatsapp-send before choosing Twilio for production.
