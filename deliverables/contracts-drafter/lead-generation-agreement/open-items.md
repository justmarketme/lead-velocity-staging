**DRAFT — for attorney review. Not legal advice.**

# Open items — Lead Generation Services Agreement LGSA-v0.3

Covers the agreement (LGSA-v0.3, 10 October 2026) and `consent-and-privacy.md` (CP-v0.2). Clause numbers refer to the agreement unless marked CP.

**Which file to edit.** Edit only `lead-velocity-services-agreement-v2.md` (the working draft, with change markers and the change log). `node make-sources.mjs` regenerates `lead-velocity-services-agreement.md` (canonical, clean, read by the CRM generator) and `lead-velocity-services-agreement-v0.3-marked.md` (change-marked copy with a plain summary). `node build-docx.mjs template` regenerates the internal .docx from the canonical file. Never hand-edit a generated file. `lead-velocity-services-agreement-v0.1.md` is frozen. The generator fails if the Pilot, the 3-a-week cap, the Uncontactable Lead, the Plan-rate refund, clauses 8.3 and 8.4 or the 7-day notice drop out of the text.

**Status of v0.3.** Draft, not approved. v0.2 (7 Oct) was never issued to a client. v0.3 is v0.2 plus Jonathan's 10 Oct decisions (section 6). Open questions are in section 7.

## 1. Placeholders to fill

**Two outputs.** The template .docx is INTERNAL (all placeholders and [LAWYER REVIEW] notes). The Mark Weston .docx is CLIENT-FACING: no margin notes, no memo or master-prompt references, header "Draft for discussion — 5 October 2026". It fills client name (Mark Weston), practice name, email (markw@oraclebrokers.com), client signatory name, Lead Velocity's drafting defaults (3 Business Days, 30 days, 24 hours, 30 minutes, 90 days, 12 months, 5 years) and current Silver/Gold figures. The build fails if any other bracket or internal text survives. See section 5 for what still has to be completed before it is sent.

**Mark copy and v0.3.** The Mark Weston copy described above is the v0.1 copy of 5 Oct. It has not been rebuilt for v0.3. `node build-docx.mjs mark` already fails on HEAD, because the generic Parties block ([CLIENT DESCRIPTION …], [CLIENT SIGNING CAPACITY …]) is not in its fill list or allow-list. Fix that, and the "5 October 2026" header date, when a v0.3 copy for Mark is wanted. `mark-whatsapp-reply.md` also still describes v0.2 ("no-shows only", "R825 per lead" for a refund) and must be redrafted first.

