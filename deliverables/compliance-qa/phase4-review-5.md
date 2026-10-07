# Phase 4 review 5: fix wave 4 re-check, new lead/broker strings, creative v1.1.1, Meta runbooks

Date: 2026-10-02 · Reviewer: compliance-qa · Mode: read-only. I edited no reviewed file, and I did not edit `build/tasks.json`, `decisions.md`, `gates.jsonl` or any SUMMARY.md. No web research was done.
This is a QA flag list, not legal advice. Items marked **(practitioner)** go to the external opinion (GATE-OPINION).
Severity: **H** = fix before Meta submission or any publish · **M** = fix before go-live (Section 7) · **L** = tidy-up.

Tools run (all green):
- `node automation/templates/check.mjs`: 52 templates, 0 errors, 6 button-count notes.
- `node --test`: fais-boundary 3/3 · capi 12/12 · build-broker-report-email 18/18 · W03 13/13 · W08 15/15 · W10 22/22 · W19 1/1 · W34 21/21.
- `node evals/run.mjs --dry-run`: **PASS**.
- Frames pulled with ffmpeg from the intro-video sample, from the C01 charcoal and teal 9:16 end frames, and from the C01 1:1 and 4:5 statics. I read the two intro-card PNGs directly.

---

## 1. Review-4 FAILs, as now applied

