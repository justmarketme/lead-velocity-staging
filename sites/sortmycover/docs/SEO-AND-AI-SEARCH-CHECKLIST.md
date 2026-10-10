# SEO and AI-search checklist

Each row: the requirement, how the build implements it, and the test that proves it. "dist test" = `tests/dist.test.ts`, which reads the finished pre-rendered HTML (run `npm run verify`). Grounding: `deliverables/website/fact-check.md` rows S1-S12 and G1-G12.

## A. Search engines

| # | Requirement | How it is implemented | Proof |
|---|---|---|---|
| 1 | Full content in the initial HTML of every route | `scripts/build.mjs` renders every route with `renderToString` into `dist/<path>/index.html`; React then hydrates | dist test "renders every route (50 files) with real content" |
| 2 | Folder URLs with a trailing slash, one absolute self-referencing canonical per page | `src/lib/head.tsx` `renderHead`; every route path ends in `/` | dist test "apex pages: self-referencing absolute canonical with trailing slash" |
| 3 | 301 map for the old `.html` URLs | `src/build/redirects.ts` -> generated into `vercel.json` and `hostinger/.htaccess` | `tests/seo.test.ts` "old URL map", `tests/config.test.ts` drift guard |
| 4 | Unique `<title>` of 60 characters or fewer, brand last; unique meta description | `pageTitle()` in `src/lib/head.tsx`; per-page strings | dist test "each page has a unique title of at most 60 characters ..." |
| 5 | One H1 per page, logical H2/H3 | `PageFrame` renders the single H1; articles render their own H1 | same dist test (H1 count = 1) |
| 6 | Descriptive internal links: hub -> articles -> related -> /how-we-make-money/ + /about/ | `ArticlePage` Related block; hub lists; footer | content review (not machine-checked) |
| 7 | XML sitemap, accurate `lastmod`, only indexable apex pages | `src/build/seo.ts` `buildSitemap`; `lastmod` = article `lastReviewed` | `tests/seo.test.ts` "sitemap"; dist test "sitemap lists only indexable apex pages" (compares to the noindex meta of every built page) |
| 8 | robots.txt allow-all with a Sitemap line | `buildRobots` | `tests/seo.test.ts` "robots.txt" |
| 9 | JSON-LD limited to Organization (legal name, registration, address, email), WebSite, Article, BreadcrumbList; no FAQPage/HowTo/Product/Offer/AggregateRating | `src/lib/jsonld.ts` | dist test "JSON-LD uses only ..." |
| 10 | Article `dateModified` = visible "Last reviewed" = sitemap `lastmod` | one field (`lastReviewed`) feeds all three | dist test "every article ..." |
| 11 | Open Graph + Twitter card, 1200x630 og-image, favicons, manifest | `renderHead`; `public/og-image.png` (existing holding-site image; see "Not done") | dist test (og tags via canonical/robots checks); manual |
| 12 | 404 page | `dist/404.html` rendered from `NotFound`; served by the 404 route / `ErrorDocument` | dist test (file exists in the 51) |
| 13 | Self-hosted fonts, `font-display: swap`, LCP font preloaded | `src/styles/tokens.css`, `index.html` preload of both woff2 files | manual (network panel): fonts come from `/fonts/` |
| 14 | Core Web Vitals budget LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 | no images above the fold (text LCP), CSS in one file, route chunk preloaded, only transform/opacity animated, exit animations 90 ms | dist test "the LCP element is never hidden by animation"; Lighthouse not run here (see README) |
| 15 | Never start the H1, hero text or primary CTA at opacity 0 | no component sets initial opacity; `revealChildren` skips anything already in view and sets `opacity` only via JS below the fold, with a 4 s failsafe | dist test (no inline opacity, no `style=` at all in the HTML) |
| 16 | Campaign hosts: noindex by header AND meta, self-canonical, not in the sitemap, not blocked in robots.txt | `vercel.json` `X-Robots-Tag` on `.+\.sortmycover\.co\.za`; `<meta robots noindex>` in each `/_c/` page; canonical on its own host | dist test "campaign pages: ..."; `tests/config.test.ts` "noindex header on campaign hosts" |
| 17 | Image alt text, width/height, lazy-load, AVIF/WebP | the site has no content images (only the decorative, `aria-hidden` SVG hero); nothing to alt-text | n/a; add the rule when images are added |

## B. AI and LLM search

| # | Requirement | How it is implemented | Proof |
|---|---|---|---|
| 1 | Content in the initial HTML (these crawlers do not run JS) | as A1 | dist test A1 |
| 2 | Every article leads with a 40-60 word answer block plus the scope sentence | `ArticleMeta.answer`, rendered first in `.answer-block` | `tests/content.test.ts` (each article) and dist test "every article: answer block 40-60 words ..." |
| 3 | Question-style H2s, dated sources, visible author / last reviewed (YMYL trust) | article template; sources show the month the page was seen | `tests/content.test.ts` front matter; dist test (Sources h2, `<time>`) |
| 4 | No reviewer block without a verified reviewer | `reviewer` is optional; the template renders it only when present; the test requires `verified_on` and an FSCA link | `tests/content.test.ts` "has no reviewer block unless ..."; dist test (no "Reviewed by") |
| 5 | About page with full legal identity; /how-we-make-money/; /editorial-policy/ with AI-assistance disclosure | `About.tsx`, `HowWeMakeMoney.tsx`, `EditorialPolicy.tsx`; identity block in every footer | dist test "footer identity block ... on every page" |
| 6 | Passages safe to quote out of context: no advice, no "you should" | wording scan `src/build/wording.ts` over all article text and all rendered pages | `tests/content.test.ts` and dist test "visible copy passes the compliance wording scan" |
| 7 | robots.txt allows OAI-SearchBot, PerplexityBot, Claude-SearchBot, Googlebot, Bingbot (and GPTBot, ClaudeBot, Google-Extended) | `ALLOWED_BOTS` | `tests/seo.test.ts` "robots.txt" |
| 8 | No llms.txt; no nosnippet anywhere indexable | none generated | dist test "no robots meta blocks snippets" |

## C. What the site cannot do alone (Jonathan, after launch)

1. Google Search Console: add a Domain property (TXT record in Hostinger DNS), submit `https://sortmycover.co.za/sitemap.xml`, and in Search Console settings keep the "Search generative AI: Include" choice on.
2. Bing Webmaster Tools: import the site from Search Console and submit the sitemap (this also feeds Copilot citations).
3. If the site is hosted on Vercel: keep the project's "AI Bots Managed Ruleset" on Allow or Log, never Deny (robots.txt allowing a bot does nothing if the firewall blocks it).
4. Build off-site brand signals (YouTube, LinkedIn, Facebook page): the research found these correlate most with AI brand visibility. Add real URLs to `sameAs` in `src/lib/jsonld.ts` once the profiles exist (none are invented here).
5. Measure: GA4 or a first-party RUM beacon with a segment for "AI Assistant" referrals (chatgpt.com, perplexity.ai, copilot.microsoft.com, claude.ai, gemini.google.com). The first-party `/beacon` already counts page and quiz-step views per angle, not referrers.
6. Search Console / Bing: judge on 4-week rolling windows; a new YMYL domain starts at zero authority.
7. Replace `public/og-image.png`: it is the holding-site image and its text carries the old tagline "Sort your cover. 30 minutes. A real adviser." (compliance flag C1).
8. Run Lighthouse mobile (4G, mid-range Android) against the deployed URL; it could not be run in the build environment.
