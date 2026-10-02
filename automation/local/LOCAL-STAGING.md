# LOCAL-STAGING.md: n8n on Jonathan's laptop until the VPS exists (0.3 #7, 6.6)

**What exists already (the laptop session built it; do not duplicate it):**
- `automation/docker-compose.yml`: `postgres:16-alpine` + `n8n` (pinned `2.41.6`). n8n is bound to `127.0.0.1:5678` only. Both read the repo-root `.env`.
- `automation/local-tick.ps1`: the self-healing **keeper**, run by the Windows scheduled task **`LeadVelocity-n8n-Keeper`** at logon and every 10 min. Each tick: (1) restarts Docker Desktop if the engine is down (and clears the stale socket dirs that crash Docker Desktop 4.61), (2) `docker compose up -d`, (3) waits for n8n's local `/healthz`, then checks the **cloudflared quick tunnel** (`cloudflared tunnel --url http://localhost:5678`), (4) if the tunnel is dead or its `*.trycloudflare.com` URL changed, rewrites `N8N_PUBLIC_URL` / `WEBHOOK_URL` in `.env` and recreates n8n. State and logs are in `%LOCALAPPDATA%\lv-n8n\` (`tick.log`, `tunnel.log`, `url.txt`).
  The brief called this "n8n-keeper*". The file on disk is `local-tick.ps1`.

## 1. One-time setup on the laptop
1. Docker Desktop, `cloudflared` on PATH, Node 18+, Git.
2. `.env` at the repo root, with the names from `automation/.env.example`. The minimum for local n8n:
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and the same values in `DB_POSTGRESDB_*`.
   - `N8N_ENCRYPTION_KEY`: generate once (32+ random bytes) and **store it in the password manager now**. W26 needs the same key to decrypt the credentials on the VPS.
   - `GENERIC_TIMEZONE=Africa/Johannesburg`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=168`, `N8N_LOG_LEVEL=info`, `N8N_DIAGNOSTICS_ENABLED=false`, `DRY_RUN_SENDS=true`.
3. First start: `docker compose -f automation/docker-compose.yml up -d`, open `http://localhost:5678`, create the **owner account** (strong password + **MFA on**: the tunnel makes the login page public). `N8N_BASIC_AUTH_*` does nothing on n8n 2.x (SECURITY.md §2).
4. Register the keeper: Task Scheduler → *LeadVelocity-n8n-Keeper* → `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\automation\local-tick.ps1`, triggers *At log on* + *every 10 minutes*.
5. Git hooks: `git config core.hooksPath .githooks` (secret guard).

## 1a. Code-node runtime: repo mount and allowed modules (I-31a, I-35b, I-36e)
Set in `automation/docker-compose.yml` (and repeated in the VPS overlay `vps/traefik/docker-compose.traefik.yml`), **not** in `.env`. Compose `environment:` wins over `env_file`, so a stale `.env` line cannot narrow them:

