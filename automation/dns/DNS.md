# DNS.md: GoDaddy record plan for GATE-DNS, plus DKIM/DMARC for leadvelocity.co.za

**Facts this acts on (6.7, verified 1 Oct 2026):**
- `leadvelocity.co.za` nameservers are GoDaddy (`ns55/ns56.domaincontrol.com`), so its records are edited in **GoDaddy**.
- The apex has a single A record, `216.198.79.1`. Do not touch it; NH-12: the live LV site may be the Vercel app.
- MX goes to Microsoft 365.
- Hosting is Hostinger (static) plus the VPS after W26.

**HUMAN GATE:** DNS edits are account-level actions (2.2, 6.7). The Chrome agent prepares and checks, and Jonathan or KG saves in GoDaddy.
**Rule (0.3 #6):** every record is verified with `dns.google` before anything is published that depends on it (§5).
Values in `<ANGLE_BRACKETS>` are placeholders. Copy the exact value from the named screen; never guess an IP.
Use TTL **600 s** for everything that may change at W26, and **3600 s** for stable records.

## 1. Which scenario applies (GATE-DOMAINS, gates-batch.md)

| | **A. Own domain now** (`GATE-DOMAINS go`) | **B. Deferred** (`GATE-DOMAINS defer`, relayed, not yet confirmed) |
|---|---|---|
| Consumer site | `sortmycover.co.za` (+ `.com` 301) on Hostinger from day 1 | staging only, on `sortmycover.leadvelocity.co.za` (password + noindex) |
| Staging | `sortmycover.leadvelocity.co.za` (password + noindex) | same |
| Meta domain verification, Pixel/CAPI binding, first ad impression | on `sortmycover.co.za` | **blocked** until the cutover (0.1: the subdomain is never shown to consumers or Meta). The cutover = scenario A's §2 records, done as a pre-go-live gate |
| Cost | ~R250 (the one allowed pre-payment spend, 0.1) | R0 now, ~R250 at cutover |

Both scenarios need §3 (leadvelocity.co.za subdomains) and §4 (DKIM/DMARC) **now**.

## 2. `sortmycover.co.za` / `sortmycover.com` (scenario A, or B at cutover)
Records live wherever the domains are registered. If that is GoDaddy, edit them there. If they are registered elsewhere, use that registrar's DNS, or switch the domain's nameservers to Hostinger and manage the records in hPanel (landing/holding/deploy.md §3). First delete any parking A/CNAME records.

| Host | Type | Value | TTL | When |
|---|---|---|---|---|
| `@` (sortmycover.co.za) | A | `<HOSTINGER_WEB_IP>` (hPanel → Websites → sortmycover.co.za → DNS / "Connect domain") | 3600 | GATE-DNS |
| `www` | CNAME | `<HOSTINGER_CNAME_TARGET>` as shown, or `sortmycover.co.za` | 3600 | GATE-DNS |
| `@` (sortmycover.com) | A | `<HOSTINGER_WEB_IP>`. The site there is a 301-to-`.co.za` `.htaccess` | 3600 | GATE-DNS |
| `www` (sortmycover.com) | CNAME | `sortmycover.com` | 3600 | GATE-DNS |
| `link` (sortmycover.co.za) | A | `<VPS_IP>`, the consumer `/c/` (.ics) and `/j/` (join) links, routed by Traefik (`LINK_HOST`) | 600 | **W26 step 8 only** |
| `@` | TXT | `google-site-verification=<TOKEN>` (Search Console, deploy.md) | 3600 | when search-findability asks |
| `_dmarc` | TXT | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` (**this domain sends no mail**; this stops spoofing of the consumer brand) | 3600 | GATE-DNS |
| `@` | TXT | `v=spf1 -all` (no mail sent from this domain) | 3600 | GATE-DNS |

On `sortmycover.co.za` (Hostinger `.htaccess`), `/c/*` and `/j/*` are 302-redirected to `https://link.sortmycover.co.za/c/*` and `/j/*`, so consumers only ever see the SortMyCover brand (templates/README.md asks devops-security to route `/c/` and `/j/`). Until W26 these paths are served by the local n8n tunnel for staging tests only.

## 3. `leadvelocity.co.za` subdomains (GoDaddy, both scenarios)

| Host | Type | Value | TTL | When / note |
|---|---|---|---|---|
| `sortmycover` | CNAME *or* A | `<HOSTINGER_CNAME_TARGET>` / `<HOSTINGER_WEB_IP>` for the **staging** site | 3600 | GATE-DNS now. On Hostinger: HTTP basic auth (`.htaccess` `AuthType Basic` + `.htpasswd` *outside* `public_html`, see `landing/holding/staging/.htpasswd-README.md`) and `Header set X-Robots-Tag "noindex, nofollow"`. Never verified with Meta or Search Console |
| `go` | CNAME *or* A | Hostinger target for the landing pages | 3600 | GATE-DNS now (Section 7: landing pages live on `go.leadvelocity.co.za`) |
| `app` | CNAME | **Vercel** `cname.vercel-dns.com` (NH-12 recommendation: keep the CRM on Vercel), **or** the Hostinger target if NH-12 goes the other way | 3600 | GATE-DNS now. Add the domain in the Vercel project first; Vercel shows the exact target |
| `media` | CNAME *or* A | Hostinger target for a static media site | 3600 | **Only if NH-12 puts `app.` on Vercel** (static-hosting.md §5). Otherwise the explainer and clips live at `app.leadvelocity.co.za/media/` and no record is needed |
| `api` | A | `<VPS_IP>` | 600 | **Only at W26 step 8**, once the VPS has an IP (6.6). Before then, webhooks use the tunnel URL |
| `n8n` | A | `<VPS_IP>` (editor, Traefik IP allowlist) | 600 | W26 step 8 |
| `@`, `www`, MX, existing TXT | — | **unchanged** | — | Don't touch the live site or mail (NH-12) |

**Static paths (no new records; static-hosting.md):** the portal site at `app.` also serves `/media/explainer/en/…`, `/media/clips/en/…`, `/portal/intro-media/` and `/checkout/`. Landing `dist/` is served on `sortmycover.leadvelocity.co.za` (staging, basic auth), `go.` and later `sortmycover.co.za`. None of these move to the VPS at W26. Only `api`, `n8n` and `link` point at `<VPS_IP>`. Verify each before publishing: `https://dns.google/resolve?name=app.leadvelocity.co.za&type=CNAME` (or `A`), then an HTTPS GET of `/media/explainer/en/explainer.vtt` and `/checkout/` that returns 200.

`gates-batch.md` (GATE-DNS row) mentions `staging.sortmycover.leadvelocity.co.za`, but 0.1 names `sortmycover.leadvelocity.co.za` as staging. I use the 0.1 name, since 0.1 wins.

## 4. Email authentication for `leadvelocity.co.za` on Microsoft 365 (6B.6, Phase 0)
howzit@ sends Teams invites, invoices, reports and magic links (6.7). Without DKIM and DMARC they land in spam ("the invite never arrived").

**4.1 SPF (exists already; verify only).** Expected TXT at `@`: `v=spf1 include:spf.protection.outlook.com -all` (or `~all`). There must be **exactly one** `v=spf1` record. If the legacy CRM sends through Resend (NH-13) using a `@leadvelocity.co.za` From address, Resend's own include/return-path record must also be present. See 4.4.

**4.2 DKIM: two CNAMEs, then enable signing.**
In the Microsoft Defender portal → Email & collaboration → Policies → Email authentication settings → **DKIM** → `leadvelocity.co.za`, copy the two values exactly as shown:

| Host (GoDaddy "Name") | Type | Value (from the Defender DKIM page) | TTL |
|---|---|---|---|
| `selector1._domainkey` | CNAME | `<SELECTOR1_TARGET>`, shaped like `selector1-leadvelocity-co-za._domainkey.<tenant>.onmicrosoft.com` (older tenants) or `selector1-leadvelocity-co-za._domainkey.<tenant>.<x>.dkim.mail.microsoft` (newer format). **Use what the portal shows** | 3600 |
| `selector2._domainkey` | CNAME | `<SELECTOR2_TARGET>` (same pattern, `selector2-…`) | 3600 |

After both resolve (§5), switch **"Sign messages for this domain with DKIM signatures"** to *Enabled* in the same screen.

**4.3 DMARC: start at quarantine, report, then move to reject.**

| Host | Type | Value | TTL |
|---|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=100; rua=mailto:<DMARC_RUA_MAILBOX>; adkim=r; aspf=r; fo=1` | 3600 |

- `<DMARC_RUA_MAILBOX>` defaults to `dmarc@leadvelocity.co.za`, a shared mailbox or alias on M365 (free with the existing tenant), so aggregate reports don't flood howzit@.
- **Move to `p=reject`** after 30 days of reports showing only aligned sources (6B.6 "p=quarantine → reject"). That is a one-record edit, logged in the console.
- W22 checks daily that `_dmarc` and both DKIM CNAMEs still resolve (`email_auth_missing`, amber).

**4.4 Before saving DMARC (risk to the legacy product).** `p=quarantine` also applies to mail that **other services** send as `@leadvelocity.co.za`: Resend (11 legacy functions, NH-13), Supabase Auth mails, and any newsletter tool. Each must DKIM-sign as `leadvelocity.co.za` (Resend: its `resend._domainkey` record plus a `send.` return-path subdomain), or send from a different domain. Otherwise its mail gets quarantined. → `needs_human` (tied to NH-13): confirm which services send as `@leadvelocity.co.za`. If unsure, start at `p=none` for 14 days, read the `rua` reports, then go to `p=quarantine`.

## 5. Verify with dns.google before anything depends on it (0.3 #6)
```bash
q() { curl -s "https://dns.google/resolve?name=$1&type=$2" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("Status"),[a["data"] for a in d.get("Answer",[])])'; }
q sortmycover.co.za A                       # -> <HOSTINGER_WEB_IP>
q www.sortmycover.co.za CNAME
q sortmycover.com A
q sortmycover.leadvelocity.co.za A          # staging -> Hostinger
q go.leadvelocity.co.za A
q app.leadvelocity.co.za CNAME              # -> Vercel or Hostinger target
q api.leadvelocity.co.za A                  # W26 only -> <VPS_IP>
q n8n.leadvelocity.co.za A                  # W26 only
q link.sortmycover.co.za A                  # W26 only
q leadvelocity.co.za TXT                    # exactly one v=spf1 … include:spf.protection.outlook.com
q selector1._domainkey.leadvelocity.co.za CNAME
q selector2._domainkey.leadvelocity.co.za CNAME
q _dmarc.leadvelocity.co.za TXT             # v=DMARC1; p=quarantine; …
q _dmarc.sortmycover.co.za TXT              # v=DMARC1; p=reject; …
q leadvelocity.co.za MX                     # unchanged: *.mail.protection.outlook.com
# TLS once DNS resolves (Hostinger/Vercel/Traefik issue certs automatically):
curl -sSI https://sortmycover.co.za | head -1; curl -sSI https://api.leadvelocity.co.za/healthz | head -1
curl -sSI https://sortmycover.leadvelocity.co.za | grep -iE '^HTTP|x-robots-tag'     # expect 401 + noindex
```
`Status 0` with the expected answer = done. `Status 3` (NXDOMAIN) = not yet created or not yet propagated. GoDaddy changes usually show within minutes at TTL 600, and the parent zone can take longer. Re-check before any Meta domain verification or publish.
