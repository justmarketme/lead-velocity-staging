# Deploy: SortMyCover owner alerts on WhatsApp (branch `feat/smc-owner-whatsapp-alerts`)

**Owner rule (Jono, 24 Oct 2026):** until the separate internal WhatsApp number ("Zoe Experience") exists, EVERY
SortMyCover notification reaches Jono on WhatsApp +27 72 554 8057, sent from the SortMyCover Twilio number
+27 60 015 6480. The first real lead (Cassiem, 24 Oct 08:12 SAST) produced no WhatsApp at all: W38 only knew EMMA
(Teams / Telegram). Audit and map: `docs/OWNER-ALERTS-AUDIT.md`.

Nothing in here has been run. Every step marked **[Jono]** needs his explicit go. Read-only checks are not gated.

Conventions: `VPS` = `ssh emma-vps` (key only, use `ssh -n` for one-shot commands), n8n in `/opt/leadvelocity-n8n`,
repo checkout at `/opt/leadvelocity-n8n/repo`. Env changes reach n8n only on a container RECREATE
(`./dc up -d --force-recreate n8n`); the restart at the end of `import_wf.sh` keeps the old env.

---

## 0. What changes

| Piece | Before | After |
|---|---|---|
| `automation/lib/owner-alert.mjs` (new, `require('lv-automation').ownerAlert`) | - | The one helper: owner number, template choice (`ops_update` else `ops_alert`), redaction, clipping, synthetic skip, `record:false` + `bypass_suppression:true` items for `smc-whatsapp-send` |
| **W38** `smc-w38` | leads + bookings -> EMMA `/api/notify` (Teams / Telegram) | leads + bookings + **console escalations** (`public.escalations`, not W07's own) + **booking moved / cancelled / voice call-backs** (`public.lead_activities`) -> ONE WhatsApp to the owner through `smc-whatsapp-send`; EMMA only when the sender answers `ok:false`; watermark committed on the sender's `ok` |
| **W22** `smc-w22` | WhatsApp for red / `notify_now` only | WhatsApp for **every** alert (red and amber), through the helper; still email-only: synthetic signals and the sender's own `whatsapp_send_failed` (no loop); 24-h dedupe unchanged |
| **W07** `smc-w07` | "Alert ops" put the text in the name slot, "now" as the event, a dead URL button; pre-consent sent the **full phone number**; never-silent -> EMMA | "Alert ops" / "Pre-consent" build helper items (first name + phone last 3, KG on a sensitive chat / pre-consent); never-silent -> WhatsApp sender first, EMMA fallback (`patch-owner-alerts.mjs`) |
| **W10** `smc-w10` | rebook failed -> EMMA | rebook failed -> WhatsApp sender first, EMMA fallback |
| Template `ops_update` (new, UTILITY) | - | "Hi {{1}}, SortMyCover update: {{2}}. Details: {{3}}. Reply here if a person needs to step in." Not yet submitted: every path uses the approved `ops_alert` until its SID is in `TWILIO_CONTENT_SIDS` |
| W34 DSR intake, W05 bookings, W12 outcomes / no-shows / disputes, W11 / W13 / W15 / W39 escalations | console rows only (W34: via W22 `notify_now`) | reach the owner through W22 (amber now WhatsApps) and W38's escalation / activity sweep, with **no edit** to those workflows |

Guard rails that stay: `SMC_TEST_PHONES` (Jono, KG) is a routing list only, the sender never dry-runs those numbers
(`sub-whatsapp-send.decide` reads `SYNTHETIC_TEST_NUMBERS` only); a synthetic subject alerts nobody; POPIA minimisation
(first name, phone last 3, practice, time; never the number, email, note or message text); `DRY_RUN_SENDS` is honoured by
the sender and by the EMMA gate.

## 1. Before you start (read-only)

```bash
git fetch origin && git checkout feat/smc-owner-whatsapp-alerts && git pull
REF=$(git rev-parse --short HEAD); echo $REF
for f in owner-alert W38 W22 W07 W10 W05 synthetic-ops-alerts w07-cancel-stop loader egress-dryrun twilio-flow generators SUB; do node --test automation/tests/$f.test.mjs 2>&1 | grep -E "^(# |ℹ )(pass|fail) "; done
node automation/build-w38.mjs && node automation/build-w22.mjs && node automation/patch-owner-alerts.mjs && node automation/templates/twilio/build-content.mjs && git diff --exit-code automation/
```

**Pass:** every file reports `fail 0`, the builders print `already` / regenerate with no diff.

Live env, read-only (names and non-secret values only; never print `TWILIO_AUTH_TOKEN` or the SIDs JSON):

```bash
ssh -n emma-vps 'for v in SMC_LEAD_ALERT_ENABLED DRY_RUN_SENDS WHATSAPP_PROVIDER TWILIO_WHATSAPP_FROM OPS_WHATSAPP_JONATHAN OPS_WHATSAPP_KG SMC_OWNER_WHATSAPP SMC_TEST_PHONES WHATSAPP_TEST_RECIPIENTS; do echo "$v=$(docker exec lv-n8n-n8n-1 printenv $v)"; done; docker exec lv-n8n-n8n-1 sh -c "printenv TWILIO_CONTENT_SIDS" | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const o=JSON.parse(s||\"{}\");console.log(\"ops_alert:\",!!o.ops_alert,\"ops_update:\",!!o.ops_update)})"'
```

**Pass (24 Oct state):** `SMC_LEAD_ALERT_ENABLED=true`, `DRY_RUN_SENDS=false`, `WHATSAPP_PROVIDER=twilio`,
`TWILIO_WHATSAPP_FROM=whatsapp:+27600156480`, `OPS_WHATSAPP_JONATHAN=+27725548057`, `ops_alert: true`. With that the
stopgap needs **no env change**. Take a fresh n8n backup: `ssh -n emma-vps /opt/leadvelocity-n8n/backup.sh`.

## 2. Env (optional today, required for Zoe later)

| Var | Today | Why |
|---|---|---|
| `SMC_OWNER_WHATSAPP` | leave unset (falls back to `OPS_WHATSAPP_JONATHAN`, else the documented default `+27725548057`) | The one number every owner notification goes to. "Zoe Experience" = set this to the new number (and later the sender) and recreate the container; no code change |
| `TWILIO_CONTENT_SIDS.ops_update` | absent until step 5 | The owner template; `ops_alert` is used until it exists |
| `OPS_WHATSAPP_KG` | set | KG still gets `to: both` alerts (POPIA breach, sensitive chats, pre-consent hand-offs) |

Documented in `automation/.env.example`. Any change = edit `/opt/leadvelocity-n8n/repo/.env`, then
`cd /opt/leadvelocity-n8n && ./dc up -d --force-recreate n8n`.

## 3. Import the four workflows **[Jono]**

```bash
ssh -n emma-vps 'cd /opt/leadvelocity-n8n/repo && git fetch origin && git checkout feat/smc-owner-whatsapp-alerts && git pull && git rev-parse --short HEAD'
ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W38 W22 W07 W10'
```

`import_wf.sh` binds the Postgres credential by name, imports, publishes and restarts n8n. Order does not matter: the
four workflows are independent and `smc-whatsapp-send` is unchanged.

**Pass:** the four `publish:workflow` lines succeed; `ssh -n emma-vps 'docker exec lv-n8n-postgres-1 psql -U $(grep -E "^POSTGRES_USER=" /opt/leadvelocity-n8n/repo/.env | cut -d= -f2) -d $(grep -E "^POSTGRES_DB=" /opt/leadvelocity-n8n/repo/.env | cut -d= -f2) -Atc "select id, active, \"versionId\" from workflow_entity where id in ('"'"'smc-w38'"'"','"'"'smc-w22'"'"','"'"'smc-w07'"'"','"'"'smc-w10'"'"')"'` shows all four `active = t`.

W38's static data (`watermark`, `seen`) survives the import: the next tick carries on from the last committed watermark;
nothing is replayed. If `last` later shows `channel: emma` instead of `whatsapp`, the sender answered `ok:false`: read
`last_error.detail` (`twilio_content_sid_missing` = the SIDs JSON lost `ops_alert`; a Twilio error code = check the
sender execution).

## 4. Verification **[Jono's go, one real send]**

One test lead from Jono's own number (it is on `SMC_TEST_PHONES`, so it routes to the test practice, never to Mark):

1. From +27 72 554 8057, send the Click-to-WhatsApp opener to +27 60 015 6480 ("Check my life cover") and answer the consent question "Yes".
2. Within 60 s of the `leads` row, Jono receives a WhatsApp **from +27 60 015 6480**: with the stopgap template it reads
   "Hi Jono, a SortMyCover system alert needs your attention. What happened: 1 new lead. Impact: Lead: Jono, WhatsApp ad,
   phone ends 057, routed to SortMyCover test practice (TEST practice) [test data]. The full details are in your email."
   (W22 sends no email for W38 ticks: that sentence is the template's fixed text, which `ops_update` replaces.)
3. Proof (read-only):
   - Twilio: `GET https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json?To=whatsapp:%2B27725548057&PageSize=3`
     shows a new `SM...` from `whatsapp:+27600156480` with status `delivered` / `read`.
   - W38 static data: `select "staticData"::jsonb -> 'global' -> 'last' from workflow_entity where id = 'smc-w38'` ->
     `channel: whatsapp`, `external_id: SM...`, `items: 1`, `status: 200`.
   - EMMA journal (`journalctl -u emma --since "10 min ago"`): no `/api/notify` for that tick (or only one if the sender had said no).
4. The escalation sweep: reply "I want to speak to a person" in the same chat -> W07 raises a `human_handoff` escalation
   and WhatsApps Jono itself (W07's rows are left out of W38's sweep on purpose, so this proves W07's path, not W38's). To
   prove the sweep, mark any test booking's outcome as disputed in the portal (W12 writes `esc_kind=outcome_disputed`) and
   wait one tick: "SortMyCover: 1 needs a person / Needs a person: outcome disputed, <first name>, phone ends ###, with ...".
5. Amber W22: nothing to provoke on purpose; the next amber in the log (e.g. `smc-capi-send` "Update capi_log") arrives on
   WhatsApp as "Alert: ... failed at ..." plus the usual email.

**Pass:** steps 2 and 3 hold. **Fail:** no WhatsApp within 2 minutes -> read W38 `last_error`, the `smc-whatsapp-send`
execution for correlation `owner:W38:tick:...`, and `docker exec lv-n8n-n8n-1 printenv WHATSAPP_TEST_RECIPIENTS` (must be
empty: an allow-list without Jono's number skips the send as `not_allow_listed`).

## 5. The owner template `ops_update` **[Jono]**

```bash
node automation/templates/twilio/submit-twilio.mjs --only ops_update            # dry run: prints the Content body, sends nothing
node automation/templates/twilio/submit-twilio.mjs --submit --only ops_update   # creates the Content + the WhatsApp approval request, prints the SID
```

Meta classified `ops_alert` as MARKETING although it was submitted as UTILITY (each send is a marketing conversation and
subject to per-user marketing caps). `ops_update` is worded as a plain transactional update; if Meta classes it MARKETING
too, it still delivers; rewording is the only lever. Poll the approval:
`GET https://content.twilio.com/v1/Content/<SID>/ApprovalRequests` -> `status: approved`.

Then: add `"ops_update": "HX..."` to the `TWILIO_CONTENT_SIDS` JSON in `/opt/leadvelocity-n8n/repo/.env`,
`./dc up -d --force-recreate n8n`, and repeat step 4.1: the message now reads "Hi Jono, SortMyCover update: 1 new lead.
Details: Lead: ... Reply here if a person needs to step in." No workflow re-import: the helper picks `ops_update` as
soon as the SID exists.

## 6. Rollback

- Workflows: on the VPS, `cd /opt/leadvelocity-n8n/repo && git checkout 9b201bd -- automation/W38.json automation/W22.json automation/W07.json automation/W10.json && bash automation/emma-vps/import_wf.sh W38 W22 W07 W10`
  (the live versions before this branch), or restore the backup from step 1. Afterwards `git checkout feat/smc-owner-whatsapp-alerts -- automation/` to leave the checkout clean.
- Env: nothing to undo for the stopgap. An `ops_update` SID left in `TWILIO_CONTENT_SIDS` is harmless to the old workflows (they never name it).
- The template submission cannot be withdrawn; an approved unused Content costs nothing.

## 7. Later: "Zoe Experience"

Set `SMC_OWNER_WHATSAPP=<the new internal number>` (and, when the second Twilio sender exists, point the owner sends at it:
today every send uses `TWILIO_WHATSAPP_FROM`; a per-recipient sender is a small change in `lib/owner-alert.mjs` /
`sub-whatsapp-send`), recreate the container. No workflow changes.

## 8. Open items

- `ops_update` is drafted and generated but **not submitted** (Jono's gate); until then the stopgap copy says "The full details are in your email", which is only true for W22 alerts.
- W38 reports a booking when its row is created; a held booking that is later verified (W05 promotes the row in place) is not reported again. The adviser gets `broker_new_booking` at that point; the owner line said "(held until the email is verified)" when it arrived.
- Plain W12 outcomes (attended / disposition without a dispute) are not alerted: W12 writes no escalation and no `lead_activities` row of its own for them; only disputes, no-shows, unconfirmed and no-WhatsApp cases reach the owner (through escalations). Adding `outcome_recorded` to `w38.ACTIVITY_TYPES` is the hook if wanted.
- The voice function's `voice_callback_requested` rows carry `brand_id` (SMC) and `lead_id`; rows for callers with no lead yet have none and cannot be swept.
- The EMMA fallback in W07 / W10 reads the build node with `.first()`: correct for the one-item executions these paths run as; a multi-item execution would send the first item's EMMA body for every failed item.
