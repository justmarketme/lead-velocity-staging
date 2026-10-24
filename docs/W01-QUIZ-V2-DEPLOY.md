# Quiz v2 on n8n: W01 / W03 / W05 (deployed 14 Oct 2026)

Spec: `lv-site/deliverables/website/quiz-v2-and-whatsapp-step.md`. Site: lv-site `site-research` a206f12 (quiz v2), zip `lv-site/smc-dist-v2.zip` (built from 01984e5).

**Deploy order: n8n first (done 14 Oct 02:10 SAST, commit d1acf1a), then the site.** If the site goes first and n8n is old, every web lead is disqualified and deleted after 24 h.

## What the flow is now

1. The quiz posts `/lead` with `budget_pending: true` and `help_with` (no band, no email).
2. **W01** saves the lead (routed provisionally as tier B, or held when no broker is free) with `conv_state = {state: 'q_budget', budget_pending: true, help_with}`.
   It sends the page its `lead_token` as before, and **asks the band on WhatsApp**: the approved `smc_qualify_budget` template (HX5a0030506140a58a86e8611f15a5af64) through `smc-whatsapp-send`, five buttons: Under R500, R500 to R750, R750 to R1,250, R1,250 to R1,499, R1,500 or more. Correlation `w01:ask_budget:<lead>` makes it once. W06 still does the disclosure first touch.
   Wording is forward-looking ("what could you put towards cover each month"); nothing asks what the person pays now.
3. The visitor books on the page and gives the email. **W05** holds the slot (`pending_verification`), because a booking is handed to the adviser only when the email is verified AND `budget_band` is set.
4. The button tap arrives on the sender's inbound webhook (W07). `q_budget` is already a qualifying state, so W07 sends it to **W03**. W03 `finishPageBudget`:
   - records the band; for tier A/B also `qualified_at` and `stage = 'qualified'` (the page gave age and reason, WhatsApp gives the band); tier C (under R750) records the band only,
   - `route_and_first_touch`: a no-op for a routed lead; a lead held at intake is routed now; a tier C lead that the database re-held gets the one `lead_low_budget_held` message,
   - W05 `op: finalize`: the held booking is handed over if the email is already verified. If the email comes later, the email-verify step runs the same finalize (band first or email first both work).
5. A qualified lead whose broker has no bookable calendar and who has no live or held appointment becomes an **appointment request** in the CRM queue through the existing `appointment_request_sweep()` job (every 10 min). A held slot is not a request; once the hold is released, the lead is one.

The reason list and notes from spec section 3 are **not built**: the reason is the page's `help_with` (kept in `leads.conv_state.help_with`), and WhatsApp asks only the band.

## What changed in the repo (d1acf1a)

