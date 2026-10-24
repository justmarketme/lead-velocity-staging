# Deploy runbook: SortMyCover release 24 Oct 2026 (CTWA consent funnel + owner WhatsApp alerts)

Branch **`release/smc-2026-10-24`** = live routing-split tip `9b201bd` + two reviewed branches, merged in this order:

1. `feat/smc-ctwa-consent-funnel` @ `52c38f9` (merge `8702af9`): one-tap consent from the CTWA ad welcome message (W03),
   consent-stall re-asks at 2 h / 20 h (W03), 30-minute "where you left off" nudge (W08). Source runbook:
   `DEPLOY-CTWA-FUNNEL.md` (repo root), Meta guide `automation/meta/CTWA-WELCOME.md`.
2. `feat/smc-owner-whatsapp-alerts` @ `bf78c5e` (merge `31f3701`): every owner notification is one WhatsApp to Jono from
   the SortMyCover number (W38 sender-first + escalations / activities sweep, W22 amber on WhatsApp, W07 / W10 owner paths,
   `automation/lib/owner-alert.mjs`, new template `ops_update`). Source runbook: `docs/DEPLOY-OWNER-ALERTS.md`, audit
   `docs/OWNER-ALERTS-AUDIT.md`.

This file replaces the deploy steps of both source runbooks (one ship, one import, one proof). Their behaviour notes stay
the reference. **Nothing here has been run.** Every step marked **[Jono]** is a production change and needs his go;
read-only checks are not gated.

**Two corrections to the source runbooks, applied below:**
- `docs/DEPLOY-OWNER-ALERTS.md` steps 3 and 6 run `git fetch` / `git checkout` inside `/opt/leadvelocity-n8n/repo`. That
  directory is a `git archive` extraction made by `deploy.sh` (no `.git`), so those commands fail. Code reaches the VPS
  only through `automation/emma-vps/deploy.sh <ref>` from the laptop; rollback is the same script with the old ref.
- `deploy.sh` already runs `./dc up -d --force-recreate n8n` when `repo/.env` exists, and it carries `repo/.env` across.
  Env edited **before** `deploy.sh` is therefore loaded by the deploy itself; a separate recreate is needed only when env
  changes **after** it (the `ops_update` SID in step 10, or a fix-up).

**Offline evidence (24 Oct, worktree `C:\tmp\lv-release-smc-2026-10-24`):** no textual conflicts (`automation/.env.example`
auto-merged; `index.cjs`, `CONTRACTS.md`, `W07.json` are touched by the owner-alerts branch only). After the merge every
`automation/build-*.mjs`, `patch-owner-alerts.mjs` and `templates/twilio/build-content.mjs` was re-run: `git diff` empty.
`node --test automation/tests/*.test.mjs`: 1070 tests, 1059 pass, 1 fail, 10 skipped (the fail is `W12.test.mjs` needing
`@electric-sql/pglite`, not installed in this worktree); with pglite available: 1070 tests, 1060 pass, 0 fail, 10 skipped
(the `.local` tests that need a local Postgres).

---

## What changes on the VPS

