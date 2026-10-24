# Explainer film: "SortMyCover, end to end" (for Jono)

Voice: en-US-AndrewNeural, rate -3%. About 7.5 minutes, 16 scenes. As at 18 October 2026.
Every line traces to this session's live checks (n8n on the EMMA VPS, Supabase SELECTs, Twilio API, Resend/edge logs, Ads Manager)
or to `facts.md` (fact sheet with sources). Visuals use the real ads, the real site build and the real message wording.

## Scene 1: SortMyCover, end to end (about 22s)
**Say:** This is SortMyCover, end to end, as it stands on the eighteenth of October. People see an ad, chat on WhatsApp with Lindi, and book a thirty-minute call with an authorised adviser. Everything behind that is now built and tested. Here's how it all works.
**Show:** Logo, title "SortMyCover, end to end". Three chips: Ad → WhatsApp with Lindi → Booked call. Stats: 4 ads · 15 workflows live · 0 leads yet.
**Sources:** Ads Manager draft (4 ads); n8n workflow_entity active = 15; facts.md.

## Scene 2: The big picture (about 30s)
**Say:** Here's the shape of it. Meta ads send people straight into WhatsApp. Lindi, our receptionist, qualifies them and books the call. Every lead, message and booking lands in the Lead Velocity CRM, the one hub. Automations in n8n, on our own server, do the work around it: Mark's Outlook calendar, the emails, and the reminders. There is no second system to keep in sync.
**Show:** Flow diagram: Meta ads → WhatsApp (Lindi, 060 015 6480) → Lead Velocity CRM (centre). Around the CRM: n8n on the VPS, Mark's Outlook, Emails (Resend, hello@sortmycover.co.za), Reminders.
**Sources:** project architecture (one hub); n8n.sortmycover.co.za; Supabase cmsylaupctrbsvzrgzwy.

## Scene 3: The campaign (about 30s)
**Say:** The campaign is built in Ads Manager as a click-to-WhatsApp test. One ad set: ages thirty-five to fifty, seventy-eight well-off suburbs across the country, Facebook and Instagram feeds, stories and reels, at seventy-five rand a day. Every Meta AI option is switched off, so the ads run exactly as they were made. It is saved as a draft, with no errors, ready for you to publish.
**Show:** Ads Manager style card: campaign name, ad set settings ticking in (Age 35-50 · 78 suburbs · FB + IG feeds, stories, reels · R75/day · AI options off). Badge "Draft · 0 errors · ready to publish".
**Sources:** Ads Manager review dialog 18 Oct (campaign, ad set, 4 ads, no errors); checklist x3.

## Scene 4: The four reels (about 26s)
**Say:** There are four ads, each a short reel built around one moment in life. A new bond. A salary that stops. Business owners and directors. And a conversation with an adviser. No AI labels and no price claims. Each one ends the same way: book a thirty-minute call on WhatsApp.
**Show:** Four phones playing the real reels side by side, each labelled with its angle.
**Sources:** assets/ads/reel-*.mp4 (EMMA f2693a0); meta-primary-texts.md.

## Scene 5: Feed ads and Mark's own ads (about 28s)
**Say:** For the feeds, each reel has a four by five cut. There are also eight feed ads with Mark's own face, four angles, with and without a photo, waiting in his portal for him to approve each one. Tapping any ad opens WhatsApp with the first message already typed: Hi, I'd like to check my life cover.
**Show:** Grid of the 4:5 feed ads, then the 8 Mark-corner statics with "Awaiting Mark's approval" badges; then a WhatsApp input bar typing the prefilled message.
**Sources:** assets/ads; checklist x7; chat template "SMC CTWA - Lindi greeting - check my life cover".

## Scene 6: The new website (about 30s)
**Say:** The website has been redesigned in white, charcoal and the logo yellow. On a phone, every booking button opens WhatsApp, after one consent tick. On a computer, people will also be able to pick a time in a calendar, once SortMyCover's Cal.com account is set up. The About and Privacy pages carry our Information Officer registration, and it all goes live as soon as the upload is approved.
**Show:** Desktop browser frame scrolling the new home page; phone frame with the mobile hero and WhatsApp button; footer crop with the IO number.
**Sources:** assets/site (smc-dist-redesign-2026-10-17.zip); checklist x15.

## Scene 7: The four guides (about 24s)
**Say:** Each ad links to a researched guide on the site, one per angle. They're written for people, not for search engines, cite more than one South African source, and use our own images of South African people, never stock photos. They also help the site rank.
**Show:** Four article cards with their hero images and titles, then one article scrolling.
**Sources:** assets/site learn pages; checklist x5.

## Scene 8: Meet Lindi (about 32s)
**Say:** Now follow one person. They tap the ad, and WhatsApp opens with Lindi's welcome and the message already typed. She asks permission first, naming the adviser's practice. Then come four quick taps: their age group, a monthly budget, whether there's a bond or people who depend on them, and how they'd like to talk. Code, not the AI, decides every next step.
**Show:** Phone-sim WhatsApp chat with the real opening and qualifying messages (taps on quick-reply buttons).
**Sources:** facts.md (W03/W07, conversation/lines.mjs).

