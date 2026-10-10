# motion-library: Motion (motion.dev) for a fast, accessible, CSP-strict static site

Lens: Motion for SortMyCover (static HTML, Vercel, `script-src 'self'`, mobile-first, audience 35-50 on mid-range Android in South Africa).
Written 10 Oct 2026. Everything below was fetched, measured or executed on that date unless a date is given. Anything dated before 2024 is marked **STALE**. Anything not verified at a primary source or by a test is marked **UNVERIFIED**.
Evidence grades: **A** primary (vendor docs, package registry, standards/browser-compat data, platform docs) or reproduced by a test run for this report; **B** well-documented but observational; **C** blog or marketing (directional only).
Read first and not re-derived: `deliverables/website/research/{seo-google,ux-cro,compliance-sa,top5-sites,subdomain-architecture}.md`, `landing/README.md`, `landing/holding/deploy.md`, `landing/vercel.json`, `landing/template/{index.html,page.css,page.js}`.

## 0. Bottom line

1. Motion is free and MIT. Pay nothing. The current `motion` package is **14.1.0** (npm, published 2026-10-09, licence MIT). Motion+ (US$399 **one-time** Solo licence, annual per-seat Team plans) is not needed for anything in this funnel. Correction to `ux-cro.md` finding 5: the AI Kit is not "$399/year"; it is part of the one-time Motion+ membership (section 1).
2. There is **no single-file ESM you can copy out of the package**: the published ESM entry is a 35-byte re-export that chains three more packages. Two verified no-runtime-build routes exist: (a) copy the UMD `dist/motion.js` (145 KB raw, 43 KB brotli, `window.Motion`), or (b) run esbuild **once on a laptop** and commit a tree-shaken ESM (measured 18.3 KB raw, 6.9 KB brotli for mini animate + stagger + inView + scroll). Route (b) is recommended; Vercel still does `echo no-install` (section 5).
3. Ship the **mini** build (`motion/mini`, about 3.0 KB brotli) plus `inView` (0.4 KB) and, only on pages that need it, `scroll` (+3.0 KB). Avoid the hybrid `animate` (18.7 KB brotli), `animateLayout` (28.3 KB), `animateView` (6.1 KB and it injects an inline `<style>` that the holding-page CSP blocks).
4. Vanilla Motion does **not** honour `prefers-reduced-motion` by itself (tested). Gate it yourself, and make the default state "visible, no motion".
5. Most interactions in this funnel are better as CSS (0 KB). Motion earns its bytes on about five: quiz step exit/enter, `inView` reveals with stagger, cross-browser accordion height, scroll-linked "how it works" line on browsers without CSS scroll timelines, and sticky-CTA sentinel (section 10).

## 1. Free versus Motion+ (price, contents, AI Kit)

| Item | Finding | Grade / source |
|---|---|---|
| Package and licence | npm package `motion`, version **14.1.0**, licence **MIT**, `sideEffects: false`, depends on `framer-motion` 14.1.0 and `tslib`. `LICENSE.md` in the tarball: MIT, "Copyright (c) 2024 Motion B.V." | A: registry.npmjs.org/motion/latest; unpkg.com/motion@14.1.0/LICENSE.md (10 Oct 2026) |
| Core is free | animate, animateView, animateLayout, scroll, inView, hover, press, resize, spring, stagger, delay, frame, mix, arc, transform, wrap, motionValue, springValue, mapValue, transformValue, attrEffect, propEffect, styleEffect, svgEffect. These names appear in the docs sidebar without a Motion+ badge, and `animate`, `animateLayout`, `animateView`, `hover`, `inView`, `press`, `scroll`, `spring`, `stagger`, `svgEffect`, `styleEffect`, `mapValue` are all present as exports in the free 14.1.0 global bundle (grep of `dist/motion.js`) | A: motion.dev/docs/split-text (sidebar); bundle grep |
| Motion+ price | **US$399, one-time ("Solo" licence, lifetime updates).** The `motion.dev/plus` page JSON-LD says `"price":"399"`, `"priceCurrency":"USD"`, `"category":"OneTime"`; its FAQ says "The Solo licence is a one-time payment" and "Team plans renew annually". Team = annual subscription per seat for 2+ people; seat price **not shown in the fetched HTML (UNVERIFIED)**. 14-day refund before GitHub access (page text). `/pricing` redirects to `/plus` | A: motion.dev/plus (10 Oct 2026) |
| "$399/yr" claim | **Wrong for Solo.** It is a one-time US$399. Only Team renews annually. `ux-cro.md` finding 5 says "$399/year" and cites `motion.dev/ai-kit`; the live page is `motion.dev/docs/ai-kit` and says "One payment. Lifetime updates." | A: motion.dev/plus, motion.dev/docs/ai-kit |
| What Motion+ contains | 490+ examples, Motion UI (30 animated sections), AI Kit, 110+ tutorials, private Discord, early access to new APIs, private GitHub repo | A: motion.dev/plus |
| AI Kit contents | An MCP server plus a `/motion` skill for Claude Code, Cursor and Codex. **Free:** best practices and documentation search ("no account or configuration"); the skill and its installer are MIT. **Motion+ only:** CSS spring generation (linear() curves), MotionScore performance audits, the transition editor, and source of the 490+ premium examples and Motion UI | A: motion.dev/docs/ai-kit; motion.dev/docs/quick-start |
| Motion+ only APIs (vanilla) | `splitText` (+0.7 KB; `import { splitText } from "motion-plus"`), `scrambleText`, `curtains` | A: motion.dev/docs/split-text sidebar and text |
| Motion+ only (React-heavy) | AnimateNumber ("adds only 2.5kb on top of Motion"; docs are React only), Carousel, Cursor, Ticker, Typewriter, AnimateActivity (early access) | A: motion.dev/plus; motion.dev/docs/react-animate-number |
| How Motion+ installs | Private package `motion-plus` via an access token that only members can generate, so it needs npm and a bundler. Not usable in the current no-build `landing/` without adding a toolchain | A: motion.dev/docs/split-text |

