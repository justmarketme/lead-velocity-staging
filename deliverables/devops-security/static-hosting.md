# Static hosting: portal media, intro-media, checkout and landing pages (I-30h, NH-29)

**Owner:** devops-security · **Drafted:** 2026-10-02 · **Acts on:** 6.6, 6.7, 0.1 (Consumer brand, Infrastructure spend), 0.3 #6 and #7.
**Status:** plan + build-time contract. Nothing is bought or published by this document. Every DNS save and every Hostinger upload is a HUMAN GATE (GATE-DNS / GATE-PUBLISH). No secrets: variable **names** only.

## 1. The rule: static never moves to the VPS
6.7: Hostinger web hosting (already paid, 1,000 sites) serves static HTML/CSS/JS. It cannot run n8n. The VPS (bought at W26 step 1, after the first payment) runs n8n, Postgres and Traefik. So every artefact in this document is **static on Hostinger both before and after the VPS exists**. The only thing that changes at W26 is the **API base** the static files call (tunnel URL → `api.leadvelocity.co.za`).

Why Traefik does not serve these files after W26 (n8n self-hosting docs + Hostinger KVM docs: the supported, documented path, one server):
- A VPS outage (the 0.5% we allow) must not also take down the portal, checkout and landing pages. On Hostinger they stay up, show the explainer, take manual-EFT details and queue nothing that needs the VPS.
- KVM 2 is sized for n8n + Postgres. Video bytes on the same 2 vCPU compete with the 60-second first message.
- Traefik on the VPS routes only `api.` (`/webhook/*`, `/healthz`), `n8n.` (editor, IP allowlist) and `link.sortmycover.co.za` (`/c/`, `/j/`). See `automation/vps/traefik/`.

## 2. What is served where

| Artefact (source in repo) | Served at (URL path) | Host | Pre-VPS access control | Post-VPS change |
|---|---|---|---|---|
| React console + portal (`npm run build` → `dist/`) | `https://leadvelocity.co.za/` | Hostinger site `leadvelocity.co.za` (6.7). If NH-12 keeps the CRM on Vercel, Vercel instead; see §5 | Supabase Auth login (broker / admin). **Not** basic-auth: Mark uses it before payment (6.6) | `VITE_N8N_WEBHOOK_BASE` rebuilt to the `api.` URL |
| Explainer video + captions (broker-success / intro-media render) | `/media/explainer/en/explainer.mp4`, `/media/explainer/en/explainer.vtt` | same site as the portal (same origin, so the `<track>` needs no CORS) | none needed (no personal data, broker-facing). `X-Robots-Tag: noindex` | none |
| Onboarding step clips | `/media/clips/en/<step>.mp4` | same site as the portal | as above | none |
| `portal/intro-media/` (intro-media-producer) | `/portal/intro-media/index.html` (+ its 4 other pages) | same site as the portal | the page itself is public static; **every call it makes must be authenticated by n8n** (§6 item 2) | `data-api` points at the `api.` URL |
| `billing/checkout/` (billing-automation) | `/checkout/` | same site as the portal | public (the pay links in the portal and WhatsApp open it); `noindex`. It holds no secret; Paystack initialisation happens in n8n | `data-api-base` points at the `api.` URL |
| `landing/dist/` (landing-page-builder), **staging** | `https://sortmycover.leadvelocity.co.za/<angle>/` | Hostinger site `sortmycover.leadvelocity.co.za` | **HTTP basic auth + `noindex`** (DNS.md §3; `landing/holding/staging/.htpasswd-README.md`). Never shown to consumers or Meta (0.1) | none (stays staging) |
| `landing/dist/`, **live** | `https://sortmycover.co.za/<angle>/` (+ `.com` 301) | Hostinger site `sortmycover.co.za` | not published before GATE-PUBLISH; Meta campaigns stay paused at R0 (6.6) | `{{api_base}}` rebuilt to the `api.` URL |
| `landing/dist/`, LV-branded fallback (Section 7 "go.") | `https://go.leadvelocity.co.za/<angle>/` | Hostinger site `go.leadvelocity.co.za` | same as staging until GATE-PUBLISH | as above |

