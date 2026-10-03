# Run n8n locally without Docker (sandbox / laptop without a Docker daemon)

Owner: devops-security. Purpose: pre-mortem #15. This proves that the committed workflow drafts import and shows how far the inbound WhatsApp path gets, without Docker.
The supported path is still `automation/docker-compose.yml` (n8n self-hosting docs). This file covers the no-daemon case only. Nothing here changes the repo's workflows, and the stack holds no real secrets.

Verified on 2026-10-03 with n8n **2.41.6** (the version pinned in the compose image).

## 0. Layout (all runtime data lives outside the repo)

`$S` = `<session scratchpad>/n8n-local` (in this sandbox: `/tmp/claude-0/-home-user-lead-velocity-staging/867258a7-c519-55e2-8241-146c4d72d0af/scratchpad/n8n-local`)

| Path | What |
|---|---|
| `$S/app/node_modules/n8n` | `npm install n8n@2.41.6` (about 2 GB) |
| `$S/node24/package/bin/node` | Node 24.21.0, from the npm package `node-linux-x64@24.21.0`. **n8n 2.41.6 refuses to run on Node 22** (`>=24.0.0`). |
| `$S/home/.n8n/database.sqlite` | n8n's own store (DB_TYPE=sqlite) |
| `$S/n8n.env` | Synthetic env: every `$env` name gets `synthetic-*`, and the local overrides come last |
| `$S/n8nenv.sh`, `start.sh`, `stop.sh` | CLI wrapper, start in the background, stop |
| `$S/shim.cjs` | Import-time shim. It writes scratch copies only (see section 3) |
| `$S/lastexec.cjs` | Prints the latest executions node by node from sqlite |
| `$S/send-wa.mjs` | Posts a synthetic WhatsApp webhook signed with HMAC (`META_APP_SECRET`) |
| `/tmp/pg54329/data` | Stub Postgres 16 cluster (port 54329, db `smc`) |

## 1. Postgres stub (port 54329, db `smc`)

```bash
# start (postgres refuses to run as root)
rm -f /tmp/pg54329/data/postmaster.pid      # only if a stale pid is left after a crash
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg54329/data -l /tmp/pg54329/pg.log \
  -o "-p 54329 -k /tmp/pg54329 -c listen_addresses=127.0.0.1" -w start
# rebuild: stub + legacy migrations, then SMC 01–13, then the synthetic seed (same as scratchpad/p3pa/full.sh)
bash <scratchpad>/p3pa/rebuild.sh
cd supabase/migrations && for f in 20261002_smc_[01][0-9]_*.sql; do psql -h 127.0.0.1 -p 54329 -U postgres -d smc -v ON_ERROR_STOP=1 -1 -f $f; done
(echo "SET smc.allow_synthetic='on';"; cat supabase/seed/smc_synthetic.sql) | psql -h 127.0.0.1 -p 54329 -U postgres -d smc -v ON_ERROR_STOP=1
psql -h 127.0.0.1 -p 54329 -U postgres -c "alter role n8n_app password 'synthetic-local-n8n-app'"   # local stub only
# stop
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg54329/data stop
```
Result on 2026-10-03: migrations 01–13 and the seed gave 0 errors (1 broker, 10 synthetic leads). This was never run against the live project.

## 2. n8n install and start

```bash
cd $S/app && npm install n8n@2.41.6 --no-audit --no-fund --cache $S/npm-cache
# if a previous install was killed: delete package dirs that have no package.json, plus node_modules/.package-lock.json, then run npm install again
cd $S/node24 && npm pack node-linux-x64@24.21.0 && tar xzf node-linux-x64-24.21.0.tgz
cd $S/app && PATH=$S/node24/package/bin:$PATH npm rebuild sqlite3   # the sqlite3 native binding must match Node 24
$S/n8nenv.sh import:credentials --input=$S/cred-pg.json             # "LV Supabase - n8n_app (least privilege)", id lv-pg-n8n-app
$S/start.sh            # background; pid -> $S/n8n.pid, log -> $S/logs/n8n.log, waits for /healthz
$S/stop.sh
```
`n8nenv.sh` sources `n8n.env` and sets `PATH=node24`, `N8N_USER_FOLDER=$S/home`, `NODE_OPTIONS=--max-old-space-size=1536` and `N8N_RUNNERS_MODE=internal`. Then it runs `node app/node_modules/n8n/bin/n8n "$@"`. `start.sh '*'` starts with `NODE_FUNCTION_ALLOW_EXTERNAL='*'`. That setting is for diagnosis only (see 4b).