| Piece | Workflow id | From | Change |
|---|---|---|---|
| W03 Lead intake (CTWA) | `smc-w03` | CTWA | Ice-breaker consent on first contact (`ctwa-icebreaker-v1`); the consent question now schedules `stall_due_at` (2 h, 20 h); new trigger `Every 5 minutes (consent stall)` -> `Stalled consent threads (claim + advance)` -> `Consent re-ask (w03.consentReask)`; re-asks only in contact hours and inside the 24-h window; greeting drift -> W22 `ctwa_welcome_text_mismatch` |
| W08 Unbooked nurture | `smc-w08` | CTWA | Candidates query adds `page_last_at` / `last_nudge_at`; `start_nudge_30m` 30 min after the last `/start/` activity (logic in `lib/w08.mjs`, loaded at run time) |
| W38 SMC lead alert (owner) | `smc-w38` | Owner | Leads + bookings + console escalations + `lead_activities` (moved / cancelled / voice call-backs / W01 routing) -> ONE WhatsApp to the owner via `smc-whatsapp-send`; EMMA only when the sender answers `ok:false` |
| W22 Alerts | `smc-w22` | Owner | WhatsApp for every alert (red and amber) via the helper; email-only for synthetic signals, `whatsapp_send_failed` and failures of the sender workflow itself |
| W07 Conversation agent | `smc-w07` | Owner | "Alert ops" / "Pre-consent" build helper items (first name + phone last 3); never-silent -> WhatsApp first, EMMA fallback |
| W10 Reschedule / cancel | `smc-w10` | Owner | Rebook failed -> WhatsApp first, EMMA fallback |
| `lib/owner-alert.mjs`, `lib/w22.mjs`, `lib/w38.mjs`, `lib/w08.mjs`, `ctwa/w03.js`, `index.cjs` | - | both | Shipped by `deploy.sh`; Code nodes load them through `lv-automation` |
| Template `ops_update` (UTILITY) | - | Owner | Generated, **not submitted**; every owner path uses the approved `ops_alert` until its SID is in `TWILIO_CONTENT_SIDS` |
| Meta welcome message | - | CTWA | `automation/meta/ctwa-welcome-message.json` on NEW ad creatives (Jono) |

No migration, no DDL, no new tables or columns. `smc-whatsapp-send` (SUB) is unchanged.

**How the two branches meet (new in the combination, all intended):**
- A lead who taps the ad's "Yes, I agree" gets a `leads` row on that first tap, so W38's "1 new lead" WhatsApp arrives
  within a minute of the tap (status "not routed" until the Start here answers, then a "Routed: ..." line).
- W03's amber `ctwa_welcome_text_mismatch` now reaches Jono on WhatsApp as well as email (W22 amber), once per ad per 24 h.
  Under Twilio (live today) the greeting is not in the inbound webhook, so this cannot fire until a Cloud API switch.
- W03 consent re-asks (`communications` rows) and W08 nudges (`nurture_sent`) are not in W38's sweep: the funnel's own
  nudges never produce owner alerts.

---

## Helpers (Git Bash on the laptop, copy once)

```bash
# Read-only SQL against the n8n database on the VPS (SELECT only)
n8nq() { ssh -o BatchMode=yes emma-vps 'docker exec -i lv-n8n-postgres-1 sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -F \" | \""'; }
# Active n8n version of a workflow, and whether it contains a marker string from the new JSON
n8nmark() { n8nq <<SQL
SELECT w.id, w.active, w."activeVersionId", (h.nodes::text LIKE '%$2%') AS new_code
  FROM workflow_entity w JOIN workflow_history h ON h."versionId" = w."activeVersionId" WHERE w.id = '$1';
SQL
}
# Supabase SQL (project cmsylaupctrbsvzrgzwy); read checks can also go through the Supabase MCP execute_sql.
sbq() { npx supabase db query --linked --project-ref cmsylaupctrbsvzrgzwy "$1"; }
```

`ssh emma-vps` is key-only. Always pass `-n` or `-o BatchMode=yes`; a keyless attempt gets fail2ban-banned.

## Step 0. Local pre-flight (laptop, read-only)

```bash
git fetch origin
REF=$(git rev-parse --short origin/release/smc-2026-10-24); echo "$REF"
git diff --stat 31f3701 "$REF" -- automation data      # empty: the tip only adds this runbook (docs/ is not shipped)
git worktree add "C:/tmp/lv-deploy-$REF" "$REF" && cd "C:/tmp/lv-deploy-$REF"
for f in automation/build-*.mjs automation/patch-owner-alerts.mjs automation/templates/twilio/build-content.mjs; do node "$f" >/dev/null; done
git diff --exit-code && echo "generated files match"
node --test automation/tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
```

**Pass:** `generated files match`; `fail 0`, or `fail 1` where the only failure is `W12.test.mjs` with
`Cannot find package '@electric-sql/pglite'` (no `node_modules` in a fresh worktree).

## Step 1. Live state and snapshot (read-only except the backups)

