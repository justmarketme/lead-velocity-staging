# SortMyCover console and broker portal (UI) — platform-architect

**Date:** 2026-10-02 · **Status:** built inside the existing React/Vite CRM (0.2 reuse; INV-01, INV-P11, INV-S01–S17). Everything sits behind `VITE_SMC_ENABLED` (default off). No new npm dependencies. Nothing calls Supabase live or Meta; the migrations (`supabase/migrations/20261002_smc_02…07`) are the data contract and are **not applied** (NH-11/NH-15).

## Files
| Path | What |
|---|---|
| `src/lib/smc.ts` | Flag (`SMC_ENABLED`), env (`VITE_N8N_WEBHOOK_BASE`, `VITE_MS_OAUTH_URL`, `VITE_MS_ADMIN_CONSENT_URL`, `VITE_SMC_CHECKOUT_URL`, `VITE_SMC_INTRO_MEDIA_URL`, `VITE_SMC_EXPLAINER_URL/_VTT`, `VITE_SMC_CLIPS_BASE`, `VITE_SMC_SUPPORT_WA`, `VITE_SMC_MEDIA_BUCKET`), untyped `smcDb` / `opsDb()` accessors over the existing Supabase client, `postWebhook()` (sends the caller's Supabase JWT, no secret in the browser), formatters (Africa/Johannesburg, `R16,500`), 4.12a dispositions with NH-19 labels, the 7 onboarding steps (portal/spec README), the 11 faculties (slos.json), `useIsAdmin` (has_role, INV-F02), `useCurrentBroker` (brokers.user_id = auth.uid(), 60 s `smc_portal_touch` heartbeat), `portalEvent()` → `smc_portal_event`, light no-advice pre-check |
| `src/integrations/supabase/smc-types.ts` | Hand-written row types: brokers ext, pricing, cycles, leads ext, bookings view, outcomes, replacements, invoices_smc, admin_documents e-sign, broker_media, ad_metrics, ad_objects, reports view + `broker_report/1` payload, v_cycle_progress, ops.pulses/proposals/signals/notifications/quality_grades/judge_runs/build_state_latest, `smc_watchlist_tiles()` row, Ask and ads-confirm webhook shapes. Replace with generated types once migrations are applied |
| `src/pages/smc/ConsoleLayout.tsx`, `Sparkline.tsx`, `Today.tsx`, `Ads.tsx`, `Ask.tsx` | Admin console (CRM theme from `src/index.css`, no brand colours) |
| `src/pages/portal/PortalShell.tsx`, `portal.css`, `SmcBrokerSwitch.tsx`, `Start.tsx`, `Profile.tsx`, `IntroCard.tsx`, `IntroMedia.tsx`, `Calendar.tsx`, `Agreement.tsx`, `Leads.tsx`, `Reports.tsx`, `Help.tsx` | Broker portal inside the existing `BrokerLayout`, SortMyCover kit: imports `brand/tokens.css`; `portal.css` is the approved `portal/prototype/portal.css` scoped under `.smc-portal` |
| `src/components/broker/BrokerLayout.tsx` | One backward-compatible change: optional `menuItems` prop (omitted = legacy menu, unchanged) |
| `src/App.tsx` | Lazy SMC routes, mounted only when the flag is on (CRLF preserved) |

## Routes (flag on)
- Console (admin; non-admin sees a refusal, no session → `/admin`): `/console` (Today), `/console/ads`, `/console/ask`.
- Portal, SMC-only: `/broker/start`, `/broker/intro-card`, `/broker/intro-media`, `/broker/agreement`, `/broker/billing` (same page), `/broker/help`.
- Portal, shared with legacy: `/broker/leads`, `/broker/calendar`, `/broker/reports`, `/broker/profile` go through `SmcBrokerSwitch`. A broker with `brokers.brand_id` set gets the SMC page; every other broker gets the legacy page, unchanged. With the flag off these four routes render the legacy pages exactly as before.

## Data contract per screen
| Screen | Reads | Writes |
|---|---|---|
| Today | `ops.pulses` (latest 14 → card + history), `ops.proposals` (by `pulse_date`), `ops.signals` (open → signals list + 11-faculty status: burning=red, any=amber, none=green), `ops.quality_grades` (48 h) + `ops.judge_runs`, `ops.build_state_latest` (fallback `pulses.build`, then static text), RPC `smc_watchlist_tiles(p_include_synthetic)` (7 tiles: value · target · 7-d-ago · 28-day inline-SVG sparkline · n; grey under n = 20) | `ops.proposals` status approved / snoozed (+7 d) / declined (reason, CHECK-enforced) + one `ops.notifications` outbox row (kind `approval`, payload `{decision, proposal_id, decided_by, reason}`); judge "turn into fix" inserts `ops.proposals` (source `judge`) |
| Ads | `ad_metrics` (window 1/7/14/28 d, aggregated campaign→ad set→ad; headline cost/qualified and cost/attended, raw CPL secondary, quality from n ≥ 5), `ad_objects` (status, daily budget) | Confirm-to-apply via n8n only: `POST {base}/ads-confirm` → preview → `POST {base}/ads-ad-status` or `{base}/ads-budget` with `confirm_token` + `confirmed_by`. Reason required. Error codes are mapped to plain words |
| Ask | — | `POST {base}/ask {question}` → card: headline, comparison, caveat, how computed (SQL, expandable), next question; "Not enough data yet (n = X, need 20)" when `n_min < 20` |
| Start | own `brokers` (status, onboarding_progress, explainer_watched_at, next_free_slot_at, fsp_check, calendar_status) | `smc_portal_event` step.completed / step.skipped (video at 90 %); `smc_portal_touch` |
| Profile | own `brokers` | own `brokers` (firm_name, contact_person, whatsapp_number E.164, email, fsp_number until verified, bio_short, languages, years_advising, headshot_url, practice_legal_name); headshot → storage `VITE_SMC_MEDIA_BUCKET`; events profile.saved, fsp.submitted; polls the row for the W20 FSCA result (verified / blocked / name-mismatch "Yes, that's us" / pending_manual) |
| Intro card | `broker_media` kind=card | `smc_portal_event('card.approved')` (W20 writes approved_at / intro_card_url; the guard blocks the broker) |
| Voice & video | `broker_media` voice/video | links to `portal/intro-media/`; step.skipped(media) |
| Calendar | own `brokers`; `GET {base}/slots?limit=1` (fallback `next_free_slot_at`) | Microsoft button → `VITE_MS_OAUTH_URL?return_to=`; admin-consent fallback (copy link, IT email draft, `calendar.fallback_chosen`); hours/methods/capacity/pause → own `brokers`; availability.saved + step.completed(availability) |
| Agreement & billing | `admin_documents` kind agreement/authorisation_letter, `cycles`, `pricing` (active), `invoices_smc` | `smc_sign_document` (typed name, SHA-256 of the stored file or content, user agent; version guard re-reads before signing), Annex 1 letter signed too; signatory and FB Page fields → own `brokers`; acceptances + hash in step.completed(agreement). Three pay links to `VITE_SMC_CHECKOUT_URL?tier=&pay=instant_eft|manual_eft|card_autorenew&cycle=next`; tier change; copy says "no lock-in" |
| My leads | `v_cycle_progress`, `bookings`, `leads` (own), `outcomes`, `replacements` | `outcomes` insert/update (outcome → disposition → quality 1–5; marked_via `portal`) + `outcome.marked` |
| Reports | `reports` (payload_json is the only source of numbers, 8 sections, history) | `smc_mark_report_opened`, `smc_report_ask_done` + deep link, `brokers.close_rate` (stored as a fraction) / `avg_commission_zar` |
| Help | static clips + FAQ (mirrors knowledge/faq.md) | `smc_portal_event('support.message')` → `support_events` |

## Stubbed or pending
- Until migrations 01–07 are applied every query returns an error. Each section shows "unavailable: …" instead of crashing, and `SmcBrokerSwitch` falls back to the legacy pages.
- Console `ops.*` reads need `ops` added to the exposed API schemas (NH-22).
- n8n endpoints not built yet: `ask`, `ads-confirm`, `ads-ad-status`, `ads-budget`, `slots` (with broker JWT), `billing-autorenew`. With no `VITE_N8N_WEBHOOK_BASE` the buttons say "not connected yet".
- The faculty strip shows status and open-signal counts only. Values and sparklines per faculty need an admin RPC over `facts.pulse_daily`.
- Static assets are not served by the Vite build yet: the explainer video and VTT, the step clips, `portal/intro-media/` and `billing/checkout/`. Their URLs are set by env vars.
- Gaps against the specs:
  - The portal voice note is not recorded here. Brokers reply on WhatsApp instead.
  - "Policies written" is shown read-only.
  - The pre-call brief shows quiz and preference columns only. The lead's own question is not stored on any readable column.
- Screenshots were not possible because there is no browser in the sandbox. The layouts follow `pulse-mock.html` and `portal/prototype/*.html`: same section order, same copy and the same CSS classes.

## Verification
- **TypeScript:** `npx tsc --noEmit -p tsconfig.app.json` reports 39 errors, all pre-existing in legacy files. The error list is identical before and after this change, and none of the errors is in an SMC file.
- **Lint:** `eslint` on the SMC files and the two touched files is clean.
- **Build, flag off:** `npm run build` passes.
- **Build, flag on:** I did not run it before the turn limit. The coordinator reports it as verified.

## Left to do
1. Apply the migrations (NH-11/NH-15), expose `ops` (NH-22), regenerate `types.ts` and drop the casts.
2. Build the n8n webhooks listed above. They must verify the Supabase JWT, and n8n must consume `ops.notifications` kind `approval` rows (W32).
3. Serve the static media, intro-media and checkout under the app domain.
4. Add magic-link login (INV-A01 is password-only today).
5. Do one browser pass at 360 px and on desktop.
