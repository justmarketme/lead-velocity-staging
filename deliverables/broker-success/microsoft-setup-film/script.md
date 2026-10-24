# Microsoft calendar setup film

For Jono. Voice: Azure/Edge neural **en-US-AndrewNeural**, rate -3% (house explainer voice). Lead Velocity brand.
`tts.py` reads every **Say** line verbatim; captions show the same words. Keep each Say on one line.

Sources: `supabase/functions/ms-oauth/{index.ts,lib.mjs}`, `src/components/broker/smc/OutlookConnectCard.tsx`,
`src/lib/smcMsConnect.ts`, `automation/lib/w04.mjs` (free slots), `automation/lib/w05.mjs` (booking, invite),
`deliverables/broker-success/microsoft-connect-setup.md`, and Microsoft Learn (checked 13 Oct 2026):
quickstart-register-app, how-to-add-redirect-uri, how-to-add-credentials, quickstart-configure-app-access-web-apis,
howto-add-terms-of-service-privacy-statement, publisher-verification-overview, v2-admin-consent, Graph permissions reference.

## Scene 1: Why
**Say:** Jono, this film is about one button in the broker portal: Connect my Outlook calendar. Here's what it does. A SortMyCover lead is routed to a broker, say Mark, while his order has leads left. Our assistant offers only times when Mark is really free in Outlook. The client picks one, and the meeting lands in Mark's own calendar, with a Teams link. The invite reaches the client from Mark's own email address, because his calendar sends it. If the client moves or cancels, the same meeting moves or is removed. One honest note. This booking flow is built, but not switched on yet. It's waiting for its gate test, and a connected calendar lets us run it.
**Show:** Flow: Lead routed to Mark (brand broker, active, order has leads left) → Free slots from Mark's Outlook → Meeting in Mark's calendar + Teams link → Invite from Mark's own Outlook (client is an attendee; howzit@ email only as fallback) → Move / cancel follows. Status chip: built, not switched on (W01-W10 inactive, pending gate test).

## Scene 2: The big picture
**Say:** Here's the whole idea, Jono. You register one app with Microsoft, once. It's called Lead Velocity, and every broker shares it. A broker taps Connect my Outlook calendar and signs in with their work account. Microsoft asks if Lead Velocity may use their calendar. They tap Accept, and they're connected. No broker ever registers anything.
**Show:** Four steps: You register one app (once) → Broker taps Connect → Microsoft asks → Connected.

## Scene 3: Register the app
**Say:** Sign in at entra.microsoft.com as jono@vantagestack.co.za. Open Entra ID, then App registrations, then New registration. Type the name, Lead Velocity. Under Supported account types, choose Multiple Entra ID tenants. That lets any company's work account connect. Don't choose personal accounts, because they can't make Teams meetings. Click Register. Now open Authentication and add a redirect address. Choose Web, paste the address on screen exactly, and click Configure. Then add a second Web address, leadvelocity.co.za slash broker slash calendar. That's where an IT admin lands after approving.
**Show:** Mock Entra admin center. Entra ID > App registrations > New registration. Name, Supported account types drop-down, Register. Then Authentication > Add Redirect URI > Web > the two URLs > Configure.

## Scene 4: Permissions
**Say:** Next, API permissions. Click Add a permission, then Microsoft Graph, then Delegated permissions. Delegated means the app only ever acts for the broker who signed in. Tick five boxes. openid signs them in. offline_access keeps the connection alive, so they aren't asked again every hour. User.Read reads their name and email. Calendars.ReadWrite sees when they're free and puts bookings in their calendar. OnlineMeetings.ReadWrite makes the Teams link. Click Add permissions. There's no mail permission, and we don't want one. Lead Velocity never reads a broker's email. And don't click Grant admin consent. That only covers your own company.
**Show:** API permissions > Add a permission > Microsoft Graph > Delegated permissions > five ticks, each with a plain-words label > Add permissions. "No Mail permissions" badge.

