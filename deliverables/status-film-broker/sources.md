# Sources for `script.md` (broker film "Where we are")

Every factual sentence in the narration, with the file that supports it. Paths are relative to `C:\Users\Jono\lead-velocity-sortmycover` unless stated. Line numbers were taken on 10 Oct 2026. The script was revised the same day after a review pass; this file matches the revised script.

## Source key

| Key | File |
|---|---|
| LGSA | `deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md` (v0.2 clean, "DRAFT for practitioner review", line 1). Cited as clause / line. |
| CAP | `deliverables/automation-engineer/whatsapp-capture-flow-v2.md` (cited by line) |
| MSC | `deliverables/broker-success/microsoft-connect-setup.md` |
| START | `src/pages/portal/Start.tsx` at HEAD (`git show HEAD:src/pages/portal/Start.tsx`; the working copy has other-session edits that do not touch the facts used here) |
| PROFILE / CAL / AGR / CARD / MEDIA | `src/pages/portal/Profile.tsx`, `Calendar.tsx`, `Agreement.tsx`, `IntroCard.tsx`, `IntroMedia.tsx` |
| STEPS | `src/lib/smc.ts` lines 133-141 (the onboarding step list) |
| PRICE | `src/lib/pricing.ts` and `src/pages/Pricing.tsx` (public pricing page; FAQ at lines 108-116) |
| CHK | `deliverables/broker-success/onboarding-checklist.md` |
| SPEC | `portal/spec/README.md` (event contract, line 77) and `portal/spec/01-start-here.md` (lines 7 and 17) |
| META | `deliverables/meta-operator/` (`meta-ids.md`, `daily/`, `warmup-posts/`, `current-posts/`) |
| FACTS | Founder-level status notes for 10 Oct 2026, outside the repo: `C:\Users\Jono\AppData\Local\Temp\claude\C--Users-Jono-Desktop-EMMA\92d9e93c-b685-43c4-a3b7-f0bb94da1a4a\scratchpad\status-film-oct10\facts.md` (temporary session file; not copied into the repo because it holds internal items) |
| GIT | `git log` of this repo (commit ids below) |
| BRIEF | The wording rules and scene arc given for this film (not a fact source; used only where stated) |

## Scene 1: What Lead Velocity does for you

