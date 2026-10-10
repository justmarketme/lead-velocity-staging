# Lens: subdomain-architecture

Research date: 10 Oct 2026. Scope: campaign landing pages on subdomains of sortmycover.co.za, one static Vercel project (`sortmycover`, Root Directory `landing`), DNS at Hostinger (`byte.dns-parking.com`, `pixel.dns-parking.com`). Everything below is an example shape, nothing was applied: no deploy, no DNS change, no domain added, no commit.

## How to read this file

- Evidence grades: **A** = vendor/regulator docs read this session (date = page "last updated" where shown). **B** = named practitioner or secondary source. **L** = observed live on 10 Oct 2026 with curl or dns.google from this machine. **UNVERIFIED** = not observed and no primary source; stated as such.
- Anything older than 2024 is flagged STALE-RISK.
- Built on, not repeated: `deliverables/website/research/seo-google.md` (F1 noindex campaign pages, F5 subdomain vs path), `meta-pixel-capi.md` (F3 opt-out cookie scope, F7 `_fbc` scope), `landing/holding/deploy.md`, `landing/README.md`, `landing/vercel.json`, `landing/build-site.mjs`, `landing/build.mjs`, `landing/shared/pixel.js`, `search-findability-lead/{SUMMARY,serp-plan}.md`.
- `deploy.md` currently says "No go. subdomain and no second project". This file keeps the second half (ONE project) and replaces the first half (subdomains as aliases onto the existing `/{slug}/` build).

## Bottom line (read this first)

1. **Do not add a wildcard.** Wildcard certificates need DNS-01. Vercel supports that only with Vercel nameservers or an `_acme-challenge` NS delegation; Hostinger's own docs say it does not allow NS records on subdomains. Moving the nameservers means rebuilding the Microsoft 365 mail records by hand. Add each campaign host explicitly with its own CNAME instead (F2, F3).
2. **A host-based `rewrites` entry will not work for `/` on this project.** Vercel serves files before applying `rewrites`, and `/` is the apex `index.html`. Use `routes` entries (`src: "^/$"`, `has` host, `dest: "/{slug}/index.html"`), with Routing Middleware or project-level routing rules as fallbacks. Rewrite only `/` and `/thanks`, never `/(.*)`, because the quiz pages load `/assets/page.js` and `/shared/pixel.js` with root-relative paths (F1).
3. **The existing apex CSP rules will leak onto campaign hosts** because they key on path only. Scope them to the apex host and give campaign hosts their own CSP plus a host-level `X-Robots-Tag: noindex` (F5, F6).
4. **Confirm the Vercel plan before paid traffic.** Hobby is non-commercial only; the team slug looks like the auto-created personal (Hobby) team. Plan is not exposed by the connector, so UNVERIFIED (F4).
5. **Architecture:** one project; one host per landing page, label identical to the slug; each page served from exactly one host; apex `/{slug}/` redirects to it; every other path on a campaign host redirects to the apex; campaign hosts are `noindex` with a self-canonical, no sitemap, `robots.txt` allow-all; opt-out and `_fbp`/`_fbc` cookies live on `.sortmycover.co.za` (F6 to F10).

## Recommended architecture

```
Hostinger DNS (stays authoritative; NO nameserver move)
  A      @                76.76.21.21                 (exists)
  CNAME  www              sortmycover.co.za           (exists)
  CNAME  <slug>           <project-cname>.vercel-dns-017.com.   one per live landing page, copied from the Vercel domain card
        |
        v
Vercel project `sortmycover` (single static deployment, Root Directory landing, output landing/site)
  domains: sortmycover.co.za, www.sortmycover.co.za, <slug>.sortmycover.co.za x N   (Hobby cap 50, Pro soft cap 100,000)
  redirects (first):  .com -> .co.za ; www -> apex ; apex /<slug>/ -> https://<slug>.sortmycover.co.za/ (307, query kept)
                      any other path on a campaign host -> apex same path
  routes (before filesystem):  host=<slug>.sortmycover.co.za  ^/$ -> /<slug>/index.html ; ^/thanks/?$ -> /<slug>/thanks/index.html
  headers: apex rules scoped to apex host ; campaign rules for ".+\.sortmycover\.co\.za" (noindex + quiz CSP) ; immutable cache for /assets /fonts
        |
        v
n8n (W01/W05): CORS allow ^https://([a-z0-9-]+\.)?sortmycover\.co\.za$ ; 303 to https://<angle>.sortmycover.co.za/thanks/
Meta: one Pixel + dataset, domain verified at sortmycover.co.za (root), traffic-permissions allow list sortmycover.co.za
Cookies: smc_ads_off, _fbp, _fbc with Domain=sortmycover.co.za (works because co.za is on the Public Suffix List)
```

Why identity naming (host label = slug = path = `angle` = Pixel `content_name`): one identifier everywhere, so n8n builds the thanks URL with one template string, the generator needs no mapping table, and a later generic rule (`<slug>` captured from the host) stays possible. The ad campaign itself is carried by `utm_campaign`, not by the host, because campaigns come and go while pages persist.

Honest cost/benefit: Google has no indexing or ranking preference between subdomains and subfolders (F6), the Pixel is the same, cookies are the same. What subdomains buy here is a branded, readable ad URL, header-level separation of paid pages from organic ones (one host regex instead of path lists), and the ability to retire or swap a campaign host without touching the apex URL space. What they cost is one DNS record and one Vercel domain per page, a routing gotcha (F1), header/CSP scoping (F5), a CORS allow-list, and no way to test host routing on `*.vercel.app` previews (F11). Keep the path build (`/{slug}/`) as the source of truth; hosts are thin aliases onto it.

