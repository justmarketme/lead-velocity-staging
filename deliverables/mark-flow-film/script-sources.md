# Mark flow film: sources per beat

Script: `script.json` (4 chapters, 19 scenes, 63 beats, 1,387 narration words, 25 interactive beats, 6 callouts; every beat's narration is one or two sentences). Every factual claim below points to file:line. Repo root = `C:\Users\Jono\lead-velocity-sortmycover`. Line numbers re-checked on 7 Oct 2026 at 21:20, after commit 7b1a544 (Pilot Plan withdrawn) shifted LGSA lines from Schedule 1.5 onward up by one.

Review pass (7 Oct, 21:20): applied the review findings to the script. Narration (`say`) now spells acronyms for the voice (F S P, F S C A, F A I S, I T, E F T, V A T), says "Sort My Cover" and "Seepo" (Sipho); captions and screens keep the normal spellings. Part 3 cards carry Mark's request ("You asked: …") and the answer, so Part 3 has no callout bubbles.

## Before rendering or sending: gates and open decisions

**Release gates (product, outside the film; the film is not true until they are done):**

- **Gate A, login (c4s1b1).** LOGIN:305 labels the button "Initiate Access" ("Decrypting..." while loading). LOGIN:61-65 and LOGIN:98-103 send every broker to `/broker/orders` (or `/broker-elite`), never to `/broker/start`. `/broker/start` and every SortMyCover-only route are mounted only when `VITE_SMC_ENABLED === "true"` (APP:44, 113-120; SMC:13). The flag is off by default (.env.example:12). Fix BrokerPortal.tsx so SortMyCover brokers land on `/broker/start`, relabel the button "Sign in", and confirm the flag is on in production. Then re-check the login shot.
- **Gate B, My leads (c2s1b3).** LEADS:40 will not save "Attended" without a Step 2 disposition (LEADS:67-72; SMC:113-120) and a Step 3 quality score (LEADS:73-74). LEADS:172 shows the broker a show-rate target and "replacements x of {cap}". LEADS:55 and LEADS:201 describe replacements "after a 48-hour check" / "if they don't rebook within 48 hours". All of this conflicts with LGSA 8.4 (329: attended and could be contacted only), 7.2 (299: 3 a week, no-shows only) and S3.3 (703-707: proof within 30 minutes). Change Leads.tsx to Step 1 plus "could be contacted" before Mark gets a login. Then render that control exactly as built.
- **Gate C, practice name.** {PRACTICE} is unconfirmed (contradiction 11). Get it from Jonathan before rendering any screen that shows it. Never render the portal fallback "Your practice" on a consumer screen.

**Jonathan's calls (the film currently does what is written here):**

1. Consent footer (c1s2b3): the film renders the live W03 footer in full (contradiction 2). The alternative is to drop it entirely; a shortened footer is never allowed.
2. Signing method (c4s4b2): the film shows portal signing; LGSA 24.1 says signed PDF by email (contradiction 7).
3. Delay wording (c3s2b5, c3s3b1): the film follows LGSA 6.1 (any delay, up to 14 days, day 44 at most) and drops "only for delays outside our control" (contradiction 14). Amend 6.1 if that "only" is wanted, then the film can say it.
4. Welcome card order and wording vs 4.1(d), 3.8 and S4.5 (contradiction 3).
5. The WhatsApp reply to Mark (contradiction 10). Not edited here.

**Product follow-ups Mark will notice (the film already shows the truthful version):** B-tier counting at Accept (contradiction 16); Outlook subject "Life cover call" (contradiction 1); consumer email sender (contradiction 17); Microsoft publisher verification (contradiction 6); stale Agreement.tsx summary and IntroMedia clause (contradiction 8); Start.tsx "About 12 minutes" vs the bar's 9 (contradiction 5).

## Abbreviations

| Tag | File |
|---|---|
| LGSA | deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement-v2.md (v0.2 marked; clause numbers identical in the clean `lead-velocity-services-agreement.md` and in the rendered `deliverables/billing/outbox-mark/v0.2/agreement-v0.2.html`) |
| REPLY | deliverables/contracts-drafter/lead-generation-agreement/mark-whatsapp-reply.md |
| AMD | deliverables/contracts-drafter/lead-generation-agreement/mark-amendments-2026-10-07.md (used only for what Mark asked; its recommendations were overruled) |
| CHG | deliverables/contracts-drafter/CHANGELOG.md |
| SPEC | deliverables/automation-engineer/whatsapp-capture-flow-v2.md |
| CAP | automation/ctwa/capture-v2.js |
| FLOW | automation/flows/capture-flow-v2.json |
| OFFER | automation/templates/broker_lead_offer.json |
| CARD | automation/templates/broker_intro_booked.json |
| SLOTS2 | automation/templates/broker_intro_slots_v2.json |
| NEWBK | automation/templates/broker_new_booking.json |
| CALOK | automation/templates/broker_onb_calendar_ok.json |
| LIVE | automation/templates/broker_onb_live.json |
| W03 | automation/ctwa/w03.js |
| W05 | automation/lib/w05.mjs |
| ADS | automation/ads/meta-ads.js |
| AD | deliverables/visual-producer/assets/C03_trigger-new-bond_9x16_20261002.srt |
| CONSENT | landing/config/consent.json |
| PCRO | deliverables/meta-operator/page-cro-spec.md |
| MP | docs/MASTER-PROMPT.md |
| BRIEF | scratchpad/mark-flow-film-brief.md (Jonathan's film brief) |
| TASK | the orchestrator's task text: "Jonathan's final decisions (v0.2)" |
| APP | src/App.tsx |
| START | src/pages/portal/Start.tsx |
| SMC | src/lib/smc.ts |
| SHELL | src/pages/portal/PortalShell.tsx |
| LOGIN | src/pages/BrokerPortal.tsx |
| PROFILE | src/pages/portal/Profile.tsx |
| CAL | src/pages/portal/Calendar.tsx |
| MSC | src/lib/smcMsConnect.ts |
| MSSETUP | deliverables/broker-success/microsoft-connect-setup.md |
| AGR | src/pages/portal/Agreement.tsx |
| INTRO | src/pages/portal/IntroCard.tsx |
| MEDIA | src/pages/portal/IntroMedia.tsx |
| LEADS | src/pages/portal/Leads.tsx |
| PRICE | src/lib/pricing.ts |
| INV | deliverables/billing/invoice-mark-cycle1.html |
| FIELDS | deliverables/billing/outbox-mark/v0.2/agreement-fields.json |
| EMAIL | deliverables/contracts-drafter/lead-generation-agreement/email-to-mark.md |
| DEPLOY | landing/holding/deploy.md |

Sample data (fictional, labelled on screen): Sipho Ndlovu, 082 555 0101 (number format from SPEC:44), sipho@example.co.za, Thandi, all dates (Mon 19 to Fri 23 Oct, Mon 26 Oct, Thu 22 Oct, Mon 2 Nov 2026; weekdays checked; no South African public holiday falls between 19 and 26 Oct 2026), code 482913.

## Part 1 · Your client's journey

**c1s1b1** Mark Weston, FSP 28418, email: FIELDS:8, FIELDS:10. Bronze R16,500 excl. VAT, 20 Qualified Leads, 30-day cycle: LGSA:622-624, 627. Practice name unconfirmed (Oracle Private Wealth or Oracle Brokers): EMAIL:11. "FSP 28418 is Oracle Brokers' licence; is he a representative under it?": DEPLOY:42. Portal fallback "Your practice" (INTRO:65) must not reach a consumer screen (Gate C). No headshot, so initials: TASK; PROFILE:142; INTRO:35, 63. "The updated agreement" stands for v0.2 in narration (captions show "(v0.2)"): LGSA:5. Voice legend (spelled acronyms, "Seepo", A-tier listen-check) is in the beat's action.

**c1s1b2** Sample-data consumer required: TASK (hard rules). Auto-play + tap-through, reduced motion, callouts at the answering step: BRIEF:4.

**c1s2b1** SortMyCover brand runs broker-neutral ads that name no product, insurer, premium or cover amount: LGSA:23, LGSA:147 (3.3(a)). Client Materials are never used in ads: LGSA:511 (17.3). No advice by Lead Velocity: LGSA:131-133 (3.2(a)); advice is the Client's: LGSA:461 (14.2). Ad copy: AD:3, 12, 25, 39, 40. CTA "Learn more" only: ADS:573-576. The viewer-only label "30 minutes = the length of the call he books, at a time he picks" keeps the ad's "30 minutes" from reading as an instant callback (TASK rule "never imply instant calls"). The booked call is 30 minutes at a time the client picks: CAP:410; SPEC:76.

**c1s2b2** Pre-filled message: W03:12. The WhatsApp number is verified at opt-in because the consumer chats from it: LGSA:265 (5.8(a)); SPEC:7 (`wa_verified = true`); W03:212; REPLY:14.

**c1s2b3** Consent tap before any question. It names the practice and FSP, uses v3 scope "insurance and financial planning", and has the buttons `Yes, continue` · `No thanks`: W03:64 (`ctwa-named-v3`, W03:53); W03:180; SPEC:12. Same scope as the contract: LGSA:9 (C1), LGSA:766; MP:61; CONSENT:5. Footer rendered in full from W03:54. SPEC:12 makes it part of screen 0 ("plus the responsible-party line"), and it is part of the consent record (W03:196 stores `consent_text`). Alternative footer if B61 lands first: PCRO:466. "No thanks" reply and suppression: W03:186-189.

**c1s2b4** Consent record = text version, time stamp, source: LGSA:59 (1.1.12A), LGSA:79 (1.1.22), LGSA:668 (S2.1 #2). Dispute evidence within 2 Business Days on written request: LGSA:317 (7.8). Working day = Business Day: LGSA:43. Mark's request #9: AMD:38. Evidence pack built in code: SPEC:132-133; CAP:537-565.

**c1s3b1** Flow opening message and `Start`: SPEC:12-15; W03:213; CAP:229-235. Screens inside WhatsApp, no browser: SPEC:7. Footer `Continue`: FLOW:56-952 (each screen's Footer).

**c1s3b2** Reasons screen copy: SPEC:17-21; CAP:18-26, 49-51; FLOW:56. Same questions for every client: LGSA:273 (5.9), LGSA:674 (S2.2). Licence chip on the side rail: SPEC:126-127.

**c1s3b3** Spend screen, both headings, bands: SPEC:23-30; CAP:27-34, 52-55; FLOW:154. Optional: LGSA:685.

**c1s3b4** Name screen and error (now the viewer's "Try a fake name" choice): SPEC:32-35; CAP:56-59, 98, 131-137 (letters only, junk names). Three bad tries → invalid close, text: SPEC:88; CAP:91, 118, 305-308. No callout here: Mark's fake-information ask (1b, AMD:30) pops at c1s3b6 with #6 (review: one invalid-details callout per part).

**c1s3b5** Email screen copy, `Same as above (no other email)`, alternative optional: SPEC:37-41; CAP:60-64; FLOW:297. Checks under 300 ms (format, typo, disposable, MX): SPEC:41; CAP:166-178.

**c1s3b6** Number screen copy and options: SPEC:43-47; CAP:46, 65-67; FLOW:369. SA mobile only, landline/VoIP rejected, other number "validated but not verified": SPEC:47; CAP:352-358; error text CAP:99-100. Contact number same as WhatsApp or another: LGSA:269 (5.8(c)). Callout (#6, AMD:35, plus the fake-information part of #1b, AMD:30): LGSA:271 (5.8(d)); invalid needs no replacement: LGSA:299 (7.2 last sentence).

**c1s3b7** Age screen and bands: SPEC:49-52; CAP:35, 68-69; FLOW:443. 35 to 50 qualifies; under 35 and 51+ get a polite close: SPEC:52; CAP:116, 366; LGSA:225 (5.1(c)), LGSA:669 (S2.1 #3).

**c1s4b1** Budget screen copy and four options: SPEC:54-57; CAP:36, 70-71; FLOW:513. Callout (#1a, AMD:29): LGSA:241-247 (5.6), LGSA:251-259 (5.7); TASK.

**c1s4b2** A-tier R1,500+ = minimum target of every campaign, sent, booked, counted automatically: LGSA:243 (5.6(a)); LGSA:231 (5.2); SPEC:58; CAP:117.

**c1s4b3** B-tier R750 to R1,499 offered to Accept or Decline: LGSA:245 (5.6(b)), LGSA:251-253 (5.7(a)). Both B bands map to tier B: CAP:117. Flow continues through smoker + income, then the matching END screen: CAP:389-393. Matching screen copy: SPEC:86; CAP:87-88. Consumer told an adviser is being matched: LGSA:259 (5.7(d)).

**c1s4b4** Under R750 filtered, never sent, never counted: LGSA:247 (5.6(c)); SPEC:60; CAP:374. Close copy: SPEC:87; CAP:89-90.

**c1s5b1** Smoker copy (with em dash), options: SPEC:62-65; CAP:37, 72-73; FLOW:583. Used only to brief the adviser, never for advertising or advertising platforms: LGSA:427 (13.2A); SPEC:66; CAP:127-129. Stored with exact wording and time: SPEC:66; CAP:380-382.

**c1s5b2** Income copy and bands, optional, never exact income: SPEC:68-71; CAP:38-45, 74-75; LGSA:687. Callout covers only the age/income/affordability half of #3 (AMD:32). No verification of age, income or affordability: LGSA:233 (5.3). Affordability is the Client's needs analysis: LGSA:461 (14.2); TASK. The two reasons are kept apart: age is not an affordability question.

**c1s6b1** Pick a day / Pick a time copy, calendar rules (broker notice, +14 days, working days, greyed days, his Outlook free/busy): SPEC:73-76; CAP:76-80, 245-257; FLOW:731, 822. "(South African time)" label: CAP:402. Teams booked into his own calendar: LGSA:201 (4.1(e)).

**c1s6b2** Summary text format: SPEC:76; CAP:410. `Book my call`: CAP:81; FLOW:903. Re-check at the tap, zero double-bookings: SPEC:77. Slot-taken text: SPEC:90; CAP:94.

**c1s6b3** You're booked copy: SPEC:79-81; CAP:85-86. Welcome card template sent after booking: SPEC:83; CAP:418. Template body (v3 "insurance and financial planning enquiry"), footer, buttons: CARD:17, 34, 41, 49, 53. Intro card content (initials, name, practice, "Authorised financial services provider · FSP", "30-min {methods} call · No obligation"): INTRO:62-69. The methods line joins Mark's methods with ", " (INTRO:34) using the labels "Teams" / "Phone" (SMC:124). Portal defaults are Teams + phone (CAL:66), so the card reads "30-min Teams, Phone call". Welcome card shows name, practice, FSP: LGSA:73 (1.1.19), LGSA:199 (4.1(d)); TASK.

**c1s6b4** One email with one-tap link + 6-digit code, 24 h, copy: SPEC:108-122; CAP:103-104, 184-199. Sent after booking: CAP:419. Email verified by one-tap code or link: LGSA:267 (5.8(b)); TASK. Code typed on WhatsApp: CAP:210-218. Sender blurred: the email goes "from howzit@" (SPEC:109), W05:46 `INVITE_FROM = 'howzit@leadvelocity.co.za'`. No source confirms a "SortMyCover" display name (contradiction 17).

## Part 2 · Your side

**c2s1b1** Teams appointment in his own calendar: LGSA:201 (4.1(e)); TASK. Event subject `Life cover call – {first} – {method}`: W05:451 with TITLE_LABEL W05:37. Broker WhatsApp on booking, copy, footer, button: NEWBK:9, 13, 30, 37. Variables: W05:594 (first name only; BAND_LABEL W05:42-44 gives "35-44" and "R1,500+"). Sent by the booking workflow: automation/build-w04-w05.mjs:151 ("Then: broker_new_booking + email").

**c2s1b2** A-tier counts automatically; Delivered when the booked appointment is confirmed with confirmation of attendance: LGSA:229 (5.1(e)), LGSA:231 (5.2), LGSA:672 (S2.1 #6). 20 committed: LGSA:624. No internal metrics: TASK.

**c2s1b3** Client reports within 24 hours whether the Consumer attended and could be contacted, and no other outcome information: LGSA:469 (14.3(c)), LGSA:329 (8.4). Portal Step 1 buttons `Attended` · `No-show` · `Rescheduled`: LEADS:61-66 (**Gate B**). Callout (#7, AMD:36; the attend part of #1b, AMD:30): no attendance guarantee LGSA:239 (5.5); goodwill replacement LGSA:297 (7.1); 3 a week, no-shows only LGSA:299 (7.2). No-show branch strip: 10-minute wait LGSA:701 (S3.2); proof straight away, by 30 minutes at the latest LGSA:301 (7.3), LGSA:703-707 (S3.3); late or missing proof → stands as Delivered LGSA:709 (S3.4); aim to deliver within 14 days of approval LGSA:305 (7.5).

**c2s2b1** Data Mark receives: tier label, name and surname, numbers, email (+ alternative), reasons with any licence flag, age band, budget band, optional spend/income/smoker, appointment with Teams link: LGSA:691 (S2.4), LGSA:723 (S4.2). CRM fields: SPEC:129-130; CAP:440-452.

**c2s2b2** WhatsApp verified (chat), call number verified when same as WhatsApp, email verified flag: CAP:350, 446-447; CAP:208, 218. Callout (#8, AMD:37): LGSA:271 (5.8(d)), LGSA:624. 5.8(d) covers only details that are wrong, disconnected or someone else's. A valid number that never answers still counts once the client has booked and confirmed (LGSA:229-231), hence the "isn't covered" line.

**c2s2b3** Reasons outside the licence are flagged; the Client handles or refers; Lead Velocity does not decide: LGSA:273 (5.9). Flag, not block (`outside_licence` / `licence_check_needed`): SPEC:126-127; CAP:121-126, 148-156. Mapping investments → `investments` category: CAP:123-126. "He does not need to worry about it": TASK.

**c2s3b1** Offer template copy, footer, buttons: OFFER:8, 24, 27-37; SPEC:96-99. Variables (first names, Flow band labels "35 to 44" / "R750 to R1,249", reasons, deadline): CAP:478; CAP:35-36, 18-26. Offer contents (label/age/budget/reasons): LGSA:253 (5.7(a)). Nothing booked before acceptance: CAP:7-9. **No portal row:** SPEC:96 and the CAP:473 comment promise "the same Accept / Decline on the portal lead row", but LEADS has no offer, tier or Accept/Decline code, and `makeOffer` only sends the template (CAP:474-490). The film therefore shows WhatsApp only.

**c2s3b2** 2 working hours, 08:00 to 17:00 Mon to Fri, excluding public holidays: LGSA:259 (5.7(d)); SPEC:105. Expiry arithmetic: CAP:460-471 (`offerExpiry`). Tue 10:00 → Tue 12:00; Tue 16:00 → Wed 09:00; Fri 23 Oct 16:30 → Mon 26 Oct 09:30. Deadline label format "Wed 21 Oct at 09:00": CAP:244, 478.

**c2s3b3** Accept / Decline buttons: OFFER:27-37. Broker replies: CAP:108-109.

**c2s3b4** Accept → the lead gets `broker_intro_slots_v2` (disclosure + "Pick a time", image header = intro card): SPEC:101; CAP:508. Template copy (v3 "insurance and financial planning enquiry"): SLOTS2:9-12, 17, 31, 38. The film's "counts once she books and confirms" follows LGSA:255 (5.7(b)) and LGSA:231 (5.2). The code counts at the Accept tap (contradiction 16).

**c2s3b5** Declined: doesn't count, isn't charged, may go to another FSP with consent or be held, never re-offered: LGSA:257 (5.7(c)); LGSA:403 (12.2); SPEC:102; CAP:511-528 (fresh consent in named mode: CAP:525-526).

**c2s3b6** No answer = declined: LGSA:259 (5.7(d)); SPEC:105 ("Expired = declined"). The "being matched" line is shown, not narrated (Part 1 c1s4b3 already narrates it): LGSA:259; SPEC:93-94; CAP:106, 485.

## Part 3 · Your requests, and what v0.2 says

Mark's nine requests, the first in two parts (1a, 1b, 2 to 9): AMD:29-38; CHG:8 ("Mark's 9 requests"). Ten tiles, nine points. Each card's "You asked" line condenses the AMD row in plain words. Status labels are the film's own summary of LGSA v0.2 against each ask.

**c3s1b1** v0.2 dated 7 October 2026, every change marked: LGSA:5, 7. Change log: LGSA:753-768.

**c3s2b1** (#1a) LGSA:241-249 (5.6), 251-259 (5.7); S1.1 tiers: LGSA:628.

**c3s2b2** (#8) LGSA:271 (5.8(d)); S2.3(d): LGSA:689. No threshold: TASK ("Invalid contact details never count in the first place"). The status reads "Changed for invalid details" because Mark's #8 also named "unreachable" (AMD:37), which 5.8(d) does not cover. See c2s2b2.

**c3s2b3** (#6) LGSA:271 (5.8(d)), LGSA:299 (7.2: "A lead with invalid contact details is never counted in the first place… so it needs no replacement"). A booked consumer who doesn't join is a No-Show Lead: LGSA:77 (1.1.21), LGSA:699 (S3.1).

**c3s2b4** (#9) LGSA:317 (7.8), LGSA:59 (1.1.12A), LGSA:537 (21.1).

**c3s2b5** (#4) Force majeure never extends delivery beyond day 44; delays only under clause 6: LGSA:531 (20.2). Up to 14 extra days for any delay, day 44 at most: LGSA:279 (6.1), LGSA:93 (1.1.29). The film says "a delay, such as a Meta outage", not "only for delays outside our control" (contradiction 14).

**c3s3b1** After day 44: rollover on top of the next cycle: LGSA:281 (6.2), or refund on request: LGSA:283 (6.3); S1.1: LGSA:629. Timeline label "if delivery is delayed (e.g. a Meta or WhatsApp outage)": LGSA:279.

**c3s3b2** R825 = R16,500 ÷ 20, within 7 Business Days: LGSA:283 (6.3), LGSA:625. Sample R825 × 3 = R2,475 (arithmetic).

**c3s4b1** (#2) Discretionary goodwill, no right: LGSA:297 (7.1). Max 3 per Calendar Week, no-shows only: LGSA:299 (7.2), LGSA:295. Calendar Week defined: LGSA:45. The pricing page says the same: PRICE:105; TASK ("Pricing page updated to match").

**c3s4b2** (#5) "will aim to supply an approved Replacement Lead within 14 days of approval": LGSA:305 (7.5). Proof "immediately" after the wait: LGSA:301 (7.3). Wait 10 minutes: LGSA:701 (S3.2). Proof immediately and no later than 30 minutes after start; for Teams, a screenshot showing the time and that only the Client was present: LGSA:703-707 (S3.3(b)). Late proof → stands as Delivered: LGSA:709 (S3.4).

**c3s4b3** (#7) No guarantee of attendance: LGSA:239 (5.5), LGSA:479 (15.1). Reason "nobody can control turn-up": TASK.

**c3s4b4** (#1b, AMD:30) Valid contact details (not "contactable": v0.2 guarantees valid details, not that the client answers): LGSA:271 (5.8(d)). Attendance is not in the definition; a lead counts at confirmed booking: LGSA:229-231 (5.1(e), 5.2). Flat fee, not linked to outcomes: LGSA:323 (8.2), LGSA:325 (8.3); 3.6(b): LGSA:165. FAIS intermediary reason (plain wording): TASK; LGSA:235 (lawyer note on Raspberry Academy). "Just curious" person who attends is not a no-show: LGSA:715 (S3.7).

**c3s4b5** (#3) Self-declared, not verified: LGSA:233 (5.3), LGSA:674 (S2.2). Client's needs analysis: LGSA:461 (14.2). Optional income band only briefs him: TASK; LGSA:687 (on the card; narrated in c1s5b2). Invalid contact details disqualified: LGSA:271.

## Part 4 · Getting set up

**c4s1b1** Exact framing sentence: TASK; BRIEF:29. Portal on leadvelocity.co.za/broker: MSSETUP:23; route `/broker`: APP:92. Login card "Broker Sign In", email placeholder "Use the email from your invite": LOGIN:242, 253. Button label as deployed: LOGIN:305 (**Gate A**). Header "practice · FSP": SHELL:65, 73. Title "Welcome, {first name}": START:105. Progress "x of y done": SHELL:78 (minutes label left out, see c4s1b2).

**c4s1b2** "Start here: 3 minutes, then you're set": START:51. "Your 7 steps", "About 12 minutes to be ready to go live. Your video takes 10 more, any time.": START:70-71. Step titles, reasons, minutes, blocking: SMC:133-141. The bar's "about N minutes to go live" counts blocking steps only (SMC:148; SHELL:78): 3+1+1+3+1 = 9. Adding the 3-minute explainer gives the card's 12, hence "video included". Go-live needs (FSP checked, calendar connected, agreement signed, intro card approved; video later): START:94-95.

**c4s2b1** "Your details" / "Tell us who you are", fields, hints, button: PROFILE:98-106, 124-133, 168. FSCA check on save, "Checking the FSCA register. This takes a few seconds.", "Found on the FSCA register…", "Authorised financial services provider": PROFILE:64, 107-110. 3 min: SMC:135. FSP number + practice name as on the FSCA register at onboarding: LGSA:657 (S1.5(a)).

**c4s2b2** Photo section copy, initials fallback, bio hint, languages, years: PROFILE:137-159 (hint text PROFILE:142, 145). Photo + biography for the Intro Card: LGSA:657 (S1.5(c)).

**c4s3b1** Card copy, "One tap. We only look at when you are free, and we add your meetings. We never read your emails.", button "Sign in with Microsoft": CAL:160, 179-183. 1 min, "One tap.": SMC:136. One shared Lead Velocity app, no app registration by the broker: MSSETUP:3. App name "SortMyCover calendar": MSSETUP:10. Permissions (calendar, online meetings, User.Read, offline_access, openid; no Mail): MSSETUP:30-38. Publisher verification not done; broker #1 should "expect a 'not verified' notice on the consent screen": MSSETUP:42. Nothing yet run against a live tenant: MSSETUP:79. Calendar connection is an onboarding item: LGSA:465 (14.3(a)), LGSA:657 (S1.5(b)).

**c4s3b2** "Microsoft says yes. We're checking your calendar now.": MSC:45. "Connected as {address}": CAL:163; MSC:17-21; MSSETUP:3, 67. "Calendar connected. Your next free slot…": CAL:165. WhatsApp "Calendar connected" template: CALOK:9, 13, 25, 32.

**c4s3b3** Admin-approval panel copy, two options, buttons: CAL:185-196. Ready-made note (names Mark): MSC:57-63; CAL:188. Mail subject "Please approve the SortMyCover calendar app": CAL:155. What the IT admin sees: MSSETUP:71-73.

**c4s3b4** Admin signs in and chooses Accept, broker connects again: CAL:189; MSSETUP:73.

**c4s4b1** "Your hours and how you meet", "We started you on a normal week. Change anything, or just tap Looks right.", defaults (Teams + phone, 3 a day, 12 a week, 09:00 to 17:00 fallback), "Looks right", saved line: CAL:63-73, 204, 238-240. 1 min, "We filled in a sensible start. Check it.": SMC:137.

**c4s4b2** "Sign your agreement" card copy, PDF button, tick, name, "Sign agreement", signed confirmation with copies to his email and howzit@leadvelocity.co.za: AGR:121-122, 134-153, 141. "Your role" is optional (AGR:70). 3 min, "Plain words.": SMC:138. v0.2 with markers: LGSA:7; HTML summary of changes in agreement-v0.2.html:89. Five-bullet summary hidden (AGR:124-130, contradiction 8). Signing method open (contradiction 7).

**c4s4b3** "Your intro card" and "This is the picture leads get on WhatsApp the moment they book. Check it is right, then approve.": INTRO:57-58, 105. Preview contents and the "Teams, Phone" methods line: INTRO:34, 62-69. "Use my initials for now.": INTRO:82. Approval tick, button, confirmation text in full: INTRO:89-92, 50. 1 min, "What leads see before they meet you.": SMC:139.

**c4s4b4** "Record your 25-second intro", "Start: 10 minutes", "Voice note only", "Skip for now", "Skipped. Come back any time.": MEDIA:30-35. Optional, 10 min, "Not needed to go live": SMC:140; START:94. Hint line citing "clause 11.2" hidden: MEDIA:36 (the clause is now 17.3, LGSA:511).

**c4s5b1** Payment in advance per cycle: LGSA:357 (10.1). EFT allowed: LGSA:361 (10.3); TASK ("payment (EFT)"). Portal billing copy and EFT button: AGR:184, 186; its heading "Next cycle: payment by EFT, in advance" (AGR:183) is cropped because the narration is about the first cycle. Invoice: Bronze, one 30-day billing cycle, cycle 1, R16,500.00, "Lead Velocity is not registered for VAT — no VAT is charged.", reference: INV:80, 93-94, 105-106, 117, 121. Not VAT-registered at signature; at least 30 days' written notice before VAT is added: LGSA:331 (8.5). Bank details not shown: film rule.

**c4s5b2** Final check, Jonathan taps Go live, WhatsApp on going live: START:43-46, 95. "You're live" template copy: LIVE:9, 13, 25, 32 (report date is sample data). Delivery starts within 3 Business Days of the later of cleared payment and onboarding items: LGSA:119 (2.2).

**c4s6b1** Contact email: LGSA:15. "WhatsApp us": START:99.

## Callout clause check (all against LGSA v0.2)

Part 3 has no callouts: each card shows Mark's request, the v0.2 wording and the same clause chips.

| Beat | Request | Clause(s) | Lines |
|---|---|---|---|
| c1s2b4 | 9 | 7.8 | 317 |
| c1s3b6 | 6 + 1b (fake information) | 5.8(d), 7.2 | 271, 299 |
| c1s4b1 | 1a | 5.6, 5.7 | 241-259 |
| c1s5b2 | 3 (age, income, affordability) | 5.3, 14.2 | 233, 461 |
| c2s1b3 | 7 + 1b (attend) | 5.5, 7.1, 7.2 | 239, 297, 299 |
| c2s2b2 | 8 | 5.8(d) | 271 (and 229-231 for the "isn't covered" line) |

## Contradictions found in the sources

1. **Consent scope: now v3 almost everywhere.** Contract C1 says consent v3 reads "insurance and financial planning" (LGSA:9, 766; MP:61; CONSENT:5). Since 20:50 to 20:54 the code matches: W03 consent `ctwa-named-v3` (W03:53, 64), both welcome cards (CARD:17, SLOTS2:17) and the portal preview (INTRO:77). The film follows them. Two "life cover" leftovers remain and the film still matches them: the pre-filled message (W03:12, a consumer's own words) and the Outlook event subject `Life cover call – {first} – {method}` (W05:451). Suggested product fix: subject "SortMyCover call – {first} – {method}", then update c2s1b1.
2. **"Lead Velocity" on a consumer screen.** The live W03 consent footer says "Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details" (W03:54). SPEC:12 includes it in screen 0, and it is part of the stored consent text. The film now renders it in full: a trimmed footer would show Mark consent wording no consumer sees. PCRO:466 (B61) would replace it with "SortMyCover is responsible for your details…". Jonathan may instead drop the line from the film entirely.
3. **Welcome card content and order.** LGSA 4.1(d) and S4.5 (LGSA:199, 729) say the card states that SortMyCover and Lead Velocity are not FSPs and give no advice. S4.5 calls it "the first WhatsApp message to each Consumer". LGSA 3.8 (175) also requires that statement in every post-consent message. The template has no such statement (CARD:17). For tier A it is sent after the consent message and the booking (SPEC:83; CAP:418). REPLY:23 says the client gets the card "first". The film follows the build and cannot add "Lead Velocity" to a consumer screen. Jonathan aligns them: reword 4.1(d)/S4.5 (and 3.8) to the build, or change the template. Either way, drop "first" from REPLY:23.
4. **Unconfirmed email.** LGSA 5.8(b)/(d) (267, 271) disqualify a lead whose details fail the checks. The code only flags an email still unconfirmed after 24 h and keeps the lead valid (SPEC:124; CAP:220-225). The film never says an unconfirmed email disqualifies.
5. **Start-here list.** The code has 7 steps with the video as step 1, and step 4 is "Your hours and how you meet", not "Check your hours" (SMC:133-141; START:70). The film uses the code. The checklist says "About 12 minutes" (START:71) while the header bar computes "about 9 minutes to go live" (SMC:148; SHELL:78). The film says "about twelve minutes, video included" and hides the bar's minutes label. Suggested product fix: make START:71 and SHELL:78 tell the same story.
6. **IT approval.** Brief/TASK: "one click for them". Code: "2 minutes for them… They sign in, tap Accept, and you try again", plus a second option, a shared calendar (CAL:189, 194). The film follows the code. Publisher verification is not done (MSSETUP:42) and nothing has run against a live tenant (MSSETUP:79). The film now shows Microsoft's "unverified" label with a reassuring chip. Finish verification before Mark connects and the label and chip go.
7. **How the agreement is signed.** LGSA 24.1 (571) makes the Agreed E-Signature Method a signed PDF returned by email, and 25.2 (583) relies on that method. The portal signs with a tick, typed name and SHA-256 document fingerprint (AGR:141-152). TASK puts signing in the portal, and the film shows the portal. Jonathan decides: amend 24.1 to accept the portal record, or change c4s4b2 to "sign the PDF and email it back".
8. **Stale portal wording.** AGR:129 says shortfall leads are "refunded if you stop". v0.2 6.3 says refund on request any time after day 44, within 7 Business Days. MEDIA:36 cites "clause 11.2", now 17.3 (LGSA:511). The film hides both. Update them before Mark logs in.
9. **My leads page vs v0.2 (Gate B).** LEADS shows no tier label, reasons, licence flag or offer row, and has no Accept/Decline (SPEC:96 and the CAP:473 comment say it does). The film shows the offer on WhatsApp only. LEADS asks for a disposition and a 1 to 5 quality score after "Attended" and will not save without them (LEADS:40, 67-75; SMC:113-120). That goes beyond the attended/contactable-only feedback in LGSA 8.4 and 14.3(c) (329, 469). It makes "Not a fit – criteria" and "Unreachable/wrong number" replacement-eligible (SMC:118-119), though 7.2 allows no-shows only. It describes replacements "after a 48-hour check" / "if they don't rebook within 48 hours" (LEADS:55, 201) instead of the Schedule 3 proof within 30 minutes (LGSA:701-709). It shows the broker a show-rate target and a per-cycle replacement cap (LEADS:172). The film shows Step 1 only; the beat is a release gate.
10. **Portal naming and the reply.** The contract says "Lead Velocity client portal" (LGSA:657) and "client portal once Lead Velocity makes it available" (LGSA:727, implying it is not built yet). REPLY:33 says "click 'Connect my Outlook calendar' in your portal" and calls it "Step 1". In the code the calendar is step 3 of 7 (SMC:136) and its button is "Sign in with Microsoft" (CAL:182). The film follows Jonathan's framing: "the Lead Velocity broker portal". Proposed REPLY:33: "We'll send you login details for the Lead Velocity broker portal. Once you log in, connecting your Outlook calendar takes a minute (Sign in with Microsoft), and the short video walks you through the rest." Proposed REPLY:23: "The client gets your welcome card (photo, name, FSP number) as soon as they book." Not edited here: REPLY is Jonathan's draft message.
11. **Practice name unconfirmed (Gate C).** "Oracle Private Wealth or Oracle Brokers" (EMAIL:11). FSP 28418 is Oracle Brokers' licence, and it is still open whether Mark is a representative under it (DEPLOY:42). The film uses the {PRACTICE} placeholder and must not be rendered with the "Your practice" fallback.
12. **Capture v2 is not live.** "built and tested offline, not live" (SPEC:3). W03 now opens the Flow after the consent tap when the brand's `capture_ui` is `flow_v2` and a flow token is supplied (W03:206-214). Otherwise it still falls back to the old tap-by-tap quiz (W03:203, 217-218).
13. **Minor.** Spend bands overlap at R1,500 ("R1,000 to R1,500" and "R1,500 to R2,500", CAP:30-31). S2.2 lists contact number as Required (LGSA:681); TASK lists it as optional. `pricing.seed.json` rows still carry `replacement_cap_cycle` 4/6/9 (automation/billing/pricing.seed.json:10-12), although the pricing page uses the weekly goodwill rule (PRICE:105). AMD's recommendations and the earlier `scratchpad/mark-contract-film/narr.json` state the overruled position (replacements as a right, per-cycle caps, 3 attempts over 72 h); neither may be reused. Broker-facing band labels differ by template: W05 uses "35-44" / "R1,500+" (W05:42-44), the offer uses the Flow labels "35 to 44" / "R750 to R1,249" (CAP:35-36).
14. **Delay wording.** TASK, PRICE:74 and PRICE:104 say "up to 14 days only for delays outside our control", and REPLY:28 says "only if Meta or WhatsApp let us down". LGSA 6.1 (279) is broader: "If delivery is delayed (including by events outside Lead Velocity's control…)", and Mark's request #4 is about exactly this clause. The film follows the contract ("a delay, such as a Meta outage, gets fourteen extra days at most"). Jonathan's call: amend 6.1 to "only if delivery is delayed by events outside Lead Velocity's control", or keep the contract and soften PRICE/REPLY.
15. **Broker login (Gate A).** See the gate above: LOGIN:61-65, 98-103, 305; APP:44, 113-120; SMC:13; .env.example:12.
16. **B-tier counting moment.** LGSA 5.2 and 5.7(b) (231, 255) count an accepted B-tier lead only once 5.1(e) is met (booked and confirmed). `decideOffer` sets `delivered: true, counts_toward_cycle: true` at the Accept tap (CAP:505), and SPEC:101 says "delivered and counted" at Accept. The film follows the contract. Fix CAP:505 and SPEC:101 so Mark's count does not run ahead of the contract.
17. **Consumer email sender.** The verification email goes from howzit@ via Graph (SPEC:109; W05:46 `howzit@leadvelocity.co.za`). Its display name is unconfirmed, so a consumer sees a leadvelocity.co.za address. The film blurs the sender. Confirm the display name and domain, or send consumer mail from a sortmycover.co.za address.
