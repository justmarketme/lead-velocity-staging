# CREDENTIALS.md: every n8n credential the workflows reference (I-44f)

Owner: devops-security. **Names and types only. No value ever goes in this file, in chat or in git.** Values live in the repo-root `.env` (git-ignored) or the password manager, and inside n8n they are encrypted with `N8N_ENCRYPTION_KEY`.

**Why this list exists.** n8n checks credentials per workflow, both at activation and in the webhook pre-execution check. **One missing credential blocks the whole workflow**, including its GET verify webhooks (`RUN-LOCAL-NO-DOCKER.md` 4c: W03 failed every webhook until "WhatsApp Cloud API (system user)" existed). Workflows reference credentials **by name + type**. The import binds a reference to the credential with the same name and type, so a typo in either one counts as a miss.

**Drift guard.** Tables A and B are checked against `automation/W*.json` by `automation/tests/credential-inventory.test.mjs`. A workflow that adds, renames or drops a credential fails that test until this file is updated. The same scan is also a runtime check: `automation/vps/check-credentials.mjs` reads `name<TAB>type` from n8n's `credentials_entity` table (names and types only, never the encrypted `data` column) and exits 1 on any miss. W26 runs it in `provision.sh` step 7, after the restore and **before n8n starts and activates anything** (`vps/W26.md`). On the laptop:
```bash
docker compose -f automation/docker-compose.yml exec -T postgres sh -c \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select name || chr(9) || type from credentials_entity"' \
  | node automation/vps/check-credentials.mjs          # --list prints the required list
```
*Existence is not readiness.* An OAuth2 credential (`microsoftOutlookOAuth2Api`, `oAuth2Api`) also has to be **connected** (consent completed in the n8n UI). The check cannot see that, so W22's token-health job covers it after go-live.

## A. Per workflow (machine-checked: workflow, credential name, type)
W26 has no JSON yet (it runs as `provision.sh`, see LOCAL-STAGING.md §7). W01–W35 otherwise. A workflow with no row references no credential.

