# Desktop calendar booking: Cal.com to WhatsApp (17 Oct 2026)

Jono, 17 Oct 2026: desktop visitors can book in a calendar (Cal.com) as well as on WhatsApp. On a phone, WhatsApp stays the way to book. After a calendar booking, the person confirms their email and WhatsApp number. A WhatsApp message ("can we just confirm a few things?") then brings them into the chat with Lindi.

Research sources were read on 17 Oct 2026. The key pages: cal.com/help/bookings/prefill-fields, cal.com/docs/core-features/event-types/booking-questions, cal.com/docs/developing/guides/automation/webhooks, cal.com/help/workflows/workflowsoverview, twilio.com/docs/content/twilio-quick-reply and developers.facebook.com/docs/whatsapp/overview/getting-opt-in.

## SortMyCover branding, never Lead Velocity (Jono, 17 Oct 2026)

The booking page and every confirmation must be SortMyCover's, never Lead Velocity's or Vantage Stack's. Sources, read 17 Oct 2026: [cal.com/pricing](https://cal.com/pricing) and [cal.com/help/event-types/disable-confirmation](https://cal.com/help/event-types/disable-confirmation).

- **Own account.** Create a separate Cal.com account for SortMyCover. Do not add an event to the `vantagestack` account, whose public page shows "Isabel" and Lead Velocity and Vantage Stack events.
  - Profile name: SortMyCover. Avatar: the SortMyCover mark. Brand colour: `#F5A623`, light theme.
  - Username, for example `sortmycover`, which gives `calcom_link` = `sortmycover/<event>`.
  - Event title: "Your SortMyCover call with an authorised adviser".
  - Custom reply-to: hello@sortmycover.co.za.
- **Cal.com's own branding.** Removing "powered by Cal.com" from the page and emails needs the **Teams** plan, at $12 per user a month billed yearly. The free plan shows Cal.com's branding next to ours. This is a spend, so Jono decides.
- **Confirmations come from SortMyCover.** In the event's settings, under Confirmation, turn on "Disable default confirmation emails for attendees". Cal.com only allows this when a workflow sends an email on booking for that event, and a workflow that emails the organiser (the adviser) qualifies.
  - n8n then sends the attendee's confirmation itself: a SortMyCover-branded email from the sortmycover.co.za domain, with the calendar invite (.ics) and the reschedule/cancel links from the webhook payload.
  - n8n also sends the WhatsApp utility template from +27 60 015 6480.
  - Nothing the attendee receives says Lead Velocity.

## The flow

1. **Site (built, commit `4bdf540`).** On desktop, "Pick a time" opens Cal.com's booking page in a dialog. The site loads no Cal.com script; the policy only allows Cal.com as a frame. The URL prefills the hidden `ref` question with the page code plus the origin, the same as the WhatsApp opener, and passes `utm_*` through. The buttons stay hidden until `config/site.json` -> `calcom_link` is set.
2. **Cal.com event (owner setup).**
   - Availability comes from the adviser's Microsoft 365 calendar. New bookings are written there.
   - The booking questions are name, email, a required Phone field labelled "WhatsApp number" (with a country code), a required checkbox carrying the consent, and a hidden `ref` field.
   - Checkbox wording, matching the site's consent: "I agree that SortMyCover may message me on WhatsApp to book and remind me about my call, and may share my details with an adviser from an FSCA-authorised financial services provider. I am 18 or older. I can opt out by replying STOP."
   - Leave "Requires booker email verification" **off**. Cal.com checks the email with a typed code, and Jono's rule is to verify by link only. Lindi confirms the email by link on WhatsApp instead.
   - Leave Cal.com's own WhatsApp workflow **off**. It can't be customised and can't send from our number.
3. **Cal.com webhook to n8n.** BOOKING_CREATED, BOOKING_RESCHEDULED and BOOKING_CANCELLED go to `https://n8n.sortmycover.co.za/webhook/cal`.
   - n8n checks `x-cal-signature-256`, an HMAC-SHA256 of the raw body keyed with the webhook secret.
   - It reads `payload.responses` (email, attendeePhoneNumber, consent, ref) and `payload.uid`.
   - It normalises the number to +27 and creates or updates the lead in the Lead Velocity CRM. The source is `calcom` plus the `ref` value.
   - It records the consent with the checkbox wording, the booking uid and the time.
4. **n8n to Twilio.** n8n sends an approved **UTILITY** quick-reply template from +27 60 015 6480. Suggested body: "Hi {{1}}, your SortMyCover call with {{2}} is booked for {{3}}. Can we just confirm a few things before the call?" It has one button, "Yes, let's chat". Variables can't start or end the body, can't sit side by side, and each needs a sample value.
5. **Lindi.** The button reply opens the 24-hour window. Lindi confirms the WhatsApp number and confirms the email by link. She asks the second-pass questions from the flow spec and sends the adviser's intro card. A reschedule or cancellation updates the CRM and Lindi's context.

## Setup only Jono can do

1. **Cal.com account and event.** Create a SortMyCover Cal.com account with its own branding (see above), not inside `vantagestack`. Add the 30-minute event with the adviser's calendar connected and the booking questions above. Then put its link into `config/site.json` -> `calcom_link`, for example `sortmycover/adviser-call`.
2. **Plan and confirmations.** Decide on Teams ($12 per user a month) to remove Cal.com branding. Turn off the default attendee confirmation, backed by an organiser-notify workflow.
3. **Microsoft sign-in.** Connect the adviser's Microsoft 365 calendar in Cal.com. This needs the adviser's sign-in and a consent screen.
4. **Webhook.** Create the Cal.com webhook and put its signing secret into n8n.
5. **Template.** Submit the WhatsApp template in Twilio Content for Meta approval.
6. **Go-live.** Approve the deploy. The security policy change is already in the build.

## Status (18 Oct 2026)

**Done in Chrome with Jono:**
- **Account.** A SortMyCover Cal.com account on the free personal plan, signed in with the Lead Velocity Google account.
- **Public page.** Username `sortmycover`, name SortMyCover, the tick mark as avatar and a bio. The page is https://cal.com/sortmycover, with a light booking theme.
- **Event.** `sortmycover/adviser-call`, titled "Your SortMyCover call with an authorised adviser", 30 minutes, on Cal Video.
- **Booking questions:**
  - name and email;
  - a required **WhatsApp number**;
  - a hidden optional **Reference** (identifier `ref`, filled by the site);
  - a required **consent checkbox** (identifier `whatsapp_consent`) with the wording above.
- **Other events.** The default 15-minute event is hidden, and the "secret" event was already hidden.
- **Site test.** The site's "Pick a time" dialog was tested locally with `calcom_link` set and showed the SortMyCover calendar. The setting was then reverted to empty.

**Still to do before `calcom_link` goes live:**
1. **Adviser's calendar.** Connect it (Settings > Calendars), so availability is real. It is the default Mon-Fri 9:00-17:00 until then.
2. **Webhook.** Create the Cal.com webhook to n8n (`/webhook/cal`) and build the n8n flow, so Lindi's WhatsApp follow-up actually fires. The dialog already promises it.
3. **Teams plan (spend, Jono's call).** Needed for the brand colour `#F5A623` and to remove "Powered by Cal.com".
4. **Default confirmation emails.** Leave them ON until the n8n branded email exists, so bookers still get a confirmation. They go out from Cal.com, and organiser notices go to the account email.
5. **Go live.** Set `config/site.json` -> `calcom_link` to `sortmycover/adviser-call`, build and deploy.
