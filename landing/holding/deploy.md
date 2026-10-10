# Deploy runbook: sortmycover.co.za on Vercel

Owner: devops-security with Jonathan (human gates).
**Decision (Jonathan, 5 Oct 2026):** sortmycover.co.za is hosted on **Vercel**, not Hostinger web hosting. Hostinger keeps the domain registration and DNS, and later the VPS (n8n + Postgres, W26).

## Shape
One Vercel project, `sortmycover` (team jonos-projects-8697404e), serves the whole site from one origin:
- `/`, `/about.html`, `/privacy.html`, `/learn/…` and icons come from `landing/holding/` (the holding site owns the apex).
- `/{slug}/` quiz pages and `/{slug}/thanks/` come from `landing/dist/` (`node landing/build.mjs`).
- `landing/build-site.mjs` builds dist, then merges both into `landing/site/`. It fails if a file name collides and warns if any `{{PLACEHOLDER}}` is left in the HTML.
- **Project settings:** Root Directory `landing`, so `landing/vercel.json` applies and the repo-root `vercel.json` (the CRM app's catch-all SPA rewrite) does not. "Include files outside the Root Directory" must stay ON, because build.mjs reads `brand/` and `knowledge/`. Install command `echo no-install`, build command `node build-site.mjs`, output `site`, framework none. All of these are also set in `landing/vercel.json`.
- No go. subdomain and no second project. Quiz pages live at `/{slug}/` on the apex.

`landing/vercel.json` replaces the old `.htaccess` (which only works on Apache/LiteSpeed):
| .htaccess rule | Vercel |
|---|---|
| HTTP to HTTPS | automatic on Vercel |
| www to apex | domain redirect in project settings, plus a host redirect in vercel.json |
| sortmycover.com to .co.za, path preserved, 301 | host redirect in vercel.json (once .com is bought and attached) |
| 404 page | `404.html` at the output root (Vercel uses it automatically) |
| `staging/` never served | not copied into `site/` |
| HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy | `headers` on `/(.*)` |
| Strict CSP | holding pages only (`/`, `/*.html`, `/learn/*`). Quiz pages get no CSP yet because the Meta Pixel and the n8n form endpoint need their own. compliance-qa and devops-security add a quiz CSP with `connect-src` for N8N_PUBLIC_URL and the Meta domains |
| Staging noindex | `X-Robots-Tag: noindex` on `*.vercel.app` hosts. Preview deployments are also behind Vercel login (SSO protection), which replaces the old basic-auth staging host |
| Expires / cache rules | `Cache-Control` headers per file type |

## Holding-only deploy (used 5 Oct 2026, 23:10 SAST, before the quiz pages and n8n were ready)
```
node landing/prepare-holding-deploy.mjs <deploy-dir>      # copies landing/holding (no staging/, deploy.md, README.md), writes vercel.json, fails on {{placeholders}}, forms, or "Lead Velocity" outside privacy/terms
cd <deploy-dir> && vercel link --yes --project sortmycover --scope jonos-projects-8697404e
vercel deploy --prod --yes --scope jonos-projects-8697404e
```
Files land in `<deploy-dir>/landing/` because the project's Root Directory is `landing`. Redirects use `/(.*)` and `$1` with `statusCode: 301`: the `/:path*` form does not match `/` or `/learn/` on Vercel (www stayed 200 until fixed). Do not set `trailingSlash: false` (canonical URLs are `/learn/`).
The one place to change when the WhatsApp number is ready: the `href` on `#book-link` in `landing/holding/book.html` (comment in the file). Every call-to-action on the site points to `/book.html`.

## 0. Pre-flight (before the first production deploy)
- [x] `2025/637858/07` (CIPC) filled in.
- [x] Information Officer: Jonathan West (privacy.html, terms.html).
- [x] privacy.html processor table: Vercel row added (US, global network). Hostinger row now says booking and messaging systems. **compliance-qa to re-check** the cross-border wording (POPIA s72) for Vercel.
- [ ] `{{hostinger_region}}` (privacy.html): fill when the VPS region is chosen (W26).
- [ ] `{{ADDRESS_*}}` and `{{META_DOMAIN_VERIFICATION}}` (Meta Business Settings > Brand Safety > Domains).
- [ ] Quiz pages show `[PRACTICE NAME]` and `[FSP NUMBER]` in the named-broker consent and intro text. Fill them from the broker config once Mark confirms how he is licensed (FSP 28418 is Oracle Brokers' licence; is he a representative under it?).
- [ ] Real icons and og-image (1200x630) from visual-producer.
- [ ] compliance-qa signed off the copy; then put privacy.html back in sitemap.xml and remove its `noindex`.

Check: `node landing/build-site.mjs` prints no placeholder warning, and `grep -rn "\[FSP NUMBER\]\|{{" landing/site --include=*.html` returns nothing.

## 1. Domains
- [x] `sortmycover.co.za` bought at Hostinger (5 Oct).
- [ ] `sortmycover.com` and coverklaar: not bought yet. When bought, attach both to the `sortmycover` Vercel project as redirects to the apex.

## 2. DNS (Hostinger nameservers byte/pixel.dns-parking.com)
- [x] `A @ 76.76.21.21` (TTL 300) and `CNAME www sortmycover.co.za`. Confirmed at both nameservers on 5 Oct; the .co.za registry had not published the delegation at ~16:10 SAST (allow up to 24 h).
- [x] Both hostnames attached to the Vercel project. In Vercel, set `www.sortmycover.co.za` to redirect (308) to the apex.

## 3. Git link (Jonathan)
- [ ] Give the Vercel GitHub app access to `justmarketme/lead-velocity-staging`. This needs GitHub sudo approval on Jonathan's phone. After that, pushes deploy automatically: the production branch deploys to sortmycover.co.za and other branches to preview URLs.
- Until then, deploy with the CLI from a checkout at the repo root: `npx vercel link --project sortmycover --scope jonos-projects-8697404e`.
- **Warning:** on this project, a plain `vercel deploy` (no `--prod`) went to **production** and was aliased to sortmycover.co.za. That happened on 5 Oct, because the project has no Git link and no earlier deployment. The holding site was public for about 3 minutes before it was removed. **Don't CLI-deploy until pre-flight passes.** To check the build safely, run `npx vercel pull --yes` and then `npx vercel build`; nothing is uploaded. Project settings (Root Directory `landing`, outside files ON, no build/output overrides) were applied on 5 Oct, and `vercel build` passes on 8950e24.

## 3a. Leaked-file guard
The CLI uploads the working tree. The repo-root `.vercelignore` keeps `.env*`, keys, `deliverables/billing/` and `*.docx`/`*.pdf` out of the upload. Never deploy from a checkout whose `.env` holds secrets without that file present.

## 4. Verify (0.3 #6: before any publish)
- `https://dns.google/resolve?name=sortmycover.co.za&type=A` returns 76.76.21.21; `www` resolves via the CNAME.
- `curl -sI http://sortmycover.co.za/about.html` gives 308 to https.
- `curl -sI https://www.sortmycover.co.za/` gives a redirect to the apex.
- `curl -sI https://sortmycover.co.za/` shows HSTS, nosniff, CSP and Referrer-Policy, and no `X-Robots-Tag`.
- `curl -sI https://sortmycover.co.za/staging/` gives 404.
- One quiz page, e.g. `/new-bond/`, loads and its form posts to N8N_PUBLIC_URL (check the browser console for CSP or CORS errors).
- Rich Results Test on index.html (Organization, FAQPage). Lighthouse mobile 95+ on Performance, SEO and Accessibility.
- Share the URL in WhatsApp and check the link card.

## 5. Google Search Console
- [ ] Domain property `sortmycover.co.za`, verified with a DNS TXT record in Hostinger DNS.
- [ ] Submit `https://sortmycover.co.za/sitemap.xml`; request indexing for `/` and `/about.html`.

## 6. Google Business Profile
- [ ] Claim "SortMyCover" as a service-area business. NAP must match the site footer exactly. Category needs a compliance check: "insurance agency" may imply a licensed firm.

## 7. Meta domain verification
`<meta name="facebook-domain-verification" content="{{META_DOMAIN_VERIFICATION}}">` is in every page head. Paste the token, deploy, then click Verify in Business Settings > Brand Safety > Domains (sortmycover.co.za only).

## 8. Social profiles
Create @sortmycover on Facebook and Instagram, then add the URLs to `sameAs` in the Organization JSON-LD.
