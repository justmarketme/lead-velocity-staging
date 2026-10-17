# W03 build notes: CTWA `ref` handling (I-09) + public endpoint protection for W01/W04/W05 (I-11)

Owner: automation-engineer. Status: **design for the Phase 2 build**, not yet in a workflow export. Nothing here was submitted or deployed, and no web lookups were made. Meta behaviour stated below is from the 4.6 brief and the Cloud API webhook shape the tests already use (`automation/tests/W01.test.mjs`, `intakeCtwa`). Anything not in those sources is marked ASSUMPTION.

Which of my five covers this? **Chili Piper:** every hand-off is a leak, so a comment or DM reply goes straight into the one WhatsApp chat with nothing in between. **Meta Cloud API docs:** the referral object, the 72-h CTWA window and per-message cost decide what we can and cannot attribute. **HBR:** none of the guards below may slow the first WhatsApp past 60 s.

---

## A. CTWA `ref=cmt_{ad_id}`: tracked redirect contract + W03 parsing

### A.1 The problem
W30 (comments) and W31 (DMs) reply with a link built as `CTWA_BASE_URL + '/' + ref`. Today `ref` is one of:

| ref | Built by | Meaning |
|---|---|---|
| `cmt_{ad_id}` | W30 | comment under a paid ad (`ad_id` = Meta ad id, digits) |
| `cmt_org_{post_id}` | W30 | comment under an organic post (`post_id` = `{page_id}_{post_id}`, digits and `_`) |
| `dm_messenger` / `dm_instagram` | W31 | DM with no earlier comment |
| `state.origin_ref` (a `cmt_*` value) | W31 | DM that started from a comment reply |

A plain `wa.me` link opens the chat **without** a Meta `referral` object. ASSUMPTION, consistent with 4.6 step 1: `referral` is attached only when the chat is opened from a Click-to-WhatsApp ad or post button. So the only thing that can carry the ref into W03 is the **prefilled message text**. The redirect puts it there, and W03 reads it back.

