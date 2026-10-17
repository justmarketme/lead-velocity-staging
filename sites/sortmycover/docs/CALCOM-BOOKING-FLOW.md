# Desktop calendar booking: Cal.com to WhatsApp (17 Oct 2026)

Jono, 17 Oct 2026: desktop visitors can book in a calendar (Cal.com) as well as on WhatsApp. On a phone, WhatsApp stays the way to book. After a calendar booking, the person confirms their email and WhatsApp number. A WhatsApp message ("can we just confirm a few things?") then brings them into the chat with Lindi.

Research sources were read on 17 Oct 2026. The key pages: cal.com/help/bookings/prefill-fields, cal.com/docs/core-features/event-types/booking-questions, cal.com/docs/developing/guides/automation/webhooks, cal.com/help/workflows/workflowsoverview, twilio.com/docs/content/twilio-quick-reply and developers.facebook.com/docs/whatsapp/overview/getting-opt-in.

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

1. **Cal.com event.** Create the SortMyCover event: 30 minutes, the adviser's calendar connected, the booking questions above. Reuse event 7456888 only if the voice agents no longer need it. Then put its link into `config/site.json` -> `calcom_link`, for example `sortmycover/adviser-call`.
2. **Microsoft sign-in.** Connect the adviser's Microsoft 365 calendar in Cal.com. This needs the adviser's sign-in and a consent screen.
3. **Webhook.** Create the Cal.com webhook and put its signing secret into n8n.
4. **Template.** Submit the WhatsApp template in Twilio Content for Meta approval.
5. **Plan.** The free Cal.com plan is enough unless you want Cal.com branding removed.
6. **Go-live.** Approve the deploy. The security policy change is already in the build.
