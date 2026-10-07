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
   - Execute Command (I-06): not an `.env` value. `automation/docker-compose.yml` sets `NODES_EXCLUDE='["n8n-nodes-base.localFileTrigger"]'` so W23's two ffmpeg/ffprobe nodes load (n8n 2.x excludes them by default); the VPS overlay repeats it. Security note: `automation/security/SECURITY.md` point 5a. The stock image has no ffmpeg; W23 media steps need it added before they run for real.
3. First start: `docker compose -f automation/docker-compose.yml up -d`, open `http://localhost:5678`, create the **owner account** (strong password + **MFA on**: the tunnel makes the login page public). `N8N_BASIC_AUTH_*` does nothing on n8n 2.x (SECURITY.md §2). Nothing to `npm install` for Code nodes: the n8n entrypoint links the repo's `lv-automation` loader on every start (§1a).
3a. Credentials: create **every** credential in `automation/local/CREDENTIALS.md` table B in the n8n UI (exact name + type; values from `.env` / the password manager), **before importing or activating workflows**. One missing credential blocks the whole workflow that references it, webhooks included. Placeholders are fine for services not live yet (NCC, MinIO, transcription). Check with the command at the top of CREDENTIALS.md (exit 0 = all present).
4. Register the keeper: Task Scheduler → *LeadVelocity-n8n-Keeper* → `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\automation\local-tick.ps1`, triggers *At log on* + *every 10 minutes*.
5. Git hooks: `git config core.hooksPath .githooks` (secret guard).

## 1a. Code-node runtime: repo mount and the one allowed module, `lv-automation` (I-31a, I-35b, I-36e, I-44a, I-46d)
Set in `automation/docker-compose.yml` (and repeated in the VPS overlay `vps/traefik/docker-compose.traefik.yml`), **not** in `.env`. Compose `environment:` wins over `env_file`, so a stale `.env` line cannot change them:

| Setting | Value | Why |
|---|---|---|
| volume | `..:/repo:ro` (repo root, read-only) | the loader and everything it reaches: `automation/`, `conversation/*.mjs` (w15, guardrail, logic, lines, pulse), `landing/config/consent.json` (w01), `data/za-public-holidays.json` (w04), plus `knowledge/`, `community/`, `billing/checkout/` reads |
| entrypoint link | `ln -sfn /repo/automation /home/node/.node_modules/lv-automation`, then `exec /docker-entrypoint.sh` (`init: true`) | `$HOME/.node_modules` is one of Node's global module folders and `HOME` reaches the task runner. The container user (`node`) cannot write `/usr/local/lib/node_modules`. The link sits in the container layer (not a volume), so it is re-made on every start |
| `NODE_FUNCTION_ALLOW_EXTERNAL` | `lv-automation` | n8n 2.41's runner allowlists by **exact** request name and has no dynamic `import()`. So the only form that works is `require('lv-automation').<name>` (`automation/index.cjs` lists the names). A subpath (`lv-automation/lib/w07.mjs`) or an absolute path is refused |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto,dns,url,fs,path` | `crypto` for HMAC/Flow, `dns` for MX checks, `fs`/`path` for corpus reads, `url` kept for older nodes |
| `REPO_DIR` / `AUTOMATION_DIR` | `/repo` / `/repo/automation` | the paths older nodes join onto for file reads; same mount |

**The link must point into the full repo mount, never at a copy of `automation/`.** Node resolves the link to its real path (`/repo/automation/index.cjs`), and `index.cjs` reaches `../conversation/*.mjs`, `../landing/config/*.json` and `../data/*.json` relative to that path. A copy of `automation/` alone would load, then fail at the first w01/w04/w15 call. On the VPS, `/repo` is `/opt/lead-velocity`, filled by `provision.sh` step 4 from git HEAD (its `SHIP_DIRS` include `landing/config` and `data` for this reason).

The mount adds no secret exposure. The same `.env` is already the container's environment (`env_file`), and Code nodes can read env (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). It is read-only, so a Code node cannot rewrite the code it runs. Allowing `lv-automation` adds no npm supply chain: it is this repo, at the committed revision.