```bash
# Env as the running container sees it (never print TWILIO_AUTH_TOKEN or the SIDs JSON itself)
ssh -n emma-vps 'for v in SMC_LEAD_ALERT_ENABLED DRY_RUN_SENDS WHATSAPP_PROVIDER TWILIO_WHATSAPP_FROM OPS_WHATSAPP_JONATHAN OPS_WHATSAPP_KG SMC_OWNER_WHATSAPP SMC_TEST_PHONES WHATSAPP_TEST_RECIPIENTS SMC_CTWA_ICEBREAKER_CONSENT SMC_CTWA_WELCOME_TEXT; do echo "$v=$(docker exec lv-n8n-n8n-1 printenv $v)"; done; docker exec lv-n8n-n8n-1 sh -c "printenv TWILIO_CONTENT_SIDS" | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const o=JSON.parse(s||\"{}\");console.log(\"ops_alert:\",!!o.ops_alert,\"ops_update:\",!!o.ops_update)})"'
# Backups: n8n database, current active versions of the six workflows, the .env
ssh -n emma-vps '/opt/leadvelocity-n8n/backup.sh && ls -t /opt/leadvelocity-n8n/backups | head -1'
n8nq <<'SQL' | tee "smc-2026-10-24-active-versions-$(date +%Y%m%d%H%M).txt"
SELECT id, active, "activeVersionId" FROM workflow_entity
 WHERE id IN ('smc-w03','smc-w07','smc-w08','smc-w10','smc-w22','smc-w38') ORDER BY id;
SQL
ssh -n emma-vps 'cp -p /opt/leadvelocity-n8n/repo/.env /root/env-backup-$(date +%Y%m%d%H%M%S)-smc-2026-10-24'
```

**Pass (24 Oct state):** `SMC_LEAD_ALERT_ENABLED=true`, `DRY_RUN_SENDS=false`, `WHATSAPP_PROVIDER=twilio`,
`TWILIO_WHATSAPP_FROM=whatsapp:+27600156480`, `OPS_WHATSAPP_JONATHAN=+27725548057`, `OPS_WHATSAPP_KG` set,
`WHATSAPP_TEST_RECIPIENTS` **empty** (an allow-list without Jono's number skips every owner send as `not_allow_listed`),
`SMC_CTWA_*` empty, `ops_alert: true`. The version file has 6 rows; note whether `smc-w03` is `active = t` (it may be
inactive as a sub-workflow; the import in step 4 activates it, see step 5).

## Step 2. Env additions **[Jono]**

Every key this release reads. Names and comments are in `automation/.env.example`.

| Key | Value | Needed for |
|---|---|---|
| `SMC_CTWA_ICEBREAKER_CONSENT` | `Yes, I agree` | F1 ice-breaker consent. Empty = off (consent question as before) |
| `SMC_CTWA_WELCOME_TEXT` | `Hi from SortMyCover. Your consent (POPIA): we may message you on WhatsApp to book your call and share your name and number with an authorised financial adviser, who will contact you. Lead Velocity (Pty) Ltd is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy` | F1: stored as the lead's `consent_text`; must equal `automation/meta/ctwa-welcome-message.json` `text_format.message.text` byte for byte (one line, no quotes) |
| `SMC_OWNER_WHATSAPP` | **leave unset** (falls back to `OPS_WHATSAPP_JONATHAN` = `+27725548057`, else the coded default `+27725548057`) | Owner number. "Zoe Experience" later = set this to the new number and recreate; no code change |
| `TWILIO_CONTENT_SIDS` key `ops_update` | **Jono supplies** the `HX...` SID after approval (step 10); absent until then | Owner template; `ops_alert` is used while absent |
| `OPS_WHATSAPP_KG` | unchanged (already set) | KG still gets `to: both` alerts (POPIA breach, sensitive chats, pre-consent hand-offs) |

Add the two `SMC_CTWA_*` lines (refuses to run twice; LF endings from Git Bash):

```bash
ssh -o BatchMode=yes emma-vps 'f=/opt/leadvelocity-n8n/repo/.env; if grep -q "^SMC_CTWA_" "$f"; then echo "SMC_CTWA_ already present: edit by hand"; exit 1; fi; [ -n "$(tail -c1 "$f")" ] && echo >> "$f"; cat >> "$f"' <<'EOF'
SMC_CTWA_ICEBREAKER_CONSENT=Yes, I agree
SMC_CTWA_WELCOME_TEXT=Hi from SortMyCover. Your consent (POPIA): we may message you on WhatsApp to book your call and share your name and number with an authorised financial adviser, who will contact you. Lead Velocity (Pty) Ltd is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy
EOF
ssh -n emma-vps "grep -c '^SMC_CTWA_' /opt/leadvelocity-n8n/repo/.env"     # prints 2
```

No separate recreate: step 3's `deploy.sh` recreates n8n with this `.env`. (If step 3 is postponed and the env must take
effect on its own: `ssh -n emma-vps 'cd /opt/leadvelocity-n8n && ./dc up -d --force-recreate n8n'`; harmless, the old W03
does not read these keys.)

