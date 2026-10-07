# 03 Intro card (preview and approve)

**Route:** `/broker/intro-card` (wizard step 6). **Prototype:** `portal/prototype/profile.html#card` (shown at the foot of the profile prototype to keep the flow in one file). **Inspired by:** FSCA public register (the licence line is the broker's own trust signal), Lemonade (says what happens next), Intercom/Appcues (one tap finishes the step).

**Purpose:** the lead meets the adviser in WhatsApp before the call. The card carries the full FAIS disclosure in something people actually look at, and is the image header of `broker_intro_booked` and `broker_intro_slots` (4.10). The card is **built by visual-producer** (1080 x 1080 PNG from one HTML template rendered with headless Chromium); this page only previews it and records the broker's written approval.

## What it shows
1. The rendered card (preview from `brokers` fields; re-rendered within 10 s of any profile change; "Updating your card..." state).
2. **"What the lead reads with it"**: the exact `broker_intro_booked` text with his values filled in (practice, FSP, adviser, "Teams", an example date), so he approves the disclosure wording as well as the picture:
   *"Hi Lerato, thanks for your insurance and financial planning enquiry. Your details have been passed to Mark Williams Financial Planning (FSP 00000), an authorised financial services provider. Mark Williams will be your adviser for your Teams call on Tuesday 6 Oct at 10:00. Reply STOP to opt out."* (Wording owned by automation-engineer / compliance-qa; never edited here.)
3. One tick-box: "I have read my card and the disclosure wording. I approve both." The **Approve my intro card** button is disabled until ticked.
4. "Something is wrong: fix it" opens the Profile page at the field that feeds the wrong line (the card has no free text of its own).

## Card contents (visual-producer renders; this is the data contract)
Headshot (or monogram), adviser name, practice name, "Authorised financial services provider . FSP {fsp_number}", 2-line bio (`bio_short`), languages, "30-min {methods} call . No obligation". No "best", "cheapest", "#1". No insurer logos unless the broker has written permission (a per-insurer permission flag is **not** in scope; no logos are used).

## Preconditions (the Approve button is enabled only when all hold)
- `fsp_check.status = verified` (the card never prints an FSP line for an unverified number).
- `adviser_name`, `practice_name`, `bio_short` (passed the no-advice gate), at least one language.
- Headshot present **or** the broker taps "Use my initials for now" (not blocking, 0.3 #12).

## Writes
| Action | Writes |
|---|---|
| Render | `broker_media(kind=card, version n+1, url, is_current=false)`; previous versions kept |
| Approve | `broker_media.approved_at`, `approved_by = broker`, `is_current = true`; `brokers.intro_card_url` -> that URL; `onboarding_progress.card = done`; emit `card.approved`; copy of the approval (name, time, card image, wording) emailed from howzit@ to the broker, bcc howzit@ |
| Any later profile change | A new card version is rendered and **not** live until the broker approves again; the old approved card stays in use until then |

compliance-qa spot-checks the first card per broker (details match the `brokers` row and the FSCA register); a failed spot-check reverts `is_current` and tells the broker what to change.

## Copy
- Heading: "Your intro card". Sub: "This is the picture leads get on WhatsApp the moment they book. Check it is right, then approve."
- Approve confirmation: "Approved. Leads will see this card. You can change it any time: just edit your details and approve the new one."
- Time to do: 1 minute. Not done in 24 h: nudge (see 10).

## Step clip: "Your intro card" (30 s)
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | The card preview, then a phone mock showing it in WhatsApp | "This is what leads see on WhatsApp before they meet you." |
| 0:10 | Highlight the licence line and the disclosure text | "It shows your name, your practice and your FSP number, so they know you are authorised." |
| 0:20 | Tick the box, tap Approve | "Check it, tick the box, tap Approve. You can change it any time." |
