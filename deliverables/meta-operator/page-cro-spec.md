# SortMyCover Page CRO build sheet

v1.0 · 6 Oct 2026 · owner: meta-operator · covers the Facebook Page "Sort My Cover" (profile ID 61595175929084), Messenger, Instagram @sortmycover (not created yet) and sortmycover.co.za.

**Rules on every surface.** CTA exactly `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za` (80). Closing line exactly `SortMyCover gives no financial advice, product comparisons or premium quotes.` (77). Lead Velocity is never named on a consumer surface (privacy.html and terms.html only). No advice, products, insurers, brokers or prices. No you/your claims about money, family or health. No engagement bait. Nothing collected in a DM beyond what row 13 allows.

**Who acts.** Jonathan makes every Page, Messenger and Instagram change. Devops makes site changes. compliance-qa (cqa) passes every string marked NEW before it goes live.

**Status legend.** DO NOW: no gate. NEW: string needs cqa. BLOCKED D1: waits on §0. GATED: waits on the named gate. VERIFIED: both judges passed it unchanged. LATER: the asset doesn't exist yet. DONE.

---

## 0. Blocking decision D1: where does a booking actually complete?

**Facts (checked in the repo, 6 Oct).**
- Live `landing/holding/book.html`: "Online booking is not open yet. Send us a message on Facebook Messenger to ask for a time. A person reads every message and will reply." and "We reply with times to choose from." Every site CTA points here. There is no slot picker and no consent form on sortmycover.co.za.
- The judges' default for Messenger (NH-67 item 4, row 13): Messenger and Instagram collect nothing, pass nothing to an adviser, and end replies with the landing CTA.
- Together these loop: site → Messenger → site. Under the default, no one can book. The live promise "We reply with times to choose from" cannot be kept.
- The judges' fixes are split on this. FAQ #1, book.html and Instant reply drafts assume a person offers times in Messenger. SR1, SR2, the data rules and NH-67 assume Messenger books nothing.

**Options (Jonathan decides, cqa gates).**

| Option | What it means | Needs | Rows it unlocks |
|---|---|---|---|
| **A. Messenger is the interim booking channel** | A person offers times and books in Messenger. | cqa writes one Messenger notice and consent line saying the first name and chosen time go to the adviser, and why. Jonathan approves. Video only. Times only inside the adviser's set hours (default Mon–Fri 09:00–17:00, max 3 calls a day, at least 2 h notice; term-sheet-mark.md item 2), and within 7 days of the person's last message (Messenger human-agent window). No phone, email, ID, health or bank details. | FAQ #1 as written, SR1-A, SR2-A, row 43 items (1) and (4). Fastest, no code. |
| **B. Booking on the site** | The slot picker and consent (GET /slots, POST /book) ship to production book.html. Messenger answers and routes. | Devops deploy; cqa on the consent text. | SR1-B, SR2-B, row 13 as written, action button → Book now (row 7a). |
| **C. WhatsApp first** | W03 takes bookings with its own consent. | Twilio sender, business portfolio (velocity block), Lead Velocity scrub (row 61). | Row 61. |

**Until D1 is decided:** row 13 applies. A person answers questions by hand. FAQ #1, SR1 and SR2 stay off. Decide before Page traffic or ads grow.

---

## 1. Top-5 experts and why

| # | Expert | Why picked (one line) |
|---|---|---|
| 1 | Robert Cialdini | Most-cited living influence researcher (~55.8k citations, h-index 86), backed by field experiments; drives the norm and proof rules (P8, P9). |
| 2 | BJ Fogg (Stanford) | Web-credibility studies with 2,684 people, guidelines from 4,500+, and the B=MAP model; drives checkable trust and ability (P1, P6). |
| 3 | Jakob Nielsen / NN/g | Empirical usability research since 1998 on trust, reading and information scent (P4, P5, P6). |
| 4 | Peep Laja (CXL) | Voted #1 CRO expert 2015 and 2016; method-led "clarity beats persuasion" and research-before-opinion (P5, measurement). Practitioner grade. |
| 5 | Oli Gardner (Unbounce) | Attention ratio and message match, plus a 41k-page / 57M-conversion benchmark (correlational) (P1, P4). |

Not picked: Joanna Wiebe (close sixth; single-client tests, C). Russell Brunson (self-reported results, C; Hook-Story-Offer kept only as a layout check). Deiss and Patel (no controlled public research found).

---

## 2. The 10 principles that drove the spec

Grades: **A** = Meta's own documentation or platform behaviour, or a binding internal rule. **B** = peer-reviewed research, meta-analysis, or a large or Meta-commissioned dataset. **C** = practitioner opinion or a single-company test.

| ID | Principle | Evidence | Grade |
|---|---|---|---|
| P1 | **One path that completes, one CTA per surface.** No loops between Page, site and chat. | Meta one-action-button rule; Fogg ability; Gardner attention ratio (Unbounce 6:1 → 1:1 +40%, single test); Chernev 2015 choice overload under complexity. | A (mechanics) / C (lift size) |
| P2 | **Speed to lead.** A person replies in minutes, not hours. | Oldroyd/MIT with InsideSales: 5 vs 30 min = 21x odds of qualifying. HBR 2011: within 1 h ≈ 7x. Meta Very responsive badge = ≥90% rate, ≤15 min, last 7 days. | B (lead studies) / A (badge) |
| P3 | **Concrete times, short list.** Asking for a date and time turns intent into a plan. | Milkman et al. 2011 PNAS field RCT: +4.2 points over 33.1%. Scheibehenne 2010 (d≈0.02); Chernev 2015 (overload when complex and unsure). | B |
| P4 | **Message match.** Same words from ad to Page to site to chat. | NN/g information foraging (Pirolli and Card); Meta m.me docs; Gardner "never failed" claim untested. | B / A (m.me) / C (Gardner) |
| P5 | **Clear in the first seconds, plain words.** | Liu, White and Dumais 2010 (2bn+ dwell times, screen-and-glean); Nielsen 2008 (20–28% of words read); Unbounce 2024 finance subset (grade 5–7 copy 18.1% vs 6.5%, correlational); Reber and Schwarz 1999; Alter and Oppenheimer 2006. | B |
| P6 | **Trust that can be checked.** Real organisation, verifiable claims, third-party check (FSCA register). | Fogg 2,684-person study and 4,500+ guidelines; NN/g four credibility factors; Edelman 2025 (FS trust 50% among low-income); Meta Page transparency. | B / A (transparency) |
| P7 | **Answer "what's the catch?" next to "free".** | Shampanier, Mazar and Ariely 2007 (zero-price effect); NN/g on hidden costs. | B |
| P8 | **Honest proof only.** No fake social proof; show the process; two-sided honesty; no scarcity, urgency or bait. | Goldstein et al. 2008; Buell and Norton 2011; Eisend 2006 meta-analysis; Ein-Gar 2012; Meta clickbait and engagement-bait demotion. | B / A (Meta) |
| P9 | **Never make inaction sound normal.** | Cialdini Petrified Forest: negative descriptive sign raised theft to 7.92% vs ~2.9% with no sign. | B |
| P10 | **Reassurance short, positive, at the point of action.** | Brough et al. 2022 JMR "bulletproof glass" (prominent privacy notices can cut trust); Aagaard/ContentVerve (−18.7% vs +19.5% by rewording). | B / C |

---

## 3. Build table, in priority order

Long instructions are in §3b (block **Bn** = row n). Copy strings are in §3c with character counts. Use the exact strings; don't retype them.

### 3a. Table

