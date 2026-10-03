# Explainer video script: "3 minutes: what to do next" (about 2:45)

Format: one screen recording of the real portal (Playwright-driven, 9:16 and 16:9 renders), AI voice-over (ElevenLabs is fine: it is our video, not the broker's), captions burned in and as WebVTT, phone-first, makes sense on mute. Tone: Lemonade (plain, warm, says what happens next). Grade 7. No product, premium, insurer or "best". Words at about 150 per minute.

| # | Chapter | Start | Screen | Voice-over |
|---|---|---|---|---|
| 1 | What we do for you, and what happens next | 0:00 | Start page, then a phone showing a WhatsApp booking card | "Hi, welcome to SortMyCover. Here's what we do. We find people who want a life cover check-up and have said yes to a call. We confirm their number is real. Then they book a free time straight into your calendar. You get a WhatsApp, a short brief before each call, and a report every Monday. You pay one flat price for each thirty-day cycle. It never depends on policies. Setting up takes about twelve minutes, in seven steps. Here they are." |
| 2 | Your details and FSP check | 1:15 | Profile screen | "First, your practice name and FSP number. We check it on the public FSCA register, so leads can trust you." |
| 3 | Connect your Outlook calendar | 1:25 | Calendar screen, Microsoft button, green "next free slot" | "Next, tap Sign in with Microsoft. One tap. You'll see your next free slot. That means it worked. Then set your hours, how you meet, and how many a day. We've filled in a normal week." |
| 4 | Your intro card | 1:39 | Card preview in WhatsApp | "Check your intro card. It's what leads see first." |
| 5 | Record your voice note and video | 1:45 | Interview, three scripts, teleprompter, checks, approve | "Then the part that helps most. Answer a few quick questions and we write three short scripts in your own words. Pick one. Face a window, hold the phone at eye level, and read it. Twenty-five seconds. Not happy? Record again. You can add another language too. People show up for people, so this lifts your show rate. It's optional, and you can do it later." |
| 6 | Signing the agreement, payment options | 2:07 | Agreement and billing | "Sign your agreement in the portal. It's in plain words. Next cycle you choose how to pay: Instant EFT, EFT, or card." |
| 7 | Where your leads, briefs and outcomes live | 2:15 | My leads | "Your meetings, and a brief for each one, live under My leads." |
| 8 | Marking outcomes, and replacements | 2:23 | Outcome buttons | "After each meeting, tap what happened, how the lead was, and a score. Twenty seconds. A no-show, a number we can't reach, or a lead outside the age or budget we agreed can be replaced. Not buying never is." |
| 9 | What you'll get on WhatsApp, and when | 2:35 | WhatsApp thread | "On WhatsApp: a list each morning at half past seven, a brief fifteen minutes before each call, and your report on Monday at seven. That's it. Tap Next to start." |

Pace check (scripted): voice-over is 315 words, about 126 s at 150 wpm, leaving about 40 s of the 2:45 for screen action and pauses (chapter 1 gets 75 s because it carries the phone mock-ups). Hard cap 2:59: the master prompt says "under 3 minutes", and its 90 s for chapter 1 would leave only 90 s for eight chapters, so chapter 1 is held to 75 s (needs_human NH-BS-11).

## Captions and delivery
Captions on by default, 28 characters per line max, high contrast. Chapter markers in the player. H.264 MP4 under 6 MB for the portal; a 16 MB-safe 9:16 cut for WhatsApp. Also sent as a WhatsApp link the moment the magic link goes out ("3-minute video: what to do next"; the `broker_onboarding_welcome` button) and as the one-page checklist (`onboarding-checklist.md`).

## Step clips (30-45 s, embedded on each page; scripts are in `portal/spec/0x-*.md`)
Details and FSP 35 s . Calendar 40 s . Hours 35 s . Intro card 30 s . Record your intro 40 s (intro-media-producer) . Signing and paying 35 s . Marking outcomes 35 s . Weekly report 30 s.

## Re-render rule
Source of truth: this script + the clip tables. A Playwright script drives the real portal with a synthetic broker, using stable `data-clip` hooks, records each chapter, then ffmpeg joins voice-over and burns captions. A hash of each page's template is stored with its clip; when a page changes, only that clip is re-rendered, then a human spot-check before publish (no clip goes live unwatched). Fictional data only; no real adviser, lead or FSP number on screen.