### Env template (names only; values are synthetic)
- n8n runtime: `N8N_PORT=5678 N8N_HOST N8N_LISTEN_ADDRESS=127.0.0.1 N8N_PROTOCOL WEBHOOK_URL N8N_PUBLIC_URL N8N_USER_FOLDER N8N_ENCRYPTION_KEY DB_TYPE=sqlite N8N_RUNNERS_ENABLED=true NODE_FUNCTION_ALLOW_BUILTIN=crypto,dns,url,fs,path NODE_FUNCTION_ALLOW_EXTERNAL="" N8N_BLOCK_ENV_ACCESS_IN_NODE=false N8N_DIAGNOSTICS_ENABLED=false N8N_VERSION_NOTIFICATIONS_ENABLED=false N8N_TEMPLATES_ENABLED=false N8N_SECURE_COOKIE=false EXECUTIONS_DATA_SAVE_ON_SUCCESS=all EXECUTIONS_DATA_SAVE_ON_ERROR=all REPO_DIR AUTOMATION_DIR TZ GENERIC_TIMEZONE`
- **Loader (I-46d, since the run below):** the compose files now fix `NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation` and link the repo loader at start. To stay compose-faithful here, set the same value in `n8n.env` and link once: `ln -sfn <repo>/automation $S/app/node_modules/lv-automation` (the link must point into the repo, not at a copy, so `index.cjs` reaches `conversation/`, `landing/config/` and `data/`). Sections 4a/4b record the run before the loader, when the value was `""`.
- Fail-closed / no-egress: `DRY_RUN_SENDS=true TWILIO_LOOKUP_ENABLED=false EMAIL_PROBE_ENABLED=false PAYSTACK_ENABLED=false VOICE_FALLBACK_ENABLED=false TEST_HOOKS_ENABLED=false W24_TEST_MODE=true W25_TARGET=staging HTTP_PROXY=HTTPS_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost SUPABASE_URL=http://127.0.0.1:9 PORTAL_URL CONSOLE_URL -> 127.0.0.1:9`
- App DB: `DB_POSTGRESDB_HOST/PORT/DATABASE/USER/PASSWORD SUPABASE_DB_URL OPS_FEEDER_DB_URL` -> `n8n_app@127.0.0.1:54329/smc`. Note: in this setup the `DB_POSTGRESDB_*` names configure only the workflows' DB, because n8n's own store is sqlite. **Never set DB_TYPE=postgresdb with this env file.** If you do, n8n writes its own tables into `smc` as `n8n_app`.
- Every other `$env.*` name in `automation/.env.example` is set to `synthetic-<name>` (the full list is in `$S/n8n.env`).

## 3. Import (committed `automation/W*.json` from `git show HEAD:`; all inactive)

The raw committed files **do not import**: `SQLITE_CONSTRAINT: NOT NULL constraint failed: workflow_entity.id`. None of the 26 files has a top-level `id`. `shim.cjs` makes scratch copies and changes three things. (1) It sets `id = lvsmc<NN>00000000000`. (2) It wires each empty `executeWorkflow.workflowId.value` to that id, using the `Wnn` prefix of `cachedResultName`. (3) It binds Postgres credential refs that have no id to `lv-pg-n8n-app`. Each file is then imported in its own process (`n8nenv.sh import:workflow --input=<file>`).

| WF | Result | Notes (from shim / import) |
|---|---|---|
| W02 | ok | 2 empty sub-refs |
| W03 | ok | 4 empty sub-refs; needs cred "WhatsApp Cloud API (system user)" |
| W07 | ok | 14 empty sub-refs (W15, W03, W05, W09, W10, W12, W29, W35, W04_list, W08, W28, W09 pause, W32, W23) |
| W08 | ok | |
| W10 | ok | 11 empty sub-refs |
| W11 | ok | 1 empty sub-ref |
| W14 | ok | |
| W16 | ok | |
| W17 | ok | |
| W18 | ok | |
| W19 | ok | |
| W20 | ok | |
| W21 | ok | 1 empty sub-ref |
| W22 | ok | |
| **W23** | **fail** | `Workflow structure is invalid. nodes[86].name (duplicate_node_name): Duplicate node name "Verify broker JWT (upload)"; nodes[87] "JWT valid? (upload)"; nodes[88] "Respond 401 (upload)"` |
| W24 | ok | |
| W25 | ok | |
| W27 | ok | 1 empty sub-ref |
| W28 | ok | 5 empty sub-refs |
| W29 | ok | 1 empty sub-ref |
| W30–W35 | ok | |

25 of 26 imported (after the id shim). W01, W04, W05, W06, W09, W12, W13 and W15 are not committed, so they were not imported. Because of that, the W07 → W05/W09/W12/W15/W04 sub-calls have no target locally.

