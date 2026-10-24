# Microsoft publisher verification for the "Lead Velocity" app (14 Oct 2026)

**Why:** the app is multi-tenant and its publisher is unverified, so every broker's Microsoft 365 admin must approve it before the broker can connect Outlook. A verified publisher lets most brokers accept it themselves. Mark is the only broker today and is his own admin, so this is not a launch blocker, but Jono wants it done now.

**App:** Entra app "Lead Velocity", client ID `eddf9548-de30-4ebc-9be0-356e06e3454b`, multi-tenant. Delegated permissions: Calendars.ReadWrite, OnlineMeetings.ReadWrite, User.Read, offline_access, openid, profile. Redirect URIs: `https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/ms-oauth/callback` and `https://leadvelocity.co.za/broker/calendar`.

## Details Microsoft will ask for (all verified from our own pages)
| Field | Value |
|---|---|
| Legal business name | Lead Velocity (Pty) Ltd |
| Registration number (CIPC) | 2025/637858/07 |
| Country | South Africa |
| Address | 210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria 0184 |
| Phone | +27 10 976 5618 |
| Website | https://leadvelocity.co.za |
| Business email (company domain) | howzit@leadvelocity.co.za (or Jono's/KG's @leadvelocity.co.za address) |
| Publisher domain | leadvelocity.co.za |
Microsoft may also ask for a CIPC registration certificate / company documents and to confirm a contact person (Jono or KG). Those documents are with Jono and KG; Claude does not hold them.

## Steps
1. **[Jono or KG, needs a click-through] Join the Microsoft Cloud Partner Program.** Sign in at partner.microsoft.com (Partner Center) with the work/school account that is a Global Admin of the Entra tenant that owns the app. Complete "Verify your business" with the details above. Accept the terms. Wait for the confirmation email (usually 2-7 working days; can be longer for a young company). Note the **Partner Location MPN ID** shown in Partner Center, Account settings, Organization profile, Identifiers.
2. **[Codex/Claude via browser, once signed in] Verify the publisher domain** in Entra: App registrations, Lead Velocity, Branding & properties, Publisher domain = leadvelocity.co.za. Add the TXT record Microsoft gives for leadvelocity.co.za (DNS is at GoDaddy, ns55/56.domaincontrol.com). Do not touch the existing MX/SPF/DKIM/DMARC records; add only the new TXT.
3. **[Codex/Claude via browser] Turn on MFA** for the admin account if not already.
4. **[Codex/Claude via browser] Link the app:** Entra, App registrations, Lead Velocity, Branding & properties, "Add MPN ID to verify publisher", enter the Partner Location MPN ID. The tenant must be the one associated with the Partner account.
5. **Verify:** the app shows a blue "Verified" badge on the consent screen. Test with a non-admin Microsoft 365 user: they should be able to accept without "Need admin approval".
6. Tick the checklist item "Microsoft publisher verification" and record the date and MPN ID in the project notes (not the secret values).

## Do not
- Create accounts or accept terms for the company; the owner does that.
- Change the app's client secret, redirect URIs or permissions.
- Share company documents in chat or commit them to git.
