# Step clip: Confirm your FSP number

For brokers, in the portal (/broker-elite) next to the Getting started step "Confirm your FSP number". Voice: Azure/Edge
neural **en-US-AndrewNeural**, rate -3%. Portrait 720x1280. `tts.py` reads every **Say** line verbatim; captions show
the same words. Keep each Say on one line.

Sources (checked 13 Oct 2026): `src/components/broker/GettingStarted.tsx` (step label, detail lines, "Enter it" / "Edit",
inline panel, closes on save, "N of 6 done"), `src/components/broker/ProfileForms.tsx` (FspForm: fields, pre-fill,
validation, helper text, Save / Cancel, locked state), `src/lib/brokerPlan.ts` (agreementFsp = FSP number in the signed
agreement), `src/lib/brokerProfile.ts` (3 to 6 digits), migration `20261012180000_broker_self_service.sql`
(broker_update_profile: own row, validated, frozen while routing is on), `automation/lib/w06.mjs` (client WhatsApp intro:
"passed to {practice} (FSP {n})"), `src/components/broker/BrokerPortalShell.tsx` (phone header and bottom bar).

## Scene 1: Enter it
**Say:** In Getting started, find Confirm your FSP number, and tap Enter it. If your signed agreement lists your FSP number, it's already filled in. Check it, and check your practice name, as it appears on your FSP licence.
**Show:** Phone, portal dashboard: Getting started, 1 of 6 done; step "Confirm your FSP number" with "Your agreement lists FSP 28418. Check it and save it to your profile." Tap "Enter it": the form opens under the step (FSP number 28418, Practice name), FSP field focused with the note "Filled in from your signed agreement", then Practice name focused with "As on your FSP licence".

## Scene 2: Save and tick
**Say:** Tap Save, and the step gets its tick. Clients see your FSP number with your practice name. To change it later, tap Edit. Once you're receiving leads, it's locked, so just ask Lead Velocity.
**Show:** Tap Save: the form closes, the step turns green with a tick, "FSP 28418 · Your Practice", button "Edit"; scroll back up to "2 of 6 done". WhatsApp excerpt the client gets ("passed to Your Practice (FSP 28418), an authorised financial services provider"). Tap Edit: the form again; then the locked state ("Locked while you receive leads. Ask Lead Velocity to change it.", no Save button).