### 3a. Publish every sub-workflow target and checksum before any run (I-52c, I-53h)
n8n 2.x refuses to call an unpublished sub-workflow, and workflows were once published from an older version mid-run. Before every run, with n8n stopped: (1) re-import **every** repo workflow (`node automation/local/pubcheck.mjs --plan` prints the commands in order; use the `shim.cjs` copies for the id problem above), (2) `publish:workflow` every Execute Workflow target (`pubcheck.mjs --targets`), (3) start n8n, (4) export the published graph and compare:
```bash
# $S/pubexport.sh: sqlite3 "$S/home/.n8n/database.sqlite" -json "select w.id, h.nodes, h.connections from workflow_entity w join workflow_history h on h.versionId = w.activeVersionId" > $S/published.json   # ASSUMPTION: 2.41.6 schema
node automation/local/pubcheck.mjs --check $S/published.json      # exit 1 + one MISSING/DRIFT line per problem; --only-published checks just what is published
```
**Publishing a target starts its cron triggers** (W08, W09, W10, W12, W13, W20, W22, W29, W32, W35; `pubcheck.mjs --targets` prints the exact nodes). They are harmless only under the fail-closed env in section 2 (`DRY_RUN_SENDS=true`, all `*_ENABLED=false`, egress guard section 6). Never publish targets on a laptop that holds real credentials without that env. If a rehearsal needs a cron quiet, unpublish it after the run (`unpublish:workflow --id=<id>`) and accept that its callers then fail; or keep the crons by design and read them from the stub log. Offline proof: `node --test automation/tests/pubcheck.test.mjs`.

## 4. Smoke: inbound WhatsApp path

`publish:workflow --id=lvsmc07000000000` (W07) and `--id=lvsmc03000000000` (W03), then start. Run `node $S/send-wa.mjs text whatsapp`. This POSTs a signed synthetic text message from `27600000001` to `/webhook/whatsapp`. Then run `node $S/lastexec.cjs` to read the execution.

### 4a. W07 with the compose settings (`NODE_FUNCTION_ALLOW_EXTERNAL=""`). HTTP 500 `Error in workflow`
1. `WhatsApp webhook (POST)`: success, 1 item.
2. `Verify signature + normalise`: **error** `Module '/home/user/lead-velocity-staging/automation/security/verify-webhooks.js' is disallowed [line 3]`. n8n 2.41.6's task-runner `require` treats an absolute repo path as an external module, so the empty allowlist blocks it. The Docker stack has the same problem, because it uses the same three env values.
3. Nothing else runs. `Respond 200 / 401` never fires, so Meta would see a 500 and retry.

### 4b. W07 with `NODE_FUNCTION_ALLOW_EXTERNAL='*'` (diagnostic only). HTTP 500
1. Webhook: success.
2. `Verify signature + normalise`: the `require` now passes, then **error** `A dynamic import callback was not specified.` at `await import(pathToFileURL(REPO + '/automation/lib/w07.mjs'))`. The runner's vm sandbox has no `importModuleDynamically`, so **no Code node can `import()` an `.mjs` file**.
   Code nodes affected: W07 13 nodes with `import()` plus 1 with `require(path)`, W08 3, W10 12, W11 4, W20 10, W23 18, W29 6, W30 1+1, W31 1+2, W35 2, W02 0+2, W21 0+1, W27 0+2.
3. No node after this one runs, so this test reached no Postgres node, no LLM node and no send node.

### 4c. W03 (published, sub-called by W07)
- Before a credential named "WhatsApp Cloud API (system user)" exists, every W03 webhook fails the pre-execution check: `Node "WhatsApp send (session)" uses invalid credential`. One missing credential blocks the whole workflow, including the GET verify. A synthetic `httpHeaderAuth` credential `lv-wa-sysuser` was added locally.
- `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<META_WEBHOOK_VERIFY_TOKEN>&hub.challenge=12345` returns **200 with an empty body**. **This is a bug.** `Check hub.verify_token` outputs `{ok, reason, status, body:"12345"}`, but `Respond hub.challenge` uses `$json.challenge` (undefined), so Meta's subscription check would fail. A wrong token returns 403 `forbidden`, which is correct.
- The CTWA redirect is served at `/webhook/w03-ctwa-redirect/wa/:ref`, not `/webhook/wa/:ref` (that path returns 404), because n8n prefixes dynamic paths with the webhookId. The redirect now reaches `Build redirect`, which fails closed: `brand WhatsApp number not configured [line 18]`. The synthetic env has no digits-only brand number.
- Not exercised: the sub-call from W07 (blocked by 4a/4b) and W23 (not imported).

