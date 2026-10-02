# 01 Start here

**Route:** `/broker/start` (landing while `status = onboarding`; after go-live it stays reachable as "Start" with the video and a ticked checklist). **Prototype:** `portal/prototype/start.html`. **Inspired by:** Intercom/Appcues (checklist, progress bar, one next step), Loom/Wistia (video on the page, captioned).

## What it shows (top to bottom)
1. **Header:** "Welcome, {first_name}". Progress bar with "{n} of 7 done" and "about {m} minutes to go live".
2. **The 3-minute video** (first thing seen after the magic link). `<video>` with poster, burned-in captions plus a WebVTT track, chapter list (9 chapters, tap to jump), captions on by default, muted autoplay is off (tap to play). H.264 MP4 under 6 MB, 16:9 plus a 9:16 variant for phones held upright. A line under it: "Prefer a page to print? One-page checklist (PDF)."
3. **The 7-step checklist** (crm-gap: tracks `explainer_watched_at`). Done steps ticked and greyed, the current step highlighted with "Next >". Each row: title, one-line reason, time. Order never changes.
4. **"What we need before you go live"** card: names the four blocking steps (FSP checked, calendar connected, agreement signed, intro card approved) and says video can come later.
5. **One primary button:** "Next: {current step title}" (full width). Under it: "Stuck? Help. Or WhatsApp us. No call needed."

## Fields to `brokers`
| Shown / done | Column | Notes |
|---|---|---|
| Video watched | `explainer_watched_at` | Set at 90% played; "I'll watch it later" sets step `skipped`, not the timestamp |
| Progress | `onboarding_step`, `onboarding_progress` | Written by each step page and by W20; never by this page except step 1 |
| First open | `first_login_at` | Set once on the first session after the magic link |
| Presence | `last_seen_at` | Heartbeat every 60 s while the portal is visible (W20 uses it to skip prompts) |
| Cached next slot | `next_free_slot_at` | Shown on Start after step 3 as "Your next free slot: Tue 10:00" |

## States
- **Fresh (no steps done):** video big; checklist shows step 1 as current.
- **Mid-way:** video collapsed to a small "Watch again" row once watched; checklist expanded.
- **All blocking steps done (`onboarded`):** the header becomes "You're done. Final checks next." The checklist keeps step 7 as the only open step ("Record your intro: 10 minutes, lifts show rate"). No button except step 7.
- **`ready_for_go_live`:** "Everything is checked. Jonathan will switch you on shortly. We'll message you on WhatsApp." (No promise of a time.)
- **`active`:** page becomes a compact "Start": a "You're live since {date}" banner, the video, and a link to My leads.
- **Blocked** (FSP mismatch, calendar admin consent): a single amber banner above the checklist: what happened, one action, "or message us".

## Copy (Grade 7)
- Heading: "Start here: 3 minutes, then you're set"
- Sub: "Watch this once. It shows every step, with captions. You can watch it on mute."
- Checklist sub: "About 12 minutes to be ready to go live. Your video takes 10 more, any time. One thing at a time. Everything you type is saved, so you never type it twice."
- Step rows (title / reason / time): 1 "Watch the 3-minute video" / "Done. Watch again any time." / 3 min. 2 "Your details and FSP number" / "We check your FSP on the public FSCA register." / 3 min. 3 "Connect your Outlook calendar" / "One tap." / 1 min. 4 "Your hours and how you meet" / "We filled in a sensible start. Check it." / 1 min. 5 "Sign your agreement" / "Plain words." / 3 min. 6 "Approve your intro card" / "What leads see before they meet you." / 1 min. 7 "Record your 25-second intro" / "Not needed to go live, but it lifts show rate." / 10 min.
- Go-live card: "Three things must be done: FSP checked, calendar connected, agreement signed. We also need your intro card approved. Your video can come later. After that we run a final check. Then Jonathan taps 'Go live' and leads start."

## Step clip
This page carries the main 3-minute video, not a step clip. Script: `deliverables/broker-success/explainer-script.md`.

## Measures it feeds
Video completion; time from `first_login_at` to each step; share of brokers who need anything beyond this page (support events).
