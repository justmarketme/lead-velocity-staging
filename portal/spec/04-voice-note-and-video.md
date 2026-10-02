# 04 Voice note and video

**Owner:** `intro-media-producer` (4.10b/4.10c). Code and UI live in **`portal/intro-media/`** (the page route `/broker/intro-media`). Design reference: `docs/design/record-your-intro.html` (approved). **This file only states how it plugs into the rest of the portal.** Do not duplicate its content here.

## What broker-success owns on this page
| Item | Rule |
|---|---|
| Wizard slot | Step 7 `media`, listed last, **never blocking** (0.3 #12). Skip allowed: "Skip for now". Skipped is shown as a ticked-grey "Skipped. Come back any time." and counts toward progress |
| Entry | From the checklist row "Record your 25-second intro" and from the weekly-report one-ask "Re-record your intro video". Deep link: `/broker/intro-media` |
| Step clip | The 40-s clip is intro-media-producer's (4.10b: "This is the one thing that moves your show rate most"...). It is embedded in the same clip slot as every other page and also listed in Help |
| Why line (copy used on Start, nudges, and the report ask) | "People show up for people. A lead who has seen your face and heard your voice for 25 seconds before the call is far less likely to no-show. It takes 10 minutes once." |
| Nudges | 24 h and 72 h nudges mention the show-rate line (see 10). A brief **assisted-call to-do** for broker #1 only |
| Progress writes | `onboarding_progress.media` = `done` when `brokers.intro_video_url` or `intro_voice_url` has an approved version; `skipped` on skip; emits `step.completed(media)` |
| Measures | Step completion within 48 h of first login; takes per broker; show rate video vs voice vs none after 20 bookings (his own) and 100 bookings (all); re-record prompt quarterly. These live in `deliverables/intro-media/` (their report), referenced from `deliverables/broker-success/measurement.md` |
| Compliance | The script gate and the spot-check are intro-media-producer + compliance-qa. The agreement's clause 11.2 (photo, voice, video) is ticked on the Agreement page; if he has not ticked it, this page tells him: "Your agreement says we can use your video only if you agree to clause 11.2. [Review it]" and recording is allowed but sending to leads waits for the tick |

## What this page reads from the broker row (so the broker never re-enters anything)
`practice_name`, `fsp_number`, `adviser_name`, `languages`, `bio_short`, `years_advising` pre-fill the positioning interview (questions 6-8 are skipped when we already know the answer).

## Does not do
No voice cloning. No avatar. No "AI presenter". No blocking go-live.
