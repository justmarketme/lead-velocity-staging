# Google SEO for sortmycover.co.za (YMYL life-cover education + lead-gen, South Africa)

Lens: seo-google. Researched 10 Oct 2026. Evidence tiers: A = Google or vendor primary documentation (fetched 10 Oct 2026; "updated" dates are the dates the page itself shows), B = regulator, statutory text, large-sample or well-documented study, C = trade press or single-author. Anything I could not verify is marked UNVERIFIED. Sources older than 2024 are marked STALE-RISK. Nothing here is legal advice; every content or claim change still goes through compliance-qa.

## 0. Bottom line (read this first)

1. Campaign landing pages: make every paid-only page `noindex` (meta tag plus a host-level `X-Robots-Tag`), keep them out of the sitemap, never block them in robots.txt, and never mix `noindex` with a canonical to another URL. The organic surface is `/learn/`, one substantive article per ad angle. That removes the doorway/near-duplicate risk and costs nothing in leads.
2. The brand-SERP plan assumes a Google Business Profile. Google's published rules say a business needs a place customers can visit or staff who travel to customers, and that lead-generation agents are not eligible. SortMyCover is remote and lead-gen, so a GBP is probably not available. Do not fake an address. Replace the GBP rung with Facebook, LinkedIn, Organization schema with the registered address, and real reviews later.
3. FAQ rich results stopped showing in Google on 7 May 2026 and HowTo went in 2023. Keep Organization, WebSite, Article and BreadcrumbList; stop spending effort on FAQPage.
4. For a site with no insurer licence, the credible trust stack is: named legal entity, registered address and a working email on the About page, a named accountable editor, an independent named reviewer with an FSCA register link, sources cited, an editorial policy page, and plain funding disclosure. The About page today names no company and lists only Facebook Messenger as contact.
5. Core Web Vitals are already excellent on the holding site (measured below). The risk is the new layer: Motion, the Meta Pixel and the quiz. The one concrete trap is hiding the hero heading at `opacity: 0` for an entrance animation, because Google's LCP definition excludes elements with opacity 0.
6. Subdomains versus paths is SEO-neutral by Google's own FAQ, as long as the subdomain pages are `noindex`. Use explicit per-campaign CNAMEs, not a wildcard, and fix the canonical logic in `landing/build.mjs` before any page is served from two hosts.
7. Expect volatility. Google ran three core updates between 11 Dec 2025 and 2 Jun 2026 and four spam updates between 24 Mar and 8 Oct 2026. A new YMYL domain should not be judged on its first 4 to 8 weeks.

## 1. State of the site checked on 10 Oct 2026 (so findings build on facts)

- Live: holding site on Vercel, A record 76.76.21.21, nameservers `byte.dns-parking.com` and `pixel.dns-parking.com` (Hostinger), apex TXT today is only SPF (`v=spf1 include:spf.protection.outlook.com -all`) and `MS=ms93425512`. No Google verification TXT yet.
- `www` returns 301 to the apex. `/about` returns 404, `/about.html` returns 200, `/learn` and `/learn/` both return 200 (canonical points at `/learn/`). Edge is Vercel `cpt1` (Cape Town, per vercel.com/docs/regions).
- Measured with curl from this machine, Brotli on, cache HIT: home TTFB 0.35 s and 2,286 bytes on the wire; a learn page TTFB 0.60 s and 2,849 bytes; CSS 1,588 bytes. Source files: `index.html` 7.5 KB, `styles.css` 4.5 KB, learn pages 7.8 to 8.1 KB.
- `landing/holding/` has no `robots` meta except `404.html` (noindex). `robots.txt` allows all and lists the sitemap; the `Disallow: /staging/` line points at a folder that is never deployed. The sitemap lists 13 URLs including `book.html`, `privacy.html` and `terms.html`.
- Learn articles are 342 to 405 words each (hub 205). Each has Article, FAQPage and BreadcrumbList JSON-LD; author is `Organization` "SortMyCover editorial team". The home Organization JSON-LD has `"sameAs": []`, no `address`, no `legalName`, no email. There is no WebSite JSON-LD.
- `about.html` says the privacy notice and terms "name the company"; the company, registration number and address appear only in `terms.html` (Lead Velocity (Pty) Ltd, 2025/637858/07, Pegasus Building 1, 210 Amarand Avenue, Menlyn Maine, Pretoria 0184). Contact on About is Facebook Messenger only.
- Quiz pages are not deployed on the apex yet (the sibling lens also saw 404s for `/turned-40/`). `landing/config/site.json` has `"robots": "noindex,nofollow"` and `env: staging`; `landing/build.mjs` writes that one value into every quiz page's robots meta, and sets canonical to `{page_base_url}/{slug}/` (apex). Every quiz page also carries the same FAQPage JSON-LD.

