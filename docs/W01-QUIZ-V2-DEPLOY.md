# Deploy: W01 / W03 / W05 for SortMyCover quiz v2

Spec: `lv-site/deliverables/website/quiz-v2-and-whatsapp-step.md` section 2a. **Deploy this before the quiz v2 site** (lv-site `site-research` a206f12). If the site goes first, live W01 disqualifies every web lead and deletes it after 24 h.

## What changes

| Piece | Where it runs | Change |
|---|---|---|
| `automation/lib/w01.mjs` | loaded live by W01 through `lv-automation` | A web lead with `budget_pending` and no band is routed (provisional tier B) instead of disqualified. It still gets the `lead_token`, and `help_with` goes into `leads.conv_state`. **`W01.json` is unchanged**, so it does not need to be re-imported. |
| `automation/lib/w05.mjs` | loaded live by W05 | A booking is handed over only when the email is verified **and** `budget_band` is set. Otherwise the slot is held. `finalizeRequest` now needs the band too. |
| `automation/W05.json` | n8n | The finalize load query also reads `l.budget_band`. |
| `automation/W03.json` | n8n (w03.js is inlined) | Adds `750_1499` to QUAL_BUDGET and adds the 4-option v2 band list. A band answer from a provisionally routed web lead now calls W05 `op: finalize`. Load context now reads `l2.origin`. |

## Order (VPS, `/opt/leadvelocity-n8n`)

The commits contain `lib/w05.mjs` and `W05.json`. As soon as the new lib is live, W05 finalize reads `budget_band`. So import W05.json **immediately** after the deploy. Do it when no bookings are in flight. On 13 Oct the CRM had 0 SMC leads.

1. From the laptop, at the repo root of `lv-release`, run `automation/emma-vps/deploy.sh <commit>`.
   - It ships every committed file under `automation/` at that ref, including other sessions' commits on `release/smc-nurture`. Check `git log` first.
   - It recreates the n8n container, so W01 and the W05 lib are live from this point.
2. Import and publish W05, then W03. Run each in its own process (a shared tag breaks a folder import):
   ```
   ssh root@76.13.252.92
   cd /opt/leadvelocity-n8n
   ./dc exec n8n n8n import:workflow --input=/repo/automation/W05.json
   ./dc exec n8n n8n import:workflow --input=/repo/automation/W03.json
   ./dc exec n8n n8n publish:workflow --id=smc-w05
   ./dc exec n8n n8n publish:workflow --id=smc-w03
   ./dc restart n8n
   ```
   An import leaves a workflow inactive. Confirm both are active again in the editor.
3. Smoke test with a synthetic number and test hooks. POST `/lead` with no `budget_band`, plus `budget_pending: true` and `help_with: "review"`. Expect:
   - `status: accepted` with a `lead_token`
   - a lead row with a `broker_id` and `conv_state = {state:"q_reason", budget_pending:true, help_with:"review"}`
   - `/book` with an email returns `held: true, verify: "email"`
4. Then deploy the quiz v2 site.

## Rollback

1. Run `automation/emma-vps/deploy.sh <previous commit>`. Alternatively, on the VPS: `mv repo repo.bad && mv repo.old repo && ./dc up -d --force-recreate n8n`. Keep `repo/.env`.
2. Re-import the previous `W05.json` and `W03.json`. On the laptop, run `git show <previous>:automation/W05.json > /tmp/W05.json` (same for W03), copy them to the VPS, then import and publish as in step 2.
3. **Roll back the quiz v2 site first** (or keep it undeployed). The old W01 disqualifies v2 leads.

## Still open (not in this change)

- **WhatsApp reason step (spec section 3).** W06 first touch, W07 routing of `q_reason` / `q_reason_note`, and the step that moves a lead to `q_budget` are not built. Until then nothing asks a v2 lead for the band, so its booking stays held until `verify_by` and is then released. The fallback is spec section 4: one tap on the email-confirm page (`SUB-email-verify`).
- **Under R750 after routing.** The database trigger `smc_leads_route_check` un-routes the lead to `held_low_budget`. W03 does not send `lead_low_budget_held`, and the held slot waits for the release sweep.
- **Wills band.** Whether wills leads need a band is an open decision for Jono (spec section 3). With this change, a wills booking is held until a band is known.
