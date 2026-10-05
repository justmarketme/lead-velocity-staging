# ROTATION.md: rotating a secret that sits behind several n8n credentials (I-47h)

Owner: devops-security. **Names and types only. No value ever goes in this file, in chat or in git.**

One underlying secret is often copied into several n8n credentials (Meta system-user token: 6 credentials under 5 names; Anthropic: 3; Twilio: 2; Microsoft Entra app: 6). A rotation that misses a copy fails only the workflow that holds it, and often silently. n8n copies are encrypted with `N8N_ENCRYPTION_KEY` and do **not** read `.env` at run time, so updating `.env` alone changes nothing inside a credential.

## 1. Copies table (machine-derived, machine-checked)
Printed by `node automation/vps/credential-copies.mjs` from `automation/W*.json` and `SUB-*.json`. `automation/tests/credential-copies.test.mjs` fails if this block differs from the script output, or if a workflow credential is not mapped to a secret. Paste the new output between the markers after any workflow credential change.

<!-- credential-copies:begin -->
| Secret | `.env` | n8n credential name | Type | Used by |
|---|---|---|---|---|
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | Meta system user token (Bearer) | `httpHeaderAuth` | SUB-capi-send, W20, W22 |
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | WhatsApp Cloud API (SortMyCover) | `httpHeaderAuth` | W14 |
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | WhatsApp Cloud API (SortMyCover) | `whatsAppApi` | W23 |
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | WhatsApp Cloud API (system user) | `httpHeaderAuth` | SUB-whatsapp-send, W03, W28 |
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | WhatsApp Cloud API token (SMC ops) | `httpHeaderAuth` | W32 |
| Meta system-user token | META_SYSTEM_USER_TOKEN (+ WABA_ID for whatsAppApi) | WhatsApp Graph bearer (system user) | `httpHeaderAuth` | W23 |
| Meta Page token | PAGE_ACCESS_TOKEN | Meta Page Token | `httpHeaderAuth` | W30, W31 |
| Anthropic API key | ANTHROPIC_API_KEY | Anthropic API | `httpHeaderAuth` | W30, W31 |
| Anthropic API key | ANTHROPIC_API_KEY | Anthropic API (SMC) | `httpHeaderAuth` | W32, W33 |
| Anthropic API key | ANTHROPIC_API_KEY | Anthropic API key (x-api-key) | `httpHeaderAuth` | W23 |
| Twilio API key | TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET | Twilio (SMC voice) | `httpBasicAuth` | W32 |
| Twilio API key | TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET | Twilio API key (Basic) | `httpBasicAuth` | W01, W06, W15, W22 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite) | `microsoftOutlookOAuth2Api` | W05, W10, W15 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` | W05, W14, W15, W17, W19, W34 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | Microsoft Graph (howzit@) | `microsoftOutlookOAuth2Api` | W32 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | Microsoft Graph (howzit mailbox, app-only) | `oAuth2Api` | W20 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | MS Graph app-only - howzit@ Mail.Send | `oAuth2Api` | W22 |
| Microsoft Entra app (howzit@ and broker connect) | MS_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_CLIENT_SECRET | Microsoft Graph broker-connect client secret (W20) | `httpCustomAuth` | SUB-w20-ms-token, W04 |
| Supabase service-role key | SUPABASE_SERVICE_ROLE_KEY | Supabase Storage (service role) | `httpHeaderAuth` | W23 |
| Supabase service-role key | SUPABASE_SERVICE_ROLE_KEY | Supabase service role (W16 magic link) | `httpHeaderAuth` | W16 |
| Supabase service-role key | SUPABASE_SERVICE_ROLE_KEY | Supabase service role (n8n, W20) | `httpHeaderAuth` | W20 |
| Supabase n8n_app database password | SUPABASE_DB_URL (host/db/port); password in the password manager | LV Supabase - n8n_app (least privilege) | `postgres` | SUB-ads-budget, SUB-ads-console, SUB-capi-send, SUB-visit-beacon, SUB-w20-ms-token, SUB-w26-runner, SUB-whatsapp-send, W01, W02, W03, W04, W05, W06, W07, W08, W09, W10, W11, W12, W13, W14, W15, W16, W17, W18, W19, W20, W21, W22, W23, W24, W25, W27, W28, W29, W30, W31, W32, W33, W34, W35 |
| Supabase Storage S3 key pair | SUPABASE_S3_ACCESS_KEY, SUPABASE_S3_SECRET_KEY (+ SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION) | MinIO intro media | `s3` | W23 |
| Paystack secret key | PAYSTACK_SECRET_KEY | Paystack secret key (Authorization: Bearer) | `httpHeaderAuth` | W16, W19, W25 |
| Transcription API key | TRANSCRIBE_API_KEY (+ TRANSCRIBE_URL) | Transcription API (bearer) | `httpHeaderAuth` | W23 |
| NCC registry key | - (GATE-NCC) | NCC registry API | `httpHeaderAuth` | W24 |
| Hostinger SFTP login | - (password manager) | Hostinger SFTP (static sites) | `sftp` | W25 |
| Console to n8n shared secret | - (password manager; ops.secret_inventory) | Console -> n8n shared secret | `httpHeaderAuth` | W25 |
| W22 uptime monitor token | - (password manager; ops.secret_inventory) | W22 uptime monitor header token | `httpHeaderAuth` | W22 |
| W34 DSR webhook token | - (password manager; ops.secret_inventory) | W34 DSR webhook token | `httpHeaderAuth` | W34 |
| n8n webhook secret (SMC) | - (password manager; ops.secret_inventory) | n8n webhook secret (SMC) | `httpHeaderAuth` | W32, W33 |
<!-- credential-copies:end -->

Credential names and types are fixed. `local/pubcheck.mjs` hashes them and the live-staging import binds by name + type, so a rotation **never renames or merges** a credential.

## 2. Rotation order (same for every secret)
1. **Issue the new secret** at the provider (Meta Business settings, Anthropic console, Twilio console, Entra app registration, Supabase dashboard, Paystack dashboard). Keep the old one **active**. For overlap-capable secrets (HMAC `*_PREVIOUS` variables, Entra supports two client secrets) use the overlap.
2. **Update `.env`** (repo root on the laptop, `/opt/lead-velocity/.env` on the VPS, mode 0600) and the password manager. Never paste the value into chat, a ticket or a commit.
3. **Update every n8n credential copy** listed in section 1 for that secret: n8n UI, Credentials, open the row by name + type, paste the new value, Save. For OAuth2 credentials (`microsoftOutlookOAuth2Api`, `oAuth2Api`) re-enter the client secret and **reconnect** (consent again as howzit@). Restart n8n if `.env` values read through `$env` changed (`docker compose ... up -d n8n`).
4. **Re-run the check**: `check-credentials.mjs` (names and types, see `local/CREDENTIALS.md`) proves each credential still exists. It cannot see values or OAuth connection state, so also run one real execution per workflow in the "Used by" column (the synthetic suite, W26 step 14) and read W22 token-health the next morning.
5. **Revoke the old secret** only when step 4 is green for every row. Record the date in `ops.secret_inventory`.
6. Take a fresh backup (the n8n credential table is part of the encrypted backup; an old backup restores the old value).

## 3. What breaks if a copy is missed
| Secret | A missed copy means |
|---|---|
| Meta system-user token | Outbound WhatsApp (`SUB-whatsapp-send`, W03, W28, W14, W32, W23) or CAPI / ads / token-health (`SUB-capi-send`, W20, W22) returns 401 once the old token is revoked. Leads get no 60-second first message |
| Meta Page token | Comment and Messenger replies stop (W30, W31) |
| Anthropic API key | The workflow holding the stale copy stops replying or judging (W23, W30, W31, W32, W33), others keep working, so it looks like a partial outage |
| Twilio API key | SMS fallback, voice and call alerts fail in the workflow with the stale copy (W01, W06, W15, W22, W32) |
| Microsoft Entra app | Booking events, invoices, bounces and broker connect fail (W04, W05, W15, W17, W19, W20, W22, W32, W34). OAuth copies also need reconnecting. An expired client secret takes all six down at once (W22 tracks expiry) |
| Supabase service-role key | Magic links (W16, W20) or signed uploads (W23) fail. Also rotate the edge-function secrets (`provision.sh` step 13) |
| Supabase n8n_app database password | Every workflow fails at its first Postgres node. Change the role password and the one credential together |
| Supabase Storage S3 key pair | W23 media upload and download fail (intro media stays pending) |
| Paystack secret key | Checkout, reconciliation and the pricing publish fail (W16, W19, W25). Webhook HMAC verification uses the same key from `$env`, so also restart n8n |
| Transcription API key | W23 captions fail (media path stays off while `TRANSCRIBE_URL` is empty) |
| n8n-only secrets (no `.env` name) | The caller (console, uptime monitor, DSR caller) gets 401 until its copy matches. Change both sides in one window |

Webhook signature secrets read through `$env` (`META_APP_SECRET`, `INTERNAL_HMAC_SECRET`, `LEAD_TOKEN_SECRET`, `W34_MEDIA_ERASE_SECRET`, `TWILIO_AUTH_TOKEN`, `ZOOM_WEBHOOK_SECRET`) are not credentials. They rotate in `.env` plus a restart. Where a `*_PREVIOUS` variable exists, set it to the old value first and clear it after the overlap window.

## 4. Leak = halt + rotate (MASTER-PROMPT 0.3 #10)
If a secret or personal data appears in chat, a log, a commit or a screenshot: **halt** the task that exposed it, **rotate** that secret now using section 2 (every copy, then revoke), purge the exposure (history rewrite for a commit, redact the log), and record it in the secret inventory. Do not wait to see whether it was used. The pre-commit guard (`.githooks`, `git config core.hooksPath .githooks`) is the first line of defence, not a reason to skip rotation.

## 5. Future consolidation (not done here)
`CREDENTIALS.md` C1 proposes **one credential per secret** (for example one `Meta system user token (Bearer)`, one `Anthropic API key (x-api-key)`, one `Twilio API key (Basic)`), which would turn each rotation into a single edit. It means regenerating the workflow JSON and re-baselining `pubcheck.mjs` hashes, so it is a decision for the automation-engineer and generator owners, not a runbook edit. Until then, section 1 is the checklist.
