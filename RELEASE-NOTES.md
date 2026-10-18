# Release notes

## release/all-2026-10-18

One release containing the site release (master 8102ffd, incl. /start/), the CRM release
(release/crm-2026-10-18: opt-in provenance, types and lint, client email split, password reset, /login removal),
the live n8n line (feat/smc-lead-alert 19a38ac) and the /start/ page API (feat/smc-start-api 7622cd4).

### Database: never `supabase db push` for this release

The live migration history (`supabase_migrations.schema_migrations`) and `supabase/migrations/` do not match:

- **15 migration versions in the repo are applied live but not recorded** (applied by hand with `db query`).
  `db push` would run them all again.
- **44 recorded live versions have no file in the repo**, so `db push` also refuses or mis-plans.
- **Two files share version `20261013200000`** (`broker_change_requests`, `einstein_kb_refresh_cron`).
  The history can hold that version only once.

All of these were checked live on 18 Oct 2026 (one object per migration, read-only), apart from `20261018120000`:

| Version | File | Live object checked |
|---|---|---|
| 20261012120000 | broker_documents | `admin_documents.broker_id` and both broker document policies |
| 20261012180000 | broker_self_service | `whatsapp_confirmed_at` column |
| 20261013090000 | broker_go_live | `approved_live_by` column |
| 20261013100000 | client_invite_from_outlook | `brokers.add_client_as_attendee` default |
| 20261013140000 | broker_onboarding_activity_log | `log_broker_onboarding_change()` |
| 20261013160000 | broker_bio_review_card_approval | `broker_decide_bio_suggestion()` |
| 20261013170000 | fix_broker_onboarding_log_array | `log_broker_onboarding_change()` (replaces 140000's body) |
| 20261013180000 | smc_voice_callback_cron | cron job `smc-voice-callback-tick` |
| 20261013190000 | broker_ad_consent_and_approval | `broker_set_ad_likeness_consent()` |
| 20261013200000 | broker_change_requests + einstein_kb_refresh_cron | `lv_notify_emma()` and cron job `einstein-kb-refresh` |
| 20261013220000 | broker_messages | table `broker_messages` |
| 20261014010000 | n8n_app_user_roles_select | `n8n_app` SELECT on `user_roles` |
| 20261017120000 | relay_tokens | table `relay_tokens` |
| 20261017150000 | lead_optins | table `lead_optins` |
| 20261018120000 | smc_brand_start_page | **not applied yet**: apply by hand (below) |

**Apply the one new migration by hand** (it is idempotent; brands.start_page defaults to 'off'):

```bash
npx supabase db query --linked --project-ref cmsylaupctrbsvzrgzwy -f supabase/migrations/20261018120000_smc_brand_start_page.sql
```

**Then record the history** (writes only to the history table, runs no SQL; needs Jono's OK):

```bash
npx supabase migration repair --status applied --linked --project-ref cmsylaupctrbsvzrgzwy 20261012120000 20261012180000 20261013090000 20261013100000 20261013140000 20261013160000 20261013170000 20261013180000 20261013190000 20261013200000 20261013220000 20261014010000 20261017120000 20261017150000 20261018120000
```

The two broker-guard migrations were renamed to their live versions (20261014110757, 20261014143717),
which are already recorded. Do not re-apply them.

### Deploy list

- **Vercel (leadvelocity.co.za):** CRM frontend from this branch (`lv-deploy-portal`, detached checkout, `npx vercel --prod`).
- **SortMyCover site (Hostinger):** `sites/` is identical to master 8102ffd. Upload only if that build is not live yet.
- **Edge functions, needed for behaviour:** `send-communication`, `send-bulk-communication` and `book-appointment`
  (the client and broker email split; the live copies are from 14 Oct).
- **Edge functions, optional:** the rest of the changed functions are type annotations only, with no behaviour change.
- **n8n:** import `automation/W01.json`, `W03.json`, `W07.json` and the new `W39.json` from feat/smc-start-api.
  Everything else in `automation/` equals the live feat/smc-lead-alert.
- **Twilio Content:** create `smc_start_cta` (`automation/templates/twilio/content/smc_start_cta.json`).
- `brands.start_page` stays 'off' until an admin switches it on.
- **Never deployed, leave as is:** `gemini-proxy`, `telegram-webhook`, `w34-media-erase`.
