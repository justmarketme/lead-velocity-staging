# SortMyCover landing pages (4.5)

Static HTML, one template + one JSON per angle, vanilla JS, no framework, no runtime dependencies. Built from the approved reference
(`landing/reference/sortmycover-landing.html`): same hero, gap bars, 5-tap quiz, 3-field form, in-page slot picker, done / not-a-fit states, how-it-works, FAQ, footer, sticky CTA.
Every deliberate difference from the reference is in `RECONCILE.md`.

## Structure
```
landing/
  template/index.html   markup with {{slots}} ({{x}} escaped, {{{x}}} raw)
  template/page.css     reference styles, tokens via brand/tokens.css (--sm-*), a11y fixes
  template/page.js      quiz -> /lead -> /slots -> /book -> thank-you; Pixel calls; honeypot; Turnstile slot
  config/site.json      env, API base, pixel id, domain verification, consent_mode + practice_name + fsp_number, URLs
  config/consent.json   consent lines, verbatim from deliverables/contracts-drafter/consent-and-privacy.md (named | generic + ads sentence)
  config/faq.json       FAQ ids + fallback text; entries with `source` (how-long, cost) are pulled from knowledge/faq.md (FAQ-01; FAQ-02 + FAQ-09), the rest need page-level wording (the corpus has unresolved {adviser} placeholders)
  config/strings.json   all JS-side messages (the Afrikaans variant overrides this file + template copy)
  angles/*.json         7 angles: slug, ad_hook, h1, sub, chips, gap_p, faq_overrides, og_*, proof[]
  build.mjs             renders landing/dist/{slug}/index.html (+ thanks/, assets/page.js, shared/pixel.js, fonts/) and runs the page checks
  tests/                quiz.spec.ts, lcp-check.mjs, reading_level.py, contrast.py, a11y.md, test-log.md
  lighthouse.sh         official mobile Lighthouse run (laptop/CI)
  RECONCILE.md          reference vs spec decisions
```

## Build, test
```
node landing/build.mjs                      # fails (exit 1) on: H1 > 12 words, > 110 words before the first tap, banned wording, "!" anywhere,
                                            #   consent line not verbatim, production with empty pixel/api/practice/FSP
node --test landing/tests/quiz.spec.ts      # Playwright (preinstalled Chromium), mocked /lead /slots /book, 9 tests
node landing/tests/lcp-check.mjs            # indicative LCP/CLS under emulated 4G + 4x CPU
python3 landing/tests/reading_level.py landing/dist/employer-gap/index.html
python3 landing/tests/contrast.py
landing/lighthouse.sh employer-gap          # official: performance >= 90, LCP < 2.5 s, CLS < 0.1, a11y >= 95 (needs network once)
```
Lighthouse was not run in the build sandbox (offline, package not installed). `lcp-check.mjs` is the stand-in: median LCP 436 ms, CLS 0.014 on emulated 4G (1.6 Mbps, 150 ms RTT) with 4x CPU slowdown, local server, gzip.
Page weight (employer-gap): HTML 39 KB (9.9 KB gzip, CSS + tokens inlined, no render-blocking CSS), page.js 20 KB, pixel.js 5 KB, DM Sans 500 + 800 woff2 14 KB each (`font-display: swap`, 800 preloaded). No images at all, so LCP is the H1 text.

### Reading level
Flesch-Kincaid grade, `tests/reading_level.py`, employer-gap: all visible copy 3.3, excluding the verbatim legal lines 2.8, prose blocks of 8+ words only (the stricter view) 3.9. All seven pages 3.9 to 4.2 on the strict view. Limit is Grade 7: pass.
(A heuristic syllable counter; treat it as +/- 1 grade.)

