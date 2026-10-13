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