| # | Clause | Placeholder | Note |
|---|---|---|---|
| P1 | Parties | ~~[LV REG NO]~~ | **RESOLVED (commit d321c52):** 2025/637858/07 is in the Parties block |
| P2 | Parties, Signatures | ~~[LV SIGNATORY NAME], [LV SIGNATORY ROLE]~~ | **RESOLVED 5 Oct (Jonathan):** Kgomotso Pule, Director |
| P3 | Parties | [CLIENT FULL NAME] | Template only. Mark copy: Mark Weston |
| P4 | Parties | [CLIENT LEGAL FORM — natural person / company] | Drives CPA exposure (clause 23). Recommend contracting with Mark's company if one exists |
| P5 | Parties | [CLIENT ID OR REG NO] | Unknown for Mark |
| P6 | Parties | [PRACTICE NAME] | Mark copy: "Oracle Private Wealth" with [CONFIRM: trading name — Oracle Private Wealth or Oracle Brokers]; his 30 Sep form said "Oracle Brokers" and his email domain is oraclebrokers.com |
| P7 | Parties | [FSP NUMBER] | Unknown for Mark; check on the FSCA register before signing |
| P8 | Parties | [CLIENT PHYSICAL ADDRESS] | Unknown for Mark; also his domicilium (clause 22.1) |
| P9 | Parties, S4.9 | [CLIENT EMAIL] | Template only. Mark copy: markw@oraclebrokers.com |
| P10 | Parties, Signatures | [CLIENT SIGNATORY NAME], [CLIENT SIGNATORY ROLE] | Mark copy fills the name only |
| P11 | 2.2 | [3] Business Days | Time to go live after payment and onboarding |
| P12 | 8.5 | [30] days | Notice before VAT is added on registration |
| P13 | 10.5, S1.1 | ~~[RATE]~~ | **RESOLVED 5 Oct (Jonathan):** interest deleted; late payment = suspension of delivery only |
| P14 | 14.3(c), S3.5 | [24 hours] | Attendance and contactability feedback window; also the window for proof of an Uncontactable Lead after the Client's last attempt (S3.4(b)) |
| P15 | 19.1 | [OPTIONAL — CONFIRM] | Keep or delete the staff non-solicit |
| P16 | 21.2 | ~~[AFSA / MEDIATOR APPOINTING BODY — CONFIRM]~~ | **RESOLVED 5 Oct (Jonathan):** AFSA, unless the parties agree otherwise |
| P17 | 24.1, 25.2 | ~~[E-SIGNATURE PLATFORM]~~ | **RESOLVED 5 Oct (Jonathan):** each party signs the PDF (typed or drawn signature) and returns it by email from its notice address; variations signed and exchanged the same way. Ordinary e-signature under ECT Act s13 (L19 still asks the attorney to confirm evidential reliability) |
| P18 | 25.9 | ~~[WESTERN CAPE / GAUTENG — CONFIRM]~~ | **RESOLVED 5 Oct (Jonathan):** High Court, Gauteng Division, Pretoria, plus consent to Magistrates' Court jurisdiction under s45 of the Magistrates' Courts Act |
| P19 | Signatures | [DATE], [PLACE] | At signing |
| P20 | 8.6, S1.1 | ~~[NONE / AMOUNT — CONFIRM]~~ | **RESOLVED 5 Oct (Jonathan):** no setup fee |
| P21 | S1.1 | ~~[FIRST PAYMENT DATE]~~ | **RESOLVED 5 Oct (Jonathan):** before the first Billing Cycle starts, on the date stated on Lead Velocity's first invoice |
| P22 | S1.1 | [CLIENT STATUS — …] | CPA declaration (23.1) |
| P23 | S1.3 | [PER PRICING PAGE] [CURRENT: …] | Template keeps the placeholders. Mark copy shows the current figures: Silver R24,500 / 30 leads, Gold R35,500 / 45 leads (MASTER-PROMPT 3.5). Confirm the live pricing page matches before sending |
| P24 | 10.3, S1.4 | ~~[ACCOUNT NAME], [ACCOUNT NUMBER], [BRANCH CODE], [PAYMENT REFERENCE]~~ | **RESOLVED 5 Oct (Jonathan, per NH-61):** "as stated on Lead Velocity's invoice" |
| P25 | S3.3, S3.5 | [30] minutes | Latest time for no-show proof ("immediately" in the brief); also for proof of an Uncontactable Lead on a phone or WhatsApp-call appointment (S3.4(a)) |
| P26 | S3.10 | [90] days | Retention of no-show and uncontactable-lead proof |
| P27 | S4.4, S1.5 | ~~[LEAD VELOCITY CRM PORTAL / WHATSAPP / ENCRYPTED EMAIL — CONFIRM]~~ | **RESOLVED 5 Oct (Jonathan):** WhatsApp to the Client's business WhatsApp number and email to its notice address, or the client portal once available. Onboarding item (e) added for the WhatsApp number. Note: plain email of lead data is weaker than the memo's "secure channel" advice (POPIA s19); consider moving to the portal as soon as it exists |
| P28 | S4.6 | [12] months, [5] years | Retention (prior defaults, practitioner Q11) |
| P29 | S4.9 | [CLIENT INFORMATION OFFICER NAME] | Lead Velocity's Information Officer resolved 5 Oct: Jonathan West. Client's Information Officer still to be supplied by the Client |
| P30 | CP Part 2 | [DATE], [LV REG NO], [HOSTING PROVIDER], [DATABASE PROVIDER], [AI PROVIDER FOR THE WHATSAPP ASSISTANT], [12], [5], [30], [INFORMATION REGULATOR CONTACT — CONFIRM] | Privacy notice (Information Officer now filled: Jonathan West) |

## 2. [LAWYER REVIEW] items