## Scene 5: The secret and the ID
**Say:** Now Certificates and secrets. Under Client secrets, click New client secret. Call it Lead Velocity portal, choose 24 months, which is the longest Microsoft allows, and click Add. Copy the Value straight away. Not the Secret ID, the Value. Microsoft shows it once. Leave the page and it's gone, and you'd have to make a new one. Then go back to Overview and copy the Application, client, ID. That one isn't secret. It just names the app.
**Show:** Certificates & secrets > Client secrets > New client secret > Description, Expires 24 months > Add. Value column highlighted, "copy now" warning. Overview > Application (client) ID copy.

## Scene 6: Make it look trustworthy
**Say:** Open Branding and properties. This is what brokers see on the Microsoft screen, so it should look like us. Upload the Lead Velocity logo. Microsoft wants a square PNG, 215 by 215 pixels, on a solid background, under 100 kilobytes. Set the home page to leadvelocity.co.za. Microsoft also asks for a terms of service link and a privacy statement link. Those pages aren't built on our site yet, so leave those two boxes empty for now. Claude will build them, then you paste the links. Click Save.
**Show:** Branding & properties form: Name, Logo, Home page URL, Terms of service URL (not built yet), Privacy statement URL (not built yet), Save.

## Scene 7: Hand it to Claude
**Say:** Now hand Claude two things: the Application ID and the secret Value. Never paste the secret into a chat, an email or WhatsApp. Option one: open the file Claude names on screen, paste both values, and save. That file never goes into git. Option two: set them yourself with supabase secrets set. Either way, Claude does the rest. It sets the redirect address, the state secret and the portal address, deploys the sign-in function, and notes the date the secret expires.
**Show:** Two options. A: file `supabase/.env.ms-oauth` (gitignored) with MS_CLIENT_ID= and MS_CLIENT_SECRET=. B: terminal `supabase secrets set ...`. Then Claude's checklist: MS_REDIRECT_URI, MS_OAUTH_STATE_SECRET, PORTAL_URL, deploy ms-oauth, secret expiry.

## Scene 8: What a broker sees
**Say:** Here's what Mark will see. He taps the Microsoft button on his calendar card and picks his work account. Microsoft shows Permissions requested, with Lead Velocity and what it may do. He taps Accept and lands back in the portal, which says Connected, with his next free slot. Some companies stop staff from approving new apps. Then Microsoft says Need admin approval. The portal gives Mark a short note for his IT admin, with a one-click approval link. The admin opens it and accepts for the whole company. Mark taps connect again, and he's done. If IT is slow, he can use our shared calendar for now.
**Show:** Phone: portal calendar card → Pick an account → Permissions requested (Lead Velocity, unverified, five permissions, Accept) → Connected as … / Next free slot we can offer. Blocked path: Need admin approval → portal panel with approval link + Email this to my IT admin → admin Accept → Connect again. Option: Use the shared calendar instead.

## Scene 9: Test it, then Mark
**Say:** Test it on yourself first. Set up a test broker with your own work account, on a SortMyCover order. Without an order, the card says Not available yet. Connect it. When Claude switches the booking flow on for the gate test, book a test meeting like a client would. Check that only free times were offered, that the meeting is in Outlook with a Teams link, and that the invite came from your own address. Then move it, cancel it, and watch Outlook follow. To check any broker from the CRM, open Broker Management, choose the broker, and tap Preview portal. The Appointments tab shows their calendar card. When your test passes, it's Mark's turn.
**Show:** Checklist: test broker (own work account, SortMyCover order) → connect → gate-test booking → only free slots · in Outlook · Teams link · invite from your own address → move → cancel. CRM: Broker Management → broker → Preview portal → Appointments. Then Mark.

## Scene 10: Later
**Say:** Two things for later. First, publisher verification. Until it's done, Microsoft labels the app unverified, and more companies block it. You'll need a Microsoft AI Cloud Partner Program account. Then, in Branding and properties, add the Partner ID and verify it. Brokers then see a blue verified badge. Second, Google Calendar, for brokers who don't use Outlook. That isn't built yet. For now, the job is simple, Jono. Register the app, hand Claude the two values, and get Mark connected.
**Show:** Card 1: Publisher verification (AI Cloud Partner Program, Partner One ID, blue verified badge). Card 2: Google Calendar, not built yet. End card: Register → Hand over → Mark connected.
