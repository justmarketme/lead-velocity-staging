# Deploy: Instant Form consent (CONSENT-GENERIC-v5form) + W12 contact hours

Branch `feat/smc-instantform-consent`, cut from `fix/smc-smoke-2026-10-21` @ a4a2bff (the ref the VPS runs since 22 Oct).
Source: `checklist/SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md` row 22 and section 5 item 8. Written 22 Oct 2026. Nothing here
is deployed yet.

## What changes

| Part | File(s) | Effect |
|---|---|---|
| Consent version | `automation/lib/w01.mjs` (`LEAD_AD_FORM_CONSENT`, `LEAD_AD_CONSENT_VERSION`, `LEAD_AD_CONSENT_TEXT`, `consentRegistry`) | New registry entry `CONSENT-GENERIC-v5form`. It is now the live form's version. `CONSENT-NAMED-v5web` (v2) can still be read. |
| W02 intake | `automation/W02.json` via `automation/patch-w02-instant-form-v3.mjs` | The ingest item carries `consent.text_version` and the exact `consent.text` the person ticked. W01 stores `consent_text`, `consent_text_version`, `consent_mode = generic`, `consent_at`, `consent_source = lead_ad` and the `consent_audit` row. |
| Form spec | `deliverables/media-buyer/instant-form-spec-v3.json` (v2 marked superseded) | Two custom questions (intent, age band) plus first name and WhatsApp number. No cover, insurer, income or health question. Generic consent box. |
| W12 contact hours | `automation/lib/w12.mjs`, `automation/build-w09-w12-w13.mjs` -> `automation/W12.json` | The `reach_check`, `attended_thanks` and Schedule D apology messages (with the W10 rebooking behind the apology) go only inside `lib/contact-hours.mjs` hours: Mon-Fri 08:00-20:00, Sat 09:00-13:00, never on a Sunday or public holiday. Outside those hours they wait, details below. |
| Bug fixed on the way | `automation/W12.json` | Follow-up sends now go through the W12 claim. Before, the apology went out unclaimed, so `w12:apology:{booking}` was never written and the I-50f late-mark check ("broker marks after the apology went out") could never fire. |
| Tests | `automation/tests/W02-instant-form-v3.test.mjs` (was `-v2`), `automation/tests/W12-contact-hours.test.mjs` (new), `automation/tests/W12.test.mjs` | Full offline suite: 1032 tests, 1022 pass, 0 fail, 10 skipped. The skipped ones are the local-Postgres tests; all 9 `*.local.test.mjs` files then passed on the real schema, run one file at a time in Docker. |

How the W12 hours work:
- **`reach_check`:** sent at the first moment inside the hours at or after slot end + 30 min (`w12.reachPlan`). The lead's 2-hour silence window starts when she is asked, not at end + 30 min. An evening call that ends at 19:45 is asked at 08:00 the next day, and a broker no-show is confirmed at 10:00, not 22:15. If the first allowed moment is more than 21 hours after the call ends, she is not asked, the same as an opted-out lead. That covers Saturday afternoons and the evening before a public holiday. The 24-hour auto-attend still closes the meeting.
- **`attended_thanks` and the apology:** outside the hours they are parked as a `w12:hold:{kind}:{booking}` row in `lead_activities` (activity `post_call_message_held`). The 5-minute tick sends them at the next opening, under their usual key, claimed, so each goes once. The W10 Schedule D rebooking is held with the apology and goes straight after it.
- **One exception:** the apology is a session text (there is no template). If the lead's 24-hour window would close before the hours open (Saturday call, Monday opening), it goes at once rather than never. The send is tagged `hours_exempt: session_closes_before_hours`.
- **Never held:** broker messages (outcome check, nudge, disposition) and the short reply to the lead's own "Yes, we spoke" tap.
- **No DDL and no new env vars.**

Compatibility:
- New libs with the old W12.json: nothing is held. The lead follow-ups send as they do today, because the old JSON passes no clock. The reach-check hours apply as soon as the libs land.
- New W02.json with the old libs: the text field is undefined, and W01 takes the text from the registry as before.
- Still, import W12 and W02 in the same window as the libs.

---

## 0. Before any deploy (Jono's go needed: writes a backup on the VPS)

Use the helpers `n8nq`, `n8nmark` and `sbq` from `DEPLOY-RUNBOOK-SMOKE-FIXES.md`. Always run `ssh -n emma-vps` (alias, key only).

