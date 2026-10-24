# Step clip: Confirm your business WhatsApp number

For brokers, in the portal's Getting started checklist (step 5 of 6, "Confirm your business WhatsApp number").
Voice: Azure/Edge neural **en-US-AndrewNeural**, rate -3%. Portrait 720x1280.
`tts.py` reads every **Say** line verbatim; captions show the same words. Keep each Say on one line.

Sources (checked 13 Oct 2026, branch release/smc-nurture):
`src/components/broker/GettingStarted.tsx` (step label, detail copy, Confirm / Change / Add it, the suggestion, done rule),
`src/components/broker/ProfileForms.tsx` (WhatsAppForm: Confirm, Use another number, Business WhatsApp number, Save,
Cancel, the South African rule, the locked line), `src/lib/brokerProfile.ts` (toZaE164 / fmtZa),
`supabase/migrations/20261012180000_broker_self_service.sql` (broker_update_profile: saves the number, stamps
whatsapp_confirmed_at, refuses a change while routing is on), `automation/lib/w05.mjs` (broker_new_booking goes to the
broker's WhatsApp number). The numbers shown are illustrations (the form's own example, +27 82 123 4567, and +27 71 234 5678).

## Scene 1: Confirm the number we suggest
**Say:** New leads and bookings are sent to your business WhatsApp number, so let's make sure it's right. In Getting started, we suggest the number we have on record for you. Tap Confirm. If it's your business WhatsApp, tap Confirm again. That's it, the step is ticked off.
**Show:** Phone, portal Dashboard: "Getting started", "2 of 6 done", "What you need to do". Scroll to step 5 "Confirm your business WhatsApp number": "Is +27 82 123 4567 your business WhatsApp? New leads and bookings are sent to it." [Confirm] → panel: +27 82 123 4567 [Confirm] [Use another number] → tap Confirm → step ticked, "New leads and bookings reach you on +27 82 123 4567.", button "Change", "3 of 6 done".

## Scene 2: Use another number
**Say:** Not the right number? Tap Use another number, type your business WhatsApp, and tap Save. It must be a South African number. Once you're receiving leads, the number is locked. To change it then, ask Lead Velocity.
**Show:** Same step, panel open → tap "Use another number" → field "Business WhatsApp number" → type +27 71 234 5678 → Save → ticked, "New leads and bookings reach you on +27 71 234 5678." → overlay "South African numbers only" → later (receiving leads): tap Change → "Locked while you receive leads. Ask Lead Velocity to change it."
