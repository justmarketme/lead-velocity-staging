# Broker portal: specs (broker-success)

Owner: broker-success (Head of Broker Onboarding). One Markdown per page. The portal is a role-scoped view inside the existing React/Vite CRM (0.2, crm-gap §B2). These files say what each page shows, writes and says. React implementation is a later platform task.

| # | Page | Spec | Prototype | crm-gap §B2 |
|---|---|---|---|---|
| 1 | Start here | `01-start-here.md` | `../prototype/start.html` | new |
| 2 | Profile | `02-profile.md` | `../prototype/profile.html` | extend `BrokerProfile.tsx` |
| 3 | Intro card | `03-intro-card.md` | `../prototype/profile.html#card` | new |
| 4 | Voice note and video | `04-voice-note-and-video.md` (links to `portal/intro-media`) | not mine | new |
| 5 | Calendar and availability | `05-calendar-and-availability.md` | `../prototype/calendar.html` | extend `BrokerCalendar.tsx` |
| 6 | Agreement and billing | `06-agreement-and-billing.md` | `../prototype/agreement.html` | extend `BrokerDocuments.tsx` |
| 7 | My leads | `07-my-leads.md` | `../prototype/leads.html` | extend `BrokerLeads.tsx` |
| 8 | Reports | `08-reports.md` | `../prototype/reports.html` | extend `BrokerReports.tsx` |
| 9 | Help | `09-help.md` | `../prototype/help.html` | new |
| - | Nudges, prompts, go-live gate | `10-nudges-and-go-live.md` | - | W20 |
| - | Proposed new WhatsApp templates | `proposed-templates.json` | - | for automation-engineer |

Four things from the true north govern every page: which of the five inspirations would do this, and why? (Intercom/Appcues: next step obvious and short. Loom/Wistia: help lives on the step, captioned. Lemonade: one question at a time, says what happens next. Calendly/Microsoft: show the result at once. FSCA register: verify before any lead is routed.) If none would, we do not build it.