| Setting | Value | Why |
|---|---|---|
| volume | `..:/repo:ro` (repo root, read-only) | Code nodes `import()` `conversation/guardrail.mjs`, `automation/lib/*.mjs`, read `knowledge/faq.md`, `community/*`, `billing/checkout/` |
| `REPO_DIR` | `/repo` | the path every workflow joins onto (`$env.REPO_DIR + '/automation/lib/w07.mjs'`) |
| `AUTOMATION_DIR` | `/repo/automation` | same mount; older workflows read this name |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto,dns,url,fs,path` | `url` for `pathToFileURL` in `import()`, `fs`/`path` for corpus reads, `crypto` for HMAC/Flow, `dns` for MX checks |
| `NODE_FUNCTION_ALLOW_EXTERNAL` | empty | no npm modules in Code nodes (supported n8n path, no custom image) |

The mount adds no secret exposure: the same `.env` is already the container's environment (`env_file`) and Code nodes can read env (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). It is read-only, so a Code node cannot rewrite the code it runs. On the VPS the mounted dir is `/opt/lead-velocity`, filled by `provision.sh` step 4 from git HEAD. Check after `up -d`: in a Code node, `return [{json:{ok: (await import(require('url').pathToFileURL($env.REPO_DIR + '/conversation/guardrail.mjs').href)) ? 1 : 0}}]`. *ASSUMPTION: n8n 2.41 task runners allow dynamic `import()` of a file URL; if the runner blocks it, I-31a's fallback applies (CJS shim or inline `classifierInput`, automation-engineer).*

## 1b. One Postgres credential for every SMC workflow (I-35h)
- **Name:** `LV Supabase - n8n_app (least privilege)`. Every SMC workflow (W02-W33, including the billing set W16-W19/W25) references this one name. Create it once in the n8n UI (Host/DB/Port from `SUPABASE_DB_URL`, user = the login below, SSL on).
- **Billing maps to the same login.** The billing workflows' `smc_vault_*` wrappers are `EXECUTE`-granted to `n8n_app` only (migration 08), so the billing credential must be this same credential/login, not a separate "billing role".
- **The login role:** `n8n_app` is created `NOLOGIN NOINHERIT` (migration 05). Use a separate login role that is a member of `n8n_app` **with INHERIT** (privileges apply without `SET ROLE`), or give `n8n_app` itself `LOGIN`. Runbook lines (Jonathan / platform-architect run them in the Supabase SQL editor at GATE time; **not applied by this repo**; password from the password manager, never in chat):
  ```sql
  -- option A (preferred): a login role that inherits n8n_app
  CREATE ROLE n8n_app_login LOGIN INHERIT PASSWORD :'n8n_app_login_password';
  GRANT n8n_app TO n8n_app_login;              -- PG16: add WITH INHERIT TRUE if the server default is changed
  -- option B: n8n_app logs in directly
  -- ALTER ROLE n8n_app LOGIN PASSWORD :'n8n_app_password';
  ```
  `NOINHERIT` on `n8n_app` itself only affects roles *it* belongs to; the member's own `INHERIT` is what makes `n8n_app`'s grants apply. Check: `SELECT has_function_privilege('n8n_app_login', 'public.smc_vault_paystack_auth_code(uuid)', 'EXECUTE');` must be `t`.
- **Status (I-37h, 2026-10-02):** every SMC export uses `LV Supabase - n8n_app (least privilege)` for every Postgres node (226 nodes across W02, W03, W07, W08, W10, W11, W14, W16-W22, W24, W25, W27-W33, W35). The three generators (`build-w03-w28.mjs`, `billing/build-workflows.mjs`, `optimisation/build-workflows.cjs`) emit the canonical name, so regenerating keeps it. `automation/W34.json` (compliance-qa) was renamed afterwards: all 16 Postgres nodes use the canonical name. (`automation/W23.json` was renamed afterwards; `patch-w23-auth.mjs` keeps the name.) Separate HTTP Header Auth credentials `Supabase service role (W16 magic link)` (W16) and `Supabase service role (n8n, W20)` (W20) are not Postgres credentials and were not renamed; they call the Supabase Auth admin API, which needs the server-side key. No `service role` **Postgres** credential is ever created in n8n.

## 1c. CORS on the API host (I-34c)
Browser calls to `API_HOST` (`/webhook/lead`, `/webhook/slots`, `/webhook/book`, `/webhook/billing-autorenew`) are answered by the Traefik `api-cors` headers middleware on the `n8n-cors` router (VPS overlay): origins `PUBLIC_ALLOWED_ORIGINS` or the production default `https://sortmycover.co.za, https://www.sortmycover.co.za, https://app.leadvelocity.co.za` (I-37i: production never allows the staging subdomain; staging adds `https://sortmycover.leadvelocity.co.za`, both values in `.env.example`); methods `GET, POST, OPTIONS`; headers `Content-Type, X-Lead-Token, Authorization`; no credentials; preflight cached 600 s. Traefik answers the preflight itself and overwrites any `Access-Control-Allow-Origin` that an n8n webhook node sets. **Locally there is no Traefik:** the tunnel reaches n8n directly, so on the laptop CORS comes from the webhook node's *Allowed Origins (CORS)* option (W19 sets it). For local browser tests of `/slots` and `/book`, set that option on those webhook nodes to the same origin list. *ASSUMPTION: n8n's own preflight reply echoes the requested headers; verify once with `curl -X OPTIONS -H 'Origin: …' -H 'Access-Control-Request-Headers: x-lead-token'`.*

