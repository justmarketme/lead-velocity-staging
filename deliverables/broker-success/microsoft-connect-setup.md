# Microsoft calendar connect: what Jono does once

Result: a broker taps **Sign in with Microsoft**, accepts, and sees "Connected as name@domain". He never registers an app. All brokers share one Lead Velocity app.

Time: about 15 minutes, once. Sign in to https://entra.microsoft.com with the Lead Velocity tenant (leadvelocity.co.za).

## A. Register the app (Entra admin centre)

1. Identity > Applications > App registrations > **New registration**.
2. Name: `Lead Velocity` (brokers and their IT admins see this name on the Microsoft consent screen and in the portal copy).
3. Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**. Not "personal Microsoft accounts" (a personal account has no Teams meetings).
4. Redirect URI, platform **Web**: `https://<project-ref>.supabase.co/functions/v1/ms-oauth/callback`
   (project-ref is the Supabase project id). Register.
5. Copy the **Application (client) ID**. This is `MS_CLIENT_ID`.

## B. Redirect URIs (Authentication blade)

Add these, all platform **Web**:

| URI | Used for |
|---|---|
| `https://<project-ref>.supabase.co/functions/v1/ms-oauth/callback` | the sign-in callback (already added in step 4) |
| `https://leadvelocity.co.za/broker/calendar` | where an IT admin lands after approving the app (admin-consent link) |
| `{N8N_PUBLIC_URL}/webhook/ms/callback` | only if the old n8n W20 route stays on; otherwise skip |

Leave "Implicit grant" boxes **unticked**. Under Advanced settings leave "Allow public client flows" **No**.

## C. API permissions (Microsoft Graph, **Delegated**)

Add a permission > Microsoft Graph > **Delegated permissions**, tick exactly:

- `Calendars.ReadWrite`
- `OnlineMeetings.ReadWrite`
- `User.Read`
- `offline_access`
- `openid` (and `profile` if offered)

Do **not** add any `Mail.*` permission or any **Application** permission. Do **not** click "Grant admin consent for Lead Velocity": that only covers our own tenant. Each broker's company grants its own.

## D. Publisher verification (do this before broker #2)

Without it, many company tenants block the app with "unverified publisher" and every broker needs IT. Entra > the app > Branding & properties > set **Publisher domain** `leadvelocity.co.za`, then **Add Microsoft Cloud Partner Program ID** (MPN id). This needs a verified Microsoft Cloud Partner Program account (free). Also set Name, logo, Terms of service and Privacy statement URLs (POPIA privacy notice). Broker #1 can proceed without it; expect a "not verified" notice on the consent screen.

## E. Client secret

1. Certificates & secrets > **New client secret**, 24 months. Copy the **Value** now (shown once). This is `MS_CLIENT_SECRET`.
2. Put the expiry date in `ops.secret_inventory` (W22 tracks it). A wrong or expired secret stops every broker from connecting and from refreshing; the callback logs it and W22 raises the red alert.
3. The n8n credential "Microsoft Graph broker-connect client secret (W20)" must hold this same value, because W04/W05 refresh the brokers' tokens with it.

## F. Supabase function secrets

Already done (13 Oct 2026, Supabase CLI against project `cmsylaupctrbsvzrgzwy`):

- `ms-oauth` is deployed with `verify_jwt = false` (the Microsoft callback carries no Supabase JWT; `start` and
  `disconnect` check the broker's JWT inside the function, and the callback is bound to the broker by the signed `state`).
- `MS_OAUTH_STATE_SECRET` (48 random characters) and `PORTAL_URL=https://leadvelocity.co.za` are set.
- With the Microsoft values still missing the function answers `503 {"error":"not_configured"}` and the portal shows
  "Calendar connection is being set up".

Left for Jono, after steps A to E (one command; replace the two values from the Entra app):

```
npx supabase secrets set --project-ref cmsylaupctrbsvzrgzwy MS_CLIENT_ID=<Application (client) ID> MS_CLIENT_SECRET=<client secret Value> MS_REDIRECT_URI=https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/ms-oauth/callback
```

Optional, so the callback tells W20 at once that the calendar is connected (otherwise W20's sweep picks it up):
`N8N_PUBLIC_URL=<n8n public url> INTERNAL_HMAC_SECRET=<same value as n8n>`.
Secrets take effect without a redeploy. If the function code changes: `npx supabase functions deploy ms-oauth --project-ref cmsylaupctrbsvzrgzwy --no-verify-jwt`.
The n8n values `MS_GRAPH_CLIENT_ID` and `MS_GRAPH_REDIRECT_URI` in `automation/.env.example` stay as they are; `MS_GRAPH_CLIENT_ID` must equal `MS_CLIENT_ID`.

After the callback stores the token it reads Graph `/me` (allowed by `User.Read`) and saves the signed-in mailbox as
`brokers.calendar_email`; W04 free/busy and W05 bookings use that mailbox, never the portal login email. With the
calendar connected, W05 adds the client as attendee so the meeting request (with the Teams link) comes from the broker's
own Outlook; the howzit@ email is only the fallback (calendar not connected, shared calendar, or the broker opted out in
the admin drawer).

## G. Test it with your own work account

1. Sign in to the portal as a test broker, open **Calendar**, tap **Sign in with Microsoft**, accept.
2. Expect: back on Calendar with "Connected as you@yourdomain" and "Your next free slot: ...".
3. Tap **Disconnect Outlook**. Expect the button to return; then reconnect.
4. Test the blocked-tenant path with a tenant that has user consent switched off (or Entra > Enterprise apps > Consent and permissions > "Do not allow user consent"). Expect the "Microsoft says Need admin approval?" panel to open with a link and a ready paragraph. Open that link as an admin: it must show the app with the five permissions and an Accept button. If Microsoft rejects the link's `organizations` tenant segment, tell Claude and we switch it to `common` (one constant, `TENANT`).

## What the broker's IT admin sees

The portal gives the broker a link and one paragraph to forward (the same text is on the "Email this to my IT admin" button). The admin signs in, reviews "Lead Velocity" asking to read and write the signed-in user's calendar and meetings, and chooses **Accept**. The broker then taps Connect again.

## Not verified here

Verified live on 13 Oct 2026: the function is listed as ACTIVE, and real calls return `503 not_configured` for `start` and
`/callback`, `401` for `disconnect` without a JWT. Not verified, because they need the Entra app: a real Microsoft sign-in,
the token exchange, the Graph `/me` mailbox, the admin-consent URL shape for the `organizations` tenant, and
`DELETE FROM vault.secrets` for the function owner. Do step G once the client ID and secret are set.
