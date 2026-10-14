# Codex brief: SortMyCover site rebuild + ad creatives
Owner: Jono (Jonathan Jettoo) · Written by Claude Code, 13 Oct 2026
Repo: `justmarketme/lead-velocity-staging`, branch **`site-research`**, folder **`sites/sortmycover`** (Vite + React + TypeScript, pre-rendered static, hosted on Hostinger).

## 1. What you're doing
1. **Rebuild the look of the site** so it feels premium and human (real-looking imagery, stronger layout), without breaking how it works.
2. **Create the ad creatives** for the first Meta campaign (images; video goes to Higgsfield, final layout tweaks in Canva).

Claude Code keeps owning: deploys to Hostinger, Meta (ad account, Pixel, campaign), WhatsApp/Twilio, n8n automations, the CRM, compliance checks. **Don't deploy.** Commit on a branch off `site-research` (e.g. `codex/redesign`) and say when it's ready.

## 2. Who it's for
South Africans aged **35–50**, breadwinners with a bond and children, roughly R35k–R55k a month, in Joburg north, Pretoria east/Centurion and Cape Town/Winelands. Second audience: business owners and directors.
**Product:** a 30-minute call with a licensed financial adviser about **life cover, disability, severe illness and income protection**, plus **wills** via Capital Legacy. SortMyCover connects people to the adviser; it never gives advice itself.

## 3. Must not break (functional contract)
- **Quiz v2** (`src/components/Quiz.tsx`, `src/lib/quiz.ts`, `src/lib/api.ts`): steps = what they'd like help with → age band (under 35 / 51+ exit) → first name + mobile → consent → booking. **No budget question on the page.** Email is asked **only** at booking confirmation. Payload fields and endpoints stay as they are.
- **Consent text and its version ids** stay word for word (POPIA). Privacy/terms pages keep their content.
- **Meta Pixel** stays consent-gated (`src/lib/pixel.ts`); `config/site.json` pixel_id / domain_verification stay.
- **Routes and the 10 campaign subdomains** (`config/angles.json`, `_c/<slug>/`, Hostinger `.htaccess`) keep working; each campaign page keeps its own headline.
- `npm run build` and `npm test` must pass. Don't delete tests to make them pass.

## 4. Brand (verified — use exactly)
- Colours: amber **#F5A623**, charcoal **#1F2933**, off-white **#FBF8F2**, text on amber **#2A1B02**. Tokens: `lv-release/brand/tokens.css` (already mirrored in the site).
- Font: **DM Sans** 500 / 800.
- Logo: "SortMyC✓ver" — the O is an amber circle with a tick. SVGs in `lv-release/brand/logo/` (charcoal and off-white versions). Never rebuild it as plain text.
- Tone: calm, plain, specific. "A conversation, not a quote."

## 5. Copy rules (hard — Meta policy + FAIS advertising rules)
- **Third person only** about circumstances. ✅ "Most cover is set once and never checked." ❌ "You have cover. But are you sorted?" ❌ "Your family is unprotected."
- No premiums or prices, no insurer names, no "best / right / appropriate cover", no "save", "cheaper", "overpaying", "compare", no "free", no "instant cover".
- The adviser does any review: "Ask a licensed adviser whether the cover still fits." Never "we review your cover".
- CTA wording: "Book a 30-minute call" / "Book a call with a licensed adviser".

## 6. Imagery rules
- No AI-generated people presented as clients, testimonials or advisers (Meta labels realistic AI people; the regulator is cracking down on fake faces in financial ads).
- Prefer: hands, objects and homes (bond papers and keys, a school bag, a laptop calendar, a kitchen table), real stock photography of South African families, or illustration. If any realistic AI person appears, it must be clearly decorative and labelled "AI-generated imagery".
- **Mark Weston (Oracle Brokers)** may appear only with a real photo and his written consent — leave a placeholder slot, don't generate his likeness.

## 7. Ads to create (cycle 1)
Three angles, each with the journey visual: **life moment → SortMyCover → book a 30-minute call → licensed adviser → clarity**.

