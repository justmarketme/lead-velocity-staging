# Rubric: lead pulse thumbs-down (W35) — faculty `nurture_show` (lead experience)

Sample: every thumbs-down "Was the call worth your time?" answer of the last 24 h, capped at 10 per day by the W33 sampler. Owner: `conversation-designer` (the question and its timing); the "what should change" line names the real owner. Source: conversation/pulse.mjs.

**PII rule.** A sample has only `sample_ref` (`lead_pulse:<id>`), `thumbs`, `line` (the optional reason, already redacted at storage) and `answered_at`. No lead, adviser or booking identity is supplied and none may be inferred or quoted. If `line` is null the sample can only be graded on L-01 and L-04. Never quote a health or ID detail; the redaction marker is quoted as-is.

| ID | Rule | Pass test | Severity |
|---|---|---|---|
| L-01 | **One question, right moment** | The pulse was a single yes/no question sent after the call time, not stacked on another ask, a reminder or a reschedule (judge from `answered_at` and `line`) | medium |
| L-02 | **Reason is actionable** | `line` says what to change in terms we can act on. A bare "no" or empty line passes with a note "no reason given" (not a failure) | low |
| L-03 | **Reveals a guardrail or booking problem** | `line` mentions advice given, being sold to, pressure, a wrong or missed time, no call, a different adviser, health or ID detail, or a request to stop | critical if advice, pressure or stop request; high otherwise |
| L-04 | **What should change** | Always give exactly one of `creative`, `qualification`, `adviser`, `timing`, `nothing` in `note`, with the reason in one sentence, and set `owner_agent` to match (media-buyer / conversation-designer / broker-success / automation-engineer / none) | medium when not `nothing` |

Report L-04 for every sample that fails L-02 or L-03, and for any sample whose change is not `nothing`. Passing samples (change = `nothing`) are counted, not listed.