**Deploy method (all rows):** build locally (or in the cloud session), upload the folder with hPanel File Manager / FTP (credentials in `.env` as `HOSTINGER_FTP_*` names only, never in chat), then verify with `dns.google` + an HTTPS GET (0.3 #6). Video files are **not committed to git** (size, and the repo is not a CDN): they are uploaded from the render output straight to `/media/` on the site.

**Hostinger `.htaccess` for the portal site** (static SPA + media + checkout): built as `deploy/hostinger-app/.htaccess` (I-37j). Copy it to `dist/.htaccess` after `npm run build`; it is kept out of `public/` so the current Vercel build does not ship it. What it does:
- SPA fallback to `/index.html` for everything that is not a real file (same as `vercel.json` today), **excluding** `/media/`, `/checkout/`, `/portal/intro-media/`. `/s/*` (the WhatsApp template short links `/s/calendar?day=YYYY-MM-DD`, `/s/billing`, I-37c) and `/broker/*` have explicit rules, so a template button can never 404 on the portal (I-37j). The query string is kept; `SmcShortLink` in `src/App.tsx` then redirects inside the SPA, so login and the broker switch still apply.
- HTTP → HTTPS 301 to `https://leadvelocity.co.za`, path and query kept. `/assets/*` cached 1 year (hashed names), HTML `no-cache`, `X-Robots-Tag: noindex, nofollow` on the whole site.
- Headers: `X-Content-Type-Options nosniff`, `X-Frame-Options DENY` (the portal is never framed), `Referrer-Policy strict-origin-when-cross-origin`, `Strict-Transport-Security max-age=31536000`, a CSP whose `connect-src` lists `VITE_SUPABASE_URL` and the current `VITE_N8N_WEBHOOK_BASE` origin (OWASP ASVS L1 V14).
- `/media/*`: `Cache-Control: public, max-age=604800`, `Accept-Ranges bytes` (Apache default; needed for video seeking), `X-Robots-Tag noindex`.
- `/checkout/*`, `/portal/*`: `Cache-Control: no-cache` (HTML), `X-Robots-Tag noindex`.

### 2a. Deploy-time fill for the app `.htaccess` (names only)
The CSP ships as **Report-Only** until one clean staging run with the real bundle (browser console shows no violations on login, portal, calendar, billing, checkout, intro-media), then the header is renamed to `Content-Security-Policy` (same pattern as the holding site's HSTS ramp). Before upload, replace the placeholders, then confirm none is left (`grep -c '{{' dist/.htaccess` must print 0):
- `{{SUPABASE_ORIGIN}}` = origin of `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`); `{{SUPABASE_WSS}}` = the same host as `wss://` (Realtime).
- `{{API_ORIGIN}}` = origin of `VITE_N8N_WEBHOOK_BASE` (tunnel origin pre-VPS; `https://api.leadvelocity.co.za` from W26). It changes with the tunnel, so it is refilled on every rebuild in §3.

**Vercel variant (only if NH-12 keeps the portal on Vercel):** `vercel.json` now lists `/s/:path*` and `/broker/:path*` → `/index.html` ahead of the catch-all. Vercel serves real files before rewrites, so this changes nothing for the current deployment; it makes the short-link contract explicit and survives a future narrowing of the catch-all. The exclusions in the paragraph at the end of §5 still apply.

## 3. Pre-VPS (now → W26): local n8n + tunnel (0.3 #7)
- Dynamic calls (slots, book, checkout initialise, intro gate, portal webhooks) go to the local n8n through the cloudflared quick tunnel (`automation/local/LOCAL-STAGING.md` §2). Base = `N8N_PUBLIC_URL` + `/webhook`.
- **Known limit (6.6 "limits of free"):** the quick-tunnel URL changes when the tunnel restarts, and static builds bake the base in. When the keeper rotates the URL: rebuild the three static outputs with the new base and re-upload (portal `dist/`, checkout `data-api-base`, landing `{{api_base}}`). Staging carries synthetic data only, so a stale base breaks a test, not a lead. If rotation becomes frequent, the R0 fix is a stable tunnel hostname (LOCAL-STAGING.md §2, ngrok free static domain; one 4.0a check), not a server.
- The tunnel origin (`https://<name>.trycloudflare.com`) is appended to the staging `PUBLIC_ALLOWED_ORIGINS` list below, and nowhere else (never production; `automation/.env.example`, I-37b).
- **`PUBLIC_ALLOWED_ORIGINS` (I-37i):** staging (laptop) keeps `sortmycover.co.za`, `www.sortmycover.co.za`, `sortmycover.leadvelocity.co.za`, `leadvelocity.co.za`, `www.leadvelocity.co.za`. Production (VPS overlay default, set at W26) drops the staging subdomain: `sortmycover.co.za`, `www.sortmycover.co.za`, `leadvelocity.co.za`, `www.leadvelocity.co.za` (the CRM is served on both apex and www). Both values are in `automation/.env.example`; the overlay reads the env, so no file edit at W26.

## 4. Post-VPS (W26 step 8 onward): Traefik in front of n8n only
- `api.leadvelocity.co.za` A → `<VPS_IP>` (DNS.md §3, W26 step 8). Traefik issues the Let's Encrypt certificate (0.3 #6).
- W26 adds one step to its rebuild list: set the three bases to `https://api.leadvelocity.co.za/webhook`, rebuild, re-upload, then replay the synthetic suite (W26 step 12). The static hosts, their certificates and their DNS records do not change.

## 5. Environment variables the React build expects (names only; Vite inlines them at build time)
Everything prefixed `VITE_` ends up **in the browser bundle**. Only public values may go there (ASVS L1 V14: no secret in client code).

| Name | Purpose | Default in `src/lib/smc.ts` | Pre-VPS value (shape) | Post-VPS value (shape) |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | required | project URL | same |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key (public by design; RLS protects data) | required | publishable key | same |
| `VITE_SUPABASE_PROJECT_ID` | project ref | — | ref | same |
| `VITE_SMC_ENABLED` | turns the SortMyCover screens on | off | `true` on the staging build | `true` |
| `VITE_N8N_WEBHOOK_BASE` | base for `postWebhook()` (sends the user's Supabase JWT) | empty = "not connected yet" | `https://<tunnel>/webhook` | `https://api.leadvelocity.co.za/webhook` |
| `VITE_MS_OAUTH_URL` | Microsoft calendar connect start | empty | `<VITE_N8N_WEBHOOK_BASE>/ms/oauth/start` (owner: automation-engineer) | same shape on `api.` |
| `VITE_MS_ADMIN_CONSENT_URL` | Entra admin-consent link (0.3 #4) | empty | Entra URL with the app's client id (public) | same |
| `VITE_SMC_CHECKOUT_URL` | checkout page | `/checkout/` | leave unset (same origin) | leave unset |
| `VITE_SMC_INTRO_MEDIA_URL` | intro-media app | `/portal/intro-media/index.html` | leave unset | leave unset |
| `VITE_SMC_EXPLAINER_URL` / `VITE_SMC_EXPLAINER_VTT` | explainer video + captions | `/media/explainer/en/explainer.mp4` / `.vtt` | leave unset (same origin) | leave unset |
| `VITE_SMC_CLIPS_BASE` | step clips folder | `/media/clips/en` | leave unset | leave unset |
| `VITE_SMC_SUPPORT_WA` | support WhatsApp number, digits only | empty hides the button | the LV business number (public) | same |
| `VITE_SMC_MEDIA_BUCKET` | private Storage bucket for headshots | `broker-media` | `broker-media` (must equal migration 09's bucket id) | same |

If NH-12 resolves to **Vercel** for the portal: keep the same paths by copying `billing/checkout/` → `public/checkout/` and `portal/intro-media/` → `public/portal/intro-media/` before `vite build`, add those paths and `/media/` to the `vercel.json` rewrite exclusions, and serve video from a Hostinger static site `media.leadvelocity.co.za` (set `VITE_SMC_EXPLAINER_URL`, `VITE_SMC_EXPLAINER_VTT`, `VITE_SMC_CLIPS_BASE` to absolute URLs there; that site needs `Access-Control-Allow-Origin: https://leadvelocity.co.za` on `.vtt` for the captions track). The `media` DNS line in DNS.md §3 is only for this branch.

**Finding:** the root `.env.example` lists `VITE_GEMINI_API_KEY`. Any `VITE_` key ships to every browser. If the legacy CRM really calls Gemini from the client, that key is public. Move the call to an edge function and drop the `VITE_` prefix (ASVS L1 V14; 0.3 #10). Flagged `needs_human` (legacy code, not SMC).

## 6. Open contract points
1. **Tunnel churn** pre-VPS needs a rebuild per rotation (§3). Accepted for staging. No spend.
2. **`portal/intro-media/` auth:** its README expects same-origin `/intro/*` with a magic-link session cookie. Hostinger static cannot proxy `/intro/*`, and magic-link login is not built (I-30l). Proposal: set `data-api` to `<api base>/intro` and send the Supabase JWT as `Authorization: Bearer` (the same as `postWebhook()`), with n8n verifying it. Owner: intro-media-producer + automation-engineer → `needs_human` until agreed.
3. **Checkout base placeholder:** `billing/checkout/index.html` carries `{{BILLING_API_BASE}}`, filled at deploy with the same base as `VITE_N8N_WEBHOOK_BASE`.
4. **Headshots** go to the private `broker-media` bucket (migration `20261002090000_smc_09_storage.sql`, not applied). Brokers write only under `<their brokers.id>/`, admins and `n8n_app` read, anon nothing. Rendering signs a short-lived URL server-side.
