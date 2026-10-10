# CRM UX synthesis: principles and prioritised change list for the SortMyCover broker portal

Owner: product. Date: 6 Oct 2026. Evidence base: `crm-ux-research.md` (same folder). This is a design document. No app code was changed.

**Top 5 reference systems** (evidence and selection in `crm-ux-research.md` §1):
1. **Close**: G2 Ease of Use 9.3 from 1,549 ratings; Inbox as the daily queue; call tasks that close themselves.
2. **Pipedrive**: 8.9 from 2,194; an outcome required on done and picked without opening the editor; post-call prompt; goals; "[Sample]" data; WhatsApp tab.
3. **HubSpot**: best mobile ratings at volume (iOS 4.7 from 15K); action feed; post-call log sheet; record timeline; goals; checklists.
4. **Linear**: the speed benchmark (local-first, optimistic UI, under 100 ms); Inbox; cycle graph with a target line; iOS 4.8 from 2K.
5. **Attio**: desktop record patterns (highlights, filterable timeline, Cmd+K, preview panel, time-in-stage).

Salesforce was dropped: it has the lowest ease scores at volume (8.1 / 7.8 / 7.9).

---

## 0. Read first: three compliance conflicts in the code we have now

These sit above every UX recommendation. The new services agreement (`deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md`) narrowed what we may collect, and the portal was built against the older MASTER-PROMPT 0.1 wording.

| # | Where | What the code does now | What the agreement says | Fix |
|---|---|---|---|---|
| X1 | `src/pages/portal/Leads.tsx` `MarkOne` (steps 2 and 3), `src/lib/smc.ts` `DISPOSITIONS`, `portal/prototype/leads.html`, `portal/spec/07-my-leads.md`, templates `automation/templates/broker_disposition.json`, `broker_quality.json`, `broker_fit_followup.json` | After "Attended" the broker picks one of six dispositions ("Good fit – proceeding", "Not a fit – budget", "Not a fit – well covered", …) and a 1–5 quality score | **Clause 8.4, feedback firewall:** "The only feedback the Client gives Lead Velocity is whether each Consumer attended and could be contacted." We may not *request* outcome information. "Proceeding", "budget" and "well covered" are outcome information | Feedback becomes attendance and contactability only (see R1) |
| X2 | `src/pages/portal/Reports.tsx` section 6 "Your ROI view"; section 4 disposition bars and average rating; `v_cycle_progress.good_fit` in `supabase/migrations/20261002_smc_02_core.sql` | Asks for close rate and "policies written this cycle", stores them (`brokers.close_rate`, `smc_report_policies_written`) | Clause 8.4: "Lead Velocity will not request, and the Client must not send, any information about … sales, policies, premiums or commission." "Only he sees it" does not help: it is stored in our database, so we have received it | Remove section 6 and the RPC. Rebuild section 4 on attendance and contactability (see R2) |
| X3 | `Leads.tsx` replacements card and hint; `Reports.tsx` s2 "replacements used of cap"; `v_cycle_progress.replacement_cap` | "4 this cycle"; replacement for "a no-show, a number we cannot reach, or a lead outside the age or budget we agreed"; a 48-hour check | **Clause 7 and Schedule 3:** goodwill, never a right; **at most 3 requests per calendar week**; **no-shows only**; proof (a photo or a screenshot) within 30 minutes of the start time, otherwise the lead counts as delivered | Change the copy and counters. Add proof capture (see R4) |

Also: `v_cycle_progress.verified` counts leads by `verified_at` (the old "replied within 72 h" rule). Under clause 5.2 a lead is **Delivered when the consumer has booked and confirmed attendance**. The "12 of 20 delivered" number has to use the contract's definition, or the bar and the invoice will disagree. Flag for platform-architect (data, not UX).

These are `needs_human` items for Jonathan (the contract is still in lawyer review). The recommendations below assume clause 8.4 and clause 7 stand as drafted.

---

## 1. Files read (repo audit)