## Findings

### F1. Host `rewrites` will not fire for `/`; use `routes` (or project-level routing rules, or Routing Middleware), and rewrite only `/` and `/thanks` (impact: high)

- Vercel's own `vercel.json` reference says a rewrite `source` should not be a file because the filesystem takes precedence over rewrites (A, vercel-json, updated 2026-08-14). A Vercel maintainer said the same about `/` and `index.html` in 2021 (B, STALE-RISK but consistent with the 2026 doc): vercel/vercel discussion 5723. The deprecated `handle: "filesystem"` note also says `rewrites` "check the filesystem by default".
- The apex home is `site/index.html`, so `/` always matches a file first. A public repo hit exactly this on 2 Oct 2026 and fixed branded-subdomain roots by replacing `rewrites` with `routes` of the form `{ "src": "^/$", "has": [{ "type": "host", "value": "..." }], "dest": "/units/.../index.html" }` (B, github.com/ozone503-maker/outlet-mall pull 14). The project memory for the clinics site also records that host rewrites in `vercel.json` were ignored and only middleware worked (local, Next.js, different cause but same family).
- Documented alternatives that run before the deployment's own routing: project-level routing rules (dashboard/API, host condition, rewrite action, no redeploy, staged then published, rollback history; "run after bulk redirects and before your deployment's own routes", A, project-routing-rules, 2026-08-11) and Routing Middleware (any framework, runs before the cache, Fluid compute billing; static rules are preferred because they run on the CDN without invoking code, A, routing-middleware, 2026-08-14). `routes` can sit beside `redirects`/`headers` in one file per the current reference (A).
- Scope the route narrowly. `landing/template/index.html` loads `/shared/pixel.js` and `/assets/page.js` with root-relative URLs (repo, lines 25-26), so a catch-all `/(.*)` rewrite to `/{slug}/$1` would 404 both. Rewrite exactly `^/$` and `^/thanks/?$`.
- Use `{ "eq": "<host>" }` for exact hosts (documented `MatchableValue`, A, build-output-api/configuration 2026-07-27). Do not rely on a named capture from the host (`$name`/`:name` in a route `dest` is not documented for `routes`; the doc names only numbered captures, `$name` from `src`, and built-ins `$host`/`$wildcard` for transforms), so generate one explicit entry per host.
- Not yet observed on this project: the exact `routes` shape beating `/index.html`. Test (F11) before any ad points at a host. Fallback if it fails: a 307 from `<slug>.sortmycover.co.za/` to `sortmycover.co.za/<slug>/` keeps ads working (query kept, verified in F7) at the price of an extra hop and the apex URL showing in the address bar.

### F2. Wildcard is the wrong tool here: it needs DNS-01, Hostinger forbids subdomain NS delegation, and a nameserver move puts the mail records at risk (impact: high)

- Vercel: wildcard certificates use the DNS-01 challenge, which is why it asks for Vercel nameservers (A, working-with-ssl, 2026-09-16). The documented escape hatch for an external DNS provider is two `NS` records for `_acme-challenge` to `ns1.vercel-dns.com.` and `ns2.vercel-dns.com.`, "Enable Vercel DNS" on the apex in the team Domains page, plus a wildcard `CNAME *` to `cname.vercel-dns-0.com.`; the NS records must stay in place for renewals (A, add-a-domain 2026-09-16 and troubleshooting 2026-09-18). No plan restriction on wildcards is stated on those pages; the Hobby cap is 50 domains per project and a wildcard counts as one entry (A, limits 2026-09-16).
- Hostinger: "Hostinger domains don't allow custom nameservers (NS records) for subdomains - only for the main domain" (A, hostinger.com/support/1583249, updated 2026-09-15). `_acme-challenge.sortmycover.co.za` is a subdomain, so the delegation route is closed. The other route is moving the nameservers to Vercel.
- What a nameserver move must reproduce. Live zone on 10 Oct 2026 (L, dns.google): `A @ 76.76.21.21`, `CNAME www -> sortmycover.co.za`, `MX 0 sortmycover-co-za.mail.protection.outlook.com`, `TXT v=spf1 include:spf.protection.outlook.com -all`, `TXT MS=ms93425512`, `CNAME autodiscover -> autodiscover.outlook.com`. No CAA, no AAAA, no DKIM selectors, no DMARC at the names checked. A zone cannot be fully enumerated from outside, so export it from Hostinger before any change. Vercel itself warns that email stops arriving after a nameserver change unless MX/TXT are re-added (A, add-a-domain).
- Side effect of any wildcard: every label resolves and serves the site (look-alike hosts such as `login-secure.sortmycover.co.za` would show the real pages under the real certificate). For a brand that asks people for a phone number in a financial-adjacent flow, a closed list of hosts is safer. Today a random label is NXDOMAIN (L: `random-xyz123.sortmycover.co.za` and `new-bond.sortmycover.co.za` both returned Status 3).
- Decision: explicit CNAME per host (F3). Revisit wildcard only if the count passes about 30 hosts or hosts are created programmatically, and then move DNS to Vercel deliberately with a copied zone.

