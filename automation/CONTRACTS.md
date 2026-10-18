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
| `W13 No-show & replacement` — `claim` / `withdraw` | `{ op: 'claim'\|'withdraw', outcome_id, reason: 'uncontactable', reason_code }` | — | W29, W12 | W13 owns `replacements` (goodwill, max 3 requests per broker per Calendar Week, no-shows and unreachable leads only; 48-h dispute window; crm-nurture 2026-10-11: no cycles, no per-plan cap). `withdraw` only before the window closes. Only W13 and the broker's portal RPC `smc_request_replacement` write `replacements`. |
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
| `W01` `POST /lead` | landing body (landing/README.md) | `200 { ok, status: accepted\|held\|not_qualified, lead_id, lead_token?, methods_supported? }`, 422/429/400/403 | page | Since 11 Oct 2026 the body also carries `product_interest`: `life_cover` (cover adviser call) or `wills` (will and estate call with the will provider); campaign pages set it from the angle theme (B = `wills`), /book/ from its first question or `?for=`. `normaliseSubmission` does not read it yet (unknown fields are ignored), so routing a /book/ wills lead to the will provider needs W01 to store it (e.g. on `leads`) and W06 to route on it. A 90-day duplicate answers `accepted` with a fresh token for the EXISTING lead (the page never learns). Suppression and dedupe use `smc_hash_contact` (digits only). Email is kept only for teams/zoom/meet. CAPI `Lead` gets ids only, never email. No lead-facing send, so `last_contact_at` is not touched. |
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
| `W12 …` — sweep (internal) | every 5 min | — | `broker_outcome_check` at end + 15 min (`w12:outcome_check:{bk}`), one nudge at + 3 h 15 (`w12:broker_nudge:{bk}`), `reach_check` at end + 30 (`w12:reach_check:{bk}`). Resolution writes ONE `outcomes` row (`ON CONFLICT (booking_id) DO NOTHING`, shared with the W11 backstop) + `appointments.status` + `leads.stage` + `outcome_recorded` timeline; unmarked at 24 h → attended, `auto_marked`, `unconfirmed`, escalation (two for one broker within 30 days → Jonathan). Calls on a new row: W29 `{ event: 'outcome_recorded', outcome_id }` (always), CAPI Send `Attended`, W13 `no_show`, W10 `{ source: 'W12', outcome: 'rescheduled', reason: 'broker_no_show'\|'broker_rescheduled', schedule_d, booking, lead }`. |
| `W13 No-show & replacement` — `no_show` | `{ op: 'no_show', outcome_id, booking_id, lead_id, confirmed_at, idempotency_key: 'w12:no_show:{booking_id}' }` | W12 | Starts the 48-h clock (`no_show_clock`, key `w13:no_show:{booking_id}`), sends `missed_you` once with 3 times from W04 (waits). No rebook (`appointments.previous_booking_id` or W10 `rebooked_after_no_show`) and no inbound reply in 48 h → claim `no_show`. A second no-show for the lead → claim at once. Decided once per booking (`w13:no_show_decided:{booking_id}`). |
| `W13 …` — `claim` | W10 C1A shape (`outcome_id: null` accepted), W29 `{ op, outcome_id, reason, reason_code }`, system `{ op: 'claim', kind: 'uncontactable', lead_id }` | W10, W29, W12 (via `no_show`) | **One weekly counter** (crm-nurture). `pg_advisory_xact_lock(hashtextextended('w13:week:' \|\| broker_id \|\| ':' \|\| <SAST week start of the missed appointment, rendered in UTC>, 0))` (the same key as the portal RPC), then count EVERY `replacements` row of the broker in that Calendar Week. Three or more → nothing written, a `refused / weekly_max` row comes back, urgent escalation to Jonathan. Only no-shows and unreachable leads open a request (`nofit_criteria` and C1A `no_call` do not). The row records the CRM `lead_order_id` the missed lead was delivered on. One replacement per lead whoever asks first (a `withdrawn` row frees the lead). Two statements in one transaction (n8n Postgres query batching `single`); proof: `tests/W13-claim-tx.local.test.mjs`. |
| `W13 …` — `withdraw` / `dispute` / `decide` | `{ op: 'withdraw', outcome_id\|lead_id }` · `{ op: 'dispute', replacement_id }` · `{ op: 'decide', replacement_id, upheld: bool }` | W29, console | Withdraw/dispute only while `status = 'due'` and inside the 48-h window. Decide: upheld → `rejected` (`dispute_upheld`), else `approved`. |
| `W13 …` — capacity | `lead_activities` `replacement_approved` (key `w13:approved:{replacement_id}`, payload `lead_order_id`) | console, portal | An APPROVED replacement adds one lead of capacity to its CRM lead order (`public.smc_order_capacity`: capacity = `lead_count` + approved replacements), so routing sends the broker one more lead. W13 never writes `lead_orders` / `lead_order_items` (the routing triggers attach leads). |

Resolved (I-45k, 2026-10-03): W29's `W13 claim item (op, outcome_id, reason, reason_code, idempotency_key)` Code node (`lib/w29.mjs w13Call`) sits before `-> W13 claim / withdraw replacement`; key `w29:{op}:{outcome_id}:{reason_code}`.

W12 conflicts (I-50f, 2026-10-03): a broker mark that arrives after the Schedule D apology went out (`outcome = broker_no_show`, `w12:apology:{booking_id}` claimed) writes one `escalations` row (kind `outcome_unmarked`, `esc_kind=late_broker_mark`, to KG) and nothing else. On a broker Attended vs lead "No" conflict the CAPI `Attended` event is **held** (not emitted; `capi_held` on the resolution, noted in the console escalation) until KG decides; the release is built (I-51b, next section). W07 routes a live broker's audio to W29 (transcribe); W12's `voice_note` op (reference only, P17/Q22) is unused until the practitioner/privacy-notice decision picks one owner.

### CAPI `Attended` hold / release (I-51b, attribution-analyst)

`Attended` cannot be recalled, so `lib/w12.mjs capiAttendedGate()` is the single decider. **Send** on `lead_confirmed` (reach yes), `lead_window_closed` (slot end + 30 min + 2 h, nobody objected) or `kg_attended`; **hold** on `awaiting_lead` and `conflict_pending_kg` (broker Attended vs lead "No"); **drop with a logged reason** on `unreachable_disposition`, `kg_not_attended`, `no_ads_consent`, `outcome_not_attended`, `meta_window_expired`. Same `event_id` (`evt_{lead_id}_attended`) on every path, so Meta dedupes a retry; `event_time` = slot end.
- State (no DDL, `lead_activities` only): `w12:capi_hold:{bk}` (`capi_attended_held`: event_id, reason) parks it; `w12:capi_release:{bk}` (`capi_attended_release`: decision send|drop + reason) claims it once; CAPI Send runs only on a claimed `send`. A drop is the same row with the reason.
- Release: the 5-min tick re-reads reach, `outcomes.disposition_code` and the KG decision for every held booking (so an `unreachable` disposition that arrives after the Attended tap still drops it; a lead "No" that arrives after the outcome row opens the console escalation).
- KG decision entry: W12 `{ op: 'kg_decision', booking_id, decision: 'attended'|'not_attended', decided_by? }` (console -> W12). Writes `w12:kg_decision:{bk}` (first decision wins), resolves the open `esc_kind=outcome_disputed` escalation, releases or drops at once. Resolving the escalation without this op releases nothing: the hold ends in a `meta_window_expired` drop (safe default).
- ASSUMPTION (Meta behaviour, not tested against the live API): Meta rejects `event_time` older than 7 days for `system_generated` events, so a hold is dropped at slot end + 6.5 days (`CAPI_HOLD_MAX`). To be measured in staging with `CAPI_TEST_EVENT_CODE`. Sends stay behind `DRY_RUN_SENDS` inside CAPI Send.
- Resolved (NH-62, Jonathan 2026-10-03): KG `not_attended` on a broker-attended / lead-no conflict turns the `outcomes` row into `no_show` (`dispute_status=upheld`, `marked_via=console`; appointment and lead stage `no_show`), writes the audit activity `w12:kg_not_attended:{bk}` (`outcome_kg_not_attended`), drops the held Attended (`kg_not_attended`) and calls W13 `no_show` (`w12:no_show:{bk}` payload, the same op a lead no-show uses: missed_you once, 48-h clock, second no-show at once). `replacement_eligible` is the generated column, so no DDL. The claim is subject to the W13 weekly maximum (3 requests per broker per Calendar Week); over it nothing is written and Jonathan is alerted. The delivered/verified count is unchanged (W12 never writes it). KG `attended` keeps the outcome `attended`. The update is guarded by the first recorded decision, so a later contradicting call changes nothing. W29 `outcome_recorded` is not re-sent for the flip (quality rolls up from the original row).
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
`slot` is accepted for `slot_start`; `google_meet` for `meet`. Idempotency key = `idempotency_key`, else `page:{lead_id}:{request_id}`, else `book:{lead_id}:{slot_start}`. Since 2026-10-11 (verify gate) the email is kept for every method when the lead's email is not verified (the verification), and for Teams/Zoom/Meet always (the invite).