| Piece | Change |
|---|---|
| `lib/w01.mjs` | `conv_state.state = 'q_budget'` (was `q_reason`, which nothing handled) for routed AND held page leads; `decision.budget_question`; **`leads.source` is now `'Campaign Lead'`** (see "Found on the way"). |
| `W01.json` (rebuilt) | New IF "Quiz v2: ask the band on WhatsApp?" feeding the existing Budget question -> WhatsApp Send (qualify_budget) nodes. |
| `ctwa/w03.js`, `W03.json` (rebuilt) | `finishPageBudget` as above. The 4-option list and the "current premium range" wording are removed: one list (the template's five bands). Update-lead SQL moves `stage` only forward from `new/disclosed/verified/qualified` (`disqualified`/`opted_out` from any stage). |
| `lib/w05.mjs` | Band labels for `lt750` and `750_1499` in the broker notice. `W05.json` (34bb757) reads `l.budget_band` in the finalize query. |

## Found on the way (both were blocking every lead, not only quiz v2)

1. **`leads_source_check` rejected `'LV Campaign'`**, the value W01 wrote for every web and lead-ad lead. No lead could be saved. Fixed in code (`'Campaign Lead'`, an allowed value and the CRM picklist value); confirmed live (two synthetic leads saved).
2. **n8n_app cannot read `public.communications`**: the legacy "Admins can ... communications" policies (TO public) read `user_roles`, and n8n_app has no SELECT on it, so `smc-whatsapp-send` fails at its first SQL step ("permission denied for table user_roles"), dry-run included. **Migration `20261014010000_n8n_app_user_roles_select.sql` (one GRANT, undo in `undo/`) is in the repo and NOT applied: DDL is Jono's gate.** Until it is applied, no n8n WhatsApp send can be recorded. `user_roles` has RLS on and `authenticated`-only policies, so the grant shows n8n_app zero rows.

## Live state after the deploy (14 Oct)

Active workflows: **`smc-w01`, `smc-w36`, `smc-whatsapp-send`** and nothing else. W03 and W05 (and W01) were re-imported; W03/W05 stay inactive (W07, the inbound webhook, is also inactive, so no reply can reach n8n yet: activating W07, W03, W05, W04, W06 and the rest is part of go-live). `DRY_RUN_SENDS=true` untouched.
Live webhook test (synthetic, flagged `is_synthetic`): `+27820000111` quiz v2 payload -> `{"status":"held"}`, lead saved with `conv_state q_budget`, `budget_question_pending` on the timeline, and the sender was handed template `qualify_budget`, the five tap ids and `w01:ask_budget:<lead>`; it then failed on the missing grant (above), so nothing was recorded or sent. `+27820000112` v1 payload (band on the page) -> saved, unchanged. Held, not routed, because the only SMC broker (Oracle Brokers) is not active/routing yet.

## Offline proof

`node --test automation/tests/quiz-v2-band.local.test.mjs` (Docker, throwaway Postgres on the repo migration chain, every node SQL run as `n8n_app`): v2 payload saved and routed; band question built for the shared sender (dry, and the live Twilio request shape); a held page booking; band tap -> band, qualified, route no-op; `finalizeRequest` null before the band and a `book` request after; broker notice shows the band; no-free-broker lead is still asked and routed by the tap; under R750 is re-held by the database with the one honest notice and is not qualified; a released hold of a qualified lead with no bookable calendar appears in `appointments` as `requested` and its lead carries the band; a lead with no band is not queued. `W01.test.mjs` and `W03.test.mjs` cover the same logic offline.

## Rollback

1. On the VPS the runtime before this deploy is `/opt/leadvelocity-n8n/repo.old` (deploy.sh keeps one generation): `cd /opt/leadvelocity-n8n && mv repo repo.bad && mv repo.old repo && ./dc up -d --force-recreate n8n`. `repo/.env` travels with each generation. (Or `automation/emma-vps/deploy.sh 34bb757~1` from the laptop, which ships the state before the quiz v2 work.)
2. Re-import the previous `W01.json`, `W03.json`, `W05.json` (`git show <previous>:automation/W01.json > /tmp/W01.json`, copy to the VPS, `n8n import:workflow`), then `n8n publish:workflow --id=smc-w01` and `./dc restart n8n`. An import leaves a workflow inactive.
3. Roll back the quiz v2 site first (or keep it undeployed): the old W01 disqualifies v2 leads.
4. A backup of the n8n database was taken at 14 Oct 02:09 SAST (`/opt/leadvelocity-n8n/backups/n8n-20261014T000927Z.dump`).

## Still open (decisions for Jono)

- **Apply the n8n_app grant migration** (above). Nothing sends until then.
- **Page copy vs WhatsApp**: the quiz's "What happens next" says WhatsApp asks "what you would like to talk about", and the terms (TU-v1.2-web) say WhatsApp asks "the main reason for your call and a rough monthly amount band". WhatsApp asks only the band. Either build the reason list, or change that one line and the terms sentence.
- **No reminder** for a web lead who never taps (spec: one after 3 h). A held slot that is not finalized is released at `verify_by` with the existing "rebook" nudge, whose text speaks about the email only.
- **"Not sure" twice** closes the lead as out of band (the current W03 rule), also for a page lead who already booked. The approved template has no "not sure" button; only a typed answer can get there.
- **Wills leads** are also held until a band is known (the band is asked for every v2 lead). Whether wills need a band is still open (spec section 3).
- **Under R750 after the band**: the database re-holds it (`held_low_budget`) unless the broker has the standing yes; the held slot waits for the release sweep.
- W07 (inbound), W03, W05, W04, W06, W15 etc. must be activated at go-live for a tap to reach W03; the sender is ONLINE (checked 14 Oct) and `brands.phone_number_id` is `27600156480`.