## 5. Running state / restart
- Postgres 16: port 54329 (127.0.0.1, socket `/tmp/pg54329`), postmaster pid in `/tmp/pg54329/data/postmaster.pid`.
- n8n 2.41.6: port 5678 (UI and webhooks), task broker on 5679, pid in `$S/n8n.pid`, runs with the compose-faithful `NODE_FUNCTION_ALLOW_EXTERNAL=""`. About 450 MB RSS.
- Restart: `$S/stop.sh && $S/start.sh`. After any `import:*` or `publish:workflow`, restart n8n, because the CLI warns that changes do not take effect while it is running.
- Start-up deprecation notices worth tracking: `N8N_RUNNERS_ENABLED` is no longer needed. `WEBHOOK_URL` is replaced by `N8N_WEBHOOK_URL`. Internal runner mode is deprecated in favour of the external launcher. "Running n8n outside a container is deprecated." That last notice is one more reason this route is for build verification only.

Note: workflows with `saveDataSuccessExecution: "none"` (W04, W05, CAPI Send, W22) leave a successful run as `status=running` with `deletedAt` set. This is n8n's soft delete, not a hang (REHEARSAL-L01 F7). Filter on `deletedAt IS NULL`.

## 6. Egress guard (zero egress for the local smoke, I-46a)

Why: on 2026-10-03 the "Intent-slot LLM" node reached api.anthropic.com (refused on the synthetic key) even with `HTTP(S)_PROXY=127.0.0.1:9`, because the sandbox's `NO_PROXY` lists api.anthropic.com and n8n then connects directly. n8n also calls api.n8n.io at start (MCP registry). The local smoke must never leave the box.

| Piece (all in `$S/egress/`, outside the repo) | What it does |
|---|---|
| `stub.mjs`, `stub.sh start|stop` | Local stub: HTTP `127.0.0.1:18080`, HTTPS `127.0.0.1:18443` (cert from a throwaway local CA `ca.pem`). Answers `/v1/messages` with canned intent-slot / reply / classifier JSON and Graph `/messages` with a fake wamid. Logs every request (host, path, kind) to `stub.log`. |
| `egress-guard.cjs` + `bin/node` | `bin/node` = node24 `--require egress-guard.cjs`, first on PATH, so the n8n main process **and** the task runner (spawned as `node`) load it. Every TCP connect that is not loopback on an allowlisted port (5678, 5679, 54329, 18080, 18443) is logged to `guard.log` and redirected to the stub (port 80 to :18080, anything else to :18443). Other loopback ports (e.g. a host proxy) are refused. `dns.lookup` of public names answers 127.0.0.1, `dns.resolve*` fail ENOTFOUND, except `resolveMx` for the synthetic domains in `MX_STUB_DOMAINS` (below). Nothing queries a resolver. |
| `env.egress` (sourced by `n8n2.sh` after `n8n.env`) | `ANTHROPIC_BASE_URL=http://127.0.0.1:18080`, every proxy variable empty, `NO_PROXY=*`, `NODE_EXTRA_CA_CERTS=egress/ca.pem`. |
| `MX_STUB_DOMAINS` (in `env.egress`; default `example.test,synthetic.test`) | Allow-list for the W05 email check: `resolveMx` (callback, promises and `Resolver` forms) of exactly these domains answers one synthetic record `{ exchange: 'mx.<domain>', priority: 10 }` without any network, logged as `dns.resolveMx ... answer: stub` in `guard.log`. Every other domain stays ENOTFOUND, so a real address still fails `email_no_mx` locally. Use a fixture address such as `lerato@example.test` to exercise the Teams/Zoom/Meet branch. Scratch guard only: the repo workflows always do a real MX lookup. |
| `sockwatch.cjs <log>` | Stands in for `ss -tnp` (iproute2 is not installed here). It samples `/proc/net/tcp{,6}` every 200 ms and logs any socket owned by a scratchpad process whose remote address is not loopback. |

Workflows: the Anthropic nodes in W07, W23, W30 and W31 now use `{{ ($env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") }}/v1/messages`. Production is unchanged when the variable is unset. Graph, Paystack, Microsoft and Twilio hosts are still hard-coded, so the guard redirects them at socket level.

Order: `egress/stub.sh start` → `nohup node egress/sockwatch.cjs egress/sock.log &` → `n8n2.sh start` → wait about 20 s until the webhooks are registered (the first POST after healthz returned 404) → `node send-wa2.mjs <from> text "<body>"` → read `stub.log`, `guard.log` and `sock.log`.

Positive control: an unguarded node SYN to 10.255.255.1:9 shows up in `sock.log`. The same call through `bin/node` is redirected to the stub.