## Step 3. Ship the code **[Jono]**

From the laptop, in the step-0 worktree (ships committed files of `$REF` only; no push needed, nothing is built on the VPS):

```bash
automation/emma-vps/deploy.sh "$REF"
```

`deploy.sh` replaces `/opt/leadvelocity-n8n/repo` (keeping `.env`), reinstalls `dc` / `backup.sh`, and runs
`./dc up -d --force-recreate n8n && ./dc up -d`: the new libs and the step-2 env are live from here.
**Run step 4 straight after:** until the import, the old W03 / W07 / W08 / W10 / W22 / W38 JSON runs against the new libs
(the functions they call keep their signatures; the window is about a minute).

Post-check (env inside the container, and the welcome text against the shipped JSON):

```bash
ssh -n emma-vps 'docker exec lv-n8n-n8n-1 printenv SMC_CTWA_ICEBREAKER_CONSENT'      # Yes, I agree
ssh -o BatchMode=yes emma-vps 'python3 -' <<'PY'
import json
env = dict(l.rstrip('\r\n').split('=', 1) for l in open('/opt/leadvelocity-n8n/repo/.env') if '=' in l and not l.startswith('#'))
m = json.load(open('/opt/leadvelocity-n8n/repo/automation/meta/ctwa-welcome-message.json'))['page_welcome_message']['text_format']['message']
print('welcome text matches:', env.get('SMC_CTWA_WELCOME_TEXT') == m['text'])
print('ice breaker matches:', env.get('SMC_CTWA_ICEBREAKER_CONSENT') == m['ice_breakers'][0]['title'])
PY
ssh -n emma-vps 'R=/opt/leadvelocity-n8n/repo/automation; grep -c consentReask $R/ctwa/w03.js; grep -c PAGE_NUDGE_AFTER $R/lib/w08.mjs; test -f $R/lib/owner-alert.mjs && echo owner-alert ok'
```

**Pass:** both `True`; three non-zero lines / `owner-alert ok`.

## Step 4. Import the six workflows **[Jono]**

```bash
ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03 W07 W08 W10 W22 W38'
```

`import_wf.sh` binds credentials by name, imports, **publishes** (activates) all six, then restarts n8n (a restart keeps
the env loaded in step 3). The six are independent of each other; `smc-whatsapp-send` is unchanged. W38's static data
(`watermark`, `seen`) survives the import: nothing is replayed.

**Pass:** six `bound ok` lines (no `UNBOUND`), six successful `publish:workflow` lines.

## Step 5. Post-import checks (read-only)

```bash
n8nmark smc-w03 'Stalled consent threads'   # active = t, new_code = t
n8nmark smc-w08 'page_last_at'              # active = t, new_code = t
for w in smc-w07 smc-w10 smc-w22 smc-w38; do n8nmark $w 'owner-alert'; done   # each active = t, new_code = t
curl -sI https://n8n.sortmycover.co.za/webhook/wa/test | head -1   # HTTP/2 302 (or 404 for an unknown ref), never 5xx
```

W03 must stay active: the consent-stall schedule lives inside it. If it was inactive before (step 1 note), activation may
be the first time its production webhooks serve live traffic (`GET /webhook/wa/:ref` tracked redirect, `GET
/webhook/whatsapp` Meta verify handshake); neither clashes with W07's `POST /webhook/whatsapp` (n8n keys webhooks by
method + path).

