# Deploy runbook: smoke-test fixes (21 Oct 2026)

Branch `fix/smc-smoke-2026-10-21` (worktree `C:\tmp\lv-smoke-fixes`), on top of live `release/v4-2026-10-20` @ `93d8c1a`.
Issue numbers (#n) are the "Confirmed issues" in `Desktop\EMMA\checklist\SMOKE-TEST-SMC-2026-10-21.md`. "review" means a
finding from the code review of this branch (21 Oct), fixed here with tests.

**Every step below is a production change and needs Jono's go.** Nothing here has been deployed, imported, applied or
pushed. The branch is not pushed. `deploy.sh` ships committed files from a local git ref, so no push is needed.

Offline evidence (21 Oct, this worktree): automation 1003/1003, media 35/35, generators 4/4, scripts 25/25, CRM and root
node tests 60/60, sites/sortmycover `npm run verify` 437/437, evals dry-run PASS, templates 66 checked with 0 errors,
tasks.json valid. Not run here: landing Playwright and axe (they need `/opt/node-tools/node_modules/playwright`, which
exists only on Linux CI), and the Supabase Deno tests (no `deno` on this laptop). This runbook touches no landing code.

---

## Helpers (copy into Git Bash once)

```bash
# Read-only SQL against the n8n database on the VPS (SELECT only)
n8nq() { ssh -o BatchMode=yes emma-vps 'docker exec -i lv-n8n-postgres-1 sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -F \" | \""'; }
# Active n8n version of a workflow, and whether it contains a marker string from the new JSON
n8nmark() { n8nq <<SQL
SELECT w.id, w.active, w."activeVersionId", (h.nodes::text LIKE '%$2%') AS new_code
  FROM workflow_entity w JOIN workflow_history h ON h."versionId" = w."activeVersionId" WHERE w.id = '$1';
SQL
}
# Supabase SQL (project cmsylaupctrbsvzrgzwy). Read checks can also go through the Supabase MCP execute_sql.
sbq() { npx supabase db query --linked --project-ref cmsylaupctrbsvzrgzwy "$1"; }
```

`ssh emma-vps` is key-only (alias). Always pass `-n` or `-o BatchMode=yes`; a keyless attempt gets fail2ban-banned.

---

## Step 0. Snapshot (before anything)

- **Fixes:** nothing. It makes every later rollback possible.
- **Needs Jono's go:** yes (writes a backup file on the VPS).
- **Command:**
  ```bash
  ssh -n emma-vps '/opt/leadvelocity-n8n/backup.sh && ls -t /opt/leadvelocity-n8n/backups | head -1'
  n8nq <<'SQL' | tee "smokefix-active-versions-$(date +%Y%m%d%H%M).txt"
  SELECT id, active, "activeVersionId" FROM workflow_entity
   WHERE id IN ('smc-whatsapp-send','smc-capi-send','smc-w01','smc-w03','smc-w04','smc-w05','smc-w06','smc-w07','smc-w08','smc-w10','smc-w12','smc-w28') ORDER BY id;
  SQL
  ssh -n emma-vps 'cp -p /opt/leadvelocity-n8n/repo/.env /root/env-backup-$(date +%Y%m%d%H%M%S)-smokefix'
  ```
- **Pre-check:** the smoke-test cleanup SQL in the report ("Test data to clean up") has been run, and no SMC client has a
  call in the next 30 minutes:
  `sbq "select count(*) from appointments where brand_id is not null and status in ('booked','confirmed') and appointment_date between now() and now() + interval '30 minutes';"` returns 0.
- **Post-check:** the backup file is listed, and the version file has 12 rows.
- **Rollback:** not applicable.

---

## Migrations (Supabase, project cmsylaupctrbsvzrgzwy)

Apply each one with the Supabase MCP `apply_migration` (name = the file name without `.sql`, query = the file's
contents), so it is recorded in `supabase_migrations.schema_migrations`. Without the MCP you can run
`npx supabase db query --linked --project-ref cmsylaupctrbsvzrgzwy -f <file>` (this does not record history).

Shared pre-check for steps 1 to 4: `sbq "select version from supabase_migrations.schema_migrations where version like '20261021%';"`.
The step's own version must not be listed.

### Step 1. Migration `20261021120000_lead_optins_voice_call.sql`
- **Fixes:** #45 (a WhatsApp yes given on a call with Lindi gets a `lead_optins` row, channel `voice_call`). It must go in
  **before step 18** (smc-voice), or that insert is refused by the CHECK and only logged.
- **Pre-check:** `sbq "select pg_get_constraintdef(oid) from pg_constraint where conname = 'lead_optins_channel_check';"` does not contain `voice_call`.
- **Post-check:** the same query now lists `voice_call` and the six existing channels.
- **Rollback:** `supabase/migrations/undo/20261021120000_lead_optins_voice_call.undo.sql`. Run it only while no `voice_call` row exists.

### Step 2. Migration `20261021150000_ad_consent_v3_audit_summary.sql`
- **Fixes:** #30 (the ad-consent audit summaries say "name and photo" only, matching consent v3).
- **Pre-check:** `sbq "select prosrc like '%practice name and FSP number%' from pg_proc where proname = 'broker_set_ad_likeness_consent';"` returns `t`.
- **Post-check:** the same query returns `f`, and `prosrc like '%name and photo%'` returns `t`.
- **Rollback:** re-run the function body of `supabase/migrations/20261018200000_ad_consent_name_photo_only.sql`. Existing audit rows are never rewritten.

### Step 3. Migration `20261021150100_compliance_evidence_admin_read.sql`
- **Fixes:** #20 (admins can open the FSCA evidence screenshots in the private `compliance-evidence` bucket).
- **Pre-check:** `sbq "select count(*) from pg_policies where schemaname = 'storage' and policyname = 'smc compliance-evidence admin read';"` returns 0.
- **Post-check:** it returns 1. In the CRM, as an admin, an "Evidence" link on Broker compliance checks opens. As a broker, it does not.
- **Rollback:** `DROP POLICY IF EXISTS "smc compliance-evidence admin read" ON storage.objects;`

### Step 4. Migration `20261021150200_unschedule_legacy_appointment_reminders.sql`
- **Fixes:** #43 (removes the legacy pg_cron job `send-daily-appointment-reminders`. It failed 156 times out of 156, and SMC reminders run in W09).
- **Pre-check:** `sbq "select jobid, schedule from cron.job where jobname = 'send-daily-appointment-reminders';"` returns one row.
- **Post-check:** the same query returns no rows. All other `cron.job` rows are unchanged (compare `select count(*) from cron.job` before and after; it should be one less).
- **Rollback:** re-run the `cron.schedule` block of `supabase/migrations/20260114094619_e9c12fbb-f443-407a-aedb-526deaafc656.sql`. It will fail again until `app.settings.*` exist.

---

## n8n (VPS `/opt/leadvelocity-n8n`)

**Order matters.** `deploy.sh` (step 6) ships the shared runtime libs that every Code node loads, and recreates n8n. The new
libs work with the old workflow JSON. The new JSON does **not** work with the old libs. So: step 5 (env), then step 6
(libs), then steps 7 to 16 straight away, in this order, in one quiet window (no SMC call in the next 30 minutes; ads may
stay on). `import_wf.sh` restarts n8n after each call. You may pass several workflows in one call, and they are published
in argument order.

Shared per-import rollback: re-publish the version recorded in step 0, then restart:
`ssh -n emma-vps 'cd /opt/leadvelocity-n8n && docker exec lv-n8n-n8n-1 n8n publish:workflow --id=<id> --versionId=<old activeVersionId> && ./dc restart n8n'`.
If several workflows must roll back, re-publish all of them first. Then, only if needed, ship the old libs with
`automation/emma-vps/deploy.sh 93d8c1a`.

### Step 5. Env: `SYNTHETIC_TEST_NUMBERS` (and, for an E2E window only, `CAPI_SYNTHETIC_TEST_EVENT_CODE`)
- **Fixes:** review of #16 and #17. South Africa has no reserved test mobile range (`0600` is an allocated cellular block,
  and the SMC number sits in it), so the `+27 60 000 xxxx` heuristic is gone. Only the **exact** numbers in
  `SYNTHETIC_TEST_NUMBERS` are dry-run by the sender, flagged `is_synthetic` by W03, and skipped by CAPI.
  `CAPI_SYNTHETIC_TEST_EVENT_CODE` turns only synthetic leads' events into Meta test events. Real leads stay production
  events. **Never set `CAPI_TEST_EVENT_CODE` while ads are live**, because it marks every event.