Nothing was bought, signed up for or installed.

## 2. Version and release churn

npm `time` for `motion` (retrieved 10 Oct 2026): 13.4.3 (24 Sep), 13.4.4 (25 Sep), 13.4.5 and 13.4.6 (29 Sep), 13.5.0 (1 Oct), 13.5.1 (2 Oct), **14.0.0 (2 Oct)**, **14.1.0 (9 Oct)**. Eight releases in 15 days.
Changelog (motion.dev/changelog): 14.0.0 removed internal APIs restored in 13.5.1 for framer-motion compatibility; 13.5.0 added negative spring bounce and moved scroll/offset animations "to main thread for consistency"; 13.4.4 removed ScrollTimeline for JS-callback scroll. Upgrade guide: "No breaking changes for vanilla JS" in v13 and v14; the last vanilla-breaking set was v11 (mini/hybrid split, `scroll()` callback signature, `stagger({start})` to `startDelay`) and v12 (gesture callbacks receive the element first) (motion.dev/docs/upgrade-guide, no dates given).
Implication: pin an exact version and commit the vendored file with a banner (`motion 14.1.0, esbuild 0.28.1, <date>`). Re-test the quiz and `scroll()` effects before any bump. Do not use `@latest`.

## 3. Vanilla API facts needed for the plan

