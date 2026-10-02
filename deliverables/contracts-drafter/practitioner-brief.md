# DRAFT — for practitioner review

# Brief for the external FAIS / POPIA practitioner — Lead Velocity (Pty) Ltd / SortMyCover

**What we ask for:** one written opinion on the questions below. For each, we give our current default (what the system does today) and the alternative we can switch to. Please answer "default OK", "use the alternative", or give your own wording.
**Documents enclosed:** broker-services-agreement.md · term-sheet-mark.md · consent-and-privacy.md · paia-manual.md · ncc-direct-marketer-pack.md · compliance-register.md.
**Context in one paragraph:** Lead Velocity runs a consumer brand, SortMyCover, that advertises on Facebook and Instagram with educational content only. Consumers opt in, answer tap-only questions (age band, budget band, call method) and are passed to one authorised FSP (a life-cover broker). Within 60 seconds they get a WhatsApp naming the adviser, practice and FSP number. We book a call in the broker's calendar and send reminders. The broker pays a flat price per 30-day cycle in advance (e.g. R16,500 excl. VAT for 20 verified qualified leads), never linked to policies. We have no compliance officer; we are not an FSP.
**Build and launch do not wait for this opinion. Where your opinion differs from a default, your opinion wins.**

---

## Page 1 — The questions (one line each)