## Add an angle
1. Copy `angles/employer-gap.json` to `angles/<slug>.json`; set `slug` (becomes the URL `/<slug>/` and the Pixel `content_name`), `ad_hook` (the ad's hook verbatim), `h1` (`*word*` = amber emphasis, `\n` = line break), `sub`, `title`, `og_title`, `og_description`.
2. Optional: `chips` (exactly 3, `**bold**` supported), `gap_h2` / `gap_p`, `faq_overrides` (`{ "cost": {"q": "...", "a": "..."} }` keyed by FAQ id), `lang` (`af` for CoverKlaar later), `proof` (see below).
3. `node landing/build.mjs`. The build refuses H1 > 12 words and more than 110 words before the first tap, and warns when `h1` differs from `ad_hook` (message match).
4. Social proof: leave `proof: []` until real, consented quotes exist. Add `{ "quote": "...", "first_name": "Lerato", "city": "Pretoria" }`; with an empty array no markup is rendered.

## Consent mode (one flag)
`config/site.json` -> `consent_mode`: `named` (live default while one broker) renders `{practice_name} (FSP {fsp_number})` from the brokers row; `generic` renders the broker-neutral line. The ads sentence is inside the same tick in both modes.
The label text, version id (`CONSENT-NAMED-v3+CONSENT-ADS-v1`) and mode are posted with every lead so the exact wording shown is stored. In `env: production` the build fails if named mode has no practice or FSP (fail closed). In staging it shows `[PRACTICE NAME] (FSP [FSP NUMBER])` and sets noindex.

## API contract expected from n8n (`api_base` = the n8n webhook base, no trailing slash)
All JSON, CORS allowed for the page origin. The quiz itself sends nothing; out-of-band people never reach the API.

**`POST {api_base}/lead`** (W01). Same field names for the no-JS form post (`application/x-www-form-urlencoded`, `consent=yes`, no `context`, mobile unnormalised: W01 normalises and applies Twilio Lookup):
```
{ first_name, mobile (E.164 +27...), consent: true, consent_text, consent_version, consent_mode,
  age_band: "<35"|"35-44"|"45-50"|"51+", bond: "yes"|"soon"|"no", dependants: "kids"|"extended"|"partner"|"none",
  work_cover: "yes"|"unsure"|"no", budget_band: "<500"|"500-750"|"750-1250"|"1250+",
  angle, lang, page_url (origin+path), company_website (honeypot, must be ""), turnstile_token,
  context: { event_id, event_name:"Lead", fbp, fbc, utm:{...}, fbclid, page_url, user_agent, ts } }
-> 200 { ok:true, lead_id, broker_id, methods_supported:["teams","zoom","google_meet","whatsapp_call","phone"], duplicate?:bool, out_of_band?:bool }
-> 422 { error:"invalid_mobile" | "out_of_band" | "consent_required" }   -> 429 rate limit
```
W01 re-validates bands server-side and deletes out-of-band submissions within 24 h. For the no-JS post, respond `303` to `{page_base_url}/{angle}/thanks/` built from the validated `angle` (never from a posted URL). The routed broker is decided here (1.3) and returned as `broker_id` + `methods_supported`; the page shows only those methods. No `broker_id` returned = no booking step, page shows the not-booked thank-you.

**`GET {api_base}/slots?broker={broker_id}&lead_id={lead_id}&days=5`** (W04) -> `{ slots:[{ start:"2026-10-07T10:00:00+02:00" }, ...], tz:"Africa/Johannesburg" }` (strings also accepted). Earliest first, already spread across days, broker hours/buffers/notice/caps applied. The page shows the first 5 dates, up to 6 times each, in SAST (it reads the date and time straight from the +02:00 string). Empty list or error = not-booked thank-you (lead kept; the intro-slots WhatsApp covers booking).

**`POST {api_base}/book`** (W05):
```
{ lead_id, broker_id, slot_start, method, angle, email?  (ONLY when method is teams|zoom|google_meet), context:{ event_id, event_name:"Schedule", ... } }
-> 200 { booked:true, start, method, ics_url? }      (page builds its own .ics blob when ics_url is absent)
-> 409 { error:"slot_taken", slots:[{start}, ...] }   (page shows the next 3)
-> 422 { error:"invalid_email" }
```
W05 re-checks free/busy before inserting, does the MX / disposable check on the email, and sends the invite from howzit@. Email is stored with purpose `meeting_invite` only.

**Pixel/CAPI per `shared/pixel.README.md`:** PageView on load; `ViewContent {content_name:'quiz_start'}` once on the first CTA tap or first quiz answer; `Lead {content_name: angle}` at details submit (its `context` is posted to `/lead`); `Schedule` at `/book` (its `context` posted to `/book`, own `event_id`). The skip link fires nothing (no `Contact`: it stays on the page). n8n reuses `context.event_id` for CAPI dedupe. Name, phone and email never go to the Pixel (asserted in the test).

**Bot protection (6B.5):** honeypot `company_website` (filled = page pretends success and sends nothing; W01 also drops it), Turnstile-class slot `#turnstile-slot` (inert until `turnstile_sitekey` is set; then loaded lazily on the first quiz tap, invisible mode, token sent as `turnstile_token`), and per-IP / per-number rate limits on `/lead` and `/book` enforced server-side (n8n/Traefik). See needs_human about request signing.

## Deploy (Hostinger, static)
`landing/dist/` is the whole site payload: `/{slug}/index.html`, `/{slug}/thanks/index.html`, `/assets/page.js`, `/shared/pixel.js`, `/fonts/*.woff2`. Paths are root-relative, so serve `dist/` at the host root.
- Option A, `go.sortmycover.co.za` (recommended while the holding page owns the apex): upload `dist/*` to that subdomain's document root; set `site.json` `page_base_url` to `https://go.sortmycover.co.za`.
- Option B, `sortmycover.co.za/{slug}`: upload `dist/*` beside the holding files (no filename clashes: holding has no `/assets`, `/shared`, `/fonts` of its own).
- **GATE-DOMAINS is pending**, so nothing is published. Staging copy: the password-protected `sortmycover.leadvelocity.co.za` (never shown to consumers or Meta). Before go-live: set `env: "production"`, `pixel_id`, `domain_verification`, `api_base`, `practice_name`, `fsp_number`, `robots` (decide index vs noindex with search-findability-lead), rebuild, upload, then verify with `lighthouse.sh https://...`.
- `.htaccess` suggestion (not deployed): gzip/brotli for html/js/css, `Cache-Control: public, max-age=31536000, immutable` for `/fonts/` and `/assets/` (page.js is versioned with `?v=`), `no-cache` for html, and
  `Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-G50p3OQJdzmNSHgmrckkRv9E5DVGNkEspwW0gLrWXBE=' https://connect.facebook.net https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.facebook.com; font-src 'self'; connect-src 'self' https://<n8n-host> https://www.facebook.com https://connect.facebook.net; frame-src https://challenges.cloudflare.com; form-action 'self' https://<n8n-host>; base-uri 'none'; frame-ancestors 'none'`
  plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. The sha256 is the one-line `js` class script; change it if that line changes.
