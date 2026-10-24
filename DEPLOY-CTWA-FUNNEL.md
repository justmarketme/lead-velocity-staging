# Deploy runbook: CTWA consent funnel (24 Oct 2026)

Branch `feat/smc-ctwa-consent-funnel` (worktree `C:\tmp\lv-smoke-fixes`), on top of live `feat/smc-test-real-routing` @
`9b201bd` (= `release/v5-2026-10-22`). Three fixes for the click-to-WhatsApp funnel (18 messaged, 8 never answered the
consent question, 3 consented, 0 booked; Cassiem stopped at the time picker and the first nudge was 2 h away):

| | Fix | Where | Owner |
|---|---|---|---|
| F1 | One-tap consent from the ad: the ad's welcome message carries the POPIA wording, its one button "Yes, I agree" is the first message and IS the consent (`ctwa-icebreaker-v1`); the Start here card follows at once | `automation/ctwa/w03.js` (`iceBreakerConsent`, `iceBreakerIntake`), W03 step env, `automation/meta/ctwa-welcome-message.json` + `CTWA-WELCOME.md` | W03 + the ads |
| F2 | Consent-stall re-asks: 2 h after the consent question was read (or sent) and 20 h, inside the 24-h window, one per stage, logged in `communications` | `w03.js` (`CONSENT_STALL_HOURS`, `consentReask`), W03.json nodes `Every 5 minutes (consent stall)` -> `Stalled consent threads (claim + advance)` -> `Consent re-ask (w03.consentReask)` -> `Action?` | W03 |
| F3 | 30-minute "where you left off" nudge: a Start here lead who opened `/start/` and left unbooked gets `start_nudge_30m` 30 min after the last page activity (the `smc_start_cta` session card), then +24 h / final as today | `automation/lib/w08.mjs`, W08.json `Candidates` (`page_last_at`), `Decide` | W08 |

**Review fixes (24 Oct 2026, second commit on the branch).** F3: W01's intake row `start_page_pending` no longer counts as a
page activity (it is written at insert time, so every W01 start-page lead would have got the 30-min card with an untrue "you
got as far as the booking page"); a page visit after a first nudge no longer reshapes the plan (it inserted a 30-min step,
pushed the +24 h / final after it and dropped a CTWA final past the 72-h window); no two nudges within 6 h of the last one
actually sent (`last_nudge_at`, enforced at send time). F2: re-asks follow the contact hours every other nudge keeps
(Mon-Fri 08:00-20:00, Sat 09:00-13:00 SAST, never a Sunday or a public holiday from `data/za-public-holidays.json`, stamped
into the SQL by the builder) instead of a plain 07:00-21:00 gate. F1: an ad greeting that differs from `SMC_CTWA_WELCOME_TEXT`
is flagged (`provenance.welcome_text_mismatch`, W22 signal `ctwa_welcome_text_mismatch`). No new env vars, no migration.

**Root cause of F2 (why `wa_threads.stall_due_at` stayed NULL for `await_consent`).** `w03.js step()` pushed a
`schedule_stall` action only after consent (`q_age` / `start_page` / `capture_flow`); the first-contact branch that sends
the consent question pushed none, so the W03 step node computed `stall_due_at = null` and `Save thread` wrote NULL.
Separately, nothing ever read `stall_due_at`: W08's query is lead-based (`leads` + `brokers`), and pre-consent threads
have no lead (the 2026-10-06 CRM audit already noted "stall nudges are never sent (`stall_due_at` is unread)"). Both are
fixed: the consent question schedules `[2, 20]` h, and W03 now has its own 5-minute trigger that consumes it.

**Every step below is a production change and needs Jono's go.** Nothing here has been deployed, imported, applied or
sent. No migration: no DDL, no new tables or columns (`page_last_at` is a derived column of the candidates query;
`state.consent_reasks` lives inside the existing `wa_threads.state` jsonb).

Offline evidence (24 Oct, this worktree, after the review fixes): `node --test automation/tests/*.test.mjs` 1041 -> 1056 tests,
0 failing (1031 -> 1046 pass, 10 skipped: the `.local` tests that need a local Postgres); the new contact-hours predicate was
also evaluated on the live Postgres with fixed timestamps (Mon 07:59 / 20:00, Sat 08:59 / 13:00, Sunday, 16 Dec all refused;
Mon 08:00 / 19:59, Sat 09:00 / 12:59, 17 Dec allowed); every `automation/build-*.mjs` run twice,
the second run changes no file; `generators.test.mjs` byte-compares W03/W28/W39.

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

