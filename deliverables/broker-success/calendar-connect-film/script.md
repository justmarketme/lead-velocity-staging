# Broker film: Connect your Outlook calendar

For brokers (first: a small practice on Microsoft 365, like Mark). Shown in the portal next to
"Connect my Outlook calendar". Voice: Azure/Edge neural **en-US-AndrewNeural**, rate -3%. Portrait 720x1280.
`tts.py` reads every **Say** line verbatim; captions show the same words. Keep each Say on one line.

Sources (checked 13 Oct 2026): `supabase/functions/ms-oauth/{index.ts,lib.mjs}` (scopes, tenant, admin-consent link),
`src/components/broker/smc/OutlookConnectCard.tsx` (button, states, copy), `src/components/broker/GettingStarted.tsx`,
`automation/lib/w04.mjs` (free/busy via getSchedule + own bookings), `automation/lib/w05.mjs` (event in the broker's
calendar, client as attendee so Exchange sends the invite from his mailbox; howzit@ only as fallback),
W10 (PATCH / DELETE the same event), `smc_ms_disconnect` (deletes the stored sign-in). Microsoft Learn: consent
experience, admin consent, Graph permissions reference; Microsoft Support for removing app access.

## Scene 1: Why connect
**Say:** Connecting your Outlook calendar takes about a minute. Here's what it does for you. We only offer clients times when you're really free. When a client books, the meeting goes straight into your Outlook, with a Teams link. The invite reaches the client from your own email address, because your calendar sends it. And if the client moves or cancels, we update or remove that same meeting.
**Show:** Four cards: only your free times (slot grid, one picked) · straight into your Outlook (event + Join Teams meeting) · the invite comes from you (From: you@yourpractice.co.za) · moved or cancelled, we update or remove it.

## Scene 2: What you're allowing
**Say:** Microsoft will ask you to allow four things. Sign you in and read your basic profile, so we know whose calendar it is. Read and write your calendars, so we can see when you're busy and add the meetings we book. Create online meetings, for the Teams link. And stay connected, so you don't have to sign in again every hour. That's all. We can't see your email, your contacts or your files, and we check when you're busy, not what your meetings are about.
**Show:** Four permission cards in plain words, then "What we can't see": Email, Contacts, Files (struck through).

## Scene 3: Connect, step by step
**Say:** Here's how. In your Lead Velocity portal, open Appointments, or use the calendar step in Getting started. Tap Connect my Outlook calendar. Microsoft asks you to pick an account. Choose the work account whose calendar clients should book into. Next, Microsoft lists the permissions Lead Velocity is asking for. Check they match what you just heard, and tap Accept. You're back in the portal, and it says Connected, with your email address.
**Show:** Portal Appointments card → Microsoft account picker → Permissions requested (Lead Velocity) → Accept → Connected as you@yourpractice.co.za. Note: Microsoft's screens may look slightly different.

## Scene 4: Need admin approval
**Say:** Some practices only let an administrator approve new apps. Then Microsoft says Need admin approval. Nothing is broken. The portal shows Waiting for your IT admin, with an approval link. If you're your practice's Microsoft administrator, open that link yourself, sign in with your admin account, and accept for your organisation. If someone else manages your Microsoft account, tap Copy the approval link, or Email my IT admin, and send it to them. Once it's approved, tap Connect again.
**Show:** Microsoft "Need admin approval" → portal "Waiting for your IT admin" with Copy the approval link / Email my IT admin → two paths: you are the admin (Permissions requested, Accept for your organization) or someone else is (send the link) → Connect again.

## Scene 5: You stay in control
**Say:** You stay in control. To disconnect, tap Disconnect on your calendar card. We delete your stored sign-in, and clients can't book new times until you reconnect. You can also remove Lead Velocity in your Microsoft account. Go to My Apps at myapplications.microsoft.com, open the app's menu, choose Manage your application, then Revoke permissions. To come back, tap Connect my Outlook calendar again.
**Show:** Card: Disconnect → confirm → Needs reconnecting + Reconnect button. My Apps path: myapplications.microsoft.com → … → Manage your application → Revoke Permissions.
