# meta-operator: first-principles memo (one page)

**1. Goal (one sentence, one number).** Every Meta asset SortMyCover needs (portfolio, Page, IG, WABA with two numbers, two ad accounts, dataset, app, system user, templates, Flow, campaigns) exists, is owned by Lead Velocity (Pty) Ltd, is recorded by ID in the `brands` row, and stays unrestricted: **zero account restrictions and zero rejected assets in the first 90 days**.

**2. Fixed constraints vs conventions.**
| Fixed (law, platform, money) | Convention we do not have to follow |
|---|---|
| Meta Advertising Standards: financial-product ads 18+, no personal-attribute assertions, advertisers may be asked for a licence (2.1.3, 2.1.8) | "Agencies use aged or multiple ad accounts" |
| Special Ad Category decided by Meta's screen, not by us (2.1.4) | "Boost posts to warm a Page" |
| Time zone and currency fixed at ad-account creation | "Give the agency admin on everything" |
| WhatsApp display name and template category are Meta's decisions; review takes hours to days | "Use a BSP for WhatsApp" |
| A Cloud API number cannot also be on the WhatsApp app | "Apply for Advanced access / App Review" |
| Human gates on money, publish, terms, account settings (2.2); nothing spends before first payment (0.1) | "Automate posting to look active" |
| Consumer surfaces show only sortmycover.co.za (0.1) | |

**3. Mechanisms with A-grade evidence (my five).** (a) Setup in the documented order, portfolio then verification then assets then permissions, prevents new-account restrictions (Business Help Center). (b) Third-person, no-attribute, 18+ copy passes the classifiers (Advertising Standards). (c) Display name identical to the brand on the website and Page, utility templates tied to the person's own request, realistic samples: fewer review loops (WhatsApp onboarding docs). (d) Business Verification with documents that match the portfolio letter for letter; it raises messaging limits and is our only truthful answer if identity is questioned (Verification docs). (e) Standard access plus a non-expiring system-user token is enough for our own assets (Marketing API access docs).

**4. Simplest design that satisfies the constraints.** One portfolio, two admins with 2FA; one main and one standby of each asset that can fail on its own (ad account, Page, number) inside the same portfolio; categories that imply no licence (Website/Education); the same disclosure text everywhere (DW); one app, one admin system user, secrets only in `.env`, IDs only in `brands`; webhooks so the CRM sees status changes without polling; every Meta click that commits money, publishes or accepts terms done by Jonathan. Kept conventions: a Reach-objective warm-up ad instead of Boost (same goal, our controls, cheaper to audit); a written appeal playbook (faster, calmer response).

**5. Assumptions and kill criteria.**
| Assumption (C/D) | Test | Metric / date |
|---|---|---|
| SA targeting does not force the Financial products category | Screen at campaign creation (G11a) | Recorded before GATE-ADS-APPROVE-3 |
| Paused ads are reviewed without spending | Trio published paused | Review status within 48 h |
| Aggregated Event priority screen still exists | Events Manager | At GATE-PIXEL |
| Core templates approve as utility | Submission log | 48 h after Day 0 |
| Standby assets are usable on the day they are needed | Quarterly drill (6B.10) | First drill by day 30 |
**Kill criteria for this design:** any restriction in the first 30 days that traces to a setup step (wrong category, mismatched verification details, missing 2FA) means the runbook is wrong: fix the step, re-audit every asset against it within 48 h. Two template rejections for the same reason means the template rules in `automation/templates/README.md` change before more submissions.

**6. Deliberately not built.** Aged or purchased accounts; extra portfolios; any automated posting, warming or engagement scripts; Advanced access / App Review; a BSP; cloaked or mismatched landing pages; the standby assets as a way to re-run rejected content; any click on a money, terms or publish screen by the agent.
