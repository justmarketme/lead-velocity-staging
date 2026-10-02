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
- `/book` also keeps its existing body (`request_id`, `slot`, `method`, `email?`, Turnstile token). It **may** echo `lead_id` for logs, but the server uses the token's lead id, and a mismatch returns `401`.

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

Every call is an n8n **Execute Workflow** by name (`cachedResultName`), fire-and-forget (`waitForSubWorkflow: false`) unless the row says **waits**. The callee owns its own messages, rows and retries. Every write is keyed by the `idempotency_key` given (or the one named here), so a re-run sends nothing twice. A missing required field is logged as `lead_activities.activity_type = 'subcall_rejected'` and stops; it is never guessed. The core-path builds (W04, W05, W09, W12, W13) honour these rows after GATE-TEST-*; callers already send them (W07, W10, W11, W28, W29, W03).

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

**W07 owns `POST /whatsapp`.** It is the only workflow subscribed to the `whatsapp_business_account` callback. It verifies `X-Hub-Signature-256`, answers 200 at once, claims the wamid (idempotent), writes status receipts (disclosure evidence), and routes deterministically: STOP → W15, broker numbers → W12/W29, `nfm_reply` → W28/W05, taps → their owners, everything else → its own agent.

**W03 is a sub-workflow.** W07 calls `W03 Lead intake (Click-to-WhatsApp)` with `{ source: 'W07', route, msg, lead, booking }` when the sender has no open lead, the message carries a CTWA `referral` or the prefill text, or the lead is mid-qualification (`consent_pending`, `q_*`). `msg` is W07's `normaliseInbound()` shape; W03's first node rebuilds the Cloud API message for `ctwa/w03.js`, so the tested logic is unchanged.

**Change made in this pass:** until now `automation/W03.json` had its own `POST /whatsapp` webhook (signature check, wamid claim, status/STOP/broker/Flow routing). Two POST listeners on one path cannot both be active in n8n, and Meta allows one callback URL per app. The W03 POST webhook, signature check, claim and routing nodes are removed (`automation/build-w03-w28.mjs`, regenerated). W03 now starts at `Called by W07 (CTWA lead)` (Execute Workflow Trigger).

**Still listening in W03:** `GET /whatsapp` (Meta's one-time verify handshake, because W07 has no GET node) and `GET /wa/:ref` (I-09 tracked redirect). These are GET only and do not compete with W07.

**Open points:**
- W03 → `W07 Conversation agent (forward)` (existing 90-day lead found by W03's own dedupe) can loop if W07 routes the same item back to W03. W07 must treat `source = 'W03'` as a known lead and never route it to W03 again (automation-engineer, W07 follow-up).
- `automation/W23.json` uses an n8n **WhatsApp Trigger** (broker media capture). That registers its own app subscription and competes with W07's callback. W23 should be called by W07/W12 instead (needs_human, owner of W23).
- Ops taps (W32 Approve / Later on `ops_action`) arrive on the same callback. W07's router has no W32 route yet (follow-up, automation-engineer with optimisation-advisor).
