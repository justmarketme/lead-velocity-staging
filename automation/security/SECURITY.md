# SECURITY.md: secrets, tokens, redaction, ASVS L1, and the NH-15 fix runbook

**Owner:** devops-security · **Applies to:** the local n8n (now), the Hostinger VPS (after W26), the Supabase CRM, and the portal/console.
**Sources (my five):** n8n self-hosting docs (env config, execution pruning), OWASP ASVS L1, Supabase RLS patterns, Meta/WhatsApp webhook security docs, Hostinger KVM + Traefik docs. No value of any secret appears in this file or anywhere in the repo.

## 1. Least-privilege token map

Every secret's *metadata* (never its value) is registered in `ops.secret_inventory` (DDL in `automation/W22.md` §4). W22 alerts at ≤ 30 d (amber) and ≤ 7 d (red) before `expires_at`.

| Token / secret (`.env` name) | Holder / what it can do | Scopes: grant exactly these | Stored in | Rotation |
|---|---|---|---|---|
| `META_SYSTEM_USER_TOKEN` | Meta Business system user (Admin is **not** needed; use an *Employee* system user assigned only to our assets) | `whatsapp_business_management`, `whatsapp_business_messaging`, `ads_management`, `ads_read`, `business_management`, `read_insights`, `leads_retrieval`, `pages_manage_ads`, `pages_read_engagement`, `pages_manage_metadata` (webhook subscribe), plus `pages_manage_engagement` / `instagram_manage_comments` for W30 only. Assign only the SortMyCover Page, IG, WABA, ad account(s) and dataset (6.2) | `.env` → n8n credential *Meta system user token (Bearer)* | Non-expiring (0.3 #11). Rotate on any suspected leak and **every 12 months**. W22 checks validity hourly (`token_invalid`) |
| `PAGE_ACCESS_TOKEN` | Page token derived from the system user (W30/W31 replies) | inherits; Page only | `.env` / n8n credential | regenerate with the system-user token |
| `META_APP_SECRET` | Verifies `X-Hub-Signature-256` on every Meta webhook and the Flow endpoint | — | `.env` only (Code nodes read via `$env`) | 12 months, or on leak. Turn on **"Require app secret"** in the app's advanced settings so every Graph call carries `appsecret_proof` |
| `META_WEBHOOK_VERIFY_TOKEN` | Handshake only | — | `.env` | on every webhook re-point (W26) |
| `FLOW_PRIVATE_KEY` (+ passphrase) | Decrypts Flow requests (W28) | — | `.env` only; never in n8n credentials export, never in chat | 12 months: new pair → re-register the public key via `/{PHONE_NUMBER_ID}/whatsapp_business_encryption` |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | One Entra app (6.7, 4.6) | Delegated: `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite`, `User.Read`, `offline_access` (broker sign-in). Application: `Mail.Read` + `Mail.Send` **restricted to howzit@ only** with an Exchange application access policy / RBAC for Applications. Without that restriction, app-only Mail.* covers every mailbox in the tenant | `.env` → n8n OAuth2 credentials | Client-secret lifetime **6 months** (`expires_at` in `ops.secret_inventory`); rotate at ≤ 30 d |
| Broker OAuth refresh tokens | Per broker, delegated calendar | as above | DB, encrypted at rest with `TOKEN_ENC_KEY` | On broker disconnect; W22 `calendar_token_failed` |
| `TOKEN_ENC_KEY` | Encrypts the refresh tokens | — | `.env` | 12 months (re-encrypt job) |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS | **Not used by n8n** (NH-09). Kept for admin migrations only, from Jonathan's machine | `.env` on the laptop only; **not copied to the VPS** | 12 months, or on leak |
| n8n DB role `n8n_app` (in `SUPABASE_DB_URL`) | n8n's access to the CRM | `GRANT` only on SortMyCover tables + `ops.*` as listed in W22.md §4; no `auth`, no `storage`, no DDL | `.env` → n8n Postgres credential | 6 months |
| `BACKUP_DB_URL` (`backup_reader`) | `pg_dump` only | read-only (`pg_read_all_data`, or `SELECT` on the dumped schemas) | VPS `/etc/lv/backup.env` (root, 0600) | 6 months |
| `SUPABASE_ANON_KEY` | Public by design | RLS is the control (§4) | page/portal build | on project re-key |
| `PAYSTACK_SECRET_KEY` | Charges, plans, and verifies webhook HMAC | Paystack has no scoped keys. Mitigate: webhook IP allowlist (Paystack docs) and re-fetch every transaction before marking paid | `.env` → n8n credential | 12 months, or on leak |
| `TWILIO_API_KEY_SID/SECRET` | Outbound Lookup, SMS fallback, W22 voice | Standard API key (not Main) | `.env` → *Twilio API key (Basic)* | 12 months |
| `TWILIO_AUTH_TOKEN` | **Only** verifies `X-Twilio-Signature` | — | `.env` | 12 months (Twilio secondary-token swap) |
| `ANTHROPIC_API_KEY` | LLM calls | workspace key with a spend limit | `.env` → n8n credential | 12 months |
| `TURNSTILE_SECRET_KEY` | W01 siteverify | — | `.env` | 12 months |
| `N8N_ENCRYPTION_KEY` | Encrypts every n8n credential at rest | — | `.env` **and** offline (password manager, Jonathan + KG). Without it, the credential backup is useless | Never rotated casually (it re-keys every credential). Rotate only on leak, via export/re-import |
| `N8N_API_KEY` | n8n public API (CI import/export) | n8n API key scopes if offered, else owner-level | `.env` | 6 months |
| `BACKUP_S3_ACCESS_KEY/SECRET` | Off-server backup bucket | **write-only to one bucket** (put-object; no delete, no list if the provider allows); a lifecycle rule handles expiry | VPS `/etc/lv/backup.env` | 12 months |
| `BACKUP_AGE_RECIPIENT` | Public key | public | `.env` | Its private key (`age-key.txt`) lives **only** offline (password manager + an encrypted USB with KG). Never on the VPS, never in chat |
| VPS SSH key (`VPS_SSH_KEY_PATH`) | Deploy user `lv` (sudo for docker only) | password login and root login off | operator laptop | 12 months, or on device loss |
| Hostinger hPanel, GoDaddy, Meta Business, M365 admin | Humans (Jonathan + KG) | **2FA on all** (2.1.3) | password manager | — |

## 2. `.env` policy and log redaction (0.3 #10)

**`.env` policy**
1. Values live **only** in the repo-root `.env` (git-ignored; `.gitignore` also blocks `.env.*`, `*.pem`, `*.key`, `credentials*`) and in n8n's encrypted credential store. `automation/.env.example` holds **names only**.
2. The pre-commit guard (`.githooks/pre-commit`, enabled by `git config core.hooksPath .githooks` / `npm install`) blocks secret files and common key patterns. CI should run the same patterns over the full diff (backlog).
3. Secrets never travel by chat, WhatsApp, email or a ticket. Laptop → VPS happens only via `scp` over SSH inside `provision.sh`, to `/opt/lead-velocity/.env` with owner root and mode 0600.
4. **Least privilege per container** (requested change to `automation/docker-compose.yml`, which is not mine to edit): today `env_file: ../.env` hands every secret to *both* containers. Target: `postgres` gets only `POSTGRES_*`, and `n8n` gets the rest. Until then the risk is contained (the postgres container is not exposed).
5. n8n reads config through `$env` in Code nodes (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, set explicitly because recent n8n versions default to blocking). Consequence: **anyone with editor access can read every secret.** So the editor is treated as a secret store: IP allowlist via Traefik (or an SSH tunnel only), owner account with **MFA**, and no shared logins.
6. `N8N_BASIC_AUTH_USER/PASSWORD` in `.env.example` **have no effect on n8n 1.x/2.x** (basic auth was removed in favour of user management). Do not rely on them. The real control is n8n user management + MFA + the network restriction in point 5.

**n8n execution data and logs** (n8n self-hosting docs: execution data pruning, logging)
| Setting | Value | Why |
|---|---|---|
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` | Successful runs (full lead payloads) are not stored at all |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` | Needed to debug. Pruned below |
| `EXECUTIONS_DATA_PRUNE` | `true` | |
| `EXECUTIONS_DATA_MAX_AGE` | `168` (7 days) | Error payloads containing PII live at most a week |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT` | `5000` | Hard cap |
| `N8N_LOG_LEVEL` | `warn` prod / `info` staging, **never `debug` with live data** | Debug logs echo request bodies |
| `N8N_DIAGNOSTICS_ENABLED` | `false` | No telemetry from a box holding consumer data |
| Per workflow | Settings → *Save successful production executions: off*; *Save manual executions: off* in production | Belt and braces |

**Redaction rules** (implemented in `automation/security/redact.js`, tested):
- Phone numbers (SA and E.164, any spacing) are masked to the last 3 digits (`+********567`). Emails become `l***@g***.com`. 13-digit SA ID numbers become `[id-redacted]`.
- Keys `authorization`, `cookie`, `*signature*`, `token`, `secret`, `password`, `api_key`, `private_key`, `access_token`, `refresh_token` are replaced by `[secret]`.
- Applied to: every alert (W22 Policy node), every `audit_log.diff` (platform-architect), every `security_events` row (stores reason + IP, never the payload), and any Code node that logs or forwards a payload outside the lead's own record. Lead rows keep the real number; that is the record, not a log.
- Health details volunteered in chat are redacted from stored transcripts by the guardrail (2.1.7). Logs follow the same rule.

## 3. The PII / secret-in-chat rule (0.3 #10): leak = halt + rotate

A "leak" is any secret value, or any real lead's number/email/ID/health detail, appearing in a git commit, an agent chat or transcript, an n8n execution kept beyond policy, a WhatsApp/email to the wrong person, a screenshot, or a log.
1. **Halt.** Stop the affected workflow(s) (n8n: deactivate). If a Meta/Paystack/Twilio secret is involved, stop sending. Post one line to Jonathan/KG naming *what kind* of thing leaked and *where*, never the value.
2. **Rotate.** Every exposed secret is rotated *before* clean-up. Order: the provider console issues a new value → `.env` → n8n credential → re-run the affected webhook handshakes (`META_WEBHOOK_VERIFY_TOKEN`) → update `ops.secret_inventory.rotated_at`.
3. **Contain.** For git: rotation is what makes the secret safe. History rewriting (`git filter-repo`) is optional and done only with Jonathan's yes, because it rewrites shared history. For chat transcripts: delete where the platform allows, and record that it was deleted.
4. **Assess POPIA.** If real personal information reached someone not entitled to it, this is a **security compromise under POPIA s22**. Hand it to compliance-qa's breach runbook (6B.7 / W34): Information Regulator + affected people, as soon as reasonably possible.
5. **Record.** An `incidents` row: when, what kind, where, the rotations done, and the fix that prevents a repeat.
Synthetic data only in tests and fixtures (`automation/tests/fixtures`): `+2700000000x` style numbers and `example.test` emails.

## 4. OWASP ASVS L1 checklist: portal (broker) and console (admin)

Stack: React SPA (static on Vercel/Hostinger, NH-12) + Supabase Auth + Postgres RLS + edge functions + n8n webhooks. "Enforced in the database, not the UI" (Supabase RLS patterns).

| ASVS area | Control (L1) | How we meet it | Status / owner |
|---|---|---|---|
| V2 Authentication | No default or hard-coded credentials | NH-15: passwords in `reset-admin.js` / `test-login.js` are rotated and the files untracked (§5) | **open**, NH-15 |
| V2 | Brokers log in with magic links (no passwords to steal); admins use password + **MFA (TOTP)** | Supabase Auth magic link for brokers; Supabase MFA enforced for the `admin` role (check `aal2` in RLS for admin-only tables) | platform-architect |
| V2 | Rate-limit / anti-automation on login and magic-link requests | Supabase Auth rate limits on; Turnstile on the portal login form | platform-architect |
| V2 | Security questions are not an authenticator | Retire `broker_security_questions` / `profiles.security_answer_*` (plain text, S7); until then hash them | **open**, NH-15 S7 |
| V2 | Credential recovery does not reveal whether an account exists | Magic-link response is identical for known and unknown emails | platform-architect |
| V3 Sessions | Tokens not in URLs; logout invalidates the session | Supabase session in storage, `signOut({ scope: 'global' })` on logout; magic links are single-use and expire ≤ 1 h | platform-architect |
| V3 | Idle/absolute timeout | Console: JWT expiry 1 h with refresh, absolute 12 h; portal 7 days | platform-architect |
| V3 | Cookies (if any) `Secure`, `HttpOnly`, `SameSite=Lax` | n8n editor cookie `N8N_SECURE_COOKIE=true` (default) behind Traefik TLS | devops-security |
| V4 Access control | Least privilege; deny by default; **broker sees only his rows** | RLS on every SortMyCover table: `has_role(auth.uid(),'admin')` OR `broker_id = (select id from brokers where user_id = auth.uid())`. No `USING (true)`. No policy `TO anon` on PII tables. Fix S1/S2 (§5) | **open**, NH-15 |
| V4 | Server-side enforcement for every privileged function | Edge functions verify the JWT and role. `verify_jwt=false` is only allowed for provider webhooks that verify a signature instead (S4) | **open**, NH-15 |
| V4 | Directory/file access | Storage buckets private; signed URLs ≤ 1 h; RLS on `storage.objects` (S3) | **open**, NH-15 |
| V5 Validation | Input validated server-side against a schema (types, enums, lengths) | n8n Code node schema check on `/lead`, `/slots`, `/book`; zod on the client is UX only; Postgres `CHECK` constraints on enums | automation-engineer + platform-architect |
| V5 | Output encoding / no XSS | React escapes by default; no `dangerouslySetInnerHTML` with user or LLM text (`react-markdown` without raw HTML); CSP header on the static hosts | platform-architect; CSP in `.htaccess` / `vercel.json` |
| V5 | Parameterised queries | n8n Postgres nodes use `$1…$n` query parameters only (W22 shows the pattern); never string-built SQL | all |
| V5 | Deserialisation and webhooks | Signature verified on raw bytes before parse (`verify-webhooks.js`) | devops-security (done, tested) |
| V7 Errors & logging | No stack traces or secrets in responses | Respond-to-Webhook returns generic 4xx/5xx bodies | all |
| V7 | Security events logged: auth failures, access-control failures, signature failures | `security_events` (source, reason, IP, at). Supabase Auth logs. `audit_log` on every write (crm-gap §A1) | platform-architect + devops-security |
| V7 | Logs contain no sensitive data | §2 redaction rules | devops-security |
| V8 Data protection | PII not cached by intermediaries; minimal retention | `Cache-Control: no-store` on portal/console API responses; retention per 2.1.7 (W34) | platform-architect, compliance-qa |
| V9 Communications | TLS everywhere, HSTS | Traefik ACME certs + HSTS middleware (`vps/traefik/`); Hostinger/Vercel TLS for static | devops-security |
| V10 Malicious code | No secrets in the client bundle | S5: the Gemini key leaves the browser (`VITE_GEMINI_API_KEY`) and moves behind `legal-ai-assistant` | **open**, NH-15 |
| V12 Files | Upload type/size limits (headshot, intro video) | Bucket-level MIME + size limits; W23 transcodes server-side | platform-architect |
| V13 API | Every API is authenticated or signature-verified; CORS restricted | n8n webhooks: provider signature or Turnstile + origin allowlist (pattern doc). Edge functions: CORS to our own origins only | devops-security + platform-architect |
| V14 Config | Security headers; no debug in production; dependencies patched | `X-Frame-Options: DENY` (already in `vercel.json`), `X-Content-Type-Options`, `Referrer-Policy`, HSTS; `npm audit` in CI; n8n image pinned and bumped deliberately | devops-security |

## 5. NH-15 fix runbook (pre-existing CRM defects, inventory §11)

platform-architect's `deliverables/platform-architect/security-runbook.md` was **not on disk** when this was written, so this is the runbook. It reproduces no secret value. **Gate:** NH-15 needs Jonathan's yes because steps 3–5 change live behaviour. Steps 1–2 are safe to do at once.

**1. Rotate the passwords in the tracked scripts (S6)**: Jonathan, on the laptop.
- Supabase dashboard → Authentication → Users → for every account whose password appears in `reset-admin.js` or `test-login.js`: set a new password (password manager, ≥ 16 chars) and turn on MFA. Also change it anywhere else it was reused.
- Do **not** open the scripts in chat or paste their contents anywhere. Treat the old values as public.

**2. Untrack the scripts (S6)**: then commit.
```bash
git rm --cached reset-admin.js test-login.js     # keeps the local files, stops tracking them (.gitignore already lists them)
git commit -m "security: untrack local admin scripts (NH-15 S6); passwords rotated"
```
The values stay in git history. Rotation (step 1) is what neutralises them. A history rewrite is optional and needs Jonathan's yes (§3.3).

**3. RLS fixes (S1, S2), as migration 1 (platform-architect writes it; devops-security reviews):**
- `broker_onboarding_responses`, `broker_analysis`: drop the `FOR ALL USING (true)` policies. Allow anon `INSERT` only (public onboarding form) **with** `WITH CHECK` on the shape, or go through the existing `submit_broker_onboarding` RPC as `SECURITY DEFINER`. `SELECT/UPDATE/DELETE` go to `admin` only.
- `appointments`, `broker_notes`: replace "Admins can manage all …" `USING (true)` with `TO authenticated USING (has_role(auth.uid(),'admin'))`. Fix the second `appointments` policy to compare `broker_id` with the broker row of `auth.uid()` (`brokers.user_id = auth.uid()`), not `auth.uid()` directly.
- Test: as anon, `select` on each table returns 0 rows / permission denied. As broker A, broker B's rows are invisible. Run these as SQL tests in CI.

**4. Bucket privacy (S3).**
```sql
update storage.buckets set public = false where id = 'admin-documents';
drop policy if exists "Public Access" on storage.objects;
-- then: admin read/write; broker read only objects whose path starts with his broker id; signed URLs (≤ 1 h) for sharing
```
Check that the CRM's document screens use `createSignedUrl` and not public URLs before flipping (otherwise links break; that is the "changes live behaviour" part).

**5. Function auth (S4) and the browser key (S5).**
- For each `verify_jwt = false` function in `supabase/config.toml`: if a **provider** calls it (Twilio: `handle-inbound-call`, recording/transcription callbacks), keep `verify_jwt=false` and add the Twilio signature check (port `verifyTwilioSignature` to Deno: same algorithm, Web Crypto HMAC-SHA1). If **our app** calls it (`book-appointment`, `marketing-ai`, `send-scheduled-report`, `send-sla-alert`, `send-message-notification`, `ayanda-tools-bridge`), set `verify_jwt=true` and check the caller's role. `ayanda-tools-bridge` is called by the voice platform: give it a shared-secret header compared timing-safe, the secret in Supabase function secrets.
- S5: remove `VITE_GEMINI_API_KEY` from the client. `src/utils/legalAI.ts` calls the existing `legal-ai-assistant` edge function instead. **Rotate the Gemini key** (it has been in public bundles).
- S7: hash or drop the security answers (magic links replace them).

**6. Verify and record.** Re-run the anon/broker RLS tests, `curl` each function without a JWT (expect 401), fetch a former public bucket URL (expect 400/403), grep the built `dist/` for `AIza` (expect nothing). Log it in `incidents` as "pre-existing exposure closed". compliance-qa decides whether S1/S3 count as a POPIA s22 compromise (the data was readable by anyone holding the public anon key).

**Done = ** NH-15 green → consumer data may land in this database (crm-gap §D.1).