| # | Clause | Point |
|---|---|---|
| L1 | 3.1 | FAIS firewall rests on no causal link, own account and s1(3)(a) exclusions; the "no judgment" wording is a representative exclusion only and is not relied on; memo R2 alternative structure not mixed in |
| L2 | 3.6 | Substance-over-form covenant: effective? add attestation or audit right? |
| L3 | 3.10 | Client's FAIS s7(3) warranty that the Services are not financial services |
| L4 | 3.12 | Change-in-law exit; no final FSCA lead-generation / referral-fee standard found |
| L5 | 4.5 | Client's advertising view and withdrawal right (GCoC s14(2)(d)) without creating agency |
| L6 | 5.3 | Budget band as neutral self-declaration; billable unit = booked + confirmed attendance sits further down the funnel than Raspberry's "contact details" example (memo R3) |
| L7 | 6.3 | **Commercial point approved by Jonathan 5 Oct:** carry-over into the next paid cycle, else refund per undelivered lead. **10 Oct:** the refund is the Effective Lead Price of the Client's Plan (Pilot R850, Bronze R825, Silver R817, Gold R789). Still for review: CPA wording only (s48 fairness of "sole remedy", s54) |
| L8 | 8.3 | Flat fee vs Raspberry; GCoC s3A financial-interest rules; insurance commission rules |
| L9 | 8.5 | VAT threshold and adding VAT to an "excl. VAT" price after registration |
| L10 | 10.5 | **RESOLVED 5 Oct:** interest deleted, so no NCA incidental-credit risk; note removed from the agreement |
| L11 | 11.5 | Whether Lead Velocity should check the FSCA register each cycle |
| L12 | 12.2 | "No double allocation for the same enquiry" vs 0.1 "exclusively"; repeat-enquiry window |
| L13 | 13.1 | Dual responsible party model; operator carve-out in 13.10 |
| L14 | 13.2 | Marketing-optimisation purpose limited to separate optional consent; legitimate-interest assessment for non-consenting retargeting; Meta processor role UNVERIFIED |
| L15 | 13.5 | NCC registry block overrides consent; blocked lead not Delivered |
| L16 | 13.10 | Narrow s20/s21 operator clause for calendar booking and reminders |
| L17 | 16.4 | Liability cap, exclusions, indemnity; CPA s48, s49, s51; reciprocal indemnity? |
| L18 | 23.2 | CPA status; recommend contracting with a juristic entity; s17 reasonable-charge framing; s54 vs sole remedy; s49 initialling |
| L19 | 24.3 | ECT Act s13(3) ordinary e-signature suffices; name the platform (Spring Forest) |
| L20 | 25.4 | Illegality: severability won't save the Fee clause; can fees paid be reclaimed? |
| L21 | 6.6, 11.6 | **New 10 Oct.** An undelivered Top-Up Lead is sold at R850 but refunded at the Plan's Effective Lead Price, so R25 (Bronze), R33 (Silver) or R61 (Gold) less than was paid. CPA s48 (one-sided) and s54 where the CPA applies; also whether "the Plan when the leads were due" is a fair reading |
| L22 | 1.1.35, 7, S3.4, S3.5 | **New 10 Oct.** Uncontactable Lead: the Client's own call or message log is the evidence (screenshot, only the Consumer's entries visible, POPIA minimality); one replacement per lead; a Consumer who attended is excluded. Confirm that replacement for contactability stays outside Raspberry's "outcome" funnel (it turns on contact only, as clause 8.4 allows) |

## 3. Departures from MASTER-PROMPT 0.1 — Jonathan to confirm (D4, D5, D8 resolved 5 Oct; D3 and the cap and unreachable-lead parts of D1 resolved 10 Oct)

The draft follows the BRIEF on every item below (the brief says it wins over 0.1). Where research-memo.md pushed the draft past the brief, that is listed in section 4.