### A.2 Redirect contract: `GET {CTWA_BASE_URL}/{ref}`
- **Host:** `CTWA_BASE_URL=https://link.sortmycover.co.za/wa`. This is `LINK_HOST`, the same consumer-domain host that already serves `/c/` (.ics) and `/j/` (join links). It is never the staging host and never `leadvelocity.co.za`, because the consumer only ever sees SortMyCover (0.1 brand).
- **Served by:** the n8n webhook `GET /webhook/wa/:ref` (workflow W03-redirect, 4 nodes). Traefik routes `link.sortmycover.co.za/wa/*` to it with the path rewritten. Before the VPS exists, the same host goes through the Cloudflare Tunnel to local n8n (0.3 #7).
- **Steps:**
  1. Validate `ref` against `^(cmt_(\d{5,20}|org_\d{5,20}_\d{5,20})|dm_(messenger|instagram))$`. If it does not match, set `ref = null`. Never echo arbitrary text into the prefill or the Location header, so this cannot become an open redirect or a text-injection vector.
  2. Log one click row, `ops.ctwa_clicks(ref, clicked_at, ua_class)`. `ua_class` is one of `ios/android/desktop/other`. **No IP, no full UA, no cookie.** This is counting only (POPIA minimisation), and the insert is fire-and-forget (n8n "Execute once", no wait).
  3. Respond `302` with `Location: https://wa.me/{WA_DISPLAY_NUMBER_DIGITS}?text={urlencoded prefill}`, plus `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
     - Prefill when the ref is valid: `Hi, I'd like to check my life cover (ref cmt_120212345678901234)`
     - Prefill when it is not: `Hi, I'd like to check my life cover`. This is the exact 4.6 CTWA prefill, so the base sentence is the same on every entry path.
     - The number is the brand's production WhatsApp number from the `brands` row (`phone_number_id` → display number), cached in the workflow. It is never taken from the URL.
  4. Target: under 100 ms at the server. Nothing in this path calls Meta or the CRM synchronously.
- **Fallback (no VPS, n8n down, or tunnel down):** a **stateless** rule on the static consumer site, `https://sortmycover.co.za/wa/{ref}`, does the same `302` with no click log. Example for Hostinger `.htaccess`, deployed by W25 with the site:
  ```apache
  RewriteEngine On
  RewriteRule ^wa/((cmt_(org_)?[0-9_]{5,45})|dm_(messenger|instagram))/?$ https://wa.me/27XXXXXXXXX?text=Hi\%2C\%20I\%27d\%20like\%20to\%20check\%20my\%20life\%20cover\%20\%28ref\%20$1\%29 [R=302,NE,L]
  RewriteRule ^wa/?.*$ https://wa.me/27XXXXXXXXX?text=Hi\%2C\%20I\%27d\%20like\%20to\%20check\%20my\%20life\%20cover [R=302,NE,L]
  ```
  `27XXXXXXXXX` is filled from `.env` at deploy time and never committed. W22 pings `CTWA_BASE_URL/cmt_0000000000` hourly and expects a `302` to `wa.me`. On two failures it alerts, and the console can switch `CTWA_BASE_URL` to the fallback host. When `CTWA_BASE_URL` is empty, W30/W31 already fall back to a page link with `utm_medium=comment|dm`.
- **Owner split (I-09):** landing-page-builder owns the static fallback rule and its place in the W25 deploy. devops-security owns the Traefik route for `link.sortmycover.co.za/wa/*`. automation-engineer owns the n8n redirect workflow and the W03 parse. platform-architect adds `ops.ctwa_clicks` (needs_human, schema pass 2).

### A.3 W03: reading the origin from the first inbound message
W03 runs on the WhatsApp Trigger (same signed Cloud API webhook as W07). It runs only when the sender has no open SortMyCover lead, or the open lead has `origin is null`. The inbound `messages[0]` can carry:

```json
{ "from": "27600000004", "id": "wamid...", "timestamp": "...", "type": "text",
  "text": { "body": "Hi, I'd like to check my life cover (ref cmt_120212345678901234)" },
  "referral": { "source_url": "https://fb.me/...", "source_id": "120212345678901234", "source_type": "ad",
                "headline": "...", "body": "...", "media_type": "image", "ctwa_clid": "ARAk..." } }
```
`referral` is present only for CTWA ads and posts. The `(ref …)` suffix is present only for our redirect.

**Parse rule (one pure function, unit-tested in `W01.test.mjs` "W03 parity" when built):**
```js
const REF_RE = /\(ref ((?:cmt_(?:org_)?[0-9_]{5,45})|dm_(?:messenger|instagram))\)\s*$/;
export function readOrigin(msg) {
  const r = msg.referral || null;
  const m = msg.type === 'text' ? REF_RE.exec(msg.text?.body || '') : null;
  const ref = m ? m[1] : null;
  const fromRef = ref?.startsWith('cmt_') ? 'comment' : ref?.startsWith('dm_') ? 'dm' : null;
  return {
    origin: r ? 'ctwa' : fromRef || 'ctwa',                    // Meta's referral wins; no signal at all = 'ctwa' with ref null
    ref,                                                       // kept even when referral wins (both are stored)
    ad_id: r?.source_type === 'ad' ? r.source_id : (ref?.match(/^cmt_(\d{5,20})$/)?.[1] ?? null),
    ctwa_clid: r?.ctwa_clid ?? null,                           // only Meta's click id; never invented
    referral_source_type: r?.source_type ?? null,              // 'ad' | 'post'
    referral_source_id: r?.source_id ?? null,
    text_without_ref: m ? msg.text.body.replace(REF_RE, '').trim() : msg.text?.body ?? null,
  };
}
```
**Writes** (at consent "Yes", the moment the lead row is created, per the existing W03 parity tests): `leads.origin`, `leads.ref`, `leads.ad_id`, `leads.ctwa_clid`, and `campaign_id`/`adset_id` looked up from the W21 `ad_objects` cache by `ad_id`. If the cache has no match, they stay null and W21 back-fills them hourly. Until consent, the parsed origin lives only in `conversations.state` (no lead row, matching L05 "No thanks": only the hashed number is kept).

**Rules:**
1. **`ctwa_clid` comes only from `referral`.** A comment- or DM-origin lead has no `ctwa_clid`, so it cannot feed the business-messaging CAPI `Lead`/`Schedule` events (they need it to attribute). Those leads are reported by `ref` in the console and in `community/MEASUREMENT.md` ("qualified leads whose ref starts `cmt_`"), never as a different `Lead` definition (4.6).
2. **The ref is attribution, not identity.** If two numbers send the same ref (a shared screenshot), both get it. Nothing is deduped on ref. The 90-day dedupe stays on the mobile hash (W01).
3. The ref suffix is stripped before the text reaches W07 and is never shown back to the lead. The stored transcript keeps `text_without_ref`.
4. **Consent first is unchanged** (4.6 step 2). The ref changes no wording and skips no step.
5. A `cmt_*` lead is still a CTWA conversation, so the 72-h free entry window applies only if Meta opened it as CTWA (that is, `referral` is present). ASSUMPTION: a `wa.me` open is a normal user-initiated conversation (24-h window). The stall nudges (+1/+20/+68 h) therefore become templates after 24 h for comment-origin leads. W08 picks template vs session by `last_inbound_at`, not by `origin`.
6. **Idempotent on `wamid`** (`webhook_events` unique `(source='wa', external_id=wamid)`). A redelivered first message never creates a second lead or a second consent prompt.

**Acceptance cases to add to `W01.test.mjs` (W03 parity) at build:**
(a) referral only: `origin=ctwa`, `ctwa_clid` set, `ad_id = source_id`.
(b) ref `cmt_1202…` only: `origin=comment`, `ad_id` from the ref, `ctwa_clid` null.
(c) both: `origin=ctwa`, both stored.
(d) `cmt_org_…`: `origin=comment`, `ad_id` null.
(e) `dm_instagram`: `origin=dm`.
(f) a tampered suffix such as `(ref <script>)` or `(ref cmt_12; drop)`: no match, `ref` null, text left as-is.
(g) the ref text typed mid-message: no match (anchored at the end).
(h) a consent "No thanks" after a ref: no lead row, nothing but the hash kept.
(i) the redirect with a bad ref: `302` with the plain prefill.
(j) the redirect never sends to a host other than `wa.me`.

---

## B. `/lead`, `/slots`, `/book`: Turnstile + honeypot + rate limits (no HMAC in the browser)

### B.1 Principles
- **No secret in the browser.** A signature the page computes proves nothing, because anyone can read the key. `INTERNAL_HMAC_SECRET` is server-to-server only (portal/edge → n8n, W20 events). The browser proves itself with **Turnstile** (bot), **Origin** (site), a **lead token** (it is the same visitor who submitted) and **rate limits** (volume).
- **Cheap checks first, paid checks last.** Twilio Lookup (~R0.15) and Graph `getSchedule` calls only happen after every free check has passed.
- **Never slow the first touch.** All the checks together add < 400 ms p95 to `/lead` (Turnstile siteverify is the only network hop before Lookup). The 60-s first WhatsApp is unaffected.
- **Fail shut on the data, fail open on the human.** See B.5 for siteverify outages.

### B.2 Layer 1: Traefik (edge, before n8n)
Routers `api.<domain>/lead|/slots|/book` (`API_HOST`) carry these middlewares:
- `ratelimit` per client IP (`sourceCriterion.ipStrategy.depth=1` behind Cloudflare). Values: `/lead` + `/book` average 10/min burst 5; `/slots` average 30/min burst 20 (`RATE_LIMIT_SLOTS_PER_IP_PER_MIN`).
- `buffering.maxRequestBodyBytes=8192` (a lead is < 2 KB).
- `headers`: CORS `accessControlAllowOriginList = PUBLIC_ALLOWED_ORIGINS` (`https://sortmycover.co.za`, plus the staging host only on staging), methods `GET,POST`, no credentials.
- No other path on `API_HOST` reaches the n8n editor (SECURITY.md V13).

### B.3 Layer 2: n8n "Public guard" sub-workflow (called first by W01, W04 and W05)
Input `{endpoint, ip, origin, body, headers}`. Output `{ok, status, reason, lead}` (reason is logged, never returned). Steps, in order:

| # | Check | `/lead` (W01) | `/slots` (W04) | `/book` (W05) | On fail |
|---|---|---|---|---|---|
| 1 | `Origin` header in `PUBLIC_ALLOWED_ORIGINS` | yes | yes | yes | 403 |
| 2 | Honeypot `company_website` is empty | yes | — | yes | **200 fake success**, nothing stored, counter `honeypot` (landing/README.md behaviour) |
| 3 | Fill time ≥ 3 s from the page's `started_at`, and not older than 1 h (`VW.checkReplayWindow`) | yes | — | — | 200 fake success |
| 4 | Per-IP counter (salted hash of the IP, `RATE_LIMIT_PER_IP_PER_HOUR`, default 10) | yes | 120/h | yes | 429 + `Retry-After` |
| 5 | Turnstile siteverify: `secret=TURNSTILE_SECRET_KEY`, `response`, `remoteip`. Require `success`, `hostname` in the allowed hosts and `action` = endpoint name. Single-use token | yes (`action=lead`) | — (tokens are single-use, and slots is read-only) | yes (`action=book`; the page re-executes the invisible widget) | 400 `try_again` |
| 6 | Lead token: the opaque 128-bit `lead_token` that `/lead` returned. Stored as sha256 on the lead, TTL 7 days, bound to `lead_id` | issues it | **required** | **required** | 401 |
| 7 | Per-number counter (`mobile_hash`, `RATE_LIMIT_PER_NUMBER_PER_DAY`, default 5) | yes | — | per lead: 5 bookings/day | 429 (a repeat inside 90 days is already merged by dedupe, with no new WhatsApp) |
| 8 | Paid checks: E.164, then Twilio Lookup (line type cached 30 days per hash), then dedupe | yes | — | Graph re-check inside the booking transaction | 422 `invalid_mobile` / slot gone → next 3 |

- **`/slots` never takes a broker id from the browser.** The broker is resolved from the lead token (`lead.broker_id`). This stops scraping of any broker's free/busy. Responses are cached 60 s per broker, which also protects the Graph quota.
- **`/book` idempotency:** the page sends `request_id` (uuid v4). W05 stores `(lead_id, request_id)` unique, so a retry returns the same booking (W05 test "retried request returns the same booking"). Zero double-bookings still rests on the transactional re-check, not on the guard.
- **Counters:** `ops.rate_counters(key text, window_start timestamptz, count int, primary key (key, window_start))`. The update is a single `insert … on conflict do update set count = count + 1 returning count`. Keys are `ip:{hmac(ip, COMMENT_HASH_SALT-style salt)}` / `num:{mobile_hash}` / `lead:{id}`. Rows are purged nightly after 48 h. No raw IP is stored anywhere. `leads.client_ip` is kept only until the CAPI send (crm-gap).
- **Spikes:** more than 30 `/lead` per 10 min, or more than 20% honeypot/Turnstile failures in 10 min, raises W22 `intake_spike` (amber). Above 3× that rate it is red, and the console can flip `brands.intake_paused` (the page shows "We're busy, please try again in a few minutes" with no form loss: the browser keeps the answers).

### B.4 Staging and tests
- Staging uses Cloudflare's published Turnstile test keys: always-pass for the synthetic suite, always-fail for the negative test. `TURNSTILE_SITE_KEY` is baked into the page build (`data-turnstile-sitekey`). The page already loads Turnstile lazily after the first quiz tap (`landing/dist/assets/page.js`), so LCP is unaffected.
- The synthetic suite bypasses steps 4, 5 and 7 only when `TEST_HOOKS_ENABLED=true`, `X-Test-Token` matches and `is_synthetic=true`. This is the same guard as the other test hooks. Production ignores the header.
- **Acceptance cases to add to W01/W04/W05 tests at build:**
  1. Filled honeypot: 200, no lead row, no WhatsApp.
  2. Fill time 1 s: 200, nothing stored.
  3. 11th `/lead` from one IP in an hour: 429.
  4. Failing Turnstile token: 400, no Lookup call.
  5. 6th submission of one number in 24 h: 429, no Lookup call.
  6. `/slots` without a lead token: 401. With a token for broker A, `broker_id=B` in the query is ignored.
  7. `/book` replayed with the same `request_id`: same booking.
  8. Bad `Origin`: 403.
  9. A siteverify outage behaves per B.5.
  10. No guard path calls Twilio before steps 1–7 pass. Assert the Lookup call count.

### B.5 Defaults chosen (flag if you disagree)
- **Turnstile siteverify unreachable** (Cloudflare outage, timeout 1.5 s): `/lead` **fails open**. The lead is stored with `bot_check='unverified'`, the per-IP limit drops to 3/h, the per-number limit still applies, Lookup still blocks landlines/VoIP, and W22 alerts after 5 errors in 10 min. Reason: HBR (losing a real lead costs more than one bot WhatsApp that Lookup and dedupe already bound). `/book` fails shut (400 `try_again`). The lead can still book in WhatsApp, where Meta's signature is the proof. `TURNSTILE_FAIL_MODE=open|closed` makes this a config flag.
- Error bodies stay generic (`try_again`, `rate_limited`). Only `invalid_mobile`, `out_of_band` and `consent_required` are specific, because the page shows them (landing/README.md contract).

### B.6 Env names (in `automation/.env.example`)
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_FAIL_MODE`, `PUBLIC_ALLOWED_ORIGINS`, `RATE_LIMIT_PER_IP_PER_HOUR`, `RATE_LIMIT_PER_NUMBER_PER_DAY`, `RATE_LIMIT_SLOTS_PER_IP_PER_MIN`, `LEAD_TOKEN_TTL_HOURS`, `CTWA_BASE_URL`, `LINK_HOST`, `API_HOST`.

---

## needs_human raised by this note
1. **Schema (platform-architect, pass 2):** `ops.ctwa_clicks(ref, clicked_at, ua_class)`, `ops.rate_counters(key, window_start, count)`, `leads.ref`, `leads.lead_token_hash`, `leads.lead_token_expires_at`, `leads.bot_check`, `leads.referral_source_type`, `brands.intake_paused`, unique `bookings(lead_id, request_id)`. `leads.origin` keeps the crm-gap enum (page/lead_ad/ctwa/comment/dm). An unattributed WhatsApp chat is `ctwa` with `ref` null.
2. **ASSUMPTION to confirm on the test number (meta-operator, GATE-PIXEL test events):** a `wa.me?text=` open carries no `referral` object and opens a normal 24-h window, not the 72-h CTWA window. If Meta does attach `referral` (or `ctwa_clid`) to such opens, parse rule 1 already prefers it and nothing breaks.
3. **devops-security:** the Traefik router + rate-limit middleware for `link.sortmycover.co.za/wa/*` and `API_HOST`. Cloudflare in front means `ipStrategy.depth=1` (or `CF-Connecting-IP`). Confirm against the final proxy chain.
4. **landing-page-builder:** the `.htaccess` fallback rule in the W25 static deploy. The page must send `started_at` and `request_id`, and re-execute Turnstile with `action=book` before `/book`.
5. **Default to confirm (security, not money):** Turnstile **fail-open** on `/lead` during a Cloudflare outage (B.5).
