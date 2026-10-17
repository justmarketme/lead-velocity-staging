# Handover: SortMyCover site redesign, SEO guides and imagery (16–17 Oct 2026)

Written by Claude Code for Jono, KG, Codex or the next Claude session. Read this, then `CODEX-BRIEF.md`, then `HANDOVER-CODEX.md` in `Desktop\EMMA`. Nothing here is deployed.

## 1. Where things are
| What | Where |
|---|---|
| Branch | `redesign/motion-diverse-2026-10-16` in `C:\Users\Jono\lv-site` (repo `justmarketme/lead-velocity-staging`, **public**) |
| Pull request | into `site-research` (see the PR link in GitHub; review only, do not merge without Jono) |
| Commit with this work | `00874ed` (plus this handover). The PR also carries 3 older unmerged snapshot commits from 15 Oct (`5c9f844`, `54a9c8b`, `ab69637`); the stock-photo parts of those are superseded by `00874ed` |
| Site code | `sites/sortmycover` (Vite + React 18 + Tailwind, pre-rendered static, hosted on Hostinger) |
| Local preview | `node sites/sortmycover/scripts/serve.mjs 4190` then `http://localhost:4190/`; campaign pages at `http://new-bond.localhost:4190/` (any slug). Dev server: `npm run dev` (campaign pages only work in the built site) |
| Marketing-skill context | `Desktop\EMMA\.agents\product-marketing.md` (private EMMA repo, pushed) |

## 2. What was done
**Design (Awwwards bar, brand kept).** Home page rebuilt in `src/pages/Home.tsx` with set pieces in `src/components/HomeMotion.tsx`:
- Hero: H1 "New bond. New baby. New job. *One call about cover.*", four-tile image mosaic (one household per group) with scroll parallax depth and a "Call booked" chip that springs in.
- Value strip (Who / How long / Effort / Cost), life-moment tab picker (5 moments, animated pill, keyboard arrows), scroll-linked journey with a sticky phone that changes screen per step (desktop) and inline phones (mobile), split-word headline reveals, magnetic primary buttons, dark final CTA.
- Type: DM Sans stays the brand face; **Instrument Serif italic** (OFL, self-hosted `public/fonts`, licence `instrument-serif-LICENSE.md`) for accent words only. Film grain `public/grain.png`. Styles in `src/styles/home-redesign.css` (imported first in `src/index.css`).
- Campaign landing pages share the serif accent and grain.
- Motion uses only the free MIT `motion` package already in the repo; guardrails in `src/lib/motion.ts` hold (reduced motion = no effects, H1/CTA never animated in, no inline styles, only `revealChildren` may hide content).

**Imagery (Jono's rules, 16 Oct).** No stock photos (5 Pexels files deleted). No "AI-generated" label. Every slot has its own image. All 25 scenes generated in **Higgsfield** (Nano Banana, 2 credits each, ~50 credits) because Claude in Chrome would not connect for Google Flow. Slots, alt text and prompts live in `src/content/imagery.ts`; files in `public/img/*.webp` (all under 200 KB); log in `image-sources.md`; brief in `flow-image-brief.md`. Re-import with `node scripts/import-scenes.mjs map.json`.
- Spread: Black, Coloured, Indian and white households rotate across home, the 10 campaign pages and the 2 hubs.
- Two scenes drifted from the prompt but read well: `moment-will` shows two older men with grandchildren; `c-new-bond` shows two men carrying a box. Regenerate if Jono wants man-woman couples there.

**SEO.** Research in `research/keyword-research-2026-10-16.md` (Google Trends ZA, past 12 months, + SA autocomplete; raw `google-trends-za-2026-10-16.json`; re-run `scripts/trends-za.mjs`).
- New guides (hub 4, `/learn/`): `what-is-credit-life-insurance` (SAnews 2017 regulations, NCR guideline, NCA s106(4)) and `estate-duty-south-africa` (SARS page, 19 Aug 2026), which also answers "inheritance tax south africa".
- Titles retuned to search wording: life cover, income protection ("salary protection"), severe illness ("critical illness or dread disease"), disability, what a will does ("what happens without one"), executor.
- Home "Read first" links to both new guides. Evidence entries added to `config/evidence.json` (`sars-estate-duty`, `sanews-credit-life-regs`, `ncr-credit-life-substitution`, all verified 16 Oct).
- Rule change (Jono): wills guides may cite verified SARS, Master/Justice, FSCA, NCR, ASISA, FPI sources, not only Capital Legacy (`tests/sections.test.ts`).

**Bug fixed (would have shipped).** Campaign subdomains 307-redirected top-level images to the apex, which the `img-src 'self'` CSP blocks, so every campaign photo would have been broken. Fixed in `src/build/hosts.ts` (generates `hostinger/.htaccess` and `vercel.json`) and `scripts/serve.mjs`.

## 3. Verified
- `npm run build`: 64 pages pre-rendered. `npx vitest run`: **298/298 pass** (new `tests/imagery.test.ts`; counts updated for the 2 new guides).
- Browser: desktop 1280 and phone 375 checked, no horizontal overflow, tabs and scroll phone work, 13/13 home images load, campaign image loads on `new-bond.localhost`.
- Secret scan of the branch diff before pushing to the public repo: clean.

## 4. Not done / open (in order)
1. **Review the PR** (Jono/KG). Compliance read of new copy: hero H1, value strip, moment picker lines, the two new guides.
2. **Deploy is gated.** Production = build + Windows `tar.exe -a -cf` real zip + Hostinger upload, only with Jono's go-ahead and alongside the other launch gates in `checklist/tasks.json` (lawyer review, DRY_RUN_SENDS, Meta checks).
3. Next SEO guides (see research doc section "Next content"): executor fees, dying without a will (Intestate Succession Act), "does income protection cover retrenchment?", how to write a will in SA.
4. Other pages (Cover hub, Wills hub, articles, About) still use the older layout; only Home and campaign typography got the new look.
5. Flow/Canva: Claude in Chrome never connected. Likely cause: two Claude accounts on this PC (this app session vs `lead.velocity2025@gmail.com` in the CLI login); the extension must be signed in to the same Claude account and organisation as the session. Native messaging host is installed and fine.
6. Decisions parked for Jono: funeral cover has the highest search interest but is excluded by rule; "life cover for parents" is popular but outside the quiz age band; retirement annuities out of scope.
7. Pre-existing, not touched: dev-server hydration mismatch warning (root has a comment node, falls back to client render); header overflows below 320 px.

## 5. Gotchas met this session
- Bash: backticks inside a double-quoted `node -e "..."` run as commands; heredocs with heavy quoting broke. Write files with the editor instead.
- ffmpeg inside a `while read` loop eats stdin; always pass `-nostdin`.
- Google Trends API rate-limits (429); the script backs off and pauses between calls.
