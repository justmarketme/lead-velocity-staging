# Portal spec vs build: gaps (broker-success, 2026-10-02)

Source of truth for the build: `deliverables/platform-architect/console-portal.md` and the migrations 02-08. Where the build was the better answer the spec now says so (acceptances on the signed document, server-side signer IP, policies via RPC and portal-only, `/s/calendar` and `/s/billing`, one initials-only PDF). What follows is every spec line the build does **not yet** meet. Nothing here blocks Mark's go-live except G-02 and G-03 (hard gates in the checklist).

| ID | Spec | Gap | Owner | Blocks go-live? |
|---|---|---|---|---|
| G-01 | 01, 02, 10, README: magic-link login | Not built; INV-A01 is password-only. Welcome message and "Open my portal" button assume a one-tap link. `first_login_at` is set on the first password login | platform-architect (Supabase `generateLink` + landing route); W20 "Make magic link" already calls admin generate_link | No (password works), but breaks "no re-entering, no call" |
| G-02 | 05: `GET /slots?broker_id&limit=1` with broker JWT, W04 | n8n `slots` endpoint not built; portal falls back to cached `next_free_slot_at` so the "next free slot" proof is stale | automation-engineer | Yes in effect (calendar step is "done only when a slot is returned") |
| G-03 | 02: FSCA lookup `FSCA_REGISTER_URL` normalised shape | Mechanism for querying the register unknown (NH, offline); FSP format (3-6 digits) still an ASSUMPTION | automation-engineer (adapter), Jonathan (Mark's real FSP) | Yes (verify before routing) |
| G-04 | 01: video MP4 + VTT, 9 chapters, 9:16 variant; step clips on every page; one-page checklist PDF | Static assets not served by the Vite build; env URLs only | visual-producer, platform-architect (static hosting) | No |
| G-05 | 04: record voice/video in the portal | Not recorded in the portal; brokers reply on WhatsApp. Audio routing rule now stated in 04 | intro-media-producer, platform-architect | No (media never blocks) |
| G-06 | 05 Part A: Microsoft OAuth callback, vault token, `calendar.connected`, admin-consent fallback and shared calendar | Portal side built (button, copy, fallback chosen event); callback, token vault and `SHARED_FALLBACK_CALENDAR_ID` path are not | devops-security, automation-engineer | Yes (calendar is a hard step) |
| G-07 | 06: tier change, `billing-autorenew` webhook | n8n endpoint not built ("not connected yet" shown) | billing-automation | No (manual EFT and Instant EFT work) |
| G-08 | 06: Lead Velocity countersignature at generation (`lv_signed_at`) | Not in the build notes; assumed Jonathan pre-signs | contracts-drafter, Jonathan (NH-BS-04) | Yes (agreement) until decided |
| G-09 | 07: pre-call brief shows the lead's own question | Not stored on any readable column; brief shows quiz and preference columns only | platform-architect (column or view), conversation-designer | No |
| G-10 | 07: "leads who said they weren't reached" row, edit rules, W29 "what changed" line | Not confirmed in the build notes | platform-architect | No |
| G-11 | 08: PDF 2 pages, Chromium print of the email builder's HTML; `scripts/build-broker-report-email.mjs` | Script not written; portal `/r/<id>/print` is an on-screen view | automation-engineer, analytics-reporter | No (first report is Monday after go-live) |
| G-12 | 08: `reports.edition`, drop `policies_reported` / `tracking_to` from stored payload | Open in automation-engineer summary; W14 owner must strip them (NH-43) | analytics-reporter | No, but a FAIS/POPIA item: fix before first report |
| G-13 | 09: `help_events`, `support_events` | `support.message` event writes `support_events`; clip play/complete logging (`help_events`) not confirmed | platform-architect | No |
| G-14 | 01-09: 360 px browser pass | Never done (no browser in the sandbox) | platform-architect | No |
| G-15 | 10: quiet hours 19:00-08:00 | W20 matches (19:00); the old test allowed up to 20:00 and is now tightened | none (fixed) | - |
| G-16 | README: migrations 01-08 applied, generated types | Not applied (NH-11/NH-15); every portal query errors until then, legacy fallback shows | platform-architect, Jonathan | Yes |
| G-17 | 10: `proposed-templates.json` names `broker_onboarding_*` | Submitted files are `broker_onb_*` (I-07). W20.json already sends `broker_onb_*`; the proposals file still shows the old names | broker-success (note only; file kept as history) | No |