- **Must happen before step 6.** Once the new sender is live, a harness number that is not on the list gets a **real** WhatsApp.
- **Command** (edits the env file; takes effect when step 6 recreates n8n):
  ```bash
  ssh -n emma-vps 'cd /opt/leadvelocity-n8n/repo && grep -q "^SYNTHETIC_TEST_NUMBERS=" .env || printf "%s\n" "SYNTHETIC_TEST_NUMBERS=+27600000912,+27600000921,+27600000922,+27600000923,+27600000924,+27600000925,+27600000926,+27600000927,+27600000928,+27600000929,+27600000930,+27600000931,+27600000951,+27600000952" >> .env; grep -c "^SYNTHETIC_TEST_NUMBERS=" .env'
  ```
  For the E2E window only: add `CAPI_SYNTHETIC_TEST_EVENT_CODE=TEST…` (from Events Manager > dataset > Test events) the
  same way. Remove it afterwards.
- **Pre-check:** `ssh -n emma-vps 'grep -cE "^(SYNTHETIC_TEST_NUMBERS|CAPI_TEST_EVENT_CODE)=." /opt/leadvelocity-n8n/repo/.env'` returns 0. If `CAPI_TEST_EVENT_CODE` is set, stop and ask.
- **Post-check:** the grep above returns 1 (the list only). After step 6: `ssh -n emma-vps 'docker exec lv-n8n-n8n-1 printenv SYNTHETIC_TEST_NUMBERS | tr , "\n" | wc -l'` returns 14.
- **Rollback:** delete the line(s) from `repo/.env`, then `ssh -n emma-vps 'cd /opt/leadvelocity-n8n && ./dc up -d --force-recreate n8n'`.