- Portal (React): `src/pages/portal/PortalShell.tsx`, `Start.tsx`, `Leads.tsx`, `Reports.tsx`, `Agreement.tsx`, `portal.css` (targeted greps); `src/lib/smc.ts` (`DISPOSITIONS`, `STEPS`, `progressSummary`); `src/components/broker/BrokerLayout.tsx`; route table in `src/App.tsx`
- Prototypes and specs: `portal/prototype/leads.html`, `portal/prototype/portal.css`; `portal/spec/README.md`, `01-start-here.md`, `04-voice-note-and-video.md`, `07-my-leads.md`, `08-reports.md`, `10-nudges-and-go-live.md`, `GAPS.md`
- Admin: `src/components/dashboard/DashboardOverview.tsx`, `DashboardLayout.tsx` (nav), `LeadsTable.tsx` (structure); `src/pages/smc/Today.tsx` (section structure); `deliverables/platform-architect/console-portal.md`
- Data and contract: `supabase/migrations/20261002_smc_02_core.sql` (`v_cycle_progress`, `outcomes`); `automation/templates/broker_disposition.json`, `broker_quality.json`, template README; the services agreement (clauses 5, 6, 7, 8.4, 9, Schedule 3); `open-items.md` D1/D9

What already works well and should be kept: Start's 7-step checklist (it never reorders and never hides a done step, and shows "minutes to go live"); the "help lives on the step" clips; the Grade 7 copy rules; full names shown only inside the portal; deep links from WhatsApp that highlight a lead (`?lead=`); every report number shown next to its target and last week.

### Structural problems found in the code

