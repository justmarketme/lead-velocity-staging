# Retired templates — never submit

Retired 2026-10-06 under the Lead Generation Services Agreement, clause 8.4 (feedback firewall): broker feedback is
whether each consumer attended and could be contacted, nothing else. These files collected outcome labels
(fit / not a fit / budget / well covered / criteria), 1-5 lead quality scores and the "anything we should know" voice
note, which the agreement no longer allows.

- `broker_disposition.json` — 6-button disposition (4.12a codes)
- `broker_quality.json` — 1-5 lead quality rating
- `broker_fit_followup.json` — +7 d nudge after a "Good fit – follow-up" disposition
- `broker_disposition_list.json` — the in-window session list (was `session/broker_disposition_list.json`)

They are kept for history only. `submit.sh` does not list them and `check.mjs` does not read this folder.
Do not submit them to Meta and do not send them.
