# Rubric: live landing page and quiz — faculties `page_flow`, `brand_search`

Sample: the live production page (and the quiz steps) once a day, plus any page build shipped in the last 24 hours. Rendered with headless Chromium at 390 px and 1280 px. Owner: `landing-page-builder`. Sources: 2.1.2, 3.5a, 4.5, 6B.3, 6B.4, 6B.8, 4D.4b.5.

| ID | Rule | Pass test | Severity |
|---|---|---|---|
| P-01 | **Consent** | Unticked checkbox, exact consent wording for the active `consent_mode`, privacy notice link, wording version matches the stored `consent_text_version` | critical |
| P-02 | **Disclosure and trust layer** | "a service of Lead Velocity (Pty) Ltd" plus registration number, the 8-rule disclosure, the how-we-make-money link, Information Officer, complaints channel with 48 h SLA | high |
| P-03 | **No advice, no product** | No product, insurer, premium, cover figure, comparison | critical |
| P-04 | **Banned words and second-person assertions** | As K-01 and K-03 | high |
| P-05 | **Speed** | LCP p75 < 2.5 s on mobile (field data if >= 100 visits, else lab at slow 4G); CLS < 0.1; INP < 200 ms | high if LCP > 4 s; medium otherwise |
| P-06 | **WCAG 2.2 AA** | axe run: no critical or serious violations; text contrast >= 4.5:1; tap targets >= 44 px; labels on every input; visible focus; quiz usable by keyboard | high |
| P-07 | **Quiz correctness vs spec** | Steps, order and bands match the flow spec; each step asks one thing; "not sure" available where specified; qualifying bands exact | high |
| P-08 | **Quiz wording** | Third person about money; Grade 5-7 | medium |
| P-09 | **Tracking integrity** | Pixel and CAPI events fire once per submit with a shared event_id; no PII in URLs | high |
| P-10 | **Bot protection and form safety** | Challenge and honeypot present; no sensitive fields (ID, bank, exact income) | critical if sensitive fields |
| P-11 | **Brand tokens** | Tokens from `/brand/tokens.json`, no off-token colours | medium |
| P-12 | **Findability basics** | Title, description, Organization and FAQ schema, canonical, sitemap, brand domain (never the staging host) | medium; critical if staging host or password-protected URL is public |
| P-13 | **Honest urgency only** | No countdowns or fake scarcity | high |