## 2. Findings (highest impact first)

### F1. Make all paid-only campaign pages noindex; index only the /learn/ twins (impact: high)
- Google: noindex works by meta robots or `X-Robots-Tag`, and only if the page is not blocked in robots.txt; removal can take months because Google must recrawl (A, support/block-indexing doc, updated 2025-12-10). Canonicalisation is a hint, not a directive; Google decides duplicates by content similarity; noindex is "not a consolidation method" (A, consolidate-duplicate-urls, updated 2026-07-10).
- Google's spam policy lists doorway abuse (many pages or domains for query variations that funnel users to one destination) and scaled content abuse (A, spam-policies, updated 2026-08-28). Eleven quiz pages built from one template, differing mostly in H1 and sub-line, with 110 words before the first tap, fit the pattern if indexed.
- AdsBot ignores the global `*` rules in robots.txt (A, overview-google-crawlers, updated 2026-06-12), so robots.txt is the wrong tool anyway if Google Ads is ever used for brand terms.
- Do: (1) set quiz-page robots to plain `noindex` in production and add a build guard that fails if a quiz slug is indexable without being on an explicit allow-list; (2) add a host-scoped `X-Robots-Tag: noindex` header in `landing/vercel.json` for campaign hostnames, mirroring the existing `*.vercel.app` rule (host-regex support to be tested with `curl -I`); (3) keep them out of the sitemap; (4) canonical on each campaign page is self-referencing and clean of UTM parameters; (5) do not add a canonical to the apex on a page that is also noindex.
- Do the organic work in `/learn/`: one article per ad angle (new-bond, bond-paperwork, employer-gap, extended-family, myth-bust, new-baby, self-employed, turned-40, virtual, what-the-call, c13-check-not-buy), each with its own substantive content, linking to the matching quiz page with descriptive anchor text.
- Check: Search Console Page indexing should show the campaign URLs under "Excluded by noindex tag" (A, support/answer/7440203) and near zero under "Duplicate without user-selected canonical" for the apex.

### F2. A Google Business Profile is probably not available; change the brand-SERP plan (impact: high)
- Google's guidelines, paraphrased: a profile requires either a physical location customers can visit or staff who travel to customers; sales associates and lead-generation agents for corporations are not eligible; a rented mailing address or virtual office does not qualify (A, support.google.com/business/answer/3038177, fetched 2026-10-10). BrightLocal's 2023 write-up lists lead-generation entities and online-only operations as ineligible categories and quotes the in-person-contact rule (C, 2023-08-03, STALE-RISK, but consistent with the primary page).
- SortMyCover delivers by video, WhatsApp or phone and is a lead generator for advisers. `serp-plan.md` section 2 step 7 and the profile checklist treat GBP as "Yes, before first ad" and as position 2 on the `sortmycover` SERP.
- Do: drop GBP from the launch gate; do not use the Menlyn Maine registered address or a virtual office to qualify; put the brand SERP weight on the site, Facebook Page, LinkedIn Company Page, Instagram, and later real reviews. A broker's own staffed office may have its own GBP; that is theirs, not SortMyCover's.
- UNVERIFIED: whether Google's reviewers would accept a profile for a remote consumer brand. Treat the rules as a no.
- Check: the plan's SERP table no longer lists GBP as a required rung.

