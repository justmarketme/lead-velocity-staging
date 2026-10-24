# Step clip: Add your photo and a short bio

For brokers on /broker-elite. Shown next to the Getting started step "Add your photo and a short bio". Voice: Azure/Edge
neural **en-US-AndrewNeural**, rate -3%. Portrait 720x1280. `tts.py` reads every **Say** line verbatim; captions show
the same words. Keep each Say on one line.

Sources (checked 13 Oct 2026, release/smc-nurture): `src/components/broker/GettingStarted.tsx` (step label, detail,
"Add them" opens the intro tab), `src/components/broker/BrokerPortalShell.tsx` (tab "Your intro card" lives under More
on phones), `src/components/broker/smc/IntroCardEditor.tsx` (card copy, checklist, 40 to 220 characters, hint,
"Save my intro card", "Saved. Your card updates in a minute.", WhatsApp preview), `src/components/broker/smc/HeadshotPicker.tsx`
("Take photo" opens the front camera on phones, a webcam dialog on computers; "Choose file"), `src/lib/imagePrep.ts`
(any photo becomes a JPEG of at most 1600 px). Names, FSP number and bio in the film are fictional examples.

## Scene 1: Your photo
**Say:** In Getting started, find Add your photo and a short bio, and tap Add them. This is your intro card: what clients see on WhatsApp when they book a call with you. Tap Take photo to open your camera, and take your picture. Or tap Choose file for a photo you already have.
**Show:** Phone, portal dashboard: Getting started, "3 of 6 done", the step "Add your photo and a short bio / Clients see these when they book a call with you." → tap "Add them" → "Your intro card" (More tab active): status "Almost there. Finish the items below.", checklist, Headshot with "Take photo" / "Choose file" → tap Take photo → the phone's own camera → shutter → photo in the circle, "A headshot" ticked, "New photo ready. Tap Save my intro card to keep it." → "Choose file" highlighted.

## Scene 2: Two lines about you
**Say:** Then write two lines about you: who you help and how you work, in 40 to 220 characters. No product names, prices or promises. Tap Save my intro card. Below it, the preview shows what your client sees.
**Show:** "Two lines about you" is typed (a fictional bio, 126 characters, none of the words the save check rejects), counter counts up to 126/220, "Two lines about you" ticked, callouts "40 to 220 characters" and the hint 'No product names, prices, "best" or promises.' → tap "Save my intro card" → "Saving…" → "Saved. Your card updates in a minute." → scroll to "Preview: what the client sees": the WhatsApp message with the card (photo, name, practice, FSP, bio, Speaks English, Introduced by SortMyCover) and the fixed message text.
