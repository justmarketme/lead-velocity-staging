# conversation-designer: first-principles memo (4B)

Head of Conversational AI · 2026-10-02 · written from Sections 0.1, 1.2, 2.1, 3.3, 4.6, 4.10b, 4.11, 4.12, 4.12a, 4.14, 4A, 6B and the approved design references in `docs/design/`. No new research.

## 1. Irreducible goal

**A verified, qualified lead books a call with a licensed adviser and turns up, and nobody on our side gives advice on the way.** Numbers: booking ≥ 60% of verified leads, show ≥ 65% of booked, zero guardrail failures in production.

(4B's worked example says "≥ 75% show rate". My identity block, 3.4 and 3.7 all say 65%. I build to 65% and treat 75% as a stretch goal. Logged as a needs_human line.)

## 2. Fixed constraints vs conventions

| Fixed (law, platform, money) | Source |
|---|---|
| No advice, comparison, premium, cover amount or recommendation from Lead Velocity. Flat fee only. | FAIS, *Raspberry Academy* (2.1.1) |
| Opt-in consent; STOP honoured at once; special personal information (health, ID) redacted and never briefed in detail | POPIA (2.1.2, 2.1.7) |
| Free-form messages only inside the 24-h window the lead opens; everything scheduled is a utility template; CTWA gives a 72-h free entry window; reply buttons ≤ 3, list rows ≤ 10 | WhatsApp Cloud API (4.6) |
| Disclose that the assistant is an AI | 4.11; Meta business-messaging rules (4.14) |
| First message < 60 s | HBR 2011 (4.6, 4.12) |
| Runtime model Haiku 4.5, escalate to Sonnet 5.5; ≈ R0.50-R2 of LLM per lead | 4A, 4.11 |
| A lead counts once it replies or taps within 72 h | 3.3 |

| Convention (what the industry usually does) | Kept? |
|---|---|
| A chatbot that answers anything | **No.** Scope is the call, the booking and the service. |
| An LLM in every turn | **No.** Buttons carry ~90% of turns; the LLM only reads and phrases typed text. |
| Typing delays and an emoji "personality" to feel human | **No.** Feeling human comes from short, specific, one-question messages in the lead's register. |
| A booking link to a scheduling page | **No.** Book in chat: Flow, or a 10-slot list as fallback (Chili Piper; 0.1 booking UI). |
| One reminder | **No.** A sequence: multiple reminders beat one (Cochrane/BMJ Open, 4.12). |
| A persona that hides it is a bot (the Ayanda pattern) | **No.** 4.11 forbids it. |

## 3. Mechanisms with A/B-grade evidence (from 4.12; everything else is a hypothesis)

| Mechanism | Evidence (grade per 4.12/4.6) | Where it is built in |
|---|---|---|
| Fast first contact | HBR 2011: contact within 1 h ≈ 7× qualification odds (A) | W06 < 60 s; Thandi answers typed text within the same turn |
| The lead writes the appointment details down themselves | Martin, Bassi & Dunbar-Rees 2012 (NHS): 18% fewer missed appointments; 31.7% fewer with a social norm (A) | `COMMIT_ASK` → `commitment_ok` / `commitment_check`; "Most people find 30 minutes is all it takes" at T-24 h |
| Specific, honest cost of missing | PLOS ONE RCTs: no-shows from 11.1% to 8.4% (A) | "{adviser} has set aside 30 minutes for you" (T-2 h); intro scripts state 30 minutes |
| Several text reminders | Cochrane/BMJ Open: pooled no-show 15% vs 21%; texts ≈ calls (A) | W09 sequence, all utility templates, no voice by default |
| Engagement before the call predicts attendance | Practitioner, unsourced (C). Consistent with the commitment research | Design for a reply, not a read: commitment ask, `Confirm` button. Measured, not assumed |

## 4. Simplest design that satisfies the constraints

1. **Layer 1, deterministic (most turns).** Consent, four qualifying taps, intro card with disclosure, Flow/list booking, confirm, reminders, reschedule, outcome. Every word is pre-approved (`deferral-lines.md`, automation templates). No advice risk, works outside the window.
2. **Layer 2, LLM (typed text only).** `prefilter` (regex) → `redactForLLM` → Haiku intent/slot JSON → `decide()` in code → Haiku reply phrasing (only for actions that need words) → `outputGate` (regex) → Haiku guardrail classifier → `toneCheck` → code adds fixed lines and buttons → send. Every check fails closed. The model never decides eligibility, routing or slots, and never writes the deferral line.
3. **One FAQ corpus** (`knowledge/faq.md`, 25 answers + 8 defer topics) is the only factual source Thandi may phrase, shared with comment and DM replies and the page FAQ (6B.9).
4. **Eval gate before staging** (0.3 #9, 6B.1): 237 golden turns, 50 red-team attacks with unsafe drafts, 20 scripts and 5 briefs. Runs offline in CI. The live checks run when a key exists.

**Conventions kept, and why** (the "which of my five" test):

| Kept | Inspiration | Why it beats the first-principles minimum |
|---|---|---|
| Book inside the chat; typed "Friday after 2" → 3 Friday slots on buttons | Chili Piper | Every hand-off leaks; this is the booking-rate lever |
| Politely persistent nudges (+2 h / +24 h / +72 h; CTWA +1/+20/+68 h), each adding one useful fact, then stop | Conversica / Verse | Two-way persistence beats blasts. It stops after three, so it never becomes spam |
| Human hand-off on request, complaint, frustration, two misses | Conversica / Verse | The moment a lead goes hot or upset, a person is better than any prompt |
| One question per message; says what it will do with the answer | Lemonade (Maya) | Guided feels human and lowers drop-off; the "I've made a note" line turns a refusal into service |
| Bands not figures; exclusivity; verification by reply | MediaAlpha / EverQuote | This is what the broker pays for; it also keeps POPIA exposure minimal |
| Buttons and lists carry structure; templates for anything outside the window; Flow for the calendar | respond.io / Gupshup / Clickatell | The channel's grammar; cheapest and safest per turn |

## 5. Assumptions register and kill criteria

| # | Assumption (C/D grade) | Test / metric | Check by |
|---|---|---|---|
| A1 | ≤ 15% of turns need the LLM | `conversations` turn mix | day 14 of staging + first 100 live leads |
| A2 | LLM cost ≤ R2 per lead (Haiku, ~3 calls per typed turn) | token cost per lead in `costs` | first 100 leads |
| A3 | ≥ 50% of booked leads answer the commitment ask (typed or `Confirm`) | `commitment=true` rate | first 100 bookings |
| A4 | Leads who reply before the call show ~3× more (unsourced practitioner claim) | show rate by replied / not | first 100 bookings |
| A5 | Haiku handles Afrikaans intent and register as well as English | live eval on the 38 AF cases: intent ≥ 90%, FAIS 100%; native-speaker read | before CoverKlaar (Phase 6) |
| A6 | isiZulu / Sesotho are good enough to use | **not assumed**: golden cases must be added and pass before any use (6B.11) | needs_human |
| A7 | Regex false positives (harmless question gets the deferral line) stay < 5% in production | weekly review + W33 judge | weekly |
| A8 | Handoff rate stays ≤ 10 per 100 conversations | console KPI | weekly |
| A9 | The prefilter + classifier catch paraphrased advice requests | live `fais.live_deferral_recall` = 100%, `llm_only` cases included | every prompt change |

**Kill criteria for this design.**
- **Any guardrail failure that reaches a lead** → turn Layer 2 off for everyone (Layer 1 keeps booking with no LLM), add the turn to the red-team set, fix, re-run the gate, then turn it back on. The layered design makes this a switch, not an outage.
- **Booking < 45% of verified by day 14** → the first fix is the Flow and slot offer (Layer 1), not the prompts: compare list vs Flow and the CTWA stall points.
- **Show < 50% for 14 days** (3.4) → review the reminder sequence and the commitment-ask uptake (A3); test the intro media (4.10b).
- **Handoff > 15 per 100** or **live intent accuracy < 85%** → rewrite prompts, add golden cases; escalate more turns to Sonnet only if Haiku stays below 85% after two prompt rounds.

## 6. Deliberately not built

- Open-ended chat, small talk, general financial Q&A: off-topic → `STAY_IN_LANE`.
- Any LLM decision on eligibility, routing, slots, replacements or closes.
- Voice agent (Ayanda-style) as the default: texts ≈ calls at lower cost (Cochrane), and the persona's assumptive close and pain-teaser openers are sales technique.
- Fake typing delays, emoji personality, countdowns, "slots are filling" unless W04 says so.
- Languages beyond EN/AF in production before they pass the golden set (6B.11).
- Sentiment-based upsell, discounts, re-engagement after "Attended". The adviser owns every follow-up (FAIS).
- A paraphrasable deferral. The line is fixed and inserted by code. The approved replay's paraphrase ("The cost question is exactly what…") is replaced by the verbatim line.
- Proactive free-form messages outside the 24-h window. The replay shows one on a web lead; it is only sent when the lead has opened the window.
- New code outside `conversation/`, `evals/`, `knowledge/faq.md`. The runtime modules (`guardrail.mjs`, `logic.mjs`, `lines.mjs`) are for automation-engineer to load into the W07 Code nodes.