### F3. The exact DNS and TLS shape: one CNAME per host at Hostinger, certificate per host by HTTP-01, nothing blocks issuance today (impact: high)

- Vercel: a subdomain is configured with a CNAME; "each project has a unique CNAME record" such as `d1d4fc829fe7bc7c.vercel-dns-017.com`, and the value to use is the one on the project's domain card, not one copied from elsewhere (A, add-a-domain 2026-09-16; A, kb a-record-and-caa-with-vercel 2026-07-28). The older `cname.vercel-dns.com` is reported to still work (B/C community threads) but must not be used. Copy the value exactly, including the trailing dot (A, troubleshooting). I could not read this project's CNAME target through the connector (UNVERIFIED value; the example above is Vercel's, not ours).
- Hostinger: add records in the DNS Zone Editor (A, hostinger.com/support/4738777, updated 2026-07-24): Type CNAME, Name = the label only (`new-bond`), Points to = the Vercel target, TTL 300 (their default is 14400, so set it deliberately). Do NOT use hPanel "Subdomains": that tool needs a hosting plan and wires the subdomain to Hostinger hosting automatically (A, hostinger.com/support/1583405, updated 2026-09-15). Do not add AAAA: Vercel does not support IPv6 for third-party DNS (A, troubleshooting). A CNAME cannot coexist with another record at the same label, so keep the reserved list (F10) out of the Vercel set.
- TLS: Vercel issues a Let's Encrypt certificate per hostname automatically once the domain is added and DNS resolves; non-wildcard names use HTTP-01, renewal starts 14 to 30 days before expiry (A, working-with-ssl 2026-09-16). CAA only matters if one exists: apex CAA is empty today (L), so nothing blocks; if CAA is ever added it must allow `letsencrypt.org` (A, troubleshooting). Let's Encrypt allows 50 new certificates per registered domain per 7 days and 5 duplicates per identical name set per 7 days (A, letsencrypt.org/docs/rate-limits, 2026-08-05); registered domain comes from the Public Suffix List, so 11 hosts is well inside the limit but issue them over a day or two rather than as a script of 50.
- Timing: the zone's SOA negative-cache value is 600 seconds (L: `... 2026100801 10000 2400 604800 600`), so a lookup of a not-yet-created host can be cached as NXDOMAIN for up to 10 minutes. Create the record before anyone, including Vercel's checker or Meta's ad review, queries the name. Lower TTL ahead of any change, as Vercel recommends (A, troubleshooting).
- Order of work per host: (1) deploy the `vercel.json` change first so the host is routed and noindexed the moment it exists; (2) add the domain to the project (no DNS yet); (3) run the pre-DNS curl test (F11); (4) add the CNAME; (5) wait for "Valid Configuration" and the certificate; (6) only then submit ads. Allow a day of margin before ad review.
- Dangling records: if a host is removed from the project, delete its CNAME the same day. Vercel docs say a domain can belong to only one account or team and ask for a TXT proof when another account holds it, but say nothing about takeover of an orphaned subdomain CNAME (A, troubleshooting 2026-09-18); treat as UNVERIFIED and keep DNS and project in sync.

### F4. Hobby is non-commercial only; confirm the team plan before paid traffic (impact: high)

- Vercel: "Hobby teams are restricted to non-commercial personal use only"; commercial use includes "advertising the sale of a product or service" and any site used for the financial gain of anyone involved in producing it (A, fair-use-guidelines, 2026-09-14). SortMyCover is a lead-gen site that exists to earn Lead Velocity revenue.
- The team is `jono's projects` (slug `jonos-projects-8697404e`, id team_UlVtHW4rq7AN951png8rU4qk). The connector does not return the plan, so this is UNVERIFIED, but the name matches the auto-created personal team and the project memory records another project of Jono's as Hobby. Check Settings > Billing.
- If Hobby: Pro is a $20 per month platform fee that includes one deploying seat and $20 of usage credit (A, pro-plan 2026-09-15). It also removes the 50-domain cap (soft limit 100,000, A, limits), allows custom environments (a stable staging domain without a Git link, A, add-a-domain-to-environment 2026-08-11) and Password Protection at $20 per month per project (A, deployment-protection 2026-09-15). Upgrade before the first paid click; a pause mid-campaign would take every landing page offline at once.
- Not binding: current usage is 3 domains on the project (L via connector: apex, www, `sortmycover.vercel.app`), so 11 hosts is far under the Hobby cap; routes per deployment cap is 2,048 on both plans and this design needs about 60 (A, limits).

### F5. The existing header rules key on path only, so the apex CSP will land on campaign hosts; scope by host and give campaign hosts their own CSP (impact: high)

- `landing/vercel.json` sets the strict holding CSP on `source: "/"`, `/:page([^/]+\.html)` and `/learn/:path*` with no host condition. The request path for a campaign host's root is also `/`. Header rules match the incoming path, and the live site shows they also match the final served file: `https://sortmycover.co.za/new-bond/` (a 404 today) returned the holding CSP, although only the `404.html` rule can match it (L, curl 10 Oct 2026). So assume matching on both the incoming and the resolved path.
- Two CSPs on one response are both enforced (the stricter intersection), or one rule overrides the other; neither lets the quiz page load Meta, Turnstile or n8n. Fix: add `has: [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }]` to the three apex CSP rules, and add one campaign rule keyed on the host pattern (shape below).
- Host regex in `has` is proven on this project: the rule `.*\.vercel\.app` returns `X-Robots-Tag: noindex, nofollow, noarchive` on `sortmycover.vercel.app` and nothing on the apex (L). Reuse that exact style for `.+\.sortmycover\.co\.za` (needs at least one character before the dot, so the apex does not match).
- Campaign CSP: start from the one already drafted in `landing/README.md` (script-src with the one inline-script hash plus `connect.facebook.net` and `challenges.cloudflare.com`; connect-src and form-action to the n8n host; `frame-ancestors 'none'`). `'self'` is evaluated per origin, so one rule serves every host. Motion (motion.dev) must be vendored under `/assets/` so `script-src 'self'` still holds; a CDN import would force a new origin into the CSP. The inline-script hash changes whenever that script line changes.
- HSTS: keep `max-age` as is and do NOT add `includeSubDomains` yet; the platform already adds a 2-year HSTS to redirect responses (L: `max-age=63072000` on the `www` 301), which pins only that host.
- Source: A vercel-json headers reference (`has` accepts `host`; 2026-08-14); L as above.

### F6. SEO for campaign hosts: no subdomain penalty, so use header-level noindex and a self-canonical, not a canonical to the parent (impact: high)

- Google: "From an indexing and ranking perspective, Google doesn't have a preference" between subfolders and subdomains (A, developers.google.com/search/help/crawling-index-faq; the sibling file dates its revision 2025-12-10). Campaign pages are paid-only and noindexed, so the authority question never arises; the organic content stays under `/learn/` on the apex.
- Canonical vs noindex: Google says it does not recommend using noindex to steer canonical selection within a site, because noindex removes the page from Search entirely, and prefers `rel=canonical` for duplicates (A, consolidate-duplicate-urls, updated 2026-07-10). Google's canonicalization troubleshooting page (2026-08-21) does not cover noindex combined with a cross-URL canonical, so the mixed case is undocumented. Therefore give each campaign page ONE job: `noindex` with a canonical to itself (`https://<slug>.sortmycover.co.za/`). Never `noindex` plus canonical-to-apex.
- Make `noindex` work: the URL must be crawlable (not blocked in robots.txt) for Google to see it, and removal after a later change can take months (A, block-indexing, 2025-12-10). Campaign hosts therefore serve the same `robots.txt` as the apex (allow all). Meta's ad crawler `Meta-ExternalAds` honours robots.txt, so a `Disallow: /` on campaign hosts would also risk ad review (A, developers.facebook.com/docs/sharing/webmasters/web-crawlers, undated); Google Ads' AdsBot ignores `*` rules anyway (sibling seo-google F1).
- robots.txt is per host: a file on `sortmycover.co.za` is not valid for other subdomains (A, google robots_txt, 2026-08-31). Campaign hosts serve their own copy because the file is in the shared output; its `Sitemap:` line may point at another host (A, same page).
- Sitemaps: all URLs must sit on the sitemap's own host (A, sitemaps.org/protocol.html, undated). The apex sitemap stays apex-only and campaign hosts publish none. Do not add `<slug>.` URLs to it.
- Host-level noindex also covers any staging label: Vercel adds its automatic `noindex` to previews but omits it when a custom domain is assigned to a preview branch, and itself points to a `has` host rule as the fix (A, kb/are-vercel-preview-deployment-indexed-by-search-engines, 2026-10-02).
- Doorway-pattern risk: eleven near-identical pages on eleven hosts is the shape of Google's doorway-abuse policy if indexed (sibling seo-google F1, spam policies 2026-08-28). Keeping all of them noindexed removes the exposure; this is the strongest SEO reason for the host-wide `X-Robots-Tag` rule.
- Search Console: a Domain property (DNS TXT, still pending in `deploy.md` section 5) includes all subdomains and protocols (A, support.google.com/webmasters/answer/9008080, undated). Expect campaign URLs under "Excluded by noindex tag", not as errors.

### F7. Redirect topology: one home per page, apex path to host, everything else on a campaign host to the apex; query strings survive (impact: medium)

- Rules, in order (redirects run before routes and before the filesystem): (1) `.com` to `.co.za` and `www` to apex as today; (2) apex `/<slug>` and `/<slug>/` to `https://<slug>.sortmycover.co.za/`; (3) on any campaign host, every path except the page, `/thanks`, `/assets/`, `/shared/`, `/fonts/` and `/robots.txt` to the same path on the apex. Rule 3 stops `new-bond.sortmycover.co.za/about.html` and other campaigns' `/new-baby/` from becoming duplicate hosts for apex pages (the case where `noindex` plus an apex canonical would conflict, F6).
- Query strings are forwarded: `https://www.sortmycover.co.za/learn/?fbclid=AbC123&utm_source=meta` returns `Location: https://sortmycover.co.za/learn/?fbclid=AbC123&utm_source=meta` with the fbclid case intact (L). So the apex-to-host redirect will not drop attribution.
- Use 307 first, then 308 after about a month of stable traffic. Browsers cache 308 hard, so a wrong target is expensive to undo. The platform's own redirect responses already carry a 2-year HSTS (L).
- `/.well-known` cannot be redirected or rewritten on Vercel (A, rewrites doc 2026-08-11); the catch-all exclusion list does not need to mention it.
- The destination syntax in the catch-all (`/((?!assets/|shared/|fonts/|thanks(?:/|$)|robots\\.txt$).+)` with `$1`) follows the `/(.*)` plus `$1` style already working for `www` (L), but the negative lookahead is untested here. Test in F11.
- `deploy.md` also wants `www` redirected in project settings; the project-level `redirect` field is still `null` for `www.sortmycover.co.za` (L via connector), so `vercel.json` alone does the work today. Both is fine; do not rely on one silently.

### F8. Cookies, consent state and the third-party allow-lists all need the root domain, not each host (impact: medium)

- Web Storage is per origin, so `smc_ads_off` in localStorage will not follow a visitor from `/privacy#opt-out` to a campaign host (sibling meta-pixel-capi F3). A cookie with `Domain=sortmycover.co.za` is available to the domain and all subdomains; a leading dot is ignored; cookies cannot be set on a public suffix (A, MDN Set-Cookie, undated). `co.za` is in the Public Suffix List (L: line 6774 of the list version 2026-10-07), so `Domain=sortmycover.co.za` is the widest legal scope and `Domain=co.za` would be rejected.
- Write `smc_ads_off`, and any `_fbc` that `pixel.js` builds itself, with `Domain=sortmycover.co.za; Path=/; Secure; SameSite=Lax` (sibling F7 for details). Same Pixel ID and dataset on every host. Meta's `fbp`/`fbc` format has a subdomain index where `example.com` is 1, so `fb.1.` stays right for `sortmycover.co.za` (A, fbp-and-fbc doc, undated).
- Meta domain verification is done once on the root domain; Meta reportedly does not allow verifying a subdomain (except for Commerce onboarding) and a verified root covers its subdomains (B, adwize.ai 2026-10-09, citing Meta Help pages that the fetch tool could not render; UNVERIFIED primary). The Pixel traffic-permissions allow list also covers subdomains of a listed domain (B, Jon Loomer, updated 2025-03-01). Set the allow list to `sortmycover.co.za` after go-live so a copied snippet on another domain cannot feed the dataset.
- Cloudflare Turnstile: a listed hostname is authorised together with all its subdomains, wildcard characters are not supported (A, developers.cloudflare.com/turnstile/additional-configuration/hostname-management, undated). List `sortmycover.co.za` once.
- n8n: every host is a separate origin, so `Access-Control-Allow-Origin` on `/lead`, `/slots`, `/book` must echo origins matching `^https://([a-z0-9-]+\.)?sortmycover\.co\.za$` (pattern allow-list, never `*` with credentials). The no-JS fallback returns 303 to `https://<angle>.sortmycover.co.za/thanks/`, built from the validated `angle` (identity naming makes this one template string).
- `pixel.js` and `page.js` send `page_url` as origin plus path (repo: `page.js` line 31 and 207), which becomes the host root. Reporting must key on the `angle` field, not parse `page_url`. CAPI `event_source_url` should stay the real browser URL.

### F9. Repo changes the architecture needs: per-host canonical and thanks URL, a single source for hosts, and a drift guard (impact: medium)

- `landing/build.mjs` lines 122 to 126 build `canonical`, `og:url` and `thanks_url` from one `site.page_base_url` plus `/${slug}/`, and write one global `site.robots` into every page. With hosts, `canonical` and `thanks_url` become `https://${slug}.sortmycover.co.za/` and `.../thanks/`, and `og:image` and icons stay on the apex (`site_url`, already absolute in the template).
- Add `"host": true` per angle (default false) so a page gets a host deliberately. A small generator (`node landing/gen-hosts.mjs`) reads the angles and writes the `routes`, apex redirects and a DNS checklist; `build-site.mjs` then fails if the committed `vercel.json` differs from the generator output (fail closed, like the existing placeholder and collision checks). Do not try to generate `vercel.json` during the Vercel build: whether Vercel reads it before or after the build step is not confirmed here (UNVERIFIED), so commit generated output.
- Add a build guard that fails if a page with `host: true` is missing `noindex` in `robots`, or if the `canonical` host differs from the host list.
- `landing/vercel.json` has `Cache-Control` rules only for `.html`, `.css|.svg`, `.png` and the manifest. `/assets/page.js?v=...`, `/shared/pixel.js` and `/fonts/*.woff2` therefore fall back to the platform default `public, max-age=0, must-revalidate` (L: that is what static files on the apex return today, with CDN `Age` of 4.7 days and `X-Vercel-Cache: HIT`). Add `max-age=31536000, immutable` for `/assets/` and `/fonts/` (page.js is versioned by `?v=`) and `max-age=3600` for `/shared/`. Browser caches are keyed by full URL, so a visitor who sees two campaign hosts downloads the shared files twice; that is a small cost (page.js 20 KB, pixel.js 5 KB, two fonts about 28 KB per `landing/README.md`).
- The quiz page `/` served through a route does not match the `.html` 600-second rule, so it keeps the default revalidate-every-time behaviour. That is the right default while consent wording and copy are still changing: a deploy reaches visitors on their next load.

### F10. Naming scheme: label equals slug, with hard rules and a reserved list (impact: medium)

Rules: lowercase letters, digits and single hyphens; start with a letter; at most 30 characters (DNS allows 63 octets per label, A, RFC 1035 2.3.4, a 1987 standard that is still current); no underscores; no consecutive hyphens; never reuse or rename a label once an ad has run (Pixel history, saved ads and shared links point at it). To retire a host, 308 it to the matching `/learn/` article or the apex, then remove DNS.

Reserved (do not point at Vercel): `www`, `mail`, `autodiscover` (a live CNAME to Microsoft, L), `hello`, `howzit`, `api`, `n8n`, `app`, `go`, `staging`, `stage`, `preview`, `dev`, `cdn`, `status`, `ftp`, `smtp`, `imap`, `pop`, `webmail`. Create no `staging.` or `preview.` host: it cannot carry real traffic and Vercel will not noindex a custom domain assigned to a preview (F6).

| Ad angle (slug) | Host | Ad hook (from `landing/angles/*.json`) |
|---|---|---|
| new-bond | new-bond.sortmycover.co.za | Bond approved. Champagne open. Cover checked? |
| bond-paperwork | bond-paperwork.sortmycover.co.za | Bond signing day is busy. |
| employer-gap | employer-gap.sortmycover.co.za | Most work life cover stops at 2-4x salary. |
| extended-family | extended-family.sortmycover.co.za | Many families carry more than one household. |
| myth-bust | myth-bust.sortmycover.co.za | No price in this ad. On purpose. |
| new-baby | new-baby.sortmycover.co.za | New baby. New bond. Same old cover? |
| self-employed | self-employed.sortmycover.co.za | No boss. No payslip. No group cover. |
| turned-40 | turned-40.sortmycover.co.za | Cover set up at 28. Life at 40. |
| virtual | virtual.sortmycover.co.za | No sales visit. No jargon. 30 minutes. |
| what-the-call | what-the-call.sortmycover.co.za | Here's exactly what happens on the call. |
| c13-check-not-buy | c13-check-not-buy.sortmycover.co.za | Checking cover is not the same as buying. |

Only create a host when an ad actually points at it (the table is the possible set, not an instruction to create eleven). A host label is visible in the ad's display link and in the browser, so it must never contain a premium, a product name or a comparison; the compliance rule that the site does not quote or recommend products applies to the URL too (the slugs above pass; `myth-bust` and `c13-check-not-buy` are the two worth a compliance glance).

### F11. Host routing cannot be tested on previews; use a pre-DNS Host-header test against production and a fixed checklist (impact: medium)

- Preview URLs are `*.vercel.app` hosts, so `has` rules for `<slug>.sortmycover.co.za` never match them. Standard Protection leaves production domains public and protects everything else (A, deployment-protection 2026-09-15); this project is set to "all except custom domains" (L via connector: `ssoProtection.deploymentType = all_except_custom_domains`). A domain assigned to a Git branch needs a Git link, which `deploy.md` section 3 says is not set up; custom environments are Pro-only (A, add-a-domain-to-environment).
- Baseline observed (L): an unattached host name fails the TLS handshake at `76.76.21.21`, and a request carrying such a `Host:` header on a valid SNI returns `404` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`. Once the domain is attached to the project (before any DNS change) the same Host-header request is expected to reach the deployment; that is how to test routing without exposing anything. Not yet observed (UNVERIFIED) because attaching a domain was out of scope.
- Hazard to avoid: `deploy.md` records that a plain `vercel deploy` on this project once went to production and was live for about 3 minutes. Config changes here go to production; ordering matters (F3) and rollback is `vercel rollback` or deleting the added blocks and redeploying.

Test checklist (run after step 2 of F3, then again after DNS):
```
H=new-bond.sortmycover.co.za
# pre-DNS: route through the apex IP with the campaign Host header
curl -sk --resolve sortmycover.co.za:443:76.76.21.21 -H "Host: $H" -D - https://sortmycover.co.za/ | head -40
#  expect 200, quiz page <title>, exactly ONE content-security-policy (the quiz one), x-robots-tag: noindex
curl -sk --resolve sortmycover.co.za:443:76.76.21.21 -H "Host: $H" -o /dev/null -w "%{http_code}\n" https://sortmycover.co.za/assets/page.js          # 200 (proves only / and /thanks are routed)
curl -sk --resolve sortmycover.co.za:443:76.76.21.21 -H "Host: $H" -o /dev/null -w "%{http_code} %{redirect_url}\n" https://sortmycover.co.za/about.html  # 307 to apex
curl -sI "https://sortmycover.co.za/new-bond/?fbclid=AbC123"            # 307 to https://new-bond.sortmycover.co.za/?fbclid=AbC123
curl -sI https://sortmycover.co.za/ | grep -i "x-robots\|content-security"     # holding CSP, NO x-robots-tag
curl -sI https://www.sortmycover.co.za/learn/                            # still 301 to apex
# post-DNS
curl -s "https://dns.google/resolve?name=$H&type=CNAME"                  # the Vercel target
echo | openssl s_client -connect $H:443 -servername $H 2>/dev/null | openssl x509 -noout -issuer -dates   # Let's Encrypt
```

### F12. Rollout order and what to change in the runbook (impact: low)

1. Confirm plan (F4); export the Hostinger zone; set TTL 300 on the records you will touch.
2. Land repo changes (F9) and the `vercel.json` blocks (below) with no host attached yet; check apex headers did not change.
3. Add one host (start with the page that carries the first ad), run the pre-DNS tests, add the CNAME, wait for certificate, run the post-DNS tests, check Meta Events Manager Test Events from the host.
4. Leave the apex `/<slug>/` path live (no redirect) for the first week so a routing fault cannot strand ads, then add the 307 block, then 308 after about a month.
5. Update `deploy.md`: replace "No go. subdomain" with "campaign hosts are aliases in the same project", add the DNS table and test checklist, and fix section 4's header check (campaign hosts have `x-robots-tag`; the apex does not).
6. Remove `Disallow: /staging/` from `robots.txt` (the folder is never deployed; sibling seo-google F7) when next touching it.

## Example shapes (not applied)

### vercel.json (additions and changes only; two example hosts; existing cache rules unchanged)

Strip nothing: this is plain JSON. `N8N_HOST` is the n8n webhook host. Existing `.com` and `www` redirects stay first and are omitted here.

```json
{
  "redirects": [
    { "source": "/new-bond",  "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "destination": "https://new-bond.sortmycover.co.za/",  "statusCode": 307 },
    { "source": "/new-bond/", "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "destination": "https://new-bond.sortmycover.co.za/",  "statusCode": 307 },
    { "source": "/turned-40",  "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "destination": "https://turned-40.sortmycover.co.za/", "statusCode": 307 },
    { "source": "/turned-40/", "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "destination": "https://turned-40.sortmycover.co.za/", "statusCode": 307 },
    {
      "source": "/((?!assets/|shared/|fonts/|thanks(?:/|$)|robots\\.txt$).+)",
      "has": [{ "type": "host", "value": ".+\\.sortmycover\\.co\\.za" }],
      "destination": "https://sortmycover.co.za/$1",
      "statusCode": 307
    }
  ],
  "routes": [
    { "src": "^/$",         "has": [{ "type": "host", "value": { "eq": "new-bond.sortmycover.co.za" } }],  "dest": "/new-bond/index.html" },
    { "src": "^/thanks/?$", "has": [{ "type": "host", "value": { "eq": "new-bond.sortmycover.co.za" } }],  "dest": "/new-bond/thanks/index.html" },
    { "src": "^/$",         "has": [{ "type": "host", "value": { "eq": "turned-40.sortmycover.co.za" } }], "dest": "/turned-40/index.html" },
    { "src": "^/thanks/?$", "has": [{ "type": "host", "value": { "eq": "turned-40.sortmycover.co.za" } }], "dest": "/turned-40/thanks/index.html" }
  ],
  "headers": [
    { "source": "/",                    "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "headers": [{ "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" }] },
    { "source": "/:page([^/]+\\.html)",  "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "headers": [{ "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" }] },
    { "source": "/learn/:path*",        "has": [{ "type": "host", "value": { "eq": "sortmycover.co.za" } }], "headers": [{ "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" }] },
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": ".+\\.sortmycover\\.co\\.za" }],
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'sha256-G50p3OQJdzmNSHgmrckkRv9E5DVGNkEspwW0gLrWXBE=' https://connect.facebook.net https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.facebook.com; font-src 'self'; connect-src 'self' https://N8N_HOST https://www.facebook.com https://connect.facebook.net; frame-src https://challenges.cloudflare.com; form-action 'self' https://N8N_HOST; base-uri 'none'; frame-ancestors 'none'" }
      ]
    },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/fonts/(.*)",  "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/shared/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600" }] }
  ]
}
```

Notes: the `www`/`.com` redirects must stay above the catch-all (first match wins). The existing `.*\.vercel\.app` noindex rule stays. `routes` entries stop on first match; non-matching requests fall through to files. The catch-all regex and the `eq` host objects are the two pieces not yet observed on this project.

### DNS at Hostinger (DNS Zone Editor)

| Type | Name | Points to | TTL | State |
|---|---|---|---|---|
| A | @ | 76.76.21.21 | 300 | exists, Vercel shows it as valid |
| CNAME | www | sortmycover.co.za | as is | exists |
| MX / TXT / CNAME autodiscover | (Microsoft 365) | unchanged | as is | never touch |
| CNAME | new-bond | `<project-cname>.vercel-dns-017.com.` copied from Settings > Domains for `new-bond.sortmycover.co.za` | 300 | per host, add after step 3 of F3 |
| CNAME | turned-40 | same target as above (it is per project, shown on each host's card) | 300 | per host |
| AAAA, CAA, NS on subdomains, `*` | - | do not add | - | AAAA unsupported by Vercel for external DNS; subdomain NS not allowed by Hostinger; wildcard rejected in F2 |

### hosts source of truth (proposed, in each angle JSON)

```json
{ "slug": "new-bond", "host": true, "robots": "noindex,nofollow" }
```

## Gaps and UNVERIFIED list

1. Vercel plan for team `jonos-projects-8697404e`: not exposed by the connector (F4).
2. The exact `routes` plus `has host` plus `^/$` shape beating `/index.html` on this project; evidence is docs plus a 2 Oct 2026 public repo, not an observation here (F1, F11).
3. Whether `redirects` and `headers` in the same file keep working once `routes` is added (docs say yes; check with the F11 commands).
4. Redirect `source` negative-lookahead syntax and the `eq` host object in `routes` and `headers` (F5, F7).
5. Whether header rules match the incoming path, the final path, or both for routed requests: the 404 observation suggests both (F5).
6. This project's own CNAME target string; the connector does not return it (F3).
7. Whether a Host-header request for an attached but not-yet-resolving domain reaches the deployment (F11).
8. Subdomain takeover handling for orphaned CNAMEs on Vercel (F3).
9. Meta root-domain verification covering subdomains and the Pixel allow list: primary Meta Help pages could not be rendered (F8).
10. Whether `fbevents.js` writes `_fbp` at `sortmycover.co.za` or the host (sibling meta-pixel-capi F7; not re-tested).
11. Whether Hostinger accepts `*` in the CNAME Name field and its minimum TTL; both undocumented in the pages read (not needed for the recommended design).
12. Meta ad display-link rules when the destination host differs from the typed display domain.
13. Adjacent, not in this lens: no DMARC or DKIM record at the names checked (`_dmarc`, `selector1._domainkey`, `selector2._domainkey`, `default._domainkey` all empty on 10 Oct 2026), which matters once any host or mailbox sends mail.

## Source list (fetched 2026-10-10 unless stated)

Vercel (last updated per page):
- Add a domain, wildcard, subdomain CNAME, Hobby cap 50 (2026-09-16): https://vercel.com/docs/domains/working-with-domains/add-a-domain
- SSL certificates, HTTP-01 vs DNS-01, renewal (2026-09-16): https://vercel.com/docs/domains/working-with-ssl
- Troubleshooting domains, CAA, wildcard nameservers, AAAA, ownership (2026-09-18): https://vercel.com/docs/domains/troubleshooting
- vercel.json reference, rewrites/routes/headers/redirects (2026-08-14): https://vercel.com/docs/project-configuration/vercel-json
- Rewrites (2026-08-11): https://vercel.com/docs/routing/rewrites
- Redirects, configuration (2026-08-11): https://vercel.com/docs/routing/redirects/configuration-redirects
- Routing overview and order (2026-08-11): https://vercel.com/docs/routing
- Project-level routing rules (2026-08-11): https://vercel.com/docs/routing/project-routing-rules
- Routing Middleware (2026-08-14): https://vercel.com/docs/routing-middleware
- Build Output API configuration, `HasField` host type (2026-07-27): https://vercel.com/docs/build-output-api/configuration
- Limits, domains per project, routes per deployment (2026-09-16): https://vercel.com/docs/limits
- Fair use guidelines, commercial usage (2026-09-14): https://vercel.com/docs/limits/fair-use-guidelines
- Pro plan (2026-09-15): https://vercel.com/docs/plans/pro-plan
- Deployment Protection (2026-09-15): https://vercel.com/docs/deployment-protection
- Assigning a domain to an environment (2026-08-11): https://vercel.com/docs/domains/working-with-domains/add-a-domain-to-environment
- KB, A records, project CNAME, CAA (2026-07-28): https://vercel.com/kb/guide/a-record-and-caa-with-vercel
- KB, preview deployments and indexing (2026-10-02): https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines
- GitHub discussion, static files take precedence over rewrites (answer 2021-01-22, STALE-RISK): https://github.com/vercel/vercel/discussions/5723
- Public repo fix, host routes instead of rewrites (2026-10-02): https://github.com/ozone503-maker/outlet-mall/pull/14
- Connector reads (2026-10-10): project `sortmycover` prj_6plQLodGbK3h7etUA5MAS1kQZSRY domains and protection settings, team list.

Hostinger:
- Manage DNS records, no NS on subdomains (2026-09-15): https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/
- CNAME records, default TTL 14400 (2026-07-24): https://www.hostinger.com/support/4738777-how-to-manage-cname-records-on-hpanel
- Supported record types (2026-08-03): https://www.hostinger.com/support/1583250-what-dns-record-types-are-supported-at-hostinger
- Create subdomains, needs hosting plan (2026-09-15): https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hostinger/

Search and standards:
- Google, crawling and indexing FAQ, subfolders vs subdomains (sibling dates revision 2025-12-10): https://developers.google.com/search/help/crawling-index-faq
- Google, consolidate duplicate URLs (2026-07-10): https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google, canonicalization troubleshooting (2026-08-21): https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting
- Google, block indexing / noindex (2025-12-10): https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Google, robots.txt (2026-08-31): https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- Search Console Domain property (undated): https://support.google.com/webmasters/answer/9008080
- Sitemaps protocol (undated): https://www.sitemaps.org/protocol.html
- Let's Encrypt rate limits (2026-08-05): https://letsencrypt.org/docs/rate-limits/
- Public Suffix List (version 2026-10-07): https://publicsuffix.org/list/public_suffix_list.dat
- MDN Set-Cookie, Domain attribute (undated): https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- RFC 1035 (1987, STALE-RISK but current standard): https://www.rfc-editor.org/rfc/rfc1035.txt

Meta and Cloudflare:
- Meta fbp/fbc format and subdomain index (undated): https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
- Meta web crawlers, robots.txt behaviour (undated): https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/
- Domain verification at the root, subdomains (secondary, 2026-10-09): https://adwize.ai/blog/meta-domain-verification
- Pixel traffic permissions (secondary, updated 2025-03-01): https://www.jonloomer.com/pixel-traffic-permissions-block-and-allow-lists/
- Cloudflare Turnstile hostname management (undated): https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/

Live observations (10 Oct 2026, this machine): dns.google queries for A/NS/CAA/MX/TXT/AAAA/CNAME on `sortmycover.co.za` and listed names; `curl -I` on `https://sortmycover.co.za/`, `/new-bond/`, `https://sortmycover.vercel.app/`, `https://www.sortmycover.co.za/learn/?fbclid=...`, and the unattached-host probes at 76.76.21.21.