- Import paths in the package exports: `motion` (hybrid), `motion/mini`, plus `motion/react*`, `motion/three`, `motion/vgpu`, `motion/debug`. `stagger`, `inView`, `scroll`, `hover`, `press` are **not** exported from `motion/mini`; they come from `motion` (verified: esbuild error "No matching export in motion/mini for import stagger").
- `animate()` mini: HTML and SVG styles through native browser APIs. Hybrid adds independent transforms (x, y, scale, rotate...), CSS variables, sequences, SVG `pathLength`/`pathSpacing`/`pathOffset`, colour/string/number interpolation and JS objects (motion.dev/docs/animate, A).
- `animate(0, 1250, { duration: .5, onUpdate: v => ... })` works in the hybrid build (tested; final value 1250). `animateMini` is the WAAPI-only path.
- Both builds: `delay` may be a function; source of `animate-elements.mjs` calls `delay(i, numElements)`; tested `stagger(.05)` on three elements in mini gave WAAPI delays 0, 50, 100 ms.
- Mini ignores `type: "spring"`: tested, native effect easing came out as `ease-out`. Hybrid with `type: "spring"` on `opacity` or a `transform` string produced a native WAAPI animation with a generated `linear(...)` easing (tested). `linear()` support: Chrome 113, Firefox 112, Safari 17.2 (MDN browser-compat-data, A).
- `height: [0, el.scrollHeight + 'px']` and `height: 'auto'` both animate in mini and in hybrid (tested, both ended at 86 px for a 3-line block).
- SVG `pathLength` in hybrid sets the `pathLength="1"` attribute and a `stroke-dasharray` split, which is exactly what CSS can do (tested).
- `inView(sel, cb)`: IntersectionObserver based, 0.5 KB, default fires once on entry, returning a function from `cb` runs on exit, returns a stop function, options `root`, `margin`, `amount` (motion.dev/docs/inview, A).
- `scroll(callbackOrAnimation, { target, container, axis, offset })`: callback gets progress 0..1; passing an `animate()` result lets the browser run it on a `ScrollTimeline` where possible; offsets use intersection notation (`"start end"`, `"end end"`), numbers, `%`, px, vh (motion.dev/docs/scroll, A).
- `hover()` filters touch-emulated hover; `press()` is keyboard-accessible "via focus and the enter key", ignores secondary pointers, returns a cancel function (motion.dev/docs/hover, /press, A). `animateLayout` (vanilla layout and shared-element animation via `data-layout`, `data-layout-id`) needs 14.1.0 or later (motion.dev/docs/layout-animations, A). `animateView` wraps the View Transition API and does nothing where unsupported (motion.dev/docs/view, A).
- Motion supports "all modern browsers", not IE11 (motion.dev/docs/faqs, A).
- The free bundle contains **no** `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `eval` or `new Function` (grep of `dist/motion.js` 14.1.0). The only URL string is a troubleshooting link used in warnings. It needs no `connect-src` and no `unsafe-eval`.

## 4. Bundle sizes (official claims versus measured)

Official: `animate` mini 2.3 KB, hybrid 18 KB (motion.dev/docs/animate; another page says 17 KB; the upgrade guide says mini 2.5 KB at v11); `scroll` 5.1 KB (docs; the upgrade guide says "2.6kb to 5.2kb"); `inView` 0.5 KB; `splitText` 0.7 KB (Motion+). The docs do not say whether these are gzip or brotli (the open question in `seo-google.md`).

Measured for this report: esbuild 0.28.1 (`--minify --format=esm --target=es2020`), sources fetched from jsDelivr raw files of `motion@14.1.0`, `framer-motion@14.1.0`, `motion-dom@14.1.0`, `motion-utils@14.1.0`, in memory, `sideEffects: false` applied to all modules (the `motion` package declares it; I applied it to its dependencies too, so real bundler output may differ a little). Sizes in bytes.

| Entry (tree-shaken) | Raw | gzip -9 | brotli q11 |
|---|---|---|---|
| `animate` from `motion/mini` | 8,388 | 3,337 | **3,042** |
| `animate` from `motion` (hybrid) | 55,365 | 20,439 | **18,693** |
| `inView` | 711 | 432 | 375 |
| `hover` | 1,071 | 546 | 488 |
| `press` | 1,976 | 993 | 875 |
| `stagger` | 1,264 | 785 | 721 |
| `spring` | 4,227 | 1,961 | 1,818 |
| `scroll` (alone) | 8,600 | 3,826 | 3,505 |
| `svgEffect` | 12,582 | 4,767 | 4,357 |
| `animateView` | 17,051 | 6,670 | 6,052 |
| `animateLayout` | 94,917 | 31,201 | **28,291** |
| mini + `inView` | 8,862 | 3,541 | 3,233 |
| mini + `stagger` + `inView` | 10,089 | 4,167 | 3,825 |
| mini + `stagger` + `inView` + `scroll` | 18,293 | 7,490 | **6,866** |
| mini + stagger + inView + scroll + hover + press | 20,634 | 8,347 | 7,629 |
| hybrid + stagger + inView + scroll | 62,709 | 23,389 | 21,336 |
| UMD `dist/motion.js` (everything, `window.Motion`) | 144,870 | 47,934 | 42,757 |

Reading: the official 18 KB for hybrid matches brotli (18.7 KB measured); mini measured 3.0 KB brotli against the official 2.3 KB; `scroll` adds about 3.0 KB to a mini build because it shares code. Budget tiers:
- Tier 0, CSS only: 0 KB.
- Tier 1, mini + `inView` + function delay: about **3.2 KB** brotli.
- Tier 2, + `stagger` + `scroll`: about **6.9 KB** brotli. Load it only on pages that use scroll effects.
- Tier 3, hybrid: **18.7 KB and up**. Only if you need independent transforms, JS count-ups, sequences or SVG path drawing, and every one of those has a CSS or hand-rolled alternative.
For scale: the current quiz page is page.js 20 KB plus pixel.js 5 KB (`landing/README.md`); tier 2 would add roughly a third.

## 5. Self-hosting without a CDN: is a build step needed?

Verified facts:
- `motion/dist/es/index.mjs` is exactly `export * from 'framer-motion/dom';` (35 bytes); `mini.mjs` is `export * from 'framer-motion/dom/mini';`. `framer-motion/dom` in turn re-exports `motion-dom` and `motion-utils` (unpkg file listing; jsDelivr `+esm` output shows the same chain: `motion@14.1.0/+esm` -> `/npm/framer-motion@14.1.0/dom/+esm` -> `/npm/motion-dom@14.1.0/+esm` and `/npm/motion-utils@14.1.0/+esm`). The quick-start's `cdn.jsdelivr.net/npm/motion@latest/+esm` therefore pulls three origins' worth of modules from one CDN host and cannot be self-hosted as a single file by copying.
- So: **one vendored ESM file cannot be copied out of the package.** What can be copied:

| Route | What you commit | Build step | Size (brotli) | Verified |
|---|---|---|---|---|
| A. UMD global | `node_modules/motion/dist/motion.js` as `/shared/motion.js`, loaded with `<script defer src>`; API on `window.Motion` | none | 42.8 KB (full lib, not tree-shaken) | Loaded from `'self'` under `default-src 'self'; style-src 'self'` and animated; the section 6 run used this file |
| B. One-off esbuild ESM (recommended) | A tree-shaken `landing/shared/motion.js` produced once with esbuild (`bundle`, `minify`, `format=esm`, `target=es2020`) from a 2-line entry such as `export {animate} from 'motion/mini'; export {inView, stagger, scroll} from 'motion';`, loaded with `<script type="module">` and `import ... from '/shared/motion.js'` | one-off on a dev machine; **none on Vercel** (`installCommand: "echo no-install"` stays) | 6.9 KB for the entry above | Served with `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'`; module imported from `'self'`, animate + stagger + inView ran, **0 CSP violations** |
| C. Copy the raw `.mjs` tree plus an import map | about 4 packages of unbundled modules and an inline `<script type="importmap">` (needs a CSP hash) | none | larger, many requests | Not recommended; not tested |

