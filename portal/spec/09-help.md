# 09 Help

**Route:** `/broker/help`. **Prototype:** `portal/prototype/help.html`. **Inspired by:** Loom/Wistia (help lives on the step, in short captioned clips, not a manual), Intercom (an answer or a human a tap away). No PDF manual, ever.

## What it shows
1. **All the clips** in one grid (each also embedded on its own page): Your details and FSP check (0:35) . Connect your calendar (0:40) . Hours, methods, how many (0:35) . Your intro card (0:30) . Record your intro (0:40, intro-media-producer) . Signing and paying (0:35) . Marking outcomes (0:35) . Your weekly report (0:30) . Plus the full 3-minute video. Every clip: captions on, plays inline on a phone, no sound needed. A clip's play and completion are logged (`help_events`).
2. **Quick answers** (7 to 10, from `knowledge/faq.md`, 6B.9; refreshed by the top-3 support questions rule): when do leads start; what to do when a lead doesn't show; what counts as a replacement (goodwill, up to 3 requests a calendar week on every plan, for a no-show or a lead the broker could not reach, with proof; never "didn't buy"); changing hours or pausing; who owns the leads (broker uses delivered leads exclusively; Lead Velocity keeps the campaign data, pages, ad account and anonymised results); does the price change with policies (no); what a message that looks wrong means; how to leave (7 days' written notice before the next cycle, or just don't pay for the next one and the agreement ends).
3. **Message us:** "Still stuck? Message us. We reply on WhatsApp or email. You do not need to book a call." Buttons: WhatsApp (pre-filled "Hi SortMyCover, I need a hand with: ") and `mailto:howzit@leadvelocity.co.za`. The page also offers a short form (topic dropdown tied to the page he came from, free text); it posts to howzit@ and writes a support event.
4. **Your account** links: details and photo, intro card, voice note and video, agreement and billing.

## Support-question logging (feeds measurement.md)
Every "message us" tap, form post and WhatsApp reply to a W20 message creates `support_events(broker_id, source=portal|whatsapp|email, topic=<page>, created_at, resolved_at)` (or the equivalent timeline row with `workflow=W20`, `actor_type=broker`). Topic = the page he was on. **Target: zero support calls and calls are never required.** The top 3 topics each month decide which clip or page copy is rewritten.

## Copy
- Heading: "Short videos, right where you need them". "All have captions. Or watch the full 3-minute video."
- Message-us sub: "We reply on WhatsApp or email. You do not need to book a call."
- Never: a phone number to call as the first option; a PDF download of a manual.

## Step clip
None of its own (this page is the clips). The main video is on Start here.
