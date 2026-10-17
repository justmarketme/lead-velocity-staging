# SA affluent-family targeting map (R1,500+ premium client)

Status: **PROPOSAL — needs Jonathan's yes before any ad set uses it (spend/targeting change).**
Source: Jonathan's direction (2026-10-05) to target by what this client buys, likes, where they go and whether they have kids; builds on `docs/research/high-premium-client-meta-targeting.md`.
Every interest, behaviour and place name below is a **candidate to verify in Ads Manager's detailed-targeting browser for South Africa** — Meta renames and removes options often, and the research could not read Meta's pages. Nothing here targets race, religion, health, sexual orientation or other sensitive attributes, and no ad copy ever says or implies the viewer's income, family or finances (Meta personal-attributes policy, 2.1.8).

## 0. First, the gate that decides everything

South Africa is not the US. Meta documents the **Financial products and services Special Ad Category** as mandatory for US audiences (and some other markets); nothing found says it is mandatory for South Africa. If Meta does **not** force it at campaign creation (campaign-spec §10 check), we keep: detailed targeting (interests, behaviours, life events), age limits, location pins and radii, exclusions and lookalikes. If Meta **does** force it, most of this map is unusable and creative + location carry the targeting.

Second constraint: under **Advantage+ audience**, interests and behaviours are only *suggestions* — Meta may go wider. To make them *hard* filters, the ad set must use **original audience controls** (and switch off "Advantage detailed targeting" expansion where Meta allows it for the objective). That is why the test in §5 runs one Advantage+ ad set against one original-audience ad set.

## 1. Where they live and go (location — hard controls)

Use **"People living in this location"** (not "living in or recently in") so visitors and commuters are excluded. Minimum pin radius is about 1 km.

| Metro | Candidate suburbs / pins | Why |
|---|---|---|
| Johannesburg north | Sandton, Bryanston, Morningside, Fourways, Lonehill, Dainfern, Kyalami, Sunninghill, Rivonia, Hyde Park, Parkhurst/Parktown North | Highest average taxable income municipality (SARS 2023) |
| East Rand | Bedfordview, Greenstone, Midvaal (Meyersdal), Glen Marais | Midvaal in SARS top-6 |
| Tshwane east/south | Waterkloof, Brooklyn, Lynnwood, Faerie Glen, Moreleta Park, Woodhill, Silver Lakes, Centurion (Irene, Midstream, Eldoraigne) | Tshwane #3 by average taxable income |
| Cape Town | Constantia, Bishopscourt, Newlands, Claremont, Rondebosch, Tokai, Durbanville, Welgemoed, Sea Point/Green Point, Somerset West | Highest bond values and deposits (ooba 2025) |
| Winelands | Stellenbosch, Paarl/Val de Vie | Stellenbosch #2 by average taxable income |
| KZN | Umhlanga, Ballito, Durban North, Hillcrest, Kloof | ASSUMPTION — named in brief, not verified by income data |

