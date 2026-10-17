# Reusable broker onboarding film

Generic Lead Velocity / Sort My Cover onboarding guide, 232.972 seconds, 1280×720 H.264/AAC. The script uses the selected plan rather than a fixed price; explains payment, onboarding, advertising, WhatsApp nurture, appointments, goodwill rescheduling and replacement, and private broker portal access.

Rebuild in order: `narrate.py`, `render.mjs`, `fix-cover.mjs`, then `integrate.mjs`. The cover step is required: it puts the branded thumbnail into the actual opening frame and attaches an MJPEG cover to the WhatsApp MP4. Captions and eleven chapter times are in `final`.

Public portal: https://www.leadvelocity.co.za/broker/explainer

Shareable MP4: https://www.leadvelocity.co.za/media/explainer/en/Lead-Velocity-Broker-Onboarding-WhatsApp.mp4

Released from an isolated export of production commit a60525ac67b864c6e56db7e973e02bb4354cd340, with only the onboarding film and necessary portal fixes copied in. Existing unrelated working-tree changes were preserved. Production build passed. API checks confirmed both requested broker accounts can sign in and read only their own broker/lead records. Account provisioning endpoint was disabled immediately afterward.

Tiaan's contract, invoice and final captioned video were sent to the user's WhatsApp self-chat for forwarding. His email with those documents and a private login attachment was saved as an UNSENT Outlook draft in jonojettoo@leadvelocity.co.za. Send the draft before forwarding the client message that says it has been emailed.