In the n8n UI within 5 minutes: W03 > Executions shows `Every 5 minutes (consent stall)` green with `Stalled consent
threads (claim + advance)` returning 0 items (old `await_consent` threads have `stall_due_at` NULL and are not re-asked
retroactively; see step 7). W38 keeps its 1-minute rhythm, green. W08 keeps its 5-minute rhythm.

## Step 6. Live proof A: owner WhatsApp + the consent clock **[Jono's go, one real send]**

From Jono's own phone (+27 72 554 8057, on `SMC_TEST_PHONES`: routes to the test practice, never to Mark, and really sends):

1. Type the opener to +27 60 015 6480 ("Check my life cover"). Typed, not from an ad, so W03 asks the consent question.
   **Before answering**, check the clock (F2):
   ```sql
   select stage, stall_due_at, last_inbound_at from public.wa_threads order by updated_at desc limit 1;
   -- stage await_consent, stall_due_at = last_inbound_at + 2 h (never NULL)
   ```
2. Answer "Yes". Within 60 s of the `leads` row Jono receives a WhatsApp **from +27 60 015 6480** (stopgap `ops_alert`
   copy): "Hi Jono, a SortMyCover system alert needs your attention. What happened: 1 new lead. Impact: Lead: Jono,
   WhatsApp ad, phone ends 057, not routed [test data]. The full details are in your email." Answer the Start here card;
   within 60 s of W01 routing: "What happened: 1 lead routed. Impact: Routed: Jono, phone ends 057, to SortMyCover test
   practice (TEST practice) [test data]."
3. Proof (read-only):
   - Twilio: `GET https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json?To=whatsapp:%2B27725548057&PageSize=3`
     -> new `SM...` from `whatsapp:+27600156480`, status `delivered` / `read`.
   - `n8nq <<< "select \"staticData\"::jsonb -> 'global' -> 'last' from workflow_entity where id = 'smc-w38';"` ->
     `channel: whatsapp`, `external_id: SM...`, `status: 200`, no `sender_error`.
   - EMMA: `ssh -n emma-vps 'journalctl -u emma --since "10 min ago" | grep -c /api/notify'` -> 0 for that tick.
4. Escalation path: reply "I want to speak to a person" -> W07 raises `human_handoff` and WhatsApps Jono itself (proves
   W07). To prove W38's sweep, mark a test booking's outcome as disputed in the portal (W12 `esc_kind=outcome_disputed`)
   and wait one tick: "Needs a person: outcome disputed, <first name>, phone ends ###, with ...".
5. Amber W22: nothing to provoke; the next amber in the log arrives on WhatsApp as "Alert: ... failed at ..." plus email.

**Fail:** no WhatsApp within 2 minutes -> read W38 `last` / `last_error` (`channel: emma` + `sender_error`
`twilio_content_sid_missing` = the SIDs JSON lost `ops_alert`; `not_allow_listed` = `WHATSAPP_TEST_RECIPIENTS` is set),
the `smc-whatsapp-send` execution for correlation `owner:W38:tick:...`, and step 1's env list.

## Step 7. Optional backfill **[Jono's call]**

Gives open `await_consent` threads from before the import a re-ask clock (expect 0-1 rows). One statement on Supabase:

```sql
update public.wa_threads set stall_due_at = last_inbound_at + interval '2 hours', updated_at = now()
 where stage = 'await_consent' and stall_due_at is null and last_inbound_at > now() - interval '22 hours';
```

Skip it and nothing is lost: those threads expire as they would have before.

## Step 8. Meta welcome message on the ads **[Jono]**

Only after steps 2-5 (until then a tap on the button simply gets the consent question: no harm, no double consent).
Follow `automation/meta/CTWA-WELCOME.md`: `page_welcome_message` is a creative field, so create NEW creatives (API, or
Ads Manager > Message template: Greeting = `SMC_CTWA_WELCOME_TEXT` exactly, Customer actions = Frequently asked
questions with ONE question `Yes, I agree`, nothing else), using the field JSON from
`automation/meta/ctwa-welcome-message.json`. Create as PAUSED, preview on a phone (full wording visible above the one
button), activate, then pause the old ads. Spend and ad status stay Jono's.