| Status | Body | When |
|---|---|---|
| 201 | `{ booked: false, held: true, verify: 'email', booking_id, start, end, method, verify_by }` | **Verify gate (2026-10-11):** the lead's email is not verified (or this booking carries a different email). The slot is HELD (`appointments.status = 'pending_verification'`); nothing reaches the broker. The page shows "check your email". |
| 201 | `{ booked: true, booking_id, start, end, method, join_url, ics_url }` | Booked; also the replay of the same idempotency key, and a repeat for the lead's live booking at the same time (no second event, no second CAPI `Schedule`). `join_url` is set for Teams when Graph returns it; `ics_url` = `https://sortmycover.co.za/c/{booking_id}`. |
| 200 | `{ booked: false, fallback: 'whatsapp' }` | Lead not routed (no broker). |
| 400 | `{ error_code: 'bad_slot' \| 'lead_required' }` · `{ error: 'ambiguous_caller' }` | Slot not ISO; broker path without `lead_id`; both credentials. |
| 401 / 403 / 503 | `{ error: 'try_again' }` · `{ error: 'not_a_broker' \| 'not_your_lead' }` | As for `/slots` (lead-token mismatch with the body `lead_id` is 401). |
| 404 | `{ error_code: 'unknown_lead' }` | Broker path, lead id not found. |
| 409 | `{ error_code: 'slot_taken', next: [{start,end}]×≤3, slots: (same) }` | The `is_free` re-check (Outlook + our appointments + buffer, fail closed on calendar error) or the INSERT's own overlap+buffer re-check lost the slot; also any slot that breaks the rules (notice, hours, weekend, holiday, caps). `slots` duplicates `next` for `landing/template/page.js`. |
| 409 | `{ error_code: 'opted_out' }` · `{ error_code: 'already_booked', booking: { start, method } }` | Lead STOPped; lead already has a different live booking (moves go through W10). |
| 422 | `{ error_code: 'method_not_supported', methods: [...] }` | Method not in the broker's `methods_supported`. |
| 409 | `{ error_code: 'held_awaiting_email', booking: { start, method, verify_by } }` · `{ error_code: 'too_soon_to_verify', next, slots }` | The lead already has a held slot (verify the email first, or let it lapse); the slot leaves under 15 minutes to verify before its deadline (start - 2 h): next times offered. |
| 422 | `{ error_code: 'email_required' }` · `{ error_code: 'email_syntax' \| 'email_typo' \| 'email_disposable' \| 'email_no_mx', suggestion? }` | Teams/Zoom/Meet without a usable email. `email_typo` carries the suggestion; re-post with `email_confirmed: true` to keep the typed address (it still needs MX). |

### `GET /c/{booking_id}` - the booking's .ics (W05, I-45j)
The `ics_url` in the 201 body, in `appointments.ics_url` and in invites / confirmations is `https://sortmycover.co.za/c/{booking_id}?k={sig}`. `sig` = base64url HMAC-SHA256(`LEAD_TOKEN_SECRET`, `ics1|{booking_id}`), domain-separated from `lt1` tokens, no expiry (a calendar link must keep working); `LEAD_TOKEN_SECRET_PREVIOUS` still verifies during rotation. A link cannot carry a header, so the signature rides in `k`; the same route also accepts `X-Lead-Token` when the owning lead calls it (`appointments.client_id` must equal the token's lead, else 404). Traefik routes `/c/*` on the public host to the W05 webhook `c/:booking_id`. Response `200 text/calendar` (`Cache-Control: no-store`): `METHOD:PUBLISH`, `UID:{booking_id}@sortmycover.co.za` (the same UID as the howzit@ invite's .ics so a calendar updates one event), `DTSTART`/`DTEND`/`DTSTAMP` in UTC, `SUMMARY` "Your call with {adviser first name}" ("Cancelled: Your call with {adviser first name}" once cancelled), `DESCRIPTION` the join link (Teams/Zoom/Meet) or "{adviser} will call / WhatsApp-call you". No lead name, number or email, no broker address. `cancelled` and `rescheduled` bookings return `STATUS:CANCELLED`, `SEQUENCE:1`, summary prefixed "Cancelled:". Missing / bad signature / other lead's booking / unknown id / malformed id: one identical `404 not found`. Zoom and Google Meet meeting creation is not built (needs_human).

After a 201 (fan-out, not part of the response): appointment row (`appointments_smc_no_overlap` is the last line of defence), Graph event (`transactionId` from the idempotency key; failure keeps the booking and raises W22 `calendar_event_create_failed`), client email (SortMyCover leads: `smc-client-email` below, every booked call with a usable email; any other brand: invite from howzit@ with `.ics`, invite methods only), `broker_new_booking` (first name only), W06 `{ op: 'booking' }` (first booking) or `booking_confirmed` (rebooking), W09 `schedule` / `rebuild`, W07 contact confirm (call methods), CAPI `Schedule` once (ids only, never email). Sub-call inputs and the chat / Flow lanes are in "Sub-workflow interfaces" above.


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

## WhatsApp provider switch: `WHATSAPP_PROVIDER = meta | twilio` (2026-10-04, completed 2026-10-11)

**Decision (Jonathan, 2026-10-11): production runs on `twilio`**, on the CRM's existing Twilio account (a new SortMyCover +27 sender on the already Meta-registered WABA). What Jonathan must do is in `automation/SETUP-TWILIO.md`. Default stays `meta` until then. One env flag; no workflow edits to switch. Logic: `automation/lib/wa-provider.mjs` (loader name `waProvider`), `lib/sub-whatsapp-send.mjs`, `lib/wa-route.cjs`, generator `build-sub-workflows.mjs`, W07 ingress node.