| # | Item (review-4 ref) | File:line · what is there now | Result |
|---|---|---|---|
| 1 | No `em` to Meta (§1 #27) | `automation/capi/capi.js:45` "No `em`… u.email is ignored"; `:135` `AUDIENCE_SCHEMA = ['PHONE','FN','LN','COUNTRY','EXTID']`; `capi.test.js:22,86-94` assert there is no `em` or EMAIL even when a caller passes one | **PASS** |
| 2 | Audience uploads | `automation/ads/meta-ads.js:486` throws `EMAIL_NOT_ALLOWED` on any EMAIL schema column. (`:579` only reads an `email` field if an instant form returns one; that is inbound, not to Meta. Note: the instant-form spec must not ask for email, per 0.1.) | **PASS** |
| 3 | Privacy page, email | `landing/holding/privacy.html:49` "we never send it to Meta"; `:76` processor row "We never send your email"; `:89` same. The "and email" wording is gone. | **PASS** |
| 4 | PN source mirror | `deliverables/contracts-drafter/consent-and-privacy.md:73` PN-v1.1, `:113`, `:126`. No "and email" left in the file. | **PASS** |
| 5 | W03 named consent → v2 (§2a) | `automation/ctwa/w03.js:50` `ctwa-named-v2`; `:51` footer "Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy"; `:61` text = FAIS line + footer. `tests/W03.test.mjs:54-59` checks the version, all three footer parts, < 1,024 chars and **stored text = shown body**. | **PASS**. This also closes the W03 half of §1 #30. |
| 6 | W08 "No thanks" suppresses (§1 #28) | `automation/lib/w08.mjs:128-130` returns `suppress:{source:'objection', note:'no_thanks_nurture'}`; `W08.json` inserts into `suppression` with `smc_hash_contact(phone)`; `tests/W08.test.mjs:125-128` | **PASS** |
| 7 | One owner of CTWA stall nudges (§2c) | `w08.mjs:81` `ctwa_pre_routing_w03` (W03 owns them) | **PASS** |
| 8 | W19 reminder amount + switch-off (§2g) | `automation/billing/autorenew.js:65-70`: amount from the open invoice, else the pricing row; "on: we will charge R… excl. VAT to your card at cycle end." `:88` session text adds "You can switch it off any time in the portal". `templates/broker_renewal_reminder.json` body has 6 vars and the sentence "If it is on, you can switch it off any time in the portal", plus a "Manage auto-renew" URL button to `/s/billing`. | **PASS**. Two wording tidy-ups are in §2 #4. |
| 9 | Emailed PDF without s6 ROI (§2h) | `scripts/build-broker-report-email.mjs:150-151`: s6 never rendered; `:212-221` `ROI_TEXT` guard throws if close rate or policies text reaches the email or print HTML (18/18). Proofs: 0 hits for close rate, tracking or policies across all six `deliverables/analytics-reporter/proofs/*.html`, rebuilt in commit 363fa95. | **PASS**. Caveat: I could not extract text from the PDF in this sandbox (no pdftotext). It was built from the clean `week-2 print.html` in the same run. |
| 10 | Stored W14 payload has no policy fields | `analytics/W14-broker-payload.sql:109-111`: `s6_roi = {shown:false}`; `:243` self-check rejects `policies_reported|tracking_to|meetings_to_pol…`. Mirrored in `supabase/migrations/20261002_smc_12_pass6.sql:271,406`. | **PASS**. Migration 12 is still **not applied**, so this holds only once it is. |
| 11 | Intro-card header sample | `automation/templates/samples/intro_card_sample.png` is byte-identical to `brand/exports/whatsapp/intro-card-1080x1080_sample.png`. It shows "FSP 00000 (SAMPLE)" twice and a "SAMPLE: fictional adviser" pill. Source `brand/exports/render.mjs:10` `fsp: '00000 (SAMPLE)'`. | **PASS**. Signed for upload as the header sample. |
| 12 | Other brand exports | `intro-card-1200x628_sample.png`: FSP 00000 (SAMPLE) on line 2. `brand/logo/lockup-cobrand-sample.svg` title is "FSP 00000 (SAMPLE) (fictional sample)" (`build-logos.mjs:171-175`). | **PASS**. L note: on the wide card the SAMPLE pill covers the header's "FSP 0…", and the "service of Lead Velocity" strip is missing. This card is not a template sample, but fix the layout before any real wide card renders. Owner: visual-producer. |
| 13 | Intro-video sample frame 0 (§1 #11) | `samples/intro_video_sample.mp4` (10 s): the "SAMPLE: fictional adviser" tag is visible from frame 0. The lower third at about 3 s reads "Authorised financial services provider · FSP 00000 (SAMPLE: fictional adviser)". | **PASS** |
| 14 | Show-rate rewording (§3) | `src/lib/smc.ts:136` "Not needed to go live. We're testing whether it helps people turn up."; `src/pages/portal/IntroMedia.tsx:31` "We expect… more likely to turn up, and we measure it on your first 100 bookings." | **PASS** |
| 15 | The same claim on other surfaces | `automation/W20.json` REASON24.media (a **broker WhatsApp nudge**) still says "People show up for people. Leads who see your face first are far less likely to no-show." Its copy bank, `portal/spec/10-nudges-and-go-live.md` (media row), says the same. `deliverables/intro-media/explainer-storyboard.md:9` says "the one step that moves your show rate most", which review 4 flagged. `portal/spec/02-profile.md:35` says "A real face lifts show rate." | **FAIL (L)**. Use the IntroMedia.tsx sentence in W20 REASON24 and the spec. Use "the step we're testing to help people turn up" in the storyboard. Owners: automation-engineer (W20), broker-success (spec), intro-media-producer (clip). |
| 16 | faq v1.0.3 (§1 #13) | `knowledge/faq.md:5` `faq-v1.0.3`; `:178-179` EN/AF "sortmycover.co.za/privacy"; changelog `:298` | **PASS**. English stays signed. Afrikaans stays unsigned (needs a native-speaker read). |
| 17 | PN adviser feedback + transcription (§1 #29) | `privacy.html:53` "From the adviser, after your call… {{TRANSCRIPTION_PROVIDER}}… We do not keep the recording"; `:64-65` purposes; `:77` processor row; `:124` retention | **PASS** |
| 18 | `policies_reported` / `tracking_to` in FORBIDDEN (§1 #17) | `fais-boundary.test.js` 3/3 with both keys | **PASS** |
| 19 | "Never 12345" sweep (runbook l.27 rule) | `automation/tests/W03.test.mjs:42` still asserts "Mark Smith Financial Services (FSP 12345)" in a test fixture | **FAIL (L)**. These are test fixtures, never submitted. The runbook's own reason applies ("12345 may belong to a real FSP"), so sweep `automation/tests/**` and fixtures to `00000`. Owner: automation-engineer. |

**Section 1: 17 PASS · 2 FAIL (L).** Every review-4 M FAIL is closed in code. The only exception is the "No thanks" promise, which still breaks on one new path (§2 #2).

---

## 2. New lead- and broker-facing strings since review 4

| # | String / where | Check | Result |
|---|---|---|---|
| 1 | Agreement Schedule C1A (`broker-services-agreement.md:253-271`) and the C2 row `:278` | Plain English. Triggers come from the message log, not opinion. The cap applies, the C3 dispute rule applies, "did not buy" is never a reason (C2), and nothing is tied to policies or premium (*Raspberry Academy* boundary intact). The DRAFT banner and the NH-42 drafting note are present. | **PASS (text)**. The choice of option is money, so it stays NH-42. |
| 2 | W10 `no_call` (`automation/lib/w10.mjs:177-181,196-216,225-233`; `W10.json` "Decide no-call", "Stop messaging (no call)"; W07 `lib/w07.mjs:101-102,276-290`) | FAIS: sends no advice. **POPIA:** a plain "I don't want a call" or "No thanks" (W07 routes a "No thanks" **tap** with a live booking here) only sets `declined_call/declined_nurture` in `conv_state` and cancels the booking. Unlike W08 (§1 #6), it does **not** insert into `suppression`. `privacy.html:128` promises: "If you say 'No thanks' or STOP: we keep a coded copy of your number on our block list, so we never message you again." On this path that is untrue, and any workflow that checks only `suppression` (W35, W24, W15) can still message the lead. | **FAIL (M)**. In "Stop messaging (no call)", add the same insert W08 uses: `{source:'objection', note:'no_call_c1a'}`, plus a W10 test. Send the one confirmation reply first, then suppress. Owner: automation-engineer. |
| 2b | W10 `no_call` with a live booking | `applyNoCall` returns `send_to_lead: 'cancel_confirm'` (a question: "Do you want me to cancel your call…?"), but "Decide no-call" already sets `op: 'cancel_all'` and the declined flags. The lead may be asked to confirm a cancellation that has already happened. | **OPEN (L, functional)**. automation-engineer to confirm the order: either ask first, or send `CANCEL_DONE`, not the question. |
| 3 | `broker_booking_changed` | "…Your Outlook calendar has been updated, so there is nothing for you to do." No lead PII beyond first name and initial; no advice. | **FAIL (L)**. "Outlook" is untrue under pre-mortem #4 (shared-calendar fallback) or after a Graph failure. Use "Your calendar has been updated". Owner: automation-engineer / meta-operator before submission. |
| 4 | `broker_renewal_reminder` + W19 session text | (a) The body says "pay {{4}} for the next cycle before then" even when {{6}} reads "on: we will charge … to your card". These conflict. (b) `autorenew.js:88` ends with "…in the portal: /s/billing." A relative path is not a link in WhatsApp (same defect as FAQ-23 in review 4). | **FAIL (L)**. (a) Change to "If card auto-renew is off, pay {{4}}… before then." (b) Use the full `https://leadvelocity.co.za/s/billing`. Owner: automation-engineer. |
| 5 | `broker_autorenew_off` | "…we will not charge your card again… No lock-in… your delivered leads stay yours." Matches 0.1 (opt-in card, no lock-in, lead ownership). | **PASS** |
| 6 | `ops_action_confirmed` | Internal ops, no PII | **PASS** |
| 7 | `broker_dsr_erase` | First names only. "Under clause 9.6… within 30 days, unless a law such as FAIS record-keeping requires you to keep it" matches `broker-services-agreement.md:122` word for word in substance. | **PASS** |
| 8 | `unbooked_nudge_2h` | "…there's no obligation to buy anything… Reply STOP to opt out." Approved K-6 wording; NH-45 closed in substance. | **PASS**. Meta may re-categorise it as MARKETING; accept that (0.3 #1). |
| 9 | `unbooked_nudge_72h` | "…{{2}} goes through where you are now, and any next step is your choice… we won't message again. Reply STOP to opt out." | **PASS** |
| 10 | `what_to_expect` | "…ask a few simple questions… no obligation to buy anything on the call. Reply STOP to opt out." No promise about the adviser's sales conduct beyond the agreed wording. | **PASS** |
| 11 | W35 pulse lines (`conversation/lines.mjs:76-81` EN, `:144-147` AF; template `lead_pulse`) | Wording: one question, never about the advice, STOP hint present, no advice. | **PASS (wording)**. Afrikaans needs a native-speaker read (carried). |
| 11b | The pulse promise "Answers are only shared as a total, never with your name" | `conversation/pulse.mjs:167-171` sends the broker only aggregates of ≥ 5 (correct), and `smc_05_rls.sql:149` gives `lead_pulse` no broker policy, "on purpose". But W35 also writes `lead_activities` rows (`activity_type 'lead_pulse'`, payload `{thumbs}`, with `lead_id` and `broker_id`). Policy **"smc broker read own timeline"** (`supabase/migrations/20261002_smc_05_rls.sql:202-204`, `broker_id = smc_current_broker_id()`) lets the broker read each named lead's thumbs. The promise is false at the data layer. | **FAIL (M)**. Either write the W35 activity rows with `broker_id NULL`, or add `AND activity_type NOT IN ('lead_pulse','lead_pulse_line')` to the broker timeline policy (migration 13), with an RLS test. The template text itself is fine for Day-0 submission; W35 activation is blocked until this is fixed. Owners: platform-architect, automation-engineer. |
| 12 | W34 DSR intake/erase messages | Only the internal IO alert ("New data-subject request…") and `broker_dsr_erase` (#7). Nothing goes to the requester automatically; the IO replies through the ticket with a 30-day clock. | **PASS** |
| 13 | `SLOT_TAKEN` / `METHOD_NOT_OFFERED` EN/AF (`lines.mjs:57,62,128,131`) | Neutral, no advice | **PASS** (AF read carried) |
| 14 | `EMAIL_Q` (`lines.mjs:58-59`, AF `:129`) | Asked only for Teams/Zoom/Meet, and used only for the invite (0.1 Email row) | **PASS** |
| 15 | W23 intro endpoints (`automation/media/check.js`, `intro-script.mjs`, W23 respond nodes) | Recording-quality hints ("Your voice is very quiet…", "over the 16 MB WhatsApp limit"), script-select errors ("That script is not one of your approved options", "Edited wording has to be checked before you can record"). Script line "On our call I will ask a few questions and tell you plainly where you stand" is spoken by the FSP, not by us. The FAIS gate is on edits. | **PASS** |
| 16 | Privacy page = PN-v1.1 mirror | `privacy.html:38` (PN-v1.1 / CN-v1.1), `:49,53,64-65,76-77,89,124,128` match `consent-and-privacy.md:73,88,101-102,113-114,126,136` | **PASS**. **(practitioner)**: PN-v1.1 discloses that the adviser's 1–5 rating goes to Meta as a value signal. Confirm brief Q22 explicitly covers sending outcome data about a person to Meta. |

**Section 2: 14 PASS · 4 FAIL (2 M: #2, #11b; 2 L: #3, #4) · 1 OPEN (#2b).** No new string gives advice, compares products, quotes, or names a product or insurer.

---

## 3. Creative v1.1.1: caption dedupe and palette B

Method: I parsed every `CAP "…"` in the concepts.md v1.1.1 Video row and searched for each one in the normalised `.srt` text (ON + CAP, after dedupe). `art.mjs` `tl` is the single caption source (`performance-creative-director/look-rules.md:16`, dedupe accepted: a CAP that repeats the ON text word for word is dropped, so each approved line appears once).

| Concept | Approved CAP lines | In .srt | Result |
|---|---|---|---|
| C01 (charcoal) | 6 | 6/6 | **PASS** |
| C01 teal (palette B) | 6 | 6/6; `.srt` byte-identical to charcoal | **PASS** |
| C03 | 6 | 6/6 | **PASS** |
| C05 | 5 | 5/5 | **PASS** |
| C12 / H18 | 5 | 5/5 in content. The last beat shows "You decide after." over "Free to check." (order swapped against "Free to check. You decide after.") | **PASS** (L: restore the order if it is cheap) |
| C14 | 8 | 8/8 in content. "4. 30 minutes. Video, WhatsApp or phone." renders as "4. A 30-minute call." + "Video, WhatsApp or phone.", which is the approved primary text (`concepts.md:254`). "2. …adviser name and licence number." is split over two beats. "The adviser looks at the real numbers and explains the gap." is present. | **PASS** |
| Palette B end card (9:16 last frame, C01) | Same line "Sort your cover. 30 minutes. A real adviser.", same CTA "Tap to check your cover", same "SortMyCover is a service of Lead Velocity (Pty) Ltd" | identical to charcoal | **PASS** |
| Palette B statics (1:1, 4:5) | Same hook, headline, line and wordmark as charcoal | identical | **PASS** |
| End-card small print vs placement map | `disclosure-wording.md:24,53`: the ad end card carries `DISC-S97-v1` = "A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes." Both palettes render only the identity half ("SortMyCover is a service of Lead Velocity (Pty) Ltd"). | **FAIL (L)**. Render S97 verbatim on the 9:16/4:5 end cards (12–14 px), or have brand-naming-lead record the shorter line as an approved variant. The "no advice" half is the FAIS-boundary sentence, so it is not theatre. Owner: visual-producer. |

**Section 3: 8 PASS · 1 FAIL (L).** The dedupe dropped no approved line.

---

## 4. Meta runbooks: disclosure texts against `disclosure-wording.md`

| # | Where | Result |
|---|---|---|
| 1 | `jonathan-clicks.md:30` FB intro = `DISC-S97-v1`; `:31` About = `DISC-FULL-v1`; `:41` IG bio = `DISC-S148-v1`; `:56` WA About = `DISC-WA-ABOUT-v1`, WA Description = `DISC-WA-DESC-v1`. All exact string matches. | **PASS** |
| 2 | Stale FSP state: `template-submission-runbook.md:33` says the intro-card PNG "still shows … FSP 12345 twice", and `jonathan-clicks.md:101` says "(today it shows 12345)". Both are now false (§1 #11, #13). `runbook:34` (video frame 0) can also close. | **FAIL (L)**. Update both to PASS so Jonathan is not blocked on a closed item. Owner: meta-operator. |
| 3 | Intro-card disclosure: the placement map (`disclosure-wording.md:52`) puts `DISC-CARD-v1` ("Introduced by SortMyCover, a service of Lead Velocity (Pty) Ltd. SortMyCover does not give financial advice, compare products or quote premiums.") on the intro-card image. Neither runbook nor the rendered card uses it: the 1080 card shows only "SortMyCover is a service of Lead Velocity (Pty) Ltd", and the 1200×628 card shows nothing. M6 (contracts-drafter approval) is still open. | **FAIL (L)**. contracts-drafter closes M6, then visual-producer renders DISC-CARD-v1 on `intro-card.html` (both layouts). The current sample stays acceptable for the template header review, because Meta reviews the body text. |

**Section 4: 1 PASS · 2 FAIL (L).**

---

## 5. Totals, sign-offs, needs_human

**Totals: 40 PASS · 9 FAIL (0 H · 2 M · 7 L) · 1 OPEN.**

**I sign off (compliance-qa):**
- CAPI and audience uploads with no email; PN-v1.1 **content** for #27/#29, for GATE-PIXEL staging only. It is not signed for publication: GATE-OPINION and the NH-41 placeholders are still open.
- W03 `ctwa-named-v2` (text + stored-text test); W08 `no_thanks` suppression and stall ownership.
- W19 reminder logic and `broker_renewal_reminder` for submission, with the §2 #4 tidy-ups folded in before submission if possible.
- Emailed weekly PDF/HTML and proofs; W14 stored payload (effective once migration 12 is applied).
- `intro_card_sample.png` and `intro_video_sample.mp4` as Meta header samples; cobrand sample lockup.
- Show-rate copy in `smc.ts` and `IntroMedia.tsx`; faq v1.0.3 English.
- Templates `broker_autorenew_off`, `broker_dsr_erase`, `ops_action_confirmed`, `unbooked_nudge_2h`, `unbooked_nudge_72h`, `what_to_expect`, `lead_pulse` (text, for submission); `broker_booking_changed` once "Outlook" is removed.
- Lines `SLOT_TAKEN`, `METHOD_NOT_OFFERED`, `EMAIL_Q`, pulse lines (EN); W23 endpoint messages; W34 broker erase notice.
- Schedule C1A **text** (not the option choice).
- Creative captions C01 (both palettes), C03, C05, C12/H18, C14; palette B end-card and static parity.
- The `jonathan-clicks.md` disclosure strings.

**Withheld until fixed:** W10 `no_call` without suppression (§2 #2); W35 activation while the broker timeline can read per-lead pulse rows (§2 #11b); all Afrikaans lines (native-speaker read).

**needs_human (money/legal only):**
1. **NH-42 (money, carried):** the C1A option, (a) / (b) / (a)+(b), including the addendum (STOP after a cancel claims nothing) and one point from this review. Under (b), a bare "No thanks" text with no call context (`w10.mjs:177`, `w07.mjs:290`) counts as "would not take a call" and makes a replacement claim. Recommendation: count only a "No thanks" that replies to a call or slot prompt. The code default is `a+b` (`w10.mjs:170`); W10 is inactive, so nothing is claimed before Jonathan picks.
2. **(practitioner, carried):** opt-out Pixel under POPIA/ECTA. Also confirm brief Q22 covers sending the adviser's 1–5 rating to Meta.

Everything else above is pre-decided by 0.1, 2.1 or PN-v1.1 and goes straight to its owner.

**Owner dispatch:** automation-engineer: §2 #2 (suppress), #2b (order), #3, #4, §1 #15 (W20 REASON24), #19 (fixtures) · platform-architect: §2 #11b (RLS, migration 13) · visual-producer: §3 S97 end card, §1 #12 wide-card overlap, §4 #3 DISC-CARD-v1 once approved · contracts-drafter: M6 DISC-CARD-v1 · meta-operator: §4 #2 stale runbook rows · broker-success / intro-media-producer: §1 #15 spec and storyboard wording.

---

## 6. Findings table (for the orchestrator)

| ID | Sev | File | What | Owner | Mechanical |
|---|---|---|---|---|---|
| R5-01 | M | `automation/W10.json` "Stop messaging (no call)" + `automation/lib/w10.mjs:225-233` | `no_call` does not insert into `suppression`, so the `privacy.html:128` "No thanks" promise is false on this path. Add the W08-style insert `{source:'objection', note:'no_call_c1a'}` and a test. | automation-engineer | no (workflow + test) |
| R5-02 | M | `supabase/migrations/20261002_smc_05_rls.sql:202-204` | Broker timeline policy exposes per-lead `lead_pulse` rows, which breaks "never with your name". Exclude the pulse activity types, or write the rows with `broker_id NULL` (migration 13 + RLS test). | platform-architect | no |
| R5-03 | L | `automation/W20.json` REASON24.media; `portal/spec/10-nudges-and-go-live.md`; `portal/spec/02-profile.md:35`; `deliverables/intro-media/explainer-storyboard.md:9` | Unsourced show-rate claims. Replace with the IntroMedia.tsx sentence or "we're testing it". | automation-engineer / broker-success / intro-media-producer | yes (text swap) |
| R5-04 | L | `automation/tests/W03.test.mjs:42` (+ fixtures) | "FSP 12345" in test fixtures → `00000`. | automation-engineer | yes |
| R5-05 | L | `automation/templates/broker_booking_changed.json` | "Your Outlook calendar" → "Your calendar". | automation-engineer | yes |
| R5-06 | L | `automation/templates/broker_renewal_reminder.json` body; `automation/billing/autorenew.js:88` | Make "pay {{4}} before then" conditional ("If card auto-renew is off, …"); make `/s/billing` an absolute URL. | automation-engineer | yes |
| R5-07 | L | visual-producer end-card template (both palettes) | End card carries only the identity half of DISC-S97-v1. Render S97 verbatim or record the variant. | visual-producer | no (re-render) |
| R5-08 | L | `brand/exports/whatsapp/intro-card-1200x628_sample.png` | SAMPLE pill overlaps the header FSP, and the LV strip is missing. | visual-producer | no (layout) |
| R5-09 | L | `deliverables/meta-operator/template-submission-runbook.md:33-34`; `jonathan-clicks.md:101` | Stale "still shows 12345" rows → mark PASS. | meta-operator | yes |
| R5-10 | L | `brand/templates/intro-card.html` | DISC-CARD-v1 is not on the intro card; waits on contracts-drafter M6. | contracts-drafter → visual-producer | no |
| R5-11 | L (open) | `automation/lib/w10.mjs:225-233` / W10 "Decide no-call" | Order of the cancel-confirm question vs `cancel_all`. Verify. | automation-engineer | no |

**Not reviewed in review 5:** PDF text extraction (no pdftotext; HTML proofs checked instead); W14/W35 test suites (not run); the other creative concepts beyond C01/C03/C05/C12/C14 and the C01 teal arm; the practitioner brief Q22 text.

---

## R5-07 re-check (2026-10-02, I-42e, after visual-producer fix wave 5)

**Method:** I took the last frame of each file with `ffmpeg -sseof -0.5 -i <file> -frames:v 1` (scratchpad PNGs), read both, and compared them with `DISC-S97-v1` (`deliverables/brand-naming-lead/disclosure-wording.md` l.25): "A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes." I measured where the fine-print text sits against the repo's Reels safe zone (`brand/tokens.json` safeZones: top 250 px, bottom 340 px free of text, so 9:16 text must end above y 1580; MASTER-PROMPT l.1428). l.25 itself requires the small print to sit "outside the Reels safe-zone margins".

| File | Text read (3 lines) | Verbatim? | Legible? | Placement | Verdict |
|---|---|---|---|---|---|
| `deliverables/visual-producer/assets/C14_what-the-call-is_9x16_20261002.mp4` (1080×1920, charcoal) | "A service of Lead Velocity (Pty) Ltd." / "No financial advice, product comparisons" / "or premium quotes." | Yes, all 97 characters, nothing cut | Yes. 30 px off-white on charcoal (engine `EC['9x16'].fineS`), crisp, high contrast | Text spans y 1502–1606. The third line, "or premium quotes.", sits 26 px inside the 340 px bottom band that Reels UI covers (limit y 1579) | **FAIL (L)**. The wording is right but the position is not. In Reels/Stories placements the caption overlay can cover the end of the disclosure. **Fix (visual-producer, `engine/engine.js` `EC['9x16']`):** move the CTA and fine print up so the last fine-print pixel is ≤ y 1579, keeping ≥ 16 px clear of the CTA and of `tagY` (for example, ctaY ≈ 1256, fineY ≈ 1448, tagY moved to match). Then re-render the 9:16 set and re-check one frame. This blocks 9:16 at GATE-ADS-APPROVE-3 only. |
| `deliverables/visual-producer/assets/C01_employer-cover-gap_teal_4x5_20261002.mp4` (1080×1350, teal on cream) | "A service of Lead Velocity (Pty) Ltd." / "No financial advice, product comparisons" / "or premium quotes." | Yes, all 97 characters, nothing cut | Yes. 28 px charcoal on cream, high contrast | Text spans y 1142–1238 of 1350, 112 px above the bottom edge and clear of the CTA. 4:5 Feed has no Reels overlay band | **PASS** |

Brand line, CTA ("Tap to check your cover") and wordmark are unchanged on both. No advice, product, insurer, premium or broker name appears on either frame. Note: visual-producer's SUMMARY says the 9:16 fine print is "inside the safe zone". By the repo's own 340 px token it is not. Its open item "confirm the 4:5 motion zones against Meta's Ads Manager safe-zone preview" still stands. Meta-operator's upload preview (campaign-spec.md:221) is the backstop, not the fix.
