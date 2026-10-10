# Fixed-source scan (weekly, Monday 06:00 before the memo) and cost caps

The **only scheduled research in the system** (0.1 "Research status", runtime exception). Fixed list, fixed caps, summaries only, no browsing beyond the list. The scan feeds the Technology Radar section of the weekly memo; it never changes anything.

## 1. The list (exactly the sources named in 4.15)
`url_status` is **unverified**: this build session had no web egress and the instructions forbade research, so the URLs below are starting points written from knowledge, not checks. On first run W32 records the HTTP status; a non-200 or a redirect to a different host sets `source_broken` and raises one `needs_human` line to Jonathan (never a search for a replacement).

| # | Source (4.15 name) | Start URL (unverified) | Why it matters to us | Max fetches / week |
|---|---|---|---|---|
| 1 | Meta for Business news | https://www.facebook.com/business/news | Ads policy, financial-services and insurance rules, lead-ad and CTWA changes | 2 |
| 2 | Meta Marketing API changelog | https://developers.facebook.com/docs/marketing-api/marketing-api-changelog | Breaking changes to the ads-api-engineer's calls, CAPI, rate limits | 2 |
| 3 | WhatsApp Business Platform changelog | https://developers.facebook.com/docs/whatsapp/cloud-api/changelog | Templates, Flows (version, CalendarPicker), quality rating, number limits | 2 |
| 4 | WhatsApp Business Platform pricing | https://developers.facebook.com/docs/whatsapp/pricing | Per-message rates (R per lead), free service-window rules, category cost | 2 |
| 5 | Anthropic release notes | https://docs.claude.com/en/release-notes/overview | New or retired models, API changes affecting Haiku/Sonnet runtime routing (4A) | 2 |
| 6 | Anthropic pricing | https://docs.claude.com/en/docs/about-claude/pricing | Rand per lead, daily and weekly caps | 2 |
| 7 | n8n releases | https://docs.n8n.io/release-notes/ | Node changes, security fixes, queue mode, breaking changes to W01-W35 | 2 |
| 8 | Google Flow / Veo notes | https://blog.google/technology/ai/ (Flow and Veo posts) and https://ai.google.dev/gemini-api/docs/changelog | Only for the optional week-3 creative experiment (4D.5); default class is **Hold** | 2 |
| 9 | FSCA notices | https://www.fsca.co.za/ (News, Notices, Communications) | Anything on lead generators, FSP marketing, advice or comparison rules | 2 |
| 10 | Information Regulator notices | https://inforegulator.org.za/ (Media statements, Enforcement notices) | POPIA, direct marketing, breach notification, processor rules | 2 |
| 11 | NCC registry notices | https://www.thencc.org.za/ (Notices; direct-marketing registration and opt-out registry) | CPA 2026 amendment regulations: registration, renewal, monthly cleanse mechanism | 2 |

**Caps:** at most 2 fetches per source (the index page, then at most one linked item judged relevant), so at most 22 fetches per week. Fetch is read-only, truncated to the first 12,000 tokens of text, no cookies, no login, no forms, no following links to other domains. If a page needs a login or blocks us, record `blocked` and move on (never route around it).