| # | Topic | MASTER-PROMPT 0.1 says | Draft follows (BRIEF) | Clause |
|---|---|---|---|---|
| D1 | Replacements | Per-cycle cap: Bronze 4, Silver 6, Gold 9; no weekly cap. Replacement is a right within the cap, and a replaced lead stops counting (so it is made good inside the committed number) | Discretionary goodwill, never a right; max 3 per Calendar Week; Replacement Leads are extra and free, and the No-Show Lead still counts. **RESOLVED 10 Oct (Jonathan):** the cap is 3 per Calendar Week for every Plan (Pilot included, no separate cap); an Uncontactable Lead ("couldn't reach them") also earns a replacement, inside the same 3. A disqualified lead is not a replacement trigger (invalid contact details never count, clause 5.8(d)). **Still open:** goodwill ("may") vs obligation ("will"), see section 7 | 7, Sch 3 |
| D2 | Unit sold / delivery point | Qualified lead counted once **verified** (replied or tapped on WhatsApp within 72 h). "Booking is a service", not the unit | Qualified Lead counts only when the Consumer has **booked and confirmed attendance**. 3.2 warns booking-as-unit stacks the booking rate on margin | 5.1, 5.2, Sch 2 |
| D3 | Notice | No contract, **no notice period** | **RESOLVED 10 Oct (Jonathan):** notice stays 7 days. 7 days' written notice of cancellation before the next cycle (but non-payment simply ends the agreement; failing to give notice does not make the next Fee payable, clause 11.2) | 11.1, 11.2 |
| D4 | Late payment | **No grace / dunning**; a cycle simply isn't renewed | **RESOLVED 5 Oct (Jonathan):** suspension of delivery only; no interest or penalty. Close to 0.1 (nothing is charged for paying late) | 10.5 |
| D5 | Budget band | R750–R1,250 **and R1,250+ both qualify** | **RESOLVED 5 Oct (Jonathan):** R750 or more qualifies (matches 0.1). New: Campaigns aim at a monthly budget for cover of about R1,500 or more (the Client's target profile), a targeting aim only, not a qualification requirement. Form bands: Under R750 / R750–R1,499 / R1,500 or more. Always "budget for cover", never "premium" | 5.1(c), 5.6, Sch 1, Sch 2, CP 1.4 |
| D6 | Age | Bands <35 / 35–44 / 45–50 / 51+ (no overlap) | "Age 35 to 50". Same population as 0.1's two qualifying bands; the form keeps 0.1's bands (CP 1.4). Presentational only | 5.1(c), Sch 2 |
| D7 | Lead exclusivity | Delivered leads are the broker's **to use exclusively** | Non-exclusive agreement; Lead Velocity won't allocate the same Consumer to another broker **for the same enquiry**; Lead Velocity keeps its own copy for its three purposes | 12.1, 12.2, 13.2 |
| D8 | Shortfall | Cycle extends up to 14 days; remaining shortfall → **pro-rata credit on next cycle, or refund if not renewing** | **RESOLVED 5 Oct (Jonathan):** 14-day rollover; then carry-over into the next paid cycle in addition to that cycle's 20; if the Client does not renew, refund per undelivered lead (no credit option). Close to 0.1. CPA wording still for review (L7). **Rate refined 10 Oct (Jonathan):** the refund is the Effective Lead Price of the Client's Plan (Pilot R850, Bronze R825, Silver R817, Gold R789), Top-Up Leads included, not a flat R850 (clauses 6.3, 6.6, 11.6; see L21) | 6 |
| D9 | Broker feedback | Every meeting ends with outcome → disposition → **1–5 quality → optional voice note**; feeds replacements, creative, qualification and renewal | Feedback limited to attendance and contactability; Client must not send outcome, sale, policy or premium data (memo R8; Raspberry para 29b) | 8.4, 14.3(c) |
| D10 | Lead retention | Lead Velocity retains campaign data, pages, ad account and **anonymised** performance data | Lead Velocity also keeps identifiable Lead Data and Origin Records for its three disclosed purposes, and the Client cannot require deletion of Origin Records | 13.2, 13.3, Sch 4 |
| D11 | Website wording (3.5a) | "Replacements up to X per cycle", "Short? We extend and credit", "No setup fee", "Who owns the leads? You do, exclusively", "No contract" | "No setup fee" now matches. "Short? We extend and credit" should become "we extend, carry over, or refund". Replacements (D1: still "up to X per cycle" on the old wording) and exclusivity (D7) still conflict; notice (D3) is settled at 7 days. Rewrite the pricing page and FAQ to "3 a week, goodwill" and the Plan-rate refund once Jonathan settles section 7 question 1 | — |
| D12 | Billing cycle | 30-day cycle | Brief says "per month"; draft uses a 30-day Billing Cycle to match 0.1 and the pricing page | 1.1.4 |

## 4. Points where the draft goes beyond the brief (memo-driven or gap-fills) — confirm

| # | What | Why | Clause |
|---|---|---|---|
| G1 | VAT: all amounts excl. VAT; VAT added once Lead Velocity registers, on [30] days' notice | Brief left [INCL/EXCL]; 0.1 "Excl. VAT everywhere" | 8.5 |
| G2 | Shortfall fallback (see D8) | Brief left [CONFIRM]; now approved by Jonathan | 6.2 |
| G3 | Narrow operator carve-out for calendar booking and reminders | Brief says "neither is the other's operator"; memo R7 | 13.10 |
| G4 | Marketing-optimisation use only with a separate optional consent | Brief bundles purpose 3 into the consent; memo R5 | 13.2(c), CP 1.2 |
| G5 | Lead blocked on the NCC registry at Delivery does not count | Memo R12 | 13.5 |
| G6 | Logistics-only messaging; no product control; own-account; s7(3) warranty; records; change-in-law | Memo R1, R6, §2, §4.1 | 3.7–3.12 |
| G7 | Client advertising view and withdrawal right | Memo R14 (GCoC s14) | 4.5 |
| G8 | CPA status declaration and s17 reasonable-charge fallback | Memo R9 | 23 |
| G9 | Variation only by a "Variation" document signed through the agreed e-signature method | Memo §8 (Spring Forest) | 25.2 |
| G10 | Duplicate exclusion: a Consumer already Delivered to the Client in the previous 90 days for the same enquiry does not count again; under-18s excluded | Gap-fill (prior draft Schedule B) | S2.3 |
| G11 | Proof deadline of [30] minutes after start; proof photos must show no people or address; proofs deleted within [90] days | Brief says "immediately"; memo R13 | S3.3, S3.8 |
| G12 | Approved Replacement Leads supplied within 14 days of approval; unused weekly allowance lapses | Brief silent on timing | 7.2, 7.5 |
| G13 | Early-termination refund at the Effective Lead Price for paid, undelivered leads (insolvency, breach, FSP licence loss, force majeure, change in law) | Brief silent | 11.6 |
| G14 | Top-Up delivery starts at the later of the 7-day notice expiring and payment clearing; Top-Up shortfall uses the same rollover. **10 Oct:** an undelivered Top-Up Lead is refunded at the Plan's Effective Lead Price, not at the R850 Top-Up Price | Brief silent; Jonathan 10 Oct | 9.3, 6.6 |
| G15 | Plan downgrade allowed on the same notice | Brief mentions upgrade only | 9.6 |
| G16 | Price changes only for a future cycle on 7 days' notice | Brief silent | 8.7 |
| G17 | Client misses an appointment → lead stays Delivered | Brief silent | 14.5 |
| G18 | Non-solicitation kept, marked optional | Brief "(optional)" | 19 |
| G19 | **Pilot Plan (Jonathan, 5 Oct; withdrawn 7 Oct in v0.2 as D9; RESTORED 10 Oct in v0.3 as D10):** 10 Qualified Leads for R8,500 (R850 each), once-off, one introductory Billing Cycle, first-time clients only, paid in advance, advertising media spend included; then continue on Bronze or higher by paying in advance, otherwise the agreement ends; all other terms the same, including the 14-day rollover and the clause 7 replacement rules (3 per Calendar Week, no separate Pilot cap). The text is the v0.1 text of 9.7, 9.6, 1.1.24 and S1.3, with the day-44 wording and the shared replacement rule. The "minimum Plan is Bronze" sentence is gone | Jonathan's decision | 1.1.24, 9.6, 9.7, S1.3 |
| G20 | Pilot gaps I filled: no notice is needed to continue (paying the next Plan's Fee is enough, as for any renewal); Pilot cannot be chosen as a downgrade; a Pilot shortfall refund is R850 per lead (the Pilot's Effective Lead Price). **Open:** are Top-Ups available on the Pilot (draft is silent, so clause 9.1 allows them at R850)? The pricing page and the 3.5 ladder are the pricing-code and website workstreams' job, not this file's | Confirm | 6.2, 9.1, 9.7 |
| G21 | **Uncontactable Lead mechanics (10 Oct)**, filled in by me from Mark's request #6 and NH-UX-2 because the instruction gave only the principle: (a) phone or WhatsApp-call appointment: two calls (at the start and 10 minutes later) on every number, neither answered, proof within [30] minutes; (b) otherwise, before the Consumer has attended: 3 attempts over at least 72 hours, no answer or reply, proof within [24 hours] of the last attempt; proof is a screenshot of the Client's own call or message log; one replacement per lead; a Consumer who attended and later goes quiet is excluded; invalid numbers stay under 5.8(d). Confirm the numbers | Jonathan 10 Oct + gap-fill | 1.1.35, 7.1 to 7.7, 14.3(c), S3.4 to S3.10 |

## 5. Before sending the Mark Weston copy

**Lead Velocity must complete** (shown as "__________" in the client copy):

| Clause | Item |
|---|---|
| Signatures | Date and place (at signing) |

(Lead Velocity's registration number, 2025/637858/07, is already in the Parties block.)

**Only Mark can supply** (yellow-highlighted placeholders in the client copy): trading name (Oracle Private Wealth or Oracle Brokers), legal form, ID or registration number, FSP number, physical address, signatory role, CPA status (S1.1), and his Information Officer name (S4.9). Before go-live he also gives the onboarding items in S1.5, including the business WhatsApp number that leads are delivered to.

**Also:** the client copy has no margin notes, so the lawyer-review points in section 2 must be closed or accepted by Jonathan before it goes out. Confirm with the attorney first if possible.

## 6. Decided by Jonathan on 10 October 2026 (applied in v0.3)

| # | Decision | Where in the agreement | Status |
|---|---|---|---|
| R1 | **Pilot Plan restored** (reverses the 7 Oct withdrawal): R8,500 once-off excl. VAT, 10 Qualified Leads, R850 each, one introductory 30-day Billing Cycle, first-time clients only, paid in advance, advertising media spend included, flat Fee with no link to policies, premiums or commission; same 14-day rollover and same clause 7 replacement rules as every Plan; then Bronze or higher paid in advance, otherwise the agreement ends | 1.1.24, 9.6, 9.7, S1.3 | Done. "Minimum Plan is Bronze" removed |
| R2 | **Replacements capped at 3 requests per Calendar Week for every Plan**, no separate Pilot cap | 7.2, 9.7, S3.8 | Done. The per-cycle caps (Pilot 2, Bronze 4, Silver 6, Gold 9) belong to the earlier "replacements are a promise" draft and are not in v0.1 or v0.2 |
| R3 | **"Couldn't reach them" earns a replacement** (Uncontactable Lead), counted inside the same 3 per week as no-shows | 1.1.28, 1.1.35, 7.1 to 7.7, 14.3(c), S3.4 to S3.10 | Done, with the mechanics in G21. Closes NH-UX-2 in `deliverables/product/crm-ux-synthesis.md` (that file is not changed here) |
| R4 | **Notice stays 7 days** | 11.1 | Unchanged. D3 resolved |
| R5 | **Refunds at the Effective Lead Price of the Client's Plan**, not a flat R850: Pilot R850, Bronze R825, Silver R817, Gold R789. Covers the day-44 refund, undelivered Top-Up Leads and the early-termination refund | 1.1.14, 6.3, 6.6, 11.6, S1.1, S1.2 | Done. See L21 and question 2 |
| R6 | Clauses 8.3 (no success-based payment) and 8.4 (feedback limited to B-tier accept/decline and attendance/contactability) | 8.3, 8.4 | Intact, word for word |

## 7. Open questions for Jonathan (10 October 2026)

1. **Replacement: "may" or "will"? Not decided.** Clause 7.1 stays as v0.1 and v0.2 had it: Lead Velocity "may, as a discretionary goodwill gesture and not as an obligation" supply a Replacement Lead, and 7.7 says a replacement is "never owed". Mark's request #2 was "shall provide". The risk and the alternatives are in `mark-amendments-2026-10-07.md` (#2 and section 4 question 1). A "will" would also change 7.1, 7.7, the clause 7 heading, S3.8 ("decides in its discretion"), clause 7.6 and the pricing-page wording.
2. **Top-Up refunds below the price paid.** On Bronze, Silver or Gold an undelivered Top-Up Lead (sold at R850) is refunded at R825, R817 or R789. That is what was decided; the CPA (s48, s54) point is L21. The alternative is to refund the price actually paid for Top-Up Leads and use the Plan rate only for Plan leads.
3. **"The Plan at the time."** I read it as the Plan the Client was on for the Billing Cycle in which the lead was due (for a Top-Up Lead, when the Top-Up was ordered). The other reading is the Plan on the day of the refund request, which would refund a Bronze lead at R789 after an upgrade to Gold.
4. **Pilot and the weekly cap.** 3 replacement requests a week is 30% of the Pilot's 10 leads every week, so over a 30-day cycle up to about 13 requests could be considered against 10 leads. It is a cap on requests considered, and each is still goodwill, but a separate Pilot cap was ruled out.
5. **Pilot Top-Ups.** Clause 9.1 lets a Pilot Client top up at R850 once the 10 leads are delivered. Confirm that is intended (G20).
6. **Uncontactable numbers (G21).** 3 attempts over 72 hours (Mark's own request #6), two calls for a phone or WhatsApp-call appointment, [30] minutes and [24 hours] proof windows. Confirm, and confirm that the portal's "Couldn't reach them" tap and the W13/W29 replacement flow match these two limbs (they currently key on a system "uncontactable" event and a disposition "unreachable").
7. **Clause 8.4, last sentence (left intact as instructed).** It still reads "No outcome of any appointment affects any Fee, Top-Up Price, credit, refund or replacement", while a replacement does turn on attendance and contactability. Consider "no sales outcome" (the 7 Oct findings made the same point).
8. **Mark.** `mark-whatsapp-reply.md` and the earlier Mark PDF describe v0.1 and v0.2 (no Pilot change, "no-shows only", "R825 per lead"). Redraft before anything goes to Mark; this file does not touch client-specific copies.
9. **Clause 6.1 against the 0.1 wording.** MASTER-PROMPT 0.1 and `pricing.seed.json` (`terms.shortfall_after_rollover`) say the extra 14 days are only for delays outside our control. Clause 6.1 says "If delivery is delayed (including by events outside Lead Velocity's control …)", which covers any delay and so gives the Client more. The numbers agree (14 days, day 44, 7 working days). Keep the wider contract wording, or narrow 6.1 (which then needs a rule for a shortfall that is not outside our control: today 6.2 and 6.3 start only after day 44).
10. **Price paid when a Pilot Client moves on.** 9.7 now says the Client pays the Pricing Page price when it pays; S1.3 shows the Signature Date Fees. If the Pricing Page changed in between, the Pricing Page figure applies and Schedule 1 is read with it, as for an upgrade under 9.5. Confirm that is the intent, or fix the Fee at the Signature Date for the move on.

## 8. Repair pass, 10 October 2026 (after independent checks of the Pilot restore)

**Fixed in the agreement** (edited in the draft, then `node make-sources.mjs` and `node build-docx.mjs template`; `make-sources.mjs` now also fails if any of these drops out):
- **Moving on from the Pilot (9.5, 9.7, S1.3).** 9.5 covers an upgrade to Silver or Gold on 7 days' notice, and 9.7 said pay in advance with no notice, so a Pilot Client moving to Silver or Gold met two rules, and Bronze was in neither 9.5 nor Schedule 1. Now a move on from the Pilot is made only under 9.7: pay the next Plan's Fee in advance, no 9.5 notice, Schedule 1 read with that Plan from the start of the cycle paid for. S1.3 states the Fee and Committed Leads of Silver and Gold (they were bracketed placeholders, although 1.1.14 and 6.3 quote R817 and R789 from Schedule 1); for a Pilot Client the CRM generator also lists Bronze, so the Plan the Client moves to is in Schedule 1.
- **3 replacement requests per Calendar Week** is now also in 1.1.28 and in a new Schedule 1 row (it was only in 7.2, 9.7 and S3.8). Schedule 1 prevails on quantities (1.3).
- **Uncontactable Lead (1.1.35)** now uses the same two calls as S3.4(a) (start time, and again 10 minutes later, on every number). The body prevails over a Schedule (1.3), so the looser definition could have overridden the stricter test.
- **Refunds (6.3, 11.6, S1.1)** are never more in total than the Client paid. The Effective Lead Price is rounded, and 30 x R817 = R24,510 on a R24,500 Fee, 45 x R789 = R35,505 on R35,500. Pilot and Bronze reconcile exactly.
- **Lawyer notes.** The D12 note quoted "the Plan at the time", which is in no clause; it now quotes the wording used in 6.3, 6.6 and 11.6 and explains the cap. The D11 note said 8.4 "allows" a replacement; it now says the last sentence of 8.4 does not carve out clause 7 (question 7).
- **Change log.** A D10 row is added: 9.5, 9.7 and S1.3 now differ from v0.1, so the Pilot is no longer "v0.1 text again".
- **Generator checks (`src/lib/contract/agreement.ts`).** The 1.1.14 Effective Lead Prices, the weekly cap in 1.1.28 and Schedule 1, and every Plan row in S1.3 are compared with the pricing source and shown as warnings on drift. Resolved for Pilot, Bronze, Silver and Gold: no warnings.

**Left as it is, on purpose.** 8.4 (R6 and question 7). 6.1 (question 9). The open brackets [3] Business Days (2.2), [24 hours] (14.3(c), S3.5), [30] minutes (S3.3, S3.5), [90] days (S3.10) are drafting defaults waiting for the practitioner, not decisions. "10 minutes" is used the same way in 1.1.35, 4.1(f), 5.4, S2.5, S3.1, S3.2 and S3.4(a); `pricing.seed.json` has no field for it and none was added.

**Not done in this pass: system work that needs a design, a migration or Jonathan's decision** (DDL and n8n imports are user-gated):
1. **The weekly replacement rule in the engine.** `cycles.replacement_cap` is still snapshotted from `pricing.replacement_cap_cycle` (4 / 6 / 9) by migrations smc_02_core and smc_06_pass2. W13 (`automation/lib/w13.mjs`, `build-w09-w12-w13.mjs`, `W13.json`) refuses a claim at that per-cycle cap and nothing enforces 3 per Calendar Week; `W13.test.mjs` and `W12.test.mjs` lock the per-cycle cap in. The broker report still prints "used of cap" (`analytics/W14-broker-payload.sql`; migrations smc_13_pass7, pass6, pass4). What changed in this pass: no surface prints the cap any more (portal Leads and Reports, tier cards, checkout, the `broker_cycle_end` WhatsApp line, the proposal block), the seed carries a comment saying the 4 / 6 / 9 is internal, and `pilot.test.js` fails if a published surface prints it again. The engine, the weekly report and the uncontactable-lead claim (question 6) should move together in one change, with a migration.
2. **The Pilot in the billing pipeline.** The Pilot is outside `pricing.seed.json` `rows` by design (checkout, W25 and the Paystack plans read the monthly ladder), so there is no Pilot payment page, no `SMC_PILOT` row in `pricing` and therefore no `cycles` row (`cycles.tier_code` references `pricing`), and no `media_share_zar` (a `pricing` row needs one above 0 and Jonathan has not decided it for the Pilot). Until then a Pilot is invoiced from the CRM Invoice Generator and paid by EFT. The portal Agreement page now reads correctly for a Pilot broker (one cycle, then Bronze or higher), but no such broker can exist in the database yet.
3. **The older Broker Services Agreement (2 Oct).** W19 and W25 still merge its Schedule A (`{{replacement_cap_cycle}} replacements per cycle`) while the CRM generator and the portal use the LGSA. Its body also still says "no notice period" and a replacement is a right within a per-cycle cap. Retire it from W19/W25 (and `scripts/readiness.mjs`) or rewrite it; a one-line edit would leave it contradicting itself.
4. **Rendered and spoken assets** that still say "no contract, no notice period": `deliverables/broker-success/explainer-video/script.json` and `stage.html` (a re-render), the 2 Oct term sheet (signed document, left alone).
5. **Working papers that describe the 2 Oct per-cycle design** and move with item 1: `.claude/agents/automation-engineer.md` (W13 row), `conversation/state-machine.md`, `knowledge/metrics.md` M14, `docs/design/*.html` mock-ups, `deliverables/{compliance-qa,market-research-analyst}/*`, `deliverables/contracts-drafter/{needs-human,first-principles,practitioner-brief,SUMMARY}.md`, `build/*`. Historical records are not rewritten.
6. **The Pilot's margin.** MASTER-PROMPT 3.5 models the Pilot at 28% at the R250 stress CPL, under the 30% guardrail, and says it needs Jonathan's explicit yes. No approval is recorded in the repo. The Pilot exists only on the `pilot-restore` branch (not pushed, not deployed).
