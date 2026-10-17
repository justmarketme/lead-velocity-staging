# Step explainer (<= 45 s) and the 15-s fictional example

Where it lives: embedded at the top of `portal/intro-media/index.html` (`media/explainer.mp4`), and sent on WhatsApp when the broker reaches the step. 9:16 would suit a phone, but the slot is 16:9 in the approved design, so render 16:9 (1280x720) with captions burned in (muted is the default). Under 45 s, under 8 MB.

Method (4.10 explainer method): Playwright records the real prototype at 390x844 (`?mock=1`, fictional adviser) step by step; voice-over added; captions burned in from the VO transcript (same `automation/media/captions.js`); brand tokens for the title cards. Voice: Jonathan's own voice preferred. A stock text-to-speech voice is allowed for our own explainer (4.10); never a cloned voice, and nothing that sounds like a particular broker. Re-render when the portal changes.

| Beat | Time | On screen (captioned) | Voice-over | Screen recording |
|---|---|---|---|---|
| 1 | 0:00 to 0:09 | "This is the step we're testing to help people turn up" | "This is the step we're testing to help people turn up. People show up for people. If a lead has seen your face before the call, we expect they're more likely to come, and we measure it." | Title card, then the "Why" box on index.html |
| 2 | 0:09 to 0:21 | "Answer eight quick questions. We write three scripts in your words." | "Answer eight quick questions, typed or spoken. We write three short scripts in your own words. You pick one and change anything you like." | interview.html (type one answer), scripts.html (edit, tick shows "Compliance check passed") |
| 3 | 0:21 to 0:35 | "Face a window, phone at eye level, read the teleprompter. 25 seconds." | "Face a window. Hold the phone at eye level and look at the lens. Read the teleprompter. It takes about twenty-five seconds, and one take is fine." | record.html: checklist with reasons, prompter scrolling, countdown, take verdict |
| 4 | 0:35 to 0:43 | "We add captions and your FSP. You approve. Done." | "We add captions and your details. You approve it. That's it. Ten minutes, once." | approve.html message mock, Approve tapped, then the end-frame (SortMyCover tick, "a service of Lead Velocity") |

About 95 spoken words. Add "or skip for now. Nothing is held up while you wait." only if it fits under 45 s.

## 15-second example intro (labelled "Example")
A short clip of a fictional adviser so the broker sees "good enough". It is a real person on camera, never an avatar, a clone or stock footage: a consenting Lead Velocity team member or volunteer shot on a phone with the checklist applied. Burned-in label top-left for the whole clip: "EXAMPLE: fictional adviser, not a real client or adviser". Lower-third: "Sam Example · Example Financial Planning · FSP 00000". Captions on. Same end-frame.

Script (about 40 words, 15 s; this is an illustration clip, so it is shorter than the 60 to 90-word norm, but every other rubric rule holds):

> "Hi, I'm Sam from Example Financial Planning, FSP 00000. I help families work out where they stand. On our call I'll ask a few questions and give you a straight answer. There's nothing to buy and no pressure. Looking forward to speaking with you."

Make the file with the real pipeline: `automation/media/pipeline.sh --in example_raw.mp4 --out-dir out --transcript t.json --name "Sam Example" --practice "Example Financial Planning" --fsp 00000`, then add the label with one ffmpeg `drawtext`. Output to `portal/intro-media/media/example-adviser.mp4`.

Not produced yet: needs a person on camera (see needs_human in SUMMARY.md) and the final voice choice. The explainer can be rendered as soon as the portal screens are final; the storyboard above is the script.