## 2. Summary prompt (Haiku, one call per fetched page)
```
SYSTEM
You summarise one fetched page for Lead Velocity's weekly technology scan. Facts only. Do not recommend, do not rank, do not speculate.
Return JSON: { "source_id": n, "url": "...", "fetched_at": "...", "items": [ { "date": "YYYY-MM-DD or null", "title": "...", "what_changed": "one sentence", "effective_date": "... or null", "touches": ["meta_ads|capi|whatsapp_templates|whatsapp_flows|whatsapp_pricing|anthropic_models|anthropic_pricing|n8n|google_flow|fsca|popia|ncc|other"], "affects_sortmycover": "yes|no|unclear", "reason_one_line": "...", "quote": "<= 25 words, verbatim" } ], "nothing_new_since": "YYYY-MM-DD" }
Rules: keep only items dated within the last 14 days or with an effective date in the next 90 days. Maximum 5 items. If the page is empty, unreadable or behind a login return items: [] and "blocked": true. Quote verbatim, never paraphrase a number or a date.
USER
Page text: {{page_text}}
```
The weekly memo (Sonnet) classifies each surviving item **adopt / trial / assess / hold**:
- **Adopt**: a platform change we already depend on that we must follow (deprecation, mandatory field, price change that alters R/lead), or a regulator requirement. Owner and a dated task.
- **Trial**: a new capability on a platform we already run on that plausibly moves a number in `slos.json`; needs a small PDCA test with a sample size and a kill rule.
- **Assess**: relevant but unproven or not yet effective; one named question to answer.
- **Hold**: everything else (including new tools off our stack, and Google Flow/Veo unless hook rate < 30% or creative fatigue is showing, 4D.5).
A regulator item is never below Assess. An item classed adopt or trial fires the out-of-cycle event (W32 event path) within 1 h of the memo run.

## 3. Cost caps and how they are enforced
**ASSUMPTION caps from 4.15:** about **R15 per day** (daily pulse and judge) and **R40 per week** (memo, scan and, when it falls in the week, the monthly retro). Rates for the check live in one place, `optimisation/automation` Code node `rates` (Haiku 4.5 US$1 in / US$5 out per MTok; Sonnet 5.5 US$2 / US$10, from 4A) and an exchange rate read from `ops.settings.usd_zar` (ASSUMPTION R18 until set; verified-facts.md to confirm).

Estimated cost per run (ASSUMPTION; real values replace them in `ops.costs` after day 1):
| Job | Model | Estimate |
|---|---|---|
| Daily judge (5 rubrics + change grading) | Haiku | R1.2-R2.0 |
| Daily pulse | Haiku | R0.3-R0.6 |
| Weekly scan (up to 22 pages) | Haiku | R4-R8 |
| Weekly memo | Sonnet | R2-R4 |
| Monthly retro | Sonnet | R4-R8 |
So the caps are about 5x headroom, which is deliberate: a runaway loop must hit the cap, not the budget.

**Enforcement (Code node `cap_guard`, runs before every model call in W32 and W33):**
1. Read today's `ops.costs` rows where `kind = 'llm'` and `source_ref like 'optimisation-advisor:%'`; read this ISO week's the same way. Estimate the next call from input tokens times the rate table.
2. **Reserve first.** The pulse has a reserved R3/day and the memo R12/week that no other job may spend. Order of spend each day: pulse reserve is held back; then judge on conversations, comment replies, briefs; then creatives and the page; then change grading. Weekly: memo reserve held back; then the scan; then the retro.
3. **At 80% of a cap:** skip the lowest-priority jobs (creatives and page for the day; scan sources 9-11 are never skipped, regulators first, Google Flow/Veo skipped first).
4. **At 100%:** no further model calls from the optimisation-advisor except the reserved pulse or memo.
   - Daily: the pulse is still written **from production data only** by the deterministic template node (statuses, signals with numbers, compliance line, build line; no cause hypotheses, no new proposals), headed "AI summary skipped: daily cap". Judge results already in `ops.quality_grades` are still shown.
   - Weekly: the scan is skipped and the memo is written from production data without the Radar ("Scan skipped: weekly cap").
5. Every call writes `ops.costs(date, kind='llm', amount_zar, source_ref='optimisation-advisor:<job>')`; during the build the same row is appended to `build/costs.jsonl`.
6. A cap hit on two consecutive days (or three weekly) raises one amber signal in the **infra & cost** faculty ("advisor cost above cap"), owner `devops-security`. The advisor never raises its own cap; only Jonathan can, in settings.

## 4. Fetch count actually used
The cap is at most 2 per source. The v1 workflow uses **one** fetch per source (the start URL), so at most 11 per week. A second fetch of one linked item per source is allowed by the cap but not built; add it only if the index pages prove too thin to classify.