## Step 0. Snapshot

- **Command:**
  ```bash
  ssh -n emma-vps '/opt/leadvelocity-n8n/backup.sh && ls -t /opt/leadvelocity-n8n/backups | head -1'
  n8nq <<'SQL' | tee "ctwa-funnel-active-versions-$(date +%Y%m%d%H%M).txt"
  SELECT id, active, "activeVersionId" FROM workflow_entity WHERE id IN ('smc-w03','smc-w08') ORDER BY id;
  SQL
  ssh -n emma-vps 'cp -p /opt/leadvelocity-n8n/repo/.env /root/env-backup-$(date +%Y%m%d%H%M%S)-ctwa'
  ```
- **Post-check:** the backup file is listed; the version file has 2 rows; note whether `smc-w03` is `active = t`
  (it is a sub-workflow today and may be inactive: the new schedule trigger only runs while it is active, step 3).

## Step 1. New env vars (VPS `.env`)

- **Fixes:** F1 (the two texts W03 compares and stores). Without them W03 behaves exactly as today.
- **Values** (names in `automation/.env.example`; the texts are not secrets):
  ```
  SMC_CTWA_ICEBREAKER_CONSENT=Yes, I agree
  SMC_CTWA_WELCOME_TEXT=Hi from SortMyCover. Your consent (POPIA): we may message you on WhatsApp to book your call and share your name and number with an authorised financial adviser, who will contact you. Lead Velocity (Pty) Ltd is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy
  ```
  `SMC_CTWA_WELCOME_TEXT` must equal `automation/meta/ctwa-welcome-message.json` `text_format.message.text` byte for byte
  (one line, no quotes: dotenv keeps commas and colons). Check after editing:
  `ssh -n emma-vps "grep -c '^SMC_CTWA_' /opt/leadvelocity-n8n/repo/.env"` prints `2`.
- **Reload:** `ssh -n emma-vps '/opt/leadvelocity-n8n/dc up -d --force-recreate n8n'` (a restart does not reload env).
- **Rollback:** remove the two lines, recreate n8n again.

## Step 2. Ship the code and re-import W03 + W08

- **Fixes:** F1 (W03 step reads the env; `w03.js` inlined), F2 (W03's new trigger + 2 nodes; the consent question's stall),
  F3 (`lib/w08.mjs` is loaded through `lv-automation` at run time, so shipping the repo is what changes W08's logic; the
  W08.json re-import adds `page_last_at` to the candidates query and the Decide node).
- **Commands** (repo root, Git Bash; `deploy.sh` ships committed files from a git ref, no push needed):
  ```bash
  automation/emma-vps/deploy.sh feat/smc-ctwa-consent-funnel
  ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03 W08'
  ```
  `import_wf.sh` binds credentials by name, imports, **publishes** (activates) both, then restarts n8n.
- **Post-check:**
  ```bash
  n8nmark smc-w03 'Stalled consent threads'   # new_code = t, active = t
  n8nmark smc-w08 'page_last_at'              # new_code = t, active = t
  ssh -n emma-vps 'grep -c "consentReask" /opt/leadvelocity-n8n/repo/automation/ctwa/w03.js; grep -c PAGE_NUDGE_AFTER /opt/leadvelocity-n8n/repo/automation/lib/w08.mjs'
  ```
  In the n8n UI: W03 > Executions shows a run of `Every 5 minutes (consent stall)` within 5 minutes, `Stalled consent
  threads (claim + advance)` returning 0 items (the 9 old `await_consent` threads of 24 Oct have `stall_due_at` NULL and
  are never re-asked retroactively, the one from this morning included unless the optional backfill in step 3b runs).
- **Rollback:** `automation/emma-vps/deploy.sh 9b201bd` then
  `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03 W08'` (the 9b201bd JSON has no
  schedule trigger; W08 ignores `page_last_at` it no longer selects). `state.consent_reasks` left in `wa_threads.state`
  is inert.

## Step 3. W03 must stay active

