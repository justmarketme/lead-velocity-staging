# Portal prototypes (static, phone-first, no frameworks)

Open any `*.html` directly. Styling: `portal.css` imports `../../brand/tokens.css` (no hex values in these files except the Microsoft logo squares, which are Microsoft's). Not yet viewed in a browser (no browser in the build sandbox); markup was checked for well-formedness only. Dates and names are fictional (Mark Williams, FSP 00000). Links to `../intro-media/` and `../../checkout/` are placeholders for other agents' pages. The intro card page is shown inside `profile.html#card`.

Transport below is a suggestion: inside the React CRM the same writes go via Supabase under RLS or a SECURITY DEFINER function; platform-architect decides. Every write is on the broker's own row only.

| Page | Reads | Writes | Events to W20 |
|---|---|---|---|
| `start.html` | `brokers.status, onboarding_step, onboarding_progress, explainer_watched_at, next_free_slot_at` | `first_login_at` (once), `last_seen_at` (60 s heartbeat), `explainer_watched_at` at 90% played | none |
| `profile.html` | `practice_name, fsp_number, adviser_name, adviser_whatsapp, email, headshot_url, bio_short, languages, years_advising, fsp_check, broker_media(kind=card)` | same columns; headshot to private bucket; card approval -> `broker_media.approved_at`, `intro_card_url` | `fsp.submitted`, `step.completed(profile)`, `card.approved` |
| `calendar.html` | `calendar_status, next_free_slot_at, meeting_hours, methods_supported, max_meetings_*, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, bookings_paused`; W04 `GET /slots?limit=1` | `meeting_hours, methods_supported, max_meetings_per_day/week, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, bookings_paused, calendar_mode`; OAuth callback writes `calendar_token_ref, ms_tenant_id, calendar_id, calendar_status` | `calendar.connected`, `calendar.failed{reason}`, `step.completed(availability)` |
| `agreement.html` | `admin_documents(kind=agreement)`, `cycles`, `invoices`, `pricing` | sign: `admin_documents.signed_at, signed_by_name, signer_ip, signed_user_agent, doc_sha256` + acceptances; `brokers.signatory_name/role, fb_page_name/id`; `card_autorenew` | `agreement.signed{signed_url, doc_sha256, signed_by_name}` |
| `leads.html` | `v_cycle_progress`, `bookings`+`leads` (own), `outcomes`, `replacements`, pre-call brief | `outcomes(outcome, disposition_code, quality_score, voice_note_url)`; codes `fit_proceeding, fit_followup, nofit_budget, nofit_covered, nofit_criteria, unreachable` | triggers W12/W29/W13 |
| `reports.html` | `reports.payload_json` for the week | `reports.opened_portal_at, ask_done_at`; `brokers.close_rate, avg_commission`; `cycles.policies_written_reported` | none |
| `help.html` | `knowledge/faq.md`, clip list | `support_events` | none |

All events are signed webhooks (see `portal/spec/README.md`). Prototype deviations from the approved report design (`docs/design/broker-weekly-report.html`): emoji dropped; NH-19 disposition labels used in the quality bars; cycle dates made consistent (day 14 = Mon 12 Oct implies end Wed 28 Oct, the mock said Mon 26); ROI line shows its arithmetic; "Not marked" shown as "Unconfirmed" because unmarked meetings auto-record as attended after 24 h (4.12a).
