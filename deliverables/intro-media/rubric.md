# FAIS gate rubric for intro scripts (and for what is actually said on the recording)

Owner: intro-media-producer with compliance-qa. Applies at three points: (1) when a script is generated, (2) every time the broker edits it, (3) to the transcript of the finished recording. Nothing is recorded, processed or sent without passing. Lead Velocity gives no advice and names no product (master 2.1.1); an adviser intro is a lead-facing message, so it carries the same limits.

## Script rules (all must pass; the gate returns the failing ones with a one-line fix)
| # | Rule | Pass | Fail example | How checked |
|---|---|---|---|---|
| 1 | Length | 60 to 90 words (about 20 to 30 s at 2.6 words/s) | 40 words; 120 words | count |
| 2 | Practice name | exactly once, spelled as in `brokers.firm_name` | missing; said twice | exact string count |
| 3 | FSP number | "FSP {fsp_number}" exactly once, matching `brokers.fsp_number` (FSCA-verified) | missing; wrong number | pattern count |
| 4 | First person, plain, warm | "I", "my", "I'll"; grade 6 to 8 English; no jargon | "Our firm provides holistic solutions" | pattern + judge |
| 5 | No product | no named product or product class beyond the words "cover" and "life cover" used generically; no "policy", "plan", "fund", "investment", "income protection", "funeral cover" | "a good funeral policy" | banned list |
| 6 | No premium or money | no rand amounts, percentages, "per month", "affordable" | "from R250 a month" | banned list |
| 7 | No insurer | no insurer or brand name | "I work with Old Mutual" | banned list |
| 8 | No return | no "return", "yield", "growth", "performance" | "better returns" | banned list |
| 9 | No guarantee | no "guarantee", "promise", "risk-free", "assured" | "guaranteed payout" | banned list |
| 10 | No "best" claims | no "best", "cheapest", "lowest", "top", "number one", "leading" | "the best cover" | banned list |
| 11 | No advice | no "you should", "you need to", "I recommend", "I advise", "switch to", "take out"; the call is described, not the answer | "you should increase your cover" | banned list + judge |
| 12 | No urgency | no "limited", "today only", "hurry", "last chance", "before it's too late", "only N spots" | "book now before it's too late" | banned list + judge |
| 13 | What the call is and isn't | says it is a conversation and that there is nothing to buy / no pressure | none of that | judge |
| 14 | Day-neutral close | ends with "looking forward to speaking" or similar; does not name a weekday (one video goes to leads with different days) | "see you on Thursday" | judge |

"Nothing to buy" and "no pressure" are allowed and encouraged (they describe the call, they do not sell). "Return" in the sense "I'll return your call" trips rule 8; the broker rewords it (accepted false positive).

## Two layers
1. Deterministic lint (same word lists in the portal `lintScript` for instant feedback and in the server gate): rules 1 to 3 and 5 to 12. Cheap, no model, no drift.
2. Judge (Haiku, temperature 0, JSON out): rules 4, 11 to 14 and anything the lists miss. Reference the conversation-designer script gate if it exists (`conversation/prompts/script-gate.md`); this file is the rubric it must implement for intro scripts. Golden set (6B.1): 10 passing and 20 failing scripts, one per rule, run before any prompt change.

A failure at either layer = `pass:false`; the broker sees only the plain-English fixes. A pass is stored with the checked text hash, so an edit after the pass invalidates it.

## What is said on the recording (spoken-word gate, W23)
The recording is transcribed and the transcript is run through rules 5 to 12. Any hit rejects the take with the words it tripped on ("it touches on: premium or money"). Practice name and FSP not spoken is a warning, not a rejection (the lower-third carries both). Transcripts are stored in `broker_media.transcript`.

## Human step
compliance-qa spot-checks the first approved intro per broker (W23 raises the alert; the reviewer sets `broker_media.compliance_checked_by`). Re-recordings by the same broker are sampled, not all checked. Not legal advice; the practitioner opinion (2.3) overrides this where it differs.