The consent-stall schedule lives inside W03. `import_wf.sh` publishes it; if `smc-w03` was inactive before (step 0 note),
it is active now. The sub-workflow entry (W07 -> W03) worked either way, but n8n registers a workflow's production webhooks
only while it is active, so activating may be the first time `GET /webhook/wa/:ref` (the tracked redirect) and
`GET /webhook/whatsapp` (Meta's verify handshake) serve live traffic. Neither clashes with W07's `POST /webhook/whatsapp`
(n8n keys webhooks by method + path); the redirect only 302s to wa.me and the handshake only answers `hub.challenge` with the
right token. Check: `n8nq <<< "SELECT id, active FROM workflow_entity WHERE id = 'smc-w03';"` -> `t`, then
`curl -sI https://n8n.sortmycover.co.za/webhook/wa/test | head -1` -> `HTTP/2 302` (or 404 for an unknown ref, never 5xx).

## Step 3b (optional, Jono's call). Give today's open consent thread a clock

The one real `await_consent` thread of 24 Oct (question read 07:04Z) keeps `stall_due_at` NULL after the import, so it is
never re-asked. To include every thread whose 24-h window is still open, ONE statement on Supabase (not part of the import):
```sql
update public.wa_threads set stall_due_at = last_inbound_at + interval '2 hours', updated_at = now()
 where stage = 'await_consent' and stall_due_at is null and last_inbound_at > now() - interval '22 hours';   -- expect 0-1 rows
```
The next 5-minute run then sends the first re-ask (inside the contact hours) if the window is still open. Skip it and nothing
is lost: the thread just expires as it would have today.

## Step 4. The ads (Jono, Ads Manager or API)

Follow `automation/meta/CTWA-WELCOME.md`: new creatives with `page_welcome_message` from
`automation/meta/ctwa-welcome-message.json` (greeting = `SMC_CTWA_WELCOME_TEXT`, one FAQ button `Yes, I agree`), preview on
a phone, activate, pause the old ads. Do this **after** steps 1 and 2: until then a tap on the button simply gets the
consent question (no harm, no double consent).

---

## Verification (first 24 h)

```sql
-- F1: consents given by the ad button (expect rows once the new ads run)
select id, first_name, consent_at, consent_source, consent_text_version, conv_state->>'state' as state
  from public.leads where consent_text_version = 'ctwa-icebreaker-v1' order by consent_at desc limit 20;
-- F1: every one has its opt-in row with the tapped words and the referral
select o.lead_id, o.consent_version, o.opener_text, o.referral_source_type, o.ctwa_clid is not null as clid, o.channel
  from public.lead_optins o where o.consent_version = 'ctwa-icebreaker-v1' order by o.received_at desc limit 20;
-- F1: an ad whose greeting drifted from SMC_CTWA_WELCOME_TEXT (Cloud API only; expect 0 rows; W22 also raised ctwa_welcome_text_mismatch)
select id, ad_id, consent_at, provenance->>'welcome_text_from' as shown_from from public.leads
 where consent_text_version = 'ctwa-icebreaker-v1' and (provenance->>'welcome_text_mismatch')::boolean order by consent_at desc;

-- F2: the consent question now carries a clock (new await_consent threads: stall_due_at = inbound + 2 h, never NULL)
select stage, count(*) filter (where stall_due_at is null) as no_clock, count(*) as total, max(updated_at)
  from public.wa_threads where updated_at > now() - interval '24 hours' group by 1;
-- F2: re-asks sent (reply key reask:<sid>:<n>; status sent / read; lead_id NULL because there is no lead yet)
select created_at, recipient_contact, status, metadata->>'reply_to' as reply_key, left(content, 50) as words
  from public.communications where workflow = 'W03' and metadata->>'reply_to' like 'reask:%' order by created_at desc limit 20;
-- F2: at most two per thread, and the thread's own record of them
select mobile_hash, stage, stall_due_at, state->'consent_reasks' as reasks from public.wa_threads
 where state ? 'consent_reasks' order by updated_at desc limit 20;
-- F2: nobody suppressed was re-asked
select count(*) from public.communications c join public.suppression s on s.mobile_hash = public.smc_hash_contact(c.recipient_contact)
 where c.workflow = 'W03' and c.metadata->>'reply_to' like 'reask:%' and c.created_at > s.created_at;   -- expect 0

-- F3: 30-minute nudges (touch start_nudge_30m; template start_nudge_2h when the window had closed)
select a.lead_id, a.occurred_at, a.payload->>'touch' as touch, a.payload->>'channel' as channel, a.payload->>'template' as template
  from public.lead_activities a where a.activity_type = 'nurture_sent' and a.payload->>'touch' = 'start_nudge_30m' order by a.occurred_at desc limit 20;
-- F3: never both first nudges for one lead (expect 0 rows)
select lead_id from public.lead_activities where activity_type = 'nurture_sent' and payload->>'touch' in ('start_nudge_2h','start_nudge_30m')
 group by lead_id having count(distinct payload->>'touch') > 1;
-- F3: the next lead like Cassiem: page activity -> nudge 30 min later (compare max(occurred_at) of start_page_* with the nurture_sent row)
select l.id, l.first_name, max(x.occurred_at) filter (where (x.activity_type like 'start_page_%' or x.activity_type = 'adviser_disclosed') and x.activity_type <> 'start_page_pending') as page_last_at,
       max(x.occurred_at) filter (where x.activity_type = 'nurture_sent' and x.payload->>'touch' = 'start_nudge_30m') as nudged_at
  from public.leads l join public.lead_activities x on x.lead_id = l.id
 where l.created_at > now() - interval '3 days' and (l.conv_state->>'state' = 'start_page' or l.conv_state->>'via' = 'start_page') group by 1, 2 order by 3 desc nulls last;
```

n8n: W03 executions of `Every 5 minutes (consent stall)` finish green with 0 or more items; a re-ask run shows
`Reply claim` -> `Live send? (W03)` -> `WhatsApp send (session)` (the smc-whatsapp-send sub) -> `Store outbound (W03)`.
W08 executions keep their 5-minute rhythm; a `start_nudge_30m` run shows `Claim touch` -> `Build message` ->
`Send WhatsApp` with `interactive.type = cta_url` (session) or `template.name = start_nudge_2h`.

## Behaviour notes

- F2 timing is anchored on the consent question's own outbound row (`communications`, `metadata.reply_to` = the first
  inbound sid): `coalesce(read_at, created_at)` + 2 h, then + 20 h. The thread's `stall_due_at` (= inbound + 2 h) is the
  coarse gate; a later read receipt delays the first re-ask. Re-asks go only inside the contact hours every W08 nudge keeps
  (`lib/contact-hours.mjs`, CPA s12 / Reg 4: Mon-Fri 08:00-20:00, Sat 09:00-13:00 SAST, never a Sunday or a public holiday;
  the holiday dates are stamped into the W03 SQL from `data/za-public-holidays.json` at build time, so editing that file
  means `node automation/build-w03-w28.mjs` + re-import W03) and are dropped when the 24-h window closes meanwhile (never a
  template, never after the window: a Saturday-afternoon lead gets no re-ask at all). A free-text message before consent
  gets the immediate re-ask as today and restarts the 2-h clock; the scheduled re-asks stay capped at two per thread.