| # | Problem | Evidence |
|---|---|---|
| P1 | **Two sets of navigation on a phone.** `PortalShell` wraps `BrokerLayout`, which adds a fixed 64 px top bar (Lead Velocity logo, "Broker Portal", Einstein voice, bell, Logout) and a hamburger sidebar with 9 items, on top of the SMC sticky header and a 5-tab bottom bar. The brand is wrong too: the broker bought SortMyCover and sees the Lead Velocity logo | `BrokerLayout.tsx` L48–100; `PortalShell.tsx` L69–93 |
| P2 | **The sticky header probably slides under the fixed bar.** `.smc-portal .top` sticks at `top:0`, but the fixed nav is `h-16`/`z-50`. On scroll the progress bar is likely hidden. Not checked in a browser (GAPS G-14: the 360 px pass has never been done) | `portal.css`; `BrokerLayout.tsx` |
| P3 | **Tap targets too small.** `.tap` (Brief, Change, PDF, Mark now, Do, Call) is 12.5 px text with 6 px padding, about 30 px tall. Apple HIG asks for 44 pt; Material asks for 48 dp. The spec's own rule 1 is 48 px for primary buttons | `portal.css` L112 |
| P4 | **Marking takes 4–5 taps plus Save, then a full reload.** Outcome, then disposition, then score, then Save, then `load()` re-runs four sequential queries | `Leads.tsx` `MarkOne`, `load` |
| P5 | **No lead record.** A lead exists only as a table row with a "Brief" toggle. Nowhere shows its history: when it was delivered (the moment it counts), reminders, confirmation, brief sent, the broker's mark, replacement state | `Leads.tsx` |
| P6 | **Cycle progress is text, not a goal.** "7 of 20 delivered · day 14" with a bar, but nothing says whether that is on pace, and there is no rollover or top-up state | `Leads.tsx` "Your cycle"; `Reports.tsx` s2 |
| P7 | **No top-up flow.** `Agreement.tsx` offers a tier change but no Top-Up (clause 9.1: at least 10 leads, 7 days' notice, paid in advance) | `Agreement.tsx` billing section |
| P8 | **"Loading…" text on every page; sequential fetches.** `@tanstack/react-query` is installed but the portal never uses it, so nothing is cached between tabs | `PortalShell.tsx` L52; `Leads.tsx` `load` |
| P9 | **The Start video never collapses.** The spec says it shrinks to a "Watch again" row once watched. The code always renders the full player above the checklist, so returning brokers scroll past it | `Start.tsx` vs `01-start-here.md` "States" |
| P10 | **Admin overview counts the wrong thing.** Four count cards over every `leads` row, "Converted = 'Will Done'" (a legacy sale outcome that 8.4 forbids for SMC), five sequential count queries, 15 flat nav items, and the lead detail opens in a modal | `DashboardOverview.tsx`; `DashboardLayout.tsx` L82–100; `LeadsTable.tsx` L528 |
| P11 | **Call number is plain text.** The brief prints the number but gives no `tel:` / WhatsApp-call button, on a phone, for a call-method meeting | `Leads.tsx` `Brief` |

---

## 2. Principles (10)

Each principle names the top-5 products it comes from. Sources are in `crm-ux-research.md`.

1. **One home that answers "what do I do now?"** Open on today's work, not on a menu or a dashboard of totals. *(HubSpot mobile action feed with "Prep for meetings" cards; Close Inbox; Linear Inbox.)*
2. **The action lives where the notification lands.** Every WhatsApp message deep-links to the exact record with the action ready, and anything done in WhatsApp already shows as done in the portal. *(Linear Inbox; Pipedrive post-call summary and missed-call actions; HubSpot post-call Log Call sheet.)*
3. **One tap, instant, undoable.** Commit on tap, update the screen at once (optimistic UI), and offer Undo instead of a Save button or a confirm dialog. *(Linear optimistic UI under 100 ms; Pipedrive outcome picked without opening the editor; HubSpot inline edit with Undo.)*
4. **A record is a timeline.** Each lead has one page: a short summary at the top and a dated history of every event below. *(HubSpot Activities tab; Attio filterable activity timeline.)*
5. **Progress is a goal with a pace, not a count.** Always "value of target", where you should be by today, and what happens if you fall short. *(Linear cycle graph with its target line; Pipedrive Goals; HubSpot goal gauges.)*
6. **Onboarding is a short checklist that starts partly done.** Pre-tick what we defaulted, show minutes left, never reorder, celebrate the finish, then get out of the way. *(HubSpot onboarding checklists; Pipedrive questionnaire-built pipeline and "[Sample]" data; Nunes & Drèze endowed progress, 34% vs 19%.)*
7. **Summary first, detail on tap.** A highlights strip of 3–5 fields, with the rest behind one tap. Never a wide table on a phone. *(Attio highlight widgets, up to 6, and its record preview panel; HubSpot record header.)*
8. **Few destinations, within thumb reach.** At most four bottom tabs, one header, a 44–48 px minimum target, and the primary action at the bottom of the screen. *(Close and Pipedrive mobile bottom tabs; Apple HIG 44 pt / Material 48 dp.)*
9. **Speed is a feature.** Cached data, skeletons instead of "Loading…", parallel fetches, and no full reload after a write. *(Linear local-first sync and optimistic queue.)*
10. **The interface enforces what we may and may not ask.** Fields we are not allowed to collect do not exist in the UI, the database or the templates. "Hidden" or "optional" is not enough. *(Pipedrive's admin-defined outcome field, which fixes the allowed answers, applied to clause 8.4.)*

---

## 3. Prioritised change list

Effort: S = under 1 day, M = 1–3 days, L = more than 3 days. Impact: H/M/L on the three broker measures that matter (mark rate within 24 h, show rate via a faster brief and call, renewal via visible progress), plus compliance.

### P0: compliance (ship before any broker marks a real meeting)

| ID | Pattern (source) | Screen / file | Change | Effort | Impact |
|---|---|---|---|---|---|
| R1 | Outcome picked without opening the editor, fixed answer set (Pipedrive); one tap (Linear) | `src/pages/portal/Leads.tsx` `MarkOne`; `src/lib/smc.ts` `DISPOSITIONS`; `portal/prototype/leads.html`; `portal/spec/07-my-leads.md`; WhatsApp `broker_disposition`, `broker_quality`, `broker_fit_followup` (retire) | **Four buttons, one tap, done:** `Met them` · `No-show` · `Couldn't reach them` · `Moved to another time`. Drop dispositions, the 1–5 score and the "anything we should know" voice note (free text invites outcome detail). Keep "unmarked at 24 h → counted as attended, flagged". Later, borrow Close's self-closing call tasks: for Teams meetings, pre-fill "Met them" from the Microsoft Graph online-meeting attendance report so the broker only confirms (feasibility on his tenant is unverified). Same four labels in the WhatsApp quick replies (`broker_outcome_check` already has three of them) | S | **H** (compliance), H (mark rate: 1 tap instead of 4–5) |
| R2 | Goals vs target (Pipedrive/HubSpot) | `src/pages/portal/Reports.tsx` s4, s6; `supabase/.../v_cycle_progress.good_fit`; `smc_report_policies_written`; `automation/W14-broker.md` payload | Delete section 6 (ROI view) and the policies RPC, and stop storing `close_rate`. Replace section 4 with "**Attendance**: met · no-show · couldn't reach · moved", each as value · target · last week, plus "marked within 24 h" %. Keep "What leads asked before the call" (that comes from the lead, not the broker) | S | **H** (compliance) |
| R3 | Consistent language across surfaces (HubSpot) | `Leads.tsx` replacements card and hint; `Reports.tsx` s2; `Help.tsx` FAQ; `portal/spec/07`, `08` | Replacements copy: "Replacements are goodwill, not a right: no-shows and leads you couldn't reach. Up to 3 requests a week, combined. Send proof within 30 minutes of the start time." Counter: "**Requests this week: 1 of 3**" (resets Monday), not "of cap per cycle". Remove "criteria" (and the old disposition codes) as replacement reasons; "unreachable" is a reason again from 10 Oct (Jonathan, NH-UX-2), with its own proof rule | S | H (compliance, fewer disputes) |

### P1: the broker's daily loop (mobile)

| ID | Pattern (source) | Screen / file | Change | Effort | Impact |
|---|---|---|---|---|---|
| R4 | Post-call prompt at the moment (Pipedrive and HubSpot post-call sheets) | `Leads.tsx` (No-show path); new upload to the private media bucket; `outcomes` + `replacements` | **No-show proof, built into the one tap.** From the start time, the meeting card shows "Waiting… 7 min" and counts down to the 10-minute mark (S3.2). Then `No-show` opens the camera (`<input type="file" accept="image/*" capture>`) for the photo or screenshot, with the rule in one line ("time visible, no people, no address"). Send, then "Request sent. We'll tell you on WhatsApp." The button turns grey after 30 minutes ("Too late for a replacement request; it still counts as delivered") | M | H (fewer disputes; the contract cannot work without it) |
| R5 | Home = today's work (HubSpot action feed "Prep for meetings" cards; Close Inbox; Linear Inbox) | New default route for `active` brokers, `/broker/today` (or `Leads.tsx` sections reordered and renamed); `PortalShell.tsx` `TABS`; `App.tsx` | **"Today" screen, top to bottom:** (1) **Next meeting** hero card: time and countdown, first name + initial with the full name below, method, a big **Join** (Teams link) or **Call** (`tel:` / `https://wa.me/`) button, and "Brief" opening a bottom sheet. (2) **Needs you** queue (an inbox in the Linear sense): meetings to mark, people who say they weren't reached, a calendar that needs reconnecting. Each row is one tap and clears when done. When empty: "You're all caught up. Next meeting Tue 10:00." (3) **Cycle** goal card (R7). (4) Later today and tomorrow, collapsed. No tables | M | **H** |
| R6 | One header, ≤4 tabs, thumb reach (Pipedrive mobile; HIG) | `PortalShell.tsx`; `BrokerLayout.tsx` (`menuItems` override path); `portal.css` | For SMC brokers, render **without** `BrokerLayout` chrome on mobile: no 64 px bar, no hamburger, no Lead Velocity logo. One SortMyCover header that shrinks on scroll (fixes P2). Bottom tabs: **Today · Leads · Reports · More** (More = Calendar, Profile, Intro card, Voice and video, Agreement and billing, Help, Log out). The bell becomes the Today "Needs you" count. Desktop can keep the sidebar | S–M | H |
| R7 | Goal with pace (Linear cycle graph target line; Pipedrive Goals; HubSpot goal gauges) | `Leads.tsx` "Your cycle"; `Reports.tsx` s2; `Agreement.tsx` billing; `v_cycle_progress` | **Cycle card:** big "**12 of 20**" delivered, a bar with a **pace tick** at the expected-by-today point (20 × day/30), and one status line: "On pace" / "Behind pace: we're adding budget" / "Cycle ends Thu. Any shortfall carries over for 14 days, then into your next cycle or is refunded" (clause 6). Under it: "Day 14 of 30 · renews {date}". At 20 of 20, the card turns into "**Committed leads delivered.** Want more this cycle? Top up (10 or more)". Traffic light only on show rate. Delivered must use the clause 5.2 definition (see §0) | S–M | H (renewal) |
| R8 | Optimistic write + Undo (Linear; Attio inline edit) | `Leads.tsx` `MarkOne` / `load`; adopt `@tanstack/react-query` (already in `package.json`) for portal reads | Tapping an outcome commits at once. The row animates into "Logged · Undo" for 6 s, and only that row's cache is invalidated (no full `load()`). Failure: the row reverts with "Not saved. Tap to try again." Edits stay possible until the cycle ends (spec 07), using the same buttons | S | H (perceived speed, mark rate) |
| R9 | Tap targets and density (HIG / Material) | `src/pages/portal/portal.css` `.tap`, `.seg`, `.tbl` | `.tap` min-height 44 px, font 14 px, padding 10 px 14 px. Outcome buttons 56 px, full width, stacked on screens under 400 px. Replace `.tbl` rows on Leads with cards (the time/name/method stack already exists inside the `<td>`) | S | M |
| R10 | Deep link → record with the action ready (Linear Inbox; HubSpot mobile) | `Leads.tsx` deep-link effect; WhatsApp templates `broker_new_booking`, `precall_brief`, `broker_outcome_check`; short links in `App.tsx` | Extend `?lead=<id>` to `?lead=<id>&do=brief|mark|proof`, opening the brief sheet or mark buttons directly. A WhatsApp quick-reply tap writes the same `outcomes` row, so the portal shows it marked ("Marked on WhatsApp 14:42"). Never ask twice | S | H |

### P2: records, onboarding, billing

| ID | Pattern (source) | Screen / file | Change | Effort | Impact |
|---|---|---|---|---|---|
| R11 | Record page = highlights + timeline (Attio highlights and timeline; HubSpot Activities tab) | New `/broker/leads/:id` (React page in `src/pages/portal/`); needs a read view over `leads`, `bookings`, `outcomes`, `replacements`, message log | **Lead record.** Header: name, age band, budget band, language, method, next or last meeting, and Call/Join. **Timeline** (newest at top, plain words, each with a timestamp): "Asked for a call (SortMyCover quiz)" → "Booked Tue 10:00, Teams" → "**Confirmed they'll attend: counts as delivered (7 of 20)**" → "Reminder sent 24 h / 2 h" → "Brief sent to you 09:45" → "You marked: met them" or "No-show: proof sent → request approved / declined" → "Replacement booked Fri 11:00". Nothing about health, ID or outcome detail. The Leads list becomes a list of these cards with filters (This cycle · Upcoming · Needs you) | M–L | M–H (trust: shows exactly why a lead counts) |
| R12 | Checklist that starts partly done, with a persistent launcher (HubSpot, Attio; NN/g endowed progress) | `Start.tsx`; `PortalShell.tsx` header bar; `src/lib/smc.ts` `STEPS` | (a) Show the 4 pre-filled defaults (hours, capacity, methods, consent mode) as **ticked "We set this up for you"** inside step 4, so the broker starts above zero. (b) Collapse the video to a "Watch again (3:00)" row once `video` is done (as spec 01 says). (c) While not live, the header progress bar is tappable from every page and opens a sheet with the remaining steps (the getting-started launcher pattern). (d) A finish moment: "Setup done in 11 minutes. Final checks next" with what happens next and when. Keep never-reorder and never-hide | S | M (48-h onboarding target) |
| R13 | Onboarding film as a first-run asset (HubSpot Academy-style in-product video; Loom/Wistia in the existing spec) | `Start.tsx` video block | Remember the playback position (resume where you stopped). Show "2:10 left" rather than nothing. Pick the 9:16 file automatically when the viewport is portrait (spec 01 asks for it; G-04). Captions on by default (already). Mark `video` done at 90% (already) | S | M |
| R14 | Self-serve expansion inside billing (HubSpot/Pipedrive in-app upgrade) | `Agreement.tsx` billing section; checkout link `CHECKOUT_URL` | **Top-up sheet:** quantity stepper (min 10, steps of 5), price × R850 excl. VAT (from `pricing`), "Starts {date}: 7 days' notice, or when payment clears if later" (clause 9.2/9.3), then pay buttons. Reachable from the cycle card (R7) and from the day-15 report. Tier changes stay "from your next cycle" | M | M–H (revenue) |
| R15 | Empty states that teach (NN/g; Pipedrive "[Sample]" data) | `Leads.tsx`, `Reports.tsx`, Today | New broker before the first lead: one **example card**, clearly labelled "Example", showing what a booking, brief and one-tap mark will look like, plus "We'll WhatsApp you the moment someone books." Reports before the first Monday: show the WhatsApp 6-liner preview | S | M |
| R16 | Skeletons, caching, prefetch (Linear) | `PortalShell.tsx` loading branch; all portal pages | Replace "Loading…" with layout skeletons. Use one `useQuery` per resource with a 60 s stale time. Prefetch Today's data on login | S–M | M |

### P3: admin console (Jonathan, desktop)

| ID | Pattern (source) | Screen / file | Change | Effort | Impact |
|---|---|---|---|---|---|
| R17 | Command palette ⌘K and J/K keyboard navigation (Attio, Linear, Close) | `src/components/dashboard/DashboardLayout.tsx`, `src/pages/smc/ConsoleLayout.tsx` | ⌘K to jump to any broker, lead, cycle or screen, and to run actions ("Approve go-live", "Decide replacement"). `cmdk` 1.1 and `src/components/ui/command.tsx` are already in the repo | M | M |
| R18 | Navigation grouping and pruning (Attio sidebar; HubSpot nav redesign) | `DashboardLayout.tsx` (15 items) | Group as Today · Brokers · Leads · Money · Settings. Hide legacy-only items for the SMC brand | S | M |
| R19 | Overview = exceptions, not totals (Linear Inbox; Close Inbox) | `DashboardOverview.tsx` | Drop "Converted = Will Done" for SMC (8.4). Show per-broker cycle cards (delivered vs pace, show rate, replacement requests waiting, onboarding stalls). One RPC instead of five count queries. `src/pages/smc/Today.tsx` already follows this idea; make it the admin landing page | M | M |
| R20 | Record page instead of modal (Attio, HubSpot) | `LeadsTable.tsx` dialog L528 | Lead detail as a routable page (`/dashboard/leads/:id`) with the R11 timeline plus internal fields. Shareable URL, back button works | M | L–M |

---

## 4. Patterns spelled out (for the five areas you asked for)

**Mobile-first broker "Today" (R5, R6).** One column at 360 px. Order: Next meeting → Needs you → Cycle → Later. The primary action on each card is a full-width 48–56 px button at the card bottom. The header holds only the practice name and a "Needs you" count. Four bottom tabs. Nothing on the screen needs horizontal scrolling or a table.

**Lead record timeline (R11).** Highlights strip (Attio) plus a reverse-chronological event list (HubSpot). Every event is a sentence in Grade 7 English with a time. The delivery moment is visually emphasised because it is the billing unit (clause 5.2). Outcome detail is never shown because it is never collected.

**Cycle progress (R7).** Goal card: value, target, pace tick, one status sentence, and what happens next (rollover or top-up). Same component on Today, Leads and Reports s2, from the same numbers.

**One-tap feedback (R1, R4, R8, R10).** Four buttons: Met them · No-show · Couldn't reach them · Moved. Commit on tap, Undo for 6 s. "No-show" and "Couldn't reach them" each open proof capture ("Ask for a replacement") between minutes 10 and 30; they share the 3-a-week counter (10 Oct, Jonathan). The same four buttons appear as WhatsApp quick replies, and both channels write one row.

**Onboarding checklist (R12, R13).** Seven fixed steps. Defaults pre-ticked. Minutes left. A persistent launcher until live. The video collapses after watching and remembers its position. An explicit finish moment, then the checklist leaves the default route.

---

## 5. First sprint (top 5 changes, about 8–10 dev days)

### S1: Feedback firewall (R1 + R2 + R3)
- **Accept when:** (1) `Leads.tsx` shows exactly four outcome buttons and no disposition, score or voice-note prompt; (2) `DISPOSITIONS`, the disposition and quality UI, Reports s6 and the `smc_report_policies_written` call are gone from `src/` (grep for `close_rate`, `policies_written`, `quality_score`, `disposition_code` returns no hits in the portal); (3) Reports s4 shows attendance and contactability counts with target and last week; (4) every replacement string in the portal and Help says "goodwill", "up to 3 requests a week", "no-shows only" and "proof within 30 minutes"; (5) compliance-qa signs off against clause 8.4 and Schedule 3; (6) the retirement of `broker_disposition`, `broker_quality` and `broker_fit_followup` is logged for automation-engineer.

### S2: Today screen and single shell (R5 + R6 + R9)
- **Accept when:** (1) an `active` SMC broker lands on Today after login and from the `broker_live` button; (2) at 360 × 740 there is one header (SortMyCover), no Lead Velocity bar, no hamburger, and four bottom tabs; the header stays visible on scroll; (3) the Next-meeting card shows a working **Join** link for Teams/Meet/Zoom and a **Call** button (`tel:`) for phone methods; (4) every interactive element is at least 44 × 44 px (an axe plus Playwright size check in CI); (5) "Needs you" shows unmarked meetings and not-reached flags, and shows "You're all caught up" when empty; (6) Lighthouse mobile accessibility ≥ 95 on Today.

### S3: One-tap marking with Undo and no-show proof (R8 + R4 + R10)
- **Accept when:** (1) one tap on an outcome writes `outcomes` and the row shows "Logged · Undo" in under 100 ms (optimistic), with no full-page reload; (2) Undo within 6 s deletes or restores the row; a failed write reverts the row with a retry message; (3) No-show is enabled from start + 10 min, opens the camera and uploads to the private bucket, creates a `replacements` request carrying the proof path, and is disabled after start + 30 min with the "counts as delivered" line; (4) a 4th request in the same calendar week is blocked with "3 of 3 requests used this week"; (5) `?lead=<id>&do=mark` opens that meeting's buttons; a meeting marked on WhatsApp shows "Marked on WhatsApp {time}"; (6) the synthetic-suite branch for a no-show with proof passes end to end.

### S4: Cycle goal card with pace and top-up entry (R7 + R14 entry point)
- **Accept when:** (1) one shared `CycleCard` component renders on Today, Leads and Reports s2 from the same query; (2) it shows "{delivered} of {committed}", a pace tick at committed × day/30, and one of three status lines (on pace / behind pace / ending with shortfall rules); (3) "delivered" uses clause 5.2 (booked + confirmed attendance), signed off by platform-architect in the view definition; (4) at delivered ≥ committed the card shows the Top-up button, which opens a sheet with a min-10 stepper, the price from `pricing`, the computed start date (7 days' notice), and the existing pay links; (5) replacement leads never move the bar (clause 7.4).

### S5: Lead record with timeline (R11)
- **Accept when:** (1) tapping any lead on Today or Leads opens `/broker/leads/:id`, and the back button returns to the same scroll position; (2) the header shows name, bands, language, method, and Join/Call; (3) the timeline lists every event from enquiry to replacement with timestamps, newest first, and the delivery event is visibly marked "counts toward your 20"; (4) no health detail, ID number, or outcome or sale information appears (a compliance-qa check against portal rules 6–8); (5) the page loads from cache in under 300 ms on a repeat visit (react-query); (6) RLS: a second broker gets nothing for another broker's lead id (an automated test).

**Next sprint candidates:** R12/R13 onboarding polish, R15 empty states, R16 skeletons, then the admin console R17–R20.

---

## 6. Open items for humans
- **NH-UX-1 (Jonathan / lawyer):** confirm that clause 8.4 stands as drafted. If it does, MASTER-PROMPT 0.1 "Broker feedback" and spec 07/08 must be rewritten (open-items D9 already lists the conflict).
- **NH-UX-2 (Jonathan): RESOLVED 10 Oct 2026.** "Couldn't reach them" CAN earn a goodwill replacement request, like a no-show: discretionary, never because the consumer did not buy, and sharing the cap of 3 requests per Calendar Week with no-shows (7 days' notice unchanged). Proof (Schedule 3): a screenshot of the call log or WhatsApp thread showing at least 2 attempts across the 30 minutes after the start with no reply, or wrong/invalid-number evidence, sent 10 to 30 minutes after the start. Clause 8.4 is unchanged: the feedback itself is still attendance and contactability only.
- **NH-UX-3 (platform-architect):** align `v_cycle_progress.verified` with the clause 5.2 delivery point; drop `good_fit` and `replacement_cap`, and add `replacement_requests_this_week`.
- **NH-UX-4 (platform-architect):** do the 360 px browser pass (GAPS G-14) before S2 to confirm P2 (header overlap).