| Workflow | Credential name | Type |
|---|---|---|
| SUB-ads-budget | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-ads-console | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-capi-send | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-capi-send | Meta system user token (Bearer) | `httpHeaderAuth` |
| SUB-visit-beacon | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-w20-ms-token | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-w20-ms-token | Microsoft Graph broker-connect client secret (W20) | `httpCustomAuth` |
| SUB-w26-runner | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-whatsapp-send | LV Supabase - n8n_app (least privilege) | `postgres` |
| SUB-whatsapp-send | WhatsApp Cloud API (system user) | `httpHeaderAuth` |
| W01 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W01 | Twilio API key (Basic) | `httpBasicAuth` |
| W02 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W03 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W03 | WhatsApp Cloud API (system user) | `httpHeaderAuth` |
| W04 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W04 | Microsoft Graph broker-connect client secret (W20) | `httpCustomAuth` |
| W05 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W05 | Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite) | `microsoftOutlookOAuth2Api` |
| W05 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W06 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W06 | Twilio API key (Basic) | `httpBasicAuth` |
| W07 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W08 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W09 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W10 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W10 | Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite) | `microsoftOutlookOAuth2Api` |
| W11 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W12 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W13 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W14 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W14 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W14 | WhatsApp Cloud API (SortMyCover) | `httpHeaderAuth` |
| W15 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W15 | Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite) | `microsoftOutlookOAuth2Api` |
| W15 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W15 | Twilio API key (Basic) | `httpBasicAuth` |
| W16 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W16 | Paystack secret key (Authorization: Bearer) | `httpHeaderAuth` |
| W16 | Supabase service role (W16 magic link) | `httpHeaderAuth` |
| W17 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W17 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W18 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W19 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W19 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W19 | Paystack secret key (Authorization: Bearer) | `httpHeaderAuth` |
| W20 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W20 | Meta system user token (Bearer) | `httpHeaderAuth` |
| W20 | Microsoft Graph (howzit mailbox, app-only) | `oAuth2Api` |
| W20 | Supabase service role (n8n, W20) | `httpHeaderAuth` |
| W21 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W22 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W22 | Meta system user token (Bearer) | `httpHeaderAuth` |
| W22 | MS Graph app-only - howzit@ Mail.Send | `oAuth2Api` |
| W22 | Twilio API key (Basic) | `httpBasicAuth` |
| W22 | W22 uptime monitor header token | `httpHeaderAuth` |
| W23 | Anthropic API key (x-api-key) | `httpHeaderAuth` |
| W23 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W23 | MinIO intro media | `s3` |
| W23 | Supabase Storage (service role) | `httpHeaderAuth` |
| W23 | Transcription API (bearer) | `httpHeaderAuth` |
| W23 | WhatsApp Cloud API (SortMyCover) | `whatsAppApi` |
| W23 | WhatsApp Graph bearer (system user) | `httpHeaderAuth` |
| W24 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W24 | NCC registry API | `httpHeaderAuth` |
| W25 | Console -> n8n shared secret | `httpHeaderAuth` |
| W25 | Hostinger SFTP (static sites) | `sftp` |
| W25 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W25 | Paystack secret key (Authorization: Bearer) | `httpHeaderAuth` |
| W27 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W28 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W28 | WhatsApp Cloud API (system user) | `httpHeaderAuth` |
| W29 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W30 | Anthropic API | `httpHeaderAuth` |
| W30 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W30 | Meta Page Token | `httpHeaderAuth` |
| W31 | Anthropic API | `httpHeaderAuth` |
| W31 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W31 | Meta Page Token | `httpHeaderAuth` |
| W32 | Anthropic API (SMC) | `httpHeaderAuth` |
| W32 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W32 | Microsoft Graph (howzit@) | `microsoftOutlookOAuth2Api` |
| W32 | n8n webhook secret (SMC) | `httpHeaderAuth` |
| W32 | Twilio (SMC voice) | `httpBasicAuth` |
| W32 | WhatsApp Cloud API token (SMC ops) | `httpHeaderAuth` |
| W33 | Anthropic API (SMC) | `httpHeaderAuth` |
| W33 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W33 | n8n webhook secret (SMC) | `httpHeaderAuth` |
| W34 | LV Supabase - n8n_app (least privilege) | `postgres` |
| W34 | Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` |
| W34 | W34 DSR webhook token | `httpHeaderAuth` |
| W35 | LV Supabase - n8n_app (least privilege) | `postgres` |

## B. Distinct credentials (machine-checked: name, type, used by) and what backs each one
"Backed by" names the `.env` variable (or the source) that the value is copied from when the credential is created in the n8n UI. "No `.env` name" means a random value of at least 32 characters, generated once when the credential is created, stored in the password manager and listed by name in `ops.secret_inventory`, so W22 `token_expiring` covers its rotation. 31 credentials across 41 workflow files.

| Credential name | Type | Used by | n8n form | Backed by |
|---|---|---|---|---|
| Anthropic API | `httpHeaderAuth` | W30, W31 | Header `x-api-key` | `ANTHROPIC_API_KEY` (duplicate of the next two, see C1) |
| Anthropic API (SMC) | `httpHeaderAuth` | W32, W33 | Header `x-api-key` | `ANTHROPIC_API_KEY` (C1) |
| Anthropic API key (x-api-key) | `httpHeaderAuth` | W23 | Header `x-api-key` | `ANTHROPIC_API_KEY` (C1) |
| Console -> n8n shared secret | `httpHeaderAuth` | W25 | Webhook header auth on `POST /billing/pricing/publish` | No `.env` name. Same value configured in the console's server-side caller |
| Hostinger SFTP (static sites) | `sftp` | W25 | Host, port, user, password or key | Hostinger hPanel SFTP account for the static sites (password manager). No `.env` name |
| LV Supabase - n8n_app (least privilege) | `postgres` | SUB-ads-budget, SUB-ads-console, SUB-capi-send, SUB-visit-beacon, SUB-w20-ms-token, SUB-w26-runner, SUB-whatsapp-send, W01, W02, W03, W04, W05, W06, W07, W08, W09, W10, W11, W12, W13, W14, W15, W16, W17, W18, W19, W20, W21, W22, W23, W24, W25, W27, W28, W29, W30, W31, W32, W33, W34, W35 | Host, DB, port, user, password, SSL on | `SUPABASE_DB_URL` host/db/port. Login = `n8n_app_login` (LOCAL-STAGING.md §1b), password from the password manager |
| MS Graph app-only - howzit@ Mail.Send | `oAuth2Api` | W22 | OAuth2 client credentials, scope `https://graph.microsoft.com/.default` | `MS_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET` (C2) |
| Meta Page Token | `httpHeaderAuth` | W30, W31 | `Authorization: Bearer …` | `PAGE_ACCESS_TOKEN` |
| Meta system user token (Bearer) | `httpHeaderAuth` | SUB-capi-send, W20, W22 | `Authorization: Bearer …` | `META_SYSTEM_USER_TOKEN` (C1) |
| Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite) | `microsoftOutlookOAuth2Api` | W05, W10, W15 | Microsoft Outlook OAuth2, signed in as howzit@ | `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET`. Consent by howzit@ in the n8n UI (C2) |
| Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send) | `microsoftOutlookOAuth2Api` | W05, W14, W15, W17, W19, W34 | Microsoft Outlook OAuth2, signed in as howzit@ | `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET`. Consent by howzit@ (C2) |
| Microsoft Graph (howzit mailbox, app-only) | `oAuth2Api` | W20 | OAuth2 client credentials | `MS_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET` (C2) |
| Microsoft Graph (howzit@) | `microsoftOutlookOAuth2Api` | W32 | Microsoft Outlook OAuth2 | `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET` (C2) |
| Microsoft Graph broker-connect client secret (W20) | `httpCustomAuth` | SUB-w20-ms-token, W04 | Custom auth JSON adding `client_id` + `client_secret` to the token request body | `MS_GRAPH_CLIENT_ID`, `MS_CLIENT_SECRET` (broker refresh tokens stay in the Vault and never go in a credential) |
| MinIO intro media | `s3` | W23 | S3 endpoint, access key, secret | Supabase Storage S3 endpoint, bucket `broker-media`: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY` (C4, awaiting key pair) |
| NCC registry API | `httpHeaderAuth` | W24 | Header per the registry (placeholder) | Unknown until GATE-NCC. W24 runs in csv mode until then (`NCC_REGISTRY_MODE=csv`). Create a placeholder credential so W24 activates |
| Paystack secret key (Authorization: Bearer) | `httpHeaderAuth` | W16, W19, W25 | `Authorization: Bearer …` | `PAYSTACK_SECRET_KEY` (test key until KYC, 0.3 #5) |
| Supabase Storage (service role) | `httpHeaderAuth` | W23 | `Authorization: Bearer …` | `SUPABASE_SERVICE_ROLE_KEY` (**C3**) |
| Supabase service role (W16 magic link) | `httpHeaderAuth` | W16 | `Authorization: Bearer …` (+ `apikey`) | `SUPABASE_SERVICE_ROLE_KEY` (**C3**) |
| Supabase service role (n8n, W20) | `httpHeaderAuth` | W20 | `Authorization: Bearer …` (+ `apikey`) | `SUPABASE_SERVICE_ROLE_KEY` (**C3**) |
| Transcription API (bearer) | `httpHeaderAuth` | W23 | `Authorization: Bearer …` | `TRANSCRIBE_API_KEY` (endpoint `TRANSCRIBE_URL`: external OpenAI-compatible `/v1/audio/transcriptions`, empty = W23 media path off; no container, C4) |
| Twilio (SMC voice) | `httpBasicAuth` | W32 | Basic: API key SID / secret | `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` (duplicate of the next, C1) |
| Twilio API key (Basic) | `httpBasicAuth` | W01, W06, W15, W22 | Basic: API key SID / secret | `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` |
| W22 uptime monitor header token | `httpHeaderAuth` | W22 | Webhook header auth `X-LV-Monitor` on `POST /w22/uptime` | No `.env` name. Same value set in the uptime monitor (vps/UPTIME.md) |
| W34 DSR webhook token | `httpHeaderAuth` | W34 | Webhook header auth on `POST /w34/dsr` and `/w34/dsr-action` | No `.env` name. Held by the console's server-side caller |
| WhatsApp Cloud API (SortMyCover) | `httpHeaderAuth` | W14 | `Authorization: Bearer …` | `META_SYSTEM_USER_TOKEN` (C1; same name as the next row with another type) |
| WhatsApp Cloud API (SortMyCover) | `whatsAppApi` | W23 | n8n WhatsApp node: access token + business account id | `META_SYSTEM_USER_TOKEN`, `WABA_ID` (C1) |
| WhatsApp Cloud API (system user) | `httpHeaderAuth` | SUB-whatsapp-send, W03, W28 | `Authorization: Bearer …` | `META_SYSTEM_USER_TOKEN` (C1) |
| WhatsApp Cloud API token (SMC ops) | `httpHeaderAuth` | W32 | `Authorization: Bearer …` | `META_SYSTEM_USER_TOKEN` (C1) |
| WhatsApp Graph bearer (system user) | `httpHeaderAuth` | W23 | `Authorization: Bearer …` | `META_SYSTEM_USER_TOKEN` (C1) |
| n8n webhook secret (SMC) | `httpHeaderAuth` | W32, W33 | Webhook header auth on `smc-w32-event` / `smc-w32-decision`; W33 sends the same header | No `.env` name. One value on both sides |

Not credentials (by design, so not in the tables): every webhook signature secret (`META_APP_SECRET`, `PAYSTACK_SECRET_KEY` HMAC, `INTERNAL_HMAC_SECRET`, `LEAD_TOKEN_SECRET`, `W34_MEDIA_ERASE_SECRET`, `TWILIO_AUTH_TOKEN`, `ZOOM_WEBHOOK_SECRET`). Code nodes read these from `$env` through `require('lv-automation').verifyWebhooks` (SECURITY.md §2), because a static credential cannot sign or verify a per-request body.

## C. Findings for the owners (no workflow was edited here)
- **C1. One secret, many names.** The Meta system-user token is behind 6 credentials (5 names: `WhatsApp Cloud API (SortMyCover)` exists as two types), Anthropic behind 3, Twilio behind 2, and Microsoft howzit@ behind 5 (C2). It works, but each rotation has to update every copy, and a missed copy fails only the workflow that holds it. Proposal (automation-engineer + the generator owners, by regeneration): one name per secret: `Meta system user token (Bearer)`, `Anthropic API key (x-api-key)`, `Twilio API key (Basic)`. Until then, this table is the rotation checklist.
- **C2. howzit@ Microsoft access is split across delegated and app-only.** `microsoftOutlookOAuth2Api` (delegated, signed in as howzit@) is used by W05, W15, W17, W19, W32 and W34. App-only `oAuth2Api` is used by W20 and W22. 6.7 says `Mail.Read` and `Mail.Send` are scoped to that mailbox, and app-only needs an Exchange application access policy to stay scoped to howzit@. Decide one model (`needs_human`, devops-security + platform-architect).
- **C3. Supabase service-role key inside n8n.** Three Header Auth credentials hold `SUPABASE_SERVICE_ROLE_KEY`: W16 and W20 for magic links (Auth admin API), and W23 for signing Storage uploads. `provision.sh` step 5 strips that key from the VPS `.env`. Step 7 then restores n8n's credential table, so the key **reaches the VPS anyway**, encrypted with `N8N_ENCRYPTION_KEY`. That contradicts "the VPS never holds a service-role key" (W26.md step 4/13). Fix pattern already in the repo: an edge function holds the key and n8n calls it with an HMAC (as `w34-media-erase` does). `needs_human`: accept the risk for R0, or move magic links and upload signing behind edge functions before W26.
- **C4. Unbacked services. Resolved by decision (I-47i, 2026-10-03), awaiting key pair.** `MinIO intro media` (`s3`) and `Transcription API (bearer)` pointed at services in neither compose file. No container is added (0.1: no infrastructure spend before payment); the workflow is not edited and the credential name stays (pubcheck hashes it).
  - **Storage:** the `MinIO intro media` s3 credential is backed by Supabase Storage's S3-compatible endpoint: endpoint `https://<project-ref>.storage.supabase.co/storage/v1/s3`, region per project, **path-style on**, bucket `broker-media` (the bucket the repo already signs uploads to). `.env` names: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY` (placeholders in `.env.example`). **[Jonathan]** create the S3 access key pair in the Supabase dashboard (Storage, S3 connection, New access key), put both halves in `.env` and the password manager, then create the credential in n8n. Status: awaiting key pair; until then W23's two object-storage nodes cannot run.
  - **Transcription:** `TRANSCRIBE_URL` points at an external OpenAI-compatible `/v1/audio/transcriptions` endpoint chosen by env (no container); `TRANSCRIBE_API_KEY` is the bearer. Default empty = the W23 media path stays off. Create a placeholder `Transcription API (bearer)` credential so W23 activates. `check-credentials.mjs` warns (does not fail) while these are empty.