| Sentence | Supported by |
|---|---|
| Lead Velocity books calls into your diary, with people who have asked to speak to an adviser. | LGSA 4.1(e) (books an introductory Microsoft Teams appointment into the client's calendar), 5.1(a)-(b) and Schedule 2 S2.1 rows 1-2 (the person responded, gave contact details and consented to be contacted and introduced), line 20 (Background A: books introductory appointments). Scene 2 opens with "will reach you once you're switched on", and scene 6 says delivery has not started, so the present tense here is a description of the service. |
| You pay one flat fee per thirty-day cycle. | LGSA 1.1.4 (Billing Cycle = 30 days), 8.1-8.2, S1.1; PRICE `pricing.ts` lines 83-85 (TERMS_TEXT). |
| It's never per policy, and never commission. | LGSA 8.2, 8.3 (no commission, success fee or share of premium); PRICE `pricing.ts` lines 87-88 (NO_GUARANTEE_TEXT: "No commission, ever"). |
| Our consumer brand, SortMyCover, | LGSA 1.1.32 (SortMyCover = consumer-facing brand and trading name of Lead Velocity), line 20. |
| publishes honest, broker-neutral content | Content is live: FACTS line 23 ("As at 7 Oct: 3 posts live, 3 scheduled") and the post files in META (`daily/`, `warmup-posts/`, `current-posts/`); LGSA line 20 (Background A: "broker-neutral advertising"), 3.3(a). "Honest" is the BRIEF's description of the brand and is not verifiable from a file. |
| and runs the ads. | LGSA line 20 (Background A) and 3.3(a) describe the brand's role. **Paid ads are not running yet:** FACTS line 95 (first ad campaign only after the first payment lands). Allowed by the BRIEF ("runs honest, broker-neutral content and ads"); scene 2 ("will reach you once you're switched on") and scene 6 carry the status. Re-cut this phrase when paid ads are live. |
| We never give advice. | LGSA 3.2(a), 3.4; PRICE `Pricing.tsx` line 114 (FAQ: "It never gives advice"). |
| That part is yours. | LGSA 4.4, 14.2 (advice, needs analysis, quotes and sales are solely the broker's responsibility). |

## Scene 2: How a lead reaches you

Order follows CAP line 7 (the path in one line) and lines 73-83, 108-124: consent, then the WhatsApp number is verified, then the questions, then (A-tier) the booking and welcome card, and only after the Flow completes the email link.

| Sentence | Supported by |
|---|---|
| Here's how leads will reach you once you're switched on. | Future tense on purpose: CAP line 3 ("built and tested offline, not live"); FACTS lines 69-96 and line 95 (paid ads start only after the first payment lands). |
| Someone taps a SortMyCover ad or post. | CAP line 7 (path: ad click-to-WhatsApp, or the landing page); posts: FACTS lines 19-27 and META `daily/`, `warmup-posts/`, `current-posts/`. The on-screen strip adds "Website or WhatsApp" (CAP line 7; website live: FACTS line 25, GIT `8226cb2` "site live on sortmycover.co.za"). The WhatsApp route is built but not live (scene 6). |
| They agree to be contacted, | CAP lines 12-15 (consent tap before the flow starts); LGSA 5.1(b). |
| we verify their WhatsApp number, | CAP line 7 (the inbound message proves the number, marked verified, before the questions); LGSA 5.8(a). |
| and they answer a few quick questions. | CAP lines 9-10 and 17-71 (screens inside WhatsApp, no browser); LGSA S2.2 (the same questions for every client). |
| Higher-budget leads then pick a time from the free slots in your calendar. | CAP lines 73-77 ("10. Pick a day -> Pick a time -> Check and book (tier A only)"; the broker's Outlook free/busy, working days only); LGSA 5.6(a) (A-tier is "sent to the Client, booked and counted automatically"), 4.1(e). "Higher-budget" is used because the A and B tiers are only explained in scene 3. B-tier leads pick a time only after the broker accepts: CAP lines 92-106, LGSA 5.7(b); said in scene 3 ("If you accept, they pick a time"). |
| A Teams meeting lands in your diary, | LGSA 4.1(e) ("appears in the Client's own calendar"), S2.4 ("a Microsoft Teams appointment in the Client's calendar"); CAP line 76. |
| and they get your intro card, with your name, practice and FSP number. | LGSA 1.1.19, 4.1(d), S4.5 (the card states the client's name, practice name and FSP number); CAP lines 79-83 (welcome card arrives after the booking); CARD lines 58 and 66. |
| We then send a one-tap link to confirm their email. | CAP lines 108-124 (after the Flow completes, one email with a one-tap link and a 6-digit code); LGSA 5.8(b). Last in the sequence on purpose. |

## Scene 3: A-tier and B-tier leads

| Sentence | Supported by |
|---|---|
| Every lead is labelled A-tier or B-tier, by the monthly budget they tell us. | LGSA 5.6 (lines 238-246: sorted by the stated monthly budget, labelled A or B when sent); PRICE `Pricing.tsx` line 108 ("Every lead is labelled A or B"). |
| It's their own answer, which we don't check. | LGSA 5.3 (self-declared; not verified or underwritten), 5.6 last line (line 246: "The tier is the Consumer's own answer"). |
| Leads in A-tier say fifteen hundred rand or more, and count automatically. | LGSA 5.6(a) (line 240), 5.2; PRICE `pricing.ts` lines 67-70 (BUDGET_TARGET_TEXT). The sentence starts with "Leads in" so the voice does not read a sentence-initial "A-tier" as the article "a". |
| Leads in B-tier say seven hundred and fifty rand to fourteen hundred and ninety-nine rand. | LGSA 5.6(b) (line 242); CAP lines 54-60. |
| You see a short summary, and accept or decline within two working hours. | LGSA 5.7(a) (the offer shows label, age band, budget band and reason(s) for the call, not contact details; the on-screen card shows exactly those), 5.7(d) (2 working hours, 08:00-17:00 Mon-Fri excl. public holidays); CAP lines 92-106. |
| If you accept, they pick a time. | LGSA 5.7(b) (accepted: Lead Velocity books the appointment); CAP lines 92-106 (accept -> the lead gets the "Pick a time" card). |
| If you decline or miss the window, it doesn't count and you're not charged. | LGSA 5.7(c) ("does not count ... and is not charged"), 5.7(d) (no answer = declined); PRICE `pricing.ts` lines 69-70. |
| Under seven hundred and fifty rand, we filter the lead out. | LGSA 5.6(c) (line 244: filtered out, never sent, never counted); CAP line 60. |

## Scene 4: What you can rely on

| Sentence | Supported by |
|---|---|
| Wrong contact details never count. | LGSA 5.8(d) (a lead whose details fail the checks or are later shown to be wrong, disconnected or someone else's is disqualified and does not count); PRICE `Pricing.tsx` line 113 ("Invalid contact details never count in the first place"). Deliberately not "every email is confirmed" (see "Not fully supported" 3). |
| If someone doesn't turn up, we may replace the lead as a goodwill gesture, when you send proof, up to a weekly limit. | LGSA 7.1 ("may ... as a discretionary goodwill gesture"), 7.2 (weekly maximum; the number is deliberately not said), 7.3 and Schedule 3 (the Client sends the proof, after waiting at least 10 minutes); PRICE `Pricing.tsx` line 113 ("if you send proof"). |
| If delivery runs late, anything still owed rolls into your next cycle, on top, or you can ask for a refund per lead. | LGSA 6.1 (shortfall delivered in the rollover period after the cycle), 6.2 (rollover on top), 6.3 (refund on request for each undelivered lead); PRICE `pricing.ts` lines 72-75. |
| If you question a lead, ask in writing, | LGSA 7.8 (line 312). |
| and within two working days we send the consent record, booking confirmation and their own answers. | LGSA 7.8, 1.1.12A (line 56: Dispute Evidence = consent record, booking confirmation, the consumer's own answers); CAP lines 132-133. The 2-working-days period started as one broker's requested amendment and is now a standard clause (7.8) of the master agreement, which is what the film describes; no broker is named. |
| We don't promise attendance or sales. | LGSA 5.5, 15.1 (line 474); PRICE `pricing.ts` lines 87-88. |
| The full terms are in the agreement you sign. | Added so that no viewer takes the film as the contract (review finding). The film's terms are the standard ones from LGSA v0.2 and the public pricing page; the signed agreement governs. |

## Scene 5: What is built

| Sentence | Supported by |
|---|---|
| As at October twenty twenty-six, here is what is built. | Date of this film: 10 Oct 2026 (session date, FACTS line 1). The only date in the narration. |
| The broker portal, with onboarding, | START lines 69-90 and STEPS (a step list with a "Next" button); `portal/spec/01-start-here.md`. |
| calendar connection screens, | CAL lines 159-200 (the "Sign in with Microsoft" screens); GIT `6472daf` ("portal: Connect my Outlook calendar"); MSC. The screens are built; the Microsoft sign-in itself is **not switched on** (CAL line 99: "Microsoft sign-in isn't switched on yet"), which is why the film says "screens" here and lists the sign-in under scene 6. |
| online signing | AGR lines 121-155 (e-sign with typed name, timestamp and document hash). |
| and your intro card. | CARD lines 54-98 (preview and approve). |
| The WhatsApp quick-questions flow, built and tested offline. | CAP line 3 ("built and tested offline, not live"); GIT `4cbb9ce`. No test counts are given in the film. |
| Facebook and Instagram content for SortMyCover, written and checked. | META: `daily/D01-D14`, `warmup-posts/WU01-05`, `current-posts/C01-C03`, with Instagram captions (`daily/D06.md` line 60, `warmup-posts/README.md` line 33); checked: FACTS lines 22-24, GIT `6eb44ae` (three-reviewer QA). The film says content, not accounts, because the Instagram account is only mentioned in FACTS line 21 (see "Not fully supported" 4). The brand name is a bare token ("SortMyCover,") so the voice script's spelling map expands it to "Sort My Cover"; a possessive ("SortMyCover's") would not match. |
| And its website. | FACTS line 25 (sortmycover.co.za live on HTTPS), GIT `8226cb2`. |

## Scene 6: Final set-up and still to finish

| Sentence | Supported by |
|---|---|
| Two pieces are in final set-up. | BRIEF wording; FACTS lines 69-96 (items that gate go-live). Only the two items below are in set-up. |
| Our WhatsApp number and email, | FACTS lines 75-77 (items 5 and 6: the dedicated WhatsApp number and the email for the consumer brand's domain). Stated generically on purpose. |
| and the Microsoft sign-in for your calendar. | CAL line 99 ("Microsoft sign-in isn't switched on yet"); MSC (app registration and secrets still to be done once); FACTS line 78 (item 7). |
| Three are still being finished. | FACTS lines 90-93 ("What Claude builds next", items 1-3): these are **not built yet**, so they are not called "final set-up". |
| Lead routing and allocation, | FACTS line 92 (pacing-based allocation with caps and admin controls). A repo search finds design notes for allocation but no finished allocation code (see "Not fully supported" 5). |
| the screens to manage them, | FACTS line 93 (admin screens for leads, brokers and allocation). |
| and a website chat assistant that never gives advice. | FACTS line 91 (website chat agent, no advice, routes to the right broker); LGSA 3.4 (questions about products are deferred to the broker). |
| The full system is not switched on yet, so lead delivery has not started. | CAP line 3 (not live); FACTS lines 69-96; LGSA 2.2, 10.2 (delivery starts only after onboarding items and cleared payment). The film never says leads are flowing, and no longer says the system "is being switched on now", because three of the five pieces are not built. |

## Scene 7: Your onboarding in six steps

| Sentence | Supported by |
|---|---|
| After a short welcome video, onboarding is six steps in the portal. | STEPS lines 133-141: seven rows. Row 1 is the optional 3-minute video ("Watch the 3-minute video", not blocking); the six that follow are the steps named. START line 70 shows the portal heading "Your 7 steps", so the on-screen cards are numbered 1 to 7 as in the portal, with the video as card 1, and the narration uses First, Next, Then, Last instead of numerals. CHK lines 5-11. |
| First, your details and FSP number, checked on the FSCA register. | STEPS line 135; PROFILE line 99 ("We check your FSP number on the public FSCA register"). |
| Next, connect your Outlook calendar with one tap, once it's switched on. | STEPS line 136; CAL lines 160 and 179 ("One tap"); LGSA S1.5(b). "Once it's switched on" because CAL line 99 says the Microsoft sign-in is not switched on yet; the same item is in scene 6. |
| We only look at when you're free, and we add your meetings. We never read your emails. | CAL line 179, used in full: "We only look at when you are free, and we add your meetings. We never read your emails."; MSC lines 28-38 (permissions requested are Calendars.ReadWrite, OnlineMeetings.ReadWrite, User.Read, offline_access, openid; no Mail permissions). Not shortened, because the app can write meetings to the calendar. |
| Then check your working hours, sign your agreement, and approve your intro card. | STEPS lines 137-139; CAL lines 202-204 and 240 ("We started you on a normal week ... tap Looks right"); AGR lines 121-155; CARD lines 58 and 89-92. |
| Last, record an optional twenty-five second intro. | STEPS line 140 (title "Record your 25-second intro", not blocking: "Not needed to go live"); MEDIA lines 30-35. |
| When onboarding is done and your first payment has cleared, we run a final check and switch you on. | LGSA 2.2 (delivery starts after the later of the first fee clearing and the onboarding items), 10.2 (delivery only on cleared payment), S1.5; CHK line 13 and START HEAD lines 43, 46, 94-95 (final check, then switch-on, then a WhatsApp message; the source names a person, the film says "we"). The order of payment and onboarding is left open on purpose: the contract fixes neither, SPEC (event `broker.created`, line 77) creates the broker record and sends the portal login when payment is received, and CHK lists payment after the steps. |

## Scene 8: What happens next

| Sentence | Supported by |
|---|---|
| When you go ahead, we send your login for the broker portal. | BRIEF (scene 8 arc). The portal needs a login: SPEC `01-start-here.md` lines 7 and 17 (password login today, magic link not built) and SPEC `README.md` line 77 (the welcome message with the login goes out when the broker record is created on payment). No source says exactly how the login reaches a broker, so the sentence is conditional ("when you go ahead") and says nothing about channel or timing (see "Not fully supported" 1). |
| Plans and fees are on the pricing page at leadvelocity dot co dot za. | LGSA 1.1.26 (Pricing Page = `www.leadvelocity.co.za/pricing`); PRICE `Pricing.tsx`. No amounts are said. |
| Questions? Reply to the message that brought you this video. | BRIEF (delivery by WhatsApp message). Not a fact in any source. |

The first-cycle sentence that used to sit here now lives only in scene 7 ("When onboarding is done and your first payment has cleared ...").

## Wording-rule checks (run on `script.md`)

- No person, client, company-of-a-client or competitor is named. Platforms named: WhatsApp, Microsoft, Teams, Outlook, Facebook, Instagram, and the regulator register FSCA.
- No fee amounts. The only rand figures are the lead-tier thresholds (R1,500, R750, R1,499), which are standard terms (LGSA 5.6, public pricing page).
- No FSP number, secret, key, token, test count, margin, cost-per-lead, show-rate or funnel arithmetic, internal to-do, withdrawn plan or one broker's negotiated terms. The dispute-evidence period is described as a standard term.
- "October 2026" appears once (scene 5 narration). No go-live date or day count is promised.
- Calls are for a time the person picks. Nothing is instant, nothing is guaranteed.
- Status: scene 5 lists only what is built; scene 6 separates two pieces in final set-up from three still being finished and says the system is not switched on yet and lead delivery has not started.
- Narration characters: letters, apostrophes, commas, full stops, hyphens and question marks only; no digits, no "R", the domain is spelled "dot co dot za".

## Not fully supported from the sources (read before sending the film)

1. "When you go ahead, we send your login for the broker portal" and "reply to the message that brought you this video" come from the brief, not from a file. SPEC says the login goes out on payment; nothing in the repo contradicts the film's conditional wording.
2. The terms in scenes 3 and 4 (A/B tiers, two-working-hour accept or decline, goodwill replacement when the broker sends proof, rollover or refund, dispute evidence in two working days) come from LGSA v0.2, which is still marked "DRAFT for practitioner review" (FACTS lines 83-86, item 12: practitioner review of v0.2 outstanding), and from the public pricing page. **Before the first send, the founder confirms v0.2 is approved.** If the practitioner review changes any of these terms, scenes 3 and 4 change with it. Scene 4 ends with "The full terms are in the agreement you sign" so the film is never the contract.
3. Email confirmation: LGSA 5.8(b) says the email is verified by a one-tap code or link, but CAP lines 122-124 say a lead whose email stays unconfirmed after 24 hours is flagged, not blocked. The film therefore says "We then send a one-tap link to confirm their email" (scene 2) and "Wrong contact details never count" (scene 4), never "every email is confirmed".
4. The Instagram account is supported only by FACTS line 21 (created by the founder, not yet linked to the Facebook page). The repo's `meta-ids.md` (5 Oct) still says "Not created". The film claims only that Instagram content is written and checked, which the post files support.
5. Lead routing and allocation, the admin screens and the website chat assistant are listed in FACTS lines 91-93 as still to be built. A repo search finds design notes for allocation but no finished allocation code. The film therefore calls them "still being finished" and not "final set-up", and says the system is not switched on yet.
6. "Honest" in "honest, broker-neutral content" is the brief's description of the brand, not something a file can prove. "Runs the ads" describes the brand's role: paid ads start only after the first payment (FACTS line 95), and only organic posts are live.
7. Replacement limit: the contract (7.2) and the public pricing page say a weekly limit, while `automation/billing/pricing.seed.json` still holds per-cycle caps (4, 6, 9) (FACTS line 87, item 13). The film says only "a weekly limit" and gives no number.
8. The portal heading says "Your 7 steps" (START line 70). The film says "six steps" after a welcome video, and numbers the on-screen cards 1 to 7 as the portal does, so a broker who opens the portal sees the same numbers.
9. Payment order: the contract fixes only that delivery starts after the later of cleared payment and the onboarding items. The film does not say which comes first.
10. Voice check: once audio exists, listen for "A-tier" and "B-tier" (an earlier broker flow film flagged a sentence-initial "A-tier" read as the article "a"; no sentence here starts with it) and for "Sort My Cover" in scenes 1, 2 and 5.
11. Shelf life: scenes 5 and 6, the "runs the ads" phrase in scene 1 and the "once it's switched on" phrase in scene 7 describe status on the film's date. Re-cut them when the system is switched on, and say so before forwarding an old copy. Scenes 3 and 4 need a re-check when LGSA v0.2 is approved.
12. Folder hygiene: `scenes/_internal-reference/` holds the internal film's scene pages, including a named broker and an invoice number (`s02.html`, `s03.html`, `s07.html`). Delete the folder once the eight new scene pages exist, and before any `git add` or zip (the folder `deliverables/status-film-broker/` is untracked).
