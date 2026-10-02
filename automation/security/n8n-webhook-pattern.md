# Inbound webhooks in n8n: the verification pattern (W01, W02, W03, W16, W30)

**Rule (Meta / WhatsApp webhook security docs + OWASP ASVS L1 V13.1):** every inbound webhook is verified on the **raw bytes** before anything is parsed, stored or acted on. A failed check returns 401 and logs the *reason* and source IP, never the payload. A passed check is de-duplicated on the provider's own event id before any side effect.

**Code:** `automation/security/verify-webhooks.js` (Node 18+, no dependencies; tested by `node --test automation/security/verify-webhooks.test.js`). The n8n Code node cannot `require` repo files, so the module is **inlined**: run `node automation/security/inline-for-n8n.mjs` and paste the output at the top of the Code node. The banner carries the source SHA-256. Regenerate after any change to the module.

**n8n settings this relies on** (SECURITY.md §2): `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (so `$env.META_APP_SECRET` etc. are readable in Code nodes), `N8N_PROXY_HOPS=1` behind Traefik / the tunnel.

## 1. The node chain, the same for every provider

```
[Webhook  POST /<path>]  HTTP method POST · Respond: "Using 'Respond to Webhook' node" · Options → Raw Body: ON
        │
[Code  "Verify signature"]   (snippets below; returns {verified, status, reason, payload, event_ids, payload_hash})
        │
[IF  verified?] ──false──► [Respond to Webhook  401, body "unauthorized"] ► [Postgres  insert security_events(source, reason, ip, at)]   (no payload stored)
        │true
[Respond to Webhook  200]   ← answer fast (Meta retries anything slow or non-200; Paystack the same)
        │
[Postgres  "Idempotency"]   per event id: INSERT INTO webhook_events (source, external_id, received_at, signature_ok, payload_hash)
        │                    VALUES ($1,$2,now(),true,$3) ON CONFLICT (source, external_id) DO NOTHING RETURNING id
[IF  row returned?] ──no──► stop (duplicate redelivery; nothing happens twice)
        │yes
