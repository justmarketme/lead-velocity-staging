# automation-engineer: Phase 0 "external clocks" summary (2026-10-02)

Everything Meta will review is ready, so Jonathan can submit as soon as the WABA exists. Nothing was submitted and no API call was made. There are 36 WhatsApp templates in `automation/templates/`, one Graph-API-shaped JSON each, all UTILITY in `en`. They cover every name in the 4.6 list plus `intro_media_voice`, `lead_pulse`, the five `ops_*`, the three broker report templates, and the Flow-button `_v2` pair. Two templates were added: `reach_check` (W12 lead side) and `unbooked_nudge_24h_text` (no-video fallback). A generator checked every file against Meta's limits: body ≤ 1024 characters, button text ≤ 25, ≤ 2 URL buttons, quick replies grouped, positional parameters in order with matching examples, no parameter at the start or end of a body, STOP line in every lead-facing template, and a banned-word scan. `README.md` indexes the 6 CORE templates: `broker_intro_booked`, `broker_intro_slots`, `booking_confirmed`, `reminder_24h`, `reminder_2h`, `missed_you`. `submit.sh` defaults to `--dry-run`, submits core first, handles the header-media upload and Flow-id placeholders, and retries once with backoff. It has been dry-run tested only. The W28 booking Flow and reschedule Flow are in `automation/flows/`: METHOD → DATE (CalendarPicker, single mode, with data-bound min/max/include/unavailable dates and `on-select-action` data_exchange) → SLOTS (≤ 20) → EMAIL (routed to only for teams/zoom/meet) → SUMMARY → `complete` with the W05 payload. The endpoint contract is beside them. `automation/.env.example` lists every variable (names and comments only). Flow JSON version used: **"7.0" (ASSUMPTION)**. Both permitted 4.0a fetches were blocked by the sandbox egress proxy, so the CalendarPicker property names are also unverified; see `verified-facts.md`.

## Files
- /home/user/lead-velocity-staging/automation/templates/*.json (36 files)
- /home/user/lead-velocity-staging/automation/templates/README.md
- /home/user/lead-velocity-staging/automation/templates/submit.sh
- /home/user/lead-velocity-staging/automation/flows/booking-flow.json
- /home/user/lead-velocity-staging/automation/flows/reschedule-flow.json
- /home/user/lead-velocity-staging/automation/flows/booking-flow-endpoint.md
- /home/user/lead-velocity-staging/automation/.env.example
- /home/user/lead-velocity-staging/deliverables/automation-engineer/verified-facts.md
- /home/user/lead-velocity-staging/build/costs.jsonl (one line appended)

## needs_human
- needs_human: 4.6 says the `broker_intro_slots` buttons are "3 slot options + Other times", but quick-reply button text cannot contain variables. The template keeps the exact 4.6 sentences and adds three slot lines (`{{5}}–{{7}}`) after "Pick a time below.", with buttons `Time 1/2/3 · Other times`. Please confirm this counts as the "exact wording".
- needs_human: 4.12a requires the disposition labels to be the same words in the buttons, the CRM and the contract. Two labels are longer than Meta's 25-character button limit ("Good fit – needs follow-up" is 26, "Not a fit – already well covered" is 32), so the template uses short labels such as "Good fit – follow-up" and "Not a fit – covered". The in-window interactive list can carry the full wording. contracts-drafter (Schedule C/D) and the portal need one agreed set.
- needs_human: 4.6 says "if [Meta] re-categorises as marketing, rewrite rather than accept the higher rate". 0.3 #1 and the 4.6 CTWA template strategy say to accept Meta's category decision. submit.sh follows 0.3 (accept and log). Which rule wins after launch?
- needs_human: 4.6 workflow item 11 says "replacement counter (cap 3/week per broker)". 0.1 says the cap is per cycle (Bronze 4 / Silver 6 / Gold 9, no weekly cap). The `broker_cycle_end` copy and the W13 design use the per-cycle cap; the 4.6 text should be corrected.
- needs_human: 6B.2 specifies thumbs-up/thumbs-down buttons for `lead_pulse`, which conflicts with the 4.11 no-emoji rule. Text buttons ("Yes, worth it" / "Not really") are used.
- needs_human: 4.0a sends verified facts to `/deliverables/verified-facts.md`. The task brief said `deliverables/automation-engineer/verified-facts.md`, and that is where it was written. The orchestrator may want to copy it to the shared file.
- needs_human: 4.6 does not list templates for the W12 lead reach-check or the 4.12a 7-day `fit_followup` nudge to the broker. `reach_check` was added. The broker follow-up nudge is not drafted yet and will go to the second submission batch if approved.
- needs_human (dependency, not a contradiction): the IMAGE/VIDEO templates need review samples in `automation/templates/samples/` (`intro_card_sample.png`, `intro_video_sample.mp4`) from visual-producer before they can be submitted.

**Orchestrator edits after compliance-qa phase0-review-1 (2026-10-02):** link hosts in 10 broker/ops templates changed from `portal.`/`console.` to `app.leadvelocity.co.za` (6.7); `broker_outcome_check` body no longer mentions replacing leads; `intro_media*` drop "for people booking a call this week"; example bio says Cape Town. AI disclosure and the single disposition label set wait on NH-19.