**Check after `up -d`.** First, the link: `docker compose -f automation/docker-compose.yml exec n8n sh -c 'readlink /home/node/.node_modules/lv-automation'` must print `/repo/automation`. Then, in a Code node: `const L = require('lv-automation'); return [{ json: { ok: typeof L.guardrail === 'object' && typeof L.w01 === 'object' } }];`. Offline, `node --test automation/tests/loader.test.mjs` proves every exported name loads, every Code node uses the exact form, and both compose files carry the allowlist and the link. *ASSUMPTION: the n8n image starts through `/docker-entrypoint.sh`, as n8n's Dockerfile does. If `up -d` shows the n8n container restarting with "not found", run `docker image inspect` on the pinned image and put its entrypoint after `exec`.*

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
Browser calls to `API_HOST` (`/webhook/lead`, `/webhook/slots`, `/webhook/book`, `/webhook/billing-autorenew`) are answered by the Traefik `api-cors` headers middleware on the `n8n-cors` router (VPS overlay): origins `PUBLIC_ALLOWED_ORIGINS` or the production default `https://sortmycover.co.za, https://www.sortmycover.co.za, https://leadvelocity.co.za` (I-37i: production never allows the staging subdomain; staging adds `https://sortmycover.leadvelocity.co.za`, both values in `.env.example`); methods `GET, POST, OPTIONS`; headers `Content-Type, X-Lead-Token, Authorization`; no credentials; preflight cached 600 s. Traefik answers the preflight itself and overwrites any `Access-Control-Allow-Origin` that an n8n webhook node sets. **Locally there is no Traefik:** the tunnel reaches n8n directly, so on the laptop CORS comes from the webhook node's *Allowed Origins (CORS)* option (W19 sets it). For local browser tests of `/slots` and `/book`, set that option on those webhook nodes to the same origin list. *ASSUMPTION: n8n's own preflight reply echoes the requested headers; verify once with `curl -X OPTIONS -H 'Origin: …' -H 'Access-Control-Request-Headers: x-lead-token'`.*

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
| Credentials | Created **in the laptop n8n UI by Jonathan** from `.env` values; the workflows reference them by name + type, full list in `CREDENTIALS.md` (machine-checked) | values never leave the laptop except encrypted (n8n DB with `N8N_ENCRYPTION_KEY`; the age-encrypted backup) |
| Webhook signature secrets for tests | The offline tests generate random secrets per run (`verify-webhooks.test.js`). The online tests read `.env` on the machine that runs them | — |
| Logs when something fails | Jonathan shares `tick.log` lines or the n8n execution id. Executions keep **errors only**, pruned after 7 days, and alert payloads are redacted | no execution data with real numbers pasted into chat (0.3 #10) |

## 4. Hand-off to the VPS (W26)
`automation/vps/provision.sh --apply` runs **on this laptop**. It reads `.env`, streams this n8n's database to the VPS (step 7, same `N8N_ENCRYPTION_KEY`), then re-points the webhooks to `https://api.leadvelocity.co.za`. After step 14 (synthetic suite) and the rehearsal: **deactivate all workflows in the laptop n8n** and disable the keeper task, so no lead is processed twice.
- **Before you start:** run the credential check from `CREDENTIALS.md` against the laptop n8n. Step 7 runs the same check on the VPS between the restore and `n8n start`, and halts on any miss. Anything missing on the laptop will be missing on the VPS.
- **The loader travels as code, not as state.** The VPS gets `lv-automation` from the shipped repo (step 4) plus the same compose entrypoint link and allowlist (step 6, overlay repeats both). Nothing about it is in the n8n database. Commit before step 4: `git archive HEAD` ships only committed files.

## 5. Backups before W26
The local stack holds synthetic data only, so nothing needs a nightly backup yet. The one thing that must survive a dead laptop is **`N8N_ENCRYPTION_KEY` + `.env`**, kept in the password manager. If wanted, `automation/backup/pg_dump_nightly.sh` runs from WSL against Supabase unchanged (`BACKUP_ENV_FILE=./backup.env`).

## 6. Unattended checks (`Makefile`, S7-05; NH-06 default: Makefile on the n8n host, not GitHub Actions)
Run from the repo root on the laptop now and on the VPS after W26 (cron or the keeper task, e.g. nightly `make check || <W22 alert>`). Everything is offline except `lighthouse`; every target exits non-zero on any failure.

| Target | What it runs |
|---|---|
| `make help` (default) | lists the targets |
| `make test` | `node landing/build.mjs`, then `node --test automation/tests/*.test.mjs automation/billing/*.test.js optimisation/workflows.test.js` · `automation/media` (`media.test.js`, `w23-auth.test.js`) · `automation/tests/generators.test.mjs` · `scripts/*.test.mjs` (if any) · `landing/tests/quiz.spec.ts` (Playwright e2e) · `landing/tests/a11y.mjs` (axe-core WCAG 2.1 A + AA, fails on serious/critical) · `automation/templates/check.mjs` · `build/validate-tasks.mjs` |
| `make eval` | `node evals/run.mjs --dry-run`; fails unless it exits 0 **and** prints `PASS` |
| `make check` | `test` + `eval`: the CI gate; ends with `CHECK PASS` |
| `make a11y` | landing build + axe pass only (`node landing/tests/a11y.mjs --review` lists axe "needs review" items too) |
| `make lighthouse` | `landing/lighthouse.sh <slug>` for every angle in `landing/dist` (skips `assets`, `fonts`, `shared`); needs network once for `npx lighthouse` |
| `make readiness` | `node scripts/readiness.mjs` (Section 7 board); exits non-zero while go-live is blocked, so it is informational and not part of `check` |

Playwright and Chromium come from the host (`/opt/node-tools/node_modules/playwright`, `/opt/pw-browsers`; set `CHROMIUM_PATH` elsewhere); axe-core is a repo devDependency (`npm install`). Portal/console axe scan (report-only, synthetic signed-in broker against a mocked Supabase, nothing live is contacted): `VITE_SMC_ENABLED=true VITE_SUPABASE_URL=https://a11y-mock.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=x npm run build -- --outDir /tmp/portal-dist && node landing/tests/a11y.mjs --portal /tmp/portal-dist /broker/calendar /broker/billing /broker/reports /console`.

## 7. Sub-workflows that are referenced but not built yet (for automation-engineer; I-44b)
Four Execute Workflow targets already carry their final id in the callers, but no `automation/W*.json` exists for them. `automation/tests/workflow-ids.test.mjs` lists them as `NOT_YET_COMMITTED`. Until each one lands, its callers' sub-calls have no target at run time. Every caller uses `waitForSubWorkflow: false`, so a missing callee drops the side effect **silently**. Each callee below: top-level `id` exactly as named, an *Execute Workflow Trigger* that accepts all input fields, error workflow `smc-w22`, credentials by name from `CREDENTIALS.md`, and repo code only through `require('lv-automation').<name>` (§1a). When one lands, drop it from `NOT_YET_COMMITTED` (the test fails until you do) and add its credentials to `CREDENTIALS.md`.

### `smc-capi-send`: CAPI Send (owner: automation-engineer, with attribution-analyst for the event spec)
- **Called by:** W01 `CAPI Send (Lead)` (web lead), W03 `CAPI business-messaging Lead` (CTWA), W05 `-> CAPI Send (Schedule, no email)` (booking), W12 `CAPI Send (Attended)` (outcome). `CONTRACTS.md` also lists W29, but W29's JSON has no such call yet.
- **Input:** the `CAPI Send` row of `CONTRACTS.md`: `{ event_name: Lead|Schedule|Qualified|Attended|GoodFit, event_id, action_source: website|business_messaging|system_generated, lead_id, brand_id, ctwa_clid?, value?, event_time? }`. Ids only: callers never pass phone, name or email.
- **Must:** (1) Consent gate first. Load the lead as `n8n_app` and stop (log `capi_skipped_no_consent`) unless `leads.consent_ads_at IS NOT NULL` (`capi/event-spec.md` "Consent gate"). (2) Build user data from the row and hash it inside the callee. Email is never sent. (3) Route by `action_source`: `sendEvent` (website, `PIXEL_ID`), `sendBusinessMessagingLead` (CTWA, `DATASET_ID` + `ctwa_clid`), `sendOffline` (system_generated). (4) Dedupe on `event_id` (`evt_<lead_id>_<stage>` or the browser UUID). (5) Back off at 80% of the usage header; 3 tries, then a W22 alert. (6) `CAPI_TEST_EVENT_CODE` in staging only. Never log hashed or raw identifiers.
- **Gap:** `automation/capi/capi.js` is **not** in `automation/index.cjs` `MODULES` yet. Add `capi: './capi/capi.js'` (CJS, built-ins only) so the Code node can `require('lv-automation').capi`. The loader test then covers it.

### `smc-whatsapp-send`: shared broker/ops template sender (owner: automation-engineer)
- **Called by:** W19 `WhatsApp: broker_cycle_end (renewal offer)`, `WhatsApp + email: renewal reminder`, `WhatsApp + email: pay link (card failed / cycle ended)`, `WhatsApp + email: 'come back any time' (once, day 7)` and `WhatsApp: broker_autorenew_off`. Also W34 `WhatsApp: broker_dsr_erase`.
- **Input (W34/W19 contract):** `{ broker_id, to, template: { name, body: [..], buttons: [..] }, idempotency_key? }`. W19's reminder and pay-link items also carry `reminder.text` / `email` (subject + html) for the "+ email" leg. Confirm with billing-automation whether the sender or W19 sends the email.
- **Must:** (1) Idempotent on `idempotency_key` (one send per key, recorded before the Graph call). (2) Build with `require('lv-automation').wa.templateMessage` and refuse a parameter-count mismatch (`wa.paramCounts`) against `automation/templates/<name>.json`. (3) Staging: `DRY_RUN_SENDS=true` and the `WHATSAPP_TEST_RECIPIENTS` allow-list. A non-listed number is logged, not sent. (4) Send from `PHONE_NUMBER_ID` (test number in staging) with `Meta system user token (Bearer)`. (5) If the template is not approved yet (e.g. `broker_renewal_reminder`, NH-BA-08), send session text only inside the 24-h window, otherwise email via howzit@. (6) Log the message to the broker's communications without the body's personal fields. Non-2xx → W22. Broker messages only: consumer messages stay in W03.

### `smc-ads-budget`: ads budget module (owner: ads-api-engineer)
- **Called by:** W16 `Ads module: raise budget by media_share_zar` (payment on a `not_renewed`/`ended`/`paused` broker: the cycle resumes) and W19 `Ads module: lower budget by media_share_zar` (cycle end, not renewed; never on a card retry).
- **Input:** `{ action: "raise" | "lower", broker_id, media_share_zar }` (W16 reads `media_share_zar` from `pricing`, W19 from `cycles`).
- **"Lower" defined (I-49f, default taken 2026-10-03):** W19 sends `{ op: "lower", amount_zar: 0, media_share_zar }` at cycle end. `amount_zar 0` is the *target* for this broker's share and `media_share_zar` the amount removed, so the module reads it as **pause spend for this broker** (`target_zar 0`, `mode "pause"`, proposal "Pause the Meta spend for broker …, target R0 until a new cycle is paid"). A lower with its own `amount_zar > 0` is a plain reduction (`mode "reduce"`). Still proposal-only: nothing changes on Meta until Jonathan approves (confirm-to-apply).
- **Must:** map the broker to his campaign(s), compute the daily budget from `media_share_zar / 1.15 / 30` (share is VAT-inclusive, Meta bills ex-VAT; `VAT_RATE` in `lib/sub-ads-budget.mjs`) inside both caps, and write only through `require('lv-automation').metaAds.createClient(...).setCampaignBudget` (Meta minimum, ≤ 20% step, 48 h spacing, monthly cap). Never on first payment: first go-live is Jonathan's **Go live** tap only (W26.md).
- **Conflict (`needs_human`):** `meta-ads.js` refuses every write without a human `confirmToken` + `confirmedBy` (confirm-to-apply, 6.2). An unattended call from W16/W19 therefore cannot apply. Proposed: `raise` mints a confirm request (client `requestConfirm`) and sends Jonathan one `ops_gate` with the console Confirm link, and nothing is spent until he taps. `lower` either takes the same gate or gets a decrease-only system path in `meta-ads.js` (ads-api-engineer change). Money decision, so not guessed here.

### `smc-w26`: go-live runner, n8n side (owner: devops-security; spec `automation/vps/W26.md`)
- **Called by:** W16 `W26: go-live runner (first payment)`, on the `first` route (broker was `invited`/`prospect`/`onboarding`), after W20's welcome.
- **Input:** the W16 item for the paid invoice. Use `broker_id` only (from `Mark invoice paid + create cycle`).
- **Must:** (1) Once only: if a VPS already exists (`VPS_HOST` set, or the `GATE-VPS` gate already done), skip to readiness. Otherwise open `GATE-VPS` and send Jonathan **one** `ops_gate` WhatsApp (W26.md step 1: buy link, checkout notes, default "leads keep running on the laptop"), batched with other gates. (2) Serve `POST /webhook/w26/status`. Verify `X-LV-Signature` (HMAC of `"{X-LV-Timestamp}.{body}"` with `INTERNAL_HMAC_SECRET`, 5-min window) via `require('lv-automation').verifyWebhooks`. `ok:false` → W22 `workflow_failed` with the step name. `ok:true` + `name:"ready"` → `update brokers set status = 'ready_for_go_live' where id = $1 and status = 'onboarded'`, turn the Section 7 Platform line green, and send `ops_gate` "VPS live, all checks green". (3) Never call the Meta budget or status APIs and never unpause: going live is Jonathan's tap. Note: W16 calls W26 while the broker is still `onboarding`, so W26 must not require `onboarded` at trigger time. Only the `ready` update is conditional on it.