1. **The VPS still runs a4a2bff.** `deploy.sh` ships the whole runtime from this branch. If anything newer was deployed since (for example a consolidated `release/v5` or `feat/smc-social-lindi`), merge this branch into that ref first and deploy that instead.
   ```bash
   git -C /c/tmp/lv-instantform show a4a2bff:automation/lib/w07.mjs | sha256sum
   ssh -n emma-vps 'sha256sum /opt/leadvelocity-n8n/repo/automation/lib/w07.mjs'
   ```
   The two hashes must match.
2. **Snapshot.**
   ```bash
   ssh -n emma-vps '/opt/leadvelocity-n8n/backup.sh && ls -t /opt/leadvelocity-n8n/backups | head -1'
   n8nq <<'SQL' | tee "instantform-active-versions-$(date +%Y%m%d%H%M).txt"
   SELECT id, active, "activeVersionId" FROM workflow_entity WHERE id IN ('smc-w02','smc-w12') ORDER BY id;
   SQL
   ```
3. **Quiet window.** No SMC call in the next 30 minutes:
   `sbq "select count(*) from appointments where brand_id is not null and status in ('booked','confirmed') and appointment_date between now() - interval '3 hours' and now() + interval '30 minutes';"` returns 0. The 3-hour look-back keeps a just-finished call's W12 follow-ups out of the restart.

## 1. Runtime libs

- **Command** (Git Bash, from `C:\tmp\lv-instantform`, clean tree): `automation/emma-vps/deploy.sh feat/smc-instantform-consent`
- **Post-check:**
  ```bash
  ssh -n emma-vps 'grep -c CONSENT-GENERIC-v5form /opt/leadvelocity-n8n/repo/automation/lib/w01.mjs; grep -c "export function reachPlan" /opt/leadvelocity-n8n/repo/automation/lib/w12.mjs'
  curl -s -o /dev/null -w "%{http_code}\n" https://n8n.sortmycover.co.za/healthz
  ```
  Expect `1`, `1` and `200`.
- **Rollback:** `automation/emma-vps/deploy.sh a4a2bff`. Re-publish W12 and W02 first (step 2 rollback).

## 2. Import W12, then W02 (straight after step 1)

- **Command:** `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W12 W02'`
- **Pre-check:** both of these show `f`:
  - `n8nmark smc-w12 post_call_message_held`
  - `n8nmark smc-w02 LEAD_AD_CONSENT_TEXT`
- **Post-check:**
  - Both markers show `t`, and both workflows are `active`.
  - The next W12 sweep executions succeed.
  - `n8nq <<< "SELECT status, count(*) FROM execution_entity WHERE \"workflowId\"='smc-w12' AND \"startedAt\" > now() - interval '15 minutes' GROUP BY 1;"` shows no `error` rows.
- **Watch the first evening:**
  ```bash
  sbq "select idempotency_key, payload->>'due_at' as due, occurred_at from lead_activities where activity_type = 'post_call_message_held' order by occurred_at desc limit 20;"
  ```
  Each hold is followed after `due` by a `post_call_message` row with the same key (`payload->>'key'`).
- **Rollback:** re-publish the versions recorded in step 0, then restart:
  ```bash
  ssh -n emma-vps 'cd /opt/leadvelocity-n8n && docker exec lv-n8n-n8n-1 n8n publish:workflow --id=smc-w12 --versionId=<old> && docker exec lv-n8n-n8n-1 n8n publish:workflow --id=smc-w02 --versionId=<old> && ./dc restart n8n'
  ```
  Then ship the old libs if needed (step 1 rollback). Any parked `w12:hold` rows do nothing under the old JSON. Send those messages by hand, or leave them.

---

## 3. Jono: the Meta side (Claude cannot do these)

1. **Accept the Lead Ads terms** for the Sort My Cover Page: facebook.com/ads/leadgen/tos with the Page selected. This is audit section 4 step 5.
2. **Build the form by hand** in Ads Manager: Sort My Cover Page > Instant forms > Create form.
   - Type every string exactly as below; `deliverables/media-buyer/instant-form-spec-v3.json` is the master.
   - Never build the v2 form.
   - If the builder cuts a string, stop and tell Claude. Never shorten the consent text.

