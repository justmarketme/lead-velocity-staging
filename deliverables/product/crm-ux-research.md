# CRM UX research: which systems lead on UX in 2025–2026, and the patterns behind them

Owner: product. Date: 6 Oct 2026. Companion: `crm-ux-synthesis.md` (principles plus a change list mapped to our screens).

**Scope note.** MASTER-PROMPT 0.1 says top-5 research for the market and funnel is done and must not be re-run. This file is a different question: it looks at **interface patterns of CRM and business software** for the broker portal. It was commissioned directly by Jonathan. It does not re-rank any market player from Sections 1–4D.

## Method and evidence grades

- **Usability scores.**
  - G2 Ease of Use, Ease of Setup and Ease of Admin scores (out of 10). Each has its rating count in brackets: [n] is the number of reviewers who scored that item.
  - Capterra-family (GetApp / Software Advice) ease-of-use scores (out of 5).
  - App Store and Google Play ratings, with their counts.
- **Recognition.** Design awards and recognition.
- **Patterns.** Vendors' own help-centre and engineering or design pages, which are primary sources for how each product behaves.
- **Caveats.**
  - G2 product pages returned HTTP 403 to direct fetches. G2 numbers come from G2 compare pages read through a cached reader, so they may lag the live page by weeks.
  - Capterra pages were blocked as well. Capterra-family numbers come from GetApp, Software Advice and regional Capterra mirrors.
  - Anything not confirmed is marked **unverified**.
- **Important correction.** Several G2 compare pages show **Attio** at Ease of Use 9.7. That figure is an **old snapshot of only 18 reviews**. Attio's current G2 score is **8.3 from 194 ratings**. This changes Attio's rank.
- **Awards.** I found no Apple Design Award, Webby or Red Dot for any candidate. The "G2 Usability Index CRM Fall 2025" report could not be accessed, so it is unverified.
- **Spot-checks.** Two pattern claims were re-checked directly against vendor docs: Pipedrive's mandatory outcome field and HubSpot's action feed.

---

## 1. Scoreboard and selection

| Product | G2 overall | G2 Ease of Use | Setup | Admin | Mobile (store ratings) | Other |
|---|---|---|---|---|---|---|
| **Close** | 4.7 (1,698) | **9.3** [1,549] | 9.0 [896] | 9.0 [509] | unverified | G2 Quality of Support 9.3 [1,353] |
| **Pipedrive** | 4.3 (2,448) | **8.9** [2,194] | 8.7 [1,235] | 8.6 [873] | iOS 3.7 (675), Android 4.0 (3.56K) | Capterra 4.5 (3,055), ease 4.5; "Best smartphone app of the year 2016" (Estonia) |
| **HubSpot Sales Hub** | 4.4 (12,292) | 8.7 [9,685] | 8.4 [3,732] | 8.6 [2,957] | **iOS 4.7 (15K), Android 4.5 (13.2K)** | GetApp ease 4.4 (4,488); Software Advice ease 4.38 (4,473) |
| **Linear** (not a CRM; benchmark) | 4.6 (small sample) | 8.9 [30] | 9.1 [17] | 8.3 [9] | **iOS 4.8 (2K)** | Golden Kitty 2020 runner-up (Productivity); Jira for comparison: 8.0 / 7.6 / 7.5 |
| **Attio** | 4.3 (518) | 8.3 [194] | 8.0 [178] | 8.5 [50] | iOS 3.6 (28) | G2 Product Direction 9.1; "Ease of Use" is its top G2 pro (75 mentions) |
| folk | 4.5 (273) | 9.0 [272] | 8.9 [223] | 8.7 [98] | G2 Mobile User Support 7.2 [41] | no design evidence found |
| Salesforce Sales Cloud | 4.4 (23,273) | **8.1** [16,047] | 7.8 [7,177] | 7.9 [4,140] | not researched | GetApp ease 4.0 (18,811) |
| Notion | not researched | | | | | excluded for lack of gathered evidence, not on merit |

