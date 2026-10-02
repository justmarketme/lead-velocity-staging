# Lead Velocity CRM — SortMyCover build

Read docs/MASTER-PROMPT.md in full before any task. Agent identities and true-north blocks are copied verbatim into .claude/agents/.

- Build state lives in `build/tasks.json` (validate with `node build/validate-tasks.mjs`). Anything that contradicts the repo or the prompt → `needs_human`, keep going on independent work.
- Secrets live only in `.env` (git-ignored). Enable the secret guard once per clone: `git config core.hooksPath .githooks` (also runs on `npm install`).
- This repo is the existing Lead Velocity CRM (React + Vite + Supabase, edge functions in `supabase/functions/`). Reuse and extend it; never build a second system (0.2).

### 0.1 Canonical decisions (these win over anything else in this document; the orchestrator marks any conflicting text `needs_human` rather than guessing)
| Topic | Decision |
|---|---|
| Scope | **Full platform, built once, plug-and-play for every broker after Mark.** Nothing is cut; items are *sequenced* on the critical path (Section 5), not deferred. |
| Build inputs | **Reuse first.** Before any agent builds, the orchestrator inventories what Lead Velocity / Vantage Stack already have (0.2) and the agent adapts rather than rebuilds. |
| Commercial model | Pay per 30-day cycle, month-to-month, no contract, no notice period, price never tied to policies. |
| Unit sold | **Qualified lead** (3.3), counted only once **verified** (replied/tapped on WhatsApp within 72 h). Booking is a service. |
| Replacement cap | **Per cycle:** Bronze 4, Silver 6, Gold 9 (20% of committed). No weekly cap. |
| Shortfall | Cycle extends up to 14 days to deliver the committed number; remaining shortfall → pro-rata credit on the next cycle (or refund if not renewing). Liability capped at the cycle price. Word is "**committed**", never "guaranteed". |
| Grace / dunning | None — a cycle simply isn't renewed. (Supersedes any "7-day grace" wording.) |
| Payment default | **Instant EFT** (Paystack/Ozow); manual EFT = zero-fee alternative; card auto-renew = opt-in only. |
| Lead ownership | Delivered leads are the **broker's to use exclusively**; Lead Velocity retains the campaign data, pages, ad account and anonymised performance data. |
| **Consumer brand** | **SortMyCover** — own domain `sortmycover.co.za` (+ `.com` redirect) from the first impression; `sortmycover.leadvelocity.co.za` is **staging only**, password-protected, never shown to consumers or Meta. **CoverKlaar** held as the Afrikaans variant (domains reserved). The ~R250 for the two domains is the one allowed pre-payment spend. |
| Consent mode | **`named` by default while one broker**; `generic` only after the practitioner opinion approves it. |
| Infrastructure spend | **Nothing before first payment except the ~R250 brand domains.** VPS bought as step 1 of W26 after payment lands; local n8n + tunnel covers the gap. |
| Qualifying bands | Age: <35 / 35–44 / **45–50** / 51+ (no overlap). Budget: R750–R1,250 **and R1,250+ both qualify**. |
| **Booking UI** | **WhatsApp-native calendar (WhatsApp Flow with `CalendarPicker` + live slots) is the primary booking experience in chat; the landing page has its own in-page picker.** The client never leaves WhatsApp to book. Cal.com / Cal.diy is a *named fallback engine only* if W04/W05 overruns — never a client-facing page (Cal.com went closed-source Apr 2026; Cal.diy fork keeps API v2 but drops teams/round-robin). |
| **Email** | Collected **only when the chosen method needs an invite** (Teams / Zoom / Meet) and used only for that invite; WhatsApp-call and phone bookings never ask for it. |
| **Broker feedback** | Every meeting ends with an automated WhatsApp to the broker: outcome → one-tap disposition → 1–5 quality → optional voice note. Feedback feeds replacements, creative kill/scale, qualification tuning and the renewal case (4.12a). Unmarked at 24 h → `attended`, flagged. |
| **Research status** | **DONE — embedded in this prompt.** The top-5 reference sets, graded evidence, compliance findings, economics, brand and funnel research in Sections 1–4D and 6 were completed before this prompt was written. **No agent re-runs top-5 research, re-ranks players, or re-derives the evidence tables.** Agents read their section as the research input and build. The only permitted lookups are the time-sensitive facts in 4.0a (one targeted check each, cheapest model, logged in `costs.jsonl`); anything else marked ASSUMPTION is measured in production, not researched. **Runtime exception:** `optimisation-advisor` (4.15) runs **daily** on production data and build state, with a weekly capped scan of a fixed platform-changelog list — the only scheduled research in the system — and it only *proposes*; W33 (a separate judge) grades daily samples. |
| **Agent identity** | Every sub-agent has a **fixed title and a fixed set of five inspirations**, synthesised in this prompt (the *Identity* and *True north* blocks under each agent). The orchestrator copies them verbatim into the agent file as its persona. An agent may not rename itself, swap an inspiration, or cite a practitioner outside its five; if its five don't cover a decision, it marks `needs_human`. |
| **Creative production** | **Code-rendered first.** All cycle-1 creative (feed stills, Reels, stories, intro cards, end-frames) is built from the approved brand system in HTML/SVG and rendered to PNG/MP4 with headless Chromium + ffmpeg by `visual-producer` — no Google Flow, no design subscription. **Google Flow is an optional week-3 experiment** (4D.5), run only if hook rate < 30% or creative fatigue appears, and judged on cost per attended meeting. Remove Google AI Pro from the Phase 0 asks. |
| Workflow count | W01–W35 (35). |
| Pricing | Excl. VAT everywhere; VAT line added when registered. |

