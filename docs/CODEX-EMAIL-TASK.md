# Codex task: every Lead Velocity email in the Lead Velocity design

Owner: Jono. Written by Claude Code, 14 Oct 2026. Repo `justmarketme/lead-velocity-staging`, branch `release/smc-nurture`.

## Goal
Every email we send looks like Mark's welcome email (`deliverables/emails/create-password.html`) and stays consistent on every device and mail app (Gmail web/iOS/Android, Outlook desktop and mobile incl. dark mode, Apple Mail).

## The template already exists
`supabase/functions/_shared/lv_email.ts` exports `lvEmail()`, `grad()`, `para()`, `heading()`, `strong()`, `steps()`, `panel()`. Read its header comment first. It already contains the dark-mode-safe tricks (solid colour tiles from `public/email/bg/`, never inline CSS `url()`). Do NOT change colours or invent a palette. If you need a new background colour, add a matching 8x8 PNG tile to `public/email/bg/<hex>.png`.

## Convert these Resend senders (keep their logic and recipients unchanged, replace only the HTML)
`appointment-allocation`, `book-appointment`, `send-admin-invite`, `send-broker-invite`, `send-bulk-communication`, `send-communication`, `send-document-notification`, `send-message-notification`, `send-onboarding-notification`, `send-scheduled-report`, `send-sla-alert` (all under `supabase/functions/`). They currently use an older generic purple design. Each should also send a plain-text part.
- Sender stays `Lead Velocity <howzit@leadvelocity.co.za>` unless the function already uses another leadvelocity.co.za address.
- Escape user-supplied values with `esc()`.
- Add unit tests that render each email and assert: no `url(` in inline styles, every coloured table/td has `bgcolor` + `background="https://leadvelocity.co.za/email/bg/..."`, and the logo/links are absolute https.

## Do NOT
- Send to real recipients while testing. Send previews ONLY to `jono@vantagestack.co.za`.
- Deploy functions or touch Supabase secrets; hand back to Claude Code, who deploys and verifies.
- Edit `create-password.html` (it is the live Supabase "Reset password" template).

## Hand-back
Branch name, list of converted functions, test results, and a sample preview sent to jono@vantagestack.co.za for each distinct email type. Claude Code then deploys and checks delivery in Resend logs.

## Not covered here (Claude Code will do in the Supabase dashboard)
Supabase Auth templates: Invite user, Confirm signup, Magic link, Change email, Reauthentication. Only "Reset password" is branded today.