Optional pins on affluent **places people go** (use "living in" radius around the residential belt, not the mall itself): Sandton City / Nelson Mandela Square, Mall of Africa (Waterfall), Menlyn Maine, Hyde Park Corner, V&A Waterfront, Cavendish Square, Canal Walk, Gateway (Umhlanga), private-school clusters (e.g. around St John's/Crawford/Reddam/Curro campuses). These raise relevance by geography only; they do not identify individuals.

## 2. What they buy and like (interest stacks — candidates, verify each)

**A. Premium everyday spend:** Woolworths, Woolworths Food, Checkers Sixty60 (mixed), Dis-Chem, Yuppiechef, Superbalist, Takealot (broad — use only inside an AND), Weylandts, Coricraft, @home, Cape Union Mart, Vida e Caffè, Tashas, Nespresso.

**B. Cars and drive:** BMW South Africa, Mercedes-Benz South Africa, Audi South Africa, Volvo Cars South Africa, Land Rover, Toyota Fortuner / Hilux (upper-middle), Volkswagen Tiguan, Haval/GWM (aspirational upgrade).

**C. Banking and money media (affluence + financial interest):** Investec, FNB Private Clients / Private Wealth, Absa Private Bank, Nedbank Private Wealth, Standard Bank Private Banking, Moneyweb, Business Day, Financial Mail, Daily Investor, BusinessTech, Daily Maverick. *Do not* use insurer brands (Discovery, Old Mutual, Sanlam, etc.) as targeting — we are broker-neutral and it invites competitor and policy confusion.

**D. Leisure and travel:** Virgin Active (Club/Collection), golf (Fancourt, Pearl Valley, Steyn City, PGA/Sunshine Tour), Emirates, British Airways, FlySafair (mixed), Kruger National Park, Sun City / Sun International, wine estates (Stellenbosch Wine Routes), Comrades/Cape Town Cycle Tour, Two Oceans Marathon, travel booking (Booking.com, Airbnb — use only inside an AND).

**E. Home and property (bond holders / upgraders):** Property24, Private Property, ooba, BetterBond, home renovation, interior design, Leroy Merlin, Builders (mixed), solar/backup power (EcoFlow, Hoymiles, "solar energy") — a strong SA homeowner signal since load-shedding.

**F. Kids and family (parents of school-age children):** Meta "Parents" demographics where available (parents with toddlers / preschoolers / early-school-age / pre-teens / teenagers); interests: Bluey, Paw Patrol, Peppa Pig, Disney Junior, Cocomelon (younger kids), Roblox, Minecraft, LEGO (older kids); Toy Kingdom, Baby City, Woolworths Kids, Cotton On Kids; private and independent schooling (Curro, Reddam House, Crawford, St John's College, ADvTECH), school sport, Kids holiday camps, family travel.

**G. Business owners and professionals:** behaviours "Small business owners" and "Business page admins"; interests Xero, Sage, Yoco, Entrepreneur magazine SA, SA Institute of Chartered Accountants (SAICA), Law Society, medical (HPCSA / SA Medical Association), engineering (ECSA). Job title / employer / field-of-study targeting: check availability — Meta has removed much of it in many markets.

**H. Life events (intent moments):** Newly engaged, Newlywed (1 year), New job, Recently moved, Upcoming anniversary, "Parents (up to 12 months)". Availability varies by country — verify.

### Recommended combinations (AND logic in original audiences)
- **Stack 1 — Affluent parents:** (F) AND (A or B or C or E).
- **Stack 2 — Homeowners upgrading:** (E) AND (A or B or D).
- **Stack 3 — Business owners/professionals:** (G) AND (A or B or C).
- Use these as **suggestions** in the Advantage+ ad set and as **hard filters** in the original-audience ad set (§5).

## 3. Exclusions (hard)
Existing leads (90 days), booked, attended, opted-out/suppressed (customer list, hashed); students/under-25 interests only via age floor (Meta removed detailed-targeting exclusions in 2025, so exclusions are custom audiences only).

## 4. Our own data — the strongest targeting of all
- **Seed audiences** (hashed, POPIA purpose = advertising improvement, covered by the consent line's ads sentence): verified **R1,500+** leads → attended → broker "good fit". At ≥ 100 (Meta min) / ideally ≥ 300 people, build a 1% SA lookalike and use it as a suggestion.
- **Broker's existing client list as a seed** — only if Mark's own consent/privacy terms allow it and compliance-qa signs off (NH item). Often the single best affluent seed.
- **Engagement audiences** from day 1: 75% video viewers, Page/IG engagers, form openers — for retargeting with a different creative.

## 5. Test design (cycle 1, ~R350/day, one campaign)
| Ad set | Audience | Share | Judge on |
|---|---|---|---|
| A — Advantage+ | Tier-1 locations ("living in"), age 30–55, Advantage+ audience with Stack 1–3 as suggestions, exclusions | 50% | cost per verified R1,500+ lead |
| B — Original audience | Same locations/age/exclusions, Stack 1 OR Stack 2 OR Stack 3 as hard filters, Advantage detailed targeting expansion OFF where allowed | 50% | cost per verified R1,500+ lead |

Same 6 creatives in both. Run 14 days, no edits in days 1–2; verdict at ≥ 30 verified leads per ad set; keep the winner, fold the loser's budget in. Expect B to have a higher CPL and — if the hypothesis is right — a higher share of R1,500+ and attended leads. Audience size check: B must stay ≥ ~200,000 people in Ads Manager or delivery stalls; widen with more interests or areas if smaller.

## 6. What this does not do
No targeting or exclusion by race, religion, health, ethnicity or other special personal information; no ad copy that says "you have kids", "your bond", "earning over R…"; no third-party data lists; no scraping.
