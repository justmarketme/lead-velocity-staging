# Google Search: negative keywords, test plan and budget rules (Perry Marshall lens)

Written 17 Oct 2026 by Claude Code for when SortMyCover's first Google Search campaign is built. **Nothing here is live; no ad account changes were made.** Built from the 16 Oct keyword research (`deliverables/website/research/keyword-research-2026-10-16.md`, Google Trends ZA + SA autocomplete). Search terms change: rerun `node sites/sortmycover/scripts/trends-za.mjs` and review the first week's search terms report before trusting this list.

Marshall's question for every rand: **are we spending on the most relevant searches, and measuring the right result?**

## 1. Before launch: open decisions for Jono
1. **Meta budget vs plan.** The master brief plans R6,500/month: Google Search R3,900 (≈R128/day) and Meta R2,600 (≈R85/day). The Meta draft campaign is set to **R150/day (≈R4,500/month)**, more than its whole allocation. Choose: cut Meta to ≈R85/day, or raise the total and say so.
2. **"Compare" keywords.** The brief lists "compare life insurance" and "life cover comparison". SortMyCover does not compare products (site wording rules ban "compare"), so the landing page cannot deliver what the search asks. Recommended: **exclude** them (section 2, list A). If kept, the ad and page must say plainly that an adviser explains options, not that SortMyCover compares.
3. **Target ad cost per lead (protects Lead Velocity's profit).** Mark's deal: R16,500 for 20 leads = **R825 revenue per delivered lead**. Ad spend must leave room for running costs and profit:

   | Per delivered lead | 40% profit | 50% profit |
   |---|---:|---:|
   | Revenue | R825 | R825 |
   | Lead Velocity profit | R330 | R413 |
   | Running costs (WhatsApp, voice, tools; **estimate** ~R50, replace with real figures) | R50 | R50 |
   | **Max ad spend per delivered lead** | **R445** | **R362** |

   Ads pay for every raw lead, not only delivered ones (under-R750 band held, no-replies, no-shows). At an assumed 60% delivery rate, max ad spend per **raw** lead is about **R267** (40% profit) or **R217** (50% profit).

   **Decided by Jono, 17 Oct 2026: 50% profit.** Hard stop **R362 ad spend per delivered lead** (about **R217 per raw lead**). Working target **R300 per delivered lead** (about **R180 per raw lead**), so normal swings stay inside the margin. Jono confirmed on 17 Oct 2026 that the R16,500 had **no VAT** in it, so revenue is R825 per lead and these figures stand. Replace the 60% delivery rate with the real rate once the CRM has 30–50 leads.
4. **Google financial services verification.** Check whether Google requires advertiser verification for financial services in South Africa before ads can run (not verified here).

## 2. Negative keywords (paste-ready)
Google Ads format: a plain word is a broad negative, `"quotes"` is phrase, `[brackets]` is exact. Put list A at **account level** (shared list "SMC – Never"), the rest on the relevant campaigns.

### A. Never (account level): out of scope, wrong intent, or a page mismatch
```
funeral
funeral cover
funeral policy
burial
car insurance
vehicle insurance
home insurance
household insurance
short term insurance
medical aid
gap cover
hospital plan
pet insurance
travel insurance
retirement annuity
pension
provident fund
investment
unit trust
shares
crypto
compare
comparison
free
"no medical"
"without medical"
"no waiting period"
```
Why the last group: SortMyCover does not compare, offers no free cover, and cannot promise no medicals or no waiting period (policy terms an adviser explains), so these searches land on a mismatch.

**Watch, do not block yet:** `best`, `cheap`, `cheapest`. "Best life cover south africa" is a large, high-intent search. Bid on it, but the ad and page must never say "best" or "cheapest" (banned wording). Block only if the search terms report shows these clicks do not book.

### B. Jobs, study and careers (account level)
```
jobs
job
vacancies
vacancy
career
careers
salary
salaries
course
courses
diploma
degree
qualification
cfp
institute
fpi
learnership
internship
exam
"rpe"
```

### C. Do-it-yourself and documents (account level)
```
template
templates
pdf
form
forms
sample
example
examples
download
"grade 9"
"grade 10"
"grade 11"
"grade 12"
assignment
essay
meaning
definition
```
Note on `meaning` / `definition`: people searching "what is life cover" are learning, not booking. Leave them to the SEO guides (organic) rather than paying for the click. Revisit after the first month if search terms show bookings from them.

### D. Other countries (account level)
```
uk
usa
canada
australia
nz
"new zealand"
ireland
ontario
alberta
texas
scotland
india
nigeria
kenya
dave ramsey
reddit
```

### E. Providers, brands and service queries (account level)
Searches for a named insurer or bank are looking for that company, and the site names no insurer.
```
old mutual
sanlam
discovery
liberty
momentum
hollard
1life
"one life"
clientele
assupol
avbob
metropolitan
outsurance
budget insurance
dial direct
king price
pps
fnb
absa
standard bank
nedbank
capitec
wesbank
african bank
dischem
"dis-chem"
"contact details"
"contact number"
"customer service"
login
"log in"
claim
claims
cancel
cancellation
complaint
debarment
ombud
ombudsman
```

### F. Campaign-specific
- **Wills campaign:** `attorney`, `lawyer`, `"near me"`, `court`, `"high court"`, `divorce`, `"letters of authority"` (people already winding up an estate), `unclaimed`.
- **Business owners campaign:** `"buy and sell agreement template"`, `"key person insurance australia"` (already covered above), `accounting`, `bookkeeping`.
- **Life cover campaign:** `"for parents over"` (parents are outside the 35–50 quiz band; revisit if a parents product is ever offered).

## 3. Keywords worth bidding on (start narrow)
Highest-intent first; each with its own ad group and the matching landing page.
| Ad group | Keywords (phrase match to start) | Landing page |
|---|---|---|
| Life cover | "life cover south africa", "life insurance south africa", "life cover quotes" (ad must not promise a quote) | home or `new-bond` |
| Bond / credit life | "credit life insurance", "bond protection", "life insurance for home loan", "credit life vs life insurance" | `new-bond` |
| Income | "income protection insurance", "salary protection insurance", "disability income protection" | `salary-stops` |
| Business | "key person insurance south africa", "buy and sell agreement insurance" | `owners-directors` |
| Wills | "how to write a will in south africa", "will south africa" is noisy (weather, sport): use "write a will" phrases only | wills campaign page |

Expect low volumes on most of these (Trends: credit life 2, income protection 4, key person ≈0, against life cover 66). Life cover will take most of the spend.

## 4. Test plan
1. **One variable at a time.** Change the hook or the image or the landing page, never two at once, so a result can be attributed.
2. **Measure the right result.** The decision metric is **cost per qualified, booked appointment** (and later attendance), pulled from the CRM. Clicks, CTR and WhatsApp taps are diagnostics only.
3. **Minimum before judging.** Do not call a test before an ad group has spent about **2× the hard stop (≈R725)** or produced 10 qualified bookings, whichever comes first. New YMYL accounts are volatile in weeks 1–2.
4. **Weekly search-terms review** (every Monday): add new negatives, promote converting terms to exact match.
5. **Kill rule.** Pause an ad group that has spent ≈R725 with **zero** qualified bookings, or whose ad cost per delivered lead stays above the R362 hard stop for two weeks. Pause an ad that is 50% worse on cost per qualified booking than its sibling after the minimum spend.
6. **80/20 reallocation.** Every two weeks, move budget from the bottom 80% of ad groups to the top 20% by cost per qualified booking. Keep a small test slice (≈10%) for new hooks.
7. **Compliance gate is separate.** A strong score never overrides a PASS / REVIEW / BLOCK compliance check (master brief section 6).

## 5. When we get there: checklist
- [ ] Jono decides items 1–4 in section 1
- [ ] Create shared negative list "SMC – Never" from lists A–E and attach at account level
- [ ] Build ad groups from section 3, each pointing at its matching landing page
- [ ] Conversion tracking: booked appointment as the primary conversion (CRM → offline conversions)
- [ ] Monday search-terms review in the calendar
- [ ] Fortnightly 80/20 budget review in the calendar
