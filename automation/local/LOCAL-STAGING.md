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
   - `GENERIC_TIMEZONE=Africa/Johannesburg`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=168`, `N8N_LOG_LEVEL=info`, `N8N_DIAGNOSTICS_ENABLED=false`, `DRY_RUN_SENDS=true`.
3. First start: `docker compose -f automation/docker-compose.yml up -d`, open `http://localhost:5678`, create the **owner account** (strong password + **MFA on**: the tunnel makes the login page public). `N8N_BASIC_AUTH_*` does nothing on n8n 2.x (SECURITY.md §2).
4. Register the keeper: Task Scheduler → *LeadVelocity-n8n-Keeper* → `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\automation\local-tick.ps1`, triggers *At log on* + *every 10 minutes*.
5. Git hooks: `git config core.hooksPath .githooks` (secret guard).

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
`automation/vps/provision.sh --apply` runs **on this laptop**. It reads `.env`, streams this n8n's database to the VPS (step 7, same `N8N_ENCRYPTION_KEY`), then re-points the webhooks to `https://api.leadvelocity.co.za`. After step 13 and the rehearsal: **deactivate all workflows in the laptop n8n** and disable the keeper task, so no lead is processed twice.

## 5. Backups before W26
The local stack holds synthetic data only, so nothing needs a nightly backup yet. The one thing that must survive a dead laptop is **`N8N_ENCRYPTION_KEY` + `.env`**, kept in the password manager. If wanted, `automation/backup/pg_dump_nightly.sh` runs from WSL against Supabase unchanged (`BACKUP_ENV_FILE=./backup.env`).