Notes: esbuild is not in `lv-site/package.json`; the `EMMA` repo already has esbuild 0.28.1, so a throwaway folder (`npm i motion@14.1.0 esbuild`, outside `landing/`) is enough. Commit the output and a banner. `landing/vercel.json` sets `Cache-Control` only for html, css, svg, png; add a long `max-age` for `/shared/*.js` or use the `?v=` pattern the template already uses for `page.js`. Whether Vercel serves brotli for these JS files was not tested (UNVERIFIED; the sizes above are what gets compressed).

## 6. CSP verification (the site's strict policy)

Test: a page served with the site's strict policy `default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'` (copied from `landing/vercel.json`), Motion 14.1.0 loaded from the same origin, headless Chrome 154.0.8037.58, a `securitypolicyviolation` listener on the document, each API called separately.

| Call | CSP violations |
|---|---|
| `animate` x, scale, rotate, opacity, `transform` string, CSS variable, backgroundColor, SVG `pathLength` (hybrid) | none |
| `scroll(callback)`, `scroll(animation)` | none |
| `inView`, `hover`, `press` | none |
| `animateLayout(() => ...)` | none |
| `animateView(() => ...)` | **4 x `style-src-elem` (inline)** |

Cause: `animateView` creates `<style id="motion-view">` (grep of the bundle: `document.createElement("style"), er.id="motion-view"`). Under `style-src 'self'` (holding pages today) that is blocked; the proposed quiz CSP in `landing/README.md` has `style-src 'self' 'unsafe-inline'`, where it would run. Everything else in the table works under the strict policy because Motion sets styles through CSSOM and WAAPI, not through style attributes or style elements. Do not use `animateView` unless the CSP deliberately allows it; the CSS-only `@view-transition { navigation: auto }` (Chrome 126, Safari 18.2, not Firefox) needs no JS at all.

## 7. WAAPI, ScrollTimeline and what is actually GPU-friendly

Tested in headless Chrome 154 with the 14.1.0 global bundle (reproduction steps in section 13):

| Pattern | Result |
|---|---|
| `animate(el, { opacity: [0,1] })`, `animate(el, { transform: ['translateX(0px)','translateX(200px)'] })` | native WAAPI animation (`el.getAnimations()` length 1 after the async start) |
| `animate(el, { x: [0, 200] })` and `{ scaleX: ... }` (independent transforms) | **no** WAAPI animation; `style.transform` written from JS each frame (main thread) |
| `scroll(animate(el, { transform: ['scaleX(0)','scaleX(1)'] }, { ease: 'linear' }))` | the WAAPI animation's `timeline` is a native **`ScrollTimeline`** (progress read back 22.6% at scrollY 800) |
| `scroll(animate(el, { opacity: [0,1] }), { target, offset: ['start end','end end'] })` | native **`ViewTimeline`** |
| `scroll(animate(el, { scaleX: [0,1] }))` | not WAAPI-backed, so it runs on the main thread (style `scaleX(0.226053)`) |
| `scroll(cb)` | callback with progress (0.226 at the same scroll position), main thread |
| Same pages with `ScrollTimeline` and `ViewTimeline` deleted before Motion loads (simulates Firefox stable) | the WAAPI animation falls back to a paused `DocumentTimeline` animation whose time is set from scroll events; identical progress (`scaleX(0.226053)`) |

Motion's own text agrees: it is "built on WAAPI", `transform` and `opacity` are "the safest values to animate across all devices", `filter` works on the compositor in Chrome and Firefox, and "independent transforms... are not accelerated" because they use CSS variables (motion.dev/docs/performance, A). Rule: for compositor-friendly and scroll-timeline-friendly effects write the keyframes as a `transform` string and `opacity`, not as `x`, `y`, `scale`.

Browser support (MDN browser-compat-data `main`, retrieved 10 Oct 2026, A): `ScrollTimeline`, `ViewTimeline`, `animation-timeline`, `animation-range`: Chrome and Edge 115, **Safari 26**, **Firefox "preview" only (not stable)**. `Element.animate`: Chrome 36, Firefox 48, Safari 13.1. `IntersectionObserver`: Chrome 51, Firefox 55, Safari 12.1. `document.startViewTransition`: Chrome 111, Safari 18, Firefox 144. `@view-transition` (cross-document): Chrome 126, Safari 18.2, no Firefox. `linear()` easing: Chrome 113, Firefox 112, Safari 17.2. (One 2026 blog snippet claimed Firefox ships scroll-driven animations; it conflicts with MDN data and is graded C, so ignore it.)
Audience fit: Statcounter, South Africa mobile, September 2026 (B): Chrome 73.54%, Safari 13.08%, Samsung Internet 8.33%, Opera 3.54%, Firefox 0.79%, UC 0.37%. Chrome, Samsung and Opera are Chromium, about 85% combined, so the native scroll-timeline path serves most visitors; iOS Safari below 26 and Firefox take the verified JS fallback. Opera 3.54% may include Opera Mini, which does not run this kind of script reliably (UNVERIFIED), so every effect must be progressive enhancement over visible content.

## 8. prefers-reduced-motion

- Tested (Chrome 154 launched with `--force-prefers-reduced-motion`, `matchMedia('(prefers-reduced-motion: reduce)').matches` reported `true`, plus a control run without the flag): hybrid `animate(el, { x: [0,200] })`, `animate(el, { opacity: ... })` and a WAAPI `transform` string were all mid-animation at 300 ms in both runs, so the preference changed nothing. **Vanilla Motion does not auto-respect the OS setting.** The documented `reducedMotion` behaviour (disable transform and layout animation, keep opacity and colour) belongs to `MotionConfig` in Motion for React only (motion.dev/docs/react-accessibility, A); the vanilla `animate` page does not mention it.
- The 14.1.0 source has an undocumented per-call `reduceMotion` option and a `skipAnimations` option. Tested on the hybrid build: `reduceMotion: true` made an independent transform jump to its end value but left opacity and a WAAPI `transform` string animating; `skipAnimations: true` made an independent transform instant. Not documented for vanilla, so do not rely on them (UNVERIFIED stability).
- Therefore: (1) hide-until-revealed styles live inside `@media (prefers-reduced-motion: no-preference)` and under `html.js`, so reduced-motion users and no-JS users simply see the content; (2) in JS read `matchMedia('(prefers-reduced-motion: reduce)')` once, listen for `change`, and skip or shorten every call; (3) never animate anything that hides required disclosures (`compliance-sa.md` S34/S35: identity block, consent text, how-we-make-money link must be visible without interaction or animation). The template already has a CSS-only 250 ms entrance guarded by `prefers-reduced-motion:no-preference` (`page.css` line 153); keep that as the baseline.
- Failsafe idea for hidden-until-JS content (untested): give `[data-reveal]` a CSS animation that sets `opacity: 1` after about 3 s, so a script failure or an Opera Mini visitor never sees blank sections.

## 9. INP, CLS and LCP pitfalls (platform facts, then Motion specifics)

Platform (A): LCP good is 2.5 s or less and Chromium excludes elements with zero opacity from LCP candidates (web.dev/articles/lcp, updated 4 Sep 2025). CLS good is 0.1 or less; animate with `transform` instead of size or position; layout shifts within 500 ms of user input get `hadRecentInput` and are excluded (web.dev/articles/cls, updated 12 Apr 2023). INP good is 200 ms or less at p75; only click, tap and key presses count; long main-thread tasks drive input delay (web.dev/articles/inp, updated 2 Sep 2025).
Motion specifics:
1. **Never start the H1, hero paragraph, hero CTA or sticky CTA at `opacity: 0`.** A fade-in delays LCP until the element is visible. Render them visible in the first HTML and animate only below-the-fold elements after `load` (matches `seo-google.md` F4).
2. **Do not delay input.** Update quiz state and enable the next option first, then animate. An exit animation that must finish before the next step accepts a tap adds directly to INP. Keep step transitions at or under 250 ms and exit at or under 150 ms.
3. **Prefer opacity and transform.** Animating `height` (accordion) forces layout each frame on the main thread; it is acceptable only because it follows a tap (CLS exempt within 500 ms of input) and runs for 250 ms or less. Reserve space for anything that appears later (slot grid) to avoid CLS.
4. **Independent transforms run in JS** (section 7): many of them animating together on a cheap Android phone is where jank appears; use `transform` strings in mini.
5. **`scroll(callback)` runs on scroll events on the main thread.** Keep callbacks write-only (set a CSS variable), never read layout in them.
6. **Do not use scroll-jacking or smooth-scroll integrations** (Motion lists a Lenis integration); they break native scroll and are not needed here.
7. Load Motion with `type="module"` (deferred by default) and only on pages that use it; keep `/learn/` articles on CSS only.

## 10. Interaction catalogue (15) with exact API and verdict

"br" = brotli bytes from the section 4 table. "CSS" = zero-JS alternative. Verdict: **Use** (Motion earns its bytes), **CSS** (do it in CSS), **Skip**.

| # | Interaction (where) | Exact Motion API (vanilla) | Cost (br) | CSS alternative | Verdict |
|---|---|---|---|---|---|
| 1 | Progressive reveal of below-fold sections (home, how-it-works, learn index) | `inView('[data-reveal]', el => { animate(el, { opacity: [0,1], transform: ['translateY(12px)','none'] }, { duration: .4, ease: 'easeOut' }) })` using mini animate | 3.2 KB | `animation-timeline: view()` (Chrome 115, Safari 26; none on Firefox) | **Use** (best coverage for 3.2 KB); never on the H1 or hero |
| 2 | Staggered trust points, 3 step cards, adviser slot grid after `/slots` returns | `animate(items, { opacity:[0,1], transform:[...] }, { delay: stagger(0.06) })`; or no import: `{ delay: (i) => i * 0.06 }` (mini calls `delay(i, n)`, tested via `stagger`) | +0.7 KB with `stagger`, 0 with the function | custom property `--i` and `animation-delay: calc(var(--i) * 60ms)` | **Use** only where #1 is already loaded; CSS is equal |
| 3 | Quiz step transition (5-tap quiz, `.q.on` swap in `page.js`) | `await animate(cur, { opacity: 0, transform: 'translateX(-16px)' }, { duration: .12 }).finished`, swap, then `animate(next, { opacity:[0,1], transform:['translateX(16px)','none'] }, { duration: .2 })`; set quiz state first, reserve card height | in the 3.2 KB base | existing 250 ms CSS entrance (`page.css` 153) covers "in" but not "out" | **Use**, modest value; skip if the CSS entrance is judged enough |
| 4 | Option-tap feedback (spring-like press) | `press('.opt', el => { animate(el, { scale: .97 }, { duration: .1 }); return () => animate(el, { scale: 1 }, { type: 'spring', bounce: .4 }) })` | needs hybrid for `scale` and `spring` (18.7 KB) | `.opt:active { transform: scale(.97) }` plus `transition` with a `linear()` spring | **CSS** |
| 5 | Quiz progress bar fill | `animate('#fill', { transform: ['scaleX(.29)','scaleX(.43)'] }, { duration: .25 })` | in base | `transition: transform .25s` on `scaleX` (current markup is 7 `<i>` segments toggled by class) | **CSS** |
| 6 | Animated "how it works" timeline: connector line draws, steps light up | `scroll(animate(line, { transform: ['scaleY(0)','scaleY(1)'] }, { ease: 'linear' }), { target: section, offset: ['start 70%','end 60%'] })` (offset syntax per docs; only `'start end'` and `'end end'` were run) plus `inView(step, el => { el.classList.add('is-on'); return () => el.classList.remove('is-on') }, { amount: .6 })` | +3.0 KB (scroll) | `animation-timeline: view()` inside `@supports`; static line on other browsers | **Use if** Firefox and Safari below 26 matter; otherwise CSS with the line simply static |
| 7 | Scroll-linked storytelling: the "life-event" or gap bars grow as you scroll (illustrative only, no product or quote) | `scroll(animate(bar, { transform: ['scaleX(0)','scaleX(1)'] }, { ease: 'linear' }), { target: bar, offset: ['start end','center center'] })` per bar; native ViewTimeline in Chromium | +3.0 KB | `animation-timeline: view()` | **Use sparingly**, one page, final state must be the readable default; no scroll pinning |
| 8 | Reading-progress bar on `/learn/` articles | `scroll(animate('#read', { transform: ['scaleX(0)','scaleX(1)'] }, { ease: 'linear' }))` (verified native ScrollTimeline) | +3.0 KB | `animation-timeline: scroll()` | **CSS**; losing it on Firefox is harmless |
| 9 | Number count-up (for example "30 minutes") | `animate(0, 30, { duration: .8, ease: 'easeOut', onUpdate: v => { el.textContent = Math.round(v) } })` (hybrid only; tested) | 18.7 KB | 10-line `requestAnimationFrame` loop, 0 KB | **Skip Motion.** If used at all: start from the final text in HTML, run once on `inView`, skip under reduced motion, `aria-hidden` the live number and keep the final value in the accessible text, and never count up money or cost claims (R0 to the consumer, premiums, gaps) because partial values read as claims |
| 10 | FAQ and learn accordions (`<details>`) | `animate(panel, { height: [0, panel.scrollHeight + 'px'] }, { duration: .25 })` and the reverse on close (tested in mini; `'auto'` also worked) | in base | `::details-content` (Chrome 131, Firefox 143, Safari 18.4) plus `interpolate-size: allow-keywords` (**Chrome 129 only**; others snap open) | **Use** for consistent behaviour, or CSS and accept the snap on non-Chrome; keep real `<details>` semantics |
| 11 | Sticky CTA appears after the hero CTA leaves the viewport | `inView('#hero-cta', () => { sticky.hidden = true; return () => { sticky.hidden = false } })` | 0.4 KB (or 10 lines of IntersectionObserver for 0) | none | **Use or hand-roll**; trivial either way |
| 12 | Booking-confirmed tick drawn | `animate('path', { pathLength: [0,1] }, { duration: .5 })` (hybrid; sets `pathLength="1"` and a dasharray) | 18.7 KB | `pathLength="1"` attribute plus `stroke-dasharray: 1; stroke-dashoffset` CSS animation | **CSS** |
| 13 | Page-to-page transition (quiz to thank-you) | `animateView(() => ...)` | 6.1 KB and it injects `<style>` (blocked by holding CSP) | `@view-transition { navigation: auto }` (Chrome 126, Safari 18.2) | **Skip**; also adds perceived delay on an ad landing |
| 14 | Hover micro-interactions on CTAs | `hover('.btn', el => { animate(el, { transform: 'translateY(-1px)' }, { duration: .15 }); return () => animate(el, { transform: 'none' }, { duration: .15 }) })` | +0.5 KB | `@media (hover: hover) { .btn:hover {...} }` | **CSS**; mobile-first audience barely hovers |
| 15 | Per-character headline reveal, marquee or logo ticker | Motion+ `splitText` (0.7 KB), Ticker | paid, token-installed private package | CSS | **Skip**; splitting the H1 hurts LCP and text-selection and auto-moving content needs a pause control under WCAG 2.2.2 (`ux-cro.md`) |

Not worth any bytes: `animateLayout` (28.3 KB brotli; shared-element morphs are not a conversion lever here), AnimateNumber (React only), Cursor, Carousel, Curtains.

## 11. Suggested build and file plan (no code written into `landing/`)

1. Throwaway folder: `npm i motion@14.1.0 esbuild`, entry file `export {animate} from 'motion/mini'; export {inView, stagger, scroll} from 'motion';`, bundle to `landing/shared/motion.js` (about 6.9 KB brotli), banner with versions and date. Commit. Quiz and `/learn/` pages that need only reveals can use a smaller entry without `scroll` (about 3.8 KB).
2. `landing/shared/fx.js` (module, our own): reads `matchMedia('(prefers-reduced-motion: reduce)')`, exports nothing global, runs recipes 1, 2, 3, 10, 11 only when motion is allowed; every recipe is a no-op otherwise.
3. CSS: `[data-reveal]{opacity:0}` only inside `@media (prefers-reduced-motion:no-preference)` and under `html.js`; the CSS failsafe animation from section 8; everything else visible by default.
4. CSP: nothing to add for holding pages; for the quiz CSP in `landing/README.md`, `script-src 'self'` already covers `/shared/motion.js` and `/shared/fx.js` as external files. Do not add `animateView`.
5. Verification before launch: Lighthouse mobile with and without Motion (LCP, CLS, TBT), INP on a Galaxy A-class phone, axe with `prefers-reduced-motion: reduce`, and the existing `quiz.spec.ts`. Keep a flag to disable `fx.js` for the pooled-test control (`ux-cro.md` finding 2 and 5).

## 12. Motion+ items recorded separately

| Item | Needed? | Note |
|---|---|---|
| Motion+ Solo, US$399 one-time | No | Pay only if the team wants the 490+ example sources, MotionScore audits or the transition editor |
| AI Kit (MCP server and `/motion` skill) | Optional | Docs search and best practices are free with no account; spring generation, MotionScore and example source need Motion+ |
| `splitText` / `scrambleText` / `curtains` | No | Private `motion-plus` package with an access token |
| AnimateNumber, Carousel, Cursor, Ticker, Typewriter | No | React-oriented, paid |
| Team plan | No | Annual per seat, price UNVERIFIED |

If spring easing is wanted without paying for the AI Kit's CSS spring generator, the free hybrid `type: 'spring'` emits a native `linear()` easing (tested) at the 18.7 KB hybrid cost; a CSS `linear()` curve written once by hand costs nothing.

## 13. How I verified (for re-runs)

- npm registry JSON and unpkg file listings for `motion@14.1.0` and `framer-motion@14.1.0` (read-only requests).
- Sizes: esbuild 0.28.1 from the sibling `EMMA` repo's `node_modules`, a small esbuild plugin that fetched jsDelivr raw files into memory (nothing written to disk, nothing installed, no `npm install`).
- Behaviour: headless Chrome 154.0.8037.58 (reduced motion via the `--force-prefers-reduced-motion` flag; behaviour tests driven over the DevTools protocol), a local test server with the site's CSP, Motion 14.1.0 global bundle proxied from unpkg in memory, and the self-built ESM bundle for the script-src test. Harness files lived in the session scratchpad, not in this repo.
- Not tested: Safari, Firefox, Samsung Internet, a real mid-range Android, Lighthouse, Vercel's actual compression, visual fidelity of `animateView` or `animateLayout`.

## 14. Gaps and UNVERIFIED

- Motion+ Team per-seat price (not in the fetched HTML).
- Whether the official size claims are brotli or gzip (my brotli numbers match the hybrid claim; mini differs by 0.7 KB).
- Stability of the undocumented `reduceMotion` and `skipAnimations` options.
- Opera Mini behaviour (inside Statcounter's 3.54% Opera).
- Real-device INP and LCP impact; no evidence found that decorative motion lifts lead-form conversion (`ux-cro.md`), so treat all of this as polish with a hard budget.
- Motion's behaviour under reduced motion for `inView` and `scroll` callbacks (they have no motion of their own; only what you animate inside them matters).

## 15. Sources (all retrieved 10 Oct 2026)

- https://registry.npmjs.org/motion/latest and https://registry.npmjs.org/motion (version, licence, dependencies, publish times)
- https://unpkg.com/motion@14.1.0/?meta, .../dist/es/index.mjs, .../dist/es/mini.mjs, .../dist/motion.js, .../LICENSE.md
- https://cdn.jsdelivr.net/npm/motion@14.1.0/+esm and https://cdn.jsdelivr.net/npm/framer-motion@14.1.0/dom/+esm (chained imports)
- https://motion.dev/plus (price JSON-LD, FAQ, contents, Motion+ APIs) and https://motion.dev/docs/ai-kit (AI Kit contents; free versus Motion+)
- https://motion.dev/docs/quick-start, /docs/animate, /docs/scroll, /docs/inview, /docs/hover, /docs/press, /docs/stagger, /docs/view, /docs/layout-animations, /docs/svg-animation, /docs/split-text, /docs/performance, /docs/improvements-to-the-web-animations-api-dx, /docs/react-accessibility, /docs/react-animate-number, /docs/faqs, /docs/upgrade-guide, /changelog
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ScrollTimeline.json, /css/properties/animation-timeline.json, /api/ViewTimeline.json, /api/Document.json, /css/types/easing-function.json, /css/properties/interpolate-size.json, /css/selectors/details-content.json, /css/at-rules/starting-style.json, /css/at-rules/view-transition.json, /css/properties/animation-range.json, /api/Element.json, /api/IntersectionObserver.json
- https://gs.statcounter.com/browser-market-share/mobile/south-africa (September 2026)
- https://web.dev/articles/lcp (4 Sep 2025), https://web.dev/articles/cls (12 Apr 2023), https://web.dev/articles/inp (2 Sep 2025)