## Rules that apply to every page
1. **Mobile first, one task per screen.** Primary button full width, 48 px high. Every page works at 360 px wide. No horizontal scroll. Brand tokens only (`brand/tokens.css`), DM Sans.
2. **Enter once, never twice.** Every field writes straight to the `brokers` row (or `broker_media` / `admin_documents` / `outcomes`) on blur or on the page's Save. A field already known (email from the magic link, practice name from the invoice) is pre-filled and never asked again.
3. **Grade 7 plain English, Lemonade register.** Short sentences. Say what happens next. Say why we ask. No jargon: no CPL, EMQ, CAPI, attribution, "funnel", "SLA". First person for the broker ("your meetings"). We call it a "meeting" or "call", never "appointment" as the unit sold. Never "guaranteed" (we say "committed"). Never "best", "cheapest", "#1". No emoji. We never describe the adviser as "our adviser" (the adviser is the broker's own).
4. **Help lives on the step.** Each page has one 30-45 s captioned clip, embedded under the heading, plus a "message us" link. Clips are screen-recorded from the real portal by Playwright and re-rendered when the page template changes (see `deliverables/broker-success/explainer-script.md`, "Re-render rule").
5. **Everything the broker signs or receives** (agreement, invoices, payment reminders, welcome) is sent from, and copied to, **howzit@leadvelocity.co.za** (4.10 item 0). One audit trail.
6. **POPIA in the portal:** full lead names appear only inside the logged-in portal. Outside it (WhatsApp, email, PDF sent by email) a lead is first name + initial.
7. **Health or ID details a lead gave in chat never show anywhere**, including briefs: the brief says "has a health question for you" (2.1.7).
8. **FAIS:** nothing the portal says or generates may name a product, insurer, premium, cover amount, return, or advise. Policies written is voluntary, broker-entered, ROI view only; never in any fee, ranking, or alert (2.1.1, 3.7).

## Defaults (written to the `brokers` row at creation by W16, so the broker never starts from blank; 0.3 #12)
| Field (column) | Default | Why |
|---|---|---|
| `meeting_hours` | Mon-Fri 09:00-17:00 Africa/Johannesburg | A normal week; "Looks right" is one tap |
| `max_meetings_per_day` | 3 | Keeps a broker from being overbooked on day one |
| `max_meetings_per_week` | 12 | 3 a day x 4 days; the Bronze 20-lead cycle needs about 14 bookings |
| `methods_supported` | `{teams, phone}` | Nothing to set up on the broker side |
| `slot_minutes` | 30 | The call is 30 minutes (1.2) |
| `buffer_minutes` | 15 | Gap between meetings |
| `min_notice_hours` | 2 | Same-day bookings allowed, never inside 2 h |
| `horizon_days` | 14 | How far ahead leads can book |
| `calendar_provider` | `outlook` | One-tap Microsoft sign-in is the default |
| `consent_mode` | `named` | 0.1 (not editable by the broker) |
| `bookings_paused` | false | - |
| `add_client_as_attendee` | false | Email only when the chosen method needs an invite (0.1) |
| `intro_media_pref` | null (set in the voice and video step) | - |

## Status and checklist logic (the single source for the progress bar, W20 and the go-live gate)

`brokers.status`: `onboarding` -> `onboarded` -> `ready_for_go_live` -> `active` (also `paused`, `ended`). Set by W20, never by the browser.

**Seven steps shown to the broker.** `brokers.onboarding_progress` is a jsonb map: `{ "<step_key>": { "status": "todo|doing|done|skipped|defaulted|blocked", "done_at": "ISO|null", "by": "broker|system|jonathan" } }`. `brokers.onboarding_step` holds the key of the first step that is not done.

| # | `step_key` | What the broker does | Minutes | Blocks go-live? | Done when |
|---|---|---|---|---|---|
| 1 | `video` | Watches the 3-minute explainer | 3 | No (never) | Video reached 90%, or "I'll watch it later" tapped (`skipped`). Writes `explainer_watched_at` on 90% only |
| 2 | `profile` | Practice, FSP, adviser, WhatsApp, headshot, 2 lines, languages, years | 3 | **Yes: FSP must be `verified`** (`fsp_verified_at` not null). Headshot is not required (monogram card fallback, see 03) | All required fields saved **and** `fsp_check.status = verified` |
| 3 | `calendar` | One-tap Microsoft sign-in (or the shared-calendar fallback) | 1 | **Yes** | OAuth token stored (or fallback chosen) **and** W04 `GET /slots` returned at least 1 slot in the horizon |
| 4 | `availability` | Hours, methods, capacity ("Looks right" or edit) | 1 | Yes, but pre-filled | "Looks right" tapped, or 24 h after step 3 with no change: `defaulted` (the default values stay; the 24-h nudge says so) |
| 5 | `agreement` | Ticks, types name, signs | 3 | **Yes** | `admin_documents.signed_at` set for kind `agreement` (and `authorisation_letter` if Annex 1 ticked) |
| 6 | `card` | Previews and approves the intro card and disclosure wording | 1 | **Yes** (4.10 checklist item 5; see needs_human NH-BS-02) | `broker_media(kind=card).approved_at` set |
| 7 | `media` | Interview, scripts, record, approve (4.10b) | 10 | **Never** | `intro_video_url` or `intro_voice_url` approved, or `skipped` |

Progress bar % = (steps `done` + `skipped` + `defaulted`) / 7. "Minutes to go live" = sum of minutes of the not-done blocking steps. `onboarded` = steps 2-6 all done (this is also the clock stop for the 48-h measure). The step list never reorders and never hides a completed step (shown ticked).

**Go-live prerequisites (0.3 #12, 6.1):** (1) FSP verified on the FSCA register, (2) calendar connected and returns slots, (3) agreement signed, (4) intro card approved. Video is never blocking. Defaults cover hours, capacity and methods. When `onboarded`, W20 runs the compliance pre-flight (compliance-qa), then Jonathan taps **Approve & go live** (HUMAN GATE). The broker sees "Final checks: we'll message you on WhatsApp the moment you're live."

**Clocks.** `first_login_at` is set at the first magic-link session. The 48-h target is `onboarded_at - first_login_at <= 48 h`. W20 stamps `onboarding_completed_at` (= `onboarded_at`). The nudge clock is `onboarding_last_progress_at` (latest of `first_login_at` and any step `done_at`).

**New columns this spec needs on `brokers`** (not in crm-gap A1; platform-architect to add, see needs_human NH-BS-03): `first_login_at`, `last_seen_at`, `onboarding_completed_at`, `onboarding_last_progress_at`, `onboarding_nudges jsonb`, `preflight_card jsonb`, `preflight_run_id`, `practice_legal_name`, `signatory_name`, `signatory_role`, `fb_page_name`, `fb_page_id`, `calendar_mode` (`oauth` / `shared_fallback`), `calendar_status` (`ok` / `needs_reconnect` / `blocked_admin_consent`), `calendar_connected_at`, `next_free_slot_at` (cached from W04 for the Start page).

## Event contract to W20 (all signed `X-LV-Signature: sha256=` + HMAC of the raw body with `INTERNAL_HMAC_SECRET`)
`{ "event_id": "uuid", "type": "...", "broker_id": "uuid", "step": "profile|calendar|availability|agreement|card|media|null", "occurred_at": "ISO", "payload": {} }`

| `type` | Emitted by | W20 does |
|---|---|---|
| `broker.created` | W16 (payment received) via DB webhook on `brokers` insert | Welcome WhatsApp + email with the magic link and the 3-minute video |
| `fsp.submitted` | Profile Save | FSCA check (see 02) |
| `calendar.connected` / `calendar.failed` | OAuth callback | Re-verify slots; prompt or alert |
| `step.completed` | Any step's Save | Next-step prompt (skipped if the broker is active in the portal) |
| `agreement.signed` | E-sign | Signed copy from howzit@ (to the broker, bcc howzit@) |
| `card.approved` | Card approve | - (feeds `onboarded` check) |
| `preflight.result` | compliance-qa callback | Pass: `ready_for_go_live` + Jonathan's gate. Fail: alert + broker fix prompt |
| `go_live.approved` | Console "Approve & go live" | W26/W16 hand-off, "you're live" |

## Acceptance scenarios for `automation/tests/W20.test.mjs` (to be written before implementation, 4C.2; not mine to place, see needs_human)
1. New broker -> welcome sent once, idempotent on a replayed `event_id`.
2. FSP matching register -> `verified`; FSP not found -> blocked + Jonathan alert + soft broker message; register name differs -> blocked + alert; lookup error x3 -> `pending_manual` + alert.
3. Stall: no progress for 24 h -> one nudge naming the stalled step; 72 h -> second nudge + email + console to-do for Jonathan; none sent between 20:00 and 08:00 SAST; none after progress resets the clock.
4. `calendar.connected` with 0 slots -> broker message "check your hours", no `done`.
5. All hard steps done -> status `onboarded`, pre-flight called once; pass -> `ready_for_go_live`; stale pass (> 24 h) -> pre-flight re-run before go-live.
6. `go_live.approved` before `ready_for_go_live` -> rejected 409.
7. Broker active in the portal in the last 10 min -> step prompt skipped.
