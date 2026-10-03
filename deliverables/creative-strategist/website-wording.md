# leadvelocity.co.za — Home and Pricing wording rewrite (3.5a)

> **For contracts-drafter + compliance-qa sign-off. landing-page-builder implements via W25.**
> Status: DRAFT v1.1 (fix wave 1 from compliance-qa `phase4-review-2.md` §6: W-1, W-2, W-3, W-4 applied; NH-14 Option A text marked pending) · Owner: creative-strategist · Date: 2026-10-02

**Source of "before":** the repo is the live copy (`src/pages/Home.tsx`, `src/components/Hero.tsx`, `src/components/TrustBar.tsx`, `src/pages/Pricing.tsx`, `src/pages/Promotions.tsx`, `src/components/Footer.tsx`). The 3.5a Chrome capture of the deployed site into `/deliverables/website/current/` was **not** done here, because this agent has no browser. landing-page-builder should confirm that the deployed site matches the repo before W25 runs (see NH-12, Vercel).

**Method:** words change, structure doesn't. Every section, heading level, card count and order stays as it is. Three exceptions are flagged as `needs_human` at the end: the FAQ block (none exists today), a CTA button inside each tier card, and removing the Gold "Commission" block.

**Rules held:** Grade ≤ 7 plain SA English, no exclamation marks, no premium or cover figure, no insurer names, the delivery word is always "committed" (0.1), "no lock-in" instead of any claim that there is no agreement (CPA s41: brokers sign one), replacements **per cycle** (0.1), prices excl. VAT (0.1), tier values only from `pricing` fields.

---

## 0. Where the seven non-negotiable statements sit

| # | Statement | Home | Pricing |
|---|---|---|---|
| 1 | What you're buying | Hero subheading | Page header subheading |
| 2 | What qualified means (+ link to the full definition) | Features card 1 | Tier-card footnote link + FAQ "What is a pre-qualified lead?" (anchor `#what-qualified-means`) |
| 3 | Nurtured and managed with AI | Features card 3 | "What every plan includes" column 1 |
| 4 | Replacements | Features card 4 (generic cap wording) | Tier-card notes (with `{{replacement_cap_cycle}}`) |
| 5 | What we don't do | Features intro line | "What every plan includes" column 2 |
| 6 | Pricing is all-in | Mission Control paragraph | "What every plan includes" column 3 |
| 7 | Honesty line (replaces "33–40 estimated leads") | Features card 2 (generic) | Tier-card leads row (with `{{committed_leads}}`) |