### F3. Trust stack: what a no-licence site can credibly show, and what the About page lacks (impact: high)
- Google: "Trust is most important"; YMYL topics (health, finances, safety) get extra weight; "Who, How, Why" means clear bylines, no fabricated creator profiles, disclosure of how content was made, and content made for people (A, creating-helpful-content, updated 2026-10-05). Raters check About and contact pages and independent reputation, and treat missing "who is responsible" information on YMYL pages as a quality problem (C/A: Quality Rater Guidelines, latest edition reported as 11 Sep 2025, 182 pages, Search Engine Land via search summary; the PDF I fetched was a cached 2023 copy with the same principles; UNVERIFIED whether a newer edition exists).
- Ship, in this order: (1) About: legal name, registration number, registered address, `hello@sortmycover.co.za`, the plain sentence that SortMyCover is not a financial services provider and gives no advice; (2) a named accountable editor (Jonathan West is already named as Information Officer in `deploy.md`; needs his consent) as article author, with a short bio page, instead of `Organization` as author; (3) an independent named reviewer on each article only after a real review, with FSP number and a link to the FSCA public register (https://www.fsca.co.za/Entity-Persons-Search/); keep the NH-30 D rule that the reviewer is not a broker the leads are routed to, and disclose any payment; (4) a short editorial policy page: how articles are researched, whether AI assisted, who reviews, how to report an error, update cadence; (5) citations to primary sources inside articles (FSCA, ASISA, FAIS Ombud, the Act); (6) a visible "Last reviewed" date equal to JSON-LD `dateModified`; (7) real reviews only, after real calls.
- Keep `how-we-make-money.html`: it is the strongest trust page the site has and matches the pattern used by MoneySavingExpert ("How this site is financed") and NerdWallet (editorial guidelines page).
- Check: grep shows the company name, address and email on `about.html` and in the footer; each article has a human author URL.

### F4. Core Web Vitals: baseline is excellent; protect it from Motion, the Pixel and the quiz (impact: high)
- Targets: LCP 2.5 s, INP 200 ms, CLS 0.1, at the 75th percentile, mobile and desktop segmented (A, web.dev/articles/vitals, updated 2024-10-31; Google Search docs, updated 2025-12-10). Google says relevance comes first even when page experience is weak, that there is no single page-experience signal, and that Core Web Vitals are used by its ranking systems (A, page-experience doc, updated 2026-09-22). So treat CWV as a floor, not a lever. The weight figures circulating (for example "1 to 3 percent") are not Google statements; ignore them.
- Context in numbers: in the 2025 Web Almanac, 48% of mobile origins and 56% of desktop origins had good Core Web Vitals; mobile LCP was good for 62%, INP 77%, CLS 81% (B, HTTP Archive, 2026-01-15). In South Africa, mobile is 77.26% of traffic (Statcounter, Sep 2026, B/C).
- The trap: LCP excludes elements with opacity 0 (A, web.dev/articles/lcp, updated 2025-09-04). An entrance animation that starts the hero H1 at `opacity: 0` stops it counting until it is visible, which inflates LCP by the animation delay. Inference; confirm with Lighthouse and a PerformanceObserver on the staging build.
- Motion sizes: `animate()` mini 2.3 KB, hybrid 18 KB (A, motion.dev/docs/animate); `scroll()` 5.1 KB (C, search summary of motion.dev/docs/scroll; UNVERIFIED whether these are gzip). The existing quiz budget (JS at or under 100 KB gzip) has room, but the holding pages are zero-JS today.
- Rules: the hero heading and first paragraph render visible in the initial HTML; animate only `transform` and `opacity` on elements below the first paint, after `load`; self-host Motion so the strict CSP (`default-src 'self'`) holds; load it only on pages that use it; keep `/learn/` text pages JS-free or on the mini build; boot the Pixel after `load` or idle on indexable pages (`landing/shared/pixel.js` boots on DOMContentLoaded and injects `fbevents.js` from connect.facebook.net).
- Googlebot does not scroll or click, so content that only appears on interaction is not seen; IntersectionObserver reveal is a documented-safe pattern, but the text must be in the DOM (A, lazy-loading doc, updated 2025-12-10). Real links must be `<a href>` (A, links-crawlable).
- Field data takes time: the Search Console CWV report needs enough Chrome UX Report traffic (threshold UNVERIFIED), so use lab runs (`landing/lighthouse.sh`) until then.

### F5. Subdomain or path for campaigns: SEO-neutral if noindex, but fix canonical and DNS first (impact: medium)
- Google: "From an indexing and ranking perspective, Google doesn't have a preference" between subdomains and subfolders (A, crawling-index-faq, updated 2025-12-10). Older statements say the same (Mueller 2018, Cutts 2007 and 2013, all STALE-RISK; the 2025 FAQ supersedes them). Practitioner claims that subdirectories rank better are C and not needed here because campaign pages are noindex.
- A Domain property in Search Console covers all subdomains and both protocols (A, support/answer/9008080). Each subdomain home can carry its own `WebSite` site name; without it Google may fall back to the domain-level name (A, site-names doc). A sitemap may only list URLs from its own host (B, sitemaps.org/protocol.html); campaign hosts would need their own, but they should have none.
- Vercel: a subdomain needs a CNAME; a wildcard (`*.sortmycover.co.za`) needs Vercel nameservers or an `_acme-challenge` NS delegation; Hobby allows 50 custom domains per project (A, vercel.com/docs/domains/working-with-domains/add-a-domain, updated 2026-09-16). DNS is at Hostinger, so explicit per-campaign CNAMEs are the cleaner path. A wildcard that serves the site on any hostname invites duplicate hosts (inference; no Google source).
- Catch in the repo: `landing/build.mjs` sets canonical (and `og:url`, `thanks_url`) from `page_base_url`, which is the apex. If a quiz page is served at `new-bond.sortmycover.co.za/` and at `sortmycover.co.za/new-bond/`, the subdomain copy canonicalises to the apex while also being noindex. That is the mixed signal F1 warns against. Serve each page from one host only and make `page_base_url` per campaign.
- `deploy.md` currently says "No go. subdomain and no second project". If Jonathan wants subdomains anyway, that is a product choice, not an SEO cost, provided F1 holds.

### F6. Structured data in 2026: what still earns its keep (impact: medium)
- FAQ rich results: restricted in Aug 2023 to well-known government and health sites (A, developers.google.com/search/blog/2023/08/howto-faq-changes); Google's changelog says the FAQ rich result stopped appearing from 7 May 2026 and that its FAQ documentation was removed on 15 Jun 2026 (A, developers.google.com/search/updates). FAQ and HowTo are absent from the Search gallery (A, search-gallery doc). HowTo rich results were retired in 2023 (A, same 2023 post).
- Still documented: Article, Breadcrumb, Organization, Local business, Profile page, Review snippet, Video, others (A, search-gallery). Organization markup has no required properties and no guaranteed display, but recommends `legalName`, `address`, `email`/`telephone`, `logo` (at least 112 by 112 px), `sameAs`, and identifiers such as `taxID`, `vatID`, `duns` (A, organization doc). Site names use `WebSite` with `name`, `url`, optional `alternateName`, on the home page of each host (A, site-names doc). Article `author` can be `Person` or `Organization`, with a `url` to a unique author page (A, article doc). Breadcrumb display is desktop-only (A, breadcrumb doc), and Google dropped it from mobile results on 23 Jan 2025 (C, Search Engine Land).
- Do: add `WebSite` (`name` "SortMyCover", `alternateName` "Sort My Cover") to the home page; extend Organization with `legalName` "Lead Velocity (Pty) Ltd", `address`, `email`, and real `sameAs` URLs once profiles exist (remove the empty array until then); switch Article `author` to the named editor once F3 is done; keep BreadcrumbList (cheap, desktop only); stop validating FAQPage and drop the identical FAQPage block from the 11 quiz pages (weight, no benefit). Keep the visible FAQ text: it helps readers.
- Check: Rich Results Test and Schema Markup Validator on home and one learn page. Dates for the removal of the Search Console FAQ report and filter conflict between sources (Google's FAQ doc page as summarised on fetch said 6 Jan 2026; secondary articles said June 2026, with the API in August 2026), so treat them as UNVERIFIED and do not build any reporting on FAQ data.

### F7. Decide the URL shape before anything is indexed (impact: medium)
- Live behaviour: `/about.html` is the only working URL (`/about` is 404); `/learn` and `/learn/` both serve. Vercel `cleanUrls: true` serves `about.html` at `/about` and 308-redirects `/about.html` to it (A, vercel.com/docs/project-configuration/vercel-json, updated 2026-08-14). `deploy.md` warns not to set `trailingSlash: false` because canonical URLs are `/learn/`; test the combination on a preview deploy before relying on it (UNVERIFIED).
- Extensions do not affect rankings. The risk is changing later: every canonical, `og:url`, JSON-LD `@id`/`url`, breadcrumb `item`, internal link and sitemap `<loc>` hard-codes `.html`. The site went live 5 Oct 2026, so the cost is lowest now. Pick once; if keeping `.html`, never change it.
- Sitemap hygiene (A, build-sitemap doc, updated 2026-07-08; B, sitemaps.org): only canonical indexable URLs; Google ignores `priority` and `changefreq`; it uses `lastmod` only if consistently accurate, so generate it from the build (file or git commit date) instead of hand-editing; max 50,000 URLs or 50 MB per file. Remove the pointless `Disallow: /staging/` from robots.txt.

### F8. Content cluster: no advice, no head-term chase, map articles to ad angles (impact: medium)
- Google has no preferred word count (A, creating-helpful-content), and "topical authority" is not a published Google metric (Mueller, Reddit, 2023-11-13, C, STALE-RISK). Design the cluster for readers and internal navigation, not for a score.
- Competition: a web search on 10 Oct 2026 for "how much life cover do I need South Africa" returned 1Life, Momentum, EasyEquities, Rateweb and broker sites; 1Life's article is institutional (no named author), dated 1 Oct 2024, labelled "4 minute read", and carries its FSP number in the footer (C; search tool is US-based, so UNVERIFIED for SA-localised rankings). A new, unlicensed domain will not win "life cover" or "how much life cover" head terms in the near term, and those pages quote rules of thumb and calculators SortMyCover must not copy.
- Boundary: FAIS defines advice as a recommendation, guidance or proposal on a financial product, and excludes factual information such as the procedure for entering a transaction, product description, and objective information about a product, plus analysis with no recommendation to a client's circumstances (B, FANews 2019-05-20 summarising s1 of the Act, STALE-RISK; primary text at saflii.org returned 403). Education fits; a personalised "you need R x" calculator does not. Flag any calculator to compliance-qa before build.
- Cluster (four hubs, all under `/learn/`): (a) situations that change cover (new bond, bond paperwork, new baby, turned 40, self-employed, extended family); (b) reading what you already have (payslip cover line, employer cover versus personal cover, what "cover gap" means); (c) the process and trust (what happens on a 30-minute call, how to check an adviser on the FSCA register, how SortMyCover makes money, how to complain); (d) myths and definitions (myth-bust, "check, not buy"). Targets are long-tail and trust queries a regulated insurer will not bother with. Volumes are UNVERIFIED: no keyword data was available; pull Search Console queries after four weeks and use Keyword Planner for sizing.
- Today's articles (342 to 405 words) answer one question each. That is acceptable for a brand-trust layer, but thin against incumbents for situation queries; grow the ones that earn impressions, not all at once.
- Internal links: every article links up to `/learn/`, sideways to two related articles, and to How we make money and About; use descriptive anchors, not "click here"; the hub should be linked from the home page body and the header, not only the footer (A, links-crawlable, descriptive anchor text).

### F9. Search Console, Bing and measuring organic (impact: medium)
- Verify a Domain property by DNS (TXT or CNAME); it covers http, https and all subdomains; propagation can take "a few minutes or even days" (A, support/answer/9008080). `serp-plan.md` section 2 step 5 says to add the TXT "at GoDaddy": that is stale. Nameservers are Hostinger (`dns-parking.com`), so add the `google-site-verification=...` TXT there as an additional record beside the SPF and `MS=` records; do not replace them.
- Then: submit `https://sortmycover.co.za/sitemap.xml`; URL Inspection on `/`, `/about.html`, `/learn/`; record a day-0 baseline.
- Branded filter: Search Console added a branded-queries filter on 20 Nov 2025, extended to eligible sites by Mar 2026 (A, developers.google.com/search/blog/2025/11/search-console-branded-filter; C for the March date). Eligibility for a brand-new site is UNVERIFIED, so use a regex query filter such as `sort ?my ?cover` for the brand segment and the complement for non-brand.
- Position is "the average position of the topmost result from your site" (A, performance-report doc), so expect it to look better than any one query's reality.
- Bing is 7.36% of South African search and Google 91.75% (Statcounter, Sep 2026, B/C); import the Search Console property into Bing Webmaster Tools once verified.
- Organic sessions and conversions: Vercel Web Analytics uses no cookies, identifies visitors by a hash discarded after 24 hours, records referrer and filtered query parameters, and serves its script from the same origin so it fits the strict CSP (A, vercel.com/docs/analytics/privacy-policy, updated 2026-06-26; custom events need Pro or Enterprise per the quickstart). Use it to count organic landing sessions by referrer and pair with the n8n lead record (`page_url`, `utm`) to attribute booked calls. Whether it changes the privacy notice is a compliance-qa call.
- Weekly dashboard: brand and non-brand clicks, impressions, CTR, position; indexed pages versus sitemap count; Page indexing reasons; CWV status; four manual brand-SERP checks from an SA location; annotate Google update windows (F10).

### F10. Expect volatility; do not judge before 8 weeks (impact: medium)
- Google Search Status Dashboard: core updates 11 Dec 2025 (18 d 2 h), 27 Mar 2026 (12 d 4 h), 21 May 2026 (11 d 21 h); spam updates 24 Mar, 24 Jun, 18 Aug and 24 Sep 2026 (13 d 16 h) (A, status.search.google.com/summary). No core update was listed for October at fetch time; the next date is UNVERIFIED and unpredictable.
- Practitioner reports say finance and insurance (YMYL) sites moved early and hard in the March and May 2026 core updates (C, secondary articles; the Search Engine Land piece returned 403, so UNVERIFIED).
- Implication: a launch inside an update window will look noisy; judge trend by 4-week rolling windows, and keep the thin-page and doorway risk in F1 low so a spam update has nothing to catch.

### F11. AI features reduce clicks but need no special markup (impact: low)
- Pew (900 US adults, 68,879 Google searches in March 2025): users clicked a traditional result in 8% of visits when an AI summary appeared versus 15% without; 1% of visits clicked a link inside the summary (B, pewresearch.org, 2025-07-22). US data; applicability to SA UNVERIFIED.
- AI Mode launched in South Africa on 21 Aug 2025 (C, TechCentral and MyBroadband); AI Overviews were already visible to South African users (C). Google: no special schema or optimisation is required; pages must be indexed and eligible to show with a snippet (A, ai-features doc). So never use `nosnippet` or `max-snippet:0` on `/learn/`.
- Implication: measure impressions and brand queries, not only clicks. The sibling file `geo-llm-search.md` covers other engines.

### F12. .co.za, local signals without a GBP, and hreflang later (impact: low)
- Google: a ccTLD gives "clear geotargeting" and server location is irrelevant (A, managing-multi-regional-sites, updated 2025-12-10). `.co.za` already does the job; no extra geotargeting setup is needed. `sortmycover.com` stays a 301 to the apex (already in `landing/vercel.json`).
- NAP without GBP: print the legal name, registered address and email identically in the About page, footer and Organization JSON-LD; show no phone number rather than inventing one; add `areaServed: ZA`. Claim the Facebook Page and LinkedIn Company Page (parent Lead Velocity) and link them from `sameAs`. A HelloPeter profile is for later, when a named person can answer complaints (as `serp-plan.md` already says).
- hreflang: needed only when CoverKlaar (Afrikaans) exists. Each version must list itself and every other version and links must be reciprocal; use ISO codes such as `en-ZA` and `af-ZA` or `af`; add `x-default` on a selector page (A, localized-versions doc). The current self-only `hreflang="en-ZA"` tags are harmless noise.

## 3. Pattern sites worth copying (and avoiding)

1. NerdWallet editorial guidelines and team pages: https://www.nerdwallet.com/nerdwallet-editorial-guidelines . Copy: separate editorial-policy page, named editors, plain funding disclosure. Avoid: ranked "best of" lists and star ratings, which SortMyCover cannot do under FAIS.
2. MoneySavingExpert "How this site is financed": https://www.moneysavingexpert.com/site/moneysavingexpert-finance/ . Copy: blunt statement of how money flows and what is never for sale. Avoid: affiliate-link language; SortMyCover's model is a flat adviser fee.
3. MoneyHelper (UK government-backed) life insurance explainer: https://www.moneyhelper.org.uk/en/everyday-money/insurance/what-is-life-insurance . Copy: guidance-not-advice framing and neutral tone. Avoid: nothing structural; do not copy UK-specific rules.
4. 1Life "How much life cover do I need": https://www.1life.co.za/blog/how-much-life-cover-do-i-need . The SA SERP incumbent. Copy: short, scenario-led plain language and a clear next step. Avoid: rules of thumb and calculators; brand-only authority with no named author.
5. Moneyweb financial advisor views (independent planner byline): https://www.moneyweb.co.za/financial-advisor-views/how-your-group-life-cover-and-personal-insurance-work-together/ . Copy: case-study structure and a named independent practice. Avoid: reliance on a 2019 piece (STALE-RISK); any paid placement tied to routed leads.

## 4. Gaps and UNVERIFIED items

- Whether the apex or any page is indexed today (the search tool is not Google SA; use URL Inspection).
- Any SA keyword volumes; Keyword Planner and first-month Search Console data are needed.
- Whether a Quality Rater Guidelines edition newer than 11 Sep 2025 exists (the PDF fetched was a cached 2023 copy).
- Whether Google would approve a GBP for a remote lead-gen brand (rules say no).
- Whether Vercel host-regex `has` rules accept the pattern for campaign hostnames, and how `cleanUrls` interacts with `/learn/`; both need a preview-deploy test.
- Exact Chrome UX Report volume threshold for Search Console's CWV report, and the eligibility threshold for the branded-queries filter.
- Whether Motion's 2.3 KB and 18 KB figures are gzip.
- FAIS section 1(3)(a) wording is from a 2019 secondary source; compliance-qa should check the current Act text.
- HelloPeter profile mechanics and an independent reviewer's credential route (for example a CFP body) were not researched.

## 5. Source list (fetched 10 Oct 2026 unless noted)

Google and Search Console (A):
- https://developers.google.com/search/updates
- https://developers.google.com/search/blog/2023/08/howto-faq-changes (Aug 2023)
- https://developers.google.com/search/docs/appearance/structured-data/search-gallery
- https://developers.google.com/search/docs/appearance/structured-data/organization
- https://developers.google.com/search/docs/appearance/structured-data/article
- https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content (updated 2026-10-05)
- https://developers.google.com/search/docs/appearance/core-web-vitals (updated 2025-12-10)
- https://developers.google.com/search/docs/appearance/page-experience (updated 2026-09-22)
- https://developers.google.com/search/docs/essentials/spam-policies (updated 2026-08-28)
- https://developers.google.com/search/docs/crawling-indexing/block-indexing (updated 2025-12-10)
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls (updated 2026-07-10)
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap (updated 2026-07-08)
- https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers (updated 2026-06-12)
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics (updated 2026-03-04)
- https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading (updated 2025-12-10)
- https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (updated 2025-12-10)
- https://developers.google.com/search/docs/specialty/international/localized-versions
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/help/crawling-index-faq (updated 2025-12-10)
- https://developers.google.com/search/blog/2025/11/search-console-branded-filter (Nov 2025)
- https://support.google.com/webmasters/answer/9008080 and https://support.google.com/webmasters/answer/7440203 and https://support.google.com/webmasters/answer/7576553
- https://support.google.com/business/answer/3038177
- https://status.search.google.com/summary
- https://web.dev/articles/vitals (2024-10-31) and https://web.dev/articles/lcp (2025-09-04)

Other:
- https://almanac.httparchive.org/en/2025/performance (2026-01-15) (B)
- https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/ (B)
- https://gs.statcounter.com/search-engine-market-share/all/south-africa and https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/south-africa (Sep 2026) (B/C)
- https://www.sitemaps.org/protocol.html (B)
- https://vercel.com/docs/project-configuration/vercel-json (2026-08-14), https://vercel.com/docs/domains/working-with-domains/add-a-domain (2026-09-16), https://vercel.com/docs/analytics/privacy-policy (2026-06-26), https://vercel.com/docs/regions (A)
- https://motion.dev/docs/animate (A)
- https://www.fsca.co.za/Entity-Persons-Search/ (B)
- https://www.fanews.co.za/article/legal-affairs/10/general/1120/when-does-conduct-constitute-financial-advice/26744 (2019-05-20, STALE-RISK) (C)
- https://www.brightlocal.com/blog/google-business-profile-new-guidelines-and-policies/ (2023-08-03, STALE-RISK) (C)
- https://www.searchenginejournal.com/google-on-topical-authority-dont-worry-about-it/501209/ (2023-11-13, STALE-RISK) (C)
- https://www.searchenginejournal.com/ranking-factors/subdomain-subdirectory/ (cites Mueller 2018 and Cutts 2007/2013, STALE-RISK) (C)
- https://techcentral.co.za/google-rolls-out-advanced-ai-mode-in-south-africa-nigeria-and-kenya/268933/ (2025-08) (C)
- https://searchengineland.com/google-updates-search-quality-raters-guidelines-adding-ai-overview-examples-ymyl-definitions-461908 and https://www.seroundtable.com/google-search-quality-raters-guidelines-update-40092.html (Sep 2025) (C)