## Step 9. Live proof B: one-tap consent from a new ad **[Jono's go]**

From a tester phone on `SMC_TEST_PHONES` that has **no existing W03 thread** (the ice breaker counts only as a first
contact; a number with a thread gets the normal flow), open a new ad and tap "Yes, I agree":

- The Start here card arrives at once; no consent question.
- `select id, consent_at, consent_source, consent_text_version, provenance->>'welcome_text_from' from public.leads order by created_at desc limit 1;`
  -> `consent_text_version = ctwa-icebreaker-v1`, `consent_source = ctwa_ad`, `welcome_text_from = env` (Twilio).
- `select consent_version, opener_text, referral_source_type, ctwa_clid is not null from public.lead_optins order by received_at desc limit 1;`
  -> `ctwa-icebreaker-v1`, `Yes, I agree`, `ad`, `t`.
- Owner WhatsApp "1 new lead ... WhatsApp ad ... not routed [test data]" within 60 s of the tap.

## Step 10. Owner template `ops_update` **[Jono]**

On the laptop (needs `TWILIO_ACCOUNT_SID` + API key / auth token in the repo `.env` or the shell):

```bash
node automation/templates/twilio/submit-twilio.mjs --only ops_update            # dry run: prints the Content body, sends nothing
node automation/templates/twilio/submit-twilio.mjs --submit --only ops_update   # [Jono] creates the Content + approval request, prints the SID
```

Poll `GET https://content.twilio.com/v1/Content/<SID>/ApprovalRequests` until `status: approved`. Meta classed `ops_alert`
MARKETING despite the UTILITY submission; if `ops_update` is classed MARKETING it still delivers (rewording is the only
lever). The submission cannot be withdrawn; an unused approved Content costs nothing.

Then **[Jono]**: add `"ops_update": "HX..."` to the `TWILIO_CONTENT_SIDS` JSON in `/opt/leadvelocity-n8n/repo/.env`
(keep it valid JSON on one line), and because env changed after the deploy:

```bash
ssh -n emma-vps 'cd /opt/leadvelocity-n8n && ./dc up -d --force-recreate n8n'
```

Re-run step 1's env line (`ops_update: true`) and step 6.1-6.2: the owner message now reads "Hi Jono, SortMyCover update:
1 new lead. Details: Lead: ... Reply here if a person needs to step in." No re-import: the helper picks `ops_update` as
soon as the SID exists.

## Step 11. Verification (first 24 h, read-only)

```sql
-- F1: consents given by the ad button, each with its opt-in row
select id, first_name, consent_at, consent_source, consent_text_version, conv_state->>'state' as state
  from public.leads where consent_text_version = 'ctwa-icebreaker-v1' order by consent_at desc limit 20;
select o.lead_id, o.consent_version, o.opener_text, o.referral_source_type, o.ctwa_clid is not null as clid, o.channel
  from public.lead_optins o where o.consent_version = 'ctwa-icebreaker-v1' order by o.received_at desc limit 20;
-- F1: greeting drift (expect 0 rows)
select id, ad_id, consent_at, provenance->>'welcome_text_from' as shown_from from public.leads
 where consent_text_version = 'ctwa-icebreaker-v1' and (provenance->>'welcome_text_mismatch')::boolean order by consent_at desc;
-- F2: the consent question carries a clock (no_clock stays 0 for await_consent threads updated after the import)
select stage, count(*) filter (where stall_due_at is null) as no_clock, count(*) as total, max(updated_at)
  from public.wa_threads where updated_at > now() - interval '24 hours' group by 1;
-- F2: re-asks sent (reply key reask:<sid>:<n>), at most two per thread, nobody suppressed re-asked
select created_at, recipient_contact, status, metadata->>'reply_to' as reply_key, left(content, 50) as words
  from public.communications where workflow = 'W03' and metadata->>'reply_to' like 'reask:%' order by created_at desc limit 20;
select mobile_hash, stage, stall_due_at, state->'consent_reasks' as reasks from public.wa_threads
 where state ? 'consent_reasks' order by updated_at desc limit 20;
select count(*) from public.communications c join public.suppression s on s.mobile_hash = public.smc_hash_contact(c.recipient_contact)
 where c.workflow = 'W03' and c.metadata->>'reply_to' like 'reask:%' and c.created_at > s.created_at;   -- expect 0
-- F3: 30-minute nudges, and never both first nudges for one lead (expect 0 rows)
select a.lead_id, a.occurred_at, a.payload->>'touch' as touch, a.payload->>'channel' as channel, a.payload->>'template' as template
  from public.lead_activities a where a.activity_type = 'nurture_sent' and a.payload->>'touch' = 'start_nudge_30m' order by a.occurred_at desc limit 20;
select lead_id from public.lead_activities where activity_type = 'nurture_sent' and payload->>'touch' in ('start_nudge_2h','start_nudge_30m')
 group by lead_id having count(distinct payload->>'touch') > 1;
```