- **Policy call for Jono / compliance (not a code defect):** POPIA s69(2)(b) allows a responsible party to approach a data
  subject ONCE to request consent. The consent question answers the person's own inbound message; the two scheduled
  re-asks (brief: 2 h and 20 h) are follow-ups to it inside the same 24-h session. If compliance reads s69(2)(b) as one
  approach in total, set `CONSENT_STALL_HOURS = [2]` in `automation/ctwa/w03.js`, rebuild and re-import W03: one re-ask.
- F2 sends go through the same `smc-whatsapp-send` route as every W03 reply: `SYNTHETIC_TEST_NUMBERS` dry-run,
  `DRY_RUN_SENDS` honoured, suppression checked twice (SQL and the sender).
- F3 fires only on the start track (Start here sent, nothing booked, no W06 intro). The 2-h and the 30-min nudge are one
  "first nudge": whichever went out first satisfies both. A page visit after any first nudge changes nothing (the +24 h and
  final keep their times), and no nudge goes within 6 h of the last one actually sent (`last_nudge_at` in the candidates
  query), so a late 30-min card never has the +24 h one 30 min behind it. "Page activity" = W39's `start_page_*` rows and
  `adviser_disclosed`, never W01's `start_page_pending` (written at intake). Contact hours (Mon-Fri 08:00-20:00,
  Sat 09:00-13:00, no Sunday / holiday) still apply.
- F3 wording omits "free" (Jono, 19 Oct 2026: client wording has no "free", no "AI"; the W08 tests enforce it) and the STOP
  line (20 Oct 2026: only the W03 consent carries it).
- F1 needs referral data on the first message (a real click-to-WhatsApp entry). The same words typed by a number that did not
  come from an ad get the consent question (voluntary, informed), and `CTWA-WELCOME.md` has a query to count those.
