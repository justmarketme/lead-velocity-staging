# 05 Calendar and availability

**Route:** `/broker/calendar` (wizard steps 3 and 4; later the permanent home for hours, methods, capacity and pause). **Prototype:** `portal/prototype/calendar.html`. **Inspired by:** Calendly / Microsoft "connect your calendar" (one-tap OAuth, show the result at once; a visible next free slot proves it worked). This is the riskiest onboarding step, so it gets the most care.

## Part A: Connect (step 3 `calendar`)
**Screen:** heading "Connect your Outlook calendar"; one button, full width, Microsoft's own sign-in pattern ("Sign in with Microsoft"). Under it: "Do you use Google? Connect Google instead." (Google only if that is what the broker uses; `calendar_provider = google`.)
**Words:** "One tap. We only look at when you are free, and we add your meetings. We never read your emails."
**Scopes (what the consent screen asks, matched to what we promise):** `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite` (Teams links), `User.Read`, `offline_access`. **No** `Mail.*` for the broker (the promise "we never read your emails" must stay true; `Mail.Send/Read` are howzit@'s own mailbox only).

### The "next free slot" confirmation (the proof it worked)
1. OAuth callback stores the refresh token in the vault (`calendar_token_ref`, never in the row), sets `calendar_status = ok`, `calendar_connected_at`, `ms_tenant_id`, `calendar_id`, and emits `calendar.connected`.
2. The portal immediately calls W04 `GET /slots?broker_id=...&limit=1` (real free/busy from Graph `getSchedule`, honouring the saved hours, notice, buffer and horizon; Africa/Johannesburg).
3. The page swaps the button for a green confirmation, in words and with the date: **"Calendar connected. Your next free slot: Tue 6 Oct, 10:00."** plus "and {n} more this week". Subline: "Found from your real calendar just now." Also writes `next_free_slot_at`.
4. If W04 takes more than 5 s: "Still checking your calendar. You can carry on." W20 finishes the check and sends the WhatsApp "Calendar connected. Next free slot: Tue 10:00." Step 3 is marked done only when a slot has been returned.
5. "Wrong? Your calendar looks busy then?" links to hours (Part B) and "pick another calendar" (a dropdown of his calendars; default his primary).

### Failure states (each has a next action; none is a dead end)
| State | What the broker sees | System |
|---|---|---|
| Connected, zero slots in the horizon | "We're connected, but we can't see any free time in the next 14 days. Check your hours below, or your Outlook working hours." | `calendar_status = ok`, step stays `doing`; W20 sends the same line on WhatsApp |
| **Tenant blocks third-party apps (admin consent needed)** (0.3 #4) | The consent fallback below | `calendar_status = blocked_admin_consent` |
| Token revoked later (weekly health) | Banner "Reconnect your calendar so leads can keep booking" + button; top ask in the weekly report | `calendar_status = needs_reconnect`; W22-class alert; routing for him is not paused automatically but Jonathan is told |
| Pop-up blocked / in-app browser (WhatsApp, Facebook) | "Open this page in Safari or Chrome to sign in" + copy link | - |

### Admin-consent fallback (0.3 #4; copy is final-ready)
Shown in a collapsed "Microsoft says 'Need admin approval'?" under the button, and auto-expanded when the OAuth response is an admin-consent-required error.
> **Microsoft says "Need admin approval"?**
> Your IT admin has switched off new apps. Two easy ways forward.
> **1. Ask your admin to approve us (2 minutes for them).** Send them this link. They sign in, tap "Accept", and you try again. **[Copy the admin approval link]** (`MS_ADMIN_CONSENT_URL` with your tenant)
> **2. Or skip it.** We create each meeting in a shared calendar called "SortMyCover - {adviser name}". You subscribe to it in Outlook. The Teams link comes from our side. **[Use the shared calendar instead]**
> *Heads-up for option 2: we can only see the meetings we book. If you have other meetings, block the time in your hours or tell us.*

- **Forwardable email to IT** (button "Email this to my IT admin", opens a mail draft; from the broker, copy to howzit@): subject "Please approve the SortMyCover calendar app"; body: "Hi, I'd like to connect my Outlook calendar to SortMyCover (Lead Velocity (Pty) Ltd) so that clients can book meetings with me. The app only reads when I'm free and creates meetings in my calendar. It does not read email. Please approve it here: {admin_consent_url}. Thanks, {adviser_name}."
- **Option 2 mechanics** (documented in 4.6): `calendar_mode = shared_fallback`; events are created in `SHARED_FALLBACK_CALENDAR_ID`; Teams link from howzit@'s tenant; an invite to subscribe is emailed from howzit@; step 3 is done once he accepts it and W04 returns slots from the hours minus bookings made on that calendar. Jonathan sees "fallback calendar" on the broker row.

## Part B: Hours, methods and capacity (step 4 `availability`)
Everything is pre-filled from the defaults (README). Copy: "We started you on a normal week. Change anything, or just tap Looks right."

| Field | Column | Control | Validation |
|---|---|---|---|
| Days and hours | `meeting_hours jsonb` `{mon:[["09:00","17:00"]],...}` | Day chips + From/Until | From < Until, 30-minute steps, at least 1 day, at least one 2-hour window |
| How you can meet | `methods_supported text[]` (`teams`,`phone`,`whatsapp_call`,`zoom`,`meet`) | Chips | At least 1. Choosing Teams requires a Microsoft calendar; Meet requires Google; Zoom prompts "Connect Zoom" (optional). A method needing an invite means the lead is asked for email only then (0.1) |
| Most meetings a day | `max_meetings_per_day` | Number | 1-10 |
| Most a week | `max_meetings_per_week` | Number | 1-50, at least the daily number |
| More settings (collapsed) | `slot_minutes` 30, `buffer_minutes` 15, `min_notice_hours` 2, `horizon_days` 14 | Selects | slot 30/45, buffer 0/15/30, notice 1-48, horizon 7/14/21 |
| Pause new bookings | `bookings_paused` | Toggle | Booked meetings stay booked; the leads still arrive and are told "{adviser} will be in touch" (W03 pause path). Takes effect within a minute |
| Add the client to the invite | `add_client_as_attendee` | Hidden (system) | - |

On **Looks right** (or any Save): write columns, `onboarding_progress.availability = done`, emit `step.completed(availability)`, and refresh the "next free slot" line (it must change when hours change; this is how the broker sees his edit worked). If untouched 24 h after step 3 is done, W20 sets it `defaulted` and the 24-h nudge says: "We've used standard hours (Mon-Fri 9 to 5, 3 a day). Change them any time."
Public holidays: SA public holidays (verified yearly by automation-engineer) are blocked automatically; the Monday report notes them and may ask him to confirm hours.

## Step clips
**"Connecting your calendar" (40 s)**
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Calendar page, the Microsoft button | "This is the one that matters most. Tap Sign in with Microsoft." |
| 0:08 | Microsoft consent screen, tap Accept | "Use the account you use for Outlook. We only look at when you're free, and we add your meetings." |
| 0:18 | Green box "Next free slot: Tue 10:00" | "See this? It means it worked. That is your real next free time." |
| 0:27 | Fold open the admin-approval help | "If Microsoft says 'Need admin approval', send the link to your IT person, or use the shared calendar. Both are on the page." |
| 0:37 | Step 3 ticks | "Done. Next: your hours." |

**"Hours, methods and how many" (35 s)**
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Hours chips | "We started you on Monday to Friday, nine to five." |
| 0:10 | Methods, then daily and weekly caps | "Choose how you can meet. Teams and phone are on already. Then set your most per day and per week. We never go over." |
| 0:24 | Tap Looks right; slot line updates | "Change anything and the next free slot updates. Happy? Tap Looks right." |

## Events and measures
Events: `calendar.connected`, `calendar.failed`, `step.completed(availability)`. Measures: calendar connect first-try success; admin-consent rate (**risk 0.3 #4**); time from login to a visible slot; share on fallback calendar; zero-slot rate at connect.