### Step 6. Runtime libs: `automation/emma-vps/deploy.sh fix/smc-smoke-2026-10-21`
- **Fixes (lib only, live as soon as n8n restarts):**
  - #13 (W08 nudges, W01 lead sends and the W05 hold nudge follow the CPA contact hours; 4 Nov 2026 is in every holiday list; W09 reads one hours setting, which is unchanged)
  - #33 (START after STOP), #34 (empty inbound), #8 and #9 (adviser naming), #32 (FAQ-06 only with a booking), #24 (copy)
  - W07 cancel-wait routing (#12 and review)
  - review: W08 restarted nudges always land before W10's 96 h C1A decision
  - review: typed cancel reasons are stored redacted
- **Command** (Git Bash, from `C:\tmp\lv-smoke-fixes`): `automation/emma-vps/deploy.sh fix/smc-smoke-2026-10-21`
- **Pre-check:** `git -C /c/tmp/lv-smoke-fixes status --short` is clean (deploy.sh ships committed files only), and step 5 is done.
- **Post-check:** `ssh -n emma-vps 'grep -c takesTypedReason /opt/leadvelocity-n8n/repo/automation/lib/w07.mjs; docker ps --format "{{.Names}} {{.Status}}" | grep lv-n8n-n8n'` shows `1` and `Up`. `curl -s -o /dev/null -w "%{http_code}\n" https://n8n.sortmycover.co.za/healthz` returns 200.
- **Rollback:** `automation/emma-vps/deploy.sh 93d8c1a`. First re-publish any workflow already imported from steps 7 to 16 (see the shared rollback above).

### Step 7. Import `SUB-whatsapp-send` + `SUB-capi-send`
- **Fixes:** #16 (test numbers are dry-run whatever DRY_RUN_SENDS says; now the exact list). #6 (the sender accepts the per-item bypass expression). #17 (CAPI skips synthetic leads). Review: the CAPI E2E code never touches real leads.
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh SUB-whatsapp-send SUB-capi-send'`
- **Pre-check:** `n8nmark smc-whatsapp-send SYNTHETIC_TEST_NUMBERS` shows `new_code = f`.
- **Post-check:** `n8nmark smc-whatsapp-send SYNTHETIC_TEST_NUMBERS` and `n8nmark smc-capi-send CAPI_SYNTHETIC_TEST_EVENT_CODE` show `t | ... | t`. Live: `ssh -n emma-vps 'bash /root/wa-smoke.sh +27600000921 "hi"'` returns `HTTP 200`. Then `sbq "select status, external_id from communications where recipient_contact = '+27600000921' and direction = 'outbound' order by created_at desc limit 3;"` shows `sent` with `dry:` ids only (nothing sent to Twilio).
- **Rollback:** shared rollback for `smc-whatsapp-send` and `smc-capi-send`.

### Step 8. Import `W04` + `W05` + `W10` together (W05 before W10)
- **Fixes:**
  - #37 (one Microsoft token refresh per /book)
  - #3 (phone-to-Teams: W05 owns the change. A verified email is trusted, the join link comes from the PATCH answer, and the method is saved and the client told only after the Outlook change worked)
  - #11 (a /start/ move answers once the row moved; notices run in W10's second execution)
  - #12 + review (the cancel card opens a typed-reason wait marked `via: card`. Only a clear reason, keep, a time or a plain cancel is read from it. "No", "Wait" and "I changed my mind" keep the call. "I can't keep it" cancels. Anything unclear goes to Lindi)
  - #40 (W10 part)
  - #13 (W05 hold nudge hours)
  Review: W05 must be imported with or before W10. An old W05 under a new W10 drops the method-change WhatsApp.
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W04 W05 W10'`
- **Pre-check:** `n8nmark smc-w05 afterMethodPatch` and `n8nmark smc-w10 "W07 takesTypedReason"` show `f`. No SMC booking starts in the next 30 minutes (step 0 query).
- **Post-check:**
  - `n8nmark smc-w04 want_token`, `n8nmark smc-w05 afterMethodPatch` and `n8nmark smc-w10 "W07 takesTypedReason"` all show `t`.
  - Live: the hourly W10 sweep runs without error. Run `n8nq <<< "select id, status from execution_entity where \"workflowId\" = 'smc-w10' order by id desc limit 3;"` after the next :17. All rows should be `success`.
  - **Measure the /start/ timing before go-live** (review): with a synthetic booked lead from the E2E script, do a /start/ move with a method change. Then `n8nq <<< "select id, round(extract(epoch from (\"stoppedAt\"-\"startedAt\"))::numeric,1) from execution_entity where \"workflowId\" = 'smc-w39' order by id desc limit 3;"` should be under 10 s. If it is over, step 21 (the page re-check) is what saves the client from a false error.
- **Rollback:** shared rollback for `smc-w04`, `smc-w05` and `smc-w10`. Re-publish all three together: old W10 with new W05 is safe, the reverse is not.

### Step 9. Import `W12`
- **Fixes:** #40 (an outcome moves `conv_state.state` to attended / no_show / broker_no_show). Review: never while the lead has a newer live booking. Before, call A's outcome overwrote call B's `booked`, and a later "please cancel" became a close.
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W12'`
- **Pre-check:** `n8nmark smc-w12 "nb.appointment_date > ob.appointment_date"` shows `f`.
- **Post-check:**
  - The marker shows `t`.
  - The next W12 sweep executions are `success` (query as in step 8 with `smc-w12`).
  - `sbq "select l.id from leads l join appointments b on b.client_id = l.id and b.status in ('booked','confirmed') and b.appointment_date > now() where l.conv_state->>'state' in ('attended','no_show','broker_no_show');"` returns no rows.
- **Rollback:** shared rollback for `smc-w12`.

### Step 10. Import `W28`
- **Fixes:** W28 last resort sends the "ask for a day" line (it was an empty body, so silence). Review: the adviser comes from `contact_person` when `adviser_name` is empty, and the Afrikaans fallback is "jou adviseur".
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W28'`
- **Pre-check:** `n8nmark smc-w28 "jou adviseur"` shows `f`.
- **Post-check:** the marker shows `t`. `sbq "select count(*) from brokers where status = 'active' and coalesce(nullif(adviser_name, ''), contact_person) is null;"` returns 0 (every live adviser has a name to show).
- **Rollback:** shared rollback for `smc-w28`.

### Step 11. Import `W06`
- **Fixes:** #18 (delivery receipts only move `communications.status` forward).
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W06'`
- **Pre-check:** `n8nmark smc-w06 "smoke test #18"` shows `f`.
- **Post-check:** the marker shows `t`. After the next sends, `sbq "select status, count(*) from communications where created_at > now() - interval '1 hour' and channel = 'whatsapp' group by 1;"` shows no new `undelivered`-then-`sent` flips (no row is `sent` with a `failed_reason`).
- **Rollback:** shared rollback for `smc-w06`.

### Step 12. Data repair `supabase/drift/repair-2026-10-21-receipt-status.sql`
- **Fixes:** #18 (rows the old receipt order overwrote). Run it after steps 11 and 13, so no old writer is still running.
- **Command:** in the Supabase SQL editor (as the file says), run its section 1 (preview) on its own, read it, then run
  the UPDATE section. Do not run the whole file blind.
- **Pre-check:** the preview returns about 23 rows (21 failed + 1 delivered + 1 read, counted on 21 Oct). Stop if it is very different.
- **Post-check:** the preview returns 0 rows.
- **Rollback:** none needed. It moves statuses forward to what Twilio last reported. Keep the preview output as the record.

### Step 13. Import `W07`
- **Fixes:**
  - #18 (W07 receipts), #34, #9, #8, #32 (node-side parts; the rest is the lib in step 6)
  - #7 (status taken from the send result)
  - W28 last-resort route
  - review: when W07 answers "a different time" with the reschedule card, it ends the cancel card's typed-reason wait
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W07'`
- **Pre-check:** `n8nmark smc-w07 "End typed-reason wait (reschedule card, W07)"` shows `f`.
- **Post-check:**
  - The marker shows `t`.
  - `ssh -n emma-vps 'bash /root/wa-smoke.sh +27600000922 "hello"'` returns `HTTP 200`, and the newest `smc-w07` execution is `success`.
  - With a synthetic **booked** lead (E2E script), tap Cancel, then type "Mornings are better for me". Expect a W10 op `offer` (times offered) and the booking still `booked`. Then type "ok". Expect Lindi to answer, with no cancel.
  - Check: `sbq "select conv_state->'cancel_reason_pending' from leads where phone = '<that number>';"` shows `"via": "card"` while the wait is open.
- **Rollback:** shared rollback for `smc-w07`.

### Step 14. Import `W03`
- **Fixes:** #2 (WhatsApp profile name kept at the W07 hand-off), #36 (greeting echo), #16 (a listed test number is stored `is_synthetic = true`; a real 060 number is not), #6 (consent "No thanks" close line passes its own suppression row).
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03'`
- **Pre-check:** `n8nmark smc-w03 SYNTHETIC_TEST_NUMBERS` shows `f`.
- **Post-check:** the marker shows `t`. `ssh -n emma-vps 'bash /root/wa-smoke.sh +27600000923 "Hi, I saw your ad"'`, then `sbq "select is_synthetic, first_name from leads where phone = '+27600000923';"` returns `t` once consent is given (no lead row before consent is also correct).
- **Rollback:** shared rollback for `smc-w03`.

### Step 15. Import `W08`
- **Fixes:** #6 (the CLOSE_UNBOOKED line goes past the suppression row its own tap just wrote). Review: **only** that tap. A second "No thanks", or a number suppressed earlier, keeps the gate, so no second goodbye goes past a POPIA objection. Also #7 (status from the send result) and #13 (node-side hours).
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W08'`
- **Pre-check:** `n8nmark smc-w08 "item.json.suppressed) > 0"` shows `f`.
- **Post-check:** the marker shows `t`. After the next "No thanks" tap (real or E2E), `sbq "select count(*) from communications where metadata->>'correlation' like 'W08:Send close line:%' and lead_id = '<lead>' and status = 'sent';"` is 1. A second tap adds a `failed` row with reason `suppressed`, not a second `sent`.
- **Rollback:** shared rollback for `smc-w08`.

### Step 16. Import `W01`
- **Fixes:** #38 (`leads.ref` stored for desktop /start/ leads), #13 (W01 reminder and close only inside the contact hours).
- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W01'`
- **Pre-check:** `n8nmark smc-w01 "contact hours (a lead due outside"` shows `f`.
- **Post-check:** the marker shows `t`. The next desktop /start/ lead has `ref` set: `sbq "select ref from leads where origin = 'web' order by created_at desc limit 1;"`.
- **Rollback:** shared rollback for `smc-w01`.

---

## Supabase functions

Deploy from `C:\tmp\lv-smoke-fixes`. Rollback means redeploying the same function from the release worktree
`C:\tmp\lv-release-v4` (at `93d8c1a`) with the same command.

### Step 17. `smc-transcribe` (already live, version 10, 20 Oct)
- **Fixes:** #21 (returns the clip duration, so W29's 60-second voice-note cap fires).
- **Pre-check:** `npx supabase functions download smc-transcribe --project-ref cmsylaupctrbsvzrgzwy` into a scratch folder, then diff it against `supabase/functions/smc-transcribe/index.ts`. If there is no diff, skip this step.
- **Command:** `npx supabase functions deploy smc-transcribe --project-ref cmsylaupctrbsvzrgzwy --use-api --no-verify-jwt`
- **Post-check:** the next W29 voice note execution shows `duration` in the Transcribe node output (`n8nq` on `smc-w29`). A clip over 60 s is refused.
- **Rollback:** redeploy from `C:\tmp\lv-release-v4`.

### Step 18. `smc-voice` (after step 1)
- **Fixes:** #22 (/amd answers 204 with a null body), #48 (/twiml returns the sorry TwiML before the missed-call writes), #45 (voice WhatsApp consent writes a `lead_optins` row), #46 (persona: the talk-over restatement repeats the no-advice line), #13 (4 Nov holiday in the voice slot lib).
- **Command:** `npx supabase functions deploy smc-voice --project-ref cmsylaupctrbsvzrgzwy --use-api --no-verify-jwt`
- **Pre-check:** step 1 post-check passed.
- **Post-check:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice/amd` returns `204` or `401` (no 5xx). The function's version is +1 in the Supabase dashboard. After the next voice consent: `sbq "select channel, consent_version from lead_optins where channel = 'voice_call' order by created_at desc limit 1;"`.
- **Rollback:** redeploy from `C:\tmp\lv-release-v4` (the `voice_call` rows stay valid).

### Step 19. `sync-voice-agents`, then push the persona
- **Fixes:** #47 (the disclosures judge recognises a callback), #23 (`?agent=smc-chat` dry-run drift check for the WhatsApp twin), #46 (the persona text reaches the phone agent).
- **Command:**
  ```bash
  npx supabase functions deploy sync-voice-agents --project-ref cmsylaupctrbsvzrgzwy --use-api
  # dry-run drift check (read-only)
  curl -s -X POST "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/sync-voice-agents?agent=smc-chat" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  # push Lindi (phone) and read it back; it fails if ElevenLabs holds anything else
  curl -s -X POST "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/sync-voice-agents?agent=smc" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  ```
- **Pre-check:** the `?agent=smc-chat` dry run lists drift only in the fields this branch changed.
- **Post-check:** the `?agent=smc` answer reports the read-back OK, voice `TMGDvkby8aZjBVCmFLOK`, and the disclosures judge passes.
- **Rollback:** redeploy from `C:\tmp\lv-release-v4`, then `POST ?agent=smc` again (it pushes the old persona).

---

## CRM and site

### Step 20. CRM (leadvelocity.co.za)
- **Fixes:** #50 (Add broker inserts only real `brokers` columns), #51 (the drafting assistant is hidden while gemini-proxy is not deployed; build with `VITE_LEGAL_AI_ENABLED` empty), #45 (Opt-in panel shows the `voice_call` channel).
- **Command:** the CRM release process. Cherry-pick `da7a695`, `e327d95` and the `LeadOptins.tsx` hunk of `1300cca` onto the current CRM prod source (`release/all-2026-10-18` line). Build in `C:\Users\Jono\lv-deploy-portal` and run `npx vercel --prod --yes`.
- **Pre-check:** that checkout contains the purchased-leads orders feature (never deploy without it). `node --test src/lib/teamBroker.test.mjs src/utils/legalAI.test.mjs` passes there.
- **Post-check:** as an admin, Team > Add broker creates a broker with no error. The Contract / Invoice / Proposal tools show no drafting assistant.
- **Rollback:** `npx vercel promote <previous production URL> --yes`. Record it before deploying; the last known one is `lead-velocity-staging-p6p8w96n3`.

### Step 21. Site sortmycover.co.za (`/start/` page)
- **Fixes:** review of #11 and #3. A move or method change whose answer times out (the page allows 10 s) re-reads the booking. If the booking is already at the chosen time and method, the page shows the success screen instead of "Something went wrong". This covers W10 now waiting for W05's whole method change.
- **Command:** in a checkout of the **current live site source** with commit `c7234e6` cherry-picked (the live site carries other site fixes; do not deploy this branch's `sites/` alone), run in `sites/sortmycover`: `npm run verify`, then `npm run pack -- smc-site.zip`. Upload it through the hPanel File Browser, `PATCH .../api/resources/public_html/smc-site.zip?action=unarchive&destination=/public_html&override=true` (retry on a 500), delete the zip, and flush the CDN (hPanel > Performance > CDN).
- **Pre-check:** `npm run verify` is green in that checkout (437+ tests), and `npm run pack` prints the index hash.
- **Post-check:** `node scripts/smoke-smc.mjs --expect-index <hash>` (repo root, read-only) passes. A move on /start/ with a synthetic booked lead shows "moved".
- **Rollback:** re-upload the previous pack (Hostinger backup `site-backup-*` or the last zip), then flush the CDN.

---

## Waits for Jono's decision (not part of the run above)

### Step 22. Migration `20261021150300_smc_broker_sees_live_bookings.sql` (#4)
- **Fixes:** #4 (a broker sees a booking, its lead and its outcome when a live booking with him exists, even with an unverified email). It changes what a broker can see, so it is applied only on Jono's decision.
- **Command:** Supabase MCP `apply_migration` with the file.
- **Pre-check:** `node --test tests/smc-broker-live-booking-rls.test.mjs` passes (PGlite: the bug is reproduced, then fixed).
- **Post-check:** as Mark (broker), booking `8b5cc3b6` (if not cleaned up) or the next phone booking shows in his Appointments.
- **Rollback:** `supabase/migrations/undo/20261021150300_smc_broker_sees_live_bookings.undo.sql`.

---

## Review findings not changed in code (and why)

- **W35 lead pulse quiet hours (pulse.mjs:30):** not reproduced. W35 is retired (D5, 20 Oct): live `smc-w35` is
  `active = f`, there is no `W35.json` in the repo, and W07's W35 route only logs. Nothing sends the pulse. If W35 is ever
  revived, route its due time through `lib/contact-hours.mjs` first.
- **W10 waits for all of W05's update_method run (#3 timing):** the split "W05 answers after Save method, effects in a second
  execution" would rewire nodes that pre-existing W05 tests pin on purpose (`Save method -> Method client email / Method
  invite?`, W05.test.mjs from before this branch). So the symptom is fixed on the page instead (step 21), and the timing is
  measured in step 8. If the measurement is over 10 s, the W05 split is the next change. It needs those tests updated with
  Jono's agreement.
- **Importing W10 without W05:** handled by step 8 (W04, W05 and W10 are imported in one call, W05 first).
