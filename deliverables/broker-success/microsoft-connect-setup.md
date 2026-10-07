# Microsoft calendar connect: what Jonathan does once

Result: a broker taps **Sign in with Microsoft**, accepts, and sees "Connected as name@domain". He never registers an app. All brokers share one Lead Velocity app.

Time: about 15 minutes, once. Sign in to https://entra.microsoft.com with the Lead Velocity tenant (leadvelocity.co.za).

## A. Register the app (Entra admin centre)

1. Identity > Applications > App registrations > **New registration**.
2. Name: `SortMyCover calendar`.
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

## F. Supabase (Jonathan or Claude with the CLI, one time)

```
supabase secrets set MS_CLIENT_ID=<client id> MS_CLIENT_SECRET=<secret value> \
  MS_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/ms-oauth/callback \
  MS_OAUTH_STATE_SECRET=<random 32+ chars> PORTAL_URL=https://leadvelocity.co.za \
  N8N_PUBLIC_URL=<n8n public url> INTERNAL_HMAC_SECRET=<same as n8n>
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261007_smc_18_ms_oauth_edge.sql
                        # this one file only (needs migration 13 applied). Not `supabase db push`: it would push every
                        # unapplied smc_* file, incl. 20261007_smc_19_capture_v2.sql, which is not approved for live yet.
supabase functions deploy ms-oauth --no-verify-jwt
```

`N8N_PUBLIC_URL` and `INTERNAL_HMAC_SECRET` are what let the callback tell W20 "calendar connected" so the onboarding step completes (W20 checks a real free slot first). Skip them and the connection still works; the step completes when W20's sweep next runs.
The n8n values `MS_GRAPH_CLIENT_ID` and `MS_GRAPH_REDIRECT_URI` in `automation/.env.example` stay as they are; `MS_GRAPH_CLIENT_ID` must equal `MS_CLIENT_ID`.

## G. Test it with your own work account

1. Sign in to the portal as a test broker, open **Calendar**, tap **Sign in with Microsoft**, accept.
2. Expect: back on Calendar with "Connected as you@yourdomain" and "Your next free slot: ...".
3. Tap **Disconnect Outlook**. Expect the button to return; then reconnect.
4. Test the blocked-tenant path with a tenant that has user consent switched off (or Entra > Enterprise apps > Consent and permissions > "Do not allow user consent"). Expect the "Microsoft says Need admin approval?" panel to open with a link and a ready paragraph. Open that link as an admin: it must show the app with the five permissions and an Accept button. If Microsoft rejects the link's `organizations` tenant segment, tell Claude and we switch it to `common` (one constant, `TENANT`).

## What the broker's IT admin sees

The portal gives the broker a link and one paragraph to forward (the same text is on the "Email this to my IT admin" button). The admin signs in, reviews "SortMyCover calendar" asking to read and write the signed-in user's calendar and meetings, and chooses **Accept**. The broker then taps Connect again.

## Not verified here

Nothing in this checklist has run against a live Microsoft tenant or a live Supabase project; the code is tested offline (`node --test automation/tests/ms-oauth.test.mjs`). Items to confirm in step G: the admin-consent URL shape for the `organizations` tenant, and that `DELETE FROM vault.secrets` is permitted for the function owner in your project.
