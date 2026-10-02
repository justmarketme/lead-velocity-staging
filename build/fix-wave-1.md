# Fix wave 1 — from compliance-qa phase4-review-2 (dispatched by the orchestrator after wave 3 lands, to avoid file conflicts)

| Owner | Fixes |
|---|---|
| creative-strategist | C01 "Most bonds" → "Many bonds"; C03 cut the unsourced "most new owners skip…" clause; C14 drop "photo"; C02 replaced by H12 payslip checklist for cycle 1 (keep C02 in reserve); C12 held, C13 in; DStv anchor removed from any mention; website-wording: FAQ "Is there a contract? — No." → honest answer (agreement, no lock-in/minimum term), "pre-call brief for every booked call", "no contract" → "no lock-in" everywhere; Promotions page: Option A text (take-down note) pending NH-14. Regenerate concepts.csv. |
| performance-creative-director | fold the same into hook-library-v2 / briefs (C02→H12, C12→C13). |
| visual-producer | re-render C01, C03, C14 stills + motion and the new C02/C12 replacements after the copy fixes. |
| landing-page-builder | H1s for new-bond, turned-40, self-employed, virtual, myth-bust from hook-library-v2; FAQ data from faq.md v1.0.1; remove l.144 "No products, prices or paperwork on the call"; add `#opt-out` anchor target (privacy page) ; rebuild dist; W01 note: consent text rebuilt server-side from `consent_version`. |
| conversation-designer | faq.md v1.0.1 (FAQ-05/23 "only to {practice}", FAQ-09 flat-fee wording, FAQ-25 lead pulse, FAQ-11 unsourced stat, FAQ-02/10/16 "no selling" → "no obligation to buy"; Part B add claims, investments/RAs/medical aid, wills/estate, adviser commission); red-team +12 cases (other states, multi-turn, switching/suitability, out-of-scope money, claims, commission, self-harm/bereavement → person, volunteered ID/bank/health, policy-schedule photo, voice note, disguised numbers/slang/isiZulu/Sesotho, injection in lead name → brief, injection in CTWA referral, harmless near-misses); guardrail prompt sees the lead's question + explicit switching/claims + personal-attributes check for public replies; script-generator.md l.25 + script-gate.md l.13 → day-neutral close; re-run dry run. |
| community-response-lead | "nothing is sold on the call" → "no obligation to buy"; privacy line "only to the adviser" fix; sensitive human template must not pitch a call. |
| search-findability-lead | remove the "Reviewed by a licensed adviser" line until a real review exists; reviewer never a routed broker. |
| broker-success + billing-automation | "no contract" → "no lock-in / no minimum term" on agreement screens and checkout; checkout title without the consumer brand (NH-27 d); CI test that billing code never reads policies-written/commission. |
| intro-media-producer | rubric rules I-1…I-7 from phase4-review-2 §5. |
| automation-engineer | W01 test: consent text rebuilt server-side from version (not trusted from the browser). |