- **C5. `/webhook/w22-alert` had no server. Resolved (I-47g, 2026-10-03).** W30, W31 and W23 no longer POST alerts: each alert node is now `<name>: W22 signal` (Code, W22.md section 3 producer shape) followed by an Execute Workflow call to `smc-w22` by id (CONTRACTS.md "Sub-workflow interfaces"). The `W22 Internal Webhook` credential is gone; `OPS_ALERT_WEBHOOK` and `N8N_INTERNAL_URL` are no longer read by any workflow.
- **C6. Postgres nodes without a credential. Resolved (I-47e, 2026-10-03).** W21 `Stamp brands.insights_last_fetched_at` and `Cache ad status/budget (ad_objects)`, and W27 `Record alerts (ops.notifications.body)`, now carry the shared `LV Supabase - n8n_app (least privilege)` credential (rows W21 / W27 in table A and the `postgres` row in table B were already listed through their other Postgres nodes). The credential-inventory test that listed them as `todo` now passes.

**Publish note (I-52c / I-53h).** Credential names are part of the checksum (`local/pubcheck.mjs` hashes credential name + type, never ids or data). Publishing the Execute Workflow targets (W26 step 7, RUN-LOCAL 3a) activates them, and activation needs every credential they reference, so run `check-credentials.mjs` first (it already runs before the publish in step 7).