| Angle | Headline (live on its landing page) | Supporting line | Landing page |
|---|---|---|---|
| Bond + income | "Bond approved. One more item for the list." | A 30-minute call with a licensed adviser about what protects the bond if the salary stops. | new-bond.sortmycover.co.za |
| Salary stops (disability / income protection) | "Some people insure the car before the salary." | Disability and income cover, explained by a licensed adviser in 30 minutes. | salary-stops.sortmycover.co.za |
| Named adviser (needs Mark's consent) | "Meet Mark. 30 minutes. Your questions." | Licensed adviser · FSP number on the ad. | adviser-conversation.sortmycover.co.za |

Per angle: **2 statics** in **4:5 (1080×1350)** plus a **9:16 (1080×1920)** version of each; optional 1:1 (1080×1080). Logo top-left, headline large, journey strip, CTA button in amber with charcoal text #2A1B02. Keep text inside Meta's safe zones (top 14% / bottom 20% clear on 9:16). Export PNG to `deliverables/ads/cycle1/<angle>/`.
Use the corrected layout of Jono's "Start Your Cover Check" concept as a reference, minus the second-person copy and minus "Chat to Mark" (it's a booked call).

## 8. Site redesign goals
- Hero that shows the journey in one glance and a real human feel.
- Keep pages fast (static, small images, AVIF/WebP), accessible, mobile first.
- Keep the information architecture: home (cover + wills), /cover/ hub + 4 guides, /wills/ hub + guides, /privacy, /terms, the 10 campaign pages.

## 9. Hand-back
Tell Claude Code: branch name, what changed, `npm run build` + `npm test` results, and screenshots of home + one campaign page on mobile. Claude Code then reviews compliance, deploys, and points the ads at the pages.

## 10. STATUS AT HANDOVER (13 Oct 2026, written by Claude Code)
**Live checklist (source of truth):** https://claude.ai/artifact/JccX7b52ooU4brtX68Gdiy. Read it first.

**Done and live**
- Meta: ad account `1651253736358759` (ZAR, SAST), Pixel `1088568384160686`, domain verified, Page `61595175929084` linked to Instagram @sortmycover. Card added; account spending limit R3,000 (about R3,450 with 15% VAT).
- Campaign **draft** `SMC | Leads | Cycle 1 | Quiz` (campaign 120248625965480618, ad set 120248625965470618, placeholder ad 120248625965490618). All toggles OFF. R150/day, ages 35-50 hard, 78 affluent suburbs across all provinces, FB + IG feeds/Stories/Reels. Destination is currently `https://sortmycover.co.za/book/`; change it to the per-angle landing pages from section 7 if you prefer.
- WhatsApp sender +27 60 015 6480 ONLINE, 9 templates approved. Voice receptionist Lindi answers the same number.
- Broker portal: bio approval, intro card (waiting for Mark), ad likeness consent, per-ad approval, change requests.

**NOT done: do not publish until these are ticked in the checklist**
1. Privacy and terms pages still carry "DRAFT for practitioner review". A lawyer must review them, then the draft line comes off.
2. Information Officer is changing to Kgomotso Pule (commit 8b66748 on `site-research`); the build is ready but not yet uploaded to Hostinger.
3. n8n WhatsApp sends are still in test mode (`DRY_RUN_SENDS=true`). Leads from ads would get no WhatsApp until it is switched off.
4. Mark must approve his bio, his intro card and (per ad) the use of his name and face. Any ad that shows Mark stays out of the campaign until he approves it in the portal.
5. Meta needs: account info confirmed in Account Overview, and Advertiser/Payer filled in for ad transparency.

**What Codex should deliver:** section 7 ads and section 8 site. Hand back as in section 9. When you hand back, also tick or comment on these checklist items: "Hand over to Codex", "Decide on the site redesign".

**Reminder for Jono (check in the morning):** the site redesign decision is still open ("Decide on the site redesign: Codex review?"). If you read this and it has not been decided, remind Jono at the start of the session.

## 11. Second task: emails
See `docs/CODEX-EMAIL-TASK.md` in `lead-velocity-staging` (branch `release/smc-nurture`): move every Lead Velocity email onto the shared layout `supabase/functions/_shared/lv_email.ts`. Do this after, or alongside, the ads and site.

## 12. Third task: Microsoft publisher verification
Full pack in `docs/MS-PUBLISHER-VERIFICATION.md` (repo `lead-velocity-staging`, branch `release/smc-nurture`). Jono/KG do the Partner Center sign-up and terms (accounts and agreements are not for Claude/Codex to create). You do the domain proof (DNS TXT at GoDaddy), the MPN ID link-up in Entra, and the test with a non-admin user, via the browser once signed in. Remind Jono at the start of the session if step 1 is not done.