## Scene 9: Picking a time (about 32s)
**Say:** Inside the chat, Lindi offers up to ten real open times from Mark's own calendar. The person taps one, and that time is held for them. Only then does she ask for an email, and she sends a link to confirm it. Once they tap the link, the call is booked. It lands in Mark's Outlook, and they get a WhatsApp confirmation and a SortMyCover email with a calendar file.
**Show:** Phone-sim: times list opens, a slot is tapped, email asked, verify email card, "Your email is confirmed", then the booking confirmation template; a small Outlook event card flies to a calendar.
**Sources:** live test 17-18 Oct (booking cf9069c2; Twilio messages); conversation/lines.mjs; smc-client-email.

## Scene 10: Reminders and changes (about 32s)
**Say:** Reminders are scheduled by themselves: what to expect, a reminder and a prep tip the day before, then two hours, and ten minutes before. The day-before and two-hour reminders are approved and sending; the other three templates still need Meta's approval. If plans change, they just say so. Lindi confirms, cancels, clears Mark's calendar, and offers new times. We tested that live last night.
**Show:** Timeline of W09 reminders; then a phone-sim: "Please cancel my call" → confirm buttons → "Done, your call is cancelled" + list → new booking.
**Sources:** W09 reminder_job rows for cf9069c2; W10 live replay 18 Oct 00:02-00:04.

## Scene 11: The emails (about 26s)
**Say:** Emails come from hello at sortmycover dot co dot za, never from Lead Velocity. The client's booking email names the adviser, the practice and the FSP number, with the time and a calendar file. If they cancel or move, a new email fixes their calendar too. And Mark gets a short notice for every booking and every change.
**Show:** Three email cards: booking confirmed (rendered sample), call cancelled (with .ics), adviser notice.
**Sources:** smc-client-email render.ts; smc-email-send; Resend ids 18 Oct.

## Scene 12: Mark's side (about 26s)
**Say:** Mark sees it in two places. His Outlook fills itself: each booked call shows the client's first name, number, age band, budget band and method. His portal shows his verified badge and intro, and eight ads with his face, waiting for him to approve each one. Nothing prompts him yet, so we'll ask him when it's time.
**Show:** Outlook week view with a booked call; portal card with Verified badge, bio, "8 ads to approve".
**Sources:** test adviser Outlook event (W05 graph_event true); portal (checklist c6, x7).

## Scene 13: Behind the scenes (about 34s)
**Say:** Behind the scenes, fifteen n8n workflows are live: intake, Lindi's conversation, open times, booking, confirmations, reminders, changes, opt-outs, and alerts. Lindi writes her replies through an ElevenLabs agent, with no Anthropic tokens. But code decides every action, each reply passes approved wording and safety checks, and if anything stalls for forty-five seconds, a person is called in. The same number takes calls too: Lindi's voice answers, says the call is recorded, and moves the booking to WhatsApp.
**Show:** Grid of the 15 live workflows lighting up; a "reply gate" diagram (draft → checks → send / approved fallback); a call card for 060 015 6480.
**Sources:** n8n workflow_entity active list 18 Oct; facts.md (Lindi model, gates, voice).

## Scene 14: Safety and compliance (about 30s)
**Say:** Safety is built in. Every opt-in is recorded with where it came from, in a log that can't be edited. Emails are confirmed by a link, never a code. STOP ends every message at once, and cancels any booking. ID and bank numbers are masked before anything else sees them. Our Information Officer is registered. And if anything breaks, you get one alert, by email and WhatsApp, not a flood.
**Show:** Six tiles ticking: Opt-in provenance · Link-only email check · STOP · Recorded-call notice · IO 2026-069309 · Alerts (24 h dedupe).
**Sources:** lead_optins; 754db74; W15; privacy notice; IO certificate; W22 smoke test 18 Oct.

## Scene 15: What's left before launch (about 34s)
**Say:** Here's what's left. The website upload, which needs your approval, and a Cal.com account for the desktop calendar. The leadvelocity dot co dot za email records. Three reminder templates to submit, and one first-contact test from a brand-new number. Mark approves his ads. Then I switch the test adviser off and route leads to Mark, you press Publish, with a small budget this weekend and the full run from Monday, and we tell Mark last.
**Show:** Checklist with owner badges: Upload site (Jono) · Email DNS (Jono) · Instant Form (Jono) · Route to Mark (Claude) · Publish (Jono) · Tell Mark (last).
**Sources:** HANDOVER-2026-10-17-EVENING.md; checklist x8, x10, x15, x22.

## Scene 16: Close (about 18s)
**Say:** So that's SortMyCover: an ad, a WhatsApp chat, and a booked call in Mark's calendar, with the CRM keeping score. It's built, it's tested, and it's waiting on the last few switches.
**Show:** The three chips from scene 1 joined by a line; logo; "Built · Tested · Ready to switch on".
**Sources:** as above.