**Statement texts as placed.** Statements 2, 3, 5 and 6 are verbatim from 3.5a. Statement 1 is verbatim except its old "no-agreement" phrase → "no lock-in" (compliance-qa W-1, CPA s41; mandated text, so it is pending Jonathan's sign-off on NH-new-A). Statement 4 is adjusted to 0.1 and NH-CD-09. Statement 7 is verbatim with fields.
1. "Month to month, no lock-in. You pay upfront for one month and get a set number of **pre-qualified leads** — people who told us their age band, that they can budget for cover, and that they want a call with a licensed adviser. Not clicks. Not raw form fills."
2. "**What qualified means:** age band · budget band · valid SA mobile reachable on WhatsApp · agreed to a virtual or phone call · consented to be contacted · not a duplicate in 90 days. [Full definition →](#what-qualified-means)"
3. "Every lead is followed up within 60 seconds on WhatsApp by our AI assistant, booked straight into your calendar, reminded before the call, and rescheduled if they miss it — automatically. You get a pre-call brief on who they are and what they asked."
4. "If a verified lead no-shows or can't be reached, we replace it — up to {{replacement_cap_cycle}} per cycle on this plan. If we fall short of your committed number, your cycle extends by up to 14 days to deliver it, and anything still short is credited."
   *Change from 3.5a: "extends until we deliver" becomes "extends by up to 14 days". 0.1 and the term sheet cap the extension at 14 days (NH-CD-09). contracts-drafter to confirm.*
5. "We don't give financial advice, compare products or quote premiums. You're the licensed adviser; we fill your diary."
6. "Ad spend, landing pages, WhatsApp automation and reporting are included. No setup fee. No per-policy commission — ever."
7. "{{committed_leads}} verified, pre-qualified leads per cycle — committed, not estimated. Short? We extend and credit."

---

## 1. Home page (`/`) — before / after, in page order

### 1.1 SEO (`Home.tsx` `<SEO>`)
| Element | Before | After |
|---|---|---|
| title | High-Performance Insurance Leads | Pre-Qualified Life Cover Leads for Licensed Advisers |
| description | Connect with qualified business insurance prospects. Lead Velocity provides structured, verified leads for brokers in South Africa. | Month-to-month, pre-qualified life cover leads for licensed advisers in South Africa. WhatsApp follow-up, booking and reminders included. No lock-in. No commission. |

### 1.2 Hero (`Hero.tsx`)
| Element | Before | After |
|---|---|---|
| Badge | Built by Former Brokers | Built by Former Brokers *(unchanged)* |
| H1 (plain + gradient span + plain) | Stop Chasing **Bad Leads.** Get Verified Prospects You Can Actually Close. | Stop Chasing **Cold Numbers.** Get Pre-Qualified Leads Who Asked for a Call. |
| Subheading | We were tired of buying leads that never answered. So we built the system we always wanted. Verified, high-intent prospects delivered weekly—built by former brokers who know the game. | **Statement 1** (verbatim, above). |
| CTA 1 / CTA 2 | Get Started Today / View Services | See Plans and Pricing / View Services *(CTA 1 label only. Link target unchanged unless landing-page-builder points it at `/pricing`.)* |
| Stat 1 | Built by Brokers — *Created by Former Agents* | Built by Brokers — *Created by Former Agents (unchanged)* |
| Stat 2 | Quality Verified — *Smart Tech + Human Review* | WhatsApp-Verified — *A lead counts only once they reply* |
| Stat 3 | Consistent Flow — *Weekly Lead Delivery* | Committed, Not Estimated — *A set number every 30-day cycle* |

### 1.3 Trust bar (`TrustBar.tsx`)
| Before | After |
|---|---|
| Former Broker Founders | Former Broker Founders *(unchanged)* |
| Double-Verified Prospects | WhatsApp-Verified Leads |
| Consistent Weekly Pipeline | Month to Month. No Lock-In. |

### 1.4 Features — "Why Choose Lead Velocity" (4 cards)
| Element | Before | After |
|---|---|---|
| H2 | Why Choose **Lead Velocity** | Why Choose **Lead Velocity** *(unchanged)* |
| Intro line | We combine cutting-edge technology with industry expertise to deliver results that matter. | **Statement 5:** We don't give financial advice, compare products or quote premiums. You're the licensed adviser; we fill your diary. |
| Card 1 title / text | High-Intent Prospects — We don't just find people; we find prospects ready to talk. Our internal algorithms help you reach the right people. | **Pre-Qualified, Not Raw** — **Statement 2** (the qualified-means line + "Full definition →" link to `/pricing#what-qualified-means`). |
| Card 2 title / text | Predictable Pipeline — Stop guessing where your next deal is coming from. Get a steady flow of verified leads delivered weekly. | **Committed, Not Estimated** — A set number of verified, pre-qualified leads per cycle — committed, not estimated. Short? We extend and credit. *(Statement 7, generic. The tier number is on the pricing page.)* |
| Card 3 title / text | Broker-Verified — Every lead is reviewed by a team that understands the insurance journey, not just a generic call center. | **Nurtured With AI** — **Statement 3** (verbatim). |
| Card 4 title / text | Scalable Growth — When you're ready to grow, our infrastructure scales with you. Build a more consistent sales calendar. | **Replaced If They No-Show** — If a verified lead no-shows or can't be reached, we replace it, up to your plan's cap each cycle. If we fall short, your cycle extends by up to 14 days, and anything still short is credited. *(Statement 4, generic.)* |

### 1.5 Brand story — "The Epiphany That Changed Everything."
| Element | Before | After |
|---|---|---|
| H2 | The **Epiphany** That Changed Everything. | *(unchanged)* |
| Paragraph | We spent years in the field as brokers. We know the frustration of spending thousands on "hot leads" that turned out to be cold numbers. We realized that the industry didn't need faster bots—it needed a system built by people who have actually sold a policy. We combined our broker expertise with smart technology to build what we always wished we had. | We spent years in the field as brokers. We know what it costs to pay for leads that turn out to be cold numbers. So we built what we always wanted. Ads that teach, not push. A WhatsApp reply in 60 seconds. A call booked straight into your diary. And a lead only counts once it is pre-qualified and has replied on WhatsApp. |
| Card 1 | Consistent Delivery — Build a reliable pipeline with qualified leads delivered weekly directly to your inbox. | **Consistent Delivery** — Leads arrive in your portal and on WhatsApp as they qualify, each with a short pre-call brief. |
| Card 2 | Precision Quality — Our AI-powered verification system ensures every lead meets your high standards. | **Verified on WhatsApp** — A lead counts only once they reply or tap on WhatsApp within 72 hours. That proves the number is theirs. |
| Image alt text | (Einstein…) | *(unchanged, out of scope)* |

### 1.6 Mission Control — "Your Mission Control for Growth"
| Element | Before | After |
|---|---|---|
| H2 | Your **Mission Control** for Growth | *(unchanged)* |
| Paragraph | Navigate the complex world of lead generation with confidence. Our team monitors, optimizes, and delivers results while you focus on closing deals. | **Pricing is all-in.** Ad spend, landing pages, WhatsApp automation and reporting are included. No setup fee. No per-policy commission — ever. *(Statement 6.)* |
| Bullet 1 | Real-time lead tracking and analytics | Live lead tracking in your broker portal |
| Bullet 2 | Dedicated account manager support | A plain-English report every Monday |
| Bullet 3 | Continuous optimization for maximum ROI | New ads tested every 2–3 weeks |

### 1.7 Footer (shared, `Footer.tsx`)
| Element | Before | After |
|---|---|---|
| Company line | Premium lead generation for insurance brokers and financial advisors in South Africa. | Pre-qualified leads for licensed insurance advisers in South Africa. |
| Services item 2 | Financial Advisory Leads | Life Cover Leads |
| Links | … Promotions … | Depends on NH-14 (section 5) |

---

## 2. Pricing page (`/pricing`) — before / after, in page order

### 2.1 SEO
| Element | Before | After |
|---|---|---|
| title | Broker Pricing Plans | Broker Pricing Plans *(unchanged)* |
| description | Transparent, structured pricing plans for insurance brokers. Choose from Bronze, Silver, or Gold tiers to scale your business. | Month-to-month plans for licensed advisers. A committed number of pre-qualified life cover leads every 30-day cycle. Ad spend included. No lock-in. No commission. |
| keywords | insurance broker pricing, lead generation pricing, bronze silver gold plans, insurance leads cost | life cover leads pricing, pre-qualified leads, bronze silver gold plans, month to month leads |

### 2.2 Header
| Element | Before | After |
|---|---|---|
| H1 (plain + gradient span) | Structured, Premium, **Scalable.** | Committed, All-In, **Month to Month.** *("Premium" removed: in this category it reads as an insurance premium.)* |
| Subheading | Transparent pricing designed to anchor value and grow with you. From consistent deal flow to a full revenue partnership. | **Statement 1** (verbatim). *("Revenue partnership" removed: it implies a share of the broker's income, which is the 2.1.1 risk.)* |

### 2.3 Tier cards (3 cards, same component, generated from `pricing`)

**Template: one card per active row in `pricing`, ordered by `price_zar`.** Nothing is hard-coded (3.6).
| Card slot (existing component prop) | Before (Bronze / Silver / Gold) | After (template) |
|---|---|---|
| `title` | Bronze / Silver / Gold | `{{name}}` |
| `description` (subtitle) | Growth Starter / Scale & Optimise / Performance Partner | Start here / More volume / Most volume *(static per `tier_code`. Optional `pricing.tagline` field. "Partner" dropped, see 2.2.)* |
| `price` + suffix | R8,500 / R10,500 / R16,500+ · "/mo" | `R{{price_zar}}` · "/ 30-day cycle, excl. VAT" *(no "+" suffix: the price is fixed and all-in)* |
| Row 1 label / value | Est. Leads · ± 17 / ± 23-26 / 33-40+ | **Pre-qualified leads** · `{{committed_leads}}` verified, pre-qualified leads per cycle — committed, not estimated. Short? We extend and credit. *(Statement 7)* |
| Row 2 label / value | Effective CPL · ± R500 / ± R400-R450 / ± R350-R400 | **Price per committed lead** · `R{{price_zar ÷ committed_leads}}` *(derived at render time, not stored)* |
| "Included" list | SME decision-maker leads, targeting, check-ins, delivery priority, etc. (B2B) | • `{{committed_leads}}` pre-qualified leads per cycle<br>• AI WhatsApp follow-up, booking & reminders included<br>• Up to `{{replacement_cap_cycle}}` replacements per cycle<br>• Media spend included<br>• Pre-call brief for every booked call and a Monday report |
| `commission` block | Gold only: "Option to renegotiate for volume/exclusivity" | **Removed on every tier.** Leave the prop unset. *(2.1.1: price never tied to policies.)* |
| `notes` | Bronze: "Minimum recommended post-pilot. Best for brokers refining their process." · Silver: "Our most popular tier…" · Gold: "For high-performing teams ready to dominate a niche." | **Statement 4** with `{{replacement_cap_cycle}}`. Then: "Qualified means the 6 checks in our [definition](#what-qualified-means)." *(Statement 2 link)* |
| "Recommended" badge | Silver | Unchanged (design). Jonathan may move it; it is not a wording decision. |
| CTA (new, inside the card) | — (none today) | **Start on `{{name}}`** → checkout with the tier pre-selected. *(flagged: adds an element)* |

**Rendered check at today's `pricing` values (3.5):** Bronze R16,500 · 20 · 4 · R825 per lead. Silver R24,500 · 30 · 6 · R817. Gold R35,500 · 45 · 9 · R789. These figures are shown only to check the template. They are not to be typed into the page.

**Line under the cards (3.5a, with the old "no-agreement" phrase → "no lock-in" per W-1 / NH-new-A; contracts-drafter confirms):**
"**Month to month. No lock-in. Pay for a month, get your leads, decide again next month.** Pay upfront by EFT or card; renew (or not) before your next cycle."
*Small print under it (0.1):* "Prices exclude VAT. No notice period: if you don't renew, the cycle simply ends."

### 2.4 "Broker Positioning" block (3 columns, keep layout)
| Element | Before | After |
|---|---|---|
| H2 | Broker Positioning | What Every Plan Includes |
| Column 1 label / quote | Bronze — "Where we prove consistency." | **AI follow-up** — Statement 3 (verbatim) |
| Column 2 label / quote | Silver — "Where results become predictable." | **What we don't do** — Statement 5 (verbatim) |
| Column 3 label / quote | Gold — "Where we operate as a revenue partner." | **All-in pricing** — Statement 6 (verbatim) |

### 2.5 "Progression Path" block (4 chips, keep layout)
| Element | Before | After |
|---|---|---|
| H3 | Progression Path | How a Cycle Works |
| Chips | Pilot Phase → Bronze → Silver → Gold | Pick a plan → Pay for one cycle → Verified leads arrive → Renew, change plan, or stop |

### 2.6 FAQ (new block, after "How a Cycle Works", before the footer, reusing the card style of the Promotions "Why Start with a Pilot?" block) — **flagged: no FAQ block exists today**

| Question | Answer (Grade ≤ 7) |
|---|---|
| <a id="what-qualified-means"></a>**What is a pre-qualified lead?** | A real person who told us their age band and that they can budget for cover. They also gave a valid SA mobile that works on WhatsApp, agreed to a video, WhatsApp or phone call, and agreed to be contacted. And they are not a repeat from the last 90 days. A lead counts toward your number only once they reply or tap on WhatsApp within 72 hours. The full definition is in your agreement. |
| **How fast do you contact my leads?** | Within 60 seconds, on WhatsApp. The first message names you, your practice and your FSP number. Then our assistant books the call into your calendar. |
| **What does the AI do, and what does it never do?** | It replies on WhatsApp, answers simple questions about the call, books a time, sends reminders, and moves the call if they miss it. It never gives advice, never compares products, never talks about premiums or cover amounts. Those questions go to you, in the pre-call brief. |
| **Do I need my own ad account?** | No. We run the ads and pay for them. Ad spend is part of your plan price. |
| **Who owns the leads?** | You do, exclusively, once delivered. We never send the same lead to another adviser. We keep the ads, pages and anonymised performance data. |
| **What happens if a lead doesn't show?** | Tap the outcome after the meeting. A no-show, or a lead we can't reach, is replaced — up to your plan's cap each cycle. We never replace a lead because they didn't buy. |
| **Is this compliant with FAIS and POPIA?** | We connect consumers to licensed advisers and never advise. Consumers opt in. You receive their details with their consent. Our fee is a flat price per cycle, never tied to policies. |
| **Is there a contract?** | There is a short, plain-language agreement that you sign. But there is no lock-in, no minimum term and no notice period. You pay for one 30-day cycle at a time. If you don't renew, it simply ends. |

*FAQ text must also go into `/knowledge/faq.md` (6B.9) so the B2B chatbot and the page say the same thing. The Einstein chatbot prompt still hard-codes the old tiers (inventory 4.1). That is for landing-page-builder / W25.*

---

## 3. What was removed (and where)

| Removed | Where it was | Why |
|---|---|---|
| "33-40+" leads, "± 17", "± 23-26" | Pricing tier cards, "Est. Leads" row | 3.5 / 3.5a: replaced by committed numbers from `pricing` |
| "Est. Leads" label, "Effective CPL" ranges | Pricing tier cards | "Estimated leads" is a banned term. Ranges replaced by a derived price per committed lead |
| R8,500 / R10,500 / R16,500+ hard-coded | Pricing | 3.6: one source (`pricing`) |
| "Option to renegotiate for volume/exclusivity" (Commission) | Pricing, Gold card | 2.1.1 (*Raspberry Academy*) |
| "revenue partnership", "revenue partner" | Pricing subheading, Broker Positioning | Implies a share of the broker's income (2.1.1) |
| "Best for brokers refining…" | Pricing, Bronze notes | Banned word "best" |
| "Pilot Phase" chip | Pricing, Progression Path | Legacy product. See NH-14 |
| "delivered weekly" ×4, "Weekly Pipeline", "Weekly Lead Delivery" | Hero, TrustBar, Features, Brand story | Unit is the 30-day cycle (0.1). Leads arrive live, not in weekly batches |
| "hot leads" | Home, Brand story | Banned word |
| "Premium" (in "Structured, Premium" and "Premium lead generation") | Pricing H1, Footer | Ambiguous in an insurance context |
| "Financial Advisory Leads" | Footer | Too close to the banned "financial advice" |
| **Every banned delivery-promise word** (the word 0.1 replaces with "committed") | Promotions only: SEO description, SEO keywords, the Pilot tier label, and the "…conservatively" line (`Promotions.tsx` l.23, l.24, l.72, l.138) | 0.1: the only delivery word is "committed". Fate of the page = NH-14 (section 5). None of the new text uses the banned word |

---

## 4. Banned-word scan (3.5a list), Home + Pricing + Footer + Promotions

Hand scan of the "before" (grep over the six source files) and of every "after" string in this document.
| Banned term | Before | After (this rewrite) |
|---|---|---|
| Banned delivery-promise word (and "… sales" variant), 3.5a list | 4 hits, all in `Promotions.tsx` (l.23, l.24, l.72, l.138) | **0** |
| "hot/warm leads" | 1 (`Home.tsx` l.123 "hot leads") | **0** |
| "best / cheapest cover" | 1 near-miss: "Best for brokers…" (`Pricing.tsx` l.145) | **0** |
| Any premium or cover figure | Promotions "R1M+ Contents / R4M+ Building" (sum-insured thresholds, B2B) | **0.** Rand figures appear only as plan prices from `pricing` |
| "estimated leads" | 1 ("Est. Leads", `Pricing.tsx` l.48) + the 33–40 values | **0 as a claim.** "not estimated" appears only inside the mandated statement 7 negation |
| "appointments" as the unit sold | 0 | **0.** Booking is described as a service ("booked straight into your calendar") |
| "financial advice" | 0 exact; 1 near-miss ("Financial Advisory Leads", Footer) | Only in the **mandated negations**: statement 5 and the FAQ "never advises" answer (same treatment compliance-qa passed in phase0-review-1 §2.9) |
| Insurer names | 0 | **0** |
| Related risk: "commission" tied to policies | 2 ("10% of broker commission (on placed business)", Promotions l.128; Gold "Commission" block, Pricing l.189) | Only the negation "No per-policy commission — ever" (statement 6) |

**Result: PASS for the rewritten Home and Pricing pages.** The **Promotions page fails** as it stands (the banned delivery-promise and "risk-free" wording, a commission-on-placed-business line, and sum-insured figures). It is not part of the Home/Pricing rewrite; its fate is NH-14.

---

## 5. NH-14 — the legacy B2B tiers (options shown, not decided)

Today the same site sells B2B SME insurance "lead tokens" (Pilot R6,000 for 10 leads, worded with the banned delivery-promise word; Bronze R8,500, Silver R10,500, Gold R16,500+). The SortMyCover ladder reuses the names Bronze/Silver/Gold at different prices and for a different product. The rewrite above assumes the Home and Pricing pages sell the SortMyCover ladder, as 3.5a requires. Jonathan decides which of these applies:

| Option | What changes on the site | Consequences to weigh |
|---|---|---|
| **A. Withdraw the B2B tiers** — **text pending NH-14** (compliance-qa's preferred option; not live until Jonathan decides) | `/promotions` removed (301 → `/pricing`). Footer and nav drop "Promotions". Footer "Insurance Leads" item reads "Life Cover Leads" only. Existing B2B clients are served off-site (proposal/invoice). **Take-down note (pending NH-14), shown only if a holding page is needed instead of a bare 301:** "Our business-insurance lead plans have closed to new sign-ups. Existing clients: please contact us directly. For life cover leads, see our plans." | Clean single message, and the banned wording disappears with the page. Existing B2B deals lose their public reference page |
| **B. Keep B2B behind a separate page** | B2B tiers move to one page, e.g. `/business-leads`, renamed so they don't clash with Bronze/Silver/Gold (e.g. "Business Starter / Business Growth / Business Scale"). It is linked from Services only, not from Home or Pricing. Home and Pricing stay as above | Two products, one brand. Name clash avoided. **Under this option the B2B page still has to be fixed first:** every banned delivery-promise word and "risk-free" → "committed", and the "10% of broker commission (on placed business)" line removed or re-checked. That is a fee contingent on policies written, the exact 2.1.1 *Raspberry Academy* pattern (short-term business insurance is also a FAIS financial product). This is a fact for compliance-qa, not a decision |

Either way: the Einstein chatbot prompt, `ProposalGenerator.tsx` and `InvoiceGenerator.tsx` still hard-code the old tiers (inventory INV-G01/G02, 4.1). That is W25 / 3.6 scope, not this document.

---

## 6. needs_human raised by this document
- **NH-CS-W1 (structure):** 3.5a says "FAQ additions (same FAQ block as now)", but there is **no FAQ block** on Home or Pricing today. The only similar block is "Why Start with a Pilot?" on `/promotions`. I propose a new block on Pricing (2.6) that reuses that card style. landing-page-builder / Jonathan to confirm.
- **NH-CS-W2 (structure):** the tier cards have no button today. 3.5a mandates "CTA Start on {tier}". I propose a button inside each existing card.
- **NH-CS-W3 (contract wording):** statement 4 changed from "extends until we deliver" to "extends by up to 14 days" per 0.1 and NH-CD-09. Statement 4 names no-show / can't be reached, while the agreement's Schedule C also replaces leads that fail the definition (NH-CD-10). contracts-drafter to align the page and the agreement.
- **NH-CS-W4 (money):** NH-14 (section 5), with the Promotions commission line flagged as a 2.1.1 issue under either option. compliance-qa prefers Option A and asks for the commission, delivery-promise and "risk-free" lines to come off the live site now under either option (phase4-review-2 §6). The Option A take-down note above is pending NH-14.
- **NH-new-A (mandated text):** statement 1, the line under the cards, the trust bar and both SEO descriptions now say "no lock-in" instead of the old "no-agreement" phrase (compliance-qa W-1, CPA s41). Statement 1 and the under-cards line are 3.5a mandated text, so Jonathan signs off the change. The FAQ answer is not mandated and is fixed regardless (W-2).
- **W-5 (open, not mine to decide):** "Built by Former Brokers" / "Former Broker Founders" stay only if Jonathan confirms he/KG held broker or representative roles; otherwise remove.
- **NH-CS-W5 (process):** the live site was not captured with the Chrome agent (3.5a method). The repo source is used as "before". Confirm the deployed site matches the repo (NH-12).
- **NH-CS-W6 (reading grade):** statements 1–7 are mandated verbatim. Statement 3 has 2 sentences of about 27 and 13 words, so it scores about Grade 8–9 on its own. I did not rewrite mandated text. If compliance-qa wants it at Grade 7, a split version is: "Every lead gets a WhatsApp from our AI assistant within 60 seconds. It books them into your calendar and reminds them before the call. If they miss it, it moves the call — automatically. You get a short brief on who they are and what they asked."