| # | Question | Our default | The alternative |
|---|---|---|---|
| Q1 | Is a broker-neutral funnel (ads/pages don't name the broker; named disclosure in the first WhatsApp) acceptable under FAIS and the GCC advertising rules? | Ads are our educational content, not FSP adverts; disclosure in WhatsApp < 60 s, logged | Treat ads as the broker's advertising: broker approves each ad and FSP details appear in the ad |
| Q2 | Generic or named consent at the tick box? | **Named** (practice + FSP in the consent line) while one broker | Generic ("an authorised FSP") + named WhatsApp disclosure, for multi-broker routing |
| Q3 | Does our flat per-cycle fee keep us outside "intermediary services" after *Raspberry Academy v Oaksure*? Do replacements, shortfall credits or the broker's voluntary "policies written" figure create any linkage? | Flat, in advance, never per policy; credits tied only to lead delivery; policies figure used only for the broker's ROI view | Stop collecting "policies written" at all |
| Q4 | Do booking, reminders, a pre-call brief and an AI assistant that answers "what happens on the call" amount to "any act" toward a financial product under FAIS? | No — fixed deferral line for product/cover questions; red-teamed | Narrow the assistant to booking only; no free-text answers |
| Q5 | Is our requested-contact, consent-based model "direct marketing" under the CPA 2026 Amendment Regulations? | Register with the NCC anyway and cleanse monthly | Do not register; cleanse only |
| Q6 | Does a registry block override a fresh, specific request made minutes earlier (e.g. the booking confirmation)? | Yes — suppress, even the confirmation | Allow transactional messages the person just asked for |
| Q7 | POPIA roles: are we responsible party for collection, broker responsible party after hand-over, and our calendar work for the broker an operator role? | As drafted in agreement clause 9 | Joint responsible parties with a single shared notice |
| Q8 | Is one tick box plus a separate advertising-measurement sentence enough for hashed Pixel/CAPI use and lookalike seeding? | One tick + separate sentence (4.4a) | A second, optional tick box for ad measurement |
| Q9 | Cookies (**open — blocks publication, not staging**): may the Meta Pixel run on page load by default, with notice in the Privacy and Cookie Notices and an off switch at /privacy#opt-out, and no banner (POPIA / ECTA)? | Pixel on at load; notice (CN-v1.1); off switch `smc_ads_off` at /privacy#opt-out; no banner | Opt-in: no Pixel until the person switches it on; one-line banner (CN-v2) |
| Q10 | Is our s72 basis for overseas processors (binding processor terms + necessity) sufficient, or do we need explicit consent? This now includes the voice-note transcription provider. | Processor terms + necessity; listed in privacy notice | Add explicit transfer consent |
| Q11 | Are these retention periods right? Lead data incl. adviser feedback 12 months after last contact; unfinished WhatsApp chat 72 hours; non-fit entries 24 hours; consent and opt-out records 5 years; block-list hash indefinitely. They are placeholders in PN-v1.1 and W34 enforces whatever you confirm. | As stated | Your periods |
| Q12 | Are the replacement, 48-hour dispute, 14-day extension and pro-rata credit mechanics fair and enforceable (CPA s48 if it applies to the broker); is the liability cap at the cycle price acceptable? | As in Schedule C and clauses 5 and 14 | Your changes |
| Q13 | Month to month with no notice period and no grace; card auto-renew opt-in only — any CPA issue? | As drafted | — |
| Q14 | Likeness: is the clause 11 consent (photo, voice, video; optional and withdrawable) sufficient, or does it need a separate standalone consent? | Clause in the agreement with its own tick | Separate signed consent form |
| Q15 | Meta fallback (ads from the broker's Page, paid by us, Annex 1): does this change who the "advertiser" is for FAIS, and is Annex 1 adequate? | Broker approves each ad; we pay | Do not use the fallback; appeal only |
| Q16 | PAIA manual: does any small-business exemption apply to us? | Publish anyway | Publish only if required |
| Q17 | Health/ID details volunteered in chat: is redaction plus "has a health question" in the brief sufficient under s26–27? | As described | Block the message and ask the person not to share |
| Q18 | Dispute resolution: talk → mediation → court. Suitable? | As drafted | Arbitration (e.g. AFSA) |
| Q19 | Is the term sheet binding for cycle 1 until the full agreement is signed? | Binding, replaced by the agreement | Non-binding heads of terms |
| Q22 | Adviser feedback about the lead (outcome, 1–5 rating, short note, voice note transcribed by {{TRANSCRIPTION_PROVIDER}}; audio not kept, transcript redacted): is the PN-v1.1 notice enough under s18 (information from another source), and may we use it to tune ads and settle replacements? | Disclosed in PN-v1.1 "What we collect"; provider in the processor table; voice notes stay off until the provider is named | Collect tap outcome and rating only; no free-text note or voice note |
| Q23 | Schedule C1A: when a verified lead cancels and does not rebook, is replacing it (a) as "uncontactable" after one rebooking offer and the follow-up sequence, and (b) as "would not take a call" on an explicit refusal, consistent with *Raspberry Academy* (no policy linkage) and fair to both sides? Does the one rebooking offer plus follow-up after a cancellation respect the lead's objection rights? | (a) + (b) both replaceable, within the per-cycle cap; messaging stops at once on an explicit refusal | (a) only, or (b) only (texts in Schedule C1A drafting note) |
| Q24 | Retention clock: what restarts a lead's {{retention_lead_months}}-month clock (`last_contact_at`)? (1) any contact about the lead, including the broker-facing digest or pre-call brief (W11); (2) only messages we send to the lead and messages, taps or bookings from the lead; (3) only the lead's own replies and bookings. | **(2)** — only outbound to the lead and inbound from the lead; W11 stops updating `last_contact_at`. We recommend (2): "contact with you" in PN-v1.1 means contact with the person, and internal messages about them should not extend how long we keep their data (POPIA s14) | (1) any contact incl. W11 (longest retention; not recommended) · (3) lead-initiated only (shortest; reminders we send would not count) |
| Q20 | The existing CRM contract generator contains commission wording, a one-week notice term, a strict no-refund clause and a 24-month commission survival clause. Confirm these must be removed. | Retire that template; use this agreement only | — |

---

## Detail for each question

**Q1 — Broker-neutral funnel.** One creative and page set serves every broker. The broker's identity arrives in a personal WhatsApp within a minute, which is read more carefully than small print and is timestamped. Rules: no product names, insurers, premiums, cover amounts, comparisons or "best/cheapest". *Ask:* is the WhatsApp disclosure early enough and complete enough? Must anything else appear before the first call?

**Q2 — Consent mode.** The system supports both with one config flag (`consent_mode`). Exact texts are in consent-and-privacy.md Part 1. *Ask:* which text, and must the CTWA in-chat consent also name the practice?

**Q3 — Fee structure.** *Raspberry Academy v Oaksure* (Gauteng High Court, 14 April 2026): a % of premium paid only when policies were written made the lead generator an unlicensed intermediary, and its agreement unenforceable. Our Schedule A is built the other way: flat, in advance, never contingent. *Ask:* any residual risk in (a) replacements and shortfall credits, (b) the voluntary ROI view, (c) tiered prices that rise with lead volume?

**Q4 — Booking and AI.** The assistant qualifies by tap, books, reminds and answers logistics. Product or cover questions get a fixed deferral line and are logged for the broker. *Ask:* any wording we must add or avoid?

**Q5 / Q6 — CPA 2026 regs.** See ncc-direct-marketer-pack.md. *Ask:* must we register; does the registry override a consumer's same-day request; how should transactional messages be treated?

**Q7 — POPIA roles.** See agreement clause 9. *Ask:* is the operator clause (9.3) enough for s20–21, and is anything missing from the broker's data-use limits?

**Q8 / Q9 — Advertising data.** Uploads are SHA-256 hashed; customer lists are used only for exclusion and lookalike seeding, never for messaging.

**Q10 — Transfers.** Processors: Meta, Anthropic, Google, Microsoft, Twilio, Paystack, Hostinger, Supabase.

**Q12 — Replacement mechanics.** Caps per cycle: Bronze 4, Silver 6, Gold 9. Triggers: no-show (and no answer to our T+30 check), uncontactable (system-determined), disqualified (Schedule B miss with reason code). Never "didn't buy". Lead cancellations: see Q23 and Schedule C1A.

**Q9 — Pixel default.** The mechanism exists today: `smc.adsOff()` / `smc.adsOn()` at /privacy#opt-out store a first-party `smc_ads_off` flag; while set, nothing is sent to Meta from the page. The only open point is whether "on by default" is allowed. *Ask:* default OK, or opt-in?

**Q22 / Q23 — Adviser feedback and cancellations.** See consent-and-privacy.md PN-v1.1 and broker-services-agreement.md Schedule C1A. *Ask:* any wording we must add to the notice or the schedule?

**Q14 — Likeness.** Name, practice and FSP number are required for disclosure. Photo, voice and video are optional. No voice cloning or avatars.

**Q20 — Legacy template.** `src/components/dashboard/ContractGenerator.tsx` defaults include `commissionText`, "Top-Up tokens require one week's notice", "commission … obligations survive for 24 months" and a no-refund rule. We have flagged these for removal; we ask you to confirm.

**Please return:** a short written opinion answering Q1–Q23, marked-up documents where wording must change, and anything else you think we missed.


### Q21 — E-signature validity (added by the orchestrator from the first-principles memo)
**Question:** Is in-portal acceptance (typed name + timestamp + IP + document hash, copy emailed from howzit@) a valid signature for the Broker Services Agreement and the authorisation letter under the ECT Act, or is an advanced electronic signature needed for any part of it?
**Our default:** in-portal e-sign as described (Section 8 Q7 default).
**Alternative:** a DocuSign-class tool for the agreement; wet/advanced signature for the authorisation letter only.
