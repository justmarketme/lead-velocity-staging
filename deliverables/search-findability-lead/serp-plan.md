# Brand SERP ownership plan: SortMyCover

Owner: search-findability-lead. Status: plan only, nothing deployed. Inputs: `landing/holding/` (home, About, How we make money, Complaints, Privacy, `learn/`), 4D.1, 4D.2 rule 4, 4D.4b.5.
Why: Search Lift means some people who see an ad will type the name. The brand SERP is the landing page (SparkToro), and the trust layer is also the ranking input for YMYL (Google Search Central).

## 1. Target SERP (own all 10 organic positions, plus panel and local pack)

Queries: `sortmycover`, `sort my cover`, `sortmycover reviews`, `sortmycover scam`.

| Pos | `sortmycover` / `sort my cover` | `sortmycover reviews` | `sortmycover scam` |
|---|---|---|---|
| 1 | sortmycover.co.za (home, with sitelinks) | Home or How we make money | Complaints page (names the route, shows real contact) |
| 2 | Google Business Profile (local pack, reviews) | GBP reviews | How we make money |
| 3 | Facebook Page | Facebook Page (Reviews tab on) | About (named company, CIPC, address) |
| 4 | Instagram | GBP | Home |
| 5 | LinkedIn Company Page (Lead Velocity as parent) | Learn: How SortMyCover works | Learn: How SortMyCover works |
| 6 | YouTube channel (placeholder) | LinkedIn | LinkedIn |
| 7 | TikTok (placeholder) | Instagram | Facebook |
| 8 | About | About | GBP |
| 9 | Learn hub + 5 learn pages (as sitelinks or rows) | Complaints | Privacy |
| 10 | Complaints / How we make money | YouTube | Learn: What happens on a 30-minute call |

Notes:
- Rows are targets, not promises. Google decides. Measure and fill gaps (Section 5).
- "reviews" and "scam" queries: do not buy or invite fake reviews. Collect real ones only after real calls happen, from consented participants, on GBP and Facebook. Until then the answer to "scam" is transparency: named company, registration number, address, complaints route, how we make money.
- Third-party results (HelloPeter, forums, ad-library pages) cannot be controlled. Plan: claim a HelloPeter business profile only when there is a real person to answer complaints (needs_human, below).
- Knowledge panel: Organization schema on the home page (name, url, logo, parentOrganization, contactPoint, address, `sameAs`). Fill `sameAs` once profiles exist. Panel claim happens only after Google shows one.

### Profile checklist (consistent name, logo, line, disclosure)
| Asset | Handle / name | Needed before first ad? | Owner |
|---|---|---|---|
| Domain `sortmycover.co.za` (+ `.com` 301) | exact | Yes, see staging rules and GATE-DOMAINS | devops-security |
| Google Business Profile | SortMyCover | Yes (verification can take days) | human, laptop |
| Facebook Page | SortMyCover (@sortmycover) | Yes (the ad identity) | meta-operator |
| Instagram | @sortmycover | Yes | meta-operator |
| LinkedIn Company Page | SortMyCover, parent Lead Velocity (Pty) Ltd | Yes (low cost, ranks fast) | human |
| YouTube channel | SortMyCover | Placeholder: name, banner, About text, link only | visual-producer |
| TikTok | @sortmycover | Placeholder: claim the handle only | visual-producer |
Bio text on all: the 4D.2 rule-8 disclosure line, link to the home page, same logo and line.

## 2. Launch-day indexing checklist (run in this order on the day the own domain resolves)

