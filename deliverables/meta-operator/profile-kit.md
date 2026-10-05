# SortMyCover Page + Instagram: profile kit (paste-ready)

Status: DRAFT v1.1 · 5 Oct 2026 (v1.1 = changes from `page-optimisation-research.md`: away message §1 #11, badge target §4 #4, IG pins, cadence §4 #1) · Owner: creative-strategist (for meta-operator / Jonathan to paste) · compliance-qa pass needed on every new string marked NEW.
Rules applied: 0.1, 1.1 (ICP), 1.2 (no broker/FSP on Page, IG, ads, site), 2.1.8 (no second-person claims about money, family or health), 4D.2, 4D.4a, 4.14 (W30/W31), disclosure-wording.md §4a (bios are consumer copy, not disclosure).
Character counts include spaces and punctuation. A line break counts as 1.

---

## 1. Facebook Page "SortMyCover"

| # | Field | Paste exactly | Chars | Notes |
|---|---|---|---|---|
| 1 | Intro / Bio | *(already set)* `We connect South Africans with licensed advisers to sort their insurance. We don't give advice.` | 95 | `BIO-FB-v3`. Limit 101. Leave it. |
| 2 | About → details (long text). **Option A, default** | `SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.` | 182 | `DISC-FULL-v1` verbatim. Fits even if the field is capped at 255. |
| 3 | About → details. **Option B** (only if the field accepts ≥ 247) | `Free 30-minute calls with licensed advisers, for South Africans. SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.` | 247 | NEW 64-char consumer sentence + one space + DISC-FULL-v1 unchanged. Third person, no price, no claim beyond "free" (the call is free, 0.1/4D.2 rule 5). |
| 4 | Username | `sortmycover` | 11 | Shows as @sortmycover. Page → Settings → Page setup → Username (menu names move; search "username" in Settings). If taken: stop and RECORD (setup-checklist G2a #5). |
| 5 | Action button **now** (no domain, no WhatsApp yet) | **Send message** (Messenger) | — | The only button that works with nothing live. It turns post CTAs and ad-curious visitors into a DM a person can answer (§4). Not "Call now", not "Get quote", not "Learn more" to an empty URL. |
| 6 | Action button **when the WhatsApp number is linked** (G4 #8) | **Send WhatsApp message** → the Cloud API number | — | Lands people in the W03 consent → qualify → book flow. This is the long-term button. |
| 7 | Action button if the domain is live but WhatsApp is not | **Learn more** → `https://sortmycover.co.za` | — | Never the staging host. |
| 8 | Website / email | Leave empty until GATE-DOMAINS and the hello@ alias test pass | — | setup-checklist G2a #6–7. |
| 9 | Messenger ice-breakers (Page → Inbox → Automations → FAQs) | 1. `How does the free call work?` 2. `Does SortMyCover give advice?` 3. `Who are the advisers?` | 28 / 29 / 21 | 4.14 setup. Questions, not claims. Answers come from the FAQ corpus (W31) or a person until W31 is live. Instant reply: **off** (4.14: we own the first reply). |
| 10 | Reviews / Recommendations tab | Off for now | — | 4D.4b.5 #6: proof only once it is real. Switch on after the first real calls. Meta can't delete single reviews; switching off removes all (page-optimisation-research.md #5). |
| 11 | Away message (Inbox → Automations), 22:00–07:00 SAST **NEW** | `Thanks for the message. SortMyCover replies from 07:00. We don't give advice ourselves.` | 85 | Added 5 Oct (research spec #3). It doesn't conflict with "Instant reply off": it only runs outside hours. Target: Meta's **Very responsive** badge (≥ 90 % response rate, < 15 min). Spam → Spam folder, finished → Done, so neither counts against the rate. compliance-qa to check the wording. (6 Oct self-check: "your message" changed to "the message" to keep the no-you/your rule; no advice, product, price or broker named.) |

**Pinned post (Facebook allows one): WU05 "Who gives the advice? Not SortMyCover."**
Why: anyone who sees an ad and taps through to the Page is checking one thing: "is this legit, and what's the catch?" WU05 answers it in the first line (no advice, a licensed adviser gives it, flat fee, no commission). It is the objection-busting post (Ethos pattern: remove the fear first), it backs every "scam?" reply in W30 (4.14 objection row), and it is the only post that shows the business model, which is what makes a broker-neutral Page believable. Swap to the WU04 Reel (§2, post 6) only if Page-visit → message rate is flat after 2 weeks of ads.

---

## 2. Instagram @sortmycover

| # | Field | Paste exactly | Chars | Notes |
|---|---|---|---|---|
| 1 | Username | `sortmycover` | 11 | |
| 2 | Name (searchable; limit 64) | `SortMyCover \| Life cover & insurance, explained` | 47 | NEW. IG search matches the Name field, so it carries "life cover" and "insurance". "Explained" = educational (4D.2 rule 5), no "best", "cheap", "advice", "help" or "guarantee". IG allows 2 name changes per 14 days: set it once. Type the bar as a plain `\|` (the backslash above is Markdown escaping only). Fallback if Jonathan wants the brand alone: `SortMyCover` (11). |
| 3a | Bio **(decided, valid)** | `We connect South Africans with licensed advisers to sort their insurance, on a free 30-minute call. We don't give advice ourselves.` | 131 | `BIO-IG-v3`. Compliant as is. |
| 3b | Bio **(recommended, NEW `BIO-IG-v4`)**, 4 lines | see block below | 147 | Same facts, re-ordered for conversion: the offer first (the first ~40 characters show in search and previews), the "no advice" line kept word for word, plus a soft CTA that matches the Message button. No "you/your". |
| 4 | Category | `Education` (fallback `Website`). Display category: **off** | — | Never finance/insurance (setup-checklist G2c #6). |
| 5 | Contact / action buttons | Now: **Message** only. Later: add the **WhatsApp** button (Edit profile → Action buttons) once the Cloud API number is linked; link = `https://sortmycover.co.za` after GATE-DOMAINS | — | No phone, no address. |

`BIO-IG-v4` (147 = 41 + 50 + 31 + 22 + 3 line breaks):
```text
Free 30-min call with a licensed adviser.
We connect South Africans to sort their insurance.
We don't give advice ourselves.
Questions? Message us.
```
Change "Questions? Message us." to `Book on WhatsApp below.` (23, total 148) once the WhatsApp button exists.

### Highlights (covers in `brand/exports/instagram-highlights/`, use the 1080×1080 file as the cover, the 1080×1920 as the first story frame)

| Order | Highlight title | Cover file | Stories inside (third person, no broker names or faces, no prices) |
|---|---|---|---|
| 1 | How it works | `highlight-how-it-works-*.png` | WU05 shared to story; 3 frames: "A person asks for a call" → "SortMyCover books it, then steps back" → "A licensed adviser gives the advice". |
| 2 | What to expect | `highlight-what-to-expect-*.png` | WU04 shared to story; the WU04 Reel (post 6) when it exists. |
| 3 | FAQ | `highlight-faq-*.png` | Frames from post 7: Is the call free? · Does SortMyCover give advice? · Who pays SortMyCover? (flat fee per 30-day cycle, never commission, from WU05) · Is there any obligation? |
| 4 | Advisers | `highlight-advisers-*.png` | Post 9: "Every adviser is an authorised financial services provider. Their name and FSP number come in the first WhatsApp, before any call. Any FSP can be checked on the FSCA register." **Never** a real adviser's name, face or FSP number here (1.2: those appear only in the first WhatsApp). |

Titles ≤ 15 characters so they don't truncate. A highlight needs at least one story; post the story first, then Add to highlight → Edit cover.

### First 9-grid (posting order; the grid shows newest top-left)

| Post | What | Status | Why it is on the grid |
|---|---|---|---|
| 1 | WU05 How SortMyCover works (4:5) | Ready (edited §3) | Who we are and that we don't advise, first |
| 2 | WU01 Life cover gap (4:5) | Ready | The core idea: work cover vs family costs (1.1 core insight) |
| 3 | WU02 Payslip cover line (4:5) | Ready | Practical, saveable; speaks to the employed ICP |
| 4 | WU03 Life events (4:5) | Ready | Trigger events: bond, baby, marriage, job, business |
| 5 | WU04 30-minute call (1:1) | Ready | Removes fear of the unknown (main no-show driver, H10) |
| 6 | Reel R01 "Who gives the advice?" (20 s, 9:16) | **Scripted + build data** (`week1-posts/D3-reel-R01.md`) | First video → fills `SMC_ENG_video75_30d` |
| 7 | Carousel C-FAQ "Four straight answers" (5 cards, 4:5) | **Copy + build data** (`week1-posts/D5-faq-carousel.md`) | Feeds the FAQ highlight; pre-answers W30 objections. Card 5 = "Who are the advisers?" (replaces post 9's content) |
| 8 | Reel: H4 "New bond. New baby. Same old cover?" | **To make** (from 4D.4a, organic cut) | Second video; trigger-event hook |
| 9 | Static: "Who are the advisers?" (copy in Advisers row above) | **To make** | Trust; feeds the Advisers highlight |

**Pin on IG (3 allowed), updated 5 Oct:** WU05, Reel R01 (post 6), FAQ carousel (post 7). Until R01 and the carousel are up, pin WU04 and WU01 in those slots. Why the change (page-optimisation-research.md #3): people who come from an ad have already seen the gap angle, so the top row should answer "is this legit, what happens, what's the catch". Carousels are also IG's highest-engagement format (Socialinsider, B).
**Grid crop:** the IG profile grid shows a 3:4 crop. Check each thumbnail after posting (Edit → Adjust preview) so the headline isn't cut; WU04 (1:1) loses the most at the sides.
Posts 6–9 go to visual-producer (code-rendered, brand lock) and compliance-qa, same rules as WU01–05.

---

## 3. ICP check of WU01–WU05 (against 1.1) and the edits made

**ICP (1.1):** 35–50, employed or self-employed, partnered, children at home, bond/vehicle finance, believes work cover is enough, often supports extended family; triggers = new bond, new baby, marriage, job change, starting a business.

| Post | Speaks to | Gap before | Edit made in the WU file |
|---|---|---|---|
| WU01 | Employer-cover gap, bond, school fees, relatives who depend on the income: dead-on ICP | First line "What is a life cover gap?" is a definition, not a hook; no next step | New first line: "Cover through work and a family's costs are often two different numbers." (third person, the 1.1 core insight). The old question line removed. Soft CTA added |
| WU02 | Employed people reading a payslip; bond/baby triggers | Good hook already; no next step | Soft CTA added only |
| WU03 | All five 1.1 triggers, listed | First line abstract; the triggers sat in the body | New first line "New bond. New baby. New job." (H4 three-beat rhythm, Sharp category entry points) above the existing line. Soft CTA added |
| WU04 | The call, the bond, debts, work cover | "free" missing (the image says it) | "a 30-minute call" → "a free 30-minute call". Soft CTA added |
| WU05 | The sceptic checking the Page | Hook didn't match the image headline | New first line "Who gives the advice? Not SortMyCover." (= image headline, objection first). Soft CTA added |

**The soft CTA (NEW, all five posts, placed just above the disclosure):**
`Questions about the free 30-minute call? Send us a message.` (59)
Checked: no advice, no price, no guarantee, no "you/your", no link. It points at the Page **Send message** button (§1 #5).

**Not used: "Comment or message 'CALL' to ask how it works".** Two reasons. 4.14 bans comment-bait keywords for this brand ("You never: comment-bait ('comment YES')"; ManyChat pattern "not the growth-hack keywords"). And Meta demotes posts that ask for comments as engagement bait, which would hurt the warm-up reach we are paying for. W30 still turns any natural comment into one private reply.

**Kept:** DISC-S97-v1 as the last line of every post (website-wording.md and disclosure-wording §4a don't change post endings; §4a only moved disclosure out of the *bios*). All five still pass the README self-check rules. Counts updated in each file. FB texts are now 542–674 characters (README guideline was ~600; WU01–02, WU04 are a little over. The hook sits before Facebook's "See more" cut either way).

---

## 4. Conversion rules for this Page (FB + IG)

1. **Cadence (updated 5 Oct, research spec #1, #6, #7).** Warm-up: 7 posts over 7 days at 18:00 SAST (`week1-posts/README.md`: 5 WU stills + Reel R01 + FAQ carousel). After that: **3–4 posts a week** (Rival IQ financial-services median ≈ 4.3/wk, B), with **at least 1 Reel and 1 carousel a week**. Always educational and original (IG stops recommending accounts that mostly repost). Every post = one idea, third person, ends with DISC-S97-v1. Same post to FB and IG. **≤ 5 hashtags** (IG hard cap since Dec 2025; extra tags are ignored). Share each feed post to Stories the same day; that feeds Highlights. Test a 07:00 slot against 18:00 only after 4 weeks of Insights.
2. **Comment-to-DM (W30).** One public reply per comment (≤ 2 sentences, Grade 5–7, no link) + one private reply (once, within 7 days) with one line on what happens and, once live, the WhatsApp (CTWA) link with `ref=cmt_{ad_id}`. Max 2 public exchanges per person per post, then "let's continue privately". Until W30 is live, Jonathan/KG do exactly this by hand.
3. **DMs (W31).** Say it's SortMyCover (and "assistant (AI)" once W31 answers); answer from the FAQ; one qualifying question only if they reply; move to WhatsApp. **Before WhatsApp is live:** answer the question, never ask for or store a phone number in Messenger/IG, and don't message again unless they reply (no consent to market, 2.1.2).
4. **Response time.** Public replies < 15 min, 07:00–22:00 SAST (5 min in a new ad's first 2 h); private reply ≤ 5 min after the public one; **Messenger/IG DMs < 15 min with ≥ 90 % answered** (Meta's "Very responsive" badge threshold, A; away message §1 #11 covers 22:00–07:00); overnight queue answered from 07:15. Complaints: a human within 30 min. Sensitive (illness, death, claims): human only, private only.
5. **Hide, don't delete.** Spam, abuse, competitor links: hide within 10 min. Someone posts their own number or ID: hide at once (POPIA) and send one private note. Never delete criticism; answer objections once, calmly, in public.
6. **Profanity filter on; hidden-words list** (slurs, scam phrases, competitor URLs, phone-number pattern): HUMAN GATE, Jonathan approves the list (4.14).
7. **Every objection seen 3 times** becomes a line in an ad, a FAQ frame or a post (4.14 hygiene → creative-strategist).

**Never post (Page, IG, stories, replies):**
- a premium, price, "from R…", cover amount, or any rand figure; a "2–4×" salary figure (NH-PCD-01)
- an insurer, product, broker, practice name, adviser face or FSP number (1.2)
- "you/your" claims about money, debts, family or health ("your cover is too low") (2.1.8); "black tax" or any labelling
- advice or "you should"; "best", "cheapest", "guaranteed", "risk-free"
- fear or death-shock images; countdowns or fake scarcity
- testimonials, reviews or "X families helped" that aren't real and consented (4D.4b.5 #6); AI people shown as clients or advisers
- comment-bait or engagement-bait ("comment CALL", "tag a friend", "like if…"); "DM us!!" on every comment
- links to the staging host or to leadvelocity.co.za's B2B pages; bare links in public replies
- the Boost button for warm-up: use the Reach campaign in Ads Manager (G8 #3)

---

## 5. Open (for Jonathan / compliance-qa)
- **About field length:** current guides disagree (155 / 255 / longer). Paste Option A (182). If the field takes Option B (247) without cutting, use B. RECORD which one stuck.
- **IG Name** (§2 #2) and **BIO-IG-v4** (§2 #3b): NEW, pick v3 or v4; compliance-qa to confirm.
- **Soft CTA + WU hook edits:** NEW strings, part of the existing compliance-qa pass on WU01–05 (G8 #1).
- setup-checklist G2a #12 now names the "Send message" button for the no-domain period; G2b #1 now says Bio `BIO-FB-v3` (was the stale S97).