| Setting | Value |
|---|---|
| Form name | `SMC_IF_v3_generic_20261022` |
| Form type | Higher intent |
| Language | English (UK) |
| Sharing | Restricted |
| Tracking parameters (optional) | `smc_test` = `if_vs_ctwa_2026_10`, `smc_arm` = `instant_form` |
| Intro image | The ad image (default) |
| Intro headline | `Book a 30-minute call with an authorised adviser` |
| Intro description, layout List | `Answer two quick questions.` / `Lindi from SortMyCover sends you a Start here link on WhatsApp.` / `We'll confirm on WhatsApp: quick answers, no call centre or waiting on hold.` / `You talk to an adviser for 30 minutes, by phone or video.` / `SortMyCover gives no financial advice, product comparisons or premium quotes.` |
| Questions description | `These help the adviser prepare for your call.` |
| Question 1, Custom > Multiple choice | `What would you like help with?` Options: `Life cover`, `Disability cover`, `Income protection`, `Severe illness cover`, `Not sure yet` |
| Question 2, Custom > Multiple choice | `Which age group are you in?` Options: `Under 35`, `35 to 44`, `45 to 50`, `Over 50` |
| Question 3, Prefill | First name, labelled `First name` (not Full name) |
| Question 4, Prefill | Phone number. Rename it to `WhatsApp number` if the builder allows. |
| Not on the form | No email. No budget, income or any money question. No "do you have cover", insurer or policy question. No health, medical or disability-status question. No practice name, adviser name or FSP number. No conditional logic and no disqualifying ending. |
| Privacy policy | Link text `Privacy notice`, URL `https://sortmycover.co.za/privacy/` |
| Custom disclaimer | On. Title `Your consent`. Body `Please read and tick to continue. The second box is optional.` |
| Checkbox 1: required, unticked | `I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp to book and remind me about a call with an adviser from an FSCA-authorised financial services provider, and may share my details with that adviser, who may contact me by WhatsApp or phone about that call. I am 18 or older. I can opt out at any time by replying STOP. Privacy notice: https://sortmycover.co.za/privacy/` |
| Checkbox 2: optional, unticked | `I give SortMyCover permission to use my details in coded (hashed) form to measure and improve its ads on Facebook and Instagram. It will never use them to send me ads by message. This is optional, and the call does not depend on it.` |
| Thank-you headline | `Check WhatsApp` |
| Thank-you description | `Lindi will send you a Start here link on WhatsApp in a moment. Tap it to pick a time for your call.` |
| Thank-you button | View website, text `Chat on WhatsApp`, URL `https://wa.me/27600156480` |

**Notes:**
- **Hand-built keys.** A hand-built form gets checkbox keys that Meta chooses. W01 then treats a ticked box as the consent, which is safe: Meta refuses a submission without the required box. But W01 cannot tell whether the optional ads box was ticked, so `consent_ads_at` stays empty (no CAPI Lead from these leads). To keep the ads choice, create the form through the Graph API instead (`automation/ads/meta-ads.js` `createLeadgenForm`, human confirm token). That sets the keys `consent` and `consent_ads`. Tell Claude which route you want.
- **"Disability cover".** This option names a type of cover the person wants help with. It does not ask about their health. If Meta review rejects it, delete that one option and republish; W01 still maps the others.

3. **Test lead before the ad goes live.** Optional, but recommended.
   - Use the Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing) with a phone number that is on the n8n container's `SYNTHETIC_TEST_NUMBERS`. Any other number gets a real WhatsApp.
   - Then Claude checks the lead row:
     ```bash
     sbq "select consent_text_version, consent_mode, consent_source, consent_ads_at is not null as ads, routing_reason from leads where leadgen_id = '<test leadgen id>';"
     ```
     Expect `CONSENT-GENERIC-v5form | generic | lead_ad | ...`.
   - The `consent_audit` activity shows `matches_registry: true`.
   - Clean up the test lead with the smoke-test cleanup SQL. That needs your go.
4. **Publish Mark's Instant Form ad.** This is your step: publishing ads and Meta settings stay with you. Under adviser-ads rules, no adviser is named on the ad until he approves.

## What the lead then gets

- **First WhatsApp:** `start_here` within 60 seconds. It answers her own submit, so it is not held.
- **`/start/`:** the adviser card names the adviser, firm and FSP before any routing. The consent is generic, so `routeExisting` never hands her to a broker before `adviser_disclosed` is logged for that broker.
- **After the call:** the W12 messages, inside the contact hours only.