[ … the workflow's real work … ]
```
- `webhook_events` is the table platform-architect is adding (crm-gap §A1, "webhook idempotency"). The SQL text is exported as `VW.WEBHOOK_EVENTS_INSERT_SQL`.
- For **Meta**, add a second **Webhook GET** node on the same path for the subscription handshake (§3).
- Workflow setting **Error workflow = W22 Alerts**. If verification starts failing en masse (wrong secret after a rotation), W22's `workflow_failed` / security-event count shows it.

## 2. The Code node per provider (paste under the inlined block)

### Meta: WhatsApp (W03 ingress), Lead Ads `page` object (W02 ingress), Page feed + Instagram comments (W30)
```js
// Run Once for All Items
const item = $input.first();
const raw = await this.helpers.getBinaryDataBuffer(0, 'data');           // Raw Body option → binary "data"
const sig = VW.headerValue(item.json.headers, 'x-hub-signature-256');
const v = VW.verifyMetaSignature(raw, sig, $env.META_APP_SECRET);
if (!v.ok) return [{ json: { verified: false, status: 401, reason: v.reason, ip: VW.headerValue(item.json.headers, 'x-forwarded-for') || null } }];
const payload = JSON.parse(raw.toString('utf8'));
// Optional replay guard: WhatsApp messages carry `timestamp` (epoch s). Statuses can legitimately arrive late,
// so apply the window to inbound *messages* only, and use 24 h, not 5 min (Meta retries for hours).
const stale = (payload.entry || []).flatMap(e => (e.changes || []).flatMap(c => (c.value && c.value.messages) || []))
  .some(m => !VW.checkReplayWindow(m.timestamp, { toleranceSec: 24 * 3600 }).ok);
return [{ json: { verified: true, status: 200, stale, payload,
  event_ids: VW.extractEventIds('meta', payload, raw), payload_hash: VW.payloadHash(raw) } }];
```
Then fan out one item per `event_ids` entry into the Idempotency node with `source = 'meta'`.

### Paystack (W16)
```js
const item = $input.first();
const raw = await this.helpers.getBinaryDataBuffer(0, 'data');
const v = VW.verifyPaystackSignature(raw, VW.headerValue(item.json.headers, 'x-paystack-signature'), $env.PAYSTACK_SECRET_KEY);
if (!v.ok) return [{ json: { verified: false, status: 401, reason: v.reason } }];
const payload = JSON.parse(raw.toString('utf8'));
return [{ json: { verified: true, status: 200, payload,
  event_ids: VW.extractEventIds('paystack', payload, raw), payload_hash: VW.payloadHash(raw) } }];
```
- Paystack signs with the **secret key** (HMAC-SHA512, hex). `PAYSTACK_WEBHOOK_SECRET` in `.env.example` is only needed if Paystack ever issues a separate webhook secret. Until then leave it empty.
- After verifying, W16 **re-fetches the transaction** (`GET /transaction/verify/{reference}`) before marking an invoice paid. A webhook is a notification, not proof of payment (OWASP: don't trust client-supplied state for money).
- Failure events (`invoice.payment_failed`, `charge.failed`) are forwarded to W22 as-is (W22.md §3).

### Twilio (SMS fallback status in W06, voice status in W22, legacy `handle-inbound-call`)
```js
const item = $input.first();
// The exact URL Twilio called: public base + path + original query string (N8N_PROXY_HOPS must be right).
const q = new URLSearchParams(item.json.query || {}).toString();
const url = `${$env.WEBHOOK_URL.replace(/\/$/, '')}/webhook/${item.json.webhookPath || '<path>'}${q ? '?' + q : ''}`;
const isJson = /json/.test(VW.headerValue(item.json.headers, 'content-type') || '');
const raw = isJson ? await this.helpers.getBinaryDataBuffer(0, 'data') : undefined;
const v = VW.verifyTwilioSignature({ url, params: isJson ? undefined : item.json.body, rawBody: raw,
  signatureHeader: VW.headerValue(item.json.headers, 'x-twilio-signature'), authToken: $env.TWILIO_AUTH_TOKEN });
if (!v.ok) return [{ json: { verified: false, status: 401, reason: v.reason } }];
return [{ json: { verified: true, status: 200, payload: item.json.body, event_ids: VW.extractEventIds('twilio', item.json.body) } }];
```
- Twilio signs with the **account Auth Token**. An API key secret cannot verify webhooks. `TWILIO_AUTH_TOKEN` was added to `.env.example` for this reason. It is used for verification only. Outbound calls keep using the API key (least privilege).
- If `url` reconstruction fails behind the proxy (the signature never matches), log the reconstructed URL, never the header. Then compare it with the URL configured in the Twilio console.

### W01 `POST /lead` (from our own landing page): not provider-signed
A static page cannot keep a secret. Any HMAC key shipped in page JS is public, so `INTERNAL_HMAC_SECRET` must **not** be used from the browser. It stays for server-to-server calls and signed portal deep links. W01's controls are (6B.5, ASVS V11/V13):
1. **Turnstile** token verified server-side. An HTTP Request node `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` sends `secret=$env.TURNSTILE_SECRET_KEY`, `response=<token>` and `remoteip`. Reject unless `success`.
2. **Honeypot** field empty, and the form took ≥ 3 s to fill (a client timestamp, checked with `VW.checkReplayWindow(ts, { toleranceSec: 3600 })` so it is neither stale nor in the future).
3. **Rate limit** per IP and per number (`RATE_LIMIT_PER_IP_PER_HOUR`), counted in Postgres. A spike also trips W22 `intake_spike`.
4. **Origin allowlist:** the `Origin` header must be the consumer domain or `go.` / staging.
5. **Schema validation:** E.164 number, enum bands, consent boolean `true` with the consent text hash. Unknown fields are dropped.
6. **Idempotency:** `event_id` (from `landing/shared/pixel.js`) as `webhook_events(source='web', external_id=event_id)`.

## 3. Meta subscription handshake (GET on the same path)
```js
// Webhook GET node → Code → Respond to Webhook (Respond With: Text, Response Code: {{$json.status}}, Body: {{$json.body}})
const v = VW.metaVerifyHandshake($input.first().json.query, $env.META_WEBHOOK_VERIFY_TOKEN);
return [{ json: { status: v.status, body: v.body } }];
```

## 4. Where each workflow's webhook lives (one callback URL per Meta object)
A Meta app has **one callback URL per object type** (`whatsapp_business_account`, `page`, `instagram`). The ingress is therefore one verified Webhook node per object, which routes by `field` with Execute Workflow:

| Object / provider | Ingress (verifies) | Routes `field` → workflow |
|---|---|---|
| `whatsapp_business_account` | **W03** webhook (`/webhook/wa`) | `messages` with CTWA `referral` → W03 · other `messages` → W07 · `statuses` → W06 delivery log · `message_template_status_update`, `phone_number_quality_update`, `account_update` → W27 → **W22** |
| `page` | **W02** webhook (`/webhook/meta-page`) | `leadgen` → W02 · `feed` → W30 · `messages` (Messenger) → W31 |
| `instagram` | **W30** webhook (`/webhook/meta-ig`) | `comments` → W30 · `messages` → W31 |
| Paystack | **W16** webhook (`/webhook/paystack`) | `charge.success` → W16 · failures → W19 + W22 |
| Twilio | W06 / W22 status callbacks | — |
| Flow endpoint (W28) | its own route. `X-Hub-Signature-256` is checked first and a failure returns **432**, as `flows/booking-flow-endpoint.md` says. Then decryption uses Meta's reference code; a failure there returns 421 | — |

If automation-engineer uses n8n's built-in *WhatsApp Trigger* node instead of a Webhook node for W03, the explicit, tested check above is lost and the raw body is not exposed. Use the Webhook node pattern here.

## 5. Checklist per webhook (part of each workflow's acceptance test)
- [ ] Raw Body ON, and verification runs before any JSON use.
- [ ] Valid signature → 200 within 2 s. Tampered body → 401. Missing header → 401. Wrong secret → 401 (the synthetic suite sends all four).
- [ ] Redelivery of the same event id → no second side effect.
- [ ] Execution data: the workflow saves **errors only** (Settings → Save successful executions: off), so lead payloads don't pile up in n8n (SECURITY.md §2).
- [ ] Error workflow = W22.
