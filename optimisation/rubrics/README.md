# Judge rubrics (W33) — shared rules

Read by `prompts/judge.md`. One rubric file per sample type. The judge is read-only, runs on Haiku 4.5 in its own context, and never grades its own output or anything the optimisation-advisor wrote.

## Severity (same everywhere)
| Severity | Meaning | What happens |
|---|---|---|
| `critical` | A FAIS/POPIA breach reached a real person (advice, premium or product named, no consent/disclosure, message after STOP, health or ID detail stored) | Out-of-cycle Red within 1 h (W32 event trigger); owner agent pauses that path |
| `high` | A hard rule broken that a person could see, but no regulatory breach (two questions in one message, wrong state-machine step, wrong band, banned word) | Counts toward the faculty's signal; repeated (>= 3 in a sample) becomes a prompt/copy fix proposal |
| `medium` | Quality miss (tone, reading level above Grade 7, clumsy wording) | Aggregated; weekly memo |
| `low` | Polish | Drill-down only |

## Finding format (one row per failure -> `ops.quality_grades`)
`{ "sample_ref": "conv:<uuid>#<turn> | cmt:<id> | brief:<booking_id> | creative:<asset_id> | page:<url>@<build_sha> | report:<report_id>", "faculty": "...", "rule_id": "W-01", "severity": "high", "exact_text": "<the message or element, verbatim, redacted per POPIA>", "note": "<one sentence: what is wrong>", "owner_agent": "conversation-designer", "fix_hint": "<optional, one sentence>" }`
Passing samples are counted, not listed. The judge also returns `sampled`, `passed`, `failed` per rubric, so the pulse can say "3 of 20".

## Reading level
Grade 5-7 means Flesch-Kincaid grade 5.0-7.9 for any text of 15+ words; shorter texts pass unless they contain jargon (CPL, EMQ, CAPI, attribution, qualified-lead mechanics) in a consumer or broker surface.

## Redaction
Findings quote the message but replace phone numbers, emails, ID numbers and surnames with `[redacted]`. Health or ID details quoted by a lead are never repeated, only referred to as "[health detail]".

## What the judge never does
Give an opinion on whether advice is suitable, rewrite the owning agent's prompt, grade the broker's own conduct, or grade anything it generated.
