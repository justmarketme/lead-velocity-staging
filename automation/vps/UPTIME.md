# UPTIME.md: how we know the VPS is up (target 99.5%, about 3.6 h of downtime a month)

A dead VPS cannot report its own death. So uptime has **two layers**:

| Layer | What | Detects | Alerts via |
|---|---|---|---|
| **External monitor** (free tier) | HTTPS check every 5 min on `https://api.leadvelocity.co.za/healthz`, keyword/status 200. Also `https://app.leadvelocity.co.za/`, `https://sortmycover.co.za/`, `https://go.leadvelocity.co.za/` and SSL expiry on all four | VPS down, Traefik down, DNS broken, cert expired | The monitor's **own** e-mail to howzit@ + its mobile push to Jonathan and KG (works while the VPS is dead), **plus** a webhook to W22 (delivered whenever n8n is reachable; it records recoveries for the SLO) |
| **W22 hourly probe** | `api`, `app`, `portal`, `consumer` from inside n8n | partial outages (a static host down, a tunnel or Traefik route broken while n8n runs) | W22 (dedupe, DND rules, escalation) |
| **Dead-man heartbeat** (optional) | `pg_dump_nightly.sh` pings `OPS_PING_URL` after every good backup. Configure a heartbeat monitor that alerts if no ping arrives for 26 h | cron or backup silently stopped | the monitor |

**Which monitor:** an UptimeRobot-class free plan (5-min HTTP checks, keyword checks, SSL-expiry alerts, a webhook alert contact). *ASSUMPTION: the provider's free-tier limits are a time-sensitive fact. They are checked once when the account is created at W26 (4.0a pattern), not researched here. Cost R0.* Account under howzit@, 2FA on, Jonathan + KG as alert contacts.

**Health route.** n8n serves `GET /healthz` (process up). Traefik exposes only `/healthz*` and `/webhook/*` on `api.` (`traefik/docker-compose.traefik.yml`). Where the n8n version supports it, `/healthz/readiness` also checks n8n's database. Use it as a second monitor when present.

**Monitor → W22 webhook.** Alert contact type "webhook", `POST https://api.leadvelocity.co.za/webhook/w22/uptime`, header `X-LV-Monitor: <token from the 'W22 uptime monitor header token' credential>`, JSON body (map the provider's variables onto our contract):
```json
{"monitor":"*monitor name*","state":"down|up","since":"*alert datetime*","duration":"*alert duration*"}
```
W22 turns `down` on `api*` into an **always-send** red (it ignores DND, per the 6.8b "VPS down" exception), and turns `up` into an amber recovery record for the SLO.

**SLO accounting.** Monthly uptime = 1 − (sum of monitor-reported downtime on `api.` ÷ minutes in month). It is shown on the console's infra & cost tile. 99.5% means the error budget is ~216 min/month. More than half the budget burned → the pulse goes Amber; all of it → Red (6.8b "an SLO is burning").

**Runbook when `api.` is down**
1. `ssh` to the VPS. If SSH is dead too → Hostinger hPanel → VPS → restart. If the VPS is gone → restore drill (BACKUP.md §4, target ≤ 2 h).
2. `cd /opt/lead-velocity && docker compose -p lv ps`. Restart whatever is down: `docker compose --env-file .env -p lv -f automation/docker-compose.yml -f automation/vps/traefik/docker-compose.traefik.yml up -d`.
3. Disk full? `df -h`, then `docker system prune -f` (keeps volumes) and check `EXECUTIONS_DATA_PRUNE`.
4. Cert expired? `docker logs lv-traefik-1 | grep -i acme`. Check that port 80 is open (`ufw status`) and that DNS still points here.
5. While it is down, Meta retries webhooks for a period and Paystack retries too. Missed payments are caught by the W17/W18 inContact reconciliation (6B.10 drill).