Sources:
- Close vs Pipedrive: https://www.g2.com/compare/close-vs-pipedrive
- Attio vs HubSpot Sales Hub: https://www.g2.com/compare/attio-vs-hubspot-sales-hub
- Pipedrive vs Salesforce Sales Cloud: https://www.g2.com/compare/pipedrive-vs-salesforce-salesforce-sales-cloud
- Attio (current figures): https://www.g2.com/compare/attio-vs-thryv-keap
- Attio vs folk (holds the stale 9.7 snapshot, and folk's figures): https://www.g2.com/compare/attio-vs-folk-folk
- Jira vs Linear: https://www.g2.com/compare/jira-vs-linear
- Capterra / GetApp / Software Advice:
  - https://www.capterra.ie/software/132666/pipedrive
  - https://www.getapp.co.uk/software/102533/hubspot-crm
  - https://www.softwareadvice.com/crm/hubspot-profile/
  - https://www.getapp.co.uk/compare/90378/102533/salesforce/vs/hubspot-crm
- App stores:
  - https://apps.apple.com/us/app/hubspot/id1107711722
  - https://play.google.com/store/apps/details?id=com.hubspot.android
  - https://apps.apple.com/us/app/pipedrive-sales-crm/id921456160
  - https://play.google.com/store/apps/details?id=com.pipedrive
  - https://apps.apple.com/us/app/linear-mobile/id1645587184
  - https://apps.apple.com/us/app/attio/id1511545395
- Awards:
  - https://e-estonia.com/the-best-smartphone-app-of-the-year-is-pipedrive/
  - https://www.producthunt.com/stories/announcing-the-2020-golden-kitty-award-winners

### The top 5 and why

1. **Close.** It has the highest Ease of Use backed by more than 1,000 ratings (9.3), and also leads on Setup and Admin. Its Inbox is a single place for today's work: the closest analogue to a broker's Today screen.
2. **Pipedrive.** Ease of Use 8.9 from 2,194 ratings. It has the most transferable mobile patterns: a call-log prompt after each call, an outcome you can require before an activity is marked done, WhatsApp threads auto-linked to contacts, sample data tagged as sample, and goals with set periods. Its app-store ratings are mediocre, so copy the patterns and not the polish.
3. **HubSpot.** The best mobile ratings at volume (iOS 4.7 from 15K; Android 4.5 from 13.2K). It has a mobile action feed, post-call logging, goal gauges, a record timeline and onboarding checklists.
4. **Linear.** Not a CRM. It is the best-documented benchmark for speed (local-first sync, optimistic UI), visual hierarchy and cycle progress. iOS 4.8 from 2K ratings. Golden Kitty 2020 runner-up.
5. **Attio.** The most modern desktop record and navigation patterns: Cmd+K, a record preview panel, highlight widgets, a filterable timeline and time-in-stage. Its current Ease of Use (8.3) and mobile rating (3.6 from 28) are weaker, so use it for desktop and admin patterns only.

**Left out.**
- **Salesforce Lightning.** Lowest ease scores of any large-sample CRM (8.1 / 7.8 / 7.9). Some patterns from the Lightning design system are worth borrowing, but the evidence does not support it as a top-5 UX product.
- **folk.** Strong ease score (9.0), but a weak mobile support score (7.2) and no design evidence found.
- **Notion.** Not researched.

A caveat on the selection: the evidence is review-site data plus vendor docs. There are no independent usability tests here, and none of these products has a major design award.

---

## 2. Patterns by product

### 2.1 Close
| Area | Pattern | Source |
|---|---|---|
| IA / daily loop | **Inbox is the work queue.** Tasks show up on the day they are due; future tasks sit under "Future" and finished ones under "Done". You can snooze and bulk clear. Close advises treating a task date as a "notification date", not a deadline | https://help.close.com/feature-guide/tasks.md |
| Automation of feedback | **Call tasks close themselves** when a call ends as "Completed". Marking one done by hand creates the call record | https://help.close.com/feature-guide/calling/call-tasks.md |
| Self-clearing reminders | An email follow-up reminder clears itself if the lead replies. If no reply arrives, an AI-drafted follow-up appears in the Inbox with "Send now" | https://help.close.com/docs/emailing |
| Mobile | Bottom tab bar: Inbox · Leads · Contacts · Opportunities · Reports. Opportunities move between stages by long-press and drag. Power dialers are desktop only | https://help.close.com/getting-started/close-mobile-app.md |
| Keyboard | G-then-I navigation, J/K to move between items, "?" for a cheat sheet (third-party guide) | https://aeroleads.com/blog/close-crm-keyboard-shortcuts-dial-navigate-faster/ |

### 2.2 Pipedrive
| Area | Pattern | Source |
|---|---|---|
| One-tap feedback | **An activity outcome can be required** before an activity is marked done, and **picked without opening the editor** (checked directly against the vendor page) | https://support.pipedrive.com/en/article/activities-customization |
| Next action | "You'll always be prompted to add the next activity" when you complete one. **Deal rotting** highlights deals that have been neglected | https://www.pipedrive.com/en/features/activities-goals |
| Mobile post-call | After an answered outgoing call, a summary sheet appears with activity details, notes and "schedule follow-up". iOS logs outgoing calls placed in the app; Android logs both directions with caller ID. On iOS, WhatsApp is the only supported call integration | https://support.pipedrive.com/en/article/calling-and-logging-calls-in-the-mobile-app |
| Mobile notifications | Missed-call notification with two actions: "call back" or "add activity" (Android) | https://support.pipedrive.com/en/article/how-can-i-make-calls-in-pipedrive |
| Cross-device | Start a call on the web and it rings on the phone. The web app then asks for notes and a follow-up | https://support.pipedrive.com/en/article/web-to-mobile-calling |
| Mobile feature set | Focus view, Nearby, offline mode, audio notes, push, card scanner | https://support.pipedrive.com/en/article/what-features-do-the-mobile-apps-have |
| Goals | Goals for deals, activities and revenue, set per week, month, quarter or year, with a different target per period. Shown on dashboards | https://support.pipedrive.com/en/article/insights-goals |
| First run / empty states | A questionnaire builds a tailored pipeline. **Sample records are tagged "[Sample]"** and removed in one action. A "Quick help" panel shows tips | https://support.pipedrive.com/en/article/sample-data |
| WhatsApp | (Beta, Growth plan and up) Chats auto-link to contacts by phone number. WhatsApp tab on each deal and contact. Templates for the 24-hour window. Unread counter. "Mark unread" works as a reminder | https://support.pipedrive.com/en/article/whatsapp-integration |

### 2.3 HubSpot
| Area | Pattern | Source |
|---|---|---|
| Mobile home | **Action feed** with three card types. "Prep for meetings" shows upcoming meetings. "Review next steps" covers after the meeting. "Complete tasks" has one-tap Call or Email and Mark complete. **Dismiss removes a card from the feed but does not delete the task** (low-regret; checked directly against the vendor page) | https://knowledge.hubspot.com/prospecting/use-the-action-feed-in-the-hubspot-mobile-app |
| Post-call | A "Log Call" sheet: summary (contact, time, duration), notes carried over from the call, a follow-up task toggle, outcome and associations | https://knowledge.hubspot.com/calling/make-calls-from-the-hubspot-mobile-app |
| Off-app calls | Caller-ID logging of calls made outside the app (Android), with a log screen after each call | https://knowledge.hubspot.com/calling/manage-caller-id-manual-contact-syncs-and-call-logs-in-the-hubspot-mobile-app |
| Activity logging | One flow for Call, Email, Meeting, SMS, WhatsApp, LinkedIn and Postal, each with an optional follow-up | https://knowledge.hubspot.com/records/manually-log-activities-on-records |
| Record page | Header, main workspace and right sidebar. Tabs: About, Activities (a filterable timeline), Catch-up (includes a data-quality card listing missing fields), Revenue. Inline edit with Undo | https://knowledge.hubspot.com/records/understand-the-default-record-layout ; https://knowledge.hubspot.com/records/use-cards-on-records |
| Goals | Goals from templates (calls made, meetings booked, revenue). Gauge "progress mode", leaderboard, attainment over time. Refreshes every 8–12 minutes, so it is not real-time | https://knowledge.hubspot.com/goals/create-goal-progress-reports ; https://knowledge.hubspot.com/reports/create-sales-goals |
| Onboarding | Templated checklists with an assignee per task, due dates and progress | https://knowledge.hubspot.com/help-and-resources/manage-onboarding-to-do-lists-with-checklists |
| Known weakness | WhatsApp sits in the Conversations inbox and is not on the mobile contact timeline (community report, Oct 2025). A TrustRadius 9/10 review still rates mobile below desktop | https://community.hubspot.com/t/can-i-send-whatsapp-messages-from-hubspot-mobile-app/141317 ; https://www.trustradius.com/reviews/hubspot-crm-2025-07-19-01-53-30 |

### 2.4 Linear (speed and polish benchmark)
| Area | Pattern | Source |
|---|---|---|
| Speed | **Local-first sync.** Each client keeps a local database, so actions need no network round trip. Offline clients catch up from a checkpoint ("delta sync"). The largest workspaces generate about 1M sync actions a day | https://linear.app/now/rebuilding-delta-sync-read-path (18 Aug 2026) |
| Optimistic UI | Edits apply in memory first, then go into a durable queue (IndexedDB) and sync. A rejected change rolls back. Animations stay under the 100 ms cause-and-effect threshold. The source recommends TanStack Query or SWR optimistic updates for apps without a sync engine | https://performance.dev/how-is-linear-so-fast-a-technical-breakdown (third-party) |
| Quality | Zero-bug policy: high-priority bugs fixed within 48 h, others within 7 days; 2,000+ bugs fixed in a year | https://linear.app/now/zero-bugs-policy ; https://linear.app/now/why-is-quality-so-rare |
| Visual hierarchy | The 2026 refresh dims the sidebar and uses smaller tabs, fewer icons and softer borders, so the chrome recedes and the work stands out | https://linear.app/now/behind-the-latest-design-refresh (12 Mar 2026) ; https://linear.app/now/how-we-redesigned-the-linear-ui |
| Notifications | **Inbox.** Priority tab, J/K to move, `H` to snooze, `U` to toggle read, reminders that bring an item back at a set time | https://linear.app/docs/inbox |
| Progress | **Cycle graph.** Lines for scope, started and completed, against a dotted target line (which flattens over weekends). "Cycle success" counts started work as 25% done. This is the closest analogue to "12 of 20 delivered, are we on pace?" | https://linear.app/docs/cycle-graph ; https://linear.app/docs/use-cycles |

### 2.5 Attio (desktop record patterns)
| Area | Pattern | Source |
|---|---|---|
| IA | Sidebar: Home, Notifications inbox, Tasks, Notes, Reports, Workflows, then Records and Lists. Cmd+K for commands; "/" to search | https://attio.com/help/reference/attio-101/introduction-to-navigating-attio |
| Keyboard | 30+ context-aware quick actions under Cmd+K. Single keys: `n` note, `t` task, `c` email, `?` help | https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace |
| Inline editing | Spreadsheet-like table editing: arrow-key navigation, Enter to save, copy and paste to and from spreadsheets | https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views |
| Record preview | A side panel opens from a table or board without leaving it. Shows "1 of 500", up/down arrows to step through records, and an expand button for the full page | https://attio.com/help/reference/managing-your-data/records/create-and-view-records |
| Record page | Up to 6 **highlight** widgets at the top. Tabs: Overview, Activity, Emails, Notes, Tasks, Files. The timeline can be filtered by event type. The 2026 redesign puts primary actions top-left and collapses automation events by default. The timeline now includes overdue, upcoming and completed tasks | https://attio.com/help/reference/managing-your-data/records/configure-record-pages ; https://attio.com/changelog/2026/record-page-redesign ; https://attio.com/changelog/2026/new-activity-timeline |
| Kanban | "Time in stage" with a target: the counter on the card turns red past it. Collapsible columns and cards; multi-select drag | https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views |
| Mobile | iOS app redesigned in 2026 ("liquid glass", record widgets). Still rated 3.6 from 28 ratings; reviews mention freezes and no iPad layout | https://attio.com/changelog/2026/ios-app-update ; https://apps.apple.com/us/app/attio/id1511545395 |

---

## 3. Cross-cutting UX research (used in the synthesis)

| Topic | Finding | Source |
|---|---|---|
| Empty states | Never leave a screen totally empty. Say what will appear and give a direct path to the key task. Demo or sample data is an endorsed option | NN/g, Kaplan 2021: https://www.nngroup.com/articles/empty-state-interface-design/ |
| Progress indicators | Give feedback for anything that takes about 1 s or more. Use a looping indicator for waits of 2–10 s and percent-done for 10 s or more. Count text such as "3 of 50" is recommended | NN/g, Sherwin 2014: https://www.nngroup.com/articles/progress-indicators/ |
| Endowed progress | A 10-stamp card with 2 stamps pre-filled was redeemed 34% of the time, against 19% for a blank 8-stamp card, and those customers came back sooner. The effect needs a stated reason for the head start | Nunes & Drèze, JCR 2006: https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/PSC.pdf |
| Mobile onboarding | Avoid swipe-through tutorial decks. A skippable survey needs a visible Skip and a progress indicator | NN/g 2020: https://www.nngroup.com/articles/mobile-app-onboarding/ |
| Touch targets | Apple ≥ 44 × 44 pt. Material ≥ 48 × 48 dp with ≥ 8 dp spacing. NN/g ≥ 1 cm × 1 cm. WCAG 2.2: 24 px at AA, 44 px at AAA | https://developer.apple.com/design/tips/ ; https://support.google.com/accessibility/android/answer/7101858 ; https://www.nngroup.com/articles/touch-target-size/ ; https://govtnz.github.io/web-a11y-guidance/ka/accessible-ux-best-practices/mobile-apps/mobile-app-a11y-by-feature-type/touch-and-pointer-target-sizing.html |

---

## 4. What transfers to a mobile broker portal (summary)

| Our need | Best reference | Why |
|---|---|---|
| "Today" home | HubSpot action feed + Close Inbox | Meeting-prep cards, one-tap actions, low-regret dismiss, a single daily queue |
| One-tap attendance feedback | Pipedrive outcome-on-done + Close's self-completing call tasks | An outcome picked without opening an editor; the system closes the task itself where it can |
| Post-meeting prompt | Pipedrive and HubSpot post-call sheets | The prompt appears at the moment the meeting ends |
| Cycle progress ("12 of 20") | Linear cycle graph + Pipedrive/HubSpot goals | A target line or pace, set per period, value against target |
| Lead record | Attio highlights + timeline; HubSpot Activities tab | A short summary, then a filterable dated history |
| Onboarding | HubSpot checklists + Pipedrive "[Sample]" data + endowed progress | Short, partly pre-done, sample data clearly labelled |
| Speed | Linear optimistic UI | Commit locally, sync in the background, roll back on failure |
| Admin console | Attio Cmd+K, preview panel, time-in-stage; Close keyboard navigation | Desktop power-user patterns |
| WhatsApp-native | Pipedrive WhatsApp tab (chats auto-linked by phone number) | Our brokers already live in WhatsApp; the portal should mirror it, not compete with it |