### 0.3 Pre-mortem — the challenges this build will hit, and the answer already decided (the orchestrator reads this before every phase; an agent that hits one of these does what the table says and does not stop to ask)
| # | What will go wrong (realistically) | Pre-decided answer | Who |
|---|---|---|---|
| 1 | **Meta template review takes 1–48 h and may re-categorise utility → marketing** | Submit all templates on Day 0 (first task of Phase 0); build and test with Meta's test number and the sandbox meanwhile; accept category decisions (cost delta is small); never block the build on a template | meta-operator, automation-engineer |
| 2 | **Business Verification / WABA display-name review pending for days** | Treat as external clocks: start Day 0, continue building; staging runs on the test number; Section 7 gates on them, the build doesn't | meta-operator |
| 3 | **Booking Flow publish needs the encrypted endpoint + health check** | 10-slot list ships first (W03 step 5 fallback is the launch path); Flow is a flag flip when published (W28); never on the critical path | automation-engineer |
| 4 | **Microsoft Graph: Mark's tenant blocks third-party app consent** | Portal shows the admin-consent link; fallback = Lead Velocity creates the event in a shared calendar Mark subscribes to, Teams link generated from howzit@'s tenant; documented in 4.6 | devops-security, broker-success |
| 5 | **Paystack KYC incomplete on go-live day** | Manual EFT with unique reference + inContact parsing (W16/W17) is a complete payment path on its own; card/Instant EFT switch on when KYC clears | billing-automation |
| 6 | **DNS propagation / SSL on sortmycover.co.za** | Register domains in Phase 0 hour 1; staging on a password-protected subdomain of leadvelocity.co.za; Traefik issues certs automatically; verify with `dns.google` before any publish | devops-security |
| 7 | **No VPS until payment → where does n8n run during the build?** | Local n8n in Docker + tunnel (Cloudflare Tunnel or ngrok) for webhooks; all credentials in `.env`; W26 restores them to the VPS after payment | devops-security |
| 8 | **The existing CRM repo differs from assumptions in 0.2** | The 0.2 inventory is produced *first*; every platform task reads the gap map; when the repo has a thing, adapt it; when the gap map says "missing", build it; never both | platform-architect |
| 9 | **LLM outputs drift (tone, FAIS)** | Golden set + eval gate (6B.1) is built in Phase 2 before any prompt is used in staging; W33 judge from Day 1 of staging | conversation-designer |
| 10 | **Secrets or PII leak into chat/logs/commits** | `.env` only, `.gitignore` enforced by a pre-commit hook, log redaction of numbers/emails, synthetic data only in tests; a leak = halt + rotate | devops-security |
| 11 | **Meta API rate limits / token expiry mid-run** | Back-off at 80% of the usage header; system-user token (non-expiring); W22 token-health daily | ads-api-engineer |
| 12 | **Mark's inputs arrive late (headshot, hours, FSP, agreement, video)** | Onboarding has defaults (hours 09–17, 3/day, Teams + phone), nudges at 24/72 h, and go-live only needs FSP verified + calendar connected + agreement signed; video is never blocking | broker-success |
| 13 | **CPL in week 1 is far above the model** | Kill rules (3.4) from R3,000; pulse pins CPL-vs-model; the shortfall clause and cycle extension are already in the agreement; no panic changes before 14 days unless an SLO burns | media-buyer, optimisation-advisor |
| 14 | **Scope creep from "world class"** | Section 7 is the definition of done; anything not gating a Section 7 line goes to `/build/backlog.md` with a reason; the optimisation-advisor proposes it later with a number | orchestrator |
| 15 | **Acceptance tests pass in isolation, fail end to end** | Synthetic suite (10 leads, every branch) + the day-in-the-life rehearsal (6B.10) are the only "done" for Phase 5; unit tests don't count | devops-security |
| 16 | **Token/cost blow-out in the build** | `costs.jsonl` per agent; model routing in 4A; research calls limited to 4.0a; the orchestrator halts an agent at 2× its budget and reports | orchestrator |
| 17 | **Human gates stall overnight** | Gates are batched (one WhatsApp list per run), each with a deep link and a default; the build continues on everything not behind the gate | orchestrator |
| 18 | **Something here is wrong or contradicts the repo** | Mark `needs_human` with the reason and continue on independent tasks; never guess on money, legal or publish decisions; never research around it | all |
