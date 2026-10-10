# First-principles memo: market-research-analyst (Head of Consumer Insight)

Protocol: Section 4B, six steps. Written from MASTER-PROMPT.md only. No new research. Citations are section numbers plus grade (A regulator/platform/peer-reviewed, B controlled test or audited benchmark, C vendor/practitioner, D opinion). Source keys (S1...) are in `research.md`.

## Step 1. The irreducible goal

| Item | Statement |
|---|---|
| Goal (one sentence) | Make sure the people the ads reach are the people who qualify (age 35-50, budget R750-R1,250 or more, reachable on WhatsApp), at a channel cost that leaves margin: **qualify rate >= 65% of raw leads and raw CPL <= R200**. |
| Why these two numbers | 3.2: break-even raw CPL is about R397 at 60% qualify and R468 at 70%. 3.5 models every tier at 65% qualify and R200 CPL and needs >= 30% margin at R250. Below 65% or above R200 the pricing ladder breaks. |
| What I move | Whether the ICP (1.1) is right, whether the CPL benchmark is right, and a register of every guess so production data can replace it. |
| What I do not do | Run new research (0.1), invent personas, set interest targeting, run surveys with n < 30 (agent file). |

## Step 2. Fixed constraints vs conventions

| Fixed (law, platform, physics, money) | Source |
|---|---|
| No advice, no product/premium/cover-amount talk; flat per-cycle price | 2.1.1 (A, court ruling) |
| POPIA opt-in, unticked consent box | 2.1.2 (A) |
| Insurance ads 18+; creative must still work if age targeting is removed | 2.1.3, 2.1.4 (A) |
| No second-person claims about finances/family | 2.1.8 (A, Meta personal-attributes policy) |
| Conversion Leads optimisation needs >= 200 leads/month; we will have about 25-50 | 4.4 (A) |
| Qualified = age band + budget band + valid SA mobile verified by WhatsApp reply in 72 h + agrees to a call + not a duplicate in 90 days | 3.3 |
| R16,500 Bronze all-in, 20 committed qualified leads, 4 replacements per cycle | 0.1, 3.5 |
| Nothing spent before first payment except about R250 for domains | 0.1 |

| Convention (what the industry usually does) | Keep or drop |
|---|---|
| Build personas with quotes | Drop. Agent file forbids it. |
| Interest/audience targeting research | Drop. Andromeda makes creative the targeting (4.2, A). |
| Survey the market | Drop. n < 30 is banned; production data beats it. |
| Copy a "guru" list of winning angles | Drop. Meta Ad Library longevity is the proof (agent file, A). |
| Quote vendor "quizzes convert 2-10x" | Drop. Marked unsourced in 4.5. |

## Step 3. Mechanisms with A/B evidence

| # | Mechanism | What it dictates for my work | Evidence (section, grade) |
|---|---|---|---|
| M1 | The ICP sits where the market already sells | Age and budget bands come from market data, not taste | 4.1 table: Axco/Statista (A) |
| M2 | Mobile and WhatsApp are the channel | Funnel is WhatsApp-native; page is built for a phone | 4.1 DataReportal (A); 1.1 (WhatsApp top-used; Facebook most-used) |
| M3 | Surviving ads are proof | Weight ads running 30+ days (90+ in identity); learn angles from them | 4.1 Ad Library (A, primary) |
| M4 | Affordability sets the audience size | Realistic monthly lead volume must be checked against the income band | 4.1 Stats SA (A). **No Stats SA figure is in the prompt; see assumptions A-02.** |
| M5 | Unbounce medians set page and funnel targets | Insurance 18.2%, finance 8.3%, paid-social finance/insurance 9.3% | 4.5, 3.2 (B) |
| M6 | Qualified rate and CPL trade off by format | Instant form is cheaper per qualified lead in two tests; landing page showed about 3x qualified rate in one | 4.4 format table (B) |
| M7 | Creative is the targeting | Distinct angles pull distinct audiences; the 35-50 filter works through who the ad speaks to | 4.2, 4D.4a (A/B) |
| M8 | Hook rate and hold rate benchmarks | Feed 25-30%, Reels 30-40%; target >= 30% Reels, >= 25% Feed, hold >= 35% | 4D.4a (B) |
| M9 | Show-rate levers are peer-reviewed | Write-it-down commitment (18% fewer misses), norm wording (31.7%), multiple SMS reminders (15% vs 21% no-show) | 4.12 (A) |
| M10 | Speed to lead | First contact inside an hour about 7x qualification odds; our rule is 60 s | 4.12 HBR 2011 (A) |
| M11 | Form field count | 3 fields about 23-25% completion falling to 17.0% at 5 and 11.4% at 7 | 4.5 Baymard/Digital Applied (B) |

Everything graded C/D is a hypothesis to measure, not to research (4.0).

## Step 4. Simplest design, then compare to convention

Design: one register (`assumptions-register.md`) and one compiled input (`research.md`). Each number the build depends on has a source or is marked ASSUMPTION with a metric, a date and an owner. Production data (Meta Insights, WhatsApp replies, broker dispositions) overwrites the guess.

| Convention in the top-5 practice | Kept? | Reason |
|---|---|---|
| Competitor ad scan via Ad Library | Kept, but deferred | It is the only primary evidence of working angles (A). The sandbox blocks the web, so it is logged "pending: production/laptop lookup". |
| Benchmark CPL from 3+ SA sources | Kept, deferred | The single SA source (S4) is the largest risk to the model. Pending lookup. |
| Insurer market-share table | Kept as context only | Insurers are not competitors (4.1). Brokers and their lead providers are. |
| Report CPL as a range | Kept | R200-R500 is one source; a range with a confidence label is honest. |
| Persona deck | Dropped | Banned. |

## Step 5. Assumptions register and kill criteria

The full register is `assumptions-register.md` (every C/D claim has a test, metric and date). Kill criteria for my own design, using the Section 3.4 rules:

| If this is true... | ...then the research is wrong, and the action is |
|---|---|
| After R3,000 spend, raw CPL > R250 or qualify rate < 60% | Pause bottom 50% of creatives, tighten qualifying questions, new concept batch (3.4). Mark CPL benchmark "contradicted" in the register. |
| After 14 days, cost per qualified lead > R400 | Stop and escalate to Jonathan (3.4). The R200-R500 CPL range and the ICP are both suspect. |
| Qualify rate < 50% in Campaign A | Switch on Campaign B (landing page) per 4.4. ICP or affordability floor is wrong. |
| "Not a fit" > 40% or quality index < 2.5/5 per angle, n >= 5 | Pause that angle (3.4). |
| Show < 50% for 14 days | Review reminder sequence and qualification (3.4). |
| Realistic monthly raw leads at the budget cannot reach about 37 (Bronze) | Re-size the tiers before selling Silver or Gold (3.5 realism check). |

## Step 6. What was deliberately not built

| Not built | Why |
|---|---|
| Personas with fictional quotes | Banned; invented, unfalsifiable. |
| Interest-targeting recommendations | Andromeda makes them moot (4.2, A). |
| A consumer survey | n < 30 is banned; we get larger n free from production. |
| Fresh web research for rank #4, competitor ads, extra CPL sources | Sandbox blocks outbound fetches; 0.1 forbids re-research. Logged as pending lookups. |
| Apollo consumer outreach | Would breach POPIA s69 opt-in (4.1). Apollo is for finding brokers as clients only. |
| Any claim without a Section 3 number or a source | Agent rule. |