1. `dns.google` check for `sortmycover.co.za`, `www`, `.com` (0.3 #6). SSL active. 301s correct (`deploy.md` section 6).
2. No `noindex` on production, no `X-Robots-Tag`. `robots.txt` allows all and names the sitemap. `privacy.html` stays `noindex` and out of the sitemap until the real text is signed off, then both flip.
3. All `{{...}}` placeholders replaced (grep `{{` returns nothing). The five learn pages carry no reviewer line (author is "SortMyCover editorial team"); a reviewer line may be added only after a real review by someone who is NOT a broker we route leads to (NH-30 D).
4. Rich Results Test and Schema Markup Validator on the home page (Organization, FAQPage) and one learn page (Article, FAQPage, BreadcrumbList). Note: Google restricts FAQ rich results to a small set of sites, so treat FAQ schema as machine-readable markup, not a promised rich result. Do not count on the display.
5. **Search Console.** Preferred: Domain property, verified by DNS TXT at GoDaddy (covers http/https/www and subdomains). Fallbacks: URL-prefix property with the HTML file or meta tag method, or Google Analytics/Tag Manager if present. Do not verify the staging host as a property of the production domain.
6. Submit `https://sortmycover.co.za/sitemap.xml` (11 URLs: home, About, How we make money, Complaints, learn hub, five learn pages). Use URL Inspection and Request indexing for `/`, `/about.html`, `/learn/`.
7. **Google Business Profile.** Claim "SortMyCover" (exact, no keywords). Service-area business unless a public street address exists (needs_human, below). Category guidance: avoid Insurance agency, Insurance broker, Financial consultant, Financial planner and similar, because they imply a licensed firm and Lead Velocity is not an FSP. Pick the nearest accurate non-financial primary category from Google's current list (for example a general business/consulting or marketing-service type) and leave secondary categories empty. This is a compliance call (needs_human). Name, address, phone and website must be identical to the footer and the Organization schema (NAP). If no public phone number exists, show none consistently and use the email; do not invent one.
8. Create or complete Facebook, Instagram, LinkedIn, then YouTube and TikTok placeholders. Add URLs to `sameAs`.
9. Meta domain verification on `sortmycover.co.za` only (token in every page head). Never the staging host.
10. Day-0 baseline in Search Console: record impressions, position and CTR for the four brand queries (they will be zero or empty; the baseline is the point). This is also the baseline for the exact-match-domain test (C claim: "exact-match domain still lifts CTR").
11. Share the home URL in WhatsApp and check the link card (needs `og-image.png`).

## 3. Core Web Vitals budget per page type (mobile, 4G, field targets at p75)

| Page type | LCP | INP | CLS | Weight (transfer) | Requests | Notes |
|---|---|---|---|---|---|---|
| Home, About, How we make money, Complaints, Privacy | <= 1.5 s | <= 100 ms | <= 0.02 | <= 30 KB incl. CSS (no images today) | <= 4 | Static, no JS. Current build is about 4 KB HTML + 3 KB CSS |
| Learn pages (5 + hub) | <= 1.8 s | <= 100 ms | <= 0.02 | <= 40 KB | <= 5 | Text, system fonts, no images, no JS |
| Quiz landing page (later) | <= 2.0 s | <= 150 ms | <= 0.05 | <= 120 KB images, JS <= 100 KB gz | <= 15 | The ad click lands here. Pixel/CAPI added at this tier only. Budget owned jointly with landing-page-builder |
Google's "good" thresholds are LCP 2.5 s, INP 200 ms, CLS 0.1; the budget is stricter on purpose for data-light SA mobile. Self-hosted DM Sans woff2 (500, 800) adds weight: preload one file, `font-display: swap`, subset to Latin. Lighthouse mobile 95+ on Performance, SEO, Accessibility is the pre-launch gate. After launch use Search Console's Core Web Vitals report (needs traffic) and CrUX.

## 4. Branded-search monitoring

- Weekly, Monday: export Search Console Performance > queries filtered to "contains sortmycover" and "contains sort my cover" (also "sortmycover reviews", "sortmycover scam", plus typos) with clicks, impressions, CTR, position, 7-day compare. Also check live SERP by hand in a private window from an SA location.
- Feed to the `brand & search` faculty tile: brand impressions, brand clicks, brand CTR, average position for `sortmycover`, count of the 10 positions we own on the four target queries, and a flag if any query shows a third-party result in positions 1-3.
- Targets: position 1-3 for `sortmycover` by week 4 (the north star). Brand CTR baseline at first data, then compare against the exact-match-domain claim.
- Join with Meta side: weekly ad impressions vs brand impressions, as a rough Search Lift read (correlation, not proof).
- Automation path: Search Console API export by a scheduled n8n workflow once a service account exists; until then a manual weekly CSV. Needs_human: Search Console access for the agent.
- Alerts: a negative result in the top 10 for "sortmycover scam" or "reviews"; a drop out of the top 3 for `sortmycover`; any indexed staging URL.

## 5. Gap handling when positions are not yet ours
Do the cheap owned things first: finish profiles, add `sameAs`, internal links from every page to About and How we make money, keep Learn linked from the footer. No link buying, no blog farm, no generic "life cover" head terms in month 1. Only the five learn pages exist.

## 6. Google Ads brand-term-only campaign: conditions

Do not start until all hold:
1. Own domain live and indexed, brand SERP baseline recorded, GBP verified.
2. Landing page (quiz) live, disclosure in the footer, privacy and complaints live.
3. Verification status re-checked in the Google Ads policy centre the day before spend. Current view, checked 1 Oct 2026: SA was added to Google's financial-services verification in April 2026 but only for crypto, consumer loans and BNPL; insurance-inclusive verification (June 2026) covers 24 EEA markets, not SA. This is an ASSUMPTION about the future: re-check before any Google spend, and if insurance becomes covered, stop and resolve what Lead Velocity (not an FSP) must submit (needs_human, never guess).
4. Scope: exact and phrase match on the brand terms only (`sortmycover`, `sort my cover`, plus close variants). Negative-keyword the generic category terms (life cover, life insurance, funeral cover, quotes) so the campaign cannot drift into head terms. Not the competitor names.
5. Copy: the same disclosure and educational tone as the site; no premium, cover amount, "best" or "cheapest".
6. Budget: small daily cap, decided by Jonathan (money gate). Run only if the organic brand SERP is not already owning position 1 with sitelinks, since paid brand clicks that would have been free are a waste; a defensive reason is a rival bidding on the brand name.
7. Success: brand terms impression share, cost per attended meeting. Review after 14 days.

## 7. Staging rules and the pending GATE-DOMAINS decision

Staging host: `sortmycover.leadvelocity.co.za` (or Hostinger password-protected staging).
- `X-Robots-Tag: noindex, nofollow` header and `<meta name="robots" content="noindex">` while on staging only. Remove the meta tag from files before they ship to production; the production `.htaccess` must not send the header.
- HTTP basic auth on the whole host (401 without credentials). Never linked from any public page, never in the sitemap submitted to Search Console, never in Meta or Google forms.
- `robots.txt` on staging: `Disallow: /` is not enough on its own (it does not stop indexing of a linked URL); the auth and the header do the work.
- Canonical tags in the files point to `https://sortmycover.co.za/...` even on staging, so a leak does not create a rival duplicate. Verify the canonical is not self-referencing the staging host.
- 0.1: the subdomain is never shown to consumers or Meta.

**GATE-DOMAINS is pending** (the laptop session relayed "defer"; awaiting Jonathan's own answer in the thread; not recorded as decided). Effect on search:
- If **go**: buy now; the production plan above runs as written. The five learn pages and the home page are indexed before any ad.
- If **defer**: nothing public is indexed until cutover. The only copy of the site is on password-protected, noindex staging. There is no brand SERP, no GBP website field, no Search Console property for the own domain, and no indexing head start. The cutover must happen before Meta domain verification, Pixel/CAPI binding and the first ad impression, and ideally 7+ days before the first ad so Google can index the home page and the learn pages and GBP verification can finish. A shorter gap risks the first Search Lift wave landing on an empty SERP. Flag this as a trade-off in the gate reply (needs_human).

### Cutover SEO steps (defer path, or any later move)
1. Buy and point both domains (`deploy.md` sections 1 to 6). Production deploy with canonical, `og:url`, sitemap `<loc>` and schema `url` fields already on `sortmycover.co.za` (they are: the files were written for the own domain).
2. 301 map: staging has nothing indexed, so nothing to redirect. If the staging host was ever indexed by mistake, 301 each staging URL to its same path on `sortmycover.co.za` (staging host is a separate property); then request removal in Search Console for the staging property.
3. Canonical swap: confirm every canonical and hreflang points to the own domain (grep for `leadvelocity.co.za` in `landing/holding`, apart from any intentional parent-company link).
4. Search Console: add the Domain property, verify by DNS TXT, submit the sitemap, request indexing for key URLs. Change-of-address tool applies only if a site that was already indexed on a different domain moves; with an unindexed staging host it does not apply, so use it only if staging was ever indexed (it needs the old site verified, so it does not work for `.com` to `.co.za` redirects, which are plain 301s).
5. GBP: set the website field to `https://sortmycover.co.za/`; NAP identical to the footer.
6. Schema: Organization `url`, `logo`, `sameAs`, Article `url` and `mainEntityOfPage`, BreadcrumbList `item` values all on the own domain. Re-run Rich Results Test after deploy.
7. Meta: verify the domain, then Pixel/CAPI; only after items 1 to 6 are green.
8. Re-record the baseline (item 10 in Section 2) and start the weekly monitor.

## 8. needs_human (this plan)
1. GATE-DOMAINS go or defer (pending, Jonathan). If defer: accept the late-indexing trade-off above and fix the cutover date at least 7 days before the first ad.
2. Optional, not blocking: a reviewer line on the learn pages, only after a real review by someone who is NOT a broker we route leads to (NH-30 D). No placeholder exists on the pages.
3. GBP: primary category (compliance) and whether a public address and phone number will be shown.
4. Google Ads: budget, and the pre-spend verification re-check (ASSUMPTION flagged in Section 6).
5. HelloPeter business profile: only if there is a named person to answer complaints.
6. Search Console access for the agent (automation of the weekly export).
