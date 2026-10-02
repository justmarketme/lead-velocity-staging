# Deploy runbook: GATE-DOMAINS and GATE-DNS day

Owner: devops-security with Jonathan (human gates). Nothing here is done yet.

## 0. Pre-flight (before upload)
- [ ] `grep -rn "{{" landing/holding --include=*.html` and fill every placeholder: `{{CIPC_REG_NO}}`, `{{ADDRESS_STREET}}`, `{{ADDRESS_CITY}}`, `{{ADDRESS_POSTCODE}}`, `leadvelocity.co.za`, `{{META_DOMAIN_VERIFICATION}}` (copy from Meta Business Settings > Brand Safety > Domains). Also the Organization JSON-LD in index.html.
- [ ] Add real `icon-192.png`, `icon-512.png`, `og-image.png` (1200x630), `apple-touch-icon.png`, `favicon.ico` from visual-producer. Until then these paths 404.
- [ ] compliance-qa signed off the copy; contracts-drafter privacy text pasted into privacy.html, then add privacy.html back to sitemap.xml and remove its `noindex`.
- [ ] Do not upload `staging/` or `deploy.md` / `README.md` (not needed on the server).

## 1. Domains (GATE-DOMAINS, Jonathan, ~R250 total)
Register sortmycover.co.za and sortmycover.com (plus coverklaar.co.za/.com) at GoDaddy.

## 2. Hostinger site
1. hPanel > Websites > Add website > Empty website > domain `sortmycover.co.za`.
2. Add `sortmycover.com` as a parked/alias domain on the same site so the `.htaccess` 301 can run (or set a Hostinger domain redirect to https://sortmycover.co.za if alias is unavailable).
3. Staging: separate site for `sortmycover.leadvelocity.co.za` with password protection (see `staging/.htpasswd-README.md`). Deploy here first and check.

## 3. DNS at GoDaddy (GATE-DNS)
Take the exact values from hPanel > Domains > DNS / Hostinger "Connect domain" screen. Do not guess IPs.
| Host | Type | Value |
|---|---|---|
| @ | A | Hostinger server IP shown in hPanel |
| www | CNAME | the Hostinger target shown, or `sortmycover.co.za` |
Repeat for sortmycover.com (A at @, CNAME www). Remove GoDaddy parking A/CNAME records first. Alternative: switch to Hostinger nameservers (then manage records in hPanel).
For leadvelocity.co.za: add CNAME/A for `sortmycover` to the staging site.

## 4. Upload
hPanel > File Manager > `domains/sortmycover.co.za/public_html/`: upload `learn/` (folder, 6 files) plus `index.html about.html how-we-make-money.html privacy.html complaints.html 404.html styles.css favicon.svg manifest.webmanifest robots.txt sitemap.xml .htaccess` plus the PNG/ICO icons. Show hidden files to confirm `.htaccess` landed.

## 5. SSL
hPanel > Security > SSL > install the free SSL for both domains (and www). Wait for "Active", then confirm the `.htaccess` HTTPS redirect.

## 6. Verify (0.3 #6: before any publish)
- DNS: open `https://dns.google/resolve?name=sortmycover.co.za&type=A` and the same for `www` and `sortmycover.com`. Answers must match the Hostinger IP. Propagation can take hours.
- `curl -sI http://sortmycover.co.za/about.html` gives 301 to `https://sortmycover.co.za/about.html`.
- `curl -sI https://www.sortmycover.co.za/` gives 301 to the apex.
- `curl -sI https://sortmycover.com/about.html` gives 301 to `https://sortmycover.co.za/about.html`.
- Headers present: HSTS, nosniff, CSP, Referrer-Policy. No `X-Robots-Tag` on production.
- Staging: `X-Robots-Tag: noindex` and 401 without credentials.
- Rich Results Test and Schema Markup Validator on index.html (Organization, FAQPage). Lighthouse mobile: Performance, SEO, Accessibility all 95+.
- Share the URL into WhatsApp and check the link card (needs og-image.png).

## 7. Google Search Console
- [ ] Add property `sortmycover.co.za` as a Domain property, verify with the DNS TXT record at GoDaddy.
- [ ] Submit `https://sortmycover.co.za/sitemap.xml`; use URL Inspection > Request indexing for `/` and `/about.html`.
- [ ] Note the baseline for brand-query CTR (for the exact-match domain test).

## 8. Google Business Profile
- [ ] Claim "SortMyCover" (service-area business unless a public address exists). Name, address and phone must match the site footer exactly (NAP). No keyword stuffing in the name.
- [ ] Category: pick the closest non-insurer category. Needs_human: category choice with compliance, since "insurance agency" may imply a licensed firm.
- [ ] Website = `https://sortmycover.co.za/`; logo 720x720 and cover 1024x576 from visual-producer.
- [ ] Complete video/postcard verification. Record the outcome in build/tasks.json via the orchestrator.

## 9. Meta domain verification
`<meta name="facebook-domain-verification" content="{{META_DOMAIN_VERIFICATION}}">` is already in the head of every page. Paste the real token, upload, then click Verify in Business Settings > Brand Safety > Domains. Verify `sortmycover.co.za` only (not the staging host).

## 10. Social profiles (for SERP and sameAs)
Create @sortmycover on Facebook and Instagram, then add the URLs to `sameAs` in the Organization JSON-LD.