## 1d. W34 media erase: `W34_MEDIA_ERASE_URL` and `W34_MEDIA_ERASE_SECRET` (I-38b, I-39j, I-40f)
W34 erases stored media twice: nightly (**Erase media files (storage)**, past-retention files) and on a DSR erase (**Erase subject media (storage)**, step 3). Both now call the edge function `supabase/functions/w34-media-erase`, which is the only holder of the Supabase server key. n8n never holds a Storage key.
- **URL:** `W34_MEDIA_ERASE_URL=<SUPABASE_URL>/functions/v1/w34-media-erase` (`POST`). Deployed by `provision.sh` step 13 (`--no-verify-jwt`, as `config.toml` sets `verify_jwt = false`): n8n authenticates by HMAC, not JWT. Before W26, deploy the same way by hand only after the human gate; nothing is deployed by this document.
- **Auth:** `W34_MEDIA_ERASE_SECRET` (`.env`, ≥ 32 random chars; the same value is set as the function's secret). Each request carries `X-LV-Timestamp: <unix s>` and `X-LV-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`. The window is ±300 s. Only `broker-media/<broker uuid>/…` paths are accepted, up to 50 per call, and each deletion is logged to `retention_log`. This is the same scheme as `/webhook/w26/status` (`verify-webhooks.js`).
- **Credential:** a static n8n Header Auth credential cannot sign a per-request body. The old "W34 media erase (storage service)" Header Auth (server key) is **retired**: delete it in n8n if it was created. The signature is computed in a Code node from `$env.W34_MEDIA_ERASE_SECRET`, and the HTTP Request node uses `authentication: none` and sends the two headers from the Code node's output. The name stays reserved in `ops.secret_inventory` as `W34_MEDIA_ERASE_SECRET` so W22 `token_expiring` covers its rotation.
- **What W34 must change (I-40f, compliance-qa):** in both media nodes, (a) build the body as `{"paths": ["broker-media/<uuid>/<file>", …], "policy": "retention" | "dsr", "dsr_id": <uuid|null>, "request_id": <run_id or "dsr-"+dsr_id>}`. Map each stored URL to its bucket path and chunk it to ≤ 50. (b) Serialise once and sign `timestamp + "." + body` in a Code node, with `X-LV-Timestamp` and `X-LV-Signature: sha256=…`. (c) Send that exact string as the raw body (`contentType: raw`, `application/json`). (d) Drop the `httpHeaderAuth` credential and use `authentication: none`. (e) Treat non-2xx as failure, as now: nightly → `w34_retention_failure`, DSR → stop before "completed".
- **Least privilege:** the server key lives only in the function's environment (injected by Supabase as `SUPABASE_SERVICE_ROLE_KEY`). A leaked `W34_MEDIA_ERASE_SECRET` can delete broker-media objects only, never read or touch tables.
- Pre-VPS: leave `W34_MEDIA_ERASE_URL` empty and `W34_DRY_RUN=true`; staging holds synthetic media only.

## 2. The tunnel and the `N8N_PUBLIC_URL` it writes
- **Today: a cloudflared quick tunnel.** Free, no account, no domain needed. Its URL **changes whenever the tunnel restarts** (6.6 "limits of free"). The keeper writes the new URL into `.env` (`N8N_PUBLIC_URL=https://<random>.trycloudflare.com`, `WEBHOOK_URL=<same>/`) and recreates n8n, so n8n always knows its own public URL.
- **What a URL change breaks:** anything *outside* that stored the old URL.
  - The Meta app webhook subscriptions (WABA / page / instagram).
  - The Flow `endpoint_uri`.
  - The Paystack **test-mode** webhook.
  - The landing page's `/lead` endpoint config.

  Re-point after each change (the keeper only rotates when the tunnel is actually dead, so this is rare):
  ```bash
  # from the repo root, with .env loaded (same calls as provision.sh step 11, aimed at the tunnel)
  set -a; . ./.env; set +a
  for o in "whatsapp_business_account wa messages,message_template_status_update,phone_number_quality_update,account_update" \
           "page meta-page leadgen,feed,messages"; do set -- $o
    curl -fsS -X POST "https://graph.facebook.com/${META_GRAPH_VERSION}/${META_APP_ID}/subscriptions" \
      --data-urlencode "access_token=${META_APP_ID}|${META_APP_SECRET}" --data-urlencode "object=$1" \
      --data-urlencode "callback_url=${N8N_PUBLIC_URL}/webhook/$2" --data-urlencode "verify_token=${META_WEBHOOK_VERIFY_TOKEN}" \
      --data-urlencode "fields=$3" -o /dev/null && echo "re-pointed $1"; done
  ```
  Paystack test webhook: dashboard → Settings → API Keys & Webhooks (Chrome agent).
- **Optional upgrade to a stable URL, still R0:** a Cloudflare *named* tunnel (`TUNNEL_TOKEN`) needs a hostname in a Cloudflare-managed zone. `leadvelocity.co.za` is on GoDaddy DNS, so that would mean moving nameservers, which is out of scope. ngrok's free static domain is the other option. *ASSUMPTION: ngrok free-tier terms are time-sensitive; check once if the URL churn becomes a problem.* Neither is needed for synthetic testing.
- **Exposure:** the quick tunnel publishes **the whole n8n**, editor included, at the random URL. Mitigations: owner login + MFA, synthetic data only (`DRY_RUN_SENDS=true`, `WHATSAPP_TEST_RECIPIENTS` allow-list), no live consumer data before W26. On the VPS the editor moves behind the Traefik IP allowlist and `api.` exposes only `/webhook/*` and `/healthz` (`vps/traefik/`).

## 3. What the cloud session needs from the laptop
The cloud (Claude Code on the web) session cannot reach `localhost`. It works through the tunnel and git:

| Need | How it gets it | Never |
|---|---|---|
| Current public URL | Jonathan pastes `url.txt` (`%LOCALAPPDATA%\lv-n8n\url.txt`) or `N8N_PUBLIC_URL` into the session. It is a URL, not a secret | — |
| Run the synthetic suite online | `N8N_PUBLIC_URL=<url> node --test 'automation/tests/*.test.mjs'`. The harness switches to online mode when `N8N_PUBLIC_URL` is set | — |
| Import/export workflow JSON | n8n public API through the tunnel with `X-N8N-API-KEY`. The key is set as an environment secret of the cloud session (or the laptop session does the import from `automation/W*.json`) | never pasted into chat; never committed |
| Credentials | Created **in the laptop n8n UI by Jonathan** from `.env` values; the workflows reference them by name (W22.md §5) | values never leave the laptop except encrypted (n8n DB with `N8N_ENCRYPTION_KEY`; the age-encrypted backup) |
| Webhook signature secrets for tests | The offline tests generate random secrets per run (`verify-webhooks.test.js`). The online tests read `.env` on the machine that runs them | — |
| Logs when something fails | Jonathan shares `tick.log` lines or the n8n execution id. Executions keep **errors only**, pruned after 7 days, and alert payloads are redacted | no execution data with real numbers pasted into chat (0.3 #10) |

## 4. Hand-off to the VPS (W26)
`automation/vps/provision.sh --apply` runs **on this laptop**. It reads `.env`, streams this n8n's database to the VPS (step 7, same `N8N_ENCRYPTION_KEY`), then re-points the webhooks to `https://api.leadvelocity.co.za`. After step 14 (synthetic suite) and the rehearsal: **deactivate all workflows in the laptop n8n** and disable the keeper task, so no lead is processed twice.

## 5. Backups before W26
The local stack holds synthetic data only, so nothing needs a nightly backup yet. The one thing that must survive a dead laptop is **`N8N_ENCRYPTION_KEY` + `.env`**, kept in the password manager. If wanted, `automation/backup/pg_dump_nightly.sh` runs from WSL against Supabase unchanged (`BACKUP_ENV_FILE=./backup.env`).