### One transport (2026-10-11): every send goes through SUB-whatsapp-send
`lib/wa-route.cjs routeWaSends()` replaced every direct Graph `/messages` POST (and W23's n8n WhatsApp nodes) in W03, W05, W06, W07, W08, W09, W10, W11, W12, W13, W15, W23, W28 with `Code "SUB input (<node>)"` -> `Execute Workflow "<node>"` (`smc-whatsapp-send`, **waits**). The send node keeps its name and connections. The sub receives `{ kind: 'prebuilt', wa: <the Cloud API body the workflow built>, record, caller, phone_number_id?, bypass_suppression?, correlation }` and returns `{ ok, external_id, error, messages: [{ id }], body: { messages: [{ id }] } }`, so every downstream `$json.messages[0].id` / `$json.body.messages[0].id` now reads the Twilio MessageSid (or the Meta wamid). Generators apply it after `gateSenders()`; workflows without a generator are routed by `node automation/route-wa-sends.mjs` (idempotent, `--check`). Rules for prebuilt sends:
- `record:false` (W03, W06, W07, W08 nudge, W09, W12, W13, W15): the workflow writes its own `communications` row from the returned id, as before. `record:true` (W05, W08 close line, W10, W11, W23, W28, smc-email-verify replies): the sub writes the row; the lead (else the broker) is resolved from the recipient digits when the caller passes no id.
- Suppression, `WHATSAPP_TEST_RECIPIENTS` and `DRY_RUN_SENDS` apply in the sub as well; W15's one STOP confirmation alone sets `bypass_suppression` (the number is suppressed a moment earlier). The 24-h window and the template choice stay the caller's.
- Still on Graph (outside the nurture flow, CRM-NURTURE-SCHEMA.md D5): W14, W20, W22, W29, W32, W35.

**Outbound (SUB-whatsapp-send).** Normalise, suppression, allow-list, 24-h window, `DRY_RUN_SENDS`, the `communications` claim row and `correlation` idempotency are unchanged and run before the transport. Under `twilio`, `Provider is twilio?` routes to `Build Twilio request` then `Twilio POST /Messages` (`api.twilio.com`, Basic auth from `TWILIO_API_KEY_SID/SECRET` built in the Code node, so no new n8n credential). `StatusCallback` = `WEBHOOK_URL/webhook/whatsapp-twilio`. `communications.external_id` = the Twilio `MessageSid`.

| Existing shape | Twilio mapping |
|---|---|
| text | `Body` |
| media (public `link`) | `MediaUrl` (+ `Body` = caption). A Meta media `id` has no Twilio equivalent: skip `twilio_media_needs_public_link` |
| template + variables | `ContentSid` = `TWILIO_CONTENT_SIDS[template name]`, `ContentVariables` = `{"1":..}` numbered by `twilioVarPlan(spec)` (below). No SID: skip `twilio_content_sid_missing` (`email_fallback`, as for an unapproved Meta template). Meta template approval status is not consulted under Twilio |
| header image / video | the link must sit under `TWILIO_MEDIA_BASE_URL` (Twilio Content media needs a static domain): the variable is the path after it; elsewhere: skip `twilio_media_outside_base` |
| FLOW button (`broker_intro_slots_v2`, `reschedule_offer_v2`) | the button's `flow_token` is the last variable of the `whatsapp/flows` Content |
| interactive buttons (1-3) / list (1-10 rows) | the generic session Content `smc_session_buttons_N` (`twilio/quick-reply`: body `{{1}}`, then title/id pairs) / `smc_session_list_N` (`twilio/list-picker`: body `{{1}}`, button `{{2}}`, then id/item/description, description = title when empty). An explicit `interactive.content_key` still wins. Without a SID: plain `Body` + "Reply with: A / B" (the reply arrives as free text for W07's agent) |
| interactive Flow (in-session) | `TWILIO_CONTENT_SIDS['flow:<flow_id>']` (`whatsapp/flows`, body `{{1}}`, flow_token `{{2}}`). Without one: skip `twilio_flow_content_missing` (a Flow never degrades to text) |

**Variable plan (verified against Twilio's Content docs, 2026-10-11).** A Content resource has ONE numbered namespace. `lib/wa-provider.mjs twilioVarPlan(spec)` numbers a Meta template as body `{{1}}..{{B}}`, then the header (text variables, or one media path), then every dynamic button in index order (quick-reply id, URL suffix, Flow token). The Content definitions in `automation/templates/twilio/content/*.json` are GENERATED from the same function (`templates/twilio/build-content.mjs`; `--check` runs in `tests/twilio-flow.test.mjs`), so sender and template cannot drift. A quick reply the caller leaves empty gets the slug of its button text (what Meta would send). Quick-reply ids are template variables, so the W07 router's payloads (`confirm:<id>`, `reschedule:<id>`, ...) are unchanged. UNCONFIRMED on a live sender (SETUP-TWILIO.md step 8): variable quick-reply ids on an approved card, and a URL button next to quick replies on one card.

**Inbound (W07).** Webhook `POST /whatsapp-twilio` now feeds the SAME node as the Meta webhook, `Verify signature + normalise` (2026-10-11 fix: the old separate Twilio node left every downstream `$('Verify signature + normalise')` reference empty, so no Twilio message could be routed). The node takes the Twilio branch for that webhook (or an `x-twilio-signature` header): `X-Twilio-Signature` = base64 HMAC-SHA1 over `WEBHOOK_URL/webhook/whatsapp-twilio` + sorted params, keyed with the primary **Auth Token** (`TWILIO_AUTH_TOKEN`; an API key secret cannot sign), timing-safe (`verifyTwilioSignature`); invalid or `WHATSAPP_PROVIDER` not `twilio` -> `valid:false`. Twilio items carry `provider: 'twilio'`, and `Respond 200 / 401` answers them with empty TwiML (`<Response/>`, `text/xml`) instead of `ok`. Mapping: `From` -> `from`; `Body` -> `text`; `ButtonPayload`/`ButtonText` -> `payload`/`text` (a `best_*` row id arriving as `ButtonPayload` -> `list_id`); `ListId`/`ListTitle` -> `list_id`/`text` (UNCONFIRMED param, kept when present); `NumMedia`/`MediaUrl0` -> `media` + `media_id = twilio:<url>`; **a completed Flow** arrives as `InteractiveData` `{"flowResponse":{...}}` / `FlowData` (never `Body`) -> `payload: 'flow_complete'`, `flow_response` = the JSON string (the same `nfm_reply.response_json` W05 parses) -> W05; `Referral*` (`ReferralCtwaClid`, `ReferralSourceId/Url/Type`, `ReferralHeadline`, `ReferralBody`) -> `referral` (Click-to-WhatsApp, W03); `MessageSid` -> `wamid`; `To` digits -> `phone_number_id` (set `brands.phone_number_id` to the sender digits). Status callbacks: `queued/accepted/scheduled/sending/sent` -> sent, `delivered`, `read` (also `EventType=READ`), `undelivered/failed/canceled` -> failed, into the existing receipt query (`communications.external_id` = MessageSid). Twilio sends no timestamp, so `at_ms` is receipt time.

**Media (W23).** A broker video from Twilio (`media_id = twilio:https://api.twilio.com/...`) is downloaded by `Download media (Twilio MediaUrl, Basic auth)` (API key, else AccountSid:AuthToken; redirects followed); a Meta media id still uses Graph. W12's voice note reference is unchanged (no download).

**Flows (W28).** Twilio supports Flows built in Meta (`whatsapp/flows` Content: `flow_id`, variable `flow_token`, `flow_first_page_id`, `is_flow_first_page_endpoint`), including the `data_exchange` endpoint: Meta still calls W28 directly, so W28 and `flows/flow-crypto.js` are unchanged (crypto re-verified against Meta's endpoint guide on 2026-10-11; the encrypted response now also sets `Content-Type: text/plain`). Creating, publishing and the per-number public key stay Meta-only (SETUP-TWILIO.md step 3). `brands.booking_ui = 'flow'` once the Flow Content is approved.

## When a lead counts toward the broker's order (2026-10-11, agreement LGSA v0.3 clause 5.1(e) / 5.2, Schedule 2 criterion 6 / S2.4)
A lead is Delivered, and counts toward the broker's CRM lead order, when **the broker has marked the meeting attended** (agreement 5.2 / clause 14.3(c), see the column contract below) **and its email is verified** (`leads.email_verified`; see "Verify gate"), whichever comes second, exactly once. Never at hand-over, and **never on the client's Confirm tap**: `appointments.confirmed_at` (W09's Confirm tap or a confirming reply) is a reminder signal only (Jonathan, 2026-10-11). Enforced in the database (`supabase/migrations/20261011030000_smc_03_orders_outcomes.sql`), so every path behaves the same:
| `leads.order_state` | When | Order effect |
|---|---|---|
| (held) | routed to a broker without room, or a broker that is not ready (no FSP number / practice / adviser / intro card) | `broker_id` cleared, `routing_reason` `held_no_open_order` / `held_broker_not_ready`, nothing sent |
| `attached` | routed (`smc_leads_route_check`) | one place RESERVED on his oldest open order (`leads.lead_order_id`); no `lead_order_items` row, so the CRM pipeline and contact details stay closed |
| `counted` | the broker marked the meeting attended AND the email is verified, whichever comes second (`smc_count_lead` via `smc_outcome_count_or_release` on outcomes and `smc_count_on_email_verified` on leads) | one `lead_order_items` row (stage `New`), `leads.delivered = true`, timeline `order_counted` (payload: outcome id, `attended_marked_via`, `email_verified_at`); exactly once |
| `released` | STOP / disqualified / closed unbooked (`smc_leads_release_reservation`), re-routed, or the meeting's outcome is not attended (`no_show`, `unreachable`, `rescheduled`, `broker_no_show`, or KG turning a disputed attended into `no_show`: `smc_outcome_count_or_release`, reason `meeting_<outcome>`) | the place goes back; a later confirmed booking re-attaches if there is room (else `count_held_no_room`) |
`smc_order_capacity`: `counted`, `reserved`, `attached` (= in use), `remaining`, `open`, `counted_toward_order` (= counted - approved replacements). Workflows read it only to pick the broker. A B-tier lead is only booked after the broker's Accept, so it counts "because the Client accepted it". Replacements (W13, portal RPC) need a counted lead (`not_on_a_lead_order` / `not_delivered_on_a_lead_order` otherwise): a lead that never confirmed was never Delivered. **Routing needs a ready broker:** `brokers_smc_routing_ready` (CHECK) refuses `routing_on = true` without an FSP number, practice name, adviser name and an https intro card, and the routing trigger holds any lead routed to a broker that is not ready, so no lead is ever introduced to a broker without his FSP number.

## Email verification `smc-email-verify` (2026-10-11, agreement 5.8(b))
| Caller | Input | Effect |
|---|---|---|
| W05, after an invite booking stored an email (`Email verification item`) and after every HELD booking (`Email verification item (hold)`) | `{ op: 'issue', lead_id }` | `ctwa/capture-v2.js issueEmailVerification`: one email from `hello@sortmycover.co.za` via **Resend** (`RESEND_API_KEY`, `Idempotency-Key: ev:<lead>:<sent_at>`) with a 6-digit code and the one-tap link `https://sortmycover.co.za/v/<ev1 token>`. Stores only `email_verify_code_hash` (+ sent / expires / attempts); 10-minute gap per lead; `DRY_RUN_SENDS` gate; a `communications` row (channel email, content `[email verification: code + link]`, external_id = Resend id) and `email_verify_sent` on the timeline |
| W07 route `email_code` (a 6-digit text while a code is outstanding: `email_verify_pending`) | `{ op: 'code', lead_id, code, wamid, to }` | `verifyEmailCode` (5 tries, 24 h): `email_verified` / `_at` / `_via 'code'`, timeline `email_verified` / `email_verify_failed`, one WhatsApp reply through smc-whatsapp-send; an expired code is re-issued. The inbound row stores `[email verification code]`, never the digits |
| `GET /v/:token` (LINK_HOST `/v/*` -> `/webhook/smc-email-verify-link/v/*`) | the link | `verifyEmailToken` (bound to the current email): verified via `link`; every failure is one identical page |

## Client booking email `smc-client-email` (Supabase edge function, 2026-10-17)
SortMyCover leads (`brands.code = 'SMC'`, read by the W05 loads as `lead.brand_code`) get their booking email from SortMyCover, never from howzit@. W05 node `Email client from SortMyCover (smc-client-email)` (behind `DRY_RUN_SENDS`, `onError: continueRegularOutput`) POSTs to `{SUPABASE_FUNCTIONS_URL or https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1}/smc-client-email` with header `x-api-key: $env.LINDI_RELAY_TOKEN` (the function checks SHA-256 against `public.relay_tokens` name `n8n-internal`, as `smc-admin-media-upload` / `ms-oauth`).

| Caller | Body | Effect |
|---|---|---|
| W05 fan-out after a booking (`Effect?` `smc_email`) | `{ kind: 'booking_confirmed', to, lead_first_name, slot_start, slot_end, method, adviser_name, practice_name, fsp_number, join_url?, booking_id, calendar_invite: 'adviser'\|'attached', idempotency_key: 'w05:client_email:booking_confirmed:<booking>' }` (`w05.smcClientEmail`) | One email via **Resend** (`RESEND_API_KEY` function secret) from `SortMyCover <hello@sortmycover.co.za>`, Reply-To `hello@sortmycover.co.za`, `Idempotency-Key` = the body's key. `adviser`: Exchange sent the meeting request from the broker's own calendar, the email asks the client to accept it; `attached`: the `.ics` (UID `<booking_id>@sortmycover.co.za`, as `/c/{booking_id}`) is attached. Returns `{ id }` (Resend id); `400 { error:'invalid', fields }`, `401`, `500` (no key), `502 { error, status }` never echo the recipient |
| W05 `update_method` (`Method client email (SortMyCover)`) | same with `kind: 'booking_updated'`, key `...:booking_updated:<booking>:<method>:<minute>` (`w05.methodChangeEmails`) | Same; `adviser` when the new or the old method put the client on the broker's Outlook event |
| (none yet) | `kind: 'booking_cancelled'` | Supported by the function; W10 sends the client no cancel email today (WhatsApp only) |

Not sent (`null`) when the lead has no usable email (none on the plan and not verified, or bounced). A non-2xx answer or a timeout goes to `Client email result (w05.clientEmailResult)` -> W22 own-shape `client_email_failed` (amber, `scope: booking:<id>`); the booking stands. Copy rules (render.ts, tested): no price or "free" language, no AI / assistant / operator-company wording; SortMyCover is not an FSP and introduces the client to the named adviser, practice and FSP number; time in SAST; reschedule by WhatsApp to +27 60 015 6480; footer with the privacy notice link and the POPIA line. Resend bounces do not reach howzit@, so W17's `invite_bounced` NDR path does not see these emails.

## `GET /j/{booking_id}` - the Teams join link (W05, 2026-10-11)
302 to `appointments.join_url` for a live (`booked`/`confirmed`) Teams / Zoom / Meet booking whose link is on a meeting host; anything else is one `404 not found`. LINK_HOST `/j/*` -> `/webhook/w05-join-get/j/*`. The link is in `booking_confirmed` {{5}} (`confirmDetail`: "Microsoft Teams (join link: https://sortmycover.co.za/j/<id>)") and in reminder_2h / reminder_10m (`w09 methodDetail`).

## Tier C: budget under R750 (Jonathan, 2026-10-11)
A lead whose monthly budget is under R750 (`leads.budget_band = 'lt750'`) is **not** disqualified any more. It is stored, counts as a lead in every stat and report (it is a normal `leads` row: stage `new` / `verified` / `qualified`, never `disqualified` on budget), and the qualifying conversation goes on (W03 / NLU `<750` record the band and ask the next question; capture Flow v2 continues to SMOKER / INCOME; the landing quiz shows no exit card). Tier tag: `leads.lead_tier = 'C'` (set by the routing trigger on every path and by capture v2; A / B as before).

**Agreement 5.7 offer, reused (no second mechanism).** Tier C is offered only to a broker with the standing yes `brokers.accepts_low_budget = true` (admin-only switch, file 02 + file 05 guard): the offer is accepted at once (`lead_offers.status = 'accepted'`, `decided_via = 'standing'`), no Accept/Decline ask. A broker without it is never offered or routed a tier-C lead. Tiers A / B are unchanged.

| Path | Behaviour |
|---|---|
| W01 page / lead ad (`decide`), W01 Lead core (`routeExisting`, CTWA after qualifying) | `pickBroker(..., tier 'C')` considers only routable brokers with `accepts_low_budget` (same fairness rule among them). None with room -> `routing_reason = 'held_low_budget'`, `broker_id` NULL, stage unchanged, `/lead` answers `200 { status: 'held' }`, and ONE WhatsApp `lead_low_budget_held` (correlation `w01:low_budget_held:<lead>`). |
| capture Flow v2 (`ctwa/capture-v2.js`) | INCOME with tier C: routed broker has the standing yes -> `makeOffer` accepts at once and the lead books in the Flow like tier A; otherwise the lead is held (same columns, same template) and the END screen says "We're checking for you". `decideOffer` on a tier-C lead only passes to a next broker with the standing yes, else held. |
| Database (`smc_leads_route_check`, file 03) | Enforces the same rule on every write of `broker_id` / `brand_id` / `budget_band`: tier C to a broker without the standing yes -> held `held_low_budget`; no room -> `held_low_budget`; a routed, not yet introduced, not counted lead whose budget moves under R750 -> held (accepted in place when his broker has the standing yes). The AFTER trigger writes the `lead_offers` accept and the timeline row `low_budget_accepted` (`lowbudget:accepted:<lead>:<broker>`). |
| Counting | Unchanged and identical for every tier: a place is RESERVED at routing, the lead COUNTS only at email verified + broker-marked attended (`smc_count_lead`). An accept never sets `delivered`. |

### Admin assignment of a held tier-C lead (portal contract)
The portal does ONE update, as an admin (`smc_is_admin()`), on a lead with `budget_band = 'lt750'`:
```sql
UPDATE public.leads
   SET broker_id = :broker_id, routing_reason = 'manual_low_budget'   -- routed_at optional (the trigger fills it)
 WHERE id = :lead_id AND routing_reason = 'held_low_budget' AND broker_id IS NULL;
```
- `routing_reason = 'manual_low_budget'` is the admin's record that the broker said yes (agreement 5.7); it lets the lead go to a broker whose `accepts_low_budget` is off. The routing trigger reuses the normal reservation (`smc_open_order_for`): `order_state = 'attached'`, `lead_order_id` set, `offer_status = 'accepted'`, a `lead_offers` row `decided_via = 'admin'`, timeline `order_attached` + `low_budget_accepted`. Nothing is counted.
- **Refused with an error (SQLSTATE 23514, the lead stays held)** when the broker is not ready (FSP number, practice, adviser, intro card), has no open paid SortMyCover order with room, or the lead gave NAMED consent for another practice (`consent_text` must contain `"<firm_name> (FSP <fsp_number>)"`; otherwise the lead must consent again first). Show the error text to the admin.
- **Hand-off to the booking flow:** W01 entry 5 (every 15 min) picks `routing_reason = 'manual_low_budget' AND broker_id IS NOT NULL AND first_message_at IS NULL AND order_state = 'attached'`, waits while `conv_state.state` is still a qualifying state, claims `w01:low_budget_handoff:<lead>` once and calls W06 `{ op: 'routed', lead_id }`: the normal first touch (slots card or Flow), W05 booking, email verification and the Teams link follow exactly as for any routed lead.
- **No taker in 7 days:** the same sweep closes a lead still `held_low_budget` 7 days after `created_at`: `stage = 'unbooked_closed'`, `routing_reason = 'low_budget_no_taker'`, `conv_state.state = 'closed_unbooked'`, timeline `low_budget_closed`, one WhatsApp `lead_low_budget_closed` (never 20:00-08:00 SAST). Not out of band: no 24-h deletion; the normal retention clock (`last_contact_at`, I-38d) applies.
- Portal list of held tier-C leads: `WHERE brand_id IS NOT NULL AND budget_band = 'lt750' AND routing_reason = 'held_low_budget' AND broker_id IS NULL AND opted_out_at IS NULL`.

## Verify gate: the broker sees a lead only after its email is verified (Jonathan, 2026-10-11)
Two decisions, all tiers:
1. **Counting:** a lead counts against the broker's order only when BOTH (a) its email is verified (`leads.email_verified`, link or code, `smc-email-verify`) AND (b) the broker marked the meeting attended (`outcomes`, see "The broker's attended mark"). Whichever comes second counts it, once (`smc_count_lead`, called by `smc_outcome_count_or_release` on outcomes and `smc_count_on_email_verified` on leads). Until then the timeline has `count_waits_email_verification`. The client's Confirm tap never counts.
2. **No broker sees an unverified lead.** Between booking and verification the slot is HELD inside our database only.

| Step | What happens |
|---|---|
| Book (W05, any lane) by a lead whose email is not verified (or with a different email) | An email is required for EVERY method (page / Flow ask for it; chat without one -> W28 ask_email). INSERT `appointments` with `status = 'pending_verification'`, `verify_by = min(now + 24 h, start - 2 h)` (under 15 min left -> 409 `too_soon_to_verify`, nothing held). The held slot blocks the time exactly like a booking (same re-check, `appointments_smc_no_overlap` / `_no_double_booking` include it, W04 counts it busy). NO Graph event, Teams link, invite, `broker_new_booking`, W06 intro card, W09 reminders or CAPI Schedule. The lead gets `booking_held_verify_email` (time, adviser first name, deadline) and the verification email (`smc-email-verify issue`). Timeline `booking_held`. |
| Email verified (link `GET /v/:token` or the typed code via W07 `email_code`) | `smc-email-verify` calls W05 `{ op: 'finalize', lead_id }` -> "Load held slot + lead" -> `finalizeRequest` -> the normal pipeline with the held row's idempotency key: fresh `is_free` re-check (excluding the held row), the insert statement PROMOTES the row (`pending_verification` -> `booked`, `verify_by` NULL, same id), then the usual fan-out: Outlook event + Teams link, invite, `broker_new_booking`, W06 `booking` (intro card), W09 schedule, W07 contact confirm, CAPI Schedule (the page's browser event id is kept on the held row). If the broker filled the time meanwhile: the hold is cancelled and the lead gets the next 3 times. A second verification or a late one changes nothing. |
| Not verified by `verify_by` | W05 "Every 5 min: release unverified holds": `status = 'cancelled'`, `cancelled_at`, timeline `booking_hold_released`, ONE WhatsApp `booking_hold_released` (QR "See open times" -> `see_open_times` -> W04 list). Nothing is undone at the broker (he never had it). A STOP releases a held slot silently (W15, no broker notice). |

**Broker visibility, enforced in the database (file 05).** RESTRICTIVE `SELECT` policies for `authenticated` (admins via `smc_is_admin()` and `n8n_app` unaffected, legacy rows untouched):
- `leads`: `brand_id IS NULL OR smc_is_admin() OR email_verified IS TRUE`
- `appointments` (and the `bookings` view, security_invoker): `brand_id IS NULL OR smc_is_admin() OR (status <> 'pending_verification' AND smc_lead_email_verified(client_id))`
- `lead_activities`, `communications`: `brand_id IS NULL OR smc_is_admin() OR lead_id IS NULL OR smc_lead_email_verified(lead_id)`; `outcomes`: `smc_is_admin() OR smc_lead_email_verified(lead_id)`

**The predicate the portal must use** for anything it shows a broker about a SortMyCover lead: `leads.email_verified IS TRUE` (and for bookings additionally `appointments.status <> 'pending_verification'`). The database already filters with it, so a portal query that forgets it still returns nothing more; admin screens see everything (a held slot shows as `pending_verification` with `verify_by`). Note: the column is `leads.email_verified` (boolean, with `email_verified_at` / `email_verified_via`); `leads.email_status` is deliverability (`mx_ok`, `bounced`, ...), not verification.

Known gaps (not built here): W07 does not store an email the lead TYPES in chat (pre-existing: the W28 ask_email answer), so a chat / list booking of an unverified lead without an email on file stays held until it lapses unless the lead uses the page or a Flow; a held slot cannot be moved by W10 (the lead re-books after it lapses or verifies first).

## The broker's attended mark: the column contract (Jonathan, 2026-10-11; agreement clause 14.3(c))
The live CRM schema has no attended field; the one place a meeting's attendance is recorded is the chain's `public.outcomes` (one row per booking, `UNIQUE (booking_id)`). A lead counts when this row exists:

| column | value |
|---|---|
| `outcomes.booking_id` / `lead_id` / `broker_id` / `brand_id` | the booking, its lead, its broker, the SMC brand |
| `outcomes.outcome` | `'attended'` |
| `outcomes.auto_marked` | `false` (the + 24 h backstop writes `true`) |
| `outcomes.unconfirmed` | `false` (the backstop writes `true`) |
| `outcomes.marked_via` | `'portal'` (one-tap Attended / No-show in the broker portal, `src/pages/portal/Leads.tsx`, which also sets `marked_by`, `marked_at` and calls `smc_portal_event('outcome.marked')`), `'whatsapp'` (the broker's tap on `broker_outcome_check`, written by W12) or `'console'` (admin / KG) |

Writers: the portal (broker session, policies "smc broker mark own" / "correct own"), W12 (`n8n_app`), the console. The trigger `smc_outcome_count_or_release` (AFTER INSERT OR UPDATE OF outcome, auto_marked, unconfirmed) counts on such a row when `leads.email_verified` is true; if the email is verified later, `smc_count_on_email_verified` counts it then. No mark given: the existing timing rules stand (W11/W12 write `attended` + `auto_marked` + `unconfirmed` at slot end + 24 h, escalation, KG dispute): that row keeps the place RESERVED and counts nothing until the broker confirms it in the portal (rewrites `unconfirmed = false`, `auto_marked = false`) or KG's decision turns it into `no_show` (place released). Any non-attended outcome releases a reservation that was not counted. Consequence: a no-show is never counted, so its place simply goes back to the order; the replacement RPC / W13 (which need a counted lead) remain for an outcome that changes after counting (a dispute upheld).

## Wills / estate leads (Jonathan, 2026-10-11)
The SortMyCover site's four theme-B angles (`children-guardian`, `will-myth`, `will-and-cover`, `where-is-the-will`; provider Capital Legacy, `config/site.json will_provider` in lv-site) produce **wills leads**: W01 sets `leads.product_interest = 'wills'` from the angle (`lib/w01.mjs WILLS_ANGLES` / `productOf`; every other angle -> `'life_cover'`). A wills lead is routed ONLY to a broker with `brokers.handles_wills = true` (admin-only switch, same pattern as `accepts_low_budget`); none with room -> held, `routing_reason = 'held_no_wills_broker'` (nothing sent). A broker without the switch (a life-cover broker) never receives one: W01 filters, and the routing trigger (`smc_leads_route_check`, also on `UPDATE OF product_interest`) holds any wills lead routed to him, or refuses a re-route with SQLSTATE 23514. Nurture, booking, the verify gate and counting are the same as for every lead.

**Portal switch columns:** `brokers.handles_wills` (wills / estate leads) and `brokers.accepts_low_budget` (tier C, under R750); both boolean NOT NULL DEFAULT false, admin-only (a broker cannot change them: `smc_brokers_guard`). Lead columns to show / filter: `leads.product_interest` (`life_cover` | `wills`), `leads.routing_reason` (`held_no_wills_broker`, `held_low_budget`, `manual_low_budget`, `low_budget_no_taker`).

**Capital Legacy's FSP number, verified:** `43826`, CAPITAL LEGACY SOLUTIONS (PTY) LTD, status Authorized (FSCA FAIS FSP register, `https://www2.fsca.co.za/Fais/Search_FSP.htm`, name search "Capital Legacy", read 2026-10-11). The WhatsApp intro / disclosure templates (`broker_intro_booked`, `broker_intro_slots(_v2)`) take the practice and FSP number as variables from the broker row, so the Capital Legacy broker row must carry `firm_name = 'Capital Legacy Solutions (Pty) Ltd'`, `fsp_number = '43826'`, `handles_wills = true` (admin, at onboarding); `brokers_smc_routing_ready` already refuses routing without the FSP number. Nothing is hard-coded in the templates.

## W38 SMC lead alert (owner) -> EMMA `POST /api/notify` (Jono, 2026-10-18)
Why: during the dry-run ads every SortMyCover lead routes to Jono's own "SortMyCover test practice" (broker `f688380e-fb68-4bfc-a9ee-4bf37ce76dcc`), which has no WhatsApp number on purpose (W07 would treat Jono's own test messages as broker messages), so no broker notice reaches anyone and W22 covers incidents only. W38 (`smc-w38`, `automation/build-w38.mjs`, logic `lib/w38.mjs`, tests `tests/W38.test.mjs`) tells Jono about every new lead and booking.

| Part | Contract |
|---|---|
| Trigger | Schedule, every 1 minute. Runs only when `SMC_LEAD_ALERT_ENABLED` is exactly `true`; otherwise nothing is read and the static data is cleared, so switching it on again starts fresh |
| Read (n8n_app) | `public.leads` and `public.appointments` with `brand_id = '6e532b05-984f-4906-90a0-a5257cde328c'` (SortMyCover, `w38.SMC_BRAND_ID`) and `created_at > watermark - 5 min`, oldest first, at most 200 rows, plus the database's `now()`. Only these fields leave the database: first word of `first_name`, the last 3 digits of `phone`, `origin` / `angle` / `utm_campaign` / `utm_content` / `ref`, `brokers.practice_name`, `duplicate_of IS NOT NULL`, `is_synthetic`; for a booking `appointment_date`, `method`, `status`, `previous_booking_id IS NOT NULL`. Never email, the full number, ID numbers or message text |
| State | Workflow static data `{ watermark, seen: { "<lead\|booking>:<id>": created_ms }, fails, last, last_error }`. First run (no watermark): watermark = the database's `now()`, nothing sent (history is never replayed). `seen` drops ids older than the overlap window and keeps at most 200 |
| Message | One plain-text message per tick, oldest first, at most 25 lines and 3500 characters: `SortMyCover: 1 new lead, 1 new booking` then `- Lead: Thandi, WhatsApp ad (ad-new-bond), phone ends 234, routed to SortMyCover test practice` / `- Booking: Thandi, Wed 21 Oct 14:30 SAST, Teams, phone ends 234, with SortMyCover test practice`. No name -> `name not given yet`; no broker -> `not routed`. No CRM deep link: the repo has no per-lead CRM URL pattern |
| Send | `POST https://emmadoesit.cloud/api/notify`, headers `content-type: application/json`, `x-emma-secret: $env.EMMA_SHARED_SECRET`, body `{ "message", "source": "smc-lead-alert", "title": "SortMyCover lead" }`. EMMA (`requireOwnerAuth`, `deliverToOwner`) answers 200 when a device channel (Teams bot, Telegram, WhatsApp) delivered it, 502 when none did, 401 on a wrong secret. `DRY_RUN_SENDS=true`: the gate's stub runs instead (no POST), the message is logged (`console.log`, `last.message`) and the watermark advances |
| Retry | The new watermark and `seen` are committed only after a 2xx. A non-2xx or no answer keeps both, so the next tick sends the same items again (with any newer ones). The 3rd failed tick in a row fails that run once (`Stop and Error`), so W22 (error workflow) emails ops as an amber `workflow_failed`; the 4th and later stay quiet until a send succeeds |
| Egress | `lib/egress-gate.cjs` counts `emmadoesit.cloud/api/notify` as a sender (`notify`), so `egress-dryrun.test.mjs` fails any workflow that posts there without a `DRY_RUN_SENDS` gate |

## W39 Start page API: `GET /start` + `POST /start/answers` (Jono, 2026-10-18)
The hidden page `https://sortmycover.co.za/start/#lt=<lt1 token>` replaces the WhatsApp qualifying taps (q_age -> q_budget -> q_bond -> q_method) for a lead that came in on WhatsApp. W03 sends the link as ONE session call-to-action (below) when `brands.start_page = 'on'` (migration `20261018120000_smc_brand_start_page.sql`, default `'off'`; the same migration widens `lead_activities_smc_checks` to W01-W39, which W39's timeline rows need: apply it before W39). The page calls `https://n8n.sortmycover.co.za/webhook/smc/<path>` (Caddy rewrites to `/webhook/<path>`), every call with header **`X-Lead-Token`**; the token is read from the fragment, never a query or path (lead_token section above). Logic `automation/lib/w39.mjs`, workflow `smc-w39` (`automation/build-w39.mjs`), tests `automation/tests/W39.test.mjs` + `start-page.local.test.mjs`. CORS: `$env.PUBLIC_ALLOWED_ORIGINS` (as W04). Every response: `Cache-Control: no-store`.

| Call | 200 body | Errors |
|---|---|---|
| `GET /start` | `{ first_name, adviser: { first_name, name, firm, fsp } \| null, methods: ['teams','phone'] (those of the two the broker supports), answers: { intent?, age_band?, has_cover?, budget_band?, want? }, booking: null \| { start, end, method, held } }`. `adviser` comes from the lead's broker row (`adviser_name`, `firm_name` else `practice_name`, `fsp_number`); null while not routed. `booking` = the lead's live appointment: `pending_verification` -> `held: true` (waiting on the email link), `booked` / `confirmed` -> `held: false`. `first_name` is null when unknown. | `401 { error: 'try_again' }`: no / bad / expired token, a broker JWT (the lead path only), unknown / opted-out / erased lead (`leads.phone IS NULL`). `403 { error: 'try_again' }`: Origin not allowed. `503 { error: 'try_again' }`: `LEAD_TOKEN_SECRET` not set. |
| `POST /start/answers` | phase (a), no `confirm_adviser`, cover intent: `{ ok: true, next: 'adviser', adviser: { id, first_name, name, firm, fsp } }` (the broker W01 would choose; `id` = `brokers.id`, never an email, number or calendar field), or `{ ok: true, next: 'chat' }` (held / no broker). Phase (b), `confirm_adviser: <that id>`: `{ ok: true, next: 'slots' }` once routed to him, `{ ok: true, next: 'adviser', adviser: <new> }` when the pick changed (nothing routed), `{ ok: true, next: 'chat' }` when there is none. will / other: `{ ok: true, next: 'chat' }` | as above, then `400 { error: 'invalid' }`: an unknown code, a bad `request_id` (8-64 `[A-Za-z0-9-]`, as W05), or `age_band` / `budget_band` missing for `intent` life / income / illness / review. |

Body: `{ intent: 'life'|'income'|'illness'|'review'|'will'|'other', age_band?: 'lt35'|'35_44'|'45_50'|'51plus', has_cover?: 'yes_work'|'yes_own'|'no'|'unsure' (legacy 'yes', 'not_sure' accepted), budget_band?: 'lt750'|'750_1250'|'1250_1499'|'1500_plus', want?: 'family'|'bond'|'income'|'illness'|'unsure', request_id, confirm_adviser?: '<brokers.id from phase (a)>' }`. Idempotent per call (`request_id`, and the confirm separately) (`lead_activities` `start_page_answers`, key `w39:answers:<lead>:<request_id>` / `...:confirm`: a repeat replays the first answer, writes and sends nothing). Always: bands to `leads.age_band` / `budget_band`, `conv_state.start = { intent, has_cover, want, at, via: 'start_page', request_id }`, `conv_state.help_with` (life -> life, income -> disability_income, illness -> severe_illness, review -> review, will -> wills), `leads.reasons` only where it maps (life -> life_cover, income -> disability, other -> other), W03's pending stall cancelled (`wa_threads.stall_due_at = NULL`, stage done / closed).

| intent / answers | Effect | next |
|---|---|---|
| `will` | `product_interest = 'wills'`, `conv_state.state = 'handoff'`, a console escalation (`human_handoff`, as W03's wills opener), Lindi: "Wills are done with a Capital Legacy consultant, so I've asked a person ..." | `chat` |
| `other` | `conv_state.state = 'unbooked'` (W07 treats the next message as free text), Lindi: "No problem, tell me in a sentence what you're after and I'll point you the right way." | `chat` |
| age `35_44` / `45_50`, budget tier A/B | `qualified_at`, stage `qualified`, `conv_state.state = 'unbooked'`. **Disclosure before routing (Jono, 2026-10-18):** phase (a) computes the adviser W01 would choose (`w39.pickAdviser` = `routingFor`, the same tier / product / named-consent rules as `routeExisting`), writes nothing to `broker_id` and returns his card; the page shows it (name, practice, FSP number). Phase (b) recomputes the pick: equal -> `lead_activities` `adviser_disclosed` `{ broker_id, fsp, firm, adviser, disclosure_version: 'START-DISCLOSE-v1' }` (key `w39:disclosed:<lead>:<broker>`) is written FIRST, then W01 Lead core `{ kind: 'route_and_first_touch', lead_id, first_touch: false, expect_broker_id }` (waits; routes only that broker, else `skip broker_changed`; **no W06 first touch**: the intro card follows the booking via W05 -> W06 `booking`). Already routed: the card is his current broker; a confirm of him logs the disclosure (once) and answers slots. Nobody can take the lead: W01 `{ hold_only: true }` records the hold (and the tier-C notice) and never routes | (a) `adviser` \| `chat`; (b) `slots` when `leads.broker_id` is the confirmed broker after routing, else `adviser` / `chat` |
| age in band, budget `lt750` (tier C) | the band only (never qualified); the routing trigger holds it unless the broker has the standing yes; W01 sends `lead_low_budget_held` once | `slots` \| `chat` |
| age `lt35` / `51plus` | `lib/w39.mjs OUT_OF_BAND_AGE_BOOKS` (**true**, Jono 2026-10-18: they may book with Mark): routed as above, **no `qualified_at`**, timeline `start_page_age_out_of_band`, `conv_state.age_accepted = true` (W07 passes it to `logic.mjs decide()`, which then never closes the lead on a typed age). With `false`: W03 outOfBand (disqualified, deleted in 24 h, the polite close). | `slots` \| `chat` |

**Counting caveat (needs_human):** `qualified_at` does not decide counting. `smc_count_lead` counts any routed lead whose meeting the broker marks attended and whose email is verified, so an out-of-band-age lead that books and attends WILL count toward the broker's order unless the database learns the rule (no DDL here).

`GET /slots` and `POST /book` are W04 / W05, unchanged. The page sends `context: { source: 'start_page' }`; W05 keeps only `context.event_id`, and `appointments.booked_via` stays `'page'` (its CHECK allows page / flow / list / chat / console). With `TURNSTILE_SECRET_KEY` unset, `/book` skips the Turnstile check (`bookGuard`: `bot_check: 'skipped'`); the per-IP / per-lead counters still apply.

**The WhatsApp link (W03).** Session call-to-action, body "Thanks {first_name}. Lovely to have you here. Tap below to answer a few quick questions and pick a time with {adviser_first|an adviser}. It takes about a minute. Or just reply here if you'd rather chat.", button "Start here", header image `https://n8n.sortmycover.co.za/media/whatsapp/headers/header-intent.png`. Meta: interactive `cta_url` (full URL). Twilio: Content `smc_start_cta` (`automation/templates/twilio/content/smc_start_cta.json`, `twilio/card`, session only, no approval) with the URL `https://sortmycover.co.za/start/#lt={{2}}`: Twilio substitutes only a URL suffix and documents no encoding rule for `#`, so `#lt=` is in the static part and the variable is the token alone (base64url + dots: nothing to encode). Without the `smc_start_cta` SID in `TWILIO_CONTENT_SIDS` (or without `LEAD_TOKEN_SECRET`) W03 sends the normal q_age question, and the sender never degrades the link to a text Body (the token would land in Twilio's message log). `conv_state.state = 'start_page'` + a stall; any message in chat meanwhile goes to W03 (W07 `routeInbound`), which falls back to `q_age` and the tap path.

### The web path: `POST /lead` with `start_page: true` (desktop "Book", no token; Jono, 2026-10-18)
Cal.com is dropped: on desktop, "Book" opens `/start/?ref=<code>&via=<src>` with no token. Step 0 posts W01 `POST /lead` (n8n path `lead`) with the old site quiz's body: `first_name, mobile, consent: true, consent_text` (the site's NAMED text, `CONSENT-NAMED-v5web`, filled with the practice + FSP; `lib/w01.mjs WEB_CONSENT` is a verbatim copy of lv-site `sites/sortmycover/config/consent.json`), `consent_version: 'CONSENT-NAMED-v5web', consent_mode: 'named', consent_ads, consent_ads_text, consent_ads_version, page_url, started_at, request_id, honeypot, context { ref, utm, event_id }` and **`start_page: true`**. No answers. Turnstile, rate limits, honeypot, line type and suppression are unchanged.

| W01 | Effect |
|---|---|
| `start_page: true` | Stored, never out of band (no age / budget yet; every age may book: W39 `OUT_OF_BAND_AGE_BOOKS`), **not routed**: `routing_reason = 'start_page_pending'` (no CHECK on the column), `conv_state = { state: 'start_page', via: 'start_page' }`, timeline `start_page_pending` + `consent_audit` (the posted text against `consentRegistry(broker)['CONSENT-NAMED-v5web']`). No first touch, no WhatsApp, no CAPI Lead yet (sent at the hand-over: `routeExisting` treats `start_page_pending` like `held_*`). `consent_ads: true` sets `consent_ads_at`. Response `200 { ok: true, status: 'accepted', lead_id, lead_token }`. |
| 90-day duplicate | `200 { ok: true, status: 'accepted', lead_id: <existing>, lead_token: <fresh for the existing lead> }` whenever the existing lead is not opted out (routed or not); no new lead, no WhatsApp, no CAPI. |

Then the W39 two phases (answers -> adviser card -> confirm -> W01 routes with `first_touch: false` and `expect_broker_id`; the named consent must name that broker's practice + FSP, else `held_consent_names_other_practice`), W04 `/slots` and W05 `/book` exactly as for a WhatsApp lead. **No session text for a web lead**: it never messaged us (no 24-h window), so W39 plans no WhatsApp line for `leads.origin = 'page'`; `will` and `other` open a console escalation (a person follows up) and the page shows its chat / "we'll be in touch" screen for `next: 'chat'`. Templates still go out: a held tier-C lead gets W01's `lead_low_budget_held`, and after booking W06 sends `broker_intro_booked` (the disclosure card with the booked time: since 2026-10-18 a booking event that wins the one-card claim is the first touch, however long after routing it came).

## W02 Meta instant form v2 (Jono, 2026-10-18; A/B arm vs click-to-WhatsApp)
Form: `deliverables/media-buyer/instant-form-spec-v2.json` (built by hand in Ads Manager). Reader: `lib/w01.mjs normaliseLeadAd` (`leadAdAnswers`, `leadAdConsent`); W02 passes the Graph answers map + `custom_disclaimer_responses` through (`automation/patch-w02-instant-form-v2.mjs`). Tests: `automation/tests/W02-instant-form-v2.test.mjs`.

| Field | Keys accepted | Values (option key or exact label) | Stored |
|---|---|---|---|
| intent | `smc_intent`, `intent`, `help_with` | `life` Life cover, `disability` Disability cover, `income` Income protection, `illness` Severe illness cover, `review` Not sure yet | `conv_state.start.intent` (/start/ code: life / income / income / illness / review) + `intent_option`, `conv_state.help_with` (life / disability_income / severe_illness / review), `product_interest = 'life_cover'` |
| age | `smc_age_band`, `age_band` | `lt35` Under 35, `35_44` 35 to 44, `45_50` 45 to 50, `51plus` Over 50 | `leads.age_band` |
| cover today | `smc_has_cover`, `has_cover` | `yes_work` Yes, through work · `yes_own` Yes, my own · `no` No · `unsure` Not sure (legacy `yes` Yes -> `yes`, `not_sure` -> `unsure`) | `conv_state.start.has_cover` + `leads.work_cover` (yes_work true; yes_own / no false; unsure / yes unchanged) |
| consent | checkbox `consent` / `smc_consent` (required) | `is_checked "1"` | `consent_text` = `consentRegistry(broker)['CONSENT-NAMED-v5web']`, audited (`consent_audit`) |
| ad measurement | checkbox `consent_ads` / `smc_consent_ads` (optional) | `is_checked "1"` | `consent_ads_at` |

A field with an unknown name is matched on its value (a hand-built form). Other checkbox keys: a ticked box is the consent (Meta refuses a submission without the required one); the ads choice is then not assumed. Missing intent / cover answers are tolerated.

**Every age is accepted** (`lib/w01.mjs OUT_OF_BAND_AGE_BOOKS`, the switch W39 re-exports): `lt35` / `51plus` (or no age) are stored and asked the band like anyone, `conv_state.age_accepted = true`, timeline `lead_ad_age_out_of_band`; W03 `finishLeadAd` routes them on the band tap but writes **no `qualified_at`** (nor for tier C), and `keep_lead` clears the budget reminder's delete date. The W02 backstop (`meta-ads qualifyLead`) no longer routes out on age, and judges `call_ok` only when a v1 form asked it. The budget is unchanged: stored `held_budget_pending`, first touch W03 `ask_budget` -> `qualify_budget` template within 60 s.

## Lead-ad disclosure before hand-over (2026-10-18)
Instant Form leads (`leads.origin = 'lead_ad'`) are introduced by W06's `broker_intro_slots` (adviser, practice, FSP), which lacks the SortMyCover disclosure /start/ (W39) and the CTWA chat show. **A lead-ad lead is never handed over without it.**
- Interim (no `broker_intro_slots_v3` SID): on the band tap (W03 finishLeadAd -> W01 Lead core `route_and_first_touch`), `routeExisting(..., { require_disclosure })` returns `action: 'disclose'` for the broker `routingFor` picks unless `lead_activities` has `adviser_disclosed` for that broker (`Load CTWA lead + brokers` reads them as `lead.disclosed`). W01 then sends the session text (`w01.leadAdDisclosure`, smc-whatsapp-send, **waits**), writes `adviser_disclosed` (`LEADAD-DISCLOSE-v1`, key `w01:disclosed:<lead>:<broker>`, only with a message id, live or dry), and routes in a second pass (`Route after the disclosure`). No message id -> `routing_reason = 'held_disclosure_failed'`, never routed. Held (no broker): no text.
- With `broker_intro_slots_v3` in `TWILIO_CONTENT_SIDS` (Twilio provider, `w01.introV3Ready`): no interim text; W06 sends `broker_intro_slots_v3` (the card with the disclosure) to lead-ad leads. Proposal + submit command: `templates/twilio/BROKER-INTRO-V3.md` (for Jono with the Instant Form launch; HELD in `templates/submit.sh`).
- CTWA, /start/ (W39, its own START-DISCLOSE-v1) and page leads are unchanged.

## The cover question: four options, one stored vocabulary (Jono, 2026-10-18)
"Yes, through work" tells Mark the cover is group cover that ends with the job. Every path stores the same code via `lib/w01.mjs hasCoverCode` and sets `leads.work_cover` (what the pre-call brief, W11, shows as "has cover through work") via `workCoverOf`:

| Answer (label) | Stored `has_cover` | `leads.work_cover` |
|---|---|---|
| Yes, through work | `yes_work` | `true` |
| Yes, my own | `yes_own` | `false` |
| No | `no` | `false` |
| Not sure | `unsure` | unchanged |
| legacy "Yes" (three-option form / page) | `yes` (type unknown) | unchanged |
| legacy `not_sure` | `unsure` | unchanged |

Paths: /start/ (W39 `POST /start/answers`, stored in `conv_state.start.has_cover`; `GET /start` returns it as stored), the Instant Form (W01 `normaliseLeadAd`, Graph lead or the W02 ingest item's answers map; `conv_state.start.has_cover` + the insert's `work_cover`). Lindi's chat asks no cover question (the 3b/3c copy in lindi-flow-copy.md is not built), so there is no chat mapping. Test: `W02-instant-form-v2.test.mjs` "cover answer (4 options ...)".