Owner alerts: every new SMC lead, booking, console escalation, moved / cancelled booking, voice call-back and W01 routing
produces a WhatsApp from +27 60 015 6480 within about a minute; W38 `last.channel` stays `whatsapp`; the W22 email log
keeps its 24-h dedupe. n8n: W03 `Every 5 minutes (consent stall)` runs green; a re-ask run shows `Reply claim` ->
`Live send? (W03)` -> `WhatsApp send (session)` -> `Store outbound (W03)`; a `start_nudge_30m` W08 run shows
`Claim touch` -> `Build message` -> `Send WhatsApp`.

---

## Rollback

- **Code + workflows (both features):** from the laptop, `automation/emma-vps/deploy.sh 9b201bd`, then
  `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03 W07 W08 W10 W22 W38'`
  (the live versions before this release; the 9b201bd W03 has no schedule trigger). Or restore the step-1 backup.
- **One feature only:** deploy and import a branch tip instead: `52c38f9` (CTWA only) or `bf78c5e` (owner alerts only),
  importing the same six ids.
- **Env:** remove the two `SMC_CTWA_*` lines (or restore `/root/env-backup-*-smc-2026-10-24`), then
  `ssh -n emma-vps 'cd /opt/leadvelocity-n8n && ./dc up -d --force-recreate n8n'`. An `ops_update` SID left in
  `TWILIO_CONTENT_SIDS` is harmless to the old workflows.
- **Ads:** pause the new creatives, reactivate the old ones (Jono). Ice-breaker consents already stored stay valid evidence.
- Inert leftovers: `state.consent_reasks` in `wa_threads.state`; W38 static data.

## What stays Jono-gated

Steps 2, 3, 4 (env, ship, import), 6 and 9 (real sends from tester phones), 7 (optional backfill), 8 (Meta creatives,
spend, pausing old ads), 10 (Twilio `--submit`, adding the SID, recreate). Policy call for Jono / compliance (not a code
defect): POPIA s69(2)(b) allows ONE approach to request consent; the two scheduled re-asks (2 h, 20 h) follow the person's
own inbound inside the same 24-h session. If compliance reads it as one approach in total, set `CONSENT_STALL_HOURS = [2]`
in `automation/ctwa/w03.js`, `node automation/build-w03-w28.mjs`, commit, deploy, re-import W03.

## Carried-over open items

- `ops_update` is not submitted; until it is, the stopgap copy says "The full details are in your email", true only for W22 alerts.
- W38 reports a booking when its row is created; a held booking later verified in place is not reported again.
- Plain W12 outcomes (attended / disposition without a dispute) are not alerted; `outcome_recorded` in `w38.ACTIVITY_TYPES` is the hook.
- A W34 data-subject request reaches the owner twice (W22 `dsar_received` + W38's `dsr` escalation sweep).
- Editing `data/za-public-holidays.json` means `node automation/build-w03-w28.mjs` + re-import W03 (dates are stamped into the W03 SQL).
- Change control for the consent wording: ad, `SMC_CTWA_WELCOME_TEXT` and `ctwa-welcome-message.json` change together,
  and `ICEBREAKER_CONSENT_VERSION` in `automation/ctwa/w03.js` is bumped.
