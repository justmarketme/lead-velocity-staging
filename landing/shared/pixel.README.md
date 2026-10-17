# pixel.js - SortMyCover Meta Pixel + shared event_id

Not deployed. Needs `pixel_id` from GATE-PIXEL. Until then the module is inert (no id, no network).

## Paste into `<head>` of every page
```html
<meta name="smc-pixel-id" content="PIXEL_ID_HERE">
<script src="/shared/pixel.js" defer></script>
```
(or set `window.SMC_PIXEL_ID = '...'` before the script). `PageView` fires automatically on load.
Set `window.SMC_NO_AUTO_PAGEVIEW = true` to suppress it.

## Consent assumption
The pixel uses first-party cookies and the privacy notice names it (4.4a), so `PageView` fires on load.
If `window.SMC_CONSENT_ANALYTICS === false` the pixel is never loaded and `fbp`/`fbc` are `null`.
`utm_*`/`fbclid` are still stored first-party so the lead record keeps its origin.
Name, phone and email are never sent from the browser; `track()` strips such keys from params. Hashing is server-side (`automation/capi/capi.js`).

## Context object
`smc.track(name, params)` returns `{event_id, event_name, fbp, fbc, utm, fbclid, page_url, user_agent, ts}` (`ts` = unix seconds).
The form POSTs that object as `context` to `/lead` or `/book`; n8n reuses `context.event_id` for the CAPI event so Meta dedupes. `smc.context()` returns the latest one.

## Exact calls per section (4.5 spec rows)
| Row | Section | Call |
|---|---|---|
| 2 | Hero CTA "Check my cover in 60 seconds" (and first quiz card shown) | `smc.track('ViewContent', {content_name: 'quiz_start'})` once, on first quiz interaction |
| 5 | Quiz step 1 (first tap-card answered) | same single `ViewContent` call as above (quiz start); do not repeat per question |
| 8 | Details step submit | `const ctx = smc.track('Lead', {content_name: angle_slug}); fetch('/lead', {method:'POST', body: JSON.stringify({...fields, context: ctx})})` |
| 10 | Thank-you / booking confirmed | `const ctx = smc.track('Schedule'); fetch('/book', {... context: ctx})`; if the lead skips booking, fire only `Lead` |
| - | CTWA button / "I'll pick a time on WhatsApp" link | `smc.track('Contact')` before navigating to wa.me |

Note: row 9 (booking widget) fires nothing; `Schedule` fires only on a confirmed `POST /book`. Each event has its own `event_id`; never reuse the `Lead` id for `Schedule`.


## Compliance settings (compliance-qa phase0-review-1)
- In Events Manager turn **Automatic Advanced Matching OFF** for this pixel before go-live; `pixel.js` also sets `autoConfig=false` so no form field is ever hashed in the browser.
- `smc.adsOff()` / `smc.adsOn()` store the visitor's ad-measurement choice first-party (`smc_ads_off`); the cookie notice links to it.
- `page_url` is origin + path only (no query string).
- Server side, W01 sends CAPI/offline events only when `leads.consent_ads_at` is set (see `automation/capi/event-spec.md`).


## Two-step events
`smc.prepare(name)` returns the context (with `event_id`) without firing; `smc.fire(ctx)` fires it later. Use for `Schedule`: prepare before `POST /book`, send `ctx` in the body, fire only when the booking succeeds, so a failed booking leaves no stray browser event (server-side CAPI reuses the same `event_id`).