| # | Pri | Surface | Field / feature | Set to | Exact copy | Why (principle + grade) | Where in UI | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | 10 | ops | **D1: where a booking completes** | Jonathan + cqa pick A, B or C (§0). Until then FAQ #1, SR1, SR2 stay off and Messenger takes no bookings. | — | P1 (A) | needs-human-log NH-67 item (5) | **OPEN · blocks rows 12, 18, 21, 43** |
| 2 | 10 | facebook | Pre-flight: every scheduled + published post | See B2. Check WU05 (6 Oct, likely live now), C03 (7 Oct), C02 (8 Oct), C01 (9 Oct), the unnamed 5th scheduled post, and live WU01 + WU02. | WU05-FEE, C01-ALT | Hard rule DW-v2 (A); P4 (B); P8 two-sided (B, Eisend) | Business Suite → Content → Posts & reels → Scheduled / Published → … → Edit post | C01 rand figure **DONE** (commit 0bb9e37). Rest **DO NOW**, before each 18:00 |
| 3 | 10 | facebook | Link-post allowance (2 organic link posts a month for Pages in Meta's test) | See B3. Run the read-only check now. **WU01 and WU02 already used October's 2 if FB linked their domain.** | FB-FALLBACK-A / B1 / B2 | P1; Meta Help "About links in organic Facebook Page posts and comments" (A); TechCrunch Dec 2025, Meta One Sep 2026 (B) | Business Suite composer + the Page's own composer | **CHECK NOW** · fallbacks NEW (Jonathan + cqa) · precondition row 6 |
| 4 | 9 (was 3) | landing | OG link-preview image | Replace the live hook "Understand your cover gap…" and publish it under a new file name. See B4. | OG-HOOK | **Live breach**: claim about the reader's finances plus needs-analysis framing, shown on every Page link card (profile-kit never-post 2.1.8; cqa F2-1) (A); P4 (B) | brand/templates/og.html → render.mjs → landing/holding/; Sharing Debugger | **DO NOW** (devops) · NEW |
| 5 | 9 | ops | Gate log entry **NH-67** | Append B5 to the log. NH-61 to NH-66 are already used across the repo, so the next free ID is NH-67. | B5 | Internal rules (A) | build/needs-human-log.md | **DO NOW** |
| 6 | 9 | messenger | Instant reply | **On now** with INSTANT-v1. Off when W31 is live (W31's opener must then carry the same notice plus AI disclosure). Overrides MASTER-PROMPT l.1237 and profile-kit §1 #9; recorded as NH-67 item (9). Test from a personal account: if an FAQ answer and the instant reply both fire on one tap, log it. | INSTANT-v1 (257) | The direct Page → Messenger path skips book.html's POPIA notice (A internal, POPIA s18); automation must be disclosed (MASTER-PROMPT 4.14, A); P10 (B); instant replies don't count against the badge (A, Meta Help 546874462185280) | Business Suite → Inbox → Automations → Instant reply → Messenger → On | NEW · cqa + Jonathan signs the override |
| 7 | 9 | facebook | Action button | Keep the default Send message / Message button. (a) Switch to Book now → `https://sortmycover.co.za/book.html?utm_source=fb&utm_medium=page_button` only when the slot picker is live (D1 = B). (b) Switch to Send WhatsApp message only through row 61. Never Get quote (FAIS), Call now, or Sign up. Update profile-kit §1 #7 and setup-checklist G2a #12 to this rule. | Label as Meta shows it: Send message | P1: one action button (A, business/help/2150969905216708); 56% prefer messaging (B, Facebook IQ/Nielsen); lift size (C) | Page → … (Options) → Edit action button → Next → Save (facebook.com/help/977869848936797). Check from a logged-out phone. | **KEEP** · verify on phone · doc update |
| 8 | 9 | facebook | Ratings and reviews | Off now. Reopen only when (1) real calls have happened, (2) cqa signs off, (3) the kill rule is live. Kill rule: check daily; a review naming an adviser, practice, insurer or product, giving a price, or sharing health or ID details → Reviews Off the same day. Never ask for reviews, no incentives. Replies: general thanks only; never confirm a booking, date or adviser. | n/a (toggle Off) | "Not yet rated (0 reviews)" on a 1-day-old finance Page reads as unused; P8 (B, Goldstein 2008); single reviews can't be deleted (A, Meta Help 548274415377576) | Switch into Page → profile photo → Settings & privacy → Settings → Page and tagging → toggle "Allow others to view and leave reviews on your Page?" Off. Check in a private window. | **DO NOW** |
| 9 | 9 | facebook | Website field | One clean URL, no UTM. Never staging, *.vercel.app or leadvelocity.co.za. This field can't be measured: Insights dropped Page website clicks (Sep 2024) and the site collects nothing. Do not add referrer or fbclid capture. Email field stays empty (row 58). | `https://sortmycover.co.za` | P6 (B, Fogg; NN/g). Overrides stale profile-kit §1 #8. | Switch into Page → About → Contact and basic info → Websites and social links → Add a website → Save | **DO NOW** |
| 10 | 9 | messenger | Response time, triage, badge | See B10. 07:00–22:00 SAST: first human reply within 5 min, 15 min hard limit. One reply owner per shift. | OPT-OUT (NEW) | P2 (B, Oldroyd/MIT; HBR 2011); badge rule (A, Meta Help 475643069256244) | Business Suite Inbox; app notifications; Page access; Accounts Centre 2FA | **DO NOW** |
| 11 | 9 | messenger | Away message | On every day 22:00–07:00 Africa/Johannesburg. Replaces profile-kit §1 #11. Week-1 test: does a second message while Away re-trigger it? | AWAY-v2 (267) | P2; P10 (B, Brough); away messages and messages received while Away are excluded from badge metrics (A, Meta Help 546874462185280, 800788243369168) | See B11 | NEW · cqa |
| 12 | 9 | messenger | FAQ #1 (ice-breaker) | Automation On once cqa passes the set. "One tap" only works after book.html drops `?text=` (row 43). If W31 later sets ice-breakers by API, it must publish this same set, because API ice-breakers override Inbox ones. | FAQ1-Q (37) + FAQ1-A (390) | P3 (B, Milkman); P4 (B, NN/g); P10 (B) | Business Suite → Inbox → Automations → Frequently asked questions → Messenger → Add question. Test in an empty thread from a personal account. | NEW · **BLOCKED D1** (answer = D1-A wording; for D1-B swap sentence 2 for SR1-B sentence 2) |
| 13 | 8 | messenger | Messenger + IG data rules | See B13. Default until D1: DMs collect nothing and pass nothing to an adviser. | DATA-REPLY (137) | POPIA minimisation; profile-kit §4 #3 (A internal); P10 (B) | Every Inbox thread | **LIVE NOW** as the rule · DATA-REPLY NEW · replaced if D1 = A |
| 14 | 8 | messenger | Business Agent + AI suggested replies | Off. Never run the setup wizard; tap "Not now" on every Business AI prompt. AI suggested replies Off for messages and comments; "Activity and tool suggestions" Off if present. Then confirm Away and Instant reply are still active. See B14. | n/a | The agent recommends products and prices and learns on its own (FAIS risk); turning it on pauses away and instant replies (A, Meta Help 1505847033372169, 395965998733706, 1105546398456682) | See B14 | **DO NOW** |
| 15 | 8 | messenger | FAQ #2 | Question 2 of the set. | FAQ2-Q (29) + FAQ2-A (218) | P8 two-sided (B, Eisend); FAIS no-advice (A) | As row 12 | NEW · cqa · NH-67 (3) |
| 16 | 8 | messenger | FAQ #3 | Question 3. Replaces profile-kit slot 3 "Who are the advisers?" (dropped, §4). | FAQ3-Q (24) + FAQ3-A (353) | P7 (B, Shampanier; NN/g) | As row 12 | NEW · cqa |
| 17 | 8 | messenger | FAQ #4 | Only if Jonathan approves four FAQs (NH-67 (2)). Otherwise drop it, and SR4 carries the FSCA check. | FAQ4-Q (38) + FAQ4-A (281) | P6 (B, Fogg; NN/g; Edelman 2025) | As row 12 | NEW · cqa · NH-67 (2)(3) |
| 18 | 8 | messenger | Saved reply SR1 (first human reply) | Create the variant D1 picks. SR1-A only: slots inside the adviser's set hours and within 7 days of the person's last message; replace every bracket by hand. | SR1-A (296) or SR1-B (295) | P3 (B, Milkman; Chernev); P2 (B) | Inbox → open thread → saved-replies icon → + Create saved reply. Shortcut `sr1` (no spaces). | NEW · **BLOCKED D1** (SR1-B is false until the slot picker is live) |
| 19 | 8 | facebook | Featured #1: WU05 "Who gives the advice? Not SortMyCover." | Once WU05 is live and passes row 2: Pin post. When C03 is pinned later it lands in front, so then: Featured → Manage → … on WU05 → Move to front → Save order. Target order: WU05, C03, WU01. | n/a (WU05.md Facebook text) | P7 (B, Shampanier); P8 (B, Eisend) | Page → WU05 post → … → Pin post | **VERIFIED** · do once WU05 is live |
| 20 | 7 | messenger | Saved reply SR4 "Legit" | For scam / legit / "is this real" / "ek vertrou dit nie". Inserted by hand only (saved replies never fire automatically). If FAQs stay at three, this reply carries the FSCA check. | SR4 (344) | P6 (B, Fogg; NN/g; Edelman 2025) | Shortcut `sr4` | NEW · cqa · NH-67 (3) |
| 21 | 7 | messenger | Saved reply SR2 | D1 = A: SR2-A once the person picks a slot (video only; send the adviser's name, licence details and video link inside the 7-day window). D1 = B or the default: SR2-B hand-off. | SR2-A (272) / SR2-B (277) | P3 (B); P6 (B, Fogg); POPIA (A) | Shortcut `sr2` | NEW · **BLOCKED D1** |
| 22 | 7 | facebook | Featured: WU01 (placeholder) | Pin now. WU01 was published 5 Oct 22:40, and its live text is checked: exact CTA, closing line, no Lead Velocity. WU02 (6 Oct 00:41) stays unpinned. Newer pins push WU01 to the end, so no move is needed. | n/a | P4 (states the core problem); multi-pin display needs a mobile check (C) | Page → WU01 → … → Pin post | **VERIFIED · DO NOW** |
| 23 | 7 | facebook | Featured #2: C03 "How to check an adviser" | Edit step 3 before Wed 7 Oct 18:00, pin it once published, then Move to front on WU05. See B23. | C03-FB (full text), C03-STEP3, C03-LINE | P6 (B, Fogg; NN/g; Edelman 2025). The old step 3 misses lapsed or debarred register entries. | Business Suite → Scheduled → C03 → Edit; then Page → C03 → … → Pin post; Featured → Manage | **DO before Wed 7 Oct 18:00** |
| 24 | 7 | facebook | Intro / bio (101 max) | TBD from the copy workflow; the live BIO-FB-v4 stays until replaced. Acceptance criteria in B24. Reference text offered. | FB-BIO-REF (90) | P5 (B, Liu 2010; Nielsen 2008); Meta guidance (A); Laja (C) | Switch into Page → Intro card → **Edit bio** (not "Edit details") | TBD · reference NEW · cqa |
| 25 | 6 | messenger | Saved reply SR3 "Advice" | For premiums, amounts, products, insurers, comparisons, switching, suitability, tax, and general "does health affect cover" questions. Never for a claim, a disclosed illness, a bereavement or debt distress; those get a human-written reply from private_sensitive_human_template. Send as is and add nothing about the topic. Never offer times or ask for a number in Messenger. | SR3 (203) | FAIS: first clause = approved deferral_advice / dm_advice_deferral (A); P8 (B, Eisend) | Shortcut `sr3` | NEW (CTA join) · cqa |
| 26 | 6 | facebook | Comment moderation | See B26. Profanity toggle On (new Pages have no Strong level), keywords, link domains via Moderation Assist, twice-daily unhide review, numbers hidden by hand. | KEYWORDS, LINK-DOMAINS, CM-B | Funds-recovery and crypto spam reads as a scam network (C); POPIA (A); Meta Help 1017549069082358, 131671940241729; Business Help 1753036688579904 (A) | See B26 | **GATED**: GATE-HIDE-WORDS (Jonathan, KG second approver) |
| 27 | 6 | facebook | Page name, transparency, portfolio claim | See B27. Keep "Sort My Cover"; claim into portfolio "jono" when the velocity block lifts; keep partner and owner display Off. | `Sort My Cover` | Rename history is permanent (A, Meta Help 323314944866264); P5 fluency (B); DW-v2 F3 (A) | See B27 | **KEEP NAME** · claim when unblocked |
| 28 | 5 | messenger | SR5 "Who is behind SortMyCover?" | Use "Now" until neither privacy.html nor terms.html shows any DRAFT text. privacy.html has two: the top banner and the Q9 Pixel note. Then switch to "After". | SR5-NOW (135) / SR5-AFTER (193) | DW-v2 V2-0 rule 3: never imply no company stands behind SortMyCover (A) | Shortcut `sr5` (use a hyphen if spaces are rejected) | NEW · cqa |
| 29 | 5 | messenger | SR7 "Has cover" | For "I already have cover" / "cover through work". | SR7 (134) | Approved FAQ-11 wording K-5 (A); FAIS (A) | Shortcut `sr7` | NEW (FAQ-11 + CTA merged) · cqa |
| 30 | 5 | messenger | SR8 "Funeral cover" | Funeral-cover product questions only. Death, illness or claim messages get a human-written reply first, never this. | SR8 (176) | Verbatim pre-routing deferral line (A, deferral-lines.md); rules.json sensitive = human_only (A) | Shortcut `sr8` | NEW (join) · cqa |
| 31 | 5 | messenger | SR9 "Payslip / job change" | Deferral plus the published learn page only. If cqa applies the one-link rule to saved replies, drop the learn link. | SR9 (306) | FAIS (A); learn page already passed cqa (B) | Shortcut `sr9` | NEW · cqa |
| 32 | 5 | facebook | Page Stories | See B32. Share each 18:00 post to Story; 07:00 process Story alternating with the CTA frame; on-image text, no sticker. | ST1–ST3, CTA, CLOSE | Operational transparency (B, Buell and Norton 2011); 07:00 commute prompt (C, Fogg) | Business Suite → Create story (needs media), or the FB app as the Page | NEW frames · cqa |
| 33 | 5 | facebook | Cover photo + profile picture | See B33. Confirm the cover is live, check it on phones, add practitioner question H2. Cover line unchanged: "Sort your cover. 30 minutes. A real adviser." | Cover line unchanged | P4 (matches the site H1); P5 fluency (B, Reber and Schwarz); Meta display sizes (A) | Visitor view in the FB app (Android + iPhone); Edit cover photo → Upload | **CHECK** · H2 to practitioner brief |
| 34 | 5 | facebook | Impressum | Paste DISC-FULL-v2 into the Impressum **only**. Don't touch Intro/Bio. Never paste DISC-FULL-v1 or profile-kit Options A/B. | DISC-FULL-v2 (109) | Brand lock 4D.2 rule 1 (A); P6 (B, Fogg); P8 (B, Eisend) | Switch into Page → About → Privacy and legal info → Impressum → Edit | **DO NOW** (low urgency; the current line already passes) |
| 35 | 4 | messenger | Comment to message (native comment-to-DM) | Off: leave it uncreated, with no keyword stand-in before W30. Keywords match anywhere in a comment and would auto-DM sensitive or number-posting comments. Reply by hand per B35 until W30. | CM-PUB (68), CM-A (152), CM-B (193) | rules.json case table (A); POPIA (A) | Business Suite → Inbox → Automations → Comment to message → leave uncreated | **DO NOW** (hand replies) · CM-A, CM-B NEW |
| 36 | 4 | facebook | Page sections | Untick Events, Groups, Live, Check-ins, Mentions. If a box is greyed out or not listed, it can't be hidden, so leave it. Keep About, Reels, Photos. Reviews goes via row 8. | n/a | Empty tabs read as an empty shell; Check-ins implies a branch (C); Meta Help 173376349438782 (A) | Page → More → Manage sections | **VERIFIED · DO NOW** |
| 37 | 4 | messenger | SR6 "Age" (FAQ-12/13) | Send only to someone who says they are outside 35–50, or asks "Is there an age limit?". Never ask anyone's age. | SR6 (134) | Approved FAQ-12/13 (A); two-sided (B, Ein-Gar 2012) | Shortcut `sr6` | **VERIFIED · DO NOW** |
| 38 | 4 | messenger | Custom keyword: price safety net | See B38. Keywords price, Price, quote, Quote; send only after 15 min with no Page reply. | KW-PRICE (222) | FAIS deferral (A); rules.json sensitive no_automation_message (A); Meta Help 395965998733706 (A) | Business Suite (desktop) → Inbox → Automations → Custom keywords → Create → Messenger | NEW · cqa |
| 39 | 4 | facebook | Category | Keep "Website" primary. Add "Education Website" second only if the line under the bio still reads "Website" on a phone. Never insurance, finance or advice; if Meta forces one, stop and log it. Fix profile-kit row 4 (lists Education first). | `Website` | Information scent (C, NN/g); finance categories imply a licence (A internal, G2c #6) | Switch into Page → About → Category → Edit (Meta Help 222732947737668) | **VERIFIED** (live header shows "Website") |
| 40 | 4 | facebook | Services section | Expected: Meta shows a fixed "Select your services" list → tick nothing (finance labels imply a licensed provider; education labels misdescribe the offer). Only if a free-text "Add a service" form appears: name SVC-NAME, no price, description SVC-DESC, no image of people. | SVC-NAME (40), SVC-DESC (118) | P5 clarity (B); Meta Help 761929797270214 (A) | Page → About → Services (not Manage sections) | **CHECK** · likely drop |
| 41 | 4 | facebook | Basic info | Hours: "No hours available". Service area: South Africa, if the field is offered (otherwise leave empty, never a city list). Phone, address, price range and credentials blank. Ignore "Add your address". | Service area: `South Africa` | Listed hours imply set availability; online-only service (A internal, setup-checklist G2a #9); SortMyCover is not an FSP | Switch into Page → About → Contact and basic info | **VERIFIED · DO NOW** |
| 42 | 4 | facebook | Do not set or use | Age restriction: none. No lead forms from "Get more leads" or the IG profile; the only instant form is Campaign A's, built to instant-form-spec.json at G11. Appointments: retired. Meta Verified / Meta One: not before the first broker **payment** lands (HUMAN GATE). | n/a | An age restriction hides the Page from logged-out visitors (A, Meta Help 778445532225441); POPIA consent (A); MASTER-PROMPT spend rule (A) | Settings → Followers and public content → Age restrictions: leave unset | **DO NOT ACT** |
| 43 | 4 | landing | book.html, index.html, about.html, learn, privacy.html | See B43. One deploy; Jonathan approves. | BOOK-PARA, BOOK-ITEM2, IX-META, IX-FAQ, PRIV-ROW | P10 positive frame (B, Brough; C, ContentVerve); m.me ref docs (A); POPIA (A) | landing/holding/*.html (source) → deploy.md → lighthouse.sh | Items (2), (3), (5), (6) ready · (1) and book.html part of (4) **BLOCKED D1** (= A) · (4) gated NH-67 (6) |
| 44 | 4 | repo-docs | Stale paste kits + Lead Velocity sweep | See B44. One change set; owners per DW-v2 V2-3; eval gate. | B44 strings | DW-v2 V2-1 / V2-3 (A) | Files listed in B44 | **DO NOW** · FAQ and persona strings NEW · eval gate |
| 45 | 3 | instagram | Account setup | See B45. Business account, created and linked from the Page, contact info cleared, message access on. | Username `sortmycover` | Unified inbox and Page-linked ads (A, help.instagram.com/502981923235522, /570895513091465) | IG app → … → Switch to professional → Business; Page → Linked accounts → Instagram | **LATER** (account not created) |
| 46 | 3 | instagram | IG DM automations | Mirror Messenger rows 6, 11, 12–18, 20–21, 25, 28–31, 37. See B46 for the gate. | Same strings; swap channel words only | P4 message match; IG allows 4 FAQ questions (A, Instagram Help) | Business Suite → Inbox → Automations → tick Instagram | **LATER** · gate in B46 |
| 47 | 3 | instagram | Bio (150 max) | IG-BIO. Needs the Link field set (row 48); until then drop line 3 (128 chars). BIO-IG-v5 never passed cqa and breaks these criteria. | IG-BIO (140) | Locked CTA (A); P5: clarity in the first line (B, Liu) | IG app → Edit profile → Bio | **LATER** · NEW · cqa |
| 48 | 3 | instagram | Link in bio | One link, to the apex. Title IG-LINK-TITLE; use "Free 30-minute adviser call" (27) only if 37 is refused. Note: the apex still ends in Messenger via book.html; Instagram routing is row 59. | URL `https://sortmycover.co.za` · title IG-LINK-TITLE (37) | P1 one link (B, Chernev); bio links are free and outside Meta One limits (A) | IG app → Edit profile → Links → Add external link | **LATER** |
| 49 | 3 | instagram | Pinned posts (3) + grid crop | See B49. Pin WU01, then C03, then WU05 → row reads WU05, C03, WU01. | n/a | P6, P7: the top row answers "is it legit, what's the catch, how do I check?" (B); 3:4 grid (B, PetaPixel) | Post → … → Pin to your profile; … → Adjust preview | **LATER** |
| 50 | 3 | instagram | Story Highlights | See B50. Titles of 10 characters or fewer; build right to left; card 5 excluded. | Titles + frames in B50 | P6, P7, P8 (B, Buell and Norton; Shampanier; Fogg); title truncation (C) | IG profile → New highlight → Edit cover | **LATER** · frames NEW · cqa |
| 51 | 3 | instagram | Story link sticker (daily) | See B51. Every frame carries the CTA and closing line as on-image text; sticker label "Pick a time". | Sticker label `Pick a time`; CTA + CLOSE on frame | The only free clickable link in IG content (A); captions don't carry into a Story (A) | IG app → post → paper plane → Add to story → Aa → Sticker → Link | **LATER** · new accounts may lack the sticker for 1–2 weeks |
| 52 | 3 | ops | Funnel tracker (weekly from Mon 13 Oct) | See B52. Counts only; the repo is public. Source by first message; no ref logging until W31. | Header row in B52 | Laja/CXL research first (C); Insights mechanics (A) | deliverables/meta-operator/funnel-tracker.md | **DO from 13 Oct** |
| 53 | 3 | repo-docs | MASTER-PROMPT hook H8 | Keep H8 tied to the held claim; point the myth-bust slot at H18; add the never-normalise-inaction rule. See B53. | H18 `No price in this ad. On purpose.` | P9 (B, Cialdini Petrified Forest); NH-PCD-04 held (A) | docs/MASTER-PROMPT.md l.457, l.1378; .claude/agents/performance-creative-director.md l.65 | **DO NOW** (doc) |
| 54 | 2 | instagram | Name field | Paste the 35-char primary. Before saving, check the field ends with the full word "explained". If it was cut off or errors, clear it and paste the 29-char fallback. Save once (2 changes per 14 days). | IG-NAME (35) / IG-NAME-FALLBACK (29) | Name and bio feed IG search (B, Mosseri); change rule (A); length cap disputed, 30 vs 64 (C) | IG app → Edit profile → Name | **LATER** · NEW · cqa |
| 55 | 2 | instagram | Action and contact buttons | Message is the default and can't be removed. At the Business switch, tap "Don't use my contact info". Email = hello@sortmycover.co.za only after row 58's tests pass. Never Book, Phone/Call/Text, Lead form or an address. | n/a | P1 (A); staff aren't licensed, so no live line (FAIS); no monitored phone; a profile lead form would collect data outside the landing consent (A) | IG app → Edit profile → Public business information → Contact options / Action buttons | **LATER** |
| 56 | 2 | instagram | Category | Education (fallback Website), with "Display category label" unticked. Never finance or insurance. If IG inherits the Page's category, keep it. | `Education` | A finance category implies a licence (A internal, G2c #6) | IG app → Edit profile → Category; Profile display | **LATER · VERIFIED** |
| 57 | 2 | instagram | Caption CTA line | IG captions only: CTA + " (link in bio)". Set the profile link first. FB captions stay unchanged unless row 3 finds the Page in the link test. | IG-CAPTION (94) | Organic IG caption links aren't clickable without Meta One Advanced (A, Meta One newsroom 15 Sep 2026) | Each IG caption block in warmup-posts/, week1-posts/, current-posts/ (D06–D14 already done) | **LATER** · NH-67 (8) |
| 58 | 2 | facebook | Privacy policy link + email (gated) | See B58. Privacy link only when the live page shows no DRAFT text; email only after inbound and send-as tests pass. | `https://sortmycover.co.za/privacy.html` · `hello@sortmycover.co.za` | P6 (B, Fogg) | Switch into Page → About → Privacy and legal info → Privacy policy; Contact info → Email | **GATED**: privacy draft notices; MX + send-as alias |
| 59 | 2 | landing | book.html routing for Instagram (ig.me) | See B59. User-agent detection in /book-route.js; no storage, no referrer. | IG-BTN (38), IG-PARA (94) | Don't send IG users across apps (A, ig.me docs; C, size of effect) | landing/holding/book.html + new landing/holding/book-route.js | **GATED**: @sortmycover owned, linked, test DM lands |
| 60 | 2 | landing | Organization JSON-LD sameAs | Add the Page now and the IG URL once it exists. Name stays SortMyCover; no legalName or parentOrganization (DW-v2). Edit landing/holding/ (the source), not landing/site/. Only useful once the Page's About fields carry no DISC-FULL-v1 text (row 44). | `"sameAs": ["https://www.facebook.com/sortmycover"]` | P6 connected to the rest of the web (B, NN/g) | landing/holding/index.html l.29 | **VERIFIED · DO NOW** (devops) |
| 61 | 2 | facebook | WhatsApp switch (later, one change) | See B61. Hard gates first; link through WhatsApp Manager, never the Page code flow; post CTA unchanged. | WA-POST only if ever used | WhatsApp is SA's strongest chat channel (C); one button (A) | WhatsApp Manager → Phone numbers → Profile → Connect a Page | **LATER · GATED** (B61) |
| 62 | 1 | facebook | Organic A/B tests | See B62. Two variants, hook line only, Link clicks, 3 h test ending at 18:00. | n/a | Laja/CXL (C); Meta Help 942567712892076, 1675344823455042 (A) | Business Suite → Content → A/B tests → Create A/B test | **LATER** (after warm-up) |
| 63 | 1 | instagram | Notes, broadcast channel, trial reels | Note optional now (24 h; mutual followers only). Trial reels at 200 followers (professional, public, eligible for recommendations). Broadcast channel at more than 1,000 followers. | IG-NOTE (60) | Trial reels reach non-followers (A, Instagram Help); Notes reach few (B/C) | IG → DM inbox → Notes; Reel composer → Trial; DM → Create channel | **LATER** · NEW · cqa |

### 3b. Blocks

**B2 · Pre-flight (row 2)**
1. Open Business Suite → Content → Posts & reels → Scheduled (or Planner → click the post) → … → Edit post. If `asset_id=1291324720737673` opens a different Page, use the asset switcher (top left) → Sort My Cover.
2. Check every scheduled row (the context says 5 are scheduled but only 4 are named, so find the 5th), and both published posts, WU01 and WU02 (Published → … → Edit post).
3. Compare each word for word with the `## Facebook text` block of its repo file. Never compare against the Instagram caption block, which still holds pre-QA wording.
4. Search each post for "Lead Velocity" and for "Send us a message". Both must find 0.
5. Each post ends with the CTA (80), a blank line, then the closing line (77). WU05's fee line = WU05-FEE (142).
6. C01: the rand figure is already removed (commit 0bb9e37, matches the scheduled post). Still to do: confirm the attached PNG is the re-rendered one (sub-line "Declines included non-disclosure, fraud, waiting periods, exclusions and unpaid premiums."; note "Source: ASISA, 2025 figures"). Set the alt text to C01-ALT and update C01.md line 55, which is still the old alt text. "R44.2 billion" returns only with written cqa clearance.
7. C02: check SARB 7.25% and prime 10.75% against the 23 Sep 2026 SAnews/Moneyweb sources before Thu 8 Oct 18:00.
8. C03: apply the step-3 edit (row 23) before it publishes.
9. If row 3 finds the Page in Meta's link test, change a CTA only to a fallback that Jonathan and cqa have approved.
10. Repo follow-up before IG goes live: bring the IG captions in current-posts/C01.md, C02.md, C03.md and warmup-posts/WU05.md into line with the Facebook text. Today they still say: C01 "Life insurers in South Africa"; C02 "Many households…" and "Home loans on a variable rate are linked"; C03 "Every adviser on a SortMyCover call shares a name and FSP number first."; WU05 the old fee line.

**B3 · Link-post allowance (row 3)**
- **Step 1, read-only, now.** Open Create post as the Page, in both the Business Suite composer and the Page's own composer. Paste the full CTA plus closing line (not a bare domain). Look for the links-left chip at the top (for example "1 link left") or the warning "You used your 2 posts with links this month". Repeat with `https://sortmycover.co.za`, then with `m.me/sortmycover`, and note whether the chip changes. Discard every draft. Check Content → Scheduled for warnings. On a phone, tap the domain in WU01 and WU02: is it a link? If no chip or warning appears anywhere, change nothing.
- **Step 2, only if the Page is in the test.**
  - October count: WU01 (5 Oct) and WU02 (6 Oct) both end in the domain. If FB linked them, October's 2 are already used, and WU05, C03, C02 and C01 may be blocked or lose their link.
  - Every later month allows 2. Page comments with links count too; only extra links under a post that already has one are free. Links to Facebook, Instagram, WhatsApp and Threads are exempt. m.me isn't named, so the composer test decides it.
  - Jonathan picks which posts keep the domain within the remaining count. The rest end with FB-FALLBACK-A if the m.me test shows m.me doesn't use the allowance. Otherwise use B1 (only with the post-level Send message button added in the Business Suite composer, Text section → CTA icons) or B2 (no post button). All keep the closing line.
  - **Precondition:** Instant reply On (row 6) before any fallback goes live, because fallbacks skip book.html's POPIA notice.
  - Every fallback changes the locked CTA, so each needs Jonathan + cqa (NEW).
  - Story link stickers are reported as unlimited, so the 07:00 Stories are unaffected.

**B4 · OG image (row 4)**
1. In brand/templates/og.html, replace the hook "Understand your cover gap with a licensed adviser. Free, no obligation." with OG-HOOK. Keep the brand line "Sort your cover. 30 minutes. A real adviser."
2. Render with brand/exports/render.mjs. Save the 1200×630 output under a **new** file name, landing/holding/og-image-v2.png. Point `og:image` and `og:image:alt` on every page to it. Keep og-image.png live for posts already shared. Meta caches images by URL, so a new image at the old URL never refreshes.
3. Deploy per deploy.md. Then open the Sharing Debugger, paste `https://sortmycover.co.za/` and `https://sortmycover.co.za/book.html`, and click Scrape Again. Pass only if the card has no price, rand figure or "2–4×"; no insurer, product, broker or adviser; no you/your claim about cover, money, family or health; no advice.
4. Repeat step 3 after every deploy. Keep LCP at 2.5 s or less on a mid-range Android over 4G: `landing/lighthouse.sh https://sortmycover.co.za/`.
5. The Page can't edit link previews until the domain is verified in a business portfolio with the Page connected (Meta Help 103043593796161). That is blocked by the velocity block; do it once the portfolio exists.

**B5 · Needs-human entry (row 5)** (append verbatim)
```
- **NH-67 · Meta Page build gates (meta-operator, 2026-10-06).** Nothing marked NEW in deliverables/meta-operator/page-cro-spec.md goes live until compliance-qa passes it. Each default below holds until Jonathan decides otherwise.
  (1) compliance-qa passes every NEW string in the spec.
  (2) MASTER-PROMPT l.1237 says three ice-breakers; the spec sets four (Meta allows 4). Default: three; drop FAQ #4; SR4 "Legit" carries the FSCA-register check.
  (3) Rule 1.2 (l.145, l.1583) and the never-post list (profile-kit l.115). Default: no adviser name, practice name or FSP number in Messenger/IG; FAQ #2, FAQ #4, SR2 and SR4 stay broker-neutral until the first WhatsApp exists.
  (4) POPIA: no consent wording covers a Messenger-to-FSP handoff. Default: Messenger/IG collect nothing and pass nothing to any FSP (no name, time, phone or Messenger ID). The landing-page consent governs any sharing (profile-kit l.107).
  (5) D1, where a booking completes (spec §0): A = Messenger with a new consent line; B = site slot picker + consent; C = WhatsApp. Under default (4) and today's book.html no booking can complete. Decide before Page traffic grows.
  (6) Meeting mode: book.html l.47, about.html l.40, learn/what-happens-on-a-30-minute-call.html l.45 and the index meta/og/chips/FAQ still say "video, WhatsApp or phone". Default: FAQ #1, SR1, SR2 name no mode except under D1 = A (video). If Jonathan picks a mode, every page changes in the same release.
  (7) C01 rand figure: resolved 6 Oct (commit 0bb9e37). "R44.2 billion" returns only with written compliance-qa clearance.
  (8) Locked CTA: the exact line on every surface, IG included. No link-allowance fallback and no IG "(link in bio)" suffix until Jonathan approves.
  (9) Instant reply On (spec row 6) overrides MASTER-PROMPT l.1237 and profile-kit §1 #9 until W31 is live. Jonathan signs.
  (10) H8 / NH-PCD-04 is already decided: held (compliance-qa phase4-review-3 l.143-147, l.230). Jonathan has no action. Any H8 rewrite counts as NEW under (1).
```

**B10 · Response time and triage (row 10)**
- **Staffing.** 07:00–22:00 SAST, a person sends the first reply to every new DM within 5 min; 15 min is the hard limit. Name one reply owner per shift (Jonathan or KG). W30, W31 or any API bot must never send the first reply, because API replies count in Meta's metrics and the badge must reflect a person. Business AI stays Off (row 14).
- **Triage.** Read the first message, then:
  - About the call, a time or how it works (including a prefilled booking message): SR1 (the variant D1 picks).
  - Advice, product, insurer, broker or price: SR3.
  - Contains health, ID or bank details: don't repeat them and don't ask about them. Send DATA-REPLY. Delete the thread from the Page inbox once handled (the privacy notice says such details are removed from our records).
  - STOP, no thanks, remove me, delete my details: reply once with OPT-OUT, then no SR and nothing after. Label the thread "Opted out". A deletion request goes to the privacy process (answer within 30 days).
  - Complaint: a person writes the reply within 30 min, following complaints.html. No SR.
  - Death, illness or a claim: a person writes a private reply by hand from private_sensitive_human_template. No template, no advice, no booking link unless they ask.
- **Every human reply:** no advice; no product, insurer or broker names; no prices; no "guaranteed", "best" or "cheapest"; no assumptions about money, family or health.
- **Phones.** Install the Meta Business Suite app on both phones with Messages notifications On and lock-screen previews Off (Android: hide sensitive content; iOS: Show Previews = When Unlocked).
- **Access.** KG gets Full control under Page access (KG must accept the invite), only until the Page joins the portfolio; then re-assign KG through the portfolio and remove the direct role (setup-checklist G2 #13). 2FA On for both accounts, each person setting up their own.
- **Inbox hygiene.** Spam → Move to spam. Mark Done only after a person has replied; Done on an unanswered enquiry inflates the rate dishonestly. On the 1st of each month, delete Page-inbox threads with no contact for 12 months (privacy-notice retention).
- **Weekly log** (Monday; counts only, no names, numbers or message text):
  - Meta's Response rate (%) and Response time. Meta's figure is the average of the fastest 90% of first replies over a 30-day window.
  - Badge shown Y/N. The badge needs ≥90% and ≤15 min over the last 7 days.
  - Our own median first-reply time from the shift log, because Meta reports no median.
  - Note: messages received while Away, and Meta's own instant and away replies, are excluded from Meta's metrics.

**B11 · Away message UI (row 11)**
- Path: Business Suite → Inbox → Automations → Away message → Channel: Messenger → schedule per day. Or: Inbox top-right "Available" ▾ → "Edit away message and schedule".
- It runs on the Page's time zone, so confirm Johannesburg (GMT+2).
- If 22:00–07:00 won't save as one slot, enter Available 07:00–22:00, or set two Away ranges: 00:00–07:00 and 22:00–23:59.
- A manual Away is capped at 12 h, so use the schedule.

**B13 · Messenger + IG data rules (row 13)** (default until D1 and NH-67 (4) change it)
1. Answer from the FAQs and saved replies. Advice, price, product, health or claims questions get the fixed deferral (SR3); sensitive threads get a human-written reply. Any reply that moves someone forward ends with the CTA word for word.
2. Never ask for or store: a name (Messenger already shows the profile name), age, phone or WhatsApp number, email, ID, bank or health details.
3. Never pass anything from a Messenger or IG thread to an adviser, practice or FSP. Booking and consent (CONSENT-NAMED-v2 or CONSENT-GENERIC-v2, plus CONSENT-ADS-v1) happen only where consent is captured (see D1).
4. If someone sends a number, ID or health detail anyway: don't copy it into any CRM, sheet, n8n flow, brief or log. Reply once with DATA-REPLY, and delete the thread once handled.
5. If someone says they are under 35 or over 50, send SR6. Never ask anyone's age.
6. Don't message again unless they reply; there is no consent to market (2.1.2).
7. If D1 = A, this rule is replaced by the D1-A rules in §0: first name, chosen time and video link only, under the approved consent line.
8. Review when WhatsApp (row 61) is live.

**B14 · Business Agent off (row 14)**
1. Desktop: business.facebook.com → All tools → Meta Business Agent → Meta Business Agent. If "Agent is on" shows at the top right, toggle it off. Mobile: Business Suite app → Inbox → (icon) → "On" drop-down at the top centre → toggle off "Business Agent responses on Messenger". If Meta Business Agent isn't listed under All tools, the Page isn't eligible yet: record Off/N/A and recheck monthly.
2. Inbox → … Settings → Suggestions → AI suggested replies Off for messages and for comments; "Activity and tool suggestions" Off if present.
3. If "Facebook created this chat" (auto-opened DM threads from comments) appears, turn it off.
4. Confirm Away message and Instant reply still show as active under Inbox → Automations.
5. Repeat for Instagram once it is linked.

**B23 · C03 edit and pin (row 23)**
1. Before Wed 7 Oct 18:00, go to Business Suite → Content → Posts & reels → Scheduled → C03 → Edit (after it publishes: Page → C03 → … → Edit post). Replace only step 3, so the full Facebook text reads exactly C03-FB (§3c).
2. Update C03.md to match: Facebook text and IG caption step 3. In the IG caption, replace "Every adviser on a SortMyCover call shares a name and FSP number first." with C03-LINE. cqa clears C03 (the file still says DRAFT).
3. After it publishes with this text: Page → C03 → … → Pin post. It lands in front of WU05, so go to Featured → Manage → … on WU05 → Move to front → Save order. Target order: WU05, C03, WU01.

**B24 · FB bio acceptance criteria (row 24)**
- 101 characters or fewer, counted by Facebook's own counter in the Edit bio box.
- The first ~45 characters say what it is, who it's with and the cost: "Free 30-minute call with a licensed adviser" (43). "Free" is the only cost word allowed; no rand amounts or premiums.
- It says the person picks the time. Never imply the call happens now.
- It must include the role split, e.g. "We book the call. They advise." Every approved bio has carried this no-advice signal (FB-v3, IG-v3/v4, FB-v4).
- No Lead Velocity. No insurer, broker, practice, FSP or adviser names or numbers. No prices, product names or comparisons. No "independent", "unbiased", "neutral", "best", "guaranteed", "cheapest" or "quote".
- No claims about the reader's money, family or health. "You" as the person doing an action is fine. No "most people don't…", no stacked negations, no engagement bait.
- No CTA or URL in the bio: the CTA plus the role split is 102 characters. The URL lives in the Website field (row 9).
- Reading grade 5–7.
- Validate with a 5-second test on 5 ICP people: what does the Page do, what does it cost, what happens next, and who gives the advice? Record only the answers, with no names, numbers, health or money details.
- Screenshot the saved Intro card.

**B26 · Comment moderation (row 26)**
Apply nothing until Jonathan approves the list at GATE-HIDE-WORDS (KG second approver). Then:
1. Switch into Page → profile photo → Settings & privacy → Settings → Followers and public content → turn On "Hide posts and comments with profanity". New Pages only have on/off; there is no Strong level.
2. Public posts → "Hide comments containing certain words from your Page": paste KEYWORDS. Jonathan or KG types the slurs in by hand.
3. Professional dashboard → Moderation Assist → "Links to specific sites": paste LINK-DOMAINS. A domain also hides deeper links on that site, and Moderation Assist hides comments rather than deleting them.
4. Meta also hides spelling variants. From a profile with no Page role, post test comments and confirm "interested", "inbox me" and "scam" stay visible.
5. Never add: scam, dm me, inbox me, interested, whatsapp me, call me, or insurer names.
6. At 07:15 and 21:30 daily, open hidden comments. Unhide any real question or criticism the list caught (e.g. "is this another crypto scam?") and answer it once, calmly, in public.
7. Numbers can't be matched by keywords. Turn on comment notifications for Jonathan and KG. From 07:00 to 22:00, hide any comment with a phone, ID, email or bank number as soon as it's seen: target 15 min, or 5 min in a new ad's first 2 h. Hide overnight ones at 07:15. Don't copy the number anywhere. Send CM-B privately. W30 takes this over when live.
8. Hide, don't delete.
9. Add the 5 new keywords (funds recovery, recover your funds, recovery expert, hacker, account manager) to community/hide-words.txt [KEYWORDS-SCAM] and bump it to v0.2.

**B27 · Page name, transparency, portfolio claim (row 27)**
- **Name.** Keep "Sort My Cover" and never rename it. Meta rejected camel-case "SortMyCover" on 5 Oct, and a rename shows permanently in Page transparency. The website, IG and WABA display name stay "SortMyCover". Record the Meta exception in setup-checklist G2a #1, meta-ids, the WABA display-name note (G4 #5, appeal-playbook) and brand-bible line 57 ("Never 'Sort My Cover'").
- **Claim.** When the velocity block lifts, claim the Page into portfolio "jono" (Lead Velocity (Pty) Ltd). Retry once, not in a burst. Don't use another portfolio, the Just Market Me portfolio or a new one; Lead Velocity is the advertiser of record and is named on privacy and terms (DW-v2 V2-0, F3). Path: Business Settings → Accounts → Pages → Add → Add existing Page.
- **Transparency.** A claim alone doesn't show the portfolio name. Lead Velocity appears only if (1) a verified portfolio is assigned as Confirmed Page owner, or (2) "Show names of confirmed Page partners" is on. So never assign a Page owner. Straight after the claim, go to Settings → New Pages experience → Page transparency and confirm "Show names of confirmed Page partners" is Off (and "Show confirmed Page owner" Off if an owner is ever assigned). If Meta ever requires a Confirmed Page owner, Jonathan decides, because it shows the verified legal name.
- **Before any ad.**
  - Open the visitor view: Page → About → Page transparency. Screenshot it as G2-05-page-transparency.png. Expect: created 5 Oct 2026, no name changes, country South Africa, no organisation. If an "Organisations that manage this Page" entry shows, leave it and note it. It is Meta's disclosure, not our copy, and nothing may imply that no company stands behind SortMyCover.
  - In the first ad, confirm Advertiser and Payer are the Page name, not the verified business name (business/help/721913190475838).

**B32 · Page Stories (row 32)**
- Share each 18:00 feed post to the Page Story the same evening (Share → Share to story, as the Page).
- At 07:00, post the 4-frame process Story, alternating day by day with the single CTA frame (= frame 4).
- Build each frame as a 1080×1920 image with the text on the image; Business Suite stories need media. Keep text clear of the top 250 px and bottom 340 px.
- Frames: ST1 / ST2 / ST3 / CTA, with CLOSE as small print (12–14 px) on frame 4 and on the single CTA frame.
- FB has no documented link sticker, so add none; the domain is in the frame text. If FB ever offers "Add link" on a Page Story, link it to `https://sortmycover.co.za`, with the same text.
- Repo fix: content-engine.md l.92, daily/README.md and daily D01–D10 say "link sticker" for the FB Story. Change them to "domain as on-image text" for FB; the sticker stays IG-only.

**B33 · Cover check (row 33)**
1. Confirm the cover is actually live; meta-ids.md records that the 5 Oct upload "did not save".
2. Use the visitor view in the FB app on a mid-range Android and on an iPhone. The whole line must be visible and not covered by the amber-tick avatar, with contrast at least 4.5:1 (cream and amber on charcoal are ≥7.28:1).
3. The first screen (cover, name and bio, no scrolling) must also show booked-call clarity. The Impressum isn't on it, so row 24's bio carries it; until then the cover isn't enough on its own.
4. Add H2 to deliverables/contracts-drafter/practitioner-brief.md: "Does the Page name SortMyCover shown next to the line 'A real adviser.' hold Lead Velocity out as an FSP under FAIS s7(1)?" Record the answer in deliverables/brand-naming-lead/availability-checks.md H2.
5. If the line is cut off: narrow the text box in brand/templates/cover.html (e.g. to a 520 px centre; the tagline now spans about x 180–672 of 851). Re-render with brand/exports/render.mjs at 1702×630 and upload again. Re-exporting at the same ratio gives the same crop: Meta shows the cover at 640×360 (16:9) on phones, so up to ~145 px can be lost from each side.

**B35 · Hand replies to comments until W30 (row 35)** (07:00–22:00, per community/rules.json)
- Interest, process question, objection, or price/advice question: at most one public reply (2 sentences or fewer, no link, third person, from the reply-corpus templates, e.g. CM-PUB; for price or advice use deferral_advice), plus one private reply, CM-A.
- Sensitive (illness, bereavement, claims, debt): no public reply. One private reply written by hand from private_sensitive_human_template, with no booking link.
- Own number, ID or email posted: hide it at once, no public reply, one private reply, CM-B.
- Spam, abuse, competitor: hide (never delete), no reply.
- Praise: like it, plus one short thanks; no private reply.
- Off-topic: leave it visible.
- Never print trigger words in posts. Never ask for a number, ID or health detail in Messenger.

**B38 · Price safety net (row 38)**
- Keywords (4 of 5; case-sensitive; fires when a message *contains* the word): price, Price, quote, Quote.
- Never add premium, Premium, cost or Cost: claim, arrears and bereavement messages use them (rules.json sensitive = human_only, no_automation_message).
- Timing is **required**: send only after 15 min with no Page reply, never immediately.
- Residual risk: price or quote can still appear in a sensitive message. The 15-min delay is the guard, so the shift owner answers sensitive threads within 15 min.

**B43 · Landing edits (row 43)**
One deploy. Devops edits landing/holding/ (build-site.mjs copies it to landing/site). Jonathan approves, and the prepare-holding-deploy check must pass. Then run lighthouse.sh against production.
1. book.html "How to ask for a time" paragraph (l.38) → BOOK-PARA. D1 = A only; under D1 = B the slot picker replaces this section.
2. book.html #book-link (l.42) → `https://m.me/sortmycover?ref=site_book`, dropping `?text=`. Meta documents only `?ref=`, and the prefill stops FAQ #1 from showing. Keep the button text "Message us to pick a time" and the POPIA small print.
3. The footer "Message us on Facebook" link on all 13 holding pages (index, book, 404, about, complaints, how-we-make-money, privacy, terms, learn/index and the 4 learn articles) → `https://m.me/sortmycover?ref=site_footer`. Leave the inline links in about.html l.47, complaints.html l.39 and how-we-make-money.html l.47 bare. Note: for a new thread, Meta passes ref only through a Get Started postback, and a Get Started button would hide the Inbox FAQs. So ref won't attribute first contacts; it's harmless (row 52).
4. Meeting mode (gated NH-67 (6)):
   - book.html "What happens next" item 2 (l.47) → BOOK-ITEM2 (D1 = A only).
   - index.html meta description and og:description → IX-META.
   - index chip → "Free 30-minute call".
   - index FAQ sentence and the identical JSON-LD acceptedAnswer → IX-FAQ.
   - about.html l.40 and learn/what-happens-on-a-30-minute-call.html l.45: replace the "video, WhatsApp or phone" sentence with IX-FAQ.

   General pages name no mode, because advisers' supported modes differ (w01.mjs defaults to whatsapp_call + phone), and this wording survives the WhatsApp switch.
5. Add to the BOOKING LINK comment in book.html: "…and change the button text, the 'How to ask for a time' paragraph and 'What happens next' item 2 to say WhatsApp."
6. privacy.html, Meta (WhatsApp, Facebook, Instagram) processor row: add PRIV-ROW, bump the PN version, cqa sign-off. Needed now for Messenger.

**B44 · Repo sweep (row 44)** (one change set; owners per DW-v2 V2-3; run `node evals/run.mjs --dry-run` and don't merge below baseline)
- **profile-kit.md → v1.2**
  - §1 #1: "bio TBD (copy workflow)".
  - §1 #2 = DISC-FULL-v2; delete §1 #3 (Option B).
  - §1 #7 = row 7's rule.
  - §1 #8: website = `https://sortmycover.co.za`; email empty until row 58 passes.
  - §1 #9: FAQ #1–#4 exactly as in this sheet; Instant reply On until W31 (row 6).
  - §1 #11 = AWAY-v2.
  - Mark the soft CTA "Send us a message" as superseded by the CTA.
  - "Pinned post (Facebook allows one)" → "Featured holds several: WU05, C03, WU01, each pinned once published".
  - Row 4 category order: Website first.
  - Highlights note "≤ 15 characters so they don't truncate" → "≤ 10; about 9 show under the circle".
- **community**
  - reply-corpus.md §Ice-breakers = the same four FAQs; the Afrikaans set is to be written, then cqa.
  - hide-words.md l.37: "three" → "four", only if Jonathan approves four (NH-67 (2)).
  - Flag MASTER-PROMPT 4.14 to the orchestrator.
- **page-optimisation-research.md**
  - Row 3 (l.55): away text = AWAY-v2.
  - l.30 and l.60 → DISC-FULL-v2.
  - Cite business/help/2150969905216708 for the one-button rule, and facebook.com/help/977869848936797 as the how-to.
- **jonathan-clicks.md**
  - l.30 Intro → BIO-FB (live v4 until replaced).
  - l.31 About → DISC-FULL-v2.
  - l.41 IG bio → row 47.
  - l.56 WhatsApp description → DISC-WA-DESC-v2, privacy URL `sortmycover.co.za/privacy.html` (`/privacy` returns 404).
  - Leave the broker and portfolio rows l.13, l.14 and l.87 alone.
- **meta-ids.md**
  - l.15 "About details = DISC-FULL-v1" → v2.
  - Add: "Business Suite / Messenger asset ID 1291324720737673 (profile ID 61595175929084: never use it for API, webhooks or console config). Confirm via GET /me/accounts which ID arrives as webhook entry.id, then relabel page_id. page_id is unchanged until then."
- **setup-checklist.md**
  - G2a row 8 → DISC-FULL-v2.
  - l.158 → "website footer carries DISC-FULL-v2; Privacy and Terms name the company".
  - l.232 and l.320: `/privacy` → `/privacy.html`.
  - l.299 → "Bio empty".
  - l.362: end-card check against DISC-S91-v2.
  - l.415 disclosure_text → DISC-FULL-v2.
  - G2a #1 Page name = "Sort My Cover" (row 27).
- **Other meta-operator files**
  - setup-existing-lv-account.md l.29 → DISC-FULL-v2.
  - appeal-playbook.md l.69 → "website shows SortMyCover; the legal party is on Privacy/Terms". The appeal texts at l.31, l.56 and l.100 go to Meta only and stay as they are (DW-v2 F3).
- **knowledge/faq.md → faq-v1.0.4** (cqa PENDING): FAQ-04, FAQ-08, FAQ-09 and FAQ-15 en+af as in §3c B44 strings. FAQ-15 is retitled "Who runs SortMyCover?"; keep its topic key and keep "Wie is Lead Velocity?" in asked-as.
- **reply-corpus.md**: money row and objection_calm en #2 (§3c).
- **Conversation files**
  - conversation/prompts/guardrail.md l.41 and l.52.
  - conversation/persona.md l.6, l.37, l.48, l.65 and l.79.
  - template-submission-runbook.md l.38.
  - conversation/lines.mjs DISCLOSE and DISCLOSE_PRE_ROUTE, en+af.
  - evals/golden-set.json (64, 142, 245, 384, 864, 4499) and red-team.json 2187 to match.
  - All strings are in §3c.

**B45 · IG account setup (row 45)**
1. Create @sortmycover from the Page: switch into Sort My Cover → Settings → Linked accounts → Instagram → Connect / Create new. Alternatively, create it in the IG app, then connect from the Page, or from the IG app via Edit profile → Page → Connect.
   - Don't use Accounts Centre: it isn't a Page-linking path.
   - Don't use Business Suite → Settings → Instagram accounts → Add: that is the portfolio route, which is blocked.
2. Switch to professional → **Business** (not Creator). On "Review your contact info", tap "Don't use my contact info": it pre-fills the sign-up phone and email and syncs from the Page. Never use any @leadvelocity.co.za or personal address.
3. Username `sortmycover`. Name: row 54. Category: row 56. Contact: no phone, no address; email per row 55. Link: row 48. Bio: row 47.
4. Turn on "Allow access to messages" (IG app → Settings → Messages / Message controls → Connected tools). A test DM from a second account must land in the Business Suite Inbox.
5. Don't add @sortmycover to Jono's personal Accounts Centre, because accounts in the same Accounts Centre can log into each other by default.
6. @coverklaar: a separate personal (non-professional) parked account with no bio, photo or posts, not linked to the Page or any ad account. It is a defensive hold only, until NH-23 is decided.

**B46 · IG DM automations (row 46)**
- Gate: B45 steps 1–4 are done (Business account, linked, message access on, test DM lands).
- Mirror Messenger:
  - FAQs #1–#4, or #1–#3 if Jonathan keeps three.
  - AWAY-v2 with Instagram ticked.
  - INSTANT-v1.
  - Business AI Off, comment-to-message Off.
  - Saved replies SR1–SR9 from the Business Suite Inbox (they are shared). Add IG-app copies only if someone replies from the phone, with shortcuts sr1–sr9 (15 characters max).
- Paste word for word; swap only channel words (Messenger, Facebook, "Send message button").
- Same data rules (row 13): IG DMs book nothing beyond what D1 allows.
- Check the IG Requests folder daily, because non-followers land there.
- FAQs show when someone opens a new chat, not on Story replies, so answer Story replies with saved replies.

**B49 · IG pinned posts (row 49)**
- **Preconditions.** @sortmycover exists. WU01, C03 and WU05 are published on IG with QA-corrected captions: C03's IG caption uses C03-LINE and C03-STEP3, and cqa has passed C03.
- **Order.** Pin WU01, then C03, then WU05. The row then reads WU05, C03, WU01, because the newest pin shows leftmost.
- **Swap later.** Don't unpin just one: a new pin always lands leftmost. Unpin all three and re-pin right to left, with WU05 last.
- **Grid crop.** Tiles are 3:4. The 4:5 masters keep content inside the tile (content x = 59–1020; the tile keeps x = 34–1046). Confirm each tile via ⋯ → Adjust preview (on some builds ⋯ → Edit → Adjust preview). Grid Reorder (Jun 2026) doesn't move pins.
- **Replacing WU01.** Reel R01 or the FAQ carousel replace WU01 only after cqa passes them. Carousel card 5, its caption and its alt text must first drop "The adviser shares a name and FSP number first." and resolve L-2 ("Each one is an authorised financial services provider"; some advisers may be representatives).

**B50 · IG Story Highlights (row 50)**
- **Titles** (about 9 characters show; C):
  ```
  How it works | Who pays | Verify | The call | FAQ
  ```
  Use "The steps" if "How it works" shows truncated.
- **Order.** Instagram puts the most recently updated highlight first, and there is no drag. Build right to left: FAQ, The call, Verify, Who pays, then How it works last. To keep How it works first: whenever a Story is added to another highlight, re-post the CTA frame, add it to How it works, and remove the older copy.
- **How it works.** ST1, ST2, ST3, then the CTA frame (CTA + CLOSE as on-image text). Add the link sticker "Pick a time" → `https://sortmycover.co.za` once the account has the sticker.
- **Who pays.** FAQ carousel card 4 only (W1D5-faq-4-who-pays). It needs a "pays" cover: add the icon in brand/templates/highlight-cover.html and `['pays','who-pays']` in brand/scripts/build-highlights.mjs, then re-run. WU05's fee line is still awaiting the cqa P-4 re-pass.
- **Verify.** The C03 image + 3 steps (step 3 = C03-STEP3). Cover: highlight-advisers.
- **The call.** WU04 + Reel R01 (5 Oct re-renders). Cover: highlight-what-to-expect.
- **FAQ.** Carousel cards 2–3 only. Card 5 goes in no highlight until GATE-OPINION, or until it is re-rendered as "Each one is, or works under, an authorised financial services provider." Drop D5's "Card 5 also goes into Advisers".
- **Gate.** Add a post's Story only after that post passes cqa (R01 and the FAQ carousel are still NEW). Never show adviser names, faces or FSP numbers.

**B51 · IG Story link sticker (row 51)**
- Share each 18:00 feed post to Story at about 18:05, and re-post a frame at 07:00 the next day.
- Every frame carries three things, inside the 9:16 safe zone (keep clear of the top and bottom ~250 px):
  1. Aa text: CTA, verbatim.
  2. Small Aa text: CLOSE, verbatim.
  3. A link sticker labelled "Pick a time", URL `https://sortmycover.co.za/?utm_source=ig&utm_medium=story&utm_campaign=Dxx` (Dxx = post ID; never personal data).
- New-account gate: Instagram withholds the Link sticker from new accounts. Meta publishes no duration; reports say 1–2 weeks. Check the tray before each Story. If "Link" is missing, post without the sticker; the frame text still carries the domain. Note the date the sticker first appears.
- Add only Stories that carry both overlays to a Highlight, and never time-bound Stories (dated facts, fuel price).
- Story replies arrive as DMs. Answer them by hand from saved replies within 15 min, 07:00–22:00, under row 13's rules. Illness, death or claims are handled by a person only, in private.

**B52 · Funnel tracker (row 52)**
- **File:** deliverables/meta-operator/funnel-tracker.md.
- **Counts only.** No names, profile links, thread IDs, numbers or message text; the repo (justmarketme/lead-velocity-staging) is public.
- **Labels.** Inbox labels are funnel stages only (Slot offered, Booked, Showed). Never a note about cover, money, family or health. Never ask people how they found us.
- **Source per new thread**, tagged by hand from its first message:
  - ice-breaker 1 / 2 / 3 / 4;
  - Book-page prefilled text ("Hi, I would like to pick a time…"). This is a lower bound, and it disappears once row 43 (2) drops `?text=`;
  - Other.
- **m.me ref.** Not loggable: the Inbox doesn't show it, and new threads pass ref only through a Get Started postback. W31 backlog: subscribe to messaging_referrals and parse postback.referral, after deciding Get Started vs Inbox FAQs (Get Started hides Inbox-UI FAQs).
- **Method.** Change one variable a week, and decide only on 14 days of data.
```
Week | Facebook visits | New threads (FB / IG) | Source: ice-breaker 1 / 2 / 3 / 4 | Source: Book-page text | Source: other | Slots offered | Booked | Showed | Meta response rate (%) | Meta response time (min) | Our median first reply (min) | Very responsive (Y/N) | Post link clicks
```

**B53 · H8 (row 53)**
(a) In MASTER-PROMPT.md l.1378 and performance-creative-director.md l.65, replace the H8 row with:
```
| H8 | Myth-bust | **HELD (NH-PCD-04): "Life cover costs less than most people think."** Runs only once an SA source is on file with compliance-qa. Cycle-1 default is H18: **"No price in this ad. On purpose."** → "The real cost depends on age, health, smoking and what the cover must do." | Myth-bust with no comparative or price claim (2.1.1, 2.1.5); literally true; matches the /myth-bust/ page H1 verbatim | Static + video |
```
(b) In MASTER-PROMPT.md l.457, replace the line with: `6. **Myth-bust** — "No price in this ad. On purpose." (no comparative cost claim until a source is on file, NH-PCD-04)`

(c) Add under the hook library: "Never write lines that make not acting look normal ('most never check', 'most people don't…', 'many families aren't…'). Soft, unlabelled prevalence lines ('Many families carry more than one household.') are allowed under C-1. A hook never restates the CTA. The CTA is always exactly 'Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za'."

Do not use "A free 30-minute call with a licensed adviser. Pick a time." as a hook.

**B58 · Gated privacy link and email (row 58)**
- **Privacy policy.** Add it only when the live page has no draft notice anywhere: both the top "DRAFT for practitioner review" banner and the Q9 Pixel "DRAFT, open question" note must be gone. Check by curling the page: "draftnote" and "DRAFT" must each return 0 matches. Use the .html URL; `/privacy` returns 404. This is also required before ads or the Pixel.
- **Email.** Add hello@sortmycover.co.za only after both tests pass:
  - (a) Mail sent from an outside address to hello@ arrives. Today the domain has no MX record.
  - (b) A reply sent from hello@ arrives at an outside inbox showing From: hello@sortmycover.co.za, with SPF and DKIM passing. In M365: `Set-OrganizationConfig -SendFromAliasEnabled $true`, then pick hello@ as the From address.
- Never use a leadvelocity.co.za or vantagestack.co.za address, on the Page or in replies.

**B59 · Instagram routing on book.html (row 59)**
- **Gate.**
  - (a) SortMyCover owns the professional account @sortmycover.
  - (b) It is connected to the Page, so its DMs land in the inbox a person checks.
  - (c) A test DM sent through the link arrives in that inbox, not in Requests.
  - Ship row 43 item (6) (the privacy row) at the same time or before.
- **Build.** Add `landing/holding/book-route.js`. It must be an external file, because the CSP (`default-src 'self'`) blocks inline scripts. Load it only on book.html: `<script src="/book-route.js" defer></script>`. Add `id="book-how"` to the "How to ask for a time" paragraph.
- **Logic.**
  - If `/\bInstagram\b/.test(navigator.userAgent)` is true (the IG in-app browser, which is mobile only, which is where ig.me works):
    - set #book-link href to `https://ig.me/m/sortmycover?ref=site_book_ig`;
    - set the #book-link text to IG-BTN;
    - set the #book-how text to IG-PARA.
  - Everyone else, and visitors without JS, keep Messenger unchanged.
  - No storage and no referrer check: book.html's referrer is always the site itself.
- Add to the BOOKING LINK comment: "When this becomes wa.me, delete or update /book-route.js too."
- Ops: check IG Requests daily. The ref only shows once W30/W31 handle referrals.

**B61 · WhatsApp switch (row 61)**
- **Gate: don't start until all of these are true.**
  - (a) The Twilio WhatsApp sender is live in a Meta business portfolio Jonathan has full control of, and the Business Settings velocity block has cleared.
  - (b) Lead Velocity is out of the WhatsApp flow and cqa has re-passed it:
    - automation/ctwa/w03.js:51 consent footer → "SortMyCover is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy.html", version `ctwa-named-v3`;
    - persona and FAQ strings per row 44;
    - update w05.mjs and W03.json (re-inline with `node automation/security/inline-for-n8n.mjs`);
    - the eval gate passes.
  - (c) The W03 handler actually answers on the Twilio number. W03 was built for the Cloud API directly, so re-plumb it first.
- **Then, in one change:**
  1. **Link.** WhatsApp Manager → Phone numbers → the number's settings → Profile → Connect a Page → Sort My Cover. Alternatively, send a request from the Page and approve it in Business Settings → Requests. Never use Page → Settings → Linked accounts → WhatsApp, or any "send code" screen, with the Twilio number: that is the WhatsApp Business app flow and can pull the number off the Cloud API. Check that a Twilio test message still delivers.
  2. Page action button → Send WhatsApp message.
  3. IG, if it exists: add the WhatsApp button only through the portfolio link. Change the bio's last line to "Book on WhatsApp below." (cqa).
  4. **landing/holding/book.html #book-link:**
     - href: `https://wa.me/27XXXXXXXXX?text=Hi%2C%20I%20would%20like%20to%20pick%20a%20time%20for%20a%20free%2030-minute%20call%20with%20a%20licensed%20adviser.`
     - Button: "WhatsApp us to pick a time".
     - Paragraph: "Send us a WhatsApp message to ask for a time. Our booking assistant uses AI, and you can type "person" at any time to reach a human."
     - Small print: "Please do not send ID numbers, bank details or health details. Read the privacy notice." Drop "We use your message only to reply", because W03 shares details with an adviser after consent.
     - Delete or update /book-route.js (row 59).
  5. FAQ answers, SR1 and SR2 → WhatsApp wording (cqa); no Lead Velocity, no advice.
  6. **Post CTA unchanged**, because book.html routes to WhatsApp. If a WhatsApp post line is ever used, use WA-POST (86 with the placeholder, ~92 with a live link) and fix WU05.md:53 and C03.md:58 to match.
  7. Review the wa.me entry in row 26's Moderation Assist list.

**B62 · Organic A/B tests (row 62)**
- **When.** Start after the warm-up, once single posts reach a few hundred people.
- **Scope.** Facebook only; A/B tests can't include IG. Image or text posts only; Reels can't use Link clicks.
- **Variants.** Two (Meta allows up to 4, but the audience is small). They differ only in the hook line. Hooks come from the content-engine.md §4 formulas only: third person; no claims about money, family or health; no banned hooks; never ask for likes, comments, tags or shares.
- Every variant passes the same cqa check as a published post, because Meta shows every variant to real people.
- CTA and CLOSE appear word for word in every variant and are never tested.
- **Settings.** Key metric: Link clicks (the default, Reactions, rewards bait). Duration: 3 h, starting 15:00 so the winner publishes in the 18:00 slot; a 24 h test clashes with the next day's post. Default version: A (the approved baseline).
- **Decisions.** Log every result. Adopt a hook pattern only after it has won on Link clicks across at least 14 days of tests (about 4 or more).

### 3c. Copy strings

Counts are Unicode characters, measured 6 Oct. Brackets are filled by hand; never send them as typed.

**Core**
```
CTA (80):      Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
CLOSE (77):    SortMyCover gives no financial advice, product comparisons or premium quotes.
DISC-FULL-v2 (109): SortMyCover gives no financial advice, product comparisons or premium quotes. Licensed financial advisers do.
```

**Messenger automations**
```
INSTANT-v1 (257, NEW):
Automatic reply. Thanks for the message. A person from SortMyCover reads every message and replies here. SortMyCover gives no financial advice. Please don't send ID numbers, bank details or health details here. Privacy notice: sortmycover.co.za/privacy.html

AWAY-v2 (267, NEW; POPIA line added in this sheet for parity with INSTANT-v1):
Thanks for the message. A person from SortMyCover replies from 07:00. We book calls. Licensed advisers give the advice. Please don't send ID numbers, bank details or health details here. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

KW-PRICE (222, NEW):
This is an automatic reply from SortMyCover. We don't quote or give advice; that is exactly what a licensed adviser goes through on the call. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
```
INSTANT-v1 links privacy.html while it still shows DRAFT. That is accepted for the POPIA s18 notice, and book.html already links it. The SR5 gate is specific to the "who is behind" answer.

**FAQs** (type the question and answer into separate fields; never type "Q:" or "A:")
```
FAQ1-Q (37): Pick a time for a free 30-minute call
FAQ1-A (390, D1 = A wording):
Thanks. A person from SortMyCover will reply here with times to choose from. The call is free, takes about 30 minutes and is with a licensed adviser. There's no obligation to buy anything. We only ask for what's needed to book. Please don't send ID numbers, bank details or health details here. What happens on the call: https://sortmycover.co.za/learn/what-happens-on-a-30-minute-call.html

FAQ2-Q (29): Does SortMyCover give advice?
FAQ2-A (218):
No. SortMyCover books the call. A licensed financial adviser gives the advice, and shares their name and licence details before the call. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

FAQ3-Q (24): How is SortMyCover paid?
FAQ3-A (353):
Advisers pay SortMyCover the same flat fee for each 30-day cycle, whether or not anyone buys. SortMyCover never takes commission. The call is free.
More: sortmycover.co.za/how-we-make-money.html
Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
SortMyCover gives no financial advice, product comparisons or premium quotes.

FAQ4-Q (38): How do I check an adviser is licensed?
FAQ4-A (281):
Ask for the adviser's full name and FSP number. Then search it at fsca.co.za or call the FSCA toll-free on 0800 110 443. Before a SortMyCover call, you get the adviser's name, practice and FSP number. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
```

**Saved replies** (shortcuts sr1–sr9, no spaces)
```
SR1-A (296, D1 = A):
Hi [first name], thanks for asking. Here are three times for the free 30-minute call with a licensed adviser:
1. [Day date] at [time]
2. [Day date] at [time]
3. [Day date] at [time]
Reply 1, 2 or 3, or send a day and time that suits. The call is by video, and the link comes here before the call.
[+ the cqa-approved Messenger consent line, not yet written]

SR1-B (295, D1 = B; false until the slot picker is live):
Hi [first name], thanks for the message. Booking happens on the website, where the open times come straight from the adviser's calendar.
Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
SortMyCover gives no financial advice, product comparisons or premium quotes.

SR2-A (272, D1 = A):
Booked: [Day date] at [time], a free 30-minute video call with a licensed adviser. Before the call, we send the adviser's name and licence details here, plus the video link. Need a different time? Just reply here. Please don't send ID, bank or health details in this chat.

SR2-B (277, D1 = B and default):
Nothing is booked in this chat. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za. The adviser's name and FSP number reach you before the call, so you can check them on the FSCA register. Please don't send ID, bank or health details in this chat.

SR3 (203):
That is exactly what a licensed adviser goes through on the call, we don't quote or advise. There is no obligation to buy. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SR4 (344):
Fair question. SortMyCover books free calls with licensed advisers and gives no advice itself. There's no obligation to buy anything. Before any call, the adviser shares their name, their practice and its FSP number. Any FSP can be checked free at fsca.co.za or on 0800 110 443. How SortMyCover is paid: sortmycover.co.za/how-we-make-money.html

SR5-NOW (135):
SortMyCover is a South African service. The privacy notice and terms name the company that is legally responsible for personal details.
SR5-AFTER (193):
SortMyCover is a South African service. The privacy notice and terms name the company that is legally responsible for personal details. Read the privacy notice at sortmycover.co.za/privacy.html

SR6 (134):
Right now, the advisers on this service work with people aged 35 to 50. You can still talk to any licensed financial adviser yourself.

SR7 (134):
That's fine, the call is a chance to talk it through. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SR8 (176):
That's exactly what the adviser will go through with you on the call. We don't quote or advise. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SR9 (306):
What a payslip line or a job change means for one family is exactly what a licensed adviser goes through on the call. We don't quote or advise. A general read: sortmycover.co.za/learn/how-to-read-your-payslips-cover-line.html
Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

DATA-REPLY (137, NEW):
Thanks. Please don't send personal details in this chat. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

OPT-OUT (29, NEW):
Done. We won't message again.
```

**Comments**
```
CM-PUB (68):  Thanks, {first_name}. We have sent you a message with the next step.
CM-A (152, NEW):  Hi {first_name}, thanks for the comment. There is no obligation to buy. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
CM-B (193, NEW):  Hi {first_name}, we have hidden your comment to protect your personal details, please don't post them in public. Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
KEYWORDS:      forex, crypto, bitcoin, binary options, investment opportunity, funds recovery, recover your funds, recovery expert, hacker, account manager
LINK-DOMAINS:  t.me, telegram.me, wa.me, chat.whatsapp.com, bit.ly, tinyurl.com
```

**Posts and Page**
```
WU05-FEE (142): Advisers pay SortMyCover a flat fee for each 30-day cycle. The fee is the same whether or not anyone buys. SortMyCover never takes commission.

C01-ALT (320):
Dark charcoal graphic. Headline: 94.1% of death claims were paid. Smaller text: Declines included non-disclosure, fraud, waiting periods, exclusions and unpaid premiums. Two paper notes read Death claims paid: 94.1%, and Source: ASISA, 2025 figures. Footer: Sort your cover. 30 minutes. A real adviser. SortMyCover logo.

C03-STEP3 (84): 3. Check that the name is listed under that FSP number, and check the status shown.
C03-LINE (87):  These steps can be used to check any adviser, including one booked through SortMyCover.

C03-FB (full Facebook text after the edit):
The FSCA keeps warning about people who pretend to be licensed advisers, often on social media and WhatsApp.

How to check an adviser, in three steps:
1. Ask for the full name and FSP number.
2. Search it on the FSCA website (fsca.co.za) or call the FSCA toll-free on 0800 110 443.
3. Check that the name is listed under that FSP number, and check the status shown.

These steps can be used to check any adviser, including one booked through SortMyCover.

Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SortMyCover gives no financial advice, product comparisons or premium quotes.

FB-FALLBACK-A (79):  Pick a time for a free 30-minute call with a licensed adviser: m.me/sortmycover
FB-FALLBACK-B1 (86): Pick a time for a free 30-minute call with a licensed adviser: tap Send message below.
FB-FALLBACK-B2 (101): Pick a time for a free 30-minute call with a licensed adviser: tap Message on the Sort My Cover Page.

FB-BIO-REF (90, NEW): Free 30-minute call with a licensed adviser. Pick the time. We book the call. They advise.

ST1 (25): A person asks for a call.
ST2 (60): SortMyCover books it for a time that suits, then steps back.
ST3 (36): A licensed adviser gives the advice.

SVC-NAME (40): Free 30-min call with a licensed adviser
SVC-DESC (118): SortMyCover books the call for a time that suits. A licensed financial adviser gives the advice. No obligation to buy.

WA-POST (86 with placeholder): Pick a time on WhatsApp for a free 30-minute call with a licensed adviser: {{WA_LINK}}
```

**Instagram**
```
IG-NAME (35):          SortMyCover | Life cover, explained
IG-NAME-FALLBACK (29): SortMyCover | Cover explained
IG-BIO (140, NEW):
Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za
We book the call. The adviser gives the advice.
Link below.
IG-LINK-TITLE (37):    Pick a time for a free 30-minute call
IG-CAPTION (94):       Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za (link in bio)
IG-NOTE (60, NEW):     Pick a time: free 30-min call, licensed adviser. Link in bio
```

**Site**
```
OG-HOOK (91, NEW):    A free 30-minute call with a licensed adviser. Booked for a time that suits. No obligation.
BOOK-PARA (106, D1 = A): Message us on Facebook to pick a time. A person reads every message and replies with times to choose from.
BOOK-ITEM2 (102, D1 = A): You pick one. The call is by video. The link comes in the same Messenger chat when the time is booked.
IX-META (122):        SortMyCover connects people with licensed advisers for a free 30-minute call, booked for a time that suits. No obligation.
IX-FAQ (58):          How to join the call is confirmed when the time is booked.
PRIV-ROW (85, NEW):   Carries the messages you send us on Facebook Messenger or Instagram, so we can reply.
IG-BTN (38):          Message us on Instagram to pick a time
IG-PARA (94):         Send us a message on Instagram to ask for a time. A person reads every message and will reply.
```

**B44 strings** (cqa PENDING; faq-v1.0.4)
```
FAQ-04 en: I'm Thandi, SortMyCover's AI booking assistant. I can help with your booking, and you can ask for a person at any time.
FAQ-04 af: Ek is Thandi, SortMyCover se KI-besprekingsassistent. Ek help met jou bespreking, en jy kan enige tyd vra om met 'n mens te praat.
FAQ-08 en: Fair question. You can look up {practice} on the FSCA website with FSP number {fsp}, and the company behind SortMyCover is named at sortmycover.co.za/privacy.html.
FAQ-08 af: Regverdige vraag. Jy kan {practice} op die FSCA se webwerf naslaan met FSP-nommer {fsp}, en die maatskappy agter SortMyCover word by sortmycover.co.za/privacy.html genoem.
FAQ-09 en: Advisers pay SortMyCover the same flat fee for each 30-day cycle, and the call is free. It is never a commission and never a share of any policy.
FAQ-09 af: Adviseurs betaal SortMyCover dieselfde vaste fooi vir elke siklus van 30 dae, en die oproep is gratis. Dit is nooit kommissie nie en nooit 'n deel van enige polis nie.
FAQ-15 en (title "Who runs SortMyCover?"): SortMyCover books free 30-minute calls with licensed advisers, and we don't give advice ourselves. The company responsible for SortMyCover is named in our privacy notice at sortmycover.co.za/privacy.html.
FAQ-15 af: SortMyCover bespreek gratis oproepe van 30 minute met gelisensieerde adviseurs, en ons gee nie self advies nie. Die maatskappy verantwoordelik vir SortMyCover word in ons privaatheidskennisgewing by sortmycover.co.za/privacy.html genoem.
reply-corpus money row: The adviser pays SortMyCover a flat fee, the call is free, and there is no obligation to buy.
reply-corpus objection_calm en #2: Fair to ask, {first_name}. The call is free, the adviser pays SortMyCover a flat fee, and there is no obligation to buy, so we have sent you a message with more.
guardrail.md l.41: …other than SortMyCover or the adviser's own practice
guardrail.md l.52: …that SortMyCover is paid a flat fee and never a commission
persona.md l.6, 37, 48, 65, 79: Thandi, SortMyCover's booking assistant for {adviser_first}   (keep the 4.11 point: the platform's bot, not the broker's)
persona.md l.48 + template-submission-runbook.md l.38 (NH-19(a)): This chat is run by SortMyCover's AI booking assistant.
lines.mjs DISCLOSE (en): Hi {first_name}, I'm Thandi, SortMyCover's booking assistant for {adviser_first}. I'm an AI assistant, and you can ask for a person at any time.
lines.mjs DISCLOSE_PRE_ROUTE (en): Hi, I'm Thandi, the SortMyCover booking assistant. I'm an AI assistant, and you can ask for a person at any time.
```
The privacy URLs above use `/privacy.html` rather than the judges' `/privacy`, because `/privacy` returns 404 (no cleanUrls).

---

## 4. Dropped items and why

| Item | Why dropped |
|---|---|
| Messenger greeting / welcome screen | Both judges: Standard-access apps show it only to people with a role on the app; adding get_started would override the Inbox FAQs; "A person replies here" becomes false once W31 answers first. Revisit only with Advanced pages_messaging. |
| Book now or Learn more → site as the action button (for now) | It loops Page → site → book.html → Messenger, and "Book now" misleads while book.html says booking isn't open. Returns only with D1 = B (row 7a). |
| Messenger slot offers that always include an evening and a Saturday slot | The adviser's set hours are Mon–Fri 09:00–17:00, max 3 calls a day, and the booking engine rejects other slots (W04/W05 tests). |
| "Who are the advisers?" ice-breaker | L-2 (FSP vs representative) is open, and any answer risks naming an FSP before WhatsApp (rule 1.2). |
| Native comment-to-message keyword stand-in before W30 | Keywords match anywhere in a comment ("not interested"), so it would auto-DM sensitive or number-posting comments; it can't hide numbers. |
| "Hold C01" | Business Suite has no hold control. Replaced by the edit, which is done (0bb9e37). |
| profile-kit About Options A/B and DISC-FULL-v1 | They name Lead Velocity (withdrawn by DW-v2 on 5 Oct). |
| Instant reply Off | Superseded by row 6 (POPIA notice on the direct path); needs Jonathan's override (NH-67 (9)). |
| H8 "Most never check" and the replacement hook "A free 30-minute call with a licensed adviser. Pick a time." | The first is a negative descriptive norm (P9). The second is 11 words (≤8 rule), isn't a myth-bust, and paraphrases the CTA. H18 is used instead. |
| m.me `?text=` prefill | Not in Meta's m.me docs, and a prefilled send hides the ice-breakers. |
| m.me ref attribution now | The Inbox doesn't show ref, and new threads pass it only via a Get Started postback. Moved to the W31 backlog. |
| Referrer / fbclid capture on the holding site | The site promises it collects nothing; it can't separate the Intro click from post links anyway (POPIA s10, s13, s18). |
| sessionStorage / referrer detection for Instagram | book.html's referrer is always the site itself, and the landing has no script to store utm. Replaced by user-agent detection. |
| FB Page Highlights; FB Story link sticker | Neither is documented for FB Pages. FB Stories use on-image text only. |
| Profanity filter "Strong" | New Pages have an on/off toggle only. |
| 24 h and 4-variant A/B tests | 24 h clashes with the next post; 4 variants split a small audience too thin. |
| Scarcity, urgency and bait ("only 3 slots left", "today only", "comment CALL", "tag someone") | Adviser time can't honestly be called scarce. Meta demotes clickbait and engagement bait. Banned by brand rules. |
| Brunson offer stack (bonuses, scarcity) | FAIS, Meta and brand rules. Hook-Story-Offer is kept only as a layout check: hook = cover line; story = WU05 + WU04/R01; offer = bio, button, FAQ #1. |
| Reviews asks, bought likes, follower-count claims | P8: no fake or solicited proof. Followers are built through the warm-up Reach campaign only. |
| Dynamic-norm lines ("more people are starting to…") | Allowed only with a sourced, dated SA statistic, and none is on file. |
| Instagram Book button | It needs a listed partner integration (Acuity, Setmore). |
| IG profile lead form and ad-hoc instant forms | They collect data outside the spec'd consent. Only Campaign A's form at G11. |
| Facebook Appointments | Retired by Meta (from July 2024). |
| Meta Verified / Meta One purchase | No spend before the first broker payment (MASTER-PROMPT). |
| Age restriction | It hides the Page from logged-out visitors checking the brand. |
| Free-text Services entry | Likely unavailable (a fixed label list); finance labels would imply a licensed provider. Row 40 checks it. |
| Linking IG via Accounts Centre or Business Suite → Instagram accounts → Add | The first isn't a Page-linking path; the second is the blocked portfolio route. |
| Pinning C03 as an ad | An ad's unpublished post can't be pinned; only the organic C03 is used. |

---

## 5. Sources

**Meta (A)**
- One action button: https://www.facebook.com/business/help/2150969905216708 · steps: https://www.facebook.com/help/977869848936797
- Response badge and automations: https://www.facebook.com/business/help/201893553741970 · https://www.facebook.com/help/475643069256244 · Meta Help 546874462185280, 800788243369168, 558711852497378, 1553463246785273
- Business Agent: Meta Help 1505847033372169, 834508185328904, 395965998733706, 318238182723007, 1105546398456682
- Reviews: Meta Help 548274415377576 · Page sections: 173376349438782 · Category: 222732947737668 · Services: 761929797270214, 160672070698623, 918592541485077
- Age restrictions: 778445532225441 · Moderation: 1017549069082358, 131671940241729; Business Help 845417592621623, 1753036688579904
- Page transparency: https://www.facebook.com/help/323314944866264 · Claim responsibility: 1843115515813561 · Advertiser/payer: https://www.facebook.com/business/help/721913190475838
- Pins / Featured: https://www.facebook.com/help/235598533193464 · Link previews: Meta Help 103043593796161 · Image caching: https://developers.facebook.com/docs/sharing/webmasters/images
- Link-post allowance: Meta Help "About links in organic Facebook Page posts and comments" · A/B tests: Meta Help 942567712892076, 1675344823455042
- m.me links: https://developers.facebook.com/docs/messenger-platform/discovery/m-me-links/ · ig.me links: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/ig-me-links
- Welcome screen / Messenger Profile API: Messenger Platform docs · WhatsApp Page link: https://www.facebook.com/business/help/1583303048513172, https://www.facebook.com/help/2783732558314697
- Instagram: https://help.instagram.com/502981923235522 · /570895513091465 · /122793804938499 · /313280685976255 · /1419650861499317 · "About trial reels on Instagram" · "Create a channel on Instagram" · "Expanding sharing links in Stories to everyone" (about.instagram.com)
- Meta One newsroom (15 Sep 2026) · Page speed: https://about.fb.com/news/2017/08/news-feed-fyi-showing-you-stories-that-link-to-faster-loading-webpages/ · Ads transparency: https://about.fb.com/news/2018/06/qa-on-ads-and-pages-transparency/
- Clickbait: https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/clickbait-links/ · Engagement bait: https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/engagement-bait/

**Research (B)**
- Speed to lead: https://www.onecavo.com/wp-content/uploads/2015/11/MIT-InsideSales.com_Best-Practices-for-Lead-Response-Management.pdf · https://hbr.org/product/the-short-life-of-online-sales-leads/F1103B-PDF-ENG
- Implementation intentions: https://www.nber.org/papers/w17183 · Choice overload: Scheibehenne et al. 2010 (Semantic Scholar) · https://myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2014.08.002
- Reading and attention: https://dl.acm.org/doi/10.1145/1835449.1835513 · https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/ · https://www.nngroup.com/articles/how-little-do-users-read/
- Information scent: https://www.nngroup.com/articles/information-foraging/ · https://www.nngroup.com/articles/wrong-information-scent-costs-sales/
- Credibility: http://credibility.stanford.edu/pdf/How_Do_People_Evaluate_a_Web_Site's_Credibility_v37.pdf · https://credibility.stanford.edu/guidelines/index.html · https://www.nngroup.com/articles/trustworthy-design/ · https://www.edelmansmithfield.com/trust/2025/trust-barometer/report-financial-sector · https://www.fsca.co.za/Regulated-Entities/
- Fluency: Reber and Schwarz 1999 (Semantic Scholar) · https://pubmed.ncbi.nlm.nih.gov/16754871/ · Unbounce benchmark: https://unbounce.com/conversion-benchmark-report/finance-insurance-conversion-rate/
- Zero price: https://pubsonline.informs.org/doi/10.1287/mksc.1060.0254
- Norms and proof: https://sparq.stanford.edu/sites/g/files/sbiybj19021/files/media/file/goldstein_et_al._2008_-_a_room_with_a_viewpoint.pdf · https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376 · Sparkman and Walton 2017 (ResearchGate 320115570) · https://www.sciencedirect.com/science/article/abs/pii/S0167811606000267 · https://www.fs.usda.gov/psw/publications/winter/psw_2006_winter001.cialdini.pdf
- Reassurance: https://www.ama.org/2023/01/25/the-bulletproof-glass-effect-unintended-consequences-of-privacy-notices/ · https://dash.harvard.edu/entities/publication/4ccc3408-b011-41a3-ab04-145579fdc083
- Messaging preference: https://www.campaignlive.com/article/facebook-study-53-consumers-likely-shop-business-message/1404632 · Mobile speed: https://web.developers.google.cn/case-studies/milliseconds-make-millions

**Practitioner (C)**
- https://unbounce.com/conversion-glossary/definition/attention-ratio/ · https://unbounce.com/conversion-glossary/definition/message-match/ · https://cxl.com/conversion-optimization/ · https://speero.com/peep-laja · Laja "clarity trumps persuasion" (LinkedIn)
- Aagaard/ContentVerve: https://www.duncanjonesnz.com/michael-aagaard-how-to-write-high-converting-sign-up-form-copy/
- Badge summary: https://blog.brandbastion.com/get-and-keep-very-responsive-to-messages-facebook · Automations: https://napoleoncat.com/blog/facebook-automated-responses/
- Cover sizes: https://socialsizes.io/facebook-cover-photo-size/ · https://lineardesign.com/blog/facebook-banner-sizes/
- Fogg model: https://www.redtrack.io/blog/fogg-behavior-model/ · Brunson: https://systeme.io/blog/2-comma-club
- IG links: https://searchengineland.com/instagram-now-allows-up-to-5-links-in-bio-395742 · IG name field limits: outfy.com, sendible.com, erinkendal.com

**Repo (internal rules, A)**
- docs/MASTER-PROMPT.md (1.1, 1.2, 2.1, 4.2, 4.6, 4.11, 4.14, 4D.4a)
- deliverables/meta-operator/profile-kit.md, setup-checklist.md, meta-ids.md, content-engine.md, page-optimisation-research.md
- deliverables/brand-naming-lead/disclosure-wording.md (DW-v2)
- community/rules.json, reply-corpus.md, hide-words.md
- knowledge/faq.md · conversation/deferral-lines.md
- landing/holding/book.html, index.html, privacy.html
- deliverables/compliance-qa/ (warmup-review, phase4-review-2/3/4/5)
- deliverables/contracts-drafter/term-sheet-mark.md
- build/needs-human-log.md
